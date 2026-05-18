import { io } from 'socket.io-client'
import { resolveApiUrl } from './api.js'

let _socket = null

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
