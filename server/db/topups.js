import { normalizeTopupSettings } from '../lib/topupSettings.js'
import { all, get, pool, query } from './pool.js'

export async function getWallet(userId) {
  return get('SELECT user_id, balance, updated_at FROM wallets WHERE user_id = $1', [userId])
}


export async function createTopup({
  userId,
  amountPoints,
  method,
  provider,
  providerRef,
  reference,
  status,
}) {
  const result = await query(
    `INSERT INTO topups (user_id, amount, amount_points, method, provider, provider_ref, reference, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     RETURNING id`,
    [
      userId,
      amountPoints,
      amountPoints,
      method ?? null,
      provider ?? null,
      providerRef ?? null,
      reference ?? null,
      status,
    ],
  )
  return result.rows[0].id
}


export async function listTopups({ limit = 50, offset = 0, providerRef = '', status = '' } = {}) {
  const ref = String(providerRef ?? '').trim().slice(0, 120)
  const statusFilter = String(status ?? '').trim().slice(0, 40)
  if (ref) {
    return all(
      `SELECT t.*, u.email, u.username, u.display_name
       FROM topups t
       JOIN users u ON u.id = t.user_id
       WHERE t.provider_ref ILIKE $1
       ORDER BY t.id DESC
       LIMIT $2 OFFSET $3`,
      [`%${ref}%`, limit, offset],
    )
  }

  if (statusFilter) {
    return all(
      `SELECT t.*, u.email, u.username, u.display_name
       FROM topups t
       JOIN users u ON u.id = t.user_id
       WHERE t.status = $1
       ORDER BY t.id DESC
       LIMIT $2 OFFSET $3`,
      [statusFilter, limit, offset],
    )
  }

  return all(
    `SELECT t.*, u.email, u.username, u.display_name
     FROM topups t
     JOIN users u ON u.id = t.user_id
     ORDER BY t.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}


export async function listTopupLogs({ limit = 200, offset = 0, search = '', providerRef = '' } = {}) {
  const userQuery = String(search ?? '').trim().slice(0, 120)
  const ref = String(providerRef ?? '').trim().slice(0, 120)
  const where = []
  const params = []

  if (userQuery) {
    params.push(`%${userQuery}%`)
    where.push(`(u.email ILIKE $${params.length} OR u.username ILIKE $${params.length})`)
  }
  if (ref) {
    params.push(`%${ref}%`)
    where.push(`t.provider_ref ILIKE $${params.length}`)
  }

  params.push(limit)
  const limitParam = params.length
  params.push(offset)
  const offsetParam = params.length

  return all(
    `SELECT t.*, u.email, u.username
     FROM topups t
     JOIN users u ON u.id = t.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.id DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params,
  )
}


export async function getTopupById(id) {
  return get('SELECT * FROM topups WHERE id = $1', [id])
}


export async function getTopupByProviderRef({ provider, providerRef }) {
  const p = String(provider ?? '').trim()
  const ref = String(providerRef ?? '').trim()
  if (!p || !ref) return null
  return get('SELECT * FROM topups WHERE provider = $1 AND provider_ref = $2', [p, ref])
}


export async function updateTopupProviderRef({ topupId, providerRef }) {
  const tid = Number(topupId)
  const ref = String(providerRef ?? '').trim()
  if (!Number.isFinite(tid)) throw new Error('invalid_id')
  if (!ref) throw new Error('invalid_provider_ref')
  await query(
    `UPDATE topups
     SET provider_ref = $2, updated_at = now()
     WHERE id = $1`,
    [tid, ref],
  )
}


export async function attachTopupSlipEvidence({ topupId, slipImageUrl, slipAmount } = {}) {
  const tid = Number(topupId)
  if (!Number.isFinite(tid) || tid <= 0) throw new Error('invalid_topup_id')
  const amount = Number(slipAmount)
  await query(
    `UPDATE topups
     SET slip_image_url = COALESCE($2, slip_image_url),
         slip_amount = COALESCE($3, slip_amount),
         updated_at = now()
     WHERE id = $1`,
    [tid, slipImageUrl || null, Number.isFinite(amount) ? amount : null],
  )
  return { ok: true }
}


export async function updateTopupStatus({ topupId, status, onlyFromStatus } = {}) {
  const tid = Number(topupId)
  const nextStatus = String(status ?? '').trim()
  const currentStatus = onlyFromStatus == null ? null : String(onlyFromStatus).trim()

  if (!Number.isFinite(tid) || tid <= 0) throw new Error('invalid_topup_id')
  if (!nextStatus) throw new Error('invalid_topup_status')

  if (currentStatus) {
    const result = await query(
      `UPDATE topups
       SET status = $2, updated_at = now()
       WHERE id = $1 AND status = $3`,
      [tid, nextStatus, currentStatus],
    )
    return { updated: Number(result?.rowCount ?? 0) }
  }

  const result = await query(
    `UPDATE topups
     SET status = $2, updated_at = now()
     WHERE id = $1`,
    [tid, nextStatus],
  )
  return { updated: Number(result?.rowCount ?? 0) }
}


export async function logWebhookEvent({ provider, eventId, payload }) {
  try {
    const res = await query(
      `INSERT INTO webhook_logs (provider, event_id, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      [provider, eventId, payload],
    )
    return { inserted: res.rowCount === 1 }
  } catch (e) {
    throw e
  }
}


export async function markWebhookProcessed({ provider, eventId }) {
  await query(
    `UPDATE webhook_logs
     SET processed_at = now()
     WHERE provider = $1 AND event_id = $2`,
    [provider, eventId],
  )
}


export async function creditPointsForTopup({ topupId, approvedBy, refType, refId }) {
  const tid = Number(topupId)
  if (!Number.isFinite(tid) || tid <= 0) throw new Error('invalid_topup_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const topupRes = await client.query('SELECT * FROM topups WHERE id = $1 FOR UPDATE', [tid])
    const topup = topupRes.rows?.[0]
    if (!topup) throw new Error('topup_not_found')

    if (String(topup.status || '') === 'paid') {
      await client.query('ROLLBACK')
      return { credited: false, reason: 'already_paid' }
    }

    const points = Number(topup.amount_points ?? topup.amount)
    if (!Number.isFinite(points) || points <= 0) throw new Error('invalid_points')

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, $3, $4)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [topup.user_id, points, refType, refId],
    )

    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return { credited: false, reason: 'duplicate' }
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [topup.user_id],
    )

    await client.query(
      `UPDATE wallets
       SET balance = balance + $1, updated_at = now()
       WHERE user_id = $2`,
      [points, topup.user_id],
    )

    await client.query(
      `UPDATE topups
       SET status = 'paid', approved_by = COALESCE(approved_by, $1), updated_at = now()
       WHERE id = $2`,
      [approvedBy ?? null, tid],
    )

    await client.query('COMMIT')
    return { credited: true }
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


export async function listMyTransactions(userId, { limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT id, type, points, ref_type, ref_id, created_at
     FROM transactions
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
}


export async function listMyTopups(userId, { limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT id, amount, amount_points, method, provider, provider_ref, reference, status, created_at, updated_at
     FROM topups
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
}


export async function cancelPendingTopupsByMethod({
  userId,
  method,
  provider,
  fromStatus = 'pending_slip',
  toStatus = 'replaced',
} = {}) {
  const uid = Number(userId)
  const m = String(method ?? '').trim()
  const p = String(provider ?? '').trim()
  const from = String(fromStatus ?? '').trim()
  const to = String(toStatus ?? '').trim()

  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!m || !p) throw new Error('invalid_topup_method')
  if (!from || !to) throw new Error('invalid_topup_status')

  const result = await query(
    `UPDATE topups
     SET status = $5, updated_at = now()
     WHERE user_id = $1
       AND method = $2
       AND provider = $3
       AND status = $4`,
    [uid, m, p, from, to],
  )

  return { updated: Number(result?.rowCount ?? 0) }
}


export async function listWebhookLogs({ limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT id, provider, event_id, received_at, processed_at
     FROM webhook_logs
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}


export async function listAllTransactions({ limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT t.id, t.user_id, u.email, t.type, t.points, t.ref_type, t.ref_id, t.created_at
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     ORDER BY t.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}


export async function adminCancelTopup({ topupId }) {
  const tid = Number(topupId)
  if (!Number.isFinite(tid)) throw new Error('invalid_id')

  const topup = await get('SELECT * FROM topups WHERE id = $1', [tid])
  if (!topup) throw new Error('topup_not_found')
  if (topup.status === 'paid') throw new Error('already_paid')
  if (topup.status === 'cancelled' || topup.status === 'canceled') return { ok: true, status: 'cancelled' }

  await query(
    `UPDATE topups
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1`,
    [tid],
  )
  return { ok: true, status: 'cancelled' }
}


export async function setTopupPointsForApproval({ topupId, points }) {
  const tid = Number(topupId)
  const p = Number(points)
  if (!Number.isFinite(tid)) throw new Error('invalid_id')
  if (!Number.isFinite(p) || p <= 0) throw new Error('invalid_points')

  await query(
    `UPDATE topups
     SET amount = $2,
         amount_points = $2,
         updated_at = now()
     WHERE id = $1`,
    [tid, p],
  )
}

