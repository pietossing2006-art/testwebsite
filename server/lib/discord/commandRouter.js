import { commandModules } from "./commands/index.js"

const commandMap = new Map(commandModules.map((commandModule) => [commandModule.commandName, commandModule]))

export async function routeChatCommand(interaction, handlers, onError) {
  if (!interaction.isChatInputCommand()) return null

  try {
    const commandModule = commandMap.get(interaction.commandName)
    if (!commandModule) return null
    await commandModule.execute(interaction, handlers)
    return null
  } catch (err) {
    await onError(interaction, err, "command interaction failed")
    return null
  }
}
