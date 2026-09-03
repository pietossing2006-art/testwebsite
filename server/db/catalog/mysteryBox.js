import crypto from 'node:crypto'
import { all, get, pool, query } from '../pool.js'
import { recountProductAvailableStock } from '../stock.js'
import { maskPayload } from '../orders.js'


// ── Cryptographically-secure uniform random in [0, 1) — used for actual prize draws
// (Math.random() is not a CSPRNG and is unsuitable for anything with real-money stakes) ──
export function secureRandom01() {
  return crypto.randomInt(0, 1_000_000_000) / 1_000_000_000
}


export function pickWeightedIndex(rows, rand01) {
  const weights = rows.map((r) => {
    const effective = Number(r?.effective_weight)
    if (Number.isFinite(effective)) return Math.max(0, effective)
    return Math.max(0, Number(r?.weight ?? 0))
  })
  const total = weights.reduce((a, b) => a + b, 0)
  if (!Number.isFinite(total) || total <= 0) return -1
  let r = rand01 * total
  for (let i = 0; i < rows.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  return rows.length - 1
}


export const MYSTERY_STOCK_FACTOR_FLOOR = 0.05

// ── Reusable SQL fragment: mystery box available stock (excludes salt) ──

export const MYSTERY_AVAILABLE_STOCK_JOIN = `
  LEFT JOIN (
    SELECT mbp.box_product_id AS product_id,
           SUM(
             CASE
               WHEN mbp.is_active = true AND mbp.weight > 0 AND mbp.remaining > 0 AND mbp.prize_kind = 'product'
                 THEN LEAST(mbp.remaining,
                           COALESCE((SELECT COUNT(*)::int FROM mystery_box_stock_items msi WHERE msi.prize_id = mbp.id AND msi.status = 'available'), 0)
                 )
               WHEN mbp.is_active = true AND mbp.weight > 0 AND mbp.remaining > 0 AND mbp.prize_kind = 'linked_product'
                 THEN LEAST(mbp.remaining,
                           COALESCE((SELECT COUNT(*)::int FROM stock_pool_items spi JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id WHERE b.product_id = mbp.prize_product_id AND b.product_option_id IS NULL AND spi.status = 'available'), 0)
                 )
               ELSE 0
             END
           )::int AS available_stock
    FROM mystery_box_prizes mbp
    GROUP BY mbp.box_product_id
  ) m ON m.product_id = p.id`

// ── Mystery box effective weight calculation (shared between purchase + simulate) ──

// Effective odds = configured weight, scaled down only when physical stock can't cover the
// admin's quota (available < remaining). A prize with full stock draws at exactly its configured
// weight — no hidden multiplier — so the weight admins set is the probability they actually get.
// (Previously a `log2(drawable+1)` "depth" term was multiplied in uncapped, which silently inflated
// odds for deep-stock prizes and suppressed shallow-stock ones regardless of configured weight.)
export function computeMysteryEffectiveWeights(prizes) {
  return prizes.map((row) => {
    const kind = String(row?.prize_kind || 'product')
    const weight = Math.max(0, Number(row?.weight || 0))
    const remaining = Math.max(0, Number(row?.remaining || 0))
    const available = Math.max(0, Number(row?.prize_available_stock || 0))
    const drawable = kind === 'salt' ? remaining : Math.min(remaining, available)
    const stockFactor = kind === 'salt' ? 1 : Math.min(1, available / Math.max(1, remaining))
    const effectiveWeight = drawable > 0
      ? weight * Math.max(MYSTERY_STOCK_FACTOR_FLOOR, stockFactor)
      : 0
    return {
      ...row,
      effective_weight: Number(effectiveWeight.toFixed(6)),
      drawable_count: drawable,
    }
  })
}

// ── Draw helpers for each prize kind ──

export async function drawSaltPrize(client, chosen, { uid, orderId, orderItemId, boxId } = {}) {
  await client.query(
    `UPDATE mystery_box_prizes SET remaining = remaining - 1, updated_at = now() WHERE id = $1`,
    [Number(chosen.id)],
  )
  chosen.remaining = Number(chosen.remaining) - 1

  const displayName = chosen.prize_name || 'ไม่ได้รับรางวัล (เกลือ)'
  // A salt draw is a real, resolved outcome — persist it as a `deliveries` row (status already
  // 'claimed', since there's nothing to claim) so it shows up in order history/inbox instead of
  // vanishing without a trace, and so admin order stage computation doesn't treat it as unfulfilled.
  let deliveryId = null
  if (uid && orderId && orderItemId && boxId) {
    const dRes = await client.query(
      `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, status, delivery_name, delivery_kind, claimed_at)
       VALUES ($1, $2, $3, $4, 'claimed', $5, 'no_prize', now())
       RETURNING id`,
      [uid, orderId, orderItemId, boxId, displayName],
    )
    deliveryId = dRes.rows[0]?.id ?? null
  }

  return {
    kind: 'salt',
    prize_name: chosen.prize_name || null,
    delivery: deliveryId ? { id: deliveryId, masked: null } : null,
  }
}


export async function drawLinkedProductPrize(client, chosen, { uid, orderId, orderItemId, boxId }) {
  const prizeProductId = Number(chosen.prize_product_id)
  if (!Number.isFinite(prizeProductId) || prizeProductId <= 0) {
    return null // caller should skip
  }

  const linkedPoolBinding = await client.query(
    `SELECT pool_id FROM product_option_stock_bindings
     WHERE product_id = $1 AND product_option_id IS NULL LIMIT 1`,
    [prizeProductId],
  )
  const linkedPoolId = linkedPoolBinding.rows?.[0]?.pool_id != null ? Number(linkedPoolBinding.rows[0].pool_id) : null

  let stockRes = { rows: [], rowCount: 0 }
  if (Number.isFinite(linkedPoolId)) {
    stockRes = await client.query(
      `SELECT id, payload
       FROM stock_pool_items
       WHERE pool_id = $1 AND status = 'available'
       ORDER BY id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [linkedPoolId],
    )
  }

  if ((stockRes.rowCount ?? 0) < 1) {
    // stock exhausted — set remaining=0 but keep is_active for admin to refill
    await client.query(
      `UPDATE mystery_box_prizes SET remaining = 0, updated_at = now() WHERE id = $1`,
      [Number(chosen.id)],
    )
    chosen.remaining = 0
    return null // caller should retry
  }

  const stockId = stockRes.rows[0].id
  const payload = String(stockRes.rows[0].payload ?? '')
  const masked = maskPayload(payload)

  const dRes = await client.query(
    `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_pool_item_id, status, payload_masked, payload, delivery_name)
     VALUES ($1, $2, $3, $4, $5, 'pending_claim', $6, $7, $8)
     RETURNING id`,
    [uid, orderId, orderItemId, prizeProductId, stockId, masked, payload, chosen.prize_name || chosen.prize_product_name || null],
  )

  await client.query(
    `UPDATE stock_pool_items SET status = 'reserved', reserved_order_item_id = $2, reserved_at = now() WHERE id = $1`,
    [stockId, orderItemId],
  )
  await recountProductAvailableStock(client, prizeProductId)

  await client.query(
    `UPDATE mystery_box_prizes SET remaining = remaining - 1, updated_at = now() WHERE id = $1`,
    [Number(chosen.id)],
  )
  chosen.remaining = Number(chosen.remaining) - 1

  return {
    kind: 'linked_product',
    prize_name: chosen.prize_name || null,
    prize_product_id: prizeProductId,
    prize_product_name: chosen.prize_product_name || null,
    prize_image_url: chosen.prize_image_url || chosen.prize_product_image_url || null,
    delivery: { id: dRes.rows[0].id, masked },
  }
}


export async function drawProductPrize(client, chosen, { uid, orderId, orderItemId, boxId }) {
  const prizeProductId = Number(chosen.prize_product_id)

  const stockRes = await client.query(
    `SELECT id, payload, image_url
     FROM mystery_box_stock_items
     WHERE prize_id = $1 AND box_product_id = $2 AND status = 'available'
     ORDER BY id ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1`,
    [Number(chosen.id), boxId],
  )

  if ((stockRes.rowCount ?? 0) < 1) {
    // stock exhausted — set remaining=0 but keep is_active for admin to refill
    await client.query(
      `UPDATE mystery_box_prizes SET remaining = 0, updated_at = now() WHERE id = $1`,
      [Number(chosen.id)],
    )
    chosen.remaining = 0
    return null // caller should retry
  }

  const stockId = stockRes.rows[0].id
  const payload = String(stockRes.rows[0].payload ?? '')
  const masked = maskPayload(payload)

  const dRes = await client.query(
    `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, mystery_stock_item_id, status, payload_masked, payload, delivery_name)
     VALUES ($1, $2, $3, $4, $5, 'pending_claim', $6, $7, $8)
     RETURNING id`,
    [
      uid,
      orderId,
      orderItemId,
      prizeProductId > 0 ? prizeProductId : boxId,
      stockId,
      masked,
      payload,
      chosen.prize_name || chosen.prize_product_name || null,
    ],
  )

  await client.query(
    `UPDATE mystery_box_stock_items SET status = 'reserved', reserved_order_item_id = $2, reserved_at = now() WHERE id = $1`,
    [stockId, orderItemId],
  )

  await client.query(
    `UPDATE mystery_box_prizes SET remaining = remaining - 1, updated_at = now() WHERE id = $1`,
    [Number(chosen.id)],
  )
  chosen.remaining = Number(chosen.remaining) - 1

  const stockImageUrl = stockRes.rows[0]?.image_url || null
  return {
    kind: 'product',
    prize_name: chosen.prize_name || null,
    prize_product_id: prizeProductId,
    prize_product_name: chosen.prize_product_name || null,
    prize_image_url: stockImageUrl || chosen.prize_image_url || chosen.prize_product_image_url || null,
    delivery: { id: dRes.rows[0].id, masked },
  }
}


async function recountMysteryPrizeRemainingFromStock(client, prizeId) {
  const pid = Number(prizeId)
  if (!Number.isFinite(pid) || pid <= 0) return
  await client.query(
    `UPDATE mystery_box_prizes
     SET remaining = COALESCE((
       SELECT COUNT(*)::int
       FROM mystery_box_stock_items msi
       WHERE msi.prize_id = $1
         AND msi.status = 'available'
     ), 0),
         updated_at = now()
     WHERE id = $1
       AND prize_kind = 'product'`,
    [pid],
  )
}


export async function listMysteryBoxPrizesPublic(boxProductId) {
  const bid = Number(boxProductId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  const rows = await all(
    `SELECT mbp.id, mbp.prize_kind, mbp.prize_name, mbp.prize_image_url, mbp.weight, mbp.remaining, mbp.is_active,
            p.name AS prize_product_name, p.image_url AS prize_product_image_url
     FROM mystery_box_prizes mbp
     LEFT JOIN products p ON p.id = mbp.prize_product_id
     WHERE mbp.box_product_id = $1 AND mbp.is_active = true AND mbp.weight > 0
     ORDER BY mbp.weight DESC`,
    [bid],
  )
  const totalWeight = rows.reduce((s, r) => s + Number(r.weight || 0), 0)
  return rows.map((r) => ({
    id: r.id,
    prize_kind: r.prize_kind,
    prize_name: r.prize_name || r.prize_product_name || (r.prize_kind === 'salt' ? 'เกลือ' : 'ของรางวัล'),
    prize_image_url: r.prize_image_url || r.prize_product_image_url || null,
    weight: Number(r.weight),
    remaining: r.prize_kind === 'salt' ? null : Number(r.remaining),
    chance_percent: totalWeight > 0 ? (Number(r.weight) / totalWeight) * 100 : 0,
  }))
}


export async function listMysteryBoxRecentWins(boxProductId, { limit = 20 } = {}) {
  const bid = Number(boxProductId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  return all(
    `SELECT d.delivery_name, d.created_at,
            u.username,
            p.image_url AS prize_image_url
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     JOIN users u ON u.id = d.user_id
     LEFT JOIN products p ON p.id = d.product_id
     WHERE o.id IN (
       SELECT DISTINCT oi.order_id FROM order_items oi WHERE oi.product_id = $1
     )
     AND d.delivery_kind IS DISTINCT FROM 'no_prize'
     ORDER BY d.created_at DESC
     LIMIT $2`,
    [bid, limit],
  )
}


export async function adminListMysteryBoxPrizes({ boxProductId, limit = 200, offset = 0 } = {}) {
  const bid = Number(boxProductId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  const rows = await all(
    `SELECT mbp.id, mbp.box_product_id, mbp.prize_kind, mbp.prize_product_id, mbp.prize_name, mbp.prize_image_url,
            mbp.weight, mbp.remaining, mbp.is_active, mbp.created_at, mbp.updated_at,
            p.name AS prize_product_name, p.image_url AS prize_product_image_url,
            CASE
              WHEN mbp.prize_kind = 'linked_product'
                THEN COALESCE((SELECT COUNT(*)::int FROM stock_pool_items spi JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id WHERE b.product_id = mbp.prize_product_id AND b.product_option_id IS NULL AND spi.status = 'available'), 0)
              ELSE (SELECT COUNT(*)::int FROM mystery_box_stock_items msi WHERE msi.prize_id = mbp.id AND msi.status = 'available')
            END AS prize_available_stock
     FROM mystery_box_prizes mbp
     LEFT JOIN products p ON p.id = mbp.prize_product_id
     WHERE mbp.box_product_id = $1
     ORDER BY mbp.id DESC
     LIMIT $2 OFFSET $3`,
    [bid, limit, offset],
  )

  // Real-time draw odds: only prizes eligible for an actual draw (active, in quota, weighted)
  // contribute to the probability pool — matches the exact filter purchaseMysteryBox() uses.
  const eligible = rows.filter((r) => r.is_active && Number(r.remaining) > 0 && Number(r.weight) > 0)
  const weighted = computeMysteryEffectiveWeights(eligible)
  const totalEffective = weighted.reduce((s, r) => s + Math.max(0, Number(r.effective_weight || 0)), 0)
  const oddsById = new Map(weighted.map((r) => [Number(r.id), r]))

  return rows.map((r) => {
    const w = oddsById.get(Number(r.id))
    const effectiveWeight = w ? Number(w.effective_weight || 0) : 0
    return {
      ...r,
      effective_weight: effectiveWeight,
      probability_percent: totalEffective > 0 ? Number(((effectiveWeight / totalEffective) * 100).toFixed(4)) : 0,
    }
  })
}


export async function adminAddMysteryBoxPrizeStock({ boxProductId, prizeId, prizeProductId, items }) {
  const bid = Number(boxProductId)
  const pid = Number(prizeId)
  const pp = prizeProductId == null || prizeProductId === '' ? null : Number(prizeProductId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_prize_id')
  if (pp != null && (!Number.isFinite(pp) || pp <= 0)) throw new Error('invalid_prize_product_id')

  const lines = (items || [])
    .map((x) => {
      if (x && typeof x === 'object' && !Array.isArray(x)) {
        const payload = String(x.payload ?? '').trim()
        return payload.length > 0 ? { payload, image_url: x.image_url || null } : null
      }
      const s = String(x ?? '').trim()
      return s.length > 0 ? s : null
    })
    .filter(Boolean)
  if (lines.length === 0) return { inserted: 0 }

  const prize = await get('SELECT id, box_product_id, prize_product_id, prize_kind FROM mystery_box_prizes WHERE id=$1', [pid])
  if (!prize) throw new Error('prize_not_found')
  if (Number(prize.box_product_id) !== bid) throw new Error('prize_box_mismatch')
  const kind = String(prize.prize_kind || 'product')
  if (kind !== 'product') throw new Error('invalid_prize_kind')
  const effectivePrizeProductId = prize.prize_product_id == null ? null : Number(prize.prize_product_id)
  if (effectivePrizeProductId != null && (!Number.isFinite(effectivePrizeProductId) || effectivePrizeProductId <= 0)) throw new Error('invalid_prize_product_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const item of lines) {
      const payload = typeof item === 'string' ? item : String(item?.payload ?? '').trim()
      const imageUrl = typeof item === 'object' && item?.image_url ? String(item.image_url).trim() : null
      await client.query(
        `INSERT INTO mystery_box_stock_items (box_product_id, prize_id, prize_product_id, payload, image_url, status)
         VALUES ($1, $2, $3, $4, $5, 'available')`,
        [bid, pid, effectivePrizeProductId, payload, imageUrl || null],
      )
    }
    await recountMysteryPrizeRemainingFromStock(client, pid)
    await client.query('COMMIT')
    return { inserted: lines.length }
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


export async function adminListMysteryBoxPrizeStockItems({ prizeId, limit = 200, offset = 0 } = {}) {
  const pid = Number(prizeId)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_prize_id')
  return all(
    `SELECT id, box_product_id, prize_id, prize_product_id, status, payload, image_url,
            created_at, reserved_at, delivered_at, reserved_order_item_id
     FROM mystery_box_stock_items
     WHERE prize_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [pid, limit, offset],
  )
}


export async function adminUpdateMysteryBoxPrizeStockItem({ id, status, image_url }) {
  const sid = Number(id)
  if (!Number.isFinite(sid) || sid <= 0) throw new Error('invalid_id')
  const st = String(status || '')
  if (!['available', 'disabled'].includes(st)) throw new Error('invalid_status')
  const imgUrl = image_url === undefined ? undefined : (image_url ? String(image_url).trim() : null)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const setClauses = ['status = $2']
    const params = [sid, st]
    if (imgUrl !== undefined) {
      params.push(imgUrl || null)
      setClauses.push(`image_url = $${params.length}`)
    }
    const res = await client.query(
      `UPDATE mystery_box_stock_items
       SET ${setClauses.join(', ')}
       WHERE id = $1
       RETURNING id, box_product_id, prize_id, prize_product_id, status, payload, image_url, created_at, reserved_at, delivered_at, reserved_order_item_id`,
      params,
    )
    if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
    await recountMysteryPrizeRemainingFromStock(client, Number(res.rows[0]?.prize_id))
    await client.query('COMMIT')
    return res.rows[0]
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


export async function adminDeleteMysteryBoxPrizeStockItem(id) {
  const sid = Number(id)
  if (!Number.isFinite(sid) || sid <= 0) throw new Error('invalid_id')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query('DELETE FROM mystery_box_stock_items WHERE id=$1 RETURNING prize_id', [sid])
    if ((res.rowCount ?? 0) > 0) {
      await recountMysteryPrizeRemainingFromStock(client, Number(res.rows[0]?.prize_id))
    }
    await client.query('COMMIT')
    return { ok: true, deleted: res.rowCount ?? 0 }
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


export async function adminCreateMysteryBoxPrize({ boxProductId, prizeKind, prizeProductId, prizeName, prizeImageUrl, weight, remaining, isActive }) {
  const bid = Number(boxProductId)
  const kind = typeof prizeKind === 'string' && prizeKind.trim() ? prizeKind.trim() : 'product'
  const pid = prizeProductId == null || prizeProductId === '' ? null : Number(prizeProductId)
  const rawPrizeName = String(prizeName || '').trim()
  const name = rawPrizeName.slice(0, 120)
  const w = Number(weight)
  const rem = Number(remaining)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  if (!['product', 'salt', 'linked_product'].includes(kind)) throw new Error('invalid_prize_kind')
  if (kind === 'salt' && !name) throw new Error('invalid_prize_name')
  if (kind === 'linked_product') {
    if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_prize_product_id')
  }
  if (!Number.isFinite(w) || w <= 0) throw new Error('invalid_weight')
  if (kind !== 'product' && (!Number.isFinite(rem) || rem < 0)) throw new Error('invalid_remaining')
  const normalizedWeight = Number(w.toFixed(4))
  const normalizedRemaining = kind === 'product' ? 0 : Math.trunc(rem)

  const imgUrl = typeof prizeImageUrl === 'string' && prizeImageUrl.trim() ? prizeImageUrl.trim() : null
  const res = await query(
    `INSERT INTO mystery_box_prizes (box_product_id, prize_kind, prize_product_id, prize_name, prize_image_url, weight, remaining, is_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     RETURNING id`,
    [bid, kind, kind === 'salt' ? null : pid, name || null, imgUrl, normalizedWeight, normalizedRemaining, Boolean(isActive)],
  )
  return res.rows[0].id
}


export async function adminUpdateMysteryBoxPrize({ id, prizeName, prizeImageUrl, weight, remaining, isActive }) {
  const mid = Number(id)
  const name = String(prizeName || '').trim().slice(0, 120)
  const w = Number(weight)
  const rem = Number(remaining)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  if (!Number.isFinite(w) || w <= 0) throw new Error('invalid_weight')
  const normalizedWeight = Number(w.toFixed(4))

  const existing = await get('SELECT id, prize_kind, remaining FROM mystery_box_prizes WHERE id=$1', [mid])
  if (!existing) throw new Error('not_found')
  const kind = String(existing.prize_kind || '')
  if (kind === 'salt' && !name) throw new Error('invalid_prize_name')
  if (kind !== 'product' && (!Number.isFinite(rem) || rem < 0)) throw new Error('invalid_remaining')
  const normalizedRemaining = kind === 'product' ? Math.max(0, Number(existing.remaining || 0)) : Math.trunc(rem)

  const imgUrl = prizeImageUrl === undefined ? undefined : (typeof prizeImageUrl === 'string' && prizeImageUrl.trim() ? prizeImageUrl.trim() : null)
  const imgClause = imgUrl !== undefined ? ', prize_image_url=$6' : ''
  const imgParams = imgUrl !== undefined ? [imgUrl] : []
  await query(
    `UPDATE mystery_box_prizes
     SET prize_name=$2, weight=$3, remaining=$4, is_active=$5${imgClause}, updated_at=now()
     WHERE id=$1`,
    [mid, name || null, normalizedWeight, normalizedRemaining, Boolean(isActive), ...imgParams],
  )
  return get(
    `SELECT id, box_product_id, prize_kind, prize_product_id, prize_name, prize_image_url, weight, remaining, is_active, created_at, updated_at
     FROM mystery_box_prizes
     WHERE id=$1`,
    [mid],
  )
}


export async function adminDeleteMysteryBoxPrize(id) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  await query('DELETE FROM mystery_box_prizes WHERE id=$1', [mid])
  return { ok: true }
}


export async function adminSimulateMysteryBox({ boxProductId, qty = 1, trials = 1000 } = {}) {
  const bid = Number(boxProductId)
  const q = Number(qty)
  const t = Number(trials)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 20) throw new Error('invalid_qty')
  if (!Number.isFinite(t) || t <= 0 || t > 20000) throw new Error('invalid_trials')

  const prizes = await all(
    `SELECT mbp.id, mbp.prize_kind, mbp.prize_product_id, mbp.prize_name, mbp.weight, mbp.remaining, mbp.is_active,
            p.name AS prize_product_name,
            CASE
              WHEN mbp.prize_kind = 'linked_product'
                THEN COALESCE((SELECT COUNT(*)::int FROM stock_pool_items spi JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id WHERE b.product_id = mbp.prize_product_id AND b.product_option_id IS NULL AND spi.status = 'available'), 0)
              ELSE (SELECT COUNT(*)::int FROM mystery_box_stock_items msi WHERE msi.prize_id = mbp.id AND msi.status = 'available')
            END AS prize_available_stock
     FROM mystery_box_prizes mbp
     LEFT JOIN products p ON p.id = mbp.prize_product_id
     WHERE mbp.box_product_id = $1
       AND mbp.is_active = true
       AND mbp.remaining > 0
       AND mbp.weight > 0
     ORDER BY mbp.id ASC`,
    [bid],
  )
  if (!Array.isArray(prizes) || prizes.length < 1) throw new Error('out_of_stock')

  const weightedRows = computeMysteryEffectiveWeights(prizes)
  const totalEffectiveWeight = weightedRows.reduce((sum, row) => sum + Math.max(0, Number(row?.effective_weight || 0)), 0)
  if (!Number.isFinite(totalEffectiveWeight) || totalEffectiveWeight <= 0) throw new Error('out_of_stock')

  const tally = new Map()
  for (const row of weightedRows) tally.set(Number(row.id), 0)

  for (let i = 0; i < t; i += 1) {
    for (let draw = 0; draw < q; draw += 1) {
      const idx = pickWeightedIndex(weightedRows, Math.random())
      if (idx < 0) continue
      const chosen = weightedRows[idx]
      const key = Number(chosen.id)
      tally.set(key, Number(tally.get(key) || 0) + 1)
    }
  }

  const totalDraws = Math.max(1, t * q)
  const results = weightedRows.map((row) => {
    const hits = Number(tally.get(Number(row.id)) || 0)
    const probability = (hits / totalDraws) * 100
    return {
      prize_id: Number(row.id),
      prize_kind: String(row.prize_kind || 'product'),
      prize_product_id: row.prize_product_id == null ? null : Number(row.prize_product_id),
      prize_name: row.prize_name || null,
      prize_product_name: row.prize_product_name || null,
      weight: Number(row.weight || 0),
      remaining: Number(row.remaining || 0),
      available_stock: Number(row.prize_available_stock || 0),
      effective_weight: Number(row.effective_weight || 0),
      drawable_count: Number(row.drawable_count || 0),
      hits,
      probability_percent: Number(probability.toFixed(4)),
      expected_hits: Number(((totalDraws * Number(row.effective_weight || 0)) / Math.max(1, totalEffectiveWeight)).toFixed(2)),
    }
  })

  return {
    box_product_id: bid,
    qty_per_trial: Math.trunc(q),
    trials: Math.trunc(t),
    total_draws: totalDraws,
    results,
  }
}
