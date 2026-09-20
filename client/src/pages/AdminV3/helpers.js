// ── AdminV3 shared helpers ──
// Extracted from AdminV2.jsx — pure functions, no React.

export const MODULES = [
  { id: 'dashboard', label: 'แดชบอร์ด', icon: 'bi-speedometer', section: 'core' },
  { id: 'users', label: 'ผู้ใช้', icon: 'bi-people-fill', section: 'core' },
  { id: 'support', label: 'ซัพพอร์ต', icon: 'bi-chat-text', section: 'operations' },
  { id: 'catalog', label: 'แค็ตตาล็อก', icon: 'bi-box-seam-fill', section: 'operations' },
  { id: 'stock', label: 'สต็อก', icon: 'bi-archive-fill', section: 'operations' },
  { id: 'fulfillment', label: 'บริการงานจ้าง', icon: 'bi-truck', section: 'operations' },
  { id: 'orders', label: 'ติดตาม Orders', icon: 'bi-bag-check-fill', section: 'operations' },
  { id: 'topups', label: 'ตรวจสลิปเติมเงิน', icon: 'bi-receipt-cutoff', section: 'operations' },
  { id: 'timesheet', label: 'ลงเวลางาน', icon: 'bi-clock-history', section: 'operations' },
  { id: 'automation', label: 'อัตโนมัติ', icon: 'bi-gear-wide-connected', section: 'operations' },
  { id: 'bundles', label: 'Bundle', icon: 'bi-gift-fill', section: 'business' },
  { id: 'promotions', label: 'โปรโมชัน', icon: 'bi-tag-fill', section: 'business' },
  { id: 'growth', label: 'Growth', icon: 'bi-graph-up-arrow', section: 'business' },
  { id: 'announcements', label: 'ประกาศ', icon: 'bi-megaphone-fill', section: 'business' },
  { id: 'messages', label: 'ข้อความ', icon: 'bi-envelope-fill', section: 'business' },
  { id: 'logs', label: 'บันทึกการใช้งาน', icon: 'bi-journal-text', section: 'system' },
  { id: 'settings', label: 'ตั้งค่า', icon: 'bi-sliders', section: 'system' },
  { id: 'owner', label: 'Owner Panel', icon: 'bi-shield-fill-check', section: 'owner' },
]

export const MODULE_SECTIONS = [
  { id: 'core', label: 'หลัก' },
  { id: 'operations', label: 'ปฏิบัติการ' },
  { id: 'business', label: 'ธุรกิจ' },
  { id: 'system', label: 'ระบบ' },
  { id: 'owner', label: 'Owner Only' },
]

export const LOCAL_ROLE_MODULE_ACCESS = {
  owner: ['dashboard', 'users', 'support', 'catalog', 'stock', 'fulfillment', 'orders', 'topups', 'timesheet', 'automation', 'bundles', 'promotions', 'growth', 'announcements', 'messages', 'logs', 'settings', 'owner'],
  admin: ['dashboard', 'users', 'support', 'catalog', 'stock', 'fulfillment', 'orders', 'topups', 'timesheet', 'automation', 'bundles', 'promotions', 'growth', 'announcements', 'messages', 'settings'],
  finance: ['dashboard', 'users', 'bundles', 'promotions', 'orders', 'topups'],
  support: ['dashboard', 'support', 'timesheet', 'orders'],
  booster: ['dashboard', 'fulfillment', 'timesheet'],
}

export const LOCAL_ROLE_ACTION_ACCESS = {
  'users.view': ['finance', 'admin', 'owner'],
  'users.edit': ['admin', 'owner'],
  'users.adjust_points': ['finance', 'admin', 'owner'],
  'topups.manage': ['finance', 'admin', 'owner'],
  'support.manage': ['support', 'admin', 'owner'],
  'fulfillment.manage': ['booster', 'admin', 'owner'],
  'catalog.manage': ['admin', 'owner'],
  'bundles.manage': ['admin', 'owner'],
  'stock.manage': ['admin', 'owner'],
  'automation.manage': ['admin', 'owner'],
  'promotions.manage': ['admin', 'owner'],
  'growth.manage': ['admin', 'owner'],
  'logs.view': ['owner'],
  'settings.manage': ['admin', 'owner'],
  'owner.panel': ['owner'],
}

export const USER_ROLE_OPTIONS = ['owner', 'admin', 'finance', 'support', 'booster', 'user']

// ── Defaults ──
export const DEFAULT_USERS_QUERY = { search: '', role: 'all', status: 'all', sort: 'created_desc', page: 1, limit: 25 }
export const DEFAULT_SUPPORT_QUERY = { status: '', scope: 'all', assignedTo: '', search: '', limit: 120 }
export const DEFAULT_FULFILLMENT_QUERY = { status: '', search: '', scope: 'all', assignedTo: '', limit: 200 }
export const DEFAULT_LOGS_QUERY = { search: '', action: '', category: 'all', severity: 'all', status: 'all', actorUserId: '', dateFrom: '', dateTo: '', limit: 50, page: 1 }
export const DEFAULT_CATALOG_FILTER = { search: '', categoryId: 'all', hidden: 'all' }
export const DEFAULT_CATEGORY_FORM = { id: null, name: '', slug: '', image_url: '', description: '', is_hidden: false, parent_id: '', sort_order: 0, icon: '' }
export const DEFAULT_PRODUCT_FORM = {
  id: null, category_id: '', name: '', slug: '', price: 0, stock: 0, sort_order: 0, image_url: '',
  description: '', highlights: '', manual_url: '', manual_text: '', manual_video_url: '',
  fulfillment_type: 'digital_stock', custom_form_fields: [], product_options: [],
  is_featured: false, is_unlimited_stock: false,
  gallery_images: [], badge: '', tags: [], sku: '', admin_notes: '', volume_pricing: [],
  min_order_qty: 1, max_order_qty: '',
}
export const PRESET_BADGE_OPTIONS = [
  { value: '', label: 'ไม่มีป้าย' },
  { value: 'HOT', label: '🔥 HOT (ยอดนิยม)', color: 'danger' },
  { value: 'SALE', label: '🏷️ SALE (ลดราคา)', color: 'warning' },
  { value: 'NEW', label: '✨ NEW (มาใหม่)', color: 'success' },
  { value: 'LIMITED', label: '⚡ LIMITED (จำนวนจำกัด)', color: 'info' },
  { value: 'BESTSELLER', label: '👑 BEST SELLER (ขายดีอันดับ 1)', color: 'primary' },
]
export const DEFAULT_PRODUCT_OPTION_DRAFT = { editIndex: null, id: '', label: '', value: '', price_points: '' }
export const DEFAULT_COUPON_FORM = { id: null, code: '', points: 100, max_uses: 1, used_count: 0, expires_at: '', is_active: true }
export const DEFAULT_PROMOTION_FORM = {
  id: null,
  scope: 'product',
  product_id: '',
  category_id: '',
  title: '',
  badge_text: '',
  discount_percent: '',
  discount_amount_points: '',
  min_spend_points: '',
  max_discount_points: '',
  is_flash_sale: false,
  starts_at: '',
  ends_at: '',
  is_active: true,
}
export const DEFAULT_DISCOUNT_COUPON_FORM = { id: null, code: '', title: '', discount_percent: '', discount_amount_points: '', max_uses: '', used_count: 0, expires_at: '', is_active: true }
export const DEFAULT_POOL_FORM = { id: null, name: '', kind: 'digital_code', quantity_remaining: '', is_active: true }
export const DEFAULT_STOCK_ITEM_EDIT = { id: null, payload: '', status: 'available' }
export const DEFAULT_MYSTERY_FORM = { prize_kind: 'product', prize_name: '', prize_image_url: '', prize_product_id: '', weight: 1, remaining: 0, is_active: true }
export const DEFAULT_MYSTERY_EDIT = { id: null, prize_name: '', prize_image_url: '', weight: 1, remaining: 0, is_active: true }
export const DEFAULT_MYSTERY_SIMULATION = { qty: 1, trials: 5000 }
export const DEFAULT_AUTOMATION_RULE_FORM = { id: null, name: '', trigger_type: 'support_unassigned_overdue', trigger_minutes: 30, action_severity: 'high', is_active: true }

export const EMPTY_SETTINGS_FIELD_ERRORS = {
  home_featured_ratio: '', home_categories_ratio: '', category_products_ratio: '', product_detail_ratio: '',
  site_name: '', navbar_title: '', tab_title: '', favicon_url: '', navbar_links: '',
}

export const DEFAULT_HOMEPAGE_SETTINGS = {
  hero_title: '', hero_subtitle: '', hero_description: '', hero_button_text: '', hero_button_link: '',
  showcase_enabled: true, showcase_title: 'สินค้าแนะนำ', showcase_scroll_interval: 2000, showcase_max_items: 12,
  featured_category_id: null, featured_product_ids: [], showcase_product_ids: [], faq_items: [], trust_items: [],
}

export const DEFAULT_SITE_SETTINGS = {
  site_url: '', site_description: '', og_image_url: '', footer_tagline: '',
  footer_links: [], social_links: [], announcements: [], tos_content: '', privacy_content: '',
}

// ── Formatting ──
export function pickNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatNumber(value) {
  return pickNumber(value).toLocaleString('th-TH')
}

export function formatMinutes(value) {
  const minutes = pickNumber(value)
  if (minutes <= 0) return '0m'
  if (minutes < 60) return `${minutes.toFixed(1)}m`
  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

export function formatDateTime(value) {
  if (!value) return '-'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleString('th-TH')
}

export function formatRelativeTime(value, nowMs = Date.now()) {
  if (!value) return '-'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return '-'
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return `${Math.floor(diffSec / 86400)}d`
}

export function isoToLocalInput(value) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
}

const ERROR_MESSAGES_TH = {
  points_over_hard_limit: 'จำนวนแต้มเกินขีดจำกัดสูงสุดที่ระบบอนุญาต (สูงสุดครั้งละ 100,000,000 แต้ม)',
  owner_approval_required_for_large_adjustment: 'การปรับแต้ม 50,000 ขึ้นไปต้องดำเนินการโดย Owner เท่านั้น',
  invalid_points: 'จำนวนแต้มไม่ถูกต้อง กรุณากรอกตัวเลขที่มากกว่า 0',
  user_not_found: 'ไม่พบบัญชีผู้ใช้นี้ในระบบ',
  cannot_ban_owner: 'ไม่สามารถระงับ/แบนบัญชีระดับ Owner ได้',
  cannot_delete_self: 'ไม่สามารถลบบัญชีของตัวเองได้',
  cannot_modify_owner: 'ไม่มีสิทธิ์แก้ไขข้อมูลบัญชีระดับ Owner',
  invalid_role: 'สิทธิ์การใช้งานไม่ถูกต้อง',
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
  forbidden: 'คุณไม่มีสิทธิ์ในการดำเนินการนี้',
}

export function getErrorMessage(err, fallback = 'เกิดข้อผิดพลาดในการดำเนินการ') {
  const apiMessage = String(err?.data?.message || '').trim()
  if (apiMessage) return apiMessage
  const apiError = String(err?.data?.error || '').trim()
  if (apiError && ERROR_MESSAGES_TH[apiError]) return ERROR_MESSAGES_TH[apiError]
  if (apiError) return apiError
  const status = Number(err?.status)
  if (status === 401) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง'
  if (status === 403) return 'คุณไม่มีสิทธิ์ในการดำเนินการนี้ (Forbidden)'
  const text = String(err?.message || '').trim()
  if (text && ERROR_MESSAGES_TH[text]) return ERROR_MESSAGES_TH[text]
  if (text && text !== 'request_failed') return text
  return fallback
}

// ── Status meta helpers ──
export function getSupportStatusMeta(status) {
  const key = String(status || '').trim().toLowerCase()
  if (key === 'closed') return { key, label: 'ปิดแล้ว', bg: 'text-bg-secondary' }
  if (key === 'pending') return { key, label: 'รอดำเนินการ', bg: 'text-bg-warning' }
  return { key: key || 'open', label: 'เปิด', bg: 'text-bg-success' }
}

export function getSupportWaitingMeta(ticket, nowMs = Date.now()) {
  const statusKey = String(ticket?.status || '').trim().toLowerCase()
  if (statusKey === 'closed') return { key: 'closed', label: 'ปิดเคสแล้ว', ageMinutes: 0, bg: 'text-secondary' }
  const lastRole = String(ticket?.last_sender_role || '').trim().toLowerCase()
  const waitingForStaff = !lastRole || lastRole === 'user'
  const refTime = ticket?.last_sender_at || ticket?.last_message_at || ticket?.created_at
  const refMs = refTime ? Date.parse(refTime) : Number.NaN
  const ageMinutes = Number.isFinite(refMs) ? Math.max(0, Math.floor((nowMs - refMs) / 60000)) : 0
  if (waitingForStaff) {
    if (ageMinutes >= 120) return { key: 'staff_urgent', label: 'รอทีมซัพพอร์ต (เร่งด่วน)', ageMinutes, bg: 'text-danger' }
    if (ageMinutes >= 30) return { key: 'staff_due', label: 'รอทีมซัพพอร์ต', ageMinutes, bg: 'text-warning' }
    return { key: 'staff_wait', label: 'รอทีมซัพพอร์ต', ageMinutes, bg: 'text-info' }
  }
  return { key: 'user_wait', label: 'รอลูกค้าตอบกลับ', ageMinutes, bg: 'text-secondary' }
}

export function formatDiscountSummary(row) {
  const percent = Number(row?.discount_percent)
  if (Number.isFinite(percent) && percent > 0) return `${Math.trunc(percent)}%`
  const amountPoints = Number(row?.discount_amount_points)
  if (Number.isFinite(amountPoints) && amountPoints > 0) return `${Math.trunc(amountPoints).toLocaleString('th-TH')} แต้ม`
  return '-'
}

export function getPromotionStatusMeta(row, nowMs = Date.now()) {
  const active = Boolean(row?.is_active)
  const startsAtMs = row?.starts_at ? Date.parse(row.starts_at) : Number.NaN
  const endsAtMs = row?.ends_at ? Date.parse(row.ends_at) : Number.NaN
  if (!active) return { key: 'inactive', label: 'ปิดใช้งาน', bg: 'text-bg-secondary' }
  if (Number.isFinite(startsAtMs) && startsAtMs > nowMs) return { key: 'scheduled', label: 'รอเริ่ม', bg: 'text-bg-info' }
  if (Number.isFinite(endsAtMs) && endsAtMs < nowMs) return { key: 'expired', label: 'หมดอายุ', bg: 'text-bg-danger' }
  return { key: 'active', label: 'กำลังใช้งาน', bg: 'text-bg-success' }
}

export function getCouponStatusMeta(row, nowMs = Date.now()) {
  const active = Boolean(row?.is_active)
  const expiresAtMs = row?.expires_at ? Date.parse(row.expires_at) : Number.NaN
  const usedCount = Math.max(0, Number(row?.used_count || 0))
  const maxUsesRaw = row?.max_uses
  const maxUses = maxUsesRaw == null || maxUsesRaw === '' ? null : Number(maxUsesRaw)
  const exhausted = Number.isFinite(maxUses) && maxUses > 0 && usedCount >= maxUses
  if (!active) return { key: 'inactive', label: 'ปิดใช้งาน', bg: 'text-bg-secondary' }
  if (exhausted) return { key: 'exhausted', label: 'ใช้ครบแล้ว', bg: 'text-bg-warning' }
  if (Number.isFinite(expiresAtMs) && expiresAtMs < nowMs) return { key: 'expired', label: 'หมดอายุ', bg: 'text-bg-danger' }
  return { key: 'active', label: 'พร้อมใช้', bg: 'text-bg-success' }
}

// ── Slug / normalize helpers ──
export function makeSlug(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
}

export function normalizeCatalogFulfillmentType(value) {
  const key = String(value || '').trim().toLowerCase()
  return key === 'mystery_box' ? 'mystery_box' : 'digital_stock'
}

export function normalizeCustomFormFieldId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
}

export function normalizeProductOptionId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
}

export function createCustomFormFieldDraft(type = 'text') {
  return {
    id: `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: '', type: type === 'checkbox' ? 'checkbox' : 'text', required: false,
  }
}

export function normalizeProductCustomFormFields(source) {
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
      const id = normalizeCustomFormFieldId(field?.id) || normalizeCustomFormFieldId(label) || `field_${index + 1}`
      const type = field?.type === 'checkbox' ? 'checkbox' : 'text'
      const required = Boolean(field?.required)
      return { id, label, type, required }
    })
  }
  const fields = []
  if (source?.farm_form_username_enabled !== false) fields.push({ id: 'username', label: 'Username', type: 'text', required: true })
  if (source?.farm_form_password_enabled !== false) fields.push({ id: 'password', label: 'Password', type: 'text', required: true })
  if (source?.farm_form_auth_key_enabled !== false) fields.push({ id: 'auth_key', label: 'Auth Key', type: 'text', required: false })
  return fields
}

export function normalizeCustomFormFieldsForSubmit(fields) {
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
    rows.push({ id: normalizedId, label, type, required })
  }
  return rows
}

export function normalizeProductOptionsForSubmit(options) {
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

export function splitStockLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function normalizeSupportAttachments(rawAttachments) {
  let source = rawAttachments
  if (typeof source === 'string') {
    try { source = JSON.parse(source) } catch { source = [] }
  }
  if (!Array.isArray(source)) return []
  return source.map((item) => {
    const data = String(item?.data || item?.url || '').trim()
    if (!data) return null
    const mime = String(item?.mime || '').trim().toLowerCase()
    const isImage = mime.startsWith('image/') || /^data:image\//i.test(data) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(data)
    return { data, isImage }
  }).filter(Boolean)
}

export function computeMysteryChanceMeta(row) {
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
  return { kind, weight, remaining, availableStock, drawableCount, effectiveWeight }
}

export function formatMysteryChancePercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '-'
  if (n >= 10) return `${n.toFixed(2)}%`
  if (n >= 1) return `${n.toFixed(3)}%`
  return `${n.toFixed(4)}%`
}

export function formatMysteryEffectiveWeight(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '-'
  return n.toFixed(4)
}

export function buildFallbackRbac(role) {
  const normalizedRole = String(role || '').trim().toLowerCase() || 'user'
  const modules = LOCAL_ROLE_MODULE_ACCESS[normalizedRole] || ['dashboard']
  const actions = Object.fromEntries(
    Object.entries(LOCAL_ROLE_ACTION_ACCESS).map(([action, roles]) => [action, roles.includes(normalizedRole)]),
  )
  return { role: normalizedRole, modules, actions }
}

export function normalizeHomepageSettings(input) {
  const s = input && typeof input === 'object' ? input : {}
  const txt = (v, fb, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : fb }
  const num = (v, fb, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : fb }
  return {
    hero_title: txt(s.hero_title, DEFAULT_HOMEPAGE_SETTINGS.hero_title, 100),
    hero_subtitle: txt(s.hero_subtitle, DEFAULT_HOMEPAGE_SETTINGS.hero_subtitle, 100),
    hero_description: txt(s.hero_description, DEFAULT_HOMEPAGE_SETTINGS.hero_description, 500),
    hero_button_text: txt(s.hero_button_text, DEFAULT_HOMEPAGE_SETTINGS.hero_button_text, 40),
    hero_button_link: txt(s.hero_button_link, DEFAULT_HOMEPAGE_SETTINGS.hero_button_link, 200),
    showcase_enabled: s.showcase_enabled !== false,
    showcase_title: txt(s.showcase_title, DEFAULT_HOMEPAGE_SETTINGS.showcase_title, 80),
    showcase_scroll_interval: num(s.showcase_scroll_interval, DEFAULT_HOMEPAGE_SETTINGS.showcase_scroll_interval, 500, 30000),
    showcase_max_items: num(s.showcase_max_items, DEFAULT_HOMEPAGE_SETTINGS.showcase_max_items, 1, 50),
    featured_category_id: (() => {
      const n = Number(s.featured_category_id)
      return Number.isFinite(n) && n > 0 ? n : null
    })(),
    featured_product_ids: (Array.isArray(s.featured_product_ids) ? s.featured_product_ids : []).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0).slice(0, 20),
    showcase_product_ids: (Array.isArray(s.showcase_product_ids) ? s.showcase_product_ids : []).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0).slice(0, 50),
    faq_items: (Array.isArray(s.faq_items) ? s.faq_items : []).slice(0, 20).map((i) => ({ question: String(i?.question ?? '').slice(0, 200), answer: String(i?.answer ?? '').slice(0, 1000) })).filter((i) => i.question.trim() && i.answer.trim()),
    trust_items: (Array.isArray(s.trust_items) ? s.trust_items : []).slice(0, 10).map((i) => ({ icon: String(i?.icon ?? '').slice(0, 2000), title: String(i?.title ?? '').slice(0, 60), desc: String(i?.desc ?? '').slice(0, 200) })).filter((i) => i.title.trim()),
  }
}

export function normalizeSiteSettings(input) {
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
    privacy_content: txt(s.privacy_content, DEFAULT_SITE_SETTINGS.privacy_content, 50000),
  }
}

export const DEFAULT_TOPUP_SETTINGS = {
  angpao: true,
  coupon: true,
  promptpay: true,
  truemoney_phone: '',
  promptpay_target: '',
  promptpay_name: '',
}

export function normalizeTopupSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    angpao: source.angpao !== false,
    coupon: source.coupon !== false,
    promptpay: source.promptpay !== false,
    truemoney_phone: String(source.truemoney_phone ?? '').trim(),
    promptpay_target: String(source.promptpay_target ?? '').trim(),
    promptpay_name: String(source.promptpay_name ?? '').trim(),
  }
}

export function normalizeVolumePricingForSubmit(tiers) {
  if (!Array.isArray(tiers)) return []
  return tiers
    .map((t) => ({
      min_qty: Number(t?.min_qty),
      discount_percent: Number(t?.discount_percent || 0),
      discount_amount_points: Number(t?.discount_amount_points || 0),
    }))
    .filter((t) => Number.isFinite(t.min_qty) && t.min_qty > 1 && (t.discount_percent > 0 || t.discount_amount_points > 0))
    .sort((a, b) => a.min_qty - b.min_qty)
}

export function normalizeGalleryImagesForSubmit(images) {
  if (!Array.isArray(images)) return []
  return images.map((img) => (typeof img === 'string' ? img.trim() : String(img?.url || '').trim())).filter(Boolean)
}

export function normalizeTagsForSubmit(tags) {
  if (!Array.isArray(tags)) return []
  return tags.map((t) => String(t || '').trim()).filter(Boolean)
}


