import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DISCOUNT_PRIORITY,
  computeDiscountStep,
  normalizeDiscountCandidate,
  resolveDiscountQuote,
} from '../../lib/growthDiscounts.js'

test('computeDiscountStep clamps percent and amount discounts', () => {
  assert.deepEqual(computeDiscountStep({ unitPrice: 1000, percent: 10 }), {
    discountPoints: 100,
    finalUnitPrice: 900,
  })
  assert.deepEqual(computeDiscountStep({ unitPrice: 100, amount: 150 }), {
    discountPoints: 100,
    finalUnitPrice: 0,
  })
  assert.deepEqual(computeDiscountStep({ unitPrice: -1, percent: 10 }), {
    discountPoints: 0,
    finalUnitPrice: 0,
  })
})

test('resolveDiscountQuote applies promotion, campaign, VIP, and coupon in fixed order', () => {
  const quote = resolveDiscountQuote({
    targetType: 'product',
    targetId: 10,
    originalUnitPricePoints: 1000,
    quantity: 2,
    candidates: [
      { source_type: 'coupon', source_id: 4, source_code: 'SAVE100', label: 'Coupon SAVE100', amount_points: 100 },
      { source_type: 'vip', source_id: 3, source_code: 'gold', label: 'Gold VIP', discount_percent: 5 },
      { source_type: 'growth_campaign', source_id: 2, source_code: 'DROP', label: 'Limited Drop', discount_amount_points: 50 },
      { source_type: 'product_promotion', source_id: 1, source_code: 'PROMO', label: 'Product Promo', discount_percent: 10 },
    ],
  })

  assert.equal(quote.original_unit_price_points, 1000)
  assert.equal(quote.quantity, 2)
  assert.equal(quote.final_unit_price_points, 708)
  assert.equal(quote.final_total_points, 1416)
  assert.deepEqual(quote.discounts_applied.map((d) => d.source_type), ['product_promotion', 'growth_campaign', 'vip', 'coupon'])
  assert.deepEqual(quote.discounts_applied.map((d) => d.amount_points), [100, 50, 42, 100])
})

test('resolveDiscountQuote reports rejected discounts without applying them', () => {
  const quote = resolveDiscountQuote({
    targetType: 'product',
    targetId: 10,
    originalUnitPricePoints: 500,
    quantity: 1,
    candidates: [
      { source_type: 'growth_campaign', source_id: 8, label: 'Expired campaign', discount_percent: 50, rejected_reason: 'campaign_expired' },
      { source_type: 'coupon', source_id: 9, source_code: 'BAD', label: 'Invalid coupon', rejected_reason: 'invalid_coupon' },
    ],
  })

  assert.equal(quote.final_unit_price_points, 500)
  assert.equal(quote.final_total_points, 500)
  assert.equal(quote.discounts_applied.length, 0)
  assert.deepEqual(quote.discounts_rejected.map((d) => d.reason), ['campaign_expired', 'invalid_coupon'])
})

test('normalizeDiscountCandidate normalizes public discount fields', () => {
  assert.deepEqual(normalizeDiscountCandidate({
    source_type: 'unknown',
    source_id: 'bad',
    source_code: '  FALLBACK  ',
    discount_percent: 'not-a-number',
    amount_points: '10.9',
  }), {
    source_type: 'coupon',
    source_id: null,
    source_code: 'FALLBACK',
    label: 'FALLBACK',
    discount_percent: null,
    discount_amount_points: 10,
    rejected_reason: null,
    metadata: {},
    priority: DISCOUNT_PRIORITY.indexOf('coupon'),
  })

  assert.equal(normalizeDiscountCandidate({ discount_amount_points: -1 }).discount_amount_points, null)
  assert.equal(normalizeDiscountCandidate({ discount_amount_points: 'bad' }).discount_amount_points, null)
  assert.equal(normalizeDiscountCandidate({ discount_percent: 0 }).discount_percent, 0)
})

test('resolveDiscountQuote returns considered discounts in evaluation order', () => {
  const quote = resolveDiscountQuote({
    targetType: 'product',
    targetId: 'bad',
    originalUnitPricePoints: 1000,
    candidates: [
      { source_type: 'coupon', amount_points: 100 },
      { source_type: 'product_promotion', discount_percent: 10 },
      { source_type: 'vip', discount_percent: 5 },
    ],
    now: 'not-a-date',
  })

  assert.equal(quote.target_id, null)
  assert.match(quote.resolved_at, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(quote.discounts_considered.map((d) => d.source_type), ['product_promotion', 'vip', 'coupon'])
})

test('resolveDiscountQuote keeps legacy promo and coupon fields derivable', () => {
  const quote = resolveDiscountQuote({
    targetType: 'product',
    targetId: 88,
    originalUnitPricePoints: 1000,
    quantity: 3,
    candidates: [
      { source_type: 'product_promotion', source_id: 1, label: 'Promo', discount_percent: 20 },
      { source_type: 'coupon', source_id: 2, source_code: 'SAVE50', label: 'Coupon', discount_amount_points: 50 },
    ],
  })
  const promo = quote.discounts_applied.find((item) => item.source_type === 'product_promotion')
  const coupon = quote.discounts_applied.find((item) => item.source_type === 'coupon')
  assert.equal(promo.amount_points, 200)
  assert.equal(coupon.amount_points, 50)
  assert.equal(quote.final_unit_price_points, 750)
  assert.equal(quote.final_total_points, 2250)
})
