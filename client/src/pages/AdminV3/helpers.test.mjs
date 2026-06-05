import test from 'node:test'
import assert from 'node:assert/strict'

import { buildFallbackRbac, MODULES } from './helpers.js'

test('AdminV3 fallback RBAC exposes growth only to admin and owner', () => {
  assert.equal(MODULES.some((item) => item.id === 'growth'), true)

  const owner = buildFallbackRbac('owner')
  const admin = buildFallbackRbac('admin')
  const finance = buildFallbackRbac('finance')

  assert.equal(owner.modules.includes('growth'), true)
  assert.equal(admin.modules.includes('growth'), true)
  assert.equal(finance.modules.includes('growth'), false)
  assert.equal(owner.actions['growth.manage'], true)
  assert.equal(admin.actions['growth.manage'], true)
  assert.equal(finance.actions['growth.manage'], false)
})
