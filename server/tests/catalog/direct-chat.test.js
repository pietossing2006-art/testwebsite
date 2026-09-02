import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adminCreateSiteMessage,
  adminGetDirectChatMessages,
  listMyDirectMessages,
  markDirectMessagesRead,
} from '../../db.js'

test('adminCreateSiteMessage validates target user for direct messages', async () => {
  await assert.rejects(
    async () =>
      adminCreateSiteMessage({
        senderId: 1,
        targetType: 'individual',
        targetUserId: null,
        title: 'Secret Key',
        body: 'pass123',
      }),
    /invalid_target_user/,
  )
})

test('adminGetDirectChatMessages rejects non-numeric user ids', async () => {
  await assert.rejects(
    async () => adminGetDirectChatMessages('not-a-number'),
    /invalid_target_user/,
  )
})

test('listMyDirectMessages rejects non-numeric user ids', async () => {
  await assert.rejects(
    async () => listMyDirectMessages('invalid'),
    /invalid_user_id/,
  )
})

test('markDirectMessagesRead handles invalid user ids safely without crashing', async () => {
  await markDirectMessagesRead('bad_user_id')
})
