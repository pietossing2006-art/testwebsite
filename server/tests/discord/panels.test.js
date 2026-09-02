import test from 'node:test'
import assert from 'node:assert/strict'

import { createDiscordContext } from '../../lib/discord/shared/context.js'
import { buildGlobalPanelEmbed } from '../../lib/discord/commands/globalpanel.js'
import { buildTopupsPanelEmbed } from '../../lib/discord/commands/topups.js'
import { buildProfileEmbed } from '../../lib/discord/commands/profile.js'

test('buildGlobalPanelEmbed uses branded panel hierarchy', () => {
  const ctx = createDiscordContext()
  const embed = buildGlobalPanelEmbed(ctx, { id: '1', name: 'arrow', animated: false })
  const json = embed.toJSON()

  assert.equal(json.title, 'VxperS Store')
  assert.ok(json.description?.includes('PromptPay'))
  assert.equal(json.footer?.text, 'VxperS Store')
})

test('buildTopupsPanelEmbed emphasizes account, verification path, and image support', () => {
  const ctx = createDiscordContext()
  const embed = buildTopupsPanelEmbed(
    ctx,
    { user_id: 12, display_name: 'Topup Tester' },
    { id: '1', name: 'arrow', animated: false },
  )
  const json = embed.toJSON()

  assert.equal(json.title, 'VxperS Top Up')
  assert.equal(json.fields?.[0]?.name, 'บัญชี')
  assert.ok(json.fields?.some((field) => field.name === 'ยืนยันสลิป'))
})

test('buildProfileEmbed shows linked account, balance, and quick links', () => {
  const ctx = createDiscordContext()
  const embed = buildProfileEmbed(ctx, {
    profile: {
      user_id: 42,
      email: 'test@example.com',
      username: 'tester',
      display_name: 'Test User',
      role: 'user',
      discord_username: 'tester#0001',
      linked_at: '2026-01-01T00:00:00.000Z',
      balance: 1500,
    },
    wallet: { balance: 1500 },
    vip: { tier: { name: 'Gold', discount_percent: 5 }, points_spent: 9000 },
    unreadCount: 2,
    discordUser: { username: 'discord_user' },
  })
  const json = embed.toJSON()

  assert.equal(json.title, 'โปรไฟล์ของคุณ')
  assert.ok(json.fields?.some((field) => field.name === 'บัญชีเว็บ' && field.value.includes('Test User')))
  assert.ok(json.fields?.some((field) => field.name === 'ยอดคงเหลือ' && field.value.includes('1,500')))
  assert.ok(json.fields?.some((field) => field.name === 'VIP' && field.value.includes('Gold')))
  assert.ok(json.fields?.some((field) => field.name === 'ข้อความใหม่'))
})
