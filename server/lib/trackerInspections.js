import { pool } from '../db.js'
import { TrackerError, formatUnitLabel } from './trackerHelpers.js'

export const INSPECTION_CATEGORIES = [
  { key: 'structure', label: 'โครงสร้าง / พื้น-ผนัง-ฝ้าเพดาน' },
  { key: 'doors', label: 'ประตู-หน้าต่าง' },
  { key: 'electric', label: 'ระบบไฟฟ้า-แสงสว่าง' },
  { key: 'plumbing', label: 'ระบบประปา-สุขาภิบาล' },
  { key: 'ac', label: 'เครื่องปรับอากาศ' },
  { key: 'fixtures', label: 'เฟอร์นิเจอร์บิลท์อิน/สุขภัณฑ์' },
]

export const CHECK_STATUSES = ['ok', 'bad', 'na']
export const ISSUE_STATUSES = ['pending', 'in_progress', 'done']

const MAX_NOTE_LENGTH = 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const INSPECTION_SCHEMA_SQL = `
  create table if not exists public.tracker_inspections (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.tracker_sessions(id) on delete cascade,
    unit_number integer not null check (unit_number > 0),
    result text not null check (result in ('ok', 'issue')),
    checklist jsonb not null default '{}'::jsonb,
    inspected_by text,
    inspected_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (session_id, unit_number)
  );

  create table if not exists public.tracker_issues (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.tracker_sessions(id) on delete cascade,
    unit_number integer not null check (unit_number > 0),
    category_key text not null,
    category_label text not null,
    note text not null default '',
    status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index if not exists tracker_issues_session_status_idx
    on public.tracker_issues (session_id, status);

  drop trigger if exists tracker_inspections_set_updated_at on public.tracker_inspections;
  create trigger tracker_inspections_set_updated_at
  before update on public.tracker_inspections
  for each row execute function public.tracker_set_updated_at();

  drop trigger if exists tracker_issues_set_updated_at on public.tracker_issues;
  create trigger tracker_issues_set_updated_at
  before update on public.tracker_issues
  for each row execute function public.tracker_set_updated_at();
`

// Coerces a client-submitted checklist into { [categoryKey]: { status, note } }
// for every known category. Unknown keys are dropped, notes only survive on
// categories marked 'bad'.
export function normalizeChecklist(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TrackerError('Checklist is required')
  }
  const checklist = {}
  for (const category of INSPECTION_CATEGORIES) {
    const entry = raw[category.key]
    const status = entry?.status == null || entry.status === '' ? null : String(entry.status)
    if (status !== null && !CHECK_STATUSES.includes(status)) {
      throw new TrackerError(`Invalid status for ${category.key}`)
    }
    const note = String(entry?.note ?? '').trim().slice(0, MAX_NOTE_LENGTH)
    checklist[category.key] = { status, note: status === 'bad' ? note : '' }
  }
  return checklist
}

export function inspectionResult(checklist) {
  return Object.values(checklist).some((entry) => entry?.status === 'bad') ? 'issue' : 'ok'
}

export function issuesFromChecklist(checklist) {
  return INSPECTION_CATEGORIES
    .filter((category) => checklist[category.key]?.status === 'bad')
    .map((category) => ({
      category_key: category.key,
      category_label: category.label,
      note: checklist[category.key].note || '',
    }))
}

export function normalizeIssueStatus(raw) {
  const status = String(raw || '').trim()
  if (!ISSUE_STATUSES.includes(status)) throw new TrackerError('Invalid issue status')
  return status
}

function serializeInspection(row, session) {
  return {
    unit: formatUnitLabel(row.unit_number, session.prefix, session.total_rooms),
    unit_number: Number(row.unit_number),
    result: row.result,
    checklist: row.checklist || {},
    inspected_by: row.inspected_by || null,
    inspected_at: row.inspected_at,
  }
}

function serializeIssue(row, session) {
  return {
    id: String(row.id),
    unit: formatUnitLabel(row.unit_number, session.prefix, session.total_rooms),
    unit_number: Number(row.unit_number),
    category_key: row.category_key,
    category_label: row.category_label,
    note: row.note || '',
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listInspections(session) {
  const res = await pool.query(
    `select unit_number, result, checklist, inspected_by, inspected_at
     from public.tracker_inspections
     where session_id = $1
     order by unit_number asc`,
    [session.id],
  )
  return res.rows.map((row) => serializeInspection(row, session))
}

export async function listIssues(session) {
  const res = await pool.query(
    `select id, unit_number, category_key, category_label, note, status, created_at, updated_at
     from public.tracker_issues
     where session_id = $1
     order by (status = 'done') asc, created_at desc`,
    [session.id],
  )
  return res.rows.map((row) => serializeIssue(row, session))
}

// Stores the latest inspection for a unit and syncs the repair queue with it:
// categories that are still 'bad' keep their open issue (note refreshed,
// status preserved), categories that recovered lose their open issue, and
// completed issues are kept as history.
export async function saveInspection(session, unitNumber, rawChecklist, { inspectedBy = null } = {}) {
  const checklist = normalizeChecklist(rawChecklist)
  const result = inspectionResult(checklist)
  const wanted = issuesFromChecklist(checklist)
  const unit = Number(unitNumber)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `insert into public.tracker_inspections (session_id, unit_number, result, checklist, inspected_by, inspected_at)
       values ($1, $2, $3, $4::jsonb, $5, now())
       on conflict (session_id, unit_number)
       do update set result = excluded.result,
                     checklist = excluded.checklist,
                     inspected_by = excluded.inspected_by,
                     inspected_at = now()`,
      [session.id, unit, result, JSON.stringify(checklist), inspectedBy],
    )
    await client.query(
      `insert into public.tracker_unit_statuses (session_id, unit_number, status)
       values ($1, $2, 'checked')
       on conflict (session_id, unit_number) do update set status = 'checked'`,
      [session.id, unit],
    )
    const keepKeys = wanted.map((issue) => issue.category_key)
    await client.query(
      `delete from public.tracker_issues
       where session_id = $1 and unit_number = $2 and status <> 'done'
         and not (category_key = any($3::text[]))`,
      [session.id, unit, keepKeys],
    )
    for (const issue of wanted) {
      const updated = await client.query(
        `update public.tracker_issues
         set note = $4, category_label = $5
         where session_id = $1 and unit_number = $2 and category_key = $3 and status <> 'done'
         returning id`,
        [session.id, unit, issue.category_key, issue.note, issue.category_label],
      )
      if (updated.rowCount === 0) {
        await client.query(
          `insert into public.tracker_issues (session_id, unit_number, category_key, category_label, note, status)
           values ($1, $2, $3, $4, $5, 'pending')`,
          [session.id, unit, issue.category_key, issue.category_label, issue.note],
        )
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return result
}

// Resets a unit back to "not inspected": removes the inspection, the legacy
// checked flag and any open issues. Completed issues stay as history.
export async function clearInspection(session, unitNumber) {
  const unit = Number(unitNumber)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'delete from public.tracker_inspections where session_id = $1 and unit_number = $2',
      [session.id, unit],
    )
    await client.query(
      `delete from public.tracker_unit_statuses where session_id = $1 and unit_number = $2 and status = 'checked'`,
      [session.id, unit],
    )
    await client.query(
      `delete from public.tracker_issues where session_id = $1 and unit_number = $2 and status <> 'done'`,
      [session.id, unit],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateIssueStatus(session, issueId, rawStatus) {
  const status = normalizeIssueStatus(rawStatus)
  const id = String(issueId || '')
  if (!UUID_RE.test(id)) throw new TrackerError('Issue not found', 404)
  const res = await pool.query(
    `update public.tracker_issues
     set status = $3
     where session_id = $1 and id = $2
     returning id, unit_number, category_key, category_label, note, status, created_at, updated_at`,
    [session.id, id, status],
  )
  if (!res.rows[0]) throw new TrackerError('Issue not found', 404)
  return serializeIssue(res.rows[0], session)
}
