import { all, pool } from '../pool.js'
import { logBoosterAction } from '../support.js'
import { adminFulfillFarmRequest } from './fulfillment.js'


export async function boosterListMyFarmRequests({ boosterId, limit = 200, offset = 0, status } = {}) {
  const bid = Number(boosterId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null

  if (st) {
    return all(
      `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
              fr.cancel_note, fr.cancelled_at,
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
       WHERE fr.assigned_booster_id = $1
         AND fr.status = $2
       ORDER BY fr.id DESC
       LIMIT $3 OFFSET $4`,
      [bid, st, lim, off],
    )
  }

  return all(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
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
     WHERE fr.assigned_booster_id = $1
     ORDER BY fr.id DESC
     LIMIT $2 OFFSET $3`,
    [bid, lim, off],
  )
}


export async function boosterListAvailableFarmRequests({ limit = 200, offset = 0 } = {}) {
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


export async function boosterClaimFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const up = await client.query(
      `UPDATE farm_requests
       SET assigned_booster_id = $2,
           assigned_at = now()
       WHERE id = $1
         AND status = 'pending'
         AND assigned_booster_id IS NULL
       RETURNING id`,
      [rid, bid],
    )

    if (up.rowCount < 1) {
      const rRes = await client.query('SELECT id, status, assigned_booster_id FROM farm_requests WHERE id = $1', [rid])
      const r = rRes.rows?.[0]
      await client.query('ROLLBACK')
      if (!r) throw new Error('not_found')
      if (r.assigned_booster_id != null) throw new Error('already_claimed')
      throw new Error('locked')
    }

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'claim', meta: null })
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


export async function boosterCancelFarmRequest({ id, boosterId, note }) {
  const rid = Number(id)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')
  const cancelNote = String(note ?? '').trim()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT fr.id, fr.delivery_id, fr.user_id, fr.order_id, fr.order_item_id, fr.status, fr.assigned_booster_id
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
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
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
      await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'cancel', meta: { refunded: false } })
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

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'cancel', meta: { refunded: applied, points: refund, reason: cancelNote || null } })
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


export async function boosterReleaseFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id, started_at
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
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }
    const st = String(r.status)
    if (st === 'fulfilled' || st === 'cancelled' || st === 'canceled') {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }
    if (r.started_at) {
      await client.query('ROLLBACK')
      throw new Error('already_started')
    }

    await client.query(
      `UPDATE farm_requests
       SET assigned_booster_id = NULL,
           assigned_at = NULL
       WHERE id = $1`,
      [rid],
    )

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'release', meta: null })
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


export async function queueReleaseExpiredBoosterClaims({ slaSeconds = 300, limit = 50 } = {}) {
  const sla = Number(slaSeconds)
  const lim = Number(limit)
  if (!Number.isFinite(sla) || sla <= 0) throw new Error('invalid_sla_seconds')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const cutoffRes = await client.query(`SELECT now() - ($1::text || ' seconds')::interval AS cutoff`, [sla])
    const cutoff = cutoffRes.rows?.[0]?.cutoff

    const candRes = await client.query(
      `SELECT id, assigned_booster_id
       FROM farm_requests
       WHERE status = 'pending'
         AND assigned_booster_id IS NOT NULL
         AND started_at IS NULL
         AND assigned_at IS NOT NULL
         AND assigned_at < $1
       ORDER BY assigned_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [cutoff, lim],
    )

    const rows = Array.isArray(candRes.rows) ? candRes.rows : []
    if (rows.length < 1) {
      await client.query('COMMIT')
      return { ok: true, released: 0 }
    }

    for (const r of rows) {
      const rid = Number(r.id)
      const prevBoosterId = Number(r.assigned_booster_id)
      if (!Number.isFinite(rid) || !Number.isFinite(prevBoosterId)) continue

      await client.query(
        `UPDATE farm_requests
         SET assigned_booster_id = NULL,
             assigned_at = NULL
         WHERE id = $1`,
        [rid],
      )

      await logBoosterAction(client, {
        boosterId: prevBoosterId,
        requestId: rid,
        action: 'sla_release',
        meta: { sla_seconds: sla },
      })
    }

    await client.query('COMMIT')
    return { ok: true, released: rows.length }
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


export async function boosterStartFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id, started_at
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
    if (r.assigned_booster_id == null) {
      // auto-assign to this booster
      await client.query(
        `UPDATE farm_requests SET assigned_booster_id = $2, assigned_at = now() WHERE id = $1`,
        [rid, bid],
      )
    } else if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }

    const currentStatus = String(r.status)
    if (currentStatus === 'fulfilled' || currentStatus === 'cancelled' || currentStatus === 'canceled') {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    await client.query(
      `UPDATE farm_requests
       SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
           started_at = COALESCE(started_at, now())
       WHERE id = $1`,
      [rid],
    )

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'start', meta: null })
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


export async function boosterFulfillFarmRequest({ requestId, boosterId, payload }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id
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
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }

    if (String(r.status) === 'pending') {
      await client.query(
        `UPDATE farm_requests
         SET status = 'in_progress', started_at = COALESCE(started_at, now())
         WHERE id = $1`,
        [rid],
      )
      await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'start', meta: { implicit: true } })
    }

    await client.query('COMMIT')
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

  await adminFulfillFarmRequest({ id: rid, payload })

  const client2 = await pool.connect()
  try {
    await client2.query('BEGIN')
    await logBoosterAction(client2, { boosterId: bid, requestId: rid, action: 'fulfill', meta: null })
    await client2.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client2.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client2.release()
  }
}
