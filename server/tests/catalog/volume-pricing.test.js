import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DISCOUNT_PRIORITY,
  computeDiscountStep,
  resolveDiscountQuote,
} from '../../lib/growthDiscounts.js'
import { volumePricingToDiscountCandidate } from '../../db.js'

test('DISCOUNT_PRIORITY includes volume_pricing', () => {
  assert.ok(DISCOUNT_PRIORITY.includes('volume_pricing'))
})

test('volumePricingToDiscountCandidate resolves highest applicable tier', () => {
  const product = {
    id: 1,
    name: 'Steam Key',
    volume_pricing: [
      { min_qty: 5, discount_percent: 5 },
      { min_qty: 10, discount_percent: 10 },
      { min_qty: 20, discount_amount_points: 50 },
    ],
  }

  // qty < 5 -> no volume discount
  assert.equal(volumePricingToDiscountCandidate(product, 4), null)

  // qty = 5 -> 5% discount
  const c5 = volumePricingToDiscountCandidate(product, 5)
  assert.ok(c5)
  assert.equal(c5.source_type, 'volume_pricing')
  assert.equal(c5.discount_percent, 5)

  // qty = 15 -> 10% discount (tier 10)
  const c15 = volumePricingToDiscountCandidate(product, 15)
  assert.ok(c15)
  assert.equal(c15.source_type, 'volume_pricing')
  assert.equal(c15.discount_percent, 10)

  // qty = 25 -> 50 points discount (tier 20)
  const c25 = volumePricingToDiscountCandidate(product, 25)
  assert.ok(c25)
  assert.equal(c25.source_type, 'volume_pricing')
  assert.equal(c25.discount_amount_points, 50)
})

test('resolveDiscountQuote applies volume pricing correctly in quote flow', () => {
  const product = {
    id: 1,
    name: 'Game Account',
    volume_pricing: [
      { min_qty: 5, discount_percent: 10 },
    ],
  }

  const vpCandidate = volumePricingToDiscountCandidate(product, 5)
  assert.ok(vpCandidate)

  const quote = resolveDiscountQuote({
    targetType: 'product',
    targetId: 1,
    originalUnitPricePoints: 100,
    quantity: 5,
    candidates: [vpCandidate],
  })

  assert.equal(quote.original_unit_price_points, 100)
  assert.equal(quote.quantity, 5)
  assert.equal(quote.final_unit_price_points, 90)
  assert.equal(quote.final_total_points, 450)
  assert.equal(quote.discounts_applied.length, 1)
  assert.equal(quote.discounts_applied[0].source_type, 'volume_pricing')
  assert.equal(quote.discounts_applied[0].amount_points, 10)
})
