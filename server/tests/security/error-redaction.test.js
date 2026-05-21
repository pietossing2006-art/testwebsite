import test from 'node:test'
import assert from 'node:assert/strict'

import { encodeDiscordError } from '../../routes/auth.js'

test('encodeDiscordError hides unexpected Discord OAuth failure details', () => {
  const value = encodeDiscordError('discord_login_failed', 'password_hash column missing')

  assert.equal(value, 'discord_login_failed')
  assert.equal(value.includes('password_hash'), false)
})
