const COOKIE_NAME = 'auth_token'
const COOKIE_CONSENT_NAME = 'cookie_consent'
const COOKIE_MAX_AGE_REMEMBER_MS = 1000 * 60 * 60 * 24 * 30
const COOKIE_MAX_AGE_SESSION_MS = 1000 * 60 * 60 * 24
const COOKIE_CONSENT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export { COOKIE_NAME, COOKIE_CONSENT_NAME }
export { cookieDomain, cookieSameSite }

export function isSecureCookie(req) {
  const xfProto = req.headers['x-forwarded-proto']
  if (typeof xfProto === 'string' && xfProto.toLowerCase().includes('https')) return true
  return Boolean(req.secure)
}

function cookieDomain(req) {
  const explicit = String(process.env.COOKIE_DOMAIN || '').trim()
  if (explicit) return explicit
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').toLowerCase()
  if (host.endsWith('vxpers.com')) return '.vxpers.com'
  return undefined
}

function cookieSameSite(req, secure) {
  const explicit = String(process.env.COOKIE_SAME_SITE || process.env.COOKIE_SAMESITE || '').trim().toLowerCase()
  if (explicit === 'strict' || explicit === 'lax') return explicit
  if (explicit === 'none') return secure ? 'none' : 'lax'
  if (
    secure &&
    cookieDomain(req) &&
    TRUE_VALUES.has(String(process.env.COOKIE_SAMESITE_NONE || '').trim().toLowerCase())
  ) {
    return 'none'
  }
  return 'lax'
}

export function setAuthCookie(res, token, { remember = false, secure = false } = {}) {
  const maxAge = remember ? COOKIE_MAX_AGE_REMEMBER_MS : COOKIE_MAX_AGE_SESSION_MS
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: cookieSameSite(res.req, secure),
    secure: Boolean(secure),
    domain: cookieDomain(res.req),
    maxAge,
    path: '/',
  })
}

export function clearAuthCookie(res, { secure = false } = {}) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: cookieSameSite(res.req, secure),
    secure: Boolean(secure),
    domain: cookieDomain(res.req),
    path: '/',
  })
}

export function normalizeConsentInput(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  return {
    essential: true,
    analytics: Boolean(data.analytics),
    marketing: Boolean(data.marketing),
    personalization: Boolean(data.personalization),
  }
}

function parseConsentPayload(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return normalizeConsentInput(raw)
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return normalizeConsentInput(parsed)
  } catch {
    return null
  }
}

export function getConsentFromCookie(req) {
  const cookies = req?.cookies
  if (!cookies || typeof cookies !== 'object') return null
  return parseConsentPayload(cookies[COOKIE_CONSENT_NAME])
}

function getConsentFromHeader(req) {
  const raw = req?.headers?.['x-cookie-consent']
  if (Array.isArray(raw)) return parseConsentPayload(raw[0])
  return parseConsentPayload(raw)
}

export function setCookieConsentCookie(res, consent, { secure = false } = {}) {
  const payload = JSON.stringify(normalizeConsentInput(consent))
  res.cookie(COOKIE_CONSENT_NAME, payload, {
    httpOnly: false,
    sameSite: cookieSameSite(res.req, secure),
    secure: Boolean(secure),
    domain: cookieDomain(res.req),
    maxAge: COOKIE_CONSENT_MAX_AGE_MS,
    path: '/',
  })
}

export function chooseConsent(req) {
  return getConsentFromHeader(req) || getConsentFromCookie(req) || null
}
