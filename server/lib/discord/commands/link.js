export const commandName = "link"

export async function execute(interaction, handlers) {
  return handlers.handleLink(interaction)
}

export function createLinkHandlers(ctx) {
  function friendlyLinkError(err) {
    const msg = String(err?.message || "")
    if (msg === "invalid_code" || msg === "invalid_or_expired_code") {
      return "The link code is invalid or expired. Please generate a new code from your website profile."
    }
    if (msg === "discord_already_linked") return "This Discord account is already linked to another website account."
    if (msg === "user_not_available") return "This website account is not available or has been suspended."
    return "Could not link your account. Please try again."
  }

  async function handleLink(interaction) {
    await interaction.deferReply({ flags: ctx.EPHEMERAL })
    const code = interaction.options.getString("code", true)
    try {
      const profile = await ctx.claimDiscordLinkCode({
        code,
        discordUserId: interaction.user.id,
        discordUsername: ctx.discordTag(interaction),
      })
      await interaction.editReply({
        embeds: [
          ctx.successEmbed("Linked Successfully", "Your Discord account is now linked to your website account.", [
            { name: "Account", value: ctx.profileName(profile), inline: true },
            { name: "Balance", value: `${ctx.formatPoints(profile?.balance)} points`, inline: true },
          ]),
        ],
      })
    } catch (err) {
      await interaction.editReply({ embeds: [ctx.errorEmbed("Link Failed", friendlyLinkError(err))] })
    }
  }

  return { handleLink }
}
