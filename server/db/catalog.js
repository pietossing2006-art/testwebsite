import crypto from 'node:crypto'
import { all, get, pool, query } from './pool.js'
import { recountProductAvailableStock } from './stock.js'
import { maskPayload, purchaseBundle } from './orders.js'
import { campaignToDiscountCandidate, couponToDiscountCandidate, getMyVip, listActiveGrowthCampaigns, readAndValidateDiscountCoupon, vipToDiscountCandidate } from './growth.js'

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


export async function listActiveProductOptionItemsByProductIds(productIds = []) {
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)))
  if (ids.length < 1) return {}

  const rows = await all(
    `SELECT product_id, option_id, label, value_text, price_points, sort_order
     FROM product_option_items
     WHERE product_id = ANY($1::bigint[])
       AND is_active = true
     ORDER BY product_id ASC, sort_order ASC, id ASC`,
    [ids],
  )

  const byProduct = {}
  for (const row of rows) {
    const key = String(row.product_id)
    if (!Array.isArray(byProduct[key])) byProduct[key] = []
    byProduct[key].push({
      id: String(row.option_id),
      label: String(row.label ?? row.option_id ?? '').trim(),
      value: row.value_text,
      price_points: Number(row.price_points ?? 0),
    })
  }
  return byProduct
}


async function attachProductOptionsToRows(rows) {
  if (Array.isArray(rows)) {
    const ids = rows.map((row) => Number(row?.id)).filter((v) => Number.isFinite(v) && v > 0)
    const byProduct = await listActiveProductOptionItemsByProductIds(ids)
    return rows.map((row) => ({ ...row, product_options: byProduct[String(row?.id)] ?? [] }))
  }
  if (rows && typeof rows === 'object') {
    const byProduct = await listActiveProductOptionItemsByProductIds([rows.id])
    return { ...rows, product_options: byProduct[String(rows.id)] ?? [] }
  }
  return rows
}


export function resolveProductOption({ product, productOptionId }) {
  const opts = Array.isArray(product?.product_options) ? product.product_options : []
  if (opts.length < 1) return null

  const raw = productOptionId
  const id = typeof raw === 'string' && raw.trim() ? raw.trim() : Number.isFinite(Number(raw)) ? String(Number(raw)) : ''
  if (!id) return null

  const found = opts.find((o) => String(o?.id ?? '').trim() === id)
  if (!found) throw new Error('invalid_product_option')

  const label = typeof found?.label === 'string' && found.label.trim() ? found.label.trim() : id
  const value = found?.value == null ? null : found.value
  const pricePointsRaw = found?.price_points
  const pricePoints = pricePointsRaw == null || pricePointsRaw === '' ? null : Number(pricePointsRaw)
  if (pricePoints != null && (!Number.isFinite(pricePoints) || pricePoints < 0)) throw new Error('invalid_product_option')
  return { id, label, value, price_points: pricePoints }
}


export function requireProductOption({ product, productOptionId }) {
  const opts = Array.isArray(product?.product_options) ? product.product_options : []
  if (opts.length < 1) return null
  const selected = resolveProductOption({ product, productOptionId })
  if (!selected) throw new Error('invalid_product_option')
  return selected
}


async function listCategoriesWithOptions({ includeHidden = false } = {}) {
  const filterHidden = includeHidden ? '' : 'WHERE c.is_hidden = false'
  const productJoin = includeHidden ? 'LEFT JOIN products p ON p.category_id = c.id' : 'LEFT JOIN products p ON p.category_id = c.id AND p.is_hidden = false'

  return all(
    `SELECT c.id, c.name, c.slug, c.image_url, c.description, c.is_hidden, c.parent_id, c.sort_order, c.icon,
            pcat.name AS parent_name, pcat.slug AS parent_slug,
            COUNT(DISTINCT p.id)::int AS product_count,
            (
              WITH RECURSIVE cat_tree AS (
                SELECT id FROM categories WHERE id = c.id
                UNION ALL
                SELECT sub.id FROM categories sub JOIN cat_tree ct ON sub.parent_id = ct.id
                ${includeHidden ? '' : 'WHERE sub.is_hidden = false'}
              )
              SELECT COUNT(DISTINCT all_p.id)::int
              FROM products all_p
              WHERE all_p.category_id IN (SELECT id FROM cat_tree)
              ${includeHidden ? '' : 'AND all_p.is_hidden = false'}
            ) AS total_product_count
     FROM categories c
     LEFT JOIN categories pcat ON pcat.id = c.parent_id
     ${productJoin}
     ${filterHidden}
     GROUP BY c.id, pcat.id, pcat.name, pcat.slug
     ORDER BY COALESCE(c.sort_order, 0) ASC, c.parent_id ASC NULLS FIRST, c.id ASC`,
  )
}


export async function createCategory({ name, slug, imageUrl, description, parentId, sortOrder, icon }) {
  const pid = parentId != null && Number(parentId) > 0 ? Number(parentId) : null
  const so = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0
  const ic = typeof icon === 'string' && icon.trim() ? icon.trim() : null
  if (pid) {
    const parent = await get('SELECT id FROM categories WHERE id = $1', [pid])
    if (!parent) throw new Error('parent_category_not_found')
  }
  const res = await query(
    `INSERT INTO categories (name, slug, image_url, description, parent_id, sort_order, icon)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [name, slug, imageUrl ?? null, description ?? null, pid, so, ic],
  )
  return res.rows[0].id
}


export async function updateCategory({ id, name, slug, imageUrl, description, parentId, sortOrder, icon }) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_id')
  const pid = parentId != null && Number(parentId) > 0 ? Number(parentId) : null
  const so = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0
  const ic = typeof icon === 'string' && icon.trim() ? icon.trim() : null

  if (pid) {
    if (pid === cid) throw new Error('invalid_parent_self')
    const isDescendant = await get(
      `WITH RECURSIVE cat_tree AS (
         SELECT id, parent_id FROM categories WHERE id = $1
         UNION ALL
         SELECT c.id, c.parent_id FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
       )
       SELECT 1 FROM cat_tree WHERE id = $2`,
      [cid, pid],
    )
    if (isDescendant) throw new Error('invalid_parent_circular')
  }

  await query(
    `UPDATE categories
     SET name = $2, slug = $3, image_url = $4, description = $5, parent_id = $6, sort_order = $7, icon = $8
     WHERE id = $1`,
    [cid, name, slug, imageUrl ?? null, description ?? null, pid, so, ic],
  )
  return get(
    `SELECT c.id, c.name, c.slug, c.image_url, c.description, c.is_hidden, c.parent_id, c.sort_order, c.icon,
            pcat.name AS parent_name, pcat.slug AS parent_slug
     FROM categories c
     LEFT JOIN categories pcat ON pcat.id = c.parent_id
     WHERE c.id = $1`,
    [cid],
  )
}


export async function deleteCategory(id, { reassignToCategoryId } = {}) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_id')

  const existing = await get('SELECT id, parent_id FROM categories WHERE id = $1', [cid])
  if (!existing) throw new Error('not_found')

  const reassignId = reassignToCategoryId != null && Number(reassignToCategoryId) > 0 ? Number(reassignToCategoryId) : null

  if (reassignId) {
    if (reassignId === cid) throw new Error('invalid_reassign_target')
    const target = await get('SELECT id FROM categories WHERE id = $1', [reassignId])
    if (!target) throw new Error('reassign_target_not_found')

    // Move child categories and products to the reassigned category
    await query('UPDATE categories SET parent_id = $2 WHERE parent_id = $1', [cid, reassignId])
    await query('UPDATE products SET category_id = $2 WHERE category_id = $1', [cid, reassignId])
  } else {
    // Check if category has products
    const prod = await get('SELECT COUNT(*)::int AS c FROM products WHERE category_id = $1', [cid])
    const productCount = Number(prod?.c ?? 0) || 0
    if (productCount > 0) {
      const err = new Error('category_in_use')
      err.detail = { products: productCount }
      throw err
    }

    // Reassign child categories to this category's parent (if any)
    await query('UPDATE categories SET parent_id = $2 WHERE parent_id = $1', [cid, existing.parent_id])
  }

  await query('DELETE FROM categories WHERE id = $1', [cid])
  return { ok: true }
}


export async function adminReorderCategories(items = []) {
  if (!Array.isArray(items) || items.length === 0) return { ok: true }
  for (const item of items) {
    const id = Number(item.id)
    if (Number.isFinite(id) && id > 0) {
      const so = Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : 0
      const pid = item.parent_id != null && Number(item.parent_id) > 0 ? Number(item.parent_id) : null
      if (pid && pid !== id) {
        await query('UPDATE categories SET sort_order = $2, parent_id = $3 WHERE id = $1', [id, so, pid])
      } else {
        await query('UPDATE categories SET sort_order = $2 WHERE id = $1', [id, so])
      }
    }
  }
  return { ok: true }
}


export async function listCategories() {
  return listCategoriesWithOptions()
}


export async function adminListCategories() {
  return listCategoriesWithOptions({ includeHidden: true })
}


export async function adminSetCategoryHidden({ categoryId, isHidden } = {}) {
  const cid = Number(categoryId)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_category_id')
  const hidden = Boolean(isHidden)
  const updated = await query('UPDATE categories SET is_hidden = $2 WHERE id = $1 RETURNING id', [cid, hidden])
  if (!updated?.rows?.length) throw new Error('not_found')
  return { ok: true }
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


const MYSTERY_STOCK_FACTOR_FLOOR = 0.05

// ── Reusable SQL fragment: mystery box available stock (excludes salt) ──

const MYSTERY_AVAILABLE_STOCK_JOIN = `
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

// ── purchaseBundle ──
