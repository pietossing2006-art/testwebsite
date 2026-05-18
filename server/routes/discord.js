import { Router } from 'express'
import {
  createDiscordLinkCode,
  getDiscordLinkForUser,
  unlinkDiscordForUser,
} from '../db.js'
import { requireAuth, rateLimitMiddleware } from '../lib/auth.js'
import { getDiscordBotPublicConfig } from '../lib/discordBot.js'

const router = Router()

function serializeLink(link) {
  if (!link) return null
  return {
    user_id: Number(link.user_id),
    discord_user_id: String(link.discord_user_id || ''),
    discord_username: link.discord_username || null,
    linked_at: link.linked_at || null,
    updated_at: link.updated_at || null,
  }
}

router.get('/api/discord/bot', async (req, res) => {
  res.json({
    ok: true,
    bot: getDiscordBotPublicConfig(),
  })
})

router.get('/api/me/discord-link', requireAuth, async (req, res) => {
  try {
    const link = await getDiscordLinkForUser(req.user.id)
    res.json({
      ok: true,
      linked: Boolean(link),
      link: serializeLink(link),
      bot: getDiscordBotPublicConfig(),
    })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post(
  '/api/me/discord-link/code',
  requireAuth,
  rateLimitMiddleware({ windowMs: 60_000, max: 3, keyPrefix: 'discord_link_code' }),
  async (req, res) => {
    try {
      const code = await createDiscordLinkCode(req.user.id)
      res.status(201).json({
        ok: true,
        ...code,
        command: `/link code:${code.code}`,
        bot: getDiscordBotPublicConfig(),
      })
    } catch (e) {
      const msg = String(e?.message || '')
      if (msg === 'invalid_user_id') return res.status(400).json({ error: 'invalid_user_id' })
      res.status(500).json({ error: 'db_error' })
    }
  },
)

router.delete('/api/me/discord-link', requireAuth, async (req, res) => {
  try {
    const result = await unlinkDiscordForUser(req.user.id)
    res.json({ ok: true, deleted: Number(result?.deleted || 0) })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

export default router
