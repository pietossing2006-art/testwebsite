import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

export function buildCommandPayload() {
  return [
    new SlashCommandBuilder()
      .setName("link")
      .setDescription("Link this Discord account to your website account")
      .addStringOption((option) =>
        option
          .setName("code")
          .setDescription("Link code generated from the website profile page")
          .setRequired(true),
      ),
    new SlashCommandBuilder().setName("unlink").setDescription("Unlink this Discord account from the website"),
    new SlashCommandBuilder().setName("profile").setDescription("ดูโปรไฟล์ ยอดคงเหลือ และบัญชีที่ลิงก์"),
    new SlashCommandBuilder()
      .setName("globalpanel")
      .setDescription("Admin: setup the global command panel in this channel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("setup")
          .setDescription("Send the global panel to this channel")
          .addChannelOption((option) =>
            option.setName("channel").setDescription("Channel to send the panel to").setRequired(true),
          ),
      ),
    new SlashCommandBuilder().setName("topups").setDescription("Open an interactive topup panel"),
    new SlashCommandBuilder()
      .setName("topup")
      .setDescription("PromptPay slip verification")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("verify-slip")
          .setDescription("Verify a PromptPay slip image from Discord")
          .addIntegerOption((option) =>
            option
              .setName("topup_id")
              .setDescription("Topup ID from the PromptPay QR embed")
              .setMinValue(1)
              .setRequired(true),
          )
          .addAttachmentOption((option) =>
            option.setName("slip").setDescription("Transfer slip image").setRequired(true),
          ),
      ),
    new SlashCommandBuilder()
      .setName("points")
      .setDescription("Admin: adjust a website user point balance")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("adjust")
          .setDescription("Add or remove points from a user")
          .addIntegerOption((option) =>
            option.setName("user_id").setDescription("Website user ID").setMinValue(1).setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName("points")
              .setDescription("Positive to add, negative to remove")
              .setMinValue(-100000)
              .setMaxValue(100000)
              .setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for audit trail").setMaxLength(120).setRequired(false),
          ),
      ),
  ].map((command) => command.toJSON())
}
