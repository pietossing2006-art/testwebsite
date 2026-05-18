export const DEFAULT_UI_IMAGE_SETTINGS = {
  home_featured_ratio: '4/3',
  home_categories_ratio: '16/10',
  category_products_ratio: '16/10',
  product_detail_ratio: '16/10',
  home_featured_force_fit: true,
  home_categories_force_fit: true,
  category_products_force_fit: true,
  product_detail_force_fit: true,
}

function normalizeImageRatioValue(value, fallback) {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback

  const ratioMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)$/)
  if (ratioMatch) {
    const width = Number(ratioMatch[1])
    const height = Number(ratioMatch[2])
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return `${width}/${height}`
    }
    return fallback
  }

  const numericRatio = Number(raw)
  if (Number.isFinite(numericRatio) && numericRatio > 0) return String(numericRatio)
  return fallback
}

function normalizeBoolValue(value, fallback) {
  if (value === true || value === false) return value
  if (value === 'true' || value === 1) return true
  if (value === 'false' || value === 0) return false
  return fallback
}

export function normalizeUiImageSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    home_featured_ratio: normalizeImageRatioValue(source.home_featured_ratio, DEFAULT_UI_IMAGE_SETTINGS.home_featured_ratio),
    home_categories_ratio: normalizeImageRatioValue(source.home_categories_ratio, DEFAULT_UI_IMAGE_SETTINGS.home_categories_ratio),
    category_products_ratio: normalizeImageRatioValue(source.category_products_ratio, DEFAULT_UI_IMAGE_SETTINGS.category_products_ratio),
    product_detail_ratio: normalizeImageRatioValue(source.product_detail_ratio, DEFAULT_UI_IMAGE_SETTINGS.product_detail_ratio),
    home_featured_force_fit: normalizeBoolValue(source.home_featured_force_fit, DEFAULT_UI_IMAGE_SETTINGS.home_featured_force_fit),
    home_categories_force_fit: normalizeBoolValue(source.home_categories_force_fit, DEFAULT_UI_IMAGE_SETTINGS.home_categories_force_fit),
    category_products_force_fit: normalizeBoolValue(source.category_products_force_fit, DEFAULT_UI_IMAGE_SETTINGS.category_products_force_fit),
    product_detail_force_fit: normalizeBoolValue(source.product_detail_force_fit, DEFAULT_UI_IMAGE_SETTINGS.product_detail_force_fit),
  }
}
