import { all, get, query } from './pool.js'

export function normalizeAnnouncements(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return arr.slice(0, 10).map((item) => {
    const o = item && typeof item === 'object' ? item : {}
    return {
      enabled: o.enabled === true,
      text: String(o.text ?? '').trim().slice(0, 300),
      link: String(o.link ?? '').trim().slice(0, 300),
      bg: String(o.bg ?? '').trim().slice(0, 200),
      push_to_inbox: o.push_to_inbox === true,
    }
  }).filter((i) => i.text)
}


export async function listAnnouncementsPublic() {
  return all(
    `SELECT id, title, text, link, bg, icon, enabled, sort_order, start_at, end_at, created_at
     FROM announcements
     WHERE enabled = true
       AND (start_at IS NULL OR start_at <= now())
       AND (end_at IS NULL OR end_at > now())
     ORDER BY sort_order ASC, id ASC`,
  )
}


export async function adminListAnnouncements() {
  return all(
    `SELECT id, title, text, link, bg, icon, enabled, push_to_inbox, sort_order, start_at, end_at, created_at, updated_at
     FROM announcements
     ORDER BY sort_order ASC, id ASC`,
  )
}


export async function adminCreateAnnouncement({ title, text, link, bg, icon, enabled, pushToInbox, sortOrder, startAt, endAt }) {
  const t = String(text ?? '').trim()
  if (!t) throw new Error('invalid_text')
  const res = await query(
    `INSERT INTO announcements (title, text, link, bg, icon, enabled, push_to_inbox, sort_order, start_at, end_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      String(title ?? '').trim().slice(0, 200),
      t.slice(0, 300),
      String(link ?? '').trim().slice(0, 300),
      String(bg ?? '').trim().slice(0, 200),
      String(icon ?? '').trim().slice(0, 2000),
      enabled !== false,
      pushToInbox === true,
      Number(sortOrder) || 0,
      startAt || null,
      endAt || null,
    ],
  )
  return res.rows[0]
}


export async function adminUpdateAnnouncement(id, { title, text, link, bg, icon, enabled, pushToInbox, sortOrder, startAt, endAt }) {
  const aid = Number(id)
  if (!Number.isFinite(aid) || aid <= 0) throw new Error('invalid_id')
  const t = String(text ?? '').trim()
  if (!t) throw new Error('invalid_text')
  const res = await query(
    `UPDATE announcements
     SET title = $2, text = $3, link = $4, bg = $5, icon = $6, enabled = $7, push_to_inbox = $8, sort_order = $9, start_at = $10, end_at = $11, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      aid,
      String(title ?? '').trim().slice(0, 200),
      t.slice(0, 300),
      String(link ?? '').trim().slice(0, 300),
      String(bg ?? '').trim().slice(0, 200),
      String(icon ?? '').trim().slice(0, 2000),
      enabled !== false,
      pushToInbox === true,
      Number(sortOrder) || 0,
      startAt || null,
      endAt || null,
    ],
  )
  return res.rows[0] || null
}


export async function adminDeleteAnnouncement(id) {
  const aid = Number(id)
  if (!Number.isFinite(aid) || aid <= 0) throw new Error('invalid_id')
  await query(`DELETE FROM announcements WHERE id = $1`, [aid])
}


export async function adminReorderAnnouncements(orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return
  for (let i = 0; i < orderedIds.length; i++) {
    const aid = Number(orderedIds[i])
    if (Number.isFinite(aid) && aid > 0) {
      await query(`UPDATE announcements SET sort_order = $1, updated_at = now() WHERE id = $2`, [i, aid])
    }
  }
}

// ── Site Messages ──


export async function adminCreateSiteMessage({ senderId, targetType, targetUserId, title, body }) {
  const isDirect = targetType === 'individual' || targetType === 'user'
  const tt = isDirect ? 'individual' : 'global'
  const t = String(title ?? '').trim()
  if (!t) throw new Error('invalid_title')
  const b = String(body ?? '').trim()
  const sid = senderId ? Number(senderId) : null
  const tuid = isDirect ? Number(targetUserId) : null
  if (isDirect && (!Number.isFinite(tuid) || tuid <= 0)) throw new Error('invalid_target_user')
  const res = await query(
    `INSERT INTO site_messages (sender_id, target_type, target_user_id, title, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [sid, tt, tuid, t.slice(0, 200), b.slice(0, 5000)],
  )
  return res.rows[0]
}


export async function adminListDirectChatUsers() {
  return all(
    `SELECT u.id AS user_id, u.username, u.email, u.display_name, u.role, u.custom_avatar_url,
            MAX(m.created_at) AS last_message_at,
            COUNT(m.id)::int AS total_messages,
            (SELECT body FROM site_messages WHERE target_user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_message_body,
            (SELECT title FROM site_messages WHERE target_user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_message_title,
            COUNT(CASE WHEN r.read_at IS NULL THEN 1 END)::int AS unread_by_user
     FROM users u
     JOIN site_messages m ON m.target_user_id = u.id
     LEFT JOIN site_message_reads r ON r.message_id = m.id AND r.user_id = u.id
     GROUP BY u.id
     ORDER BY last_message_at DESC
     LIMIT 100`,
  )
}


export async function adminGetDirectChatMessages(targetUserId) {
  const tuid = Number(targetUserId)
  if (!Number.isFinite(tuid)) throw new Error('invalid_target_user')
  return all(
    `SELECT m.id, m.sender_id, u.username AS sender_username, u.display_name AS sender_display_name, u.role AS sender_role,
            m.target_user_id, tu.username AS target_username, tu.display_name AS target_display_name,
            m.title, m.body, m.created_at,
            CASE WHEN r.read_at IS NOT NULL THEN true ELSE false END AS is_read_by_user,
            r.read_at AS user_read_at
     FROM site_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN users tu ON tu.id = m.target_user_id
     LEFT JOIN site_message_reads r ON r.message_id = m.id AND r.user_id = tuid
     WHERE m.target_user_id = $1
     ORDER BY m.created_at ASC`,
    [tuid],
  )
}


export async function listMyDirectMessages(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  return all(
    `SELECT m.id, m.sender_id, u.username AS sender_username, u.display_name AS sender_display_name, u.role AS sender_role,
            m.title, m.body, m.created_at,
            CASE WHEN r.read_at IS NOT NULL THEN true ELSE false END AS is_read
     FROM site_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN site_message_reads r ON r.message_id = m.id AND r.user_id = $1
     WHERE m.target_user_id = $1
       AND NOT EXISTS (SELECT 1 FROM site_message_dismissals d WHERE d.message_id = m.id AND d.user_id = $1)
     ORDER BY m.created_at ASC`,
    [uid],
  )
}


export async function markDirectMessagesRead(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) return
  await query(
    `INSERT INTO site_message_reads (user_id, message_id)
     SELECT $1, m.id FROM site_messages m
     WHERE m.target_user_id = $1
       AND NOT EXISTS (SELECT 1 FROM site_message_reads r WHERE r.message_id = m.id AND r.user_id = $1)`,
    [uid],
  )
}


export async function adminListSiteMessages({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50))
  const off = Math.max(0, Number(offset) || 0)
  const rows = await all(
    `SELECT m.id, m.sender_id, u.email AS sender_email, m.target_type, m.target_user_id,
            tu.email AS target_email, tu.display_name AS target_display_name,
            m.title, m.body, m.created_at
     FROM site_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN users tu ON tu.id = m.target_user_id
     ORDER BY m.created_at DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
  const countRes = await get(`SELECT COUNT(*)::int AS total FROM site_messages`)
  return { messages: rows, total: countRes?.total || 0 }
}


export async function listMySiteMessages(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  const lim = Math.min(200, Math.max(1, Number(limit) || 50))
  const off = Math.max(0, Number(offset) || 0)
  return all(
    `SELECT m.id, m.title, m.body, m.target_type, m.created_at,
            CASE WHEN r.read_at IS NOT NULL THEN true ELSE false END AS is_read
     FROM site_messages m
     LEFT JOIN site_message_reads r ON r.message_id = m.id AND r.user_id = $1
     WHERE (m.target_type = 'global' OR m.target_user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM site_message_dismissals d WHERE d.message_id = m.id AND d.user_id = $1)
     ORDER BY m.created_at DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  )
}


export async function countUnreadSiteMessages(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) return 0
  const row = await get(
    `SELECT COUNT(*)::int AS cnt
     FROM site_messages m
     WHERE (m.target_type = 'global' OR m.target_user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM site_message_dismissals d WHERE d.message_id = m.id AND d.user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM site_message_reads r WHERE r.message_id = m.id AND r.user_id = $1)`,
    [uid],
  )
  return row?.cnt || 0
}


export async function markSiteMessageRead(userId, messageId) {
  const uid = Number(userId)
  const mid = Number(messageId)
  if (!Number.isFinite(uid) || !Number.isFinite(mid)) return
  await query(
    `INSERT INTO site_message_reads (user_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [uid, mid],
  )
}


export async function markAllSiteMessagesRead(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) return
  await query(
    `INSERT INTO site_message_reads (user_id, message_id)
     SELECT $1, m.id FROM site_messages m
     WHERE (m.target_type = 'global' OR m.target_user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM site_message_dismissals d WHERE d.message_id = m.id AND d.user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM site_message_reads r WHERE r.message_id = m.id AND r.user_id = $1)`,
    [uid],
  )
}


export async function deleteMySiteMessage(userId, messageId) {
  const uid = Number(userId)
  const mid = Number(messageId)
  if (!Number.isFinite(uid) || !Number.isFinite(mid)) return
  await query(
    `INSERT INTO site_message_dismissals (user_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [uid, mid],
  )
}


export async function adminDeleteSiteMessage(id) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  await query(`DELETE FROM site_message_reads WHERE message_id = $1`, [mid])
  await query(`DELETE FROM site_messages WHERE id = $1`, [mid])
}

// ─────────────────────────────────────────────
// ── Product Bundles ──
// ─────────────────────────────────────────────

