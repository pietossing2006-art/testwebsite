export const commandName = "points"

export async function execute(interaction, handlers) {
  return handlers.handlePointsAdmin(interaction)
}

export function createPointsHandlers(ctx) {
  async function handlePointsAdmin(interaction) {
    const subcommand = interaction.options.getSubcommand(false)
    if (subcommand !== "adjust") {
      await interaction.reply({
        embeds: [ctx.errorEmbed("Unsupported Points Command", "This points command is not supported yet.")],
        flags: ctx.EPHEMERAL,
      })
      return
    }

    await interaction.deferReply({ flags: ctx.EPHEMERAL })

    const actor = await ctx.getDiscordLinkedUserByDiscordId(interaction.user.id)
    if (!actor || Boolean(actor.is_banned) || !ctx.isDiscordFinanceRole(actor.role)) {
      await interaction.editReply({
        embeds: [ctx.errorEmbed("Permission Denied", "Only linked website admin, owner, or finance accounts can adjust points.")],
      })
      return
    }

    const targetUserId = interaction.options.getInteger("user_id", true)
    const amount = Number(interaction.options.getInteger("points", true))
    const reason = String(interaction.options.getString("reason", false) || "discord_manual_adjust").trim().slice(0, 120)
    const absAmount = Math.abs(amount)

    if (!Number.isFinite(amount) || amount === 0) {
      await interaction.editReply({ embeds: [ctx.errorEmbed("Invalid Points", "Points must be a non-zero number.")] })
      return
    }
    if (absAmount > 100000) {
      await interaction.editReply({ embeds: [ctx.errorEmbed("Limit Reached", "Point adjustment cannot exceed 100,000 points.")] })
      return
    }
    if (absAmount >= 50000 && !ctx.isOwnerRole(actor.role)) {
      await interaction.editReply({ embeds: [ctx.errorEmbed("Owner Required", "Adjustments of 50,000 points or more require an owner account.")] })
      return
    }
    if (absAmount >= 10000 && reason.length < 12 && !ctx.isOwnerRole(actor.role)) {
      await interaction.editReply({
        embeds: [ctx.errorEmbed("Reason Required", "Adjustments of 10,000 points or more need a clear reason with at least 12 characters.")],
      })
      return
    }

    const target = await ctx.getUserById(targetUserId)
    if (!target) {
      await interaction.editReply({ embeds: [ctx.errorEmbed("User Not Found", `Website user #${targetUserId} was not found.`)] })
      return
    }
    if (String(target.role || "").toLowerCase() === "owner" && !ctx.isOwnerRole(actor.role)) {
      await interaction.editReply({ embeds: [ctx.errorEmbed("Owner Protected", "Only an owner can adjust another owner account.")] })
      return
    }

    try {
      const refId = `discord_admin:${actor.user_id}:${interaction.id}:${targetUserId}`
      const result = await ctx.adjustUserPoints({
        userId: targetUserId,
        points: amount,
        reason,
        actorUserId: actor.user_id,
        actorRole: actor.role || "admin",
        metadata: { source: "discord", interactionId: interaction.id, discordUserId: interaction.user.id },
        refType: "discord_points_adjustment",
        refId,
      })
      if (!result?.applied) {
        await interaction.editReply({ embeds: [ctx.warningEmbed("Adjustment Skipped", "This adjustment was already processed.")] })
        return
      }

      const wallet = await ctx.getWallet(targetUserId)
      const action = amount > 0 ? "Added Points" : "Removed Points"
      await interaction.editReply({
        embeds: [
          ctx.successEmbed(action, "Point balance adjusted successfully.", [
            { name: "Target", value: `${ctx.userDisplayName(target)} (#${targetUserId})`, inline: true },
            { name: "Change", value: `${amount > 0 ? "+" : "-"}${ctx.formatPoints(absAmount)} points`, inline: true },
            { name: "New Balance", value: `${ctx.formatPoints(wallet?.balance)} points`, inline: true },
            { name: "Reason", value: reason || "-", inline: false },
            { name: "By", value: `${ctx.profileName(actor)} (#${actor.user_id})`, inline: false },
          ]),
        ],
      })
    } catch (err) {
      const msg = String(err?.message || "")
      const text = msg === "invalid_points" ? "Invalid point amount." : "Could not adjust points. Please try again."
      await interaction.editReply({ embeds: [ctx.errorEmbed("Adjustment Failed", text)] })
    }
  }

  return { handlePointsAdmin }
}
