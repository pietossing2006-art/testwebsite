export async function handleButtonInteraction(interaction, handlers) {
  if (!interaction.isButton()) return false

  if (String(interaction.customId || "").startsWith("vx_global_") || String(interaction.customId || "").startsWith("vx_panel_")) {
    await handlers.handleGlobalPanelButton(interaction)
    return true
  }

  return false
}
