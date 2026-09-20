import { all, get, pool, query } from './pool.js'
import { sendPushToUser } from './support.js'

function positiveInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

// ── Back-in-Stock Subscriptions ──

export async function subscribeBackInStock({ userId, productId, productOptionId, notifyInbox = true, notifyPush = true }) {
  const uid = positiveInt(userId)
  const pid = positiveInt(productId)
  if (!uid || !pid) throw new Error('invalid_params')
  const optId = productOptionId ? String(productOptionId).trim() : null

  const res = await query(
    `INSERT INTO back_in_stock_subscriptions (user_id, product_id, product_option_id, notify_inbox, notify_push)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, product_id, COALESCE(product_option_id, ''))
     DO UPDATE SET notify_inbox = $4, notify_push = $5, created_at = now()
     RETURNING id, created_at`,
    [uid, pid, optId, Boolean(notifyInbox), Boolean(notifyPush)],
  )
  return res.rows[0]
}

export async function unsubscribeBackInStock({ userId, productId, productOptionId }) {
  const uid = positiveInt(userId)
  const pid = positiveInt(productId)
  if (!uid || !pid) throw new Error('invalid_params')
  const optId = productOptionId ? String(productOptionId).trim() : null

  await query(
    `DELETE FROM back_in_stock_subscriptions
     WHERE user_id = $1 AND product_id = $2 AND COALESCE(product_option_id, '') = COALESCE($3, '')`,
    [uid, pid, optId],
  )
}

export async function getBackInStockSubscription({ userId, productId, productOptionId }) {
  const uid = positiveInt(userId)
  const pid = positiveInt(productId)
  if (!uid || !pid) return null
  const optId = productOptionId ? String(productOptionId).trim() : null

  return get(
    `SELECT id, notify_inbox, notify_push, created_at
     FROM back_in_stock_subscriptions
     WHERE user_id = $1 AND product_id = $2 AND COALESCE(product_option_id, '') = COALESCE($3, '')`,
    [uid, pid, optId],
  )
}

export async function listMyBackInStockSubscriptions(userId) {
  const uid = positiveInt(userId)
  if (!uid) return []
  return all(
    `SELECT bis.id, bis.product_id, bis.product_option_id, bis.created_at,
            p.name AS product_name, p.slug AS product_slug, p.image_url AS product_image_url,
            p.stock AS product_stock, p.price AS product_price
     FROM back_in_stock_subscriptions bis
     JOIN products p ON p.id = bis.product_id
     WHERE bis.user_id = $1
     ORDER BY bis.created_at DESC`,
    [uid],
  )
}

export async function processBackInStockAlerts(productId, productOptionId) {
  const pid = positiveInt(productId)
  if (!pid) return { notified: 0 }
  const optId = productOptionId ? String(productOptionId).trim() : null

  const subs = await all(
    `SELECT bis.id, bis.user_id, bis.notify_inbox, bis.notify_push
     FROM back_in_stock_subscriptions bis
     WHERE bis.product_id = $1 AND COALESCE(bis.product_option_id, '') = COALESCE($2, '')`,
    [pid, optId],
  )
  if (subs.length === 0) return { notified: 0 }

  const product = await get('SELECT id, name, slug, image_url FROM products WHERE id = $1', [pid])
  if (!product) return { notified: 0 }

  let notified = 0
  const subIds = []

  for (const sub of subs) {
    try {
      if (sub.notify_inbox) {
        await query(
          `INSERT INTO site_messages (sender_id, target_type, target_user_id, title, body)
           VALUES (NULL, 'individual', $1, $2, $3)`,
          [
            sub.user_id,
            `สินค้ากลับมาแล้ว: ${product.name}`,
            `สินค้า "${product.name}" ที่คุณติดตามกลับมามีสต็อกแล้ว! รีบสั่งซื้อก่อนหมดอีกครั้ง`,
          ],
        )
      }
      if (sub.notify_push) {
        await sendPushToUser(sub.user_id, {
          title: 'สินค้ากลับมาแล้ว!',
          body: `${product.name} มีสต็อกพร้อมขายอีกครั้ง`,
          url: `/p/${product.slug || product.id}`,
        }).catch(() => {})
      }
      notified++
      subIds.push(sub.id)
    } catch {
      // continue on individual failures
    }
  }

  if (subIds.length > 0) {
    await query(
      `DELETE FROM back_in_stock_subscriptions WHERE id = ANY($1::bigint[])`,
      [subIds],
    )
  }

  return { notified }
}

export async function getBackInStockSubscriberCount(productId) {
  const pid = positiveInt(productId)
  if (!pid) return 0
  const row = await get(
    `SELECT COUNT(*)::int AS count FROM back_in_stock_subscriptions WHERE product_id = $1`,
    [pid],
  )
  return row?.count || 0
}


// ── Pre-Order Queue ──

export async function createPreorder({ userId, productId, productOptionId, qty, unitPricePoints }) {
  const uid = positiveInt(userId)
  const pid = positiveInt(productId)
  if (!uid || !pid) throw new Error('invalid_params')
  const optId = productOptionId ? String(productOptionId).trim() : null
  const q = Math.max(1, Math.min(10, Math.trunc(Number(qty) || 1)))
  const unitPrice = Math.max(0, Math.trunc(Number(unitPricePoints) || 0))
  const totalReserved = unitPrice * q

  const existing = await get(
    `SELECT id FROM preorder_queue
     WHERE user_id = $1 AND product_id = $2 AND COALESCE(product_option_id, '') = COALESCE($3, '') AND status = 'waiting'`,
    [uid, pid, optId],
  )
  if (existing) throw new Error('preorder_exists')

  const wallet = await get('SELECT balance FROM wallets WHERE user_id = $1', [uid])
  const balance = Number(wallet?.balance ?? 0)
  if (balance < totalReserved) throw new Error('insufficient_points')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE user_id = $2`,
      [totalReserved, uid],
    )

    await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id, description)
       VALUES ($1, 'debit', $2, 'preorder', $3, $4)`,
      [uid, totalReserved, pid, `สั่งจองล่วงหน้า: จองพ้อยท์ ${totalReserved}`],
    )

    const posRow = await client.query(
      `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next_pos
       FROM preorder_queue
       WHERE product_id = $1 AND COALESCE(product_option_id, '') = COALESCE($2, '') AND status = 'waiting'`,
      [pid, optId],
    )
    const nextPos = posRow.rows[0]?.next_pos || 1

    const res = await client.query(
      `INSERT INTO preorder_queue (user_id, product_id, product_option_id, qty, unit_price_points, total_reserved_points, queue_position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, queue_position, created_at`,
      [uid, pid, optId, q, unitPrice, totalReserved, nextPos],
    )

    await client.query('COMMIT')
    return res.rows[0]
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function cancelPreorder({ userId, preorderId }) {
  const uid = positiveInt(userId)
  const poid = positiveInt(preorderId)
  if (!uid || !poid) throw new Error('invalid_params')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const row = await client.query(
      `SELECT id, total_reserved_points, product_id FROM preorder_queue WHERE id = $1 AND user_id = $2 AND status = 'waiting'`,
      [poid, uid],
    ).then((r) => r.rows[0])
    if (!row) throw new Error('not_found')

    await client.query(
      `UPDATE preorder_queue SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`,
      [poid],
    )

    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`,
      [row.total_reserved_points, uid],
    )

    await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id, description)
       VALUES ($1, 'credit', $2, 'preorder_refund', $3, $4)`,
      [uid, row.total_reserved_points, row.product_id, `ยกเลิกจองล่วงหน้า: คืนพ้อยท์ ${row.total_reserved_points}`],
    )

    await client.query('COMMIT')
    return { refunded: row.total_reserved_points }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function getMyPreorder({ userId, productId, productOptionId }) {
  const uid = positiveInt(userId)
  const pid = positiveInt(productId)
  if (!uid || !pid) return null
  const optId = productOptionId ? String(productOptionId).trim() : null

  return get(
    `SELECT id, qty, unit_price_points, total_reserved_points, queue_position, status, created_at
     FROM preorder_queue
     WHERE user_id = $1 AND product_id = $2 AND COALESCE(product_option_id, '') = COALESCE($3, '') AND status = 'waiting'`,
    [uid, pid, optId],
  )
}

export async function getPreorderQueueInfo(productId, productOptionId) {
  const pid = positiveInt(productId)
  if (!pid) return { total_waiting: 0, total_qty: 0 }
  const optId = productOptionId ? String(productOptionId).trim() : null

  const row = await get(
    `SELECT COUNT(*)::int AS total_waiting, COALESCE(SUM(qty), 0)::int AS total_qty
     FROM preorder_queue
     WHERE product_id = $1 AND COALESCE(product_option_id, '') = COALESCE($2, '') AND status = 'waiting'`,
    [pid, optId],
  )
  return { total_waiting: row?.total_waiting || 0, total_qty: row?.total_qty || 0 }
}

export async function fulfillPreorders(productId, productOptionId) {
  const pid = positiveInt(productId)
  if (!pid) return { fulfilled: 0 }
  const optId = productOptionId ? String(productOptionId).trim() : null

  const waitingOrders = await all(
    `SELECT pq.id, pq.user_id, pq.qty, pq.unit_price_points, pq.total_reserved_points, pq.product_option_id
     FROM preorder_queue pq
     WHERE pq.product_id = $1 AND COALESCE(pq.product_option_id, '') = COALESCE($2, '') AND pq.status = 'waiting'
     ORDER BY pq.queue_position ASC`,
    [pid, optId],
  )
  if (waitingOrders.length === 0) return { fulfilled: 0 }

  const product = await get('SELECT id, name, slug, price, is_unlimited_stock FROM products WHERE id = $1', [pid])
  if (!product) return { fulfilled: 0 }

  let fulfilled = 0

  for (const preorder of waitingOrders) {
    const availableStock = await get(
      `SELECT COUNT(*)::int AS available
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings posb ON posb.pool_id = spi.pool_id
       WHERE posb.product_id = $1 AND COALESCE(posb.product_option_id, '') = COALESCE($2, '')
         AND spi.status = 'available'`,
      [pid, optId],
    )
    const available = product.is_unlimited_stock ? 999 : (availableStock?.available || 0)
    if (available < preorder.qty) break

    try {
      await query(
        `UPDATE preorder_queue SET status = 'ready', updated_at = now() WHERE id = $1`,
        [preorder.id],
      )

      await query(
        `INSERT INTO site_messages (sender_id, target_type, target_user_id, title, body)
         VALUES (NULL, 'individual', $1, $2, $3)`,
        [
          preorder.user_id,
          `พรีออเดอร์พร้อมส่ง: ${product.name}`,
          `สินค้า "${product.name}" ที่คุณจองไว้พร้อมส่งมอบแล้ว! ระบบจะดำเนินการส่งมอบให้อัตโนมัติ กรุณาตรวจสอบที่กล่องรับของ`,
        ],
      )

      await sendPushToUser(preorder.user_id, {
        title: 'พรีออเดอร์พร้อมส่ง!',
        body: `${product.name} พร้อมส่งมอบให้คุณแล้ว`,
        url: '/inbox',
      }).catch(() => {})

      fulfilled++
    } catch {
      // continue
    }
  }

  return { fulfilled }
}

export async function listMyPreorders(userId) {
  const uid = positiveInt(userId)
  if (!uid) return []
  return all(
    `SELECT pq.id, pq.product_id, pq.product_option_id, pq.qty,
            pq.unit_price_points, pq.total_reserved_points,
            pq.queue_position, pq.status, pq.created_at,
            p.name AS product_name, p.slug AS product_slug, p.image_url AS product_image_url
     FROM preorder_queue pq
     JOIN products p ON p.id = pq.product_id
     WHERE pq.user_id = $1
     ORDER BY pq.created_at DESC
     LIMIT 50`,
    [uid],
  )
}
