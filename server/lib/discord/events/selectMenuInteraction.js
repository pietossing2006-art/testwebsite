export async function handleSelectMenuInteraction(interaction, handlers) {
  if (!interaction.isStringSelectMenu()) return false

  if (interaction.customId === "vx_topups_promptpay_amount") {
    await handlers.handleTopupSelect(interaction)
    return true
  }

  if (interaction.customId === "vx_global_actions") {
    await handlers.handleGlobalPanelSelect(interaction)
    return true
  }

  return false
}
