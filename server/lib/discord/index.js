import { Client, GatewayIntentBits } from 'discord.js'
import { routeChatCommand } from './commandRouter.js'
import { routeComponentInteraction } from './componentRouter.js'
import { buildCommandPayload } from './commandDefinitions.js'
import { registerCommands as registerDiscordCommands } from './commandRegistration.js'
import { createGlobalPanelHandlers } from './commands/globalpanel.js'
import { createLinkHandlers } from './commands/link.js'
import { createPointsHandlers } from './commands/points.js'
import { createTopupsHandlers } from './commands/topups.js'
import { createUnlinkHandlers } from './commands/unlink.js'
import { createDiscordContext } from './shared/context.js'

const ctx = createDiscordContext()
const handlers = {
  ...createLinkHandlers(ctx),
  ...createUnlinkHandlers(ctx),
  ...createPointsHandlers(ctx),
  ...createGlobalPanelHandlers(ctx),
  ...createTopupsHandlers(ctx),
}

let discordClientPromise = null
const passwordResetVerifications = new Map()

function makePasswordResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function cleanupPasswordResetVerifications() {
  const now = Date.now()
  for (const [key, value] of passwordResetVerifications.entries()) {
    if (!value || Number(value.expiresAt || 0) <= now) passwordResetVerifications.delete(key)
  }
}

function buildInviteUrl() {
  const explicit = ctx.envValue('DISCORD_BOT_INVITE_URL')
  if (explicit) return explicit

  const clientId = ctx.envValue('DISCORD_CLIENT_ID')
  if (!clientId) return null

  const permissions = ctx.envValue('DISCORD_BOT_PERMISSIONS') || '0'
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands',
    permissions,
  })
  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

export function getDiscordBotPublicConfig() {
  const clientId = ctx.envValue('DISCORD_CLIENT_ID')
  return {
    configured: Boolean(ctx.envValue('DISCORD_BOT_TOKEN') || clientId || ctx.envValue('DISCORD_BOT_INVITE_URL')),
    client_id: clientId || null,
    invite_url: buildInviteUrl(),
    command_hint: '/topups',
  }
}

export async function requestDiscordPasswordResetCode({ userId, discordUserId, accountLabel }) {
  const uid = Number(userId)
  const did = String(discordUserId || '').trim()
  if (!Number.isFinite(uid) || uid <= 0 || !did) throw new Error('invalid_payload')
  if (!discordClientPromise) throw new Error('bot_not_ready')

  const client = await discordClientPromise
  if (!client) throw new Error('bot_not_ready')

  cleanupPasswordResetVerifications()
  const code = makePasswordResetCode()
  const expiresAt = Date.now() + 10 * 60 * 1000
  passwordResetVerifications.set(String(uid), { code, expiresAt })

  try {
    const discordUser = await client.users.fetch(did)
    await discordUser.send({
      embeds: [
        ctx.warningEmbed('Password Verification Code', 'Use this code to confirm your password change from the website.', [
          { name: 'Verification Code', value: `\`${code}\``, inline: true },
          { name: 'Account', value: String(accountLabel || `User #${uid}`), inline: true },
          { name: 'Expires', value: '10 minutes', inline: true },
        ]),
      ],
    })
  } catch (err) {
    passwordResetVerifications.delete(String(uid))
    throw new Error(err?.code === 50007 ? 'dm_failed' : 'bot_delivery_failed')
  }

  return { expires_at: new Date(expiresAt).toISOString(), ttl_minutes: 10 }
}

export async function sendDiscordOrderTracking({
  discordUserId,
  orderId,
  orderRef,
  itemName,
  quantity,
  totalPoints,
  createdAt,
  statusLabel,
  actionLabel,
  actionPath,
} = {}) {
  const did = String(discordUserId || '').trim()
  const oid = Number(orderId)
  const qty = Number(quantity)
  const total = Number(totalPoints)
  const productLabel = String(itemName || '').trim()
  const statusText = String(statusLabel || '').trim()
  if (!did || !Number.isFinite(oid) || oid <= 0) throw new Error('invalid_payload')
  if (!discordClientPromise) throw new Error('bot_not_ready')

  const client = await discordClientPromise
  if (!client) throw new Error('bot_not_ready')

  const fields = [
    { name: 'Order Ref', value: `\`${String(orderRef || `#${oid}`)}\``, inline: true },
    { name: 'ยอดที่ชำระ', value: `${ctx.formatPoints(total)} พ้อย`, inline: true },
    { name: 'เวลา', value: ctx.formatDateTime(createdAt), inline: true },
  ]

  if (productLabel) fields.push({ name: 'สินค้า', value: productLabel, inline: false })
  if (Number.isFinite(qty) && qty > 0) fields.push({ name: 'จำนวน', value: `${qty}`, inline: true })
  if (statusText) fields.push({ name: 'สถานะล่าสุด', value: statusText, inline: false })

  const detailUrl = ctx.makeSiteUrl(`/history/orders/${oid}`)
  fields.push({ name: 'ติดตามคำสั่งซื้อ', value: `[เปิดหน้าติดตามออเดอร์](${detailUrl})`, inline: false })

  const actionText = String(actionLabel || '').trim()
  const actionUrl = String(actionPath || '').trim()
  if (actionText && actionUrl) {
    fields.push({ name: 'ลิงก์ด่วน', value: `[${actionText}](${ctx.makeSiteUrl(actionUrl)})`, inline: false })
  }

  try {
    const discordUser = await client.users.fetch(did)
    await discordUser.send({
      embeds: [
        ctx.infoEmbed(
          'Order Tracking',
          'มีอัปเดตคำสั่งซื้อใหม่จากเว็บไซต์ของคุณ',
          fields,
        ),
      ],
    })
  } catch (err) {
    throw new Error(err?.code === 50007 ? 'dm_failed' : 'bot_delivery_failed')
  }

  return { ok: true }
}

export function verifyDiscordPasswordResetCode({ userId, code }) {
  const uid = Number(userId)
  const input = String(code || '').trim()
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_payload')

  cleanupPasswordResetVerifications()
  const state = passwordResetVerifications.get(String(uid))
  if (!state || Number(state.expiresAt || 0) <= Date.now()) throw new Error('discord_code_expired')
  if (input !== state.code) throw new Error('discord_code_invalid')

  passwordResetVerifications.delete(String(uid))
  return true
}

async function registerCommands(client) {
  const body = buildCommandPayload()
  await registerDiscordCommands({ client, envValue: ctx.envValue, body })
}

async function replyInteractionError(interaction, err, logLabel) {
  console.error(`[Discord] ${logLabel}`, err)
  const payload = { embeds: [ctx.errorEmbed('Interaction Failed', 'This action failed. Please try again.')], flags: ctx.EPHEMERAL }
  if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: payload.embeds }).catch(() => {})
  else await interaction.reply(payload).catch(() => {})
}

async function handleInteraction(interaction) {
  const componentHandled = await routeComponentInteraction(interaction, handlers, replyInteractionError)
  if (componentHandled !== null) return
  await routeChatCommand(interaction, handlers, replyInteractionError)
}

export async function startDiscordBot() {
  const token = ctx.envValue('DISCORD_BOT_TOKEN')
  if (!token) {
    console.log('[Discord] bot disabled: DISCORD_BOT_TOKEN is not set')
    return null
  }

  if (discordClientPromise) return discordClientPromise

  const client = new Client({ intents: [GatewayIntentBits.Guilds] })
  client.once('clientReady', async () => {
    console.log(`[Discord] logged in as ${client.user?.tag || client.user?.id || 'bot'}`)
    try {
      await registerCommands(client)
    } catch (err) {
      console.error('[Discord] command registration failed', err)
    }
  })
  client.on('interactionCreate', handleInteraction)

  discordClientPromise = client.login(token)
    .then(() => client)
    .catch((err) => {
      discordClientPromise = null
      console.error('[Discord] login failed', err)
      return null
    })

  return discordClientPromise
}
