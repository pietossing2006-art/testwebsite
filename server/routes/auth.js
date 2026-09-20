import { Router } from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createSession,
  getUserByLogin,
  getUserById,
  getUserByUsername,
  registerUser,
  deleteSession,
  getSession,
  query,
  checkPassword,
  findOrCreateUserFromDiscord,
  findOrCreateUserFromGoogle,
  getUserByEmail,
  savePasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken,
  deleteUserPasswordResetTokens,
  setUserPassword,
  getDiscordLinkForUser,
  listUserSessions,
  deleteUserSession,
  deleteAllUserSessionsExcept,
  logAuditEvent,
  getUser2FASecret,
  updateUserBackupCodes,
  createTrustedDevice,
  verifyAndTouchTrustedDevice,
  listTrustedDevices,
  deleteTrustedDevice,
  deleteAllTrustedDevices,
} from '../db.js'
import { redis } from '../lib/redis.js'
import { sendEmail, buildHtmlEmailTemplate } from '../lib/email.js'
import { sendDiscordPasswordResetLink } from '../lib/discordBot.js'
import { verifyTotpToken, verifyAndConsumeBackupCode } from '../lib/totp.js'
import { requestEmailOtp, verifyEmailOtp } from '../lib/emailOtp.js'

const temp2faStore = new Map()
const memoryFailedAttempts = new Map()
const memoryLockouts = new Map()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import {
  isSecureCookie,
  cookieDomain,
  cookieSameSite,
  setAuthCookie,
  clearAuthCookie,
  normalizeConsentInput,
  getConsentFromCookie,
  setCookieConsentCookie,
  chooseConsent,
  setTrustedDeviceCookie,
  clearTrustedDeviceCookie,
  getTrustedDeviceToken,
} from '../lib/cookies.js'
import { getBearerToken, getCookieToken, requireAuth, rateLimitMiddleware } from '../lib/auth.js'
import { LoginBodySchema, RegisterBodySchema, VALID_USERNAME_RE } from '../lib/requestSchemas.js'
import { validateBody } from '../lib/validation.js'

const router = Router()

const DISCORD_OAUTH_STATE_COOKIE = 'discord_oauth_state'
const DISCORD_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const pendingDiscordOauthStates = new Map()

const GOOGLE_OAUTH_STATE_COOKIE = 'google_oauth_state'
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const pendingGoogleOauthStates = new Map()

const LOCKOUT_MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_SECONDS = 10 * 60 // 10 minutes
const ATTEMPT_WINDOW_SECONDS = 15 * 60   // 15 minutes

function formatDeviceName(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return 'Web Browser'
  const ua = userAgent
  let browser = 'Browser'
  if (ua.includes('Edg/')) browser = 'Microsoft Edge'
  else if (ua.includes('Chrome/')) browser = 'Google Chrome'
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari'
  else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox'
  else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera'

  let os = 'Unknown OS'
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('iPhone')) os = 'iPhone'
  else if (ua.includes('iPad')) os = 'iPad'
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('Linux')) os = 'Linux'

  return `${browser} on ${os}`
}

async function isAccountLocked(key) {
  if (!redis) {
    const lockedUntil = memoryLockouts.get(key)
    if (lockedUntil && lockedUntil > Date.now()) {
      return { locked: true, retryAfter: Math.ceil((lockedUntil - Date.now()) / 1000) }
    }
    if (lockedUntil) memoryLockouts.delete(key)
    return { locked: false, retryAfter: 0 }
  }
  try {
    const ttl = await redis.ttl(`auth:lockout:${key}`)
    if (ttl > 0) return { locked: true, retryAfter: ttl }
    return { locked: false, retryAfter: 0 }
  } catch {
    return { locked: false, retryAfter: 0 }
  }
}

async function recordFailedAttempt(key) {
  if (!redis) {
    const now = Date.now()
    const entry = memoryFailedAttempts.get(key)
    const windowValid = entry && entry.expiresAt > now
    const count = (windowValid ? entry.count : 0) + 1
    memoryFailedAttempts.set(key, {
      count,
      expiresAt: windowValid ? entry.expiresAt : now + ATTEMPT_WINDOW_SECONDS * 1000,
    })
    if (count >= LOCKOUT_MAX_ATTEMPTS) {
      memoryLockouts.set(key, now + LOCKOUT_DURATION_SECONDS * 1000)
      memoryFailedAttempts.delete(key)
    }
    return
  }
  try {
    const failedKey = `auth:failed:${key}`
    const count = await redis.incr(failedKey)
    if (count === 1) {
      await redis.expire(failedKey, ATTEMPT_WINDOW_SECONDS)
    }
    if (count >= LOCKOUT_MAX_ATTEMPTS) {
      await redis.set(`auth:lockout:${key}`, '1', 'EX', LOCKOUT_DURATION_SECONDS)
      await redis.del(failedKey)
    }
  } catch {
    // ignore
  }
}

async function resetFailedAttempts(key) {
  if (!redis) {
    memoryFailedAttempts.delete(key)
    memoryLockouts.delete(key)
    return
  }
  try {
    await redis.del(`auth:failed:${key}`, `auth:lockout:${key}`)
  } catch {
    // ignore
  }
}

function envValue(name) {
  const value = String(process.env[name] || '').trim()
  if (/^optional_/i.test(value)) return ''
  return value
}

function firstClientOrigin() {
  const raw = envValue('CLIENT_ORIGIN') || envValue('CLIENT_ORIGINS')
  const first = raw.split(',').map((x) => x.trim()).filter(Boolean)[0]
  return first ? first.replace(/\/+$/, '') : 'http://localhost:5173'
}

function allowedClientOrigins() {
  const raw = envValue('CLIENT_ORIGIN') || envValue('CLIENT_ORIGINS')
  return raw
    .split(',')
    .map((x) => x.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

function normalizeOriginValue(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return ''
  }
}

function clientOriginFromRequest(req) {
  const headerOrigin = normalizeOriginValue(req.headers.origin)
  const refererOrigin = normalizeOriginValue(req.headers.referer)
  const explicitOrigin = normalizeOriginValue(req.query?.client_origin)
  const candidates = [explicitOrigin, headerOrigin, refererOrigin].filter(Boolean)
  const allowlist = new Set(allowedClientOrigins())
  for (const candidate of candidates) {
    if (allowlist.has(candidate)) return candidate
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/i.test(candidate)) return candidate
  }
  return preferredClientOrigin()
}

function absoluteUrl(req, path) {
  const xfProto = req.headers['x-forwarded-proto']
  const proto = typeof xfProto === 'string' && xfProto ? xfProto.split(',')[0].trim() : req.protocol
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}${path}`
}

function discordRedirectUri(req) {
  return envValue('DISCORD_REDIRECT_URI') || absoluteUrl(req, '/api/auth/discord/callback')
}

// Origin we are willing to put in an email or any other out-of-band message.
function trustedSiteOrigin() {
  const explicit = normalizeOriginValue(envValue('PUBLIC_SITE_URL') || envValue('OAUTH_LOGIN_REDIRECT'))
  if (explicit) return explicit
  const remote = allowedClientOrigins().find((o) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o))
  if (remote && process.env.NODE_ENV === 'production') return remote
  return firstClientOrigin()
}

function preferredClientOrigin() {
  const explicit = normalizeOriginValue(
    envValue('OAUTH_LOGIN_REDIRECT') || envValue('DISCORD_LOGIN_SUCCESS_REDIRECT') || envValue('PUBLIC_SITE_URL'),
  )
  if (explicit) return explicit
  if (process.env.NODE_ENV === 'production') {
    const remote = allowedClientOrigins().find((o) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o))
    if (remote) return remote
  }
  return firstClientOrigin()
}

function redirectToClient(res, path = '/', originOverride = '') {
  const base = originOverride || preferredClientOrigin()
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = String(path || '/').startsWith('/') ? String(path || '/') : '/'
  return res.redirect(`${cleanBase}${cleanPath}`)
}

function isLocalOauthCallbackRequest(req) {
  if (process.env.NODE_ENV === 'production') return false
  // Deliberately ignores x-forwarded-host: that header is client-supplied on most proxies,
  // so trusting it would let anyone re-open the state bypass from the public domain.
  const host = String(req.headers.host || '').toLowerCase().split(',')[0].trim()
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
}

function normalizeReturnTo(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/api/')) return '/'
  return value.slice(0, 300)
}

export function encodeDiscordError(code, detail = '') {
  const safeCode = String(code || 'discord_login_failed').trim() || 'discord_login_failed'
  if (safeCode === 'discord_login_failed') return safeCode
  const safeDetail = String(detail || '').trim().slice(0, 120)
  return safeDetail ? `${safeCode}:${encodeURIComponent(safeDetail)}` : safeCode
}

function oauthStateSecret() {
  return envValue('DISCORD_OAUTH_STATE_SECRET') || envValue('DISCORD_LINK_CODE_PEPPER') || envValue('DISCORD_CLIENT_SECRET') || 'discord-oauth-state'
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function signOauthState(payload, secret = oauthStateSecret()) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

function createDiscordOauthState({ returnTo, remember, clientOrigin }) {
  const payload = base64UrlJson({
    n: crypto.randomBytes(16).toString('base64url'),
    r: normalizeReturnTo(returnTo),
    m: Boolean(remember),
    o: normalizeOriginValue(clientOrigin),
    t: Date.now(),
  })
  return `${payload}.${signOauthState(payload)}`
}

function rememberDiscordOauthState(state, payload) {
  const expiresAt = Date.now() + DISCORD_OAUTH_STATE_TTL_MS
  pendingDiscordOauthStates.set(state, { ...payload, expiresAt })
  for (const [key, value] of pendingDiscordOauthStates) {
    if (!value || Number(value.expiresAt || 0) <= Date.now()) {
      pendingDiscordOauthStates.delete(key)
    }
  }
}

function takeRememberedDiscordOauthState(state) {
  const value = typeof state === 'string' ? state.trim() : ''
  if (!value) return null
  const record = pendingDiscordOauthStates.get(value)
  pendingDiscordOauthStates.delete(value)
  if (!record) return null
  if (Number(record.expiresAt || 0) <= Date.now()) return null
  return {
    return_to: normalizeReturnTo(record.return_to),
    remember: Boolean(record.remember),
    client_origin: normalizeOriginValue(record.client_origin),
  }
}

function parseDiscordOauthState(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return null
  const expected = signOauthState(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    if (Date.now() - Number(parsed.t || 0) > 10 * 60 * 1000) return null
    return {
      nonce: String(parsed.n || ''),
      return_to: normalizeReturnTo(parsed.r),
      remember: Boolean(parsed.m),
      client_origin: normalizeOriginValue(parsed.o),
    }
  } catch {
    return null
  }
}

function readDiscordStateCookie(req) {
  const raw = req.cookies?.[DISCORD_OAUTH_STATE_COOKIE]
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function clearDiscordStateCookie(req, res) {
  const secure = isSecureCookie(req)
  res.clearCookie(DISCORD_OAUTH_STATE_COOKIE, {
    httpOnly: true,
    sameSite: cookieSameSite(req, secure),
    secure,
    domain: cookieDomain(req),
    path: '/',
  })
}

function discordAvatarUrl(user) {
  const id = String(user?.id || '').trim()
  const avatar = String(user?.avatar || '').trim()
  if (!id || !avatar) return null
  const ext = avatar.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=128`
}

function maskEmail(email) {
  const parts = String(email || '').split('@')
  return parts.length === 2 ? `${parts[0].slice(0, 2)}***@${parts[1]}` : String(email || '')
}

async function createTemp2faToken({ userId, remember, ipAddress, userAgent }) {
  const tempToken = crypto.randomBytes(32).toString('hex')
  const payload = {
    userId,
    remember: Boolean(remember),
    ipAddress,
    userAgent,
    createdAt: Date.now(),
  }

  if (redis) {
    try {
      await redis.set(`temp2fa:${tempToken}`, JSON.stringify(payload), 'EX', 300)
    } catch {
      temp2faStore.set(tempToken, { ...payload, expiresAt: Date.now() + 300_000 })
    }
  } else {
    temp2faStore.set(tempToken, { ...payload, expiresAt: Date.now() + 300_000 })
  }

  return tempToken
}

// Social logins must honour 2FA exactly like password logins do: instead of handing out a
// session straight away, park the user id in a temp token and send the browser to the
// existing /login challenge screen.
async function oauth2faChallengePath({ req, user, remember, returnTo }) {
  const sec = await getUser2FASecret(user.id)
  if (!sec?.two_factor_enabled || !sec.two_factor_type || sec.two_factor_type === 'none') return ''

  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress
  const userAgent = req.headers['user-agent']

  const trustedToken = getTrustedDeviceToken(req)
  if (trustedToken) {
    const trustedDev = await verifyAndTouchTrustedDevice({
      userId: user.id,
      token: trustedToken,
      ipAddress,
      userAgent,
    }).catch(() => null)
    if (trustedDev) {
      return '' // Trusted device verified, skip 2FA challenge!
    }
  }

  const tempToken = await createTemp2faToken({ userId: user.id, remember, ipAddress, userAgent })

  if (sec.two_factor_type === 'email') {
    try {
      await requestEmailOtp({
        email: sec.email || user.email,
        purpose: 'login_2fa',
        accountLabel: user.display_name || user.username || user.email,
      })
    } catch (e) {
      console.error('[2FA OAUTH EMAIL DISPATCH ERROR]', e)
    }
  }

  const params = new URLSearchParams({
    two_factor: '1',
    temp_token: tempToken,
    two_factor_type: sec.two_factor_type,
    email_masked: maskEmail(sec.email || user.email),
    return_to: normalizeReturnTo(returnTo),
  })
  return `/login?${params.toString()}`
}

router.get('/api/auth/check-username', async (req, res) => {
  const raw = String(req.query?.username ?? '').trim()
  if (raw.length < 6) return res.status(400).json({ error: 'invalid_username' })
  if (!VALID_USERNAME_RE.test(raw)) return res.status(400).json({ error: 'invalid_username_charset' })

  try {
    const user = await getUserByUsername(raw)
    res.json({ ok: true, available: !user })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/auth/discord/config', (req, res) => {
  res.json({
    ok: true,
    enabled: Boolean(envValue('DISCORD_CLIENT_ID') && envValue('DISCORD_CLIENT_SECRET')),
    client_id: envValue('DISCORD_CLIENT_ID') || null,
  })
})

router.get('/api/auth/discord', rateLimitMiddleware({ windowMs: 60_000, max: 12, keyPrefix: 'discord_oauth_start' }), (req, res) => {
  const clientId = envValue('DISCORD_CLIENT_ID')
  const clientSecret = envValue('DISCORD_CLIENT_SECRET')
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'discord_login_not_configured' })

  const returnTo = normalizeReturnTo(req.query?.return_to)
  const remember = String(req.query?.remember || '').trim() !== '0'
  const clientOrigin = clientOriginFromRequest(req)
  const state = createDiscordOauthState({ returnTo, remember, clientOrigin })
  const secure = isSecureCookie(req)
  rememberDiscordOauthState(state, { return_to: returnTo, remember, client_origin: clientOrigin })

  res.cookie(DISCORD_OAUTH_STATE_COOKIE, JSON.stringify({ state, return_to: returnTo, remember, client_origin: clientOrigin }), {
    httpOnly: true,
    sameSite: cookieSameSite(req, secure),
    secure,
    domain: cookieDomain(req),
    maxAge: DISCORD_OAUTH_STATE_TTL_MS,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: discordRedirectUri(req),
    response_type: 'code',
    scope: 'identify email',
    state,
  })
  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`)
})

router.get('/api/auth/discord/callback', rateLimitMiddleware({ windowMs: 60_000, max: 20, keyPrefix: 'discord_oauth_callback' }), async (req, res) => {
  const cookieState = readDiscordStateCookie(req)
  clearDiscordStateCookie(req, res)

  const code = typeof req.query?.code === 'string' ? req.query.code.trim() : ''
  const state = typeof req.query?.state === 'string' ? req.query.state.trim() : ''
  const rememberedState = takeRememberedDiscordOauthState(state)
  let signedState = rememberedState || parseDiscordOauthState(state)
  const allowLocalStateBypass = !signedState && Boolean(code) && isLocalOauthCallbackRequest(req)
  if (!code || (!signedState && !allowLocalStateBypass)) {
    console.warn('[Discord OAuth] invalid callback state', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasCookieState: Boolean(cookieState?.state),
      hasRememberedState: Boolean(rememberedState),
      stateLength: state.length,
      stateDotCount: state ? state.split('.').length - 1 : 0,
    })
    return redirectToClient(res, `/login?discord_error=${encodeDiscordError('invalid_state')}`)
  }
  if (!signedState && allowLocalStateBypass) {
    signedState = {
      return_to: normalizeReturnTo(cookieState?.return_to),
      remember: Boolean(cookieState?.remember),
      client_origin: normalizeOriginValue(cookieState?.client_origin),
    }
    console.warn('[Discord OAuth] accepting localhost callback without valid state')
  }
  if (cookieState?.state && cookieState.state !== state) {
    console.warn('[Discord OAuth] cookie state mismatch; accepting signed state fallback')
  }

  const clientId = envValue('DISCORD_CLIENT_ID')
  const clientSecret = envValue('DISCORD_CLIENT_SECRET')
  const clientOrigin = normalizeOriginValue(signedState?.client_origin) || normalizeOriginValue(cookieState?.client_origin) || preferredClientOrigin()
  if (!clientId || !clientSecret) return redirectToClient(res, `/login?discord_error=${encodeDiscordError('not_configured')}`, clientOrigin)

  try {
    const redirectUri = discordRedirectUri(req)
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })
    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '')
      console.warn('[Discord OAuth] token exchange failed', { status: tokenRes.status, redirect_uri: redirectUri, body: errText.slice(0, 500) })
      return redirectToClient(res, `/login?discord_error=${encodeDiscordError('token_exchange_failed', tokenRes.status)}`, clientOrigin)
    }
    const tokenData = await tokenRes.json()
    const accessToken = typeof tokenData?.access_token === 'string' ? tokenData.access_token : ''
    if (!accessToken) {
      console.warn('[Discord OAuth] token exchange returned no access token')
      return redirectToClient(res, `/login?discord_error=${encodeDiscordError('token_exchange_failed', 'missing_access_token')}`, clientOrigin)
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!userRes.ok) {
      const errText = await userRes.text().catch(() => '')
      console.warn('[Discord OAuth] profile fetch failed', { status: userRes.status, body: errText.slice(0, 500) })
      return redirectToClient(res, `/login?discord_error=${encodeDiscordError('profile_failed', userRes.status)}`, clientOrigin)
    }
    const discordUser = await userRes.json()

    const user = await findOrCreateUserFromDiscord({
      discordUserId: discordUser?.id,
      discordUsername: discordUser?.username,
      discordGlobalName: discordUser?.global_name,
      email: discordUser?.email,
      emailVerified: Boolean(discordUser?.verified),
      avatarUrl: discordAvatarUrl(discordUser),
    })
    if (Boolean(user?.is_banned)) return redirectToClient(res, `/login?discord_error=${encodeDiscordError('banned')}`, clientOrigin)

    const remember = Boolean(signedState.remember ?? cookieState?.remember)
    const returnTo = normalizeReturnTo(signedState.return_to || cookieState?.return_to)
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress
    const userAgent = req.headers['user-agent']

    const challengePath = await oauth2faChallengePath({ req, user, remember, returnTo })
    if (challengePath) return redirectToClient(res, challengePath, clientOrigin)

    const token = await createSession(user.id, { ipAddress: clientIp, userAgent, remember })
    const secure = isSecureCookie(req)
    setAuthCookie(res, token, { remember, secure })

    try {
      await logAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'auth.login',
        entityType: 'user',
        entityId: String(user.id),
        detail: { provider: 'discord', remember },
        ipAddress: clientIp,
        userAgent,
        status: 'success',
        severity: 'info',
      })
    } catch {}

    return redirectToClient(res, returnTo, clientOrigin)
  } catch (e) {
    const msg = String(e?.message || '')
    const code = String(e?.code || '').trim()
    console.warn('[Discord OAuth] callback failed', { message: msg, code, stack: String(e?.stack || '').slice(0, 1000) })
    if (msg === 'banned') return redirectToClient(res, `/login?discord_error=${encodeDiscordError('banned')}`, clientOrigin)
    if (msg === 'user_already_linked') return redirectToClient(res, `/login?discord_error=${encodeDiscordError('user_already_linked')}`, clientOrigin)
    if (code === '23505') return redirectToClient(res, `/login?discord_error=${encodeDiscordError('db_unique_violation')}`, clientOrigin)
    return redirectToClient(res, `/login?discord_error=${encodeDiscordError('discord_login_failed')}`, clientOrigin)
  }
})

// -- Google OAuth --
function googleRedirectUri(req) {
  return envValue('GOOGLE_REDIRECT_URI') || absoluteUrl(req, '/api/auth/google/callback')
}

export function encodeGoogleError(code, detail = '') {
  const safeCode = String(code || 'google_login_failed').trim() || 'google_login_failed'
  if (safeCode === 'google_login_failed') return safeCode
  const safeDetail = String(detail || '').trim().slice(0, 120)
  return safeDetail ? `${safeCode}:${encodeURIComponent(safeDetail)}` : safeCode
}

function googleOauthStateSecret() {
  return envValue('GOOGLE_OAUTH_STATE_SECRET') || envValue('GOOGLE_CLIENT_SECRET') || 'google-oauth-state'
}

function createGoogleOauthState({ returnTo, remember, clientOrigin }) {
  const payload = base64UrlJson({
    n: crypto.randomBytes(16).toString('base64url'),
    r: normalizeReturnTo(returnTo),
    m: Boolean(remember),
    o: normalizeOriginValue(clientOrigin),
    t: Date.now(),
  })
  return `${payload}.${signOauthState(payload, googleOauthStateSecret())}`
}

function rememberGoogleOauthState(state, payload) {
  const expiresAt = Date.now() + GOOGLE_OAUTH_STATE_TTL_MS
  pendingGoogleOauthStates.set(state, { ...payload, expiresAt })
  for (const [key, value] of pendingGoogleOauthStates) {
    if (!value || Number(value.expiresAt || 0) <= Date.now()) {
      pendingGoogleOauthStates.delete(key)
    }
  }
}

function takeRememberedGoogleOauthState(state) {
  const value = typeof state === 'string' ? state.trim() : ''
  if (!value) return null
  const record = pendingGoogleOauthStates.get(value)
  pendingGoogleOauthStates.delete(value)
  if (!record) return null
  if (Number(record.expiresAt || 0) <= Date.now()) return null
  return {
    return_to: normalizeReturnTo(record.return_to),
    remember: Boolean(record.remember),
    client_origin: normalizeOriginValue(record.client_origin),
  }
}

function parseGoogleOauthState(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return null
  const expected = signOauthState(payload, googleOauthStateSecret())
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    if (Date.now() - Number(parsed.t || 0) > GOOGLE_OAUTH_STATE_TTL_MS) return null
    return {
      nonce: String(parsed.n || ''),
      return_to: normalizeReturnTo(parsed.r),
      remember: Boolean(parsed.m),
      client_origin: normalizeOriginValue(parsed.o),
    }
  } catch {
    return null
  }
}

function readGoogleStateCookie(req) {
  const raw = req.cookies?.[GOOGLE_OAUTH_STATE_COOKIE]
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function clearGoogleStateCookie(req, res) {
  const secure = isSecureCookie(req)
  res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, {
    httpOnly: true,
    sameSite: cookieSameSite(req, secure),
    secure,
    domain: cookieDomain(req),
    path: '/',
  })
}

function googleAvatarUrl(profile) {
  const picture = String(profile?.picture || '').trim()
  if (!/^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|google\.com)\//.test(picture)) return null
  return picture
}

router.get('/api/auth/google', rateLimitMiddleware({ windowMs: 60_000, max: 12, keyPrefix: 'google_oauth_start' }), (req, res) => {
  const clientId = envValue('GOOGLE_CLIENT_ID')
  const clientSecret = envValue('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'google_login_not_configured' })

  const returnTo = normalizeReturnTo(req.query?.return_to)
  const remember = String(req.query?.remember || '').trim() !== '0'
  const clientOrigin = clientOriginFromRequest(req)
  const state = createGoogleOauthState({ returnTo, remember, clientOrigin })
  const secure = isSecureCookie(req)
  rememberGoogleOauthState(state, { return_to: returnTo, remember, client_origin: clientOrigin })

  res.cookie(GOOGLE_OAUTH_STATE_COOKIE, JSON.stringify({ state, return_to: returnTo, remember, client_origin: clientOrigin }), {
    httpOnly: true,
    sameSite: cookieSameSite(req, secure),
    secure,
    domain: cookieDomain(req),
    maxAge: GOOGLE_OAUTH_STATE_TTL_MS,
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  })
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
})

router.get('/api/auth/google/callback', rateLimitMiddleware({ windowMs: 60_000, max: 20, keyPrefix: 'google_oauth_callback' }), async (req, res) => {
  const cookieState = readGoogleStateCookie(req)
  clearGoogleStateCookie(req, res)

  const code = typeof req.query?.code === 'string' ? req.query.code.trim() : ''
  const state = typeof req.query?.state === 'string' ? req.query.state.trim() : ''
  const oauthError = typeof req.query?.error === 'string' ? req.query.error.trim() : ''
  if (oauthError) {
    return redirectToClient(res, `/login?google_error=${encodeGoogleError('access_denied', oauthError)}`, normalizeOriginValue(cookieState?.client_origin))
  }

  const rememberedState = takeRememberedGoogleOauthState(state)
  let signedState = rememberedState || parseGoogleOauthState(state)
  const allowLocalStateBypass = !signedState && Boolean(code) && isLocalOauthCallbackRequest(req)
  if (!code || (!signedState && !allowLocalStateBypass)) {
    console.warn('[Google OAuth] invalid callback state', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasCookieState: Boolean(cookieState?.state),
      hasRememberedState: Boolean(rememberedState),
      stateLength: state.length,
    })
    return redirectToClient(res, `/login?google_error=${encodeGoogleError('invalid_state')}`)
  }
  if (!signedState && allowLocalStateBypass) {
    signedState = {
      return_to: normalizeReturnTo(cookieState?.return_to),
      remember: Boolean(cookieState?.remember),
      client_origin: normalizeOriginValue(cookieState?.client_origin),
    }
    console.warn('[Google OAuth] accepting localhost callback without valid state')
  }
  if (cookieState?.state && cookieState.state !== state) {
    console.warn('[Google OAuth] cookie state mismatch; accepting signed state fallback')
  }

  const clientId = envValue('GOOGLE_CLIENT_ID')
  const clientSecret = envValue('GOOGLE_CLIENT_SECRET')
  const clientOrigin = normalizeOriginValue(signedState?.client_origin) || normalizeOriginValue(cookieState?.client_origin) || preferredClientOrigin()
  if (!clientId || !clientSecret) return redirectToClient(res, `/login?google_error=${encodeGoogleError('not_configured')}`, clientOrigin)

  try {
    const redirectUri = googleRedirectUri(req)
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })
    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '')
      console.warn('[Google OAuth] token exchange failed', { status: tokenRes.status, redirect_uri: redirectUri, body: errText.slice(0, 500) })
      return redirectToClient(res, `/login?google_error=${encodeGoogleError('token_exchange_failed', tokenRes.status)}`, clientOrigin)
    }
    const tokenData = await tokenRes.json()
    const accessToken = typeof tokenData?.access_token === 'string' ? tokenData.access_token : ''
    if (!accessToken) {
      console.warn('[Google OAuth] token exchange returned no access token')
      return redirectToClient(res, `/login?google_error=${encodeGoogleError('token_exchange_failed', 'missing_access_token')}`, clientOrigin)
    }

    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!userRes.ok) {
      const errText = await userRes.text().catch(() => '')
      console.warn('[Google OAuth] profile fetch failed', { status: userRes.status, body: errText.slice(0, 500) })
      return redirectToClient(res, `/login?google_error=${encodeGoogleError('profile_failed', userRes.status)}`, clientOrigin)
    }
    const googleUser = await userRes.json()

    const user = await findOrCreateUserFromGoogle({
      googleUserId: googleUser?.sub,
      email: googleUser?.email,
      emailVerified: Boolean(googleUser?.email_verified),
      displayName: googleUser?.name || googleUser?.given_name,
      avatarUrl: googleAvatarUrl(googleUser),
    })
    if (Boolean(user?.is_banned)) return redirectToClient(res, `/login?google_error=${encodeGoogleError('banned')}`, clientOrigin)

    const remember = Boolean(signedState.remember ?? cookieState?.remember)
    const returnTo = normalizeReturnTo(signedState.return_to || cookieState?.return_to)
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress
    const userAgent = req.headers['user-agent']

    const challengePath = await oauth2faChallengePath({ req, user, remember, returnTo })
    if (challengePath) return redirectToClient(res, challengePath, clientOrigin)

    const token = await createSession(user.id, { ipAddress: clientIp, userAgent, remember })
    const secure = isSecureCookie(req)
    setAuthCookie(res, token, { remember, secure })

    try {
      await logAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'auth.login',
        entityType: 'user',
        entityId: String(user.id),
        detail: { provider: 'google', remember },
        ipAddress: clientIp,
        userAgent,
        status: 'success',
        severity: 'info',
      })
    } catch {}

    return redirectToClient(res, returnTo, clientOrigin)
  } catch (e) {
    const msg = String(e?.message || '')
    const errCode = String(e?.code || '').trim()
    console.warn('[Google OAuth] callback failed', { message: msg, code: errCode, stack: String(e?.stack || '').slice(0, 1000) })
    if (msg === 'banned') return redirectToClient(res, `/login?google_error=${encodeGoogleError('banned')}`, clientOrigin)
    if (msg === 'user_already_linked') return redirectToClient(res, `/login?google_error=${encodeGoogleError('user_already_linked')}`, clientOrigin)
    if (msg === 'invalid_google_user') return redirectToClient(res, `/login?google_error=${encodeGoogleError('profile_failed', 'invalid_subject')}`, clientOrigin)
    if (errCode === '23505') return redirectToClient(res, `/login?google_error=${encodeGoogleError('db_unique_violation')}`, clientOrigin)
    return redirectToClient(res, `/login?google_error=${encodeGoogleError('google_login_failed')}`, clientOrigin)
  }
})

router.post('/api/auth/register', rateLimitMiddleware({ windowMs: 60_000, max: 5, keyPrefix: 'register' }), async (req, res) => {
  const parsed = validateBody(RegisterBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { email, password, username, remember } = parsed.data

  try {
    const user = await registerUser(email, password, username)
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress
    const userAgent = req.headers['user-agent']
    const token = await createSession(user.id, {
      ipAddress: clientIp,
      userAgent,
      remember: Boolean(remember),
    })
    const u = await getUserById(user.id)
    const secure = isSecureCookie(req)
    const consent = chooseConsent(req)
    if (consent) setCookieConsentCookie(res, consent, { secure })
    setAuthCookie(res, token, { remember: Boolean(remember), secure })

    try {
      await logAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'auth.register',
        entityType: 'user',
        entityId: String(user.id),
        detail: { username: u?.username },
        ipAddress: clientIp,
        userAgent,
        status: 'success',
        severity: 'info',
      })
    } catch {}

    res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: u?.username ?? null,
        role: typeof u?.role === 'string' && u.role.trim() ? u.role.trim().toLowerCase() : 'user',
        display_name: u?.display_name ?? null,
        avatar_url: u?.avatar_url ?? null,
        is_email_verified: Boolean(u?.is_email_verified),
      },
      token,
    })
  } catch (e) {
    if (e?.code === '23505') {
      return res.status(409).json({ error: 'email_or_username_taken' })
    }
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/auth/login', rateLimitMiddleware({ windowMs: 60_000, max: 15, keyPrefix: 'login' }), async (req, res) => {
  const parsed = validateBody(LoginBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { identifier, password, remember } = parsed.data

  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1'
  const userAgent = req.headers['user-agent']
  const keyUser = String(identifier || '').trim().toLowerCase()
  const keyIp = String(clientIp || '').trim()

  try {
    const user = await getUserByLogin(identifier)
    const passwordOk = Boolean(user) && (await checkPassword(password, user.password_hash))

    // Lockout is only enforced against wrong passwords, never against the true
    // account owner: gating on it before the password check would let an
    // attacker who doesn't know the password deny access to the real owner
    // just by submitting a handful of failed guesses for their email.
    if (!passwordOk) {
      const lockUser = await isAccountLocked(keyUser)
      const lockIp = await isAccountLocked(keyIp)
      if (lockUser.locked || lockIp.locked) {
        const retryAfter = Math.max(lockUser.retryAfter, lockIp.retryAfter)
        return res.status(429).json({
          error: 'too_many_failed_attempts',
          message: `ใส่รหัสผ่านผิดเกินกำหนด บัญชีถูกล็อกชั่วคราวเพื่อความปลอดภัย กรุณาลองใหม่ในอีก ${Math.ceil(retryAfter / 60)} นาที`,
          retry_after_seconds: retryAfter,
        })
      }

      await recordFailedAttempt(keyUser)
      await recordFailedAttempt(keyIp)

      try {
        await logAuditEvent({
          actorEmail: user?.email || identifier,
          action: 'auth.login_failed',
          entityType: 'auth',
          entityId: identifier,
          detail: { reason: 'invalid_credentials' },
          ipAddress: clientIp,
          userAgent,
          status: 'failed',
          severity: 'security',
        })
      } catch {}

      return res.status(401).json({ error: 'invalid_credentials' })
    }

    if (Boolean(user?.is_banned)) {
      return res.status(403).json({ error: 'banned' })
    }

    // Login successful: reset failed attempt counters
    await resetFailedAttempts(keyUser)
    await resetFailedAttempts(keyIp)

    // Check 2FA Requirement
    if (user.two_factor_enabled && user.two_factor_type && user.two_factor_type !== 'none') {
      const trustedToken = getTrustedDeviceToken(req)
      const trustedDevice = trustedToken
        ? await verifyAndTouchTrustedDevice({
            userId: user.id,
            token: trustedToken,
            ipAddress: clientIp,
            userAgent,
          }).catch(() => null)
        : null

      if (trustedDevice) {
        // Device is trusted: bypass 2FA challenge
        const token = await createSession(user.id, {
          ipAddress: clientIp,
          userAgent,
          remember: Boolean(remember),
        })

        const secure = isSecureCookie(req)
        const consent = chooseConsent(req)
        if (consent) setCookieConsentCookie(res, consent, { secure })
        setAuthCookie(res, token, { remember: Boolean(remember), secure })
        setTrustedDeviceCookie(res, trustedToken, { secure })

        try {
          await logAuditEvent({
            actorUserId: user.id,
            actorEmail: user.email,
            action: 'auth.login_trusted_device',
            entityType: 'user',
            entityId: String(user.id),
            detail: { remember: Boolean(remember), device_id: trustedDevice.id, device_name: trustedDevice.device_name },
            ipAddress: clientIp,
            userAgent,
            status: 'success',
            severity: 'info',
          })
        } catch {}

        return res.json({
          ok: true,
          trusted_device: true,
          trusted_device_token: trustedToken,
          user: {
            id: user.id,
            email: user.email,
            username: user.username ?? null,
            role: typeof user?.role === 'string' && user.role.trim() ? user.role.trim().toLowerCase() : 'user',
            display_name: user.display_name ?? null,
            avatar_url: user.avatar_url ?? null,
            is_email_verified: Boolean(user.is_email_verified),
            two_factor_enabled: Boolean(user.two_factor_enabled),
            two_factor_type: user.two_factor_type || 'none',
          },
          token,
        })
      }

      const tempToken = await createTemp2faToken({
        userId: user.id,
        remember,
        ipAddress: clientIp,
        userAgent,
      })

      if (user.two_factor_type === 'email') {
        try {
          await requestEmailOtp({
            email: user.email,
            purpose: 'login_2fa',
            accountLabel: user.display_name || user.username || user.email,
          })
        } catch (e) {
          console.error('[2FA LOGIN EMAIL DISPATCH ERROR]', e)
        }
      }

      return res.json({
        two_factor_required: true,
        two_factor_type: user.two_factor_type,
        temp_token: tempToken,
        email_masked: maskEmail(user.email),
      })
    }

    const token = await createSession(user.id, {
      ipAddress: clientIp,
      userAgent,
      remember: Boolean(remember),
    })

    const secure = isSecureCookie(req)
    const consent = chooseConsent(req)
    if (consent) setCookieConsentCookie(res, consent, { secure })
    setAuthCookie(res, token, { remember: Boolean(remember), secure })

    try {
      await logAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'auth.login',
        entityType: 'user',
        entityId: String(user.id),
        detail: { remember: Boolean(remember) },
        ipAddress: clientIp,
        userAgent,
        status: 'success',
        severity: 'info',
      })
    } catch {}

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username ?? null,
        role: typeof user?.role === 'string' && user.role.trim() ? user.role.trim().toLowerCase() : 'user',
        display_name: user.display_name ?? null,
        avatar_url: user.avatar_url ?? null,
        is_email_verified: Boolean(user.is_email_verified),
        two_factor_enabled: Boolean(user.two_factor_enabled),
        two_factor_type: user.two_factor_type || 'none',
      },
      token,
    })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/auth/2fa/verify', rateLimitMiddleware({ windowMs: 60_000, max: 10, keyPrefix: '2fa_verify' }), async (req, res) => {
  const { temp_token, code, is_backup_code, remember_device } = req.body ?? {}
  if (!temp_token || !code) {
    return res.status(400).json({ error: 'token_and_code_required', message: 'กรุณากรอกรหัสยืนยัน 2FA' })
  }

  try {
    let sessionData = null
    if (redis) {
      try {
        const raw = await redis.get(`temp2fa:${temp_token}`)
        if (raw) sessionData = JSON.parse(raw)
      } catch {}
    }
    if (!sessionData) {
      const entry = temp2faStore.get(temp_token)
      if (entry && entry.expiresAt > Date.now()) {
        sessionData = entry
      }
    }

    if (!sessionData || !sessionData.userId) {
      return res.status(400).json({ error: '2fa_session_expired', message: 'เซสชัน 2FA หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง' })
    }

    const user = await getUserById(sessionData.userId)
    const sec = await getUser2FASecret(sessionData.userId)

    if (!user || !sec?.two_factor_enabled) {
      return res.status(400).json({ error: 'invalid_request' })
    }

    let verified = false

    if (Boolean(is_backup_code)) {
      const backupCodes = Array.isArray(sec.two_factor_backup_codes) ? sec.two_factor_backup_codes : []
      const result = verifyAndConsumeBackupCode(code, backupCodes)
      if (result.valid) {
        verified = true
        await updateUserBackupCodes(user.id, result.remainingHashedCodes)
      } else {
        return res.status(400).json({ error: 'invalid_backup_code', message: 'รหัสสำรองฉุกเฉินไม่ถูกต้อง หรือถูกใช้งานไปแล้ว' })
      }
    } else if (sec.two_factor_type === 'totp') {
      if (sec.two_factor_secret) {
        verified = verifyTotpToken({ token: code, secret: sec.two_factor_secret })
      }
      if (!verified) {
        return res.status(400).json({ error: 'invalid_totp_code', message: 'รหัส 6 หลักจากแอปไม่ถูกต้อง หรือเวลาในอุปกรณ์ไม่ตรง' })
      }
    } else if (sec.two_factor_type === 'email') {
      try {
        await verifyEmailOtp({ email: user.email, purpose: 'login_2fa', code })
        verified = true
      } catch {
        return res.status(400).json({ error: 'invalid_email_otp', message: 'รหัส OTP จาก Gmail ไม่ถูกต้องหรือหมดอายุ' })
      }
    }

    if (!verified) {
      return res.status(400).json({ error: 'verification_failed', message: 'การยืนยันรหัส 2FA ไม่สำเร็จ' })
    }

    // Clear temp token
    if (redis) {
      try { await redis.del(`temp2fa:${temp_token}`) } catch {}
    }
    temp2faStore.delete(temp_token)

    // Complete login session
    const clientIp = sessionData.ipAddress || req.ip
    const userAgent = sessionData.userAgent || req.headers['user-agent']
    const token = await createSession(user.id, {
      ipAddress: clientIp,
      userAgent,
      remember: Boolean(sessionData.remember),
    })

    const secure = isSecureCookie(req)
    const consent = chooseConsent(req)
    if (consent) setCookieConsentCookie(res, consent, { secure })
    setAuthCookie(res, token, { remember: Boolean(sessionData.remember), secure })

    let trustedDeviceToken = null
    if (Boolean(remember_device)) {
      try {
        trustedDeviceToken = crypto.randomBytes(32).toString('hex')
        const devName = formatDeviceName(userAgent)
        await createTrustedDevice({
          userId: user.id,
          token: trustedDeviceToken,
          deviceName: devName,
          ipAddress: clientIp,
          userAgent,
          days: 30,
        })
        setTrustedDeviceCookie(res, trustedDeviceToken, { secure })
      } catch (err) {
        console.error('[CREATE TRUSTED DEVICE ERROR]', err)
      }
    }

    try {
      await logAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'auth.login_2fa_success',
        entityType: 'user',
        entityId: String(user.id),
        detail: {
          two_factor_type: sec.two_factor_type,
          is_backup_code: Boolean(is_backup_code),
          remember_device: Boolean(remember_device),
        },
        ipAddress: clientIp,
        userAgent,
        status: 'success',
        severity: 'info',
      })
    } catch {}

    res.json({
      ok: true,
      trusted_device: Boolean(remember_device && trustedDeviceToken),
      trusted_device_token: trustedDeviceToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username ?? null,
        role: typeof user?.role === 'string' && user.role.trim() ? user.role.trim().toLowerCase() : 'user',
        display_name: user.display_name ?? null,
        avatar_url: user.avatar_url ?? null,
        is_email_verified: Boolean(user.is_email_verified),
        two_factor_enabled: true,
        two_factor_type: sec.two_factor_type,
      },
      token,
    })
  } catch (err) {
    console.error('[2FA VERIFY LOGIN ERROR]', err)
    res.status(500).json({ error: 'server_error' })
  }
})

router.post('/api/auth/2fa/resend-email', rateLimitMiddleware({ windowMs: 60_000, max: 3, keyPrefix: '2fa_resend' }), async (req, res) => {
  const { temp_token } = req.body ?? {}
  if (!temp_token) return res.status(400).json({ error: 'token_required' })

  try {
    let sessionData = null
    if (redis) {
      try {
        const raw = await redis.get(`temp2fa:${temp_token}`)
        if (raw) sessionData = JSON.parse(raw)
      } catch {}
    }
    if (!sessionData) {
      const entry = temp2faStore.get(temp_token)
      if (entry && entry.expiresAt > Date.now()) sessionData = entry
    }

    if (!sessionData) return res.status(400).json({ error: 'expired' })

    const user = await getUserById(sessionData.userId)
    if (user && user.two_factor_type === 'email') {
      await requestEmailOtp({
        email: user.email,
        purpose: 'login_2fa',
        accountLabel: user.display_name || user.username || user.email,
      })
    }

    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'resend_failed' })
  }
})

// ── Sessions & Device Management ──
router.get('/api/auth/sessions', requireAuth, async (req, res) => {
  try {
    const bearer = getBearerToken(req)
    const cookieToken = getCookieToken(req)
    const currentToken = bearer || cookieToken
    const sessions = await listUserSessions(req.user.id)
    const items = sessions.map((s) => ({
      id: s.token.slice(0, 12),
      is_current: s.token === currentToken,
      ip_address: s.ip_address || '-',
      user_agent: s.user_agent || '-',
      device_name: formatDeviceName(s.user_agent),
      created_at: s.created_at,
      last_active_at: s.last_active_at,
      token_hash: crypto.createHash('sha256').update(s.token).digest('hex'),
    }))
    res.json({ ok: true, sessions: items })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/auth/sessions/:tokenHash', requireAuth, async (req, res) => {
  try {
    const tokenHash = req.params.tokenHash
    const sessions = await listUserSessions(req.user.id)
    const match = sessions.find(
      (s) => crypto.createHash('sha256').update(s.token).digest('hex') === tokenHash,
    )
    if (match) await deleteUserSession(req.user.id, match.token)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/auth/sessions/revoke-others', requireAuth, async (req, res) => {
  try {
    const bearer = getBearerToken(req)
    const cookieToken = getCookieToken(req)
    const currentToken = bearer || cookieToken
    await deleteAllUserSessionsExcept(req.user.id, currentToken)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Trusted Devices Management ──
router.get('/api/auth/trusted-devices', requireAuth, async (req, res) => {
  try {
    const devices = await listTrustedDevices(req.user.id)
    res.json({ ok: true, devices })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/auth/trusted-devices/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id
    await deleteTrustedDevice(req.user.id, id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/auth/trusted-devices/revoke-all', requireAuth, async (req, res) => {
  try {
    await deleteAllTrustedDevices(req.user.id)
    clearTrustedDeviceCookie(res, { secure: isSecureCookie(req) })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/auth/google/config', (req, res) => {
  res.json({
    ok: true,
    enabled: Boolean(envValue('GOOGLE_CLIENT_ID') && envValue('GOOGLE_CLIENT_SECRET')),
    client_id: envValue('GOOGLE_CLIENT_ID') || null,
  })
})

router.post('/api/auth/logout', async (req, res) => {
  const bearer = getBearerToken(req)
  const cookieToken = getCookieToken(req)
  const token = bearer || cookieToken
  let userId = null
  try {
    if (token) {
      const session = await getSession(token).catch(() => null)
      userId = session?.user_id || null
      await deleteSession(token)
    }
  } catch {
    // ignore
  }
  if (userId) {
    query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]).catch(() => {})
  }
  clearAuthCookie(res, { secure: isSecureCookie(req) })
  res.json({ ok: true })
})

router.get('/api/cookie-consent', (req, res) => {
  const consent = getConsentFromCookie(req)
  res.json({ ok: true, consent })
})

router.post('/api/cookie-consent', (req, res) => {
  const consent = normalizeConsentInput(req.body?.consent)
  setCookieConsentCookie(res, consent, { secure: isSecureCookie(req) })
  res.json({ ok: true, consent })
})

function logSimulatedEmail(email, subject, body) {
  try {
    const logDir = path.join(__dirname, '..', 'logs')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    const logPath = path.join(logDir, 'email-simulation.log')
    const logEntry = `[${new Date().toISOString()}] To: ${email}\nSubject: ${subject}\nBody:\n${body}\n========================================\n\n`
    fs.appendFileSync(logPath, logEntry, 'utf8')
    console.log(`[EMAIL SIMULATION] Logged email to ${email} (Subject: ${subject}) in ${logPath}`)
  } catch (err) {
    console.error('Failed to log simulated email:', err)
  }
}

router.post('/api/auth/forgot-password', rateLimitMiddleware({ windowMs: 60_000, max: 5, keyPrefix: 'forgot_password' }), async (req, res) => {
  const emailInput = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!emailInput || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
    return res.status(400).json({ error: 'invalid_email' })
  }

  try {
    const user = await getUserByEmail(emailInput)
    if (user) {
      await deleteUserPasswordResetTokens(user.id)

      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

      await savePasswordResetToken({ userId: user.id, tokenHash, email: user.email, expiresAt })

      // Never build this from Origin/Referer: the mail goes to the account owner, so a spoofed
      // header would hand the reset token to whoever crafted the request.
      const resetLink = `${trustedSiteOrigin().replace(/\/+$/, '')}/reset-password?token=${token}`

      const discordLink = await getDiscordLinkForUser(user.id)
      let sentDiscord = false
      if (discordLink && discordLink.discord_user_id) {
        try {
          await sendDiscordPasswordResetLink({
            discordUserId: discordLink.discord_user_id,
            resetLink,
            accountLabel: user.display_name || user.username || user.email,
            expiresMinutes: 30
          })
          sentDiscord = true
        } catch (err) {
          console.error('[Discord Reset DM] Failed to send DM:', err?.message || err)
        }
      }

      const emailHtml = buildHtmlEmailTemplate({
        title: 'กู้คืนรหัสผ่านของคุณ - VxperS Store',
        greeting: `สวัสดีคุณ ${user.display_name || user.username || 'สมาชิก VxperS'},`,
        intro: `เราได้รับคำขอกู้คืนรหัสผ่านสำหรับบัญชีของคุณ (<strong>${user.email}</strong>) กรุณาคลิกปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่:`,
        ctaText: '🔑 ตั้งค่ารหัสผ่านใหม่',
        ctaUrl: resetLink,
        notice: 'ลิงก์นี้จะมีอายุการใช้งาน 30 นาที หากคุณไม่ได้เป็นผู้ส่งคำขอนี้ กรุณาละเลยอีเมลนี้',
      })

      const emailText = `สวัสดีคุณ ${user.display_name || user.username || 'สมาชิก VxperS'},\n\n` +
        `เราได้รับคำขอกู้คืนรหัสผ่านสำหรับบัญชีของคุณ\n` +
        `กรุณาคลิกที่ลิงก์ด้านล่างเพื่อตั้งค่ารหัสผ่านใหม่:\n\n` +
        `${resetLink}\n\n` +
        `ลิงก์นี้จะมีอายุการใช้งาน 30 นาที หากคุณไม่ได้ส่งคำขอนี้ กรุณาละเลยอีเมลนี้\n\n` +
        `ขอบคุณครับ,\nทีมงาน VxperS Store`

      await sendEmail({
        to: user.email,
        subject: '[VxperS Store] กู้คืนรหัสผ่านของคุณ',
        text: emailText,
        html: emailHtml,
      })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[Forgot Password] Error:', err)
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/auth/verify-reset-token', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (!token) return res.status(400).json({ error: 'token_required' })

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const record = await getPasswordResetToken(tokenHash)

    if (!record) {
      return res.json({ valid: false })
    }

    const expiresAt = new Date(record.expires_at).getTime()
    if (expiresAt <= Date.now()) {
      await deletePasswordResetToken(tokenHash)
      return res.json({ valid: false })
    }

    res.json({ valid: true, email: record.email })
  } catch (err) {
    console.error('[Verify Reset Token] Error:', err)
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/auth/reset-password', rateLimitMiddleware({ windowMs: 60_000, max: 5, keyPrefix: 'reset_password' }), async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!token) return res.status(400).json({ error: 'token_required' })
  if (!password || password.length < 8) return res.status(400).json({ error: 'weak_password' })
  if (!/^[\x20-\x7E]+$/.test(password)) return res.status(400).json({ error: 'invalid_password_charset' })

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const record = await getPasswordResetToken(tokenHash)

    if (!record) {
      return res.status(400).json({ error: 'invalid_or_expired_token' })
    }

    const expiresAt = new Date(record.expires_at).getTime()
    if (expiresAt <= Date.now()) {
      await deletePasswordResetToken(tokenHash)
      return res.status(400).json({ error: 'invalid_or_expired_token' })
    }

    await setUserPassword({ userId: record.user_id, password })
    await deleteUserPasswordResetTokens(record.user_id)
    // Whoever was signed in with the old password (including an attacker) is now logged out.
    await deleteAllUserSessionsExcept(record.user_id, '')

    try {
      await logAuditEvent({
        actorUserId: record.user_id,
        actorEmail: record.email || null,
        action: 'auth.password_reset',
        entityType: 'user',
        entityId: String(record.user_id),
        detail: { sessions_revoked: true },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
        status: 'success',
        severity: 'security',
      })
    } catch {}

    res.json({ ok: true })
  } catch (err) {
    console.error('[Reset Password] Error:', err)
    res.status(500).json({ error: 'db_error' })
  }
})

export default router
