import crypto from 'node:crypto'
import { cookieDomain, cookieSameSite, isSecureCookie } from './cookies.js'

export const TRACKER_AUTH_COOKIE = 'tracker_room_auth'

export const TRACKER_AUTH_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30

function trackerPassword() {
  return String(process.env.TRACKER_PASSWORD || 'noble242')
}

function trackerSecret() {
  return String(process.env.TRACKER_AUTH_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || 'tracker-local-secret')
}

function hmac(value, encoding = 'base64url') {
  return crypto.createHmac('sha256', trackerSecret()).update(String(value)).digest(encoding)
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function emptyAccess() {
  return { v: 1, exp: 0, rooms: {} }
}

function signCookiePayload(payload) {
  return hmac(`tracker-cookie:${payload}`)
}

function roomAccessSignature(room) {
  return hmac(`tracker-room:${room?.id}:${room?.room_password_hash || ''}`)
}

function trackerCookieDomain(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(':')[0].toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return undefined
  return cookieDomain(req)
}

export function isTrackerPassword(rawPassword) {
  return safeEqual(String(rawPassword || ''), trackerPassword())
}

export function isTrackerAuthToken(rawToken) {
  return safeEqual(String(rawToken || ''), hmac(`tracker:${trackerPassword()}`, 'hex'))
}

export function getTrackerAuthTokenFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null
  for (const part of String(cookieHeader).split(';')) {
    const [key, ...values] = part.trim().split('=')
    if (key === TRACKER_AUTH_COOKIE) return decodeURIComponent(values.join('=').trim()) || null
  }
  return null
}

export function parseTrackerRoomAccessValue(rawValue) {
  const value = String(rawValue || '')
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return emptyAccess()
  if (!safeEqual(signature, signCookiePayload(payload))) return emptyAccess()
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const rooms = parsed?.rooms && typeof parsed.rooms === 'object' ? parsed.rooms : {}
    return {
      v: 1,
      exp: Number(parsed?.exp || 0),
      rooms,
    }
  } catch {
    return emptyAccess()
  }
}

export function createTrackerRoomAccessValue({ existingValue = '', room, now = Date.now() } = {}) {
  const current = parseTrackerRoomAccessValue(existingValue)
  const exp = Number(now) + TRACKER_AUTH_MAX_AGE_MS
  const rooms = { ...(current.rooms || {}) }
  if (room?.id) rooms[String(room.id)] = roomAccessSignature(room)
  const payload = Buffer.from(JSON.stringify({ v: 1, exp, rooms }), 'utf8').toString('base64url')
  return `${payload}.${signCookiePayload(payload)}`
}

export function getTrackerRoomAccessValueFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null
  for (const part of String(cookieHeader).split(';')) {
    const [key, ...values] = part.trim().split('=')
    if (key === TRACKER_AUTH_COOKIE) return decodeURIComponent(values.join('=').trim()) || null
  }
  return null
}

export function hasTrackerRoomAccessValue(rawValue, room, { now = Date.now() } = {}) {
  const parsed = parseTrackerRoomAccessValue(rawValue)
  if (!room?.id || Number(parsed.exp || 0) <= Number(now)) return false
  const actual = parsed.rooms?.[String(room.id)]
  if (!actual) return false
  return safeEqual(actual, roomAccessSignature(room))
}

export function hasTrackerRoomAccessFromCookieHeader(cookieHeader, room, options = {}) {
  return hasTrackerRoomAccessValue(getTrackerRoomAccessValueFromCookieHeader(cookieHeader), room, options)
}

export function hasTrackerRoomAccessRequest(req, room, options = {}) {
  return hasTrackerRoomAccessValue(req?.cookies?.[TRACKER_AUTH_COOKIE], room, options)
}

export function isTrackerRequestAuthenticated(req) {
  return isTrackerAuthToken(req?.cookies?.[TRACKER_AUTH_COOKIE])
}

export function isTrackerSocketAuthenticated(socket) {
  return isTrackerAuthToken(getTrackerAuthTokenFromCookieHeader(socket?.handshake?.headers?.cookie || ''))
}

export function setTrackerAuthCookie(res) {
  const secure = isSecureCookie(res.req)
  res.cookie(TRACKER_AUTH_COOKIE, hmac(`tracker:${trackerPassword()}`, 'hex'), {
    httpOnly: true,
    sameSite: cookieSameSite(res.req, secure),
    secure,
    domain: trackerCookieDomain(res.req),
    maxAge: TRACKER_AUTH_MAX_AGE_MS,
    path: '/',
  })
}

export function setTrackerRoomAccessCookie(req, res, room) {
  const secure = isSecureCookie(req)
  const existingValue = req?.cookies?.[TRACKER_AUTH_COOKIE] || ''
  res.cookie(TRACKER_AUTH_COOKIE, createTrackerRoomAccessValue({ existingValue, room }), {
    httpOnly: true,
    sameSite: cookieSameSite(req, secure),
    secure,
    domain: trackerCookieDomain(req),
    maxAge: TRACKER_AUTH_MAX_AGE_MS,
    path: '/',
  })
}

export function clearTrackerAuthCookie(res) {
  const secure = isSecureCookie(res.req)
  res.clearCookie(TRACKER_AUTH_COOKIE, {
    httpOnly: true,
    sameSite: cookieSameSite(res.req, secure),
    secure,
    domain: trackerCookieDomain(res.req),
    path: '/',
  })
}
