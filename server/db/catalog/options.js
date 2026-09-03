import { all } from '../pool.js'


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


export async function attachProductOptionsToRows(rows) {
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
