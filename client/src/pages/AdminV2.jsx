import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchJson, resolveApiUrl, setAuthToken, triggerAppRefresh } from '../api.js'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../uiImageSettings.js'
import { DEFAULT_UI_BRANDING_SETTINGS, normalizeUiBrandingSettings } from '../uiBrandingSettings.js'
import AnnIcon from '../components/AnnIcon.jsx'
import AnnRichText from '../components/AnnRichText.jsx'

const MODULES = [
  { id: 'dashboard', label: 'แดชบอร์ด', section: 'core' },
  { id: 'users', label: 'ผู้ใช้', section: 'core' },
  { id: 'support', label: 'ซัพพอร์ต', section: 'operations' },
  { id: 'catalog', label: 'แค็ตตาล็อก', section: 'operations' },
  { id: 'stock', label: 'สต็อก', section: 'operations' },
  { id: 'fulfillment', label: 'บริการงานจ้าง', section: 'operations' },
  { id: 'automation', label: 'อัตโนมัติ', section: 'operations' },
  { id: 'promotions', label: 'โปรโมชัน', section: 'business' },
  { id: 'announcements', label: 'ประกาศ', section: 'business' },
  { id: 'messages', label: 'ข้อความ', section: 'business' },
  { id: 'logs', label: 'บันทึกการใช้งาน', section: 'system' },
  { id: 'settings', label: 'ตั้งค่า', section: 'system' },
]

const MODULE_SECTIONS = [
  { id: 'core', label: 'หลัก' },
  { id: 'operations', label: 'ปฏิบัติการ' },
  { id: 'business', label: 'ธุรกิจ' },
  { id: 'system', label: 'ระบบ' },
]

const LOCAL_ROLE_MODULE_ACCESS = {
  owner: ['dashboard', 'users', 'support', 'catalog', 'stock', 'fulfillment', 'automation', 'promotions', 'announcements', 'messages', 'logs', 'settings'],
  admin: ['dashboard', 'users', 'support', 'catalog', 'stock', 'fulfillment', 'automation', 'promotions', 'announcements', 'messages', 'settings'],
  finance: ['dashboard', 'users', 'promotions'],
  support: ['dashboard', 'support'],
  booster: ['dashboard', 'fulfillment'],
}

const LOCAL_ROLE_ACTION_ACCESS = {
  'users.view': ['finance', 'admin', 'owner'],
  'users.edit': ['admin', 'owner'],
  'users.adjust_points': ['finance', 'admin', 'owner'],
  'support.manage': ['support', 'admin', 'owner'],
  'fulfillment.manage': ['booster', 'admin', 'owner'],
  'catalog.manage': ['admin', 'owner'],
  'stock.manage': ['admin', 'owner'],
  'automation.manage': ['admin', 'owner'],
  'promotions.manage': ['admin', 'owner'],
  'logs.view': ['owner'],
  'settings.manage': ['admin', 'owner'],
}

const USER_ROLE_OPTIONS = ['owner', 'admin', 'finance', 'support', 'booster', 'user']

const DEFAULT_USERS_QUERY = {
  search: '',
  role: 'all',
  status: 'all',
  sort: 'created_desc',
  page: 1,
  limit: 25,
}

const DEFAULT_SUPPORT_QUERY = {
  status: '',
  scope: 'all',
  assignedTo: '',
  search: '',
  limit: 120,
}

const DEFAULT_FULFILLMENT_QUERY = {
  status: 'pending',
  search: '',
  scope: 'all',
  assignedTo: '',
  limit: 200,
}

const DEFAULT_LOGS_QUERY = {
  action: '',
  entity_type: '',
  limit: 50,
}

const EMPTY_SETTINGS_FIELD_ERRORS = {
  home_featured_ratio: '',
  home_categories_ratio: '',
  category_products_ratio: '',
  product_detail_ratio: '',
  site_name: '',
  navbar_title: '',
  tab_title: '',
  favicon_url: '',
  navbar_links: '',
}

const DEFAULT_CATALOG_FILTER = {
  search: '',
  categoryId: 'all',
  hidden: 'all',
}

const DEFAULT_CATEGORY_FORM = {
  id: null,
  name: '',
  slug: '',
  image_url: '',
  description: '',
}

const DEFAULT_PRODUCT_FORM = {
  id: null,
  category_id: '',
  name: '',
  slug: '',
  price: 0,
  stock: 0,
  sort_order: 0,
  image_url: '',
  description: '',
  highlights: '',
  manual_url: '',
  manual_text: '',
  manual_video_url: '',
  fulfillment_type: 'digital_stock',
  custom_form_fields: [],
  product_options: [],
  is_featured: false,
  is_unlimited_stock: false,
}

const DEFAULT_PRODUCT_OPTION_DRAFT = {
  editIndex: null,
  id: '',
  label: '',
  value: '',
  price_points: '',
}

const DEFAULT_COUPON_FORM = {
  id: null,
  code: '',
  points: 100,
  max_uses: 1,
  used_count: 0,
  expires_at: '',
  is_active: true,
}

const DEFAULT_PROMOTION_FORM = {
  id: null,
  product_id: '',
  title: '',
  discount_percent: '',
  discount_amount_points: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
}

const DEFAULT_DISCOUNT_COUPON_FORM = {
  id: null,
  code: '',
  title: '',
  discount_percent: '',
  discount_amount_points: '',
  max_uses: '',
  used_count: 0,
  expires_at: '',
  is_active: true,
}

const DEFAULT_POOL_FORM = {
  id: null,
  name: '',
  kind: 'digital_code',
  quantity_remaining: '',
  is_active: true,
}

const DEFAULT_STOCK_ITEM_EDIT = {
  id: null,
  payload: '',
  status: 'available',
}

const DEFAULT_MYSTERY_FORM = {
  prize_kind: 'product',
  prize_name: '',
  prize_product_id: '',
  weight: 1,
  remaining: 0,
  is_active: true,
}

const DEFAULT_MYSTERY_EDIT = {
  id: null,
  prize_name: '',
  weight: 1,
  remaining: 0,
  is_active: true,
}

const DEFAULT_MYSTERY_SIMULATION = {
  qty: 1,
  trials: 5000,
}

const DEFAULT_AUTOMATION_RULE_FORM = {
  id: null,
  name: '',
  trigger_type: 'support_unassigned_overdue',
  trigger_minutes: 30,
  action_severity: 'high',
  is_active: true,
}

function pickNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatNumber(value) {
  return pickNumber(value).toLocaleString('th-TH')
}

function formatMinutes(value) {
  const minutes = pickNumber(value)
  if (minutes <= 0) return '0m'
  if (minutes < 60) return `${minutes.toFixed(1)}m`
  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function formatDateTime(value) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleString('th-TH')
}

function formatRelativeTime(value, nowMs = Date.now()) {
  if (!value) return '-'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return '-'
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return `${Math.floor(diffSec / 86400)}d`
}

function getSupportStatusMeta(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'closed') {
    return {
      key,
      label: 'ปิดแล้ว',
      tone: 'border-slate-600/60 bg-slate-900/70 text-white/70',
    }
  }
  if (key === 'pending') {
    return {
      key,
      label: 'รอดำเนินการ',
      tone: 'border-amber-400/35 bg-amber-500/10 text-amber-100',
    }
  }
  return {
    key: key || 'open',
    label: 'เปิด',
    tone: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
  }
}

function getSupportWaitingMeta(ticket, nowMs = Date.now()) {
  const statusKey = String(ticket?.status || '').trim().toLowerCase()
  if (statusKey === 'closed') {
    return {
      key: 'closed',
      label: 'ปิดเคสแล้ว',
      ageMinutes: 0,
      tone: 'text-white/45',
    }
  }

  const lastRole = String(ticket?.last_sender_role || '').trim().toLowerCase()
  const waitingForStaff = !lastRole || lastRole === 'user'
  const refTime = ticket?.last_sender_at || ticket?.last_message_at || ticket?.created_at
  const refMs = refTime ? Date.parse(refTime) : Number.NaN
  const ageMinutes = Number.isFinite(refMs) ? Math.max(0, Math.floor((nowMs - refMs) / 60000)) : 0

  if (waitingForStaff) {
    if (ageMinutes >= 120) {
      return {
        key: 'staff_urgent',
        label: 'รอทีมซัพพอร์ต (เร่งด่วน)',
        ageMinutes,
        tone: 'text-red-200',
      }
    }
    if (ageMinutes >= 30) {
      return {
        key: 'staff_due',
        label: 'รอทีมซัพพอร์ต',
        ageMinutes,
        tone: 'text-amber-200',
      }
    }
    return {
      key: 'staff_wait',
      label: 'รอทีมซัพพอร์ต',
      ageMinutes,
      tone: 'text-cyan-200',
    }
  }

  return {
    key: 'user_wait',
    label: 'รอลูกค้าตอบกลับ',
    ageMinutes,
    tone: 'text-white/65',
  }
}

function formatDiscountSummary(row) {
  const percent = Number(row?.discount_percent)
  if (Number.isFinite(percent) && percent > 0) return `${Math.trunc(percent)}%`
  const amountPoints = Number(row?.discount_amount_points)
  if (Number.isFinite(amountPoints) && amountPoints > 0) return `${Math.trunc(amountPoints).toLocaleString('th-TH')} แต้ม`
  return '-'
}

function getPromotionStatusMeta(row, nowMs = Date.now()) {
  const active = Boolean(row?.is_active)
  const startsAtMs = row?.starts_at ? Date.parse(row.starts_at) : Number.NaN
  const endsAtMs = row?.ends_at ? Date.parse(row.ends_at) : Number.NaN

  if (!active) {
    return {
      key: 'inactive',
      label: 'ปิดใช้งาน',
      tone: 'border-slate-600/60 bg-slate-900/70 text-white/70',
    }
  }
  if (Number.isFinite(startsAtMs) && startsAtMs > nowMs) {
    return {
      key: 'scheduled',
      label: 'รอเริ่ม',
      tone: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100',
    }
  }
  if (Number.isFinite(endsAtMs) && endsAtMs < nowMs) {
    return {
      key: 'expired',
      label: 'หมดอายุ',
      tone: 'border-red-400/35 bg-red-500/10 text-red-100',
    }
  }
  return {
    key: 'active',
    label: 'กำลังใช้งาน',
    tone: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
  }
}

function getCouponStatusMeta(row, nowMs = Date.now()) {
  const active = Boolean(row?.is_active)
  const expiresAtMs = row?.expires_at ? Date.parse(row.expires_at) : Number.NaN
  const usedCount = Math.max(0, Number(row?.used_count || 0))
  const maxUsesRaw = row?.max_uses
  const maxUses = maxUsesRaw == null || maxUsesRaw === '' ? null : Number(maxUsesRaw)
  const exhausted = Number.isFinite(maxUses) && maxUses > 0 && usedCount >= maxUses

  if (!active) {
    return {
      key: 'inactive',
      label: 'ปิดใช้งาน',
      tone: 'border-slate-600/60 bg-slate-900/70 text-white/70',
    }
  }
  if (exhausted) {
    return {
      key: 'exhausted',
      label: 'ใช้ครบแล้ว',
      tone: 'border-amber-400/35 bg-amber-500/10 text-amber-100',
    }
  }
  if (Number.isFinite(expiresAtMs) && expiresAtMs < nowMs) {
    return {
      key: 'expired',
      label: 'หมดอายุ',
      tone: 'border-red-400/35 bg-red-500/10 text-red-100',
    }
  }
  return {
    key: 'active',
    label: 'พร้อมใช้',
    tone: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
  }
}

function isoToLocalInput(value) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = dt.getFullYear()
  const mm = pad(dt.getMonth() + 1)
  const dd = pad(dt.getDate())
  const hh = pad(dt.getHours())
  const min = pad(dt.getMinutes())
  const sec = pad(dt.getSeconds())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}`
}

function getErrorMessage(err, fallback = 'Request failed') {
  const apiMessage = String(err?.data?.message || '').trim()
  if (apiMessage) return apiMessage

  const apiError = String(err?.data?.error || '').trim()
  if (apiError) return apiError

  const status = Number(err?.status)
  if (status === 401) return 'Session expired. Please sign in again.'
  if (status === 403) return 'You do not have permission for this action.'

  const text = String(err?.message || '').trim()
  if (text && text !== 'request_failed') return text
  return fallback
}

function splitStockLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function computeMysteryChanceMeta(row) {
  const kind = String(row?.prize_kind || 'product')
  const weight = Math.max(0, Number(row?.weight || 0))
  const remaining = Math.max(0, Number(row?.remaining || 0))
  const availableStock = Math.max(0, Number(row?.prize_available_stock || 0))
  const active = Boolean(row?.is_active)
  const drawableCount = kind === 'salt' ? remaining : Math.min(remaining, availableStock)
  const hasStock = kind === 'salt' || availableStock > 0
  const canDraw = active && weight > 0 && remaining > 0 && hasStock && drawableCount > 0
  const stockFactor = kind === 'salt' ? 1 : Math.min(1, availableStock / Math.max(1, remaining))
  const depthFactor = Math.log2(drawableCount + 1)
  const effectiveWeight = canDraw ? weight * Math.max(0.05, stockFactor) * Math.max(0.02, depthFactor) : 0

  return {
    kind,
    weight,
    remaining,
    availableStock,
    drawableCount,
    effectiveWeight,
  }
}

function formatMysteryChancePercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '-'
  if (n >= 10) return `${n.toFixed(2)}%`
  if (n >= 1) return `${n.toFixed(3)}%`
  return `${n.toFixed(4)}%`
}

function formatMysteryEffectiveWeight(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '-'
  return n.toFixed(4)
}

function buildFallbackRbac(role) {
  const normalizedRole = String(role || '').trim().toLowerCase() || 'user'
  const modules = LOCAL_ROLE_MODULE_ACCESS[normalizedRole] || ['dashboard']
  const actions = Object.fromEntries(
    Object.entries(LOCAL_ROLE_ACTION_ACCESS).map(([action, roles]) => [action, roles.includes(normalizedRole)]),
  )
  return {
    role: normalizedRole,
    modules,
    actions,
  }
}

function makeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function normalizeCatalogFulfillmentType(value) {
  const key = String(value || '').trim().toLowerCase()
  return key === 'mystery_box' ? 'mystery_box' : 'digital_stock'
}

function normalizeCustomFormFieldId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function normalizeProductOptionId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function createCustomFormFieldDraft(type = 'text') {
  return {
    id: `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: '',
    type: type === 'checkbox' ? 'checkbox' : 'text',
    required: false,
  }
}

function normalizeProductCustomFormFields(source) {
  const fulfillmentType = String(source?.fulfillment_type || '').trim().toLowerCase()
  if (fulfillmentType === 'uid_form') {
    return [
      { id: 'uid', label: 'UID', type: 'text', required: true },
      { id: 'uid_confirmed', label: 'ฉันยืนยันว่า UID ถูกต้อง', type: 'checkbox', required: true },
    ]
  }
  if (fulfillmentType !== 'farm_form') return []

  if (Array.isArray(source?.farm_form_fields)) {
    return source.farm_form_fields.map((field, index) => {
      const label = String(field?.label || '').trim() || `Field ${index + 1}`
      const id =
        normalizeCustomFormFieldId(field?.id) ||
        normalizeCustomFormFieldId(label) ||
        `field_${index + 1}`
      const type = field?.type === 'checkbox' ? 'checkbox' : 'text'
      const required = Boolean(field?.required)
      return { id, label, type, required }
    })
  }

  const fields = []
  if (source?.farm_form_username_enabled !== false) {
    fields.push({ id: 'username', label: 'Username', type: 'text', required: true })
  }
  if (source?.farm_form_password_enabled !== false) {
    fields.push({ id: 'password', label: 'Password', type: 'text', required: true })
  }
  if (source?.farm_form_auth_key_enabled !== false) {
    fields.push({ id: 'auth_key', label: 'Auth Key', type: 'text', required: false })
  }
  return fields
}

function normalizeCustomFormFieldsForSubmit(fields) {
  if (!Array.isArray(fields)) return []
  const seen = new Set()
  const rows = []

  for (let i = 0; i < fields.length; i += 1) {
    const row = fields[i] || {}
    const label = String(row?.label || '').trim()
    const rawId = String(row?.id || '').trim()
    const type = row?.type === 'checkbox' ? 'checkbox' : 'text'
    const required = Boolean(row?.required)
    const hasAny = Boolean(label || rawId || required || type === 'checkbox')
    if (!hasAny) continue
    if (!label) throw new Error(`custom_field_${i + 1}_missing_label`)

    const normalizedId = normalizeCustomFormFieldId(rawId || label) || `field_${i + 1}`
    if (!normalizedId) throw new Error(`custom_field_${i + 1}_missing_id`)
    if (seen.has(normalizedId)) throw new Error(`custom_field_${i + 1}_duplicate_id`)

    seen.add(normalizedId)
    rows.push({
      id: normalizedId,
      label,
      type,
      required,
    })
  }

  return rows
}

function normalizeProductOptionsForSubmit(options) {
  if (!Array.isArray(options)) return []
  const seen = new Set()
  const rows = []

  for (let i = 0; i < options.length; i += 1) {
    const item = options[i] || {}
    const id = String(item?.id ?? '').trim()
    const label = String(item?.label ?? '').trim()
    const value = String(item?.value ?? '').trim()
    const priceRaw = item?.price_points
    const hasAny = Boolean(id || label || value || String(priceRaw ?? '').trim())
    if (!hasAny) continue
    if (!id) throw new Error(`option_${i + 1}_missing_id`)
    if (!label) throw new Error(`option_${i + 1}_missing_label`)
    if (seen.has(id)) throw new Error(`option_${i + 1}_duplicate_id`)

    const priceNum = Number(priceRaw)
    if (!Number.isFinite(priceNum) || priceNum < 0) throw new Error(`option_${i + 1}_invalid_price`)

    seen.add(id)
    rows.push({ id, label, value, price_points: priceNum })
  }

  return rows
}

function normalizeSupportAttachments(rawAttachments) {
  let source = rawAttachments
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    } catch {
      source = []
    }
  }
  if (!Array.isArray(source)) return []

  return source
    .map((item) => {
      const data = String(item?.data || item?.url || '').trim()
      if (!data) return null
      const mime = String(item?.mime || '').trim().toLowerCase()
      const isImage =
        mime.startsWith('image/') ||
        /^data:image\//i.test(data) ||
        /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(data)
      return {
        data,
        isImage,
      }
    })
    .filter(Boolean)
}

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

async function loadAnnouncementsModule() {
  const data = await fetchJson('/api/admin/announcements')
  return { announcements: data?.announcements || [] }
}

async function loadMessagesModule() {
  const data = await fetchJson('/api/admin/site-messages?limit=100&offset=0')
  return { messages: data?.messages || [], total: data?.total || 0 }
}

async function loadAutomationModule() {
  const [rulesRes, eventsRes] = await Promise.all([
    fetchJson('/api/admin/workflow-automation/rules?limit=100&offset=0'),
    fetchJson('/api/admin/workflow-automation/events?limit=100'),
  ])

  return {
    rules: Array.isArray(rulesRes?.rules) ? rulesRes.rules : [],
    events: Array.isArray(eventsRes?.events) ? eventsRes.events : [],
  }
}

async function loadFulfillmentModule(query) {
  const qs = new URLSearchParams({ limit: String(Math.max(1, pickNumber(query.limit) || 200)) })
  if (String(query.status || '').trim()) qs.set('status', String(query.status).trim())
  if (String(query.scope || '').trim() && String(query.scope || '').trim() !== 'all') qs.set('scope', String(query.scope).trim())
  if (String(query.assignedTo || '').trim()) qs.set('assigned_to', String(query.assignedTo).trim())
  if (String(query.search || '').trim()) qs.set('search', String(query.search).trim())

  const [requestsRes, boostersRes] = await Promise.all([
    fetchJson(`/api/admin/farm-requests?${qs.toString()}`, { method: 'GET' }),
    fetchJson('/api/admin/users?role=booster&limit=200', { method: 'GET' }),
  ])

  return {
    requests: Array.isArray(requestsRes?.items) ? requestsRes.items : [],
    boosters: Array.isArray(boostersRes?.users) ? boostersRes.users : [],
    total: pickNumber(requestsRes?.total),
    summary: requestsRes?.summary || { pending: 0, in_progress: 0, fulfilled: 0, cancelled: 0, unassigned: 0, mine: 0, over_sla: 0 },
  }
}

async function loadFulfillmentRequestDetail(requestId) {
  const rid = Number(requestId)
  if (!Number.isFinite(rid) || rid <= 0) return null
  const data = await fetchJson(`/api/admin/farm-requests/${rid}`, { method: 'GET' })
  return {
    request: data?.request || null,
    logs: Array.isArray(data?.logs) ? data.logs : [],
  }
}

async function loadLogsModule(query) {
  const qs = new URLSearchParams({
    limit: String(Math.max(1, pickNumber(query.limit) || 50)),
    offset: '0',
  })
  if (String(query.action || '').trim()) qs.set('action', String(query.action).trim())
  if (String(query.entity_type || '').trim()) qs.set('entity_type', String(query.entity_type).trim())

  const data = await fetchJson(`/api/admin/audit-logs?${qs.toString()}`, { method: 'GET' })
  return {
    logs: Array.isArray(data?.logs) ? data.logs : [],
  }
}

const DEFAULT_HOMEPAGE_SETTINGS = {
  hero_title: '',
  hero_subtitle: '',
  hero_description: '',
  hero_button_text: '',
  hero_button_link: '',
  showcase_enabled: true,
  showcase_title: '\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e41\u0e19\u0e30\u0e19\u0e33',
  showcase_scroll_interval: 2000,
  showcase_max_items: 12,
  featured_product_ids: [],
  showcase_product_ids: [],
  faq_items: [],
  trust_items: [],
}

function normalizeHomepageSettings(input) {
  const s = input && typeof input === 'object' ? input : {}
  const txt = (v, fb, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : fb }
  const num = (v, fb, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : fb }
  return {
    hero_title: txt(s.hero_title, DEFAULT_HOMEPAGE_SETTINGS.hero_title, 100),
    hero_subtitle: txt(s.hero_subtitle, DEFAULT_HOMEPAGE_SETTINGS.hero_subtitle, 100),
    hero_description: txt(s.hero_description, DEFAULT_HOMEPAGE_SETTINGS.hero_description, 500),
    hero_button_text: txt(s.hero_button_text, DEFAULT_HOMEPAGE_SETTINGS.hero_button_text, 40),
    hero_button_link: txt(s.hero_button_link, DEFAULT_HOMEPAGE_SETTINGS.hero_button_link, 200),
    showcase_enabled: s.showcase_enabled === false ? false : true,
    showcase_title: txt(s.showcase_title, DEFAULT_HOMEPAGE_SETTINGS.showcase_title, 80),
    showcase_scroll_interval: num(s.showcase_scroll_interval, DEFAULT_HOMEPAGE_SETTINGS.showcase_scroll_interval, 500, 30000),
    showcase_max_items: num(s.showcase_max_items, DEFAULT_HOMEPAGE_SETTINGS.showcase_max_items, 1, 50),
    featured_product_ids: (Array.isArray(s.featured_product_ids) ? s.featured_product_ids : []).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0).slice(0, 20),
    showcase_product_ids: (Array.isArray(s.showcase_product_ids) ? s.showcase_product_ids : []).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0).slice(0, 50),
    faq_items: (Array.isArray(s.faq_items) ? s.faq_items : []).slice(0, 20).map((i) => ({ question: String(i?.question ?? '').slice(0, 200), answer: String(i?.answer ?? '').slice(0, 1000) })).filter((i) => i.question.trim() && i.answer.trim()),
    trust_items: (Array.isArray(s.trust_items) ? s.trust_items : []).slice(0, 10).map((i) => ({ icon: String(i?.icon ?? '').slice(0, 2000), title: String(i?.title ?? '').slice(0, 60), desc: String(i?.desc ?? '').slice(0, 200) })).filter((i) => i.title.trim()),
  }
}

const DEFAULT_SITE_SETTINGS = {
  site_url: '',
  site_description: '',
  og_image_url: '',
  footer_tagline: '',
  footer_links: [],
  social_links: [],
  announcements: [],
  tos_content: '',
}

function normalizeSiteSettings(input) {
  const s = input && typeof input === 'object' ? input : {}
  const txt = (v, fb, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : fb }
  return {
    site_url: txt(s.site_url, DEFAULT_SITE_SETTINGS.site_url, 200),
    site_description: txt(s.site_description, DEFAULT_SITE_SETTINGS.site_description, 500),
    og_image_url: txt(s.og_image_url, DEFAULT_SITE_SETTINGS.og_image_url, 500),
    footer_tagline: txt(s.footer_tagline, DEFAULT_SITE_SETTINGS.footer_tagline, 100),
    footer_links: (Array.isArray(s.footer_links) ? s.footer_links : []).slice(0, 12).map((i) => ({ label: String(i?.label ?? '').slice(0, 40), url: String(i?.url ?? '').slice(0, 300) })).filter((i) => i.label.trim() && i.url.trim()),
    social_links: (Array.isArray(s.social_links) ? s.social_links : []).slice(0, 10).map((i) => ({ platform: String(i?.platform ?? '').slice(0, 30), url: String(i?.url ?? '').slice(0, 300) })).filter((i) => i.platform.trim() && i.url.trim()),
    announcements: (Array.isArray(s.announcements) ? s.announcements : []).slice(0, 10).map((i) => ({ enabled: i?.enabled === true, text: String(i?.text ?? '').slice(0, 300), link: String(i?.link ?? '').slice(0, 300), bg: String(i?.bg ?? '').slice(0, 200), push_to_inbox: i?.push_to_inbox === true })).filter((i) => i.text.trim()),
    tos_content: txt(s.tos_content, DEFAULT_SITE_SETTINGS.tos_content, 50000),
  }
}

async function loadSettingsModule() {
  const data = await fetchJson('/api/admin/ui-settings', { method: 'GET' })
  return {
    image_settings: normalizeUiImageSettings(data?.image_settings),
    branding_settings: normalizeUiBrandingSettings(data?.branding_settings),
    homepage_settings: normalizeHomepageSettings(data?.homepage_settings),
    site_settings: normalizeSiteSettings(data?.site_settings),
  }
}

async function loadDashboardModule() {
  const results = await Promise.allSettled([
    fetchJson('/api/admin/dashboard/overview?days=14&urgent_minutes=60&urgent_limit=8'),
    fetchJson('/api/admin/dashboard/ops-pulse?days=14&limit=14&support_sla_minutes=30&farm_sla_minutes=60'),
    fetchJson('/api/admin/users?limit=1'),
  ])

  return normalizeDashboardData(results)
}

async function loadUsersModule(query) {
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
  return {
    users: Array.isArray(data?.users) ? data.users : [],
    total,
    summary: data?.summary || null,
    page,
    limit,
    totalPages,
  }
}

async function loadSupportTicketDetail(ticketId) {
  const tid = Number(ticketId)
  if (!Number.isFinite(tid) || tid <= 0) return { selectedTicketId: null, selectedTicket: null, messages: [] }

  const data = await fetchJson(`/api/admin/support-tickets/${tid}`, { method: 'GET' })
  return {
    selectedTicketId: tid,
    selectedTicket: data?.ticket || null,
    messages: Array.isArray(data?.messages) ? data.messages : [],
  }
}

async function loadSupportModule(query, selectedTicketId) {
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
        open: pickNumber(ticketData.summary.open),
        pending: pickNumber(ticketData.summary.pending),
        closed: pickNumber(ticketData.summary.closed),
        unassigned: pickNumber(ticketData.summary.unassigned),
        mine: pickNumber(ticketData.summary.mine),
        needs_reply: pickNumber(ticketData.summary.needs_reply),
        over_sla: pickNumber(ticketData.summary.over_sla),
      }
    : {
        open: 0,
        pending: 0,
        closed: 0,
        unassigned: 0,
        mine: 0,
        needs_reply: 0,
        over_sla: 0,
      }
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
    } catch {
      selectedTicket = null
      messages = []
    }
  }

  return {
    tickets,
    total: Number.isFinite(total) ? total : tickets.length,
    summary,
    agents,
    selectedTicketId: Number.isFinite(targetId) ? targetId : null,
    selectedTicket,
    messages,
  }
}

async function loadCatalogModule() {
  const [categoriesRes, productsRes] = await Promise.all([
    fetchJson('/api/admin/categories'),
    fetchJson('/api/admin/products'),
  ])

  return {
    categories: Array.isArray(categoriesRes?.categories) ? categoriesRes.categories : [],
    products: Array.isArray(productsRes?.products) ? productsRes.products : [],
  }
}

async function loadPromotionsModule() {
  const [couponsRes, promotionsRes, discountCouponsRes, productsRes] = await Promise.all([
    fetchJson('/api/admin/coupons'),
    fetchJson('/api/admin/promotions'),
    fetchJson('/api/admin/discount-coupons'),
    fetchJson('/api/admin/products'),
  ])

  return {
    coupons: Array.isArray(couponsRes?.coupons) ? couponsRes.coupons : [],
    promotions: Array.isArray(promotionsRes?.promotions) ? promotionsRes.promotions : [],
    discountCoupons: Array.isArray(discountCouponsRes?.coupons) ? discountCouponsRes.coupons : [],
    products: Array.isArray(productsRes?.products) ? productsRes.products : [],
  }
}

async function loadStockModule() {
  const [productsRes, poolsRes] = await Promise.all([
    fetchJson('/api/admin/products'),
    fetchJson('/api/admin/stock-pools?limit=200&offset=0'),
  ])

  return {
    products: Array.isArray(productsRes?.products) ? productsRes.products : [],
    pools: Array.isArray(poolsRes?.pools) ? poolsRes.pools : [],
    stockItems: [],
    stockSummary: null,
    poolItems: [],
    poolSummary: null,
    poolBindings: [],
  }
}

function DataCard({ title, value, tone = 'text-white', subtitle = '' }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-3">
      <div className="text-xs text-white/55">{title}</div>
      <div className={`mt-1 text-2xl font-black ${tone}`}>{value}</div>
      {subtitle ? <div className="mt-1 text-[11px] text-white/45">{subtitle}</div> : null}
    </div>
  )
}

function FieldLabel({ children }) {
  return <div className="mb-1 text-[11px] font-semibold text-white/70">{children}</div>
}

function ModulePlaceholder({ title }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-900/55 p-4 text-sm text-white/70">
      <div className="font-semibold text-white">{title} อยู่ระหว่างปรับโครงสร้างใหม่ทั้งหมด</div>
      <div className="mt-1">กำลังย้าย state model, การเชื่อมต่อ API และนโยบายสิทธิ์ของโมดูลนี้ไปสู่สถาปัตยกรรมใหม่</div>
    </div>
  )
}

export default function AdminV2() {
  const [params, setParams] = useSearchParams()
  const [session, setSession] = useState({ status: 'loading', me: null, error: '' })
  const [usersQuery, setUsersQuery] = useState(DEFAULT_USERS_QUERY)
  const [supportQuery, setSupportQuery] = useState(DEFAULT_SUPPORT_QUERY)
  const [fulfillmentQuery, setFulfillmentQuery] = useState(DEFAULT_FULFILLMENT_QUERY)
  const [logsQuery, setLogsQuery] = useState(DEFAULT_LOGS_QUERY)
  const [moduleStore, setModuleStore] = useState({})
  const [usersActionState, setUsersActionState] = useState({ status: 'idle', message: '' })
  const [usersSelection, setUsersSelection] = useState([])
  const [usersBulkDraft, setUsersBulkDraft] = useState({ role: 'user', points: '', reason: 'admin_v2_bulk' })
  const [usersDetail, setUsersDetail] = useState({ status: 'idle', userId: null, data: null, error: '' })
  const [usersProfileDraft, setUsersProfileDraft] = useState({ email: '', username: '', display_name: '', avatar_url: '' })
  const [usersPasswordDraft, setUsersPasswordDraft] = useState('')
  const [supportActionState, setSupportActionState] = useState({ status: 'idle', message: '' })
  const [supportDraft, setSupportDraft] = useState({ assignTo: '', status: 'open', reply: '' })
  const [supportReplyAttachments, setSupportReplyAttachments] = useState([])
  const [supportSearchDraft, setSupportSearchDraft] = useState(DEFAULT_SUPPORT_QUERY.search)
  const [supportPreviewImage, setSupportPreviewImage] = useState('')
  const [supportPreviewActive, setSupportPreviewActive] = useState(false)
  const [catalogFilter, setCatalogFilter] = useState(DEFAULT_CATALOG_FILTER)
  const [catalogView, setCatalogView] = useState('products')
  const [catalogPage, setCatalogPage] = useState(1)
  const [catalogActionState, setCatalogActionState] = useState({ status: 'idle', message: '' })
  const [catalogErrors, setCatalogErrors] = useState({ category: '', product: '' })
  const [categoryForm, setCategoryForm] = useState(DEFAULT_CATEGORY_FORM)
  const [productForm, setProductForm] = useState(DEFAULT_PRODUCT_FORM)
  const [productOptionDraft, setProductOptionDraft] = useState(DEFAULT_PRODUCT_OPTION_DRAFT)
  const [productOptionError, setProductOptionError] = useState('')
  const [promotionsActionState, setPromotionsActionState] = useState({ status: 'idle', message: '' })
  const [promotionsErrors, setPromotionsErrors] = useState({ coupon: '', promotion: '', discount: '' })
  const [couponForm, setCouponForm] = useState(DEFAULT_COUPON_FORM)
  const [promotionForm, setPromotionForm] = useState(DEFAULT_PROMOTION_FORM)
  const [discountCouponForm, setDiscountCouponForm] = useState(DEFAULT_DISCOUNT_COUPON_FORM)
  const [promotionsScope, setPromotionsScope] = useState('all')
  const [promotionsSearch, setPromotionsSearch] = useState('')
  const [promotionsStatusFilter, setPromotionsStatusFilter] = useState('all')
  const [stockActionState, setStockActionState] = useState({ status: 'idle', message: '' })
  const [stockErrors, setStockErrors] = useState({ product: '', pool: '', poolItem: '', binding: '' })
  const [stockProductId, setStockProductId] = useState('')
  const [stockText, setStockText] = useState('')
  const [stockItemEdit, setStockItemEdit] = useState(DEFAULT_STOCK_ITEM_EDIT)
  const [poolForm, setPoolForm] = useState(DEFAULT_POOL_FORM)
  const [poolSelectedId, setPoolSelectedId] = useState('')
  const [poolItemsText, setPoolItemsText] = useState('')
  const [poolItemEdit, setPoolItemEdit] = useState(DEFAULT_STOCK_ITEM_EDIT)
  const [poolBindProductId, setPoolBindProductId] = useState('')
  const [poolBindingOptionId, setPoolBindingOptionId] = useState('')
  const [poolBindingPoolId, setPoolBindingPoolId] = useState('')
  const [mysteryBoxProductId, setMysteryBoxProductId] = useState('')
  const [mysteryPrizes, setMysteryPrizes] = useState([])
  const [mysteryForm, setMysteryForm] = useState(DEFAULT_MYSTERY_FORM)
  const [mysteryFormStockText, setMysteryFormStockText] = useState('')
  const [mysteryEdit, setMysteryEdit] = useState(DEFAULT_MYSTERY_EDIT)
  const [mysteryPrizeStockPrizeId, setMysteryPrizeStockPrizeId] = useState('')
  const [mysteryPrizeStockText, setMysteryPrizeStockText] = useState('')
  const [mysteryPrizeStockItems, setMysteryPrizeStockItems] = useState([])
  const [mysteryPrizeStockItemEdit, setMysteryPrizeStockItemEdit] = useState(DEFAULT_STOCK_ITEM_EDIT)
  const [mysterySimulationDraft, setMysterySimulationDraft] = useState(DEFAULT_MYSTERY_SIMULATION)
  const [mysterySimulation, setMysterySimulation] = useState(null)
  const [mysteryActionState, setMysteryActionState] = useState({ status: 'idle', message: '' })
  const [mysteryError, setMysteryError] = useState('')
  const [automationRuleForm, setAutomationRuleForm] = useState(DEFAULT_AUTOMATION_RULE_FORM)
  const [automationActionState, setAutomationActionState] = useState({ status: 'idle', message: '' })
  const [automationError, setAutomationError] = useState('')
  const [fulfillmentActionState, setFulfillmentActionState] = useState({ status: 'idle', message: '' })
  const [fulfillmentError, setFulfillmentError] = useState('')
  const [fulfillForm, setFulfillForm] = useState({ id: null, payload: '' })
  const [cancelForm, setCancelForm] = useState({ id: null, note: '' })
  const [assignForm, setAssignForm] = useState({ id: null, booster_id: '' })
  const [fulfillmentSelectedId, setFulfillmentSelectedId] = useState(null)
  const [fulfillmentDetail, setFulfillmentDetail] = useState(null)
  const [fulfillmentDetailLoading, setFulfillmentDetailLoading] = useState(false)
  const [fulfillmentActiveAction, setFulfillmentActiveAction] = useState(null)
  const [fulfillmentSearchDraft, setFulfillmentSearchDraft] = useState('')
  const fulfillmentStreamRef = useRef(null)
  const fulfillmentRefreshTimerRef = useRef(null)
  const refreshFulfillmentSilentlyRef = useRef(null)
  const [logsActionState, setLogsActionState] = useState({ status: 'idle', message: '' })
  const [logsError, setLogsError] = useState('')
  const [settingsActionState, setSettingsActionState] = useState({ status: 'idle', message: '' })
  const [settingsError, setSettingsError] = useState('')
  const [uiImageSettings, setUiImageSettings] = useState(DEFAULT_UI_IMAGE_SETTINGS)
  const [uiBrandingSettings, setUiBrandingSettings] = useState(DEFAULT_UI_BRANDING_SETTINGS)
  const [homepageSettings, setHomepageSettings] = useState(DEFAULT_HOMEPAGE_SETTINGS)
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SITE_SETTINGS)
  const [hpProductSearch, setHpProductSearch] = useState('')
  const [hpProductResults, setHpProductResults] = useState([])
  const [hpProductCache, setHpProductCache] = useState({})
  const [hpPickerTarget, setHpPickerTarget] = useState(null)
  const [dragNavLinkIndex, setDragNavLinkIndex] = useState(null)
  const [settingsFieldErrors, setSettingsFieldErrors] = useState(EMPTY_SETTINGS_FIELD_ERRORS)
  const [rbacState, setRbacState] = useState({ status: 'idle', data: null, error: '' })
  const [auditReplayState, setAuditReplayState] = useState({ status: 'idle', log: null, replay: [], error: '' })
  const [msgDraft, setMsgDraft] = useState({ target_type: 'global', target_user_id: '', title: '', body: '' })
  const [msgSending, setMsgSending] = useState(false)
  const [msgSentOk, setMsgSentOk] = useState('')
  const [msgError, setMsgError] = useState('')
  const [annEditId, setAnnEditId] = useState(null)
  const [annForm, setAnnForm] = useState({ title: '', text: '', link: '', bg: '', enabled: true, push_to_inbox: false, icon: '', start_at: '', end_at: '' })
  const [annSaving, setAnnSaving] = useState(false)
  const [annMsg, setAnnMsg] = useState({ type: '', text: '' })
  const requestSeqRef = useRef(0)
  const adminChatScrollRef = useRef(null)
  const supportPreviewCloseTimerRef = useRef(null)
  const supportRefreshTimerRef = useRef(null)
  const supportStreamRef = useRef(null)
  const refreshSupportSilentlyRef = useRef(null)

  const activeModule = useMemo(() => {
    const requested = String(params.get('module') || 'dashboard').trim().toLowerCase()
    return MODULES.some((m) => m.id === requested) ? requested : 'dashboard'
  }, [params])

  const activeModuleState = moduleStore[activeModule] || { status: 'idle', data: null, error: '', loadedAt: 0 }
  const role = String(session?.me?.user?.role || '').trim().toLowerCase() || 'user'
  const allowedModuleIds = useMemo(() => {
    const fromApi = Array.isArray(rbacState?.data?.modules) ? rbacState.data.modules : null
    if (fromApi && fromApi.length > 0) return fromApi
    return LOCAL_ROLE_MODULE_ACCESS[role] || ['dashboard']
  }, [rbacState?.data?.modules, role])

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      setSession({ status: 'loading', me: null, error: '' })
      setRbacState({ status: 'idle', data: null, error: '' })
      try {
        const me = await fetchJson('/api/me')
        const role = String(me?.user?.role || '').toLowerCase()
        if (!me?.user || role === 'user') {
          if (!cancelled) setSession({ status: 'forbidden', me: null, error: '' })
          return
        }

        let nextRbac = buildFallbackRbac(role)
        let rbacStatus = 'ready'
        let rbacError = ''
        try {
          const rbac = await fetchJson('/api/admin/rbac/matrix', { method: 'GET' })
          nextRbac = {
            role: String(rbac?.role || role).toLowerCase(),
            modules: Array.isArray(rbac?.modules) ? rbac.modules : nextRbac.modules,
            actions: rbac?.actions && typeof rbac.actions === 'object' ? rbac.actions : nextRbac.actions,
          }
        } catch (rbacErr) {
          rbacStatus = 'error'
          rbacError = getErrorMessage(rbacErr, 'Unable to load RBAC matrix, fallback policy applied')
        }

        if (!cancelled) {
          setSession({ status: 'ready', me, error: '' })
          setRbacState({ status: rbacStatus, data: nextRbac, error: rbacError })
        }
      } catch (err) {
        const status = Number(err?.status)
        if (status === 401) {
          setAuthToken(null)
          window.location.assign('/login')
          return
        }
        if (status === 403) {
          if (!cancelled) setSession({ status: 'forbidden', me: null, error: '' })
          return
        }
        if (!cancelled) setSession({ status: 'error', me: null, error: getErrorMessage(err, 'Unable to load admin session') })
      }
    }

    loadSession()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (session.status !== 'ready') return
    if (allowedModuleIds.includes(activeModule)) return
    const fallbackModule = allowedModuleIds[0] || 'dashboard'
    if (!fallbackModule) return
    const next = new URLSearchParams(params)
    next.set('module', fallbackModule)
    setParams(next)
  }, [session.status, activeModule, allowedModuleIds, params, setParams])

  useEffect(() => {
    if (session.status !== 'ready') return

    if (activeModule === 'users') {
      void loadModule('users')
      return
    }

    if (activeModule === 'support') {
      void loadModule('support')
      return
    }

    if (activeModule === 'logs') {
      void loadModule('logs')
      return
    }

    if (activeModule === 'settings') {
      void loadModule('settings')
      return
    }

    if (activeModule === 'fulfillment') {
      void loadModule('fulfillment')
      return
    }

    if (activeModule === 'catalog') {
      void loadModule('catalog')
      return
    }

    if (activeModule === 'promotions') {
      void loadModule('promotions')
      return
    }

    if (activeModule === 'stock') {
      void loadModule('stock')
      return
    }

    if (activeModule === 'automation') {
      void loadModule('automation')
      return
    }

    if (activeModule === 'announcements') {
      void loadModule('announcements')
      return
    }

    if (activeModule === 'messages') {
      void loadModule('messages')
      return
    }

    if (activeModule === 'dashboard') {
      void loadModule('dashboard')
      return
    }

    setModuleStore((prev) => ({
      ...prev,
      [activeModule]: {
        status: 'ready',
        data: null,
        error: '',
        loadedAt: Date.now(),
      },
    }))
  }, [activeModule, session.status, usersQuery, supportQuery, fulfillmentQuery, logsQuery])

  useEffect(() => {
    return () => {
      if (supportPreviewCloseTimerRef.current) {
        window.clearTimeout(supportPreviewCloseTimerRef.current)
      }
      if (supportRefreshTimerRef.current) {
        window.clearTimeout(supportRefreshTimerRef.current)
      }
      if (supportStreamRef.current) {
        try {
          supportStreamRef.current.close()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  useEffect(() => {
    setSupportSearchDraft(String(supportQuery.search || ''))
  }, [supportQuery.search])

  useEffect(() => {
    if (!supportPreviewImage) return
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        closeSupportPreview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [supportPreviewImage])

  useEffect(() => {
    if (activeModule !== 'settings') return
    if (activeModuleState.status !== 'ready') return
    const data = activeModuleState.data || null
    if (!data) return
    setUiImageSettings(normalizeUiImageSettings(data?.image_settings))
    setUiBrandingSettings(normalizeUiBrandingSettings(data?.branding_settings))
    const hp = normalizeHomepageSettings(data?.homepage_settings)
    setHomepageSettings(hp)
    setSiteSettings(normalizeSiteSettings(data?.site_settings))
    setSettingsFieldErrors(EMPTY_SETTINGS_FIELD_ERRORS)
    const allIds = [...new Set([...(hp.featured_product_ids || []), ...(hp.showcase_product_ids || [])])]
    if (allIds.length > 0) {
      fetchJson(`/api/products/by-ids?ids=${allIds.join(',')}`)
        .then((res) => {
          const prods = res?.products || []
          setHpProductCache((prev) => {
            const next = { ...prev }
            for (const p of prods) next[Number(p.id)] = p
            return next
          })
        })
        .catch(() => {})
    }
  }, [activeModule, activeModuleState.status, activeModuleState.data])

  useEffect(() => {
    if (session.status !== 'ready') return
    if (activeModule !== 'dashboard') return
    const intervalId = window.setInterval(() => {
      void loadModule('dashboard')
    }, 15000)
    return () => window.clearInterval(intervalId)
  }, [session.status, activeModule])

  useEffect(() => {
    refreshSupportSilentlyRef.current = refreshSupportSilently
  }, [refreshSupportSilently])

  useEffect(() => {
    if (activeModule !== 'support') return
    const node = adminChatScrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [activeModule, activeModuleState.data])

  useEffect(() => {
    if (session.status !== 'ready') return
    if (activeModule !== 'support') return

    if (supportStreamRef.current) {
      try {
        supportStreamRef.current.close()
      } catch {
        // ignore
      }
      supportStreamRef.current = null
    }

    const stream = new EventSource(resolveApiUrl('/api/admin/support-tickets/stream'), { withCredentials: true })
    supportStreamRef.current = stream

    const refreshSupport = () => {
      if (supportRefreshTimerRef.current) {
        window.clearTimeout(supportRefreshTimerRef.current)
      }
      supportRefreshTimerRef.current = window.setTimeout(async () => {
        try {
          const refresh = refreshSupportSilentlyRef.current
          if (typeof refresh === 'function') await refresh()
        } finally {
          supportRefreshTimerRef.current = null
        }
      }, 240)
    }

    const onTicketUpdate = (event) => {
      try {
        JSON.parse(event?.data || '{}')
        refreshSupport()
      } catch {
        refreshSupport()
      }
    }

    stream.addEventListener('ticket_update', onTicketUpdate)
    stream.onerror = () => {
      // browser handles reconnect automatically
    }

    return () => {
      if (supportRefreshTimerRef.current) {
        window.clearTimeout(supportRefreshTimerRef.current)
        supportRefreshTimerRef.current = null
      }
      try {
        stream.removeEventListener('ticket_update', onTicketUpdate)
      } catch {
        // ignore
      }
      try {
        stream.close()
      } catch {
        // ignore
      }
      if (supportStreamRef.current === stream) supportStreamRef.current = null
    }
  }, [session.status, activeModule])

  useEffect(() => {
    refreshFulfillmentSilentlyRef.current = refreshFulfillmentSilently
  })

  useEffect(() => {
    if (session.status !== 'ready') return
    if (activeModule !== 'fulfillment') return

    if (fulfillmentStreamRef.current) {
      try { fulfillmentStreamRef.current.close() } catch { /* ignore */ }
      fulfillmentStreamRef.current = null
    }

    const stream = new EventSource(resolveApiUrl('/api/admin/farm-requests/stream'), { withCredentials: true })
    fulfillmentStreamRef.current = stream

    const debouncedRefresh = () => {
      if (fulfillmentRefreshTimerRef.current) window.clearTimeout(fulfillmentRefreshTimerRef.current)
      fulfillmentRefreshTimerRef.current = window.setTimeout(async () => {
        try {
          const refresh = refreshFulfillmentSilentlyRef.current
          if (typeof refresh === 'function') await refresh()
        } finally {
          fulfillmentRefreshTimerRef.current = null
        }
      }, 300)
    }

    const onUpdate = () => { debouncedRefresh() }
    stream.addEventListener('fulfillment_update', onUpdate)
    stream.onerror = () => { /* browser handles reconnect */ }

    return () => {
      if (fulfillmentRefreshTimerRef.current) {
        window.clearTimeout(fulfillmentRefreshTimerRef.current)
        fulfillmentRefreshTimerRef.current = null
      }
      try { stream.removeEventListener('fulfillment_update', onUpdate) } catch { /* ignore */ }
      try { stream.close() } catch { /* ignore */ }
      if (fulfillmentStreamRef.current === stream) fulfillmentStreamRef.current = null
    }
  }, [session.status, activeModule])

  async function loadModule(moduleId) {
    const requestId = ++requestSeqRef.current
    const current = moduleId || activeModule
    const role = String(session?.me?.user?.role || '').trim().toLowerCase()

    setModuleStore((prev) => ({
      ...prev,
      [current]: {
        ...(prev[current] || {}),
        status: 'loading',
        error: '',
      },
    }))

    try {
      let data = null

      if (current === 'dashboard') {
        data = await loadDashboardModule()
      } else if (current === 'users') {
        data = await loadUsersModule(usersQuery)
      } else if (current === 'support') {
        const prevSupport = moduleStore?.support?.data || null
        data = await loadSupportModule(supportQuery, prevSupport?.selectedTicketId)
      } else if (current === 'fulfillment') {
        data = await loadFulfillmentModule(fulfillmentQuery)
      } else if (current === 'logs') {
        data = role === 'owner' ? await loadLogsModule(logsQuery) : { logs: [] }
      } else if (current === 'settings') {
        data = role === 'admin' || role === 'owner' ? await loadSettingsModule() : {
          image_settings: normalizeUiImageSettings(DEFAULT_UI_IMAGE_SETTINGS),
          branding_settings: normalizeUiBrandingSettings(DEFAULT_UI_BRANDING_SETTINGS),
          homepage_settings: normalizeHomepageSettings(DEFAULT_HOMEPAGE_SETTINGS),
        }
      } else if (current === 'catalog') {
        data = await loadCatalogModule()
      } else if (current === 'promotions') {
        data = await loadPromotionsModule()
      } else if (current === 'stock') {
        data = await loadStockModule()
      } else if (current === 'automation') {
        data = await loadAutomationModule()
      } else if (current === 'announcements') {
        data = await loadAnnouncementsModule()
      } else if (current === 'messages') {
        data = await loadMessagesModule()
      }

      if (requestId !== requestSeqRef.current) return

      setModuleStore((prev) => ({
        ...prev,
        [current]: {
          status: 'ready',
          data,
          error: '',
          loadedAt: Date.now(),
        },
      }))
    } catch (err) {
      if (requestId !== requestSeqRef.current) return

      setModuleStore((prev) => ({
        ...prev,
        [current]: {
          status: 'error',
          data: null,
          error: getErrorMessage(err, `Unable to load ${current}`),
          loadedAt: Date.now(),
        },
      }))
    }
  }

  function logout() {
    setAuthToken(null)
    window.location.assign('/login')
  }

  function selectModule(id) {
    const next = new URLSearchParams(params)
    next.set('module', id)
    setParams(next)
    setUsersActionState({ status: 'idle', message: '' })
    setUsersSelection([])
    setUsersBulkDraft({ role: 'user', points: '', reason: 'admin_v2_bulk' })
    setUsersDetail({ status: 'idle', userId: null, data: null, error: '' })
    setUsersProfileDraft({ email: '', username: '', display_name: '', avatar_url: '' })
    setUsersPasswordDraft('')
    setSupportActionState({ status: 'idle', message: '' })
    setSupportDraft({ assignTo: '', status: 'open', reply: '' })
    setSupportReplyAttachments([])
    setSupportSearchDraft(String(supportQuery.search || ''))
    setSupportPreviewImage('')
    setSupportPreviewActive(false)
    setFulfillmentActionState({ status: 'idle', message: '' })
    setFulfillmentError('')
    setFulfillForm({ id: null, payload: '' })
    setCancelForm({ id: null, note: '' })
    setAssignForm({ id: null, booster_id: '' })
    setFulfillmentSelectedId(null)
    setFulfillmentDetail(null)
    setFulfillmentDetailLoading(false)
    setFulfillmentActiveAction(null)
    setFulfillmentSearchDraft(String(fulfillmentQuery.search || ''))
    setLogsActionState({ status: 'idle', message: '' })
    setLogsError('')
    setSettingsActionState({ status: 'idle', message: '' })
    setSettingsError('')
    setSettingsFieldErrors(EMPTY_SETTINGS_FIELD_ERRORS)
    setDragNavLinkIndex(null)
    setCatalogActionState({ status: 'idle', message: '' })
    setCatalogErrors({ category: '', product: '' })
    setCatalogView('products')
    setCatalogPage(1)
    setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
    setProductOptionError('')
    setPromotionsActionState({ status: 'idle', message: '' })
    setPromotionsErrors({ coupon: '', promotion: '', discount: '' })
    setStockActionState({ status: 'idle', message: '' })
    setStockErrors({ product: '', pool: '', poolItem: '', binding: '' })
    setStockProductId('')
    setStockText('')
    setStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
    setPoolForm(DEFAULT_POOL_FORM)
    setPoolSelectedId('')
    setPoolItemsText('')
    setPoolItemEdit(DEFAULT_STOCK_ITEM_EDIT)
    setPoolBindProductId('')
    setPoolBindingOptionId('')
    setPoolBindingPoolId('')
    setMysteryBoxProductId('')
    setMysteryPrizes([])
    setMysteryForm(DEFAULT_MYSTERY_FORM)
    setMysteryFormStockText('')
    setMysteryEdit(DEFAULT_MYSTERY_EDIT)
    setMysteryPrizeStockPrizeId('')
    setMysteryPrizeStockText('')
    setMysteryPrizeStockItems([])
    setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
    setMysterySimulationDraft(DEFAULT_MYSTERY_SIMULATION)
    setMysterySimulation(null)
    setMysteryActionState({ status: 'idle', message: '' })
    setMysteryError('')
    setAutomationRuleForm(DEFAULT_AUTOMATION_RULE_FORM)
    setAutomationActionState({ status: 'idle', message: '' })
    setAutomationError('')
    setAuditReplayState({ status: 'idle', log: null, replay: [], error: '' })
  }

  function patchUsersQuery(next) {
    setUsersQuery((prev) => ({ ...prev, ...next }))
  }

  function patchSupportQuery(next) {
    setSupportQuery((prev) => ({ ...prev, ...next }))
  }

  function patchFulfillmentQuery(next) {
    setFulfillmentQuery((prev) => ({ ...prev, ...next }))
  }

  function patchLogsQuery(next) {
    setLogsQuery((prev) => ({ ...prev, ...next }))
  }

  function patchCatalogFilter(next) {
    setCatalogFilter((prev) => ({ ...prev, ...next }))
  }

  function patchFulfillmentData(mutator) {
    setModuleStore((prev) => {
      const current = prev?.fulfillment || { status: 'ready', data: null, error: '', loadedAt: 0 }
      const currentData = current?.data || { requests: [], boosters: [] }
      const nextData = typeof mutator === 'function' ? mutator(currentData) : currentData
      return {
        ...prev,
        fulfillment: {
          ...current,
          data: nextData,
          loadedAt: Date.now(),
        },
      }
    })
  }

  function patchAutomationData(mutator) {
    setModuleStore((prev) => {
      const current = prev?.automation || { status: 'ready', data: null, error: '', loadedAt: 0 }
      const currentData = current?.data || { rules: [], events: [] }
      const nextData = typeof mutator === 'function' ? mutator(currentData) : currentData
      return {
        ...prev,
        automation: {
          ...current,
          data: nextData,
          loadedAt: Date.now(),
        },
      }
    })
  }

  function openSupportPreview(imageUrl) {
    const src = String(imageUrl || '').trim()
    if (!src) return
    if (supportPreviewCloseTimerRef.current) {
      window.clearTimeout(supportPreviewCloseTimerRef.current)
      supportPreviewCloseTimerRef.current = null
    }
    setSupportPreviewImage(src)
    setSupportPreviewActive(false)
    window.requestAnimationFrame(() => {
      setSupportPreviewActive(true)
    })
  }

  function closeSupportPreview() {
    setSupportPreviewActive(false)
    if (supportPreviewCloseTimerRef.current) {
      window.clearTimeout(supportPreviewCloseTimerRef.current)
    }
    supportPreviewCloseTimerRef.current = window.setTimeout(() => {
      setSupportPreviewImage('')
      supportPreviewCloseTimerRef.current = null
    }, 180)
  }

  function cloneProductToDraft(row) {
    const baseSlug = String(row?.slug || '').trim()
    setCatalogView('products')
    setCatalogErrors((prev) => ({ ...prev, product: '' }))
    setProductOptionError('')
    setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
    setProductForm({
      id: null,
      category_id: row?.category_id == null ? '' : String(row.category_id),
      name: String(row?.name || '').trim() ? `${String(row?.name || '').trim()} (Copy)` : '',
      slug: baseSlug ? `${baseSlug}-copy` : '',
      price: pickNumber(row?.price),
      stock: pickNumber(row?.stock),
      sort_order: pickNumber(row?.sort_order),
      image_url: String(row?.image_url || ''),
      description: String(row?.description || ''),
      highlights: String(row?.highlights || ''),
      manual_url: String(row?.manual_url || ''),
      manual_text: String(row?.manual_text || ''),
      manual_video_url: String(row?.manual_video_url || ''),
      fulfillment_type: normalizeCatalogFulfillmentType(row?.fulfillment_type),
      custom_form_fields: normalizeProductCustomFormFields(row),
      product_options: Array.isArray(row?.product_options) ? row.product_options : [],
      is_featured: Boolean(row?.is_featured),
      is_unlimited_stock: Boolean(row?.is_unlimited_stock),
    })
  }

  function patchLogsData(mutator) {
    setModuleStore((prev) => {
      const current = prev?.logs || { status: 'ready', data: null, error: '', loadedAt: 0 }
      const currentData = current?.data || { logs: [] }
      const nextData = typeof mutator === 'function' ? mutator(currentData) : currentData
      return {
        ...prev,
        logs: {
          ...current,
          data: nextData,
          loadedAt: Date.now(),
        },
      }
    })
  }

  function patchCatalogData(mutator) {
    setModuleStore((prev) => {
      const current = prev?.catalog || { status: 'ready', data: null, error: '', loadedAt: 0 }
      const currentData = current?.data || { categories: [], products: [] }
      const nextData = typeof mutator === 'function' ? mutator(currentData) : currentData
      return {
        ...prev,
        catalog: {
          ...current,
          data: nextData,
          loadedAt: Date.now(),
        },
      }
    })
  }

  function patchStockData(mutator) {
    setModuleStore((prev) => {
      const current = prev?.stock || { status: 'ready', data: null, error: '', loadedAt: 0 }
      const currentData = current?.data || {
        products: [],
        pools: [],
        stockItems: [],
        stockSummary: null,
        poolItems: [],
        poolSummary: null,
        poolBindings: [],
      }
      const nextData = typeof mutator === 'function' ? mutator(currentData) : currentData
      return {
        ...prev,
        stock: {
          ...current,
          data: nextData,
          loadedAt: Date.now(),
        },
      }
    })
  }

  function patchPromotionsData(mutator) {
    setModuleStore((prev) => {
      const current = prev?.promotions || { status: 'ready', data: null, error: '', loadedAt: 0 }
      const currentData = current?.data || { coupons: [], promotions: [], discountCoupons: [], products: [] }
      const nextData = typeof mutator === 'function' ? mutator(currentData) : currentData
      return {
        ...prev,
        promotions: {
          ...current,
          data: nextData,
          loadedAt: Date.now(),
        },
      }
    })
  }

  function patchSupportData(mutator) {
    setModuleStore((prev) => {
      const current = prev?.support || { status: 'ready', data: null, error: '', loadedAt: 0 }
      const currentData = current?.data || {
        tickets: [],
        total: 0,
        summary: { open: 0, pending: 0, closed: 0, unassigned: 0, mine: 0, needs_reply: 0, over_sla: 0 },
        agents: [],
        selectedTicketId: null,
        selectedTicket: null,
        messages: [],
      }
      const nextData = typeof mutator === 'function' ? mutator(currentData) : currentData
      return {
        ...prev,
        support: {
          ...current,
          data: nextData,
          loadedAt: Date.now(),
        },
      }
    })
  }

  async function openSupportTicket(ticketId) {
    const tid = Number(ticketId)
    if (!Number.isFinite(tid) || tid <= 0) return
    try {
      setSupportActionState({ status: 'working', message: 'กำลังโหลดทิกเก็ต...' })
      const detail = await loadSupportTicketDetail(tid)
      patchSupportData((current) => ({
        ...current,
        selectedTicketId: detail.selectedTicketId,
        selectedTicket: detail.selectedTicket,
        messages: detail.messages,
      }))
      setSupportDraft({
        assignTo: detail?.selectedTicket?.assigned_to == null ? '' : String(detail.selectedTicket.assigned_to),
        status: String(detail?.selectedTicket?.status || 'open').toLowerCase(),
        reply: '',
      })
      setSupportReplyAttachments([])
      setSupportActionState({ status: 'idle', message: '' })
    } catch (err) {
      setSupportActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถโหลดรายละเอียดทิกเก็ตได้') })
    }
  }

  async function refreshSupportSilently() {
    const supportData = moduleStore?.support?.data || null
    const currentId = Number(supportData?.selectedTicketId)
    const targetId = Number.isFinite(currentId) && currentId > 0 ? currentId : null

    try {
      const next = await loadSupportModule(supportQuery, targetId)
      patchSupportData((current) => ({
        ...current,
        ...next,
      }))
      setSupportDraft((prev) => ({
        ...prev,
        assignTo: next?.selectedTicket?.assigned_to == null ? '' : String(next.selectedTicket.assigned_to),
        status: String(next?.selectedTicket?.status || prev.status || 'open').toLowerCase(),
      }))
    } catch {
      // ignore refresh hiccups from stream updates
    }
  }

  function patchUsersSelection(userId, checked) {
    const uid = Number(userId)
    if (!Number.isFinite(uid) || uid <= 0) return
    setUsersSelection((prev) => {
      const set = new Set((prev || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
      if (checked) set.add(uid)
      else set.delete(uid)
      return [...set]
    })
  }

  function patchUsersProfileDraftFromDetail(detailData) {
    const user = detailData?.user || null
    setUsersProfileDraft({
      email: String(user?.email || ''),
      username: String(user?.username || ''),
      display_name: String(user?.display_name || ''),
      avatar_url: String(user?.avatar_url || ''),
    })
  }

  async function openUserDetail(userId) {
    const uid = Number(userId)
    if (!Number.isFinite(uid) || uid <= 0) return
    setUsersDetail({ status: 'loading', userId: uid, data: null, error: '' })
    try {
      const detail = await fetchJson(`/api/admin/users/${uid}/management-detail`, { method: 'GET' })
      setUsersDetail({ status: 'ready', userId: uid, data: detail, error: '' })
      patchUsersProfileDraftFromDetail(detail)
      setUsersPasswordDraft('')
    } catch (err) {
      setUsersDetail({ status: 'error', userId: uid, data: null, error: getErrorMessage(err, 'Unable to load user detail') })
    }
  }

  async function applyUserRole(userId, role) {
    try {
      setUsersActionState({ status: 'working', message: 'กำลังอัปเดตสิทธิ์ผู้ใช้...' })
      await fetchJson(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      setUsersActionState({ status: 'success', message: 'อัปเดตสิทธิ์เรียบร้อย' })
      await loadModule('users')
      if (Number(usersDetail.userId) === Number(userId)) await openUserDetail(userId)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถอัปเดตสิทธิ์ได้') })
    }
  }

  async function toggleUserBan(userId, nextBanned) {
    try {
      setUsersActionState({ status: 'working', message: nextBanned ? 'กำลังแบนผู้ใช้...' : 'กำลังปลดแบนผู้ใช้...' })
      await fetchJson(`/api/admin/users/${userId}/${nextBanned ? 'ban' : 'unban'}`, { method: 'POST' })
      setUsersActionState({ status: 'success', message: nextBanned ? 'แบนผู้ใช้เรียบร้อย' : 'ปลดแบนผู้ใช้เรียบร้อย' })
      await loadModule('users')
      if (Number(usersDetail.userId) === Number(userId)) await openUserDetail(userId)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถอัปเดตสถานะได้') })
    }
  }

  async function adjustUserPoints(userId, rawPoints = null, reason = 'admin_v2_adjust') {
    const raw = rawPoints == null ? window.prompt('ปรับแต้ม (ใช้ตัวเลข + หรือ -):', '0') : rawPoints
    const points = Number(raw)
    if (!Number.isFinite(points) || points === 0) return

    try {
      setUsersActionState({ status: 'working', message: 'กำลังปรับแต้ม...' })
      await fetchJson(`/api/admin/users/${userId}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, reason: String(reason || 'admin_v2_adjust') }),
      })
      setUsersActionState({ status: 'success', message: 'อัปเดตแต้มเรียบร้อย' })
      await loadModule('users')
      if (Number(usersDetail.userId) === Number(userId)) await openUserDetail(userId)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถปรับแต้มได้') })
    }
  }

  async function usersApplyBulkRole() {
    const role = String(usersBulkDraft.role || 'user').trim().toLowerCase()
    const ids = (usersSelection || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    if (ids.length < 1) return
    try {
      setUsersActionState({ status: 'working', message: `กำลังตั้งค่าสิทธิ์ให้ผู้ใช้ ${ids.length} คน...` })
      for (const uid of ids) {
        await fetchJson(`/api/admin/users/${uid}/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        })
      }
      setUsersActionState({ status: 'success', message: 'อัปเดตสิทธิ์แบบกลุ่มเรียบร้อย' })
      setUsersSelection([])
      await loadModule('users')
      if (Number.isFinite(Number(usersDetail.userId)) && ids.includes(Number(usersDetail.userId))) await openUserDetail(usersDetail.userId)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถอัปเดตสิทธิ์แบบกลุ่มได้') })
    }
  }

  async function usersApplyBulkBan(nextBanned) {
    const ids = (usersSelection || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    if (ids.length < 1) return
    try {
      setUsersActionState({ status: 'working', message: `${nextBanned ? 'กำลังแบน' : 'กำลังปลดแบน'}ผู้ใช้ ${ids.length} คน...` })
      for (const uid of ids) {
        await fetchJson(`/api/admin/users/${uid}/${nextBanned ? 'ban' : 'unban'}`, { method: 'POST' })
      }
      setUsersActionState({ status: 'success', message: 'อัปเดตสถานะแบบกลุ่มเรียบร้อย' })
      setUsersSelection([])
      await loadModule('users')
      if (Number.isFinite(Number(usersDetail.userId)) && ids.includes(Number(usersDetail.userId))) await openUserDetail(usersDetail.userId)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถอัปเดตสถานะแบบกลุ่มได้') })
    }
  }

  async function usersApplyBulkPoints() {
    const ids = (usersSelection || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    const points = Number(usersBulkDraft.points)
    const reason = String(usersBulkDraft.reason || '').trim() || 'admin_v2_bulk'
    if (ids.length < 1) return
    if (!Number.isFinite(points) || points === 0) {
      setUsersActionState({ status: 'error', message: 'การปรับแต้มแบบกลุ่มต้องไม่เป็นศูนย์' })
      return
    }

    try {
      setUsersActionState({ status: 'working', message: `กำลังปรับแต้มให้ผู้ใช้ ${ids.length} คน...` })
      for (const uid of ids) {
        await fetchJson(`/api/admin/users/${uid}/points`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points, reason }),
        })
      }
      setUsersActionState({ status: 'success', message: 'ปรับแต้มแบบกลุ่มเรียบร้อย' })
      setUsersSelection([])
      setUsersBulkDraft((prev) => ({ ...prev, points: '' }))
      await loadModule('users')
      if (Number.isFinite(Number(usersDetail.userId)) && ids.includes(Number(usersDetail.userId))) await openUserDetail(usersDetail.userId)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถปรับแต้มแบบกลุ่มได้') })
    }
  }

  async function saveUsersProfile() {
    const uid = Number(usersDetail.userId)
    if (!Number.isFinite(uid) || uid <= 0) return
    try {
      setUsersActionState({ status: 'working', message: `กำลังบันทึกโปรไฟล์ผู้ใช้ #${uid}...` })
      await fetchJson(`/api/admin/users/${uid}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(usersProfileDraft.email || '').trim(),
          username: String(usersProfileDraft.username || '').trim(),
          display_name: String(usersProfileDraft.display_name || '').trim(),
          avatar_url: String(usersProfileDraft.avatar_url || '').trim(),
        }),
      })
      setUsersActionState({ status: 'success', message: 'อัปเดตโปรไฟล์เรียบร้อย' })
      await loadModule('users')
      await openUserDetail(uid)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถอัปเดตโปรไฟล์ได้') })
    }
  }

  async function resetUsersPassword() {
    const uid = Number(usersDetail.userId)
    const password = String(usersPasswordDraft || '')
    if (!Number.isFinite(uid) || uid <= 0) return
    if (password.length < 8) {
      setUsersActionState({ status: 'error', message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
      return
    }
    try {
      setUsersActionState({ status: 'working', message: `กำลังรีเซ็ตรหัสผ่านให้ #${uid}...` })
      await fetchJson(`/api/admin/users/${uid}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      setUsersPasswordDraft('')
      setUsersActionState({ status: 'success', message: 'รีเซ็ตรหัสผ่านเรียบร้อย' })
      await openUserDetail(uid)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถรีเซ็ตรหัสผ่านได้') })
    }
  }

  async function revokeUsersSessions() {
    const uid = Number(usersDetail.userId)
    if (!Number.isFinite(uid) || uid <= 0) return
    if (!window.confirm(`ต้องการยกเลิกทุกเซสชันที่ยังใช้งานของผู้ใช้ #${uid} ใช่หรือไม่?`)) return
    try {
      setUsersActionState({ status: 'working', message: `กำลังยกเลิกเซสชันของ #${uid}...` })
      const data = await fetchJson(`/api/admin/users/${uid}/revoke-sessions`, { method: 'POST' })
      const deleted = pickNumber(data?.deleted)
      setUsersActionState({ status: 'success', message: `ยกเลิกเซสชันแล้ว ${deleted} รายการ` })
      await openUserDetail(uid)
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถยกเลิกเซสชันได้') })
    }
  }

  async function removeUsersAccount() {
    const uid = Number(usersDetail.userId)
    if (!Number.isFinite(uid) || uid <= 0) return
    if (!window.confirm(`ต้องการลบผู้ใช้ #${uid} ใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return
    try {
      setUsersActionState({ status: 'working', message: `กำลังลบผู้ใช้ #${uid}...` })
      await fetchJson(`/api/admin/users/${uid}`, { method: 'DELETE' })
      setUsersActionState({ status: 'success', message: 'ลบผู้ใช้เรียบร้อย' })
      setUsersDetail({ status: 'idle', userId: null, data: null, error: '' })
      setUsersSelection((prev) => (prev || []).filter((id) => Number(id) !== uid))
      await loadModule('users')
    } catch (err) {
      setUsersActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถลบผู้ใช้ได้') })
    }
  }

  function supportApplySearch() {
    patchSupportQuery({ search: String(supportSearchDraft || '').trim() })
  }

  function supportResetFilters() {
    setSupportSearchDraft('')
    setSupportQuery(DEFAULT_SUPPORT_QUERY)
  }

  function readSupportAttachmentAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve(event?.target?.result)
      reader.onerror = () => reject(new Error('read_failed'))
      reader.readAsDataURL(file)
    })
  }

  async function pickSupportReplyAttachments(fileList) {
    if (!fileList || fileList.length < 1) return

    const current = Array.isArray(supportReplyAttachments) ? supportReplyAttachments : []
    const remaining = 3 - current.length
    if (remaining <= 0) {
      setSupportActionState({ status: 'error', message: 'แนบรูปได้สูงสุด 3 รูปต่อข้อความ' })
      return
    }

    const files = Array.from(fileList).slice(0, remaining)
    const next = []

    for (const file of files) {
      if (!String(file?.type || '').startsWith('image/')) {
        setSupportActionState({ status: 'error', message: 'รองรับเฉพาะไฟล์รูปภาพ (jpg, png, gif, webp)' })
        continue
      }
      if (Number(file?.size || 0) > 20 * 1024 * 1024) {
        setSupportActionState({ status: 'error', message: 'รูปภาพต้องมีขนาดไม่เกิน 20MB' })
        continue
      }

      try {
        const data = await readSupportAttachmentAsDataUrl(file)
        next.push({ data, mime: file.type, name: file.name })
      } catch {
        setSupportActionState({ status: 'error', message: 'ไม่สามารถอ่านไฟล์แนบได้' })
      }
    }

    if (next.length > 0) {
      setSupportReplyAttachments((prev) => [...(Array.isArray(prev) ? prev : []), ...next].slice(0, 3))
      setSupportActionState({ status: 'idle', message: '' })
    }
  }

  function removeSupportReplyAttachment(index) {
    setSupportReplyAttachments((prev) => (Array.isArray(prev) ? prev.filter((_, i) => i !== index) : []))
  }

  async function supportClaimTicket() {
    const supportData = moduleStore?.support?.data || null
    const tid = Number(supportData?.selectedTicketId)
    if (!Number.isFinite(tid) || tid <= 0) return

    try {
      setSupportActionState({ status: 'working', message: 'กำลังรับเคสนี้...' })
      await fetchJson(`/api/admin/support-tickets/${tid}/claim`, { method: 'POST' })
      setSupportActionState({ status: 'success', message: 'รับเคสเรียบร้อย' })
      await refreshSupportSilently()
    } catch (err) {
      setSupportActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถรับเคสได้') })
    }
  }

  async function supportApplyAssign(nextAssignedTo = undefined) {
    const supportData = moduleStore?.support?.data || null
    const tid = Number(supportData?.selectedTicketId)
    if (!Number.isFinite(tid) || tid <= 0) return

    const raw = nextAssignedTo === undefined ? String(supportDraft.assignTo || '').trim() : String(nextAssignedTo == null ? '' : nextAssignedTo).trim()
    const assignedTo = raw === '' ? null : Number(raw)
    if (raw !== '' && !Number.isFinite(assignedTo)) return

    try {
      setSupportActionState({ status: 'working', message: 'กำลังมอบหมายทิกเก็ต...' })
      await fetchJson(`/api/admin/support-tickets/${tid}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: assignedTo }),
      })
      setSupportActionState({ status: 'success', message: 'อัปเดตการมอบหมายเรียบร้อย' })
      await refreshSupportSilently()
    } catch (err) {
      setSupportActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถมอบหมายทิกเก็ตได้') })
    }
  }

  async function supportApplyStatus(nextStatus = undefined) {
    const supportData = moduleStore?.support?.data || null
    const tid = Number(supportData?.selectedTicketId)
    const status = String(nextStatus == null ? supportDraft.status || '' : nextStatus).trim().toLowerCase()
    if (!Number.isFinite(tid) || tid <= 0) return
    if (!status) return

    try {
      setSupportActionState({ status: 'working', message: 'กำลังอัปเดตสถานะทิกเก็ต...' })
      await fetchJson(`/api/admin/support-tickets/${tid}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setSupportActionState({ status: 'success', message: 'อัปเดตสถานะเรียบร้อย' })
      await refreshSupportSilently()
    } catch (err) {
      setSupportActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถอัปเดตสถานะได้') })
    }
  }

  async function supportSendReply() {
    const supportData = moduleStore?.support?.data || null
    const tid = Number(supportData?.selectedTicketId)
    const selectedTicket = supportData?.selectedTicket || null
    const message = String(supportDraft.reply || '').trim()
    const attachments = Array.isArray(supportReplyAttachments) ? supportReplyAttachments : []
    const closed = String(selectedTicket?.status || '').trim().toLowerCase() === 'closed'

    if (!Number.isFinite(tid) || tid <= 0) return
    if (closed) {
      setSupportActionState({ status: 'error', message: 'ทิกเก็ตนี้ปิดแล้ว ไม่สามารถตอบกลับได้' })
      return
    }
    if (!message && attachments.length < 1) {
      setSupportActionState({ status: 'error', message: 'กรุณาพิมพ์ข้อความหรือแนบรูปอย่างน้อย 1 รายการ' })
      return
    }
    if (message.length > 4000) {
      setSupportActionState({ status: 'error', message: 'ข้อความยาวเกินกำหนด (สูงสุด 4000 ตัวอักษร)' })
      return
    }

    try {
      setSupportActionState({ status: 'working', message: 'กำลังส่งข้อความตอบกลับ...' })
      await fetchJson(`/api/admin/support-tickets/${tid}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      })
      setSupportDraft((prev) => ({ ...prev, reply: '' }))
      setSupportReplyAttachments([])
      setSupportActionState({ status: 'success', message: 'ส่งข้อความตอบกลับเรียบร้อย' })
      await refreshSupportSilently()
    } catch (err) {
      const code = String(err?.data?.error || '')
      if (code === 'closed') {
        setSupportActionState({ status: 'error', message: 'ทิกเก็ตนี้ปิดแล้ว' })
        return
      }
      if (code === 'invalid_message_too_long') {
        setSupportActionState({ status: 'error', message: 'ข้อความยาวเกินกำหนด (สูงสุด 4000 ตัวอักษร)' })
        return
      }
      if (code === 'too_many_attachments') {
        setSupportActionState({ status: 'error', message: 'แนบรูปได้สูงสุด 3 รูปต่อข้อความ' })
        return
      }
      if (code === 'attachment_too_large') {
        setSupportActionState({ status: 'error', message: 'รูปภาพต้องมีขนาดไม่เกิน 20MB' })
        return
      }
      if (code === 'invalid_attachment_type') {
        setSupportActionState({ status: 'error', message: 'รองรับเฉพาะไฟล์รูปภาพ (jpg, png, gif, webp)' })
        return
      }
      setSupportActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถส่งข้อความตอบกลับได้') })
    }
  }

  async function refreshFulfillmentSilently() {
    try {
      const data = await loadFulfillmentModule(fulfillmentQuery)
      setModuleStore((prev) => ({
        ...prev,
        fulfillment: { status: 'ready', data, error: null },
      }))
      const selId = fulfillmentSelectedId
      if (selId) {
        try {
          const detail = await loadFulfillmentRequestDetail(selId)
          setFulfillmentDetail(detail)
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  async function openFulfillmentRequest(requestId) {
    const rid = Number(requestId)
    if (!Number.isFinite(rid) || rid <= 0) {
      setFulfillmentSelectedId(null)
      setFulfillmentDetail(null)
      setFulfillmentActiveAction(null)
      return
    }
    setFulfillmentSelectedId(rid)
    setFulfillmentDetailLoading(true)
    setFulfillmentActiveAction(null)
    setFulfillmentError('')
    try {
      const detail = await loadFulfillmentRequestDetail(rid)
      setFulfillmentDetail(detail)
    } catch (err) {
      setFulfillmentError(getErrorMessage(err, 'ไม่สามารถโหลดรายละเอียดคำขอได้'))
      setFulfillmentDetail(null)
    } finally {
      setFulfillmentDetailLoading(false)
    }
  }

  async function fulfillmentAssignRequest(requestId, boosterId) {
    const rid = Number(requestId)
    const bid = Number(boosterId)
    if (!Number.isFinite(rid) || rid <= 0) return
    if (!Number.isFinite(bid) || bid <= 0) {
      setFulfillmentError('กรุณาเลือกบูสเตอร์ก่อนมอบหมาย')
      return
    }

    try {
      setFulfillmentActionState({ status: 'working', message: 'กำลังมอบหมายคำขอ...' })
      setFulfillmentError('')
      await fetchJson(`/api/admin/farm-requests/${rid}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booster_id: bid }),
      })
      setAssignForm({ id: null, booster_id: '' })
      setFulfillmentActiveAction(null)
      setFulfillmentActionState({ status: 'success', message: 'มอบหมายคำขอเรียบร้อย' })
      await refreshFulfillmentSilently()
    } catch (err) {
      setFulfillmentError(getErrorMessage(err, 'ไม่สามารถมอบหมายคำขอได้'))
      setFulfillmentActionState({ status: 'error', message: 'ดำเนินการไม่สำเร็จ' })
    }
  }

  async function refreshLogs() {
    try {
      setLogsActionState({ status: 'working', message: 'กำลังโหลดบันทึกการตรวจสอบ...' })
      setLogsError('')
      const data = await loadLogsModule(logsQuery)
      patchLogsData(() => data)
      setLogsActionState({ status: 'success', message: 'โหลดบันทึกการตรวจสอบเรียบร้อย' })
    } catch (err) {
      setLogsError(getErrorMessage(err, 'ไม่สามารถโหลดบันทึกการตรวจสอบได้'))
      setLogsActionState({ status: 'error', message: 'ดำเนินการบันทึกการตรวจสอบไม่สำเร็จ' })
    }
  }

  async function openAuditReplay(logId) {
    const id = Number(logId)
    if (!Number.isFinite(id) || id <= 0) return
    try {
      setAuditReplayState({ status: 'loading', log: null, replay: [], error: '' })
      const data = await fetchJson(`/api/admin/audit-logs/${id}`, { method: 'GET' })
      setAuditReplayState({
        status: 'ready',
        log: data?.log || null,
        replay: Array.isArray(data?.replay) ? data.replay : [],
        error: '',
      })
    } catch (err) {
      setAuditReplayState({ status: 'error', log: null, replay: [], error: getErrorMessage(err, 'ไม่สามารถโหลดข้อมูล replay ได้') })
    }
  }

  async function refreshSettings() {
    try {
      setSettingsActionState({ status: 'working', message: 'กำลังโหลดการตั้งค่า...' })
      setSettingsError('')
      setSettingsFieldErrors(EMPTY_SETTINGS_FIELD_ERRORS)
      const data = await loadSettingsModule()
      setUiImageSettings(normalizeUiImageSettings(data?.image_settings))
      setUiBrandingSettings(normalizeUiBrandingSettings(data?.branding_settings))
      setHomepageSettings(normalizeHomepageSettings(data?.homepage_settings))
      setSiteSettings(normalizeSiteSettings(data?.site_settings))
      setSettingsActionState({ status: 'success', message: 'โหลดการตั้งค่าเรียบร้อย' })
    } catch (err) {
      setSettingsError(getErrorMessage(err, 'ไม่สามารถโหลดการตั้งค่าได้'))
      setSettingsActionState({ status: 'error', message: 'ดำเนินการตั้งค่าไม่สำเร็จ' })
    }
  }

  async function saveSettings() {
    const validation = validateSettingsDraft()
    if (!validation.ok) {
      setSettingsFieldErrors(validation.errors)
      setSettingsError('กรุณาแก้ไขค่าที่ไม่ถูกต้องก่อนบันทึก')
      setSettingsActionState({ status: 'error', message: 'ดำเนินการตั้งค่าไม่สำเร็จ' })
      return
    }

    try {
      setSettingsActionState({ status: 'working', message: 'กำลังบันทึกการตั้งค่า...' })
      setSettingsError('')
      setSettingsFieldErrors(EMPTY_SETTINGS_FIELD_ERRORS)
      const normalizedImages = normalizeUiImageSettings(uiImageSettings)
      const normalizedBranding = normalizeUiBrandingSettings(uiBrandingSettings)
      const normalizedHomepage = normalizeHomepageSettings(homepageSettings)
      const normalizedSite = normalizeSiteSettings(siteSettings)
      const data = await fetchJson('/api/admin/ui-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_settings: normalizedImages, branding_settings: normalizedBranding, homepage_settings: normalizedHomepage, site_settings: normalizedSite }),
      })
      setUiImageSettings(normalizeUiImageSettings(data?.image_settings))
      setUiBrandingSettings(normalizeUiBrandingSettings(data?.branding_settings))
      setHomepageSettings(normalizeHomepageSettings(data?.homepage_settings))
      setSiteSettings(normalizeSiteSettings(data?.site_settings))
      triggerAppRefresh()
      setSettingsActionState({ status: 'success', message: 'บันทึกการตั้งค่าเรียบร้อย' })
    } catch (err) {
      setSettingsError(getErrorMessage(err, 'ไม่สามารถบันทึกการตั้งค่าได้'))
      setSettingsActionState({ status: 'error', message: 'ดำเนินการตั้งค่าไม่สำเร็จ' })
    }
  }

  async function uploadFaviconFile(file) {
    if (!file) return
    const isImage = String(file.type || '').toLowerCase().startsWith('image/')
    if (!isImage) {
      setSettingsFieldErrors((prev) => ({ ...prev, favicon_url: 'อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น' }))
      setSettingsError('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น')
      return
    }
    const maxBytes = 1024 * 1024
    if (Number(file.size || 0) > maxBytes) {
      setSettingsFieldErrors((prev) => ({ ...prev, favicon_url: 'Favicon ต้องมีขนาดไม่เกิน 1MB' }))
      setSettingsError('Favicon ต้องมีขนาดไม่เกิน 1MB')
      return
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('read_failed'))
      reader.readAsDataURL(file)
    })
    if (!String(dataUrl).startsWith('data:image/')) {
      setSettingsFieldErrors((prev) => ({ ...prev, favicon_url: 'รูปแบบรูปภาพไม่ถูกต้อง' }))
      setSettingsError('รูปแบบรูปภาพไม่ถูกต้อง')
      return
    }
    setUiBrandingSettings((prev) => ({ ...prev, favicon_url: String(dataUrl) }))
    setSettingsFieldErrors((prev) => ({ ...prev, favicon_url: '' }))
    setSettingsError('')
  }

  function resetSettingsDraft() {
    const loaded = moduleStore?.settings?.data || null
    if (loaded) {
      setUiImageSettings(normalizeUiImageSettings(loaded?.image_settings))
      setUiBrandingSettings(normalizeUiBrandingSettings(loaded?.branding_settings))
      setHomepageSettings(normalizeHomepageSettings(loaded?.homepage_settings))
      setSiteSettings(normalizeSiteSettings(loaded?.site_settings))
    } else {
      setUiImageSettings(DEFAULT_UI_IMAGE_SETTINGS)
      setUiBrandingSettings(DEFAULT_UI_BRANDING_SETTINGS)
      setHomepageSettings(DEFAULT_HOMEPAGE_SETTINGS)
      setSiteSettings(DEFAULT_SITE_SETTINGS)
    }
    setSettingsError('')
    setSettingsFieldErrors(EMPTY_SETTINGS_FIELD_ERRORS)
    setDragNavLinkIndex(null)
  }

  function validateSettingsDraft() {
    const errors = { ...EMPTY_SETTINGS_FIELD_ERRORS }

    const ratios = [
      ['home_featured_ratio', uiImageSettings.home_featured_ratio],
      ['home_categories_ratio', uiImageSettings.home_categories_ratio],
      ['category_products_ratio', uiImageSettings.category_products_ratio],
      ['product_detail_ratio', uiImageSettings.product_detail_ratio],
    ]
    for (const [key, value] of ratios) {
      const txt = String(value || '').trim()
      const ratioMatch = txt.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)$/)
      const numeric = Number(txt)
      const ratioOk = ratioMatch && Number(ratioMatch[1]) > 0 && Number(ratioMatch[2]) > 0
      const numericOk = Number.isFinite(numeric) && numeric > 0
      if (!txt || (!ratioOk && !numericOk)) errors[key] = 'Use positive ratio format like 16/10 or 1.6'
    }

    if (!String(uiBrandingSettings.site_name || '').trim()) errors.site_name = 'Site name is required'
    if (!String(uiBrandingSettings.navbar_title || '').trim()) errors.navbar_title = 'Navbar title is required'
    if (!String(uiBrandingSettings.tab_title || '').trim()) errors.tab_title = 'Tab title is required'

    const favicon = String(uiBrandingSettings.favicon_url || '').trim()
    if (
      !favicon ||
      (!favicon.startsWith('/') && !favicon.startsWith('http://') && !favicon.startsWith('https://') && !favicon.startsWith('data:image/'))
    ) {
      errors.favicon_url = 'Use /path, http(s) URL, or data:image URL'
    }

    const links = Array.isArray(uiBrandingSettings?.navbar_links) ? uiBrandingSettings.navbar_links : []
    if (links.length === 0) {
      errors.navbar_links = 'At least one navbar link is required'
    } else {
      const invalidIndex = links.findIndex((row) => {
        const label = String(row?.label || '').trim()
        const to = String(row?.to || '').trim()
        if (!label) return true
        return !to || (!to.startsWith('/') && !to.startsWith('http://') && !to.startsWith('https://'))
      })
      if (invalidIndex >= 0) errors.navbar_links = `Invalid navbar link at row ${invalidIndex + 1}`
    }

    const ok = Object.values(errors).every((msg) => !msg)
    return { ok, errors }
  }

  function addNavbarLinkRow() {
    setUiBrandingSettings((prev) => ({
      ...prev,
      navbar_links: [...(Array.isArray(prev?.navbar_links) ? prev.navbar_links : []), { label: '', to: '/', auth_required: false }],
    }))
  }

  function updateNavbarLinkRow(index, patch) {
    setUiBrandingSettings((prev) => {
      const list = Array.isArray(prev?.navbar_links) ? [...prev.navbar_links] : []
      if (index < 0 || index >= list.length) return prev
      list[index] = { ...(list[index] || {}), ...(patch || {}) }
      return { ...prev, navbar_links: list }
    })
  }

  function removeNavbarLinkRow(index) {
    setUiBrandingSettings((prev) => {
      const list = Array.isArray(prev?.navbar_links) ? [...prev.navbar_links] : []
      if (index < 0 || index >= list.length) return prev
      list.splice(index, 1)
      return { ...prev, navbar_links: list }
    })
  }

  function moveNavbarLinkRow(fromIndex, toIndex) {
    setUiBrandingSettings((prev) => {
      const list = Array.isArray(prev?.navbar_links) ? [...prev.navbar_links] : []
      if (fromIndex === toIndex) return prev
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return prev
      const [moved] = list.splice(fromIndex, 1)
      list.splice(toIndex, 0, moved)
      return { ...prev, navbar_links: list }
    })
  }

  async function hpSearchProducts(term) {
    setHpProductSearch(term)
    if (!String(term).trim()) { setHpProductResults([]); return }
    try {
      const data = await fetchJson('/api/admin/products')
      const allProds = data?.products || []
      const q = String(term).trim().toLowerCase()
      const filtered = allProds.filter((p) => {
        const name = String(p.name || '').toLowerCase()
        const id = String(p.id)
        return name.includes(q) || id === q
      })
      setHpProductResults(filtered.slice(0, 30))
      const cache = { ...hpProductCache }
      for (const p of allProds) cache[Number(p.id)] = p
      setHpProductCache(cache)
    } catch {
      setHpProductResults([])
    }
  }

  async function hpLoadAllProducts() {
    try {
      const data = await fetchJson('/api/admin/products')
      const allProds = data?.products || []
      setHpProductResults(allProds.slice(0, 50))
      const cache = { ...hpProductCache }
      for (const p of allProds) cache[Number(p.id)] = p
      setHpProductCache(cache)
    } catch { setHpProductResults([]) }
  }

  function hpAddProductId(target, productId) {
    const id = Number(productId)
    if (!Number.isFinite(id) || id <= 0) return
    setHomepageSettings((prev) => {
      const key = target === 'featured' ? 'featured_product_ids' : 'showcase_product_ids'
      const list = Array.isArray(prev[key]) ? [...prev[key]] : []
      if (list.includes(id)) return prev
      return { ...prev, [key]: [...list, id] }
    })
  }

  function hpRemoveProductId(target, productId) {
    const id = Number(productId)
    setHomepageSettings((prev) => {
      const key = target === 'featured' ? 'featured_product_ids' : 'showcase_product_ids'
      const list = Array.isArray(prev[key]) ? prev[key].filter((v) => v !== id) : []
      return { ...prev, [key]: list }
    })
  }

  function hpMoveProductId(target, fromIdx, toIdx) {
    setHomepageSettings((prev) => {
      const key = target === 'featured' ? 'featured_product_ids' : 'showcase_product_ids'
      const list = Array.isArray(prev[key]) ? [...prev[key]] : []
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length) return prev
      const [moved] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, moved)
      return { ...prev, [key]: list }
    })
  }

  function hpAddFaqItem() {
    setHomepageSettings((prev) => {
      const list = Array.isArray(prev.faq_items) ? [...prev.faq_items] : []
      if (list.length >= 20) return prev
      return { ...prev, faq_items: [...list, { question: '', answer: '' }] }
    })
  }
  function hpUpdateFaqItem(idx, patch) {
    setHomepageSettings((prev) => {
      const list = Array.isArray(prev.faq_items) ? [...prev.faq_items] : []
      if (idx < 0 || idx >= list.length) return prev
      list[idx] = { ...list[idx], ...patch }
      return { ...prev, faq_items: list }
    })
  }
  function hpRemoveFaqItem(idx) {
    setHomepageSettings((prev) => {
      const list = Array.isArray(prev.faq_items) ? [...prev.faq_items] : []
      list.splice(idx, 1)
      return { ...prev, faq_items: list }
    })
  }
  function hpMoveFaqItem(fromIdx, toIdx) {
    setHomepageSettings((prev) => {
      const list = Array.isArray(prev.faq_items) ? [...prev.faq_items] : []
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length) return prev
      const [moved] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, moved)
      return { ...prev, faq_items: list }
    })
  }

  function hpAddTrustItem() {
    setHomepageSettings((prev) => {
      const list = Array.isArray(prev.trust_items) ? [...prev.trust_items] : []
      if (list.length >= 10) return prev
      return { ...prev, trust_items: [...list, { icon: '', title: '', desc: '' }] }
    })
  }
  function hpUpdateTrustItem(idx, patch) {
    setHomepageSettings((prev) => {
      const list = Array.isArray(prev.trust_items) ? [...prev.trust_items] : []
      if (idx < 0 || idx >= list.length) return prev
      list[idx] = { ...list[idx], ...patch }
      return { ...prev, trust_items: list }
    })
  }
  function hpRemoveTrustItem(idx) {
    setHomepageSettings((prev) => {
      const list = Array.isArray(prev.trust_items) ? [...prev.trust_items] : []
      list.splice(idx, 1)
      return { ...prev, trust_items: list }
    })
  }
  function hpMoveTrustItem(fromIdx, toIdx) {
    setHomepageSettings((prev) => {
      const list = Array.isArray(prev.trust_items) ? [...prev.trust_items] : []
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length) return prev
      const [moved] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, moved)
      return { ...prev, trust_items: list }
    })
  }

  async function fulfillmentSubmit(requestId, kind) {
    const rid = Number(requestId)
    if (!Number.isFinite(rid) || rid <= 0) return

    try {
      if (kind === 'fulfill') {
        const payload = String(fulfillForm.payload || '').trim()
        if (!payload) {
          setFulfillmentError('จำเป็นต้องกรอกข้อมูลสำหรับการส่งมอบ')
          return
        }
        setFulfillmentActionState({ status: 'working', message: `กำลังส่งมอบคำขอ #${rid}...` })
        setFulfillmentError('')
        await fetchJson(`/api/admin/farm-requests/${rid}/fulfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload }),
        })
        setFulfillForm({ id: null, payload: '' })
      } else {
        setFulfillmentActionState({ status: 'working', message: `กำลังยกเลิกคำขอ #${rid}...` })
        setFulfillmentError('')
        await fetchJson(`/api/admin/farm-requests/${rid}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: String(cancelForm.note || '').trim() || null }),
        })
        setCancelForm({ id: null, note: '' })
      }

      setFulfillmentActiveAction(null)
      setFulfillmentActionState({ status: 'success', message: kind === 'fulfill' ? 'ส่งมอบคำขอเรียบร้อย' : 'ยกเลิกคำขอเรียบร้อย' })
      await refreshFulfillmentSilently()
    } catch (err) {
      setFulfillmentError(getErrorMessage(err, `ไม่สามารถดำเนินการคำขอแบบ ${kind} ได้`))
      setFulfillmentActionState({ status: 'error', message: 'ดำเนินการไม่สำเร็จ' })
    }
  }

  function editCategory(row) {
    setCatalogErrors((prev) => ({ ...prev, category: '' }))
    setCategoryForm({
      id: row?.id || null,
      name: String(row?.name || ''),
      slug: String(row?.slug || ''),
      image_url: String(row?.image_url || ''),
      description: String(row?.description || ''),
    })
  }

  async function saveCategory() {
    const name = String(categoryForm.name || '').trim()
    const slug = String(categoryForm.slug || '').trim()
    if (!name || !slug) {
      setCatalogErrors((prev) => ({ ...prev, category: 'จำเป็นต้องกรอกชื่อและ slug' }))
      return
    }

    try {
      setCatalogActionState({ status: 'working', message: categoryForm.id ? 'กำลังอัปเดตหมวดหมู่...' : 'กำลังสร้างหมวดหมู่...' })
      setCatalogErrors((prev) => ({ ...prev, category: '' }))

      const payload = {
        name,
        slug,
        image_url: String(categoryForm.image_url || '').trim() || null,
        description: String(categoryForm.description || '').trim(),
      }
      if (categoryForm.id) {
        await fetchJson(`/api/admin/categories/${categoryForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetchJson('/api/admin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      setCategoryForm(DEFAULT_CATEGORY_FORM)
      setCatalogActionState({ status: 'success', message: 'บันทึกหมวดหมู่เรียบร้อย' })
      await loadModule('catalog')
    } catch (err) {
      const status = Number(err?.status)
      if (status === 409 && String(err?.data?.error || '') === 'slug_taken') {
        setCatalogErrors((prev) => ({ ...prev, category: 'slug หมวดหมู่นี้ถูกใช้งานแล้ว' }))
      } else {
        setCatalogErrors((prev) => ({ ...prev, category: getErrorMessage(err, 'ไม่สามารถบันทึกหมวดหมู่ได้') }))
      }
      setCatalogActionState({ status: 'error', message: 'ดำเนินการหมวดหมู่ไม่สำเร็จ' })
    }
  }

  async function removeCategory(categoryId) {
    const id = Number(categoryId)
    if (!Number.isFinite(id) || id <= 0) return
    if (!window.confirm(`ต้องการลบหมวดหมู่ #${id} ใช่หรือไม่?`)) return

    try {
      setCatalogActionState({ status: 'working', message: 'กำลังลบหมวดหมู่...' })
      setCatalogErrors((prev) => ({ ...prev, category: '' }))
      await fetchJson(`/api/admin/categories/${id}`, { method: 'DELETE' })
      if (Number(categoryForm.id) === id) setCategoryForm(DEFAULT_CATEGORY_FORM)
      setCatalogActionState({ status: 'success', message: 'ลบหมวดหมู่เรียบร้อย' })
      await loadModule('catalog')
    } catch (err) {
      if (Number(err?.status) === 409 && String(err?.data?.error || '') === 'category_in_use') {
        const productsCount = pickNumber(err?.data?.detail?.products)
        setCatalogErrors((prev) => ({ ...prev, category: `หมวดหมู่นี้ถูกใช้งานโดยสินค้า ${formatNumber(productsCount)} รายการ` }))
      } else {
        setCatalogErrors((prev) => ({ ...prev, category: getErrorMessage(err, 'ไม่สามารถลบหมวดหมู่ได้') }))
      }
      setCatalogActionState({ status: 'error', message: 'ดำเนินการหมวดหมู่ไม่สำเร็จ' })
    }
  }

  function editProduct(row) {
    setCatalogErrors((prev) => ({ ...prev, product: '' }))
    setCatalogView('products')
    setProductOptionError('')
    setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
    setProductForm({
      id: row?.id || null,
      category_id: row?.category_id == null ? '' : String(row.category_id),
      name: String(row?.name || ''),
      slug: String(row?.slug || ''),
      price: pickNumber(row?.price),
      stock: pickNumber(row?.stock),
      sort_order: pickNumber(row?.sort_order),
      image_url: String(row?.image_url || ''),
      description: String(row?.description || ''),
      highlights: String(row?.highlights || ''),
      manual_url: String(row?.manual_url || ''),
      manual_text: String(row?.manual_text || ''),
      manual_video_url: String(row?.manual_video_url || ''),
      fulfillment_type: normalizeCatalogFulfillmentType(row?.fulfillment_type),
      custom_form_fields: normalizeProductCustomFormFields(row),
      product_options: Array.isArray(row?.product_options) ? row.product_options : [],
      is_featured: Boolean(row?.is_featured),
      is_unlimited_stock: Boolean(row?.is_unlimited_stock),
    })
  }

  async function saveProduct() {
    const categoryId = Number(productForm.category_id)
    const price = Number(productForm.price)
    const stock = Number(productForm.stock)
    const sortOrder = Number(productForm.sort_order)
    const name = String(productForm.name || '').trim()
    const slug = String(productForm.slug || '').trim()
    let productOptionsPayload = []
    let customFormFieldsPayload = []

    try {
      productOptionsPayload = normalizeProductOptionsForSubmit(productForm.product_options)
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.includes('_missing_id')) setCatalogErrors((prev) => ({ ...prev, product: 'ตัวเลือกทุกรายการต้องมี ID' }))
      else if (msg.includes('_missing_label')) setCatalogErrors((prev) => ({ ...prev, product: 'ตัวเลือกทุกรายการต้องมีชื่อแสดงผล' }))
      else if (msg.includes('_duplicate_id')) setCatalogErrors((prev) => ({ ...prev, product: 'ID ตัวเลือกต้องไม่ซ้ำกัน' }))
      else if (msg.includes('_invalid_price')) setCatalogErrors((prev) => ({ ...prev, product: 'ราคาของตัวเลือกต้องเป็นตัวเลขที่ถูกต้องและไม่ติดลบ' }))
      else setCatalogErrors((prev) => ({ ...prev, product: 'ข้อมูลตัวเลือกสินค้าไม่ถูกต้อง' }))
      return
    }

    try {
      customFormFieldsPayload = normalizeCustomFormFieldsForSubmit(productForm.custom_form_fields)
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.includes('_missing_label')) setCatalogErrors((prev) => ({ ...prev, product: 'ฟอร์มกำหนดเองทุกช่องต้องมีข้อความแสดงผล' }))
      else if (msg.includes('_missing_id')) setCatalogErrors((prev) => ({ ...prev, product: 'ฟอร์มกำหนดเองทุกช่องต้องมีคีย์ข้อมูล (Field key)' }))
      else if (msg.includes('_duplicate_id')) setCatalogErrors((prev) => ({ ...prev, product: 'คีย์ข้อมูลของฟอร์มกำหนดเองต้องไม่ซ้ำกัน' }))
      else setCatalogErrors((prev) => ({ ...prev, product: 'ข้อมูลฟอร์มกำหนดเองไม่ถูกต้อง' }))
      return
    }

    const selectedFulfillmentType = normalizeCatalogFulfillmentType(productForm.fulfillment_type)
    const isMysteryProduct = selectedFulfillmentType === 'mystery_box'
    const useCustomForm = !isMysteryProduct && customFormFieldsPayload.length > 0
    const finalFulfillmentType = isMysteryProduct ? 'mystery_box' : useCustomForm ? 'farm_form' : 'digital_stock'

    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setCatalogErrors((prev) => ({ ...prev, product: 'จำเป็นต้องเลือกหมวดหมู่' }))
      return
    }
    if (!name || !slug) {
      setCatalogErrors((prev) => ({ ...prev, product: 'จำเป็นต้องกรอกชื่อและ slug' }))
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setCatalogErrors((prev) => ({ ...prev, product: 'ราคาต้องเป็นตัวเลขที่ถูกต้อง' }))
      return
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setCatalogErrors((prev) => ({ ...prev, product: 'สต็อกต้องเป็นศูนย์หรือมากกว่า' }))
      return
    }
    if (!Number.isFinite(sortOrder)) {
      setCatalogErrors((prev) => ({ ...prev, product: 'ลำดับการแสดงผลต้องเป็นตัวเลขที่ถูกต้อง' }))
      return
    }

    const payload = {
      category_id: categoryId,
      name,
      slug,
      price,
      stock,
      sort_order: sortOrder,
      image_url: String(productForm.image_url || '').trim() || null,
      description: String(productForm.description || '').trim(),
      highlights: String(productForm.highlights || '').trim(),
      manual_url: String(productForm.manual_url || '').trim(),
      manual_text: String(productForm.manual_text || '').trim(),
      manual_video_url: String(productForm.manual_video_url || '').trim(),
      fulfillment_type: finalFulfillmentType,
      is_featured: Boolean(productForm.is_featured),
      is_unlimited_stock: Boolean(productForm.is_unlimited_stock),
      farm_form_username_enabled: true,
      farm_form_password_enabled: true,
      farm_form_auth_key_enabled: true,
      farm_form_fields: useCustomForm ? customFormFieldsPayload : [],
      product_options: productOptionsPayload,
    }

    try {
      setCatalogActionState({ status: 'working', message: productForm.id ? 'กำลังอัปเดตสินค้า...' : 'กำลังสร้างสินค้า...' })
      setCatalogErrors((prev) => ({ ...prev, product: '' }))

      if (productForm.id) {
        await fetchJson(`/api/admin/products/${productForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetchJson('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      setProductForm(DEFAULT_PRODUCT_FORM)
      setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
      setProductOptionError('')
      setCatalogActionState({ status: 'success', message: 'บันทึกสินค้าเรียบร้อย' })
      await loadModule('catalog')
    } catch (err) {
      if (Number(err?.status) === 409 && String(err?.data?.error || '') === 'slug_taken') {
        setCatalogErrors((prev) => ({ ...prev, product: 'slug สินค้านี้ถูกใช้งานแล้ว' }))
      } else {
        setCatalogErrors((prev) => ({ ...prev, product: getErrorMessage(err, 'ไม่สามารถบันทึกสินค้าได้') }))
      }
      setCatalogActionState({ status: 'error', message: 'ดำเนินการสินค้าไม่สำเร็จ' })
    }
  }

  function applyProductOptionDraft() {
    const suggestedId = normalizeProductOptionId(productOptionDraft.label || productOptionDraft.value)
    const id = String(productOptionDraft.id || '').trim() || suggestedId
    const label = String(productOptionDraft.label || '').trim()
    const value = String(productOptionDraft.value || '').trim()
    const priceNum = Number(productOptionDraft.price_points)
    const editIndex = productOptionDraft.editIndex
    const isEdit = Number.isInteger(editIndex) && editIndex >= 0

    if (!id) {
      setProductOptionError('จำเป็นต้องกรอก ID ตัวเลือก หรือกดปุ่มสร้าง ID อัตโนมัติ')
      return
    }
    if (!label) {
      setProductOptionError('จำเป็นต้องกรอกชื่อแสดงผลตัวเลือก')
      return
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setProductOptionError('ราคาตัวเลือกต้องเป็นตัวเลขที่ถูกต้องและไม่ติดลบ')
      return
    }

    const duplicated = (productForm.product_options || []).some((item, idx) => {
      if (isEdit && idx === editIndex) return false
      return String(item?.id ?? '').trim().toLowerCase() === id.toLowerCase()
    })
    if (duplicated) {
      setProductOptionError('ID ตัวเลือกนี้มีอยู่แล้ว')
      return
    }

    const nextOption = { id, label, value, price_points: priceNum }
    setProductForm((prev) => {
      const base = Array.isArray(prev.product_options) ? [...prev.product_options] : []
      if (isEdit) base[editIndex] = nextOption
      else base.push(nextOption)
      return { ...prev, product_options: base }
    })
    setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
    setProductOptionError('')
  }

  function editProductOption(index) {
    const list = Array.isArray(productForm.product_options) ? productForm.product_options : []
    const opt = list[index] || null
    if (!opt) return
    setProductOptionDraft({
      editIndex: index,
      id: String(opt?.id ?? ''),
      label: String(opt?.label ?? ''),
      value: String(opt?.value ?? ''),
      price_points: String(opt?.price_points ?? ''),
    })
    setProductOptionError('')
  }

  function removeProductOption(index) {
    setProductForm((prev) => ({
      ...prev,
      product_options: (Array.isArray(prev.product_options) ? prev.product_options : []).filter((_, idx) => idx !== index),
    }))
    if (Number(productOptionDraft.editIndex) === index) {
      setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
    }
  }

  function moveProductOption(index, direction) {
    const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
    if (delta === 0) return
    setProductForm((prev) => {
      const list = Array.isArray(prev.product_options) ? [...prev.product_options] : []
      const nextIndex = index + delta
      if (index < 0 || nextIndex < 0 || index >= list.length || nextIndex >= list.length) return prev
      const [moved] = list.splice(index, 1)
      list.splice(nextIndex, 0, moved)
      return { ...prev, product_options: list }
    })
    if (Number.isInteger(productOptionDraft.editIndex) && productOptionDraft.editIndex === index) {
      setProductOptionDraft((prev) => ({ ...prev, editIndex: index + delta }))
    }
  }

  async function saveCoupon() {
    const code = String(couponForm.code || '').trim().toUpperCase()
    const points = Number(couponForm.points)
    const maxUses = couponForm.max_uses === '' ? null : Number(couponForm.max_uses)
    const usedCount = couponForm.used_count === '' ? null : Number(couponForm.used_count)
    const expiresAtMs = couponForm.expires_at ? Date.parse(couponForm.expires_at) : Number.NaN
    const expiresAtIso = Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null
    if (!couponForm.id && !code) {
      setPromotionsErrors((prev) => ({ ...prev, coupon: 'จำเป็นต้องกรอกโค้ดคูปอง' }))
      return
    }
    if (!Number.isFinite(points) || points <= 0) {
      setPromotionsErrors((prev) => ({ ...prev, coupon: 'จำนวนแต้มต้องมากกว่า 0' }))
      return
    }
    if (maxUses != null && (!Number.isFinite(maxUses) || maxUses <= 0)) {
      setPromotionsErrors((prev) => ({ ...prev, coupon: 'จำนวนใช้สูงสุดต้องมากกว่า 0' }))
      return
    }
    if (usedCount != null && (!Number.isFinite(usedCount) || usedCount < 0)) {
      setPromotionsErrors((prev) => ({ ...prev, coupon: 'จำนวนที่ใช้แล้วต้องเป็น 0 หรือมากกว่า' }))
      return
    }
    if (maxUses != null && usedCount != null && usedCount > maxUses) {
      setPromotionsErrors((prev) => ({ ...prev, coupon: 'จำนวนที่ใช้แล้วต้องไม่มากกว่าจำนวนใช้สูงสุด' }))
      return
    }
    if (couponForm.expires_at && !Number.isFinite(expiresAtMs)) {
      setPromotionsErrors((prev) => ({ ...prev, coupon: 'วันหมดอายุไม่ถูกต้อง' }))
      return
    }

    try {
      setPromotionsActionState({ status: 'working', message: couponForm.id ? 'กำลังอัปเดตคูปอง...' : 'กำลังสร้างคูปอง...' })
      setPromotionsErrors((prev) => ({ ...prev, coupon: '' }))

      if (couponForm.id) {
        await fetchJson(`/api/admin/coupons/${couponForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points,
            max_uses: maxUses,
            used_count: usedCount,
            expires_at: expiresAtIso,
            is_active: Boolean(couponForm.is_active),
          }),
        })
      } else {
        await fetchJson('/api/admin/coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            points,
            max_uses: maxUses,
            expires_at: expiresAtIso,
            is_active: Boolean(couponForm.is_active),
          }),
        })
      }

      setCouponForm(DEFAULT_COUPON_FORM)
      setPromotionsActionState({ status: 'success', message: 'บันทึกคูปองเรียบร้อย' })
      await loadModule('promotions')
    } catch (err) {
      if (Number(err?.status) === 409 && String(err?.data?.error || '') === 'code_taken') {
        setPromotionsErrors((prev) => ({ ...prev, coupon: 'โค้ดคูปองนี้ถูกใช้งานแล้ว' }))
      } else {
        setPromotionsErrors((prev) => ({ ...prev, coupon: getErrorMessage(err, 'ไม่สามารถบันทึกคูปองได้') }))
      }
      setPromotionsActionState({ status: 'error', message: 'ดำเนินการคูปองไม่สำเร็จ' })
    }
  }

  async function removeCoupon(couponId) {
    const id = Number(couponId)
    if (!Number.isFinite(id) || id <= 0) return
    if (!window.confirm(`ต้องการลบคูปอง #${id} ใช่หรือไม่?`)) return

    try {
      setPromotionsActionState({ status: 'working', message: 'กำลังลบคูปอง...' })
      await fetchJson(`/api/admin/coupons/${id}`, { method: 'DELETE' })
      if (Number(couponForm.id) === id) setCouponForm(DEFAULT_COUPON_FORM)
      patchPromotionsData((current) => ({
        ...current,
        coupons: (Array.isArray(current?.coupons) ? current.coupons : []).filter((row) => Number(row?.id) !== id),
      }))
      setPromotionsActionState({ status: 'success', message: 'ลบคูปองเรียบร้อย' })
    } catch (err) {
      setPromotionsErrors((prev) => ({ ...prev, coupon: getErrorMessage(err, 'ไม่สามารถลบคูปองได้') }))
      setPromotionsActionState({ status: 'error', message: 'ดำเนินการคูปองไม่สำเร็จ' })
    }
  }

  async function savePromotion() {
    const productId = Number(promotionForm.product_id)
    const discountPercent = promotionForm.discount_percent === '' ? null : Number(promotionForm.discount_percent)
    const discountAmountPoints = promotionForm.discount_amount_points === '' ? null : Number(promotionForm.discount_amount_points)
    const startsAtMs = promotionForm.starts_at ? Date.parse(promotionForm.starts_at) : Number.NaN
    const endsAtMs = promotionForm.ends_at ? Date.parse(promotionForm.ends_at) : Number.NaN
    const hasPercent = discountPercent != null && Number.isFinite(discountPercent)
    const hasAmount = discountAmountPoints != null && Number.isFinite(discountAmountPoints)
    if (!Number.isFinite(productId) || productId <= 0) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: 'จำเป็นต้องเลือกสินค้า' }))
      return
    }
    if (discountPercent != null && (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 95)) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: 'ส่วนลด (%) ต้องอยู่ระหว่าง 1 - 95' }))
      return
    }
    if (discountAmountPoints != null && (!Number.isFinite(discountAmountPoints) || discountAmountPoints <= 0)) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: 'ส่วนลด (แต้ม) ต้องมากกว่า 0' }))
      return
    }
    if (!hasPercent && !hasAmount) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: 'กรุณากรอกส่วนลดเป็นเปอร์เซ็นต์หรือจำนวนแต้ม' }))
      return
    }
    if (hasPercent && hasAmount) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: 'เลือกส่วนลดได้อย่างใดอย่างหนึ่งเท่านั้น (เปอร์เซ็นต์ หรือ แต้ม)' }))
      return
    }
    if (promotionForm.starts_at && !Number.isFinite(startsAtMs)) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: 'วันเริ่มโปรโมชันไม่ถูกต้อง' }))
      return
    }
    if (promotionForm.ends_at && !Number.isFinite(endsAtMs)) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: 'วันสิ้นสุดโปรโมชันไม่ถูกต้อง' }))
      return
    }
    if (Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs) && startsAtMs > endsAtMs) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: 'วันเริ่มต้องไม่ช้ากว่าวันสิ้นสุด' }))
      return
    }

    try {
      setPromotionsActionState({ status: 'working', message: promotionForm.id ? 'กำลังอัปเดตโปรโมชัน...' : 'กำลังสร้างโปรโมชัน...' })
      setPromotionsErrors((prev) => ({ ...prev, promotion: '' }))

      const payload = {
        product_id: productId,
        title: String(promotionForm.title || '').trim(),
        discount_percent: hasPercent ? Math.trunc(discountPercent) : null,
        discount_amount_points: hasAmount ? Math.trunc(discountAmountPoints) : null,
        starts_at: Number.isFinite(startsAtMs) ? new Date(startsAtMs).toISOString() : null,
        ends_at: Number.isFinite(endsAtMs) ? new Date(endsAtMs).toISOString() : null,
        is_active: Boolean(promotionForm.is_active),
      }

      if (promotionForm.id) {
        await fetchJson(`/api/admin/promotions/${promotionForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetchJson('/api/admin/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      setPromotionForm(DEFAULT_PROMOTION_FORM)
      setPromotionsActionState({ status: 'success', message: 'บันทึกโปรโมชันเรียบร้อย' })
      await loadModule('promotions')
    } catch (err) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: getErrorMessage(err, 'ไม่สามารถบันทึกโปรโมชันได้') }))
      setPromotionsActionState({ status: 'error', message: 'ดำเนินการโปรโมชันไม่สำเร็จ' })
    }
  }

  async function removePromotion(promotionId) {
    const id = Number(promotionId)
    if (!Number.isFinite(id) || id <= 0) return
    if (!window.confirm(`ต้องการลบโปรโมชัน #${id} ใช่หรือไม่?`)) return

    try {
      setPromotionsActionState({ status: 'working', message: 'กำลังลบโปรโมชัน...' })
      await fetchJson(`/api/admin/promotions/${id}`, { method: 'DELETE' })
      if (Number(promotionForm.id) === id) setPromotionForm(DEFAULT_PROMOTION_FORM)
      patchPromotionsData((current) => ({
        ...current,
        promotions: (Array.isArray(current?.promotions) ? current.promotions : []).filter((row) => Number(row?.id) !== id),
      }))
      setPromotionsActionState({ status: 'success', message: 'ลบโปรโมชันเรียบร้อย' })
    } catch (err) {
      setPromotionsErrors((prev) => ({ ...prev, promotion: getErrorMessage(err, 'ไม่สามารถลบโปรโมชันได้') }))
      setPromotionsActionState({ status: 'error', message: 'ดำเนินการโปรโมชันไม่สำเร็จ' })
    }
  }

  async function saveDiscountCoupon() {
    const code = String(discountCouponForm.code || '').trim().toUpperCase()
    const discountPercent = discountCouponForm.discount_percent === '' ? null : Number(discountCouponForm.discount_percent)
    const discountAmountPoints = discountCouponForm.discount_amount_points === '' ? null : Number(discountCouponForm.discount_amount_points)
    const maxUses = discountCouponForm.max_uses === '' ? null : Number(discountCouponForm.max_uses)
    const usedCount = discountCouponForm.used_count === '' ? null : Number(discountCouponForm.used_count)
    const expiresAtMs = discountCouponForm.expires_at ? Date.parse(discountCouponForm.expires_at) : Number.NaN
    const hasPercent = discountPercent != null && Number.isFinite(discountPercent)
    const hasAmount = discountAmountPoints != null && Number.isFinite(discountAmountPoints)
    if (!discountCouponForm.id && !code) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'จำเป็นต้องกรอกโค้ดคูปอง' }))
      return
    }
    if (discountPercent != null && (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 95)) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'ส่วนลด (%) ต้องอยู่ระหว่าง 1 - 95' }))
      return
    }
    if (discountAmountPoints != null && (!Number.isFinite(discountAmountPoints) || discountAmountPoints <= 0)) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'ส่วนลด (แต้ม) ต้องมากกว่า 0' }))
      return
    }
    if (!hasPercent && !hasAmount) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'กรุณากรอกส่วนลดเป็นเปอร์เซ็นต์หรือจำนวนแต้ม' }))
      return
    }
    if (hasPercent && hasAmount) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'เลือกส่วนลดได้อย่างใดอย่างหนึ่งเท่านั้น (เปอร์เซ็นต์ หรือ แต้ม)' }))
      return
    }
    if (maxUses != null && (!Number.isFinite(maxUses) || maxUses <= 0)) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'จำนวนใช้สูงสุดต้องมากกว่า 0' }))
      return
    }
    if (usedCount != null && (!Number.isFinite(usedCount) || usedCount < 0)) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'จำนวนที่ใช้แล้วต้องเป็น 0 หรือมากกว่า' }))
      return
    }
    if (maxUses != null && usedCount != null && usedCount > maxUses) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'จำนวนที่ใช้แล้วต้องไม่มากกว่าจำนวนใช้สูงสุด' }))
      return
    }
    if (discountCouponForm.expires_at && !Number.isFinite(expiresAtMs)) {
      setPromotionsErrors((prev) => ({ ...prev, discount: 'วันหมดอายุไม่ถูกต้อง' }))
      return
    }

    try {
      setPromotionsActionState({ status: 'working', message: discountCouponForm.id ? 'กำลังอัปเดตคูปองส่วนลด...' : 'กำลังสร้างคูปองส่วนลด...' })
      setPromotionsErrors((prev) => ({ ...prev, discount: '' }))

      const payload = {
        code,
        title: String(discountCouponForm.title || '').trim(),
        discount_percent: hasPercent ? Math.trunc(discountPercent) : null,
        discount_amount_points: hasAmount ? Math.trunc(discountAmountPoints) : null,
        max_uses: maxUses,
        used_count: usedCount,
        expires_at: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null,
        is_active: Boolean(discountCouponForm.is_active),
      }

      if (discountCouponForm.id) {
        await fetchJson(`/api/admin/discount-coupons/${discountCouponForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetchJson('/api/admin/discount-coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      setDiscountCouponForm(DEFAULT_DISCOUNT_COUPON_FORM)
      setPromotionsActionState({ status: 'success', message: 'บันทึกคูปองส่วนลดเรียบร้อย' })
      await loadModule('promotions')
    } catch (err) {
      if (Number(err?.status) === 409 && String(err?.data?.error || '') === 'code_taken') {
        setPromotionsErrors((prev) => ({ ...prev, discount: 'โค้ดคูปองนี้ถูกใช้งานแล้ว' }))
      } else {
        setPromotionsErrors((prev) => ({ ...prev, discount: getErrorMessage(err, 'ไม่สามารถบันทึกคูปองส่วนลดได้') }))
      }
      setPromotionsActionState({ status: 'error', message: 'ดำเนินการคูปองส่วนลดไม่สำเร็จ' })
    }
  }

  async function loadStockItems(productId) {
    const pid = Number(productId)
    if (!Number.isFinite(pid) || pid <= 0) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังโหลดรายการสต็อก...' })
      setStockErrors((prev) => ({ ...prev, product: '' }))
      const data = await fetchJson(`/api/admin/stock-items?product_id=${pid}&limit=200`, { method: 'GET' })
      patchStockData((current) => ({
        ...current,
        stockItems: Array.isArray(data?.items) ? data.items : [],
        stockSummary: data?.summary || null,
      }))
      setStockActionState({ status: 'success', message: 'โหลดรายการสต็อกเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, product: getErrorMessage(err, 'ไม่สามารถโหลดรายการสต็อกได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function loadMysteryPrizes(boxProductId) {
    const bid = Number(boxProductId)
    if (!Number.isFinite(bid) || bid <= 0) return
    try {
      setMysteryActionState({ status: 'working', message: 'กำลังโหลดพูลสุ่ม...' })
      setMysteryError('')
      const data = await fetchJson(`/api/admin/mystery-box-prizes?box_product_id=${bid}&limit=200`, { method: 'GET' })
      setMysteryPrizes(Array.isArray(data?.items) ? data.items : [])
      setMysteryActionState({ status: 'success', message: 'โหลดพูลสุ่มเรียบร้อย' })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถโหลดพูลสุ่มได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  async function runMysterySimulation() {
    const bid = Number(mysteryBoxProductId)
    const qty = Number(mysterySimulationDraft.qty)
    const trials = Number(mysterySimulationDraft.trials)
    if (!Number.isFinite(bid) || bid <= 0) {
      setMysteryError('กรุณาเลือกสินค้า Mystery Box ก่อน')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0 || qty > 20) {
      setMysteryError('จำนวนสุ่มต่อรอบต้องอยู่ระหว่าง 1 ถึง 20')
      return
    }
    if (!Number.isFinite(trials) || trials <= 0 || trials > 20000) {
      setMysteryError('จำนวนรอบจำลองต้องอยู่ระหว่าง 1 ถึง 20000')
      return
    }

    try {
      setMysteryActionState({ status: 'working', message: 'กำลังจำลองผลสุ่ม...' })
      setMysteryError('')
      const qs = new URLSearchParams({
        box_product_id: String(bid),
        qty: String(Math.trunc(qty)),
        trials: String(Math.trunc(trials)),
      })
      const data = await fetchJson(`/api/admin/mystery-box/simulate?${qs.toString()}`, { method: 'GET' })
      setMysterySimulation(data?.simulation || null)
      setMysteryActionState({ status: 'success', message: 'จำลองผลเรียบร้อย' })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถจำลองผลได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  function editAutomationRule(rule) {
    const triggerConfig = rule?.trigger_config && typeof rule.trigger_config === 'object' ? rule.trigger_config : {}
    const actionConfig = rule?.action_config && typeof rule.action_config === 'object' ? rule.action_config : {}
    setAutomationRuleForm({
      id: Number(rule?.id) || null,
      name: String(rule?.name || ''),
      trigger_type: String(rule?.trigger_type || 'support_unassigned_overdue'),
      trigger_minutes: Math.max(1, Number(triggerConfig?.minutes || 30)),
      action_severity: String(actionConfig?.severity || 'high'),
      is_active: Boolean(rule?.is_active),
    })
  }

  async function saveAutomationRule() {
    const name = String(automationRuleForm.name || '').trim()
    const triggerType = String(automationRuleForm.trigger_type || '').trim().toLowerCase()
    const triggerMinutes = Number(automationRuleForm.trigger_minutes)
    const severity = String(automationRuleForm.action_severity || '').trim().toLowerCase()

    if (!name) {
      setAutomationError('Rule name is required')
      return
    }
    if (!['support_unassigned_overdue', 'farm_unassigned_overdue'].includes(triggerType)) {
      setAutomationError('Invalid trigger type')
      return
    }
    if (!Number.isFinite(triggerMinutes) || triggerMinutes <= 0 || triggerMinutes > 43200) {
      setAutomationError('Trigger minutes must be between 1 and 43200')
      return
    }
    if (!['low', 'medium', 'high'].includes(severity)) {
      setAutomationError('Severity must be low, medium, or high')
      return
    }

    try {
      setAutomationActionState({ status: 'working', message: automationRuleForm.id ? 'Updating rule...' : 'Creating rule...' })
      setAutomationError('')
      const payload = {
        name,
        trigger_type: triggerType,
        trigger_config: { minutes: Math.trunc(triggerMinutes) },
        action_type: 'create_notification',
        action_config: { severity },
        is_active: Boolean(automationRuleForm.is_active),
      }

      if (automationRuleForm.id) {
        await fetchJson(`/api/admin/workflow-automation/rules/${automationRuleForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetchJson('/api/admin/workflow-automation/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      setAutomationRuleForm(DEFAULT_AUTOMATION_RULE_FORM)
      await loadModule('automation')
      setAutomationActionState({ status: 'success', message: 'Rule saved' })
    } catch (err) {
      setAutomationError(getErrorMessage(err, 'Unable to save workflow rule'))
      setAutomationActionState({ status: 'error', message: 'Workflow action failed' })
    }
  }

  async function removeAutomationRule(ruleId) {
    const id = Number(ruleId)
    if (!Number.isFinite(id) || id <= 0) return
    if (!window.confirm(`Delete workflow rule #${id}?`)) return
    try {
      setAutomationActionState({ status: 'working', message: `Deleting rule #${id}...` })
      setAutomationError('')
      await fetchJson(`/api/admin/workflow-automation/rules/${id}`, { method: 'DELETE' })
      if (Number(automationRuleForm.id) === id) setAutomationRuleForm(DEFAULT_AUTOMATION_RULE_FORM)
      patchAutomationData((current) => ({
        ...current,
        rules: (Array.isArray(current?.rules) ? current.rules : []).filter((row) => Number(row?.id) !== id),
      }))
      setAutomationActionState({ status: 'success', message: 'Rule deleted' })
    } catch (err) {
      setAutomationError(getErrorMessage(err, 'Unable to delete workflow rule'))
      setAutomationActionState({ status: 'error', message: 'Workflow action failed' })
    }
  }

  async function runWorkflowAutomation() {
    try {
      setAutomationActionState({ status: 'working', message: 'Running automation rules...' })
      setAutomationError('')
      const data = await fetchJson('/api/admin/workflow-automation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit_per_rule: 20 }),
      })
      await loadModule('automation')
      const created = Number(data?.result?.created_events || 0)
      const matched = Number(data?.result?.matched || 0)
      setAutomationActionState({ status: 'success', message: `Run complete • matched ${formatNumber(matched)} • created ${formatNumber(created)}` })
    } catch (err) {
      setAutomationError(getErrorMessage(err, 'Unable to run workflow automation'))
      setAutomationActionState({ status: 'error', message: 'Workflow action failed' })
    }
  }

  async function createMysteryPrize() {
    const bid = Number(mysteryBoxProductId)
    const kind = String(mysteryForm.prize_kind || 'product')
    const prizeName = String(mysteryForm.prize_name || '').trim()
    const prizeProductId = mysteryForm.prize_product_id === '' ? null : Number(mysteryForm.prize_product_id)
    const weight = Number(mysteryForm.weight)
    const remaining = Number(mysteryForm.remaining)
    const stockLines = splitStockLines(mysteryFormStockText)
    const effectiveRemaining = kind === 'product' ? Math.max(remaining, stockLines.length) : remaining

    if (!Number.isFinite(bid) || bid <= 0) {
      setMysteryError('กรุณาเลือกสินค้า Mystery Box ก่อน')
      return
    }
    if (!['product', 'linked_product', 'salt'].includes(kind)) {
      setMysteryError('ประเภทรางวัลไม่ถูกต้อง')
      return
    }
    if (kind === 'linked_product' && (!Number.isFinite(prizeProductId) || prizeProductId <= 0)) {
      setMysteryError('กรุณาเลือกสินค้าเพื่อเชื่อมสต็อก')
      return
    }
    if (kind === 'salt' && !prizeName) {
      setMysteryError('กรุณาตั้งชื่อรางวัลเกลือ')
      return
    }
    if (kind === 'product' && stockLines.length < 1) {
      setMysteryError('รางวัล Internal ต้องมีสต็อกอย่างน้อย 1 รายการ')
      return
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setMysteryError('น้ำหนักต้องมากกว่า 0')
      return
    }
    if (!Number.isFinite(effectiveRemaining) || effectiveRemaining < 0) {
      setMysteryError('จำนวนคงเหลือต้องไม่น้อยกว่า 0')
      return
    }

    try {
      setMysteryActionState({ status: 'working', message: 'กำลังสร้างรางวัล...' })
      setMysteryError('')
      const created = await fetchJson('/api/admin/mystery-box-prizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          box_product_id: bid,
          prize_kind: kind,
          prize_name: prizeName,
          prize_product_id: kind === 'linked_product' ? prizeProductId : null,
          weight,
          remaining: effectiveRemaining,
          is_active: Boolean(mysteryForm.is_active),
        }),
      })

      const createdPrizeId = Number(created?.id)
      if (kind === 'product' && Number.isFinite(createdPrizeId) && createdPrizeId > 0 && stockLines.length > 0) {
        await fetchJson('/api/admin/mystery-box-prize-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ box_product_id: bid, prize_id: createdPrizeId, items: stockLines }),
        })
      }

      setMysteryForm(DEFAULT_MYSTERY_FORM)
      setMysteryFormStockText('')
      setMysteryPrizeStockText('')
      await loadMysteryPrizes(bid)
      if (kind === 'product' && Number.isFinite(createdPrizeId) && createdPrizeId > 0) {
        await loadMysteryPrizeStock(createdPrizeId)
      }
      setMysteryActionState({ status: 'success', message: 'สร้างรางวัลเรียบร้อย' })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถสร้างรางวัลได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  async function saveMysteryPrizeEdit() {
    const id = Number(mysteryEdit.id)
    const prizeName = String(mysteryEdit.prize_name || '').trim()
    const weight = Number(mysteryEdit.weight)
    const remaining = Number(mysteryEdit.remaining)
    if (!Number.isFinite(id) || id <= 0) return
    if (!Number.isFinite(weight) || weight <= 0) {
      setMysteryError('น้ำหนักต้องมากกว่า 0')
      return
    }
    if (!Number.isFinite(remaining) || remaining < 0) {
      setMysteryError('จำนวนคงเหลือต้องไม่น้อยกว่า 0')
      return
    }
    const targetPrize = mysteryPrizes.find((row) => Number(row?.id) === id)
    if (String(targetPrize?.prize_kind || '') === 'salt' && !prizeName) {
      setMysteryError('กรุณาตั้งชื่อรางวัลเกลือ')
      return
    }

    try {
      setMysteryActionState({ status: 'working', message: `กำลังอัปเดตรางวัล #${id}...` })
      setMysteryError('')
      await fetchJson(`/api/admin/mystery-box-prizes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prize_name: prizeName, weight, remaining, is_active: Boolean(mysteryEdit.is_active) }),
      })
      setMysteryEdit(DEFAULT_MYSTERY_EDIT)
      await loadMysteryPrizes(mysteryBoxProductId)
      setMysteryActionState({ status: 'success', message: 'อัปเดตรางวัลเรียบร้อย' })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถอัปเดตรางวัลได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  async function deleteMysteryPrize(prizeId) {
    const id = Number(prizeId)
    if (!Number.isFinite(id) || id <= 0) return
    if (!window.confirm(`ต้องการลบรางวัล #${id} ใช่หรือไม่?`)) return

    try {
      setMysteryActionState({ status: 'working', message: `กำลังลบรางวัล #${id}...` })
      setMysteryError('')
      await fetchJson(`/api/admin/mystery-box-prizes/${id}`, { method: 'DELETE' })
      if (Number(mysteryEdit.id) === id) setMysteryEdit(DEFAULT_MYSTERY_EDIT)
      if (Number(mysteryPrizeStockPrizeId) === id) {
        setMysteryPrizeStockPrizeId('')
        setMysteryPrizeStockText('')
        setMysteryPrizeStockItems([])
        setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      }
      await loadMysteryPrizes(mysteryBoxProductId)
      setMysteryActionState({ status: 'success', message: 'ลบรางวัลเรียบร้อย' })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถลบรางวัลได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  async function loadMysteryPrizeStock(prizeId) {
    const pid = Number(prizeId)
    if (!Number.isFinite(pid) || pid <= 0) return
    try {
      setMysteryActionState({ status: 'working', message: `กำลังโหลดสต็อกรางวัล #${pid}...` })
      setMysteryError('')
      const data = await fetchJson(`/api/admin/mystery-box-prize-stock?prize_id=${pid}&limit=200`, { method: 'GET' })
      setMysteryPrizeStockPrizeId(String(pid))
      setMysteryPrizeStockItems(Array.isArray(data?.items) ? data.items : [])
      setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      setMysteryActionState({ status: 'success', message: `โหลดสต็อกรางวัล #${pid} เรียบร้อย` })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถโหลดสต็อกรางวัลได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  async function addMysteryPrizeStockItems() {
    const bid = Number(mysteryBoxProductId)
    const pid = Number(mysteryPrizeStockPrizeId)
    const lines = splitStockLines(mysteryPrizeStockText)

    if (!Number.isFinite(bid) || bid <= 0) {
      setMysteryError('กรุณาเลือกสินค้า Mystery Box ก่อน')
      return
    }
    if (!Number.isFinite(pid) || pid <= 0) {
      setMysteryError('กรุณาเลือกรางวัล Internal ก่อน')
      return
    }
    if (lines.length < 1) {
      setMysteryError('กรอกสต็อกอย่างน้อย 1 บรรทัด')
      return
    }

    try {
      setMysteryActionState({ status: 'working', message: `กำลังเพิ่มสต็อกให้รางวัล #${pid}...` })
      setMysteryError('')
      await fetchJson('/api/admin/mystery-box-prize-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box_product_id: bid, prize_id: pid, items: lines }),
      })
      setMysteryPrizeStockText('')
      await Promise.all([loadMysteryPrizes(bid), loadMysteryPrizeStock(pid)])
      setMysteryActionState({ status: 'success', message: `เพิ่มสต็อกรางวัล #${pid} เรียบร้อย` })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถเพิ่มสต็อกรางวัลได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  async function saveMysteryPrizeStockItemEdit() {
    const sid = Number(mysteryPrizeStockItemEdit.id)
    const pid = Number(mysteryPrizeStockPrizeId)
    const bid = Number(mysteryBoxProductId)
    if (!Number.isFinite(sid) || sid <= 0) return
    try {
      setMysteryActionState({ status: 'working', message: `กำลังอัปเดตรายการสต็อก #${sid}...` })
      setMysteryError('')
      await fetchJson(`/api/admin/mystery-box-prize-stock-items/${sid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: mysteryPrizeStockItemEdit.status, image_url: mysteryPrizeStockItemEdit.image_url || null }),
      })
      setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      await Promise.all([loadMysteryPrizes(bid), loadMysteryPrizeStock(pid)])
      setMysteryActionState({ status: 'success', message: 'อัปเดตรายการสต็อกเรียบร้อย' })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถอัปเดตรายการสต็อกได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  async function deleteMysteryPrizeStockItem(stockItemId) {
    const sid = Number(stockItemId)
    const pid = Number(mysteryPrizeStockPrizeId)
    const bid = Number(mysteryBoxProductId)
    if (!Number.isFinite(sid) || sid <= 0) return
    if (!window.confirm(`ต้องการลบรายการสต็อก #${sid} ใช่หรือไม่?`)) return
    try {
      setMysteryActionState({ status: 'working', message: `กำลังลบรายการสต็อก #${sid}...` })
      setMysteryError('')
      await fetchJson(`/api/admin/mystery-box-prize-stock-items/${sid}`, { method: 'DELETE' })
      if (Number(mysteryPrizeStockItemEdit.id) === sid) setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      await Promise.all([loadMysteryPrizes(bid), loadMysteryPrizeStock(pid)])
      setMysteryActionState({ status: 'success', message: 'ลบรายการสต็อกเรียบร้อย' })
    } catch (err) {
      setMysteryError(getErrorMessage(err, 'ไม่สามารถลบรายการสต็อกได้'))
      setMysteryActionState({ status: 'error', message: 'ดำเนินการ Mystery Pool ไม่สำเร็จ' })
    }
  }

  async function addStockItems() {
    const pid = Number(stockProductId)
    if (!Number.isFinite(pid) || pid <= 0) {
      setStockErrors((prev) => ({ ...prev, product: 'กรุณาเลือกสินค้าก่อน' }))
      return
    }
    if (!String(stockText || '').trim()) {
      setStockErrors((prev) => ({ ...prev, product: 'กรอกสต็อกอย่างน้อย 1 บรรทัด' }))
      return
    }

    try {
      setStockActionState({ status: 'working', message: 'กำลังเพิ่มสต็อก...' })
      setStockErrors((prev) => ({ ...prev, product: '' }))
      const data = await fetchJson('/api/admin/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: pid, text: stockText }),
      })
      setStockText('')
      patchStockData((current) => ({ ...current, stockSummary: data?.summary || current?.stockSummary || null }))
      await loadStockItems(pid)
      setStockActionState({ status: 'success', message: `เพิ่มสต็อกแล้ว ${formatNumber(data?.result?.inserted || 0)} รายการ` })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, product: getErrorMessage(err, 'ไม่สามารถเพิ่มสต็อกได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function saveStockItemEdit() {
    const sid = Number(stockItemEdit.id)
    if (!Number.isFinite(sid) || sid <= 0) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังอัปเดตรายการสต็อก...' })
      await fetchJson(`/api/admin/stock-items/${sid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: stockItemEdit.payload, status: stockItemEdit.status }),
      })
      setStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      await loadStockItems(stockProductId)
      setStockActionState({ status: 'success', message: 'อัปเดตรายการสต็อกเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, product: getErrorMessage(err, 'ไม่สามารถอัปเดตรายการสต็อกได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function deleteStockItem(stockItemId) {
    const sid = Number(stockItemId)
    if (!Number.isFinite(sid) || sid <= 0) return
    if (!window.confirm(`ต้องการลบรายการสต็อก #${sid} ใช่หรือไม่?`)) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังลบรายการสต็อก...' })
      await fetchJson(`/api/admin/stock-items/${sid}`, { method: 'DELETE' })
      await loadStockItems(stockProductId)
      setStockActionState({ status: 'success', message: 'ลบรายการสต็อกเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, product: getErrorMessage(err, 'ไม่สามารถลบรายการสต็อกได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function saveStockPool() {
    const name = String(poolForm.name || '').trim()
    if (!name) {
      setStockErrors((prev) => ({ ...prev, pool: 'จำเป็นต้องกรอกชื่อพูล' }))
      return
    }
    try {
      setStockActionState({ status: 'working', message: poolForm.id ? 'กำลังอัปเดตพูลสต็อก...' : 'กำลังสร้างพูลสต็อก...' })
      setStockErrors((prev) => ({ ...prev, pool: '' }))
      const payload = {
        name,
        kind: poolForm.kind,
        quantity_remaining: poolForm.kind === 'quantity' ? (poolForm.quantity_remaining === '' ? null : Number(poolForm.quantity_remaining)) : null,
        is_active: Boolean(poolForm.is_active),
      }
      if (poolForm.id) {
        await fetchJson(`/api/admin/stock-pools/${poolForm.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetchJson('/api/admin/stock-pools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      const refreshed = await fetchJson('/api/admin/stock-pools?limit=200&offset=0', { method: 'GET' })
      patchStockData((current) => ({ ...current, pools: Array.isArray(refreshed?.pools) ? refreshed.pools : [] }))
      setPoolForm(DEFAULT_POOL_FORM)
      setStockActionState({ status: 'success', message: 'บันทึกพูลสต็อกเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, pool: getErrorMessage(err, 'ไม่สามารถบันทึกพูลสต็อกได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function deleteStockPool(poolId) {
    const id = Number(poolId)
    if (!Number.isFinite(id) || id <= 0) return
    if (!window.confirm(`ต้องการลบพูล #${id} ใช่หรือไม่? การลบนี้จะลบรายการในพูลและ binding ด้วย`)) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังลบพูลสต็อก...' })
      await fetchJson(`/api/admin/stock-pools/${id}`, { method: 'DELETE' })
      const refreshed = await fetchJson('/api/admin/stock-pools?limit=200&offset=0', { method: 'GET' })
      patchStockData((current) => ({
        ...current,
        pools: Array.isArray(refreshed?.pools) ? refreshed.pools : [],
        poolItems: [],
        poolSummary: null,
      }))
      if (Number(poolSelectedId) === id) setPoolSelectedId('')
      if (Number(poolBindingPoolId) === id) setPoolBindingPoolId('')
      setStockActionState({ status: 'success', message: 'ลบพูลสต็อกเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, pool: getErrorMessage(err, 'ไม่สามารถลบพูลสต็อกได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function loadPoolItems(poolId) {
    const pid = Number(poolId)
    if (!Number.isFinite(pid) || pid <= 0) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังโหลดรายการในพูล...' })
      const data = await fetchJson(`/api/admin/stock-pool-items?pool_id=${pid}&limit=200&offset=0`, { method: 'GET' })
      patchStockData((current) => ({
        ...current,
        poolItems: Array.isArray(data?.items) ? data.items : [],
        poolSummary: data?.summary || null,
      }))
      setStockActionState({ status: 'success', message: 'โหลดรายการในพูลเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, poolItem: getErrorMessage(err, 'ไม่สามารถโหลดรายการในพูลได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function addPoolItems() {
    const pid = Number(poolSelectedId)
    if (!Number.isFinite(pid) || pid <= 0) {
      setStockErrors((prev) => ({ ...prev, poolItem: 'กรุณาเลือกพูลก่อน' }))
      return
    }
    if (!String(poolItemsText || '').trim()) {
      setStockErrors((prev) => ({ ...prev, poolItem: 'กรอกข้อมูลอย่างน้อย 1 บรรทัด' }))
      return
    }
    try {
      setStockActionState({ status: 'working', message: 'กำลังเพิ่มรายการในพูล...' })
      setStockErrors((prev) => ({ ...prev, poolItem: '' }))
      await fetchJson('/api/admin/stock-pool-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_id: pid, text: poolItemsText }),
      })
      setPoolItemsText('')
      await loadPoolItems(pid)
      setStockActionState({ status: 'success', message: 'เพิ่มรายการในพูลเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, poolItem: getErrorMessage(err, 'ไม่สามารถเพิ่มรายการในพูลได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function savePoolItemEdit() {
    const sid = Number(poolItemEdit.id)
    if (!Number.isFinite(sid) || sid <= 0) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังอัปเดตรายการในพูล...' })
      await fetchJson(`/api/admin/stock-pool-items/${sid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: poolItemEdit.payload, status: poolItemEdit.status }),
      })
      setPoolItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      await loadPoolItems(poolSelectedId)
      setStockActionState({ status: 'success', message: 'อัปเดตรายการในพูลเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, poolItem: getErrorMessage(err, 'ไม่สามารถอัปเดตรายการในพูลได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function deletePoolItem(poolItemId) {
    const sid = Number(poolItemId)
    if (!Number.isFinite(sid) || sid <= 0) return
    if (!window.confirm(`ต้องการลบรายการในพูล #${sid} ใช่หรือไม่?`)) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังลบรายการในพูล...' })
      await fetchJson(`/api/admin/stock-pool-items/${sid}`, { method: 'DELETE' })
      await loadPoolItems(poolSelectedId)
      setStockActionState({ status: 'success', message: 'ลบรายการในพูลเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, poolItem: getErrorMessage(err, 'ไม่สามารถลบรายการในพูลได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function loadPoolBindings(productId) {
    const pid = Number(productId)
    if (!Number.isFinite(pid) || pid <= 0) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังโหลดการผูกพูล...' })
      const data = await fetchJson(`/api/admin/product-option-stock-bindings?product_id=${pid}`, { method: 'GET' })
      patchStockData((current) => ({
        ...current,
        poolBindings: Array.isArray(data?.bindings) ? data.bindings : [],
      }))
      setStockActionState({ status: 'success', message: 'โหลดการผูกพูลเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, binding: getErrorMessage(err, 'ไม่สามารถโหลดการผูกพูลได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function setPoolBinding() {
    const productId = Number(poolBindProductId)
    const poolId = Number(poolBindingPoolId)
    const optionId = String(poolBindingOptionId || '').trim()
    if (!Number.isFinite(productId) || productId <= 0) {
      setStockErrors((prev) => ({ ...prev, binding: 'กรุณาเลือกสินค้าที่ต้องการผูกก่อน' }))
      return
    }
    if (!Number.isFinite(poolId) || poolId <= 0) {
      setStockErrors((prev) => ({ ...prev, binding: 'กรุณาเลือกพูลที่ต้องการผูก' }))
      return
    }
    try {
      setStockActionState({ status: 'working', message: 'กำลังตั้งค่าการผูกพูล...' })
      const data = await fetchJson('/api/admin/product-option-stock-bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          product_option_id: optionId || null,
          pool_id: poolId,
        }),
      })
      patchStockData((current) => ({ ...current, poolBindings: Array.isArray(data?.bindings) ? data.bindings : [] }))
      setPoolBindingOptionId('')
      setStockActionState({ status: 'success', message: 'บันทึกการผูกพูลเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, binding: getErrorMessage(err, 'ไม่สามารถตั้งค่าการผูกพูลได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function unsetPoolBinding(optionId) {
    const productId = Number(poolBindProductId)
    if (!Number.isFinite(productId) || productId <= 0) return
    try {
      setStockActionState({ status: 'working', message: 'กำลังยกเลิกการผูกพูล...' })
      const data = await fetchJson('/api/admin/product-option-stock-bindings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, product_option_id: optionId || null }),
      })
      patchStockData((current) => ({ ...current, poolBindings: Array.isArray(data?.bindings) ? data.bindings : [] }))
      setStockActionState({ status: 'success', message: 'ยกเลิกการผูกพูลเรียบร้อย' })
    } catch (err) {
      setStockErrors((prev) => ({ ...prev, binding: getErrorMessage(err, 'ไม่สามารถยกเลิกการผูกพูลได้') }))
      setStockActionState({ status: 'error', message: 'ดำเนินการสต็อกไม่สำเร็จ' })
    }
  }

  async function removeDiscountCoupon(discountCouponId) {
    const id = Number(discountCouponId)
    if (!Number.isFinite(id) || id <= 0) return
    if (!window.confirm(`ต้องการลบคูปองส่วนลด #${id} ใช่หรือไม่?`)) return

    try {
      setPromotionsActionState({ status: 'working', message: 'กำลังลบคูปองส่วนลด...' })
      await fetchJson(`/api/admin/discount-coupons/${id}`, { method: 'DELETE' })
      if (Number(discountCouponForm.id) === id) setDiscountCouponForm(DEFAULT_DISCOUNT_COUPON_FORM)
      patchPromotionsData((current) => ({
        ...current,
        discountCoupons: (Array.isArray(current?.discountCoupons) ? current.discountCoupons : []).filter((row) => Number(row?.id) !== id),
      }))
      setPromotionsActionState({ status: 'success', message: 'ลบคูปองส่วนลดเรียบร้อย' })
    } catch (err) {
      setPromotionsErrors((prev) => ({ ...prev, discount: getErrorMessage(err, 'ไม่สามารถลบคูปองส่วนลดได้') }))
      setPromotionsActionState({ status: 'error', message: 'ดำเนินการคูปองส่วนลดไม่สำเร็จ' })
    }
  }

  async function setProductHidden(productId, isHidden) {
    const id = Number(productId)
    if (!Number.isFinite(id) || id <= 0) return
    try {
      setCatalogActionState({ status: 'working', message: 'Updating product visibility...' })
      await fetchJson(`/api/admin/products/${id}/hidden`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: Boolean(isHidden) }),
      })
      patchCatalogData((current) => ({
        ...current,
        products: (Array.isArray(current?.products) ? current.products : []).map((row) => (Number(row?.id) === id ? { ...row, is_hidden: Boolean(isHidden) } : row)),
      }))
      setCatalogActionState({ status: 'success', message: 'Product visibility updated' })
    } catch (err) {
      setCatalogErrors((prev) => ({ ...prev, product: getErrorMessage(err, 'Unable to update visibility') }))
      setCatalogActionState({ status: 'error', message: 'Product action failed' })
    }
  }

  async function removeProduct(productId) {
    const id = Number(productId)
    if (!Number.isFinite(id) || id <= 0) return
    if (!window.confirm(`Delete product #${id}?`)) return

    try {
      setCatalogActionState({ status: 'working', message: 'Deleting product...' })
      setCatalogErrors((prev) => ({ ...prev, product: '' }))
      await fetchJson(`/api/admin/products/${id}`, { method: 'DELETE' })
      if (Number(productForm.id) === id) setProductForm(DEFAULT_PRODUCT_FORM)
      setCatalogActionState({ status: 'success', message: 'Product deleted' })
      await loadModule('catalog')
    } catch (err) {
      if (Number(err?.status) === 409 && String(err?.data?.error || '') === 'product_in_use') {
        setCatalogErrors((prev) => ({ ...prev, product: 'Product is in use. Hide it instead of deleting.' }))
      } else {
        setCatalogErrors((prev) => ({ ...prev, product: getErrorMessage(err, 'Unable to delete product') }))
      }
      setCatalogActionState({ status: 'error', message: 'Product action failed' })
    }
  }

  function renderCatalogModule(data) {
    const categories = Array.isArray(data?.categories) ? data.categories : []
    const products = Array.isArray(data?.products) ? data.products : []
    const categoryMap = new Map(categories.map((cat) => [Number(cat?.id), cat]))

    const term = String(catalogFilter.search || '').trim().toLowerCase()
    const selectedCategoryId = catalogFilter.categoryId === 'all' ? null : Number(catalogFilter.categoryId)

    const filteredProducts = products.filter((row) => {
      const rowCategoryId = Number(row?.category_id)
      if (Number.isFinite(selectedCategoryId) && selectedCategoryId > 0 && rowCategoryId !== selectedCategoryId) return false

      const hidden = Boolean(row?.is_hidden)
      if (catalogFilter.hidden === 'visible' && hidden) return false
      if (catalogFilter.hidden === 'hidden' && !hidden) return false

      if (!term) return true
      const cat = categoryMap.get(rowCategoryId)
      const haystack = `${row?.id || ''} ${row?.name || ''} ${row?.slug || ''} ${cat?.name || ''}`.toLowerCase()
      return haystack.includes(term)
    })

    const sortedProducts = [...filteredProducts].sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))
    const pageSize = 20
    const totalPages = Math.max(1, Math.ceil(sortedProducts.length / pageSize))
    const currentPage = Math.min(totalPages, Math.max(1, catalogPage))
    const pageRows = sortedProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    const optionRows = Array.isArray(productForm.product_options) ? productForm.product_options : []
    const customFieldRows = Array.isArray(productForm.custom_form_fields) ? productForm.custom_form_fields : []
    const hasCustomFieldRows = customFieldRows.length > 0
    const catalogFulfillmentType = normalizeCatalogFulfillmentType(productForm.fulfillment_type)
    const effectiveCatalogFulfillmentType =
      catalogFulfillmentType === 'mystery_box' ? 'mystery_box' : hasCustomFieldRows ? 'farm_form' : 'digital_stock'
    const showsCustomFormBuilder = catalogFulfillmentType !== 'mystery_box'

    return (
      <div className="mt-4 space-y-4">
        <div className="grid gap-2 rounded-xl border border-slate-700/50 bg-slate-900/55 p-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <FieldLabel>ค้นหาสินค้า</FieldLabel>
            <input
              value={catalogFilter.search}
              onChange={(e) => {
                patchCatalogFilter({ search: e.target.value })
                setCatalogPage(1)
              }}
              placeholder="ค้นหา: สินค้า/หมวดหมู่/slug"
              className="h-10 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            />
          </div>
          <select
            value={catalogFilter.categoryId}
            onChange={(e) => {
              patchCatalogFilter({ categoryId: e.target.value })
              setCatalogPage(1)
            }}
            className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
          >
            <option value="all">ทุกหมวดหมู่</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>#{cat.id} {cat.name}</option>
            ))}
          </select>
          <select
            value={catalogFilter.hidden}
            onChange={(e) => {
              patchCatalogFilter({ hidden: e.target.value })
              setCatalogPage(1)
            }}
            className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
          >
            <option value="all">สถานะการแสดงทั้งหมด</option>
            <option value="visible">แสดงเท่านั้น</option>
            <option value="hidden">ซ่อนเท่านั้น</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 p-1">
            <button
              type="button"
              onClick={() => setCatalogView('products')}
              className={`rounded px-2 py-1 ${catalogView === 'products' ? 'bg-cyan-500/30 text-cyan-100' : 'text-white/70'}`}
            >
              สินค้า
            </button>
            <button
              type="button"
              onClick={() => setCatalogView('categories')}
              className={`ml-1 rounded px-2 py-1 ${catalogView === 'categories' ? 'bg-cyan-500/30 text-cyan-100' : 'text-white/70'}`}
            >
              หมวดหมู่
            </button>
          </div>

          <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">หมวดหมู่ {formatNumber(categories.length)}</span>
          <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">สินค้า {formatNumber(products.length)}</span>
          <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">ผลลัพธ์ {formatNumber(filteredProducts.length)}</span>
          {catalogActionState.status !== 'idle' ? (
            <span className={`rounded-full border px-2 py-1 ${catalogActionState.status === 'error' ? 'border-red-400/35 bg-red-500/15 text-red-100' : catalogActionState.status === 'success' ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-amber-400/35 bg-amber-500/15 text-amber-100'}`}>
              {catalogActionState.message}
            </span>
          ) : null}
        </div>

        {catalogView === 'categories' ? (
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="text-sm font-bold text-white">ฟอร์มหมวดหมู่</div>
              <div className="mt-2 grid gap-2">
                <div>
                  <FieldLabel>ชื่อหมวดหมู่</FieldLabel>
                  <input value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="ชื่อหมวดหมู่" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:col-span-2">
                  <div>
                    <FieldLabel>Slug หมวดหมู่</FieldLabel>
                    <input value={categoryForm.slug} onChange={(e) => setCategoryForm((prev) => ({ ...prev, slug: e.target.value }))} placeholder="slug หมวดหมู่" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCategoryForm((prev) => ({ ...prev, slug: makeSlug(prev.name) }))}
                    className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-[11px] text-white whitespace-nowrap"
                  >
                    สร้าง slug อัตโนมัติ
                  </button>
                </div>
                <div>
                  <FieldLabel>ลิงก์รูปภาพ</FieldLabel>
                  <input value={categoryForm.image_url} onChange={(e) => setCategoryForm((prev) => ({ ...prev, image_url: e.target.value }))} placeholder="ลิงก์รูปภาพ (ไม่บังคับ)" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div>
                  <FieldLabel>คำอธิบายหมวดหมู่</FieldLabel>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="คำอธิบายที่จะแสดงบนหน้าหมวดหมู่"
                    className="min-h-[74px] w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveCategory} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">{categoryForm.id ? 'อัปเดตหมวดหมู่' : 'สร้างหมวดหมู่'}</button>
                  <button type="button" onClick={() => setCategoryForm(DEFAULT_CATEGORY_FORM)} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">รีเซ็ต</button>
                </div>
                {catalogErrors.category ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{catalogErrors.category}</div> : null}
              </div>
            </section>

            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="mb-2 text-sm font-bold text-white">รายการหมวดหมู่</div>
              <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
                {categories.map((cat) => (
                  <div key={cat.id} className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-2">
                    <div className="text-xs font-semibold text-white">#{cat.id} {cat.name}</div>
                    <div className="text-[11px] text-white/45">{cat.slug}</div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-white/60">{String(cat.description || '—')}</div>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => editCategory(cat)} className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white">แก้ไข</button>
                      <button type="button" onClick={() => removeCategory(cat.id)} className="rounded-lg bg-red-500/20 px-2 py-1 text-[11px] text-red-100">ลบ</button>
                    </div>
                  </div>
                ))}
                {categories.length === 0 ? <div className="text-xs text-white/55">ยังไม่มีหมวดหมู่</div> : null}
              </div>
            </section>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-bold text-white">ฟอร์มสินค้า</div>
                <button
                  type="button"
                  onClick={() => {
                    setProductForm(DEFAULT_PRODUCT_FORM)
                    setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
                    setProductOptionError('')
                  }}
                  className="h-8 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-[11px] text-white"
                >
                  สินค้าใหม่
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <select value={productForm.category_id} onChange={(e) => setProductForm((prev) => ({ ...prev, category_id: e.target.value }))} className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none">
                  <option value="">เลือกหมวดหมู่</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <div>
                  <FieldLabel>ชื่อสินค้า</FieldLabel>
                  <input value={productForm.name} onChange={(e) => setProductForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="ชื่อสินค้า" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:col-span-2">
                  <div>
                    <FieldLabel>Slug สินค้า</FieldLabel>
                    <input value={productForm.slug} onChange={(e) => setProductForm((prev) => ({ ...prev, slug: e.target.value }))} placeholder="Slug สินค้า" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setProductForm((prev) => ({ ...prev, slug: makeSlug(prev.name) }))}
                    className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-[11px] text-white whitespace-nowrap"
                  >
                    สร้าง Slug อัตโนมัติ
                  </button>
                </div>
                <div>
                  <FieldLabel>ราคา</FieldLabel>
                  <input value={productForm.price} onChange={(e) => setProductForm((prev) => ({ ...prev, price: e.target.value }))} placeholder="ราคา" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div>
                  <FieldLabel>สต็อก</FieldLabel>
                  <input value={productForm.stock} onChange={(e) => setProductForm((prev) => ({ ...prev, stock: e.target.value }))} placeholder="สต็อก" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div>
                  <FieldLabel>ลำดับการแสดงผล</FieldLabel>
                  <input value={productForm.sort_order} onChange={(e) => setProductForm((prev) => ({ ...prev, sort_order: e.target.value }))} placeholder="ลำดับการแสดงผล" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div>
                  <FieldLabel>รูปแบบสินค้า</FieldLabel>
                  <select
                    value={catalogFulfillmentType}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, fulfillment_type: normalizeCatalogFulfillmentType(e.target.value) }))}
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  >
                    <option value="digital_stock">สต็อกดิจิทัล</option>
                    <option value="mystery_box">กล่องสุ่ม</option>
                  </select>
                </div>
                <div className="md:col-span-2 text-[11px] text-white/55">
                  {catalogFulfillmentType === 'mystery_box'
                    ? 'โหมดกล่องสุ่มจะไม่ใช้ฟอร์มกรอกข้อมูลลูกค้า'
                    : hasCustomFieldRows
                      ? 'ระบบจะบันทึกสินค้าเป็นฟอร์มกำหนดเองอัตโนมัติ เพราะมีการเพิ่มช่องแบบฟอร์ม'
                      : 'หากเพิ่มช่องแบบฟอร์มอย่างน้อย 1 ช่อง ระบบจะสลับเป็นฟอร์มกำหนดเองอัตโนมัติ'}
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>ลิงก์รูปภาพ</FieldLabel>
                  <input value={productForm.image_url} onChange={(e) => setProductForm((prev) => ({ ...prev, image_url: e.target.value }))} placeholder="ลิงก์รูปภาพ" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>รายละเอียดสินค้า</FieldLabel>
                  <textarea value={productForm.description} onChange={(e) => setProductForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} placeholder="รายละเอียดสินค้า" className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none" />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>จุดเด่น</FieldLabel>
                  <textarea value={productForm.highlights} onChange={(e) => setProductForm((prev) => ({ ...prev, highlights: e.target.value }))} rows={2} placeholder="จุดเด่น (1 บรรทัดต่อ 1 ข้อ)" className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none" />
                </div>
                <div>
                  <FieldLabel>ลิงก์คู่มือ</FieldLabel>
                  <input value={productForm.manual_url} onChange={(e) => setProductForm((prev) => ({ ...prev, manual_url: e.target.value }))} placeholder="ลิงก์คู่มือ" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div>
                  <FieldLabel>ลิงก์วิดีโอคู่มือ</FieldLabel>
                  <input value={productForm.manual_video_url} onChange={(e) => setProductForm((prev) => ({ ...prev, manual_video_url: e.target.value }))} placeholder="ลิงก์วิดีโอคู่มือ" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>ข้อความคู่มือ</FieldLabel>
                  <input value={productForm.manual_text} onChange={(e) => setProductForm((prev) => ({ ...prev, manual_text: e.target.value }))} placeholder="ข้อความคู่มือ" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                </div>
                <div className="flex items-center gap-3 text-xs text-white/75 md:col-span-2">
                  <label className="inline-flex items-center gap-1"><input type="checkbox" checked={Boolean(productForm.is_featured)} onChange={(e) => setProductForm((prev) => ({ ...prev, is_featured: e.target.checked }))} />สินค้าแนะนำ</label>
                  <label className="inline-flex items-center gap-1"><input type="checkbox" checked={Boolean(productForm.is_unlimited_stock)} onChange={(e) => setProductForm((prev) => ({ ...prev, is_unlimited_stock: e.target.checked }))} />สต็อกไม่จำกัด</label>
                </div>
              </div>

              {showsCustomFormBuilder ? (
                <div className="mt-3 rounded-xl border border-slate-700/50 bg-slate-950/40 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-white/70">ฟอร์มกรอกข้อมูลลูกค้า</div>
                    <div className="text-[11px] text-white/55">{formatNumber(customFieldRows.length)} ช่อง</div>
                  </div>

                  <div className="space-y-2">
                    {customFieldRows.map((field, index) => (
                      <div
                        key={`custom-field-${index}`}
                        className="grid gap-2 rounded border border-slate-700/50 bg-slate-900/55 p-2 md:grid-cols-2"
                      >
                        <div className="md:col-span-2">
                          <div className="mb-1 text-[10px] text-white/55">ข้อความแสดงผล</div>
                          <input
                            value={field?.label ?? ''}
                            onChange={(e) =>
                              setProductForm((prev) => ({
                                ...prev,
                                custom_form_fields: (Array.isArray(prev.custom_form_fields) ? prev.custom_form_fields : []).map((row, idx) =>
                                  idx === index ? { ...row, label: e.target.value } : row,
                                ),
                              }))
                            }
                            placeholder={field?.type === 'checkbox' ? 'ข้อความสำหรับช่องติ๊กถูก' : 'ชื่อช่องกรอก'}
                            className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none"
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] text-white/55">Field key</div>
                          <input
                            value={field?.id ?? ''}
                            onChange={(e) =>
                              setProductForm((prev) => ({
                                ...prev,
                                custom_form_fields: (Array.isArray(prev.custom_form_fields) ? prev.custom_form_fields : []).map((row, idx) =>
                                  idx === index ? { ...row, id: e.target.value } : row,
                                ),
                              }))
                            }
                            placeholder="field_key"
                            className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 font-mono text-[11px] text-white outline-none"
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] text-white/55">ประเภทช่อง</div>
                          <select
                            value={field?.type === 'checkbox' ? 'checkbox' : 'text'}
                            onChange={(e) =>
                              setProductForm((prev) => ({
                                ...prev,
                                custom_form_fields: (Array.isArray(prev.custom_form_fields) ? prev.custom_form_fields : []).map((row, idx) =>
                                  idx === index ? { ...row, type: e.target.value === 'checkbox' ? 'checkbox' : 'text' } : row,
                                ),
                              }))
                            }
                            className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none"
                          >
                            <option value="text">Textbox</option>
                            <option value="checkbox">Checkbox</option>
                          </select>
                        </div>
                        <label className="inline-flex items-center gap-1 text-[11px] text-white/70">
                          <input
                            type="checkbox"
                            checked={Boolean(field?.required)}
                            onChange={(e) =>
                              setProductForm((prev) => ({
                                ...prev,
                                custom_form_fields: (Array.isArray(prev.custom_form_fields) ? prev.custom_form_fields : []).map((row, idx) =>
                                  idx === index ? { ...row, required: e.target.checked } : row,
                                ),
                              }))
                            }
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setProductForm((prev) => ({
                              ...prev,
                              custom_form_fields: (Array.isArray(prev.custom_form_fields) ? prev.custom_form_fields : []).filter((_, idx) => idx !== index),
                            }))
                          }
                          className="justify-self-start rounded bg-red-500/70 px-2 py-0.5 text-[11px] text-white md:justify-self-end"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}

                    {customFieldRows.length === 0 ? <div className="text-[11px] text-white/50">ยังไม่มีช่องแบบฟอร์ม กดเพิ่มได้ทั้งช่องกรอกและช่องติ๊กถูก</div> : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setProductForm((prev) => ({
                          ...prev,
                          custom_form_fields: [...(Array.isArray(prev.custom_form_fields) ? prev.custom_form_fields : []), createCustomFormFieldDraft('text')],
                        }))
                      }
                      className="h-8 rounded bg-cyan-500/80 px-3 text-[11px] text-white"
                    >
                      + ช่องกรอกข้อความ
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setProductForm((prev) => ({
                          ...prev,
                          custom_form_fields: [...(Array.isArray(prev.custom_form_fields) ? prev.custom_form_fields : []), createCustomFormFieldDraft('checkbox')],
                        }))
                      }
                      className="h-8 rounded bg-amber-500/80 px-3 text-[11px] text-white"
                    >
                      + ช่องติ๊กถูก
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductForm((prev) => ({ ...prev, custom_form_fields: [] }))}
                      disabled={!hasCustomFieldRows}
                      className="h-8 rounded border border-slate-700/70 bg-slate-900/70 px-3 text-[11px] text-white disabled:opacity-50"
                    >
                      ล้างฟอร์มทั้งหมด
                    </button>
                  </div>
                </div>
              ) : null}

              {effectiveCatalogFulfillmentType === 'digital_stock' ? (
                <div className="mt-3 rounded-xl border border-slate-700/50 bg-slate-950/40 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-white/70">ตัวเลือกดรอปดาวน์</div>
                    <div className="text-[11px] text-white/55">{formatNumber(optionRows.length)} ตัวเลือก</div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px]">
                    <div><FieldLabel>ID (คีย์ระบบ)</FieldLabel><input value={productOptionDraft.id} onChange={(e) => { setProductOptionDraft((prev) => ({ ...prev, id: e.target.value })); setProductOptionError('') }} placeholder="id (เช่น 1d)" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none" /></div>
                    <div><FieldLabel>ชื่อแสดงผล (ลูกค้าเห็น)</FieldLabel><input value={productOptionDraft.label} onChange={(e) => { setProductOptionDraft((prev) => ({ ...prev, label: e.target.value })); setProductOptionError('') }} placeholder="ชื่อแสดงผล" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none" /></div>
                    <div><FieldLabel>ค่า (ภายใน)</FieldLabel><input value={productOptionDraft.value} onChange={(e) => { setProductOptionDraft((prev) => ({ ...prev, value: e.target.value })); setProductOptionError('') }} placeholder="ค่า (ไม่บังคับ)" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none" /></div>
                    <div><FieldLabel>ราคา</FieldLabel><input value={productOptionDraft.price_points} onChange={(e) => { setProductOptionDraft((prev) => ({ ...prev, price_points: e.target.value })); setProductOptionError('') }} placeholder="ราคา" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none" /></div>
                  </div>
                  <div className="mt-1 text-[10px] text-white/45">ชื่อแสดงผล คือข้อความใน dropdown ฝั่งลูกค้า ส่วนค่า (ภายใน) ใช้เป็นข้อมูลเสริมในระบบ</div>
                  {productOptionError ? <div className="mt-2 text-[11px] text-red-200">{productOptionError}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setProductOptionDraft((prev) => {
                          const suggested = normalizeProductOptionId(prev?.label || prev?.value || prev?.id)
                          if (!suggested) return prev
                          return { ...prev, id: suggested }
                        })
                      }
                      className="h-8 rounded border border-slate-700/70 bg-slate-900/70 px-3 text-[11px] text-white"
                    >
                      สร้าง ID อัตโนมัติ
                    </button>
                    <button type="button" onClick={applyProductOptionDraft} className="h-8 rounded bg-cyan-500/80 px-3 text-[11px] text-white">{Number.isInteger(productOptionDraft.editIndex) ? 'อัปเดตตัวเลือก' : 'เพิ่มตัวเลือก'}</button>
                    <button type="button" onClick={() => { setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT); setProductOptionError('') }} className="h-8 rounded border border-slate-700/70 bg-slate-900/70 px-3 text-[11px] text-white">ล้างค่า</button>
                  </div>
                  <div className="mt-2 space-y-1">
                    {optionRows.map((opt, idx) => (
                      <div key={`${opt?.id || idx}-${idx}`} className="flex items-center justify-between rounded border border-slate-700/50 bg-slate-900/55 px-2 py-1.5 text-[11px]">
                        <div className="text-white/80">{opt?.label || '-'} <span className="text-white/55">(id:{String(opt?.id || '-')}, value:{String(opt?.value || '-')}, price:{formatNumber(opt?.price_points || 0)})</span></div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => moveProductOption(idx, 'up')} className="rounded bg-slate-800 px-2 py-0.5 text-white" disabled={idx === 0}>↑</button>
                          <button type="button" onClick={() => moveProductOption(idx, 'down')} className="rounded bg-slate-800 px-2 py-0.5 text-white" disabled={idx >= optionRows.length - 1}>↓</button>
                          <button type="button" onClick={() => editProductOption(idx)} className="rounded bg-slate-800 px-2 py-0.5 text-white">แก้ไข</button>
                          <button type="button" onClick={() => removeProductOption(idx)} className="rounded bg-red-500/70 px-2 py-0.5 text-white">ลบ</button>
                        </div>
                      </div>
                    ))}
                    {optionRows.length === 0 ? <div className="text-[11px] text-white/50">ยังไม่มีการตั้งค่าตัวเลือก</div> : null}
                  </div>
                  {optionRows.length > 0 ? (
                    <div className="mt-2 rounded-lg border border-slate-700/50 bg-slate-900/40 p-2">
                      <div className="text-[10px] text-white/55">ตัวอย่าง dropdown ที่ลูกค้าเห็น</div>
                      <select disabled className="mt-1 h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white/80 outline-none">
                        <option>เลือก...</option>
                        {optionRows.map((opt, idx) => (
                          <option key={`preview-${opt?.id || idx}-${idx}`}>
                            {String(opt?.label || opt?.id || `Option ${idx + 1}`)}
                            {opt?.price_points != null && opt?.price_points !== '' ? ` • ${formatNumber(Number(opt.price_points) || 0)} พ้อย` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={saveProduct} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">{productForm.id ? 'อัปเดตสินค้า' : 'สร้างสินค้า'}</button>
                <button type="button" onClick={() => { setProductForm(DEFAULT_PRODUCT_FORM); setProductOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT); setProductOptionError('') }} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">รีเซ็ต</button>
              </div>
              {catalogErrors.product ? <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{catalogErrors.product}</div> : null}
            </section>

            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-bold text-white">ตารางสินค้า</div>
                <div className="text-[11px] text-white/55">หน้า {currentPage}/{totalPages}</div>
              </div>
              <div className="-mx-2 overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-950/50 p-2">
                <table className="min-w-[800px] w-full text-left text-xs">
                  <thead className="text-slate-300/80">
                    <tr className="border-b border-slate-700/60">
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">ชื่อ</th>
                      <th className="py-2 pr-4">หมวดหมู่</th>
                      <th className="py-2 pr-4">ราคา</th>
                      <th className="py-2 pr-4">สต็อก</th>
                      <th className="py-2 pr-4">ตัวเลือก</th>
                      <th className="py-2 pr-4">การแสดงผล</th>
                      <th className="py-2 pr-4">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/85">
                    {pageRows.map((row) => {
                      const hidden = Boolean(row?.is_hidden)
                      const category = categoryMap.get(Number(row?.category_id))
                      const optionCount = Array.isArray(row?.product_options) ? row.product_options.length : 0
                      return (
                        <tr key={row.id} className="border-b border-slate-700/40 hover:bg-slate-900/55">
                          <td className="py-2 pr-4 font-mono text-[11px]">{row.id}</td>
                          <td className="py-2 pr-4"><div className="max-w-[220px] truncate text-[11px] font-semibold text-white">{row.name || '-'}</div><div className="max-w-[220px] truncate text-[11px] text-white/45">{row.slug || '-'}</div></td>
                          <td className="py-2 pr-4 text-[11px]">{category?.name || `#${row.category_id || '-'}`}</td>
                          <td className="py-2 pr-4">{formatNumber(row.price)}</td>
                          <td className="py-2 pr-4">{formatNumber(row.stock)}</td>
                          <td className="py-2 pr-4">{formatNumber(optionCount)}</td>
                          <td className="py-2 pr-4">{hidden ? <span className="rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-amber-100">ซ่อน</span> : <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-emerald-100">แสดง</span>}</td>
                          <td className="py-2 pr-4"><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => editProduct(row)} className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white">แก้ไข</button><button type="button" onClick={() => cloneProductToDraft(row)} className="rounded-lg bg-cyan-500/20 px-2 py-1 text-[11px] text-cyan-100">คัดลอก</button><button type="button" onClick={() => setProductHidden(row.id, !hidden)} className="rounded-lg bg-amber-500/20 px-2 py-1 text-[11px] text-amber-100">{hidden ? 'ยกเลิกซ่อน' : 'ซ่อน'}</button><button type="button" onClick={() => removeProduct(row.id)} className="rounded-lg bg-red-500/20 px-2 py-1 text-[11px] text-red-100">ลบ</button></div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {pageRows.length === 0 ? <div className="px-2 py-3 text-xs text-white/55">ไม่พบสินค้าตามตัวกรองปัจจุบัน</div> : null}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCatalogPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  ถัดไป
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    )
  }

  function renderSettingsModule() {
    const role = String(session?.me?.user?.role || '').trim().toLowerCase()
    if (role !== 'admin' && role !== 'owner') {
      return (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          ต้องใช้สิทธิ์แอดมินเพื่อจัดการการตั้งค่า
        </div>
      )
    }

    return (
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <button type="button" onClick={refreshSettings} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">โหลดการตั้งค่าใหม่</button>
          <button type="button" onClick={resetSettingsDraft} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">รีเซ็ตแบบร่าง</button>
          <button type="button" onClick={saveSettings} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">บันทึกการตั้งค่า</button>
          {settingsActionState.status !== 'idle' ? (
            <span className={`rounded-full border px-2 py-1 ${settingsActionState.status === 'error' ? 'border-red-400/35 bg-red-500/15 text-red-100' : settingsActionState.status === 'success' ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-amber-400/35 bg-amber-500/15 text-amber-100'}`}>
              {settingsActionState.message}
            </span>
          ) : null}
        </div>

        {settingsError ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{settingsError}</div> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
            <div className="text-sm font-bold text-white">อัตราส่วนรูปภาพ</div>
            <div className="mt-1 text-[11px] text-white/40">Force Fit เปิด = ยืด/บีบรูปให้เต็มกรอบพอดี ไม่มีช่องว่าง / ปิด = ย่อรูปให้พอดีไม่ครอป อาจมีช่องว่าง</div>
            <div className="mt-3 grid gap-3">
              {[
                { ratioKey: 'home_featured_ratio', fitKey: 'home_featured_force_fit', label: 'รูปเด่นหน้าแรก', base: 800 },
                { ratioKey: 'home_categories_ratio', fitKey: 'home_categories_force_fit', label: 'หมวดหมู่หน้าแรก', base: 800 },
                { ratioKey: 'category_products_ratio', fitKey: 'category_products_force_fit', label: 'สินค้าในหมวดหมู่', base: 800 },
                { ratioKey: 'product_detail_ratio', fitKey: 'product_detail_force_fit', label: 'หน้ารายละเอียดสินค้า', base: 1200 },
              ].map(({ ratioKey, fitKey, label, base }) => {
                const ratioStr = String(uiImageSettings[ratioKey] || '')
                const m = ratioStr.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)$/)
                const recW = base
                const recH = m ? Math.round(base * (Number(m[2]) / Number(m[1]))) : null
                return (
                  <div key={ratioKey} className="rounded-lg border border-slate-700/40 bg-slate-950/40 p-2.5">
                    <FieldLabel>{label}</FieldLabel>
                    <div className="mt-1 flex items-center gap-2">
                      <input value={uiImageSettings[ratioKey]} onChange={(e) => setUiImageSettings((s) => ({ ...s, [ratioKey]: e.target.value }))} placeholder="เช่น 16/10" className="h-9 flex-1 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" />
                      <label className="flex cursor-pointer items-center gap-1.5 select-none whitespace-nowrap rounded-lg border border-slate-700/50 bg-slate-900/60 px-2.5 py-2 text-[11px] text-white/70 hover:bg-slate-800/60">
                        <input type="checkbox" checked={!!uiImageSettings[fitKey]} onChange={(e) => setUiImageSettings((s) => ({ ...s, [fitKey]: e.target.checked }))} className="accent-cyan-400" />
                        Force Fit
                      </label>
                    </div>
                    {settingsFieldErrors[ratioKey] ? <div className="mt-1 text-[11px] text-red-200">{settingsFieldErrors[ratioKey]}</div> : null}
                    <div className="mt-1 text-[10px] text-white/35">
                      แนะนำ: {recH ? `${recW} × ${recH} px` : `${recW} × ??? px`}
                      {uiImageSettings[fitKey] ? ' (ครอปเต็มกรอบ)' : ' (ย่อพอดี ไม่ครอป)'}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
            <div className="text-sm font-bold text-white">แบรนดิ้ง</div>
            <div className="mt-2 grid gap-2">
              <div><FieldLabel>ชื่อเว็บไซต์</FieldLabel><input value={uiBrandingSettings.site_name} onChange={(e) => setUiBrandingSettings((s) => ({ ...s, site_name: e.target.value }))} placeholder="ชื่อเว็บไซต์" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              {settingsFieldErrors.site_name ? <div className="text-[11px] text-red-200">{settingsFieldErrors.site_name}</div> : null}
              <div><FieldLabel>ชื่อแถบนำทาง</FieldLabel><input value={uiBrandingSettings.navbar_title} onChange={(e) => setUiBrandingSettings((s) => ({ ...s, navbar_title: e.target.value }))} placeholder="ชื่อแถบนำทาง" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              {settingsFieldErrors.navbar_title ? <div className="text-[11px] text-red-200">{settingsFieldErrors.navbar_title}</div> : null}
              <div><FieldLabel>คำโปรยแถบนำทาง</FieldLabel><input value={uiBrandingSettings.navbar_tagline} onChange={(e) => setUiBrandingSettings((s) => ({ ...s, navbar_tagline: e.target.value }))} placeholder="คำโปรยแถบนำทาง" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              <div><FieldLabel>ชื่อแท็บ</FieldLabel><input value={uiBrandingSettings.tab_title} onChange={(e) => setUiBrandingSettings((s) => ({ ...s, tab_title: e.target.value }))} placeholder="ชื่อแท็บ" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              {settingsFieldErrors.tab_title ? <div className="text-[11px] text-red-200">{settingsFieldErrors.tab_title}</div> : null}
              <div><FieldLabel>ลิงก์ Favicon</FieldLabel><input value={uiBrandingSettings.favicon_url} onChange={(e) => setUiBrandingSettings((s) => ({ ...s, favicon_url: e.target.value }))} placeholder="ลิงก์ favicon" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              {settingsFieldErrors.favicon_url ? <div className="text-[11px] text-red-200">{settingsFieldErrors.favicon_url}</div> : null}
              <input type="file" accept="image/*" onChange={(e) => uploadFaviconFile(e.target.files?.[0])} className="text-xs text-white/70" />

              <div className="mt-1 rounded-lg border border-slate-700/50 bg-slate-950/55 p-2 text-[11px] text-white/70">
                <div className="mb-1 font-semibold text-white/85">ตัวอย่างแบบเรียลไทม์</div>
                <div className="flex items-center gap-2">
                  {String(uiBrandingSettings.favicon_url || '').trim() ? (
                    <img src={uiBrandingSettings.favicon_url} alt="favicon preview" className="h-5 w-5 rounded border border-slate-600/60 object-contain" />
                  ) : null}
                  <div>
                    <div className="text-white">{uiBrandingSettings.navbar_title || uiBrandingSettings.site_name || 'เว็บไซต์'}</div>
                    <div className="text-white/50">แท็บ: {uiBrandingSettings.tab_title || '-'}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-white">ลิงก์แถบนำทาง</div>
            <button type="button" onClick={addNavbarLinkRow} className="h-8 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">เพิ่มลิงก์</button>
          </div>
          {settingsFieldErrors.navbar_links ? <div className="mb-2 text-[11px] text-red-200">{settingsFieldErrors.navbar_links}</div> : null}
          <div className="space-y-2">
            {(Array.isArray(uiBrandingSettings?.navbar_links) ? uiBrandingSettings.navbar_links : []).map((row, idx) => (
              <div
                key={`nav-link-${idx}`}
                draggable
                onDragStart={() => setDragNavLinkIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragNavLinkIndex == null) return
                  moveNavbarLinkRow(dragNavLinkIndex, idx)
                  setDragNavLinkIndex(null)
                }}
                className="grid gap-2 rounded-lg border border-slate-700/50 bg-slate-900/55 p-2 md:grid-cols-[1fr_1fr_auto_auto]"
              >
                <div><FieldLabel>ชื่อแสดงผล</FieldLabel><input value={row?.label || ''} onChange={(e) => updateNavbarLinkRow(idx, { label: e.target.value })} placeholder="ชื่อแสดงผล" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                <div><FieldLabel>พาธ / URL</FieldLabel><input value={row?.to || ''} onChange={(e) => updateNavbarLinkRow(idx, { to: e.target.value })} placeholder="ปลายทางลิงก์" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                <label className="inline-flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={Boolean(row?.auth_required)} onChange={(e) => updateNavbarLinkRow(idx, { auth_required: e.target.checked })} />ต้องเข้าสู่ระบบ</label>
                <button type="button" onClick={() => removeNavbarLinkRow(idx)} className="h-8 rounded bg-red-500/70 px-2 text-xs text-white">ลบ</button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="text-sm font-bold text-white">ตั้งค่าหน้าหลัก</div>
          <div className="mt-2 grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-white/70">ส่วน Hero</div>
              <div><FieldLabel>หัวข้อหลัก</FieldLabel><input value={homepageSettings.hero_title} onChange={(e) => setHomepageSettings((s) => ({ ...s, hero_title: e.target.value }))} placeholder="เว้นว่างเพื่อใช้ค่าเริ่มต้น" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              <div><FieldLabel>คำโปรยรอง</FieldLabel><input value={homepageSettings.hero_subtitle} onChange={(e) => setHomepageSettings((s) => ({ ...s, hero_subtitle: e.target.value }))} placeholder="เว้นว่างเพื่อใช้ค่าเริ่มต้น" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              <div><FieldLabel>คำอธิบาย</FieldLabel><textarea value={homepageSettings.hero_description} onChange={(e) => setHomepageSettings((s) => ({ ...s, hero_description: e.target.value }))} placeholder="เว้นว่างเพื่อใช้ค่าเริ่มต้น" className="min-h-[60px] w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none" /></div>
              <div className="grid gap-2 md:grid-cols-2">
                <div><FieldLabel>ข้อความปุ่ม</FieldLabel><input value={homepageSettings.hero_button_text} onChange={(e) => setHomepageSettings((s) => ({ ...s, hero_button_text: e.target.value }))} placeholder="ช้อปเลย" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
                <div><FieldLabel>ลิงก์ปุ่ม</FieldLabel><input value={homepageSettings.hero_button_link} onChange={(e) => setHomepageSettings((s) => ({ ...s, hero_button_link: e.target.value }))} placeholder="/category/featured" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-white/70">แถวโชว์สินค้า (Showcase)</div>
              <label className="inline-flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={homepageSettings.showcase_enabled !== false} onChange={(e) => setHomepageSettings((s) => ({ ...s, showcase_enabled: e.target.checked }))} />
                เปิดใช้งานแถวโชว์สินค้า
              </label>
              <div><FieldLabel>หัวข้อแถวโชว์</FieldLabel><input value={homepageSettings.showcase_title} onChange={(e) => setHomepageSettings((s) => ({ ...s, showcase_title: e.target.value }))} placeholder="สินค้าแนะนำ" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              <div className="grid gap-2 md:grid-cols-2">
                <div><FieldLabel>ความเร็วเลื่อน (มิลลิวินาที)</FieldLabel><input type="number" value={homepageSettings.showcase_scroll_interval} onChange={(e) => setHomepageSettings((s) => ({ ...s, showcase_scroll_interval: Number(e.target.value) || 2000 }))} min={500} max={30000} step={500} className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
                <div><FieldLabel>จำนวนสินค้าสูงสุด</FieldLabel><input type="number" value={homepageSettings.showcase_max_items} onChange={(e) => setHomepageSettings((s) => ({ ...s, showcase_max_items: Number(e.target.value) || 12 }))} min={1} max={50} className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/55 p-2 text-[11px] text-white/60">
                แถวจะเลื่อนอัตโนมัติเมื่อมีสินค้ามากกว่า 4 ชิ้น โดยหยุดเลื่อนเมื่อเมาส์อยู่เหนือแถว
              </div>
            </div>
          </div>

          {/* Product picker for Featured & Showcase */}
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {/* Featured product picker */}
            <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-950/40 p-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-amber-200">สินค้าเด่น (Featured) — แสดงใน Hero</div>
                <span className="text-[10px] text-white/40">สูงสุด 4 รายการ</span>
              </div>
              <div className="space-y-1">
                {(Array.isArray(homepageSettings.featured_product_ids) ? homepageSettings.featured_product_ids : []).map((pid, idx) => {
                  const p = hpProductCache[pid]
                  return (
                    <div key={`feat-${pid}`} className="flex items-center gap-2 rounded border border-slate-700/40 bg-slate-900/50 px-2 py-1">
                      <span className="text-[10px] text-white/30">#{idx + 1}</span>
                      {p?.image_url ? <img src={p.image_url} alt="" className="h-6 w-6 rounded object-cover" /> : <div className="h-6 w-6 rounded bg-white/10" />}
                      <span className="flex-1 truncate text-xs text-white/80">{p?.name || `ID: ${pid}`}</span>
                      <span className="text-[10px] text-white/40">#{pid}</span>
                      {idx > 0 ? <button type="button" onClick={() => hpMoveProductId('featured', idx, idx - 1)} className="text-[10px] text-white/40 hover:text-white">▲</button> : null}
                      {idx < (homepageSettings.featured_product_ids?.length || 0) - 1 ? <button type="button" onClick={() => hpMoveProductId('featured', idx, idx + 1)} className="text-[10px] text-white/40 hover:text-white">▼</button> : null}
                      <button type="button" onClick={() => hpRemoveProductId('featured', pid)} className="rounded bg-red-500/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-500">ลบ</button>
                    </div>
                  )
                })}
                {(homepageSettings.featured_product_ids?.length || 0) === 0 ? <div className="py-2 text-center text-[11px] text-white/30">ยังไม่มีสินค้าเด่น — เพิ่มจากช่องค้นหาด้านล่าง</div> : null}
              </div>
              {(homepageSettings.featured_product_ids?.length || 0) < 4 ? (
                <button type="button" onClick={() => { setHpPickerTarget('featured'); hpLoadAllProducts() }} className="h-7 w-full rounded border border-dashed border-slate-600/50 text-[11px] text-white/50 hover:border-slate-500 hover:text-white/80">+ เพิ่มสินค้าเด่น</button>
              ) : null}
            </div>

            {/* Showcase product picker */}
            <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-950/40 p-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-cyan-200">สินค้าแนะนำ (Showcase) — แถวเลื่อนอัตโนมัติ</div>
                <span className="text-[10px] text-white/40">สูงสุด 50 รายการ</span>
              </div>
              <div className="max-h-[200px] space-y-1 overflow-y-auto">
                {(Array.isArray(homepageSettings.showcase_product_ids) ? homepageSettings.showcase_product_ids : []).map((pid, idx) => {
                  const p = hpProductCache[pid]
                  return (
                    <div key={`show-${pid}`} className="flex items-center gap-2 rounded border border-slate-700/40 bg-slate-900/50 px-2 py-1">
                      <span className="text-[10px] text-white/30">#{idx + 1}</span>
                      {p?.image_url ? <img src={p.image_url} alt="" className="h-6 w-6 rounded object-cover" /> : <div className="h-6 w-6 rounded bg-white/10" />}
                      <span className="flex-1 truncate text-xs text-white/80">{p?.name || `ID: ${pid}`}</span>
                      <span className="text-[10px] text-white/40">#{pid}</span>
                      {idx > 0 ? <button type="button" onClick={() => hpMoveProductId('showcase', idx, idx - 1)} className="text-[10px] text-white/40 hover:text-white">▲</button> : null}
                      {idx < (homepageSettings.showcase_product_ids?.length || 0) - 1 ? <button type="button" onClick={() => hpMoveProductId('showcase', idx, idx + 1)} className="text-[10px] text-white/40 hover:text-white">▼</button> : null}
                      <button type="button" onClick={() => hpRemoveProductId('showcase', pid)} className="rounded bg-red-500/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-500">ลบ</button>
                    </div>
                  )
                })}
                {(homepageSettings.showcase_product_ids?.length || 0) === 0 ? <div className="py-2 text-center text-[11px] text-white/30">ยังไม่มีสินค้าแนะนำ — เพิ่มจากช่องค้นหาด้านล่าง</div> : null}
              </div>
              <button type="button" onClick={() => { setHpPickerTarget('showcase'); hpLoadAllProducts() }} className="h-7 w-full rounded border border-dashed border-slate-600/50 text-[11px] text-white/50 hover:border-slate-500 hover:text-white/80">+ เพิ่มสินค้าแนะนำ</button>
            </div>
          </div>

          {/* Product search modal/dropdown */}
          {hpPickerTarget ? (
            <div className="mt-3 rounded-lg border border-cyan-400/20 bg-slate-950/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-white">ค้นหาสินค้าเพื่อเพิ่มใน{hpPickerTarget === 'featured' ? 'สินค้าเด่น' : 'สินค้าแนะนำ'}</div>
                <button type="button" onClick={() => { setHpPickerTarget(null); setHpProductSearch(''); setHpProductResults([]) }} className="rounded bg-slate-700/60 px-2 py-0.5 text-[10px] text-white hover:bg-slate-600">ปิด</button>
              </div>
              <input
                value={hpProductSearch}
                onChange={(e) => hpSearchProducts(e.target.value)}
                placeholder="พิมพ์ชื่อสินค้าหรือ ID..."
                className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                autoFocus
              />
              <div className="mt-2 max-h-[240px] space-y-1 overflow-y-auto">
                {hpProductResults.length === 0 ? (
                  <div className="py-3 text-center text-[11px] text-white/30">{hpProductSearch ? 'ไม่พบสินค้าที่ตรงกัน' : 'แสดงรายการสินค้าทั้งหมด'}</div>
                ) : (
                  hpProductResults.map((p) => {
                    const targetKey = hpPickerTarget === 'featured' ? 'featured_product_ids' : 'showcase_product_ids'
                    const alreadyIn = (Array.isArray(homepageSettings[targetKey]) ? homepageSettings[targetKey] : []).includes(Number(p.id))
                    return (
                      <div key={`pick-${p.id}`} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${alreadyIn ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-slate-700/40 bg-slate-900/50 hover:bg-slate-800/60'}`}>
                        {p.image_url ? <img src={p.image_url} alt="" className="h-7 w-7 rounded object-cover" /> : <div className="h-7 w-7 rounded bg-white/10" />}
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-xs font-medium text-white/85">{p.name}</div>
                          <div className="text-[10px] text-white/40">#{p.id} · {p.category_name || '-'} · {Number(p.price || 0).toLocaleString()} พ้อย</div>
                        </div>
                        {alreadyIn ? (
                          <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-200">เพิ่มแล้ว</span>
                        ) : (
                          <button type="button" onClick={() => hpAddProductId(hpPickerTarget, p.id)} className="shrink-0 rounded bg-cyan-500/70 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-cyan-500">เพิ่ม</button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : null}

          {/* FAQ Items */}
          <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-violet-200">คำถามที่พบบ่อย (FAQ)</div>
              <span className="text-[10px] text-white/40">สูงสุด 20 รายการ</span>
            </div>
            <div className="mt-2 space-y-2">
              {(Array.isArray(homepageSettings.faq_items) ? homepageSettings.faq_items : []).map((item, idx) => (
                <div key={`faq-${idx}`} className="rounded-lg border border-slate-700/40 bg-slate-900/50 p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-white/30">#{idx + 1}</span>
                    <div className="flex items-center gap-1">
                      {idx > 0 ? <button type="button" onClick={() => hpMoveFaqItem(idx, idx - 1)} className="text-[10px] text-white/40 hover:text-white">▲</button> : null}
                      {idx < (homepageSettings.faq_items?.length || 0) - 1 ? <button type="button" onClick={() => hpMoveFaqItem(idx, idx + 1)} className="text-[10px] text-white/40 hover:text-white">▼</button> : null}
                      <button type="button" onClick={() => hpRemoveFaqItem(idx)} className="rounded bg-red-500/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-500">ลบ</button>
                    </div>
                  </div>
                  <div><FieldLabel>คำถาม</FieldLabel><input value={item.question || ''} onChange={(e) => hpUpdateFaqItem(idx, { question: e.target.value })} placeholder="เช่น: สั่งซื้อแล้วได้รับเมื่อไหร่?" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                  <div><FieldLabel>คำตอบ</FieldLabel><textarea value={item.answer || ''} onChange={(e) => hpUpdateFaqItem(idx, { answer: e.target.value })} placeholder="คำตอบที่ต้องการแสดง" className="min-h-[48px] w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-xs text-white outline-none" /></div>
                </div>
              ))}
              {(homepageSettings.faq_items?.length || 0) === 0 ? <div className="py-3 text-center text-[11px] text-white/30">ยังไม่มี FAQ — กดเพิ่มด้านล่าง (ถ้าไม่เพิ่มจะใช้ค่าเริ่มต้น)</div> : null}
            </div>
            {(homepageSettings.faq_items?.length || 0) < 20 ? (
              <button type="button" onClick={hpAddFaqItem} className="mt-2 h-7 w-full rounded border border-dashed border-slate-600/50 text-[11px] text-white/50 hover:border-slate-500 hover:text-white/80">+ เพิ่มคำถาม FAQ</button>
            ) : null}
          </div>

          {/* Trust / Info Bar Items */}
          <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-emerald-200">แถบข้อมูลความน่าเชื่อถือ (Trust Bar)</div>
              <span className="text-[10px] text-white/40">สูงสุด 10 รายการ</span>
            </div>
            <div className="mt-1 rounded border border-slate-700/30 bg-slate-950/40 p-2 text-[10px] text-white/40">
              ไอคอนใช้ SVG path data — คัดลอก d=&quot;...&quot; จาก <a href="https://heroicons.com/" target="_blank" rel="noreferrer" className="underline text-white/50 hover:text-white/70">heroicons.com</a> (Outline 24x24)
            </div>
            <div className="mt-2 space-y-2">
              {(Array.isArray(homepageSettings.trust_items) ? homepageSettings.trust_items : []).map((item, idx) => (
                <div key={`trust-${idx}`} className="rounded-lg border border-slate-700/40 bg-slate-900/50 p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/30">#{idx + 1}</span>
                      {item.icon ? (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/50" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      {idx > 0 ? <button type="button" onClick={() => hpMoveTrustItem(idx, idx - 1)} className="text-[10px] text-white/40 hover:text-white">▲</button> : null}
                      {idx < (homepageSettings.trust_items?.length || 0) - 1 ? <button type="button" onClick={() => hpMoveTrustItem(idx, idx + 1)} className="text-[10px] text-white/40 hover:text-white">▼</button> : null}
                      <button type="button" onClick={() => hpRemoveTrustItem(idx)} className="rounded bg-red-500/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-500">ลบ</button>
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div><FieldLabel>หัวข้อ</FieldLabel><input value={item.title || ''} onChange={(e) => hpUpdateTrustItem(idx, { title: e.target.value })} placeholder="เช่น: ปลอดภัย" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                    <div><FieldLabel>คำอธิบาย</FieldLabel><input value={item.desc || ''} onChange={(e) => hpUpdateTrustItem(idx, { desc: e.target.value })} placeholder="เช่น: ระบบรักษาความปลอดภัยมาตรฐานสูง" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                  </div>
                  <div><FieldLabel>SVG Path (icon)</FieldLabel><input value={item.icon || ''} onChange={(e) => hpUpdateTrustItem(idx, { icon: e.target.value })} placeholder='d="M9 12.75 11.25 15 ..." จาก heroicons' className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[10px] text-white/60 outline-none font-mono" /></div>
                </div>
              ))}
              {(homepageSettings.trust_items?.length || 0) === 0 ? <div className="py-3 text-center text-[11px] text-white/30">ยังไม่มีรายการ — กดเพิ่มด้านล่าง (ถ้าไม่เพิ่มจะใช้ค่าเริ่มต้น)</div> : null}
            </div>
            {(homepageSettings.trust_items?.length || 0) < 10 ? (
              <button type="button" onClick={hpAddTrustItem} className="mt-2 h-7 w-full rounded border border-dashed border-slate-600/50 text-[11px] text-white/50 hover:border-slate-500 hover:text-white/80">+ เพิ่มรายการ Trust Bar</button>
            ) : null}
          </div>
        </section>

        {/* ═══════════ Site Settings ═══════════ */}
        <section className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
          <div className="text-sm font-bold text-white">ตั้งค่าเว็บไซต์ทั่วไป</div>
          <div className="text-[11px] text-white/40">SEO, Announcement, Footer, Social, เงื่อนไขการใช้งาน</div>

          {/* ── SEO ── */}
          <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3 space-y-2">
            <div className="text-xs font-semibold text-sky-200">SEO / Open Graph</div>
            <div><FieldLabel>Site URL (สำหรับ canonical / OG)</FieldLabel><input value={siteSettings.site_url} onChange={(e) => setSiteSettings((s) => ({ ...s, site_url: e.target.value }))} placeholder="https://www.example.com" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
            <div><FieldLabel>คำอธิบายเว็บไซต์ (meta description)</FieldLabel><textarea value={siteSettings.site_description} onChange={(e) => setSiteSettings((s) => ({ ...s, site_description: e.target.value }))} placeholder="ร้านค้าไอเท็มเกมและสินค้าดิจิทัล..." className="min-h-[48px] w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-xs text-white outline-none" /></div>
            <div><FieldLabel>OG Image URL (รูปปก social share)</FieldLabel><input value={siteSettings.og_image_url} onChange={(e) => setSiteSettings((s) => ({ ...s, og_image_url: e.target.value }))} placeholder="/og-cover.jpg หรือ URL เต็ม" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
          </div>

          {/* ── Announcements (moved) ── */}
          <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
            <div className="text-xs font-semibold text-amber-200">ประกาศ (Announcements)</div>
            <div className="mt-1 text-[11px] text-white/40">ระบบประกาศย้ายไปอยู่ที่เมนู <button type="button" onClick={() => setParams({ module: 'announcements' })} className="text-amber-300 underline hover:text-amber-200">ประกาศ</button> แล้ว</div>
          </div>

          {/* ── Footer ── */}
          <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3 space-y-2">
            <div className="text-xs font-semibold text-emerald-200">Footer</div>
            <div><FieldLabel>Tagline (ข้อความด้านขวา footer)</FieldLabel><input value={siteSettings.footer_tagline} onChange={(e) => setSiteSettings((s) => ({ ...s, footer_tagline: e.target.value }))} placeholder="เช่น: MATTE LUXURY" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
            <div>
              <div className="flex items-center justify-between">
                <FieldLabel>ลิงก์ Footer</FieldLabel>
                <span className="text-[10px] text-white/30">สูงสุด 12</span>
              </div>
              <div className="mt-1 space-y-1">
                {(Array.isArray(siteSettings.footer_links) ? siteSettings.footer_links : []).map((item, idx) => (
                  <div key={`fl-${idx}`} className="flex items-center gap-2">
                    <input value={item.label || ''} onChange={(e) => setSiteSettings((s) => { const list = [...(s.footer_links || [])]; list[idx] = { ...list[idx], label: e.target.value }; return { ...s, footer_links: list } })} placeholder="ชื่อลิงก์" className="h-7 flex-1 rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none" />
                    <input value={item.url || ''} onChange={(e) => setSiteSettings((s) => { const list = [...(s.footer_links || [])]; list[idx] = { ...list[idx], url: e.target.value }; return { ...s, footer_links: list } })} placeholder="URL" className="h-7 flex-1 rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none" />
                    <button type="button" onClick={() => setSiteSettings((s) => { const list = [...(s.footer_links || [])]; list.splice(idx, 1); return { ...s, footer_links: list } })} className="rounded bg-red-500/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-500">ลบ</button>
                  </div>
                ))}
              </div>
              {(siteSettings.footer_links?.length || 0) < 12 ? (
                <button type="button" onClick={() => setSiteSettings((s) => ({ ...s, footer_links: [...(s.footer_links || []), { label: '', url: '' }] }))} className="mt-1 h-6 w-full rounded border border-dashed border-slate-600/50 text-[10px] text-white/50 hover:border-slate-500 hover:text-white/80">+ เพิ่มลิงก์</button>
              ) : null}
            </div>
          </div>

          {/* ── Social Links ── */}
          <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-violet-200">Social Media Links</div>
              <span className="text-[10px] text-white/30">สูงสุด 10</span>
            </div>
            <div className="space-y-1">
              {(Array.isArray(siteSettings.social_links) ? siteSettings.social_links : []).map((item, idx) => (
                <div key={`sl-${idx}`} className="flex items-center gap-2">
                  <select value={item.platform || ''} onChange={(e) => setSiteSettings((s) => { const list = [...(s.social_links || [])]; list[idx] = { ...list[idx], platform: e.target.value }; return { ...s, social_links: list } })} className="h-7 w-28 rounded border border-slate-700/60 bg-slate-950/60 px-1 text-[11px] text-white outline-none">
                    <option value="">เลือก</option>
                    {['Facebook', 'Line', 'Discord', 'X', 'Instagram', 'YouTube', 'TikTok', 'Telegram', 'Website'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input value={item.url || ''} onChange={(e) => setSiteSettings((s) => { const list = [...(s.social_links || [])]; list[idx] = { ...list[idx], url: e.target.value }; return { ...s, social_links: list } })} placeholder="URL" className="h-7 flex-1 rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-white outline-none" />
                  <button type="button" onClick={() => setSiteSettings((s) => { const list = [...(s.social_links || [])]; list.splice(idx, 1); return { ...s, social_links: list } })} className="rounded bg-red-500/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-500">ลบ</button>
                </div>
              ))}
            </div>
            {(siteSettings.social_links?.length || 0) < 10 ? (
              <button type="button" onClick={() => setSiteSettings((s) => ({ ...s, social_links: [...(s.social_links || []), { platform: '', url: '' }] }))} className="h-6 w-full rounded border border-dashed border-slate-600/50 text-[10px] text-white/50 hover:border-slate-500 hover:text-white/80">+ เพิ่ม Social Link</button>
            ) : null}
          </div>

          {/* ── ToS Content ── */}
          <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40 p-3 space-y-2">
            <div className="text-xs font-semibold text-orange-200">เงื่อนไขการใช้งาน (Terms of Service)</div>
            <div className="text-[10px] text-white/40">เนื้อหาจะแสดงในหน้า /tos — ถ้าว่างจะใช้ค่าเริ่มต้น</div>
            <textarea
              value={siteSettings.tos_content}
              onChange={(e) => setSiteSettings((s) => ({ ...s, tos_content: e.target.value }))}
              placeholder="พิมพ์เนื้อหาเงื่อนไขการใช้งานที่นี่...&#10;สามารถใช้ข้อความธรรมดาหรือ HTML ได้"
              className="min-h-[180px] w-full rounded border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none font-mono leading-relaxed"
            />
          </div>
        </section>
      </div>
    )
  }

  function renderLogsModule(data) {
    const role = String(session?.me?.user?.role || '').trim().toLowerCase()
    if (role !== 'owner') {
      return (
        <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          ต้องใช้สิทธิ์ owner เพื่อดูบันทึกการตรวจสอบ
        </div>
      )
    }

    const logs = Array.isArray(data?.logs) ? data.logs : []

    return (
      <div className="mt-4 space-y-4">
        <div className="grid gap-2 rounded-xl border border-slate-700/50 bg-slate-900/55 p-3 md:grid-cols-4">
          <div>
            <FieldLabel>การกระทำ</FieldLabel>
            <input
              value={logsQuery.action}
              onChange={(e) => patchLogsQuery({ action: e.target.value })}
              placeholder="การกระทำ (เช่น product.update)"
              className="h-10 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            />
          </div>
          <div>
            <FieldLabel>ประเภทเอนทิตี</FieldLabel>
            <input
              value={logsQuery.entity_type}
              onChange={(e) => patchLogsQuery({ entity_type: e.target.value })}
              placeholder="ประเภทเอนทิตี (เช่น product)"
              className="h-10 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            />
          </div>
          <div>
            <FieldLabel>จำนวนสูงสุด</FieldLabel>
            <input
              value={logsQuery.limit}
              onChange={(e) => patchLogsQuery({ limit: e.target.value })}
              placeholder="จำนวนสูงสุด"
              className="h-10 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            />
          </div>
          <button type="button" onClick={refreshLogs} className="h-10 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">
            รีเฟรช
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">บันทึก {formatNumber(logs.length)}</span>
          {logsActionState.status !== 'idle' ? (
            <span className={`rounded-full border px-2 py-1 ${logsActionState.status === 'error' ? 'border-red-400/35 bg-red-500/15 text-red-100' : logsActionState.status === 'success' ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-amber-400/35 bg-amber-500/15 text-amber-100'}`}>
              {logsActionState.message}
            </span>
          ) : null}
        </div>

        {logsError ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{logsError}</div> : null}

        {auditReplayState.status === 'error' ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{auditReplayState.error}</div> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/45 p-2">
          <table className="min-w-full text-left text-xs text-white/80">
            <thead className="text-white/55">
              <tr className="border-b border-slate-700/50">
                <th className="px-2 py-2">ID</th>
                <th className="px-2 py-2">เวลา</th>
                <th className="px-2 py-2">ผู้กระทำ</th>
                <th className="px-2 py-2">การกระทำ</th>
                <th className="px-2 py-2">เอนทิตี</th>
                <th className="px-2 py-2">รายละเอียด</th>
                <th className="px-2 py-2 text-right">รีเพลย์</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b border-slate-700/35">
                  <td className="px-2 py-2 font-mono">{row.id}</td>
                  <td className="px-2 py-2">{formatDateTime(row.created_at)}</td>
                  <td className="px-2 py-2">
                    <div>{row.actor_username || '-'}</div>
                    {row.actor_email ? <div className="text-white/55">{row.actor_email}</div> : null}
                  </td>
                  <td className="px-2 py-2">{row.action || '-'}</td>
                  <td className="px-2 py-2">
                    {row.entity_type || '-'}
                    {row.entity_id ? <span className="ml-1 font-mono text-white/55">#{row.entity_id}</span> : null}
                  </td>
                  <td className="px-2 py-2">
                    <div className="max-w-[460px] truncate font-mono text-white/60">{JSON.stringify(row.detail_json || {})}</div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button type="button" onClick={() => openAuditReplay(row.id)} className="h-7 rounded border border-cyan-400/35 bg-cyan-500/10 px-2 text-[11px] text-cyan-100">
                      ดู replay
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 ? <div className="px-2 py-3 text-xs text-white/55">ไม่พบบันทึกการตรวจสอบ</div> : null}
        </div>

        {auditReplayState.status !== 'idle' ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">รีเพลย์บันทึก {auditReplayState?.log?.id ? `#${auditReplayState.log.id}` : ''}</div>
              <button type="button" onClick={() => setAuditReplayState({ status: 'idle', log: null, replay: [], error: '' })} className="h-7 rounded border border-slate-700/60 bg-slate-900/65 px-2 text-[11px] text-white/80">ปิด</button>
            </div>
            {auditReplayState.status === 'loading' ? <div className="text-xs text-white/55">กำลังโหลด replay...</div> : null}
            {auditReplayState.status === 'ready' ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  {(auditReplayState.replay || []).map((step) => (
                    <div key={step.key} className="rounded-lg border border-slate-700/50 bg-slate-950/45 p-2">
                      <div className="text-[11px] font-semibold text-cyan-100">{step.label}</div>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-white/75">{JSON.stringify(step.value ?? null, null, 2)}</pre>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 p-2">
                  <div className="text-[11px] font-semibold text-white/80">ข้อมูลบันทึกดิบ (JSON)</div>
                  <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap text-[11px] text-white/70">{JSON.stringify(auditReplayState.log || {}, null, 2)}</pre>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  function getFulfillmentStatusMeta(status) {
    const s = String(status || '').trim().toLowerCase()
    if (s === 'pending') return { label: 'รอดำเนินการ', color: 'border-amber-400/40 bg-amber-500/15 text-amber-100' }
    if (s === 'in_progress') return { label: 'กำลังดำเนินการ', color: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100' }
    if (s === 'fulfilled') return { label: 'ส่งมอบแล้ว', color: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100' }
    if (s === 'cancelled' || s === 'canceled') return { label: 'ยกเลิก', color: 'border-red-400/40 bg-red-500/15 text-red-100' }
    return { label: status || '-', color: 'border-slate-700/50 bg-slate-800/40 text-white/70' }
  }

  function getFulfillmentAgeBadge(createdAt) {
    if (!createdAt) return null
    const diffMs = Date.now() - new Date(createdAt).getTime()
    const diffMin = diffMs / 60000
    if (diffMin > 120) return { label: `${Math.floor(diffMin / 60)}ชม.`, cls: 'border-red-400/40 bg-red-500/20 text-red-100' }
    if (diffMin > 30) return { label: `${Math.floor(diffMin)}น.`, cls: 'border-amber-400/40 bg-amber-500/20 text-amber-100' }
    return null
  }

  function renderFulfillmentModule(data) {
    const requests = Array.isArray(data?.requests) ? data.requests : []
    const boosters = Array.isArray(data?.boosters) ? data.boosters : []
    const summary = data?.summary || {}
    const myUserId = Number(session?.me?.user?.id)
    const hasMyBooster = boosters.some((row) => Number(row?.id) === myUserId)
    const curScope = String(fulfillmentQuery.scope || 'all')

    const boosterWorkload = {}
    requests.forEach((r) => {
      const bid = Number(r?.assigned_booster_id)
      if (bid > 0 && ['pending', 'in_progress'].includes(String(r?.status || ''))) {
        boosterWorkload[bid] = (boosterWorkload[bid] || 0) + 1
      }
    })

    const detail = fulfillmentDetail
    const detailReq = detail?.request || null
    const detailLogs = Array.isArray(detail?.logs) ? detail.logs : []
    const selId = fulfillmentSelectedId
    const activeAct = fulfillmentActiveAction
    const detailFormFieldLabelMap = new Map(
      normalizeProductCustomFormFields(detailReq)
        .map((field) => {
          const id = String(field?.id || '').trim()
          if (!id) return null
          const label = String(field?.label || '').trim() || id
          return [id, label]
        })
        .filter(Boolean),
    )

    const scopeBtn = (scope, label, count) => (
      <button
        type="button"
        onClick={() => patchFulfillmentQuery({ scope })}
        className={`flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs transition-colors ${curScope === scope ? 'bg-cyan-500/80 text-white shadow-sm' : 'border border-slate-700/70 bg-slate-900/70 text-white/80 hover:bg-slate-800/80'}`}
      >
        {label}
        {count != null ? <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold">{formatNumber(count)}</span> : null}
      </button>
    )

    return (
      <div className="mt-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {[
            { label: 'รอดำเนินการ', value: summary.pending || 0, cls: 'border-amber-400/30 bg-amber-500/10', textCls: 'text-amber-100' },
            { label: 'กำลังดำเนินการ', value: summary.in_progress || 0, cls: 'border-cyan-400/30 bg-cyan-500/10', textCls: 'text-cyan-100' },
            { label: 'ส่งมอบแล้ว', value: summary.fulfilled || 0, cls: 'border-emerald-400/30 bg-emerald-500/10', textCls: 'text-emerald-100' },
            { label: 'ยกเลิก', value: summary.cancelled || 0, cls: 'border-red-400/30 bg-red-500/10', textCls: 'text-red-100' },
            { label: 'ยังไม่มอบหมาย', value: summary.unassigned || 0, cls: 'border-violet-400/30 bg-violet-500/10', textCls: 'text-violet-100' },
            { label: 'งานของฉัน', value: summary.mine || 0, cls: 'border-sky-400/30 bg-sky-500/10', textCls: 'text-sky-100' },
            { label: 'เลย SLA', value: summary.over_sla || 0, cls: summary.over_sla > 0 ? 'border-red-400/40 bg-red-500/15 animate-pulse' : 'border-slate-700/30 bg-slate-800/30', textCls: summary.over_sla > 0 ? 'text-red-100' : 'text-white/60' },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border p-3 ${card.cls}`}>
              <div className="text-[11px] text-white/55">{card.label}</div>
              <div className={`text-lg font-bold ${card.textCls}`}>{formatNumber(card.value)}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="grid gap-2 rounded-xl border border-slate-700/50 bg-slate-900/55 p-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <input
              value={fulfillmentSearchDraft}
              onChange={(e) => setFulfillmentSearchDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') patchFulfillmentQuery({ search: fulfillmentSearchDraft }) }}
              placeholder="ค้นหา: ID / อีเมล / สินค้า / ออเดอร์ (Enter เพื่อค้นหา)"
              className="h-10 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none placeholder:text-white/35"
            />
          </div>
          <select
            value={fulfillmentQuery.status}
            onChange={(e) => patchFulfillmentQuery({ status: e.target.value })}
            className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
          >
            <option value="">ทุกสถานะ</option>
            <option value="pending">รอดำเนินการ</option>
            <option value="in_progress">กำลังดำเนินการ</option>
            <option value="fulfilled">ส่งมอบแล้ว</option>
            <option value="cancelled">ยกเลิกแล้ว</option>
          </select>
          <button type="button" onClick={() => loadModule('fulfillment')} className="h-10 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white hover:bg-slate-800/80">รีโหลด</button>
        </div>

        {/* Scope tabs */}
        <div className="flex flex-wrap gap-2">
          {scopeBtn('all', 'ทั้งหมด', data?.total)}
          {scopeBtn('mine', 'งานของฉัน', summary.mine)}
          {scopeBtn('unassigned', 'ยังไม่มอบหมาย', summary.unassigned)}
        </div>

        {/* Action state + error */}
        {fulfillmentActionState.status !== 'idle' ? (
          <div className={`rounded-xl border px-3 py-2 text-xs ${fulfillmentActionState.status === 'error' ? 'border-red-400/35 bg-red-500/10 text-red-100' : fulfillmentActionState.status === 'success' ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/35 bg-amber-500/10 text-amber-100'}`}>
            {fulfillmentActionState.message}
          </div>
        ) : null}
        {fulfillmentError ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{fulfillmentError}</div> : null}

        {/* Main content: table + detail panel */}
        <div className={`grid gap-3 ${selId ? 'lg:grid-cols-[1fr_380px]' : ''}`}>
          {/* Request table */}
          <div className="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/45 p-2">
            <table className="min-w-full text-left text-xs text-white/80">
              <thead className="text-white/55">
                <tr className="border-b border-slate-700/50">
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">ผู้ใช้</th>
                  <th className="px-2 py-2">สินค้า</th>
                  <th className="px-2 py-2">ออเดอร์</th>
                  <th className="px-2 py-2">ผู้รับผิดชอบ</th>
                  <th className="px-2 py-2">สถานะ</th>
                  <th className="px-2 py-2">สร้างเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => {
                  const st = getFulfillmentStatusMeta(row?.status)
                  const isSelected = Number(row?.id) === selId
                  const ageBadge = ['pending', 'in_progress'].includes(String(row?.status || '')) ? getFulfillmentAgeBadge(row?.created_at) : null
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openFulfillmentRequest(row.id)}
                      className={`border-b border-slate-700/35 cursor-pointer transition-colors ${isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'}`}
                    >
                      <td className="px-2 py-2 font-mono">#{row.id}</td>
                      <td className="px-2 py-2 max-w-[140px] truncate">{row.email || '-'}</td>
                      <td className="px-2 py-2 max-w-[160px] truncate">{row.product_name || '-'}</td>
                      <td className="px-2 py-2">#{row.order_id || '-'} <span className="text-white/45">x{Math.max(1, Number(row.order_qty) || 1)}</span></td>
                      <td className="px-2 py-2">
                        {row.assigned_booster_email
                          ? <span className="text-cyan-200">{row.assigned_booster_email}</span>
                          : row.assigned_booster_id
                            ? <span className="text-white/55">#{row.assigned_booster_id}</span>
                            : <span className="text-white/35">-</span>
                        }
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${st.color}`}>
                          {st.label}
                        </span>
                        {ageBadge ? <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ageBadge.cls}`}>{ageBadge.label}</span> : null}
                      </td>
                      <td className="px-2 py-2 text-white/55">{formatDateTime(row.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {requests.length === 0 ? <div className="px-2 py-3 text-xs text-white/55">ไม่พบคำของานจ้าง</div> : null}
          </div>

          {/* Detail Panel */}
          {selId ? (
            <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-900/55 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white">คำขอ #{selId}</div>
                <button type="button" onClick={() => { setFulfillmentSelectedId(null); setFulfillmentDetail(null); setFulfillmentActiveAction(null) }} className="h-7 rounded border border-slate-700/60 bg-slate-900/70 px-2 text-[11px] text-white/70 hover:text-white">ปิด</button>
              </div>

              {fulfillmentDetailLoading ? <div className="text-xs text-white/55">กำลังโหลดรายละเอียด...</div> : null}

              {detailReq ? (
                <>
                  {/* Status badge */}
                  {(() => { const sm = getFulfillmentStatusMeta(detailReq.status); return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sm.color}`}>{sm.label}</span> })()}

                  {/* User & Product info */}
                  <div className="space-y-1.5 rounded-lg border border-slate-700/40 bg-slate-950/40 p-2.5">
                    <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">ข้อมูลคำขอ</div>
                    <div className="grid grid-cols-[90px_1fr] gap-y-1 text-xs">
                      <span className="text-white/50">ผู้ใช้</span><span className="text-white/90 truncate">{detailReq.email || '-'}</span>
                      <span className="text-white/50">สินค้า</span><span className="text-white/90 truncate">{detailReq.product_name || '-'}</span>
                      <span className="text-white/50">ออเดอร์</span><span className="text-white/90">#{detailReq.order_id || '-'} x{Math.max(1, Number(detailReq.order_qty) || 1)}</span>
                      {detailReq.uid ? <><span className="text-white/50">UID</span><span className="text-white/90">{detailReq.uid}</span></> : null}
                      <span className="text-white/50">ผู้รับผิดชอบ</span>
                      <span className="text-white/90">
                        {detailReq.assigned_booster_email || (detailReq.assigned_booster_id ? `#${detailReq.assigned_booster_id}` : <span className="text-white/35">ยังไม่มอบหมาย</span>)}
                      </span>
                      {detailReq.product_option ? <><span className="text-white/50">ตัวเลือก</span><span className="text-white/90 text-[11px] truncate">{JSON.stringify(detailReq.product_option)}</span></> : null}
                    </div>
                  </div>

                  {/* Credentials */}
                  {(detailReq.username || detailReq.password || detailReq.auth_key) ? (
                    <div className="space-y-1.5 rounded-lg border border-amber-400/25 bg-amber-500/5 p-2.5">
                      <div className="text-[11px] font-semibold text-amber-200/70 uppercase tracking-wider">ข้อมูลล็อกอิน</div>
                      <div className="grid grid-cols-[90px_1fr] gap-y-1 text-xs">
                        {detailReq.username ? <><span className="text-white/50">Username</span><span className="font-mono text-amber-100 select-all">{detailReq.username}</span></> : null}
                        {detailReq.password ? <><span className="text-white/50">Password</span><span className="font-mono text-amber-100 select-all">{detailReq.password}</span></> : null}
                        {detailReq.auth_key ? <><span className="text-white/50">Auth Key</span><span className="font-mono text-amber-100 select-all break-all">{detailReq.auth_key}</span></> : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Form data */}
                  {detailReq.form_data && Object.keys(detailReq.form_data).length > 0 ? (
                    <div className="space-y-1.5 rounded-lg border border-slate-700/40 bg-slate-950/40 p-2.5">
                      <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">ข้อมูลฟอร์ม</div>
                      <div className="grid grid-cols-[90px_1fr] gap-y-1 text-xs">
                        {Object.entries(detailReq.form_data).flatMap(([k, v]) => [
                          <span key={`${k}-k`} className="text-white/50 truncate" title={String(k)}>{detailFormFieldLabelMap.get(String(k)) || String(k)}</span>,
                          <span key={`${k}-v`} className="text-white/90 break-all select-all">{v === true ? '✅' : v === false ? '❌' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>,
                        ])}
                      </div>
                    </div>
                  ) : null}

                  {/* Timeline */}
                  <div className="space-y-1.5 rounded-lg border border-slate-700/40 bg-slate-950/40 p-2.5">
                    <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">ไทม์ไลน์</div>
                    <div className="space-y-1 text-xs">
                      {[
                        { label: 'สร้าง', time: detailReq.created_at, dot: 'bg-white/40' },
                        { label: 'มอบหมาย', time: detailReq.assigned_at, dot: 'bg-cyan-400' },
                        { label: 'เริ่มทำ', time: detailReq.started_at, dot: 'bg-sky-400' },
                        { label: 'ส่งมอบ', time: detailReq.fulfilled_at, dot: 'bg-emerald-400' },
                        { label: 'ยกเลิก', time: detailReq.cancelled_at, dot: 'bg-red-400' },
                      ].filter((t) => t.time).map((t) => (
                        <div key={t.label} className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                          <span className="text-white/55 w-16">{t.label}</span>
                          <span className="text-white/75">{formatDateTime(t.time)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Booster Activity Logs */}
                  {detailLogs.length > 0 ? (
                    <div className="space-y-1.5 rounded-lg border border-slate-700/40 bg-slate-950/40 p-2.5">
                      <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">บันทึกกิจกรรม</div>
                      <div className="max-h-40 overflow-auto space-y-1">
                        {detailLogs.map((log) => (
                          <div key={log.id} className="flex items-start gap-2 text-[11px]">
                            <span className="text-white/40 whitespace-nowrap">{formatDateTime(log.created_at)}</span>
                            <span className="text-cyan-200">{log.booster_email || `#${log.booster_id}`}</span>
                            <span className="text-white/65">{log.action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Cancel note */}
                  {detailReq.cancel_note ? (
                    <div className="rounded-lg border border-red-400/25 bg-red-500/5 p-2.5">
                      <div className="text-[11px] font-semibold text-red-200/70 uppercase tracking-wider">หมายเหตุการยกเลิก</div>
                      <div className="mt-1 text-xs text-red-100/80">{detailReq.cancel_note}</div>
                    </div>
                  ) : null}

                  {/* Actions (context-aware) */}
                  {['pending', 'in_progress'].includes(String(detailReq.status || '').toLowerCase()) ? (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">การดำเนินการ</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => setFulfillmentActiveAction(activeAct === 'assign' ? null : 'assign')} className={`h-7 rounded-lg px-2.5 text-[11px] transition-colors ${activeAct === 'assign' ? 'bg-cyan-500/80 text-white' : 'border border-slate-700/60 bg-slate-900/70 text-white/80 hover:bg-slate-800/80'}`}>
                          {detailReq.assigned_booster_id ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมาย'}
                        </button>
                        <button type="button" onClick={() => { setFulfillmentActiveAction(activeAct === 'fulfill' ? null : 'fulfill'); setFulfillForm({ id: selId, payload: '' }) }} className={`h-7 rounded-lg px-2.5 text-[11px] transition-colors ${activeAct === 'fulfill' ? 'bg-emerald-500/80 text-white' : 'border border-slate-700/60 bg-slate-900/70 text-white/80 hover:bg-slate-800/80'}`}>
                          ส่งมอบ
                        </button>
                        <button type="button" onClick={() => { setFulfillmentActiveAction(activeAct === 'cancel' ? null : 'cancel'); setCancelForm({ id: selId, note: '' }) }} className={`h-7 rounded-lg px-2.5 text-[11px] transition-colors ${activeAct === 'cancel' ? 'bg-red-500/80 text-white' : 'border border-slate-700/60 bg-slate-900/70 text-white/80 hover:bg-slate-800/80'}`}>
                          ยกเลิก
                        </button>
                      </div>

                      {/* Assign form */}
                      {activeAct === 'assign' ? (
                        <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-2.5 space-y-2">
                          <select
                            value={assignForm.booster_id}
                            onChange={(e) => setAssignForm((prev) => ({ ...prev, booster_id: e.target.value, id: selId }))}
                            className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                          >
                            <option value="">เลือกบูสเตอร์</option>
                            {boosters.map((b) => {
                              const wl = boosterWorkload[Number(b.id)] || 0
                              return <option key={b.id} value={b.id}>#{b.id} {b.email}{wl > 0 ? ` (${wl} งาน)` : ''}</option>
                            })}
                          </select>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => fulfillmentAssignRequest(selId, assignForm.booster_id)} className="h-7 rounded bg-cyan-500/80 px-3 text-[11px] text-white">มอบหมาย</button>
                            {hasMyBooster ? <button type="button" onClick={() => fulfillmentAssignRequest(selId, myUserId)} className="h-7 rounded border border-slate-700/70 bg-slate-900/70 px-3 text-[11px] text-white">มอบหมายให้ฉัน</button> : null}
                          </div>
                        </div>
                      ) : null}

                      {/* Fulfill form */}
                      {activeAct === 'fulfill' ? (
                        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2.5 space-y-2">
                          <textarea
                            value={fulfillForm.payload}
                            onChange={(e) => setFulfillForm((prev) => ({ ...prev, payload: e.target.value, id: selId }))}
                            rows={3}
                            className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none"
                            placeholder="ข้อมูลที่ต้องส่งมอบ (payload)"
                          />
                          <button type="button" onClick={() => fulfillmentSubmit(selId, 'fulfill')} className="h-7 rounded bg-emerald-500/80 px-3 text-[11px] text-white">ส่งมอบ</button>
                        </div>
                      ) : null}

                      {/* Cancel form */}
                      {activeAct === 'cancel' ? (
                        <div className="rounded-lg border border-red-400/20 bg-red-500/5 p-2.5 space-y-2">
                          <textarea
                            value={cancelForm.note}
                            onChange={(e) => setCancelForm((prev) => ({ ...prev, note: e.target.value, id: selId }))}
                            rows={2}
                            className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none"
                            placeholder="หมายเหตุการยกเลิก (ไม่บังคับ)"
                          />
                          <button type="button" onClick={() => fulfillmentSubmit(selId, 'cancel')} className="h-7 rounded bg-red-500/80 px-3 text-[11px] text-white">ยืนยันยกเลิก</button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  function renderStockModule(data) {
    const products = Array.isArray(data?.products) ? data.products : []
    const pools = Array.isArray(data?.pools) ? data.pools : []
    const stockItems = Array.isArray(data?.stockItems) ? data.stockItems : []
    const poolItems = Array.isArray(data?.poolItems) ? data.poolItems : []
    const poolBindings = Array.isArray(data?.poolBindings) ? data.poolBindings : []
    const stockSummary = data?.stockSummary || null
    const poolSummary = data?.poolSummary || null
    const mysteryProducts = products.filter((row) => String(row?.fulfillment_type || '').toLowerCase() === 'mystery_box')
    const mysteryChanceRows = mysteryPrizes.map((row) => {
      const meta = computeMysteryChanceMeta(row)
      return {
        id: Number(row?.id),
        effectiveWeight: meta.effectiveWeight,
      }
    })
    const mysteryTotalEffectiveWeight = mysteryChanceRows.reduce((sum, row) => sum + Math.max(0, Number(row?.effectiveWeight || 0)), 0)
    const selectedMysteryPrize = mysteryPrizes.find((row) => Number(row?.id) === Number(mysteryPrizeStockPrizeId)) || null
    const editingMysteryPrize = mysteryPrizes.find((row) => Number(row?.id) === Number(mysteryEdit.id)) || null

    return (
      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr_1fr]">
        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="text-sm font-bold text-white">สต็อกดิจิทัล</div>
          <div className="mt-2 grid gap-2">
            <select
              value={stockProductId}
              onChange={(e) => {
                setStockProductId(e.target.value)
                setStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
                if (e.target.value) void loadStockItems(e.target.value)
              }}
              className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            >
              <option value="">เลือกสินค้า</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>#{p.id} {p.name || p.slug}</option>
              ))}
            </select>
            <div>
              <FieldLabel>ข้อมูลสต็อก</FieldLabel>
              <textarea
                value={stockText}
                onChange={(e) => setStockText(e.target.value)}
                rows={6}
                placeholder="1 บรรทัด = 1 ชิ้น"
                className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={addStockItems} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">เพิ่มสต็อก</button>
              <button type="button" onClick={() => loadStockItems(stockProductId)} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">รีโหลด</button>
            </div>
            {stockSummary ? <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 px-3 py-2 text-xs text-white/70">พร้อมใช้ {formatNumber(stockSummary.available)} | จองแล้ว {formatNumber(stockSummary.reserved)} | ส่งแล้ว {formatNumber(stockSummary.delivered)}</div> : null}
            {stockErrors.product ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{stockErrors.product}</div> : null}
          </div>

          <div className="mt-3 max-h-[340px] space-y-2 overflow-auto pr-1">
            {stockItems.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2 text-xs">
                <div className="text-white/80">#{row.id} · {row.status}</div>
                <div className="mt-1 break-all text-white/60">{row.payload || '-'}</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setStockItemEdit({ id: row.id, payload: row.payload || '', status: row.status || 'available' })} className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white">แก้ไข</button>
                  <button type="button" onClick={() => deleteStockItem(row.id)} className="rounded-lg bg-red-500/20 px-2 py-1 text-[11px] text-red-100">ลบ</button>
                </div>
              </div>
            ))}
          </div>

          {stockItemEdit.id ? (
            <div className="mt-3 grid gap-2 rounded-lg border border-slate-700/60 bg-slate-900/60 p-2">
              <div><FieldLabel>ข้อมูลสต็อก</FieldLabel><input value={stockItemEdit.payload} onChange={(e) => setStockItemEdit((prev) => ({ ...prev, payload: e.target.value }))} className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
              <select value={stockItemEdit.status} onChange={(e) => setStockItemEdit((prev) => ({ ...prev, status: e.target.value }))} className="h-8 rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none"><option value="available">พร้อมใช้</option><option value="disabled">ปิดใช้งาน</option></select>
              <div className="flex gap-2"><button type="button" onClick={saveStockItemEdit} className="h-8 rounded bg-cyan-500/80 px-2 text-xs text-white">บันทึก</button><button type="button" onClick={() => setStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)} className="h-8 rounded border border-slate-700/70 px-2 text-xs text-white">ยกเลิก</button></div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="text-sm font-bold text-white">พูลสต็อก</div>
          <div className="mt-2 grid gap-2">
            <div><FieldLabel>ชื่อพูล</FieldLabel><input value={poolForm.name} onChange={(e) => setPoolForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="ชื่อพูล" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
            <select value={poolForm.kind} onChange={(e) => setPoolForm((prev) => ({ ...prev, kind: e.target.value }))} className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"><option value="digital_code">โค้ดดิจิทัล</option><option value="quantity">แบบจำนวนคงเหลือ</option></select>
            {poolForm.kind === 'quantity' ? <div><FieldLabel>จำนวนคงเหลือ</FieldLabel><input value={poolForm.quantity_remaining} onChange={(e) => setPoolForm((prev) => ({ ...prev, quantity_remaining: e.target.value }))} placeholder="จำนวนคงเหลือ" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div> : null}
            <label className="inline-flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={Boolean(poolForm.is_active)} onChange={(e) => setPoolForm((prev) => ({ ...prev, is_active: e.target.checked }))} />เปิดใช้งาน</label>
            <div className="flex gap-2"><button type="button" onClick={saveStockPool} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">{poolForm.id ? 'อัปเดต' : 'สร้าง'}</button><button type="button" onClick={() => setPoolForm(DEFAULT_POOL_FORM)} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">รีเซ็ต</button></div>
            {stockErrors.pool ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{stockErrors.pool}</div> : null}
          </div>

          <div className="mt-3 grid gap-2">
            <select
              value={poolSelectedId}
              onChange={(e) => {
                setPoolSelectedId(e.target.value)
                setPoolItemEdit(DEFAULT_STOCK_ITEM_EDIT)
                if (e.target.value) void loadPoolItems(e.target.value)
              }}
              className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            >
              <option value="">เลือกพูล</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>#{p.id} {p.name} ({p.kind})</option>
              ))}
            </select>
            {poolSummary ? <div className="rounded-lg border border-slate-700/60 bg-slate-900/55 px-3 py-2 text-xs text-white/70">{poolSummary.kind === 'quantity' ? `คงเหลือ ${formatNumber(poolSummary.quantity_remaining)}` : `พร้อมใช้ ${formatNumber(poolSummary.available)} | จองแล้ว ${formatNumber(poolSummary.reserved)} | ส่งแล้ว ${formatNumber(poolSummary.delivered)}`}</div> : null}
            <button type="button" onClick={() => deleteStockPool(poolSelectedId)} className="h-9 rounded-lg bg-red-500/20 px-3 text-xs text-red-100">ลบพูลที่เลือก</button>
          </div>

          <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/55 p-2">
            <div className="text-xs font-semibold text-white">รายการในพูล</div>
            <FieldLabel>ข้อมูลรายการในพูล</FieldLabel>
            <textarea value={poolItemsText} onChange={(e) => setPoolItemsText(e.target.value)} rows={5} placeholder="1 บรรทัด = 1 รายการ" className="mt-1 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none" />
            <div className="mt-2 flex gap-2"><button type="button" onClick={addPoolItems} className="h-8 rounded bg-cyan-500/80 px-2 text-xs text-white">เพิ่ม</button><button type="button" onClick={() => loadPoolItems(poolSelectedId)} className="h-8 rounded border border-slate-700/70 px-2 text-xs text-white">รีโหลด</button></div>
            {stockErrors.poolItem ? <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{stockErrors.poolItem}</div> : null}
          </div>

          <div className="mt-3 max-h-[250px] space-y-2 overflow-auto pr-1">
            {poolItems.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2 text-xs">
                <div className="text-white/80">#{row.id} · {row.status}</div>
                <div className="mt-1 break-all text-white/60">{row.payload || '-'}</div>
                <div className="mt-2 flex gap-2"><button type="button" onClick={() => setPoolItemEdit({ id: row.id, payload: row.payload || '', status: row.status || 'available' })} className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white">แก้ไข</button><button type="button" onClick={() => deletePoolItem(row.id)} className="rounded-lg bg-red-500/20 px-2 py-1 text-[11px] text-red-100">ลบ</button></div>
              </div>
            ))}
          </div>

          {poolItemEdit.id ? (
            <div className="mt-3 grid gap-2 rounded-lg border border-slate-700/60 bg-slate-900/60 p-2">
              <div><FieldLabel>ข้อมูลรายการในพูล</FieldLabel><input value={poolItemEdit.payload} onChange={(e) => setPoolItemEdit((prev) => ({ ...prev, payload: e.target.value }))} className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
              <select value={poolItemEdit.status} onChange={(e) => setPoolItemEdit((prev) => ({ ...prev, status: e.target.value }))} className="h-8 rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none"><option value="available">พร้อมใช้</option><option value="disabled">ปิดใช้งาน</option></select>
              <div className="flex gap-2"><button type="button" onClick={savePoolItemEdit} className="h-8 rounded bg-cyan-500/80 px-2 text-xs text-white">บันทึก</button><button type="button" onClick={() => setPoolItemEdit(DEFAULT_STOCK_ITEM_EDIT)} className="h-8 rounded border border-slate-700/70 px-2 text-xs text-white">ยกเลิก</button></div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="text-sm font-bold text-white">การผูกพูล</div>
          <div className="mt-2 grid gap-2">
            <select
              value={poolBindProductId}
              onChange={(e) => {
                setPoolBindProductId(e.target.value)
                if (e.target.value) void loadPoolBindings(e.target.value)
              }}
              className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            >
              <option value="">เลือกสินค้า</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>#{p.id} {p.name || p.slug}</option>
              ))}
            </select>
            <div><FieldLabel>รหัสตัวเลือกสินค้า (ไม่บังคับ)</FieldLabel><input value={poolBindingOptionId} onChange={(e) => setPoolBindingOptionId(e.target.value)} placeholder="รหัสตัวเลือกสินค้า (ไม่บังคับ)" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
            <select value={poolBindingPoolId} onChange={(e) => setPoolBindingPoolId(e.target.value)} className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"><option value="">เลือกพูล</option>{pools.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}</select>
            <button type="button" onClick={setPoolBinding} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">ตั้งค่าการผูก</button>
            {stockErrors.binding ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{stockErrors.binding}</div> : null}
          </div>
          <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
            {poolBindings.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2 text-xs">
                <div className="text-white/80">ตัวเลือก: {row.product_option_id || 'DEFAULT'}</div>
                <div className="text-white/55">พูล: #{row.pool_id} {row.pool_name || '-'}</div>
                <button type="button" onClick={() => unsetPoolBinding(row.product_option_id)} className="mt-2 rounded-lg bg-red-500/20 px-2 py-1 text-[11px] text-red-100">ยกเลิกการผูก</button>
              </div>
            ))}
            {poolBindings.length === 0 ? <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-xs text-white/60">ยังไม่มีการผูก</div> : null}
          </div>
        </section>

        {stockActionState.status !== 'idle' ? (
          <div className={`xl:col-span-3 rounded-xl border px-3 py-2 text-xs ${stockActionState.status === 'error' ? 'border-red-400/35 bg-red-500/15 text-red-100' : stockActionState.status === 'success' ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-amber-400/35 bg-amber-500/15 text-amber-100'}`}>
            {stockActionState.message}
          </div>
        ) : null}

        <section className="xl:col-span-3 rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-white">พูลสุ่ม (Mystery Pool)</div>
              <div className="text-xs text-white/55">จัดการรางวัล พร้อมน้ำหนัก, คงเหลือ และสต็อกของ Mystery Box</div>
            </div>
            <button
              type="button"
              onClick={() => loadMysteryPrizes(mysteryBoxProductId)}
              disabled={!mysteryBoxProductId}
              className="h-8 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white disabled:opacity-50"
            >
              รีโหลดพูลสุ่ม
            </button>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[360px_1fr]">
            <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-950/45 p-3">
              <div>
                <div className="text-[11px] font-semibold text-white/70">สินค้า Mystery Box</div>
                <select
                  value={mysteryBoxProductId}
                  onChange={(e) => {
                    setMysteryBoxProductId(e.target.value)
                    setMysteryPrizes([])
                    setMysteryFormStockText('')
                    setMysteryEdit(DEFAULT_MYSTERY_EDIT)
                    setMysteryPrizeStockPrizeId('')
                    setMysteryPrizeStockText('')
                    setMysteryPrizeStockItems([])
                    setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
                    setMysterySimulation(null)
                    if (e.target.value) void loadMysteryPrizes(e.target.value)
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                >
                  <option value="">เลือกสินค้า Mystery Box</option>
                  {mysteryProducts.map((row) => (
                    <option key={row.id} value={row.id}>#{row.id} {row.name || row.slug}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-2">
                <div className="text-xs font-semibold text-white">เพิ่มรางวัล</div>
                <FieldLabel>ประเภทรางวัล</FieldLabel>
                <select
                  value={mysteryForm.prize_kind}
                  onChange={(e) => setMysteryForm((prev) => ({
                    ...prev,
                    prize_kind: e.target.value,
                    prize_name: e.target.value === 'salt' || e.target.value === 'linked_product' ? prev.prize_name : '',
                    prize_product_id: e.target.value === 'linked_product' ? prev.prize_product_id : '',
                  }))}
                  className="mt-2 h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none"
                >
                  <option value="product">สต็อกภายใน (แยกตามรางวัล)</option>
                  <option value="linked_product">สต็อกที่ผูกกับสินค้าอื่น</option>
                  <option value="salt">เกลือ</option>
                </select>
                {mysteryForm.prize_kind === 'linked_product' ? (
                  <>
                    <FieldLabel>สินค้าอ้างอิง (ใช้ร่วมกับสต็อกสินค้า)</FieldLabel>
                    <select
                      value={mysteryForm.prize_product_id}
                      onChange={(e) => setMysteryForm((prev) => ({ ...prev, prize_product_id: e.target.value }))}
                      className="mt-2 h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none"
                    >
                      <option value="">เลือกสินค้า</option>
                      {products.map((row) => (
                        <option key={row.id} value={row.id}>#{row.id} {row.name || row.slug}</option>
                      ))}
                    </select>
                  </>
                ) : null}
                {mysteryForm.prize_kind === 'salt' || mysteryForm.prize_kind === 'linked_product' ? (
                  <div className="mt-2">
                    <FieldLabel>{mysteryForm.prize_kind === 'salt' ? 'ชื่อรางวัลเกลือ' : 'ชื่อรางวัล (ไม่บังคับ)'}</FieldLabel>
                    <input
                      value={mysteryForm.prize_name}
                      onChange={(e) => setMysteryForm((prev) => ({ ...prev, prize_name: e.target.value }))}
                      placeholder={mysteryForm.prize_kind === 'salt' ? 'เช่น เกลือ x1' : 'เว้นว่างเพื่อใช้ชื่อสินค้าอ้างอิง'}
                      className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none"
                    />
                  </div>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div><FieldLabel>น้ำหนัก</FieldLabel><input type="number" min="0.0001" step="0.0001" value={mysteryForm.weight} onChange={(e) => setMysteryForm((prev) => ({ ...prev, weight: e.target.value }))} placeholder="น้ำหนัก" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                  {mysteryForm.prize_kind === 'product'
                    ? <div className="rounded border border-slate-700/50 bg-slate-950/40 px-2 py-2 text-[11px] text-white/65">Internal remaining จะเท่ากับจำนวนสต็อกพร้อมใช้จริงโดยอัตโนมัติ</div>
                    : <div><FieldLabel>จำนวนคงเหลือ</FieldLabel><input type="number" min="0" step="1" value={mysteryForm.remaining} onChange={(e) => setMysteryForm((prev) => ({ ...prev, remaining: e.target.value }))} placeholder="จำนวนคงเหลือ" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>}
                </div>
                {mysteryForm.prize_kind === 'product' ? (
                  <div className="mt-2">
                    <FieldLabel>สต็อกของรางวัลภายใน (1 บรรทัด = 1 ชิ้น)</FieldLabel>
                    <textarea
                      value={mysteryFormStockText}
                      onChange={(e) => setMysteryFormStockText(e.target.value)}
                      rows={4}
                      placeholder="1 บรรทัด = 1 ชิ้น"
                      className="w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 py-2 text-xs text-white outline-none"
                    />
                  </div>
                ) : null}
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={Boolean(mysteryForm.is_active)} onChange={(e) => setMysteryForm((prev) => ({ ...prev, is_active: e.target.checked }))} />เปิดใช้งาน</label>
                <button type="button" onClick={createMysteryPrize} disabled={!mysteryBoxProductId} className="mt-2 h-8 w-full rounded bg-cyan-500/80 px-3 text-xs text-white disabled:opacity-50">สร้างรางวัล</button>
              </div>

              {mysteryEdit.id ? (
                <div className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-2">
                  <div className="text-xs font-semibold text-white">แก้ไขรางวัล #{mysteryEdit.id}</div>
                  <div className="mt-2"><FieldLabel>ชื่อรางวัล (ใช้กับเกลือ/รางวัลกำหนดเอง)</FieldLabel><input value={mysteryEdit.prize_name} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, prize_name: e.target.value }))} placeholder="ชื่อรางวัล" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div><FieldLabel>น้ำหนัก (Weight)</FieldLabel><input type="number" min="0.0001" step="0.0001" value={mysteryEdit.weight} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, weight: e.target.value }))} placeholder="weight" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                    {String(editingMysteryPrize?.prize_kind || '') === 'product'
                      ? <div className="rounded border border-slate-700/50 bg-slate-950/40 px-2 py-2 text-[11px] text-white/65">Internal remaining ปรับตามสต็อกพร้อมใช้เท่านั้น</div>
                      : <div><FieldLabel>จำนวนคงเหลือ (Remaining)</FieldLabel><input type="number" min="0" step="1" value={mysteryEdit.remaining} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, remaining: e.target.value }))} placeholder="remaining" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>}
                  </div>
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={Boolean(mysteryEdit.is_active)} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, is_active: e.target.checked }))} />เปิดใช้งาน</label>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={saveMysteryPrizeEdit} className="h-8 flex-1 rounded bg-cyan-500/80 px-3 text-xs text-white">บันทึก</button>
                    <button type="button" onClick={() => setMysteryEdit(DEFAULT_MYSTERY_EDIT)} className="h-8 rounded border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">ยกเลิก</button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-slate-700/50 bg-slate-900/55 p-2">
                <div className="text-xs font-semibold text-white">จำลองผลสุ่ม</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div><FieldLabel>จำนวนสุ่มต่อรอบ</FieldLabel><input value={mysterySimulationDraft.qty} onChange={(e) => setMysterySimulationDraft((prev) => ({ ...prev, qty: e.target.value }))} placeholder="qty per trial" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                  <div><FieldLabel>จำนวนรอบจำลอง</FieldLabel><input value={mysterySimulationDraft.trials} onChange={(e) => setMysterySimulationDraft((prev) => ({ ...prev, trials: e.target.value }))} placeholder="trials" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" /></div>
                </div>
                <button type="button" onClick={runMysterySimulation} disabled={!mysteryBoxProductId} className="mt-2 h-8 w-full rounded bg-cyan-500/80 px-3 text-xs text-white disabled:opacity-50">เริ่มจำลอง</button>
              </div>

              {mysteryError ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{mysteryError}</div> : null}
              {mysteryActionState.status !== 'idle' ? (
                <div className={`rounded-lg border px-3 py-2 text-xs ${mysteryActionState.status === 'error' ? 'border-red-400/30 bg-red-500/10 text-red-100' : mysteryActionState.status === 'success' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>
                  {mysteryActionState.message}
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-950/45 p-2">
              <table className="min-w-full text-left text-xs text-white/85">
                <thead className="text-white/55">
                  <tr className="border-b border-slate-700/50">
                    <th className="px-2 py-2">ID</th>
                    <th className="px-2 py-2">รางวัล</th>
                    <th className="px-2 py-2">โอกาสสุ่ม</th>
                    <th className="px-2 py-2">น้ำหนัก</th>
                    <th className="px-2 py-2">คงเหลือ</th>
                    <th className="px-2 py-2">สต็อก</th>
                    <th className="px-2 py-2">เปิดใช้</th>
                    <th className="px-2 py-2">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {mysteryPrizes.map((row) => {
                    const meta = computeMysteryChanceMeta(row)
                    const chance = mysteryTotalEffectiveWeight > 0 ? (Math.max(0, Number(meta.effectiveWeight || 0)) / mysteryTotalEffectiveWeight) * 100 : 0
                    return (
                      <tr key={row.id} className="border-b border-slate-700/40">
                        <td className="px-2 py-2">#{row.id}</td>
                        <td className="px-2 py-2">
                          {meta.kind === 'salt'
                            ? (row.prize_name || 'เกลือ (Salt)')
                            : meta.kind === 'linked_product'
                              ? `ลิงก์สินค้า #${row.prize_product_id} ${row.prize_product_name || '-'}`
                              : (row.prize_name ? row.prize_name : `รางวัล Internal #${row.id}`)}
                        </td>
                        <td className="px-2 py-2">{formatMysteryChancePercent(chance)}</td>
                        <td className="px-2 py-2">{meta.weight}<div className="text-[10px] text-white/50">EW {formatMysteryEffectiveWeight(meta.effectiveWeight)}</div></td>
                        <td className="px-2 py-2">{meta.remaining}</td>
                        <td className="px-2 py-2">{formatNumber(meta.availableStock)}</td>
                        <td className="px-2 py-2">{row?.is_active ? 'ใช่' : 'ไม่'}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button type="button" onClick={() => setMysteryEdit({ id: row.id, prize_name: row.prize_name || '', weight: row.weight, remaining: row.remaining, is_active: Boolean(row.is_active) })} className="rounded bg-slate-800 px-2 py-1 text-[11px] text-white">แก้ไข</button>
                            {meta.kind === 'product' ? (
                              <button
                                type="button"
                                onClick={() => loadMysteryPrizeStock(row.id)}
                                className={`rounded px-2 py-1 text-[11px] ${Number(mysteryPrizeStockPrizeId) === Number(row.id) ? 'bg-cyan-500/40 text-cyan-50' : 'bg-slate-800 text-white'}`}
                              >
                                สต็อก
                              </button>
                            ) : null}
                            <button type="button" onClick={() => deleteMysteryPrize(row.id)} className="rounded bg-red-500/20 px-2 py-1 text-[11px] text-red-100">ลบ</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!mysteryBoxProductId ? <div className="px-2 py-3 text-xs text-white/55">กรุณาเลือกสินค้า Mystery Box ก่อน</div> : null}
              {mysteryBoxProductId && mysteryPrizes.length === 0 ? <div className="px-2 py-3 text-xs text-white/55">ยังไม่มีรางวัลในพูลนี้</div> : null}
            </div>

            {mysterySimulation ? (
              <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-950/45 p-2">
                <div className="text-xs font-semibold text-white">ผลการจำลอง</div>
                <div className="mt-1 text-[11px] text-white/60">สุ่มรวม: {formatNumber(mysterySimulation.total_draws)} • ต่อรอบ: {formatNumber(mysterySimulation.qty_per_trial)} • รอบจำลอง: {formatNumber(mysterySimulation.trials)}</div>
                <div className="mt-2 max-h-[220px] space-y-2 overflow-auto pr-1">
                  {(Array.isArray(mysterySimulation.results) ? mysterySimulation.results : []).map((row) => (
                    <div key={row.prize_id} className="rounded border border-slate-700/50 bg-slate-900/55 px-2 py-1 text-[11px] text-white/80">
                      <div className="font-semibold">#{row.prize_id} {row.prize_name || (row.prize_kind === 'salt' ? 'เกลือ (Salt)' : (row.prize_product_name || `สินค้า #${row.prize_product_id || '-'}`))}</div>
                      <div>ได้จริง: {formatNumber(row.hits)} • ความน่าจะเป็น: {formatMysteryChancePercent(Number(row.probability_percent || 0))} • EW: {formatMysteryEffectiveWeight(row.effective_weight)} • คาดการณ์: {formatNumber(row.expected_hits)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedMysteryPrize && String(selectedMysteryPrize?.prize_kind || '') === 'product' ? (
              <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-950/45 p-2">
                <div className="text-xs font-semibold text-white">สต็อกรางวัล Internal • รางวัล #{selectedMysteryPrize.id}</div>
                <div className="mt-1 text-[11px] text-white/60">พร้อมใช้: {formatNumber(selectedMysteryPrize?.prize_available_stock || 0)}</div>
                <FieldLabel>ข้อมูลสต็อก (1 บรรทัด = 1 ชิ้น)</FieldLabel>
                <textarea
                  value={mysteryPrizeStockText}
                  onChange={(e) => setMysteryPrizeStockText(e.target.value)}
                  rows={4}
                  placeholder="one stock per line"
                  className="mt-1 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 py-2 text-xs text-white outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={addMysteryPrizeStockItems} className="h-8 rounded bg-cyan-500/80 px-2 text-xs text-white">เพิ่มสต็อก</button>
                  <button type="button" onClick={() => loadMysteryPrizeStock(selectedMysteryPrize.id)} className="h-8 rounded border border-slate-700/70 px-2 text-xs text-white">รีโหลด</button>
                </div>

                <div className="mt-2 max-h-[220px] space-y-2 overflow-auto pr-1">
                  {mysteryPrizeStockItems.map((item) => (
                    <div key={item.id} className="rounded border border-slate-700/50 bg-slate-900/55 p-2 text-[11px] text-white/80">
                      <div className="flex items-center gap-2">
                        {item.image_url ? <img src={item.image_url} alt="" className="h-8 w-8 rounded object-contain" /> : null}
                        <div>
                          <div>#{item.id} • {item.status}</div>
                          <div className="mt-1 break-all text-white/60">{item.payload || '-'}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-1">
                        <button type="button" onClick={() => setMysteryPrizeStockItemEdit({ id: item.id, payload: item.payload || '', status: item.status || 'available', image_url: item.image_url || '' })} className="rounded bg-slate-800 px-2 py-1 text-[11px] text-white">แก้ไข</button>
                        <button type="button" onClick={() => deleteMysteryPrizeStockItem(item.id)} className="rounded bg-red-500/20 px-2 py-1 text-[11px] text-red-100">ลบ</button>
                      </div>
                    </div>
                  ))}
                  {mysteryPrizeStockItems.length === 0 ? <div className="rounded border border-slate-700/40 bg-slate-900/45 px-2 py-2 text-[11px] text-white/55">ยังไม่มีสต็อก Internal สำหรับรางวัลนี้</div> : null}
                </div>

                {mysteryPrizeStockItemEdit.id ? (
                  <div className="mt-2 grid gap-2 rounded border border-slate-700/50 bg-slate-900/55 p-2">
                    <div className="text-[11px] text-white/70">แก้ไขรายการสต็อก #{mysteryPrizeStockItemEdit.id}</div>
                    <select
                      value={mysteryPrizeStockItemEdit.status}
                      onChange={(e) => setMysteryPrizeStockItemEdit((prev) => ({ ...prev, status: e.target.value }))}
                      className="h-8 rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none"
                    >
                      <option value="available">พร้อมใช้</option>
                      <option value="disabled">ปิดใช้งาน</option>
                    </select>
                    <div className="grid gap-1">
                      <div className="text-[10px] text-white/50">URL รูปภาพ</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="https://..."
                          value={mysteryPrizeStockItemEdit.image_url || ''}
                          onChange={(e) => setMysteryPrizeStockItemEdit((prev) => ({ ...prev, image_url: e.target.value }))}
                          className="h-8 flex-1 rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none"
                        />
                        {mysteryPrizeStockItemEdit.image_url ? <img src={mysteryPrizeStockItemEdit.image_url} alt="" className="h-8 w-8 rounded object-contain border border-slate-700/50" /> : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={saveMysteryPrizeStockItemEdit} className="h-8 rounded bg-cyan-500/80 px-2 text-xs text-white">บันทึก</button>
                      <button type="button" onClick={() => setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)} className="h-8 rounded border border-slate-700/70 px-2 text-xs text-white">ยกเลิก</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    )
  }

  function renderAnnouncementsModule(data) {
    const announcements = Array.isArray(data?.announcements) ? data.announcements : []

    function resetForm() {
      setAnnEditId(null)
      setAnnForm({ title: '', text: '', link: '', bg: '', enabled: true, push_to_inbox: false, icon: '', start_at: '', end_at: '' })
      setAnnMsg({ type: '', text: '' })
    }

    function startEdit(ann) {
      setAnnEditId(ann.id)
      setAnnForm({ title: ann.title || '', text: ann.text || '', link: ann.link || '', bg: ann.bg || '', enabled: ann.enabled !== false, push_to_inbox: ann.push_to_inbox === true, icon: ann.icon || '', start_at: ann.start_at ? ann.start_at.slice(0, 16) : '', end_at: ann.end_at ? ann.end_at.slice(0, 16) : '' })
      setAnnMsg({ type: '', text: '' })
    }

    async function saveAnn() {
      const text = String(annForm.text).trim()
      if (!text) { setAnnMsg({ type: 'error', text: 'กรุณากรอกข้อความประกาศ' }); return }
      setAnnSaving(true)
      setAnnMsg({ type: '', text: '' })
      try {
        if (annEditId) {
          await fetchJson(`/api/admin/announcements/${annEditId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: annForm.title, text: annForm.text, link: annForm.link, bg: annForm.bg, enabled: annForm.enabled, push_to_inbox: annForm.push_to_inbox, icon: annForm.icon, start_at: annForm.start_at || null, end_at: annForm.end_at || null }),
          })
        } else {
          await fetchJson('/api/admin/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: annForm.title, text: annForm.text, link: annForm.link, bg: annForm.bg, enabled: annForm.enabled, push_to_inbox: annForm.push_to_inbox, icon: annForm.icon, start_at: annForm.start_at || null, end_at: annForm.end_at || null, sort_order: announcements.length }),
          })
        }
        resetForm()
        setAnnMsg({ type: 'ok', text: annEditId ? 'แก้ไขสำเร็จ' : 'เพิ่มประกาศสำเร็จ' })
        setTimeout(() => setAnnMsg({ type: '', text: '' }), 3000)
        void loadModule('announcements')
      } catch (e) {
        setAnnMsg({ type: 'error', text: String(e?.message || 'save_failed') })
      } finally {
        setAnnSaving(false)
      }
    }

    async function deleteAnn(id) {
      if (!confirm('ลบประกาศนี้?')) return
      try {
        await fetchJson(`/api/admin/announcements/${id}`, { method: 'DELETE' })
        if (annEditId === id) resetForm()
        void loadModule('announcements')
      } catch { /* ignore */ }
    }

    async function toggleEnabled(ann) {
      try {
        await fetchJson(`/api/admin/announcements/${ann.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: ann.title, text: ann.text, link: ann.link, bg: ann.bg, enabled: !ann.enabled, push_to_inbox: ann.push_to_inbox, icon: ann.icon, start_at: ann.start_at, end_at: ann.end_at }),
        })
        void loadModule('announcements')
      } catch { /* ignore */ }
    }

    async function pushToInbox(ann) {
      try {
        await fetchJson('/api/admin/site-messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_type: 'global', title: ann.text.slice(0, 200), body: ann.link ? `ลิงก์: ${ann.link}` : '' }),
        })
        setAnnMsg({ type: 'ok', text: 'ส่งเข้ากล่องข้อความลูกค้าสำเร็จ' })
        setTimeout(() => setAnnMsg({ type: '', text: '' }), 3000)
      } catch (e) {
        setAnnMsg({ type: 'error', text: String(e?.message || 'push_failed') })
      }
    }

    async function moveAnn(idx, dir) {
      const ids = announcements.map((a) => a.id)
      const target = idx + dir
      if (target < 0 || target >= ids.length) return
      ;[ids[idx], ids[target]] = [ids[target], ids[idx]]
      try {
        await fetchJson('/api/admin/announcements/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: ids }) })
        void loadModule('announcements')
      } catch { /* ignore */ }
    }

    return (
      <div className="mt-4 space-y-5">
        {/* ── Form ── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-amber-200">{annEditId ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}</div>
            {annEditId ? <button type="button" onClick={resetForm} className="text-[10px] text-white/40 hover:text-white">ยกเลิกแก้ไข</button> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-white/50">หัวข้อ (ไม่บังคับ, สำหรับอ้างอิง)</label>
              <input value={annForm.title} onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))} placeholder="เช่น ประกาศปิดปรับปรุง" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" maxLength={200} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-white/50">ลิงก์ (ไม่บังคับ)</label>
              <input value={annForm.link} onChange={(e) => setAnnForm((f) => ({ ...f, link: e.target.value }))} placeholder="/product/123 หรือ https://..." className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" maxLength={300} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-white/50">ข้อความประกาศ <span className="text-red-300">*</span></label>
            <input value={annForm.text} onChange={(e) => setAnnForm((f) => ({ ...f, text: e.target.value }))} placeholder="ข้อความที่จะแสดงในแถบประกาศ" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" maxLength={300} />
            <div className="mt-1 text-[10px] text-white/35">
              รองรับรูปแบบ: <span className="text-white/55">**ตัวหนา**</span>, <span className="text-white/55">*ตัวเอียง*</span>, <span className="text-white/55">__ขีดเส้นใต้__</span>, <span className="text-amber-200/80">==คำที่อยากไฮไลท์==</span> (คลิกเพื่อคัดลอก)
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-white/50">สีพื้นหลัง (CSS gradient / color)</label>
              <input value={annForm.bg} onChange={(e) => setAnnForm((f) => ({ ...f, bg: e.target.value }))} placeholder="linear-gradient(135deg,#7b1313,#2f0909)" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" maxLength={200} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-white/50">ไอคอน (Lucide name หรือ SVG)</label>
              <input value={annForm.icon} onChange={(e) => setAnnForm((f) => ({ ...f, icon: e.target.value }))} placeholder="megaphone, gift, star, zap หรือ <svg>...</svg>" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" maxLength={2000} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-white/50">เริ่มแสดง (ว่าง = ทันที)</label>
              <input type="datetime-local" value={annForm.start_at} onChange={(e) => setAnnForm((f) => ({ ...f, start_at: e.target.value }))} className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-white/50">หยุดแสดง (ว่าง = ไม่มีกำหนด)</label>
              <input type="datetime-local" value={annForm.end_at} onChange={(e) => setAnnForm((f) => ({ ...f, end_at: e.target.value }))} className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-[11px] text-white/60 cursor-pointer">
              <input type="checkbox" checked={annForm.enabled} onChange={(e) => setAnnForm((f) => ({ ...f, enabled: e.target.checked }))} />
              เปิดใช้งาน
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-cyan-300/60 cursor-pointer" title="ส่งเข้า Inbox ลูกค้าเมื่อบันทึก">
              <input type="checkbox" checked={annForm.push_to_inbox} onChange={(e) => setAnnForm((f) => ({ ...f, push_to_inbox: e.target.checked }))} />
              ส่งเข้า Inbox
            </label>
          </div>
          {annForm.bg || annForm.text ? (
            <div className="rounded-lg border border-white/10 p-2.5">
              <div className="text-[10px] text-white/30 mb-1">ตัวอย่าง:</div>
              <div className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white" style={{ background: annForm.bg || 'linear-gradient(135deg,#7b1313 0%,#520d0d 52%,#2f0909 100%)' }}>
                <AnnIcon icon={annForm.icon} />
                <AnnRichText text={annForm.text || 'ข้อความประกาศ'} className="min-w-0 break-words leading-relaxed" />
                {annForm.link ? <span className="opacity-60">→</span> : null}
              </div>
            </div>
          ) : null}
          {annMsg.text ? <div className={`text-xs ${annMsg.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{annMsg.text}</div> : null}
          <button type="button" disabled={annSaving} onClick={saveAnn} className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50">
            {annSaving ? 'กำลังบันทึก...' : annEditId ? 'บันทึกการแก้ไข' : 'เพิ่มประกาศ'}
          </button>
        </div>

        {/* ── List ── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-white/80">ประกาศทั้งหมด</div>
            <div className="text-[11px] text-white/40">{announcements.length} รายการ</div>
          </div>
          {announcements.length === 0 ? (
            <div className="py-4 text-center text-xs text-white/30">ยังไม่มีประกาศ — สร้างประกาศใหม่ด้านบน</div>
          ) : (
            <div className="space-y-2">
              {announcements.map((ann, idx) => (
                <div key={ann.id} className={`rounded-lg border p-3 transition ${ann.enabled ? 'border-amber-500/20 bg-slate-950/40' : 'border-slate-700/30 bg-slate-950/20 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${ann.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                        {ann.icon ? <AnnIcon icon={ann.icon} className="h-3.5 w-3.5 flex-shrink-0" /> : null}
                        <div className="text-xs font-bold text-white min-w-0 break-words">
                          <AnnRichText text={ann.text} />
                        </div>
                      </div>
                      {ann.title ? <div className="mt-0.5 ml-4 text-[10px] text-white/40">{ann.title}</div> : null}
                      {ann.link ? <div className="mt-0.5 ml-4 text-[10px] text-cyan-300/50 truncate">{ann.link}</div> : null}
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
                      <button type="button" onClick={() => moveAnn(idx, -1)} disabled={idx === 0} className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white disabled:opacity-20" title="เลื่อนขึ้น">▲</button>
                      <button type="button" onClick={() => moveAnn(idx, 1)} disabled={idx === announcements.length - 1} className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white disabled:opacity-20" title="เลื่อนลง">▼</button>
                      <button type="button" onClick={() => toggleEnabled(ann)} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${ann.enabled ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-slate-600/30 text-white/40 hover:bg-slate-600/50'}`}>{ann.enabled ? 'เปิด' : 'ปิด'}</button>
                      <button type="button" onClick={() => startEdit(ann)} className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300 hover:bg-sky-500/30">แก้ไข</button>
                      <button type="button" onClick={() => pushToInbox(ann)} className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/30" title="ส่งเข้ากล่องข้อความลูกค้า">Inbox</button>
                      <button type="button" onClick={() => deleteAnn(ann.id)} className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300 hover:bg-red-500/30">ลบ</button>
                    </div>
                  </div>
                  <div className="mt-1.5 ml-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/25">
                    <span>{new Date(ann.created_at).toLocaleDateString('th-TH')}</span>
                    {ann.push_to_inbox ? <span className="text-cyan-300/40">push_to_inbox</span> : null}
                    {ann.icon ? <span className="text-amber-300/40">icon: {ann.icon.startsWith('<') ? 'SVG' : ann.icon}</span> : null}
                    {ann.start_at ? <span className="text-emerald-300/40">เริ่ม: {new Date(ann.start_at).toLocaleString('th-TH')}</span> : null}
                    {ann.end_at ? <span className="text-red-300/40">หยุด: {new Date(ann.end_at).toLocaleString('th-TH')}</span> : null}
                    {ann.bg ? <span className="inline-block h-3 w-8 rounded" style={{ background: ann.bg }} /> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderMessagesModule(data) {
    const messages = Array.isArray(data?.messages) ? data.messages : []

    async function sendMessage() {
      const title = String(msgDraft.title).trim()
      if (!title) { setMsgError('กรุณากรอกหัวข้อ'); return }
      if (msgDraft.target_type === 'individual' && !msgDraft.target_user_id) { setMsgError('กรุณากรอก User ID'); return }
      setMsgSending(true)
      setMsgError('')
      setMsgSentOk('')
      try {
        await fetchJson('/api/admin/site-messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_type: msgDraft.target_type,
            target_user_id: msgDraft.target_type === 'individual' ? Number(msgDraft.target_user_id) : undefined,
            title,
            body: String(msgDraft.body).trim(),
          }),
        })
        setMsgDraft({ target_type: 'global', target_user_id: '', title: '', body: '' })
        setMsgSentOk('ส่งข้อความสำเร็จ')
        setTimeout(() => setMsgSentOk(''), 3000)
        void loadModule('messages')
      } catch (e) {
        setMsgError(String(e?.message || 'send_failed'))
      } finally {
        setMsgSending(false)
      }
    }

    async function deleteMessage(id) {
      if (!confirm('ลบข้อความนี้?')) return
      try {
        await fetchJson(`/api/admin/site-messages/${id}`, { method: 'DELETE' })
        void loadModule('messages')
      } catch { /* ignore */ }
    }

    return (
      <div className="mt-4 space-y-5">
        {/* ── Compose ── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4 space-y-3">
          <div className="text-sm font-bold text-cyan-200">ส่งข้อความ / แจ้งเตือน</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-white/50">ประเภท</label>
              <select value={msgDraft.target_type} onChange={(e) => setMsgDraft((d) => ({ ...d, target_type: e.target.value }))} className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none">
                <option value="global">ส่งทุกคน (Global)</option>
                <option value="individual">ส่งรายบุคคล (Individual)</option>
              </select>
            </div>
            {msgDraft.target_type === 'individual' ? (
              <div>
                <label className="mb-1 block text-[11px] text-white/50">User ID (ตัวเลข)</label>
                <input value={msgDraft.target_user_id} onChange={(e) => setMsgDraft((d) => ({ ...d, target_user_id: e.target.value.replace(/\D/g, '') }))} placeholder="เช่น 123" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" />
              </div>
            ) : <div />}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-white/50">หัวข้อ</label>
            <input value={msgDraft.title} onChange={(e) => setMsgDraft((d) => ({ ...d, title: e.target.value }))} placeholder="หัวข้อข้อความ" className="h-8 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-xs text-white outline-none" maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-white/50">เนื้อหา (ไม่บังคับ)</label>
            <textarea value={msgDraft.body} onChange={(e) => setMsgDraft((d) => ({ ...d, body: e.target.value }))} placeholder="รายละเอียดเพิ่มเติม..." className="min-h-[60px] w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 py-1.5 text-xs text-white outline-none" maxLength={5000} />
          </div>
          {msgError ? <div className="text-xs text-red-300">{msgError}</div> : null}
          {msgSentOk ? <div className="text-xs text-emerald-300">{msgSentOk}</div> : null}
          <button type="button" disabled={msgSending} onClick={sendMessage} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50">
            {msgSending ? 'กำลังส่ง...' : 'ส่งข้อความ'}
          </button>
        </div>

        {/* ── Sent list ── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-white/80">ข้อความที่ส่งแล้ว</div>
            <div className="text-[11px] text-white/40">{messages.length} รายการ</div>
          </div>
          {messages.length === 0 ? (
            <div className="py-4 text-center text-xs text-white/30">ยังไม่มีข้อความ</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-700/30 bg-slate-950/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white">{m.title}</div>
                      {m.body ? <div className="mt-1 text-[11px] text-white/60 whitespace-pre-wrap">{m.body}</div> : null}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${m.target_type === 'global' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {m.target_type === 'global' ? 'ทุกคน' : `ID: ${m.target_user_id}`}
                      </span>
                      <button type="button" onClick={() => deleteMessage(m.id)} className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300 hover:bg-red-500/30">ลบ</button>
                    </div>
                  </div>
                  {m.target_type === 'individual' && m.target_email ? (
                    <div className="mt-0.5 text-[10px] text-white/40">{m.target_display_name || m.target_email}</div>
                  ) : null}
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] text-white/30">
                    <span>{new Date(m.created_at).toLocaleString('th-TH')}</span>
                    {m.sender_email ? <span>โดย {m.sender_email}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderAutomationModule(data) {
    const rules = Array.isArray(data?.rules) ? data.rules : []
    const events = Array.isArray(data?.events) ? data.events : []

    return (
      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="text-sm font-bold text-white">กฎ Workflow Automation</div>
          <div className="mt-2 grid gap-2">
            <div><FieldLabel>ชื่อกฎ</FieldLabel><input value={automationRuleForm.name} onChange={(e) => setAutomationRuleForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="ชื่อกฎ" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
            <select value={automationRuleForm.trigger_type} onChange={(e) => setAutomationRuleForm((prev) => ({ ...prev, trigger_type: e.target.value }))} className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none">
              <option value="support_unassigned_overdue">ซัพพอร์ตค้างมอบหมายเกินเวลา</option>
              <option value="farm_unassigned_overdue">ฟาร์มค้างมอบหมายเกินเวลา</option>
            </select>
            <div><FieldLabel>นาทีที่ใช้เป็นเกณฑ์</FieldLabel><input value={automationRuleForm.trigger_minutes} onChange={(e) => setAutomationRuleForm((prev) => ({ ...prev, trigger_minutes: e.target.value }))} placeholder="นาทีที่ใช้เป็นเกณฑ์" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none" /></div>
            <select value={automationRuleForm.action_severity} onChange={(e) => setAutomationRuleForm((prev) => ({ ...prev, action_severity: e.target.value }))} className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none">
              <option value="low">ต่ำ</option>
              <option value="medium">กลาง</option>
              <option value="high">สูง</option>
            </select>
            <label className="inline-flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={Boolean(automationRuleForm.is_active)} onChange={(e) => setAutomationRuleForm((prev) => ({ ...prev, is_active: e.target.checked }))} />เปิดใช้งาน</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={saveAutomationRule} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">{automationRuleForm.id ? 'อัปเดตกฎ' : 'สร้างกฎ'}</button>
              <button type="button" onClick={() => setAutomationRuleForm(DEFAULT_AUTOMATION_RULE_FORM)} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">รีเซ็ต</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={runWorkflowAutomation} className="h-9 rounded-lg border border-amber-400/35 bg-amber-500/15 px-3 text-xs text-amber-100">รันกฎตอนนี้</button>
              <button type="button" onClick={() => loadModule('automation')} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">รีโหลด</button>
            </div>
            {automationError ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{automationError}</div> : null}
            {automationActionState.status !== 'idle' ? (
              <div className={`rounded-lg border px-3 py-2 text-xs ${automationActionState.status === 'error' ? 'border-red-400/30 bg-red-500/10 text-red-100' : automationActionState.status === 'success' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>
                {automationActionState.message}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="text-sm font-bold text-white">รายการกฎ</div>
              <div className="mt-2 max-h-[320px] space-y-2 overflow-auto pr-1">
                {rules.map((row) => {
                  const triggerConfig = row?.trigger_config && typeof row.trigger_config === 'object' ? row.trigger_config : {}
                  const actionConfig = row?.action_config && typeof row.action_config === 'object' ? row.action_config : {}
                  return (
                    <div key={row.id} className="rounded-lg border border-slate-700/50 bg-slate-950/45 p-2 text-xs text-white/80">
                      <div className="font-semibold text-white">#{row.id} {row.name || '-'}</div>
                      <div className="mt-1">เงื่อนไข: {row.trigger_type} • {formatNumber(triggerConfig.minutes || 0)}m</div>
                      <div>การกระทำ: {row.action_type} • ระดับ {actionConfig.severity || 'medium'}</div>
                      <div>สถานะ: {row.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} • รันล่าสุด: {formatDateTime(row.last_run_at)}</div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => editAutomationRule(row)} className="rounded bg-slate-800 px-2 py-1 text-[11px] text-white">แก้ไข</button>
                        <button type="button" onClick={() => removeAutomationRule(row.id)} className="rounded bg-red-500/20 px-2 py-1 text-[11px] text-red-100">ลบ</button>
                      </div>
                    </div>
                  )
                })}
                {rules.length === 0 ? <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2 text-xs text-white/60">ยังไม่มีกฎ</div> : null}
              </div>
            </div>

            <div>
              <div className="text-sm font-bold text-white">เหตุการณ์ล่าสุด</div>
              <div className="mt-2 max-h-[320px] space-y-2 overflow-auto pr-1">
                {events.map((row) => {
                  const severity = String(row?.severity || '').toLowerCase()
                  const tone = severity === 'high' ? 'border-red-400/30 bg-red-500/10' : severity === 'low' ? 'border-cyan-400/30 bg-cyan-500/10' : 'border-amber-400/30 bg-amber-500/10'
                  return (
                    <div key={row.id} className={`rounded-lg border p-2 text-xs ${tone}`}>
                      <div className="font-semibold text-white">{row.title || '-'}</div>
                      <div className="mt-0.5 text-white/70">{row.message || '-'}</div>
                      <div className="mt-1 text-[11px] text-white/60">{row.ref_module || '-'}#{row.ref_id || '-'} • {formatDateTime(row.created_at)}</div>
                    </div>
                  )
                })}
                {events.length === 0 ? <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2 text-xs text-white/60">ยังไม่มีเหตุการณ์</div> : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  function renderPromotionsModule(data) {
    const coupons = Array.isArray(data?.coupons) ? data.coupons : []
    const promotions = Array.isArray(data?.promotions) ? data.promotions : []
    const discountCoupons = Array.isArray(data?.discountCoupons) ? data.discountCoupons : []
    const products = Array.isArray(data?.products) ? data.products : []
    const nowMs = Date.now()
    const scope = String(promotionsScope || 'all')
    const normalizedSearch = String(promotionsSearch || '').trim().toLowerCase()

    const productNameById = new Map(
      products.map((row) => {
        const id = Number(row?.id)
        const name = String(row?.name || row?.slug || '').trim()
        return [id, Number.isFinite(id) && id > 0 ? `#${id} ${name || '-'}` : '-']
      }),
    )

    const promotionRows = promotions.map((row) => {
      const pid = Number(row?.product_id)
      return {
        ...row,
        _status: getPromotionStatusMeta(row, nowMs),
        _product_name: productNameById.get(pid) || (Number.isFinite(pid) && pid > 0 ? `#${pid}` : '-'),
      }
    })
    const couponRows = coupons.map((row) => ({ ...row, _status: getCouponStatusMeta(row, nowMs) }))
    const discountCouponRows = discountCoupons.map((row) => ({ ...row, _status: getCouponStatusMeta(row, nowMs) }))

    const summary = {
      promotionActive: promotionRows.filter((row) => row._status.key === 'active').length,
      promotionScheduled: promotionRows.filter((row) => row._status.key === 'scheduled').length,
      promotionExpired: promotionRows.filter((row) => row._status.key === 'expired').length,
      pointCouponActive: couponRows.filter((row) => row._status.key === 'active').length,
      discountCouponActive: discountCouponRows.filter((row) => row._status.key === 'active').length,
    }

    const statusOptions =
      scope === 'product_promotion'
        ? [
            { value: 'all', label: 'ทุกสถานะ' },
            { value: 'active', label: 'กำลังใช้งาน' },
            { value: 'scheduled', label: 'รอเริ่ม' },
            { value: 'expired', label: 'หมดอายุ' },
            { value: 'inactive', label: 'ปิดใช้งาน' },
          ]
        : scope === 'point_coupon' || scope === 'discount_coupon'
          ? [
              { value: 'all', label: 'ทุกสถานะ' },
              { value: 'active', label: 'พร้อมใช้' },
              { value: 'exhausted', label: 'ใช้ครบแล้ว' },
              { value: 'expired', label: 'หมดอายุ' },
              { value: 'inactive', label: 'ปิดใช้งาน' },
            ]
          : [
              { value: 'all', label: 'ทุกสถานะ' },
              { value: 'active', label: 'กำลังใช้งาน/พร้อมใช้' },
              { value: 'expired', label: 'หมดอายุ' },
              { value: 'inactive', label: 'ปิดใช้งาน' },
            ]

    function matchSearch(values) {
      if (!normalizedSearch) return true
      return values.some((value) => String(value || '').toLowerCase().includes(normalizedSearch))
    }

    function matchStatus(statusKey) {
      return promotionsStatusFilter === 'all' || String(statusKey || '') === promotionsStatusFilter
    }

    const filteredPromotions = promotionRows.filter((row) => {
      return (
        matchStatus(row._status.key) &&
        matchSearch([row.id, row.title, row._product_name, row.product_id, formatDiscountSummary(row)])
      )
    })

    const filteredCoupons = couponRows.filter((row) => {
      return (
        matchStatus(row._status.key) &&
        matchSearch([row.id, row.code, row.points, row.used_count, row.max_uses])
      )
    })

    const filteredDiscountCoupons = discountCouponRows.filter((row) => {
      return (
        matchStatus(row._status.key) &&
        matchSearch([row.id, row.code, row.title, row.used_count, row.max_uses, formatDiscountSummary(row)])
      )
    })

    const showPointCoupons = scope === 'all' || scope === 'point_coupon'
    const showProductPromotions = scope === 'all' || scope === 'product_promotion'
    const showDiscountCoupons = scope === 'all' || scope === 'discount_coupon'
    const visibleSectionCount = [showPointCoupons, showProductPromotions, showDiscountCoupons].filter(Boolean).length
    const sectionGridClass = visibleSectionCount >= 3 ? 'xl:grid-cols-3' : visibleSectionCount === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-1'

    return (
      <div className="mt-4 space-y-4">
        {promotionsActionState.status !== 'idle' ? (
          <div className={`rounded-xl border px-3 py-2 text-xs ${promotionsActionState.status === 'error' ? 'border-red-400/35 bg-red-500/15 text-red-100' : promotionsActionState.status === 'success' ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-amber-400/35 bg-amber-500/15 text-amber-100'}`}>
            {promotionsActionState.message}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DataCard title="โปรโมชันที่ใช้งาน" value={formatNumber(summary.promotionActive)} tone="text-emerald-200" />
          <DataCard title="โปรโมชันรอเริ่ม" value={formatNumber(summary.promotionScheduled)} tone="text-cyan-200" />
          <DataCard title="โปรโมชันหมดอายุ" value={formatNumber(summary.promotionExpired)} tone="text-red-200" />
          <DataCard title="คูปองแต้มพร้อมใช้" value={formatNumber(summary.pointCouponActive)} tone="text-amber-200" />
          <DataCard title="คูปองส่วนลดพร้อมใช้" value={formatNumber(summary.discountCouponActive)} tone="text-amber-200" />
        </div>

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="grid gap-2 lg:grid-cols-[auto_1fr_auto_auto] lg:items-center">
            <div className="inline-flex rounded-lg border border-slate-700/70 bg-slate-950/60 p-1">
              {[
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'product_promotion', label: 'โปรโมชันสินค้า' },
                { id: 'discount_coupon', label: 'คูปองส่วนลด' },
                { id: 'point_coupon', label: 'คูปองแต้ม' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPromotionsScope(tab.id)
                    setPromotionsStatusFilter('all')
                  }}
                  className={`h-8 rounded-md px-3 text-xs font-semibold transition ${
                    scope === tab.id ? 'bg-cyan-500/70 text-white' : 'text-white/65 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <input
              value={promotionsSearch}
              onChange={(e) => setPromotionsSearch(e.target.value)}
              placeholder="ค้นหาโค้ด / ชื่อโปรโมชัน / สินค้า / ID"
              className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            />

            <select
              value={promotionsStatusFilter}
              onChange={(e) => setPromotionsStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => loadModule('promotions')}
              className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white"
            >
              รีโหลด
            </button>
          </div>
        </section>

        <div className={`grid gap-4 ${sectionGridClass}`}>
          {showPointCoupons ? (
            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="text-sm font-bold text-white">คูปองเติมแต้ม</div>
              <div className="mt-2 grid gap-2">
                {!couponForm.id ? (
                  <div>
                    <FieldLabel>โค้ดคูปอง</FieldLabel>
                    <input
                      value={couponForm.code}
                      onChange={(e) => setCouponForm((prev) => ({ ...prev, code: e.target.value }))}
                      placeholder="โค้ดคูปอง"
                      className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-xs text-white/70">
                    กำลังแก้ไข: <span className="font-semibold text-white">{couponForm.code}</span>
                  </div>
                )}
                <div>
                  <FieldLabel>จำนวนแต้ม</FieldLabel>
                  <input
                    value={couponForm.points}
                    onChange={(e) => setCouponForm((prev) => ({ ...prev, points: e.target.value }))}
                    placeholder="จำนวนแต้ม"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <FieldLabel>จำนวนใช้สูงสุด</FieldLabel>
                  <input
                    value={couponForm.max_uses}
                    onChange={(e) => setCouponForm((prev) => ({ ...prev, max_uses: e.target.value }))}
                    placeholder="จำนวนใช้สูงสุด"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <FieldLabel>จำนวนที่ใช้แล้ว</FieldLabel>
                  <input
                    value={couponForm.used_count}
                    onChange={(e) => setCouponForm((prev) => ({ ...prev, used_count: e.target.value }))}
                    placeholder="จำนวนที่ใช้แล้ว"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <input
                  type="datetime-local"
                  step="1"
                  value={couponForm.expires_at}
                  onChange={(e) => setCouponForm((prev) => ({ ...prev, expires_at: e.target.value }))}
                  className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                />
                <label className="inline-flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={Boolean(couponForm.is_active)}
                    onChange={(e) => setCouponForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  เปิดใช้งาน
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={saveCoupon} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">
                    {couponForm.id ? 'อัปเดต' : 'สร้าง'}
                  </button>
                  <button type="button" onClick={() => setCouponForm(DEFAULT_COUPON_FORM)} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">
                    รีเซ็ต
                  </button>
                </div>
                {promotionsErrors.coupon ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{promotionsErrors.coupon}</div> : null}
              </div>
            </section>
          ) : null}

          {showProductPromotions ? (
            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="text-sm font-bold text-white">โปรโมชันสินค้า</div>
              <div className="mt-2 grid gap-2">
                <select
                  value={promotionForm.product_id}
                  onChange={(e) => setPromotionForm((prev) => ({ ...prev, product_id: e.target.value }))}
                  className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                >
                  <option value="">เลือกสินค้า</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.id} {p.name || p.slug}
                    </option>
                  ))}
                </select>
                <div>
                  <FieldLabel>ชื่อโปรโมชัน</FieldLabel>
                  <input
                    value={promotionForm.title}
                    onChange={(e) => setPromotionForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="ชื่อโปรโมชัน"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <FieldLabel>ส่วนลด (%)</FieldLabel>
                  <input
                    value={promotionForm.discount_percent}
                    onChange={(e) => {
                      const value = e.target.value
                      setPromotionForm((prev) => ({
                        ...prev,
                        discount_percent: value,
                        discount_amount_points: value ? '' : prev.discount_amount_points,
                      }))
                    }}
                    placeholder="ส่วนลด (%)"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <FieldLabel>ส่วนลด (แต้ม)</FieldLabel>
                  <input
                    value={promotionForm.discount_amount_points}
                    onChange={(e) => {
                      const value = e.target.value
                      setPromotionForm((prev) => ({
                        ...prev,
                        discount_amount_points: value,
                        discount_percent: value ? '' : prev.discount_percent,
                      }))
                    }}
                    placeholder="ส่วนลด (แต้ม)"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div className="text-[11px] text-white/50">เลือกส่วนลดได้อย่างใดอย่างหนึ่ง (เปอร์เซ็นต์ หรือ แต้ม)</div>
                <input
                  type="datetime-local"
                  step="1"
                  value={promotionForm.starts_at}
                  onChange={(e) => setPromotionForm((prev) => ({ ...prev, starts_at: e.target.value }))}
                  className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                />
                <input
                  type="datetime-local"
                  step="1"
                  value={promotionForm.ends_at}
                  onChange={(e) => setPromotionForm((prev) => ({ ...prev, ends_at: e.target.value }))}
                  className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                />
                <label className="inline-flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={Boolean(promotionForm.is_active)}
                    onChange={(e) => setPromotionForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  เปิดใช้งาน
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={savePromotion} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">
                    {promotionForm.id ? 'อัปเดต' : 'สร้าง'}
                  </button>
                  <button type="button" onClick={() => setPromotionForm(DEFAULT_PROMOTION_FORM)} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">
                    รีเซ็ต
                  </button>
                </div>
                {promotionsErrors.promotion ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{promotionsErrors.promotion}</div> : null}
              </div>
            </section>
          ) : null}

          {showDiscountCoupons ? (
            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="text-sm font-bold text-white">คูปองส่วนลดหน้าเช็กเอาต์</div>
              <div className="mt-2 grid gap-2">
                {!discountCouponForm.id ? (
                  <div>
                    <FieldLabel>โค้ด</FieldLabel>
                    <input
                      value={discountCouponForm.code}
                      onChange={(e) =>
                        setDiscountCouponForm((prev) => ({
                          ...prev,
                          code: String(e.target.value || '').toUpperCase(),
                        }))
                      }
                      placeholder="โค้ด"
                      className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                    />
                  </div>
                ) : null}
                <div>
                  <FieldLabel>ชื่อคูปอง</FieldLabel>
                  <input
                    value={discountCouponForm.title}
                    onChange={(e) => setDiscountCouponForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="ชื่อคูปอง"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <FieldLabel>ส่วนลด (%)</FieldLabel>
                  <input
                    value={discountCouponForm.discount_percent}
                    onChange={(e) => {
                      const value = e.target.value
                      setDiscountCouponForm((prev) => ({
                        ...prev,
                        discount_percent: value,
                        discount_amount_points: value ? '' : prev.discount_amount_points,
                      }))
                    }}
                    placeholder="ส่วนลด (%)"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <FieldLabel>ส่วนลด (แต้ม)</FieldLabel>
                  <input
                    value={discountCouponForm.discount_amount_points}
                    onChange={(e) => {
                      const value = e.target.value
                      setDiscountCouponForm((prev) => ({
                        ...prev,
                        discount_amount_points: value,
                        discount_percent: value ? '' : prev.discount_percent,
                      }))
                    }}
                    placeholder="ส่วนลด (แต้ม)"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div className="text-[11px] text-white/50">เลือกส่วนลดได้อย่างใดอย่างหนึ่ง (เปอร์เซ็นต์ หรือ แต้ม)</div>
                <div>
                  <FieldLabel>จำนวนใช้สูงสุด</FieldLabel>
                  <input
                    value={discountCouponForm.max_uses}
                    onChange={(e) => setDiscountCouponForm((prev) => ({ ...prev, max_uses: e.target.value }))}
                    placeholder="จำนวนใช้สูงสุด"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <FieldLabel>จำนวนที่ใช้แล้ว</FieldLabel>
                  <input
                    value={discountCouponForm.used_count}
                    onChange={(e) => setDiscountCouponForm((prev) => ({ ...prev, used_count: e.target.value }))}
                    placeholder="จำนวนที่ใช้แล้ว"
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                </div>
                <input
                  type="datetime-local"
                  step="1"
                  value={discountCouponForm.expires_at}
                  onChange={(e) => setDiscountCouponForm((prev) => ({ ...prev, expires_at: e.target.value }))}
                  className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                />
                <label className="inline-flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={Boolean(discountCouponForm.is_active)}
                    onChange={(e) => setDiscountCouponForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  เปิดใช้งาน
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={saveDiscountCoupon} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500">
                    {discountCouponForm.id ? 'อัปเดต' : 'สร้าง'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountCouponForm(DEFAULT_DISCOUNT_COUPON_FORM)}
                    className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white"
                  >
                    รีเซ็ต
                  </button>
                </div>
                {promotionsErrors.discount ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{promotionsErrors.discount}</div> : null}
              </div>
            </section>
          ) : null}
        </div>

        <div className={`grid gap-4 ${sectionGridClass}`}>
          {showPointCoupons ? (
            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="mb-2 text-sm font-bold text-white">รายการคูปองแต้ม ({filteredCoupons.length})</div>
              <div className="max-h-[300px] space-y-2 overflow-auto pr-1">
                {filteredCoupons.map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-white">{row.code}</div>
                      <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${row._status.tone}`}>{row._status.label}</div>
                    </div>
                    <div className="mt-1 text-white/55">แต้ม: {formatNumber(row.points)} | ใช้แล้ว: {formatNumber(row.used_count)} / {row.max_uses == null ? '∞' : formatNumber(row.max_uses)}</div>
                    <div className="text-white/45">หมดอายุ: {formatDateTime(row.expires_at)}</div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCouponForm({
                            id: row.id,
                            code: row.code || '',
                            points: row.points ?? 0,
                            max_uses: row.max_uses ?? '',
                            used_count: row.used_count ?? 0,
                            expires_at: isoToLocalInput(row.expires_at),
                            is_active: Boolean(row.is_active),
                          })
                        }
                        className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white"
                      >
                        แก้ไข
                      </button>
                      <button type="button" onClick={() => removeCoupon(row.id)} className="rounded-lg bg-red-500/20 px-2 py-1 text-[11px] text-red-100">
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
                {filteredCoupons.length < 1 ? <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2 text-xs text-white/60">ไม่พบคูปองตามเงื่อนไขที่เลือก</div> : null}
              </div>
            </section>
          ) : null}

          {showProductPromotions ? (
            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="mb-2 text-sm font-bold text-white">รายการโปรโมชัน ({filteredPromotions.length})</div>
              <div className="max-h-[300px] space-y-2 overflow-auto pr-1">
                {filteredPromotions.map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-white">{row.title || row._product_name}</div>
                      <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${row._status.tone}`}>{row._status.label}</div>
                    </div>
                    <div className="mt-1 text-white/55">สินค้า: {row._product_name}</div>
                    <div className="text-white/55">ส่วนลด: {formatDiscountSummary(row)}</div>
                    <div className="text-white/45">{formatDateTime(row.starts_at)} - {formatDateTime(row.ends_at)}</div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPromotionForm({
                            id: row.id,
                            product_id: String(row.product_id || ''),
                            title: row.title || '',
                            discount_percent: row.discount_percent ?? '',
                            discount_amount_points: row.discount_amount_points ?? '',
                            starts_at: isoToLocalInput(row.starts_at),
                            ends_at: isoToLocalInput(row.ends_at),
                            is_active: Boolean(row.is_active),
                          })
                        }
                        className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white"
                      >
                        แก้ไข
                      </button>
                      <button type="button" onClick={() => removePromotion(row.id)} className="rounded-lg bg-red-500/20 px-2 py-1 text-[11px] text-red-100">
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
                {filteredPromotions.length < 1 ? <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2 text-xs text-white/60">ไม่พบโปรโมชันตามเงื่อนไขที่เลือก</div> : null}
              </div>
            </section>
          ) : null}

          {showDiscountCoupons ? (
            <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
              <div className="mb-2 text-sm font-bold text-white">รายการคูปองส่วนลด ({filteredDiscountCoupons.length})</div>
              <div className="max-h-[300px] space-y-2 overflow-auto pr-1">
                {filteredDiscountCoupons.map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-white">{row.code}</div>
                      <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${row._status.tone}`}>{row._status.label}</div>
                    </div>
                    <div className="mt-1 text-white/55">{row.title || '-'}</div>
                    <div className="text-white/55">ส่วนลด: {formatDiscountSummary(row)}</div>
                    <div className="text-white/45">ใช้แล้ว: {formatNumber(row.used_count)} / {row.max_uses == null ? '∞' : formatNumber(row.max_uses)}</div>
                    <div className="text-white/45">หมดอายุ: {formatDateTime(row.expires_at)}</div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDiscountCouponForm({
                            id: row.id,
                            code: row.code || '',
                            title: row.title || '',
                            discount_percent: row.discount_percent ?? '',
                            discount_amount_points: row.discount_amount_points ?? '',
                            max_uses: row.max_uses ?? '',
                            used_count: row.used_count ?? 0,
                            expires_at: isoToLocalInput(row.expires_at),
                            is_active: Boolean(row.is_active),
                          })
                        }
                        className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white"
                      >
                        แก้ไข
                      </button>
                      <button type="button" onClick={() => removeDiscountCoupon(row.id)} className="rounded-lg bg-red-500/20 px-2 py-1 text-[11px] text-red-100">
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
                {filteredDiscountCoupons.length < 1 ? <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2 text-xs text-white/60">ไม่พบคูปองส่วนลดตามเงื่อนไขที่เลือก</div> : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    )
  }

  function renderDashboard(data) {
    const notifications = Array.isArray(data?.notifications) ? data.notifications : []

    function jumpToNotification(ref) {
      const moduleId = String(ref?.module || '').trim().toLowerCase()
      const entityId = Number(ref?.id)
      if (!moduleId) return
      if (moduleId === 'support') {
        selectModule('support')
        if (Number.isFinite(entityId) && entityId > 0) void openSupportTicket(entityId)
        return
      }
      if (moduleId === 'fulfillment') {
        selectModule('fulfillment')
        if (Number.isFinite(entityId) && entityId > 0) setAssignForm({ id: entityId, booster_id: '' })
      }
    }

    return (
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DataCard title="ผู้ใช้ทั้งหมด" value={formatNumber(data?.totalUsers)} />
          <DataCard title="ทิกเก็ตที่เปิดอยู่" value={formatNumber(data?.openTickets)} tone="text-amber-200" subtitle={`รอดำเนินการ ${formatNumber(data?.supportPending)} • ยังไม่มอบหมาย ${formatNumber(data?.supportUnassigned)}`} />
          <DataCard title="บริการงานจ้างค้าง" value={formatNumber(data?.pendingFulfillment)} tone="text-cyan-200" subtitle={`กำลังดำเนินการ ${formatNumber(data?.farmInProgress)} • ยังไม่มอบหมาย ${formatNumber(data?.farmUnassigned)}`} />
          <DataCard title="รายได้ (แต้ม)" value={formatNumber(data?.totalRevenuePoints)} tone="text-emerald-200" subtitle={data?.generatedAt ? `อัปเดต ${formatDateTime(data.generatedAt)}` : ''} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
          <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
            <div className="text-sm font-bold text-white">แดชบอร์ด SLA</div>
            <div className="mt-2 grid gap-2 text-xs text-white/80">
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2">เวลาเฉลี่ยตอบกลับแรก (ซัพพอร์ต): <span className="font-semibold text-cyan-200">{formatMinutes(data?.supportFirstResponseAvgMinutes)}</span></div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2">เวลาเฉลี่ยปิดงาน (ซัพพอร์ต): <span className="font-semibold text-cyan-200">{formatMinutes(data?.supportResolutionAvgMinutes)}</span></div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2">เวลาเฉลี่ยมอบหมาย (ฟาร์ม): <span className="font-semibold text-cyan-200">{formatMinutes(data?.farmAssignAvgMinutes)}</span></div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2">เวลาเฉลี่ยส่งมอบ (ฟาร์ม): <span className="font-semibold text-cyan-200">{formatMinutes(data?.farmFulfillAvgMinutes)}</span></div>
              <div className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-amber-100">เกิน SLA • ซัพพอร์ต: {formatNumber(data?.supportOverSla)} • ฟาร์ม: {formatNumber(data?.farmOverSla)}</div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-white">ศูนย์การแจ้งเตือน</div>
              <button type="button" onClick={() => loadModule('dashboard')} className="h-8 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white">รีเฟรช</button>
            </div>

            <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
              {notifications.map((row, idx) => {
                const severity = String(row?.severity || '').toLowerCase()
                const tone = severity === 'high' ? 'border-red-400/30 bg-red-500/10' : 'border-amber-400/30 bg-amber-500/10'
                return (
                  <button
                    key={`${row?.kind || 'n'}-${row?.ref?.module || 'm'}-${row?.ref?.id || idx}`}
                    type="button"
                    onClick={() => jumpToNotification(row?.ref)}
                    className={`w-full rounded-lg border p-3 text-left text-xs transition hover:opacity-95 ${tone}`}
                  >
                    <div className="font-semibold text-white">{row?.title || '-'}</div>
                    <div className="mt-0.5 text-white/75">{row?.subtitle || '-'}</div>
                    <div className="mt-1 text-[11px] text-white/55">{formatDateTime(row?.created_at)}</div>
                  </button>
                )
              })}
              {notifications.length === 0 ? <div className="rounded-lg border border-slate-700/50 bg-slate-950/45 px-3 py-2 text-xs text-white/55">ไม่มีการแจ้งเตือนที่เปิดใช้งาน</div> : null}
            </div>
          </section>
        </div>
      </div>
    )
  }

  function renderSupportModule(data) {
    const tickets = Array.isArray(data?.tickets) ? data.tickets : []
    const total = pickNumber(data?.total || tickets.length)
    const summary = data?.summary && typeof data.summary === 'object'
      ? {
          open: pickNumber(data.summary.open),
          pending: pickNumber(data.summary.pending),
          closed: pickNumber(data.summary.closed),
          unassigned: pickNumber(data.summary.unassigned),
          mine: pickNumber(data.summary.mine),
          needs_reply: pickNumber(data.summary.needs_reply),
          over_sla: pickNumber(data.summary.over_sla),
        }
      : { open: 0, pending: 0, closed: 0, unassigned: 0, mine: 0, needs_reply: 0, over_sla: 0 }
    const agents = Array.isArray(data?.agents) ? data.agents : []
    const selectedId = Number(data?.selectedTicketId)
    const selectedTicket = data?.selectedTicket || null
    const messages = Array.isArray(data?.messages) ? data.messages : []
    const nowMs = Date.now()
    const supportScope = String(supportQuery.scope || 'all')
    const statusMeta = getSupportStatusMeta(selectedTicket?.status)
    const waitingMeta = selectedTicket ? getSupportWaitingMeta(selectedTicket, nowMs) : null
    const selectedAssignedToId = Number(selectedTicket?.assigned_to)
    const selectedAssignedText = Number.isFinite(selectedAssignedToId) && selectedAssignedToId > 0
      ? `ผู้รับเคส: ${selectedTicket?.assigned_email || `#${selectedAssignedToId}`}`
      : 'ผู้รับเคส: ยังไม่มอบหมาย'
    const isClosed = String(selectedTicket?.status || '').trim().toLowerCase() === 'closed'
    const replyTextLength = String(supportDraft.reply || '').length
    const canSendReply = !isClosed && (String(supportDraft.reply || '').trim() || supportReplyAttachments.length > 0)
    const isWorking = supportActionState.status === 'working'

    return (
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <DataCard title="เปิดอยู่" value={formatNumber(summary.open)} tone="text-emerald-200" subtitle={`${formatNumber(total)} ทิกเก็ตทั้งหมด`} />
          <DataCard title="รอดำเนินการ" value={formatNumber(summary.pending)} tone="text-amber-200" subtitle="กำลังรอการจัดการ" />
          <DataCard title="รอซัพพอร์ตตอบ" value={formatNumber(summary.needs_reply)} tone="text-cyan-200" subtitle="ข้อความล่าสุดจากลูกค้า" />
          <DataCard title="ยังไม่มอบหมาย" value={formatNumber(summary.unassigned)} tone="text-white" subtitle="ยังไม่มีผู้รับผิดชอบ" />
          <DataCard title="เคสของฉัน" value={formatNumber(summary.mine)} tone="text-fuchsia-200" subtitle="งานที่รับผิดชอบตอนนี้" />
          <DataCard title="เลย SLA" value={formatNumber(summary.over_sla)} tone="text-red-200" subtitle="รอครั้งแรกเกิน 30 นาที" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
          <section>
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/55 p-3">
              <div className="inline-flex w-full rounded-lg border border-slate-700/70 bg-slate-950/60 p-1">
                {[
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'mine', label: 'ของฉัน' },
                  { id: 'needs_reply', label: 'รอตอบ' },
                  { id: 'unassigned', label: 'ยังไม่มอบหมาย' },
                  { id: 'closed', label: 'ปิดแล้ว' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patchSupportQuery({ scope: opt.id })}
                    className={`h-8 flex-1 rounded-md px-2 text-[11px] font-semibold transition ${
                      supportScope === opt.id ? 'bg-cyan-500/70 text-white' : 'text-white/65 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr]">
                <select
                  value={supportQuery.status}
                  onChange={(e) => patchSupportQuery({ status: e.target.value })}
                  className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                >
                  <option value="">ทุกสถานะ</option>
                  <option value="open">เปิด</option>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="closed">ปิดแล้ว</option>
                </select>

                <select
                  value={supportQuery.assignedTo}
                  onChange={(e) => patchSupportQuery({ assignedTo: e.target.value })}
                  className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                >
                  <option value="">การมอบหมายทั้งหมด</option>
                  <option value="me">มอบหมายให้ฉัน</option>
                  <option value="unassigned">ยังไม่มอบหมาย</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>#{agent.id} {agent.display_name || agent.email}</option>
                  ))}
                </select>
              </div>

              <div className="mt-2">
                <FieldLabel>ค้นหาทิกเก็ต</FieldLabel>
                <div className="flex gap-2">
                  <input
                    value={supportSearchDraft}
                    onChange={(e) => setSupportSearchDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        supportApplySearch()
                      }
                    }}
                    placeholder="ค้นหา: ทิกเก็ต/อีเมล/หัวข้อ"
                    className="h-10 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={supportApplySearch}
                    className="h-10 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white hover:bg-cyan-500"
                  >
                    ค้นหา
                  </button>
                  <button
                    type="button"
                    onClick={supportResetFilters}
                    className="h-10 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white"
                  >
                    รีเซ็ต
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 max-h-[640px] space-y-2 overflow-auto pr-1">
              {tickets.map((ticket) => {
                const isActive = Number(ticket?.id) === selectedId
                const rowStatus = getSupportStatusMeta(ticket?.status)
                const waiting = getSupportWaitingMeta(ticket, nowMs)
                const preview = String(ticket?.last_message_preview || '').trim()
                const rowAssignedToId = Number(ticket?.assigned_to)
                const rowAssignedText = Number.isFinite(rowAssignedToId) && rowAssignedToId > 0
                  ? `รับเคสโดย ${ticket?.assigned_email || `#${rowAssignedToId}`}`
                  : 'ยังไม่มอบหมาย'
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => openSupportTicket(ticket.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${isActive ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-slate-700/50 bg-slate-900/45 hover:bg-slate-900/70'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-white">#{ticket.id} {ticket.subject || 'ไม่มีหัวข้อ'}</div>
                      <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${rowStatus.tone}`}>{rowStatus.label}</div>
                    </div>
                    <div className="mt-1 text-[11px] text-white/60">{ticket.user_email || ticket.user_id || '-'}</div>
                    <div className={`mt-1 text-[10px] ${Number.isFinite(rowAssignedToId) && rowAssignedToId > 0 ? 'text-cyan-200' : 'text-white/45'}`}>{rowAssignedText}</div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-white/55">{preview || '-'}</div>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className={waiting.tone}>{waiting.label}</span>
                      <span className="text-white/45">{formatRelativeTime(ticket.last_sender_at || ticket.last_message_at || ticket.created_at, nowMs)} ago</span>
                    </div>
                  </button>
                )
              })}
              {tickets.length === 0 ? <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 text-xs text-white/55">ไม่พบทิกเก็ตตามเงื่อนไขที่เลือก</div> : null}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
            {!selectedTicket ? <div className="text-xs text-white/55">เลือกทิกเก็ตจากแถบด้านซ้าย</div> : null}

            {selectedTicket ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-white">#{selectedTicket.id} {selectedTicket.subject || 'ไม่มีหัวข้อ'}</div>
                    <div className="mt-1 text-xs text-white/60">ลูกค้า: {selectedTicket.user_email || selectedTicket.user_id || '-'}</div>
                    <div className={`mt-1 text-xs ${Number.isFinite(selectedAssignedToId) && selectedAssignedToId > 0 ? 'text-cyan-200' : 'text-white/50'}`}>{selectedAssignedText}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 ${statusMeta.tone}`}>{statusMeta.label}</span>
                      {waitingMeta ? <span className={waitingMeta.tone}>{waitingMeta.label}</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedTicket?.assigned_to == null && !isClosed ? (
                      <button
                        type="button"
                        onClick={supportClaimTicket}
                        disabled={isWorking}
                        className="h-9 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
                      >
                        รับเคสนี้
                      </button>
                    ) : null}
                    {selectedTicket.assigned_to != null ? (
                      <button
                        type="button"
                        onClick={() => supportApplyAssign(null)}
                        disabled={isWorking}
                        className="h-9 rounded-lg border border-slate-600/70 bg-slate-800/60 px-3 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        เอามอบหมายออก
                      </button>
                    ) : null}
                    {isClosed ? (
                      <button
                        type="button"
                        onClick={() => supportApplyStatus('open')}
                        disabled={isWorking}
                        className="h-9 rounded-lg border border-emerald-400/45 bg-emerald-500/15 px-3 text-xs text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
                      >
                        เปิดเคสใหม่
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => supportApplyStatus('closed')}
                        disabled={isWorking}
                        className="h-9 rounded-lg border border-red-400/45 bg-red-500/15 px-3 text-xs text-red-100 hover:bg-red-500/30 disabled:opacity-50"
                      >
                        ปิดเคส
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto]">
                  <select
                    value={supportDraft.status}
                    onChange={(e) => setSupportDraft((prev) => ({ ...prev, status: e.target.value }))}
                    className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/65 px-3 text-xs text-white outline-none"
                  >
                    <option value="open">เปิด</option>
                    <option value="pending">รอดำเนินการ</option>
                    <option value="closed">ปิดแล้ว</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => supportApplyStatus()}
                    disabled={isWorking}
                    className="h-9 rounded-lg border border-slate-600/70 bg-slate-800/60 px-3 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    ตั้งค่าสถานะ
                  </button>
                  <select
                    value={supportDraft.assignTo}
                    onChange={(e) => setSupportDraft((prev) => ({ ...prev, assignTo: e.target.value }))}
                    className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/65 px-3 text-xs text-white outline-none"
                  >
                    <option value="">ยังไม่มอบหมาย</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>#{agent.id} {agent.display_name || agent.email}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => supportApplyAssign()}
                    disabled={isWorking}
                    className="h-9 rounded-lg border border-slate-600/70 bg-slate-800/60 px-3 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    มอบหมาย
                  </button>
                </div>

                <div className="mt-3 grid gap-2 rounded-xl border border-slate-700/45 bg-slate-950/40 p-3 text-[11px] text-white/60 md:grid-cols-2 xl:grid-cols-4">
                  <div>สร้างเมื่อ: <span className="text-white/80">{formatDateTime(selectedTicket.created_at)}</span></div>
                  <div>อัปเดตล่าสุด: <span className="text-white/80">{formatDateTime(selectedTicket.last_message_at || selectedTicket.updated_at)}</span></div>
                  <div>ตอบครั้งแรก: <span className="text-white/80">{formatDateTime(selectedTicket.first_response_at)}</span></div>
                  <div>ปิดเมื่อ: <span className="text-white/80">{formatDateTime(selectedTicket.resolved_at)}</span></div>
                </div>

                {supportActionState.status !== 'idle' ? (
                  <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${supportActionState.status === 'error' ? 'border-red-400/35 bg-red-500/15 text-red-100' : supportActionState.status === 'success' ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-amber-400/35 bg-amber-500/15 text-amber-100'}`}>
                    {supportActionState.message}
                  </div>
                ) : null}

                <div ref={adminChatScrollRef} id="admin-chat-container" className="mt-3 max-h-[440px] space-y-3 overflow-auto rounded-xl border border-slate-700/45 bg-slate-950/45 p-3">
                  {messages.map((message) => {
                    const senderRole = String(message?.sender_role || '').toLowerCase()
                    const isUser = senderRole === 'user'
                    const attachments = normalizeSupportAttachments(message?.attachments)
                    return (
                      <div key={message.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[85%] rounded-lg border p-3 ${isUser ? 'border-slate-700/60 bg-slate-900/60' : 'border-cyan-500/25 bg-cyan-500/10'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold text-white">
                              {isUser ? (message.sender_display_name || message.sender_email || 'ผู้ใช้') : (message.sender_display_name || message.sender_email || 'ซัพพอร์ต')}
                            </div>
                            <div className="text-[10px] text-white/45">{formatDateTime(message.created_at)}</div>
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-xs text-white/80">{message.message || '-'}</div>
                          {attachments.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {attachments.map((attachment, index) => (
                                attachment.isImage ? (
                                  <button
                                    key={`${message.id}-${index}`}
                                    type="button"
                                    onClick={() => openSupportPreview(attachment.data)}
                                    className="rounded-lg border border-white/15 bg-slate-900/50 p-1 transition hover:scale-[1.02] hover:opacity-95"
                                  >
                                    <img
                                      src={attachment.data}
                                      alt={`attachment-${index + 1}`}
                                      className="h-24 max-w-[180px] rounded-md object-cover"
                                    />
                                  </button>
                                ) : (
                                  <a
                                    key={`${message.id}-${index}`}
                                    href={attachment.data}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg border border-white/15 bg-slate-900/50 p-1 hover:opacity-90"
                                  >
                                    <span className="px-2 py-1 text-[11px] text-white/80">เปิดไฟล์แนบ {index + 1}</span>
                                  </a>
                                )
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                  {messages.length === 0 ? <div className="text-xs text-white/55">ยังไม่มีข้อความ</div> : null}
                </div>

                <div className="mt-3 rounded-xl border border-slate-700/45 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel>ข้อความตอบกลับ</FieldLabel>
                    <div className="text-[11px] text-white/45">{replyTextLength}/4000 • Ctrl/Cmd + Enter เพื่อส่ง</div>
                  </div>
                  <textarea
                    value={supportDraft.reply}
                    onChange={(e) => setSupportDraft((prev) => ({ ...prev, reply: e.target.value }))}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        event.preventDefault()
                        if (canSendReply && !isWorking) {
                          void supportSendReply()
                        }
                      }
                    }}
                    placeholder={isClosed ? 'ทิกเก็ตปิดแล้ว' : 'พิมพ์ข้อความตอบกลับ...'}
                    disabled={isClosed || isWorking}
                    className="h-24 w-full rounded-xl border border-slate-700/60 bg-slate-950/55 p-3 text-xs text-white outline-none disabled:opacity-60"
                  />

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={`inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white ${isClosed || isWorking ? 'opacity-50 pointer-events-none' : ''}`}>
                        แนบรูป
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void pickSupportReplyAttachments(e.target.files)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {supportReplyAttachments.map((attachment, index) => (
                        <div key={`${attachment.name || 'attachment'}-${index}`} className="group relative">
                          <img src={attachment.data} alt={attachment.name || `attachment-${index + 1}`} className="h-12 w-12 rounded-md border border-slate-700/60 object-cover" />
                          <button
                            type="button"
                            onClick={() => removeSupportReplyAttachment(index)}
                            className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:inline-flex"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={supportSendReply}
                      disabled={!canSendReply || isWorking}
                      className="h-9 rounded-lg bg-cyan-500/80 px-4 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                    >
                      {isWorking ? 'กำลังส่ง...' : 'ส่งข้อความตอบกลับ'}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    )
  }

  function renderUsersModule(data) {
    const rows = Array.isArray(data?.users) ? data.users : []
    const total = pickNumber(data?.total)
    const page = Math.max(1, pickNumber(data?.page || usersQuery.page))
    const totalPages = Math.max(1, pickNumber(data?.totalPages || 1))
    const summary = data?.summary || null
    const selectedSet = new Set((usersSelection || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
    const pageIds = rows.map((u) => Number(u?.id)).filter((id) => Number.isFinite(id) && id > 0)
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id))

    const role = String(session?.me?.user?.role || '').trim().toLowerCase()
    const canOwner = role === 'owner'
    const canAdmin = role === 'admin' || role === 'owner'
    const canFinance = role === 'finance' || role === 'admin' || role === 'owner'

    const detailStatus = usersDetail.status
    const detailData = usersDetail.data || null
    const detailUser = detailData?.user || null
    const detailTopups = Array.isArray(detailData?.topups) ? detailData.topups : []
    const detailTransactions = Array.isArray(detailData?.transactions) ? detailData.transactions : []
    const detailSessions = Array.isArray(detailData?.sessions) ? detailData.sessions : []
    const detailAudits = Array.isArray(detailData?.audits) ? detailData.audits : []
    const detailSecurity = detailData?.security || null
    const detailSnapshot = detailData?.snapshot || null

    return (
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section>
          <div className="grid gap-2 rounded-xl border border-slate-700/50 bg-slate-900/55 p-3 md:grid-cols-2 xl:grid-cols-7">
            <div className="xl:col-span-2">
              <FieldLabel>ค้นหาผู้ใช้</FieldLabel>
              <input
                value={usersQuery.search}
                onChange={(e) => patchUsersQuery({ search: e.target.value, page: 1 })}
                placeholder="ค้นหา: id/email/username/display"
                className="h-10 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
              />
            </div>
            <select
              value={usersQuery.role}
              onChange={(e) => patchUsersQuery({ role: e.target.value, page: 1 })}
              className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            >
              <option value="all">ทุกสิทธิ์</option>
              {USER_ROLE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <select
              value={usersQuery.status}
              onChange={(e) => patchUsersQuery({ status: e.target.value, page: 1 })}
              className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="active">ใช้งาน</option>
              <option value="banned">ถูกแบน</option>
            </select>
            <select
              value={usersQuery.sort}
              onChange={(e) => patchUsersQuery({ sort: e.target.value, page: 1 })}
              className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            >
              <option value="created_desc">ใหม่สุด</option>
              <option value="created_asc">เก่าสุด</option>
              <option value="points_desc">แต้มสูงสุด</option>
              <option value="orders_desc">ออเดอร์สูงสุด</option>
              <option value="spend_desc">ใช้จ่ายสูงสุด</option>
            </select>
            <select
              value={usersQuery.limit}
              onChange={(e) => patchUsersQuery({ limit: Number(e.target.value) || 25, page: 1 })}
              className="h-10 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
            >
              <option value={25}>25 / หน้า</option>
              <option value={50}>50 / หน้า</option>
              <option value={100}>100 / หน้า</option>
            </select>
            <div className="flex gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => {
                  setUsersSelection([])
                  patchUsersQuery(DEFAULT_USERS_QUERY)
                }}
                className="h-10 rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 text-xs text-white"
              >
                รีเซ็ต
              </button>
              <button
                type="button"
                onClick={() => loadModule('users')}
                className="h-10 rounded-lg border border-slate-600/70 bg-slate-800/60 px-3 text-xs font-semibold text-white hover:bg-slate-800"
              >
                รีเฟรช
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">ทั้งหมด {formatNumber(total)}</span>
              <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">ใช้งาน {formatNumber(summary?.active)}</span>
              <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">ถูกแบน {formatNumber(summary?.banned)}</span>
              <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">แอดมิน {formatNumber(summary?.admins)}</span>
              <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">หน้า {formatNumber(page)} / {formatNumber(totalPages)}</span>
              <span className="rounded-full border border-slate-700/60 bg-slate-900/55 px-2 py-1">เลือกแล้ว {formatNumber(usersSelection.length)}</span>
              {usersActionState.status !== 'idle' ? (
                <span className={`rounded-full border px-2 py-1 ${usersActionState.status === 'error' ? 'border-red-400/35 bg-red-500/15 text-red-100' : usersActionState.status === 'success' ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100' : 'border-amber-400/35 bg-amber-500/15 text-amber-100'}`}>
                  {usersActionState.message}
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => {
                  if (allPageSelected) {
                    setUsersSelection((prev) => (prev || []).filter((id) => !pageIds.includes(Number(id))))
                  } else {
                    setUsersSelection((prev) => {
                      const set = new Set((prev || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
                      for (const id of pageIds) set.add(id)
                      return [...set]
                    })
                  }
                }}
                className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 text-xs text-white"
              >
                {allPageSelected ? 'ยกเลิกเลือกทั้งหน้า' : 'เลือกทั้งหน้า'}
              </button>
              <select
                value={usersBulkDraft.role}
                onChange={(e) => setUsersBulkDraft((prev) => ({ ...prev, role: e.target.value }))}
                className="h-9 rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                disabled={!canOwner}
              >
                {USER_ROLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={usersApplyBulkRole}
                disabled={!canOwner || usersSelection.length < 1}
                className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 text-xs text-white disabled:opacity-50"
              >
                ตั้งค่าสิทธิ์แบบกลุ่ม
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => usersApplyBulkBan(true)}
                  disabled={!canAdmin || usersSelection.length < 1}
                  className="h-9 flex-1 rounded-lg border border-red-400/35 bg-red-500/15 px-3 text-xs text-red-100 disabled:opacity-50"
                >
                  แบนแบบกลุ่ม
                </button>
                <button
                  type="button"
                  onClick={() => usersApplyBulkBan(false)}
                  disabled={!canAdmin || usersSelection.length < 1}
                  className="h-9 flex-1 rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 text-xs text-emerald-100 disabled:opacity-50"
                >
                  ปลดแบนแบบกลุ่ม
                </button>
              </div>
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-[160px_minmax(0,1fr)_auto]">
              <div>
                <FieldLabel>ปรับแต้มแบบกลุ่ม (+/-)</FieldLabel>
                <input
                  value={usersBulkDraft.points}
                  onChange={(e) => setUsersBulkDraft((prev) => ({ ...prev, points: e.target.value }))}
                  placeholder="แต้ม +/-"
                  className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  disabled={!canFinance}
                />
              </div>
              <div>
                <FieldLabel>เหตุผล</FieldLabel>
                <input
                  value={usersBulkDraft.reason}
                  onChange={(e) => setUsersBulkDraft((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="เหตุผล"
                  className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 text-xs text-white outline-none"
                  disabled={!canFinance}
                />
              </div>
              <button
                type="button"
                onClick={usersApplyBulkPoints}
                disabled={!canFinance || usersSelection.length < 1}
                className="h-9 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-3 text-xs text-cyan-100 disabled:opacity-50"
              >
                ปรับแต้มแบบกลุ่ม
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-950/50 p-2">
            <table className="min-w-full text-left text-xs">
              <thead className="text-slate-300/80">
                <tr className="border-b border-slate-700/60">
                  <th className="py-2 pr-3"><input type="checkbox" checked={allPageSelected} onChange={(e) => {
                    if (e.target.checked) {
                      setUsersSelection((prev) => {
                        const set = new Set((prev || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
                        for (const id of pageIds) set.add(id)
                        return [...set]
                      })
                    } else {
                      setUsersSelection((prev) => (prev || []).filter((id) => !pageIds.includes(Number(id))))
                    }
                  }} /></th>
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">ตัวตนผู้ใช้</th>
                  <th className="py-2 pr-3">สิทธิ์</th>
                  <th className="py-2 pr-3">สถานะ</th>
                  <th className="py-2 pr-3">ออเดอร์</th>
                  <th className="py-2 pr-3">ยอดคงเหลือ</th>
                  <th className="py-2 pr-3">สร้างเมื่อ</th>
                  <th className="py-2 pr-3">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {rows.map((u) => {
                  const uid = Number(u?.id)
                  const isBanned = Boolean(u?.is_banned)
                  const userRole = String(u?.role || 'user').toLowerCase()
                  const selected = selectedSet.has(uid)
                  const activeDetail = Number(usersDetail.userId) === uid
                  return (
                    <tr key={u.id} className={`border-b border-slate-700/40 ${activeDetail ? 'bg-cyan-500/10' : 'hover:bg-slate-900/55'}`}>
                      <td className="py-2 pr-3"><input type="checkbox" checked={selected} onChange={(e) => patchUsersSelection(uid, e.target.checked)} /></td>
                      <td className="py-2 pr-3 font-mono text-[11px]">{u.id}</td>
                      <td className="py-2 pr-3">
                        <div className="max-w-[250px] truncate text-[11px] font-semibold text-white">{u.email || '-'}</div>
                        <div className="max-w-[250px] truncate text-[11px] text-white/55">{u.username || u.display_name || '-'}</div>
                      </td>
                      <td className="py-2 pr-3 text-[11px]">{userRole}</td>
                      <td className="py-2 pr-3 text-[11px]">
                        {isBanned ? <span className="rounded-full border border-red-400/35 bg-red-500/15 px-2 py-0.5 text-red-100">ถูกแบน</span> : <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-emerald-100">ใช้งาน</span>}
                      </td>
                      <td className="py-2 pr-3">{formatNumber(u.orders_count)}</td>
                      <td className="py-2 pr-3">{formatNumber(u.balance)}</td>
                      <td className="py-2 pr-3 text-[11px] text-white/60">{formatDateTime(u.created_at)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => openUserDetail(uid)} className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white">รายละเอียด</button>
                          {canAdmin ? (
                            <button
                              type="button"
                              onClick={() => toggleUserBan(uid, !isBanned)}
                              className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${isBanned ? 'bg-emerald-500/20 text-emerald-100' : 'bg-red-500/20 text-red-100'}`}
                            >
                              {isBanned ? 'ปลดแบน' : 'แบน'}
                            </button>
                          ) : null}
                          {canFinance ? <button type="button" onClick={() => adjustUserPoints(uid, 100, 'quick_bonus')} className="rounded-lg bg-cyan-500/20 px-2 py-1 text-[11px] text-cyan-100">+100</button> : null}
                          {canOwner ? (
                            <select
                              value={userRole}
                              onChange={(e) => applyUserRole(uid, e.target.value)}
                              className="h-7 rounded-lg border border-slate-700/60 bg-slate-900/75 px-2 text-[11px] text-white outline-none"
                            >
                              {USER_ROLE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {rows.length === 0 ? <div className="px-2 py-3 text-xs text-white/55">ไม่พบผู้ใช้ตามตัวกรองปัจจุบัน</div> : null}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => patchUsersQuery({ page: Math.max(1, page - 1) })}
              disabled={page <= 1}
              className="rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              onClick={() => patchUsersQuery({ page: Math.min(totalPages, page + 1) })}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/45 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-white">รายละเอียดการจัดการผู้ใช้</div>
            {Number.isFinite(Number(usersDetail.userId)) ? (
              <button type="button" onClick={() => openUserDetail(usersDetail.userId)} className="h-8 rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 text-[11px] text-white">รีเฟรช</button>
            ) : null}
          </div>

          {detailStatus === 'idle' ? <div className="text-xs text-white/55">เลือกผู้ใช้จากตารางเพื่อจัดการ</div> : null}
          {detailStatus === 'loading' ? <div className="text-xs text-white/55">กำลังโหลดรายละเอียดผู้ใช้...</div> : null}
          {detailStatus === 'error' ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{usersDetail.error}</div> : null}

          {detailStatus === 'ready' && detailUser ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700/50 bg-slate-950/45 p-3">
                <div className="text-sm font-extrabold text-white">#{detailUser.id} {detailUser.display_name || detailUser.username || detailUser.email}</div>
                <div className="mt-1 text-[11px] text-white/60">{detailUser.email || '-'}</div>
                <div className="mt-2 grid gap-2 text-[11px] text-white/75 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1">ยอดคงเหลือ: {formatNumber(detailUser.balance)}</div>
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1">ออเดอร์: {formatNumber(detailUser.orders_count)}</div>
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1">ยอดใช้จ่ายรวม: {formatNumber(detailUser.total_spend_points)}</div>
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1">เซสชันที่ใช้งาน: {formatNumber(detailSecurity?.active_sessions)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/50 bg-slate-950/45 p-3">
                <div className="mb-2 text-xs font-semibold text-white/80">โปรไฟล์</div>
                <div className="grid gap-2">
                  <div><FieldLabel>อีเมล</FieldLabel><input value={usersProfileDraft.email} onChange={(e) => setUsersProfileDraft((prev) => ({ ...prev, email: e.target.value }))} placeholder="อีเมล" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 text-xs text-white outline-none" /></div>
                  <div><FieldLabel>ชื่อผู้ใช้</FieldLabel><input value={usersProfileDraft.username} onChange={(e) => setUsersProfileDraft((prev) => ({ ...prev, username: e.target.value }))} placeholder="ชื่อผู้ใช้" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 text-xs text-white outline-none" /></div>
                  <div><FieldLabel>ชื่อที่แสดง</FieldLabel><input value={usersProfileDraft.display_name} onChange={(e) => setUsersProfileDraft((prev) => ({ ...prev, display_name: e.target.value }))} placeholder="ชื่อที่แสดง" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 text-xs text-white outline-none" /></div>
                  <div><FieldLabel>ลิงก์อวาตาร์</FieldLabel><input value={usersProfileDraft.avatar_url} onChange={(e) => setUsersProfileDraft((prev) => ({ ...prev, avatar_url: e.target.value }))} placeholder="ลิงก์อวาตาร์" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 text-xs text-white outline-none" /></div>
                  <button type="button" onClick={saveUsersProfile} disabled={!canAdmin} className="h-9 rounded-lg bg-cyan-500/80 px-3 text-xs font-semibold text-white disabled:opacity-50">บันทึกโปรไฟล์</button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/50 bg-slate-950/45 p-3">
                <div className="mb-2 text-xs font-semibold text-white/80">ความปลอดภัยและบัญชี</div>
                <div className="grid gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <FieldLabel>รหัสผ่านใหม่</FieldLabel>
                      <input value={usersPasswordDraft} onChange={(e) => setUsersPasswordDraft(e.target.value)} placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)" className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 text-xs text-white outline-none" />
                    </div>
                    <button type="button" onClick={resetUsersPassword} disabled={!canAdmin} className="h-9 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-white disabled:opacity-50">รีเซ็ตรหัสผ่าน</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={revokeUsersSessions} disabled={!canAdmin} className="h-9 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 text-xs text-amber-100 disabled:opacity-50">ยกเลิกเซสชันทั้งหมด</button>
                    <button type="button" onClick={() => toggleUserBan(detailUser.id, !Boolean(detailUser.is_banned))} disabled={!canAdmin} className="h-9 rounded-lg border border-red-400/35 bg-red-500/10 px-3 text-xs text-red-100 disabled:opacity-50">{Boolean(detailUser.is_banned) ? 'ปลดแบนผู้ใช้' : 'แบนผู้ใช้'}</button>
                    <button type="button" onClick={() => adjustUserPoints(detailUser.id)} disabled={!canFinance} className="h-9 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 text-xs text-cyan-100 disabled:opacity-50">ปรับแต้ม</button>
                    <button type="button" onClick={removeUsersAccount} disabled={!canAdmin} className="h-9 rounded-lg border border-red-500/45 bg-red-500/20 px-3 text-xs text-red-100 disabled:opacity-50">ลบผู้ใช้</button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/50 bg-slate-950/45 p-3">
                <div className="mb-2 text-xs font-semibold text-white/80">ภาพรวมกิจกรรมล่าสุด</div>
                <div className="grid gap-2 text-[11px] text-white/75 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1">เติมเงิน: {formatNumber(detailSnapshot?.topups_total)} (รอดำเนินการ {formatNumber(detailSnapshot?.topups_pending)})</div>
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1">ธุรกรรม: {formatNumber(detailSnapshot?.transactions_total)}</div>
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1">เครดิต: {formatNumber(detailSnapshot?.transactions_credit_points)}</div>
                  <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 px-2 py-1">เดบิต: {formatNumber(detailSnapshot?.transactions_debit_points)}</div>
                </div>
                <div className="mt-2 text-[11px] text-white/50">เติมเงิน {formatNumber(detailTopups.length)} | ธุรกรรม {formatNumber(detailTransactions.length)} | เซสชัน {formatNumber(detailSessions.length)} | บันทึกตรวจสอบ {formatNumber(detailAudits.length)}</div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    )
  }

  if (session.status === 'loading') {
    return <div className="p-6 text-sm text-white/70">กำลังโหลดพื้นที่ทำงานแอดมิน...</div>
  }

  if (session.status === 'forbidden') {
    return (
      <div className="mx-auto max-w-xl p-6">
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          คุณไม่มีสิทธิ์เข้าถึงพื้นที่นี้
        </div>
      </div>
    )
  }

  if (session.status === 'error') {
    return (
      <div className="mx-auto max-w-xl p-6">
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{session.error}</div>
      </div>
    )
  }

  const me = session.me
  const displayName = me?.user?.display_name || me?.user?.email || 'admin'

  return (
    <div className="min-h-screen overflow-x-hidden p-2 sm:p-4 md:p-6">
      <div className="mx-auto grid max-w-[1650px] gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-700/50 bg-slate-950/75 p-3">
          <div className="rounded-xl border border-slate-700/40 bg-slate-900/70 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Admin V2</div>
            <div className="mt-2 text-sm font-bold text-white">{displayName}</div>
            <div className="mt-1 text-xs text-white/50">{String(me?.user?.role || '').toLowerCase()}</div>
          </div>

          <div className="mt-3 space-y-3">
            {MODULE_SECTIONS.map((section) => {
              const sectionModules = MODULES.filter((m) => m.section === section.id && allowedModuleIds.includes(m.id))
              if (sectionModules.length === 0) return null

              return (
                <div key={section.id}>
                  <div className="mb-1 px-1 text-[11px] uppercase tracking-[0.16em] text-white/35">{section.label}</div>
                  <div className="space-y-1">
                    {sectionModules.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectModule(item.id)}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                          activeModule === item.id
                            ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/35'
                            : 'bg-slate-900/45 text-white/75 hover:bg-slate-900/80 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {rbacState.status === 'error' ? <div className="mt-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">RBAC fallback mode active.</div> : null}

          <div className="mt-3 space-y-2 border-t border-slate-700/50 pt-3 text-xs">
            <Link to="/admin" className="block rounded-lg bg-slate-900/60 px-3 py-2 text-white/80 hover:bg-slate-900">
              Open Legacy Admin (/admin)
            </Link>
            <button
              type="button"
              onClick={logout}
              className="w-full rounded-lg bg-red-500/20 px-3 py-2 text-left text-red-100 hover:bg-red-500/30"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 overflow-x-auto rounded-2xl border border-slate-700/50 bg-slate-950/75 p-2 sm:p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-extrabold text-white">{MODULES.find((m) => m.id === activeModule)?.label || 'Workspace'}</h1>
            <button
              type="button"
              onClick={() => loadModule(activeModule)}
              className="rounded-lg border border-slate-600/70 bg-slate-900/60 px-3 py-1.5 text-xs text-white/80 hover:bg-slate-900"
            >
              Reload Module
            </button>
          </div>

          {activeModuleState.status === 'loading' ? <div className="mt-4 text-sm text-white/60">Loading module data...</div> : null}
          {activeModuleState.status === 'error' ? (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">{activeModuleState.error}</div>
          ) : null}

          {activeModule === 'dashboard' && activeModuleState.status === 'ready' ? renderDashboard(activeModuleState.data) : null}
          {activeModule === 'users' && activeModuleState.status === 'ready' ? renderUsersModule(activeModuleState.data) : null}
          {activeModule === 'support' && activeModuleState.status === 'ready' ? renderSupportModule(activeModuleState.data) : null}
          {activeModule === 'fulfillment' && activeModuleState.status === 'ready' ? renderFulfillmentModule(activeModuleState.data) : null}
          {activeModule === 'logs' && activeModuleState.status === 'ready' ? renderLogsModule(activeModuleState.data) : null}
          {activeModule === 'settings' && activeModuleState.status === 'ready' ? renderSettingsModule() : null}
          {activeModule === 'catalog' && activeModuleState.status === 'ready' ? renderCatalogModule(activeModuleState.data) : null}
          {activeModule === 'promotions' && activeModuleState.status === 'ready' ? renderPromotionsModule(activeModuleState.data) : null}
          {activeModule === 'stock' && activeModuleState.status === 'ready' ? renderStockModule(activeModuleState.data) : null}
          {activeModule === 'automation' && activeModuleState.status === 'ready' ? renderAutomationModule(activeModuleState.data) : null}
          {activeModule === 'announcements' && activeModuleState.status === 'ready' ? renderAnnouncementsModule(activeModuleState.data) : null}
          {activeModule === 'messages' && activeModuleState.status === 'ready' ? renderMessagesModule(activeModuleState.data) : null}

          {activeModule !== 'dashboard' && activeModule !== 'users' && activeModule !== 'support' && activeModule !== 'fulfillment' && activeModule !== 'logs' && activeModule !== 'settings' && activeModule !== 'catalog' && activeModule !== 'promotions' && activeModule !== 'stock' && activeModule !== 'automation' && activeModule !== 'announcements' && activeModule !== 'messages' && activeModuleState.status === 'ready' ? (
            <ModulePlaceholder title={MODULES.find((m) => m.id === activeModule)?.label || 'Module'} />
          ) : null}
        </main>
      </div>

      {supportPreviewImage ? (
        <div
          className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-200 ${supportPreviewActive ? 'bg-black/75 opacity-100' : 'bg-black/0 opacity-0'}`}
          onClick={closeSupportPreview}
        >
          <div
            className={`relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-2xl border border-white/20 bg-slate-900/70 shadow-2xl transition-all duration-200 ${supportPreviewActive ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeSupportPreview}
              className="absolute right-2 top-2 z-10 rounded-full border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90 hover:bg-black/65"
            >
              Close
            </button>
            <img src={supportPreviewImage} alt="support-preview" className="max-h-[92vh] max-w-[92vw] object-contain" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
