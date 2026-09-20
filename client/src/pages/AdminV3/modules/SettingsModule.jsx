import { useState, useEffect, useMemo } from 'react'
import ImageUploadCropper from '../../../components/admin/ImageUploadCropper.jsx'
import {
  getErrorMessage, normalizeHomepageSettings, normalizeSiteSettings, normalizeTopupSettings,
  DEFAULT_TOPUP_SETTINGS,
} from '../helpers.js'
import { normalizeUiImageSettings } from '../../../uiImageSettings.js'
import { normalizeUiBrandingSettings } from '../../../uiBrandingSettings.js'

const AUTO_ASSIGN_ROLE_OPTIONS = [
  { value: 'booster', label: 'Booster' },
  { value: 'support', label: 'Support' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
]

const TABS = [
  { id: 'branding', label: 'แบรนด์', icon: 'bi-palette' },
  { id: 'topup', label: 'ระบบเติมเงิน', icon: 'bi-wallet2' },
  { id: 'image', label: 'รูปภาพ', icon: 'bi-image' },
  { id: 'homepage', label: 'หน้าแรก', icon: 'bi-house' },
  { id: 'site', label: 'เว็บไซต์', icon: 'bi-globe' },
  { id: 'auto_assign', label: 'มอบหมายอัตโนมัติ', icon: 'bi-person-check' },
]

function isFieldDirty(current, saved) {
  if (current === saved) return false
  if (current == null && saved == null) return false
  if (typeof current === 'object' || typeof saved === 'object') {
    return JSON.stringify(current ?? null) !== JSON.stringify(saved ?? null)
  }
  return String(current ?? '').trim() !== String(saved ?? '').trim()
}

function InlineSaveButton({ isDirty, isSaving, onSave, label = 'บันทึก' }) {
  if (!isDirty) return null
  return (
    <button
      type="button"
      className="lgx-btn lgx-btn-accent"
      style={{
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={onSave}
      disabled={isSaving}
      title="บันทึกจุดที่แก้ไขนี้ทันที"
    >
      <i className={`bi ${isSaving ? 'bi-arrow-repeat' : 'bi-check-lg'}`} style={{ fontSize: 13, animation: isSaving ? 'spin 1s linear infinite' : undefined }} />
      {isSaving ? 'กำลังบันทึก...' : label}
    </button>
  )
}

function ToggleRow({ icon, title, desc, checked, onChange, disabled, isDirty, onSave, isSaving }) {
  return (
    <div style={{ padding: 14, borderRadius: 'var(--lgx-radius)', border: '1.5px solid var(--lgx-border)', background: checked ? 'var(--lgx-surface)' : 'var(--lgx-surface-alt)', opacity: checked ? 1 : 0.8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="lgx-avatar" style={{ width: 40, height: 40, background: checked ? 'var(--lgx-accent-soft)' : 'var(--lgx-surface-alt)', color: checked ? 'var(--lgx-accent)' : 'var(--lgx-text-muted)' }}><i className={`bi ${icon}`} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700 }}>{title}</span>
              <span className={`lgx-pill ${checked ? 'ok' : 'neutral'}`}>{checked ? 'เปิดใช้งาน' : 'ปิดอยู่'}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 2 }}>{desc}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InlineSaveButton isDirty={isDirty} isSaving={isSaving} onSave={onSave} label="บันทึก" />
          <label className="lgx-switch"><input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} /></label>
        </div>
      </div>
    </div>
  )
}

function formatPhoneNumber(num) {
  const clean = String(num || '').replace(/\D/g, '')
  if (clean.length === 10) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`
  if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`
  if (clean.length === 13) return `${clean.slice(0, 1)}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`
  return String(num || '').trim()
}

export default function SettingsModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const urlTab = new URLSearchParams(window.location.search).get('tab')
      if (urlTab && TABS.some((t) => t.id === urlTab)) return urlTab
      const saved = sessionStorage.getItem('adminv3_settings_tab')
      if (saved && TABS.some((t) => t.id === saved)) return saved
    } catch (_) {}
    return 'branding'
  })

  function handleSelectTab(tabId) {
    setActiveTab(tabId)
    try {
      sessionStorage.setItem('adminv3_settings_tab', tabId)
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tabId)
      window.history.replaceState(null, '', url.toString())
    } catch (_) {}
  }

  const [imageSettings, setImageSettings] = useState(normalizeUiImageSettings(data?.image_settings))
  const [brandingSettings, setBrandingSettings] = useState(normalizeUiBrandingSettings(data?.branding_settings))
  const [homepageSettings, setHomepageSettings] = useState(normalizeHomepageSettings(data?.homepage_settings))
  const [siteSettings, setSiteSettings] = useState(normalizeSiteSettings(data?.site_settings))
  const [topupSettings, setTopupSettings] = useState(normalizeTopupSettings(data?.topup_settings))
  const [autoAssignConfig, setAutoAssignConfig] = useState({ enabled: false, roles: ['booster'] })
  const [initialAutoAssign, setInitialAutoAssign] = useState({ enabled: false, roles: ['booster'] })
  const [autoAssignLoaded, setAutoAssignLoaded] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [productListOptions, setProductListOptions] = useState([])
  const [productsLoaded, setProductsLoaded] = useState(false)

  const savedImage = useMemo(() => normalizeUiImageSettings(data?.image_settings), [data?.image_settings])
  const savedBranding = useMemo(() => normalizeUiBrandingSettings(data?.branding_settings), [data?.branding_settings])
  const savedHomepage = useMemo(() => normalizeHomepageSettings(data?.homepage_settings), [data?.homepage_settings])
  const savedSite = useMemo(() => normalizeSiteSettings(data?.site_settings), [data?.site_settings])
  const savedTopup = useMemo(() => normalizeTopupSettings(data?.topup_settings), [data?.topup_settings])

  const canManage = canAction('settings.manage')

  useEffect(() => {
    if (!data) return
    const id = setTimeout(() => {
      setImageSettings(normalizeUiImageSettings(data.image_settings))
      setBrandingSettings(normalizeUiBrandingSettings(data.branding_settings))
      setHomepageSettings(normalizeHomepageSettings(data.homepage_settings))
      setSiteSettings(normalizeSiteSettings(data.site_settings))
      setTopupSettings(normalizeTopupSettings(data.topup_settings))
    }, 0)
    return () => clearTimeout(id)
  }, [data])

  useEffect(() => {
    if (activeTab !== 'auto_assign' || autoAssignLoaded) return
    fetchJson('/api/admin/auto-assign-config').then((res) => {
      if (res?.config) {
        setAutoAssignConfig(res.config)
        setInitialAutoAssign(res.config)
      }
      setAutoAssignLoaded(true)
    }).catch(() => setAutoAssignLoaded(true))
  }, [activeTab, autoAssignLoaded, fetchJson])

  useEffect(() => {
    if (activeTab !== 'homepage' || categoriesLoaded) return
    fetchJson('/api/admin/categories').then((res) => {
      setCategoryOptions(Array.isArray(res?.categories) ? res.categories : [])
      setCategoriesLoaded(true)
    }).catch(() => setCategoriesLoaded(true))
  }, [activeTab, categoriesLoaded, fetchJson])

  useEffect(() => {
    if (activeTab !== 'homepage' || productsLoaded) return
    fetchJson('/api/admin/products').then((res) => {
      setProductListOptions(Array.isArray(res?.products) ? res.products : [])
      setProductsLoaded(true)
    }).catch(() => {
      fetchJson('/api/products').then((res) => {
        setProductListOptions(Array.isArray(res?.products) ? res.products : [])
        setProductsLoaded(true)
      }).catch(() => setProductsLoaded(true))
    })
  }, [activeTab, productsLoaded, fetchJson])

  async function saveAutoAssignConfig() {
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึกการมอบหมายงาน...' })
      const res = await fetchJson('/api/admin/auto-assign-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: autoAssignConfig }) })
      if (res?.config) {
        setAutoAssignConfig(res.config)
        setInitialAutoAssign(res.config)
      }
      setActionState({ status: 'success', message: 'บันทึกการมอบหมายอัตโนมัติเรียบร้อย' })
      if (typeof loadModuleData === 'function') {
        await loadModuleData('settings', { silent: true })
      }
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function saveSettings(section) {
    const targetSection = section || activeTab
    const tabLabel = TABS.find((t) => t.id === targetSection)?.label || targetSection
    try {
      setActionState({ status: 'working', message: `กำลังบันทึกข้อมูลส่วน "${tabLabel}"...` })
      let body = {}
      if (targetSection === 'image') body = { image_settings: imageSettings }
      else if (targetSection === 'branding') body = { branding_settings: brandingSettings }
      else if (targetSection === 'homepage') body = { homepage_settings: homepageSettings }
      else if (targetSection === 'site') body = { site_settings: siteSettings }
      else if (targetSection === 'topup') body = { topup_settings: topupSettings }
      const res = await fetchJson('/api/admin/ui-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res?.topup_settings) setTopupSettings(normalizeTopupSettings(res.topup_settings))
      if (res?.branding_settings) setBrandingSettings(normalizeUiBrandingSettings(res.branding_settings))
      if (res?.image_settings) setImageSettings(normalizeUiImageSettings(res.image_settings))
      if (res?.homepage_settings) setHomepageSettings(normalizeHomepageSettings(res.homepage_settings))
      if (res?.site_settings) setSiteSettings(normalizeSiteSettings(res.site_settings))
      setActionState({ status: 'success', message: `บันทึกข้อมูลส่วน "${tabLabel}" เรียบร้อยแล้ว` })
      if (typeof loadModuleData === 'function') {
        await loadModuleData('settings', { silent: true })
      }
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  const isCurrentPageDirty = useMemo(() => {
    if (activeTab === 'branding') return isFieldDirty(brandingSettings, savedBranding)
    if (activeTab === 'topup') return isFieldDirty(topupSettings, savedTopup)
    if (activeTab === 'image') return isFieldDirty(imageSettings, savedImage)
    if (activeTab === 'homepage') return isFieldDirty(homepageSettings, savedHomepage)
    if (activeTab === 'site') return isFieldDirty(siteSettings, savedSite)
    if (activeTab === 'auto_assign') return isFieldDirty(autoAssignConfig, initialAutoAssign)
    return false
  }, [activeTab, brandingSettings, savedBranding, topupSettings, savedTopup, imageSettings, savedImage, homepageSettings, savedHomepage, siteSettings, savedSite, autoAssignConfig, initialAutoAssign])

  async function saveCurrentPage() {
    if (activeTab === 'auto_assign') {
      await saveAutoAssignConfig()
    } else {
      await saveSettings(activeTab)
    }
  }

  const currentTabMeta = TABS.find((t) => t.id === activeTab) || TABS[0]
  const bannerTone = actionState.status === 'error' ? 'crit' : actionState.status === 'success' ? 'ok' : 'info'
  const enabledChannels = [topupSettings.promptpay, topupSettings.angpao, topupSettings.coupon].filter(Boolean).length

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`lgx-banner ${bannerTone}`}>
          <span>{actionState.message}</span>
          <button type="button" className="lgx-banner-close" onClick={() => setActionState({ status: 'idle', message: '' })}>×</button>
        </div>
      )}

      <div className="lgx-strip">
        <div className="lgx-stat"><div className="l">ชื่อเว็บไซต์</div><div className="v" style={{ fontSize: 18 }}>{brandingSettings.site_name || 'VXPERS'}</div><div className="d">ชื่อแบรนด์หลักของระบบ</div></div>
        <div className="lgx-stat"><div className={`v${autoAssignConfig.enabled ? ' ok' : ''}`} style={{ fontSize: 18 }}>{autoAssignConfig.enabled ? 'เปิดใช้งาน' : 'ปิดอยู่'}</div><div className="l" style={{ order: -1 }}>สถานะ Auto-Assign</div><div className="d">มอบหมายงานบริการอัตโนมัติ</div></div>
        <div className="lgx-stat"><div className="l">ช่องทางเติมเงิน</div><div className="v">{enabledChannels}/3</div><div className="d">เปิดใช้งานอยู่</div></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="lgx-inline-tabs" style={{ margin: 0 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`lgx-inline-tab${activeTab === t.id ? ' is-active' : ''}`}
              onClick={() => handleSelectTab(t.id)}
            >
              <i className={`bi ${t.icon}`} style={{ marginRight: 5 }} />
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="lgx-btn lgx-btn-accent"
            style={{
              boxShadow: isCurrentPageDirty ? '0 0 12px rgba(16, 185, 129, 0.4)' : undefined,
              borderColor: isCurrentPageDirty ? '#10b981' : undefined,
            }}
            onClick={saveCurrentPage}
            disabled={!canManage || actionState.status === 'working'}
            title={`บันทึกการตั้งค่าทั้งหมดของหน้านี้ (${currentTabMeta.label})`}
          >
            <i className="bi bi-floppy2-fill" />
            บันทึกทั้งหมดของหน้านี้ ({currentTabMeta.label})
            {isCurrentPageDirty && (
              <span className="lgx-pill ok" style={{ marginLeft: 6, fontSize: 10, padding: '2px 7px', background: '#10b981', color: '#fff' }}>
                มีจุดที่แก้ไข
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'branding' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>แบรนด์</h2></div>
          <div className="lgx-panel-body">
            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field">
                <label>ชื่อเว็บ</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={brandingSettings.site_name || ''} onChange={(e) => setBrandingSettings((prev) => ({ ...prev, site_name: e.target.value }))} />
                  <InlineSaveButton isDirty={isFieldDirty(brandingSettings.site_name, savedBranding.site_name)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('branding')} />
                </div>
              </div>
              <div className="lgx-field">
                <label>ชื่อ Navbar</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={brandingSettings.navbar_title || ''} onChange={(e) => setBrandingSettings((prev) => ({ ...prev, navbar_title: e.target.value }))} />
                  <InlineSaveButton isDirty={isFieldDirty(brandingSettings.navbar_title, savedBranding.navbar_title)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('branding')} />
                </div>
              </div>
              <div className="lgx-field">
                <label>Tab Title</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={brandingSettings.tab_title || ''} onChange={(e) => setBrandingSettings((prev) => ({ ...prev, tab_title: e.target.value }))} />
                  <InlineSaveButton isDirty={isFieldDirty(brandingSettings.tab_title, savedBranding.tab_title)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('branding')} />
                </div>
              </div>
            </div>
            <div className="lgx-form-grid" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ImageUploadCropper label="Favicon (ไอคอนแท็บเบราว์เซอร์)" value={brandingSettings.favicon_url || ''} onChange={(url) => setBrandingSettings((prev) => ({ ...prev, favicon_url: url }))} aspectRatio={1 / 1} helpText="ไอคอนขนาดสี่เหลี่ยมจัตุรัส 1:1" />
                <InlineSaveButton isDirty={isFieldDirty(brandingSettings.favicon_url, savedBranding.favicon_url)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('branding')} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ImageUploadCropper label="Logo เว็บไซต์" value={brandingSettings.logo_url || ''} onChange={(url) => setBrandingSettings((prev) => ({ ...prev, logo_url: url }))} aspectRatio={16 / 9} helpText="โลโก้หลักของเว็บไซต์" />
                <InlineSaveButton isDirty={isFieldDirty(brandingSettings.logo_url, savedBranding.logo_url)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('branding')} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', display: 'block', marginBottom: 6 }}>Navbar Links</label>
              {(brandingSettings.navbar_links || []).map((link, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input className="lgx-input" placeholder="Label" value={link.label || ''} onChange={(e) => { const next = [...(brandingSettings.navbar_links || [])]; next[i] = { ...next[i], label: e.target.value }; setBrandingSettings((prev) => ({ ...prev, navbar_links: next })) }} />
                  <input className="lgx-input" placeholder="URL" value={link.url || ''} onChange={(e) => { const next = [...(brandingSettings.navbar_links || [])]; next[i] = { ...next[i], url: e.target.value }; setBrandingSettings((prev) => ({ ...prev, navbar_links: next })) }} />
                  <button type="button" className="lgx-icon-action danger" onClick={() => { const next = (brandingSettings.navbar_links || []).filter((_, j) => j !== i); setBrandingSettings((prev) => ({ ...prev, navbar_links: next })) }}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="lgx-btn" onClick={() => setBrandingSettings((prev) => ({ ...prev, navbar_links: [...(prev.navbar_links || []), { label: '', url: '' }] }))}><i className="bi bi-plus" />เพิ่ม Link</button>
                <InlineSaveButton isDirty={isFieldDirty(brandingSettings.navbar_links, savedBranding.navbar_links)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('branding')} />
              </div>
            </div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)' }}>
              แท็บปัจจุบัน: <strong>แบรนด์</strong>
              {isFieldDirty(brandingSettings, savedBranding) && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>• มีจุดที่แก้ไขในหน้านี้</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveCurrentPage} disabled={!canManage || actionState.status === 'working'}><i className="bi bi-floppy2-fill" />บันทึกทั้งหมดของหน้านี้ (แบรนด์)</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'topup' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2><i className="bi bi-wallet2" style={{ marginRight: 6 }} />ช่องทางการเติมเงินและบัญชีรับเงิน</h2><span>เปิดใช้งาน {enabledChannels}/3 ช่องทาง</span></div>
          
          <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Active Status Overview Banner */}
            <div style={{ padding: '12px 16px', borderRadius: 'var(--lgx-radius)', background: 'var(--lgx-surface)', border: '1.5px solid var(--lgx-border)', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981' }} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>สถานะบัญชีรับเงินที่ใช้งานอยู่ปัจจุบัน:</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: topupSettings.truemoney_phone ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.12)', border: topupSettings.truemoney_phone ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.3)', fontSize: 12, fontWeight: 800, color: topupSettings.truemoney_phone ? '#10b981' : '#ef4444' }}>
                  <i className="bi bi-gift-fill" /> TrueMoney: {topupSettings.truemoney_phone ? `ใช้เบอร์ ${formatPhoneNumber(topupSettings.truemoney_phone)}` : 'ยังไม่ระบุเบอร์'}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: topupSettings.promptpay_target ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.12)', border: topupSettings.promptpay_target ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.3)', fontSize: 12, fontWeight: 800, color: topupSettings.promptpay_target ? '#10b981' : '#ef4444' }}>
                  <i className="bi bi-qr-code-scan" /> PromptPay: {topupSettings.promptpay_target ? `ใช้หมายเลข ${formatPhoneNumber(topupSettings.promptpay_target)}` : 'ยังไม่ระบุ'}
                </div>
              </div>
            </div>

            {/* PromptPay */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 'var(--lgx-radius)', border: '1.5px solid var(--lgx-border)', background: topupSettings.promptpay ? 'var(--lgx-surface)' : 'var(--lgx-surface-alt)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="lgx-avatar" style={{ width: 40, height: 40, background: topupSettings.promptpay ? 'var(--lgx-accent-soft)' : 'var(--lgx-surface-alt)', color: topupSettings.promptpay ? 'var(--lgx-accent)' : 'var(--lgx-text-muted)' }}><i className="bi bi-qr-code-scan" /></div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700 }}>PromptPay (สแกน QR & ตรวจสลิปอัตโนมัติ)</span>
                      <span className={`lgx-pill ${topupSettings.promptpay ? 'ok' : 'neutral'}`}>{topupSettings.promptpay ? 'เปิดใช้งาน' : 'ปิดอยู่'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 2 }}>สร้าง QR Code ตามยอดเงิน และอ่านสลิปธนาคารเพื่อเครดิตพอยท์อัตโนมัติ</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <InlineSaveButton isDirty={isFieldDirty(topupSettings.promptpay, savedTopup.promptpay)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('topup')} label="บันทึก" />
                  <label className="lgx-switch"><input type="checkbox" checked={topupSettings.promptpay} onChange={(e) => setTopupSettings((p) => ({ ...p, promptpay: e.target.checked }))} disabled={!canManage} /></label>
                </div>
              </div>
              <div className="lgx-form-grid" style={{ marginTop: 8, borderTop: '1px solid var(--lgx-border)', paddingTop: 12 }}>
                <div className="lgx-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ margin: 0 }}>หมายเลข PromptPay (เบอร์โทร / บัตรประชาชน / PromptPay ID)</label>
                    {topupSettings.promptpay_target ? (
                      <span className="lgx-pill ok" style={{ fontSize: 10.5 }}><i className="bi bi-check-circle-fill" /> ใช้งาน: {formatPhoneNumber(topupSettings.promptpay_target)}</span>
                    ) : (
                      <span className="lgx-pill warn" style={{ fontSize: 10.5 }}><i className="bi bi-exclamation-circle" /> ยังไม่ระบุ</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="lgx-input"
                      value={topupSettings.promptpay_target || ''}
                      onChange={(e) => setTopupSettings((prev) => ({ ...prev, promptpay_target: e.target.value }))}
                      placeholder="เช่น 0952501621 หรือ 1xxxxxxxxxxxx"
                      disabled={!canManage}
                    />
                    <InlineSaveButton isDirty={isFieldDirty(topupSettings.promptpay_target, savedTopup.promptpay_target)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('topup')} />
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>หมายเลขที่ระบบจะใช้สร้าง QR Code รับเงิน</span>
                </div>
                <div className="lgx-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ margin: 0 }}>ชื่อบัญชี PromptPay (แสดงให้ลูกค้าตรวจสอบ)</label>
                    {topupSettings.promptpay_name && (
                      <span className="lgx-pill neutral" style={{ fontSize: 10.5 }}>{topupSettings.promptpay_name}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="lgx-input"
                      value={topupSettings.promptpay_name || ''}
                      onChange={(e) => setTopupSettings((prev) => ({ ...prev, promptpay_name: e.target.value }))}
                      placeholder="เช่น พร้อมเพย์ (PromptPay) หรือชื่อ-นามสกุล"
                      disabled={!canManage}
                    />
                    <InlineSaveButton isDirty={isFieldDirty(topupSettings.promptpay_name, savedTopup.promptpay_name)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('topup')} />
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>ชื่อบัญชีที่จะปรากฏบนหน้าสแกน QR เพื่อให้ลูกค้าตรวจสอบความถูกต้อง</span>
                </div>
              </div>
            </div>

            {/* TrueMoney Angpao */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 'var(--lgx-radius)', border: '1.5px solid var(--lgx-border)', background: topupSettings.angpao ? 'var(--lgx-surface)' : 'var(--lgx-surface-alt)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="lgx-avatar" style={{ width: 40, height: 40, background: topupSettings.angpao ? 'var(--lgx-accent-soft)' : 'var(--lgx-surface-alt)', color: topupSettings.angpao ? 'var(--lgx-accent)' : 'var(--lgx-text-muted)' }}><i className="bi bi-gift-fill" /></div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700 }}>ซองของขวัญ TrueMoney (Angpao Voucher)</span>
                      <span className={`lgx-pill ${topupSettings.angpao ? 'ok' : 'neutral'}`}>{topupSettings.angpao ? 'เปิดใช้งาน' : 'ปิดอยู่'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 2 }}>ลูกค้ากรอกลิงก์ซองของขวัญเพื่อรับเงินและเติมพอยท์เข้าระบบทันที</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <InlineSaveButton isDirty={isFieldDirty(topupSettings.angpao, savedTopup.angpao)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('topup')} label="บันทึก" />
                  <label className="lgx-switch"><input type="checkbox" checked={topupSettings.angpao} onChange={(e) => setTopupSettings((p) => ({ ...p, angpao: e.target.checked }))} disabled={!canManage} /></label>
                </div>
              </div>
              <div className="lgx-form-grid" style={{ marginTop: 8, borderTop: '1px solid var(--lgx-border)', paddingTop: 12 }}>
                <div className="lgx-field" style={{ maxWidth: 420 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ margin: 0 }}>เบอร์โทรศัพท์รับเงิน TrueMoney Wallet (Voucher Phone)</label>
                    {topupSettings.truemoney_phone ? (
                      <span className="lgx-pill ok" style={{ fontSize: 10.5 }}><i className="bi bi-check-circle-fill" /> ใช้เบอร์นี้อยู่: {formatPhoneNumber(topupSettings.truemoney_phone)}</span>
                    ) : (
                      <span className="lgx-pill warn" style={{ fontSize: 10.5 }}><i className="bi bi-exclamation-circle" /> ยังไม่ระบุเบอร์</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="lgx-input"
                      value={topupSettings.truemoney_phone || ''}
                      onChange={(e) => setTopupSettings((prev) => ({ ...prev, truemoney_phone: e.target.value }))}
                      placeholder="เช่น 0952501621"
                      disabled={!canManage}
                    />
                    <InlineSaveButton isDirty={isFieldDirty(topupSettings.truemoney_phone, savedTopup.truemoney_phone)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('topup')} />
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>เบอร์ TrueMoney Wallet ที่ระบบจะใช้ดึงเงินจากซองของขวัญเข้าบัญชีอัตโนมัติ</span>
                </div>
              </div>
            </div>

            {/* Coupon */}
            <ToggleRow
              icon="bi-ticket-perforated-fill"
              title="คูปอง / โค้ดแลกพอยท์ (Redeem Code)"
              desc="ลูกค้ากรอกโค้ดคูปองโปรโมชันเพื่อรับพอยท์พิเศษ"
              checked={topupSettings.coupon}
              disabled={!canManage}
              isDirty={isFieldDirty(topupSettings.coupon, savedTopup.coupon)}
              isSaving={actionState.status === 'working'}
              onSave={() => saveSettings('topup')}
              onChange={(e) => setTopupSettings((p) => ({ ...p, coupon: e.target.checked }))}
            />
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)' }}>
              แท็บปัจจุบัน: <strong>ระบบเติมเงิน</strong>
              {isFieldDirty(topupSettings, savedTopup) && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>• มีจุดที่แก้ไขในหน้านี้</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveCurrentPage} disabled={!canManage || actionState.status === 'working'}><i className="bi bi-floppy2-fill" />บันทึกทั้งหมดของหน้านี้ (ระบบเติมเงิน)</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'image' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>ตั้งค่ารูปภาพ</h2></div>
          <div className="lgx-panel-body">
            <div className="lgx-form-grid">
              <div className="lgx-field">
                <label>Ratio หน้าแรก (Featured)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={imageSettings.home_featured_ratio || ''} onChange={(e) => setImageSettings((prev) => ({ ...prev, home_featured_ratio: e.target.value }))} placeholder="1/1" />
                  <InlineSaveButton isDirty={isFieldDirty(imageSettings.home_featured_ratio, savedImage.home_featured_ratio)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('image')} />
                </div>
              </div>
              <div className="lgx-field">
                <label>Ratio หน้าแรก (หมวดหมู่)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={imageSettings.home_categories_ratio || ''} onChange={(e) => setImageSettings((prev) => ({ ...prev, home_categories_ratio: e.target.value }))} placeholder="16/9" />
                  <InlineSaveButton isDirty={isFieldDirty(imageSettings.home_categories_ratio, savedImage.home_categories_ratio)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('image')} />
                </div>
              </div>
              <div className="lgx-field">
                <label>Ratio สินค้าในหมวดหมู่</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={imageSettings.category_products_ratio || ''} onChange={(e) => setImageSettings((prev) => ({ ...prev, category_products_ratio: e.target.value }))} placeholder="1/1" />
                  <InlineSaveButton isDirty={isFieldDirty(imageSettings.category_products_ratio, savedImage.category_products_ratio)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('image')} />
                </div>
              </div>
              <div className="lgx-field">
                <label>Ratio หน้ารายละเอียด</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={imageSettings.product_detail_ratio || ''} onChange={(e) => setImageSettings((prev) => ({ ...prev, product_detail_ratio: e.target.value }))} placeholder="16/9" />
                  <InlineSaveButton isDirty={isFieldDirty(imageSettings.product_detail_ratio, savedImage.product_detail_ratio)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('image')} />
                </div>
              </div>
            </div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)' }}>
              แท็บปัจจุบัน: <strong>รูปภาพ</strong>
              {isFieldDirty(imageSettings, savedImage) && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>• มีจุดที่แก้ไขในหน้านี้</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveCurrentPage} disabled={!canManage || actionState.status === 'working'}><i className="bi bi-floppy2-fill" />บันทึกทั้งหมดของหน้านี้ (รูปภาพ)</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'homepage' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>ตั้งค่าหน้าแรก</h2></div>
          <div className="lgx-panel-body">
            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field">
                <label>Hero Title</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={homepageSettings.hero_title} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_title: e.target.value }))} />
                  <InlineSaveButton isDirty={isFieldDirty(homepageSettings.hero_title, savedHomepage.hero_title)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
                </div>
              </div>
              <div className="lgx-field">
                <label>Hero Subtitle</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={homepageSettings.hero_subtitle} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_subtitle: e.target.value }))} />
                  <InlineSaveButton isDirty={isFieldDirty(homepageSettings.hero_subtitle, savedHomepage.hero_subtitle)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
                </div>
              </div>
            </div>
            <div className="lgx-field" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>Hero Description</label>
                <InlineSaveButton isDirty={isFieldDirty(homepageSettings.hero_description, savedHomepage.hero_description)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
              </div>
              <textarea className="lgx-textarea" rows={2} value={homepageSettings.hero_description} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_description: e.target.value }))} />
            </div>
            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field">
                <label>Hero Button Text</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={homepageSettings.hero_button_text} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_button_text: e.target.value }))} />
                  <InlineSaveButton isDirty={isFieldDirty(homepageSettings.hero_button_text, savedHomepage.hero_button_text)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
                </div>
              </div>
              <div className="lgx-field">
                <label>Hero Button Link</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={homepageSettings.hero_button_link} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_button_link: e.target.value }))} />
                  <InlineSaveButton isDirty={isFieldDirty(homepageSettings.hero_button_link, savedHomepage.hero_button_link)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
                </div>
              </div>
            </div>
            <div className="lgx-field" style={{ marginBottom: 12, maxWidth: 420 }}>
              <label>หมวดหมู่แนะนำหน้า /categories</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="lgx-select" value={homepageSettings.featured_category_id || ''} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, featured_category_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">อัตโนมัติ: ใช้หมวดแรก</option>
                  {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name} /{category.slug}</option>)}
                </select>
                <InlineSaveButton isDirty={isFieldDirty(homepageSettings.featured_category_id, savedHomepage.featured_category_id)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>เลือกหมวดที่จะโชว์เป็นการ์ดแนะนำบนหน้าหมวดหมู่สินค้า</span>
            </div>
            <div className="lgx-form-grid" style={{ marginBottom: 16 }}>
              <div className="lgx-field">
                <label>Showcase Title</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="lgx-input" value={homepageSettings.showcase_title} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, showcase_title: e.target.value }))} />
                  <InlineSaveButton isDirty={isFieldDirty(homepageSettings.showcase_title, savedHomepage.showcase_title)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
                </div>
              </div>
              <div className="lgx-field">
                <label>Scroll Interval (ms)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" className="lgx-input" value={homepageSettings.showcase_scroll_interval} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, showcase_scroll_interval: Number(e.target.value) }))} />
                  <InlineSaveButton isDirty={isFieldDirty(homepageSettings.showcase_scroll_interval, savedHomepage.showcase_scroll_interval)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
                </div>
              </div>
              <div className="lgx-field lgx-field-end">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label className="lgx-checkbox-row"><input type="checkbox" checked={homepageSettings.showcase_enabled} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, showcase_enabled: e.target.checked }))} />เปิด Showcase</label>
                  <InlineSaveButton isDirty={isFieldDirty(homepageSettings.showcase_enabled, savedHomepage.showcase_enabled)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ProductIdListSelector title="สินค้าในกล่อง Featured Spotlight (Hero Box ขวาบน)" subtitle="กำหนดสินค้าที่ต้องการให้แสดงในกล่องการ์ดมุมขวาบนของหน้าแรก (แนะนำ 2-4 รายการ)" badgeText="Hero Spotlight Box" maxItems={4} productIds={homepageSettings.featured_product_ids || []} allProducts={productListOptions} onChange={(ids) => setHomepageSettings((prev) => ({ ...prev, featured_product_ids: ids }))} />
              <InlineSaveButton isDirty={isFieldDirty(homepageSettings.featured_product_ids, savedHomepage.featured_product_ids)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ProductIdListSelector title="สินค้าในแถบ Showcase Scroller (แถบเลื่อนสินค้าแนะนำด้านล่าง)" subtitle="กำหนดสินค้าที่ต้องการให้เลื่อนแสดงในแถบสินค้าแนะนำด้านล่าง" badgeText="Showcase Strip" maxItems={50} productIds={homepageSettings.showcase_product_ids || []} allProducts={productListOptions} onChange={(ids) => setHomepageSettings((prev) => ({ ...prev, showcase_product_ids: ids }))} />
              <InlineSaveButton isDirty={isFieldDirty(homepageSettings.showcase_product_ids, savedHomepage.showcase_product_ids)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', display: 'block', marginBottom: 6 }}>FAQ</label>
              {(homepageSettings.faq_items || []).map((faq, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input className="lgx-input" placeholder="คำถาม" value={faq.question} onChange={(e) => { const next = [...homepageSettings.faq_items]; next[i] = { ...next[i], question: e.target.value }; setHomepageSettings((prev) => ({ ...prev, faq_items: next })) }} />
                  <input className="lgx-input" placeholder="คำตอบ" value={faq.answer} onChange={(e) => { const next = [...homepageSettings.faq_items]; next[i] = { ...next[i], answer: e.target.value }; setHomepageSettings((prev) => ({ ...prev, faq_items: next })) }} />
                  <button type="button" className="lgx-icon-action danger" onClick={() => setHomepageSettings((prev) => ({ ...prev, faq_items: prev.faq_items.filter((_, j) => j !== i) }))}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="lgx-btn" onClick={() => setHomepageSettings((prev) => ({ ...prev, faq_items: [...(prev.faq_items || []), { question: '', answer: '' }] }))}><i className="bi bi-plus" />เพิ่ม FAQ</button>
                <InlineSaveButton isDirty={isFieldDirty(homepageSettings.faq_items, savedHomepage.faq_items)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('homepage')} />
              </div>
            </div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)' }}>
              แท็บปัจจุบัน: <strong>หน้าแรก</strong>
              {isFieldDirty(homepageSettings, savedHomepage) && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>• มีจุดที่แก้ไขในหน้านี้</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveCurrentPage} disabled={!canManage || actionState.status === 'working'}><i className="bi bi-floppy2-fill" />บันทึกทั้งหมดของหน้านี้ (หน้าแรก)</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'site' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>ตั้งค่าเว็บไซต์</h2></div>
          <div className="lgx-panel-body">
            <div style={{ marginBottom: 16, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ImageUploadCropper label="OG Image (ภาพพรีวิวเมื่อแชร์ลิงก์)" value={siteSettings.og_image_url || ''} onChange={(url) => setSiteSettings((prev) => ({ ...prev, og_image_url: url }))} aspectRatio={1.91 / 1} helpText="ภาพ Open Graph แนะนำสัดส่วน 1.91:1 (เช่น 1200x630)" />
              <InlineSaveButton isDirty={isFieldDirty(siteSettings.og_image_url, savedSite.og_image_url)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('site')} />
            </div>
            <div className="lgx-field" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>Site Description</label>
                <InlineSaveButton isDirty={isFieldDirty(siteSettings.site_description, savedSite.site_description)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('site')} />
              </div>
              <textarea className="lgx-textarea" rows={2} value={siteSettings.site_description} onChange={(e) => setSiteSettings((prev) => ({ ...prev, site_description: e.target.value }))} />
            </div>
            <div className="lgx-field" style={{ marginBottom: 12, maxWidth: 420 }}>
              <label>Footer Tagline</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="lgx-input" value={siteSettings.footer_tagline} onChange={(e) => setSiteSettings((prev) => ({ ...prev, footer_tagline: e.target.value }))} />
                <InlineSaveButton isDirty={isFieldDirty(siteSettings.footer_tagline, savedSite.footer_tagline)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('site')} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', display: 'block', marginBottom: 6 }}>Footer Links</label>
              {(siteSettings.footer_links || []).map((link, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input className="lgx-input" placeholder="Label" value={link.label} onChange={(e) => { const next = [...siteSettings.footer_links]; next[i] = { ...next[i], label: e.target.value }; setSiteSettings((prev) => ({ ...prev, footer_links: next })) }} />
                  <input className="lgx-input" placeholder="URL" value={link.url} onChange={(e) => { const next = [...siteSettings.footer_links]; next[i] = { ...next[i], url: e.target.value }; setSiteSettings((prev) => ({ ...prev, footer_links: next })) }} />
                  <button type="button" className="lgx-icon-action danger" onClick={() => setSiteSettings((prev) => ({ ...prev, footer_links: prev.footer_links.filter((_, j) => j !== i) }))}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="lgx-btn" onClick={() => setSiteSettings((prev) => ({ ...prev, footer_links: [...(prev.footer_links || []), { label: '', url: '' }] }))}><i className="bi bi-plus" />เพิ่ม</button>
                <InlineSaveButton isDirty={isFieldDirty(siteSettings.footer_links, savedSite.footer_links)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('site')} />
              </div>
            </div>
            <div className="lgx-field" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>เงื่อนไขการใช้บริการ (TOS)</label>
                <InlineSaveButton isDirty={isFieldDirty(siteSettings.tos_content, savedSite.tos_content)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('site')} />
              </div>
              <textarea className="lgx-textarea" rows={6} value={siteSettings.tos_content} onChange={(e) => setSiteSettings((prev) => ({ ...prev, tos_content: e.target.value }))} />
            </div>
            <div className="lgx-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>นโยบายความเป็นส่วนตัว (Privacy Policy)</label>
                <InlineSaveButton isDirty={isFieldDirty(siteSettings.privacy_content, savedSite.privacy_content)} isSaving={actionState.status === 'working'} onSave={() => saveSettings('site')} />
              </div>
              <textarea className="lgx-textarea" rows={6} value={siteSettings.privacy_content} onChange={(e) => setSiteSettings((prev) => ({ ...prev, privacy_content: e.target.value }))} />
            </div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)' }}>
              แท็บปัจจุบัน: <strong>เว็บไซต์</strong>
              {isFieldDirty(siteSettings, savedSite) && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>• มีจุดที่แก้ไขในหน้านี้</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveCurrentPage} disabled={!canManage || actionState.status === 'working'}><i className="bi bi-floppy2-fill" />บันทึกทั้งหมดของหน้านี้ (เว็บไซต์)</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'auto_assign' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>มอบหมายงานจ้างอัตโนมัติ</h2></div>
          <div className="lgx-panel-body">
            {!autoAssignLoaded ? <div className="lgx-empty">กำลังโหลด...</div> : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <InlineSaveButton isDirty={isFieldDirty(autoAssignConfig.enabled, initialAutoAssign.enabled)} isSaving={actionState.status === 'working'} onSave={saveAutoAssignConfig} label="บันทึก" />
                    <label className="lgx-switch" style={{ fontSize: 13, fontWeight: 700, color: 'var(--lgx-text)' }}><input type="checkbox" checked={autoAssignConfig.enabled} onChange={(e) => setAutoAssignConfig((prev) => ({ ...prev, enabled: e.target.checked }))} />เปิดใช้งานมอบหมายอัตโนมัติ</label>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 4, marginLeft: 42 }}>เมื่อเปิด ระบบจะมอบหมายงานจ้างใหม่ให้สตาฟที่มีงานน้อยที่สุดโดยอัตโนมัติทันทีที่ลูกค้าสั่งซื้อ</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', margin: 0 }}>ยศที่สามารถรับงานได้</label>
                    <InlineSaveButton isDirty={isFieldDirty(autoAssignConfig.roles, initialAutoAssign.roles)} isSaving={actionState.status === 'working'} onSave={saveAutoAssignConfig} />
                  </div>
                  <div className="lgx-chip-row">
                    {AUTO_ASSIGN_ROLE_OPTIONS.map((opt) => {
                      const checked = (autoAssignConfig.roles || []).includes(opt.value)
                      return (
                        <button key={opt.value} type="button" className={`lgx-chip${checked ? ' is-active' : ''}`} onClick={() => {
                          setAutoAssignConfig((prev) => {
                            const roles = [...(prev.roles || [])]
                            if (!checked && !roles.includes(opt.value)) roles.push(opt.value)
                            else if (checked) { const idx = roles.indexOf(opt.value); if (idx >= 0) roles.splice(idx, 1) }
                            return { ...prev, roles: roles.length > 0 ? roles : ['booster'] }
                          })
                        }}>{opt.label}</button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)', marginTop: 6 }}>เลือกยศที่ต้องการให้ระบบมอบหมายงานให้อัตโนมัติ (เลือกได้หลายยศ)</div>
                </div>
              </>
            )}
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)' }}>
              แท็บปัจจุบัน: <strong>มอบหมายอัตโนมัติ</strong>
              {isFieldDirty(autoAssignConfig, initialAutoAssign) && <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 700 }}>• มีจุดที่แก้ไขในหน้านี้</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveCurrentPage} disabled={!canManage || !autoAssignLoaded || actionState.status === 'working'}><i className="bi bi-floppy2-fill" />บันทึกทั้งหมดของหน้านี้ (มอบหมายงาน)</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ProductIdListSelector({ title, subtitle, badgeText, productIds = [], allProducts = [], maxItems = 20, onChange }) {
  const [selectedProductId, setSelectedProductId] = useState('')

  const normalizedProductIds = useMemo(() => (Array.isArray(productIds) ? productIds : []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0), [productIds])
  const selectedProducts = useMemo(() => normalizedProductIds.map((id) => {
    const found = allProducts.find((p) => Number(p.id) === id)
    if (found) return found
    return { id, name: `สินค้า #${id}`, price: 0, missing: true }
  }), [normalizedProductIds, allProducts])
  const availableProducts = useMemo(() => allProducts.filter((p) => !normalizedProductIds.includes(Number(p.id))), [allProducts, normalizedProductIds])

  function handleAdd() {
    const pid = Number(selectedProductId)
    if (!pid || normalizedProductIds.includes(pid)) return
    if (normalizedProductIds.length >= maxItems) { window.alert(`ใส่ได้สูงสุด ${maxItems} รายการ`); return }
    onChange([...normalizedProductIds, pid])
    setSelectedProductId('')
  }

  function handleRemove(idToRemove) {
    const targetId = Number(idToRemove)
    onChange(normalizedProductIds.filter((id) => id !== targetId))
  }

  function handleMove(idx, targetIdx) {
    if (targetIdx < 0 || targetIdx >= normalizedProductIds.length) return
    const next = [...normalizedProductIds]
    const [moved] = next.splice(idx, 1)
    next.splice(targetIdx, 0, moved)
    onChange(next)
  }

  return (
    <div style={{ border: '1.5px solid var(--lgx-border)', borderRadius: 'var(--lgx-radius)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <span>{title}</span>
            {badgeText ? <span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>{badgeText}</span> : null}
            <span className="lgx-pill neutral">{selectedProducts.length} / {maxItems}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 2 }}>{subtitle}</div>
        </div>
        {normalizedProductIds.length > 0 && (
          <button type="button" className="lgx-btn" onClick={() => { if (window.confirm('ต้องการล้างการกำหนดเองและกลับไปใช้สินค้าที่ติ๊ก "สินค้าแนะนำ (Featured)" ทั้งหมดหรือไม่?')) onChange([]) }}><i className="bi bi-arrow-counterclockwise" />รีเซ็ตเป็นอัตโนมัติ</button>
        )}
      </div>

      {selectedProducts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {selectedProducts.map((p, idx) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, background: 'var(--lgx-surface)', borderRadius: 'var(--lgx-radius)', border: '1.5px solid var(--lgx-border)', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span className="lgx-pill neutral">#{idx + 1}</span>
                {p.image_url ? <img src={p.image_url} alt="" className="lgx-thumb" style={{ width: 36, height: 36 }} /> : <div className="lgx-thumb-empty" style={{ width: 36, height: 36 }} />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{Number(p.price || 0).toLocaleString()} แต้ม {p.sku ? `· SKU: ${p.sku}` : ''}</div>
                </div>
              </div>
              <div className="lgx-btn-group">
                <button type="button" className="lgx-icon-action" title="เลื่อนขึ้น" disabled={idx === 0} onClick={(e) => { e.preventDefault(); handleMove(idx, idx - 1) }}><i className="bi bi-chevron-up" /></button>
                <button type="button" className="lgx-icon-action" title="เลื่อนลง" disabled={idx === selectedProducts.length - 1} onClick={(e) => { e.preventDefault(); handleMove(idx, idx + 1) }}><i className="bi bi-chevron-down" /></button>
                <button type="button" className="lgx-icon-action danger" title="ลบออก" onClick={(e) => { e.preventDefault(); handleRemove(p.id) }}><i className="bi bi-x-lg" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="lgx-empty" style={{ marginBottom: 12 }}><i className="bi bi-magic" style={{ marginRight: 4 }} />โหมดอัตโนมัติ: ดึงสินค้าที่ติ๊ก &quot;สินค้าแนะนำ (Featured)&quot; ในหน้า Catalog มาแสดง</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="lgx-select" style={{ maxWidth: 340 }} value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
          <option value="">-- เลือกสินค้าเพื่อเพิ่ม --</option>
          {availableProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({Number(p.price || 0).toLocaleString()} แต้ม)</option>)}
        </select>
        <button type="button" className="lgx-btn lgx-btn-accent" disabled={!selectedProductId || normalizedProductIds.length >= maxItems} onClick={handleAdd}><i className="bi bi-plus-lg" />เพิ่มในรายการ</button>
      </div>
    </div>
  )
}
