import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatGrowthErrorMessage,
  formatThaiPoints,
  normalizeDiscountBreakdown,
  normalizeReviewSummary,
} from './growthDisplayUtils.js'

test('formatThaiPoints rounds numeric values with Thai locale grouping', () => {
  assert.equal(formatThaiPoints(12345.6), '12,346')
  assert.equal(formatThaiPoints('bad'), '0')
})

test('normalizeDiscountBreakdown maps applied and rejected resolver discounts', () => {
  const breakdown = normalizeDiscountBreakdown({
    discounts_applied: [
      { label: 'VIP Gold', amount_points: 150 },
      { source_type: 'coupon', source_code: 'SAVE50', amount_points: 50 },
    ],
    discounts_rejected: [
      { label: 'Flash Drop', reason: 'campaign_expired' },
      { source_type: 'vip', rejected_reason: 'not_eligible' },
    ],
  })

  assert.deepEqual(breakdown.applied, [
    { key: 'VIP Gold:150:0', label: 'VIP Gold', amountPoints: 150 },
    { key: 'coupon:SAVE50:50:1', label: 'SAVE50', amountPoints: 50 },
  ])
  assert.deepEqual(breakdown.rejected, [
    { key: 'Flash Drop:campaign_expired:0', label: 'Flash Drop', reason: 'ดีลนี้หมดเวลาแล้ว' },
    { key: 'สิทธิ์ VIP:not_eligible:1', label: 'สิทธิ์ VIP', reason: 'ยังไม่เข้าเงื่อนไขส่วนลดนี้' },
  ])
})

test('normalizeDiscountBreakdown falls back to legacy promo and coupon totals', () => {
  const breakdown = normalizeDiscountBreakdown({
    promo_discount_total_points: 80,
    coupon_discount_total_points: 20,
    coupon_code: 'SAVE20',
  })

  assert.deepEqual(breakdown.applied.map((row) => [row.label, row.amountPoints]), [
    ['โปรโมชันสินค้า', 80],
    ['คูปอง SAVE20', 20],
  ])
  assert.deepEqual(breakdown.rejected, [])
})

test('formatGrowthErrorMessage returns customer-safe campaign messages', () => {
  assert.equal(formatGrowthErrorMessage({ data: { error: 'campaign_expired' } }), 'ดีลนี้หมดเวลาแล้ว')
  assert.equal(formatGrowthErrorMessage('campaign_sold_out'), 'ดีลนี้ถูกใช้ครบจำนวนแล้ว')
  assert.equal(formatGrowthErrorMessage({ data: { error: 'quote_stale' } }), 'ราคามีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง')
})

test('normalizeReviewSummary keeps compact rating metrics stable', () => {
  assert.deepEqual(normalizeReviewSummary({ average_rating: '4.48', review_count: '12' }), {
    averageRating: 4.5,
    reviewCount: 12,
  })
  assert.deepEqual(normalizeReviewSummary(null), { averageRating: 0, reviewCount: 0 })
})
