export const commandName = 'profile'

export function buildProfileEmbed(ctx, { profile, wallet, vip, unreadCount, discordUser } = {}) {
  const balance = wallet?.balance ?? profile?.balance ?? 0
  const fields = [
    { name: 'บัญชีเว็บ', value: ctx.profileName(profile), inline: true },
    { name: 'User ID', value: `\`${profile.user_id}\``, inline: true },
    { name: 'ยอดคงเหลือ', value: `${ctx.formatPoints(balance)} พ้อย`, inline: true },
  ]

  if (profile.email) fields.push({ name: 'อีเมล', value: profile.email, inline: true })
  if (profile.username) fields.push({ name: 'Username', value: `@${profile.username}`, inline: true })

  const role = String(profile.role || 'user').trim().toLowerCase()
  if (role !== 'user') fields.push({ name: 'Role', value: role, inline: true })

  const linkedDiscord = profile.discord_username || discordUser?.globalName || discordUser?.username || '-'
  fields.push({ name: 'Discord ที่ลิงก์', value: linkedDiscord, inline: true })
  if (profile.linked_at) {
    fields.push({ name: 'ลิงก์เมื่อ', value: ctx.formatDateTime(profile.linked_at), inline: true })
  }

  if (vip?.tier?.name || vip?.tier?.code) {
    const tierLabel = vip.tier.name || vip.tier.code
    const discount = vip.tier.discount_percent ? ` · ส่วนลด ${vip.tier.discount_percent}%` : ''
    fields.push({ name: 'VIP', value: `${tierLabel}${discount}`, inline: true })
  } else if (Number(vip?.points_spent) > 0) {
    fields.push({ name: 'ยอดใช้จ่ายสะสม', value: `${ctx.formatPoints(vip.points_spent)} พ้อย`, inline: true })
  }

  if (Number(unreadCount) > 0) {
    fields.push({ name: 'ข้อความใหม่', value: `${ctx.formatPoints(unreadCount)} ฉบับ`, inline: true })
  }

  fields.push(
    { name: 'หน้า Profile', value: `[เปิดบนเว็บ](${ctx.makeSiteUrl('/profile')})`, inline: true },
    { name: 'ประวัติซื้อ', value: `[ดูประวัติ](${ctx.makeSiteUrl('/history/purchases')})`, inline: true },
    { name: 'เติมเงิน', value: 'ใช้ `/topups`', inline: true },
  )

  const embed = ctx.infoEmbed('โปรไฟล์ของคุณ', 'ข้อมูลบัญชีเว็บที่ลิงก์กับ Discord นี้', fields)
  const avatar = ctx.makeMediaUrl(profile.avatar_url)
  if (avatar) embed.setThumbnail(avatar)
  return embed
}

export async function execute(interaction, handlers) {
  return handlers.handleProfile(interaction)
}

export function createProfileHandlers(ctx) {
  async function handleProfile(interaction) {
    await interaction.deferReply({ flags: ctx.EPHEMERAL })
    const profile = await ctx.getDiscordLinkedUserByDiscordId(interaction.user.id)
    if (!profile || Boolean(profile.is_banned)) {
      await interaction.editReply({ embeds: [ctx.linkedRequiredEmbed()] })
      return
    }

    const [wallet, vip, unreadCount] = await Promise.all([
      ctx.getWallet(profile.user_id),
      ctx.getMyVip(profile.user_id).catch(() => null),
      ctx.countUnreadSiteMessages(profile.user_id).catch(() => 0),
    ])

    await interaction.editReply({
      embeds: [buildProfileEmbed(ctx, { profile, wallet, vip, unreadCount, discordUser: interaction.user })],
    })
  }

  return { handleProfile }
}
