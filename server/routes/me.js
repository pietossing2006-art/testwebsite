import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  getUserById,
  getWallet,
  updateUserProfile,
  changeUserPassword,
  getDiscordLinkForUser,
  listMyTransactions,
  listMyTopups,
  listMyOrders,
  listMyInbox,
  claimInboxItem,
  listMySiteMessages,
  countUnreadSiteMessages,
  markSiteMessageRead,
  markAllSiteMessagesRead,
  listMySupportTickets,
  createSupportTicket,
  getMySupportTicket,
  addMySupportTicketMessage,
  savePushSubscription,
  removePushSubscription,
  getMyOrderDetail,
} from '../db.js'
import { requireAuth, rateLimitMiddleware } from '../lib/auth.js'
import { decodeDataUrlImage } from '../lib/image.js'
import { publishSupportEvent } from '../lib/events.js'
import { requestDiscordPasswordResetCode, verifyDiscordPasswordResetCode } from '../lib/discordBot.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads')
const AVATAR_UPLOADS_ROOT = path.join(UPLOADS_ROOT, 'avatars')

const router = Router()

router.get('/api/me', requireAuth, async (req, res) => {
  try {
    const wallet = await getWallet(req.user.id)
    const u = await getUserById(req.user.id)
    res.json({
      ok: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        username: u?.username ?? null,
        role: typeof req.user?.role === 'string' && req.user.role.trim() ? req.user.role.trim().toLowerCase() : 'user',
        display_name: u?.display_name ?? null,
        avatar_url: u?.avatar_url ?? null,
      },
      wallet,
    })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/me/profile', requireAuth, async (req, res) => {
  const { display_name, avatar_url } = req.body ?? {}
  try {
    const user = await updateUserProfile({ userId: req.user.id, displayName: display_name, avatarUrl: avatar_url })
    res.json({ ok: true, user })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/me/password', requireAuth, async (req, res) => {
  const { old_password, new_password, discord_code } = req.body ?? {}
  if (typeof old_password !== 'string' || typeof new_password !== 'string') return res.status(400).json({ error: 'invalid_payload' })
  if (new_password.length < 8) return res.status(400).json({ error: 'weak_password' })
  if (!/^[\x20-\x7E]+$/.test(new_password)) return res.status(400).json({ error: 'invalid_password_charset' })

  try {
    const discordLink = await getDiscordLinkForUser(req.user.id)
    if (discordLink) {
      if (typeof discord_code !== 'string' || !discord_code.trim()) return res.status(400).json({ error: 'discord_code_required' })
      verifyDiscordPasswordResetCode({ userId: req.user.id, code: discord_code })
    }
    await changeUserPassword({ userId: req.user.id, oldPassword: old_password, newPassword: new_password })
    res.json({ ok: true })
  } catch (e) {
    if (String(e?.message ?? '') === 'invalid_old_password') return res.status(400).json({ error: 'invalid_old_password' })
    if (String(e?.message ?? '') === 'discord_code_required') return res.status(400).json({ error: 'discord_code_required' })
    if (String(e?.message ?? '') === 'discord_code_invalid') return res.status(400).json({ error: 'discord_code_invalid' })
    if (String(e?.message ?? '') === 'discord_code_expired') return res.status(400).json({ error: 'discord_code_expired' })
    if (String(e?.message ?? '') === 'user_not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post(
  '/api/me/password/discord-code',
  requireAuth,
  rateLimitMiddleware({ windowMs: 60_000, max: 3, keyPrefix: 'discord_password_code' }),
  async (req, res) => {
    try {
      const user = await getUserById(req.user.id)
      const discordLink = await getDiscordLinkForUser(req.user.id)
      if (!discordLink) return res.status(400).json({ error: 'discord_not_linked' })

      const result = await requestDiscordPasswordResetCode({
        userId: req.user.id,
        discordUserId: discordLink.discord_user_id,
        accountLabel: user?.display_name || user?.username || user?.email || `User #${req.user.id}`,
      })

      res.json({ ok: true, ...result })
    } catch (e) {
      const msg = String(e?.message ?? '')
      if (msg === 'discord_not_linked') return res.status(400).json({ error: 'discord_not_linked' })
      if (msg === 'bot_not_ready') return res.status(503).json({ error: 'bot_not_ready' })
      if (msg === 'dm_failed') return res.status(400).json({ error: 'discord_dm_failed' })
      res.status(500).json({ error: 'discord_code_send_failed' })
    }
  },
)

router.post('/api/me/avatar-upload', requireAuth, async (req, res) => {
  const imageData = req.body?.image_data
  try {
    const { buffer, ext } = decodeDataUrlImage(imageData)
    const maxBytes = 6 * 1024 * 1024
    if (buffer.length > maxBytes) return res.status(413).json({ error: 'image_too_large' })
    const filename = `${Date.now()}-${req.user.id}-${Math.floor(Math.random() * 1_000_000)}.${ext}`
    const target = path.join(AVATAR_UPLOADS_ROOT, filename)
    await fs.promises.writeFile(target, buffer)
    const avatarUrl = `/uploads/avatars/${filename}`
    res.status(201).json({ ok: true, avatar_url: avatarUrl })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_image_data') return res.status(400).json({ error: 'invalid_image_data' })
    if (msg === 'unsupported_image_type') return res.status(400).json({ error: 'unsupported_image_type' })
    res.status(500).json({ error: 'upload_failed' })
  }
})

router.get('/api/me/transactions', requireAuth, async (req, res) => {
  try {
    const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit) || 50)) : 50
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset) || 0) : 0
    const tx = await listMyTransactions(req.user.id, { limit, offset })
    res.json({ ok: true, transactions: tx })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/me/topups', requireAuth, async (req, res) => {
  try {
    const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit) || 50)) : 50
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset) || 0) : 0
    const items = await listMyTopups(req.user.id, { limit, offset })
    res.json({ ok: true, topups: items })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/me/orders', requireAuth, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const items = await listMyOrders(req.user.id, { limit, offset })
    res.json({ ok: true, orders: items })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/me/orders/:id(\\d+)', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const data = await getMyOrderDetail(req.user.id, id)
    res.json({ ok: true, ...data })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/me/inbox', requireAuth, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const items = await listMyInbox(req.user.id, { limit, offset })
    res.json({ ok: true, inbox: items })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/me/inbox/:id/claim', requireAuth, async (req, res) => {
  const deliveryId = Number(req.params.id)
  if (!Number.isFinite(deliveryId)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const result = await claimInboxItem({ userId: req.user.id, deliveryId })
    res.json({ ok: true, payload: result.payload })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'delivery_not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'already_claimed') return res.status(409).json({ error: 'already_claimed' })
    if (msg === 'forbidden') return res.status(403).json({ error: 'forbidden' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/me/messages', requireAuth, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const messages = await listMySiteMessages(req.user.id, { limit, offset })
    const unread = await countUnreadSiteMessages(req.user.id)
    res.json({ ok: true, messages, unread_count: unread })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/me/messages/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await countUnreadSiteMessages(req.user.id)
    res.json({ ok: true, unread_count: count })
  } catch {
    res.json({ ok: true, unread_count: 0 })
  }
})

router.post('/api/me/messages/:id/read', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await markSiteMessageRead(req.user.id, id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/me/messages/read-all', requireAuth, async (req, res) => {
  try {
    await markAllSiteMessagesRead(req.user.id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/me/support-tickets', requireAuth, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const items = await listMySupportTickets(req.user.id, { limit, offset, status })
    res.json({ ok: true, tickets: items })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/me/support-tickets', requireAuth, async (req, res) => {
  const { subject, message, attachments } = req.body ?? {}
  try {
    const ticket = await createSupportTicket({ userId: req.user.id, subject, message, attachments })
    publishSupportEvent({
      kind: 'ticket_created',
      ticket_id: Number(ticket?.id) || null,
      user_id: req.user.id,
      at: new Date().toISOString(),
    })
    res.json({ ok: true, ticket })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_subject') return res.status(400).json({ error: 'invalid_subject' })
    if (msg === 'invalid_subject_too_long') return res.status(400).json({ error: 'invalid_subject_too_long' })
    if (msg === 'invalid_message') return res.status(400).json({ error: 'invalid_message' })
    if (msg === 'invalid_message_too_long') return res.status(400).json({ error: 'invalid_message_too_long' })
    if (msg === 'invalid_attachments') return res.status(400).json({ error: 'invalid_attachments' })
    if (msg === 'too_many_attachments') return res.status(400).json({ error: 'too_many_attachments' })
    if (msg === 'attachment_too_large') return res.status(400).json({ error: 'attachment_too_large' })
    if (msg === 'invalid_attachment_type') return res.status(400).json({ error: 'invalid_attachment_type' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/me/support-tickets/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const data = await getMySupportTicket({ userId: req.user.id, ticketId: id })
    res.json({ ok: true, ticket: data.ticket, messages: data.messages })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/me/support-tickets/:id/messages', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { message, attachments } = req.body ?? {}
  try {
    await addMySupportTicketMessage({ userId: req.user.id, ticketId: id, message, attachments })
    publishSupportEvent({
      kind: 'ticket_replied_user',
      ticket_id: id,
      user_id: req.user.id,
      at: new Date().toISOString(),
    })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'forbidden') return res.status(403).json({ error: 'forbidden' })
    if (msg === 'closed') return res.status(409).json({ error: 'closed' })
    if (msg === 'invalid_message') return res.status(400).json({ error: 'invalid_message' })
    if (msg === 'invalid_message_too_long') return res.status(400).json({ error: 'invalid_message_too_long' })
    if (msg === 'invalid_attachments') return res.status(400).json({ error: 'invalid_attachments' })
    if (msg === 'too_many_attachments') return res.status(400).json({ error: 'too_many_attachments' })
    if (msg === 'attachment_too_large') return res.status(400).json({ error: 'attachment_too_large' })
    if (msg === 'invalid_attachment_type') return res.status(400).json({ error: 'invalid_attachment_type' })
    res.status(500).json({ error: 'db_error' })
  }
})


// ── User push subscriptions ──

router.post('/api/me/push-subscribe', requireAuth, async (req, res) => {
  try {
    await savePushSubscription(req.user.id, req.body?.subscription)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e?.message || 'invalid_subscription' })
  }
})

router.post('/api/me/push-unsubscribe', requireAuth, async (req, res) => {
  try {
    await removePushSubscription(req.user.id, req.body?.endpoint)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

export default router
