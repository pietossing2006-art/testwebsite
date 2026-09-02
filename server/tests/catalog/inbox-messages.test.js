import test from 'node:test'
import assert from 'node:assert/strict'
import { claimAllInboxItems, deleteMySiteMessage } from '../../db.js'

test('claimAllInboxItems rejects invalid user IDs', async () => {
  await assert.rejects(
    async () => claimAllInboxItems({ userId: 'invalid_id' }),
    /invalid_user_id/,
  )
})

test('deleteMySiteMessage handles edge-case IDs gracefully without crashing', async () => {
  // Should handle non-numeric or valid IDs safely without throwing unhandled exceptions
  await deleteMySiteMessage('bad_user', 'bad_msg')
  await deleteMySiteMessage(1, 'bad_msg')
})
