import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword, pool, verifyPassword } from '../db.js'
import {
  DEFAULT_PREFIX,
  DEFAULT_TOTAL_ROOMS,
  TrackerError,
  formatUnitLabel,
  normalizePrefix,
  normalizeTotalRooms,
  parseUnitNumber,
  serializeSession,
} from './trackerHelpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TRACKER2_DIR = path.join(__dirname, '..', '..', 'Tracker2')

let schemaReady = null

const SCHEMA_SQL = `
  create extension if not exists pgcrypto;

  create table if not exists public.tracker_sessions (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    prefix text not null default '',
    total_rooms integer not null check (total_rooms > 0 and total_rooms <= 10000),
    is_active boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  alter table public.tracker_sessions
    alter column id set default gen_random_uuid();

  alter table public.tracker_sessions
    add column if not exists room_password_hash text,
    add column if not exists created_by_user_id bigint references public.users(id) on delete set null,
    add column if not exists created_by_guest_name text,
    add column if not exists last_active_at timestamptz not null default now();

  create unique index if not exists tracker_sessions_single_active_idx
    on public.tracker_sessions ((is_active))
    where is_active;

  create table if not exists public.tracker_unit_statuses (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.tracker_sessions(id) on delete cascade,
    unit_number integer not null check (unit_number > 0),
    status text not null check (status in ('checked', 'marked')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (session_id, unit_number)
  );

  alter table public.tracker_unit_statuses
    alter column id set default gen_random_uuid();

  create index if not exists tracker_unit_statuses_session_status_idx
    on public.tracker_unit_statuses (session_id, status);

  create or replace function public.tracker_set_updated_at()
  returns trigger
  language plpgsql
  set search_path = public
  as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$;

  drop trigger if exists tracker_sessions_set_updated_at on public.tracker_sessions;
  create trigger tracker_sessions_set_updated_at
  before update on public.tracker_sessions
  for each row execute function public.tracker_set_updated_at();

  drop trigger if exists tracker_unit_statuses_set_updated_at on public.tracker_unit_statuses;
  create trigger tracker_unit_statuses_set_updated_at
  before update on public.tracker_unit_statuses
  for each row execute function public.tracker_set_updated_at();
`

function loadJsonList(filename) {
  const filePath = path.join(TRACKER2_DIR, filename)
  if (!fs.existsSync(filePath)) return []
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return []
  }
}

export async function initTrackerStore() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(SCHEMA_SQL)
      await seedFromJsonIfEmpty()
      await backfillLegacyRooms()
    })()
  }
  return schemaReady
}

async function backfillLegacyRooms() {
  const missingRes = await pool.query(
    `select id
     from public.tracker_sessions
     where room_password_hash is null
     order by is_active desc, created_at asc
     limit 1`,
  )
  const legacyRoomId = missingRes.rows[0]?.id
  if (!legacyRoomId) return

  const passwordHash = await hashPassword('noble242')
  await pool.query(
    `update public.tracker_sessions
     set room_password_hash = $1,
         created_by_guest_name = coalesce(created_by_guest_name, 'legacy'),
         last_active_at = coalesce(last_active_at, now())
     where room_password_hash is null`,
    [passwordHash],
  )
  await pool.query(
    `update public.tracker_sessions
     set name = $2
     where id = $1`,
    [legacyRoomId, 'ห้อง 1 - ข้อมูลเดิม'],
  )
}

async function seedFromJsonIfEmpty() {
  const countRes = await pool.query('select count(*)::int as count from public.tracker_sessions')
  if (Number(countRes.rows[0]?.count) > 0) return

  const insertRes = await pool.query(
    `insert into public.tracker_sessions (name, prefix, total_rooms, is_active)
     values ($1, $2, $3, true)
     returning id`,
    ['42 - imported', DEFAULT_PREFIX, DEFAULT_TOTAL_ROOMS],
  )
  const sessionId = insertRes.rows[0].id

  for (const label of loadJsonList('units.json')) {
    try {
      const unitNumber = parseUnitNumber(label, DEFAULT_PREFIX)
      await pool.query(
        `insert into public.tracker_unit_statuses (session_id, unit_number, status)
         values ($1, $2, 'checked')
         on conflict (session_id, unit_number) do update set status = excluded.status`,
        [sessionId, unitNumber],
      )
    } catch {
      // skip invalid labels
    }
  }

  for (const label of loadJsonList('marked_units.json')) {
    try {
      const unitNumber = parseUnitNumber(label, DEFAULT_PREFIX)
      await pool.query(
        `insert into public.tracker_unit_statuses (session_id, unit_number, status)
         values ($1, $2, 'marked')
         on conflict (session_id, unit_number) do update set status = excluded.status`,
        [sessionId, unitNumber],
      )
    } catch {
      // skip invalid labels
    }
  }
}

export async function listSessions() {
  await initTrackerStore()
  const res = await pool.query(
    `select id, name, prefix, total_rooms, is_active, created_at, updated_at
     from public.tracker_sessions
     order by created_at asc`,
  )
  return res.rows.map(serializeSession)
}

export async function listRooms() {
  await initTrackerStore()
  const res = await pool.query(
    `select s.id, s.name, s.prefix, s.total_rooms, s.is_active,
            s.created_by_user_id, s.created_by_guest_name, s.last_active_at,
            s.created_at, s.updated_at,
            count(us.id) filter (where us.status = 'checked')::int as checked_count,
            count(us.id) filter (where us.status = 'marked')::int as marked_count
     from public.tracker_sessions s
     left join public.tracker_unit_statuses us on us.session_id = s.id
     group by s.id
     order by s.last_active_at desc, s.created_at desc`,
  )
  return res.rows.map(serializeSession)
}

export async function getRoomById(roomId, { includePassword = false } = {}) {
  await initTrackerStore()
  const res = await pool.query(
    `select id, name, prefix, total_rooms, is_active, room_password_hash,
            created_by_user_id, created_by_guest_name, last_active_at, created_at, updated_at
     from public.tracker_sessions
     where id = $1
     limit 1`,
    [roomId],
  )
  const row = res.rows[0]
  if (!row) return null
  if (includePassword) return row
  return serializeSession(row)
}

export async function createRoom({ name, password, prefix, totalRooms, userId = null, guestName = null }) {
  await initTrackerStore()
  const cleanName = String(name || '').trim()
  const cleanPassword = String(password || '')
  if (!cleanName) throw new TrackerError('Room name is required')
  if (!cleanPassword.trim()) throw new TrackerError('Room password is required')
  const normalizedPrefix = normalizePrefix(prefix)
  const normalizedTotal = normalizeTotalRooms(totalRooms)
  const passwordHash = await hashPassword(cleanPassword)
  const cleanGuestName = String(guestName || '').trim() || null
  const numericUserId = userId == null ? null : Number(userId)
  const res = await pool.query(
    `insert into public.tracker_sessions
       (name, prefix, total_rooms, is_active, room_password_hash, created_by_user_id, created_by_guest_name, last_active_at)
     values ($1, $2, $3, false, $4, $5, $6, now())
     returning id, name, prefix, total_rooms, is_active, room_password_hash,
               created_by_user_id, created_by_guest_name, last_active_at, created_at, updated_at`,
    [
      cleanName,
      normalizedPrefix,
      normalizedTotal,
      passwordHash,
      Number.isFinite(numericUserId) ? numericUserId : null,
      cleanGuestName,
    ],
  )
  return res.rows[0]
}

export async function verifyRoomPassword(room, password) {
  if (!room?.room_password_hash) return false
  return verifyPassword(String(password || ''), room.room_password_hash)
}

export async function touchRoom(roomId) {
  await pool.query('update public.tracker_sessions set last_active_at = now() where id = $1', [roomId])
}

export async function renameRoom(roomId, name) {
  const cleanName = String(name || '').trim()
  if (!cleanName) throw new TrackerError('Room name is required')
  const res = await pool.query(
    `update public.tracker_sessions set name = $2 where id = $1
     returning id, name, prefix, total_rooms, is_active, created_by_user_id, created_by_guest_name, last_active_at, created_at, updated_at`,
    [roomId, cleanName],
  )
  if (!res.rows[0]) throw new TrackerError('Room not found', 404)
  return serializeSession(res.rows[0])
}

export async function deleteRoom(roomId) {
  const res = await pool.query('delete from public.tracker_sessions where id = $1 returning id', [roomId])
  if (!res.rows[0]) throw new TrackerError('Room not found', 404)
}

export async function createSession(name, prefix, totalRooms, makeActive = true) {
  await initTrackerStore()
  const normalizedPrefix = normalizePrefix(prefix)
  const normalizedTotal = normalizeTotalRooms(totalRooms)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (makeActive) {
      await client.query('update public.tracker_sessions set is_active = false where is_active')
    }
    const res = await client.query(
      `insert into public.tracker_sessions (name, prefix, total_rooms, is_active)
       values ($1, $2, $3, $4)
       returning id, name, prefix, total_rooms, is_active, created_at, updated_at`,
      [name, normalizedPrefix, normalizedTotal, Boolean(makeActive)],
    )
    await client.query('COMMIT')
    return serializeSession(res.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function setActiveSession(sessionId) {
  await initTrackerStore()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('update public.tracker_sessions set is_active = false where is_active')
    const res = await client.query(
      `update public.tracker_sessions
       set is_active = true
       where id = $1
       returning id, name, prefix, total_rooms, is_active, created_at, updated_at`,
      [sessionId],
    )
    await client.query('COMMIT')
    if (!res.rows[0]) throw new TrackerError('Session not found', 404)
    return serializeSession(res.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function getActiveSession() {
  await initTrackerStore()
  const res = await pool.query(
    `select id, name, prefix, total_rooms, is_active, created_at, updated_at
     from public.tracker_sessions
     where is_active
     limit 1`,
  )
  if (res.rows[0]) return serializeSession(res.rows[0])
  const sessions = await listSessions()
  if (sessions.length > 0) return setActiveSession(sessions[0].id)
  return createSession('42 - imported', DEFAULT_PREFIX, DEFAULT_TOTAL_ROOMS, true)
}

export async function getStatus(sessionId, unitNumber) {
  const res = await pool.query(
    `select id, session_id, unit_number, status
     from public.tracker_unit_statuses
     where session_id = $1 and unit_number = $2
     limit 1`,
    [sessionId, Number(unitNumber)],
  )
  return res.rows[0] || null
}

export async function listUnitLabels(session, status) {
  const res = await pool.query(
    `select unit_number
     from public.tracker_unit_statuses
     where session_id = $1 and status = $2
     order by unit_number asc`,
    [session.id, status],
  )
  return res.rows.map((row) => formatUnitLabel(row.unit_number, session.prefix, session.total_rooms))
}

export async function setUnitStatus(sessionId, unitNumber, status) {
  const res = await pool.query(
    `insert into public.tracker_unit_statuses (session_id, unit_number, status)
     values ($1, $2, $3)
     on conflict (session_id, unit_number)
     do update set status = excluded.status
     returning id, session_id, unit_number, status`,
    [sessionId, Number(unitNumber), status],
  )
  return res.rows[0]
}

export async function deleteUnitStatus(sessionId, unitNumber, status = null) {
  let res
  if (status) {
    res = await pool.query(
      `delete from public.tracker_unit_statuses
       where session_id = $1 and unit_number = $2 and status = $3
       returning id, session_id, unit_number, status`,
      [sessionId, Number(unitNumber), status],
    )
  } else {
    res = await pool.query(
      `delete from public.tracker_unit_statuses
       where session_id = $1 and unit_number = $2
       returning id, session_id, unit_number, status`,
      [sessionId, Number(unitNumber)],
    )
  }
  return res.rows
}

export async function editCheckedUnit(sessionId, oldNumber, newNumber) {
  const oldStatus = await getStatus(sessionId, oldNumber)
  if (!oldStatus || oldStatus.status !== 'checked') {
    throw new TrackerError('Original room is not checked', 404)
  }
  const newStatus = await getStatus(sessionId, newNumber)
  if (newStatus) throw new TrackerError('New room already has a status', 400)

  const res = await pool.query(
    `update public.tracker_unit_statuses
     set unit_number = $1
     where session_id = $2 and unit_number = $3 and status = 'checked'
     returning id, session_id, unit_number, status`,
    [Number(newNumber), sessionId, Number(oldNumber)],
  )
  if (!res.rows[0]) throw new TrackerError('Original room is not checked', 404)
  return res.rows[0]
}

export async function toggleMark(sessionId, unitNumber) {
  const current = await getStatus(sessionId, unitNumber)
  if (current?.status === 'marked') {
    await deleteUnitStatus(sessionId, unitNumber, 'marked')
    return 'unmarked'
  }
  await setUnitStatus(sessionId, unitNumber, 'marked')
  return 'marked'
}

export async function getStatePayload() {
  const session = await getActiveSession()
  const [sessions, units, marked] = await Promise.all([
    listSessions(),
    listUnitLabels(session, 'checked'),
    listUnitLabels(session, 'marked'),
  ])
  return { sessions, active_session: session, units, marked }
}

export async function getRoomStatePayload(roomId) {
  const room = await getRoomById(roomId)
  if (!room) throw new TrackerError('Room not found', 404)
  const [rooms, units, marked] = await Promise.all([
    listRooms(),
    listUnitLabels(room, 'checked'),
    listUnitLabels(room, 'marked'),
  ])
  return {
    rooms,
    sessions: rooms,
    active_room: room,
    active_session: room,
    units,
    marked,
  }
}
