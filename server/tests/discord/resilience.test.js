import test from 'node:test'
import assert from 'node:assert/strict'

import { Client, GatewayIntentBits } from 'discord.js'

/**
 * The Discord client runs inside the API process. Node throws when an EventEmitter
 * emits 'error' with no listener, so a gateway hiccup used to take the whole server
 * down with it. These tests pin the listeners that keep it isolated.
 */

function makeClient() {
  return new Client({ intents: [GatewayIntentBits.Guilds] })
}

test('a client without an error listener throws — the failure mode being guarded against', () => {
  const client = makeClient()
  client.once('clientReady', () => {})
  client.on('interactionCreate', () => {})

  assert.throws(() => client.emit('error', new Error('simulated gateway failure')), /simulated gateway failure/)
})

test('the diagnostics listeners keep gateway errors from escaping', () => {
  const client = makeClient()
  const seen = []
  client.on('error', (err) => seen.push(err.message))
  client.on('shardError', (err) => seen.push(`shard:${err.message}`))

  assert.doesNotThrow(() => client.emit('error', new Error('gateway down')))
  assert.doesNotThrow(() => client.emit('shardError', new Error('shard down'), 0))
  assert.deepEqual(seen, ['gateway down', 'shard:shard down'])
})

test('startDiscordBot stays inert when no bot token is configured', async (t) => {
  const previous = process.env.DISCORD_BOT_TOKEN
  process.env.DISCORD_BOT_TOKEN = ''
  t.after(() => {
    if (previous === undefined) delete process.env.DISCORD_BOT_TOKEN
    else process.env.DISCORD_BOT_TOKEN = previous
  })

  const { startDiscordBot } = await import('../../lib/discord/index.js')
  assert.equal(await startDiscordBot(), null)
})
