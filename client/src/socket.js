import { io } from 'socket.io-client'
import { resolveApiUrl } from './api.js'

let _socket = null
let _trackerSocket = null
let _trackerRoomId = null

export function getSocket() {
  if (!_socket) {
    const serverUrl = resolveApiUrl('/').replace(/\/$/, '')
    _socket = io(serverUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
  }
  return _socket
}

export function connectSocket() {
  const s = getSocket()
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  if (_socket && _socket.connected) {
    _socket.disconnect()
  }
}

export function getTrackerSocket(roomId) {
  const nextRoomId = String(roomId || '').trim()
  if (_trackerSocket && _trackerRoomId !== nextRoomId) {
    _trackerSocket.disconnect()
    _trackerSocket = null
  }
  if (!_trackerSocket) {
    const serverUrl = resolveApiUrl('/').replace(/\/$/, '')
    _trackerRoomId = nextRoomId
    _trackerSocket = io(serverUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: { channel: 'tracker', roomId: nextRoomId },
      autoConnect: false,
    })
  }
  return _trackerSocket
}

export function connectTrackerSocket(roomId) {
  const s = getTrackerSocket(roomId)
  if (!s.connected) s.connect()
  return s
}

export function disconnectTrackerSocket() {
  if (_trackerSocket && _trackerSocket.connected) {
    _trackerSocket.disconnect()
  }
  _trackerSocket = null
  _trackerRoomId = null
}
