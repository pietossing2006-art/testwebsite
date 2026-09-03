import { all, get, pool, query } from '../pool.js'
import { resolveDiscountQuote } from '../../lib/growthDiscounts.js'
import { getProductById } from './products.js'
import { resolveProductOption, requireProductOption } from './options.js'
import {
  campaignToDiscountCandidate, couponToDiscountCandidate, getMyVip, listActiveGrowthCampaigns,
  readAndValidateDiscountCoupon, vipToDiscountCandidate,
} from '../growth.js'


export async function getBundleWithItems(bundleId) {
  const b = await get(`SELECT * FROM product_bundles WHERE id = $1`, [bundleId])
  if (!b) return null
  const rows = await all(
    `SELECT bi.id, bi.bundle_id, bi.product_id, bi.qty, bi.product_option_id, bi.sort_order,
            p.name AS product_name, p.image_url AS product_image_url, p.price AS product_base_price,
            p.fulfillment_type, p.is_unlimited_stock, p.stock,
            poi.label AS product_option_label, poi.value_text AS product_option_value,
            poi.price_points AS product_option_price_points
     FROM bundle_items bi
     JOIN products p ON p.id = bi.product_id
     LEFT JOIN product_option_items poi
       ON poi.product_id = bi.product_id
      AND poi.option_id = bi.product_option_id
      AND poi.is_active = true
     WHERE bi.bundle_id = $1
     ORDER BY bi.sort_order ASC, bi.id ASC`,
    [bundleId],
  )
  const items = rows.map((it) => {
    const optionId = it.product_option_id == null ? '' : String(it.product_option_id).trim()
    const optionPriceRaw = optionId ? it.product_option_price_points : null
    const optionPrice = optionPriceRaw == null || optionPriceRaw === '' ? null : Number(optionPriceRaw)
    const basePrice = Number(it.product_base_price ?? 0) || 0
    const productPrice = Number.isFinite(optionPrice) ? optionPrice : basePrice
    const productOption = optionId
      ? {
          id: optionId,
          label: String(it.product_option_label || optionId).trim(),
          value: it.product_option_value ?? null,
          price_points: productPrice,
        }
      : null
    return {
      ...it,
      qty: Math.max(1, Math.trunc(Number(it.qty) || 1)),
      product_price: productPrice,
      product_option: productOption,
      product_option_missing: Boolean(optionId && !it.product_option_label),
    }
  })
  const originalTotal = items.reduce((s, it) => s + Number(it.product_price ?? 0) * Number(it.qty ?? 1), 0)
  return { ...b, items, original_total: originalTotal }
}


export function assertBundlePurchasable(bundle) {
  if (!bundle) throw new Error('bundle_not_found')
  if (!bundle.is_active || bundle.is_hidden) throw new Error('bundle_not_available')

  const now = Date.now()
  if (bundle.starts_at && new Date(bundle.starts_at).getTime() > now) throw new Error('bundle_not_started')
  if (bundle.ends_at && new Date(bundle.ends_at).getTime() < now) throw new Error('bundle_expired')
  if (!Array.isArray(bundle.items) || bundle.items.length === 0) throw new Error('bundle_empty')
  if (bundle.items.some((item) => item.product_option_missing)) throw new Error('invalid_product_option')
}


export function getBundleItemQty(item) {
  return Math.max(1, Math.trunc(Number(item?.qty) || 1))
}


function getBundleItemOptionId(item) {
  const raw = item?.product_option_id
  const optionId = typeof raw === 'string' && raw.trim() ? raw.trim() : raw == null ? '' : String(raw).trim()
  return optionId || null
}


export async function findBundleStockPool(client, item, { lock = false } = {}) {
  const pid = Number(item?.product_id)
  if (!Number.isFinite(pid) || pid <= 0) return null
  const optionId = getBundleItemOptionId(item)
  const lockClause = lock ? ' FOR UPDATE OF sp' : ''

  if (optionId) {
    const optionRes = await client.query(
      `SELECT b.pool_id, sp.kind, sp.quantity_remaining, sp.is_active
       FROM product_option_stock_bindings b
       JOIN stock_pools sp ON sp.id = b.pool_id
       WHERE b.product_id = $1 AND b.product_option_id = $2
       LIMIT 1${lockClause}`,
      [pid, optionId],
    )
    if (optionRes.rows?.[0]) return optionRes.rows[0]
  }

  const defaultRes = await client.query(
    `SELECT b.pool_id, sp.kind, sp.quantity_remaining, sp.is_active
     FROM product_option_stock_bindings b
     JOIN stock_pools sp ON sp.id = b.pool_id
     WHERE b.product_id = $1 AND b.product_option_id IS NULL
     LIMIT 1${lockClause}`,
    [pid],
  )
  return defaultRes.rows?.[0] ?? null
}


async function getBundleItemStockStatus(client, item) {
  const ft = String(item?.fulfillment_type || 'digital_stock')
  const qty = getBundleItemQty(item)
  if (ft !== 'digital_stock') {
    return { fulfillment_type: ft, pool_id: null, pool_kind: null, remaining: null, out_of_stock: false }
  }
  if (item?.is_unlimited_stock) {
    return { fulfillment_type: ft, pool_id: null, pool_kind: 'unlimited', remaining: null, out_of_stock: false }
  }

  const poolRow = await findBundleStockPool(client, item)
  if (!poolRow || poolRow.is_active === false) {
    return { fulfillment_type: ft, pool_id: null, pool_kind: null, remaining: 0, out_of_stock: true }
  }

  const poolKind = String(poolRow.kind || 'digital_code')
  let remaining = 0
  if (poolKind === 'quantity') {
    remaining = Number(poolRow.quantity_remaining ?? 0) || 0
  } else {
    const available = await client.query(
      `SELECT COUNT(*)::int AS cnt
       FROM stock_pool_items
       WHERE pool_id = $1 AND status = 'available'`,
      [poolRow.pool_id],
    )
    remaining = Number(available.rows?.[0]?.cnt ?? 0) || 0
  }

  return {
    fulfillment_type: ft,
    pool_id: Number(poolRow.pool_id),
    pool_kind: poolKind,
    remaining,
    out_of_stock: remaining < qty,
  }
}


export async function buildBundleQuote(client, bundle, coupon, { userId } = {}) {
  const bundlePrice = Math.max(0, Math.trunc(Number(bundle.bundle_price) || 0))
  const originalTotal = Math.max(0, Math.trunc(Number(bundle.original_total) || 0))
  const campaigns = await listActiveGrowthCampaigns({ targetType: 'bundle', targetId: bundle.id })
  const vip = userId ? await getMyVip(userId).catch(() => null) : null
  const candidates = [
    ...(campaigns.campaigns || []).map(campaignToDiscountCandidate),
    vipToDiscountCandidate(vip),
    couponToDiscountCandidate(coupon),
  ].filter(Boolean)
  const resolved = resolveDiscountQuote({
    targetType: 'bundle',
    targetId: bundle.id,
    originalUnitPricePoints: bundlePrice,
    quantity: 1,
    candidates,
  })

  const items = []
  for (const item of bundle.items) {
    const stock = await getBundleItemStockStatus(client, item)
    items.push({
      bundle_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      product_image_url: item.product_image_url ?? null,
      product_option_id: item.product_option_id ?? null,
      product_option: item.product_option ?? null,
      qty: getBundleItemQty(item),
      unit_price_points: Number(item.product_price ?? 0) || 0,
      subtotal_points: (Number(item.product_price ?? 0) || 0) * getBundleItemQty(item),
      stock,
      available: !stock.out_of_stock,
    })
  }

  const unavailableItems = items.filter((item) => !item.available)
  return {
    bundle_id: bundle.id,
    bundle_price_points: bundlePrice,
    original_total_points: originalTotal,
    bundle_discount_points: Math.max(0, originalTotal - bundlePrice),
    coupon_discount_points: resolved.discounts_applied.find((d) => d.source_type === 'coupon')?.amount_points || 0,
    total_points: resolved.final_total_points,
    coupon_code: coupon?.code ?? null,
    coupon_valid: coupon != null,
    discounts_considered: resolved.discounts_considered,
    discounts_applied: resolved.discounts_applied,
    discounts_rejected: resolved.discounts_rejected,
    final_unit_price_points: resolved.final_unit_price_points,
    available: unavailableItems.length === 0,
    unavailable_items: unavailableItems,
    items,
  }
}


async function _replaceBundleItems(bundleId, items) {
  const normalized = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const pid = Number(it.product_id)
    const qty = getBundleItemQty(it)
    if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_bundle_items')

    const product = await getProductById(pid)
    if (!product) throw new Error('product_not_found')

    const rawOptionId = it.product_option_id == null ? '' : String(it.product_option_id).trim()
    let selectedOption = null
    if (rawOptionId) {
      selectedOption = resolveProductOption({ product, productOptionId: rawOptionId })
      if (!selectedOption) throw new Error('invalid_product_option')
    } else {
      selectedOption = requireProductOption({ product, productOptionId: null })
    }

    normalized.push({
      product_id: pid,
      qty,
      product_option_id: selectedOption?.id ? String(selectedOption.id) : null,
      sort_order: i,
    })
  }

  if (normalized.length < 1) throw new Error('invalid_bundle_items')

  await query(`DELETE FROM bundle_items WHERE bundle_id = $1`, [bundleId])
  for (const it of normalized) {
    await query(
      `INSERT INTO bundle_items (bundle_id, product_id, qty, product_option_id, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [bundleId, it.product_id, it.qty, it.product_option_id, it.sort_order],
    )
  }
}


export async function quoteBundlePurchase({ bundleId, couponCode } = {}) {
  const bid = Number(bundleId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_bundle_id')
  const { userId } = arguments?.[0] ?? {}

  const bundle = await getBundleWithItems(bid)
  assertBundlePurchasable(bundle)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const coupon = await readAndValidateDiscountCoupon(client, couponCode)
    const quote = await buildBundleQuote(client, bundle, coupon, { userId })
    await client.query('COMMIT')
    return quote
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    throw e
  } finally {
    client.release()
  }
}


export async function listBundles({ includeHidden = false, activeOnly = true } = {}) {
  const conds = []
  if (!includeHidden) conds.push(`b.is_hidden = false`)
  if (activeOnly) conds.push(`b.is_active = true`)
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const bundles = await all(
    `SELECT b.*,
            (SELECT COUNT(*)::int FROM bundle_items WHERE bundle_id = b.id) AS item_count
     FROM product_bundles b
     ${where}
     ORDER BY b.sort_order ASC, b.id ASC`,
  )
  return bundles
}


export async function getBundleById(id) {
  const bid = Number(id)
  if (!Number.isFinite(bid) || bid <= 0) return null
  return getBundleWithItems(bid)
}


export async function adminListBundles() {
  const bundles = await all(
    `SELECT b.*,
            (SELECT COUNT(*)::int FROM bundle_items WHERE bundle_id = b.id) AS item_count
     FROM product_bundles b
     ORDER BY b.sort_order ASC, b.id ASC`,
  )
  return bundles
}


export async function adminGetBundleDetail(id) {
  const bid = Number(id)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_id')
  const bundle = await getBundleWithItems(bid)
  if (!bundle) throw new Error('not_found')
  return bundle
}


export async function adminCreateBundle({ name, slug, description, imageUrl, bundlePrice, isActive, isHidden, sortOrder, startsAt, endsAt, items }) {
  if (!name || !slug) throw new Error('invalid_name_or_slug')
  const price = Number(bundlePrice)
  if (!Number.isFinite(price) || price < 0) throw new Error('invalid_price')
  if (!Array.isArray(items) || items.length < 1) throw new Error('invalid_bundle_items')

  const res = await query(
    `INSERT INTO product_bundles (name, slug, description, image_url, bundle_price, is_active, is_hidden, sort_order, starts_at, ends_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     RETURNING id`,
    [
      String(name).trim(),
      String(slug).trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
      description ? String(description).trim() : null,
      imageUrl ? String(imageUrl).trim() : null,
      Math.trunc(price),
      isActive !== false,
      Boolean(isHidden),
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      startsAt || null,
      endsAt || null,
    ],
  )
  const bundleId = res.rows[0].id
  if (Array.isArray(items) && items.length > 0) {
    await _replaceBundleItems(bundleId, items)
  }
  return bundleId
}


export async function adminUpdateBundle({ id, name, slug, description, imageUrl, bundlePrice, isActive, isHidden, sortOrder, startsAt, endsAt, items }) {
  const bid = Number(id)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_id')
  const price = bundlePrice != null ? Number(bundlePrice) : null
  if (price != null && (!Number.isFinite(price) || price < 0)) throw new Error('invalid_price')
  if (Array.isArray(items) && items.length < 1) throw new Error('invalid_bundle_items')

  const res = await query(
    `UPDATE product_bundles
     SET name = COALESCE($2, name),
         slug = COALESCE($3, slug),
         description = COALESCE($4, description),
         image_url = COALESCE($5, image_url),
         bundle_price = COALESCE($6, bundle_price),
         is_active = COALESCE($7, is_active),
         is_hidden = COALESCE($8, is_hidden),
         sort_order = COALESCE($9, sort_order),
         starts_at = COALESCE($10, starts_at),
         ends_at = COALESCE($11, ends_at),
         updated_at = now()
     WHERE id = $1
     RETURNING id`,
    [
      bid,
      name ? String(name).trim() : null,
      slug ? String(slug).trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-') : null,
      description !== undefined ? (description ? String(description).trim() : null) : undefined,
      imageUrl !== undefined ? (imageUrl ? String(imageUrl).trim() : null) : undefined,
      price != null ? Math.trunc(price) : null,
      isActive != null ? Boolean(isActive) : null,
      isHidden != null ? Boolean(isHidden) : null,
      sortOrder != null && Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : null,
      startsAt !== undefined ? (startsAt || null) : undefined,
      endsAt !== undefined ? (endsAt || null) : undefined,
    ],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  if (Array.isArray(items)) {
    await _replaceBundleItems(bid, items)
  }
  return bid
}


export async function adminDeleteBundle(id) {
  const bid = Number(id)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_id')
  const res = await query(`DELETE FROM product_bundles WHERE id = $1`, [bid])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
}
