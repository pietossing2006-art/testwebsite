import crypto from 'node:crypto'
import { all, get, hashPassword, pool, query, verifyPassword } from './pool.js'

export async function registerUser(email, password, username = null) {
  const passwordHash = await hashPassword(password)
  const row = await get('SELECT COUNT(*)::int AS c FROM users')
  const isFirst = (row?.c ?? 0) === 0
  const role = isFirst ? 'owner' : 'user'

  const un = typeof username === 'string' && username.trim().length > 0 ? username.trim() : null
  const dn = un

  const res = await query(
    'INSERT INTO users (email, password_hash, role, username, display_name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [email, passwordHash, role, un, dn],
  )
  const id = res.rows[0].id
  await query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING', [id])
  return { id, email, username: un }
}


export async function getUserByEmail(email) {
  return get('SELECT id, email, username, password_hash, role, is_banned, display_name, avatar_url, is_email_verified, email_verified_at, two_factor_enabled, two_factor_type FROM users WHERE email = $1', [email])
}


export async function getUserByUsername(username) {
  return get('SELECT id, email, username, password_hash, role, is_banned, display_name, avatar_url, is_email_verified, email_verified_at, two_factor_enabled, two_factor_type FROM users WHERE username = $1', [
    username,
  ])
}


export async function getUserByLogin(login) {
  const v = typeof login === 'string' ? login.trim() : ''
  if (!v) return null
  if (v.includes('@')) return getUserByEmail(v.toLowerCase())
  return getUserByUsername(v)
}


export async function getUserById(id) {
  return get(
    'SELECT id, email, username, role, is_banned, display_name, avatar_url, is_email_verified, email_verified_at, two_factor_enabled, two_factor_type, created_at FROM users WHERE id = $1',
    [id],
  )
}


export async function getUser2FASecret(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return null
  return get('SELECT id, email, two_factor_enabled, two_factor_type, two_factor_secret, two_factor_backup_codes, two_factor_confirmed_at FROM users WHERE id = $1', [uid])
}


export async function enableUserTotp2FA({ userId, secret, backupCodesHashed }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false }
  await query(
    'UPDATE users SET two_factor_enabled = true, two_factor_type = \'totp\', two_factor_secret = $2, two_factor_backup_codes = $3, two_factor_confirmed_at = now() WHERE id = $1',
    [uid, secret, JSON.stringify(backupCodesHashed || [])],
  )
  return { ok: true }
}


export async function enableUserEmail2FA({ userId, backupCodesHashed }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false }
  await query(
    'UPDATE users SET two_factor_enabled = true, two_factor_type = \'email\', two_factor_secret = null, two_factor_backup_codes = $2, two_factor_confirmed_at = now() WHERE id = $1',
    [uid, JSON.stringify(backupCodesHashed || [])],
  )
  return { ok: true }
}


export async function disableUser2FA(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false }
  await query(
    'UPDATE users SET two_factor_enabled = false, two_factor_type = \'none\', two_factor_secret = null, two_factor_backup_codes = null, two_factor_confirmed_at = null WHERE id = $1',
    [uid],
  )
  return { ok: true }
}


export async function updateUserBackupCodes(userId, remainingHashedCodes) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false }
  await query(
    'UPDATE users SET two_factor_backup_codes = $2 WHERE id = $1',
    [uid, JSON.stringify(remainingHashedCodes || [])],
  )
  return { ok: true }
}


export async function setUserEmailVerified(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false }
  await query('UPDATE users SET is_email_verified = true, email_verified_at = now() WHERE id = $1', [uid])
  return { ok: true }
}


export async function listUsers({ limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT u.id,
            u.email,
            u.username,
            u.role,
            u.is_banned,
            u.display_name,
            u.avatar_url,
            u.created_at,
            COALESCE(w.balance, 0) AS balance,
            COALESCE(COUNT(DISTINCT o.id), 0) AS orders_count,
            COALESCE(SUM(o.total_points), 0) AS total_spend_points
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN orders o ON o.user_id = u.id
     GROUP BY u.id, w.balance
     ORDER BY u.id ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}


export async function adminListUsersAdvanced({
  limit = 50,
  offset = 0,
  search,
  role,
  status,
  sort = 'created_desc',
} = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 200) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  const q = typeof search === 'string' ? search.trim() : ''
  const roleFilter = typeof role === 'string' ? role.trim().toLowerCase() : ''
  const statusFilter = typeof status === 'string' ? status.trim().toLowerCase() : ''

  const where = []
  const params = []

  if (q) {
    params.push(`%${q}%`)
    const idx = params.length
    where.push(`(
      u.email ILIKE $${idx}
      OR COALESCE(u.username, '') ILIKE $${idx}
      OR COALESCE(u.display_name, '') ILIKE $${idx}
      OR CAST(u.id AS TEXT) ILIKE $${idx}
    )`)
  }

  if (roleFilter && roleFilter !== 'all') {
    const allowedRoles = new Set(['owner', 'admin', 'finance', 'booster', 'support', 'user'])
    if (!allowedRoles.has(roleFilter)) throw new Error('invalid_role_filter')
    params.push(roleFilter)
    where.push(`LOWER(COALESCE(u.role, 'user')) = $${params.length}`)
  }

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'active') where.push(`u.is_banned = false`)
    else if (statusFilter === 'banned') where.push(`u.is_banned = true`)
    else throw new Error('invalid_status_filter')
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const sortKey = String(sort || '').trim().toLowerCase()
  const orderBy =
    sortKey === 'created_asc'
      ? 'u.created_at ASC, u.id ASC'
      : sortKey === 'spend_desc'
        ? 'total_spend_points DESC, u.id DESC'
        : sortKey === 'orders_desc'
          ? 'orders_count DESC, u.id DESC'
          : sortKey === 'points_desc'
            ? 'balance DESC, u.id DESC'
            : 'u.created_at DESC, u.id DESC'

  const totalRow = await get(
    `SELECT COUNT(*)::int AS c
     FROM users u
     ${whereSql}`,
    params,
  )

  const summaryRow = await get(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE u.is_banned = false)::int AS active,
            COUNT(*) FILTER (WHERE u.is_banned = true)::int AS banned,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(u.role, 'user')) IN ('admin','owner'))::int AS admins,
            COALESCE(SUM(COALESCE(w.balance, 0)), 0)::bigint AS total_balance
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id`,
  )

  const listParams = [...params, lim, off]
  const rows = await all(
    `SELECT u.id,
            u.email,
            u.username,
            u.role,
            u.is_banned,
            u.display_name,
            u.avatar_url,
            u.created_at,
            COALESCE(w.balance, 0) AS balance,
            COALESCE(os.orders_count, 0) AS orders_count,
            COALESCE(os.total_spend_points, 0) AS total_spend_points
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS orders_count,
              COALESCE(SUM(o.total_points), 0)::bigint AS total_spend_points
       FROM orders o
       WHERE o.user_id = u.id
     ) os ON true
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  )

  return {
    items: rows,
    total: Number(totalRow?.c ?? 0) || 0,
    summary: {
      total: Number(summaryRow?.total ?? 0) || 0,
      active: Number(summaryRow?.active ?? 0) || 0,
      banned: Number(summaryRow?.banned ?? 0) || 0,
      admins: Number(summaryRow?.admins ?? 0) || 0,
      total_balance: Number(summaryRow?.total_balance ?? 0) || 0,
    },
  }
}


export async function adminGetUserManagementDetail(
  userId,
  { topupsLimit = 20, transactionsLimit = 20, sessionsLimit = 20, auditLimit = 40 } = {},
) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')

  const user = await get(
    `SELECT u.id,
            u.email,
            u.username,
            u.role,
            u.is_banned,
            u.display_name,
            u.avatar_url,
            u.created_at,
            COALESCE(w.balance, 0) AS balance,
            COALESCE(os.orders_count, 0) AS orders_count,
            COALESCE(os.total_spend_points, 0) AS total_spend_points
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS orders_count,
              COALESCE(SUM(o.total_points), 0)::bigint AS total_spend_points
       FROM orders o
       WHERE o.user_id = u.id
     ) os ON true
     WHERE u.id = $1`,
    [uid],
  )
  if (!user) throw new Error('not_found')

  const topupsLim = Math.min(100, Math.max(1, Number(topupsLimit) || 20))
  const txLim = Math.min(100, Math.max(1, Number(transactionsLimit) || 20))
  const sessLim = Math.min(100, Math.max(1, Number(sessionsLimit) || 20))
  const auditLim = Math.min(200, Math.max(1, Number(auditLimit) || 40))

  const [topups, transactions, sessions, audits, topupStats, txStats] = await Promise.all([
    all(
      `SELECT id, amount, amount_points, method, provider, provider_ref, reference, status, created_at, updated_at
       FROM topups
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [uid, topupsLim],
    ),
    all(
      `SELECT id, type, points, ref_type, ref_id, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [uid, txLim],
    ),
    all(
      `SELECT token, created_at, expires_at
       FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [uid, sessLim],
    ),
    all(
      `SELECT al.id,
              al.actor_user_id,
              COALESCE(au.username, '') AS actor_username,
              al.actor_email,
              al.action,
              al.entity_type,
              al.entity_id,
              al.detail_json,
              al.created_at
       FROM audit_logs al
       LEFT JOIN users au ON au.id = al.actor_user_id
       WHERE (al.entity_type = 'user' AND al.entity_id = $1)
          OR al.actor_user_id = $2
       ORDER BY al.id DESC
       LIMIT $3`,
      [String(uid), uid, auditLim],
    ),
    get(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
              COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
       FROM topups
       WHERE user_id = $1`,
      [uid],
    ),
    get(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN type = 'credit' THEN points ELSE 0 END), 0)::bigint AS total_credit,
              COALESCE(SUM(CASE WHEN type = 'debit' THEN points ELSE 0 END), 0)::bigint AS total_debit
       FROM transactions
       WHERE user_id = $1`,
      [uid],
    ),
  ])

  const activeSessions = (sessions || []).filter((s) => {
    if (!s?.expires_at) return true
    return new Date(s.expires_at).getTime() > Date.now()
  })

  return {
    user,
    topups,
    transactions,
    sessions,
    audits,
    security: {
      is_banned: Boolean(user?.is_banned),
      role: String(user?.role || 'user').toLowerCase(),
      active_sessions: activeSessions.length,
      total_sessions: Array.isArray(sessions) ? sessions.length : 0,
      has_avatar: Boolean(String(user?.avatar_url || '').trim()),
      has_display_name: Boolean(String(user?.display_name || '').trim()),
      last_session_at: sessions?.[0]?.created_at ?? null,
    },
    snapshot: {
      topups_total: Number(topupStats?.total ?? 0) || 0,
      topups_pending: Number(topupStats?.pending ?? 0) || 0,
      topups_approved: Number(topupStats?.approved ?? 0) || 0,
      topups_rejected: Number(topupStats?.rejected ?? 0) || 0,
      transactions_total: Number(txStats?.total ?? 0) || 0,
      transactions_credit_points: Number(txStats?.total_credit ?? 0) || 0,
      transactions_debit_points: Number(txStats?.total_debit ?? 0) || 0,
    },
  }
}


export async function setUserBanned({ userId, isBanned }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_id')
  const banned = Boolean(isBanned)
  await query('UPDATE users SET is_banned = $2 WHERE id = $1', [uid, banned])
  if (banned) {
    await query('DELETE FROM sessions WHERE user_id = $1', [uid])
  }
  return getUserById(uid)
}


export async function updateUserProfile({ userId, displayName, avatarUrl, username, email }) {
  const uid = Number(userId)
  const dn = typeof displayName === 'string' ? displayName.trim() : null
  const au = typeof avatarUrl === 'string' ? avatarUrl.trim() : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (typeof username === 'string' && username.trim()) {
      const un = username.trim()
      if (un.length < 6) throw new Error('invalid_username')
      if (!/^[a-zA-Z0-9._-]+$/.test(un)) throw new Error('invalid_username_charset')

      const taken = await client.query('SELECT id FROM users WHERE username = $1 AND id != $2', [un, uid])
      if (taken.rows.length > 0) throw new Error('username_taken')

      await client.query('UPDATE users SET username = $2 WHERE id = $1', [uid, un])
    }

    if (typeof email === 'string' && email.trim()) {
      const em = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('invalid_email')

      const taken = await client.query('SELECT id FROM users WHERE email = $1 AND id != $2', [em, uid])
      if (taken.rows.length > 0) throw new Error('email_taken')

      await client.query('UPDATE users SET email = $2 WHERE id = $1', [uid, em])
    }

    await client.query('UPDATE users SET display_name = $2, avatar_url = $3 WHERE id = $1', [uid, dn, au])

    await client.query('COMMIT')
    return getUserById(uid)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}


export async function removeUserOwnAccount(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')

  const target = await get('SELECT id, role FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('not_found')

  const targetRole = String(target.role || 'user').trim().toLowerCase()
  if (targetRole === 'owner') {
    const row = await get(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'owner'`)
    if ((row?.c ?? 0) <= 1) throw new Error('cannot_remove_last_owner')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE topups SET approved_by = NULL WHERE approved_by = $1', [uid])
    await client.query('UPDATE farm_requests SET assigned_booster_id = NULL, assigned_at = NULL WHERE assigned_booster_id = $1', [uid])
    const deleted = await client.query('DELETE FROM users WHERE id = $1', [uid])
    if ((deleted?.rowCount ?? 0) < 1) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    await client.query('COMMIT')
    return { ok: true, deleted: 1 }
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


export async function savePasswordResetToken({ userId, tokenHash, expiresAt, email }) {
  await query(
    `INSERT INTO password_reset_tokens (token_hash, user_id, email, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash, userId, email, expiresAt]
  )
}


export async function getPasswordResetToken(tokenHash) {
  return get(
    `SELECT token_hash, user_id, email, expires_at
     FROM password_reset_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  )
}


export async function deletePasswordResetToken(tokenHash) {
  await query(`DELETE FROM password_reset_tokens WHERE token_hash = $1`, [tokenHash])
}


export async function deleteUserPasswordResetTokens(userId) {
  await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId])
}


export async function adminUpdateUserAccount({ userId, email, username, displayName, avatarUrl }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')

  const target = await get('SELECT id FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('not_found')

  const em = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const un = typeof username === 'string' ? username.trim() : ''
  const dn = typeof displayName === 'string' ? displayName.trim() : ''
  const au = typeof avatarUrl === 'string' ? avatarUrl.trim() : ''

  if (!em || !em.includes('@')) throw new Error('invalid_email')
  if (!un || un.length < 6) throw new Error('invalid_username')
  if (!/^[a-zA-Z0-9._-]+$/.test(un)) throw new Error('invalid_username_charset')
  if (dn.length > 80) throw new Error('invalid_display_name')

  await query(
    'UPDATE users SET email = $2, username = $3, display_name = $4, avatar_url = $5 WHERE id = $1',
    [uid, em, un, dn || null, au || null],
  )

  return getUserById(uid)
}


export async function adminRevokeUserSessions(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')
  const target = await get('SELECT id FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('not_found')
  const res = await query('DELETE FROM sessions WHERE user_id = $1', [uid])
  return { deleted: Number(res?.rowCount ?? 0) || 0 }
}


export async function adminRemoveUserAccount({ userId, actorUserId, performedByOwner }) {
  const uid = Number(userId)
  const aid = Number(actorUserId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')
  if (!Number.isFinite(aid) || aid <= 0) throw new Error('invalid_actor')
  if (uid === aid) throw new Error('cannot_remove_self')

  const target = await get('SELECT id, role FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('not_found')

  const targetRole = String(target.role || 'user').trim().toLowerCase()
  const byOwner = Boolean(performedByOwner)
  if (targetRole === 'owner' && !byOwner) throw new Error('forbidden_owner')
  if (targetRole === 'owner') {
    const row = await get(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'owner'`)
    if ((row?.c ?? 0) <= 1) throw new Error('cannot_remove_last_owner')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE topups SET approved_by = NULL WHERE approved_by = $1', [uid])
    await client.query('UPDATE farm_requests SET assigned_booster_id = NULL, assigned_at = NULL WHERE assigned_booster_id = $1', [uid])
    const deleted = await client.query('DELETE FROM users WHERE id = $1', [uid])
    if ((deleted?.rowCount ?? 0) < 1) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    await client.query('COMMIT')
    return { ok: true, deleted: 1 }
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


export async function setUserPassword({ userId, password }) {
  const passwordHash = await hashPassword(password)
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash])
  return { ok: true }
}


export async function changeUserPassword({ userId, oldPassword, newPassword }) {
  const user = await get('SELECT password_hash FROM users WHERE id = $1', [userId])
  if (!user) throw new Error('user_not_found')
  if (!(await verifyPassword(oldPassword, user.password_hash))) throw new Error('invalid_old_password')
  await setUserPassword({ userId, password: newPassword })
  return { ok: true }
}


export async function setUserRole({ userId, role, performedByOwner }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_id')

  const nextRole = typeof role === 'string' ? role.trim().toLowerCase() : ''
  const allowed = new Set(['user', 'admin', 'owner', 'finance', 'booster', 'support'])
  if (!allowed.has(nextRole)) throw new Error('invalid_role')

  const target = await get('SELECT id, role FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('user_not_found')

  const targetRole = String(target.role || 'user')
  const byOwner = Boolean(performedByOwner)

  if (targetRole === 'owner' && !byOwner) throw new Error('forbidden_owner')
  if (nextRole === 'owner' && !byOwner) throw new Error('forbidden_owner')

  if (targetRole === 'owner' && nextRole !== 'owner') {
    const row = await get(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'owner'`)
    if ((row?.c ?? 0) <= 1) throw new Error('cannot_remove_last_owner')
  }

  const isAdmin = nextRole === 'admin' || nextRole === 'owner'
  const isHead = nextRole === 'owner'
  await query('UPDATE users SET role = $2, is_admin = $3, is_head_admin = $4 WHERE id = $1', [uid, nextRole, isAdmin, isHead])
  return getUserById(uid)
}


export async function adjustUserPoints({ userId, points, refType, refId }) {
  const amount = Number(points)
  if (!Number.isFinite(amount) || amount === 0) throw new Error('invalid_points')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const txType = amount > 0 ? 'credit' : 'debit'
    const abs = Math.abs(amount)

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [userId, txType, abs, refType, refId],
    )

    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return { applied: false, reason: 'duplicate' }
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    )

    const delta = amount
    await client.query(
      `UPDATE wallets
       SET balance = balance + $1, updated_at = now()
       WHERE user_id = $2`,
      [delta, userId],
    )

    await client.query('COMMIT')
    return { applied: true }
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


export async function checkPassword(password, passwordHash) {
  return verifyPassword(password, passwordHash)
}


export async function createSession(userId, { ipAddress, userAgent, remember = true } = {}) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = remember
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000)
  const ip = typeof ipAddress === 'string' && ipAddress.trim() ? ipAddress.trim().slice(0, 128) : null
  const ua = typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim().slice(0, 512) : null

  await query(
    `INSERT INTO sessions (token, user_id, ip_address, user_agent, expires_at, last_active_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [token, userId, ip, ua, expiresAt],
  )
  return token
}


export async function touchSession(token) {
  if (!token) return
  await query('UPDATE sessions SET last_active_at = now() WHERE token = $1', [token]).catch(() => {})
}


export async function listUserSessions(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return []
  return all(
    `SELECT token, ip_address, user_agent, created_at, last_active_at, expires_at
     FROM sessions
     WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())
     ORDER BY last_active_at DESC`,
    [uid],
  )
}


export async function deleteUserSession(userId, token) {
  const uid = Number(userId)
  const t = typeof token === 'string' ? token.trim() : ''
  if (!Number.isFinite(uid) || !t) return { ok: false }
  await query('DELETE FROM sessions WHERE user_id = $1 AND token = $2', [uid, t])
  return { ok: true }
}


export async function deleteAllUserSessionsExcept(userId, currentToken) {
  const uid = Number(userId)
  const t = typeof currentToken === 'string' ? currentToken.trim() : ''
  if (!Number.isFinite(uid)) return { ok: false }
  if (t) {
    await query('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [uid, t])
  } else {
    await query('DELETE FROM sessions WHERE user_id = $1', [uid])
  }
  return { ok: true }
}


export async function getSession(token) {
  return get(
    `SELECT s.token, s.user_id, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND (s.expires_at IS NULL OR s.expires_at > now())`,
    [token],
  )
}


export async function deleteSession(token) {
  const t = typeof token === 'string' ? token : ''
  if (!t) return { ok: false }
  await query('DELETE FROM sessions WHERE token = $1', [t])
  return { ok: true }
}


function hashDeviceToken(token) {
  return crypto.createHash('sha256').update(String(token || '').trim()).digest('hex')
}

export async function createTrustedDevice({ userId, token, deviceName, ipAddress, userAgent, days = 30 }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0 || !token) return null
  const tokenHash = hashDeviceToken(token)
  const name = typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim().slice(0, 255) : 'Trusted Device'
  const ip = typeof ipAddress === 'string' && ipAddress.trim() ? ipAddress.trim().slice(0, 128) : null
  const ua = typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim().slice(0, 512) : null
  const numDays = Math.max(1, Math.min(365, Number(days) || 30))
  const expiresAt = new Date(Date.now() + numDays * 24 * 60 * 60 * 1000)

  await query('DELETE FROM trusted_devices WHERE token_hash = $1', [tokenHash]).catch(() => {})

  const res = await query(
    `INSERT INTO trusted_devices (user_id, token_hash, device_name, ip_address, user_agent, expires_at, last_used_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     RETURNING id, user_id, device_name, ip_address, user_agent, expires_at, last_used_at, created_at`,
    [uid, tokenHash, name, ip, ua, expiresAt],
  )
  return res.rows[0] ?? null
}

export async function verifyAndTouchTrustedDevice({ userId, token, ipAddress, userAgent }) {
  const uid = Number(userId)
  const t = typeof token === 'string' ? token.trim() : ''
  if (!Number.isFinite(uid) || uid <= 0 || !t) return null
  const tokenHash = hashDeviceToken(t)

  const row = await get(
    `SELECT id, user_id, device_name, ip_address, user_agent, expires_at, last_used_at, created_at
     FROM trusted_devices
     WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()`,
    [uid, tokenHash],
  )
  if (!row) return null

  const ip = typeof ipAddress === 'string' && ipAddress.trim() ? ipAddress.trim().slice(0, 128) : row.ip_address
  const ua = typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim().slice(0, 512) : row.user_agent

  await query(
    `UPDATE trusted_devices
     SET last_used_at = now(), ip_address = $1, user_agent = $2
     WHERE id = $3`,
    [ip, ua, row.id],
  ).catch(() => {})

  return row
}

export async function listTrustedDevices(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return []
  return all(
    `SELECT id, device_name, ip_address, user_agent, expires_at, last_used_at, created_at
     FROM trusted_devices
     WHERE user_id = $1 AND expires_at > now()
     ORDER BY last_used_at DESC`,
    [uid],
  )
}

export async function deleteTrustedDevice(userId, deviceId) {
  const uid = Number(userId)
  const did = Number(deviceId)
  if (!Number.isFinite(uid) || !Number.isFinite(did)) return { ok: false }
  await query('DELETE FROM trusted_devices WHERE user_id = $1 AND id = $2', [uid, did])
  return { ok: true }
}

export async function deleteAllTrustedDevices(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) return { ok: false }
  await query('DELETE FROM trusted_devices WHERE user_id = $1', [uid])
  return { ok: true }
}


function normalizeDiscordLinkCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}


// Refresh the cached provider profile on every social login, but never overwrite an avatar
// or display name the user set themselves - only values still owned by that provider's CDN.
async function refreshLinkedProfile(client, user, { displayName, avatarUrl, avatarPattern }) {
  const currentAvatar = String(user?.avatar_url ?? '')
  const avatarIsProviderOwned = !currentAvatar || avatarPattern.test(currentAvatar)
  const nextAvatar = avatarUrl && avatarIsProviderOwned && avatarUrl !== currentAvatar ? avatarUrl : null
  const nextDisplayName = displayName && !String(user?.display_name ?? '').trim() ? displayName : null
  if (!nextAvatar && !nextDisplayName) return user

  const updated = await client.query(
    `UPDATE users
     SET avatar_url = COALESCE($2, avatar_url),
         display_name = COALESCE($3, display_name)
     WHERE id = $1
     RETURNING id, email, username, role, is_banned, display_name, avatar_url`,
    [user.id, nextAvatar, nextDisplayName],
  )
  return updated.rows?.[0] ?? user
}


function normalizeDiscordUserId(raw) {
  const id = String(raw ?? '').trim()
  if (!/^\d{5,32}$/.test(id)) throw new Error('invalid_discord_user')
  return id
}


function getDiscordLinkCodeTtlMinutes() {
  const value = Number(process.env.DISCORD_LINK_CODE_TTL_MINUTES)
  if (!Number.isFinite(value) || value < 1 || value > 1440) return 10
  return Math.trunc(value)
}


function hashDiscordLinkCode(code) {
  const normalized = normalizeDiscordLinkCode(code)
  const pepper = String(process.env.DISCORD_LINK_CODE_PEPPER || '')
  return crypto.createHash('sha256').update(`${pepper}:${normalized}`).digest('hex')
}


function generateDiscordLinkCode() {
  return crypto
    .randomBytes(8)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10)
}


function normalizeDiscordUsername(raw) {
  const base = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
  return base || 'discord-user'
}


async function buildUniqueDiscordUsername({ discordUserId, username, displayName }) {
  const baseRaw = normalizeDiscordUsername(username || displayName || `discord-${discordUserId}`)
  const suffix = String(discordUserId || '').slice(-6) || crypto.randomBytes(3).toString('hex')
  const candidates = [
    baseRaw.length >= 6 ? baseRaw : `${baseRaw}-${suffix}`,
    `${baseRaw}-${suffix}`,
    `discord-${suffix}`,
    `discord-${crypto.randomBytes(5).toString('hex')}`,
  ].map((x) => x.slice(0, 40))

  for (const candidate of candidates) {
    if (candidate.length < 6) continue
    const existing = await get('SELECT id FROM users WHERE username = $1', [candidate])
    if (!existing) return candidate
  }

  return `discord-${crypto.randomBytes(8).toString('hex')}`.slice(0, 40)
}


export async function getDiscordLinkForUser(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  return get(
    `SELECT user_id, discord_user_id, discord_username, linked_at, updated_at
     FROM discord_account_links
     WHERE user_id = $1`,
    [uid],
  )
}


export async function createDiscordLinkCode(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')

  const code = generateDiscordLinkCode()
  const codeHash = hashDiscordLinkCode(code)
  const ttlMinutes = getDiscordLinkCodeTtlMinutes()
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM discord_link_codes
       WHERE user_id = $1
         AND (claimed_at IS NOT NULL OR expires_at < now())`,
      [uid],
    )
    await client.query(
      `DELETE FROM discord_link_codes
       WHERE user_id = $1
         AND claimed_at IS NULL`,
      [uid],
    )
    await client.query(
      `INSERT INTO discord_link_codes (code_hash, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [codeHash, uid, expiresAt],
    )
    await client.query('COMMIT')
    return { code, expires_at: expiresAt.toISOString(), ttl_minutes: ttlMinutes }
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


export async function unlinkDiscordForUser(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  await query('DELETE FROM discord_link_codes WHERE user_id = $1', [uid])
  const res = await query('DELETE FROM discord_account_links WHERE user_id = $1', [uid])
  return { deleted: Number(res.rowCount ?? 0) }
}


export async function unlinkDiscordByDiscordUserId(discordUserId) {
  const did = normalizeDiscordUserId(discordUserId)
  const res = await query('DELETE FROM discord_account_links WHERE discord_user_id = $1', [did])
  return { deleted: Number(res.rowCount ?? 0) }
}


export async function getDiscordLinkedUserByDiscordId(discordUserId) {
  const did = normalizeDiscordUserId(discordUserId)
  return get(
    `SELECT
       l.user_id,
       l.discord_user_id,
       l.discord_username,
       l.linked_at,
       l.updated_at,
       u.email,
       u.username,
       u.display_name,
       u.role,
       u.avatar_url,
       u.is_banned,
       COALESCE(w.balance, 0) AS balance
     FROM discord_account_links l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE l.discord_user_id = $1`,
    [did],
  )
}


export async function claimDiscordLinkCode({ code, discordUserId, discordUsername }) {
  const normalizedCode = normalizeDiscordLinkCode(code)
  if (normalizedCode.length < 6 || normalizedCode.length > 24) throw new Error('invalid_code')
  const did = normalizeDiscordUserId(discordUserId)
  const name = String(discordUsername ?? '').trim().slice(0, 120) || null
  const codeHash = hashDiscordLinkCode(normalizedCode)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const codeRes = await client.query(
      `SELECT code_hash, user_id, expires_at, claimed_at
       FROM discord_link_codes
       WHERE code_hash = $1
       FOR UPDATE`,
      [codeHash],
    )
    const row = codeRes.rows?.[0]
    if (!row || row.claimed_at || new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK')
      throw new Error('invalid_or_expired_code')
    }

    const userRes = await client.query('SELECT id, is_banned FROM users WHERE id = $1 FOR UPDATE', [row.user_id])
    const user = userRes.rows?.[0]
    if (!user || Boolean(user.is_banned)) {
      await client.query('ROLLBACK')
      throw new Error('user_not_available')
    }

    const existingDiscord = await client.query(
      `SELECT user_id
       FROM discord_account_links
       WHERE discord_user_id = $1
       FOR UPDATE`,
      [did],
    )
    const existingUserId = existingDiscord.rows?.[0]?.user_id
    if (existingUserId != null && Number(existingUserId) !== Number(row.user_id)) {
      await client.query('ROLLBACK')
      throw new Error('discord_already_linked')
    }

    await client.query(
      `INSERT INTO discord_account_links (user_id, discord_user_id, discord_username, linked_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         discord_user_id = EXCLUDED.discord_user_id,
         discord_username = EXCLUDED.discord_username,
         updated_at = now()`,
      [row.user_id, did, name],
    )
    await client.query(
      `UPDATE discord_link_codes
       SET claimed_at = now(), claimed_discord_user_id = $2
       WHERE code_hash = $1`,
      [codeHash, did],
    )

    await client.query('COMMIT')
    return getDiscordLinkedUserByDiscordId(did)
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


export async function findOrCreateUserFromDiscord({
  discordUserId,
  discordUsername,
  discordGlobalName,
  email,
  emailVerified,
  avatarUrl,
} = {}) {
  const did = normalizeDiscordUserId(discordUserId)
  const username = String(discordUsername ?? '').trim().slice(0, 120) || null
  const globalName = String(discordGlobalName ?? '').trim().slice(0, 120) || null
  const displayName = globalName || username || `Discord ${did.slice(-6)}`
  const verifiedEmail = emailVerified && typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? email.trim().toLowerCase()
    : null
  const safeAvatarUrl = typeof avatarUrl === 'string' && (/^https:\/\/cdn\.discordapp\.com\//.test(avatarUrl) || /^https:\/\/cdn\.discordapp\.net\//.test(avatarUrl))
    ? avatarUrl
    : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existingLink = await client.query(
      `SELECT
         u.id AS id,
         l.user_id,
         u.email,
         u.username,
         u.role,
         u.is_banned,
         u.display_name,
         u.avatar_url
       FROM discord_account_links l
       JOIN users u ON u.id = l.user_id
       WHERE l.discord_user_id = $1
       FOR UPDATE`,
      [did],
    )
    if (existingLink.rows?.[0]) {
      const linked = existingLink.rows[0]
      if (Boolean(linked.is_banned)) throw new Error('banned')
      await client.query(
        `UPDATE discord_account_links
         SET discord_username = $2, updated_at = now()
         WHERE discord_user_id = $1`,
        [did, username || globalName],
      )
      const refreshed = await refreshLinkedProfile(client, linked, {
        displayName,
        avatarUrl: safeAvatarUrl,
        avatarPattern: /^https:\/\/cdn\.discordapp\.(com|net)\//,
      })
      await client.query('COMMIT')
      return refreshed
    }

    let user = null
    if (verifiedEmail) {
      const userByEmail = await client.query(
        `SELECT id, email, username, role, is_banned, display_name, avatar_url
         FROM users
         WHERE email = $1
         FOR UPDATE`,
        [verifiedEmail],
      )
      user = userByEmail.rows?.[0] ?? null
      if (user && Boolean(user.is_banned)) throw new Error('banned')
    }

    if (!user) {
      const countRes = await client.query('SELECT COUNT(*)::int AS c FROM users')
      const isFirst = Number(countRes.rows?.[0]?.c ?? 0) === 0
      const role = isFirst ? 'owner' : 'user'
      const userEmail = verifiedEmail || `discord-${did}@discord.local`
      const userName = await buildUniqueDiscordUsername({ discordUserId: did, username, displayName })
      const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'))

      const created = await client.query(
        `INSERT INTO users (email, password_hash, role, username, display_name, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, username, role, is_banned, display_name, avatar_url`,
        [userEmail, passwordHash, role, userName, displayName, safeAvatarUrl],
      )
      user = created.rows[0]
      await client.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING', [user.id])
    }

    const existingUserLink = await client.query(
      `SELECT discord_user_id
       FROM discord_account_links
       WHERE user_id = $1
       FOR UPDATE`,
      [user.id],
    )
    const linkedDiscordId = existingUserLink.rows?.[0]?.discord_user_id
    if (linkedDiscordId != null && String(linkedDiscordId) !== did) {
      throw new Error('user_already_linked')
    }

    await client.query(
      `INSERT INTO discord_account_links (user_id, discord_user_id, discord_username, linked_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         discord_user_id = EXCLUDED.discord_user_id,
         discord_username = EXCLUDED.discord_username,
         updated_at = now()`,
      [user.id, did, username || globalName],
    )

    await client.query('COMMIT')
    return user
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


function normalizeGoogleUserId(raw) {
  const id = String(raw ?? '').trim()
  if (!/^[A-Za-z0-9_-]{5,64}$/.test(id)) throw new Error('invalid_google_user')
  return id
}


function normalizeGoogleUsername(raw) {
  const base = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
  return base || 'google-user'
}


async function buildUniqueGoogleUsername({ googleUserId, email, displayName }) {
  const emailLocal = String(email ?? '').split('@')[0]
  const baseRaw = normalizeGoogleUsername(emailLocal || displayName || `google-${googleUserId}`)
  const suffix = String(googleUserId || '').slice(-6) || crypto.randomBytes(3).toString('hex')
  const candidates = [
    baseRaw.length >= 6 ? baseRaw : `${baseRaw}-${suffix}`,
    `${baseRaw}-${suffix}`,
    `google-${suffix}`,
    `google-${crypto.randomBytes(5).toString('hex')}`,
  ].map((x) => x.slice(0, 40))

  for (const candidate of candidates) {
    if (candidate.length < 6) continue
    const existing = await get('SELECT id FROM users WHERE username = $1', [candidate])
    if (!existing) return candidate
  }

  return `google-${crypto.randomBytes(8).toString('hex')}`.slice(0, 40)
}


export async function getGoogleLinkForUser(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  return get(
    `SELECT user_id, google_user_id, google_email, linked_at, updated_at
     FROM google_account_links
     WHERE user_id = $1`,
    [uid],
  )
}


export async function findOrCreateUserFromGoogle({
  googleUserId,
  email,
  emailVerified,
  displayName,
  avatarUrl,
} = {}) {
  const gid = normalizeGoogleUserId(googleUserId)
  const verifiedEmail = emailVerified && typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? email.trim().toLowerCase()
    : null
  const name = String(displayName ?? '').trim().slice(0, 120)
  const finalDisplayName = name || (verifiedEmail ? verifiedEmail.split('@')[0] : `Google ${gid.slice(-6)}`)
  const safeAvatarUrl = typeof avatarUrl === 'string' && /^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|google\.com)\//.test(avatarUrl)
    ? avatarUrl
    : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existingLink = await client.query(
      `SELECT
         u.id AS id,
         l.user_id,
         u.email,
         u.username,
         u.role,
         u.is_banned,
         u.display_name,
         u.avatar_url
       FROM google_account_links l
       JOIN users u ON u.id = l.user_id
       WHERE l.google_user_id = $1
       FOR UPDATE`,
      [gid],
    )
    if (existingLink.rows?.[0]) {
      const linked = existingLink.rows[0]
      if (Boolean(linked.is_banned)) throw new Error('banned')
      await client.query(
        `UPDATE google_account_links
         SET google_email = $2, updated_at = now()
         WHERE google_user_id = $1`,
        [gid, verifiedEmail],
      )
      const refreshed = await refreshLinkedProfile(client, linked, {
        displayName: finalDisplayName,
        avatarUrl: safeAvatarUrl,
        avatarPattern: /^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|google\.com)\//,
      })
      await client.query('COMMIT')
      return refreshed
    }

    let user = null
    if (verifiedEmail) {
      const userByEmail = await client.query(
        `SELECT id, email, username, role, is_banned, display_name, avatar_url
         FROM users
         WHERE email = $1
         FOR UPDATE`,
        [verifiedEmail],
      )
      user = userByEmail.rows?.[0] ?? null
      if (user && Boolean(user.is_banned)) throw new Error('banned')
    }

    if (!user) {
      const countRes = await client.query('SELECT COUNT(*)::int AS c FROM users')
      const isFirst = Number(countRes.rows?.[0]?.c ?? 0) === 0
      const role = isFirst ? 'owner' : 'user'
      const userEmail = verifiedEmail || `google-${gid}@google.local`
      const userName = await buildUniqueGoogleUsername({ googleUserId: gid, email: verifiedEmail, displayName: finalDisplayName })
      const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'))

      const created = await client.query(
        `INSERT INTO users (email, password_hash, role, username, display_name, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, username, role, is_banned, display_name, avatar_url`,
        [userEmail, passwordHash, role, userName, finalDisplayName, safeAvatarUrl],
      )
      user = created.rows[0]
      await client.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING', [user.id])
    }

    const existingUserLink = await client.query(
      `SELECT google_user_id
       FROM google_account_links
       WHERE user_id = $1
       FOR UPDATE`,
      [user.id],
    )
    const linkedGoogleId = existingUserLink.rows?.[0]?.google_user_id
    if (linkedGoogleId != null && String(linkedGoogleId) !== gid) {
      throw new Error('user_already_linked')
    }

    await client.query(
      `INSERT INTO google_account_links (user_id, google_user_id, google_email, linked_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         google_user_id = EXCLUDED.google_user_id,
         google_email = EXCLUDED.google_email,
         updated_at = now()`,
      [user.id, gid, verifiedEmail],
    )

    await client.query('COMMIT')
    return user
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
