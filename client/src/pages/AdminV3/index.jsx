import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchJson, resolveApiUrl, setAuthToken } from '../../api.js'
import { connectSocket, disconnectSocket } from '../../socket.js'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../../uiImageSettings.js'
import { DEFAULT_UI_BRANDING_SETTINGS, normalizeUiBrandingSettings } from '../../uiBrandingSettings.js'
import {
  MODULES, MODULE_SECTIONS, LOCAL_ROLE_MODULE_ACCESS, LOCAL_ROLE_ACTION_ACCESS, USER_ROLE_OPTIONS,
  DEFAULT_USERS_QUERY, DEFAULT_SUPPORT_QUERY, DEFAULT_FULFILLMENT_QUERY, DEFAULT_LOGS_QUERY,
  DEFAULT_CATALOG_FILTER, DEFAULT_CATEGORY_FORM, DEFAULT_PRODUCT_FORM, DEFAULT_PRODUCT_OPTION_DRAFT,
  DEFAULT_COUPON_FORM, DEFAULT_PROMOTION_FORM, DEFAULT_DISCOUNT_COUPON_FORM,
  DEFAULT_POOL_FORM, DEFAULT_STOCK_ITEM_EDIT, DEFAULT_MYSTERY_FORM, DEFAULT_MYSTERY_EDIT,
  DEFAULT_MYSTERY_SIMULATION, DEFAULT_AUTOMATION_RULE_FORM, EMPTY_SETTINGS_FIELD_ERRORS,
  DEFAULT_HOMEPAGE_SETTINGS, DEFAULT_SITE_SETTINGS, DEFAULT_TOPUP_SETTINGS,
  pickNumber, formatNumber, formatMinutes, formatDateTime, formatRelativeTime,
  isoToLocalInput, getErrorMessage, getSupportStatusMeta, getSupportWaitingMeta,
  formatDiscountSummary, getPromotionStatusMeta, getCouponStatusMeta,
  makeSlug, normalizeCatalogFulfillmentType, normalizeCustomFormFieldId,
  normalizeProductOptionId, createCustomFormFieldDraft, normalizeProductCustomFormFields,
  normalizeCustomFormFieldsForSubmit, normalizeProductOptionsForSubmit,
  splitStockLines, normalizeSupportAttachments, computeMysteryChanceMeta,
  formatMysteryChancePercent, formatMysteryEffectiveWeight, buildFallbackRbac,
  normalizeHomepageSettings, normalizeSiteSettings, normalizeTopupSettings,
} from './helpers.js'
import {
  loadDashboardModule, loadUsersModule, loadSupportModule, loadSupportTicketDetail,
  loadFulfillmentModule, loadFulfillmentRequestDetail, loadLogsModule, loadSettingsModule,
  loadCatalogModule, loadPromotionsModule, loadStockModule, loadAutomationModule,
  loadAnnouncementsModule, loadMessagesModule, loadTimesheetModule, loadOwnerModule, loadTopupsModule,
  loadOrdersModule, loadBundlesModule, loadGrowthModule,
} from './loaders.js'
import DashboardModule from './modules/DashboardModule.jsx'
import UsersModule from './modules/UsersModule.jsx'
import SupportModule from './modules/SupportModule.jsx'
import FulfillmentModule from './modules/FulfillmentModule.jsx'
import CatalogModule from './modules/CatalogModule.jsx'
import StockModule from './modules/StockModule.jsx'
import PromotionsModule from './modules/PromotionsModule.jsx'
import BundlesModule from './modules/BundlesModule.jsx'
import GrowthModule from './modules/GrowthModule.jsx'
import LogsModule from './modules/LogsModule.jsx'
import SettingsModule from './modules/SettingsModule.jsx'
import AutomationModule from './modules/AutomationModule.jsx'
import AnnouncementsModule from './modules/AnnouncementsModule.jsx'
import MessagesModule from './modules/MessagesModule.jsx'
import OwnerModule from './modules/OwnerModule.jsx'
import TimesheetModule from './modules/TimesheetModule.jsx'
import OrdersModule from './modules/OrdersModule.jsx'
import TopupsModule from './modules/TopupsModule.jsx'
import LedgerShell from './shell/LedgerShell.jsx'
import PageBar from './shell/PageBar.jsx'
import './AdminV3.css'

// Inject AdminLTE CSS & JS + Bootstrap Icons into <head> once
const ADMINLTE_ASSETS = [
  { tag: 'link', rel: 'stylesheet', href: '/adminlte/css/adminlte.min.css' },
  { tag: 'link', rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css' },
  { tag: 'script', src: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js' },
  { tag: 'script', src: '/adminlte/js/adminlte.min.js' },
]

const MODULE_LABELS = {
  dashboard: 'แดชบอร์ด',
  users: 'ผู้ใช้',
  support: 'ซัพพอร์ต',
  catalog: 'แคตตาล็อก',
  stock: 'สต็อก',
  fulfillment: 'งานบริการ',
  orders: 'ออเดอร์',
  timesheet: 'เวลางาน',
  topups: 'ตรวจสลิปเติมเงิน',
  automation: 'อัตโนมัติ',
  bundles: 'Bundle',
  promotions: 'โปรโมชั่น',
  growth: 'Growth',
  announcements: 'ประกาศ',
  messages: 'ข้อความ',
  logs: 'บันทึกระบบ',
  settings: 'ตั้งค่า',
  owner: 'Owner Panel',
}

const MODULE_DESCRIPTIONS = {
  dashboard: 'ภาพรวมสถานะร้าน งานค้าง SLA และการแจ้งเตือนล่าสุด',
  users: 'ดูแลบัญชีผู้ใช้ สิทธิ์ ยอดพอยท์ และสถานะสมาชิก',
  support: 'จัดการ ticket ลูกค้า มอบหมายงาน และติดตาม SLA',
  catalog: 'จัดหมวดหมู่สินค้า ราคา รูปภาพ และสถานะการแสดงผล',
  stock: 'ดูแลสต็อกดิจิทัล pool และการผูกตัวเลือกสินค้า',
  fulfillment: 'ติดตามงานบริการที่รอดำเนินการและงานที่กำลังทำ',
  orders: 'ค้นหาและตรวจสอบคำสั่งซื้อทั้งหมดจากศูนย์เดียว',
  topups: 'ตรวจสลิปที่ลูกค้าแนบเข้ามา เทียบกับเงินเข้าบัญชีร้าน แล้วอนุมัติพ้อยท์',
  timesheet: 'บันทึกเวลาเข้างาน ออกงาน และตรวจรอบการทำงานของทีม',
  automation: 'ตั้งกฎ workflow และดูเหตุการณ์ที่ระบบจัดการอัตโนมัติ',
  bundles: 'สร้างชุดสินค้าและแคมเปญแบบ bundle',
  promotions: 'จัดการคูปอง โปรโมชัน และส่วนลด',
  growth: 'Wishlist, reviews, campaigns, VIP, discounts, and notifications',
  announcements: 'ตั้งประกาศหน้าเว็บและข้อความสำคัญสำหรับลูกค้า',
  messages: 'ส่งข้อความเข้า inbox ให้ผู้ใช้เฉพาะกลุ่มหรือรายคน',
  logs: 'ตรวจ audit log และประวัติการทำงานของระบบ',
  settings: 'ตั้งค่าหน้าเว็บ branding รูปภาพ SEO และระบบหลัก',
  owner: 'เครื่องมือระดับเจ้าของระบบ audit webhook queue และภาพรวมเชิงลึก',
}

const SECTION_LABELS = {
  core: 'หลัก',
  operations: 'ปฏิบัติการ',
  business: 'ธุรกิจ',
  system: 'ระบบ',
  owner: 'Owner Only',
}

function getModuleLabel(moduleOrId) {
  const id = typeof moduleOrId === 'string' ? moduleOrId : moduleOrId?.id
  return MODULE_LABELS[id] || moduleOrId?.label || id || 'Admin'
}

function getModuleDescription(moduleOrId) {
  const id = typeof moduleOrId === 'string' ? moduleOrId : moduleOrId?.id
  return MODULE_DESCRIPTIONS[id] || 'จัดการข้อมูลและการทำงานของ backend'
}

function formatClockRemain(seconds) {
  const n = Math.max(0, Number(seconds) || 0)
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = Math.floor(n % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function AdminState({ icon, title, detail, tone = 'accent' }) {
  return (
    <div className="lgx-root lgx-fullstate">
      <div className="lgx-fullstate-panel">
        <div className={`lgx-fullstate-icon tone-${tone}`}>
          <i className={`bi ${icon}`} />
        </div>
        <div className="lgx-fullstate-title">{title}</div>
        {detail ? <div className="lgx-fullstate-detail">{detail}</div> : null}
      </div>
    </div>
  )
}

function ModuleLoadingState() {
  return (
    <>
      <div className="lgx-skeleton-strip">
        {[0, 1, 2, 3].map((idx) => (
          <div className="lgx-skeleton-cell" key={idx}>
            <div className="lgx-skeleton-line" style={{ width: '42%' }} />
            <div className="lgx-skeleton-line" style={{ width: '68%', height: 20 }} />
          </div>
        ))}
      </div>
      <div className="lgx-panel">
        <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="lgx-skeleton-line" style={{ width: '30%' }} />
          <div className="lgx-skeleton-line" />
          <div className="lgx-skeleton-line" style={{ width: '92%' }} />
          <div className="lgx-skeleton-line" style={{ width: '72%' }} />
        </div>
      </div>
    </>
  )
}

function useAdminLTEAssets() {
  useEffect(() => {
    const nodes = []
    for (const asset of ADMINLTE_ASSETS) {
      if (asset.tag === 'link') {
        if (document.querySelector(`link[href="${asset.href}"]`)) continue
        const el = document.createElement('link')
        el.rel = asset.rel
        el.href = asset.href
        document.head.appendChild(el)
        nodes.push(el)
      } else if (asset.tag === 'script') {
        if (document.querySelector(`script[src="${asset.src}"]`)) continue
        const el = document.createElement('script')
        el.src = asset.src
        el.defer = true
        document.head.appendChild(el)
        nodes.push(el)
      }
    }
    return () => {
      // Remove injected <link>/<script> tags
      for (const el of nodes) {
        try { el.remove() } catch { /* */ }
      }
      // Remove AdminLTE skip-links injected into <body>
      document.querySelectorAll('a.skip-link, .skip-link').forEach((el) => {
        try { el.remove() } catch { /* */ }
      })
      // Remove AdminLTE body classes & data attributes
      document.body.classList.remove(
        'layout-fixed', 'sidebar-expand-lg', 'sidebar-mini',
        'sidebar-open', 'sidebar-closed', 'sidebar-collapse',
        'hold-transition', 'sidebar-mini-md', 'sidebar-mini-xs',
        'layout-navbar-fixed', 'layout-footer-fixed',
      )
      document.body.removeAttribute('data-adminlte-style')
      document.body.removeAttribute('data-bs-theme')
    }
  }, [])
}


export default function AdminV3() {
  useAdminLTEAssets()

  const [params, setParams] = useSearchParams()
  const [session, setSession] = useState({ status: 'loading', me: null, error: '' })
  const [rbacState, setRbacState] = useState({ status: 'idle', data: null, error: '' })
  const [moduleStore, setModuleStore] = useState({})
  const [moduleSearch, setModuleSearch] = useState('')

  // ── query states ──
  const [usersQuery, setUsersQuery] = useState(DEFAULT_USERS_QUERY)
  const [supportQuery, setSupportQuery] = useState(DEFAULT_SUPPORT_QUERY)
  const [fulfillmentQuery, setFulfillmentQuery] = useState(DEFAULT_FULFILLMENT_QUERY)
  const [logsQuery, setLogsQuery] = useState(DEFAULT_LOGS_QUERY)
  const [ordersQuery, setOrdersQuery] = useState({ status: '', fulfillmentType: '', search: '', limit: 100 })

  // ── clock & notification states ──
  const [clockedIn, setClockedIn] = useState(false)
  const [clockLoading, setClockLoading] = useState(false)
  const [autoClockOutAt, setAutoClockOutAt] = useState(null)
  const [clockMenuOpen, setClockMenuOpen] = useState(false)
  const clockMenuRef = useRef(null)
  const [notifItems, setNotifItems] = useState([])
  const [notifUnread, setNotifUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)

  const requestSeqRef = useRef(0)

  // ── derived ──
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

  const canAction = useCallback((actionKey) => {
    const fromApi = rbacState?.data?.actions
    if (fromApi && typeof fromApi === 'object' && actionKey in fromApi) return Boolean(fromApi[actionKey])
    const roles = LOCAL_ROLE_ACTION_ACCESS[actionKey]
    return Array.isArray(roles) && roles.includes(role)
  }, [rbacState?.data?.actions, role])

  // ── session load ──
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
        if (status === 401) { setAuthToken(null); window.location.assign('/login'); return }
        if (status === 403) { if (!cancelled) setSession({ status: 'forbidden', me: null, error: '' }); return }
        if (!cancelled) setSession({ status: 'error', me: null, error: getErrorMessage(err, 'Unable to load admin session') })
      }
    }
    loadSession()
    return () => { cancelled = true }
  }, [])

  // ── redirect if module not allowed ──
  useEffect(() => {
    if (session.status !== 'ready') return
    if (allowedModuleIds.includes(activeModule)) return
    const fallbackModule = allowedModuleIds[0] || 'dashboard'
    const next = new URLSearchParams(params)
    next.set('module', fallbackModule)
    setParams(next)
  }, [session.status, activeModule, allowedModuleIds, params, setParams])

  // ── auto-load module on switch ──
  useEffect(() => {
    if (session.status !== 'ready') return
    void loadModuleData(activeModule)
  }, [activeModule, session.status, usersQuery, supportQuery, fulfillmentQuery, logsQuery])

  // ── socket connect / disconnect with session ──
  useEffect(() => {
    if (session.status !== 'ready') return
    const socket = connectSocket()
    return () => {
      socket.off('dashboard_update')
    }
  }, [session.status])

  // ── dashboard real-time refresh via socket ──
  useEffect(() => {
    if (session.status !== 'ready') return
    const socket = connectSocket()
    const onDashboard = () => {
      if (activeModule === 'dashboard') void loadModuleData('dashboard')
    }
    socket.on('dashboard_update', onDashboard)
    // Fallback polling every 30s (reduced since socket handles real-time)
    const id = window.setInterval(() => {
      if (activeModule === 'dashboard') void loadModuleData('dashboard')
    }, 30000)
    return () => {
      socket.off('dashboard_update', onDashboard)
      window.clearInterval(id)
    }
  }, [session.status, activeModule])

  // ── clock status + notifications ──
  const isStaff = ['booster', 'support', 'admin', 'owner'].includes(role)

  useEffect(() => {
    if (session.status !== 'ready' || !isStaff) return
    fetchJson('/api/staff/clock-status').then(r => {
      setClockedIn(!!r?.clocked_in)
      setAutoClockOutAt(r?.auto_clock_out_at || null)
    }).catch(() => {})
    refreshNotifications()
    // Real-time via socket
    const socket = connectSocket()
    const onNotif = () => refreshNotifications()
    socket.on('notification_update', onNotif)
    // Fallback polling every 60s
    const id = window.setInterval(refreshNotifications, 60000)
    return () => {
      socket.off('notification_update', onNotif)
      window.clearInterval(id)
    }
  }, [session.status, isStaff])

  async function refreshNotifications() {
    try {
      const r = await fetchJson('/api/staff/notifications?limit=20')
      if (r?.items) setNotifItems(r.items)
      if (r?.unread_count != null) setNotifUnread(r.unread_count)
    } catch {}
  }

  async function doClockIn(durationMinutes) {
    if (clockLoading) return
    setClockLoading(true)
    setClockMenuOpen(false)
    try {
      const body = durationMinutes ? { duration_minutes: durationMinutes } : {}
      const r = await fetchJson('/api/staff/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setClockedIn(true)
      setAutoClockOutAt(r?.auto_clock_out_at || null)
    } catch {}
    setClockLoading(false)
  }

  async function doClockOut() {
    if (clockLoading) return
    setClockLoading(true)
    setClockMenuOpen(false)
    try {
      await fetchJson('/api/staff/clock-out', { method: 'POST' })
      setClockedIn(false)
      setAutoClockOutAt(null)
    } catch {}
    setClockLoading(false)
  }

  // Close clock menu on outside click
  useEffect(() => {
    if (!clockMenuOpen) return
    function handle(e) { if (clockMenuRef.current && !clockMenuRef.current.contains(e.target)) setClockMenuOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [clockMenuOpen])

  // Auto-clock-out countdown
  const [autoRemain, setAutoRemain] = useState(null)
  useEffect(() => {
    if (!autoClockOutAt) { setAutoRemain(null); return }
    const calc = () => {
      const diff = Math.max(0, Math.floor((new Date(autoClockOutAt).getTime() - Date.now()) / 1000))
      setAutoRemain(diff)
      if (diff <= 0) {
        setClockedIn(false)
        setAutoClockOutAt(null)
      }
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [autoClockOutAt])

  async function markOneRead(id) {
    try {
      await fetchJson(`/api/staff/notifications/${id}/read`, { method: 'POST' })
      setNotifItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setNotifUnread(prev => Math.max(0, prev - 1))
    } catch {}
  }

  async function markAllRead() {
    try {
      await fetchJson('/api/staff/notifications/read-all', { method: 'POST' })
      setNotifItems(prev => prev.map(n => ({ ...n, is_read: true })))
      setNotifUnread(0)
    } catch {}
  }

  // ── web push subscription ──
  useEffect(() => {
    if (session.status !== 'ready' || !isStaff) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw-push.js')
        const vapidRes = await fetchJson('/api/vapid-public-key').catch(() => null)
        if (!vapidRes?.public_key) return
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidRes.public_key,
        })
        await fetchJson('/api/staff/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        })
      } catch {}
    })()
  }, [session.status, isStaff])

  // click outside to close notification dropdown
  useEffect(() => {
    if (!notifOpen) return
    function onClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [notifOpen])

  // ── module loader ──
  async function loadModuleData(moduleId, options = {}) {
    const requestId = ++requestSeqRef.current
    const current = moduleId || activeModule
    const silent = Boolean(options?.silent)
    if (!silent) {
      setModuleStore((prev) => ({ ...prev, [current]: { ...(prev[current] || {}), status: 'loading', error: '' } }))
    }
    try {
      let data = null
      const r = String(session?.me?.user?.role || '').trim().toLowerCase()
      if (current === 'dashboard') data = await loadDashboardModule()
      else if (current === 'users') data = await loadUsersModule(usersQuery)
      else if (current === 'support') {
        const prevSupport = moduleStore?.support?.data || null
        data = await loadSupportModule(supportQuery, prevSupport?.selectedTicketId)
      }
      else if (current === 'fulfillment') data = await loadFulfillmentModule(fulfillmentQuery)
      else if (current === 'logs') data = r === 'owner' ? await loadLogsModule(logsQuery) : { logs: [] }
      else if (current === 'settings') data = (r === 'admin' || r === 'owner' || canAction('settings.manage')) ? await loadSettingsModule() : {
        image_settings: normalizeUiImageSettings(DEFAULT_UI_IMAGE_SETTINGS),
        branding_settings: normalizeUiBrandingSettings(DEFAULT_UI_BRANDING_SETTINGS),
        homepage_settings: normalizeHomepageSettings(DEFAULT_HOMEPAGE_SETTINGS),
        site_settings: normalizeSiteSettings(DEFAULT_SITE_SETTINGS),
        topup_settings: normalizeTopupSettings(DEFAULT_TOPUP_SETTINGS),
      }
      else if (current === 'catalog') data = await loadCatalogModule()
      else if (current === 'bundles') data = await loadBundlesModule()
      else if (current === 'promotions') data = await loadPromotionsModule()
      else if (current === 'growth') data = await loadGrowthModule()
      else if (current === 'stock') data = await loadStockModule()
      else if (current === 'automation') data = await loadAutomationModule()
      else if (current === 'announcements') data = await loadAnnouncementsModule()
      else if (current === 'messages') data = await loadMessagesModule()
      else if (current === 'timesheet') data = await loadTimesheetModule(r)
      else if (current === 'orders') data = await loadOrdersModule(ordersQuery)
      else if (current === 'topups') data = await loadTopupsModule()
      else if (current === 'owner') data = r === 'owner' ? await loadOwnerModule() : {}

      if (requestId !== requestSeqRef.current) return
      setModuleStore((prev) => ({ ...prev, [current]: { status: 'ready', data, error: '', loadedAt: Date.now() } }))
    } catch (err) {
      if (requestId !== requestSeqRef.current) return
      setModuleStore((prev) => ({ ...prev, [current]: { status: 'error', data: silent ? (prev[current]?.data || null) : null, error: getErrorMessage(err, `Unable to load ${current}`), loadedAt: Date.now() } }))
    }
  }

  function selectModule(id) {
    const next = new URLSearchParams(params)
    next.set('module', id)
    setParams(next)
  }

  function logout() {
    setAuthToken(null)
    window.location.assign('/login')
  }

  function patchModuleData(moduleId, mutator) {
    setModuleStore((prev) => {
      const current = prev[moduleId] || { status: 'ready', data: null, error: '', loadedAt: 0 }
      const currentData = current?.data || {}
      const nextData = typeof mutator === 'function' ? mutator(currentData) : currentData
      return { ...prev, [moduleId]: { ...current, data: nextData, loadedAt: Date.now() } }
    })
  }

  // ── loading / error / forbidden states ──
  if (session.status === 'loading') {
    return <AdminState icon="bi-lightning-charge" title="กำลังเปิด Backend" detail="กำลังตรวจ session และสิทธิ์การเข้าถึง" />
  }

  if (session.status === 'forbidden') {
    return <AdminState icon="bi-shield-exclamation" title="ไม่มีสิทธิ์เข้า Backend" detail="บัญชีนี้ยังไม่ได้รับสิทธิ์ staff/admin" tone="crit" />
  }

  if (session.status === 'error') {
    return <AdminState icon="bi-exclamation-triangle" title="โหลด Backend ไม่สำเร็จ" detail={session.error} tone="crit" />
  }

  const me = session.me
  const displayName = me?.user?.display_name || me?.user?.email || 'admin'
  const currentModuleMeta = MODULES.find((m) => m.id === activeModule)
  const moduleSearchText = String(moduleSearch || '').trim().toLowerCase()
  const visibleModuleSections = MODULE_SECTIONS.map((section) => {
    const modules = MODULES.filter((m) => {
      if (m.section !== section.id || !allowedModuleIds.includes(m.id)) return false
      if (!moduleSearchText) return true
      const haystack = `${m.id} ${getModuleLabel(m)} ${getModuleDescription(m)}`.toLowerCase()
      return haystack.includes(moduleSearchText)
    })
    return { ...section, modules }
  }).filter((section) => section.modules.length > 0)
  const quickModules = ['dashboard', 'orders', 'support', 'fulfillment', 'settings']
    .filter((id) => allowedModuleIds.includes(id))
    .map((id) => MODULES.find((m) => m.id === id))
    .filter(Boolean)
  const activeLoadedAt = activeModuleState?.loadedAt ? new Date(activeModuleState.loadedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''

  // ── Shared context for child modules ──
  const ctx = {
    session, me, role, activeModule, canAction, rbacState,
    loadModuleData, patchModuleData, moduleStore, setModuleStore,
    usersQuery, setUsersQuery, supportQuery, setSupportQuery,
    fulfillmentQuery, setFulfillmentQuery, logsQuery, setLogsQuery,
    fetchJson, resolveApiUrl,
  }

  // ── Render active module ──
  function renderModule() {
    if (activeModuleState.status === 'loading') {
      return <ModuleLoadingState />
    }
    if (activeModuleState.status === 'error') {
      return (
        <div className="lgx-panel" style={{ borderColor: 'var(--lgx-crit)' }}>
          <div className="lgx-panel-body">
            <div style={{ fontWeight: 700, color: 'var(--lgx-crit)' }}><i className="bi bi-exclamation-triangle" style={{ marginRight: 6 }} />โหลดโมดูลไม่สำเร็จ</div>
            <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--lgx-text-muted)' }}>{activeModuleState.error}</div>
          </div>
        </div>
      )
    }
    if (activeModuleState.status !== 'ready') return null

    const data = activeModuleState.data
    switch (activeModule) {
      case 'dashboard': return <DashboardModule data={data} ctx={ctx} />
      case 'users': return <UsersModule data={data} ctx={ctx} />
      case 'support': return <SupportModule data={data} ctx={ctx} />
      case 'fulfillment': return <FulfillmentModule data={data} ctx={ctx} />
      case 'catalog': return <CatalogModule data={data} ctx={ctx} />
      case 'stock': return <StockModule data={data} ctx={ctx} />
      case 'bundles': return <BundlesModule data={data} ctx={ctx} />
      case 'promotions': return <PromotionsModule data={data} ctx={ctx} />
      case 'growth': return <GrowthModule data={data} ctx={ctx} />
      case 'logs': return <LogsModule data={data} ctx={ctx} />
      case 'settings': return <SettingsModule data={data} ctx={ctx} />
      case 'automation': return <AutomationModule data={data} ctx={ctx} />
      case 'topups': return <TopupsModule data={data} ctx={ctx} />
      case 'announcements': return <AnnouncementsModule data={data} ctx={ctx} />
      case 'messages': return <MessagesModule data={data} ctx={ctx} />
      case 'timesheet': return <TimesheetModule data={data} ctx={ctx} />
      case 'orders': return <OrdersModule data={data} ctx={ctx} />
      case 'owner': return role === 'owner' ? <OwnerModule data={data} ctx={ctx} /> : <div className="alert alert-danger m-4"><i className="bi bi-shield-x me-2"></i>เฉพาะ Owner เท่านั้น</div>
      default:
        return (
          <div className="alert alert-info m-4">
            <strong>{getModuleLabel(currentModuleMeta) || 'Module'}</strong> อยู่ระหว่างปรับโครงสร้างใหม่
          </div>
        )
    }
  }

  function onNotifItemLink(link) {
    const match = String(link || '').match(/module=(\w+)/)
    if (match) { setParams({ module: match[1] }); setNotifOpen(false) }
  }

  return (
    <LedgerShell
      footer={<><span><strong>VXPERS</strong> operations</span><span>Backend console</span></>}
      topBarProps={{
        onBrandClick: () => selectModule('dashboard'),
        search: moduleSearch,
        onSearchChange: setModuleSearch,
        isStaff,
        clockedIn,
        clockLoading,
        clockMenuOpen,
        setClockMenuOpen,
        clockMenuRef,
        autoRemain,
        formatClockRemain,
        onClockIn: doClockIn,
        onClockOut: doClockOut,
        notifItems,
        notifUnread,
        notifOpen,
        setNotifOpen,
        notifRef,
        onNotifOpen: refreshNotifications,
        onMarkAllRead: markAllRead,
        onMarkOneRead: markOneRead,
        onNotifItemLink,
        displayName,
        role,
        meUser: me?.user,
        onLogout: logout,
      }}
      tabNavProps={{
        sections: visibleModuleSections,
        activeModule,
        onSelectModule: selectModule,
        getModuleLabel,
        getModuleDescription,
      }}
    >
      <PageBar
        title={getModuleLabel(currentModuleMeta)}
        subtitle={getModuleDescription(currentModuleMeta)}
        quickModules={quickModules}
        activeModule={activeModule}
        onSelectModule={selectModule}
        getModuleLabel={getModuleLabel}
        showStorageLink={role === 'owner'}
        onRefresh={() => loadModuleData(activeModule)}
        updatedAt={activeLoadedAt}
      />
      <div className="lgx-content">
        {rbacState.status === 'error' ? (
          <div className="lgx-pill warn" style={{ width: 'fit-content' }}>
            <i className="bi bi-exclamation-triangle" />RBAC fallback mode
          </div>
        ) : null}
        {renderModule()}
      </div>
    </LedgerShell>
  )
}
