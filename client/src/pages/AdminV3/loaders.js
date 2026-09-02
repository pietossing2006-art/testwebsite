// ── AdminV3 data loaders ──
// All async functions that fetch from the backend API.

import { fetchJson } from '../../api.js'
import { normalizeUiImageSettings } from '../../uiImageSettings.js'
import { normalizeUiBrandingSettings } from '../../uiBrandingSettings.js'
import { pickNumber, normalizeHomepageSettings, normalizeSiteSettings, normalizeTopupSettings } from './helpers.js'

// ── Dashboard ──
function normalizeDashboardData(results) {
  const [overviewRes, pulseRes, usersRes] = results
  const overviewPayload = overviewRes.status === 'fulfilled' ? overviewRes.value : {}
  const pulsePayload = pulseRes.status === 'fulfilled' ? pulseRes.value : {}
  const users = usersRes.status === 'fulfilled' ? usersRes.value : {}
  const overview = overviewPayload?.overview || overviewPayload || {}
  const pulse = pulsePayload?.pulse || pulsePayload || {}
  const summary = pulse?.summary || {}
  const sla = pulse?.sla || {}
  const notifications = Array.isArray(pulse?.notifications) ? pulse.notifications : []
  return {
    totalUsers: pickNumber(users?.total || users?.count),
    openTickets: pickNumber(summary.support_open_count),
    pendingFulfillment: pickNumber(summary.farm_pending_count),
    totalRevenuePoints: pickNumber(overview?.revenue_month_points || overview?.revenue_today_points),
    supportPending: pickNumber(summary.support_pending_count),
    supportUnassigned: pickNumber(summary.support_unassigned_count),
    supportOverSla: pickNumber(summary.support_over_sla_count),
    farmInProgress: pickNumber(summary.farm_in_progress_count),
    farmUnassigned: pickNumber(summary.farm_unassigned_count),
    farmOverSla: pickNumber(summary.farm_over_sla_count),
    supportFirstResponseAvgMinutes: pickNumber(sla.support_first_response_avg_minutes),
    supportResolutionAvgMinutes: pickNumber(sla.support_resolution_avg_minutes),
    farmAssignAvgMinutes: pickNumber(sla.farm_assign_avg_minutes),
    farmFulfillAvgMinutes: pickNumber(sla.farm_fulfill_avg_minutes),
    notifications,
    generatedAt: pulse?.generated_at || overview?.generated_at || null,
  }
}

export async function loadDashboardModule() {
  const results = await Promise.allSettled([
    fetchJson('/api/admin/dashboard/overview?days=14&urgent_minutes=60&urgent_limit=8'),
    fetchJson('/api/admin/dashboard/ops-pulse?days=14&limit=14&support_sla_minutes=30&farm_sla_minutes=60'),
    fetchJson('/api/admin/users?limit=1'),
  ])
  return normalizeDashboardData(results)
}

// ── Users ──
export async function loadUsersModule(query) {
  const limit = Math.max(1, pickNumber(query.limit) || 25)
  const page = Math.max(1, pickNumber(query.page) || 1)
  const offset = (page - 1) * limit
  const qs = new URLSearchParams()
  if (String(query.search || '').trim()) qs.set('search', String(query.search || '').trim())
  if (String(query.role || 'all') !== 'all') qs.set('role', String(query.role))
  if (String(query.status || 'all') !== 'all') qs.set('status', String(query.status))
  if (String(query.sort || '').trim()) qs.set('sort', String(query.sort || '').trim())
  qs.set('offset', String(offset))
  qs.set('limit', String(limit))
  const data = await fetchJson(`/api/admin/users?${qs.toString()}`)
  const total = pickNumber(data?.total)
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return { users: Array.isArray(data?.users) ? data.users : [], total, summary: data?.summary || null, page, limit, totalPages }
}

// ── Support ──
export async function loadSupportTicketDetail(ticketId) {
  const tid = Number(ticketId)
  if (!Number.isFinite(tid) || tid <= 0) return { selectedTicketId: null, selectedTicket: null, messages: [] }
  const data = await fetchJson(`/api/admin/support-tickets/${tid}`, { method: 'GET' })
  return { selectedTicketId: tid, selectedTicket: data?.ticket || null, messages: Array.isArray(data?.messages) ? data.messages : [] }
}

export async function loadSupportModule(query, selectedTicketId) {
  const qs = new URLSearchParams({ limit: String(Math.max(1, pickNumber(query.limit) || 120)) })
  if (String(query.status || '').trim()) qs.set('status', String(query.status).trim())
  if (String(query.scope || '').trim() && String(query.scope || '').trim() !== 'all') qs.set('scope', String(query.scope).trim())
  const assignedToRaw = String(query.assignedTo || '').trim()
  if (assignedToRaw === 'unassigned') qs.set('assigned_to', 'unassigned')
  else if (assignedToRaw === 'me') qs.set('assigned_to', 'me')
  else if (assignedToRaw) qs.set('assigned_to', assignedToRaw)
  if (String(query.search || '').trim()) qs.set('search', String(query.search).trim())
  const [ticketData, agentData] = await Promise.all([
    fetchJson(`/api/admin/support-tickets?${qs.toString()}`, { method: 'GET' }),
    fetchJson('/api/admin/support-agents?limit=200', { method: 'GET' }),
  ])
  const tickets = Array.isArray(ticketData?.tickets) ? ticketData.tickets : []
  const total = Number(ticketData?.total)
  const summary = ticketData?.summary && typeof ticketData.summary === 'object'
    ? {
        open: pickNumber(ticketData.summary.open), pending: pickNumber(ticketData.summary.pending),
        closed: pickNumber(ticketData.summary.closed), unassigned: pickNumber(ticketData.summary.unassigned),
        mine: pickNumber(ticketData.summary.mine), needs_reply: pickNumber(ticketData.summary.needs_reply),
        over_sla: pickNumber(ticketData.summary.over_sla),
      }
    : { open: 0, pending: 0, closed: 0, unassigned: 0, mine: 0, needs_reply: 0, over_sla: 0 }
  const agents = Array.isArray(agentData?.users) ? agentData.users : []
  let targetId = Number(selectedTicketId)
  if (!Number.isFinite(targetId) || targetId <= 0) targetId = null
  let selectedTicket = null
  let messages = []
  if (Number.isFinite(targetId) && targetId > 0) {
    try {
      const detail = await loadSupportTicketDetail(targetId)
      selectedTicket = detail.selectedTicket
      messages = detail.messages
      targetId = Number(detail.selectedTicketId)
    } catch { selectedTicket = null; messages = [] }
  }
  return {
    tickets, total: Number.isFinite(total) ? total : tickets.length,
    summary, agents, selectedTicketId: Number.isFinite(targetId) ? targetId : null, selectedTicket, messages,
  }
}

// ── Fulfillment ──
export async function loadFulfillmentModule(query) {
  const qs = new URLSearchParams({ limit: String(Math.max(1, pickNumber(query.limit) || 200)) })
  if (String(query.status || '').trim()) qs.set('status', String(query.status).trim())
  if (String(query.scope || '').trim() && String(query.scope || '').trim() !== 'all') qs.set('scope', String(query.scope).trim())
  if (String(query.assignedTo || '').trim()) qs.set('assigned_to', String(query.assignedTo).trim())
  if (String(query.search || '').trim()) qs.set('search', String(query.search).trim())
  const [requestsRes, ...staffResults] = await Promise.all([
    fetchJson(`/api/admin/farm-requests?${qs.toString()}`, { method: 'GET' }),
    fetchJson('/api/admin/users?role=booster&limit=200', { method: 'GET' }),
    fetchJson('/api/admin/users?role=support&limit=200', { method: 'GET' }),
    fetchJson('/api/admin/users?role=admin&limit=200', { method: 'GET' }),
    fetchJson('/api/admin/users?role=owner&limit=200', { method: 'GET' }),
  ])
  const allStaffMap = new Map()
  for (const res of staffResults) {
    for (const u of (Array.isArray(res?.users) ? res.users : [])) {
      if (!allStaffMap.has(u.id)) allStaffMap.set(u.id, u)
    }
  }
  const boostersRes = { users: [...allStaffMap.values()] }
  return {
    requests: Array.isArray(requestsRes?.items) ? requestsRes.items : [],
    boosters: Array.isArray(boostersRes?.users) ? boostersRes.users : [],
    total: pickNumber(requestsRes?.total),
    summary: requestsRes?.summary || { pending: 0, in_progress: 0, fulfilled: 0, cancelled: 0, unassigned: 0, mine: 0, over_sla: 0 },
  }
}

export async function loadFulfillmentRequestDetail(requestId) {
  const rid = Number(requestId)
  if (!Number.isFinite(rid) || rid <= 0) return null
  const data = await fetchJson(`/api/admin/farm-requests/${rid}`, { method: 'GET' })
  return { request: data?.request || null, logs: Array.isArray(data?.logs) ? data.logs : [] }
}

// ── Orders ──
export async function loadOrdersModule(query) {
  const limit = Math.max(1, pickNumber(query.limit) || 100)
  const page = Math.max(1, pickNumber(query.page) || 1)
  const offset = query.offset != null ? Math.max(0, pickNumber(query.offset) || 0) : (page - 1) * limit
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (String(query.status || '').trim()) qs.set('status', String(query.status).trim())
  if (String(query.fulfillmentType || '').trim()) qs.set('fulfillment_type', String(query.fulfillmentType).trim())
  if (String(query.search || '').trim()) qs.set('search', String(query.search).trim())
  const data = await fetchJson(`/api/admin/orders?${qs.toString()}`, { method: 'GET' })
  const total = pickNumber(data?.total) || 0
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    summary: data?.summary || { pending: 0, completed: 0, cancelled: 0, pending_claim: 0, claimed: 0, fr_pending: 0, fr_in_progress: 0 },
  }
}

export async function loadOrderDetail(orderId) {
  const oid = Number(orderId)
  if (!Number.isFinite(oid) || oid <= 0) return null
  const data = await fetchJson(`/api/admin/orders/${oid}`, { method: 'GET' })
  return { order: data?.order || null, deliveries: Array.isArray(data?.deliveries) ? data.deliveries : [] }
}

// ── Logs ──
export async function loadLogsModule(query = {}) {
  const limit = Math.max(1, pickNumber(query.limit) || 50)
  const page = Math.max(1, pickNumber(query.page) || 1)
  const qs = new URLSearchParams({ limit: String(limit), page: String(page) })
  if (String(query.search || '').trim()) qs.set('search', String(query.search).trim())
  if (String(query.action || '').trim()) qs.set('action', String(query.action).trim())
  if (String(query.category || '').trim() && String(query.category).trim() !== 'all') qs.set('category', String(query.category).trim())
  if (String(query.severity || '').trim() && String(query.severity).trim() !== 'all') qs.set('severity', String(query.severity).trim())
  if (String(query.status || '').trim() && String(query.status).trim() !== 'all') qs.set('status', String(query.status).trim())
  if (String(query.actorUserId || '').trim()) qs.set('actor_user_id', String(query.actorUserId).trim())
  if (String(query.dateFrom || '').trim()) qs.set('date_from', String(query.dateFrom).trim())
  if (String(query.dateTo || '').trim()) qs.set('date_to', String(query.dateTo).trim())

  const [logsRes, statsRes] = await Promise.allSettled([
    fetchJson(`/api/admin/audit-logs?${qs.toString()}`, { method: 'GET' }),
    fetchJson('/api/admin/audit-logs/stats', { method: 'GET' }),
  ])

  const data = logsRes.status === 'fulfilled' ? logsRes.value : {}
  const statsData = statsRes.status === 'fulfilled' ? statsRes.value?.stats : null

  return {
    logs: Array.isArray(data?.logs) ? data.logs : [],
    total: pickNumber(data?.total) || 0,
    page: pickNumber(data?.page) || page,
    limit: pickNumber(data?.limit) || limit,
    totalPages: pickNumber(data?.totalPages) || 1,
    summary: data?.summary || {
      total_count: 0,
      critical_count: 0,
      warning_count: 0,
      security_count: 0,
      unique_actors: 0,
      unique_ips: 0,
    },
    stats: statsData || null,
  }
}

// ── Settings ──
export async function loadSettingsModule() {
  const data = await fetchJson('/api/admin/ui-settings', { method: 'GET' })
  return {
    image_settings: normalizeUiImageSettings(data?.image_settings),
    branding_settings: normalizeUiBrandingSettings(data?.branding_settings),
    homepage_settings: normalizeHomepageSettings(data?.homepage_settings),
    site_settings: normalizeSiteSettings(data?.site_settings),
    topup_settings: normalizeTopupSettings(data?.topup_settings),
  }
}

// ── Catalog ──
export async function loadCatalogModule() {
  const [categoriesRes, productsRes] = await Promise.all([
    fetchJson('/api/admin/categories'),
    fetchJson('/api/admin/products'),
  ])
  return {
    categories: Array.isArray(categoriesRes?.categories) ? categoriesRes.categories : [],
    products: Array.isArray(productsRes?.products) ? productsRes.products : [],
  }
}

// ── Promotions ──
export async function loadPromotionsModule() {
  const [couponsRes, promotionsRes, discountCouponsRes, productsRes, categoriesRes] = await Promise.all([
    fetchJson('/api/admin/coupons'),
    fetchJson('/api/admin/promotions'),
    fetchJson('/api/admin/discount-coupons'),
    fetchJson('/api/admin/products'),
    fetchJson('/api/admin/categories'),
  ])
  return {
    coupons: Array.isArray(couponsRes?.coupons) ? couponsRes.coupons : [],
    promotions: Array.isArray(promotionsRes?.promotions) ? promotionsRes.promotions : [],
    discountCoupons: Array.isArray(discountCouponsRes?.coupons) ? discountCouponsRes.coupons : [],
    products: Array.isArray(productsRes?.products) ? productsRes.products : [],
    categories: Array.isArray(categoriesRes?.categories) ? categoriesRes.categories : [],
  }
}

// ── Growth ──
export async function loadGrowthModule() {
  const [campaignsRes, reviewsRes, tiersRes, signalsRes, notificationsRes] = await Promise.all([
    fetchJson('/api/admin/growth-campaigns'),
    fetchJson('/api/admin/reviews?limit=100'),
    fetchJson('/api/admin/vip-tiers'),
    fetchJson('/api/admin/wishlist-signals?limit=50'),
    fetchJson('/api/admin/growth-notifications?limit=100'),
  ])
  return {
    campaigns: Array.isArray(campaignsRes?.campaigns) ? campaignsRes.campaigns : [],
    reviews: Array.isArray(reviewsRes?.reviews) ? reviewsRes.reviews : [],
    tiers: Array.isArray(tiersRes?.tiers) ? tiersRes.tiers : [],
    signals: Array.isArray(signalsRes?.signals) ? signalsRes.signals : [],
    notifications: Array.isArray(notificationsRes?.events) ? notificationsRes.events : [],
  }
}

// ── Stock ──
export async function loadStockModule() {
  const [productsRes, categoriesRes, poolsRes] = await Promise.all([
    fetchJson('/api/admin/products'),
    fetchJson('/api/admin/categories').catch(() => ({ categories: [] })),
    fetchJson('/api/admin/stock-pools?limit=200&offset=0').catch(() => ({ pools: [] })),
  ])
  return {
    products: Array.isArray(productsRes?.products) ? productsRes.products : [],
    categories: Array.isArray(categoriesRes?.categories) ? categoriesRes.categories : [],
    pools: Array.isArray(poolsRes?.pools) ? poolsRes.pools : [],
    stockItems: [], stockSummary: null, poolItems: [], poolSummary: null, poolBindings: [],
  }
}

// ── Automation ──
export async function loadAutomationModule() {
  const [rulesRes, eventsRes] = await Promise.all([
    fetchJson('/api/admin/workflow-automation/rules?limit=100&offset=0'),
    fetchJson('/api/admin/workflow-automation/events?limit=100'),
  ])
  return {
    rules: Array.isArray(rulesRes?.rules) ? rulesRes.rules : [],
    events: Array.isArray(eventsRes?.events) ? eventsRes.events : [],
  }
}

// ── Announcements ──
export async function loadAnnouncementsModule() {
  const data = await fetchJson('/api/admin/announcements')
  return { announcements: data?.announcements || [] }
}

// ── Messages ──
export async function loadMessagesModule() {
  const data = await fetchJson('/api/admin/site-messages?limit=100&offset=0')
  return { messages: data?.messages || [], total: data?.total || 0 }
}

// ── Timesheet ──
export async function loadTimesheetModule(role) {
  const [myRes, statusRes] = await Promise.allSettled([
    fetchJson('/api/staff/clock-sessions?limit=100'),
    fetchJson('/api/staff/clock-status'),
  ])
  const myData = myRes.status === 'fulfilled' ? myRes.value : {}
  const statusData = statusRes.status === 'fulfilled' ? statusRes.value : {}

  let allSessions = null
  if (role === 'admin' || role === 'owner') {
    try {
      const r = await fetchJson('/api/admin/clock-sessions?limit=200')
      allSessions = r?.items || []
    } catch {
      // Optional admin timesheet data; keep the personal timesheet usable if it fails.
    }
  }

  return {
    mySessions: myData?.items || [],
    myTotal: myData?.total || 0,
    clockedIn: !!statusData?.clocked_in,
    clockIn: statusData?.clock_in || null,
    autoClockOutAt: statusData?.auto_clock_out_at || null,
    allSessions,
  }
}

// ── Owner Panel ──
export async function loadOwnerModule() {
  const data = await fetchJson('/api/admin/owner/stats')
  return {
    stats: data?.stats || {},
    top_admins: Array.isArray(data?.top_admins) ? data.top_admins : [],
  }
}

// ── Bundles ──
export async function loadBundlesModule() {
  const [bundlesRes, productsRes] = await Promise.all([
    fetchJson('/api/admin/bundles'),
    fetchJson('/api/admin/products'),
  ])
  return {
    bundles: Array.isArray(bundlesRes?.bundles) ? bundlesRes.bundles : [],
    products: Array.isArray(productsRes?.products) ? productsRes.products : [],
  }
}
