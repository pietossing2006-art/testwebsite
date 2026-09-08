const EPHEMERAL = 64

/**
 * Discord invalidates an interaction token if nothing is sent back within 3 seconds.
 * Any handler that touches the database or the network before replying must defer
 * first, otherwise a slow query turns into "This interaction failed" for the user.
 *
 * Never defer a handler that ends in showModal() — a deferred interaction can no
 * longer open a modal.
 */
export async function deferEphemeral(interaction) {
  if (interaction.deferred || interaction.replied) return false
  await interaction.deferReply({ flags: EPHEMERAL })
  return true
}

/** Replies, or edits the deferred reply when deferEphemeral() already ran. */
export async function respondEphemeral(interaction, payload) {
  const { flags, ...rest } = payload || {}
  if (interaction.deferred || interaction.replied) return interaction.editReply(rest)
  return interaction.reply({ ...rest, flags: EPHEMERAL })
}
