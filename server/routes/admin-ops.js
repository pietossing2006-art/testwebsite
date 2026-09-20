import { Router } from 'express'
import {
  adjustUserPoints,
  assignFarmRequestToBooster,
  adminListFarmRequests,
  adminGetFarmRequestDetail,
  adminFulfillFarmRequest,
  adminCancelFarmRequest,
  adminStartFarmRequest,
  adminAddFarmRequestNote,
  adminListBoosterFarmRequests,
  adminListAvailableBoosterFarmRequests,
  boosterFulfillFarmRequest,
  boosterClaimFarmRequest,
  boosterListAvailableFarmRequests,
  boosterListMyFarmRequests,
  boosterCancelFarmRequest,
  boosterReleaseFarmRequest,
  boosterStartFarmRequest,
  adminListSupportTickets,
  adminListSupportAgents,
  adminGetSupportTicket,
  adminReplySupportTicket,
  adminAssignSupportTicket,
  adminSetSupportTicketStatus,
  adminListUserOrders,
  adminSearchOrderByRef,
  adminListUsersAdvanced,
  adminGetUserManagementDetail,
  adminRemoveUserAccount,
  adminRevokeUserSessions,
  adminUpdateUserAccount,
  adminSetUserVipTier,
  creditPointsForTopup,
  adminCancelTopup,
  listTopups,
  listTopupLogs,
  logAuditEvent,
  setTopupPointsForApproval,
  setUserPassword,
  deleteAllUserSessionsExcept,
  setUserBanned,
  setUserRole,
  staffClockIn,
  staffClockOut,
  getStaffClockStatus,
  listStaffClockSessions,
  adminListAllClockSessions,
  listStaffNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  savePushSubscription,
  removePushSubscription,
  adminListOrders,
  adminGetOrderDetail,
} from '../db.js'
import {
  requireAuth,
  requireAdmin,
  requireOwner,
  requireFinance,
  requireBooster,
  requireSupportStaff,
  requireStaff,
} from '../lib/auth.js'
import { publishSupportEvent, publishFulfillmentEvent } from '../lib/events.js'
import { AdminPasswordBodySchema } from '../lib/requestSchemas.js'
import { validateBody } from '../lib/validation.js'

const router = Router()

// ── Booster Farm Requests ──

router.get('/api/booster/farm-requests', requireAuth, requireBooster, async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  try {
    const data = await boosterListMyFarmRequests({ boosterId: req.user.id, limit, offset, status })
    res.json({ ok: true, items: data.items, total: data.total })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/booster/farm-requests/available', requireAuth, requireBooster, async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  try {
    const data = await boosterListAvailableFarmRequests({ limit, offset })
    res.json({ ok: true, items: data.items, total: data.total })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/booster/farm-requests/:id/claim', requireAuth, requireBooster, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await boosterClaimFarmRequest({ requestId: id, boosterId: req.user.id })
    publishFulfillmentEvent({ kind: 'booster_claimed', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/booster/farm-requests/:id/release', requireAuth, requireBooster, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await boosterReleaseFarmRequest({ requestId: id, boosterId: req.user.id })
    publishFulfillmentEvent({ kind: 'booster_released', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'not_assigned') return res.status(403).json({ error: 'not_assigned' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/booster/farm-requests/:id/cancel', requireAuth, requireBooster, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { note } = req.body ?? {}
  try {
    await boosterCancelFarmRequest({ requestId: id, boosterId: req.user.id, note })
    publishFulfillmentEvent({ kind: 'booster_cancelled', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'not_assigned') return res.status(403).json({ error: 'not_assigned' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    if (msg === 'already_fulfilled') return res.status(409).json({ error: 'already_fulfilled' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/booster/farm-requests/:id/start', requireAuth, requireBooster, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await boosterStartFarmRequest({ requestId: id, boosterId: req.user.id })
    publishFulfillmentEvent({ kind: 'booster_started', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'not_assigned') return res.status(403).json({ error: 'not_assigned' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/booster/farm-requests/:id/fulfill', requireAuth, requireBooster, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { payload } = req.body ?? {}
  try {
    await boosterFulfillFarmRequest({ requestId: id, boosterId: req.user.id, payload })
    publishFulfillmentEvent({ kind: 'booster_fulfilled', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'not_assigned') return res.status(403).json({ error: 'not_assigned' })
    if (msg === 'invalid_payload') return res.status(400).json({ error: 'invalid_payload' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Admin Booster Management ──

router.get('/api/admin/booster/farm-requests', requireAuth, requireAdmin, async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const boosterId = req.query.booster_id
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined
  try {
    const data = await adminListBoosterFarmRequests({ limit, offset, status, boosterId, search, scope })
    res.json({ ok: true, items: data.items, total: data.total, summary: data.summary })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/booster/farm-requests/available', requireAuth, requireAdmin, async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  try {
    const data = await adminListAvailableBoosterFarmRequests({ limit, offset })
    res.json({ ok: true, items: data.items, total: data.total })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Admin Farm Requests ──

router.get('/api/admin/orders', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    const fulfillmentType = typeof req.query.fulfillment_type === 'string' ? req.query.fulfillment_type : undefined
    const data = await adminListOrders({ limit, offset, status, search, fulfillmentType })
    res.json({ ok: true, items: data.items, total: data.total, summary: data.summary })
  } catch (e) {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/orders/:id(\\d+)', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const data = await adminGetOrderDetail(id)
    res.json({ ok: true, ...data })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/farm-requests', requireAuth, requireStaff, async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const assignedTo = typeof req.query.assigned_to === 'string' ? req.query.assigned_to : undefined
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined
  try {
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'sensitive.farm_requests.list',
        entityType: 'farm_request',
        entityId: null,
        detail: { limit: Number(limit) || 0, offset: Number(offset) || 0, status: status ?? null },
      })
    } catch {
      // ignore
    }
    const data = await adminListFarmRequests({ limit, offset, status, assignedTo, search, scope, staffUserId: req.user?.id })
    res.json({ ok: true, items: data.items, total: data.total, summary: data.summary })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/farm-requests/:id(\\d+)', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'sensitive.farm_requests.detail',
        entityType: 'farm_request',
        entityId: id,
        detail: null,
      })
    } catch {
      // ignore
    }
    const data = await adminGetFarmRequestDetail(id)
    res.json({ ok: true, ...data })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_request_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/farm-requests/:id/assign', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { booster_id } = req.body ?? {}
  try {
    const row = await assignFarmRequestToBooster({ requestId: id, boosterId: booster_id })
    publishFulfillmentEvent({ kind: 'assigned', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true, assigned: row })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_request_id' || msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'invalid_booster_id') return res.status(400).json({ error: 'invalid_booster_id' })
    if (msg === 'booster_not_found') return res.status(404).json({ error: 'booster_not_found' })
    if (msg === 'not_booster') return res.status(400).json({ error: 'not_booster' })
    if (msg === 'not_found_or_locked') return res.status(409).json({ error: 'not_found_or_locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/farm-requests/:id/fulfill', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { payload } = req.body ?? {}
  try {
    await adminFulfillFarmRequest({ id, payload })
    publishFulfillmentEvent({ kind: 'fulfilled', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_request_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'invalid_payload') return res.status(400).json({ error: 'invalid_payload' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/farm-requests/:id/start', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const result = await adminStartFarmRequest({ id, staffId: req.user.id })
    publishFulfillmentEvent({ kind: 'started', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_request_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_pending') return res.status(409).json({ error: 'not_pending' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/farm-requests/:id/cancel', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { note } = req.body ?? {}
  try {
    const result = await adminCancelFarmRequest({ id, note })
    publishFulfillmentEvent({ kind: 'cancelled', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_request_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    if (msg === 'already_fulfilled') return res.status(409).json({ error: 'already_fulfilled' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/farm-requests/:id/claim', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const row = await assignFarmRequestToBooster({ requestId: id, boosterId: req.user.id })
    publishFulfillmentEvent({ kind: 'assigned', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true, assigned: row })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_request_id' || msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found_or_locked') return res.status(409).json({ error: 'not_found_or_locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/farm-requests/:id/notes', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { note } = req.body ?? {}
  if (!note || !String(note).trim()) return res.status(400).json({ error: 'invalid_note' })
  try {
    const createdNote = await adminAddFarmRequestNote({ id, staffId: req.user.id, note: String(note).trim() })
    publishFulfillmentEvent({ kind: 'note_added', request_id: id, at: new Date().toISOString() })
    res.json({ ok: true, note: createdNote })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_request_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'invalid_note') return res.status(400).json({ error: 'invalid_note' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Admin Support Tickets ──

router.get('/api/admin/support-agents', requireAuth, requireSupportStaff, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 200
    const items = await adminListSupportAgents({ limit })
    res.json({ ok: true, users: items })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/support-tickets', requireAuth, requireSupportStaff, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 120
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined
    const assigned_to = req.query.assigned_to
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    const data = await adminListSupportTickets({
      limit,
      offset,
      status,
      scope,
      assignedTo: assigned_to,
      search,
      staffUserId: req.user.id,
    })
    res.json({ ok: true, tickets: data.items, total: data.total, summary: data.summary })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    if (msg === 'invalid_status') return res.status(400).json({ error: 'invalid_status' })
    if (msg === 'invalid_scope') return res.status(400).json({ error: 'invalid_scope' })
    if (msg === 'invalid_staff_id') return res.status(400).json({ error: 'invalid_staff_id' })
    if (msg === 'invalid_assigned_to') return res.status(400).json({ error: 'invalid_assigned_to' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/support-tickets/:id(\\d+)', requireAuth, requireSupportStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const data = await adminGetSupportTicket({ ticketId: id })
    res.json({ ok: true, ticket: data.ticket, messages: data.messages })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/support-tickets/:id(\\d+)/reply', requireAuth, requireSupportStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { message, attachments, is_internal } = req.body ?? {}
  try {
    await adminReplySupportTicket({
      ticketId: id,
      staffUserId: req.user.id,
      staffRole: req.user.role,
      message,
      attachments,
      isInternal: is_internal,
    })
    const bundle = await adminGetSupportTicket({ ticketId: id })
    publishSupportEvent({
      kind: is_internal ? 'ticket_internal_note' : 'ticket_replied_staff',
      ticket_id: id,
      user_id: is_internal ? null : (Number(bundle?.ticket?.user_id) || null),
      at: new Date().toISOString(),
    })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'closed') return res.status(409).json({ error: 'closed' })
    if (msg === 'invalid_message') return res.status(400).json({ error: 'invalid_message' })
    if (msg === 'invalid_message_too_long') return res.status(400).json({ error: 'invalid_message_too_long' })
    if (msg === 'invalid_attachments') return res.status(400).json({ error: 'invalid_attachments' })
    if (msg === 'too_many_attachments') return res.status(400).json({ error: 'too_many_attachments' })
    if (msg === 'attachment_too_large') return res.status(400).json({ error: 'attachment_too_large' })
    if (msg === 'invalid_attachment_type') return res.status(400).json({ error: 'invalid_attachment_type' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/support-tickets/:id(\\d+)/assign', requireAuth, requireSupportStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { assigned_to } = req.body ?? {}
  try {
    const ticket = await adminAssignSupportTicket({ ticketId: id, assignedTo: assigned_to })
    publishSupportEvent({
      kind: 'ticket_assigned',
      ticket_id: id,
      user_id: Number(ticket?.user_id) || null,
      at: new Date().toISOString(),
    })
    res.json({ ok: true, ticket })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_assigned_to') return res.status(400).json({ error: 'invalid_assigned_to' })
    if (msg === 'invalid_assigned_to_user') return res.status(400).json({ error: 'invalid_assigned_to_user' })
    if (msg === 'invalid_assigned_to_role') return res.status(400).json({ error: 'invalid_assigned_to_role' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/support-tickets/:id(\\d+)/claim', requireAuth, requireSupportStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    let ticket = await adminAssignSupportTicket({ ticketId: id, assignedTo: req.user.id })
    if (String(ticket?.status || '').trim().toLowerCase() === 'pending') {
      ticket = await adminSetSupportTicketStatus({ ticketId: id, status: 'open' })
    }
    publishSupportEvent({
      kind: 'ticket_claimed',
      ticket_id: id,
      user_id: Number(ticket?.user_id) || null,
      at: new Date().toISOString(),
    })
    res.json({ ok: true, ticket })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_assigned_to') return res.status(400).json({ error: 'invalid_assigned_to' })
    if (msg === 'invalid_assigned_to_user') return res.status(400).json({ error: 'invalid_assigned_to_user' })
    if (msg === 'invalid_assigned_to_role') return res.status(400).json({ error: 'invalid_assigned_to_role' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/support-tickets/:id(\\d+)/status', requireAuth, requireSupportStaff, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { status } = req.body ?? {}
  try {
    const ticket = await adminSetSupportTicketStatus({ ticketId: id, status })
    publishSupportEvent({
      kind: 'ticket_status_changed',
      ticket_id: id,
      user_id: Number(ticket?.user_id) || null,
      at: new Date().toISOString(),
    })
    res.json({ ok: true, ticket })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_status') return res.status(400).json({ error: 'invalid_status' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Admin Topups / Finance ──

router.get('/api/admin/topups', requireAuth, requireFinance, async (req, res) => {
  try {
    const providerRef = String(req.query?.provider_ref ?? '').trim()
    const status = String(req.query?.status ?? '').trim()
    const items = await listTopups({ providerRef, status })
    res.json({ ok: true, topups: items })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

// Slips waiting for a human to compare them against the shop's bank account.
router.get('/api/admin/topups/review-queue', requireAuth, requireFinance, async (req, res) => {
  try {
    const [pendingReview, recent] = await Promise.all([
      listTopups({ status: 'pending_review', limit: 100 }),
      listTopups({ limit: 30 }),
    ])
    res.json({ ok: true, pending: pendingReview, recent })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/topups/:id/reject', requireAuth, requireFinance, async (req, res) => {
  const topupId = Number(req.params.id)
  if (!Number.isFinite(topupId)) return res.status(400).json({ error: 'invalid_id' })

  try {
    const result = await adminCancelTopup({ topupId })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'topup.reject',
        entityType: 'topup',
        entityId: String(topupId),
        detail: { reason: String(req.body?.reason ?? '').slice(0, 300) },
        status: 'success',
        severity: 'warning',
      })
    } catch {
      // ignore
    }
    res.json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'topup_not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'already_paid') return res.status(409).json({ error: 'already_paid' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/topup-logs', requireAuth, requireFinance, async (req, res) => {
  try {
    const search = String(req.query?.search ?? '').trim()
    const providerRef = String(req.query?.provider_ref ?? '').trim()
    const logs = await listTopupLogs({ search, providerRef })
    res.json({ ok: true, logs })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/topups/:id/approve', requireAuth, requireFinance, async (req, res) => {
  const topupId = Number(req.params.id)
  if (!Number.isFinite(topupId)) return res.status(400).json({ error: 'invalid_id' })

  try {
    const { points } = req.body ?? {}
    if (points != null && points !== '') {
      await setTopupPointsForApproval({ topupId, points })
    }
    const result = await creditPointsForTopup({
      topupId,
      approvedBy: req.user.id,
      refType: 'admin_approve',
      refId: String(topupId),
    })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'topup.approve',
        entityType: 'topup',
        entityId: String(topupId),
        detail: { credited: Boolean(result?.credited), points: points ?? null },
        status: 'success',
        severity: 'warning',
      })
    } catch {
      // ignore
    }
    res.json({ ok: true, result })
  } catch (e) {
    if (String(e?.message ?? '') === 'topup_not_found') return res.status(404).json({ error: 'not_found' })
    if (String(e?.message ?? '') === 'invalid_points') return res.status(400).json({ error: 'invalid_points' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Admin Users ──

router.get('/api/admin/users', requireAuth, requireStaff, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const search = req.query.search ? String(req.query.search) : ''
    const role = req.query.role ? String(req.query.role) : 'all'
    const status = req.query.status ? String(req.query.status) : 'all'
    const sort = req.query.sort ? String(req.query.sort) : 'created_desc'
    const data = await adminListUsersAdvanced({ limit, offset, search, role, status, sort })
    res.json({ ok: true, users: data.items || [], items: data.items || [], total: data.total ?? 0, summary: data.summary || null })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    if (msg === 'invalid_role_filter') return res.status(400).json({ error: 'invalid_role_filter' })
    if (msg === 'invalid_status_filter') return res.status(400).json({ error: 'invalid_status_filter' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/users/:id/management-detail', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const detail = await adminGetUserManagementDetail(userId, {
      topupsLimit: req.query.topups_limit ? Number(req.query.topups_limit) : 20,
      transactionsLimit: req.query.transactions_limit ? Number(req.query.transactions_limit) : 20,
      sessionsLimit: req.query.sessions_limit ? Number(req.query.sessions_limit) : 20,
      auditLimit: req.query.audit_limit ? Number(req.query.audit_limit) : 40,
    })
    res.json({ ok: true, ...detail })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/users/:id/role', requireAuth, requireOwner, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })

  const { role } = req.body ?? {}
  try {
    const user = await setUserRole({ userId, role, performedByOwner: true })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.role_set',
        entityType: 'user',
        entityId: String(userId),
        detail: { role: String(role || '').trim().toLowerCase() || null },
      })
    } catch {
      // ignore audit failure
    }
    res.json({ ok: true, user })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'invalid_role') return res.status(400).json({ error: 'invalid_role' })
    if (msg === 'forbidden_owner') return res.status(403).json({ error: 'forbidden_owner' })
    if (msg === 'cannot_remove_last_owner') return res.status(409).json({ error: 'cannot_remove_last_owner' })
    if (msg === 'user_not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/users/:id/points', requireAuth, requireFinance, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })

  const { points, reason } = req.body ?? {}
  const amount = Number(points)
  if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'invalid_points' })
  const rs = typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : 'manual_adjust'
  const actorRole = typeof req.user?.role === 'string' ? req.user.role.trim().toLowerCase() : 'user'
  const absAmount = Math.abs(amount)

  // Hard limit for owner is 100M; for staff is 100k
  const hardLimit = actorRole === 'owner' ? 100000000 : 100000
  if (absAmount > hardLimit) {
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'fraud_guardrail.points_rejected_limit',
        entityType: 'user',
        entityId: String(userId),
        detail: { points: amount, reason: rs, actor_role: actorRole, reason_code: 'hard_limit' },
      })
    } catch {
      // ignore audit failure
    }
    return res.status(400).json({ error: 'points_over_hard_limit', message: `จำนวนแต้มเกินขีดจำกัดสูงสุด (${hardLimit.toLocaleString()} แต้ม)` })
  }

  if (absAmount >= 50000 && actorRole !== 'owner') {
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'fraud_guardrail.points_rejected_owner_only',
        entityType: 'user',
        entityId: String(userId),
        detail: { points: amount, reason: rs, actor_role: actorRole, reason_code: 'owner_approval_required' },
      })
    } catch {
      // ignore audit failure
    }
    return res.status(403).json({ error: 'owner_approval_required_for_large_adjustment', message: 'การปรับแต้ม 50,000 ขึ้นไปต้องดำเนินการโดย Owner เท่านั้น' })
  }

  if (absAmount >= 10000 && rs.length < 12 && actorRole !== 'owner') {
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'fraud_guardrail.points_rejected_reason',
        entityType: 'user',
        entityId: String(userId),
        detail: { points: amount, reason: rs, actor_role: actorRole, reason_code: 'reason_too_short' },
      })
    } catch {
      // ignore audit failure
    }
    return res.status(400).json({ error: 'reason_required_for_large_adjustment' })
  }

  try {
    const result = await adjustUserPoints({
      userId,
      points: amount,
      refType: 'points_adjustment',
      refId: `admin:${req.user.id}:${Date.now()}:${rs}`,
    })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.points_adjust',
        entityType: 'user',
        entityId: String(userId),
        detail: { points: amount, reason: rs },
      })
    } catch {
      // ignore audit failure
    }
    res.json({ ok: true, result })
  } catch (e) {
    if (String(e?.message ?? '') === 'invalid_points') return res.status(400).json({ error: 'invalid_points' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/users/:id/password', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })

  const parsed = validateBody(AdminPasswordBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { password } = parsed.data

  try {
    await setUserPassword({ userId, password })
    await deleteAllUserSessionsExcept(userId, '')
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: String(userId),
        detail: { sessions_revoked: true },
      })
    } catch {
      // ignore
    }
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/users/:id/profile', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })

  const { display_name, avatar_url, email, username } = req.body ?? {}
  try {
    const user = await adminUpdateUserAccount({
      userId,
      email,
      username,
      displayName: display_name,
      avatarUrl: avatar_url,
    })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.profile_update',
        entityType: 'user',
        entityId: String(userId),
        detail: {
          email: email ?? null,
          username: username ?? null,
          display_name: display_name ?? null,
          avatar_url: avatar_url ?? null,
        },
      })
    } catch {
      // ignore audit failure
    }
    res.json({ ok: true, user })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'invalid_email') return res.status(400).json({ error: 'invalid_email' })
    if (msg === 'invalid_username') return res.status(400).json({ error: 'invalid_username' })
    if (msg === 'invalid_username_charset') return res.status(400).json({ error: 'invalid_username_charset' })
    if (msg === 'invalid_display_name') return res.status(400).json({ error: 'invalid_display_name' })
    if (e?.code === '23505') return res.status(409).json({ error: 'email_or_username_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/users/:id/vip-tier', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'invalid_id' })
  const { tier_id } = req.body ?? {}
  try {
    const vip = await adminSetUserVipTier({ userId, tierId: tier_id })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.vip_tier_update',
        entityType: 'user',
        entityId: String(userId),
        detail: { tier_id: tier_id ?? null },
      })
    } catch {}
    res.json({ ok: true, vip })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_user_id') return res.status(400).json({ error: 'invalid_user_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/users/:id/revoke-sessions', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const result = await adminRevokeUserSessions(userId)
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.sessions_revoke',
        entityType: 'user',
        entityId: String(userId),
        detail: { deleted: Number(result?.deleted ?? 0) || 0 },
      })
    } catch {
      // ignore audit failure
    }
    res.json({ ok: true, deleted: Number(result?.deleted ?? 0) || 0 })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const result = await adminRemoveUserAccount({
      userId,
      actorUserId: req.user?.id,
      performedByOwner: String(req.user?.role || '').toLowerCase() === 'owner',
    })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.account_remove',
        entityType: 'user',
        entityId: String(userId),
        detail: { deleted: Number(result?.deleted ?? 0) || 0 },
      })
    } catch {
      // ignore audit failure
    }
    res.json({ ok: true, deleted: Number(result?.deleted ?? 0) || 0 })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'invalid_actor') return res.status(403).json({ error: 'forbidden' })
    if (msg === 'cannot_remove_self') return res.status(409).json({ error: 'cannot_remove_self' })
    if (msg === 'forbidden_owner') return res.status(403).json({ error: 'forbidden_owner' })
    if (msg === 'cannot_remove_last_owner') return res.status(409).json({ error: 'cannot_remove_last_owner' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/users/:id/ban', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const user = await setUserBanned({ userId, isBanned: true })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.ban',
        entityType: 'user',
        entityId: String(userId),
        detail: {},
      })
    } catch {
      // ignore audit failure
    }
    res.json({ ok: true, user })
  } catch (e) {
    if (String(e?.message ?? '') === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/users/:id/unban', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const user = await setUserBanned({ userId, isBanned: false })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'user.unban',
        entityType: 'user',
        entityId: String(userId),
        detail: {},
      })
    } catch {
      // ignore audit failure
    }
    res.json({ ok: true, user })
  } catch (e) {
    if (String(e?.message ?? '') === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/users/:id/orders', requireAuth, requireFinance, async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const search = req.query.search || ''
    const orders = await adminListUserOrders(userId, { limit, offset, search })
    res.json({ ok: true, orders })
  } catch (e) {
    if (String(e?.message ?? '') === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/orders/search', requireAuth, requireFinance, async (req, res) => {
  const ref = req.query.ref || ''
  if (!ref.trim()) return res.status(400).json({ error: 'missing_ref' })
  try {
    const order = await adminSearchOrderByRef(ref)
    res.json({ ok: true, order: order || null })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Staff clock-in / clock-out ──

router.get('/api/staff/clock-status', requireAuth, requireStaff, async (req, res) => {
  try {
    const status = await getStaffClockStatus(req.user.id)
    res.json({ ok: true, ...status })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/staff/clock-in', requireAuth, requireStaff, async (req, res) => {
  try {
    const durationMinutes = Number(req.body?.duration_minutes) || undefined
    const result = await staffClockIn(req.user.id, { durationMinutes })
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/staff/clock-out', requireAuth, requireStaff, async (req, res) => {
  try {
    const result = await staffClockOut(req.user.id)
    res.json({ ok: true, ...result })
  } catch (e) {
    if (e?.message === 'not_clocked_in') return res.status(400).json({ error: 'not_clocked_in' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/staff/clock-sessions', requireAuth, requireStaff, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const data = await listStaffClockSessions(req.user.id, { limit, offset })
    res.json({ ok: true, ...data })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/clock-sessions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const data = await adminListAllClockSessions({ limit, offset })
    res.json({ ok: true, ...data })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Staff notifications ──

router.get('/api/staff/notifications', requireAuth, requireStaff, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const data = await listStaffNotifications(req.user.id, { limit, offset })
    res.json({ ok: true, ...data })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/staff/notifications/unread-count', requireAuth, requireStaff, async (req, res) => {
  try {
    const count = await getUnreadNotificationCount(req.user.id)
    res.json({ ok: true, unread_count: count })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/staff/notifications/:id/read', requireAuth, requireStaff, async (req, res) => {
  try {
    await markNotificationRead(req.user.id, req.params.id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/staff/notifications/read-all', requireAuth, requireStaff, async (req, res) => {
  try {
    await markAllNotificationsRead(req.user.id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Push subscriptions ──

router.post('/api/staff/push-subscribe', requireAuth, requireStaff, async (req, res) => {
  try {
    await savePushSubscription(req.user.id, req.body?.subscription)
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_subscription') return res.status(400).json({ error: 'invalid_subscription' })
    res.status(400).json({ error: 'invalid_subscription' })
  }
})

router.post('/api/staff/push-unsubscribe', requireAuth, requireStaff, async (req, res) => {
  try {
    await removePushSubscription(req.user.id, req.body?.endpoint)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

export default router
