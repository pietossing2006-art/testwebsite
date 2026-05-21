import { EmbedBuilder } from 'discord.js'
import {
  adjustUserPoints,
  claimDiscordLinkCode,
  getDiscordLinkedUserByDiscordId,
  getProductById,
  getUserById,
  getWallet,
  listMyOrders,
  redeemCoupon,
  setUserPassword,
  unlinkDiscordByDiscordUserId,
} from '../../../db.js'
import { createPromptpayTopup, redeemAngpaoVoucher, verifyPromptpaySlip } from '../../topup.js'

const EPHEMERAL = 64
const EMBED_COLORS = {
  primary: 0x3aa0ff,
  discord: 0x4c5bd4,
  panel: 0x2d4f8f,
  highlight: 0xd4a64a,
  success: 0x2fbf71,
  warning: 0xe7a93b,
  danger: 0xd9534f,
  orders: 0x3d6fd6,
}
const TOPUP_ARROW_EMOJI_NAME = '32877animatedarrowbluelite'
const TOPUP_ARROW_EMOJI_ID = '1505093928976908298'

export function createDiscordContext() {
  const passwordVerifications = new Map()

  function envValue(name) {
    const value = String(process.env[name] || '').trim()
    if (/^optional_/i.test(value)) return ''
    return value
  }

  function formatPoints(value) {
    return Math.round(Number(value) || 0).toLocaleString('th-TH')
  }

  function compactText(value, max = 120) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (text.length <= max) return text
    return `${text.slice(0, Math.max(0, max - 3))}...`
  }

  function compactMultilineText(value, max = 4096) {
    const text = String(value ?? '')
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .trim()
    if (text.length <= max) return text
    return `${text.slice(0, Math.max(0, max - 3))}...`
  }

  function buildEmbed({ title, description, color = EMBED_COLORS.primary, fields, imageUrl, footer } = {}) {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(compactText(title || 'VxperS Store', 256))
      .setTimestamp(new Date())

    const desc = String(description ?? '').trim()
    if (desc) embed.setDescription(compactMultilineText(desc, 4096))

    const cleanFields = Array.isArray(fields)
      ? fields
          .filter((field) => field && String(field.name ?? '').trim() && String(field.value ?? '').trim())
          .slice(0, 25)
          .map((field) => ({
            name: compactText(field.name, 256),
            value: compactMultilineText(field.value, 1024),
            inline: Boolean(field.inline),
          }))
      : []
    if (cleanFields.length) embed.addFields(cleanFields)

    const image = String(imageUrl || '').trim()
    if (/^https?:\/\//i.test(image)) embed.setImage(image)

    embed.setFooter({ text: footer || 'VxperS Store' })
    return embed
  }

  function successEmbed(title, description, fields) {
    return buildEmbed({ title, description, fields, color: EMBED_COLORS.success })
  }

  function errorEmbed(title, description, fields) {
    return buildEmbed({ title, description, fields, color: EMBED_COLORS.danger })
  }

  function infoEmbed(title, description, fields) {
    return buildEmbed({ title, description, fields, color: EMBED_COLORS.discord })
  }

  function warningEmbed(title, description, fields) {
    return buildEmbed({ title, description, fields, color: EMBED_COLORS.warning })
  }

  function panelEmbed(title, description, fields, imageUrl) {
    return buildEmbed({
      title,
      description,
      fields,
      imageUrl,
      color: EMBED_COLORS.panel,
      footer: 'VxperS Store',
    })
  }

  function highlightEmbed(title, description, fields, imageUrl) {
    return buildEmbed({
      title,
      description,
      fields,
      imageUrl,
      color: EMBED_COLORS.highlight,
      footer: 'VxperS Store',
    })
  }

  function siteBaseUrl() {
    return envValue('PUBLIC_SITE_URL') || envValue('CLIENT_ORIGIN') || 'https://www.vxpers.com'
  }

  function makeSiteUrl(path) {
    const base = siteBaseUrl().replace(/\/+$/, '')
    const cleanPath = String(path || '/').startsWith('/') ? path : `/${path}`
    return `${base}${cleanPath}`
  }

  function makeMediaUrl(value) {
    const text = String(value || '').trim()
    if (!text) return ''
    if (/^https?:\/\//i.test(text)) return text
    if (text.startsWith('/')) return makeSiteUrl(text)
    return ''
  }

  function storeIconUrl() {
    return envValue('DISCORD_STORE_ICON_URL') || envValue('DISCORD_PANEL_THUMBNAIL_URL') || ''
  }

  function promptpayPanelImageUrl() {
    return envValue('DISCORD_TOPUP_IMAGE_URL') || envValue('DISCORD_PANEL_IMAGE_URL') || ''
  }

  function formatDateTime(value) {
    const time = value ? new Date(value).getTime() : Number.NaN
    if (!Number.isFinite(time)) return '-'
    return new Date(time).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    })
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0))
    const mins = Math.floor(total / 60)
    const secs = total % 60
    if (mins <= 0) return `${secs}s`
    return `${mins}m ${secs.toString().padStart(2, '0')}s`
  }

  function resolveGuildEmoji(guild, name) {
    if (!guild?.emojis?.cache) return null
    return guild.emojis.cache.find((emoji) => emoji?.name === name) || null
  }

  function topupEmojiFromEnv() {
    const rawEmoji = envValue('DISCORD_TOPUP_ARROW_EMOJI')
    const parsed = rawEmoji.match(/^<(?<animated>a?):(?<name>[^:>]+):(?<id>\d+)>$/)
    if (parsed?.groups?.id) {
      return {
        id: parsed.groups.id,
        name: parsed.groups.name || TOPUP_ARROW_EMOJI_NAME,
        animated: parsed.groups.animated === 'a',
      }
    }

    const id = envValue('DISCORD_TOPUP_ARROW_EMOJI_ID')
    return {
      id: id || TOPUP_ARROW_EMOJI_ID,
      name: envValue('DISCORD_TOPUP_ARROW_EMOJI_NAME') || TOPUP_ARROW_EMOJI_NAME,
      animated: true,
    }
  }

  async function fetchGuildEmojiByName(guild, name) {
    if (!guild?.emojis) return null
    const cached = resolveGuildEmoji(guild, name)
    if (cached) return cached
    try {
      await guild.emojis.fetch()
    } catch {
      return null
    }
    return resolveGuildEmoji(guild, name)
  }

  function topupArrow(emoji) {
    if (!emoji?.id) return '>'
    return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
  }

  function topupArrowOptionEmoji(emoji) {
    if (!emoji?.id) return null
    return { name: emoji.name, id: emoji.id, animated: Boolean(emoji.animated) }
  }

  async function getTopupEmoji(guild) {
    return topupEmojiFromEnv() || fetchGuildEmojiByName(guild, TOPUP_ARROW_EMOJI_NAME)
  }

  function profileName(profile) {
    return String(profile?.display_name || profile?.username || profile?.email || `User #${profile?.user_id || '-'}`)
  }

  function userDisplayName(user) {
    return String(user?.display_name || user?.username || user?.email || `User #${user?.id || user?.user_id || '-'}`)
  }

  function linkedRequiredEmbed() {
    return warningEmbed(
      'Account Not Linked',
      'This Discord account is not linked to a website account yet. Use `/link code:<code>` first.',
    )
  }

  function discordTag(interaction) {
    const username = interaction.user?.username ? String(interaction.user.username) : ''
    const globalName = interaction.user?.globalName ? String(interaction.user.globalName) : ''
    if (globalName && username && globalName !== username) return `${globalName} (@${username})`
    return username || globalName || null
  }

  function isDiscordFinanceRole(role) {
    return ['owner', 'admin', 'finance'].includes(String(role || '').trim().toLowerCase())
  }

  function isOwnerRole(role) {
    return String(role || '').trim().toLowerCase() === 'owner'
  }

  function orderStatusLabel(status) {
    const value = String(status || '').trim().toLowerCase()
    if (value === 'paid') return 'Paid'
    if (value === 'fulfilled') return 'Fulfilled'
    if (value === 'pending') return 'Pending'
    if (value === 'cancelled' || value === 'canceled') return 'Cancelled'
    return value ? compactText(value, 40) : '-'
  }

  function buildOrdersEmbeds({ profile, orders, emoji } = {}) {
    const arrow = topupArrow(emoji)
    const header = infoEmbed('Recent Orders', `รายการล่าสุดของ ${profileName(profile)}`, [
      { name: 'ทั้งหมดที่แสดง', value: `${formatPoints(orders.length)} รายการ`, inline: true },
      { name: 'ดูบนเว็บ', value: makeSiteUrl('/orders'), inline: true },
    ])

    const embeds = [header]
    for (const order of orders.slice(0, 8)) {
      const ref = order.ref || `#${order.id}`
      const qty = Math.max(1, Number(order.qty) || 1)
      const total = Number(order.total_points ?? (Number(order.unit_price_points) * qty))
      const unit = Number(order.unit_price_points)
      const option = order.product_option ? `\n${arrow} ตัวเลือก: ${compactText(order.product_option, 80)}` : ''
      const created = order.created_at ? formatDateTime(order.created_at) : '-'
      const embed = buildEmbed({
        title: `Order ${compactText(ref, 80)}`,
        description: [
          `${arrow} สินค้า: ${compactText(order.product_name || `Product #${order.product_id || '-'}`, 120)}`,
          `${arrow} หมวดหมู่: ${compactText(order.category_name || '-', 80)}${option}`,
          `${arrow} จำนวน: ${formatPoints(qty)} ชิ้น`,
          `${arrow} ราคา: ${Number.isFinite(unit) ? `${formatPoints(unit)} พ้อยท์/ชิ้น` : '-'}`,
          `${arrow} รวม: ${formatPoints(Number.isFinite(total) ? total : 0)} พ้อยท์`,
          `${arrow} สถานะ: ${orderStatusLabel(order.status)}`,
          `${arrow} เวลา: ${created}`,
        ].join('\n'),
        color: EMBED_COLORS.orders,
        footer: 'VxperS Store - Orders',
      })
      const image = makeMediaUrl(order.product_image_url)
      if (image) embed.setThumbnail(image)
      embeds.push(embed)
    }
    return embeds
  }

  return {
    EPHEMERAL,
    EMBED_COLORS,
    passwordVerifications,
    adjustUserPoints,
    claimDiscordLinkCode,
    createPromptpayTopup,
    redeemAngpaoVoucher,
    redeemCoupon,
    setUserPassword,
    unlinkDiscordByDiscordUserId,
    verifyPromptpaySlip,
    getDiscordLinkedUserByDiscordId,
    getProductById,
    getUserById,
    getWallet,
    listMyOrders,
    envValue,
    formatPoints,
    compactText,
    compactMultilineText,
    buildEmbed,
    successEmbed,
    errorEmbed,
    infoEmbed,
    warningEmbed,
    panelEmbed,
    highlightEmbed,
    makeSiteUrl,
    makeMediaUrl,
    storeIconUrl,
    promptpayPanelImageUrl,
    formatDateTime,
    formatDuration,
    topupArrow,
    topupArrowOptionEmoji,
    getTopupEmoji,
    profileName,
    userDisplayName,
    linkedRequiredEmbed,
    discordTag,
    isDiscordFinanceRole,
    isOwnerRole,
    buildOrdersEmbeds,
  }
}
