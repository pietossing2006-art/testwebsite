import test from 'node:test'
import assert from 'node:assert/strict'

import { createDiscordContext } from '../../lib/discord/shared/context.js'
import { buildGlobalPanelEmbed } from '../../lib/discord/commands/globalpanel.js'
import { buildTopupsPanelEmbed } from '../../lib/discord/commands/topups.js'

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
