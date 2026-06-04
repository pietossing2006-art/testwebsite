import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DISCOUNT_PRIORITY,
  computeDiscountStep,
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
  assert.deepEqual(quote.discounts_applied.map((d) => d.source_type), DISCOUNT_PRIORITY)
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
