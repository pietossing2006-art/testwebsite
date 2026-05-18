export const commandName = "topup"

export async function execute(interaction, handlers) {
  return handlers.handleTopupVerifySlip(interaction)
}
