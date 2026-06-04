export const DISCOUNT_PRIORITY = ['product_promotion', 'growth_campaign', 'vip', 'coupon']

const PRIORITY_INDEX = new Map(DISCOUNT_PRIORITY.map((source, index) => [source, index]))

function toPositiveInt(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.trunc(n))
}

function normalizeSourceType(value) {
  const source = String(value || '').trim()
  return PRIORITY_INDEX.has(source) ? source : 'coupon'
}

export function computeDiscountStep({ unitPrice, percent, amount } = {}) {
  const price = toPositiveInt(unitPrice)
  if (price <= 0) return { finalUnitPrice: 0, discountPoints: 0 }

  const pct = Number(percent)
  const amt = Number(amount)
  let discount = 0
  if (Number.isFinite(pct) && pct > 0) discount = Math.floor((price * pct) / 100)
  else if (Number.isFinite(amt) && amt > 0) discount = Math.floor(amt)

  const discountPoints = Math.max(0, Math.min(price, discount))
  return { finalUnitPrice: price - discountPoints, discountPoints }
}

export function normalizeDiscountCandidate(candidate = {}) {
  const sourceType = normalizeSourceType(candidate.source_type)
  const sourceId = candidate.source_id == null ? null : Number(candidate.source_id)
  const sourceCode = String(candidate.source_code || '').trim() || null
  const label = String(candidate.label || sourceCode || sourceType).trim()
  const rejectedReason = String(candidate.rejected_reason || '').trim()
  return {
    source_type: sourceType,
    source_id: Number.isFinite(sourceId) ? sourceId : null,
    source_code: sourceCode,
    label,
    discount_percent: candidate.discount_percent == null ? null : Number(candidate.discount_percent),
    discount_amount_points: candidate.discount_amount_points ?? candidate.amount_points ?? null,
    rejected_reason: rejectedReason || null,
    metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {},
    priority: PRIORITY_INDEX.get(sourceType) ?? 999,
  }
}

export function resolveDiscountQuote({
  targetType,
  targetId,
  originalUnitPricePoints,
  quantity = 1,
  candidates = [],
  now = new Date(),
} = {}) {
  const qty = Math.max(1, toPositiveInt(quantity, 1))
  const original = toPositiveInt(originalUnitPricePoints)
  let running = original
  const considered = Array.isArray(candidates) ? candidates.map(normalizeDiscountCandidate) : []
  const ordered = considered.slice().sort((a, b) => a.priority - b.priority)
  const discountsApplied = []
  const discountsRejected = []

  for (const candidate of ordered) {
    if (candidate.rejected_reason) {
      discountsRejected.push({
        source_type: candidate.source_type,
        source_id: candidate.source_id,
        source_code: candidate.source_code,
        label: candidate.label,
        reason: candidate.rejected_reason,
      })
      continue
    }

    const step = computeDiscountStep({
      unitPrice: running,
      percent: candidate.discount_percent,
      amount: candidate.discount_amount_points,
    })
    if (step.discountPoints <= 0) {
      discountsRejected.push({
        source_type: candidate.source_type,
        source_id: candidate.source_id,
        source_code: candidate.source_code,
        label: candidate.label,
        reason: 'no_discount',
      })
      continue
    }

    discountsApplied.push({
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_code: candidate.source_code,
      label: candidate.label,
      amount_points: step.discountPoints,
      unit_price_before_points: running,
      unit_price_after_points: step.finalUnitPrice,
      metadata: candidate.metadata,
    })
    running = step.finalUnitPrice
  }

  return {
    target_type: String(targetType || '').trim() || null,
    target_id: targetId == null ? null : Number(targetId),
    original_unit_price_points: original,
    quantity: qty,
    discounts_considered: considered.map(({ priority, ...candidate }) => candidate),
    discounts_applied: discountsApplied,
    discounts_rejected: discountsRejected,
    final_unit_price_points: running,
    final_total_points: running * qty,
    resolved_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  }
}
