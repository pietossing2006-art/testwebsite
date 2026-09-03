import { all, get, query } from '../pool.js'
import { attachProductOptionsToRows } from './options.js'
import { MYSTERY_AVAILABLE_STOCK_JOIN } from './mysteryBox.js'


function normalizeProductOptionId(raw) {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Number.isFinite(Number(raw))) return String(Number(raw))
  return ''
}


function normalizeProductOptionsInput(productOptions) {
  if (!Array.isArray(productOptions)) return []
  const seen = new Set()
  const rows = []
  for (let i = 0; i < productOptions.length; i += 1) {
    const opt = productOptions[i] ?? {}
    const optionId = normalizeProductOptionId(opt?.id)
    const label = typeof opt?.label === 'string' ? opt.label.trim() : ''
    const valueText = opt?.value == null ? null : String(opt.value)
    const priceRaw = opt?.price_points == null || opt?.price_points === '' ? null : Number(opt.price_points)

    if (!optionId && !label && priceRaw == null && (valueText == null || valueText === '')) continue
    if (!optionId || !label) throw new Error('invalid_product_option')
    if (!Number.isFinite(priceRaw) || priceRaw < 0) throw new Error('invalid_product_option')
    if (seen.has(optionId)) throw new Error('invalid_product_option')
    seen.add(optionId)

    rows.push({
      option_id: optionId,
      label,
      value_text: valueText,
      price_points: Math.round(priceRaw),
      sort_order: i,
      is_active: true,
    })
  }
  return rows
}


async function replaceProductOptionItems({ productId, productOptions = [] }) {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  await query('DELETE FROM product_option_items WHERE product_id = $1', [pid])
  for (const opt of productOptions) {
    await query(
      `INSERT INTO product_option_items (product_id, option_id, label, value_text, price_points, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [pid, opt.option_id, opt.label, opt.value_text, opt.price_points, Number(opt.sort_order ?? 0), opt.is_active !== false],
    )
  }
}


export async function createProduct({
  categoryId,
  name,
  slug,
  price,
  description,
  imageUrl,
  stock,
  highlights,
  manualUrl,
  manualText,
  manualVideoUrl,
  fulfillmentType,
  farmFormUsernameEnabled,
  farmFormPasswordEnabled,
  farmFormAuthKeyEnabled,
  farmFormFields,
  productOptions,
  sortOrder,
  isFeatured,
  isUnlimitedStock,
  galleryImages,
  badge,
  tags,
  sku,
  adminNotes,
  volumePricing,
  minOrderQty,
  maxOrderQty,
}) {
  const farmFormFieldsValue = farmFormFields !== undefined && farmFormFields !== null ? (typeof farmFormFields === 'string' ? farmFormFields : JSON.stringify(farmFormFields)) : null
  const normalizedProductOptions = normalizeProductOptionsInput(productOptions)
  const galleryImagesValue = galleryImages !== undefined && galleryImages !== null ? (typeof galleryImages === 'string' ? galleryImages : JSON.stringify(galleryImages)) : '[]'
  const tagsValue = tags !== undefined && tags !== null ? (typeof tags === 'string' ? tags : JSON.stringify(tags)) : '[]'
  const volumePricingValue = volumePricing !== undefined && volumePricing !== null ? (typeof volumePricing === 'string' ? volumePricing : JSON.stringify(volumePricing)) : '[]'

  const res = await query(
    `INSERT INTO products (
       category_id, name, slug, price, description, image_url, stock, highlights,
       manual_url, manual_text, manual_video_url, fulfillment_type,
       farm_form_username_enabled, farm_form_password_enabled, farm_form_auth_key_enabled,
       farm_form_fields, product_options, sort_order, is_featured, is_unlimited_stock,
       gallery_images, badge, tags, sku, admin_notes, volume_pricing, min_order_qty, max_order_qty
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,NULL,$17,$18,$19,
             $20::jsonb,$21,$22::jsonb,$23,$24,$25::jsonb,$26,$27)
     RETURNING id`,
    [
      categoryId,
      name,
      slug,
      price,
      description ?? null,
      imageUrl ?? null,
      stock ?? 0,
      highlights ?? null,
      manualUrl ?? null,
      manualText ?? null,
      manualVideoUrl ?? null,
      fulfillmentType ?? 'digital_stock',
      farmFormUsernameEnabled === undefined ? true : Boolean(farmFormUsernameEnabled),
      farmFormPasswordEnabled === undefined ? true : Boolean(farmFormPasswordEnabled),
      farmFormAuthKeyEnabled === undefined ? true : Boolean(farmFormAuthKeyEnabled),
      farmFormFieldsValue,
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      Boolean(isFeatured),
      Boolean(isUnlimitedStock),
      galleryImagesValue,
      badge ? String(badge).trim().slice(0, 40) : null,
      tagsValue,
      sku ? String(sku).trim().slice(0, 60) : null,
      adminNotes ? String(adminNotes).trim() : null,
      volumePricingValue,
      Number.isFinite(Number(minOrderQty)) && Number(minOrderQty) > 0 ? Math.trunc(Number(minOrderQty)) : 1,
      Number.isFinite(Number(maxOrderQty)) && Number(maxOrderQty) > 0 ? Math.trunc(Number(maxOrderQty)) : null,
    ],
  )
  const newProductId = res.rows[0].id
  if (normalizedProductOptions.length > 0) {
    await replaceProductOptionItems({ productId: newProductId, productOptions: normalizedProductOptions })
  }
  return newProductId
}


export async function updateProduct({
  id,
  categoryId,
  name,
  slug,
  price,
  description,
  imageUrl,
  stock,
  highlights,
  manualUrl,
  manualText,
  manualVideoUrl,
  fulfillmentType,
  farmFormUsernameEnabled,
  farmFormPasswordEnabled,
  farmFormAuthKeyEnabled,
  farmFormFields,
  productOptions,
  sortOrder,
  isFeatured,
  isUnlimitedStock,
  galleryImages,
  badge,
  tags,
  sku,
  adminNotes,
  volumePricing,
  minOrderQty,
  maxOrderQty,
}) {
  const farmFormFieldsValue = Array.isArray(farmFormFields) ? JSON.stringify(farmFormFields) : null
  const normalizedProductOptions = normalizeProductOptionsInput(productOptions)
  const galleryImagesValue = galleryImages !== undefined ? (Array.isArray(galleryImages) ? JSON.stringify(galleryImages) : '[]') : undefined
  const tagsValue = tags !== undefined ? (Array.isArray(tags) ? JSON.stringify(tags) : '[]') : undefined
  const volumePricingValue = volumePricing !== undefined ? (Array.isArray(volumePricing) ? JSON.stringify(volumePricing) : '[]') : undefined

  await query(
    `UPDATE products
     SET category_id=$2, name=$3, slug=$4, price=$5, description=$6, image_url=$7, stock=$8,
         highlights=$9, manual_url=$10, manual_text=$11, manual_video_url=$12, fulfillment_type=$13,
         farm_form_username_enabled=$14, farm_form_password_enabled=$15, farm_form_auth_key_enabled=$16,
         farm_form_fields=COALESCE($17::jsonb, farm_form_fields),
         product_options=NULL,
         sort_order=$18, is_featured=$19, is_unlimited_stock=$20,
         gallery_images=COALESCE($21::jsonb, gallery_images),
         badge=$22,
         tags=COALESCE($23::jsonb, tags),
         sku=$24,
         admin_notes=$25,
         volume_pricing=COALESCE($26::jsonb, volume_pricing),
         min_order_qty=$27,
         max_order_qty=$28
     WHERE id=$1`,
    [
      id,
      categoryId,
      name,
      slug,
      price,
      description ?? null,
      imageUrl ?? null,
      stock ?? 0,
      highlights ?? null,
      manualUrl ?? null,
      manualText ?? null,
      manualVideoUrl ?? null,
      fulfillmentType ?? 'digital_stock',
      farmFormUsernameEnabled === undefined ? true : Boolean(farmFormUsernameEnabled),
      farmFormPasswordEnabled === undefined ? true : Boolean(farmFormPasswordEnabled),
      farmFormAuthKeyEnabled === undefined ? true : Boolean(farmFormAuthKeyEnabled),
      farmFormFieldsValue,
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      Boolean(isFeatured),
      Boolean(isUnlimitedStock),
      galleryImagesValue ?? null,
      badge ? String(badge).trim().slice(0, 40) : null,
      tagsValue ?? null,
      sku ? String(sku).trim().slice(0, 60) : null,
      adminNotes ? String(adminNotes).trim() : null,
      volumePricingValue ?? null,
      Number.isFinite(Number(minOrderQty)) && Number(minOrderQty) > 0 ? Math.trunc(Number(minOrderQty)) : 1,
      Number.isFinite(Number(maxOrderQty)) && Number(maxOrderQty) > 0 ? Math.trunc(Number(maxOrderQty)) : null,
    ],
  )
  await replaceProductOptionItems({ productId: id, productOptions: normalizedProductOptions })
  return getProductById(id, { includeHidden: true })
}


export async function duplicateProduct(id) {
  const pid = Number(id)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')

  const orig = await get('SELECT * FROM products WHERE id = $1', [pid])
  if (!orig) throw new Error('not_found')

  const baseSlug = `${orig.slug}-copy`
  let slug = baseSlug
  let counter = 1
  while (true) {
    const existing = await get('SELECT id FROM products WHERE slug = $1', [slug])
    if (!existing) break
    counter++
    slug = `${baseSlug}-${counter}`
  }

  const origOpts = await all(
    `SELECT option_id, label, value_text, price_points, sort_order
     FROM product_option_items
     WHERE product_id = $1 AND is_active = true
     ORDER BY sort_order ASC, id ASC`,
    [pid],
  )
  const productOptions = (origOpts || []).map((o) => ({
    id: o.option_id,
    label: o.label,
    value: o.value_text,
    price_points: o.price_points,
    sort_order: o.sort_order,
  }))

  const newId = await createProduct({
    categoryId: orig.category_id,
    name: `${orig.name} (สำเนา)`,
    slug,
    price: orig.price,
    description: orig.description,
    imageUrl: orig.image_url,
    stock: 0,
    highlights: orig.highlights,
    manualUrl: orig.manual_url,
    manualText: orig.manual_text,
    manualVideoUrl: orig.manual_video_url,
    fulfillmentType: orig.fulfillment_type,
    farmFormUsernameEnabled: orig.farm_form_username_enabled,
    farmFormPasswordEnabled: orig.farm_form_password_enabled,
    farmFormAuthKeyEnabled: orig.farm_form_auth_key_enabled,
    farmFormFields: orig.farm_form_fields,
    productOptions,
    sortOrder: (Number(orig.sort_order) || 0) + 1,
    isFeatured: false,
    isUnlimitedStock: orig.is_unlimited_stock,
    galleryImages: orig.gallery_images,
    badge: orig.badge,
    tags: orig.tags,
    sku: orig.sku ? `${orig.sku}-COPY` : null,
    adminNotes: orig.admin_notes,
    volumePricing: orig.volume_pricing,
    minOrderQty: orig.min_order_qty || 1,
    maxOrderQty: orig.max_order_qty || null,
  })

  await query('UPDATE products SET is_hidden = true WHERE id = $1', [newId])
  return getProductById(newId, { includeHidden: true })
}


export async function bulkUpdateProducts({ productIds, action, payload = {} }) {
  if (!Array.isArray(productIds) || productIds.length === 0) throw new Error('invalid_product_ids')
  const cleanIds = productIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
  if (cleanIds.length === 0) throw new Error('invalid_product_ids')
  if (cleanIds.length > 200) throw new Error('too_many_items')

  const placeholders = cleanIds.map((_, i) => `$${i + 1}`).join(',')

  if (action === 'set_hidden') {
    const isHidden = Boolean(payload?.is_hidden)
    await query(`UPDATE products SET is_hidden = $${cleanIds.length + 1} WHERE id IN (${placeholders})`, [...cleanIds, isHidden])
    return { ok: true, updated: cleanIds.length }
  }

  if (action === 'set_featured') {
    const isFeatured = Boolean(payload?.is_featured)
    await query(`UPDATE products SET is_featured = $${cleanIds.length + 1} WHERE id IN (${placeholders})`, [...cleanIds, isFeatured])
    return { ok: true, updated: cleanIds.length }
  }

  if (action === 'set_category') {
    const categoryId = Number(payload?.category_id)
    if (!Number.isFinite(categoryId) || categoryId <= 0) throw new Error('invalid_category_id')
    const cat = await get('SELECT id FROM categories WHERE id = $1', [categoryId])
    if (!cat) throw new Error('category_not_found')
    await query(`UPDATE products SET category_id = $${cleanIds.length + 1} WHERE id IN (${placeholders})`, [...cleanIds, categoryId])
    return { ok: true, updated: cleanIds.length }
  }

  if (action === 'adjust_price') {
    const mode = String(payload?.mode || 'fixed')
    const value = Number(payload?.value)
    if (!Number.isFinite(value)) throw new Error('invalid_price_value')

    if (mode === 'percent') {
      await query(
        `UPDATE products
         SET price = GREATEST(0, ROUND(price * (1 + ($${cleanIds.length + 1}::numeric / 100.0))))::int
         WHERE id IN (${placeholders})`,
        [...cleanIds, value],
      )
    } else {
      await query(
        `UPDATE products
         SET price = GREATEST(0, price + $${cleanIds.length + 1}::int)
         WHERE id IN (${placeholders})`,
        [...cleanIds, Math.trunc(value)],
      )
    }
    return { ok: true, updated: cleanIds.length }
  }

  if (action === 'set_badge') {
    const badge = payload?.badge ? String(payload.badge).trim().slice(0, 40) : null
    await query(`UPDATE products SET badge = $${cleanIds.length + 1} WHERE id IN (${placeholders})`, [...cleanIds, badge])
    return { ok: true, updated: cleanIds.length }
  }

  if (action === 'delete') {
    await query(`DELETE FROM products WHERE id IN (${placeholders})`, cleanIds)
    return { ok: true, deleted: cleanIds.length }
  }

  throw new Error('invalid_action')
}


export async function searchProductsPublic({
  query: searchQuery = '',
  categorySlug,
  minPrice,
  maxPrice,
  badge,
  tag,
  inStockOnly = false,
  limit = 40,
  offset = 0,
  sort = 'recommended',
} = {}) {
  const lim = Math.min(Math.max(1, Number(limit) || 40), 100)
  const off = Math.max(0, Number(offset) || 0)
  const q = String(searchQuery ?? '').trim()
  const catSlug = String(categorySlug ?? '').trim()
  const b = String(badge ?? '').trim()
  const t = String(tag ?? '').trim().toLowerCase()
  const minP = Number.isFinite(Number(minPrice)) && Number(minPrice) >= 0 ? Number(minPrice) : null
  const maxP = Number.isFinite(Number(maxPrice)) && Number(maxPrice) > 0 ? Number(maxPrice) : null

  const where = ['p.is_hidden = false']
  const params = []

  if (catSlug && catSlug !== 'all') {
    params.push(catSlug)
    where.push(`(
      c.slug = $${params.length}
      OR p.category_id IN (
        WITH RECURSIVE cat_tree AS (
          SELECT id FROM categories WHERE slug = $${params.length}
          UNION ALL
          SELECT sub.id FROM categories sub JOIN cat_tree ct ON sub.parent_id = ct.id
          WHERE sub.is_hidden = false
        )
        SELECT id FROM cat_tree
      )
    )`)
  }

  if (q) {
    const cleanQ = q.replace(/[%_]/g, '').trim()
    const words = cleanQ.split(/\s+/).filter(Boolean)
    if (words.length > 0) {
      const wordClauses = []
      for (const word of words) {
        params.push(`%${word}%`)
        const pIdx = params.length
        wordClauses.push(
          `(p.name ILIKE $${pIdx} OR p.slug ILIKE $${pIdx} OR p.description ILIKE $${pIdx} OR p.sku ILIKE $${pIdx} OR p.highlights ILIKE $${pIdx} OR p.tags::text ILIKE $${pIdx} OR c.name ILIKE $${pIdx})`
        )
      }
      where.push(`(${wordClauses.join(' AND ')})`)
    }
  }

  if (b && b !== 'all') {
    params.push(b)
    where.push(`p.badge = $${params.length}`)
  }

  if (minP != null) {
    params.push(minP)
    where.push(`p.price >= $${params.length}`)
  }

  if (maxP != null) {
    params.push(maxP)
    where.push(`p.price <= $${params.length}`)
  }

  let orderBy = 'p.sort_order ASC, p.id DESC'
  if (sort === 'price_low') orderBy = 'p.price ASC, p.id DESC'
  else if (sort === 'price_high') orderBy = 'p.price DESC, p.id DESC'
  else if (sort === 'name') orderBy = 'p.name ASC'
  else if (sort === 'newest') orderBy = 'p.id DESC'

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const countParams = [...params]
  const countRow = await get(
    `SELECT COUNT(*)::int AS c
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ${whereSql}`,
    countParams,
  )

  params.push(lim)
  const limIdx = params.length
  params.push(off)
  const offIdx = params.length

  const rows = await all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            pr.id AS promo_id,
            pr.title AS promo_title,
            pr.discount_percent AS promo_discount_percent,
            pr.discount_amount_points AS promo_discount_amount_points,
            pr.starts_at AS promo_starts_at,
            pr.ends_at AS promo_ends_at,
            pr.badge_text AS promo_badge_text,
            pr.is_flash_sale AS promo_is_flash_sale,
            CASE
              WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
              WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                THEN LEAST(p.price, pr.discount_amount_points)::int
              ELSE 0
            END AS promo_discount_points,
            (p.price - (
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END
            ))::int AS price_final_points,
            CASE
              WHEN p.is_unlimited_stock THEN 999999
              WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
              WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
              ELSE p.stock
            END AS stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT pp.id, pp.title, pp.discount_percent, pp.discount_amount_points,
              pp.starts_at, pp.ends_at, pp.badge_text, pp.is_flash_sale
       FROM product_promotions pp
       WHERE pp.is_active = true
         AND (pp.starts_at IS NULL OR pp.starts_at <= now())
         AND (pp.ends_at IS NULL OR pp.ends_at >= now())
         AND (
           (pp.scope = 'product' AND pp.product_id = p.id)
           OR (pp.scope = 'category' AND pp.category_id = p.category_id)
           OR (pp.scope = 'all')
           OR (pp.product_id = p.id)
         )
       ORDER BY
         CASE
           WHEN pp.scope = 'product' OR pp.product_id = p.id THEN 1
           WHEN pp.scope = 'category' THEN 2
           ELSE 3
         END ASC,
         COALESCE(pp.discount_percent, 0) DESC,
         COALESCE(pp.discount_amount_points, 0) DESC,
         pp.id DESC
       LIMIT 1
     ) pr ON true
     LEFT JOIN (
       SELECT b.product_id, COUNT(*)::int AS available_stock
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE spi.status = 'available'
       GROUP BY b.product_id
     ) s ON s.product_id = p.id
     ${MYSTERY_AVAILABLE_STOCK_JOIN}
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  )

  let items = await attachProductOptionsToRows(rows || [])
  if (!Array.isArray(items)) items = []
  if (t) {
    items = items.filter((p) => {
      const tags = Array.isArray(p.tags) ? p.tags : []
      return tags.some((x) => String(x).toLowerCase().includes(t))
    })
  }
  if (inStockOnly) {
    items = items.filter((p) => Boolean(p.is_unlimited_stock) || Number(p.stock ?? 0) > 0)
  }

  return {
    total: Number(countRow?.c ?? 0),
    limit: lim,
    offset: off,
    products: items,
  }
}


export async function deleteProduct(id) {
  const pid = Number(id)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_id')

  const existing = await get('SELECT id FROM products WHERE id = $1', [pid])
  if (!existing) throw new Error('not_found')

  const blockers = {
    order_items: 0,
    deliveries: 0,
    farm_requests: 0,
    mystery_prizes: 0,
    mystery_stock_items: 0,
  }

  const oi = await get('SELECT COUNT(*)::int AS c FROM order_items WHERE product_id = $1', [pid])
  blockers.order_items = Number(oi?.c ?? 0) || 0
  const del = await get('SELECT COUNT(*)::int AS c FROM deliveries WHERE product_id = $1', [pid])
  blockers.deliveries = Number(del?.c ?? 0) || 0
  const fr = await get('SELECT COUNT(*)::int AS c FROM farm_requests WHERE product_id = $1', [pid])
  blockers.farm_requests = Number(fr?.c ?? 0) || 0
  const mp = await get('SELECT COUNT(*)::int AS c FROM mystery_box_prizes WHERE prize_product_id = $1', [pid])
  blockers.mystery_prizes = Number(mp?.c ?? 0) || 0
  const ms = await get('SELECT COUNT(*)::int AS c FROM mystery_box_stock_items WHERE prize_product_id = $1', [pid])
  blockers.mystery_stock_items = Number(ms?.c ?? 0) || 0

  const total = Object.values(blockers).reduce((a, b) => a + (Number(b) || 0), 0)
  if (total > 0) {
    const err = new Error('product_in_use')
    err.detail = blockers
    throw err
  }

  await query('DELETE FROM products WHERE id = $1', [pid])
  return { ok: true }
}


export async function listProducts({ categorySlug, includeHidden } = {}) {
  const showHidden = Boolean(includeHidden)
  if (categorySlug) {
    if (String(categorySlug).trim() === 'featured') {
      const rows = await all(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
                c.parent_id AS category_parent_id, pcat.name AS category_parent_name, pcat.slug AS category_parent_slug,
                pr.id AS promo_id,
                pr.title AS promo_title,
                pr.discount_percent AS promo_discount_percent,
                pr.discount_amount_points AS promo_discount_amount_points,
                pr.starts_at AS promo_starts_at,
                pr.ends_at AS promo_ends_at,
                pr.badge_text AS promo_badge_text,
                pr.is_flash_sale AS promo_is_flash_sale,
                CASE
                  WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                    THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                  WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                    THEN LEAST(p.price, pr.discount_amount_points)::int
                  ELSE 0
                END AS promo_discount_points,
                (p.price - (
                  CASE
                    WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                      THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                    WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                      THEN LEAST(p.price, pr.discount_amount_points)::int
                    ELSE 0
                  END
                ))::int AS price_final_points,
                CASE
                  WHEN p.is_unlimited_stock THEN 999999
                  WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
                  WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
                  ELSE p.stock
                END AS stock,
                p.is_unlimited_stock
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN categories pcat ON pcat.id = c.parent_id
         LEFT JOIN LATERAL (
           SELECT pp.id, pp.title, pp.discount_percent, pp.discount_amount_points,
                  pp.starts_at, pp.ends_at, pp.badge_text, pp.is_flash_sale
           FROM product_promotions pp
           WHERE pp.is_active = true
             AND (pp.starts_at IS NULL OR pp.starts_at <= now())
             AND (pp.ends_at IS NULL OR pp.ends_at >= now())
             AND (
               (pp.scope = 'product' AND pp.product_id = p.id)
               OR (pp.scope = 'category' AND pp.category_id = p.category_id)
               OR (pp.scope = 'all')
               OR (pp.product_id = p.id)
             )
           ORDER BY
             CASE
               WHEN pp.scope = 'product' OR pp.product_id = p.id THEN 1
               WHEN pp.scope = 'category' THEN 2
               ELSE 3
             END ASC,
             COALESCE(pp.discount_percent, 0) DESC,
             COALESCE(pp.discount_amount_points, 0) DESC,
             pp.id DESC
           LIMIT 1
         ) pr ON true
         LEFT JOIN (
           SELECT b.product_id, COUNT(*)::int AS available_stock
           FROM stock_pool_items spi
           JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
           WHERE spi.status = 'available'
           GROUP BY b.product_id
         ) s ON s.product_id = p.id
         ${MYSTERY_AVAILABLE_STOCK_JOIN}
         WHERE p.is_featured = true
           AND ($1::boolean = true OR p.is_hidden = false)
         ORDER BY p.sort_order ASC, p.id DESC`,
        [showHidden],
      )
      return attachProductOptionsToRows(rows)
    }
    const rows = await all(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
              c.parent_id AS category_parent_id, pcat.name AS category_parent_name, pcat.slug AS category_parent_slug,
              pr.id AS promo_id,
              pr.title AS promo_title,
              pr.discount_percent AS promo_discount_percent,
              pr.discount_amount_points AS promo_discount_amount_points,
              pr.starts_at AS promo_starts_at,
              pr.ends_at AS promo_ends_at,
              pr.badge_text AS promo_badge_text,
              pr.is_flash_sale AS promo_is_flash_sale,
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END AS promo_discount_points,
              (p.price - (
                CASE
                  WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                    THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                  WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                    THEN LEAST(p.price, pr.discount_amount_points)::int
                  ELSE 0
                END
              ))::int AS price_final_points,
              CASE
                WHEN p.is_unlimited_stock THEN 999999
                WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
                WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
                ELSE p.stock
              END AS stock,
              p.is_unlimited_stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN categories pcat ON pcat.id = c.parent_id
       LEFT JOIN LATERAL (
         SELECT pp.id, pp.title, pp.discount_percent, pp.discount_amount_points,
                pp.starts_at, pp.ends_at, pp.badge_text, pp.is_flash_sale
         FROM product_promotions pp
         WHERE pp.is_active = true
           AND (pp.starts_at IS NULL OR pp.starts_at <= now())
           AND (pp.ends_at IS NULL OR pp.ends_at >= now())
           AND (
             (pp.scope = 'product' AND pp.product_id = p.id)
             OR (pp.scope = 'category' AND pp.category_id = p.category_id)
             OR (pp.scope = 'all')
             OR (pp.product_id = p.id)
           )
         ORDER BY
           CASE
             WHEN pp.scope = 'product' OR pp.product_id = p.id THEN 1
             WHEN pp.scope = 'category' THEN 2
             ELSE 3
           END ASC,
           COALESCE(pp.discount_percent, 0) DESC,
           COALESCE(pp.discount_amount_points, 0) DESC,
           pp.id DESC
         LIMIT 1
       ) pr ON true
       LEFT JOIN (
         SELECT b.product_id, COUNT(*)::int AS available_stock
         FROM stock_pool_items spi
         JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
         WHERE spi.status = 'available'
         GROUP BY b.product_id
       ) s ON s.product_id = p.id
       ${MYSTERY_AVAILABLE_STOCK_JOIN}
       WHERE (
         c.slug = $1
         OR p.category_id IN (
           WITH RECURSIVE cat_tree AS (
             SELECT id FROM categories WHERE slug = $1
             UNION ALL
             SELECT sub.id FROM categories sub JOIN cat_tree ct ON sub.parent_id = ct.id
             ${showHidden ? '' : 'WHERE sub.is_hidden = false'}
           )
           SELECT id FROM cat_tree
         )
       )
         AND ($2::boolean = true OR p.is_hidden = false)
       ORDER BY p.sort_order ASC, p.id DESC`,
      [categorySlug, showHidden],
    )
    return attachProductOptionsToRows(rows)
  }

  const rows = await all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            c.parent_id AS category_parent_id, pcat.name AS category_parent_name, pcat.slug AS category_parent_slug,
            pr.id AS promo_id,
            pr.title AS promo_title,
            pr.discount_percent AS promo_discount_percent,
            pr.discount_amount_points AS promo_discount_amount_points,
            pr.starts_at AS promo_starts_at,
            pr.ends_at AS promo_ends_at,
            pr.badge_text AS promo_badge_text,
            pr.is_flash_sale AS promo_is_flash_sale,
            CASE
              WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
              WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                THEN LEAST(p.price, pr.discount_amount_points)::int
              ELSE 0
            END AS promo_discount_points,
            (p.price - (
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END
            ))::int AS price_final_points,
            CASE
              WHEN p.is_unlimited_stock THEN 999999
              WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
              WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
              ELSE p.stock
            END AS stock,
            p.is_unlimited_stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN categories pcat ON pcat.id = c.parent_id
     LEFT JOIN LATERAL (
       SELECT pp.id, pp.title, pp.discount_percent, pp.discount_amount_points,
              pp.starts_at, pp.ends_at, pp.badge_text, pp.is_flash_sale
       FROM product_promotions pp
       WHERE pp.is_active = true
         AND (pp.starts_at IS NULL OR pp.starts_at <= now())
         AND (pp.ends_at IS NULL OR pp.ends_at >= now())
         AND (
           (pp.scope = 'product' AND pp.product_id = p.id)
           OR (pp.scope = 'category' AND pp.category_id = p.category_id)
           OR (pp.scope = 'all')
           OR (pp.product_id = p.id)
         )
       ORDER BY
         CASE
           WHEN pp.scope = 'product' OR pp.product_id = p.id THEN 1
           WHEN pp.scope = 'category' THEN 2
           ELSE 3
         END ASC,
         COALESCE(pp.discount_percent, 0) DESC,
         COALESCE(pp.discount_amount_points, 0) DESC,
         pp.id DESC
       LIMIT 1
     ) pr ON true
     LEFT JOIN (
       SELECT b.product_id, COUNT(*)::int AS available_stock
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE spi.status = 'available'
       GROUP BY b.product_id
     ) s ON s.product_id = p.id
     ${MYSTERY_AVAILABLE_STOCK_JOIN}
     WHERE ($1::boolean = true OR p.is_hidden = false)
     ORDER BY p.sort_order ASC, p.id DESC`,
    [showHidden],
  )
  return attachProductOptionsToRows(rows)
}


export async function getProductById(idOrSlug, { includeHidden } = {}) {
  const showHidden = Boolean(includeHidden)
  const isNumeric = Number.isFinite(Number(idOrSlug)) && Number(idOrSlug) > 0 && !isNaN(Number(idOrSlug))
  const numericId = isNumeric ? Math.trunc(Number(idOrSlug)) : null
  const slugStr = idOrSlug ? String(idOrSlug).trim() : null

  const row = await get(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            pr.id AS promo_id,
            pr.title AS promo_title,
            pr.discount_percent AS promo_discount_percent,
            pr.discount_amount_points AS promo_discount_amount_points,
            pr.starts_at AS promo_starts_at,
            pr.ends_at AS promo_ends_at,
            pr.badge_text AS promo_badge_text,
            pr.is_flash_sale AS promo_is_flash_sale,
            CASE
              WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
              WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                THEN LEAST(p.price, pr.discount_amount_points)::int
              ELSE 0
            END AS promo_discount_points,
            (p.price - (
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END
            ))::int AS price_final_points,
            CASE
              WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
              WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
              ELSE p.stock
            END AS stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT pp.id, pp.title, pp.discount_percent, pp.discount_amount_points,
              pp.starts_at, pp.ends_at, pp.badge_text, pp.is_flash_sale
       FROM product_promotions pp
       WHERE pp.is_active = true
         AND (pp.starts_at IS NULL OR pp.starts_at <= now())
         AND (pp.ends_at IS NULL OR pp.ends_at >= now())
         AND (
           (pp.scope = 'product' AND pp.product_id = p.id)
           OR (pp.scope = 'category' AND pp.category_id = p.category_id)
           OR (pp.scope = 'all')
           OR (pp.product_id = p.id)
         )
       ORDER BY
         CASE
           WHEN pp.scope = 'product' OR pp.product_id = p.id THEN 1
           WHEN pp.scope = 'category' THEN 2
           ELSE 3
         END ASC,
         COALESCE(pp.discount_percent, 0) DESC,
         COALESCE(pp.discount_amount_points, 0) DESC,
         pp.id DESC
       LIMIT 1
     ) pr ON true
     LEFT JOIN (
       SELECT b.product_id, COUNT(*)::int AS available_stock
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE spi.status = 'available'
       GROUP BY b.product_id
     ) s ON s.product_id = p.id
     ${MYSTERY_AVAILABLE_STOCK_JOIN}
     WHERE (
       ($1::int IS NOT NULL AND p.id = $1)
       OR (p.slug IS NOT NULL AND LOWER(p.slug) = LOWER($2))
       OR p.slug = $2
       OR LOWER(p.name) = LOWER($2)
       OR p.name = $2
     )
       AND ($3::boolean = true OR p.is_hidden = false)`,
    [numericId, slugStr, showHidden],
  )
  return attachProductOptionsToRows(row)
}


export async function listProductsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  const clean = ids.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
  if (clean.length === 0) return []
  if (clean.length > 100) throw new Error('too_many_ids')
  const placeholders = clean.map((_, i) => `$${i + 1}`).join(',')
  const rows = await all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            pr.id AS promo_id,
            pr.title AS promo_title,
            pr.discount_percent AS promo_discount_percent,
            pr.discount_amount_points AS promo_discount_amount_points,
            pr.starts_at AS promo_starts_at,
            pr.ends_at AS promo_ends_at,
            pr.badge_text AS promo_badge_text,
            pr.is_flash_sale AS promo_is_flash_sale,
            CASE
              WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
              WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                THEN LEAST(p.price, pr.discount_amount_points)::int
              ELSE 0
            END AS promo_discount_points,
            (p.price - (
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END
            ))::int AS price_final_points,
            CASE
              WHEN p.is_unlimited_stock THEN 999999
              WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
              WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
              ELSE p.stock
            END AS stock,
            p.is_unlimited_stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT pp.id, pp.title, pp.discount_percent, pp.discount_amount_points,
              pp.starts_at, pp.ends_at, pp.badge_text, pp.is_flash_sale
       FROM product_promotions pp
       WHERE pp.is_active = true
         AND (pp.starts_at IS NULL OR pp.starts_at <= now())
         AND (pp.ends_at IS NULL OR pp.ends_at >= now())
         AND (
           (pp.scope = 'product' AND pp.product_id = p.id)
           OR (pp.scope = 'category' AND pp.category_id = p.category_id)
           OR (pp.scope = 'all')
           OR (pp.product_id = p.id)
         )
       ORDER BY
         CASE
           WHEN pp.scope = 'product' OR pp.product_id = p.id THEN 1
           WHEN pp.scope = 'category' THEN 2
           ELSE 3
         END ASC,
         COALESCE(pp.discount_percent, 0) DESC,
         COALESCE(pp.discount_amount_points, 0) DESC,
         pp.id DESC
       LIMIT 1
     ) pr ON true
     LEFT JOIN (
       SELECT b.product_id, COUNT(*)::int AS available_stock
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE spi.status = 'available'
       GROUP BY b.product_id
     ) s ON s.product_id = p.id
     ${MYSTERY_AVAILABLE_STOCK_JOIN}
     WHERE p.id IN (${placeholders})
       AND p.is_hidden = false`,
    clean,
  )
  const withOptions = await attachProductOptionsToRows(rows)
  const byId = new Map(withOptions.map((r) => [Number(r.id), r]))
  return clean.map((id) => byId.get(id)).filter(Boolean)
}


export async function adminSetProductHidden({ productId, isHidden } = {}) {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  const hidden = Boolean(isHidden)
  const res = await query('UPDATE products SET is_hidden = $2 WHERE id = $1 RETURNING id', [pid, hidden])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}


export async function adminSetProductFeatured({ productId, isFeatured } = {}) {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  const feat = Boolean(isFeatured)
  const res = await query('UPDATE products SET is_featured = $2 WHERE id = $1 RETURNING id', [pid, feat])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}
