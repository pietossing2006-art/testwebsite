import { eventHandlers } from "./events/index.js"

export async function routeComponentInteraction(interaction, handlers, onError) {
  try {
    const buttonHandled = await eventHandlers.handleButtonInteraction(interaction, handlers)
    if (buttonHandled) return null
  } catch (err) {
    await onError(interaction, err, "button interaction failed")
    return null
  }

  try {
    const selectHandled = await eventHandlers.handleSelectMenuInteraction(interaction, handlers)
    if (selectHandled) return null
  } catch (err) {
    await onError(interaction, err, "select interaction failed")
    return null
  }

  try {
    const modalHandled = await eventHandlers.handleModalSubmitInteraction(interaction, handlers)
    if (modalHandled) return null
  } catch (err) {
    await onError(interaction, err, "modal interaction failed")
    return null
  }

  return null
}
