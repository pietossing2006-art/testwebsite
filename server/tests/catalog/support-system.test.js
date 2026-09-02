import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSupportTicket,
  adminReplySupportTicket,
  getMySupportTicket,
  adminGetSupportTicket,
} from '../../db.js'

test('createSupportTicket validates required fields and bounds', async () => {
  await assert.rejects(
    async () => createSupportTicket({ userId: 'invalid', subject: 'test', message: 'test' }),
    /invalid_user_id/,
  )

  await assert.rejects(
    async () => createSupportTicket({ userId: 1, subject: '', message: 'test' }),
    /invalid_subject/,
  )

  await assert.rejects(
    async () => createSupportTicket({ userId: 1, subject: 'test', message: '' }),
    /invalid_message/,
  )

  await assert.rejects(
    async () => createSupportTicket({ userId: 1, subject: 'test', message: 'test', orderId: 'bad_id' }),
    /invalid_order_id/,
  )
})
