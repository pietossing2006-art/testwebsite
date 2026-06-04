const DISCOUNT_REASON_LABELS = {
  campaign_expired: 'ดีลนี้หมดเวลาแล้ว',
  campaign_sold_out: 'ดีลนี้ถูกใช้ครบจำนวนแล้ว',
  quote_stale: 'ราคามีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง',
  coupon_expired: 'โค้ดส่วนลดหมดอายุแล้ว',
  coupon_exhausted: 'โค้ดส่วนลดถูกใช้ครบจำนวนแล้ว',
  invalid_coupon: 'โค้ดส่วนลดไม่ถูกต้อง',
  not_eligible: 'ยังไม่เข้าเงื่อนไขส่วนลดนี้',
}

const DISCOUNT_SOURCE_LABELS = {
  product_promotion: 'โปรโมชันสินค้า',
  growth_campaign: 'แคมเปญพิเศษ',
  vip: 'สิทธิ์ VIP',
  coupon: 'คูปอง',
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function positivePoints(value) {
  return Math.max(0, Math.round(toFiniteNumber(value)))
}

function discountLabel(item, { legacyCoupon = false } = {}) {
  const label = typeof item?.label === 'string' ? item.label.trim() : ''
  if (label) return label
  const code = typeof item?.source_code === 'string' ? item.source_code.trim() : ''
  const couponCode = typeof item?.coupon_code === 'string' ? item.coupon_code.trim() : ''
  if (legacyCoupon && couponCode) return `คูปอง ${couponCode}`
  if (code) return code
  const sourceType = typeof item?.source_type === 'string' ? item.source_type.trim() : ''
  return DISCOUNT_SOURCE_LABELS[sourceType] || sourceType || 'ส่วนลด'
}

function appliedAmount(item) {
  return positivePoints(
    item?.amount_points
      ?? item?.discount_points
      ?? item?.discount_total_points
      ?? item?.total_discount_points
      ?? 0,
  )
}

function discountKeyLabel(item, label) {
  const sourceType = typeof item?.source_type === 'string' ? item.source_type.trim() : ''
  const code = typeof item?.source_code === 'string' ? item.source_code.trim() : ''
  if (sourceType && code) return `${sourceType}:${code}`
  return label
}

export function formatThaiPoints(value) {
  return positivePoints(value).toLocaleString('th-TH')
}

export function formatGrowthErrorMessage(error, fallback = '') {
  const code = typeof error === 'string'
    ? error
    : error?.data?.error || error?.error || error?.message || ''
  return DISCOUNT_REASON_LABELS[code] || fallback
}

export function normalizeDiscountBreakdown(quote) {
  const data = quote && typeof quote === 'object' ? quote : {}
  const resolverApplied = Array.isArray(data.discounts_applied) ? data.discounts_applied : []
  const resolverRejected = Array.isArray(data.discounts_rejected) ? data.discounts_rejected : []

  let applied = resolverApplied
    .map((item, index) => {
      const amountPoints = appliedAmount(item)
      const label = discountLabel(item)
      return amountPoints > 0 ? { key: `${discountKeyLabel(item, label)}:${amountPoints}:${index}`, label, amountPoints } : null
    })
    .filter(Boolean)

  if (applied.length === 0) {
    const promoPoints = positivePoints(data.promo_discount_total_points)
    const couponPoints = positivePoints(data.coupon_discount_total_points)
    if (promoPoints > 0) {
      applied = applied.concat({
        key: `โปรโมชันสินค้า:${promoPoints}:legacy-promo`,
        label: 'โปรโมชันสินค้า',
        amountPoints: promoPoints,
      })
    }
    if (couponPoints > 0) {
      const label = discountLabel({ coupon_code: data.coupon_code }, { legacyCoupon: true })
      applied = applied.concat({
        key: `${label}:${couponPoints}:legacy-coupon`,
        label,
        amountPoints: couponPoints,
      })
    }
  }

  const rejected = resolverRejected
    .map((item, index) => {
      const reasonCode = item?.reason || item?.rejected_reason || ''
      const label = discountLabel(item)
      const reason = formatGrowthErrorMessage(reasonCode, reasonCode || 'ยังไม่สามารถใช้ส่วนลดนี้ได้')
      return { key: `${label}:${reasonCode || reason}:${index}`, label, reason }
    })
    .filter((item) => item.label || item.reason)

  return { applied, rejected }
}

export function normalizeReviewSummary(summary) {
  const reviewCount = Math.max(0, Math.trunc(toFiniteNumber(summary?.review_count ?? summary?.count)))
  const rawAverage = toFiniteNumber(summary?.average_rating ?? summary?.average)
  const averageRating = reviewCount > 0 ? Math.round(Math.max(0, rawAverage) * 10) / 10 : 0
  return { averageRating, reviewCount }
}
