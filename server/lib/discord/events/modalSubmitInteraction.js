export async function handleModalSubmitInteraction(interaction, handlers) {
  if (!interaction.isModalSubmit()) return false

  if (interaction.customId === "vx_topups_promptpay_modal") {
    await handlers.handleTopupsPromptpayModal(interaction)
    return true
  }
  if (interaction.customId === "vx_topups_angpao_modal") {
    await handlers.handleTopupsAngpaoModal(interaction)
    return true
  }
  if (interaction.customId === "vx_topups_coupon_modal") {
    await handlers.handleTopupsCouponModal(interaction)
    return true
  }
  if (interaction.customId === "vx_panel_password_modal") {
    await handlers.handlePasswordModal(interaction)
    return true
  }

  return false
}
