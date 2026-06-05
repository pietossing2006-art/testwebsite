export const DEFAULT_PREFIX = '42/'
export const DEFAULT_TOTAL_ROOMS = 755
export const MAX_TOTAL_ROOMS = 10000

export class TrackerError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'TrackerError'
    this.statusCode = statusCode
  }
}

export function numberWidth(totalRooms) {
  return Math.max(1, String(Number(totalRooms)).length)
}

export function formatUnitLabel(unitNumber, prefix, totalRooms) {
  const n = Number(unitNumber)
  return `${prefix}${String(n).padStart(numberWidth(totalRooms), '0')}`
}

export function parseUnitNumber(rawValue, prefix) {
  let value = String(rawValue || '').trim()
  if (!value) throw new TrackerError('Room number is required')
  if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length)
  if (!/^\d+$/.test(value)) throw new TrackerError('Room number must be numeric')
  const number = Number(value)
  if (number <= 0) throw new TrackerError('Room number must be greater than zero')
  return number
}

export function normalizePrefix(prefix) {
  const value = String(prefix || '').trim()
  if (!value) throw new TrackerError('Prefix is required')
  return value
}

export function normalizeTotalRooms(totalRooms) {
  const value = Number(totalRooms)
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TOTAL_ROOMS) {
    throw new TrackerError(`Total rooms must be between 1 and ${MAX_TOTAL_ROOMS}`)
  }
  return value
}

export function normalizeUnitForSession(rawValue, session) {
  const unitNumber = parseUnitNumber(rawValue, session.prefix)
  if (unitNumber > Number(session.total_rooms)) {
    throw new TrackerError(`Room number must be between 1 and ${session.total_rooms}`)
  }
  return unitNumber
}

export function serializeSession(row) {
  if (!row) return null
  return {
    id: String(row.id),
    name: row.name,
    prefix: row.prefix,
    total_rooms: Number(row.total_rooms),
    is_active: Boolean(row.is_active),
    created_by_user_id: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    created_by_guest_name: row.created_by_guest_name || null,
    last_active_at: row.last_active_at || null,
    checked_count: Number(row.checked_count || 0),
    marked_count: Number(row.marked_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
