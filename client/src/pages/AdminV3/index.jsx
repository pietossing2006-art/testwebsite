import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchJson, resolveApiUrl, setAuthToken } from '../../api.js'
import { connectSocket, disconnectSocket } from '../../socket.js'
import UserAvatar from '../../components/UserAvatar.jsx'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../../uiImageSettings.js'
import { DEFAULT_UI_BRANDING_SETTINGS, normalizeUiBrandingSettings } from '../../uiBrandingSettings.js'
import {
  MODULES, MODULE_SECTIONS, LOCAL_ROLE_MODULE_ACCESS, LOCAL_ROLE_ACTION_ACCESS, USER_ROLE_OPTIONS,
  DEFAULT_USERS_QUERY, DEFAULT_SUPPORT_QUERY, DEFAULT_FULFILLMENT_QUERY, DEFAULT_LOGS_QUERY,
  DEFAULT_CATALOG_FILTER, DEFAULT_CATEGORY_FORM, DEFAULT_PRODUCT_FORM, DEFAULT_PRODUCT_OPTION_DRAFT,
  DEFAULT_COUPON_FORM, DEFAULT_PROMOTION_FORM, DEFAULT_DISCOUNT_COUPON_FORM,
  DEFAULT_POOL_FORM, DEFAULT_STOCK_ITEM_EDIT, DEFAULT_MYSTERY_FORM, DEFAULT_MYSTERY_EDIT,
  DEFAULT_MYSTERY_SIMULATION, DEFAULT_AUTOMATION_RULE_FORM, EMPTY_SETTINGS_FIELD_ERRORS,
  DEFAULT_HOMEPAGE_SETTINGS, DEFAULT_SITE_SETTINGS,
  pickNumber, formatNumber, formatMinutes, formatDateTime, formatRelativeTime,
  isoToLocalInput, getErrorMessage, getSupportStatusMeta, getSupportWaitingMeta,
  formatDiscountSummary, getPromotionStatusMeta, getCouponStatusMeta,
  makeSlug, normalizeCatalogFulfillmentType, normalizeCustomFormFieldId,
  normalizeProductOptionId, createCustomFormFieldDraft, normalizeProductCustomFormFields,
  normalizeCustomFormFieldsForSubmit, normalizeProductOptionsForSubmit,
  splitStockLines, normalizeSupportAttachments, computeMysteryChanceMeta,
  formatMysteryChancePercent, formatMysteryEffectiveWeight, buildFallbackRbac,
  normalizeHomepageSettings, normalizeSiteSettings,
} from './helpers.js'
import {
  loadDashboardModule, loadUsersModule, loadSupportModule, loadSupportTicketDetail,
  loadFulfillmentModule, loadFulfillmentRequestDetail, loadLogsModule, loadSettingsModule,
  loadCatalogModule, loadPromotionsModule, loadStockModule, loadAutomationModule,
  loadAnnouncementsModule, loadMessagesModule, loadTimesheetModule, loadOwnerModule,
  loadOrdersModule, loadBundlesModule,
} from './loaders.js'
import DashboardModule from './modules/DashboardModule.jsx'
import UsersModule from './modules/UsersModule.jsx'
import SupportModule from './modules/SupportModule.jsx'
import FulfillmentModule from './modules/FulfillmentModule.jsx'
import CatalogModule from './modules/CatalogModule.jsx'
import StockModule from './modules/StockModule.jsx'
import PromotionsModule from './modules/PromotionsModule.jsx'
import BundlesModule from './modules/BundlesModule.jsx'
import LogsModule from './modules/LogsModule.jsx'
import SettingsModule from './modules/SettingsModule.jsx'
import AutomationModule from './modules/AutomationModule.jsx'
import AnnouncementsModule from './modules/AnnouncementsModule.jsx'
import MessagesModule from './modules/MessagesModule.jsx'
import OwnerModule from './modules/OwnerModule.jsx'
import TimesheetModule from './modules/TimesheetModule.jsx'
import OrdersModule from './modules/OrdersModule.jsx'
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
  automation: 'อัตโนมัติ',
  bundles: 'Bundle',
  promotions: 'โปรโมชั่น',
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
  timesheet: 'บันทึกเวลาเข้างาน ออกงาน และตรวจรอบการทำงานของทีม',
  automation: 'ตั้งกฎ workflow และดูเหตุการณ์ที่ระบบจัดการอัตโนมัติ',
  bundles: 'สร้างชุดสินค้าและแคมเปญแบบ bundle',
  promotions: 'จัดการคูปอง โปรโมชัน และส่วนลด',
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

function getSectionLabel(section) {
  const id = typeof section === 'string' ? section : section?.id
  return SECTION_LABELS[id] || section?.label || id || ''
}

function formatClockRemain(seconds) {
  const n = Math.max(0, Number(seconds) || 0)
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = Math.floor(n % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function AdminState({ icon, title, detail, tone = 'primary' }) {
  return (
    <div className="admin-state">
      <div className="admin-state-panel">
        <div className={`mx-auto mb-3 d-grid place-items-center rounded-circle text-bg-${tone}`} style={{ width: 52, height: 52, display: 'grid', placeItems: 'center' }}>
          <i className={`bi ${icon} fs-4`} />
        </div>
        <h4 className="fw-bold mb-1">{title}</h4>
        {detail ? <div className="text-secondary small">{detail}</div> : null}
      </div>
    </div>
  )
}

function ModuleLoadingState() {
  return (
    <div className="p-4">
      <div className="row g-3 mb-4">
        {[0, 1, 2, 3].map((idx) => (
          <div className="col-6 col-lg-3" key={idx}>
            <div className="card border-0">
              <div className="card-body">
                <div className="admin-skeleton-line mb-3" style={{ width: '42%' }} />
                <div className="admin-skeleton-line mb-2" style={{ width: '78%', height: 24 }} />
                <div className="admin-skeleton-line" style={{ width: '56%' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card border-0">
        <div className="card-body">
          <div className="admin-skeleton-line mb-3" style={{ width: '30%' }} />
          <div className="admin-skeleton-line mb-2" />
          <div className="admin-skeleton-line mb-2" style={{ width: '92%' }} />
          <div className="admin-skeleton-line" style={{ width: '72%' }} />
        </div>
      </div>
    </div>
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

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 992
}

function useSidebar() {
  const [isMobile, setIsMobile] = useState(() => isMobileViewport())
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileViewport())

  useEffect(() => {
    const onResize = () => {
      const nextIsMobile = isMobileViewport()
      setIsMobile(nextIsMobile)
      setSidebarOpen(!nextIsMobile)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function toggleSidebar() {
    setSidebarOpen((v) => !v)
  }

  function closeSidebarOnMobile() {
    if (isMobileViewport()) setSidebarOpen(false)
  }

  return { sidebarOpen, setSidebarOpen, toggleSidebar, closeSidebarOnMobile, isMobile }
}

export default function AdminV3() {
  useAdminLTEAssets()

  const [params, setParams] = useSearchParams()
  const [session, setSession] = useState({ status: 'loading', me: null, error: '' })
  const [rbacState, setRbacState] = useState({ status: 'idle', data: null, error: '' })
  const [moduleStore, setModuleStore] = useState({})
  const [moduleSearch, setModuleSearch] = useState('')
  const { sidebarOpen, toggleSidebar, closeSidebarOnMobile, isMobile } = useSidebar()

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
  async function loadModuleData(moduleId) {
    const requestId = ++requestSeqRef.current
    const current = moduleId || activeModule
    setModuleStore((prev) => ({ ...prev, [current]: { ...(prev[current] || {}), status: 'loading', error: '' } }))
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
      else if (current === 'settings') data = (r === 'admin' || r === 'owner') ? await loadSettingsModule() : {
        image_settings: normalizeUiImageSettings(DEFAULT_UI_IMAGE_SETTINGS),
        branding_settings: normalizeUiBrandingSettings(DEFAULT_UI_BRANDING_SETTINGS),
        homepage_settings: normalizeHomepageSettings(DEFAULT_HOMEPAGE_SETTINGS),
      }
      else if (current === 'catalog') data = await loadCatalogModule()
      else if (current === 'bundles') data = await loadBundlesModule()
      else if (current === 'promotions') data = await loadPromotionsModule()
      else if (current === 'stock') data = await loadStockModule()
      else if (current === 'automation') data = await loadAutomationModule()
      else if (current === 'announcements') data = await loadAnnouncementsModule()
      else if (current === 'messages') data = await loadMessagesModule()
      else if (current === 'timesheet') data = await loadTimesheetModule(r)
      else if (current === 'orders') data = await loadOrdersModule(ordersQuery)
      else if (current === 'owner') data = r === 'owner' ? await loadOwnerModule() : {}

      if (requestId !== requestSeqRef.current) return
      setModuleStore((prev) => ({ ...prev, [current]: { status: 'ready', data, error: '', loadedAt: Date.now() } }))
    } catch (err) {
      if (requestId !== requestSeqRef.current) return
      setModuleStore((prev) => ({ ...prev, [current]: { status: 'error', data: null, error: getErrorMessage(err, `Unable to load ${current}`), loadedAt: Date.now() } }))
    }
  }

  function selectModule(id) {
    const next = new URLSearchParams(params)
    next.set('module', id)
    setParams(next)
    closeSidebarOnMobile()
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
    return (
      <div className="admin-v3-shell">
        <AdminState icon="bi-lightning-charge" title="กำลังเปิด Backend" detail="กำลังตรวจ session และสิทธิ์การเข้าถึง" />
      </div>
    )
  }

  if (session.status === 'forbidden') {
    return (
      <div className="admin-v3-shell">
        <AdminState icon="bi-shield-exclamation" title="ไม่มีสิทธิ์เข้า Backend" detail="บัญชีนี้ยังไม่ได้รับสิทธิ์ staff/admin" tone="danger" />
      </div>
    )
  }

  if (session.status === 'error') {
    return (
      <div className="admin-v3-shell">
        <AdminState icon="bi-exclamation-triangle" title="โหลด Backend ไม่สำเร็จ" detail={session.error} tone="danger" />
      </div>
    )
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
        <div className="p-4">
          <div className="alert alert-danger mb-0">
            <div className="fw-bold"><i className="bi bi-exclamation-triangle me-2" />โหลดโมดูลไม่สำเร็จ</div>
            <div className="small mt-1">{activeModuleState.error}</div>
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
      case 'logs': return <LogsModule data={data} ctx={ctx} />
      case 'settings': return <SettingsModule data={data} ctx={ctx} />
      case 'automation': return <AutomationModule data={data} ctx={ctx} />
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

  return (
    <div className="admin-v3-shell layout-fixed" style={{ minHeight: '100vh' }}>
      <div className={`app-wrapper ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapse'}`}>
        {/* ── Topbar ── */}
        <nav className="app-header navbar navbar-expand admin-topbar">
          <div className="container-fluid">
            <ul className="navbar-nav">
              <li className="nav-item">
                <button
                  className="admin-icon-btn"
                  onClick={toggleSidebar}
                  aria-label="Toggle sidebar"
                >
                  <i className="bi bi-list"></i>
                </button>
              </li>
              <li className="nav-item d-none d-md-block">
                <span className="nav-link fw-bold text-dark">{getModuleLabel(currentModuleMeta)}</span>
              </li>
            </ul>
            <ul className="navbar-nav ms-auto">
              {isStaff && (
                <li className="nav-item" ref={clockMenuRef} style={{ position: 'relative' }}>
                  {clockedIn ? (
                    <button
                      className="nav-link btn btn-link text-success"
                      onClick={doClockOut}
                      disabled={clockLoading}
                      title="ออกงาน (Clock Out)"
                    >
                      <i className="bi bi-clock-fill"></i>
                      <span className="d-none d-md-inline ms-1" style={{ fontSize: '0.75rem' }}>
                        {clockLoading ? '...' : autoRemain != null && autoRemain > 0 ? formatClockRemain(autoRemain) : 'ออกงาน'}
                      </span>
                    </button>
                  ) : (
                    <button
                      className="nav-link btn btn-link text-secondary"
                      onClick={() => setClockMenuOpen(p => !p)}
                      disabled={clockLoading}
                      title="เข้างาน (Clock In)"
                    >
                      <i className="bi bi-clock"></i>
                      <span className="d-none d-md-inline ms-1" style={{ fontSize: '0.75rem' }}>
                        {clockLoading ? '...' : 'เข้างาน'}
                      </span>
                    </button>
                  )}
                  {clockMenuOpen && !clockedIn && (
                    <div className="dropdown-menu show shadow" style={{ position: 'absolute', right: 0, top: '100%', width: 220, zIndex: 1050 }}>
                      <div className="px-3 py-2 border-bottom"><strong style={{ fontSize: '0.85rem' }}>เลือกระยะเวลาเข้างาน</strong></div>
                      <button className="dropdown-item py-2" onClick={() => doClockIn(null)}>
                        <i className="bi bi-infinity me-2"></i>ไม่กำหนด (ออกเอง)
                      </button>
                      {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(h => (
                        <button key={h} className="dropdown-item py-2" onClick={() => doClockIn(h * 60)}>
                          <i className="bi bi-alarm me-2"></i>{h} ชั่วโมง
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              )}
              {isStaff && (
                <li className="nav-item" ref={notifRef} style={{ position: 'relative' }}>
                  <button className="admin-icon-btn position-relative" onClick={() => { setNotifOpen(p => !p); if (!notifOpen) refreshNotifications() }} title="แจ้งเตือน">
                    <i className="bi bi-bell"></i>
                    {notifUnread > 0 && (
                      <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '0.6rem' }}>
                        {notifUnread > 99 ? '99+' : notifUnread}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="dropdown-menu dropdown-menu-end show shadow" style={{ position: 'absolute', right: 0, top: '100%', width: 340, maxHeight: 420, overflowY: 'auto', zIndex: 1050 }}>
                      <div className="px-3 py-2 d-flex justify-content-between align-items-center border-bottom">
                        <strong>แจ้งเตือน</strong>
                        {notifUnread > 0 && <button className="btn btn-link btn-sm p-0" onClick={markAllRead}>อ่านทั้งหมด</button>}
                      </div>
                      {notifItems.length === 0 ? (
                        <div className="px-3 py-4 text-center text-secondary" style={{ fontSize: '0.85rem' }}>ไม่มีแจ้งเตือน</div>
                      ) : notifItems.map(n => (
                        <div
                          key={n.id}
                          className={`dropdown-item d-flex flex-column px-3 py-2 ${!n.is_read ? 'bg-light' : ''}`}
                          style={{ cursor: 'pointer', whiteSpace: 'normal', borderBottom: '1px solid #eee' }}
                          onClick={() => {
                            if (!n.is_read) markOneRead(n.id)
                            if (n.link) {
                              const match = n.link.match(/module=(\w+)/)
                              if (match) { setParams({ module: match[1] }); setNotifOpen(false) }
                            }
                          }}
                        >
                          <div className="d-flex justify-content-between">
                            <strong style={{ fontSize: '0.8rem' }}>{n.title}</strong>
                            {!n.is_read && <span className="badge bg-primary" style={{ fontSize: '0.55rem' }}>ใหม่</span>}
                          </div>
                          <small className="text-secondary" style={{ fontSize: '0.75rem' }}>{n.body}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )}
              <li className="nav-item dropdown user-menu">
                <a href="#" className="nav-link dropdown-toggle d-flex align-items-center gap-2" data-bs-toggle="dropdown">
                  <UserAvatar user={me?.user} size={28} rounded="full" />
                  <span className="d-none d-md-inline">{displayName}</span>
                </a>
                <ul className="dropdown-menu dropdown-menu-end">
                  <li className="px-3 py-2">
                    <div className="fw-bold">{displayName}</div>
                    <small className="text-secondary">{role}</small>
                  </li>
                  <li><hr className="dropdown-divider" /></li>
                  <li><Link to="/" className="dropdown-item"><i className="bi bi-house me-2"></i>กลับหน้าเว็บ</Link></li>
                  <li><button className="dropdown-item text-danger" onClick={logout}><i className="bi bi-box-arrow-right me-2"></i>ออกจากระบบ</button></li>
                </ul>
              </li>
            </ul>
          </div>
        </nav>

        {/* ── Mobile overlay backdrop ── */}
        {sidebarOpen && isMobile && (
          <div
            onClick={toggleSidebar}
            style={{
              position: 'fixed', inset: 0, zIndex: 1029,
              background: 'rgba(0,0,0,0.5)',
            }}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className="app-sidebar admin-sidebar"
          data-bs-theme="dark"
          style={isMobile ? {
            position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 1030,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            width: '282px',
          } : {
            display: sidebarOpen ? '' : 'none',
          }}
        >
          <div className="sidebar-brand">
            <a href="#" className="brand-link" onClick={(e) => { e.preventDefault(); selectModule('dashboard') }}>
              <span className="brand-mark"><i className="bi bi-command" /></span>
              <span>
                <span className="brand-title d-block">VXPERS Backend</span>
                <span className="brand-subtitle d-block">Operations console</span>
              </span>
            </a>
          </div>
          <div className="admin-sidebar-search">
            <input
              type="search"
              className="form-control"
              placeholder="ค้นหาเมนู..."
              value={moduleSearch}
              onChange={(e) => setModuleSearch(e.target.value)}
            />
          </div>
          <div className="sidebar-wrapper" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 116px)' }}>
            <nav className="mt-2">
              <ul className="nav sidebar-menu flex-column" role="navigation">
                {visibleModuleSections.map((section) => (
                  <li className="nav-section" key={section.id}>
                    <div className="nav-header">{getSectionLabel(section).toUpperCase()}</div>
                    {section.modules.map((mod) => (
                      <div className="nav-item" key={mod.id}>
                        <a
                          href="#"
                          className={`nav-link ${activeModule === mod.id ? 'active' : ''}`}
                          onClick={(e) => { e.preventDefault(); selectModule(mod.id) }}
                          title={getModuleDescription(mod)}
                        >
                          <i className={`nav-icon bi ${mod.icon}`}></i>
                          <p>{getModuleLabel(mod)}</p>
                        </a>
                      </div>
                    ))}
                  </li>
                ))}
                {!visibleModuleSections.length ? (
                  <li className="px-3 py-4 text-center text-white-50 small">ไม่พบเมนูที่ค้นหา</li>
                ) : null}
              </ul>
            </nav>

            {rbacState.status === 'error' && (
              <div className="mx-2 mb-2">
                <div className="alert alert-warning py-1 px-2 mb-0" style={{ fontSize: '11px' }}>
                  <i className="bi bi-exclamation-triangle me-1"></i>RBAC fallback mode
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="app-main" style={!isMobile && !sidebarOpen ? { marginLeft: 0 } : {}}>
          <div className="app-content-header">
            <div className="container-fluid">
              <div className="row g-3 align-items-end">
                <div className="col-lg-7">
                  <div className="admin-chip mb-2">
                    <i className={`bi ${currentModuleMeta?.icon || 'bi-speedometer'}`} />
                    {role}
                  </div>
                  <h1 className="admin-page-title">{getModuleLabel(currentModuleMeta)}</h1>
                  <div className="admin-page-subtitle">{getModuleDescription(currentModuleMeta)}</div>
                </div>
                <div className="col-lg-5">
                  <div className="d-flex flex-wrap justify-content-lg-end gap-2">
                    {quickModules.map((mod) => (
                      <button
                        type="button"
                        className={`admin-chip ${activeModule === mod.id ? 'border-info text-info' : ''}`}
                        key={mod.id}
                        onClick={() => selectModule(mod.id)}
                      >
                        <i className={`bi ${mod.icon}`} />
                        {getModuleLabel(mod)}
                      </button>
                    ))}
                    {role === 'owner' ? (
                      <Link to="/admin/storage" className="admin-chip">
                        <i className="bi bi-hdd-stack" />
                        Storage
                      </Link>
                    ) : null}
                    <button type="button" className="admin-chip" onClick={() => loadModuleData(activeModule)}>
                      <i className="bi bi-arrow-clockwise" />
                      รีเฟรช
                    </button>
                  </div>
                  {activeLoadedAt ? <div className="mt-2 text-lg-end text-secondary small">อัปเดตล่าสุด {activeLoadedAt}</div> : null}
                </div>
              </div>
            </div>
          </div>
          <div className="app-content">
            <div className="container-fluid">
              <div className="admin-module-body">
                {renderModule()}
              </div>
            </div>
          </div>
        </main>

        {/* ── Footer ── */}
        <footer className="app-footer">
          <div className="float-end d-none d-sm-inline">Backend console</div>
          <strong>VXPERS</strong> operations
        </footer>
      </div>
    </div>
  )
}
