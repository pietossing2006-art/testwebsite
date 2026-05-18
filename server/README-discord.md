# Discord bot setup

This server includes a Discord account-linking bot.

## Environment

Add these to `server/.env`:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_CLIENT_SECRET=your_oauth2_client_secret
DISCORD_REDIRECT_URI=http://localhost:3001/api/auth/discord/callback
DISCORD_GUILD_ID=optional_test_server_id
DISCORD_BOT_INVITE_URL=optional_custom_invite_url
DISCORD_BOT_PERMISSIONS=8
DISCORD_LINK_CODE_TTL_MINUTES=10
DISCORD_LINK_CODE_PEPPER=change_this_random_secret
```

`DISCORD_GUILD_ID` registers slash commands instantly for one server. Without it, commands are registered globally and may take time to appear.

`DISCORD_BOT_PERMISSIONS=8` means Administrator permission for the generated invite link. If `DISCORD_BOT_INVITE_URL` is set to a real URL, that custom URL takes priority.

## User flow

1. User opens the website profile page.
2. User clicks `Generate link code`.
3. User runs `/link code:<code>` in Discord.
4. Bot can then answer `/profile`, `/orders`, and `/unlink`.

The raw link code is never stored in the database; only a SHA-256 hash is saved.

## Discord login

Add `DISCORD_REDIRECT_URI` to the Discord Developer Portal OAuth2 redirect list. In local dev, use:

```text
http://localhost:3001/api/auth/discord/callback
```

Users who log in with Discord are linked automatically. Users who log in with email/username and password still use the profile-page link code flow.
