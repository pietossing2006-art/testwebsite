import { Router } from 'express'
import crypto from 'node:crypto'
import {
  createSession,
  getUserByLogin,
  getUserById,
  getUserByUsername,
  registerUser,
  deleteSession,
  checkPassword,
  findOrCreateUserFromDiscord,
} from '../db.js'
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
} from '../lib/cookies.js'
import { getBearerToken, getCookieToken, requireAuth, rateLimitMiddleware } from '../lib/auth.js'

const router = Router()

const VALID_USERNAME_RE = /^[a-zA-Z0-9._-]+$/
const DISCORD_OAUTH_STATE_COOKIE = 'discord_oauth_state'
const DISCORD_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const pendingDiscordOauthStates = new Map()

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
  return firstClientOrigin()
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

function redirectToClient(res, path = '/', originOverride = '') {
  const base = originOverride || envValue('DISCORD_LOGIN_SUCCESS_REDIRECT') || firstClientOrigin()
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = String(path || '/').startsWith('/') ? String(path || '/') : '/'
  return res.redirect(`${cleanBase}${cleanPath}`)
}

function isLocalDiscordCallbackRequest(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase()
  return /(^|:)(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(firstClientOrigin())
}

function normalizeReturnTo(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/api/')) return '/'
  return value.slice(0, 300)
}

function encodeDiscordError(code, detail = '') {
  const safeCode = String(code || 'discord_login_failed').trim() || 'discord_login_failed'
  const safeDetail = String(detail || '').trim().slice(0, 120)
  return safeDetail ? `${safeCode}:${encodeURIComponent(safeDetail)}` : safeCode
}

function oauthStateSecret() {
  return envValue('DISCORD_OAUTH_STATE_SECRET') || envValue('DISCORD_LINK_CODE_PEPPER') || envValue('DISCORD_CLIENT_SECRET') || 'discord-oauth-state'
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function signOauthState(payload) {
  return crypto.createHmac('sha256', oauthStateSecret()).update(payload).digest('base64url')
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
  const allowLocalStateBypass = !signedState && Boolean(code) && isLocalDiscordCallbackRequest(req)
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
  const clientOrigin = normalizeOriginValue(signedState?.client_origin) || normalizeOriginValue(cookieState?.client_origin) || firstClientOrigin()
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

    const token = await createSession(user.id)
    const secure = isSecureCookie(req)
    setAuthCookie(res, token, { remember: Boolean(signedState.remember ?? cookieState?.remember), secure })
    return redirectToClient(res, normalizeReturnTo(signedState.return_to || cookieState?.return_to), clientOrigin)
  } catch (e) {
    const msg = String(e?.message || '')
    const code = String(e?.code || '').trim()
    console.warn('[Discord OAuth] callback failed', { message: msg, code, stack: String(e?.stack || '').slice(0, 1000) })
    if (msg === 'banned') return redirectToClient(res, `/login?discord_error=${encodeDiscordError('banned')}`, clientOrigin)
    if (msg === 'user_already_linked') return redirectToClient(res, `/login?discord_error=${encodeDiscordError('user_already_linked')}`, clientOrigin)
    if (code === '23505') return redirectToClient(res, `/login?discord_error=${encodeDiscordError('db_unique_violation')}`, clientOrigin)
    return redirectToClient(res, `/login?discord_error=${encodeDiscordError('discord_login_failed', msg || code || 'unknown')}`, clientOrigin)
  }
})

router.post('/api/auth/register', rateLimitMiddleware({ windowMs: 60_000, max: 5, keyPrefix: 'register' }), async (req, res) => {
  const { email, password, username, remember } = req.body ?? {}
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'invalid_email' })
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'weak_password' })
  if (!/^[\x20-\x7E]+$/.test(password)) return res.status(400).json({ error: 'invalid_password_charset' })
  if (typeof username !== 'string' || username.trim().length < 6) return res.status(400).json({ error: 'invalid_username' })
  if (!VALID_USERNAME_RE.test(username.trim())) return res.status(400).json({ error: 'invalid_username_charset' })

  try {
    const user = await registerUser(email.trim().toLowerCase(), password, username)
    const token = await createSession(user.id)
    const u = await getUserById(user.id)
    const secure = isSecureCookie(req)
    const consent = chooseConsent(req)
    if (consent) setCookieConsentCookie(res, consent, { secure })
    setAuthCookie(res, token, { remember: Boolean(remember), secure })

    res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: u?.username ?? null,
        role: typeof u?.role === 'string' && u.role.trim() ? u.role.trim().toLowerCase() : 'user',
        display_name: u?.display_name ?? null,
        avatar_url: u?.avatar_url ?? null,
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

router.post('/api/auth/login', rateLimitMiddleware({ windowMs: 60_000, max: 10, keyPrefix: 'login' }), async (req, res) => {
  const { login, email, password, remember } = req.body ?? {}
  const identifier = typeof login === 'string' ? login : email
  if (typeof identifier !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  try {
    const user = await getUserByLogin(identifier)
    if (!user) return res.status(401).json({ error: 'invalid_credentials' })
    if (!checkPassword(password, user.password_hash)) return res.status(401).json({ error: 'invalid_credentials' })
    if (Boolean(user?.is_banned)) return res.status(403).json({ error: 'banned' })
    const token = await createSession(user.id)
    const secure = isSecureCookie(req)
    const consent = chooseConsent(req)
    if (consent) setCookieConsentCookie(res, consent, { secure })
    setAuthCookie(res, token, { remember: Boolean(remember), secure })

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username ?? null,
        role: typeof user?.role === 'string' && user.role.trim() ? user.role.trim().toLowerCase() : 'user',
        display_name: user.display_name ?? null,
        avatar_url: user.avatar_url ?? null,
      },
      token,
    })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/auth/logout', async (req, res) => {
  const bearer = getBearerToken(req)
  const cookieToken = getCookieToken(req)
  const token = bearer || cookieToken
  try {
    if (token) await deleteSession(token)
  } catch {
    // ignore
  }
  clearAuthCookie(res, { secure: isSecureCookie(req) })
  res.json({ ok: true })
})

router.get('/api/cookie-consent', (req, res) => {
  const consent = getConsentFromCookie(req)
  res.json({ ok: true, consent })
})

router.post('/api/cookie-consent', (req, res) => {
  const secure = isSecureCookie(req)
  const consent = normalizeConsentInput(req.body?.consent)
  setCookieConsentCookie(res, consent, { secure })
  res.json({ ok: true, consent })
})

export default router
