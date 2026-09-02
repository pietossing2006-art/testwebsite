import { all, get, pool, query } from '../pool.js'
import { sendPushToUser } from '../support.js'
import { maskPayload } from './purchase.js'


export async function adminListBoosterFarmRequests({ limit = 200, offset = 0, status, assignedTo } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const a = assignedTo == null || assignedTo === '' ? null : Number(assignedTo)
  if (a != null && !Number.isFinite(a)) throw new Error('invalid_assigned_to')

  const where = [`fr.assigned_booster_id IS NOT NULL`]
  const params = []
  if (st) {
    params.push(st)
    where.push(`fr.status = $${params.length}`)
  }
  if (a != null) {
    params.push(a)
    where.push(`fr.assigned_booster_id = $${params.length}`)
  }
  params.push(lim)
  params.push(off)
  const w = `WHERE ${where.join(' AND ')}`

  return all(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled,
            fr.assigned_booster_id,
            ab.email AS assigned_booster_email
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     ${w}
     ORDER BY fr.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
}


export async function adminListAvailableBoosterFarmRequests({ limit = 200, offset = 0 } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  return all(
    `SELECT fr.id, fr.status, fr.created_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     WHERE fr.status = 'pending'
       AND fr.assigned_booster_id IS NULL
     ORDER BY fr.id ASC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}


export async function adminStartFarmRequest({ id, staffId }) {
  const rid = Number(id)
  const sid = Number(staffId) || null
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const row = await get(
    `UPDATE farm_requests
     SET status = 'in_progress',
         started_at = COALESCE(started_at, now()),
         assigned_booster_id = CASE WHEN assigned_booster_id IS NULL AND $2::bigint IS NOT NULL THEN $2::bigint ELSE assigned_booster_id END,
         assigned_at = CASE WHEN assigned_booster_id IS NULL AND $2::bigint IS NOT NULL THEN now() ELSE assigned_at END
     WHERE id = $1
       AND status = 'pending'
     RETURNING id, status, started_at, assigned_booster_id`,
    [rid, sid],
  )
  if (!row) throw new Error('not_pending')
  return row
}


export async function adminCancelFarmRequest({ id, note }) {
  const rid = Number(id)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const cancelNote = String(note ?? '').trim()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT fr.id, fr.delivery_id, fr.user_id, fr.order_id, fr.order_item_id, fr.status
       FROM farm_requests fr
       WHERE fr.id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }

    const currentStatus = String(r.status)
    if (currentStatus === 'fulfilled') {
      await client.query('ROLLBACK')
      throw new Error('already_fulfilled')
    }

    if (currentStatus === 'cancelled' || currentStatus === 'canceled') {
      await client.query(
        `UPDATE farm_requests
         SET cancel_note = COALESCE(NULLIF($2, ''), cancel_note), cancelled_at = COALESCE(cancelled_at, now())
         WHERE id = $1`,
        [rid, cancelNote],
      )
      await client.query('COMMIT')
      return { ok: true, refunded: false }
    }

    if (!['pending', 'in_progress'].includes(currentStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const oiRes = await client.query(
      `SELECT qty, unit_price_points
       FROM order_items
       WHERE id = $1`,
      [r.order_item_id],
    )
    const oi = oiRes.rows?.[0]
    const qty = Number(oi?.qty ?? 0)
    const unit = Number(oi?.unit_price_points ?? 0)
    const refund = qty * unit
    if (!Number.isFinite(refund) || refund <= 0) {
      await client.query('ROLLBACK')
      throw new Error('invalid_refund')
    }

    const refType = 'farm_cancel'
    const refId = `farm:${rid}`
    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, $3, $4)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [r.user_id, refund, refType, refId],
    )
    const applied = txRes.rowCount > 0
    if (applied) {
      await client.query(
        `UPDATE wallets
         SET balance = balance + $1, updated_at = now()
         WHERE user_id = $2`,
        [refund, r.user_id],
      )
    }

    await client.query(
      `UPDATE deliveries
       SET status = 'cancelled', payload_masked = $2, payload = NULL
       WHERE id = $1`,
      [r.delivery_id, cancelNote || 'ยกเลิก'],
    )

    await client.query(
      `UPDATE orders
       SET status = 'cancelled'
       WHERE id = $1`,
      [r.order_id],
    )

    await client.query(
      `UPDATE farm_requests
       SET status = 'cancelled', cancel_note = $2, cancelled_at = now()
       WHERE id = $1`,
      [rid, cancelNote || null],
    )

    await client.query('COMMIT')
    return { ok: true, refunded: applied, points: refund }
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


export async function adminListFarmRequests({ limit = 200, offset = 0, status, assignedTo, search, scope, staffUserId } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const staffId = staffUserId == null || staffUserId === '' ? null : Number(staffUserId)

  const scopeRaw = typeof scope === 'string' ? scope.trim().toLowerCase() : ''
  const queueScope = scopeRaw || 'all'

  const assignedRaw = typeof assignedTo === 'string' ? assignedTo.trim().toLowerCase() : assignedTo
  const unassignedOnly = assignedRaw === 'unassigned'
  const mineOnly = assignedRaw === 'me'
  const a = unassignedOnly || mineOnly || assignedTo == null || assignedTo === '' ? null : Number(assignedTo)

  const q = typeof search === 'string' ? search.trim() : ''

  const where = []
  const params = []

  if (st) {
    params.push(st)
    where.push(`fr.status = $${params.length}`)
  }

  if (queueScope === 'mine') {
    if (Number.isFinite(staffId) && staffId > 0) {
      params.push(staffId)
      where.push(`fr.assigned_booster_id = $${params.length}`)
    }
    if (!st) where.push(`fr.status IN ('pending', 'in_progress')`)
  } else if (queueScope === 'unassigned') {
    where.push(`fr.assigned_booster_id IS NULL`)
    if (!st) where.push(`fr.status = 'pending'`)
  } else if (queueScope === 'in_progress') {
    where.push(`fr.status = 'in_progress'`)
  }

  if (unassignedOnly) {
    where.push('fr.assigned_booster_id IS NULL')
  } else if (mineOnly) {
    if (Number.isFinite(staffId) && staffId > 0) {
      params.push(staffId)
      where.push(`fr.assigned_booster_id = $${params.length}`)
    }
  } else if (a != null && Number.isFinite(a)) {
    params.push(a)
    where.push(`fr.assigned_booster_id = $${params.length}`)
  }

  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`)
    where.push(`(u.email ILIKE $${params.length} OR p.name ILIKE $${params.length} OR CAST(fr.id AS TEXT) ILIKE $${params.length} OR CAST(fr.order_id AS TEXT) ILIKE $${params.length})`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const baseParams = [...params]
  const listParams = [...baseParams, lim, off]

  const [items, summaryRow] = await Promise.all([
    all(
      `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
              fr.cancel_note, fr.cancelled_at,
              fr.uid, fr.uid_confirmed,
              fr.delivery_id, fr.order_id, fr.order_item_id,
              COALESCE(oi.qty, 1) AS order_qty,
              u.email, u.email AS user_email,
              u.username AS user_username,
              COALESCE(u.display_name, u.username) AS user_display_name,
              p.name AS product_name,
              p.fulfillment_type,
              fr.assigned_booster_id,
              ab.email AS assigned_booster_email,
              ab.username AS assigned_username,
              COALESCE(ab.display_name, ab.username, ab.email) AS assigned_display_name
       FROM farm_requests fr
       LEFT JOIN order_items oi ON oi.id = fr.order_item_id
       JOIN users u ON u.id = fr.user_id
       JOIN products p ON p.id = fr.product_id
       LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
       ${whereSql}
       ORDER BY fr.id DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    ),
    get(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
         COUNT(*) FILTER (WHERE status = 'fulfilled')::int AS fulfilled_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
         COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND assigned_booster_id IS NULL)::int AS unassigned_count,
         COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND assigned_booster_id = $1)::int AS mine_count,
         COUNT(*) FILTER (WHERE status = 'pending' AND assigned_booster_id IS NULL AND created_at <= now() - interval '30 minutes')::int AS over_sla_count
       FROM farm_requests`,
      [Number.isFinite(staffId) && staffId > 0 ? Math.trunc(staffId) : -1],
    ),
  ])

  return {
    items,
    total: Number(summaryRow?.total || 0),
    summary: {
      pending: Number(summaryRow?.pending_count || 0),
      in_progress: Number(summaryRow?.in_progress_count || 0),
      fulfilled: Number(summaryRow?.fulfilled_count || 0),
      cancelled: Number(summaryRow?.cancelled_count || 0),
      unassigned: Number(summaryRow?.unassigned_count || 0),
      mine: Number(summaryRow?.mine_count || 0),
      over_sla: Number(summaryRow?.over_sla_count || 0),
    },
  }
}


export async function adminGetFarmRequestDetail(requestId) {
  const rid = Number(requestId)
  if (!Number.isFinite(rid) || rid <= 0) throw new Error('invalid_request_id')

  const request = await get(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id, fr.product_option,
            COALESCE(oi.qty, 1) AS order_qty,
            oi.unit_price_points,
            u.id AS user_id, u.email, u.email AS user_email,
            u.username AS user_username,
            COALESCE(u.display_name, u.username) AS user_display_name,
            p.id AS product_id, p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled,
            fr.assigned_booster_id,
            ab.email AS assigned_booster_email,
            ab.username AS assigned_username,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_display_name,
            d.status AS delivery_status, d.payload_masked
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     LEFT JOIN deliveries d ON d.id = fr.delivery_id
     WHERE fr.id = $1`,
    [rid],
  )
  if (!request) throw new Error('not_found')

  const logs = await all(
    `SELECT bal.id, bal.booster_id, bal.action, bal.meta, bal.created_at,
            bu.email AS booster_email, bu.display_name AS booster_display_name
     FROM booster_action_logs bal
     LEFT JOIN users bu ON bu.id = bal.booster_id
     WHERE bal.farm_request_id = $1
     ORDER BY bal.id ASC`,
    [rid],
  )

  return { request, logs }
}


export async function adminFulfillFarmRequest({ id, payload }) {
  const rid = Number(id)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const finalPayload = String(payload ?? '').trim()
  if (!finalPayload) throw new Error('invalid_payload')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const rRes = await client.query(
      `SELECT id, delivery_id, status
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (!['pending', 'in_progress'].includes(String(r.status))) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const masked = maskPayload(finalPayload)
    await client.query(
      `UPDATE deliveries
       SET status = 'pending_claim', payload_masked = $2, payload = $3
       WHERE id = $1`,
      [r.delivery_id, masked, finalPayload],
    )

    await client.query(
      `UPDATE farm_requests
       SET status = 'fulfilled', fulfilled_at = now()
       WHERE id = $1`,
      [rid],
    )

    const delivRow = await client.query(
      `SELECT user_id FROM deliveries WHERE id = $1 LIMIT 1`,
      [r.delivery_id],
    )
    const delivUserId = delivRow.rows?.[0]?.user_id || null

    await client.query('COMMIT')

    if (delivUserId) {
      sendPushToUser(delivUserId, {
        title: '✅ สินค้าของคุณพร้อมแล้ว!',
        body: 'เข้าไปที่กล่องรับของเพื่อรับสินค้าของคุณ',
        link: '/inbox',
        tag: `delivery-ready-${r.delivery_id}`,
        require_interaction: true,
      }).catch(() => {})
    }

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


export async function adminAddFarmRequestNote({ id, staffId, note }) {
  const rid = Number(id)
  const sid = Number(staffId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(sid)) throw new Error('invalid_staff_id')
  const content = String(note ?? '').trim()
  if (!content) throw new Error('invalid_note')

  const res = await query(
    `INSERT INTO booster_action_logs (booster_id, farm_request_id, action, meta)
     VALUES ($1, $2, 'note', $3)
     RETURNING id, booster_id, farm_request_id, action, meta, created_at`,
    [sid, rid, JSON.stringify({ note: content })],
  )
  return res.rows?.[0] || null
}
