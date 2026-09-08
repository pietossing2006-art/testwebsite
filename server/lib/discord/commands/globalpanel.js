import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { openTopupsPanel } from './topups.js'
import { deferEphemeral, respondEphemeral } from '../utils/interactionReply.js'

export const commandName = "globalpanel"

export async function execute(interaction, handlers) {
  return handlers.handleGlobalPanel(interaction)
}

export function buildGlobalPanelEmbed(ctx, emoji) {
  const arrow = ctx.topupArrow(emoji)
  const image = String(ctx.envValue('DISCORD_GLOBAL_PANEL_IMAGE_URL') || ctx.envValue('DISCORD_PANEL_IMAGE_URL') || '').trim()
  const embed = ctx.panelEmbed(
    'VxperS Store',
    'ระบบเติมเงิน PromptPay และเครื่องมือจัดการบัญชี Discord ในที่เดียว',
    [
      { name: 'เติมเงิน', value: `${arrow} PromptPay, TrueMoney อังเปา และ คูปอง`, inline: true },
      { name: 'บัญชี', value: `${arrow} ลิงก์, ยกเลิกการลิงก์ และอื่นๆ`, inline: true },
    ],
    image,
  )
  const icon = ctx.storeIconUrl()
  if (/^https?:\/\//i.test(icon)) embed.setThumbnail(icon)
  return embed
}

function buildGlobalPanelRows(ctx, emoji) {
  const arrowEmoji = ctx.topupArrowOptionEmoji(emoji)
  const withEmoji = (option) => (arrowEmoji ? { ...option, emoji: arrowEmoji } : option)

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('vx_global_actions')
        .setPlaceholder('เลือกฟีเจอร์ที่ต้องการ')
        .addOptions([
          withEmoji({
            label: 'เติมเงิน',
            description: 'PromptPay, TrueMoney อังเปา และ คูปอง',
            value: 'topups',
          }),
          withEmoji({
            label: 'ยืนยันสลิป',
            description: 'ส่งสลิปเพื่อยืนยัน PromptPay',
            value: 'verify_slip',
          }),
          withEmoji({
            label: 'Link',
            description: 'ลิงก์บัญชีเว็บกับ Discord',
            value: 'link',
          }),
          withEmoji({
            label: 'Unlink',
            description: 'ยกเลิกการลิงก์บัญชี',
            value: 'unlink',
          })
        ]),
    ),
  ]
}

function buildPasswordConfirmRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vx_panel_password_confirm').setLabel('Confirm Password Change').setStyle(ButtonStyle.Danger),
    ),
  ]
}

async function getPanelProfileOrReply(ctx, interaction) {
  const profile = await ctx.getDiscordLinkedUserByDiscordId(interaction.user.id)
  if (profile && !Boolean(profile.is_banned)) return profile
  await respondEphemeral(interaction, { embeds: [ctx.linkedRequiredEmbed()], flags: ctx.EPHEMERAL })
  return null
}

export function createGlobalPanelHandlers(ctx) {
  async function handleGlobalPanel(interaction) {
    await deferEphemeral(interaction)

    const subcommand = interaction.options.getSubcommand(false)
    if (subcommand !== 'setup') {
      await respondEphemeral(interaction, {
        embeds: [ctx.errorEmbed('Unsupported Panel Command', 'Use `/globalpanel setup` to send the panel.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await respondEphemeral(interaction, {
        embeds: [ctx.errorEmbed('Permission Denied', 'You need Manage Server permission to setup this panel.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    const targetChannel = interaction.options.getChannel('channel', true)
    if (!targetChannel || typeof targetChannel.send !== 'function') {
      await respondEphemeral(interaction, {
        embeds: [ctx.errorEmbed('Invalid Channel', 'Please select a text channel where the bot can send messages.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    const panelEmoji = await ctx.getTopupEmoji(interaction.guild)
    await targetChannel.send({
      embeds: [buildGlobalPanelEmbed(ctx, panelEmoji)],
      components: buildGlobalPanelRows(ctx, panelEmoji),
    })

    await respondEphemeral(interaction, {
      embeds: [ctx.successEmbed('Global Panel Sent', `The global command panel has been sent to ${targetChannel}.`)],
      flags: ctx.EPHEMERAL,
    })
  }

  async function handleGlobalPanelButton(interaction) {
    const customId = String(interaction.customId || '')

    // showModal() cannot run on a deferred interaction, so this branch stays before the defer.
    if (customId === 'vx_panel_password_confirm') {
      await handlePasswordConfirm(interaction)
      return
    }

    await deferEphemeral(interaction)

    if (customId === 'vx_panel_password') {
      await handlePasswordRequest(interaction)
      return
    }

    if (customId === 'vx_global_topups' || customId === 'vx_panel_topup') {
      const profile = await getPanelProfileOrReply(ctx, interaction)
      if (!profile) return
      await openTopupsPanel(ctx, interaction, profile)
      return
    }

    if (customId === 'vx_panel_orders') {
      const profile = await getPanelProfileOrReply(ctx, interaction)
      if (!profile) return
      const orders = await ctx.listMyOrders(profile.user_id, { limit: 5, offset: 0 })
      if (!orders.length) {
        await respondEphemeral(interaction, { embeds: [ctx.warningEmbed('Recent Orders', 'This account has no recent orders yet.')], flags: ctx.EPHEMERAL })
        return
      }
      const orderEmoji = await ctx.getTopupEmoji(interaction.guild)
      await respondEphemeral(interaction, { embeds: ctx.buildOrdersEmbeds({ profile, orders, emoji: orderEmoji }), flags: ctx.EPHEMERAL })
      return
    }

    if (customId === 'vx_panel_wallet') {
      const profile = await getPanelProfileOrReply(ctx, interaction)
      if (!profile) return
      const wallet = await ctx.getWallet(profile.user_id)
      await respondEphemeral(interaction, {
        embeds: [
          ctx.infoEmbed('Wallet Balance', 'Latest wallet balance for your account.', [
            { name: 'Account', value: ctx.profileName(profile), inline: true },
            { name: 'Balance', value: `${ctx.formatPoints(wallet?.balance ?? profile.balance)} points`, inline: true },
          ]),
        ],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    if (customId === 'vx_global_link') {
      await respondEphemeral(interaction, {
        embeds: [ctx.infoEmbed('Link Account', 'สร้าง code จากหน้า Profile บนเว็บ แล้วใช้คำสั่งนี้ใน Discord', [{ name: 'Command', value: '`/link code:<code>`' }])],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    if (customId === 'vx_global_unlink') {
      await respondEphemeral(interaction, {
        embeds: [ctx.warningEmbed('Unlink Account', 'ใช้คำสั่งนี้เพื่อตัดการลิงก์ Discord ออกจากบัญชีเว็บ', [{ name: 'Command', value: '`/unlink`' }])],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    if (customId === 'vx_global_verify_slip') {
      await respondEphemeral(interaction, {
        embeds: [
          ctx.infoEmbed('Verify PromptPay Slip', 'หลังสร้าง QR จาก `/topups` และโอนเงินแล้ว ให้แนบรูปสลิปผ่านคำสั่งนี้', [
            { name: 'Command', value: '`/topup verify-slip topup_id:<id> slip:<image>`' },
          ]),
        ],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    if (customId === 'vx_global_admin') {
      await respondEphemeral(interaction, {
        embeds: [
          ctx.warningEmbed('Admin Commands', 'คำสั่งนี้ใช้ได้เฉพาะคนที่มี Manage Server และบัญชีเว็บ role owner/admin/finance', [
            { name: 'Adjust Points', value: '`/points adjust user_id:<id> points:<amount> reason:<reason>`' },
          ]),
        ],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    // The interaction is already deferred, so an unrecognised id still needs an answer.
    await respondEphemeral(interaction, {
      embeds: [ctx.warningEmbed('Unknown Action', 'ปุ่มนี้ใช้ไม่ได้แล้ว กรุณาเปิดแผงควบคุมใหม่อีกครั้ง')],
      flags: ctx.EPHEMERAL,
    })
  }

  async function handleGlobalPanelSelect(interaction) {
    // No branch here opens a modal, so the whole handler can be deferred.
    await deferEphemeral(interaction)

    const value = String(interaction.values?.[0] || '')

    if (value === 'topups') {
      const profile = await getPanelProfileOrReply(ctx, interaction)
      if (!profile) return
      await openTopupsPanel(ctx, interaction, profile)
      return
    }

    if (value === 'verify_slip') {
      await respondEphemeral(interaction, {
        embeds: [
          ctx.infoEmbed('Verify PromptPay Slip', 'หลังสร้าง QR จาก `/topups` และโอนเงินแล้ว ให้แนบรูปสลิปผ่านคำสั่งนี้', [
            { name: 'Command', value: '`/topup verify-slip topup_id:<id> slip:<image>`' },
          ]),
        ],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    if (value === 'link') {
      await respondEphemeral(interaction, {
        embeds: [ctx.infoEmbed('Link Account', 'สร้าง code จากหน้า Profile บนเว็บ แล้วใช้คำสั่งนี้ใน Discord', [{ name: 'Command', value: '`/link code:<code>`' }])],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    if (value === 'unlink') {
      await respondEphemeral(interaction, {
        embeds: [ctx.warningEmbed('Unlink Account', 'ใช้คำสั่งนี้เพื่อตัดการลิงก์ Discord ออกจากบัญชีเว็บ', [{ name: 'Command', value: '`/unlink`' }])],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    if (value === 'admin') {
      await respondEphemeral(interaction, {
        embeds: [
          ctx.warningEmbed('Admin Commands', 'คำสั่งนี้ใช้ได้เฉพาะคนที่มี Manage Server และบัญชีเว็บ role owner/admin/finance', [
            { name: 'Adjust Points', value: '`/points adjust user_id:<id> points:<amount> reason:<reason>`' },
          ]),
        ],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    // The interaction is already deferred, so an unrecognised value still needs an answer.
    await respondEphemeral(interaction, {
      embeds: [ctx.warningEmbed('Unknown Action', 'ตัวเลือกนี้ใช้ไม่ได้แล้ว กรุณาเปิดแผงควบคุมใหม่อีกครั้ง')],
      flags: ctx.EPHEMERAL,
    })
  }

  async function handlePasswordRequest(interaction) {
    const profile = await getPanelProfileOrReply(ctx, interaction)
    if (!profile) return

    const code = String(Math.floor(100000 + Math.random() * 900000))
    ctx.passwordVerifications.set(String(interaction.user.id), {
      code,
      userId: Number(profile.user_id),
      expiresAt: Date.now() + 10 * 60 * 1000,
    })

    try {
      await interaction.user.send({
        embeds: [
          ctx.warningEmbed('Password Verification Code', 'Use this code to confirm your password change from the server panel.', [
            { name: 'Verification Code', value: `\`${code}\``, inline: true },
            { name: 'Expires', value: '10 minutes', inline: true },
            { name: 'Security Notice', value: 'If you did not request this, you can ignore this DM.' },
          ]),
        ],
      })
    } catch {
      ctx.passwordVerifications.delete(String(interaction.user.id))
      await respondEphemeral(interaction, {
        embeds: [ctx.errorEmbed('DM Failed', 'I could not send you a DM. Please enable DMs from server members and try again.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    await respondEphemeral(interaction, {
      embeds: [
        ctx.infoEmbed('Check Your DM', 'A verification code has been sent to your DM. Come back here and press the confirm button below to enter the code and your new password.', [
          { name: 'Account', value: ctx.profileName(profile), inline: true },
          { name: 'Expires', value: '10 minutes', inline: true },
        ]),
      ],
      components: buildPasswordConfirmRows(),
      flags: ctx.EPHEMERAL,
    })
  }

  async function handlePasswordConfirm(interaction) {
    const state = ctx.passwordVerifications.get(String(interaction.user.id))
    if (!state || Number(state.expiresAt || 0) <= Date.now()) {
      await respondEphemeral(interaction, {
        embeds: [ctx.warningEmbed('Code Expired', 'The verification code has expired. Press Change Password again to request a new code.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    const modal = new ModalBuilder().setCustomId('vx_panel_password_modal').setTitle('Change Website Password')
    const codeInput = new TextInputBuilder()
      .setCustomId('code')
      .setLabel('Verification code from DM')
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(6)
      .setRequired(true)
    const passwordInput = new TextInputBuilder()
      .setCustomId('new_password')
      .setLabel('New password')
      .setStyle(TextInputStyle.Short)
      .setMinLength(8)
      .setMaxLength(120)
      .setRequired(true)

    modal.addComponents(new ActionRowBuilder().addComponents(codeInput), new ActionRowBuilder().addComponents(passwordInput))
    await interaction.showModal(modal)
  }

  async function handlePasswordModal(interaction) {
    await deferEphemeral(interaction)

    const state = ctx.passwordVerifications.get(String(interaction.user.id))
    const code = interaction.fields.getTextInputValue('code').trim()
    const newPassword = interaction.fields.getTextInputValue('new_password')

    if (!state || Number(state.expiresAt || 0) <= Date.now()) {
      await respondEphemeral(interaction, {
        embeds: [ctx.warningEmbed('Code Expired', 'The verification code has expired. Press Change Password again to request a new code.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }
    if (code !== state.code) {
      await respondEphemeral(interaction, {
        embeds: [ctx.errorEmbed('Invalid Code', 'The verification code is incorrect. Check your DM and try again.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }
    if (!/^[\x20-\x7E]+$/.test(newPassword) || newPassword.length < 8) {
      await respondEphemeral(interaction, {
        embeds: [ctx.errorEmbed('Weak Password', 'The new password must be at least 8 characters and use printable ASCII characters.')],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    try {
      await ctx.setUserPassword({ userId: state.userId, password: newPassword })
      ctx.passwordVerifications.delete(String(interaction.user.id))
      await respondEphemeral(interaction, { embeds: [ctx.successEmbed('Password Changed', 'Your website password has been changed successfully.')], flags: ctx.EPHEMERAL })
    } catch {
      await respondEphemeral(interaction, { embeds: [ctx.errorEmbed('Password Change Failed', 'Could not change your password. Please try again.')], flags: ctx.EPHEMERAL })
    }
  }

  return {
    handleGlobalPanel,
    handleGlobalPanelButton,
    handleGlobalPanelSelect,
    handlePasswordRequest,
    handlePasswordConfirm,
    handlePasswordModal,
  }
}
