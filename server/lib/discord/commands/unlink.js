export const commandName = "unlink"

export async function execute(interaction, handlers) {
  return handlers.handleUnlink(interaction)
}

export function createUnlinkHandlers(ctx) {
  async function handleUnlink(interaction) {
    await interaction.deferReply({ flags: ctx.EPHEMERAL })
    const result = await ctx.unlinkDiscordByDiscordUserId(interaction.user.id)
    if (Number(result?.deleted || 0) > 0) {
      await interaction.editReply({
        embeds: [ctx.successEmbed("Discord Unlinked", "Discord has been unlinked from your website account.")],
      })
      return
    }
    await interaction.editReply({
      embeds: [ctx.warningEmbed("Not Linked", "This Discord account is not linked to a website account.")],
    })
  }

  return { handleUnlink }
}
