import { all, get, pool } from '../pool.js'


export async function listMyOrders(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  return all(
    `SELECT o.id, o.ref, o.total_points, o.status, o.created_at,
            oi.product_id, p.name AS product_name, p.image_url AS product_image_url,
            c.name AS category_name,
            oi.qty, oi.unit_price_points, oi.product_option
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE o.user_id = $1
     ORDER BY o.id DESC
     LIMIT $2 OFFSET $3`,
    [uid, limit, offset],
  )
}


export async function getMyOrderDetail(userId, orderId) {
  const uid = Number(userId)
  const oid = Number(orderId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(oid) || oid <= 0) throw new Error('invalid_order_id')

  const order = await get(
    `SELECT o.id, o.ref, o.total_points, o.status, o.created_at,
            oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
            p.id AS product_id, p.name AS product_name, p.image_url AS product_image_url,
            p.fulfillment_type,
            c.name AS category_name
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE o.id = $1 AND o.user_id = $2
     LIMIT 1`,
    [oid, uid],
  )
  if (!order) throw new Error('not_found')

  const deliveries = await all(
    `SELECT d.id, d.status, d.payload_masked, d.delivery_kind,
            CASE WHEN d.status = 'claimed' THEN d.payload ELSE NULL END AS payload,
            d.created_at, d.claimed_at,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), p.name) AS delivery_name,
            fr.id AS farm_request_id,
            fr.status AS farm_status,
            fr.created_at AS farm_created_at,
            fr.assigned_at AS farm_assigned_at,
            fr.started_at AS farm_started_at,
            fr.fulfilled_at AS farm_fulfilled_at,
            fr.cancelled_at AS farm_cancelled_at,
            fr.cancel_note AS farm_cancel_note,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     WHERE d.order_id = $1 AND d.user_id = $2
     ORDER BY d.id ASC`,
    [oid, uid],
  )

  return { order, deliveries }
}


export async function adminListOrders({ limit = 100, offset = 0, status, search, fulfillmentType } = {}) {
  const lim = Math.min(Math.max(1, Number(limit) || 100), 500)
  const off = Math.max(0, Number(offset) || 0)
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const ft = typeof fulfillmentType === 'string' && fulfillmentType.trim() ? fulfillmentType.trim() : null
  const q = typeof search === 'string' ? search.trim() : ''

  const where = []
  const params = []

  if (st) { params.push(st); where.push(`o.status = $${params.length}`) }
  if (ft) { params.push(ft); where.push(`p.fulfillment_type = $${params.length}`) }
  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`)
    where.push(`(u.email ILIKE $${params.length} OR p.name ILIKE $${params.length} OR o.ref ILIKE $${params.length} OR CAST(o.id AS TEXT) ILIKE $${params.length})`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countParams = [...params]
  params.push(lim); params.push(off)

  const [items, countRow] = await Promise.all([
    all(
      `SELECT o.id, o.ref, o.status, o.total_points, o.created_at,
              u.id AS user_id, u.email AS user_email, u.username AS user_username,
              COALESCE(u.display_name, u.username) AS user_display_name,
              oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
              p.id AS product_id, p.name AS product_name, p.image_url AS product_image_url, p.fulfillment_type,
              c.name AS category_name,
              d.id AS delivery_id, d.status AS delivery_status, d.claimed_at,
              fr.id AS farm_request_id, fr.status AS farm_status,
              fr.assigned_at, fr.started_at, fr.fulfilled_at,
              COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       JOIN users u ON u.id = o.user_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
       LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
       ${whereSql}
       ORDER BY o.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    get(
      `SELECT COUNT(DISTINCT o.id)::int AS total,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'pending')::int AS pending_count,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed')::int AS completed_count,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_count,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'pending_claim')::int AS pending_claim_count,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'claimed')::int AS claimed_count,
              COUNT(DISTINCT fr.id) FILTER (WHERE fr.status = 'pending')::int AS fr_pending_count,
              COUNT(DISTINCT fr.id) FILTER (WHERE fr.status = 'in_progress')::int AS fr_in_progress_count
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       JOIN users u ON u.id = o.user_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
       ${whereSql}`,
      countParams,
    ),
  ])

  return {
    items,
    total: Number(countRow?.total || 0),
    summary: {
      pending: Number(countRow?.pending_count || 0),
      completed: Number(countRow?.completed_count || 0),
      cancelled: Number(countRow?.cancelled_count || 0),
      pending_claim: Number(countRow?.pending_claim_count || 0),
      claimed: Number(countRow?.claimed_count || 0),
      fr_pending: Number(countRow?.fr_pending_count || 0),
      fr_in_progress: Number(countRow?.fr_in_progress_count || 0),
    },
  }
}


export async function adminGetOrderDetail(orderId) {
  const oid = Number(orderId)
  if (!Number.isFinite(oid) || oid <= 0) throw new Error('invalid_order_id')

  const order = await get(
    `SELECT o.id, o.ref, o.status, o.total_points, o.created_at,
            u.id AS user_id, u.email AS user_email,
            COALESCE(u.display_name, u.username) AS user_display_name,
            oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
            p.id AS product_id, p.name AS product_name, p.fulfillment_type, p.image_url AS product_image_url,
            c.name AS category_name
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1 LIMIT 1`,
    [oid],
  )
  if (!order) throw new Error('not_found')

  const deliveries = await all(
    `SELECT d.id, d.status, d.payload_masked, d.delivery_kind, d.created_at, d.claimed_at,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), p.name) AS delivery_name,
            fr.id AS farm_request_id, fr.status AS farm_status,
            fr.created_at AS farm_created_at, fr.assigned_at, fr.started_at,
            fr.fulfilled_at, fr.cancelled_at, fr.cancel_note,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name,
            ab.id AS assigned_staff_id
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     WHERE d.order_id = $1
     ORDER BY d.id ASC`,
    [oid],
  )

  return { order, deliveries }
}


export async function adminListUserOrders(userId, { limit = 50, offset = 0, search } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_id')
  const params = [uid, limit, offset]
  let searchClause = ''
  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`)
    searchClause = ` AND (LOWER(COALESCE(o.ref,'')) LIKE $4 OR LOWER(p.name) LIKE $4)`
  }
  return all(
    `SELECT o.id AS order_id,
            o.ref,
            o.total_points,
            o.status,
            o.created_at,
            oi.id AS order_item_id,
            oi.product_id,
            p.name AS product_name,
            p.image_url AS product_image_url,
            p.fulfillment_type,
            oi.qty,
            oi.unit_price_points,
            oi.product_option
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = $1${searchClause}
     ORDER BY o.id DESC, oi.id ASC
     LIMIT $2 OFFSET $3`,
    params,
  )
}


export async function adminSearchOrderByRef(ref) {
  const r = String(ref ?? '').trim().toLowerCase()
  if (!r) return null
  return get(
    `SELECT o.id AS order_id,
            o.ref,
            o.user_id,
            o.total_points,
            o.status,
            o.created_at,
            u.username,
            u.email,
            u.display_name,
            u.avatar_url
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE LOWER(o.ref) = $1`,
    [r],
  )
}


export async function listMyInbox(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  return all(
    `SELECT d.id, d.order_id, d.product_id,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), NULLIF(TRIM(mbp.prize_name), ''), p.name) AS product_name,
            p.fulfillment_type,
            d.delivery_kind,
            fr.status AS farm_status,
            fr.cancel_note AS farm_cancel_note,
            d.status,
            d.payload_masked,
            CASE WHEN d.status = 'claimed' THEN d.payload ELSE NULL END AS payload,
            d.created_at, d.claimed_at,
            oi.product_option
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN order_items oi ON oi.id = d.order_item_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN mystery_box_stock_items msi ON msi.id = d.mystery_stock_item_id
     LEFT JOIN mystery_box_prizes mbp ON mbp.id = msi.prize_id
     WHERE d.user_id = $1
     ORDER BY d.id DESC
     LIMIT $2 OFFSET $3`,
    [uid, limit, offset],
  )
}


export async function claimInboxItem({ userId, deliveryId }) {
  const uid = Number(userId)
  const did = Number(deliveryId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(did)) throw new Error('invalid_delivery_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const dRes = await client.query(
      `SELECT id, user_id, stock_item_id, stock_pool_item_id, mystery_stock_item_id, status, payload
       FROM deliveries
       WHERE id = $1
       FOR UPDATE`,
      [did],
    )
    const d = dRes.rows?.[0]
    if (!d) {
      await client.query('ROLLBACK')
      throw new Error('delivery_not_found')
    }
    if (Number(d.user_id) !== uid) {
      await client.query('ROLLBACK')
      throw new Error('forbidden')
    }
    if (String(d.status) !== 'pending_claim') {
      await client.query('ROLLBACK')
      throw new Error('already_claimed')
    }

    await client.query(
      `UPDATE deliveries
       SET status = 'claimed', claimed_at = now()
       WHERE id = $1`,
      [did],
    )

    if (d.stock_pool_item_id) {
      await client.query(
        `UPDATE stock_pool_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.stock_pool_item_id],
      )
    } else if (d.stock_item_id) {
      await client.query(
        `UPDATE digital_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.stock_item_id],
      )
    }

    if (d.mystery_stock_item_id) {
      await client.query(
        `UPDATE mystery_box_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.mystery_stock_item_id],
      )
    }

    await client.query('COMMIT')
    return { ok: true, payload: String(d.payload ?? '') }
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


export async function claimAllInboxItems({ userId }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const dRes = await client.query(
      `SELECT id, user_id, stock_item_id, stock_pool_item_id, mystery_stock_item_id, status, payload
       FROM deliveries
       WHERE user_id = $1 AND status = 'pending_claim'
       FOR UPDATE`,
      [uid],
    )
    const deliveries = dRes.rows || []
    if (deliveries.length === 0) {
      await client.query('COMMIT')
      return { ok: true, count: 0, items: [] }
    }

    const deliveryIds = deliveries.map((d) => d.id)
    await client.query(
      `UPDATE deliveries
       SET status = 'claimed', claimed_at = now()
       WHERE id = ANY($1::bigint[])`,
      [deliveryIds],
    )

    const poolItemIds = deliveries.map((d) => d.stock_pool_item_id).filter(Boolean)
    if (poolItemIds.length > 0) {
      await client.query(
        `UPDATE stock_pool_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = ANY($1::bigint[])`,
        [poolItemIds],
      )
    }

    const stockItemIds = deliveries.map((d) => d.stock_item_id).filter(Boolean)
    if (stockItemIds.length > 0) {
      await client.query(
        `UPDATE digital_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = ANY($1::bigint[])`,
        [stockItemIds],
      )
    }

    const mysteryItemIds = deliveries.map((d) => d.mystery_stock_item_id).filter(Boolean)
    if (mysteryItemIds.length > 0) {
      await client.query(
        `UPDATE mystery_box_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = ANY($1::bigint[])`,
        [mysteryItemIds],
      )
    }

    await client.query('COMMIT')
    return {
      ok: true,
      count: deliveries.length,
      items: deliveries.map((d) => ({ id: d.id, payload: String(d.payload ?? '') })),
    }
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
