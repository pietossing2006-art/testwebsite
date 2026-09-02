import { all, get, pool, query } from './pool.js'

const SUPPORT_SUBJECT_MAX_LENGTH = 120

const SUPPORT_MESSAGE_MAX_LENGTH = 4000

const SUPPORT_ATTACHMENT_MAX_COUNT = 3

const SUPPORT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024

const SUPPORT_TICKET_STATUSES = new Set(['open', 'pending', 'closed'])


function normalizeSupportSearch(raw) {
  const s = typeof raw === 'string' ? raw.trim() : ''
  return s || null
}


function normalizeSupportStatus(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!value) return null
  return SUPPORT_TICKET_STATUSES.has(value) ? value : null
}


function validateAttachments(attachments) {
  if (attachments == null) return null
  if (!Array.isArray(attachments)) throw new Error('invalid_attachments')
  if (attachments.length > SUPPORT_ATTACHMENT_MAX_COUNT) throw new Error('too_many_attachments')
  for (const a of attachments) {
    if (!a || typeof a !== 'object') throw new Error('invalid_attachment')
    const data = String(a.data ?? '')
    const mime = String(a.mime ?? '').toLowerCase()
    if (!data.startsWith('data:')) throw new Error('invalid_attachment_data')
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)) throw new Error('invalid_attachment_type')
    const base64Part = data.split(',')[1] ?? ''
    const bytes = Math.ceil((base64Part.length * 3) / 4)
    if (bytes > SUPPORT_ATTACHMENT_MAX_BYTES) throw new Error('attachment_too_large')
  }
  return attachments.length > 0 ? attachments : null
}


export async function logBoosterAction(client, { boosterId, requestId, action, meta }) {
  await client.query(
    `INSERT INTO booster_action_logs (booster_id, farm_request_id, action, meta)
     VALUES ($1, $2, $3, $4)`,
    [boosterId, requestId, String(action || ''), meta == null ? null : JSON.stringify(meta)],
  )
}


export async function adminListSupportAgents({ limit = 200 } = {}) {
  const lim = Number(limit)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  return all(
    `SELECT id, email, display_name, role
     FROM users
     WHERE is_banned = false
       AND role IN ('support', 'admin', 'owner')
     ORDER BY
       CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'support' THEN 3 ELSE 99 END,
       email ASC,
       id ASC
     LIMIT $1`,
    [lim],
  )
}


export async function createSupportTicket({ userId, subject, message, attachments, orderId, priority, category }) {
  const uid = Number(userId)
  const s = String(subject ?? '').trim()
  const m = String(message ?? '').trim()
  const oid = orderId == null || orderId === '' ? null : Number(orderId)
  const p = typeof priority === 'string' && ['low', 'normal', 'urgent'].includes(priority.toLowerCase()) ? priority.toLowerCase() : 'normal'
  const cat = typeof category === 'string' && category.trim() ? category.trim() : 'general'

  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!s) throw new Error('invalid_subject')
  if (s.length > SUPPORT_SUBJECT_MAX_LENGTH) throw new Error('invalid_subject_too_long')
  if (!m) throw new Error('invalid_message')
  if (m.length > SUPPORT_MESSAGE_MAX_LENGTH) throw new Error('invalid_message_too_long')
  if (oid != null && (!Number.isFinite(oid) || oid <= 0)) throw new Error('invalid_order_id')
  const att = validateAttachments(attachments)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tRes = await client.query(
      `INSERT INTO support_tickets (user_id, subject, status, order_id, priority, category, last_message_at, updated_at)
       VALUES ($1, $2, 'open', $3, $4, $5, now(), now())
       RETURNING id, user_id, subject, status, order_id, priority, category, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at`,
      [uid, s, oid, p, cat],
    )
    const ticket = tRes.rows[0]
    await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, message, attachments, is_internal)
       VALUES ($1, $2, 'user', $3, $4, false)`,
      [ticket.id, uid, m, att ? JSON.stringify(att) : null],
    )
    await client.query('COMMIT')
    return ticket
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}


export async function listMySupportTickets(userId, { limit = 50, offset = 0, status } = {}) {
  const uid = Number(userId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 200) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null

  if (st) {
    return all(
      `SELECT t.id, t.user_id, t.subject, t.status, t.order_id, t.priority, t.category,
              t.assigned_to, t.first_response_at, t.resolved_at, t.created_at, t.updated_at, t.last_message_at,
              o.ref AS order_ref
       FROM support_tickets t
       LEFT JOIN orders o ON o.id = t.order_id
       WHERE t.user_id = $1 AND t.status = $2
       ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
       LIMIT $3 OFFSET $4`,
      [uid, st, lim, off],
    )
  }

  return all(
    `SELECT t.id, t.user_id, t.subject, t.status, t.order_id, t.priority, t.category,
            t.assigned_to, t.first_response_at, t.resolved_at, t.created_at, t.updated_at, t.last_message_at,
            o.ref AS order_ref
     FROM support_tickets t
     LEFT JOIN orders o ON o.id = t.order_id
     WHERE t.user_id = $1
     ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  )
}


export async function getMySupportTicket({ userId, ticketId }) {
  const uid = Number(userId)
  const tid = Number(ticketId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')

  const ticket = await get(
    `SELECT t.id, t.user_id, t.subject, t.status, t.order_id, t.priority, t.category,
            t.assigned_to, t.first_response_at, t.resolved_at, t.created_at, t.updated_at, t.last_message_at,
            o.ref AS order_ref, o.total_points AS order_total_points
     FROM support_tickets t
     LEFT JOIN orders o ON o.id = t.order_id
     WHERE t.id = $1 AND t.user_id = $2`,
    [tid, uid],
  )
  if (!ticket) throw new Error('not_found')
  const messages = await all(
    `SELECT m.id, m.ticket_id, m.sender_user_id, m.sender_role,
            su.display_name AS sender_display_name,
            su.email AS sender_email,
            su.avatar_url AS sender_avatar_url,
            m.message, m.attachments, m.created_at
     FROM support_ticket_messages m
     LEFT JOIN users su ON su.id = m.sender_user_id
     WHERE m.ticket_id = $1 AND m.is_internal = false
     ORDER BY m.id ASC`,
    [tid],
  )
  return { ticket, messages }
}


export async function addMySupportTicketMessage({ userId, ticketId, message, attachments }) {
  const uid = Number(userId)
  const tid = Number(ticketId)
  const m = String(message ?? '').trim()
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  if (!m && (!attachments || !Array.isArray(attachments) || attachments.length === 0)) throw new Error('invalid_message')
  if (m.length > SUPPORT_MESSAGE_MAX_LENGTH) throw new Error('invalid_message_too_long')
  const att = validateAttachments(attachments)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tRes = await client.query(
      `SELECT id, user_id, status
       FROM support_tickets
       WHERE id = $1
       FOR UPDATE`,
      [tid],
    )
    const t = tRes.rows?.[0]
    if (!t) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (Number(t.user_id) !== uid) {
      await client.query('ROLLBACK')
      throw new Error('forbidden')
    }
    if (String(t.status) === 'closed') {
      await client.query('ROLLBACK')
      throw new Error('closed')
    }

    await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, message, attachments, is_internal)
       VALUES ($1, $2, 'user', $3, $4, false)`,
      [tid, uid, m, att ? JSON.stringify(att) : null],
    )
    await client.query(
      `UPDATE support_tickets
       SET last_message_at = now(), updated_at = now()
       WHERE id = $1`,
      [tid],
    )
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}


export async function adminListSupportTickets({ limit = 100, offset = 0, status, assignedTo, search, scope, staffUserId } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  const stRaw = typeof status === 'string' && status.trim() ? status.trim() : null
  const st = stRaw == null ? null : normalizeSupportStatus(stRaw)
  if (stRaw != null && !st) throw new Error('invalid_status')

  const scopeRaw = typeof scope === 'string' ? scope.trim().toLowerCase() : ''
  const queueScope = scopeRaw || 'all'
  if (!['all', 'mine', 'unassigned', 'needs_reply', 'closed'].includes(queueScope)) throw new Error('invalid_scope')

  const staffId = staffUserId == null || staffUserId === '' ? null : Number(staffUserId)
  if (staffId != null && !Number.isFinite(staffId)) throw new Error('invalid_staff_id')

  const assignedRaw = typeof assignedTo === 'string' ? assignedTo.trim().toLowerCase() : assignedTo
  const mineOnlyByFilter = assignedRaw === 'me'
  const unassignedOnly = assignedRaw === 'unassigned'
  const a = unassignedOnly || mineOnlyByFilter || assignedTo == null || assignedTo === '' ? null : Number(assignedTo)
  const q = normalizeSupportSearch(search)
  if (!unassignedOnly && !mineOnlyByFilter && a != null && !Number.isFinite(a)) throw new Error('invalid_assigned_to')

  const where = []
  const params = []

  if (st) {
    params.push(st)
    where.push(`t.status = $${params.length}`)
  }

  if (queueScope === 'mine') {
    if (!Number.isFinite(staffId) || staffId <= 0) throw new Error('invalid_staff_id')
    params.push(staffId)
    where.push(`t.assigned_to = $${params.length}`)
    where.push(`t.status IN ('open', 'pending')`)
  } else if (queueScope === 'unassigned') {
    where.push(`t.assigned_to IS NULL`)
    where.push(`t.status IN ('open', 'pending')`)
  } else if (queueScope === 'needs_reply') {
    where.push(`t.status IN ('open', 'pending')`)
    where.push(`t.assigned_to IS NOT NULL`)
    where.push(`COALESCE(lm.sender_role, 'user') = 'user'`)
  } else if (queueScope === 'closed') {
    where.push(`t.status = 'closed'`)
  }

  if (unassignedOnly) {
    where.push('t.assigned_to IS NULL')
  } else if (mineOnlyByFilter) {
    if (!Number.isFinite(staffId) || staffId <= 0) throw new Error('invalid_staff_id')
    params.push(staffId)
    where.push(`t.assigned_to = $${params.length}`)
  } else if (a != null) {
    params.push(a)
    where.push(`t.assigned_to = $${params.length}`)
  }
  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`)
    where.push(`(u.email ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.display_name ILIKE $${params.length} OR t.subject ILIKE $${params.length} OR CAST(t.id AS TEXT) ILIKE $${params.length})`)
  }

  const fromSql = `
    FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN users ass ON ass.id = t.assigned_to
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.sender_role, m.sender_user_id, m.message, m.created_at
      FROM support_ticket_messages m
      WHERE m.ticket_id = t.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS message_count
      FROM support_ticket_messages sm
      WHERE sm.ticket_id = t.id
    ) msg ON TRUE
  `

  const countFromSql = `
    FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN LATERAL (
      SELECT m.sender_role
      FROM support_ticket_messages m
      WHERE m.ticket_id = t.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON TRUE
  `

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const baseParams = [...params]
  const listParams = [...baseParams, lim, off]

  const [items, totalRow, summaryRow, waitingStaffRow, overSlaRow] = await Promise.all([
    all(
      `SELECT t.id, t.user_id, u.email AS user_email,
              COALESCE(u.display_name, u.username, u.email) AS user_display_name,
              u.username AS user_username, u.avatar_url AS user_avatar_url,
              t.subject, t.status, t.order_id, t.priority, t.category, t.assigned_to,
              ass.email AS assigned_email,
              COALESCE(ass.display_name, ass.username, ass.email) AS assigned_display_name,
              ass.username AS assigned_username, ass.avatar_url AS assigned_avatar_url,
              o.ref AS order_ref,
              t.first_response_at, t.resolved_at,
              t.created_at, t.updated_at, t.last_message_at,
              COALESCE(msg.message_count, 0) AS message_count,
              lm.sender_role AS last_sender_role,
              lm.sender_user_id AS last_sender_user_id,
              lm.created_at AS last_sender_at,
              LEFT(COALESCE(lm.message, ''), 160) AS last_message_preview
       ${fromSql}
       ${whereSql}
       ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    ),
    get(
      `SELECT COUNT(*)::int AS c
       ${countFromSql}
       ${whereSql}`,
      baseParams,
    ),
    get(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'pending') AND assigned_to IS NULL)::int AS unassigned_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'pending') AND assigned_to = $1)::int AS mine_count
       FROM support_tickets`,
      [Number.isFinite(staffId) && staffId > 0 ? Math.trunc(staffId) : -1],
    ),
    get(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets t
       LEFT JOIN LATERAL (
         SELECT m.sender_role
         FROM support_ticket_messages m
         WHERE m.ticket_id = t.id
         ORDER BY m.id DESC
         LIMIT 1
       ) lm ON TRUE
       WHERE t.status IN ('open', 'pending')
         AND t.assigned_to IS NOT NULL
         AND COALESCE(lm.sender_role, 'user') = 'user'`,
    ),
    get(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets
       WHERE status IN ('open', 'pending')
         AND first_response_at IS NULL
         AND created_at <= now() - interval '30 minutes'`,
    ),
  ])

  return {
    items,
    total: Number(totalRow?.c || 0),
    summary: {
      open: Number(summaryRow?.open_count || 0),
      pending: Number(summaryRow?.pending_count || 0),
      closed: Number(summaryRow?.closed_count || 0),
      unassigned: Number(summaryRow?.unassigned_count || 0),
      mine: Number(summaryRow?.mine_count || 0),
      needs_reply: Number(waitingStaffRow?.c || 0),
      over_sla: Number(overSlaRow?.c || 0),
    },
  }
}


export async function adminGetSupportTicket({ ticketId }) {
  const tid = Number(ticketId)
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  const ticket = await get(
    `SELECT t.id, t.user_id, u.email AS user_email,
            COALESCE(u.display_name, u.username, u.email) AS user_display_name,
            u.username AS user_username, u.avatar_url AS user_avatar_url,
            t.subject, t.status, t.order_id, t.priority, t.category, t.assigned_to,
            ass.email AS assigned_email,
            COALESCE(ass.display_name, ass.username, ass.email) AS assigned_display_name,
            ass.username AS assigned_username, ass.avatar_url AS assigned_avatar_url,
            o.ref AS order_ref, o.total_points AS order_total_points,
            t.first_response_at, t.resolved_at,
            t.created_at, t.updated_at, t.last_message_at
     FROM support_tickets t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN users ass ON ass.id = t.assigned_to
     LEFT JOIN orders o ON o.id = t.order_id
     WHERE t.id = $1`,
    [tid],
  )
  if (!ticket) throw new Error('not_found')
  const messages = await all(
    `SELECT m.id, m.ticket_id, m.sender_user_id, m.sender_role,
            su.display_name AS sender_display_name,
            su.email AS sender_email,
            su.avatar_url AS sender_avatar_url,
            m.message, m.attachments, m.is_internal, m.created_at
     FROM support_ticket_messages m
     LEFT JOIN users su ON su.id = m.sender_user_id
     WHERE m.ticket_id = $1
     ORDER BY m.id ASC`,
    [tid],
  )
  return { ticket, messages }
}


export async function adminReplySupportTicket({ ticketId, staffUserId, staffRole, message, attachments, isInternal = false }) {
  const tid = Number(ticketId)
  const sid = Number(staffUserId)
  const role = String(staffRole ?? '').trim().toLowerCase()
  const m = String(message ?? '').trim()
  const internal = Boolean(isInternal)

  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  if (!Number.isFinite(sid)) throw new Error('invalid_staff_id')
  if (!m && (!attachments || !Array.isArray(attachments) || attachments.length === 0)) throw new Error('invalid_message')
  if (m.length > SUPPORT_MESSAGE_MAX_LENGTH) throw new Error('invalid_message_too_long')
  if (!role) throw new Error('invalid_role')
  const att = validateAttachments(attachments)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tRes = await client.query('SELECT id, status FROM support_tickets WHERE id = $1 FOR UPDATE', [tid])
    const t = tRes.rows?.[0]
    if (!t) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (String(t.status) === 'closed' && !internal) {
      await client.query('ROLLBACK')
      throw new Error('closed')
    }
    await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, message, attachments, is_internal)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tid, sid, role, m, att ? JSON.stringify(att) : null, internal],
    )
    if (!internal) {
      await client.query(
        `UPDATE support_tickets
         SET last_message_at = now(),
             updated_at = now(),
             status = 'open',
             first_response_at = COALESCE(first_response_at, now()),
             resolved_at = NULL
         WHERE id = $1`,
        [tid],
      )
    } else {
      await client.query(
        `UPDATE support_tickets
         SET updated_at = now()
         WHERE id = $1`,
        [tid],
      )
    }
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}


export async function adminAssignSupportTicket({ ticketId, assignedTo }) {
  const tid = Number(ticketId)
  const aid = assignedTo == null || assignedTo === '' ? null : Number(assignedTo)
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  if (aid != null && !Number.isFinite(aid)) throw new Error('invalid_assigned_to')

  if (aid != null) {
    const assignee = await get('SELECT id, role, is_banned FROM users WHERE id = $1', [aid])
    if (!assignee) throw new Error('invalid_assigned_to_user')
    if (Boolean(assignee?.is_banned)) throw new Error('invalid_assigned_to_user')
    const role = String(assignee?.role || '').trim().toLowerCase()
    if (!['support', 'admin', 'owner'].includes(role)) throw new Error('invalid_assigned_to_role')
  }

  const ticket = await get(
    `UPDATE support_tickets
     SET assigned_to = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, user_id, subject, status, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at`,
    [tid, aid],
  )
  if (!ticket) throw new Error('not_found')
  return ticket
}


export async function adminSetSupportTicketStatus({ ticketId, status }) {
  const tid = Number(ticketId)
  const st = String(status ?? '').trim().toLowerCase()
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  if (!['open', 'pending', 'closed'].includes(st)) throw new Error('invalid_status')
  const ticket = await get(
    `UPDATE support_tickets
     SET status = $2,
         resolved_at = CASE WHEN $2 = 'closed' THEN COALESCE(resolved_at, now()) ELSE NULL END,
         updated_at = now()
     WHERE id = $1
     RETURNING id, user_id, subject, status, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at`,
    [tid, st],
  )
  if (!ticket) throw new Error('not_found')
  return ticket
}


export async function staffClockIn(userId, { durationMinutes } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const existing = await get(
    'SELECT id FROM staff_clock_sessions WHERE user_id = $1 AND clock_out IS NULL LIMIT 1',
    [uid],
  )
  if (existing) return { already_clocked_in: true, session_id: existing.id }
  const dur = Number(durationMinutes)
  const hasAuto = Number.isFinite(dur) && dur > 0
  const row = await get(
    `INSERT INTO staff_clock_sessions (user_id)
     VALUES ($1)
     RETURNING id, clock_in`,
    [uid],
  )
  if (hasAuto) {
    const updated = await get(
      `UPDATE staff_clock_sessions SET auto_clock_out_at = clock_in + interval '1 minute' * $2
       WHERE id = $1 RETURNING id, clock_in, auto_clock_out_at`,
      [row.id, Math.min(dur, 1440)],
    )
    return { session_id: updated.id, clock_in: updated.clock_in, auto_clock_out_at: updated.auto_clock_out_at }
  }
  return { session_id: row.id, clock_in: row.clock_in, auto_clock_out_at: null }
}


export async function staffClockOut(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const row = await get(
    `UPDATE staff_clock_sessions SET clock_out = now()
     WHERE user_id = $1 AND clock_out IS NULL
     RETURNING id, clock_in, clock_out`,
    [uid],
  )
  if (!row) throw new Error('not_clocked_in')
  return row
}


export async function getStaffClockStatus(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { clocked_in: false }
  const row = await get(
    'SELECT id, clock_in, auto_clock_out_at FROM staff_clock_sessions WHERE user_id = $1 AND clock_out IS NULL LIMIT 1',
    [uid],
  )
  return row ? { clocked_in: true, session_id: row.id, clock_in: row.clock_in, auto_clock_out_at: row.auto_clock_out_at } : { clocked_in: false }
}


export async function listStaffClockSessions(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { items: [], total: 0 }
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200)
  const off = Math.max(0, Number(offset) || 0)
  const items = await all(
    `SELECT id, clock_in, clock_out, auto_clock_out_at, note,
            EXTRACT(EPOCH FROM (COALESCE(clock_out, now()) - clock_in))::int AS duration_seconds
     FROM staff_clock_sessions
     WHERE user_id = $1
     ORDER BY clock_in DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  )
  const totalRow = await get('SELECT COUNT(*)::int AS c FROM staff_clock_sessions WHERE user_id = $1', [uid])
  return { items, total: totalRow?.c || 0 }
}


export async function adminListAllClockSessions({ limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(1, Number(limit) || 100), 500)
  const off = Math.max(0, Number(offset) || 0)
  const items = await all(
    `SELECT sc.id, sc.user_id, sc.clock_in, sc.clock_out, sc.auto_clock_out_at, sc.note,
            EXTRACT(EPOCH FROM (COALESCE(sc.clock_out, now()) - sc.clock_in))::int AS duration_seconds,
            u.email, COALESCE(u.display_name, u.username) AS display_name, u.role
     FROM staff_clock_sessions sc
     JOIN users u ON u.id = sc.user_id
     ORDER BY sc.clock_in DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
  return { items }
}


export async function processAutoClockOuts() {
  const expired = await all(
    `SELECT id, user_id FROM staff_clock_sessions
     WHERE clock_out IS NULL AND auto_clock_out_at IS NOT NULL AND auto_clock_out_at <= now()`,
  )
  let count = 0
  for (const s of expired) {
    await get(
      `UPDATE staff_clock_sessions SET clock_out = auto_clock_out_at
       WHERE id = $1 AND clock_out IS NULL RETURNING id`,
      [s.id],
    )
    count++
  }
  return count
}

// ── Staff notifications ──


export async function createStaffNotification({ userId, type, title, body, link }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return null
  const row = await get(
    `INSERT INTO staff_notifications (user_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [uid, String(type || 'info'), String(title || ''), String(body || ''), link || null],
  )
  sendPushToUser(uid, { title: String(title || ''), body: String(body || ''), link: link || null }).catch(() => {})
  // Real-time socket push
  try {
    const { emitNotificationEvent } = await import('./lib/socket.js')
    emitNotificationEvent(uid, { id: row?.id, type, title, body, link })
  } catch {}
  return row
}


export async function listStaffNotifications(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200)
  const off = Math.max(0, Number(offset) || 0)
  const items = await all(
    `SELECT id, type, title, body, link, is_read, created_at
     FROM staff_notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  )
  const unreadRow = await get(
    'SELECT COUNT(*)::int AS c FROM staff_notifications WHERE user_id = $1 AND is_read = false',
    [uid],
  )
  return { items, unread_count: unreadRow?.c || 0 }
}


export async function markNotificationRead(userId, notificationId) {
  const uid = Number(userId)
  const nid = Number(notificationId)
  await query('UPDATE staff_notifications SET is_read = true WHERE id = $1 AND user_id = $2', [nid, uid])
}


export async function markAllNotificationsRead(userId) {
  const uid = Number(userId)
  await query('UPDATE staff_notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [uid])
}


export async function getUnreadNotificationCount(userId) {
  const uid = Number(userId)
  const row = await get('SELECT COUNT(*)::int AS c FROM staff_notifications WHERE user_id = $1 AND is_read = false', [uid])
  return row?.c || 0
}

// ── Push subscriptions ──


export async function savePushSubscription(userId, subscription) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const ep = String(subscription?.endpoint || '').trim()
  if (!ep) throw new Error('invalid_subscription')
  const keys = subscription?.keys || {}
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys_json)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys_json = $3::jsonb`,
    [uid, ep, JSON.stringify(keys)],
  )
}


export async function removePushSubscription(userId, endpoint) {
  const uid = Number(userId)
  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [uid, String(endpoint || '')])
}


export async function sendPushToUser(userId, payload) {
  let webpush
  try { webpush = await import('web-push') } catch { return }
  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidMail = process.env.VAPID_MAILTO || 'mailto:admin@example.com'
  if (!vapidPublic || !vapidPrivate) return

  webpush.setVapidDetails(vapidMail, vapidPublic, vapidPrivate)

  const subs = await all('SELECT id, endpoint, keys_json FROM push_subscriptions WHERE user_id = $1', [userId])
  const body = JSON.stringify(payload)
  for (const sub of subs) {
    const pushSub = { endpoint: sub.endpoint, keys: sub.keys_json }
    try {
      await webpush.sendNotification(pushSub, body)
    } catch (err) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {})
      }
    }
  }
}


function resolveAuditSeverity(action, explicitSeverity) {
  if (explicitSeverity && ['info', 'warning', 'critical', 'security'].includes(String(explicitSeverity).toLowerCase())) {
    return String(explicitSeverity).toLowerCase()
  }
  const act = String(action || '').toLowerCase()
  if (act.includes('ban') || act.includes('unban') || act.includes('delete') || act.includes('role') || act.includes('permission') || act.includes('balance') || act.includes('wallet') || act.includes('security') || act.includes('purge') || act.includes('payout')) {
    return 'critical'
  }
  if (act.includes('update') || act.includes('toggle') || act.includes('modify') || act.includes('price') || act.includes('discount') || act.includes('coupon') || act.includes('cancel') || act.includes('refund')) {
    return 'warning'
  }
  if (act.includes('login') || act.includes('auth') || act.includes('password') || act.includes('token') || act.includes('2fa') || act.includes('failed')) {
    return 'security'
  }
  return 'info'
}


export async function cleanupExpiredAdminEntries() {
  await Promise.all([
    query('DELETE FROM coupons WHERE expires_at IS NOT NULL AND expires_at < now()'),
    query('DELETE FROM discount_coupons WHERE expires_at IS NOT NULL AND expires_at < now()'),
    query('DELETE FROM product_promotions WHERE ends_at IS NOT NULL AND ends_at < now()'),
  ])
}


export async function logAuditEvent({
  actorUserId,
  actorEmail,
  action,
  entityType,
  entityId,
  detail,
  ipAddress,
  userAgent,
  status = 'success',
  severity,
  requestMethod,
  requestPath,
}) {
  const actorId = actorUserId == null ? null : Number(actorUserId)
  const ae = typeof actorEmail === 'string' ? actorEmail.trim() : null
  const act = typeof action === 'string' ? action.trim() : ''
  const et = typeof entityType === 'string' ? entityType.trim() : ''
  const eid = entityId == null || entityId === '' ? null : String(entityId)
  if (!act) throw new Error('invalid_action')
  if (!et) throw new Error('invalid_entity_type')

  const ip = typeof ipAddress === 'string' && ipAddress.trim() ? ipAddress.trim().slice(0, 128) : null
  const ua = typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim().slice(0, 512) : null
  const st = typeof status === 'string' && status.trim() ? status.trim().toLowerCase() : 'success'
  const sev = resolveAuditSeverity(act, severity)
  const method = typeof requestMethod === 'string' && requestMethod.trim() ? requestMethod.trim().toUpperCase().slice(0, 16) : null
  const path = typeof requestPath === 'string' && requestPath.trim() ? requestPath.trim().slice(0, 255) : null
  const payload = detail == null ? {} : detail

  await query(
    `INSERT INTO audit_logs (
       actor_user_id, actor_email, action, entity_type, entity_id, detail_json,
       ip_address, user_agent, status, severity, request_method, request_path
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)`,
    [
      Number.isFinite(actorId) ? actorId : null,
      ae,
      act,
      et,
      eid,
      JSON.stringify(payload),
      ip,
      ua,
      st,
      sev,
      method,
      path,
    ],
  )
  return { ok: true }
}


export async function adminListAuditLogs({
  limit = 50,
  offset = 0,
  page = 1,
  search,
  action,
  category,
  severity,
  status,
  actorUserId,
  dateFrom,
  dateTo,
} = {}) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 50))
  const pg = Math.max(1, Number(page) || 1)
  const off = offset != null && Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : (pg - 1) * lim

  const where = []
  const params = []

  if (typeof search === 'string' && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`
    params.push(q)
    const pIdx = params.length
    where.push(`(
      LOWER(al.action) LIKE $${pIdx} OR
      LOWER(al.entity_type) LIKE $${pIdx} OR
      LOWER(COALESCE(al.entity_id, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(al.actor_email, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(u.username, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(u.display_name, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(al.ip_address, '')) LIKE $${pIdx} OR
      al.detail_json::text ILIKE $${pIdx}
    )`)
  }

  if (typeof action === 'string' && action.trim()) {
    params.push(action.trim())
    where.push(`al.action = $${params.length}`)
  }

  if (typeof category === 'string' && category.trim() && category.trim() !== 'all') {
    const cat = category.trim().toLowerCase()
    params.push(`${cat}%`)
    const pIdx = params.length
    where.push(`(LOWER(al.action) LIKE $${pIdx} OR LOWER(al.entity_type) LIKE $${pIdx})`)
  }

  if (typeof severity === 'string' && severity.trim() && severity.trim() !== 'all') {
    params.push(severity.trim().toLowerCase())
    where.push(`al.severity = $${params.length}`)
  }

  if (typeof status === 'string' && status.trim() && status.trim() !== 'all') {
    params.push(status.trim().toLowerCase())
    where.push(`al.status = $${params.length}`)
  }

  if (actorUserId != null && Number.isFinite(Number(actorUserId))) {
    params.push(Number(actorUserId))
    where.push(`al.actor_user_id = $${params.length}`)
  }

  if (dateFrom) {
    const df = new Date(dateFrom)
    if (!isNaN(df.getTime())) {
      params.push(df.toISOString())
      where.push(`al.created_at >= $${params.length}::timestamptz`)
    }
  }

  if (dateTo) {
    const dt = new Date(dateTo)
    if (!isNaN(dt.getTime())) {
      params.push(dt.toISOString())
      where.push(`al.created_at <= $${params.length}::timestamptz`)
    }
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const countRow = await get(
    `SELECT COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE al.severity = 'critical')::bigint AS critical_count,
            COUNT(*) FILTER (WHERE al.severity = 'warning')::bigint AS warning_count,
            COUNT(*) FILTER (WHERE al.severity = 'security')::bigint AS security_count,
            COUNT(DISTINCT al.actor_user_id) FILTER (WHERE al.actor_user_id IS NOT NULL)::int AS unique_actors,
            COUNT(DISTINCT al.ip_address) FILTER (WHERE al.ip_address IS NOT NULL AND al.ip_address <> '')::int AS unique_ips
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     ${whereSql}`,
    params,
  )

  const total = Number(countRow?.total || 0)

  params.push(lim)
  params.push(off)

  const rows = await all(
    `SELECT al.id,
            al.actor_user_id,
            COALESCE(u.username, '') AS actor_username,
            COALESCE(u.display_name, '') AS actor_display_name,
            COALESCE(u.role, '') AS actor_role,
            al.actor_email,
            al.action,
            al.entity_type,
            al.entity_id,
            al.detail_json,
            al.ip_address,
            al.user_agent,
            COALESCE(al.status, 'success') AS status,
            COALESCE(al.severity, 'info') AS severity,
            al.request_method,
            al.request_path,
            al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     ${whereSql}
     ORDER BY al.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )

  return {
    logs: rows,
    total,
    page: pg,
    limit: lim,
    totalPages: Math.max(1, Math.ceil(total / lim)),
    summary: {
      total_count: total,
      critical_count: Number(countRow?.critical_count || 0),
      warning_count: Number(countRow?.warning_count || 0),
      security_count: Number(countRow?.security_count || 0),
      unique_actors: Number(countRow?.unique_actors || 0),
      unique_ips: Number(countRow?.unique_ips || 0),
    },
  }
}


export async function adminGetAuditLogById(logId) {
  const id = Number(logId)
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid_id')

  const row = await get(
    `SELECT al.id,
            al.actor_user_id,
            COALESCE(u.username, '') AS actor_username,
            COALESCE(u.display_name, '') AS actor_display_name,
            COALESCE(u.role, '') AS actor_role,
            al.actor_email,
            al.action,
            al.entity_type,
            al.entity_id,
            al.detail_json,
            al.ip_address,
            al.user_agent,
            COALESCE(al.status, 'success') AS status,
            COALESCE(al.severity, 'info') AS severity,
            al.request_method,
            al.request_path,
            al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE al.id = $1
     LIMIT 1`,
    [id],
  )

  if (!row) throw new Error('not_found')
  return row
}


export async function adminGetAuditLogStats() {
  const stats24h = await get(
    `SELECT COUNT(*)::int AS count_24h,
            COUNT(*) FILTER (WHERE severity IN ('critical', 'security'))::int AS critical_24h,
            COUNT(DISTINCT actor_user_id) FILTER (WHERE actor_user_id IS NOT NULL)::int AS active_actors_24h,
            COUNT(DISTINCT ip_address) FILTER (WHERE ip_address IS NOT NULL)::int AS unique_ips_24h
     FROM audit_logs
     WHERE created_at >= NOW() - INTERVAL '24 hours'`,
  )

  const stats7d = await get(
    `SELECT COUNT(*)::int AS count_7d,
            COUNT(*) FILTER (WHERE severity IN ('critical', 'security'))::int AS critical_7d
     FROM audit_logs
     WHERE created_at >= NOW() - INTERVAL '7 days'`,
  )

  const topActions = await all(
    `SELECT action, COUNT(*)::int AS count
     FROM audit_logs
     WHERE created_at >= NOW() - INTERVAL '7 days'
     GROUP BY action
     ORDER BY count DESC
     LIMIT 6`,
  )

  const topActors = await all(
    `SELECT al.actor_user_id,
            COALESCE(u.username, 'System') AS actor_username,
            COALESCE(u.display_name, al.actor_email, 'Unknown') AS actor_name,
            COALESCE(u.role, 'staff') AS actor_role,
            COUNT(*)::int AS action_count,
            MAX(al.created_at) AS last_active
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE al.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY al.actor_user_id, u.username, u.display_name, al.actor_email, u.role
     ORDER BY action_count DESC
     LIMIT 6`,
  )

  const recentCritical = await all(
    `SELECT al.id, al.action, al.entity_type, al.entity_id, al.severity, al.status,
            COALESCE(u.username, al.actor_email, 'System') AS actor_name,
            al.ip_address, al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE al.severity IN ('critical', 'security')
     ORDER BY al.id DESC
     LIMIT 5`,
  )

  return {
    kpis: {
      count_24h: Number(stats24h?.count_24h || 0),
      critical_24h: Number(stats24h?.critical_24h || 0),
      active_actors_24h: Number(stats24h?.active_actors_24h || 0),
      unique_ips_24h: Number(stats24h?.unique_ips_24h || 0),
      count_7d: Number(stats7d?.count_7d || 0),
      critical_7d: Number(stats7d?.critical_7d || 0),
    },
    top_actions: topActions || [],
    top_actors: topActors || [],
    recent_critical: recentCritical || [],
  }
}


export async function adminGetDashboardOverview({ days = 14, urgentMinutes = 60, urgentLimit = 5 } = {}) {
  const d = Number(days)
  const um = Number(urgentMinutes)
  const ul = Number(urgentLimit)

  if (!Number.isFinite(d) || d <= 0 || d > 90) throw new Error('invalid_days')
  if (!Number.isFinite(um) || um <= 0 || um > 43200) throw new Error('invalid_urgent_minutes')
  if (!Number.isFinite(ul) || ul < 0 || ul > 50) throw new Error('invalid_urgent_limit')

  const [todayRow, monthRow, totalOrdersRow, pendingDeliveriesRow, farmPendingRow, urgentCountRow, urgentItems, series] = await Promise.all([
    get(
      `SELECT COALESCE(SUM(total_points), 0)::bigint AS revenue_points,
              COUNT(*)::int AS orders_count
       FROM orders
       WHERE status = 'paid'
         AND created_at >= date_trunc('day', now())`,
    ),
    get(
      `SELECT COALESCE(SUM(total_points), 0)::bigint AS revenue_points,
              COUNT(*)::int AS orders_count
       FROM orders
       WHERE status = 'paid'
         AND created_at >= date_trunc('month', now())`,
    ),
    get(`SELECT COUNT(*)::bigint AS c FROM orders`),
    get(
      `SELECT COUNT(*)::bigint AS c
       FROM deliveries
       WHERE status IN ('pending_claim', 'pending_fulfillment')`,
    ),
    get(`SELECT COUNT(*)::bigint AS c FROM farm_requests WHERE status = 'pending'`),
    get(
      `SELECT COUNT(*)::bigint AS c
       FROM farm_requests
       WHERE status = 'pending'
         AND created_at <= now() - ($1::int * interval '1 minute')`,
      [Math.trunc(um)],
    ),
    ul > 0
      ? all(
          `SELECT fr.id, fr.order_id, fr.delivery_id, fr.created_at,
                  u.email,
                  p.name AS product_name
           FROM farm_requests fr
           JOIN users u ON u.id = fr.user_id
           JOIN products p ON p.id = fr.product_id
           WHERE fr.status = 'pending'
             AND fr.created_at <= now() - ($1::int * interval '1 minute')
           ORDER BY fr.created_at ASC
           LIMIT $2`,
          [Math.trunc(um), Math.trunc(ul)],
        )
      : Promise.resolve([]),
    all(
      `WITH days AS (
         SELECT generate_series(
           date_trunc('day', now()) - (($1::int - 1) * interval '1 day'),
           date_trunc('day', now()),
           interval '1 day'
         ) AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(o.total_points), 0)::bigint AS revenue_points,
              COUNT(o.id)::int AS orders_count
       FROM days d
       LEFT JOIN orders o
         ON o.status = 'paid'
        AND o.created_at >= d.day
        AND o.created_at < d.day + interval '1 day'
       GROUP BY d.day
       ORDER BY d.day ASC`,
      [Math.trunc(d)],
    ),
  ])

  return {
    generated_at: new Date().toISOString(),
    revenue_today_points: Number(todayRow?.revenue_points ?? 0),
    orders_today_count: Number(todayRow?.orders_count ?? 0),
    revenue_month_points: Number(monthRow?.revenue_points ?? 0),
    orders_month_count: Number(monthRow?.orders_count ?? 0),
    orders_total_count: Number(totalOrdersRow?.c ?? 0),
    deliveries_pending_count: Number(pendingDeliveriesRow?.c ?? 0),
    farm_pending_count: Number(farmPendingRow?.c ?? 0),
    farm_urgent_count: Number(urgentCountRow?.c ?? 0),
    farm_urgent_items: Array.isArray(urgentItems) ? urgentItems : [],
    revenue_series: Array.isArray(series)
      ? series.map((r) => ({
          day: String(r.day ?? ''),
          revenue_points: Number(r.revenue_points ?? 0),
          orders_count: Number(r.orders_count ?? 0),
        }))
      : [],
    days: Math.trunc(d),
    urgent_minutes: Math.trunc(um),
  }
}


export async function adminGetOpsPulse({ days = 14, limit = 12, supportSlaMinutes = 30, farmSlaMinutes = 60 } = {}) {
  const d = Number(days)
  const lim = Number(limit)
  const supportSla = Number(supportSlaMinutes)
  const farmSla = Number(farmSlaMinutes)

  if (!Number.isFinite(d) || d <= 0 || d > 90) throw new Error('invalid_days')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 50) throw new Error('invalid_limit')
  if (!Number.isFinite(supportSla) || supportSla <= 0 || supportSla > 43200) throw new Error('invalid_support_sla_minutes')
  if (!Number.isFinite(farmSla) || farmSla <= 0 || farmSla > 43200) throw new Error('invalid_farm_sla_minutes')

  const [
    supportOpenCount,
    supportPendingCount,
    supportUnassignedCount,
    supportFirstResponseAvg,
    supportResolveAvg,
    supportOverSla,
    farmPendingCount,
    farmInProgressCount,
    farmUnassignedCount,
    farmAssignAvg,
    farmFulfillAvg,
    farmOverSla,
    supportNotifications,
    farmNotifications,
  ] = await Promise.all([
    get(`SELECT COUNT(*)::int AS c FROM support_tickets WHERE status = 'open'`),
    get(`SELECT COUNT(*)::int AS c FROM support_tickets WHERE status = 'pending'`),
    get(`SELECT COUNT(*)::int AS c FROM support_tickets WHERE status IN ('open', 'pending') AND assigned_to IS NULL`),
    get(
      `SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60.0) AS avg_minutes
       FROM support_tickets
       WHERE first_response_at IS NOT NULL
         AND created_at >= now() - ($1::int * interval '1 day')`,
      [Math.trunc(d)],
    ),
    get(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0) AS avg_minutes
       FROM support_tickets
       WHERE resolved_at IS NOT NULL
         AND created_at >= now() - ($1::int * interval '1 day')`,
      [Math.trunc(d)],
    ),
    get(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets
       WHERE status IN ('open', 'pending')
         AND first_response_at IS NULL
         AND created_at <= now() - ($1::int * interval '1 minute')`,
      [Math.trunc(supportSla)],
    ),
    get(`SELECT COUNT(*)::int AS c FROM farm_requests WHERE status = 'pending'`),
    get(`SELECT COUNT(*)::int AS c FROM farm_requests WHERE status = 'in_progress'`),
    get(`SELECT COUNT(*)::int AS c FROM farm_requests WHERE status = 'pending' AND assigned_booster_id IS NULL`),
    get(
      `SELECT AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60.0) AS avg_minutes
       FROM farm_requests
       WHERE assigned_at IS NOT NULL
         AND created_at >= now() - ($1::int * interval '1 day')`,
      [Math.trunc(d)],
    ),
    get(
      `SELECT AVG(EXTRACT(EPOCH FROM (fulfilled_at - created_at)) / 60.0) AS avg_minutes
       FROM farm_requests
       WHERE fulfilled_at IS NOT NULL
         AND created_at >= now() - ($1::int * interval '1 day')`,
      [Math.trunc(d)],
    ),
    get(
      `SELECT COUNT(*)::int AS c
       FROM farm_requests
       WHERE status = 'pending'
         AND created_at <= now() - ($1::int * interval '1 minute')`,
      [Math.trunc(farmSla)],
    ),
    all(
      `SELECT t.id,
              t.subject,
              t.status,
              t.created_at,
              t.last_message_at,
              t.assigned_to,
              u.email AS user_email
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.status IN ('open', 'pending')
       ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
       LIMIT $1`,
      [Math.max(1, Math.ceil(lim / 2))],
    ),
    all(
      `SELECT fr.id,
              fr.status,
              fr.created_at,
              fr.assigned_booster_id,
              u.email,
              p.name AS product_name
       FROM farm_requests fr
       JOIN users u ON u.id = fr.user_id
       JOIN products p ON p.id = fr.product_id
       WHERE fr.status = 'pending'
       ORDER BY fr.created_at ASC
       LIMIT $1`,
      [Math.max(1, lim)],
    ),
  ])

  const notifications = []

  for (const row of Array.isArray(supportNotifications) ? supportNotifications : []) {
    const unassigned = row?.assigned_to == null
    notifications.push({
      kind: 'support_ticket',
      severity: unassigned ? 'high' : 'medium',
      title: `Support #${row.id} ${row.subject || '-'}`,
      subtitle: `${row.user_email || '-'} • ${String(row.status || '').toLowerCase()}${unassigned ? ' • unassigned' : ''}`,
      created_at: row?.last_message_at || row?.created_at || null,
      ref: { module: 'support', id: Number(row?.id) || null },
    })
  }

  for (const row of Array.isArray(farmNotifications) ? farmNotifications : []) {
    const unassigned = row?.assigned_booster_id == null
    notifications.push({
      kind: 'farm_request',
      severity: unassigned ? 'high' : 'medium',
      title: `Farm #${row.id} ${row.product_name || '-'}`,
      subtitle: `${row.email || '-'} • pending${unassigned ? ' • unassigned' : ''}`,
      created_at: row?.created_at || null,
      ref: { module: 'fulfillment', id: Number(row?.id) || null },
    })
  }

  notifications.sort((a, b) => {
    const av = new Date(a?.created_at || 0).getTime()
    const bv = new Date(b?.created_at || 0).getTime()
    return bv - av
  })

  return {
    generated_at: new Date().toISOString(),
    days: Math.trunc(d),
    support_sla_minutes: Math.trunc(supportSla),
    farm_sla_minutes: Math.trunc(farmSla),
    summary: {
      support_open_count: Number(supportOpenCount?.c ?? 0),
      support_pending_count: Number(supportPendingCount?.c ?? 0),
      support_unassigned_count: Number(supportUnassignedCount?.c ?? 0),
      support_over_sla_count: Number(supportOverSla?.c ?? 0),
      farm_pending_count: Number(farmPendingCount?.c ?? 0),
      farm_in_progress_count: Number(farmInProgressCount?.c ?? 0),
      farm_unassigned_count: Number(farmUnassignedCount?.c ?? 0),
      farm_over_sla_count: Number(farmOverSla?.c ?? 0),
    },
    sla: {
      support_first_response_avg_minutes: Number(supportFirstResponseAvg?.avg_minutes ?? 0),
      support_resolution_avg_minutes: Number(supportResolveAvg?.avg_minutes ?? 0),
      farm_assign_avg_minutes: Number(farmAssignAvg?.avg_minutes ?? 0),
      farm_fulfill_avg_minutes: Number(farmFulfillAvg?.avg_minutes ?? 0),
    },
    notifications: notifications.slice(0, Math.trunc(lim)),
  }
}

