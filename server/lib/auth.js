import { getSession, getUserById, deleteSession } from '../db.js'
import { COOKIE_NAME, isSecureCookie, clearAuthCookie } from './cookies.js'

export function getBearerToken(req) {
  const h = req.headers.authorization
  if (!h || typeof h !== 'string') return null
  const [type, token] = h.split(' ')
  if (type !== 'Bearer') return null
  return token || null
}

export function getCookieToken(req) {
  const cookies = req.cookies
  if (!cookies || typeof cookies !== 'object') return null
  const v = cookies[COOKIE_NAME]
  return typeof v === 'string' && v ? v : null
}

export async function requireAuth(req, res, next) {
  const token = getBearerToken(req) || getCookieToken(req)
  if (!token) return res.status(401).json({ error: 'unauthorized' })

  try {
    const session = await getSession(token)
    if (!session) return res.status(401).json({ error: 'unauthorized' })
    const u = await getUserById(Number(session.user_id))
    if (!u) {
      await deleteSession(token)
      clearAuthCookie(res, { secure: isSecureCookie(req) })
      return res.status(401).json({ error: 'unauthorized' })
    }
    if (Boolean(u?.is_banned)) {
      await deleteSession(token)
      clearAuthCookie(res, { secure: isSecureCookie(req) })
      return res.status(403).json({ error: 'banned' })
    }
    req.user = {
      id: Number(session.user_id),
      email: session.email,
      token: session.token,
      role: typeof u?.role === 'string' && u.role.trim() ? u.role.trim().toLowerCase() : 'user',
    }
    next()
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
}

export function requireRole(role) {
  const expected = typeof role === 'string' ? role.trim().toLowerCase() : ''
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' })
    const r = typeof req.user.role === 'string' ? req.user.role.trim().toLowerCase() : 'user'
    if (!expected || r !== expected) return res.status(403).json({ error: 'forbidden' })
    next()
  }
}

export function requireAnyRole(roles) {
  const list = Array.isArray(roles) ? roles : [roles]
  const allowed = new Set(list.map((x) => (typeof x === 'string' ? x.trim().toLowerCase() : '')).filter(Boolean))
  return function requireAnyRoleMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' })
    const r = typeof req.user.role === 'string' ? req.user.role.trim().toLowerCase() : 'user'
    if (!allowed.has(r)) return res.status(403).json({ error: 'forbidden' })
    next()
  }
}

const _rateLimitBuckets = new Map()
export function rateLimitMiddleware({ windowMs = 60_000, max = 10, keyPrefix = '' } = {}) {
  return function rateLimit(req, res, next) {
    const ip = String(req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown')
    const key = `${keyPrefix}:${ip}`
    const now = Date.now()
    let bucket = _rateLimitBuckets.get(key)
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      _rateLimitBuckets.set(key, bucket)
    }
    bucket.count += 1
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      return res.status(429).json({ error: 'too_many_requests' })
    }
    next()
  }
}

export const requireAdmin = requireAnyRole(['admin', 'owner'])
export const requireOwner = requireRole('owner')
export const requireFinance = requireAnyRole(['finance', 'admin', 'owner'])
export const requireBooster = requireAnyRole(['booster', 'owner'])
export const requireSupportStaff = requireAnyRole(['support', 'admin', 'owner'])
export const requireStaff = requireAnyRole(['booster', 'support', 'admin', 'owner'])

export const ADMIN_ROLE_MODULE_ACCESS = {
  owner: ['dashboard', 'users', 'support', 'catalog', 'stock', 'fulfillment', 'orders', 'timesheet', 'automation', 'bundles', 'promotions', 'announcements', 'messages', 'logs', 'settings', 'owner'],
  admin: ['dashboard', 'users', 'support', 'catalog', 'stock', 'fulfillment', 'orders', 'timesheet', 'automation', 'bundles', 'promotions', 'announcements', 'messages', 'settings'],
  finance: ['dashboard', 'users', 'orders', 'bundles', 'promotions'],
  support: ['dashboard', 'support', 'timesheet', 'orders'],
  booster: ['dashboard', 'fulfillment', 'timesheet'],
}

export const ADMIN_ROLE_ACTION_ACCESS = {
  'users.view': ['finance', 'admin', 'owner'],
  'users.edit': ['admin', 'owner'],
  'users.adjust_points': ['finance', 'admin', 'owner'],
  'support.manage': ['support', 'admin', 'owner'],
  'fulfillment.manage': ['booster', 'admin', 'owner'],
  'catalog.manage': ['admin', 'owner'],
  'stock.manage': ['admin', 'owner'],
  'automation.manage': ['admin', 'owner'],
  'bundles.manage': ['admin', 'owner'],
  'promotions.manage': ['admin', 'owner'],
  'logs.view': ['owner'],
  'settings.manage': ['admin', 'owner'],
  'owner.panel': ['owner'],
}
