import { REST, Routes } from "discord.js"

export async function registerCommands({ client, envValue, body }) {
  if (envValue("DISCORD_REGISTER_COMMANDS") === "0") return

  const token = envValue("DISCORD_BOT_TOKEN")
  const appId = envValue("DISCORD_CLIENT_ID") || client.user?.id
  if (!token || !appId) return

  const rest = new REST({ version: "10" }).setToken(token)
  const guildId = envValue("DISCORD_GUILD_ID")

  let guildRegistered = false
  if (guildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body })
      console.log(`[Discord] registered ${body.length} guild commands for ${guildId}`)
      guildRegistered = true
    } catch (err) {
      console.warn(
        `[Discord] guild command registration failed for ${guildId}; continuing with global commands`,
        err?.code || err?.message || err,
      )
    }
  }

  await rest.put(Routes.applicationCommands(appId), { body })
  console.log(`[Discord] registered ${body.length} global commands`)

  if (guildId && !guildRegistered) {
    console.warn(`[Discord] guild commands for ${guildId} are not in sync because guild registration failed`)
  }
}
