import { useState, useEffect } from 'react'
import {
  getErrorMessage, normalizeHomepageSettings, normalizeSiteSettings,
  DEFAULT_HOMEPAGE_SETTINGS, DEFAULT_SITE_SETTINGS, EMPTY_SETTINGS_FIELD_ERRORS,
} from '../helpers.js'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../../../uiImageSettings.js'
import { DEFAULT_UI_BRANDING_SETTINGS, normalizeUiBrandingSettings } from '../../../uiBrandingSettings.js'

const AUTO_ASSIGN_ROLE_OPTIONS = [
  { value: 'booster', label: 'Booster' },
  { value: 'support', label: 'Support' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
]

export default function SettingsModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [activeTab, setActiveTab] = useState('branding')
  const [imageSettings, setImageSettings] = useState(normalizeUiImageSettings(data?.image_settings))
  const [brandingSettings, setBrandingSettings] = useState(normalizeUiBrandingSettings(data?.branding_settings))
  const [homepageSettings, setHomepageSettings] = useState(normalizeHomepageSettings(data?.homepage_settings))
  const [siteSettings, setSiteSettings] = useState(normalizeSiteSettings(data?.site_settings))
  const [autoAssignConfig, setAutoAssignConfig] = useState({ enabled: false, roles: ['booster'] })
  const [autoAssignLoaded, setAutoAssignLoaded] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)

  const canManage = canAction('settings.manage')

  useEffect(() => {
    if (!data) return
    const id = setTimeout(() => {
      setImageSettings(normalizeUiImageSettings(data.image_settings))
      setBrandingSettings(normalizeUiBrandingSettings(data.branding_settings))
      setHomepageSettings(normalizeHomepageSettings(data.homepage_settings))
      setSiteSettings(normalizeSiteSettings(data.site_settings))
    }, 0)
    return () => clearTimeout(id)
  }, [data])

  useEffect(() => {
    if (activeTab !== 'auto_assign' || autoAssignLoaded) return
    fetchJson('/api/admin/auto-assign-config').then(res => {
      if (res?.config) setAutoAssignConfig(res.config)
      setAutoAssignLoaded(true)
    }).catch(() => setAutoAssignLoaded(true))
  }, [activeTab, autoAssignLoaded, fetchJson])

  useEffect(() => {
    if (activeTab !== 'homepage' || categoriesLoaded) return
    fetchJson('/api/admin/categories').then(res => {
      setCategoryOptions(Array.isArray(res?.categories) ? res.categories : [])
      setCategoriesLoaded(true)
    }).catch(() => setCategoriesLoaded(true))
  }, [activeTab, categoriesLoaded, fetchJson])

  async function saveAutoAssignConfig() {
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const res = await fetchJson('/api/admin/auto-assign-config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: autoAssignConfig }),
      })
      if (res?.config) setAutoAssignConfig(res.config)
      setActionState({ status: 'success', message: 'บันทึกการมอบหมายอัตโนมัติเรียบร้อย' })
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
  }

  async function saveSettings(section) {
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      let body = {}
      if (section === 'image') body = { image_settings: imageSettings }
      else if (section === 'branding') body = { branding_settings: brandingSettings }
      else if (section === 'homepage') body = { homepage_settings: homepageSettings }
      else if (section === 'site') body = { site_settings: siteSettings }
      await fetchJson('/api/admin/ui-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setActionState({ status: 'success', message: 'บันทึกเรียบร้อย' })
      await loadModuleData('settings')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
  }

  const tabs = [
    { id: 'branding', label: 'แบรนด์', icon: 'bi-palette' },
    { id: 'image', label: 'รูปภาพ', icon: 'bi-image' },
    { id: 'homepage', label: 'หน้าแรก', icon: 'bi-house' },
    { id: 'site', label: 'เว็บไซต์', icon: 'bi-globe' },
    { id: 'auto_assign', label: 'มอบหมายอัตโนมัติ', icon: 'bi-person-check' },
  ]

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`alert ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show`}>
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })}></button>
        </div>
      )}

      <ul className="nav nav-tabs mb-3">
        {tabs.map(t => (
          <li className="nav-item" key={t.id}>
            <button className={`nav-link ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
            </button>
          </li>
        ))}
      </ul>

      {/* ── Branding ── */}
      {activeTab === 'branding' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">แบรนด์</h3></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6"><label className="form-label">ชื่อเว็บ</label><input className="form-control" value={brandingSettings.site_name || ''} onChange={(e) => setBrandingSettings(prev => ({ ...prev, site_name: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">ชื่อ Navbar</label><input className="form-control" value={brandingSettings.navbar_title || ''} onChange={(e) => setBrandingSettings(prev => ({ ...prev, navbar_title: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">Tab Title</label><input className="form-control" value={brandingSettings.tab_title || ''} onChange={(e) => setBrandingSettings(prev => ({ ...prev, tab_title: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">Favicon URL</label><input className="form-control" value={brandingSettings.favicon_url || ''} onChange={(e) => setBrandingSettings(prev => ({ ...prev, favicon_url: e.target.value }))} /></div>
              <div className="col-12"><label className="form-label">Logo URL</label><input className="form-control" value={brandingSettings.logo_url || ''} onChange={(e) => setBrandingSettings(prev => ({ ...prev, logo_url: e.target.value }))} /></div>
              {/* Navbar links */}
              <div className="col-12">
                <label className="form-label fw-semibold">Navbar Links</label>
                {(brandingSettings.navbar_links || []).map((link, i) => (
                  <div key={i} className="d-flex gap-2 mb-1">
                    <input className="form-control form-control-sm" placeholder="Label" value={link.label || ''} onChange={(e) => {
                      const next = [...(brandingSettings.navbar_links || [])]
                      next[i] = { ...next[i], label: e.target.value }
                      setBrandingSettings(prev => ({ ...prev, navbar_links: next }))
                    }} />
                    <input className="form-control form-control-sm" placeholder="URL" value={link.url || ''} onChange={(e) => {
                      const next = [...(brandingSettings.navbar_links || [])]
                      next[i] = { ...next[i], url: e.target.value }
                      setBrandingSettings(prev => ({ ...prev, navbar_links: next }))
                    }} />
                    <button className="btn btn-outline-danger btn-sm" onClick={() => {
                      const next = (brandingSettings.navbar_links || []).filter((_, j) => j !== i)
                      setBrandingSettings(prev => ({ ...prev, navbar_links: next }))
                    }}>×</button>
                  </div>
                ))}
                <button className="btn btn-outline-primary btn-sm" onClick={() => setBrandingSettings(prev => ({ ...prev, navbar_links: [...(prev.navbar_links || []), { label: '', url: '' }] }))}>
                  <i className="bi bi-plus me-1"></i>เพิ่ม Link
                </button>
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" onClick={() => saveSettings('branding')} disabled={!canManage}>
              <i className="bi bi-floppy me-1"></i>บันทึก
            </button>
          </div>
        </div>
      )}

      {/* ── Image settings ── */}
      {activeTab === 'image' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">ตั้งค่ารูปภาพ</h3></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6"><label className="form-label">Ratio หน้าแรก (Featured)</label><input className="form-control" value={imageSettings.home_featured_ratio || ''} onChange={(e) => setImageSettings(prev => ({ ...prev, home_featured_ratio: e.target.value }))} placeholder="1/1" /></div>
              <div className="col-md-6"><label className="form-label">Ratio หน้าแรก (หมวดหมู่)</label><input className="form-control" value={imageSettings.home_categories_ratio || ''} onChange={(e) => setImageSettings(prev => ({ ...prev, home_categories_ratio: e.target.value }))} placeholder="16/9" /></div>
              <div className="col-md-6"><label className="form-label">Ratio สินค้าในหมวดหมู่</label><input className="form-control" value={imageSettings.category_products_ratio || ''} onChange={(e) => setImageSettings(prev => ({ ...prev, category_products_ratio: e.target.value }))} placeholder="1/1" /></div>
              <div className="col-md-6"><label className="form-label">Ratio หน้ารายละเอียด</label><input className="form-control" value={imageSettings.product_detail_ratio || ''} onChange={(e) => setImageSettings(prev => ({ ...prev, product_detail_ratio: e.target.value }))} placeholder="16/9" /></div>
            </div>
          </div>
          <div className="card-footer"><button className="btn btn-primary" onClick={() => saveSettings('image')} disabled={!canManage}><i className="bi bi-floppy me-1"></i>บันทึก</button></div>
        </div>
      )}

      {/* ── Homepage settings ── */}
      {activeTab === 'homepage' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">ตั้งค่าหน้าแรก</h3></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6"><label className="form-label">Hero Title</label><input className="form-control" value={homepageSettings.hero_title} onChange={(e) => setHomepageSettings(prev => ({ ...prev, hero_title: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">Hero Subtitle</label><input className="form-control" value={homepageSettings.hero_subtitle} onChange={(e) => setHomepageSettings(prev => ({ ...prev, hero_subtitle: e.target.value }))} /></div>
              <div className="col-12"><label className="form-label">Hero Description</label><textarea className="form-control" rows={2} value={homepageSettings.hero_description} onChange={(e) => setHomepageSettings(prev => ({ ...prev, hero_description: e.target.value }))}></textarea></div>
              <div className="col-md-6"><label className="form-label">Hero Button Text</label><input className="form-control" value={homepageSettings.hero_button_text} onChange={(e) => setHomepageSettings(prev => ({ ...prev, hero_button_text: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">Hero Button Link</label><input className="form-control" value={homepageSettings.hero_button_link} onChange={(e) => setHomepageSettings(prev => ({ ...prev, hero_button_link: e.target.value }))} /></div>
              <div className="col-md-6">
                <label className="form-label">หมวดหมู่แนะนำหน้า /categories</label>
                <select
                  className="form-select"
                  value={homepageSettings.featured_category_id || ''}
                  onChange={(e) => setHomepageSettings(prev => ({ ...prev, featured_category_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">อัตโนมัติ: ใช้หมวดแรก</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} /{category.slug}
                    </option>
                  ))}
                </select>
                <div className="form-text">เลือกหมวดที่จะโชว์เป็นการ์ดแนะนำบนหน้าหมวดหมู่สินค้า</div>
              </div>
              <div className="col-md-4"><label className="form-label">Showcase Title</label><input className="form-control" value={homepageSettings.showcase_title} onChange={(e) => setHomepageSettings(prev => ({ ...prev, showcase_title: e.target.value }))} /></div>
              <div className="col-md-4"><label className="form-label">Scroll Interval (ms)</label><input type="number" className="form-control" value={homepageSettings.showcase_scroll_interval} onChange={(e) => setHomepageSettings(prev => ({ ...prev, showcase_scroll_interval: Number(e.target.value) }))} /></div>
              <div className="col-md-4 d-flex align-items-end"><div className="form-check"><input type="checkbox" className="form-check-input" checked={homepageSettings.showcase_enabled} onChange={(e) => setHomepageSettings(prev => ({ ...prev, showcase_enabled: e.target.checked }))} /><label className="form-check-label">เปิด Showcase</label></div></div>
              {/* FAQ */}
              <div className="col-12">
                <label className="form-label fw-semibold">FAQ</label>
                {(homepageSettings.faq_items || []).map((faq, i) => (
                  <div key={i} className="d-flex gap-2 mb-1">
                    <input className="form-control form-control-sm" placeholder="คำถาม" value={faq.question} onChange={(e) => {
                      const next = [...homepageSettings.faq_items]; next[i] = { ...next[i], question: e.target.value }
                      setHomepageSettings(prev => ({ ...prev, faq_items: next }))
                    }} />
                    <input className="form-control form-control-sm" placeholder="คำตอบ" value={faq.answer} onChange={(e) => {
                      const next = [...homepageSettings.faq_items]; next[i] = { ...next[i], answer: e.target.value }
                      setHomepageSettings(prev => ({ ...prev, faq_items: next }))
                    }} />
                    <button className="btn btn-outline-danger btn-sm" onClick={() => setHomepageSettings(prev => ({ ...prev, faq_items: prev.faq_items.filter((_, j) => j !== i) }))}>×</button>
                  </div>
                ))}
                <button className="btn btn-outline-primary btn-sm" onClick={() => setHomepageSettings(prev => ({ ...prev, faq_items: [...(prev.faq_items || []), { question: '', answer: '' }] }))}>
                  <i className="bi bi-plus me-1"></i>เพิ่ม FAQ
                </button>
              </div>
            </div>
          </div>
          <div className="card-footer"><button className="btn btn-primary" onClick={() => saveSettings('homepage')} disabled={!canManage}><i className="bi bi-floppy me-1"></i>บันทึก</button></div>
        </div>
      )}

      {/* ── Site settings ── */}
      {activeTab === 'site' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">ตั้งค่าเว็บไซต์</h3></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6"><label className="form-label">Site URL</label><input className="form-control" value={siteSettings.site_url} onChange={(e) => setSiteSettings(prev => ({ ...prev, site_url: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">OG Image URL</label><input className="form-control" value={siteSettings.og_image_url} onChange={(e) => setSiteSettings(prev => ({ ...prev, og_image_url: e.target.value }))} /></div>
              <div className="col-12"><label className="form-label">Site Description</label><textarea className="form-control" rows={2} value={siteSettings.site_description} onChange={(e) => setSiteSettings(prev => ({ ...prev, site_description: e.target.value }))}></textarea></div>
              <div className="col-md-6"><label className="form-label">Footer Tagline</label><input className="form-control" value={siteSettings.footer_tagline} onChange={(e) => setSiteSettings(prev => ({ ...prev, footer_tagline: e.target.value }))} /></div>
              {/* Footer links */}
              <div className="col-12">
                <label className="form-label fw-semibold">Footer Links</label>
                {(siteSettings.footer_links || []).map((link, i) => (
                  <div key={i} className="d-flex gap-2 mb-1">
                    <input className="form-control form-control-sm" placeholder="Label" value={link.label} onChange={(e) => {
                      const next = [...siteSettings.footer_links]; next[i] = { ...next[i], label: e.target.value }
                      setSiteSettings(prev => ({ ...prev, footer_links: next }))
                    }} />
                    <input className="form-control form-control-sm" placeholder="URL" value={link.url} onChange={(e) => {
                      const next = [...siteSettings.footer_links]; next[i] = { ...next[i], url: e.target.value }
                      setSiteSettings(prev => ({ ...prev, footer_links: next }))
                    }} />
                    <button className="btn btn-outline-danger btn-sm" onClick={() => setSiteSettings(prev => ({ ...prev, footer_links: prev.footer_links.filter((_, j) => j !== i) }))}>×</button>
                  </div>
                ))}
                <button className="btn btn-outline-primary btn-sm" onClick={() => setSiteSettings(prev => ({ ...prev, footer_links: [...(prev.footer_links || []), { label: '', url: '' }] }))}>
                  <i className="bi bi-plus me-1"></i>เพิ่ม
                </button>
              </div>
              {/* TOS */}
              <div className="col-12">
                <label className="form-label fw-semibold">เงื่อนไขการใช้บริการ (TOS)</label>
                <textarea className="form-control" rows={6} value={siteSettings.tos_content} onChange={(e) => setSiteSettings(prev => ({ ...prev, tos_content: e.target.value }))}></textarea>
              </div>
            </div>
          </div>
          <div className="card-footer"><button className="btn btn-primary" onClick={() => saveSettings('site')} disabled={!canManage}><i className="bi bi-floppy me-1"></i>บันทึก</button></div>
        </div>
      )}
      {/* ── Auto-assign ── */}
      {activeTab === 'auto_assign' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">มอบหมายงานจ้างอัตโนมัติ</h3></div>
          <div className="card-body">
            {!autoAssignLoaded ? (
              <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div> กำลังโหลด...</div>
            ) : (
              <div className="row g-3">
                <div className="col-12">
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" id="autoAssignEnabled" checked={autoAssignConfig.enabled} onChange={(e) => setAutoAssignConfig(prev => ({ ...prev, enabled: e.target.checked }))} />
                    <label className="form-check-label fw-semibold" htmlFor="autoAssignEnabled">เปิดใช้งานมอบหมายอัตโนมัติ</label>
                  </div>
                  <div className="form-text">เมื่อเปิด ระบบจะมอบหมายงานจ้างใหม่ให้สตาฟที่มีงานน้อยที่สุดโดยอัตโนมัติทันทีที่ลูกค้าสั่งซื้อ</div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold">ยศที่สามารถรับงานได้</label>
                  <div className="d-flex flex-wrap gap-2">
                    {AUTO_ASSIGN_ROLE_OPTIONS.map(opt => {
                      const checked = (autoAssignConfig.roles || []).includes(opt.value)
                      return (
                        <div className="form-check" key={opt.value}>
                          <input className="form-check-input" type="checkbox" id={`aar_${opt.value}`} checked={checked}
                            onChange={(e) => {
                              setAutoAssignConfig(prev => {
                                const roles = [...(prev.roles || [])]
                                if (e.target.checked && !roles.includes(opt.value)) roles.push(opt.value)
                                else if (!e.target.checked) {
                                  const idx = roles.indexOf(opt.value)
                                  if (idx >= 0) roles.splice(idx, 1)
                                }
                                return { ...prev, roles: roles.length > 0 ? roles : ['booster'] }
                              })
                            }}
                          />
                          <label className="form-check-label" htmlFor={`aar_${opt.value}`}>{opt.label}</label>
                        </div>
                      )
                    })}
                  </div>
                  <div className="form-text">เลือกยศที่ต้องการให้ระบบมอบหมายงานให้อัตโนมัติ (เลือกได้หลายยศ)</div>
                </div>
              </div>
            )}
          </div>
          <div className="card-footer"><button className="btn btn-primary" onClick={saveAutoAssignConfig} disabled={!canManage || !autoAssignLoaded}><i className="bi bi-floppy me-1"></i>บันทึก</button></div>
        </div>
      )}
    </>
  )
}
