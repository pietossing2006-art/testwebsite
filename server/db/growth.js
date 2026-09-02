import { resolveDiscountQuote } from '../lib/growthDiscounts.js'
import { buildGrowthEventKey, normalizeNotificationPreferences, renderGrowthNotification } from '../lib/growthNotifications.js'
import { all, get, pool, query } from './pool.js'
import { getBundleById, getProductById, resolveProductOption } from './catalog.js'
import { cleanupExpiredAdminEntries } from './support.js'

function growthPositiveInt(value, errorCode = 'invalid_id') {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(errorCode)
  return Math.trunc(n)
}


function growthLimit(value, fallback = 50, max = 200) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(max, Math.trunc(n))
}


function growthOffset(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.trunc(n)
}


function campaignPrimaryLink(targets = []) {
  const first = Array.isArray(targets) ? targets[0] : null
  if (first?.target_type === 'product') return `/product/${first.target_id}`
  if (first?.target_type === 'bundle') return `/bundle/${first.target_id}`
  return '/categories'
}


async function loadCampaignTargets(campaignIds, client = null) {
  const ids = [...new Set((campaignIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
  if (ids.length === 0) return new Map()
  const runner = client ? (sql, params) => client.query(sql, params).then((res) => res.rows) : all
  const targets = await runner(
    `SELECT campaign_id, target_type, target_id, sort_order
     FROM growth_campaign_targets
     WHERE campaign_id = ANY($1::bigint[])
     ORDER BY campaign_id ASC, sort_order ASC, id ASC`,
    [ids],
  )
  const byCampaign = new Map(ids.map((id) => [Number(id), []]))
  for (const target of targets) {
    const campaignId = Number(target.campaign_id)
    if (!byCampaign.has(campaignId)) byCampaign.set(campaignId, [])
    byCampaign.get(campaignId).push(target)
  }
  return byCampaign
}


async function attachCampaignTargets(campaigns, client = null) {
  const rows = Array.isArray(campaigns) ? campaigns : []
  const targetsByCampaign = await loadCampaignTargets(rows.map((campaign) => campaign.id), client)
  return rows.map((campaign) => {
    const targets = targetsByCampaign.get(Number(campaign.id)) || []
    return { ...campaign, targets, primary_link: campaignPrimaryLink(targets) }
  })
}


async function replaceCampaignTargetsTx(client, campaignId, targets = []) {
  await client.query('DELETE FROM growth_campaign_targets WHERE campaign_id = $1', [campaignId])
  for (const target of Array.isArray(targets) ? targets : []) {
    await client.query(
      `INSERT INTO growth_campaign_targets (campaign_id, target_type, target_id, sort_order)
       VALUES ($1,$2,$3,$4)`,
      [campaignId, target.target_type, target.target_id, target.sort_order ?? 0],
    )
  }
}


function normalizeCampaignInput(input = {}) {
  return {
    kind: String(input.kind || 'flash_deal').trim(),
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    badge_text: String(input.badge_text || '').trim(),
    is_active: input.is_active == null ? true : Boolean(input.is_active),
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    discount_type: String(input.discount_type || 'none').trim(),
    discount_value: input.discount_value == null || input.discount_value === '' ? null : Math.trunc(Number(input.discount_value)),
    quantity_limit: input.quantity_limit == null || input.quantity_limit === '' ? null : Math.trunc(Number(input.quantity_limit)),
    vip_early_access_tier: input.vip_early_access_tier || null,
    targets: Array.isArray(input.targets) ? input.targets : [],
  }
}


function normalizeTierInput(input = {}) {
  return {
    code: String(input.code || '').trim().toLowerCase(),
    name: String(input.name || '').trim(),
    sort_order: Math.trunc(Number(input.sort_order) || 0),
    threshold_points_spent: Math.max(0, Math.trunc(Number(input.threshold_points_spent) || 0)),
    discount_percent: Math.max(0, Math.min(5, Math.trunc(Number(input.discount_percent) || 0))),
    priority_support: Boolean(input.priority_support),
    early_access_minutes: Math.max(0, Math.trunc(Number(input.early_access_minutes) || 0)),
    badge_label: String(input.badge_label || '').trim(),
    is_active: input.is_active == null ? true : Boolean(input.is_active),
  }
}


export function computeDiscountedUnitPrice({ unitPrice, percent, amount }) {
  const up = Number(unitPrice)
  if (!Number.isFinite(up) || up < 0) return { finalUnitPrice: 0, discountPoints: 0 }

  const pct = Number(percent)
  const amt = Number(amount)
  let discount = 0
  if (Number.isFinite(pct) && pct > 0) discount = Math.floor((up * pct) / 100)
  else if (Number.isFinite(amt) && amt > 0) discount = Math.floor(amt)

  discount = Math.max(0, Math.min(up, discount))
  return { finalUnitPrice: up - discount, discountPoints: discount }
}


export async function getActivePromotionForProduct(client, productId) {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) return null
  const res = await client.query(
    `SELECT pp.id, pp.title, pp.discount_percent, pp.discount_amount_points,
            pp.starts_at, pp.ends_at, pp.scope, pp.category_id,
            pp.min_spend_points, pp.max_discount_points, pp.badge_text, pp.is_flash_sale
     FROM product_promotions pp
     LEFT JOIN products p ON p.id = $1
     WHERE pp.is_active = true
       AND (pp.starts_at IS NULL OR pp.starts_at <= now())
       AND (pp.ends_at IS NULL OR pp.ends_at >= now())
       AND (
         (pp.scope = 'product' AND pp.product_id = $1)
         OR (pp.scope = 'category' AND pp.category_id = p.category_id)
         OR (pp.scope = 'all')
         OR (pp.product_id = $1)
       )
     ORDER BY
       CASE
         WHEN pp.scope = 'product' OR pp.product_id = $1 THEN 1
         WHEN pp.scope = 'category' THEN 2
         ELSE 3
       END ASC,
       COALESCE(pp.discount_percent, 0) DESC,
       COALESCE(pp.discount_amount_points, 0) DESC,
       pp.id DESC
     LIMIT 1`,
    [pid],
  )
  return res.rows?.[0] ?? null
}


export function promotionToDiscountCandidate(promo) {
  if (!promo) return null
  return {
    source_type: 'product_promotion',
    source_id: promo.id,
    source_code: promo.is_flash_sale ? 'flash_sale' : 'product_promotion',
    label: promo.badge_text || promo.title || 'Product promotion',
    discount_percent: promo.discount_percent,
    discount_amount_points: promo.discount_amount_points,
    min_spend_points: promo.min_spend_points,
    max_discount_points: promo.max_discount_points,
    metadata: {
      is_flash_sale: Boolean(promo.is_flash_sale),
      badge_text: promo.badge_text || null,
      scope: promo.scope || 'product',
      starts_at: promo.starts_at || null,
      ends_at: promo.ends_at || null,
    },
  }
}


export function couponToDiscountCandidate(coupon) {
  if (!coupon) return null
  return {
    source_type: 'coupon',
    source_id: coupon.id,
    source_code: coupon.code,
    label: coupon.title || coupon.code || 'Coupon',
    discount_percent: coupon.discount_percent,
    discount_amount_points: coupon.discount_amount_points,
  }
}


export function vipToDiscountCandidate(vip) {
  if (!vip?.tier || Number(vip.tier.discount_percent || 0) <= 0) return null
  return {
    source_type: 'vip',
    source_id: vip.tier.id,
    source_code: vip.tier.code,
    label: vip.tier.name || vip.tier.code || 'VIP',
    discount_percent: Math.min(5, Math.max(0, Number(vip.tier.discount_percent || 0))),
  }
}


export function campaignToDiscountCandidate(campaign) {
  if (!campaign || campaign.discount_type === 'none') return null
  return {
    source_type: 'growth_campaign',
    source_id: campaign.id,
    source_code: campaign.kind,
    label: campaign.title || 'Growth campaign',
    discount_percent: campaign.discount_type === 'percent' ? campaign.discount_value : null,
    discount_amount_points: campaign.discount_type === 'amount_points' ? campaign.discount_value : null,
  }
}


export async function insertOrderDiscountApplications(client, { orderId, orderItemId = null, quote }) {
  const applied = Array.isArray(quote?.discounts_applied) ? quote.discounts_applied : []
  for (let index = 0; index < applied.length; index += 1) {
    const item = applied[index]
    await client.query(
      `INSERT INTO order_discount_applications (
         order_id, order_item_id, source_type, source_id, source_code, label,
         amount_points, sort_order, metadata_json
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        orderId,
        orderItemId,
        item.source_type,
        item.source_id,
        item.source_code,
        item.label,
        item.amount_points,
        index,
        JSON.stringify(item.metadata || {}),
      ],
    )
  }
}


function _validateCouponRow(c) {
  if (!c) throw new Error('invalid_coupon')
  if (!c.is_active) throw new Error('invalid_coupon')
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) throw new Error('coupon_expired')
  if (c.max_uses != null && Number.isFinite(Number(c.max_uses)) && Number(c.max_uses) > 0 && Number(c.used_count ?? 0) >= Number(c.max_uses)) {
    throw new Error('coupon_exhausted')
  }
  return c
}


export async function readAndValidateDiscountCoupon(client, codeRaw) {
  const code = typeof codeRaw === 'string' ? codeRaw.trim().toUpperCase() : ''
  if (!code) return null
  const res = await client.query(
    `SELECT id, code, title, discount_percent, discount_amount_points, max_uses, used_count, expires_at, is_active
     FROM discount_coupons
     WHERE code = $1`,
    [code],
  )
  return _validateCouponRow(res.rows?.[0])
}


export async function lockAndValidateDiscountCoupon(client, codeRaw) {
  const code = typeof codeRaw === 'string' ? codeRaw.trim().toUpperCase() : ''
  if (!code) return null
  const res = await client.query(
    `SELECT id, code, title, discount_percent, discount_amount_points, max_uses, used_count, expires_at, is_active
     FROM discount_coupons
     WHERE code = $1
     FOR UPDATE`,
    [code],
  )
  return _validateCouponRow(res.rows?.[0])
}


export function volumePricingToDiscountCandidate(product, qty) {
  if (!product) return null
  const vp = Array.isArray(product.volume_pricing) ? product.volume_pricing : []
  if (vp.length === 0) return null
  const q = Number(qty) || 1
  const applicable = vp
    .map((t) => ({
      min_qty: Number(t?.min_qty),
      discount_percent: Number(t?.discount_percent || 0),
      discount_amount_points: Number(t?.discount_amount_points || 0),
    }))
    .filter((t) => Number.isFinite(t.min_qty) && t.min_qty > 1 && q >= t.min_qty)
    .sort((a, b) => b.min_qty - a.min_qty)

  if (applicable.length === 0) return null
  const best = applicable[0]
  return {
    source_type: 'volume_pricing',
    source_id: null,
    source_code: `VOLUME_${best.min_qty}`,
    label: `ราคาส่ง (ซื้อ ${best.min_qty}+ ชิ้น)`,
    discount_percent: best.discount_percent > 0 ? best.discount_percent : null,
    discount_amount_points: best.discount_amount_points > 0 ? best.discount_amount_points : null,
  }
}


export async function listCoupons({ limit = 200, offset = 0 } = {}) {
  await cleanupExpiredAdminEntries()
  return all(
    `SELECT id, code, points, max_uses, used_count, expires_at, is_active, created_at, updated_at
     FROM coupons
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}


export async function createCoupon({ code, points, maxUses, expiresAt, isActive }) {
  const c = String(code ?? '').trim()
  if (!c) throw new Error('invalid_code')
  const p = Number(points)
  if (!Number.isFinite(p) || p <= 0) throw new Error('invalid_points')
  const m = maxUses == null || maxUses === '' ? null : Number(maxUses)
  if (m != null && (!Number.isFinite(m) || m <= 0)) throw new Error('invalid_max_uses')

  const res = await query(
    `INSERT INTO coupons (code, points, max_uses, expires_at, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id`,
    [c, p, m, expiresAt ?? null, isActive == null ? true : Boolean(isActive)],
  )
  return res.rows[0].id
}


export async function updateCoupon({ id, points, maxUses, usedCount, expiresAt, isActive }) {
  const cid = Number(id)
  if (!Number.isFinite(cid)) throw new Error('invalid_id')
  const p = points == null || points === '' ? null : Number(points)
  if (p != null && (!Number.isFinite(p) || p <= 0)) throw new Error('invalid_points')
  const m = maxUses == null || maxUses === '' ? null : Number(maxUses)
  if (m != null && (!Number.isFinite(m) || m <= 0)) throw new Error('invalid_max_uses')
  const u = usedCount == null || usedCount === '' ? null : Number(usedCount)
  if (u != null && (!Number.isFinite(u) || u < 0)) throw new Error('invalid_used_count')

  await query(
    `UPDATE coupons
     SET points = COALESCE($2, points),
         max_uses = $3,
         used_count = COALESCE($4, used_count),
         expires_at = $5,
         is_active = COALESCE($6, is_active),
         updated_at = now()
     WHERE id = $1`,
    [cid, p, m, u, expiresAt ?? null, isActive == null ? null : Boolean(isActive)],
  )
}


export async function deleteCoupon(id) {
  const cid = Number(id)
  if (!Number.isFinite(cid)) throw new Error('invalid_id')
  await query('DELETE FROM coupons WHERE id = $1', [cid])
}


export async function redeemCoupon({ userId, code }) {
  const uid = Number(userId)
  const c = String(code ?? '').trim()
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!c) throw new Error('invalid_code')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const couponRes = await client.query(
      `SELECT id, code, points, max_uses, used_count, expires_at, is_active
       FROM coupons
       WHERE lower(code) = lower($1)
       FOR UPDATE`,
      [c],
    )
    const coupon = couponRes.rows?.[0]
    if (!coupon) {
      await client.query('ROLLBACK')
      throw new Error('coupon_not_found')
    }
    if (!coupon.is_active) {
      await client.query('ROLLBACK')
      throw new Error('coupon_inactive')
    }
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK')
      throw new Error('coupon_expired')
    }
    if (coupon.max_uses != null && Number(coupon.used_count) >= Number(coupon.max_uses)) {
      await client.query('ROLLBACK')
      throw new Error('coupon_exhausted')
    }

    const points = Number(coupon.points)
    if (!Number.isFinite(points) || points <= 0) {
      await client.query('ROLLBACK')
      throw new Error('invalid_points')
    }

    const redemptionRes = await client.query(
      `INSERT INTO coupon_redemptions (coupon_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (coupon_id, user_id) DO NOTHING
       RETURNING id`,
      [coupon.id, uid],
    )
    if (redemptionRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('coupon_already_used')
    }

    const refId = `coupon:${coupon.id}:user:${uid}`
    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, 'coupon', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, points, refId],
    )

    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate')
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [uid],
    )
    await client.query(
      `UPDATE wallets
       SET balance = balance + $1, updated_at = now()
       WHERE user_id = $2`,
      [points, uid],
    )

    await client.query(
      `UPDATE coupons
       SET used_count = used_count + 1, updated_at = now()
       WHERE id = $1`,
      [coupon.id],
    )

    await client.query('COMMIT')
    return { ok: true, points, code: coupon.code }
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


export async function adminListProductPromotions({ productId, limit = 50, offset = 0 } = {}) {
  await cleanupExpiredAdminEntries()
  const pid = productId == null || productId === '' ? null : Number(productId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 200) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  if (pid != null) {
    if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
    return all(
      `SELECT pp.*, p.name AS product_name, p.image_url AS product_image_url, c.name AS category_name
       FROM product_promotions pp
       LEFT JOIN products p ON p.id = pp.product_id
       LEFT JOIN categories c ON c.id = pp.category_id
       WHERE pp.product_id = $1
       ORDER BY pp.id DESC
       LIMIT $2 OFFSET $3`,
      [pid, lim, off],
    )
  }

  return all(
    `SELECT pp.*, p.name AS product_name, p.image_url AS product_image_url, c.name AS category_name
     FROM product_promotions pp
     LEFT JOIN products p ON p.id = pp.product_id
     LEFT JOIN categories c ON c.id = pp.category_id
     ORDER BY pp.id DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}


export async function adminCreateProductPromotion({
  productId,
  scope = 'product',
  categoryId,
  title,
  discountPercent,
  discountAmountPoints,
  minSpendPoints,
  maxDiscountPoints,
  badgeText,
  isFlashSale,
  startsAt,
  endsAt,
  isActive,
}) {
  const sc = ['product', 'category', 'all'].includes(scope) ? scope : 'product'
  const pid = sc === 'product' ? Number(productId) : null
  if (sc === 'product' && (!Number.isFinite(pid) || pid <= 0)) throw new Error('invalid_product_id')
  const cid = sc === 'category' ? Number(categoryId) : null
  if (sc === 'category' && (!Number.isFinite(cid) || cid <= 0)) throw new Error('invalid_category_id')

  const t = typeof title === 'string' && title.trim() ? title.trim() : null
  const dp = discountPercent == null || discountPercent === '' ? null : Number(discountPercent)
  const da = discountAmountPoints == null || discountAmountPoints === '' ? null : Number(discountAmountPoints)
  if (dp == null && da == null) throw new Error('invalid_discount')
  if (dp != null && (!Number.isFinite(dp) || dp <= 0 || dp > 95)) throw new Error('invalid_discount_percent')
  if (da != null && (!Number.isFinite(da) || da <= 0)) throw new Error('invalid_discount_amount')

  const minSp = minSpendPoints == null || minSpendPoints === '' ? 0 : Math.max(0, Number(minSpendPoints) || 0)
  const maxDc = maxDiscountPoints == null || maxDiscountPoints === '' ? null : Math.max(0, Number(maxDiscountPoints) || 0)
  const bt = typeof badgeText === 'string' && badgeText.trim() ? badgeText.trim() : null

  const res = await query(
    `INSERT INTO product_promotions (
       product_id, scope, category_id, title, discount_percent, discount_amount_points,
       min_spend_points, max_discount_points, badge_text, is_flash_sale,
       starts_at, ends_at, is_active, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
     RETURNING id`,
    [
      pid,
      sc,
      cid,
      t,
      dp == null ? null : Math.trunc(dp),
      da == null ? null : Math.trunc(da),
      minSp,
      maxDc,
      bt,
      Boolean(isFlashSale),
      startsAt ?? null,
      endsAt ?? null,
      isActive == null ? true : Boolean(isActive),
    ],
  )
  return res.rows[0].id
}


export async function adminUpdateProductPromotion({
  id,
  productId,
  scope,
  categoryId,
  title,
  discountPercent,
  discountAmountPoints,
  minSpendPoints,
  maxDiscountPoints,
  badgeText,
  isFlashSale,
  startsAt,
  endsAt,
  isActive,
}) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')

  const t = title == null ? null : String(title).trim()
  const dp = discountPercent == null || discountPercent === '' ? null : Number(discountPercent)
  const da = discountAmountPoints == null || discountAmountPoints === '' ? null : Number(discountAmountPoints)
  if (dp != null && (!Number.isFinite(dp) || dp <= 0 || dp > 95)) throw new Error('invalid_discount_percent')
  if (da != null && (!Number.isFinite(da) || da <= 0)) throw new Error('invalid_discount_amount')

  const sc = scope ? (['product', 'category', 'all'].includes(scope) ? scope : 'product') : null
  const pid = sc === 'product' ? Number(productId) : sc ? null : undefined
  const cid = sc === 'category' ? Number(categoryId) : sc ? null : undefined
  const minSp = minSpendPoints === '' ? 0 : minSpendPoints != null ? Math.max(0, Number(minSpendPoints) || 0) : null
  const maxDc = maxDiscountPoints === '' ? null : maxDiscountPoints != null ? Math.max(0, Number(maxDiscountPoints) || 0) : null
  const bt = badgeText == null ? null : String(badgeText).trim()

  const res = await query(
    `UPDATE product_promotions
     SET title = COALESCE($2, title),
         discount_percent = CASE WHEN $3::int IS NOT NULL THEN $3 ELSE discount_percent END,
         discount_amount_points = CASE WHEN $4::int IS NOT NULL THEN $4 ELSE discount_amount_points END,
         starts_at = $5,
         ends_at = $6,
         is_active = COALESCE($7, is_active),
         scope = COALESCE($8, scope),
         product_id = CASE WHEN $8 IS NOT NULL THEN $9::bigint ELSE product_id END,
         category_id = CASE WHEN $8 IS NOT NULL THEN $10::bigint ELSE category_id END,
         min_spend_points = COALESCE($11, min_spend_points),
         max_discount_points = CASE WHEN $12::int IS NOT NULL THEN $12 ELSE max_discount_points END,
         badge_text = COALESCE($13, badge_text),
         is_flash_sale = COALESCE($14, is_flash_sale),
         updated_at = now()
     WHERE id = $1
     RETURNING id`,
    [
      mid,
      t === '' ? null : t,
      dp == null ? null : Math.trunc(dp),
      da == null ? null : Math.trunc(da),
      startsAt ?? null,
      endsAt ?? null,
      isActive == null ? null : Boolean(isActive),
      sc,
      pid,
      cid,
      minSp,
      maxDc,
      bt === '' ? null : bt,
      isFlashSale == null ? null : Boolean(isFlashSale),
    ],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return res.rows[0].id
}


export async function adminToggleProductPromotion(id, isActive) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  const res = await query(
    `UPDATE product_promotions SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [mid, Boolean(isActive)],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return res.rows[0]
}


export async function adminDeleteProductPromotion(id) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  const res = await query('DELETE FROM product_promotions WHERE id=$1', [mid])
  return { ok: true, deleted: res.rowCount ?? 0 }
}


export async function adminListDiscountCoupons({ limit = 200, offset = 0 } = {}) {
  await cleanupExpiredAdminEntries()
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  return all(
    `SELECT id, code, title, discount_percent, discount_amount_points, max_uses, used_count, expires_at, is_active, created_at, updated_at
     FROM discount_coupons
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}


export async function adminCreateDiscountCoupon({ code, title, discountPercent, discountAmountPoints, maxUses, expiresAt, isActive }) {
  const c = String(code ?? '').trim().toUpperCase()
  if (!c) throw new Error('invalid_code')
  const t = typeof title === 'string' && title.trim() ? title.trim() : null
  const dp = discountPercent == null || discountPercent === '' ? null : Number(discountPercent)
  const da = discountAmountPoints == null || discountAmountPoints === '' ? null : Number(discountAmountPoints)
  if (dp == null && da == null) throw new Error('invalid_discount')
  if (dp != null && (!Number.isFinite(dp) || dp <= 0 || dp > 95)) throw new Error('invalid_discount_percent')
  if (da != null && (!Number.isFinite(da) || da <= 0)) throw new Error('invalid_discount_amount')
  const m = maxUses == null || maxUses === '' ? null : Number(maxUses)
  if (m != null && (!Number.isFinite(m) || m <= 0)) throw new Error('invalid_max_uses')

  const res = await query(
    `INSERT INTO discount_coupons (code, title, discount_percent, discount_amount_points, max_uses, expires_at, is_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     RETURNING id`,
    [
      c,
      t,
      dp == null ? null : Math.trunc(dp),
      da == null ? null : Math.trunc(da),
      m,
      expiresAt ?? null,
      isActive == null ? true : Boolean(isActive),
    ],
  )
  return res.rows[0].id
}


export async function adminUpdateDiscountCoupon({ id, title, discountPercent, discountAmountPoints, maxUses, usedCount, expiresAt, isActive }) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_id')
  const t = title == null ? null : String(title).trim()
  const dp = discountPercent == null || discountPercent === '' ? null : Number(discountPercent)
  const da = discountAmountPoints == null || discountAmountPoints === '' ? null : Number(discountAmountPoints)
  if (dp != null && (!Number.isFinite(dp) || dp <= 0 || dp > 95)) throw new Error('invalid_discount_percent')
  if (da != null && (!Number.isFinite(da) || da <= 0)) throw new Error('invalid_discount_amount')
  if (dp == null && da == null) throw new Error('invalid_discount')
  const m = maxUses == null || maxUses === '' ? null : Number(maxUses)
  if (m != null && (!Number.isFinite(m) || m <= 0)) throw new Error('invalid_max_uses')
  const u = usedCount == null || usedCount === '' ? null : Number(usedCount)
  if (u != null && (!Number.isFinite(u) || u < 0)) throw new Error('invalid_used_count')

  const res = await query(
    `UPDATE discount_coupons
     SET title = $2,
         discount_percent = $3,
         discount_amount_points = $4,
         max_uses = $5,
         used_count = COALESCE($6, used_count),
         expires_at = $7,
         is_active = COALESCE($8, is_active),
         updated_at = now()
     WHERE id = $1`,
    [
      cid,
      t === '' ? null : t,
      dp == null ? null : Math.trunc(dp),
      da == null ? null : Math.trunc(da),
      m,
      u,
      expiresAt ?? null,
      isActive == null ? null : Boolean(isActive),
    ],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}


export async function adminDeleteDiscountCoupon(id) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_id')
  const res = await query('DELETE FROM discount_coupons WHERE id=$1', [cid])
  return { ok: true, deleted: res.rowCount ?? 0 }
}


export async function listMyWishlist(userId) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const items = await all(
    `SELECT wi.product_id, wi.notify_stock, wi.notify_promo, wi.notify_campaign, wi.created_at,
            p.name, p.slug, p.image_url, p.stock, p.is_unlimited_stock, p.is_hidden,
            CASE
              WHEN p.is_hidden THEN 'hidden'
              WHEN p.is_unlimited_stock THEN 'available'
              WHEN COALESCE(p.stock, 0) > 0 THEN 'available'
              ELSE 'out_of_stock'
            END AS stock_status
     FROM wishlist_items wi
     JOIN products p ON p.id = wi.product_id
     WHERE wi.user_id = $1
       AND p.is_hidden = false
     ORDER BY wi.created_at DESC`,
    [uid],
  )
  return { items }
}


export async function upsertWishlistItem({ userId, product_id, productId, notify_stock = true, notify_promo = true, notify_campaign = true }) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const pid = growthPositiveInt(product_id ?? productId, 'invalid_product_id')
  const product = await get('SELECT id FROM products WHERE id = $1 AND is_hidden = false', [pid])
  if (!product) throw new Error('not_found')
  return get(
    `INSERT INTO wishlist_items (user_id, product_id, notify_stock, notify_promo, notify_campaign, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET notify_stock = EXCLUDED.notify_stock,
                   notify_promo = EXCLUDED.notify_promo,
                   notify_campaign = EXCLUDED.notify_campaign,
                   updated_at = now()
     RETURNING user_id, product_id, notify_stock, notify_promo, notify_campaign, created_at, updated_at`,
    [uid, pid, Boolean(notify_stock), Boolean(notify_promo), Boolean(notify_campaign)],
  )
}


export async function deleteWishlistItem({ userId, productId }) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const pid = growthPositiveInt(productId, 'invalid_product_id')
  await query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [uid, pid])
  return { ok: true }
}


export async function getNotificationPreferences(userId) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const row = await get('SELECT wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled FROM user_notification_preferences WHERE user_id = $1', [uid])
  return normalizeNotificationPreferences(row)
}


export async function updateNotificationPreferences({ userId, preferences }) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const next = normalizeNotificationPreferences(preferences)
  return get(
    `INSERT INTO user_notification_preferences (user_id, wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (user_id)
     DO UPDATE SET wishlist_stock = EXCLUDED.wishlist_stock,
                   wishlist_promo = EXCLUDED.wishlist_promo,
                   campaigns = EXCLUDED.campaigns,
                   vip = EXCLUDED.vip,
                   reviews = EXCLUDED.reviews,
                   push_enabled = EXCLUDED.push_enabled,
                   updated_at = now()
     RETURNING wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled`,
    [uid, next.wishlist_stock, next.wishlist_promo, next.campaigns, next.vip, next.reviews, next.push_enabled],
  )
}


export async function listProductReviewsPublic({ productId, limit = 20, offset = 0 }) {
  const pid = growthPositiveInt(productId, 'invalid_product_id')
  const lim = growthLimit(limit, 20, 100)
  const off = growthOffset(offset)
  const reviews = await all(
    `SELECT pr.id, pr.rating, pr.comment, pr.created_at,
            COALESCE(NULLIF(pr.reviewer_name, ''), u.display_name, u.username, 'ผู้ซื้อ') AS reviewer_name,
            u.avatar_url AS reviewer_avatar,
            u.role AS reviewer_role,
            true AS is_verified_buyer
     FROM product_reviews pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.product_id = $1 AND pr.status = 'approved'
     ORDER BY pr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [pid, lim, off],
  )
  const summary = await get(
    `SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average_rating,
            COUNT(*)::int AS review_count,
            COUNT(*) FILTER (WHERE rating = 5)::int AS stars_5,
            COUNT(*) FILTER (WHERE rating = 4)::int AS stars_4,
            COUNT(*) FILTER (WHERE rating = 3)::int AS stars_3,
            COUNT(*) FILTER (WHERE rating = 2)::int AS stars_2,
            COUNT(*) FILTER (WHERE rating = 1)::int AS stars_1
     FROM product_reviews
     WHERE product_id = $1 AND status = 'approved'`,
    [pid],
  )
  return { summary, reviews }
}


export async function createProductReview({ userId, productId, reviewer_name, rating, comment }) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const pid = growthPositiveInt(productId, 'invalid_product_id')
  const rate = Number(rating)
  const text = String(comment || '').trim()
  if (!Number.isFinite(rate) || rate < 1 || rate > 5) throw new Error('invalid_rating')
  if (!text) throw new Error('invalid_comment')

  const user = await get('SELECT display_name, username FROM users WHERE id = $1', [uid])
  const reviewerName = String(reviewer_name || user?.display_name || user?.username || 'ผู้ซื้อ').trim().slice(0, 80)

  const eligible = await get(
    `SELECT oi.id, oi.order_id
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN product_reviews pr ON pr.order_item_id = oi.id
     WHERE oi.product_id = $1
       AND o.user_id = $2
       AND o.status IN ('paid', 'completed')
       AND pr.id IS NULL
     ORDER BY oi.id DESC
     LIMIT 1`,
    [pid, uid],
  )
  if (!eligible) {
    const reviewed = await get(
      `SELECT pr.id
       FROM product_reviews pr
       JOIN order_items oi ON oi.id = pr.order_item_id
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = $1
         AND o.user_id = $2
         AND o.status IN ('paid', 'completed')
       LIMIT 1`,
      [pid, uid],
    )
    if (reviewed) throw new Error('review_exists')
    throw new Error('review_not_allowed')
  }
  try {
    return await get(
      `INSERT INTO product_reviews (user_id, product_id, order_id, order_item_id, reviewer_name, rating, comment, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'approved')
       RETURNING id, status, created_at`,
      [uid, pid, eligible.order_id, eligible.id, reviewerName, Math.trunc(rate), text],
    )
  } catch (error) {
    if (error?.code === '23505') throw new Error('review_exists')
    throw error
  }
}


export async function listActiveGrowthCampaigns({ targetType, targetId } = {}) {
  const type = String(targetType || '').trim()
  const tid = targetId == null || targetId === '' ? null : Number(targetId)
  const params = []
  let targetClause = ''
  if (type && Number.isFinite(tid) && tid > 0) {
    params.push(type, Math.trunc(tid))
    targetClause = `AND EXISTS (
      SELECT 1 FROM growth_campaign_targets t
      WHERE t.campaign_id = gc.id AND t.target_type = $1 AND t.target_id = $2
    )`
  }
  const campaigns = await all(
    `SELECT gc.*
     FROM growth_campaigns gc
     WHERE gc.is_active = true
       AND (gc.starts_at IS NULL OR gc.starts_at <= now())
       AND (gc.ends_at IS NULL OR gc.ends_at >= now())
       AND (gc.quantity_limit IS NULL OR gc.quantity_used < gc.quantity_limit)
       ${targetClause}
     ORDER BY gc.created_at DESC
     LIMIT 50`,
    params,
  )
  return { campaigns: await attachCampaignTargets(campaigns) }
}


export async function recalculateVipForUser(userId) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const spending = await get(
    `SELECT COALESCE(SUM(total_points), 0)::int AS points_spent
     FROM orders
     WHERE user_id = $1 AND status IN ('paid', 'completed')`,
    [uid],
  )
  const pointsSpent = Number(spending?.points_spent || 0)
  const user = await get(`SELECT id, custom_vip_tier_id FROM users WHERE id = $1`, [uid])

  let tier = null
  if (user?.custom_vip_tier_id) {
    tier = await get(`SELECT * FROM vip_tiers WHERE id = $1 AND is_active = true`, [user.custom_vip_tier_id])
  }
  if (!tier) {
    tier = await get(
      `SELECT *
       FROM vip_tiers
       WHERE is_active = true AND threshold_points_spent <= $1
       ORDER BY threshold_points_spent DESC, sort_order DESC, id DESC
       LIMIT 1`,
      [pointsSpent],
    )
  }
  const currentThreshold = Number(tier?.threshold_points_spent || 0)
  const nextTier = await get(
    `SELECT *
     FROM vip_tiers
     WHERE is_active = true AND threshold_points_spent > $1
     ORDER BY threshold_points_spent ASC, sort_order ASC, id ASC
     LIMIT 1`,
    [Math.max(pointsSpent, currentThreshold)],
  )
  await query(
    `INSERT INTO vip_user_snapshots (user_id, tier_id, points_spent, next_tier_id, next_threshold_points, calculated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id)
     DO UPDATE SET tier_id = EXCLUDED.tier_id,
                   points_spent = EXCLUDED.points_spent,
                   next_tier_id = EXCLUDED.next_tier_id,
                   next_threshold_points = EXCLUDED.next_threshold_points,
                   calculated_at = now()`,
    [uid, tier?.id ?? null, pointsSpent, nextTier?.id ?? null, nextTier?.threshold_points_spent ?? null],
  )
  return { tier, points_spent: pointsSpent, next_tier: nextTier, next_threshold_points: nextTier?.threshold_points_spent ?? null }
}


export async function adminSetUserVipTier({ userId, tierId } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const tid = tierId ? Number(tierId) : null
  await query(`UPDATE users SET custom_vip_tier_id = $2 WHERE id = $1`, [uid, tid])
  return recalculateVipForUser(uid)
}


export async function getMyVip(userId) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')

  // Auto seed default VIP tiers if table is empty
  const countRes = await get('SELECT COUNT(*)::int AS c FROM vip_tiers')
  if ((countRes?.c ?? 0) === 0) {
    await query(`
      INSERT INTO vip_tiers (code, name, sort_order, threshold_points_spent, discount_percent, priority_support, early_access_minutes, badge_label, is_active, benefits_json)
      VALUES
        ('bronze', 'VIP Bronze', 1, 500, 1, false, 0, 'Bronze', true, '["ส่วนลดสินค้า 1%", "ตราสัญลักษณ์ VIP Bronze"]'::jsonb),
        ('silver', 'VIP Silver', 2, 2000, 2, true, 5, 'Silver', true, '["ส่วนลดสินค้า 2%", "ช่องทางซัพพอร์ตพิเศษ", "ตราสัญลักษณ์ VIP Silver"]'::jsonb),
        ('gold', 'VIP Gold', 3, 5000, 3, true, 15, 'Gold', true, '["ส่วนลดสินค้า 3%", "ซัพพอร์ตด่วนพิเศษ Priority", "สิทธิ์ Flash Sale ก่อน 15 นาที", "ตราสัญลักษณ์ VIP Gold"]'::jsonb),
        ('platinum', 'VIP Platinum', 4, 15000, 4, true, 30, 'Platinum', true, '["ส่วนลดสินค้า 4%", "ซัพพอร์ตระดับ Exclusive", "สิทธิ์ Flash Sale ก่อน 30 นาที", "ตราสัญลักษณ์ VIP Platinum"]'::jsonb),
        ('diamond', 'VIP Diamond', 5, 50000, 5, true, 60, 'Diamond', true, '["ส่วนลดสินค้า 5% ทุกรายการ (สูงสุด)", "ซัพพอร์ตส่วนตัว 24 ชม.", "สิทธิ์สินค้าลิมิเต็ดก่อน 1 ชม.", "ตราสัญลักษณ์ VIP Diamond หรูหรา"]'::jsonb)
      ON CONFLICT (code) DO NOTHING
    `)
  }

  const snapshot = await recalculateVipForUser(uid)
  const allTiers = await all(
    `SELECT * FROM vip_tiers WHERE is_active = true ORDER BY threshold_points_spent ASC, sort_order ASC, id ASC`
  )
  return {
    ...snapshot,
    all_tiers: allTiers,
  }
}


export async function adminListGrowthCampaigns({ limit = 100, offset = 0 } = {}) {
  const campaigns = await all(
    `SELECT *
     FROM growth_campaigns
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [growthLimit(limit, 100, 500), growthOffset(offset)],
  )
  return { campaigns: await attachCampaignTargets(campaigns) }
}


export async function adminCreateGrowthCampaign(input = {}) {
  const data = normalizeCampaignInput(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO growth_campaigns (
         kind, title, description, badge_text, is_active, starts_at, ends_at,
         discount_type, discount_value, quantity_limit, vip_early_access_tier, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
       RETURNING *`,
      [
        data.kind,
        data.title,
        data.description,
        data.badge_text,
        data.is_active,
        data.starts_at,
        data.ends_at,
        data.discount_type,
        data.discount_value,
        data.quantity_limit,
        data.vip_early_access_tier,
      ],
    )
    const campaign = inserted.rows[0]
    await replaceCampaignTargetsTx(client, campaign.id, data.targets)
    await client.query('COMMIT')
    const [withTargets] = await attachCampaignTargets([campaign])
    return withTargets
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw error
  } finally {
    client.release()
  }
}


export async function adminUpdateGrowthCampaign(input = {}) {
  const id = growthPositiveInt(input.id, 'invalid_id')
  const data = normalizeCampaignInput(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const updated = await client.query(
      `UPDATE growth_campaigns
       SET kind = $2,
           title = $3,
           description = $4,
           badge_text = $5,
           is_active = $6,
           starts_at = $7,
           ends_at = $8,
           discount_type = $9,
           discount_value = $10,
           quantity_limit = $11,
           vip_early_access_tier = $12,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        data.kind,
        data.title,
        data.description,
        data.badge_text,
        data.is_active,
        data.starts_at,
        data.ends_at,
        data.discount_type,
        data.discount_value,
        data.quantity_limit,
        data.vip_early_access_tier,
      ],
    )
    if ((updated.rowCount ?? 0) < 1) throw new Error('not_found')
    await replaceCampaignTargetsTx(client, id, data.targets)
    await client.query('COMMIT')
    const [withTargets] = await attachCampaignTargets([updated.rows[0]])
    return withTargets
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw error
  } finally {
    client.release()
  }
}


export async function adminDeleteGrowthCampaign(id) {
  const cid = growthPositiveInt(id, 'invalid_id')
  const res = await query('DELETE FROM growth_campaigns WHERE id = $1', [cid])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}


export async function adminListReviews({ status, limit = 100, offset = 0 } = {}) {
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const params = st ? [st, growthLimit(limit, 100, 500), growthOffset(offset)] : [growthLimit(limit, 100, 500), growthOffset(offset)]
  const where = st ? 'WHERE pr.status = $1' : ''
  const limitParam = st ? '$2' : '$1'
  const offsetParam = st ? '$3' : '$2'
  const reviews = await all(
    `SELECT pr.id, pr.user_id, pr.product_id, pr.order_id, pr.order_item_id, pr.rating,
            pr.comment, pr.status, pr.admin_note, pr.created_at, pr.updated_at,
            u.email AS user_email, COALESCE(NULLIF(pr.reviewer_name, ''), u.display_name, u.username, u.email) AS reviewer_name,
            p.name AS product_name, o.ref AS order_ref
     FROM product_reviews pr
     JOIN users u ON u.id = pr.user_id
     JOIN products p ON p.id = pr.product_id
     JOIN orders o ON o.id = pr.order_id
     ${where}
     ORDER BY pr.created_at DESC, pr.id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  )
  return { reviews }
}


export async function adminModerateReview({ id, status, adminNote, moderatorId }) {
  const reviewId = growthPositiveInt(id, 'invalid_id')
  const nextStatus = String(status || '').trim()
  if (!['pending', 'approved', 'hidden', 'rejected'].includes(nextStatus)) throw new Error('invalid_status')
  const res = await query(
    `UPDATE product_reviews
     SET status = $2,
         admin_note = $3,
         moderated_by = $4,
         moderated_at = now(),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [reviewId, nextStatus, adminNote == null ? null : String(adminNote), moderatorId ? Number(moderatorId) : null],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return res.rows[0]
}


export async function adminListVipTiers() {
  const tiers = await all(
    `SELECT *
     FROM vip_tiers
     ORDER BY threshold_points_spent ASC, sort_order ASC, id ASC`,
  )
  return { tiers }
}


export async function adminCreateVipTier(input = {}) {
  const tier = normalizeTierInput(input)
  return get(
    `INSERT INTO vip_tiers (
       code, name, sort_order, threshold_points_spent, discount_percent,
       priority_support, early_access_minutes, badge_label, is_active, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     RETURNING *`,
    [
      tier.code,
      tier.name,
      tier.sort_order,
      tier.threshold_points_spent,
      tier.discount_percent,
      tier.priority_support,
      tier.early_access_minutes,
      tier.badge_label,
      tier.is_active,
    ],
  )
}


export async function adminUpdateVipTier(input = {}) {
  const id = growthPositiveInt(input.id, 'invalid_id')
  const tier = normalizeTierInput(input)
  const row = await get(
    `UPDATE vip_tiers
     SET code = $2,
         name = $3,
         sort_order = $4,
         threshold_points_spent = $5,
         discount_percent = $6,
         priority_support = $7,
         early_access_minutes = $8,
         badge_label = $9,
         is_active = $10,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      tier.code,
      tier.name,
      tier.sort_order,
      tier.threshold_points_spent,
      tier.discount_percent,
      tier.priority_support,
      tier.early_access_minutes,
      tier.badge_label,
      tier.is_active,
    ],
  )
  if (!row) throw new Error('not_found')
  return row
}


export async function adminDeleteVipTier(id) {
  const tierId = growthPositiveInt(id, 'invalid_id')
  const res = await query('DELETE FROM vip_tiers WHERE id = $1', [tierId])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}


export async function adminListWishlistSignals({ limit = 50 } = {}) {
  const signals = await all(
    `SELECT wi.product_id,
            p.name AS product_name,
            p.slug,
            p.stock AS available_stock,
            p.is_unlimited_stock,
            COUNT(*)::int AS followers,
            COUNT(*) FILTER (WHERE wi.notify_stock)::int AS stock_followers,
            COUNT(*) FILTER (WHERE wi.notify_promo)::int AS promo_followers,
            COUNT(*) FILTER (WHERE wi.notify_campaign)::int AS campaign_followers
     FROM wishlist_items wi
     JOIN products p ON p.id = wi.product_id
     WHERE p.is_hidden = false
     GROUP BY wi.product_id, p.name, p.slug, p.stock, p.is_unlimited_stock
     ORDER BY followers DESC, wi.product_id ASC
     LIMIT $1`,
    [growthLimit(limit, 50, 500)],
  )
  return { signals }
}


export async function adminListGrowthNotifications({ limit = 100, offset = 0 } = {}) {
  const events = await all(
    `SELECT e.*,
            COALESCE(d.delivery_count, 0)::int AS delivery_count,
            COALESCE(d.delivered_count, 0)::int AS delivered_count,
            COALESCE(d.failed_count, 0)::int AS failed_count
     FROM growth_notification_events e
     LEFT JOIN (
       SELECT event_id,
              COUNT(*)::int AS delivery_count,
              COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_count,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
       FROM growth_notification_deliveries
       GROUP BY event_id
     ) d ON d.event_id = e.id
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $1 OFFSET $2`,
    [growthLimit(limit, 100, 500), growthOffset(offset)],
  )
  return { events }
}


export async function adminPreviewDiscounts({ target_type, target_id, targetType, targetId, qty = 1, product_option_id, productOptionId, coupon_code, couponCode, user_id, userId } = {}) {
  const type = String(target_type ?? targetType ?? '').trim()
  if (!['product', 'bundle'].includes(type)) throw new Error('invalid_target_type')
  const id = growthPositiveInt(target_id ?? targetId, 'invalid_target_id')
  const quantity = Math.max(1, Math.min(999, Math.trunc(Number(qty) || 1)))
  const uid = user_id ?? userId
  const candidates = []

  let originalUnitPrice = 0
  if (type === 'product') {
    const product = await getProductById(id)
    if (!product) throw new Error('not_found')
    const selectedOption = resolveProductOption({ product, productOptionId: product_option_id ?? productOptionId })
    originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
    const client = await pool.connect()
    try {
      const promo = await getActivePromotionForProduct(client, id)
      if (promo) {
        candidates.push({
          source_type: 'product_promotion',
          source_id: promo.id,
          label: promo.title || 'Product promotion',
          discount_percent: promo.discount_percent,
          discount_amount_points: promo.discount_amount_points,
        })
      }
    } finally {
      client.release()
    }
  } else {
    const bundle = await getBundleById(id)
    if (!bundle) throw new Error('not_found')
    originalUnitPrice = Number(bundle.bundle_price)
  }

  const activeCampaigns = await listActiveGrowthCampaigns({ targetType: type, targetId: id })
  for (const campaign of activeCampaigns.campaigns) {
    if (campaign.discount_type === 'percent') {
      candidates.push({ source_type: 'growth_campaign', source_id: campaign.id, source_code: campaign.kind, label: campaign.title, discount_percent: campaign.discount_value })
    } else if (campaign.discount_type === 'amount_points') {
      candidates.push({ source_type: 'growth_campaign', source_id: campaign.id, source_code: campaign.kind, label: campaign.title, discount_amount_points: campaign.discount_value })
    }
  }

  if (uid != null && uid !== '') {
    const vip = await getMyVip(uid).catch(() => null)
    if (vip?.tier?.discount_percent) {
      candidates.push({
        source_type: 'vip',
        source_id: vip.tier.id,
        source_code: vip.tier.code,
        label: vip.tier.name || vip.tier.code,
        discount_percent: Math.min(5, Math.max(0, Number(vip.tier.discount_percent || 0))),
      })
    }
  }

  const code = String(coupon_code ?? couponCode ?? '').trim().toUpperCase()
  if (code) {
    const client = await pool.connect()
    try {
      const coupon = await readAndValidateDiscountCoupon(client, code)
      if (coupon) {
        candidates.push({
          source_type: 'coupon',
          source_id: coupon.id,
          source_code: coupon.code,
          label: coupon.title || `Coupon ${coupon.code}`,
          discount_percent: coupon.discount_percent,
          discount_amount_points: coupon.discount_amount_points,
        })
      }
    } catch (error) {
      candidates.push({ source_type: 'coupon', source_code: code, label: `Coupon ${code}`, rejected_reason: String(error?.message || 'invalid_coupon') })
    } finally {
      client.release()
    }
  }

  return resolveDiscountQuote({
    targetType: type,
    targetId: id,
    originalUnitPricePoints: originalUnitPrice,
    quantity,
    candidates,
  })
}


export async function enqueueGrowthNotification({ eventKey, eventType, targetType, targetId, audienceType = 'direct', payload }) {
  return get(
    `INSERT INTO growth_notification_events (event_key, event_type, target_type, target_id, audience_type, payload_json)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
     RETURNING id, event_key, event_type, payload_json`,
    [eventKey, eventType, targetType || null, targetId || null, audienceType, JSON.stringify(payload || {})],
  )
}


export async function createGrowthNotificationDelivery({ eventId, userId, channel, siteMessageId = null, status = 'pending', errorText = null }) {
  return get(
    `INSERT INTO growth_notification_deliveries (event_id, user_id, channel, site_message_id, status, error_text, delivered_at)
     VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $5 = 'delivered' THEN now() ELSE NULL END)
     ON CONFLICT (event_id, user_id, channel) DO UPDATE SET status = growth_notification_deliveries.status
     RETURNING id, status`,
    [eventId, userId, channel, siteMessageId, status, errorText],
  )
}


export async function adminSendGrowthNotificationTest({ userId, event_type, eventType, product_id, campaign_id } = {}) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const type = String(event_type ?? eventType ?? 'campaign_started').trim()
  const payload = {
    product_id: product_id ?? null,
    campaign_id: campaign_id ?? null,
    product_name: 'Test product',
    campaign_title: 'Test campaign',
    tier_name: 'VIP',
  }
  const rendered = renderGrowthNotification({ eventType: type, payload })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const eventKey = buildGrowthEventKey({ eventType: type, targetType: 'user', targetId: uid, version: `test:${Date.now()}` })
    const eventRes = await client.query(
      `INSERT INTO growth_notification_events (event_key, event_type, target_type, target_id, audience_type, payload_json, status, processed_at)
       VALUES ($1,$2,'user',$3,'direct',$4,'processed',now())
       ON CONFLICT (event_key) DO UPDATE SET processed_at = now()
       RETURNING id`,
      [eventKey, type, uid, payload],
    )
    const eventId = eventRes.rows[0].id
    const siteMessageRes = await client.query(
      `INSERT INTO site_messages (sender_id, target_type, target_user_id, title, body)
       VALUES ($1,'individual',$2,$3,$4)
       RETURNING id`,
      [uid, uid, rendered.title, rendered.body],
    )
    await client.query(
      `INSERT INTO growth_notification_deliveries (event_id, user_id, channel, status, site_message_id, delivered_at)
       VALUES ($1,$2,'inbox','delivered',$3,now())
       ON CONFLICT (event_id, user_id, channel)
       DO UPDATE SET status = 'delivered',
                     site_message_id = EXCLUDED.site_message_id,
                     delivered_at = now()`,
      [eventId, uid, siteMessageRes.rows[0].id],
    )
    await client.query('COMMIT')
    return { ok: true, event_id: eventId, site_message_id: siteMessageRes.rows[0].id }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw error
  } finally {
    client.release()
  }
}

