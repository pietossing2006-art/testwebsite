import { emitSupportEvent, emitFulfillmentEvent, emitDashboardEvent, emitNotificationEvent } from './socket.js'

export function publishSupportEvent(event) {
  const payload = event && typeof event === 'object' ? event : {}
  emitSupportEvent(payload)
}

export function publishFulfillmentEvent(payload) {
  emitFulfillmentEvent(payload && typeof payload === 'object' ? payload : {})
}

export function publishDashboardEvent(payload) {
  emitDashboardEvent(payload && typeof payload === 'object' ? payload : {})
}

export function publishNotificationEvent(userId, payload) {
  emitNotificationEvent(userId, payload && typeof payload === 'object' ? payload : {})
}

// Legacy stubs — kept so existing route imports don't break
export function subscribeSupportStream() { return () => {} }
export function addFulfillmentClient() {}
export function removeFulfillmentClient() {}
