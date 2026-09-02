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
  claimAllInboxItems,
  listMySiteMessages,
  countUnreadSiteMessages,
  markSiteMessageRead,
  markAllSiteMessagesRead,
  deleteMySiteMessage,
  listMyDirectMessages,
  markDirectMessagesRead,
  listMySupportTickets,
  createSupportTicket,
  getMySupportTicket,
  addMySupportTicketMessage,
  savePushSubscription,
  removePushSubscription,
  getMyOrderDetail,
  removeUserOwnAccount,
  checkPassword,
  setUserEmailVerified,
  getUser2FASecret,
  enableUserTotp2FA,
  enableUserEmail2FA,
  disableUser2FA,
  updateUserBackupCodes,
} from '../db.js'
import { requireAuth, rateLimitMiddleware } from '../lib/auth.js'
import { requestEmailOtp, verifyEmailOtp } from '../lib/emailOtp.js'
import {
  generateTotpSecret,
  generateTotpUri,
  generateTotpQrDataUrl,
  verifyTotpToken,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
} from '../lib/totp.js'
import { decodeDataUrlImage, sanitizeAvatarImage } from '../lib/image.js'
import { AvatarUploadBodySchema, PasswordChangeBodySchema, ProfileBodySchema } from '../lib/requestSchemas.js'
import { validateBody } from '../lib/validation.js'
import { publishSupportEvent } from '../lib/events.js'
import { requestDiscordPasswordResetCode, verifyDiscordPasswordResetCode } from '../lib/discordBot.js'
import { isSecureCookie, clearAuthCookie } from '../lib/cookies.js'

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
        is_email_verified: Boolean(u?.is_email_verified),
        email_verified_at: u?.email_verified_at ?? null,
        two_factor_enabled: Boolean(u?.two_factor_enabled),
        two_factor_type: u?.two_factor_type || 'none',
        created_at: u?.created_at ?? null,
      },
      wallet,
    })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/me/profile', requireAuth, async (req, res) => {
  const parsed = validateBody(ProfileBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { display_name, avatar_url, username, email } = parsed.data
  try {
    const user = await updateUserProfile({
      userId: req.user.id,
      displayName: display_name,
      avatarUrl: avatar_url,
      username,
      email,
    })
    res.json({ ok: true, user })
  } catch (err) {
    const msg = String(err?.message ?? '')
    if (msg === 'invalid_username') return res.status(400).json({ error: 'invalid_username' })
    if (msg === 'invalid_username_charset') return res.status(400).json({ error: 'invalid_username_charset' })
    if (msg === 'username_taken') return res.status(409).json({ error: 'username_taken' })
    if (msg === 'invalid_email') return res.status(400).json({ error: 'invalid_email' })
    if (msg === 'email_taken') return res.status(409).json({ error: 'email_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/me/delete-account', requireAuth, async (req, res) => {
  const { password, discord_code, email_code } = req.body ?? {}
  try {
    const user = await getUserById(req.user.id)
    if (!user) return res.status(404).json({ error: 'user_not_found' })
    const discordLink = await getDiscordLinkForUser(req.user.id)

    if (typeof email_code === 'string' && email_code.trim()) {
      await verifyEmailOtp({ email: user.email, purpose: 'delete_account_2fa', code: email_code.trim() })
    } else if (discordLink && typeof discord_code === 'string' && discord_code.trim()) {
      verifyDiscordPasswordResetCode({ userId: req.user.id, code: discord_code.trim() })
    } else if (typeof password === 'string' && password) {
      const isMatch = await checkPassword(password, user.password_hash)
      if (!isMatch) return res.status(400).json({ error: 'invalid_password' })
    } else {
      return res.status(400).json({ error: 'verification_required', message: 'กรุณากรอกรหัสผ่าน หรือ รหัส OTP จาก Gmail / Discord' })
    }

    await removeUserOwnAccount(req.user.id)

    clearAuthCookie(res, { secure: isSecureCookie(req) })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'otp_expired_or_not_found' || msg === 'discord_code_expired') return res.status(400).json({ error: 'code_expired', message: 'รหัสยืนยันหมดอายุ' })
    if (msg === 'otp_too_many_attempts') return res.status(429).json({ error: 'code_too_many_attempts', message: 'กรอกรหัสผิดเกินกำหนด กรุณาขอรหัสใหม่' })
    if (msg === 'otp_invalid' || msg === 'discord_code_invalid') return res.status(400).json({ error: 'code_invalid', message: 'รหัสยืนยันไม่ถูกต้อง' })
    if (msg === 'cannot_remove_last_owner') return res.status(400).json({ error: 'cannot_remove_last_owner' })
    res.status(500).json({ error: 'delete_failed' })
  }
})

router.post('/api/me/delete-account/email-code', requireAuth, rateLimitMiddleware({ windowMs: 60_000, max: 3, keyPrefix: 'del_acc_email_code' }), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user?.email) return res.status(400).json({ error: 'no_email' })
    const result = await requestEmailOtp({
      email: user.email,
      purpose: 'delete_account_2fa',
      accountLabel: user.display_name || user.username || user.email,
    })
    res.json({ ok: true, ...result })
  } catch {
    res.status(500).json({ error: 'email_code_send_failed' })
  }
})

router.post('/api/me/password', requireAuth, async (req, res) => {
  const { old_password, new_password, discord_code, email_code } = req.body ?? {}
  if (typeof old_password !== 'string' || !old_password) return res.status(400).json({ error: 'old_password_required' })
  if (typeof new_password !== 'string' || new_password.length < 8) return res.status(400).json({ error: 'new_password_too_short' })

  try {
    const user = await getUserById(req.user.id)
    const discordLink = await getDiscordLinkForUser(req.user.id)

    // 2FA Verification: accept either email_code OR discord_code
    if (typeof email_code === 'string' && email_code.trim()) {
      await verifyEmailOtp({ email: user.email, purpose: 'change_password_2fa', code: email_code.trim() })
    } else if (discordLink && typeof discord_code === 'string' && discord_code.trim()) {
      verifyDiscordPasswordResetCode({ userId: req.user.id, code: discord_code.trim() })
    } else if (discordLink) {
      return res.status(400).json({ error: '2fa_code_required', message: 'กรุณากรอกรหัส OTP จาก Gmail หรือ Discord' })
    }

    await changeUserPassword({ userId: req.user.id, oldPassword: old_password, newPassword: new_password })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_old_password') return res.status(400).json({ error: 'invalid_old_password' })
    if (msg === 'otp_expired_or_not_found' || msg === 'discord_code_expired') return res.status(400).json({ error: 'code_expired', message: 'รหัสยืนยันหมดอายุ กรุณากดส่งรหัสใหม่อีกครั้ง' })
    if (msg === 'otp_too_many_attempts') return res.status(429).json({ error: 'code_too_many_attempts', message: 'กรอกรหัสผิดเกินกำหนด กรุณาขอรหัสใหม่' })
    if (msg === 'otp_invalid' || msg === 'discord_code_invalid') return res.status(400).json({ error: 'code_invalid', message: 'รหัสยืนยันไม่ถูกต้อง' })
    if (msg === 'discord_code_required' || msg === '2fa_code_required') return res.status(400).json({ error: '2fa_code_required', message: 'กรุณากรอกรหัส OTP จาก Gmail หรือ Discord' })
    if (msg === 'user_not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post(
  '/api/me/password/email-code',
  requireAuth,
  rateLimitMiddleware({ windowMs: 60_000, max: 3, keyPrefix: 'email_password_code' }),
  async (req, res) => {
    try {
      const user = await getUserById(req.user.id)
      if (!user?.email) return res.status(400).json({ error: 'no_email' })

      const result = await requestEmailOtp({
        email: user.email,
        purpose: 'change_password_2fa',
        accountLabel: user.display_name || user.username || user.email,
      })

      res.json({ ok: true, ...result })
    } catch {
      res.status(500).json({ error: 'email_code_send_failed' })
    }
  },
)

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

router.post('/api/me/email/send-code', requireAuth, rateLimitMiddleware({ windowMs: 60_000, max: 3, keyPrefix: 'email_verify_send' }), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user?.email) return res.status(400).json({ error: 'no_email' })

    const result = await requestEmailOtp({
      email: user.email,
      purpose: 'verify_email',
      accountLabel: user.display_name || user.username || user.email,
    })

    res.json({ ok: true, ...result })
  } catch {
    res.status(500).json({ error: 'email_send_failed' })
  }
})

router.post('/api/me/email/verify', requireAuth, async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  if (!code) return res.status(400).json({ error: 'code_required' })
  try {
    const user = await getUserById(req.user.id)
    await verifyEmailOtp({ email: user.email, purpose: 'verify_email', code })
    await setUserEmailVerified(req.user.id)
    res.json({ ok: true, is_email_verified: true })
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg === 'otp_expired_or_not_found') return res.status(400).json({ error: 'code_expired', message: 'รหัส OTP หมดอายุ' })
    if (msg === 'otp_too_many_attempts') return res.status(429).json({ error: 'code_too_many_attempts', message: 'กรอกรหัสผิดเกินกำหนด กรุณาขอรหัสใหม่' })
    if (msg === 'otp_invalid') return res.status(400).json({ error: 'code_invalid', message: 'รหัส OTP ไม่ถูกต้อง' })
    res.status(500).json({ error: 'verify_failed' })
  }
})

// ── 2FA MANAGEMENT ENDPOINTS ──

router.get('/api/me/2fa/status', requireAuth, async (req, res) => {
  try {
    const sec = await getUser2FASecret(req.user.id)
    const backupCodes = Array.isArray(sec?.two_factor_backup_codes) ? sec.two_factor_backup_codes : []
    res.json({
      ok: true,
      two_factor_enabled: Boolean(sec?.two_factor_enabled),
      two_factor_type: sec?.two_factor_type || 'none',
      backup_codes_count: backupCodes.length,
      confirmed_at: sec?.two_factor_confirmed_at || null,
    })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/me/2fa/totp/setup', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    const secret = generateTotpSecret()
    const otpauthUri = generateTotpUri({ email: user.email, secret })
    const qrDataUrl = await generateTotpQrDataUrl(otpauthUri)
    const { plainCodes, hashedCodes } = generateBackupCodes(8)

    res.json({
      ok: true,
      secret,
      qr_code_url: qrDataUrl,
      otpauth_uri: otpauthUri,
      backup_codes: plainCodes,
      backup_codes_hashed: hashedCodes,
    })
  } catch (err) {
    console.error('[2FA TOTP SETUP ERROR]', err)
    res.status(500).json({ error: 'totp_setup_failed' })
  }
})

router.post('/api/me/2fa/totp/enable', requireAuth, async (req, res) => {
  const { code, secret, backup_codes_hashed } = req.body ?? {}
  if (!code || !secret) {
    return res.status(400).json({ error: 'code_and_secret_required', message: 'กรุณากรอกรหัส 6 หลักจากแอป' })
  }

  const isValid = verifyTotpToken({ token: code, secret })
  if (!isValid) {
    return res.status(400).json({ error: 'invalid_code', message: 'รหัส 6 หลักไม่ถูกต้อง หรือเวลาในอุปกรณ์ไม่ตรง' })
  }

  try {
    await enableUserTotp2FA({
      userId: req.user.id,
      secret,
      backupCodesHashed: Array.isArray(backup_codes_hashed) ? backup_codes_hashed : [],
    })

    res.json({ ok: true, message: 'totp_enabled' })
  } catch (err) {
    console.error('[2FA TOTP ENABLE ERROR]', err)
    res.status(500).json({ error: 'enable_failed' })
  }
})

router.post('/api/me/2fa/email/send-code', requireAuth, rateLimitMiddleware({ windowMs: 60_000, max: 3, keyPrefix: '2fa_email_send' }), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user?.email) return res.status(400).json({ error: 'no_email' })

    const result = await requestEmailOtp({
      email: user.email,
      purpose: 'enable_2fa_email',
      accountLabel: user.display_name || user.username || user.email,
    })

    res.json({ ok: true, ...result })
  } catch {
    res.status(500).json({ error: 'email_send_failed' })
  }
})

router.post('/api/me/2fa/email/enable', requireAuth, async (req, res) => {
  const { code, backup_codes_hashed } = req.body ?? {}
  if (!code) return res.status(400).json({ error: 'code_required', message: 'กรุณากรอกรหัส OTP' })

  try {
    const user = await getUserById(req.user.id)
    await verifyEmailOtp({ email: user.email, purpose: 'enable_2fa_email', code })

    await enableUserEmail2FA({
      userId: req.user.id,
      backupCodesHashed: Array.isArray(backup_codes_hashed) ? backup_codes_hashed : [],
    })

    res.json({ ok: true, message: 'email_2fa_enabled' })
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg === 'otp_expired_or_not_found') return res.status(400).json({ error: 'code_expired', message: 'รหัส OTP หมดอายุ' })
    if (msg === 'otp_too_many_attempts') return res.status(429).json({ error: 'code_too_many_attempts', message: 'กรอกรหัสผิดเกินกำหนด กรุณาขอรหัสใหม่' })
    if (msg === 'otp_invalid') return res.status(400).json({ error: 'code_invalid', message: 'รหัส OTP ไม่ถูกต้อง' })
    res.status(500).json({ error: 'enable_failed' })
  }
})

router.post('/api/me/2fa/disable', requireAuth, async (req, res) => {
  const { password, code } = req.body ?? {}
  try {
    const user = await getUserById(req.user.id)
    const sec = await getUser2FASecret(req.user.id)

    if (!sec?.two_factor_enabled) {
      return res.status(400).json({ error: '2fa_not_enabled', message: 'บัญชียังไม่ได้เปิด 2FA' })
    }

    // Disabling 2FA requires BOTH the password AND the second factor itself —
    // password alone must never be enough, or 2FA gives no protection against
    // a stolen password.
    if (typeof password !== 'string' || !password || !(await checkPassword(password, user.password_hash))) {
      return res.status(400).json({ error: 'auth_failed', message: 'รหัสผ่านหรือรหัส OTP 2FA ไม่ถูกต้อง' })
    }

    let codeVerified = false
    if (typeof code === 'string' && code.trim()) {
      if (sec.two_factor_type === 'totp' && sec.two_factor_secret) {
        codeVerified = verifyTotpToken({ token: code.trim(), secret: sec.two_factor_secret })
      } else if (sec.two_factor_type === 'email') {
        try {
          await verifyEmailOtp({ email: user.email, purpose: 'disable_2fa_email', code: code.trim() })
          codeVerified = true
        } catch {}
      }
    }

    if (!codeVerified) {
      return res.status(400).json({ error: 'auth_failed', message: 'รหัสผ่านหรือรหัส OTP 2FA ไม่ถูกต้อง' })
    }

    await disableUser2FA(req.user.id)
    res.json({ ok: true, message: '2fa_disabled' })
  } catch (err) {
    console.error('[2FA DISABLE ERROR]', err)
    res.status(500).json({ error: 'disable_failed' })
  }
})

router.post('/api/me/2fa/backup-codes/regenerate', requireAuth, async (req, res) => {
  const { password } = req.body ?? {}
  if (!password) return res.status(400).json({ error: 'password_required', message: 'กรุณากรอกรหัสผ่านเพื่อยืนยัน' })

  try {
    const user = await getUserById(req.user.id)
    const match = await checkPassword(password, user.password_hash)
    if (!match) return res.status(400).json({ error: 'invalid_password', message: 'รหัสผ่านไม่ถูกต้อง' })

    const { plainCodes, hashedCodes } = generateBackupCodes(8)
    await updateUserBackupCodes(req.user.id, hashedCodes)

    res.json({ ok: true, backup_codes: plainCodes })
  } catch (err) {
    console.error('[2FA REGENERATE CODES ERROR]', err)
    res.status(500).json({ error: 'regenerate_failed' })
  }
})

router.post('/api/me/avatar-upload', requireAuth, async (req, res) => {
  const parsed = validateBody(AvatarUploadBodySchema, req.body, { fallbackError: 'invalid_image_data' })
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  try {
    const decoded = decodeDataUrlImage(parsed.data.image_data)
    const maxBytes = 6 * 1024 * 1024
    if (decoded.buffer.length > maxBytes) return res.status(413).json({ error: 'image_too_large' })
    const { buffer, ext } = await sanitizeAvatarImage(decoded)
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

router.post('/api/me/inbox/claim-all', requireAuth, async (req, res) => {
  try {
    const result = await claimAllInboxItems({ userId: req.user.id })
    res.json(result)
  } catch {
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

router.delete('/api/me/messages/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await deleteMySiteMessage(req.user.id, id)
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

// ── User Direct Messages Stream (from Staff) ──

router.get('/api/me/direct-messages', requireAuth, async (req, res) => {
  try {
    const messages = await listMyDirectMessages(req.user.id)
    res.json({ ok: true, messages })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/me/direct-messages/read', requireAuth, async (req, res) => {
  try {
    await markDirectMessagesRead(req.user.id)
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
  const { subject, message, attachments, order_id, priority, category } = req.body ?? {}
  try {
    const ticket = await createSupportTicket({
      userId: req.user.id,
      subject,
      message,
      attachments,
      orderId: order_id,
      priority,
      category,
    })
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
    if (msg === 'invalid_order_id') return res.status(400).json({ error: 'invalid_order_id' })
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
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_subscription') return res.status(400).json({ error: 'invalid_subscription' })
    res.status(400).json({ error: 'invalid_subscription' })
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
