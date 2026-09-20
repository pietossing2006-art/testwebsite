import { all, get, pool, query } from './pool.js'
import { listActiveProductOptionItemsByProductIds } from './catalog.js'
import { maskPayload } from './orders.js'

function normalizeStockPoolKind(kind) {
  const k = String(kind ?? '').trim().toLowerCase()
  if (k === 'quantity') return 'quantity'
  return 'digital_code'
}


export async function adminCreateStockPool({ name, kind, quantityRemaining, isActive }) {
  const n = String(name ?? '').trim()
  if (!n) throw new Error('invalid_name')
  const k = normalizeStockPoolKind(kind)
  const qty = quantityRemaining == null || quantityRemaining === '' ? null : Number(quantityRemaining)
  if (k === 'quantity' && (!Number.isFinite(qty) || qty < 0)) throw new Error('invalid_quantity')
  const res = await query(
    `INSERT INTO stock_pools (name, kind, quantity_remaining, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [n, k, k === 'quantity' ? qty : null, isActive === undefined ? true : Boolean(isActive)],
  )
  return res.rows[0].id
}


export async function adminListStockPools({ limit = 200, offset = 0, isActive } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const active = isActive === undefined ? null : Boolean(isActive)
  const where = active == null ? '' : 'WHERE is_active = $3'
  const params = active == null ? [lim, off] : [lim, off, active]
  return all(
    `SELECT id, name, kind, quantity_remaining, is_active, created_at, updated_at
     FROM stock_pools
     ${where}
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    params,
  )
}


export async function adminUpdateStockPool({ id, name, kind, quantityRemaining, isActive }) {
  const pid = Number(id)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  const existing = await get('SELECT id, kind FROM stock_pools WHERE id = $1', [pid])
  if (!existing) throw new Error('not_found')
  const nextName = name == null ? null : String(name).trim()
  const nextKind = kind == null ? null : normalizeStockPoolKind(kind)
  const effectiveKind = nextKind ?? String(existing.kind)
  const qty = quantityRemaining == null || quantityRemaining === '' ? null : Number(quantityRemaining)
  if (quantityRemaining != null && effectiveKind === 'quantity' && (!Number.isFinite(qty) || qty < 0)) throw new Error('invalid_quantity')

  await query(
    `UPDATE stock_pools
     SET name = COALESCE($2, name),
         kind = COALESCE($3, kind),
         quantity_remaining = CASE
            WHEN COALESCE($3, kind) = 'quantity' THEN COALESCE($4, quantity_remaining)
            ELSE NULL
         END,
         is_active = COALESCE($5, is_active),
         updated_at = now()
     WHERE id = $1`,
    [pid, nextName && nextName.length ? nextName : null, nextKind, qty, isActive == null ? null : Boolean(isActive)],
  )
  return get('SELECT id, name, kind, quantity_remaining, is_active, created_at, updated_at FROM stock_pools WHERE id = $1', [pid])
}


export async function adminDeleteStockPool({ id }) {
  const pid = Number(id)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  const res = await query('DELETE FROM stock_pools WHERE id = $1', [pid])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}


export async function adminAddStockPoolItems({ poolId, items, allowDuplicates = false }) {
  const pid = Number(poolId)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  const poolRow = await get('SELECT id, kind FROM stock_pools WHERE id = $1', [pid])
  if (!poolRow) throw new Error('not_found')
  if (String(poolRow.kind) !== 'digital_code') throw new Error('invalid_kind')

  const rawLines = (items || [])
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 0)
  if (rawLines.length === 0) {
    return { inserted: 0, duplicates_in_batch: 0, duplicates_in_db: 0, duplicate_samples: [] }
  }

  const uniqueBatchLines = []
  const seenInBatch = new Set()
  let duplicatesInBatch = 0
  const duplicateSamples = []

  for (const line of rawLines) {
    if (seenInBatch.has(line)) {
      duplicatesInBatch += 1
      if (duplicateSamples.length < 5) duplicateSamples.push(line)
    } else {
      seenInBatch.add(line)
      uniqueBatchLines.push(line)
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let linesToInsert = uniqueBatchLines
    let duplicatesInDb = 0

    if (!allowDuplicates && uniqueBatchLines.length > 0) {
      const existingRes = await client.query(
        `SELECT payload FROM stock_pool_items WHERE pool_id = $1 AND payload = ANY($2::text[])`,
        [pid, uniqueBatchLines],
      )
      const existingSet = new Set(existingRes.rows.map((r) => String(r.payload).trim()))

      linesToInsert = []
      for (const line of uniqueBatchLines) {
        if (existingSet.has(line)) {
          duplicatesInDb += 1
          if (duplicateSamples.length < 10) duplicateSamples.push(line)
        } else {
          linesToInsert.push(line)
        }
      }
    }

    for (const payload of linesToInsert) {
      await client.query('INSERT INTO stock_pool_items (pool_id, payload, status) VALUES ($1, $2, $3)', [pid, payload, 'available'])
    }
    await client.query('COMMIT')
    return {
      inserted: linesToInsert.length,
      duplicates_in_batch: duplicatesInBatch,
      duplicates_in_db: duplicatesInDb,
      duplicate_samples: duplicateSamples,
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


export async function adminGetStockPoolSummary(poolId) {
  const pid = Number(poolId)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  const poolRow = await get('SELECT id, kind, quantity_remaining FROM stock_pools WHERE id = $1', [pid])
  if (!poolRow) throw new Error('not_found')
  const kind = String(poolRow.kind)
  if (kind === 'quantity') {
    return { kind, quantity_remaining: Number(poolRow.quantity_remaining ?? 0) }
  }
  const rows = await all(
    `SELECT status, COUNT(*)::int AS c
     FROM stock_pool_items
     WHERE pool_id = $1
     GROUP BY status
     ORDER BY status ASC`,
    [pid],
  )
  const summary = { kind, available: 0, reserved: 0, delivered: 0, disabled: 0 }
  for (const r of rows) summary[String(r.status)] = Number(r.c) || 0
  return summary
}


export async function adminListStockPoolItems(poolId, { limit = 200, offset = 0, status } = {}) {
  const pid = Number(poolId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  if (st) {
    return all(
      `SELECT id, pool_id, payload, status, created_at, reserved_at, delivered_at
       FROM stock_pool_items
       WHERE pool_id = $1 AND status = $2
       ORDER BY id DESC
       LIMIT $3 OFFSET $4`,
      [pid, st, lim, off],
    )
  }
  return all(
    `SELECT id, pool_id, payload, status, created_at, reserved_at, delivered_at
     FROM stock_pool_items
     WHERE pool_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [pid, lim, off],
  )
}


export async function adminUpdateStockPoolItem({ id, payload, status }) {
  const sid = Number(id)
  if (!Number.isFinite(sid)) throw new Error('invalid_stock_item_id')
  const nextPayload = payload == null ? null : String(payload)
  const nextStatus = status == null ? null : String(status)
  if (nextStatus != null && !['available', 'disabled'].includes(nextStatus)) throw new Error('invalid_status')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const curRes = await client.query('SELECT id, pool_id, status FROM stock_pool_items WHERE id = $1 FOR UPDATE', [sid])
    const cur = curRes.rows?.[0]
    if (!cur) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    const curStatus = String(cur.status)
    if (!['available', 'disabled'].includes(curStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    if (nextPayload != null) {
      await client.query('UPDATE stock_pool_items SET payload = $2 WHERE id = $1', [sid, nextPayload])
    }
    if (nextStatus != null) {
      await client.query('UPDATE stock_pool_items SET status = $2 WHERE id = $1', [sid, nextStatus])
    }

    await client.query('COMMIT')
    return get('SELECT id, pool_id, payload, status, created_at, reserved_at, delivered_at FROM stock_pool_items WHERE id = $1', [sid])
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


export async function adminDeleteStockPoolItem({ id }) {
  const sid = Number(id)
  if (!Number.isFinite(sid)) throw new Error('invalid_stock_item_id')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const curRes = await client.query('SELECT id, pool_id, status FROM stock_pool_items WHERE id = $1 FOR UPDATE', [sid])
    const cur = curRes.rows?.[0]
    if (!cur) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    const curStatus = String(cur.status)
    if (!['available', 'disabled'].includes(curStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }
    const poolId = Number(cur.pool_id)
    await client.query('DELETE FROM stock_pool_items WHERE id = $1', [sid])
    const prodRow = await client.query(
      `SELECT product_id FROM product_option_stock_bindings WHERE pool_id = $1 LIMIT 1`,
      [poolId],
    )
    const prodId = prodRow.rows?.[0]?.product_id
    if (prodId) await recountProductStockFromPools(client, prodId)
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


export async function adminSetProductOptionStockBinding({ productId, productOptionId, poolId }) {
  const pid = Number(productId)
  const pool = Number(poolId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  if (!Number.isFinite(pool)) throw new Error('invalid_pool_id')

  const optionId = productOptionId == null || productOptionId === '' ? null : String(productOptionId)
  const p = await get('SELECT id FROM products WHERE id = $1', [pid])
  if (!p) throw new Error('product_not_found')
  const poolRow = await get('SELECT id FROM stock_pools WHERE id = $1', [pool])
  if (!poolRow) throw new Error('pool_not_found')

  if (optionId != null) {
    const found = await get(
      `SELECT option_id
       FROM product_option_items
       WHERE product_id = $1
         AND option_id = $2
         AND is_active = true
       LIMIT 1`,
      [pid, optionId],
    )
    if (!found) throw new Error('invalid_product_option')
  }

  await query(
    `INSERT INTO product_option_stock_bindings (product_id, product_option_id, pool_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_id, COALESCE(product_option_id, ''))
     DO UPDATE SET product_option_id = EXCLUDED.product_option_id, pool_id = EXCLUDED.pool_id`,
    [pid, optionId, pool],
  )
  return { ok: true }
}


export async function adminUnsetProductOptionStockBinding({ productId, productOptionId }) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  const optionId = productOptionId == null || productOptionId === '' ? null : String(productOptionId)
  const res = await query(
    `DELETE FROM product_option_stock_bindings
     WHERE product_id = $1 AND COALESCE(product_option_id, '') = COALESCE($2, '')`,
    [pid, optionId],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}


export async function adminListProductOptionStockBindings(arg = {}) {
  const pidRaw = typeof arg === 'object' && arg !== null ? arg.productId : arg
  if (pidRaw != null && pidRaw !== '') {
    const pid = Number(pidRaw)
    if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
    return all(
      `SELECT b.id, b.product_id, b.product_option_id, b.pool_id, b.created_at,
              p.name AS pool_name, p.kind AS pool_kind, p.quantity_remaining, p.is_active
       FROM product_option_stock_bindings b
       JOIN stock_pools p ON p.id = b.pool_id
       WHERE b.product_id = $1
       ORDER BY COALESCE(b.product_option_id, '') ASC`,
      [pid],
    )
  }
  return all(
    `SELECT b.id, b.product_id, b.product_option_id, b.pool_id, b.created_at,
            p.name AS pool_name, p.kind AS pool_kind, p.quantity_remaining, p.is_active
     FROM product_option_stock_bindings b
     JOIN stock_pools p ON p.id = b.pool_id
     ORDER BY b.product_id ASC, COALESCE(b.product_option_id, '') ASC`,
  )
}


export async function adminAddDigitalStock({ productId, items, allowDuplicates = false }) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  const rawLines = (items || [])
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 0)

  if (rawLines.length === 0) {
    return { inserted: 0, duplicates_in_batch: 0, duplicates_in_db: 0, duplicate_samples: [] }
  }

  // 1. Deduplicate within the submitted batch
  const uniqueBatchLines = []
  const seenInBatch = new Set()
  let duplicatesInBatch = 0
  const duplicateSamples = []

  for (const line of rawLines) {
    if (seenInBatch.has(line)) {
      duplicatesInBatch += 1
      if (duplicateSamples.length < 5) duplicateSamples.push(line)
    } else {
      seenInBatch.add(line)
      uniqueBatchLines.push(line)
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const poolId = await getOrCreateDefaultPoolTx(client, pid)

    // 2. Deduplicate against existing DB records if allowDuplicates is false
    let linesToInsert = uniqueBatchLines
    let duplicatesInDb = 0

    if (!allowDuplicates && uniqueBatchLines.length > 0) {
      const existingRes = await client.query(
        `SELECT payload FROM stock_pool_items WHERE pool_id = $1 AND payload = ANY($2::text[])`,
        [poolId, uniqueBatchLines],
      )
      const existingSet = new Set(existingRes.rows.map((r) => String(r.payload).trim()))

      linesToInsert = []
      for (const line of uniqueBatchLines) {
        if (existingSet.has(line)) {
          duplicatesInDb += 1
          if (duplicateSamples.length < 10) duplicateSamples.push(line)
        } else {
          linesToInsert.push(line)
        }
      }
    }

    // 3. Insert unique items
    for (const payload of linesToInsert) {
      await client.query(
        'INSERT INTO stock_pool_items (pool_id, payload, status) VALUES ($1, $2, $3)',
        [poolId, payload, 'available'],
      )
    }

    await recountProductStockFromPools(client, pid)
    await client.query('COMMIT')
    return {
      inserted: linesToInsert.length,
      duplicates_in_batch: duplicatesInBatch,
      duplicates_in_db: duplicatesInDb,
      duplicate_samples: duplicateSamples,
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


export async function adminListLowStockProducts() {
  const rows = await all(
    `SELECT p.id, p.name, p.slug, p.price, p.stock, p.low_stock_threshold, p.is_unlimited_stock, p.fulfillment_type,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.is_hidden = false
       AND p.is_unlimited_stock = false
       AND p.fulfillment_type = 'digital_stock'
       AND COALESCE(p.stock, 0) <= COALESCE(p.low_stock_threshold, 3)
     ORDER BY p.stock ASC, p.name ASC`,
  )
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    slug: r.slug,
    price: Number(r.price),
    stock: Number(r.stock ?? 0),
    low_stock_threshold: Number(r.low_stock_threshold ?? 3),
    category_name: r.category_name,
    is_out_of_stock: Number(r.stock ?? 0) <= 0,
  }))
}


export async function adminUpdateProductStockThreshold({ productId, threshold }) {
  const pid = Number(productId)
  const val = Math.max(0, Math.min(10000, Number(threshold) || 0))
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  const res = await query(
    `UPDATE products SET low_stock_threshold = $1 WHERE id = $2 RETURNING id, low_stock_threshold`,
    [val, pid],
  )
  if (res.rowCount === 0) throw new Error('not_found')
  return { id: pid, low_stock_threshold: val }
}


export async function adminExportDigitalStockItems(productId, { status = 'available', mask = false } = {}) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')

  let poolId = await getDefaultPoolId(pid)
  if (!poolId) {
    const bRow = await get(`SELECT pool_id FROM product_option_stock_bindings WHERE product_id = $1 LIMIT 1`, [pid])
    if (bRow?.pool_id) poolId = Number(bRow.pool_id)
  }
  if (!poolId) return []

  const params = [poolId]
  let statusClause = ''
  if (status && status !== 'all') {
    params.push(status)
    statusClause = `AND status = $2`
  }

  const rows = await all(
    `SELECT id, payload, status, created_at, reserved_at, delivered_at
     FROM stock_pool_items
     WHERE pool_id = $1 ${statusClause}
     ORDER BY id ASC`,
    params,
  )

  return rows.map((r) => ({
    id: Number(r.id),
    payload: mask ? maskPayload(r.payload) : r.payload,
    status: r.status,
    created_at: r.created_at,
    delivered_at: r.delivered_at,
  }))
}


export async function getOrCreateOptionPoolTx(client, productId, optionId) {
  const pid = Number(productId)
  const optId = optionId ? String(optionId).trim() : null
  if (!optId) {
    return getOrCreateDefaultPoolTx(client, pid)
  }

  const existing = await client.query(
    `SELECT pool_id FROM product_option_stock_bindings WHERE product_id = $1 AND product_option_id = $2 LIMIT 1`,
    [pid, optId],
  )
  if (existing.rows?.[0]?.pool_id) {
    return Number(existing.rows[0].pool_id)
  }

  const poolRes = await client.query(
    `INSERT INTO stock_pools (name, kind, is_active) VALUES ($1, 'digital_code', true) RETURNING id`,
    [`auto:product:${pid}:opt:${optId}`],
  )
  const poolId = poolRes.rows[0].id

  await client.query(
    `INSERT INTO product_option_stock_bindings (product_id, product_option_id, pool_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_id, COALESCE(product_option_id, ''))
     DO UPDATE SET pool_id = EXCLUDED.pool_id`,
    [pid, optId, poolId],
  )
  return Number(poolId)
}


export async function adminAddUnifiedStockBatch({ productId, optionId, poolId, items, allowDuplicates = false }) {
  const rawLines = (items || [])
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 0)

  if (rawLines.length === 0) {
    return { inserted: 0, duplicates_in_batch: 0, duplicates_in_db: 0, duplicate_samples: [] }
  }

  const uniqueBatchLines = []
  const seenInBatch = new Set()
  let duplicatesInBatch = 0
  const duplicateSamples = []

  for (const line of rawLines) {
    if (seenInBatch.has(line)) {
      duplicatesInBatch += 1
      if (duplicateSamples.length < 5) duplicateSamples.push(line)
    } else {
      seenInBatch.add(line)
      uniqueBatchLines.push(line)
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let effectivePoolId = poolId ? Number(poolId) : null
    let effectiveProductId = productId ? Number(productId) : null

    if (!effectivePoolId) {
      if (!Number.isFinite(effectiveProductId)) {
        await client.query('ROLLBACK')
        throw new Error('invalid_product_id')
      }
      effectivePoolId = await getOrCreateOptionPoolTx(client, effectiveProductId, optionId)
    } else {
      if (!effectiveProductId) {
        effectiveProductId = await findProductIdByPoolItemId(client, effectivePoolId)
      }
    }

    let linesToInsert = uniqueBatchLines
    let duplicatesInDb = 0

    if (!allowDuplicates && uniqueBatchLines.length > 0) {
      const existingRes = await client.query(
        `SELECT payload FROM stock_pool_items WHERE pool_id = $1 AND payload = ANY($2::text[])`,
        [effectivePoolId, uniqueBatchLines],
      )
      const existingSet = new Set(existingRes.rows.map((r) => String(r.payload).trim()))

      linesToInsert = []
      for (const line of uniqueBatchLines) {
        if (existingSet.has(line)) {
          duplicatesInDb += 1
          if (duplicateSamples.length < 10) duplicateSamples.push(line)
        } else {
          linesToInsert.push(line)
        }
      }
    }

    for (const payload of linesToInsert) {
      await client.query(
        'INSERT INTO stock_pool_items (pool_id, payload, status) VALUES ($1, $2, $3)',
        [effectivePoolId, payload, 'available'],
      )
    }

    if (effectiveProductId) {
      await recountProductStockFromPools(client, effectiveProductId)
    }

    await client.query('COMMIT')
    return {
      inserted: linesToInsert.length,
      duplicates_in_batch: duplicatesInBatch,
      duplicates_in_db: duplicatesInDb,
      duplicate_samples: duplicateSamples,
      pool_id: effectivePoolId,
      product_id: effectiveProductId,
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


export async function adminGetUnifiedStockOverview({ search = '', filter = 'all', categoryId = 'all' } = {}) {
  const productRows = await all(
    `SELECT p.id, p.name, p.slug, p.price, p.stock, p.low_stock_threshold, p.is_unlimited_stock,
            p.fulfillment_type, p.is_hidden, p.image_url, p.product_options,
            c.id AS category_id, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.id ASC`,
  )

  const bindingRows = await all(
    `SELECT b.product_id, b.product_option_id, b.pool_id,
            sp.name AS pool_name, sp.kind AS pool_kind,
            COALESCE(SUM(CASE WHEN spi.status = 'available' THEN 1 ELSE 0 END), 0)::int AS available_count,
            COALESCE(SUM(CASE WHEN spi.status = 'reserved' THEN 1 ELSE 0 END), 0)::int AS reserved_count,
            COALESCE(SUM(CASE WHEN spi.status = 'delivered' THEN 1 ELSE 0 END), 0)::int AS delivered_count
     FROM product_option_stock_bindings b
     JOIN stock_pools sp ON sp.id = b.pool_id
     LEFT JOIN stock_pool_items spi ON spi.pool_id = b.pool_id
     GROUP BY b.product_id, b.product_option_id, b.pool_id, sp.name, sp.kind`,
  )

  const bindingMap = new Map()
  for (const b of bindingRows) {
    const key = `${b.product_id}:${b.product_option_id || 'default'}`
    bindingMap.set(key, {
      pool_id: Number(b.pool_id),
      pool_name: b.pool_name,
      pool_kind: b.pool_kind,
      available_count: Number(b.available_count || 0),
      reserved_count: Number(b.reserved_count || 0),
      delivered_count: Number(b.delivered_count || 0),
    })
  }

  let totalProducts = 0
  let totalAvailableStock = 0
  let lowStockCount = 0
  let outOfStockCount = 0

  const items = []

  for (const p of productRows) {
    const pid = Number(p.id)
    const thresh = Number(p.low_stock_threshold ?? 3)
    const isUnlimited = Boolean(p.is_unlimited_stock)
    const fulfillmentType = p.fulfillment_type || 'digital_stock'

    let rawOptions = p.product_options
    if (typeof rawOptions === 'string') {
      try { rawOptions = JSON.parse(rawOptions) } catch { rawOptions = [] }
    }
    const optionsArray = Array.isArray(rawOptions) ? rawOptions : []

    const hasOptions = optionsArray.length > 0
    let productAvailableStock = 0
    let productReservedStock = 0
    let productDeliveredStock = 0

    const mappedOptions = []

    if (hasOptions) {
      for (const opt of optionsArray) {
        const optId = String(opt.id || opt.name || '')
        const optName = opt.label || opt.name || opt.id || 'Option'
        const optPrice = opt.price_override != null ? Number(opt.price_override) : (Number(p.price) + (Number(opt.price_modifier) || 0))
        const optBinding = bindingMap.get(`${pid}:${optId}`) || {
          pool_id: null,
          available_count: 0,
          reserved_count: 0,
          delivered_count: 0,
        }

        productAvailableStock += optBinding.available_count
        productReservedStock += optBinding.reserved_count
        productDeliveredStock += optBinding.delivered_count

        mappedOptions.push({
          id: optId,
          name: optName,
          price: optPrice,
          pool_id: optBinding.pool_id,
          available_count: optBinding.available_count,
          reserved_count: optBinding.reserved_count,
          delivered_count: optBinding.delivered_count,
          is_out_of_stock: !isUnlimited && optBinding.available_count <= 0,
          is_low_stock: !isUnlimited && optBinding.available_count > 0 && optBinding.available_count <= thresh,
        })
      }
    } else {
      const defaultBinding = bindingMap.get(`${pid}:default`) || {
        pool_id: null,
        available_count: Number(p.stock || 0),
        reserved_count: 0,
        delivered_count: 0,
      }
      productAvailableStock = defaultBinding.available_count
      productReservedStock = defaultBinding.reserved_count
      productDeliveredStock = defaultBinding.delivered_count
    }

    const isOut = !isUnlimited && productAvailableStock <= 0
    const isLow = !isUnlimited && productAvailableStock > 0 && productAvailableStock <= thresh

    totalProducts += 1
    if (!isUnlimited) {
      totalAvailableStock += productAvailableStock
      if (isOut) outOfStockCount += 1
      else if (isLow) lowStockCount += 1
    }

    const productObj = {
      id: pid,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      image_url: p.image_url,
      category_id: p.category_id ? Number(p.category_id) : null,
      category_name: p.category_name,
      fulfillment_type: fulfillmentType,
      is_unlimited_stock: isUnlimited,
      is_hidden: Boolean(p.is_hidden),
      low_stock_threshold: thresh,
      has_options: hasOptions,
      available_stock: productAvailableStock,
      reserved_stock: productReservedStock,
      delivered_stock: productDeliveredStock,
      is_out_of_stock: isOut,
      is_low_stock: isLow,
      options: mappedOptions,
    }

    const q = search.toLowerCase().trim()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || String(pid) === q
    const matchCategory = categoryId === 'all' || String(p.category_id) === String(categoryId)
    let matchFilter = true
    if (filter === 'low') matchFilter = isLow
    else if (filter === 'out') matchFilter = isOut
    else if (filter === 'in') matchFilter = !isOut && !isLow

    if (matchSearch && matchCategory && matchFilter) {
      items.push(productObj)
    }
  }

  return {
    products: items,
    kpi: {
      total_products: totalProducts,
      total_available_stock: totalAvailableStock,
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
    },
  }
}


export async function adminGetUnifiedStockItems({ productId, optionId, poolId, status, search = '', limit = 100, offset = 0 } = {}) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 100))
  const off = Math.max(0, Number(offset) || 0)

  let targetPoolIds = []
  if (poolId) {
    targetPoolIds = [Number(poolId)]
  } else if (productId) {
    const pid = Number(productId)
    const optId = optionId ? String(optionId).trim() : null
    if (optId) {
      const row = await get(
        `SELECT pool_id FROM product_option_stock_bindings WHERE product_id = $1 AND product_option_id = $2 LIMIT 1`,
        [pid, optId],
      )
      if (row?.pool_id) targetPoolIds = [Number(row.pool_id)]
    } else {
      const rows = await all(
        `SELECT pool_id FROM product_option_stock_bindings WHERE product_id = $1`,
        [pid],
      )
      targetPoolIds = rows.map((r) => Number(r.pool_id)).filter(Boolean)
      if (targetPoolIds.length === 0) {
        const defPoolId = await getDefaultPoolId(pid)
        if (defPoolId) targetPoolIds = [defPoolId]
      }
    }
    if (targetPoolIds.length === 0) {
      const autoPools = await all(`SELECT id FROM stock_pools WHERE name LIKE 'auto:product:' || $1 || '%'`, [pid])
      if (autoPools.length > 0) {
        targetPoolIds = autoPools.map((r) => Number(r.id)).filter(Boolean)
      }
    }
  }

  if (targetPoolIds.length === 0) {
    return { items: [], total: 0, summary: { available: 0, reserved: 0, delivered: 0, disabled: 0 } }
  }

  const whereParts = [`spi.pool_id = ANY($1::bigint[])`]
  const params = [targetPoolIds]

  if (status && status !== 'all') {
    params.push(status)
    whereParts.push(`spi.status = $${params.length}`)
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`)
    whereParts.push(`spi.payload ILIKE $${params.length}`)
  }

  const whereClause = whereParts.join(' AND ')

  const summaryRows = await all(
    `SELECT spi.status, COUNT(*)::int AS count
     FROM stock_pool_items spi
     WHERE spi.pool_id = ANY($1::bigint[])
     GROUP BY spi.status`,
    [targetPoolIds],
  )
  const summary = { available: 0, reserved: 0, delivered: 0, disabled: 0 }
  for (const r of summaryRows) {
    summary[String(r.status)] = Number(r.count || 0)
  }

  const countRow = await get(
    `SELECT COUNT(*)::int AS total FROM stock_pool_items spi WHERE ${whereClause}`,
    params,
  )
  const total = Number(countRow?.total || 0)

  params.push(lim)
  const limParam = params.length
  params.push(off)
  const offParam = params.length

  const rows = await all(
    `SELECT spi.id, spi.pool_id, spi.payload, spi.status, spi.created_at, spi.reserved_at, spi.delivered_at,
            spi.reserved_order_item_id,
            oi.order_id,
            o.user_id AS order_user_id,
            u.username AS order_username
     FROM stock_pool_items spi
     LEFT JOIN order_items oi ON oi.id = spi.reserved_order_item_id
     LEFT JOIN orders o ON o.id = oi.order_id
     LEFT JOIN users u ON u.id = o.user_id
     WHERE ${whereClause}
     ORDER BY spi.id DESC
     LIMIT $${limParam} OFFSET $${offParam}`,
    params,
  )

  return {
    items: rows.map((r) => ({
      id: Number(r.id),
      pool_id: Number(r.pool_id),
      payload: r.payload,
      status: r.status,
      created_at: r.created_at,
      reserved_at: r.reserved_at,
      delivered_at: r.delivered_at,
      order_id: r.order_id ? Number(r.order_id) : null,
      order_user_id: r.order_user_id ? Number(r.order_user_id) : null,
      order_username: r.order_username || null,
    })),
    total,
    summary,
  }
}


export async function adminDeleteStockItemsBatch({ ids }) {
  const cleanIds = (ids || []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
  if (cleanIds.length === 0) return { deleted: 0 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const poolsRes = await client.query(
      `SELECT DISTINCT pool_id FROM stock_pool_items WHERE id = ANY($1::bigint[])`,
      [cleanIds],
    )
    const poolIds = poolsRes.rows.map((r) => Number(r.pool_id))

    const delRes = await client.query(
      `DELETE FROM stock_pool_items WHERE id = ANY($1::bigint[]) AND status IN ('available', 'disabled')`,
      [cleanIds],
    )

    for (const pId of poolIds) {
      const prodRes = await client.query(
        `SELECT product_id FROM product_option_stock_bindings WHERE pool_id = $1`,
        [pId],
      )
      for (const pr of prodRes.rows) {
        if (pr.product_id) await recountProductStockFromPools(client, pr.product_id)
      }
    }

    await client.query('COMMIT')
    return { deleted: delRes.rowCount || 0 }
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    throw e
  } finally {
    client.release()
  }
}


export async function adminGetDigitalStockSummary(productId) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')

  const poolId = await getDefaultPoolId(pid)
  if (!poolId) {
    return { available: 0, reserved: 0, delivered: 0 }
  }

  const rows = await all(
    `SELECT status, COUNT(*)::int AS c
     FROM stock_pool_items
     WHERE pool_id = $1
     GROUP BY status
     ORDER BY status ASC`,
    [poolId],
  )
  const summary = { available: 0, reserved: 0, delivered: 0, disabled: 0 }
  for (const r of rows) summary[String(r.status)] = Number(r.c) || 0
  return summary
}


export async function adminListDigitalStockItems(productId, { limit = 200, offset = 0, status } = {}) {
  const pid = Number(productId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  const poolId = await getDefaultPoolId(pid)
  if (!poolId) return []

  const st = typeof status === 'string' && status.trim() ? status.trim() : null

  let rows
  if (st) {
    rows = await all(
      `SELECT spi.id, $1::bigint AS product_id, spi.payload, spi.status, spi.created_at, spi.reserved_at, spi.delivered_at
       FROM stock_pool_items spi
       WHERE spi.pool_id = $2 AND spi.status = $3
       ORDER BY spi.id DESC
       LIMIT $4 OFFSET $5`,
      [pid, poolId, st, lim, off],
    )
  } else {
    rows = await all(
      `SELECT spi.id, $1::bigint AS product_id, spi.payload, spi.status, spi.created_at, spi.reserved_at, spi.delivered_at
       FROM stock_pool_items spi
       WHERE spi.pool_id = $2
       ORDER BY spi.id DESC
       LIMIT $3 OFFSET $4`,
      [pid, poolId, lim, off],
    )
  }
  return rows
}


export async function adminUpdateDigitalStockItem({ id, payload, status }) {
  const sid = Number(id)
  if (!Number.isFinite(sid)) throw new Error('invalid_stock_item_id')

  const nextPayload = payload == null ? null : String(payload)
  const nextStatus = status == null ? null : String(status)
  if (nextStatus != null && !['available', 'disabled'].includes(nextStatus)) throw new Error('invalid_status')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const curRes = await client.query('SELECT id, pool_id, status FROM stock_pool_items WHERE id = $1 FOR UPDATE', [sid])
    const cur = curRes.rows?.[0]
    if (!cur) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    const curStatus = String(cur.status)
    if (!['available', 'disabled'].includes(curStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    if (nextPayload != null) {
      await client.query('UPDATE stock_pool_items SET payload = $2 WHERE id = $1', [sid, nextPayload])
    }
    if (nextStatus != null) {
      await client.query('UPDATE stock_pool_items SET status = $2 WHERE id = $1', [sid, nextStatus])
    }

    const productId = await findProductIdByPoolItemId(client, sid)
    if (productId) await recountProductStockFromPools(client, productId)
    await client.query('COMMIT')

    const updated = await get(
      `SELECT spi.id, b.product_id, spi.payload, spi.status, spi.created_at, spi.reserved_at, spi.delivered_at
       FROM stock_pool_items spi
       LEFT JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id AND b.product_option_id IS NULL
       WHERE spi.id = $1`,
      [sid],
    )
    return updated
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


export async function adminDeleteDigitalStockItem({ id }) {
  const sid = Number(id)
  if (!Number.isFinite(sid)) throw new Error('invalid_stock_item_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const curRes = await client.query('SELECT id, pool_id, status FROM stock_pool_items WHERE id = $1 FOR UPDATE', [sid])
    const cur = curRes.rows?.[0]
    if (!cur) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    const curStatus = String(cur.status)
    if (!['available', 'disabled'].includes(curStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const productId = await findProductIdByPoolItemId(client, sid)
    await client.query('DELETE FROM stock_pool_items WHERE id = $1', [sid])
    if (productId) await recountProductStockFromPools(client, productId)

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


async function getOrCreateDefaultPoolTx(client, productId) {
  const pid = Number(productId)
  const existing = await client.query(
    `SELECT b.pool_id
     FROM product_option_stock_bindings b
     WHERE b.product_id = $1 AND b.product_option_id IS NULL
     LIMIT 1`,
    [pid],
  )
  if (existing.rows.length > 0) return Number(existing.rows[0].pool_id)

  const poolRes = await client.query(
    `INSERT INTO stock_pools (name, kind, is_active)
     VALUES ($1, 'digital_code', true)
     RETURNING id`,
    [`auto:product:${pid}`],
  )
  const poolId = poolRes.rows[0].id

  await client.query(
    `INSERT INTO product_option_stock_bindings (product_id, product_option_id, pool_id)
     VALUES ($1, NULL, $2)
     ON CONFLICT (product_id, COALESCE(product_option_id, ''))
     DO UPDATE SET pool_id = EXCLUDED.pool_id`,
    [pid, poolId],
  )
  return Number(poolId)
}


async function getDefaultPoolId(productId) {
  const pid = Number(productId)
  const row = await get(
    `SELECT b.pool_id
     FROM product_option_stock_bindings b
     WHERE b.product_id = $1 AND b.product_option_id IS NULL
     LIMIT 1`,
    [pid],
  )
  return row ? Number(row.pool_id) : null
}


async function findProductIdByPoolItemId(client, itemId) {
  const row = await client.query(
    `SELECT b.product_id
     FROM stock_pool_items spi
     JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
     WHERE spi.id = $1
     LIMIT 1`,
    [itemId],
  )
  return row.rows?.[0]?.product_id != null ? Number(row.rows[0].product_id) : null
}


export async function recountProductStockFromPools(client, productId) {
  const pid = Number(productId)
  await client.query(
    `UPDATE products SET stock = COALESCE((
       SELECT COUNT(*)::int
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE b.product_id = $1 AND spi.status = 'available'
     ), 0)
     WHERE id = $1`,
    [pid],
  )
}


export async function recountProductAvailableStock(client, productId) {
  await recountProductStockFromPools(client, productId)
}


export async function getBulkProductOptionStockAvailability(productIds) {
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map(Number).filter((n) => Number.isFinite(n) && n > 0)))
  if (ids.length === 0) return {}

  const products = await all(
    `SELECT id, fulfillment_type, stock, is_unlimited_stock FROM products WHERE id = ANY($1)`,
    [ids],
  )

  const byProduct = await listActiveProductOptionItemsByProductIds(ids)

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
  const bindings = await all(
    `SELECT b.product_id, b.product_option_id, b.pool_id,
            p.kind, p.quantity_remaining, p.is_active,
            COALESCE(s.available_count, 0)::int AS available_count
     FROM product_option_stock_bindings b
     JOIN stock_pools p ON p.id = b.pool_id
     LEFT JOIN (
       SELECT pool_id, COUNT(*)::int AS available_count
       FROM stock_pool_items
       WHERE status = 'available'
       GROUP BY pool_id
     ) s ON s.pool_id = b.pool_id
     WHERE b.product_id IN (${placeholders})`,
    ids,
  )

  const bindingsByProduct = {}
  for (const r of bindings) {
    const pid = String(r.product_id)
    if (!bindingsByProduct[pid]) bindingsByProduct[pid] = []
    bindingsByProduct[pid].push(r)
  }

  const result = {}
  for (const product of products) {
    const pid = String(product.id)
    const opts = byProduct[pid] ?? []
    const productBindings = bindingsByProduct[pid] ?? []

    const byOption = {}
    for (const r of productBindings) {
      const optionId = r.product_option_id == null ? '' : String(r.product_option_id)
      const poolKind = String(r.kind)
      const isActive = r.is_active !== false
      let remaining = 0
      if (!isActive) remaining = 0
      else if (poolKind === 'quantity') remaining = Number(r.quantity_remaining ?? 0) || 0
      else remaining = Number(r.available_count ?? 0) || 0
      byOption[optionId] = { pool_id: Number(r.pool_id), kind: poolKind, is_active: Boolean(isActive), remaining }
    }

    const legacyRemaining = Boolean(product?.is_unlimited_stock) ? null : Number(product?.stock ?? 0) || 0
    for (const o of opts) {
      const oid = String(o?.id ?? '')
      if (!oid) continue
      if (byOption[oid] == null) byOption[oid] = { pool_id: null, kind: null, is_active: null, remaining: legacyRemaining }
    }

    result[pid] = byOption
  }
  return result
}


export async function getProductOptionStockAvailability(productId) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')

  const product = await get(
    `SELECT id, fulfillment_type, stock, is_unlimited_stock
     FROM products
     WHERE id = $1`,
    [pid],
  )
  if (!product) throw new Error('not_found')

  const byProduct = await listActiveProductOptionItemsByProductIds([pid])
  const opts = byProduct[String(pid)] ?? []

  const bindings = await all(
    `SELECT b.product_option_id, b.pool_id,
            p.kind, p.quantity_remaining, p.is_active,
            COALESCE(s.available_count, 0)::int AS available_count
     FROM product_option_stock_bindings b
     JOIN stock_pools p ON p.id = b.pool_id
     LEFT JOIN (
       SELECT pool_id, COUNT(*)::int AS available_count
       FROM stock_pool_items
       WHERE status = 'available'
       GROUP BY pool_id
     ) s ON s.pool_id = b.pool_id
     WHERE b.product_id = $1`,
    [pid],
  )

  const byOption = {}
  for (const r of bindings) {
    const optionId = r.product_option_id == null ? '' : String(r.product_option_id)
    const poolKind = String(r.kind)
    const isActive = r.is_active !== false
    let remaining = 0
    if (!isActive) remaining = 0
    else if (poolKind === 'quantity') remaining = Number(r.quantity_remaining ?? 0) || 0
    else remaining = Number(r.available_count ?? 0) || 0
    byOption[optionId] = {
      pool_id: Number(r.pool_id),
      kind: poolKind,
      is_active: Boolean(isActive),
      remaining,
    }
  }

  const legacyRemaining = Boolean(product?.is_unlimited_stock)
    ? null
    : Number(product?.stock ?? 0) || 0

  for (const o of opts) {
    const oid = String(o?.id ?? '')
    if (!oid) continue
    if (byOption[oid] == null) {
      byOption[oid] = {
        pool_id: null,
        kind: null,
        is_active: null,
        remaining: legacyRemaining,
      }
    }
  }

  return { product_id: pid, option_stock: byOption }
}

// ── Announcements ──

