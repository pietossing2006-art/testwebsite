import { Router } from 'express'
import {
  TrackerError,
  formatUnitLabel,
  normalizeUnitForSession,
} from '../lib/trackerHelpers.js'
import {
  createRoom,
  deleteRoom,
  deleteUnitStatus,
  editCheckedUnit,
  getRoomById,
  getRoomStatePayload,
  getStatus,
  listRooms,
  renameRoom,
  setUnitStatus,
  touchRoom,
  toggleMark,
  verifyRoomPassword,
} from '../lib/trackerStore.js'
import { emitTrackerEvent } from '../lib/socket.js'
import {
  clearTrackerAuthCookie,
  hasTrackerRoomAccessRequest,
  setTrackerRoomAccessCookie,
} from '../lib/trackerAuth.js'
import { getCookieToken, getBearerToken } from '../lib/auth.js'
import { getSession, getUserById } from '../db.js'

const router = Router()

function okState(res, roomId, extra = {}, emit = false) {
  return getRoomStatePayload(roomId).then((payload) => {
    const data = { success: true, ...payload, ...extra }
    res.json(data)
    if (emit) emitTrackerEvent(roomId, data)
  })
}

function errorResponse(res, message, statusCode = 400) {
  res.status(statusCode).json({ success: false, message })
}

function parseRoomUnit(rawValue, room) {
  const unitNumber = normalizeUnitForSession(rawValue, room)
  return { session: room, unitNumber }
}

async function optionalTrackerUser(req) {
  const token = getBearerToken(req) || getCookieToken(req)
  if (!token) return null
  try {
    const session = await getSession(token)
    if (!session) return null
    const user = await getUserById(Number(session.user_id))
    if (!user || user.is_banned) return null
    return { id: Number(user.id), role: user.role || 'user', email: user.email }
  } catch {
    return null
  }
}

async function loadRoomForAccess(req, res, next) {
  try {
    const room = await getRoomById(req.params.roomId, { includePassword: true })
    if (!room) return errorResponse(res, 'Room not found', 404)
    if (!hasTrackerRoomAccessRequest(req, room)) return errorResponse(res, 'Room password is required', 401)
    req.trackerRoom = room
    next()
  } catch (err) {
    console.error('[tracker] room access failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
}

router.get('/rooms', async (_req, res) => {
  try {
    const rooms = await listRooms()
    res.json({ success: true, rooms })
  } catch (err) {
    console.error('[tracker] list rooms failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.post('/rooms', async (req, res) => {
  try {
    const user = await optionalTrackerUser(req)
    const room = await createRoom({
      name: req.body?.name,
      password: req.body?.password,
      prefix: req.body?.prefix,
      totalRooms: req.body?.total_rooms,
      userId: user?.id || null,
      guestName: user ? null : req.body?.guest_name,
    })
    setTrackerRoomAccessCookie(req, res, room)
    await touchRoom(room.id)
    const payload = await getRoomStatePayload(room.id)
    res.json({ success: true, ...payload })
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] create room failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.post('/rooms/:roomId/join', async (req, res) => {
  try {
    const room = await getRoomById(req.params.roomId, { includePassword: true })
    if (!room) return errorResponse(res, 'Room not found', 404)
    if (!(await verifyRoomPassword(room, req.body?.password))) return errorResponse(res, 'รหัสห้องไม่ถูกต้อง', 401)
    setTrackerRoomAccessCookie(req, res, room)
    await touchRoom(room.id)
    const payload = await getRoomStatePayload(room.id)
    res.json({ success: true, ...payload })
  } catch (err) {
    console.error('[tracker] join room failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.get('/rooms/:roomId/state', loadRoomForAccess, async (req, res) => {
  try {
    await okState(res, req.trackerRoom.id)
  } catch (err) {
    console.error('[tracker] get room state failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.patch('/rooms/:roomId', loadRoomForAccess, async (req, res) => {
  try {
    await renameRoom(req.trackerRoom.id, req.body?.name)
    await touchRoom(req.trackerRoom.id)
    await okState(res, req.trackerRoom.id, {}, true)
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] rename room failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.delete('/rooms/:roomId', loadRoomForAccess, async (req, res) => {
  try {
    const roomId = req.trackerRoom.id
    await deleteRoom(roomId)
    emitTrackerEvent(roomId, { success: true, deleted: true, room_id: roomId })
    res.json({ success: true, deleted: true })
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] delete room failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.post('/rooms/:roomId/units', loadRoomForAccess, async (req, res) => {
  try {
    const { session, unitNumber } = parseRoomUnit(req.body?.unit, req.trackerRoom)
    const current = await getStatus(session.id, unitNumber)
    const unitLabel = formatUnitLabel(unitNumber, session.prefix, session.total_rooms)
    if (current?.status === 'checked') {
      return errorResponse(res, `Room '${unitLabel}' is already checked`)
    }
    if (current?.status === 'marked') {
      return errorResponse(res, `Room '${unitLabel}' is marked as unavailable. Unmark it first`)
    }
    await setUnitStatus(session.id, unitNumber, 'checked')
    await touchRoom(session.id)
    await okState(res, session.id, { unit: unitLabel }, true)
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] add room unit failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.delete('/rooms/:roomId/units/:unit', loadRoomForAccess, async (req, res) => {
  try {
    const { session, unitNumber } = parseRoomUnit(req.params.unit, req.trackerRoom)
    const removed = await deleteUnitStatus(session.id, unitNumber, 'checked')
    if (!removed.length) {
      const unitLabel = formatUnitLabel(unitNumber, session.prefix, session.total_rooms)
      return errorResponse(res, `Room '${unitLabel}' is not checked`, 404)
    }
    await touchRoom(session.id)
    await okState(res, session.id, {}, true)
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] delete room unit failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.put('/rooms/:roomId/units', loadRoomForAccess, async (req, res) => {
  try {
    const { session, unitNumber: oldNumber } = parseRoomUnit(req.body?.old_unit, req.trackerRoom)
    const newNumber = normalizeUnitForSession(req.body?.new_unit, session)
    await editCheckedUnit(session.id, oldNumber, newNumber)
    const unitLabel = formatUnitLabel(newNumber, session.prefix, session.total_rooms)
    await touchRoom(session.id)
    await okState(res, session.id, { unit: unitLabel }, true)
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] edit room unit failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.post('/rooms/:roomId/marked', loadRoomForAccess, async (req, res) => {
  try {
    const { session, unitNumber } = parseRoomUnit(req.body?.unit, req.trackerRoom)
    await setUnitStatus(session.id, unitNumber, 'marked')
    await touchRoom(session.id)
    await okState(res, session.id, {}, true)
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] mark room unit failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.delete('/rooms/:roomId/marked/:unit', loadRoomForAccess, async (req, res) => {
  try {
    const { session, unitNumber } = parseRoomUnit(req.params.unit, req.trackerRoom)
    await deleteUnitStatus(session.id, unitNumber, 'marked')
    await touchRoom(session.id)
    await okState(res, session.id, {}, true)
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] unmark room unit failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.post('/rooms/:roomId/marked/:unit/toggle', loadRoomForAccess, async (req, res) => {
  try {
    const { session, unitNumber } = parseRoomUnit(req.params.unit, req.trackerRoom)
    const action = await toggleMark(session.id, unitNumber)
    await touchRoom(session.id)
    await okState(res, session.id, { action }, true)
  } catch (err) {
    if (err instanceof TrackerError) return errorResponse(res, err.message, err.statusCode)
    console.error('[tracker] toggle room mark failed', err)
    errorResponse(res, 'Internal server error', 500)
  }
})

router.post('/logout', (_req, res) => {
  clearTrackerAuthCookie(res)
  return res.json({ success: true, authenticated: false })
})

export default router
