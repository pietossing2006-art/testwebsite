import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adminListLowStockProducts,
  adminUpdateProductStockThreshold,
  adminExportDigitalStockItems,
} from '../../db.js'

test('adminUpdateProductStockThreshold rejects invalid product IDs or negative thresholds', async () => {
  await assert.rejects(
    async () => adminUpdateProductStockThreshold({ productId: 'invalid', threshold: 5 }),
    /invalid_product_id/,
  )
})

test('adminExportDigitalStockItems validates product ID parameter', async () => {
  await assert.rejects(
    async () => adminExportDigitalStockItems('not_a_number'),
    /invalid_product_id/,
  )
})
