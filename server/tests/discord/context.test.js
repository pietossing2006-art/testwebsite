import test from 'node:test'
import assert from 'node:assert/strict'

import { createDiscordContext } from '../../lib/discord/shared/context.js'

test('buildEmbed applies premium defaults and footer branding', () => {
  const ctx = createDiscordContext()
  const embed = ctx.buildEmbed({
    title: 'Wallet Balance',
    description: 'Latest wallet total for this account.',
    footer: 'Custom footer',
  })
  const json = embed.toJSON()

  assert.equal(json.title, 'Wallet Balance')
  assert.equal(json.description, 'Latest wallet total for this account.')
  assert.equal(json.footer?.text, 'Custom footer')
  assert.ok(json.timestamp)
  assert.equal(typeof json.color, 'number')
})

test('buildOrdersEmbeds produces a header embed plus order cards', () => {
  const ctx = createDiscordContext()
  const embeds = ctx.buildOrdersEmbeds({
    profile: { user_id: 7, display_name: 'VX Tester' },
    orders: [
      {
        id: 81,
        ref: 'ORD-81',
        qty: 2,
        total_points: 600,
        unit_price_points: 300,
        product_name: 'Nitro Boost',
        category_name: 'Discord',
        status: 'paid',
        created_at: '2026-05-18T06:30:00.000Z',
      },
    ],
    emoji: { id: '1', name: 'arrow', animated: false },
  })

  assert.equal(embeds.length, 2)
  assert.equal(embeds[0].toJSON().title, 'Recent Orders')
  assert.match(embeds[1].toJSON().title, /Order/)
})

test('panelEmbed uses the branded panel variant', () => {
  const ctx = createDiscordContext()
  const embed = ctx.panelEmbed('VxperS Store', 'Premium account actions live here.', [
    { name: 'Top Up', value: 'PromptPay, Angpao, Coupon', inline: true },
  ])
  const json = embed.toJSON()

  assert.equal(json.title, 'VxperS Store')
  assert.equal(json.description, 'Premium account actions live here.')
  assert.equal(json.fields?.[0]?.name, 'Top Up')
  assert.equal(json.footer?.text, 'VxperS Store')
})

test('highlightEmbed preserves value-first hierarchy', () => {
  const ctx = createDiscordContext()
  const embed = ctx.highlightEmbed('PromptPay QR Created', 'Scan the QR and verify with your slip.', [
    { name: 'Topup ID', value: '#88', inline: true },
    { name: 'Expires', value: '18 May 2026, 13:45', inline: true },
  ])
  const json = embed.toJSON()

  assert.equal(json.title, 'PromptPay QR Created')
  assert.equal(json.fields?.length, 2)
  assert.ok(json.timestamp)
})

test('success, warning, info, and error embeds preserve distinct semantic colors', () => {
  const ctx = createDiscordContext()
  const success = ctx.successEmbed('Success', 'Done').toJSON()
  const warning = ctx.warningEmbed('Warning', 'Check this').toJSON()
  const info = ctx.infoEmbed('Info', 'Heads up').toJSON()
  const error = ctx.errorEmbed('Error', 'Failed').toJSON()

  assert.notEqual(success.color, warning.color)
  assert.notEqual(success.color, error.color)
  assert.notEqual(info.color, error.color)
})
