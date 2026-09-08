import test from 'node:test'
import assert from 'node:assert/strict'

import { createDiscordContext } from '../../lib/discord/shared/context.js'
import { createGlobalPanelHandlers } from '../../lib/discord/commands/globalpanel.js'
import { createTopupsHandlers } from '../../lib/discord/commands/topups.js'

/**
 * Discord invalidates an interaction token 3 seconds after the user clicks. Handlers
 * that query the database before answering used to blow past that and surface as
 * "This interaction failed". These tests pin the two rules that avoid it:
 *   - anything that touches the database must deferReply() first, and
 *   - anything that ends in showModal() must not touch the database at all,
 *     because a deferred interaction can no longer open a modal.
 */

function makeInteraction({ customId = '', values = [], user = { id: '900' } } = {}) {
  const calls = []
  const interaction = {
    customId,
    values,
    user: { ...user, send: async () => { calls.push('user.send'); } },
    guild: null,
    deferred: false,
    replied: false,
    calls,
    async deferReply() {
      calls.push('deferReply')
      this.deferred = true
    },
    async reply() {
      calls.push('reply')
      this.replied = true
    },
    async editReply() {
      calls.push('editReply')
    },
    async showModal() {
      calls.push('showModal')
      this.replied = true
    },
  }
  return interaction
}

/** Real context, with every outbound call replaced by a recorded stub. */
function makeStubContext(calls, overrides = {}) {
  const real = createDiscordContext()
  const track = (name, value) => async (...args) => {
    calls.push(name)
    return typeof value === 'function' ? value(...args) : value
  }
  return {
    ...real,
    getDiscordLinkedUserByDiscordId: track('db:profile', { user_id: 7, display_name: 'Tester', is_banned: false }),
    getTopupSettings: track('db:topupSettings', {}),
    getWallet: track('db:wallet', { balance: 100 }),
    listMyOrders: track('db:orders', []),
    getTopupEmoji: track('api:emoji', null),
    setUserPassword: track('db:setPassword', true),
    ...overrides,
  }
}

const DB_CALL = (name) => name.startsWith('db:') || name.startsWith('api:')

test('panel buttons defer before the first database call', async () => {
  const calls = []
  const ctx = makeStubContext(calls)
  const handlers = createGlobalPanelHandlers(ctx)
  const interaction = makeInteraction({ customId: 'vx_panel_wallet' })

  await handlers.handleGlobalPanelButton(interaction)

  const combined = [...interaction.calls, ...calls]
  assert.equal(interaction.calls[0], 'deferReply', 'the button must defer first')
  const firstDbCall = combined.findIndex(DB_CALL)
  assert.ok(firstDbCall > 0, 'a database call is expected in this branch')
  assert.ok(calls.includes('db:wallet'))
  assert.ok(interaction.calls.includes('editReply'), 'the deferred reply must be edited, not replied to')
})

test('the password-confirm button opens its modal without deferring', async () => {
  const calls = []
  const ctx = makeStubContext(calls)
  ctx.passwordVerifications.set('900', { code: '123456', userId: 7, expiresAt: Date.now() + 60_000 })
  const handlers = createGlobalPanelHandlers(ctx)
  const interaction = makeInteraction({ customId: 'vx_panel_password_confirm' })

  await handlers.handleGlobalPanelButton(interaction)

  assert.deepEqual(interaction.calls, ['showModal'])
  assert.ok(!interaction.calls.includes('deferReply'), 'a deferred interaction cannot open a modal')
})

test('an unrecognised panel button still answers its own defer', async () => {
  const calls = []
  const handlers = createGlobalPanelHandlers(makeStubContext(calls))
  const interaction = makeInteraction({ customId: 'vx_panel_removed_feature' })

  await handlers.handleGlobalPanelButton(interaction)

  assert.deepEqual(interaction.calls, ['deferReply', 'editReply'], 'otherwise it hangs on "thinking..."')
})

test('the panel select menu defers before loading the topup panel', async () => {
  const calls = []
  const handlers = createGlobalPanelHandlers(makeStubContext(calls))
  const interaction = makeInteraction({ customId: 'vx_global_actions', values: ['topups'] })

  await handlers.handleGlobalPanelSelect(interaction)

  assert.equal(interaction.calls[0], 'deferReply')
  assert.ok(calls.some(DB_CALL), 'this branch does hit the database')
  assert.ok(interaction.calls.includes('editReply'))
})

test('the topup select menu reaches showModal with no database calls at all', async () => {
  for (const value of ['promptpay', 'coupon', 'angpao']) {
    const calls = []
    const handlers = createTopupsHandlers(makeStubContext(calls))
    const interaction = makeInteraction({ customId: 'vx_topups_promptpay_amount', values: [value] })

    await handlers.handleTopupSelect(interaction)

    assert.deepEqual(interaction.calls, ['showModal'], `${value}: must open its modal immediately`)
    assert.deepEqual(calls, [], `${value}: no database work may run before showModal`)
  }
})

test('the topup modals still re-check the account link and the method switch', async () => {
  const calls = []
  const ctx = makeStubContext(calls, {
    getTopupSettings: async () => {
      calls.push('db:topupSettings')
      return { coupon_enabled: false }
    },
  })
  const handlers = createTopupsHandlers(ctx)
  const interaction = makeInteraction({ customId: 'vx_topups_coupon_modal' })
  interaction.fields = { getTextInputValue: () => 'SOMECODE' }

  await handlers.handleTopupsCouponModal(interaction)

  assert.equal(interaction.calls[0], 'deferReply')
  assert.ok(calls.includes('db:profile'), 'the link check moved here from the select handler')
  assert.ok(calls.includes('db:topupSettings'), 'the method check moved here from the select handler')
})
