import helmet from 'helmet'
import { COOKIE_NAME } from './cookies.js'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function normalizeOriginValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).origin.toLowerCase()
  } catch {
    return raw.replace(/\/+$/, '').toLowerCase()
  }
}

function shouldAllowLocalDevOrigins() {
  return TRUE_VALUES.has(
    String(process.env.ALLOW_LOCAL_DEV_ORIGINS ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true'))
      .trim()
      .toLowerCase(),
  )
}

function isLocalDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(origin || ''))
}

function firstHeaderValue(value) {
  const raw = Array.isArray(value) ? value[0] : value
  return String(raw || '').split(',')[0].trim()
}

function requestOrigin(req) {
  const proto = firstHeaderValue(req?.headers?.['x-forwarded-proto']) || req?.protocol || 'http'
  const host = firstHeaderValue(req?.headers?.['x-forwarded-host']) || req?.headers?.host || ''
  if (!host) return ''
  return normalizeOriginValue(`${proto}://${host}`)
}

function requestSourceOrigin(req) {
  return normalizeOriginValue(req?.headers?.origin) || normalizeOriginValue(req?.headers?.referer)
}

function hasBearerAuth(req) {
  const value = Array.isArray(req?.headers?.authorization) ? req.headers.authorization[0] : req?.headers?.authorization
  return /^bearer\s+\S+/i.test(String(value || ''))
}

function hasAuthCookie(req) {
  if (typeof req?.cookies?.[COOKIE_NAME] === 'string' && req.cookies[COOKIE_NAME]) return true
  const raw = Array.isArray(req?.headers?.cookie) ? req.headers.cookie.join(';') : req?.headers?.cookie
  return String(raw || '').split(';').some((part) => part.trim().startsWith(`${COOKIE_NAME}=`))
}

export function csrfOriginGuard({ clientOrigins = [], allowLocalDevOrigins = shouldAllowLocalDevOrigins() } = {}) {
  const allowedOrigins = new Set(clientOrigins.map(normalizeOriginValue).filter(Boolean))

  return function csrfOriginMiddleware(req, res, next) {
    if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return next()
    if (!String(req.path || '').startsWith('/api/')) return next()
    if (hasBearerAuth(req)) return next()
    if (!hasAuthCookie(req)) return next()

    const sourceOrigin = requestSourceOrigin(req)
    if (!sourceOrigin) return res.status(403).json({ error: 'csrf_origin_required' })

    const ownOrigin = requestOrigin(req)
    if (sourceOrigin === ownOrigin || allowedOrigins.has(sourceOrigin)) return next()
    if (allowLocalDevOrigins && isLocalDevOrigin(sourceOrigin)) return next()

    return res.status(403).json({ error: 'csrf_origin_blocked' })
  }
}

export function securityHeaders({ clientOrigins = [], allowLocalDevOrigins = shouldAllowLocalDevOrigins() } = {}) {
  const connectSrc = ["'self'"]
  for (const origin of clientOrigins.map(normalizeOriginValue).filter(Boolean)) {
    connectSrc.push(origin)
    if (origin.startsWith('https://')) connectSrc.push(origin.replace(/^https:\/\//, 'wss://'))
    if (origin.startsWith('http://')) connectSrc.push(origin.replace(/^http:\/\//, 'ws://'))
  }
  if (allowLocalDevOrigins) {
    connectSrc.push('http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*')
  }

  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc,
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'sameorigin' },
    hsts: {
      maxAge: 15_552_000,
      includeSubDomains: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
}

export function globalErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)
  if (process.env.NODE_ENV !== 'test') {
    console.error('unexpected_server_error', {
      message: String(err?.message ?? ''),
      code: err?.code ?? null,
      path: req?.path ?? null,
    })
  }
  return res.status(500).json({ error: 'internal_server_error' })
}
