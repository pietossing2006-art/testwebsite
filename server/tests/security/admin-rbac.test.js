import test from 'node:test'
import assert from 'node:assert/strict'

import { ADMIN_ROLE_ACTION_ACCESS, ADMIN_ROLE_MODULE_ACCESS } from '../../lib/auth.js'

test('growth admin module is available only to admin and owner roles', () => {
  assert.equal(ADMIN_ROLE_MODULE_ACCESS.owner.includes('growth'), true)
  assert.equal(ADMIN_ROLE_MODULE_ACCESS.admin.includes('growth'), true)
  assert.equal(ADMIN_ROLE_MODULE_ACCESS.finance.includes('growth'), false)
  assert.deepEqual(ADMIN_ROLE_ACTION_ACCESS['growth.manage'], ['admin', 'owner'])
})
