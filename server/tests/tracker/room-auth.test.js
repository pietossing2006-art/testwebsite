import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createTrackerRoomAccessValue,
  hasTrackerRoomAccessFromCookieHeader,
  parseTrackerRoomAccessValue,
} from '../../lib/trackerAuth.js'

const NOW = Date.parse('2026-06-01T00:00:00.000Z')
const ROOM_A = { id: '11111111-1111-4111-8111-111111111111', room_password_hash: '$argon2id$room-a' }
const ROOM_B = { id: '22222222-2222-4222-8222-222222222222', room_password_hash: '$argon2id$room-b' }

test('tracker room access cookie stores room-specific access for 30 days', () => {
  const value = createTrackerRoomAccessValue({ room: ROOM_A, now: NOW })
  const parsed = parseTrackerRoomAccessValue(value)

  assert.equal(parsed.exp, NOW + 1000 * 60 * 60 * 24 * 30)
  assert.ok(parsed.rooms[ROOM_A.id])
  assert.equal(
    hasTrackerRoomAccessFromCookieHeader(`tracker_room_auth=${encodeURIComponent(value)}`, ROOM_A, { now: NOW }),
    true,
  )
})

test('tracker room access can include more than one room without losing the first', () => {
  const first = createTrackerRoomAccessValue({ room: ROOM_A, now: NOW })
  const second = createTrackerRoomAccessValue({ existingValue: first, room: ROOM_B, now: NOW + 1000 })
  const parsed = parseTrackerRoomAccessValue(second)

  assert.ok(parsed.rooms[ROOM_A.id])
  assert.ok(parsed.rooms[ROOM_B.id])
})

test('tracker room access rejects changed password hashes and expired cookies', () => {
  const value = createTrackerRoomAccessValue({ room: ROOM_A, now: NOW })
  const changedPasswordRoom = { ...ROOM_A, room_password_hash: '$argon2id$changed' }

  assert.equal(
    hasTrackerRoomAccessFromCookieHeader(`tracker_room_auth=${encodeURIComponent(value)}`, changedPasswordRoom, { now: NOW }),
    false,
  )
  assert.equal(
    hasTrackerRoomAccessFromCookieHeader(`tracker_room_auth=${encodeURIComponent(value)}`, ROOM_A, { now: NOW + 1000 * 60 * 60 * 24 * 31 }),
    false,
  )
})
