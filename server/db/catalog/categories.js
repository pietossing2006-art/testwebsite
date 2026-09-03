import { all, get, query } from '../pool.js'


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
