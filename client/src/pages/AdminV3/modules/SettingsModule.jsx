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

function ToggleRow({ icon, title, desc, checked, onChange, disabled }) {
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
        <label className="lgx-switch"><input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} /></label>
      </div>
    </div>
  )
}

export default function SettingsModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [activeTab, setActiveTab] = useState('branding')
  const [imageSettings, setImageSettings] = useState(normalizeUiImageSettings(data?.image_settings))
  const [brandingSettings, setBrandingSettings] = useState(normalizeUiBrandingSettings(data?.branding_settings))
  const [homepageSettings, setHomepageSettings] = useState(normalizeHomepageSettings(data?.homepage_settings))
  const [siteSettings, setSiteSettings] = useState(normalizeSiteSettings(data?.site_settings))
  const [topupSettings, setTopupSettings] = useState(normalizeTopupSettings(data?.topup_settings))
  const [autoAssignConfig, setAutoAssignConfig] = useState({ enabled: false, roles: ['booster'] })
  const [autoAssignLoaded, setAutoAssignLoaded] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [productListOptions, setProductListOptions] = useState([])
  const [productsLoaded, setProductsLoaded] = useState(false)

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
      if (res?.config) setAutoAssignConfig(res.config)
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
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const res = await fetchJson('/api/admin/auto-assign-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: autoAssignConfig }) })
      if (res?.config) setAutoAssignConfig(res.config)
      setActionState({ status: 'success', message: 'บันทึกการมอบหมายอัตโนมัติเรียบร้อย' })
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function saveSettings(section) {
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      let body = {}
      if (section === 'image') body = { image_settings: imageSettings }
      else if (section === 'branding') body = { branding_settings: brandingSettings }
      else if (section === 'homepage') body = { homepage_settings: homepageSettings }
      else if (section === 'site') body = { site_settings: siteSettings }
      else if (section === 'topup') body = { topup_settings: topupSettings }
      await fetchJson('/api/admin/ui-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setActionState({ status: 'success', message: 'บันทึกเรียบร้อย' })
      await loadModuleData('settings')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

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

      <div className="lgx-inline-tabs">
        {TABS.map((t) => <button key={t.id} type="button" className={`lgx-inline-tab${activeTab === t.id ? ' is-active' : ''}`} onClick={() => setActiveTab(t.id)}><i className={`bi ${t.icon}`} style={{ marginRight: 5 }} />{t.label}</button>)}
      </div>

      {activeTab === 'branding' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>แบรนด์</h2></div>
          <div className="lgx-panel-body">
            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>ชื่อเว็บ</label><input className="lgx-input" value={brandingSettings.site_name || ''} onChange={(e) => setBrandingSettings((prev) => ({ ...prev, site_name: e.target.value }))} /></div>
              <div className="lgx-field"><label>ชื่อ Navbar</label><input className="lgx-input" value={brandingSettings.navbar_title || ''} onChange={(e) => setBrandingSettings((prev) => ({ ...prev, navbar_title: e.target.value }))} /></div>
              <div className="lgx-field"><label>Tab Title</label><input className="lgx-input" value={brandingSettings.tab_title || ''} onChange={(e) => setBrandingSettings((prev) => ({ ...prev, tab_title: e.target.value }))} /></div>
            </div>
            <div className="lgx-form-grid" style={{ marginBottom: 16 }}>
              <ImageUploadCropper label="Favicon (ไอคอนแท็บเบราว์เซอร์)" value={brandingSettings.favicon_url || ''} onChange={(url) => setBrandingSettings((prev) => ({ ...prev, favicon_url: url }))} aspectRatio={1 / 1} helpText="ไอคอนขนาดสี่เหลี่ยมจัตุรัส 1:1" />
              <ImageUploadCropper label="Logo เว็บไซต์" value={brandingSettings.logo_url || ''} onChange={(url) => setBrandingSettings((prev) => ({ ...prev, logo_url: url }))} aspectRatio={16 / 9} helpText="โลโก้หลักของเว็บไซต์" />
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
              <button type="button" className="lgx-btn" onClick={() => setBrandingSettings((prev) => ({ ...prev, navbar_links: [...(prev.navbar_links || []), { label: '', url: '' }] }))}><i className="bi bi-plus" />เพิ่ม Link</button>
            </div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)' }}>
            <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => saveSettings('branding')} disabled={!canManage}><i className="bi bi-floppy" />บันทึก</button>
          </div>
        </div>
      )}

      {activeTab === 'topup' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2><i className="bi bi-wallet2" style={{ marginRight: 6 }} />ช่องทางการเติมเงิน</h2><span>เปิดใช้งาน {enabledChannels}/3 ช่องทาง</span></div>
          <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ToggleRow icon="bi-qr-code-scan" title="PromptPay (สแกน QR & ตรวจสลิปอัตโนมัติ)" desc="สร้าง QR Code ตามยอดเงิน และอ่านสลิปธนาคารเพื่อเครดิตพอยท์อัตโนมัติ" checked={topupSettings.promptpay} disabled={!canManage} onChange={(e) => setTopupSettings((p) => ({ ...p, promptpay: e.target.checked }))} />
            <ToggleRow icon="bi-gift-fill" title="ซองของขวัญ TrueMoney (Angpao Voucher)" desc="ลูกค้ากรอกลิงก์ซองของขวัญเพื่อรับเงินและเติมพอยท์เข้าระบบทันที" checked={topupSettings.angpao} disabled={!canManage} onChange={(e) => setTopupSettings((p) => ({ ...p, angpao: e.target.checked }))} />
            <ToggleRow icon="bi-ticket-perforated-fill" title="คูปอง / โค้ดแลกพอยท์ (Redeem Code)" desc="ลูกค้ากรอกโค้ดคูปองโปรโมชันเพื่อรับพอยท์พิเศษ" checked={topupSettings.coupon} disabled={!canManage} onChange={(e) => setTopupSettings((p) => ({ ...p, coupon: e.target.checked }))} />
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)' }}>
            <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => saveSettings('topup')} disabled={!canManage}><i className="bi bi-floppy" />บันทึกการตั้งค่าระบบเติมเงิน</button>
          </div>
        </div>
      )}

      {activeTab === 'image' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>ตั้งค่ารูปภาพ</h2></div>
          <div className="lgx-panel-body">
            <div className="lgx-form-grid">
              <div className="lgx-field"><label>Ratio หน้าแรก (Featured)</label><input className="lgx-input" value={imageSettings.home_featured_ratio || ''} onChange={(e) => setImageSettings((prev) => ({ ...prev, home_featured_ratio: e.target.value }))} placeholder="1/1" /></div>
              <div className="lgx-field"><label>Ratio หน้าแรก (หมวดหมู่)</label><input className="lgx-input" value={imageSettings.home_categories_ratio || ''} onChange={(e) => setImageSettings((prev) => ({ ...prev, home_categories_ratio: e.target.value }))} placeholder="16/9" /></div>
              <div className="lgx-field"><label>Ratio สินค้าในหมวดหมู่</label><input className="lgx-input" value={imageSettings.category_products_ratio || ''} onChange={(e) => setImageSettings((prev) => ({ ...prev, category_products_ratio: e.target.value }))} placeholder="1/1" /></div>
              <div className="lgx-field"><label>Ratio หน้ารายละเอียด</label><input className="lgx-input" value={imageSettings.product_detail_ratio || ''} onChange={(e) => setImageSettings((prev) => ({ ...prev, product_detail_ratio: e.target.value }))} placeholder="16/9" /></div>
            </div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)' }}>
            <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => saveSettings('image')} disabled={!canManage}><i className="bi bi-floppy" />บันทึก</button>
          </div>
        </div>
      )}

      {activeTab === 'homepage' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>ตั้งค่าหน้าแรก</h2></div>
          <div className="lgx-panel-body">
            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>Hero Title</label><input className="lgx-input" value={homepageSettings.hero_title} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_title: e.target.value }))} /></div>
              <div className="lgx-field"><label>Hero Subtitle</label><input className="lgx-input" value={homepageSettings.hero_subtitle} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_subtitle: e.target.value }))} /></div>
            </div>
            <div className="lgx-field" style={{ marginBottom: 12 }}><label>Hero Description</label><textarea className="lgx-textarea" rows={2} value={homepageSettings.hero_description} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_description: e.target.value }))} /></div>
            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>Hero Button Text</label><input className="lgx-input" value={homepageSettings.hero_button_text} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_button_text: e.target.value }))} /></div>
              <div className="lgx-field"><label>Hero Button Link</label><input className="lgx-input" value={homepageSettings.hero_button_link} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, hero_button_link: e.target.value }))} /></div>
            </div>
            <div className="lgx-field" style={{ marginBottom: 12, maxWidth: 420 }}>
              <label>หมวดหมู่แนะนำหน้า /categories</label>
              <select className="lgx-select" value={homepageSettings.featured_category_id || ''} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, featured_category_id: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">อัตโนมัติ: ใช้หมวดแรก</option>
                {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name} /{category.slug}</option>)}
              </select>
              <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>เลือกหมวดที่จะโชว์เป็นการ์ดแนะนำบนหน้าหมวดหมู่สินค้า</span>
            </div>
            <div className="lgx-form-grid" style={{ marginBottom: 16 }}>
              <div className="lgx-field"><label>Showcase Title</label><input className="lgx-input" value={homepageSettings.showcase_title} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, showcase_title: e.target.value }))} /></div>
              <div className="lgx-field"><label>Scroll Interval (ms)</label><input type="number" className="lgx-input" value={homepageSettings.showcase_scroll_interval} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, showcase_scroll_interval: Number(e.target.value) }))} /></div>
              <div className="lgx-field lgx-field-end"><label className="lgx-checkbox-row"><input type="checkbox" checked={homepageSettings.showcase_enabled} onChange={(e) => setHomepageSettings((prev) => ({ ...prev, showcase_enabled: e.target.checked }))} />เปิด Showcase</label></div>
            </div>

            <ProductIdListSelector title="สินค้าในกล่อง Featured Spotlight (Hero Box ขวาบน)" subtitle="กำหนดสินค้าที่ต้องการให้แสดงในกล่องการ์ดมุมขวาบนของหน้าแรก (แนะนำ 2-4 รายการ)" badgeText="Hero Spotlight Box" maxItems={4} productIds={homepageSettings.featured_product_ids || []} allProducts={productListOptions} onChange={(ids) => setHomepageSettings((prev) => ({ ...prev, featured_product_ids: ids }))} />

            <div style={{ marginTop: 14 }}>
              <ProductIdListSelector title="สินค้าในแถบ Showcase Scroller (แถบเลื่อนสินค้าแนะนำด้านล่าง)" subtitle="กำหนดสินค้าที่ต้องการให้เลื่อนแสดงในแถบสินค้าแนะนำด้านล่าง" badgeText="Showcase Strip" maxItems={50} productIds={homepageSettings.showcase_product_ids || []} allProducts={productListOptions} onChange={(ids) => setHomepageSettings((prev) => ({ ...prev, showcase_product_ids: ids }))} />
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
              <button type="button" className="lgx-btn" onClick={() => setHomepageSettings((prev) => ({ ...prev, faq_items: [...(prev.faq_items || []), { question: '', answer: '' }] }))}><i className="bi bi-plus" />เพิ่ม FAQ</button>
            </div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)' }}>
            <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => saveSettings('homepage')} disabled={!canManage}><i className="bi bi-floppy" />บันทึก</button>
          </div>
        </div>
      )}

      {activeTab === 'site' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2>ตั้งค่าเว็บไซต์</h2></div>
          <div className="lgx-panel-body">
            <div style={{ marginBottom: 16, maxWidth: 420 }}>
              <ImageUploadCropper label="OG Image (ภาพพรีวิวเมื่อแชร์ลิงก์)" value={siteSettings.og_image_url || ''} onChange={(url) => setSiteSettings((prev) => ({ ...prev, og_image_url: url }))} aspectRatio={1.91 / 1} helpText="ภาพ Open Graph แนะนำสัดส่วน 1.91:1 (เช่น 1200x630)" />
            </div>
            <div className="lgx-field" style={{ marginBottom: 12 }}><label>Site Description</label><textarea className="lgx-textarea" rows={2} value={siteSettings.site_description} onChange={(e) => setSiteSettings((prev) => ({ ...prev, site_description: e.target.value }))} /></div>
            <div className="lgx-field" style={{ marginBottom: 12, maxWidth: 420 }}><label>Footer Tagline</label><input className="lgx-input" value={siteSettings.footer_tagline} onChange={(e) => setSiteSettings((prev) => ({ ...prev, footer_tagline: e.target.value }))} /></div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', display: 'block', marginBottom: 6 }}>Footer Links</label>
              {(siteSettings.footer_links || []).map((link, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input className="lgx-input" placeholder="Label" value={link.label} onChange={(e) => { const next = [...siteSettings.footer_links]; next[i] = { ...next[i], label: e.target.value }; setSiteSettings((prev) => ({ ...prev, footer_links: next })) }} />
                  <input className="lgx-input" placeholder="URL" value={link.url} onChange={(e) => { const next = [...siteSettings.footer_links]; next[i] = { ...next[i], url: e.target.value }; setSiteSettings((prev) => ({ ...prev, footer_links: next })) }} />
                  <button type="button" className="lgx-icon-action danger" onClick={() => setSiteSettings((prev) => ({ ...prev, footer_links: prev.footer_links.filter((_, j) => j !== i) }))}>×</button>
                </div>
              ))}
              <button type="button" className="lgx-btn" onClick={() => setSiteSettings((prev) => ({ ...prev, footer_links: [...(prev.footer_links || []), { label: '', url: '' }] }))}><i className="bi bi-plus" />เพิ่ม</button>
            </div>
            <div className="lgx-field"><label>เงื่อนไขการใช้บริการ (TOS)</label><textarea className="lgx-textarea" rows={6} value={siteSettings.tos_content} onChange={(e) => setSiteSettings((prev) => ({ ...prev, tos_content: e.target.value }))} /></div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)' }}>
            <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => saveSettings('site')} disabled={!canManage}><i className="bi bi-floppy" />บันทึก</button>
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
                  <label className="lgx-switch" style={{ fontSize: 13, fontWeight: 700, color: 'var(--lgx-text)' }}><input type="checkbox" checked={autoAssignConfig.enabled} onChange={(e) => setAutoAssignConfig((prev) => ({ ...prev, enabled: e.target.checked }))} />เปิดใช้งานมอบหมายอัตโนมัติ</label>
                  <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 4, marginLeft: 42 }}>เมื่อเปิด ระบบจะมอบหมายงานจ้างใหม่ให้สตาฟที่มีงานน้อยที่สุดโดยอัตโนมัติทันทีที่ลูกค้าสั่งซื้อ</div>
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', display: 'block', marginBottom: 8 }}>ยศที่สามารถรับงานได้</label>
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
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)' }}>
            <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveAutoAssignConfig} disabled={!canManage || !autoAssignLoaded}><i className="bi bi-floppy" />บันทึก</button>
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
