import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { isTopupMethodEnabled, topupMethodDisabledMessage } from '../../topupSettings.js'
import { deferEphemeral, respondEphemeral } from '../utils/interactionReply.js'

export const commandName = "topups"

export async function execute(interaction, handlers) {
  return handlers.handleTopupsPanel(interaction)
}

function withOptionEmoji(option, emoji) {
  return emoji ? { ...option, emoji } : option
}

const TOPUP_SELECT_OPTIONS = {
  promptpay: {
    label: 'PromptPay',
    description: 'Enter a custom amount and create a QR',
    value: 'promptpay',
  },
  angpao: {
    label: 'TrueMoney Angpao',
    description: 'Enter a TrueMoney gift link in Discord',
    value: 'angpao',
  },
  coupon: {
    label: 'Coupon',
    description: 'Redeem a coupon code in Discord',
    value: 'coupon',
  },
}

export async function buildTopupPanelRows(ctx, emoji, topupSettings = null) {
  const settings = topupSettings || await ctx.getTopupSettings()
  const arrowEmoji = ctx.topupArrowOptionEmoji(emoji)
  const enabledOptions = Object.entries(TOPUP_SELECT_OPTIONS)
    .filter(([method]) => isTopupMethodEnabled(settings, method))
    .map(([, option]) => withOptionEmoji(option, arrowEmoji))

  const rows = []
  if (enabledOptions.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('vx_topups_promptpay_amount')
          .setPlaceholder('PromptPay / Angpao / Coupon')
          .addOptions(enabledOptions),
      ),
    )
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Open Top Up Page').setURL(ctx.makeSiteUrl('/topup')).setStyle(ButtonStyle.Link),
    ),
  )
  return rows
}

export function buildTopupsPanelEmbed(ctx, profile, emoji, topupSettings = null) {
  const arrow = ctx.topupArrow(emoji)
  const settings = topupSettings || null
  const promptpayEnabled = settings ? isTopupMethodEnabled(settings, 'promptpay') : true
  const fields = [{ name: 'บัญชี', value: ctx.profileName(profile), inline: true }]

  if (promptpayEnabled) {
    fields.push({ name: 'PromptPay QR', value: `${arrow} QR มีอายุการใช้งาน 10 นาที`, inline: false })
    fields.push({
      name: 'ยืนยันสลิป',
      value: `${arrow} หลังชำระเงิน ให้ใช้ \`/topup verify-slip\` พร้อมรูปสลิป`,
      inline: false,
    })
  }

  if (settings && !Object.keys(TOPUP_SELECT_OPTIONS).some((method) => isTopupMethodEnabled(settings, method))) {
    fields.push({
      name: 'สถานะ',
      value: `${arrow} ช่องทางเติมเงินถูกปิดชั่วคราว กรุณาใช้เว็บไซต์หรือติดต่อแอดมิน`,
      inline: false,
    })
  }

  const embed = ctx.panelEmbed(
    'VxperS Top Up',
    'เลือกวิธีการเติมเงิน',
    fields,
    promptpayEnabled ? ctx.promptpayPanelImageUrl() : undefined,
  )
  const icon = ctx.storeIconUrl()
  if (/^https?:\/\//i.test(icon)) embed.setThumbnail(icon)
  return embed
}

async function resolveLinkedProfile(ctx, interaction) {
  const profile = await ctx.getDiscordLinkedUserByDiscordId(interaction.user.id)
  if (profile && !Boolean(profile.is_banned)) return profile

  await respondEphemeral(interaction, { embeds: [ctx.linkedRequiredEmbed()] })
  return null
}

export async function openTopupsPanel(ctx, interaction, profile = null) {
  await deferEphemeral(interaction)

  const linkedProfile = profile || await resolveLinkedProfile(ctx, interaction)
  if (!linkedProfile) return

  const topupSettings = await ctx.getTopupSettings()
  const topupEmoji = await ctx.getTopupEmoji(interaction.guild)
  await respondEphemeral(interaction, {
    embeds: [buildTopupsPanelEmbed(ctx, linkedProfile, topupEmoji, topupSettings)],
    components: await buildTopupPanelRows(ctx, topupEmoji, topupSettings),
  })
}

function friendlyCouponError(err) {
  const msg = String(err?.message || '')
  if (msg === 'topup_method_disabled') return topupMethodDisabledMessage('coupon')
  if (msg === 'coupon_not_found') return 'ไม่พบโค้ดคูปอง'
  if (msg === 'coupon_inactive') return 'คูปองนี้ไม่ทำงาน'
  if (msg === 'coupon_expired') return 'คูปองนี้หมดอายุแล้ว'
  if (msg === 'coupon_exhausted') return 'คูปองนี้ใช้หมดแล้ว'
  if (msg === 'coupon_already_used') return 'คุณใช้คูปองนี้แล้ว'
  return 'แลกคูปองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}

function friendlyAngpaoError(err) {
  const msg = String(err?.message || '')
  if (msg === 'topup_method_disabled') return topupMethodDisabledMessage('angpao')
  if (msg === 'invalid_reference') return 'Invalid gift link. Please send the full TrueMoney gift URL.'
  if (msg === 'invalid_voucher') return 'This gift link is invalid, redeemed, or unavailable.'
  if (msg === 'duplicate_reference') return 'This gift link has already been used.'
  if (msg === 'missing_config') return 'Topup is not configured yet. Please contact an admin.'
  return 'Topup failed. Please try again.'
}

function friendlyPromptpayError(err) {
  const msg = String(err?.message || '')
  if (msg === 'topup_method_disabled') return topupMethodDisabledMessage('promptpay')
  if (msg === 'invalid_points') return 'Invalid topup amount.'
  if (msg === 'missing_promptpay_config') return 'PromptPay topup is not configured yet.'
  if (msg === 'invalid_slip_image') return 'The slip image is invalid.'
  if (msg === 'slip_qr_not_found') return 'Could not find a QR code in this slip image.'
  if (msg === 'slip_amount_not_found') return 'Could not read the transfer amount from this slip.'
  if (msg === 'slip_amount_mismatch') return 'The slip amount does not match this topup.'
  if (msg === 'payment_qr_uploaded') return 'This image is the payment QR, not a transfer slip.'
  if (msg === 'duplicate_slip') return 'This slip has already been used.'
  if (msg === 'topup_expired') return 'This PromptPay QR has expired. Please create a new QR.'
  if (msg === 'topup_not_found') return 'Topup not found.'
  if (msg === 'already_paid') return 'This topup has already been paid.'
  if (msg === 'invalid_topup' || msg === 'invalid_topup_status') return 'This topup is not ready for slip verification.'
  return 'Could not process this PromptPay topup. Please try again.'
}

async function redeemCouponForInteraction(ctx, profile, code) {
  try {
    const settings = await ctx.getTopupSettings()
    if (!isTopupMethodEnabled(settings, 'coupon')) {
      throw new Error('topup_method_disabled')
    }
    const result = await ctx.redeemCoupon({ userId: profile.user_id, code })
    const wallet = await ctx.getWallet(profile.user_id)
    return {
      embeds: [
        ctx.successEmbed('Coupon Redeemed', 'แลกคูปองสำเร็จ เติมพ้อยท์เข้าบัญชีแล้ว', [
          { name: 'Coupon', value: String(result.code), inline: true },
          { name: 'Received', value: `${ctx.formatPoints(result.points)} points`, inline: true },
          { name: 'Balance', value: `${ctx.formatPoints(wallet?.balance)} points`, inline: true },
        ]),
      ],
    }
  } catch (err) {
    return { embeds: [ctx.errorEmbed('Coupon Failed', friendlyCouponError(err))] }
  }
}

function buildPromptpayCreatedPayload(ctx, result) {
  const qrDataUrl = String(result.qr?.imageDataUrl || '')
  const qrBase64 = qrDataUrl.includes(',') ? qrDataUrl.split(',').pop() : ''
  const files = []
  const embed = ctx.highlightEmbed(
    'PromptPay QR Created',
    'Scan the QR to pay, then verify the transfer slip to credit points to your account.',
    [
      { name: 'Topup ID', value: `#${result.topupId}`, inline: true },
      { name: 'Amount', value: `${ctx.formatPoints(result.points)} points`, inline: true },
      { name: 'Expires', value: `${ctx.formatDateTime(result.expiresAt)} (${ctx.formatDuration(result.ttlSeconds)})`, inline: true },
      { name: 'Reference', value: String(result.reference || '-'), inline: false },
      { name: 'Verify Slip', value: `Use \`/topup verify-slip topup_id:${result.topupId}\` and attach the transfer slip`, inline: false },
    ],
  )

  const icon = ctx.storeIconUrl()
  if (/^https?:\/\//i.test(icon)) embed.setThumbnail(icon)
  if (qrBase64) {
    files.push(new AttachmentBuilder(Buffer.from(qrBase64, 'base64'), { name: `promptpay-${result.topupId}.png` }))
    embed.setImage(`attachment://promptpay-${result.topupId}.png`)
  }

  return { embeds: [embed], files }
}

async function createPromptpayForInteraction(ctx, profile, points) {
  try {
    const result = await ctx.createPromptpayTopup({ userId: profile.user_id, points })
    return buildPromptpayCreatedPayload(ctx, result)
  } catch (err) {
    return { embeds: [ctx.errorEmbed('PromptPay Failed', friendlyPromptpayError(err))] }
  }
}

async function attachmentToDataUrl(attachment) {
  const url = String(attachment?.url || '')
  const contentType = String(attachment?.contentType || 'image/png')
  if (!url) throw new Error('invalid_slip_image')
  if (!/^image\//i.test(contentType)) throw new Error('invalid_slip_image')

  const response = await fetch(url)
  if (!response.ok) throw new Error('invalid_slip_image')
  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength > 8 * 1024 * 1024) throw new Error('invalid_slip_image')
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  return `data:${contentType};base64,${base64}`
}

export function createTopupsHandlers(ctx) {
  async function handleTopupsPanel(interaction) {
    await openTopupsPanel(ctx, interaction)
  }

  // This handler ends in showModal(), which rules out deferReply() — so it must not
  // touch the database first or a slow query costs us the 3s interaction deadline.
  // The account link and the per-method enabled check are re-run in each modal handler.
  async function handleTopupSelect(interaction) {
    const value = String(interaction.values?.[0] || '')
    if (!['promptpay', 'coupon', 'angpao'].includes(value)) return

    if (value === 'promptpay') {
      const modal = new ModalBuilder().setCustomId('vx_topups_promptpay_modal').setTitle('PromptPay Topup')
      const pointsInput = new TextInputBuilder()
        .setCustomId('points')
        .setLabel('Amount / points')
        .setPlaceholder('Example: 100')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(6)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(pointsInput))
      await interaction.showModal(modal)
      return
    }

    if (value === 'coupon') {
      const modal = new ModalBuilder().setCustomId('vx_topups_coupon_modal').setTitle('Coupon Topup')
      const codeInput = new TextInputBuilder()
        .setCustomId('code')
        .setLabel('Coupon code')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(120)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(codeInput))
      await interaction.showModal(modal)
      return
    }

    if (value === 'angpao') {
      const modal = new ModalBuilder().setCustomId('vx_topups_angpao_modal').setTitle('TrueMoney Angpao Topup')
      const linkInput = new TextInputBuilder()
        .setCustomId('link')
        .setLabel('TrueMoney gift link')
        .setStyle(TextInputStyle.Short)
        .setMinLength(10)
        .setMaxLength(500)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(linkInput))
      await interaction.showModal(modal)
    }
  }

  async function handleTopupsPromptpayModal(interaction) {
    await interaction.deferReply({ flags: ctx.EPHEMERAL })
    const profile = await resolveLinkedProfile(ctx, interaction)
    if (!profile) return

    const settings = await ctx.getTopupSettings()
    if (!isTopupMethodEnabled(settings, 'promptpay')) {
      await interaction.editReply({
        embeds: [ctx.errorEmbed('PromptPay Failed', topupMethodDisabledMessage('promptpay'))],
      })
      return
    }

    const rawPoints = interaction.fields.getTextInputValue('points').trim()
    const points = Number(rawPoints.replace(/,/g, ''))
    const payload = await createPromptpayForInteraction(ctx, profile, points)
    await interaction.editReply(payload)
  }

  async function handleTopupsAngpaoModal(interaction) {
    await interaction.deferReply({ flags: ctx.EPHEMERAL })
    const profile = await resolveLinkedProfile(ctx, interaction)
    if (!profile) return

    const settings = await ctx.getTopupSettings()
    if (!isTopupMethodEnabled(settings, 'angpao')) {
      await interaction.editReply({
        embeds: [ctx.errorEmbed('Angpao Topup Failed', topupMethodDisabledMessage('angpao'))],
      })
      return
    }

    const link = interaction.fields.getTextInputValue('link').trim()
    try {
      const result = await ctx.redeemAngpaoVoucher({ userId: profile.user_id, reference: link })
      const wallet = await ctx.getWallet(profile.user_id)
      await interaction.editReply({
        embeds: [
          ctx.successEmbed('Angpao Topup Complete', 'เติมเงินผ่าน TrueMoney สำเร็จ', [
            { name: 'Received', value: `${ctx.formatPoints(result.creditedPoints)} points`, inline: true },
            { name: 'Balance', value: `${ctx.formatPoints(wallet?.balance)} points`, inline: true },
          ]),
        ],
      })
    } catch (err) {
      await interaction.editReply({ embeds: [ctx.errorEmbed('Angpao Topup Failed', friendlyAngpaoError(err))] })
    }
  }

  async function handleTopupsCouponModal(interaction) {
    await interaction.deferReply({ flags: ctx.EPHEMERAL })
    const profile = await resolveLinkedProfile(ctx, interaction)
    if (!profile) return

    const settings = await ctx.getTopupSettings()
    if (!isTopupMethodEnabled(settings, 'coupon')) {
      await interaction.editReply({
        embeds: [ctx.errorEmbed('Coupon Failed', topupMethodDisabledMessage('coupon'))],
      })
      return
    }

    const code = interaction.fields.getTextInputValue('code').trim()
    const payload = await redeemCouponForInteraction(ctx, profile, code)
    await interaction.editReply(payload)
  }

  async function handleTopupVerifySlip(interaction) {
    const subcommand = interaction.options.getSubcommand(false)
    if (subcommand !== 'verify-slip') {
      await interaction.reply({
        embeds: [ctx.errorEmbed('Unsupported Topup', 'Use `/topup verify-slip` to verify a PromptPay slip.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    await interaction.deferReply({ flags: ctx.EPHEMERAL })
    const profile = await resolveLinkedProfile(ctx, interaction)
    if (!profile) return

    const settings = await ctx.getTopupSettings()
    if (!isTopupMethodEnabled(settings, 'promptpay')) {
      await interaction.editReply({
        embeds: [ctx.errorEmbed('PromptPay Verify Failed', topupMethodDisabledMessage('promptpay'))],
      })
      return
    }

    const topupId = interaction.options.getInteger('topup_id', true)
    const attachment = interaction.options.getAttachment('slip', true)
    try {
      const slipImage = await attachmentToDataUrl(attachment)
      const result = await ctx.verifyPromptpaySlip({ userId: profile.user_id, topupId, slipImage })
      const wallet = await ctx.getWallet(profile.user_id)
      await interaction.editReply({
        embeds: [
          ctx.successEmbed('PromptPay Topup Complete', 'ตรวจสลิปสำเร็จ เติมพ้อยท์เข้าบัญชีแล้ว', [
            { name: 'Topup ID', value: `#${result.topupId}`, inline: true },
            { name: 'Received', value: `${ctx.formatPoints(result.creditedPoints)} points`, inline: true },
            { name: 'Balance', value: `${ctx.formatPoints(wallet?.balance)} points`, inline: true },
            { name: 'Transaction Ref', value: String(result.transactionRef || '-'), inline: false },
          ]),
        ],
      })
    } catch (err) {
      await interaction.editReply({ embeds: [ctx.errorEmbed('PromptPay Verify Failed', friendlyPromptpayError(err))] })
    }
  }

  return {
    handleTopupsPanel,
    handleTopupSelect,
    handleTopupsPromptpayModal,
    handleTopupsAngpaoModal,
    handleTopupsCouponModal,
    handleTopupVerifySlip,
  }
}
