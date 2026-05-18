import { Server } from 'socket.io'
import { getSession, getUserById } from '../db.js'
import { COOKIE_NAME } from './cookies.js'

let _io = null

export function getIO() {
  return _io
}

// Rooms:
//   user:{userId}      — individual user (customer)
//   support:staff      — all support/admin/owner staff
//   fulfillment:staff  — all admin/owner/booster staff
//   dashboard:staff    — all admin/owner staff

export function initSocketIO(httpServer, corsOptions) {
  _io = new Server(httpServer, {
    cors: corsOptions,
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  })

  _io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie || ''
      const token = parseCookieToken(cookie)
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers.authorization || ''
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
      const finalToken = token || bearerToken

      if (!finalToken) return next(new Error('unauthorized'))

      const session = await getSession(finalToken)
      if (!session) return next(new Error('unauthorized'))

      const user = await getUserById(Number(session.user_id))
      if (!user || user.is_banned) return next(new Error('unauthorized'))

      socket.data.userId = Number(session.user_id)
      socket.data.role = typeof user.role === 'string' ? user.role.trim().toLowerCase() : 'user'
      socket.data.email = user.email
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  _io.on('connection', (socket) => {
    const { userId, role } = socket.data

    // Every user joins their personal room
    socket.join(`user:${userId}`)

    // Staff rooms
    const isSupport = ['support', 'admin', 'owner'].includes(role)
    const isFulfillment = ['booster', 'admin', 'owner'].includes(role)
    const isDashboard = ['admin', 'owner', 'finance'].includes(role)

    if (isSupport) socket.join('support:staff')
    if (isFulfillment) socket.join('fulfillment:staff')
    if (isDashboard) socket.join('dashboard:staff')
  })

  return _io
}

function parseCookieToken(cookieHeader) {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [k, ...vs] = part.trim().split('=')
    if (k.trim() === COOKIE_NAME) {
      return decodeURIComponent(vs.join('=').trim()) || null
    }
  }
  return null
}

// ── Emit helpers ──

export function emitSupportEvent(payload) {
  if (!_io) return
  const { user_id, ...rest } = payload
  // Send to the specific user (customer) if applicable
  if (user_id) {
    _io.to(`user:${user_id}`).emit('ticket_update', rest)
  }
  // Always send to all support staff
  _io.to('support:staff').emit('ticket_update', { ...rest, user_id: user_id ?? null })
}

export function emitFulfillmentEvent(payload) {
  if (!_io) return
  _io.to('fulfillment:staff').emit('fulfillment_update', payload)
}

export function emitDashboardEvent(payload) {
  if (!_io) return
  _io.to('dashboard:staff').emit('dashboard_update', payload)
}

export function emitNotificationEvent(userId, payload) {
  if (!_io || !userId) return
  _io.to(`user:${userId}`).emit('notification_update', payload || {})
}
