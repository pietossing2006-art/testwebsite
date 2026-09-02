import { useState, useEffect, useCallback, useRef } from 'react'
import {
  formatNumber, formatDateTime, getErrorMessage, pickNumber, isoToLocalInput,
  formatDiscountSummary, getPromotionStatusMeta, getCouponStatusMeta,
  DEFAULT_COUPON_FORM, DEFAULT_PROMOTION_FORM, DEFAULT_DISCOUNT_COUPON_FORM,
} from '../helpers.js'

function useCountdown(endsAt) {
  const calc = useCallback(() => {
    if (!endsAt) return null
    const diff = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000))
    if (diff <= 0) return null
    const d = Math.floor(diff / 86400)
    const h = Math.floor((diff % 86400) / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    const pad = (n) => String(n).padStart(2, '0')
    if (d > 0) return `${d}ว ${pad(h)}:${pad(m)}`
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }, [endsAt])
  const [t, setT] = useState(calc)
  useEffect(() => {
    if (!endsAt) return
    setT(calc())
    const id = setInterval(() => setT(calc()), 1000)
    return () => clearInterval(id)
  }, [endsAt, calc])
  return t
}

function CountdownCell({ row }) {
  const nowMs = Date.now()
  const startsMs = row?.starts_at ? Date.parse(row.starts_at) : null
  const endsMs = row?.ends_at ? Date.parse(row.ends_at) : null
  const notStarted = startsMs && startsMs > nowMs
  const expired = endsMs && endsMs < nowMs
  const countdown = useCountdown(!expired && !notStarted ? row?.ends_at : null)
  if (!row?.starts_at && !row?.ends_at) return <span style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>—</span>
  if (notStarted) {
    const when = new Date(row.starts_at).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return <span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>{when}</span>
  }
  if (expired) return <span className="lgx-pill neutral">หมดอายุ</span>
  if (!row?.ends_at) return <span style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>—</span>
  const urgency = endsMs && (endsMs - nowMs) < 3600000
  return <span className={`lgx-pill ${urgency ? 'crit' : 'warn'} mono`}>{countdown || '...'}</span>
}

export default function PromotionsModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [couponForm, setCouponForm] = useState(DEFAULT_COUPON_FORM)
  const [promotionForm, setPromotionForm] = useState(DEFAULT_PROMOTION_FORM)
  const [discountForm, setDiscountForm] = useState(DEFAULT_DISCOUNT_COUPON_FORM)
  const [view, setView] = useState('list')
  const [formType, setFormType] = useState('')
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const createMenuRef = useRef(null)

  useEffect(() => {
    if (!createMenuOpen) return undefined
    const onClickOutside = (e) => { if (createMenuRef.current && !createMenuRef.current.contains(e.target)) setCreateMenuOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [createMenuOpen])

  if (!data) return null

  const canManage = canAction('promotions.manage')
  const coupons = data.coupons || []
  const promotions = data.promotions || []
  const discountCoupons = data.discountCoupons || []
  const products = data.products || []
  const categories = data.categories || []

  const allItems = [
    ...promotions.map((p) => ({ ...p, _type: 'promotion' })),
    ...discountCoupons.map((d) => ({ ...d, _type: 'discount' })),
    ...coupons.map((c) => ({ ...c, _type: 'coupon' })),
  ].filter((item) => {
    if (scope === 'promotion' && item._type !== 'promotion') return false
    if (scope === 'discount' && item._type !== 'discount') return false
    if (scope === 'coupon' && item._type !== 'coupon') return false
    if (scope === 'flash_sale' && (item._type !== 'promotion' || !item.is_flash_sale)) return false
    if (search) {
      const q = search.toLowerCase()
      const name = String(item.title || item.code || item.product_name || item.category_name || '').toLowerCase()
      if (!name.includes(q)) return false
    }
    if (statusFilter !== 'all') {
      const meta = item._type === 'coupon' ? getCouponStatusMeta(item) : getPromotionStatusMeta(item)
      if (meta.key !== statusFilter) return false
    }
    return true
  })

  function editPromotion(p) {
    setPromotionForm({
      id: p.id, scope: p.scope || (p.product_id ? 'product' : p.category_id ? 'category' : 'all'),
      product_id: p.product_id ? String(p.product_id) : '', category_id: p.category_id ? String(p.category_id) : '',
      title: p.title || '', badge_text: p.badge_text || '',
      discount_percent: p.discount_percent != null ? String(p.discount_percent) : '',
      discount_amount_points: p.discount_amount_points != null ? String(p.discount_amount_points) : '',
      min_spend_points: p.min_spend_points != null ? String(p.min_spend_points) : '',
      max_discount_points: p.max_discount_points != null ? String(p.max_discount_points) : '',
      is_flash_sale: Boolean(p.is_flash_sale), starts_at: isoToLocalInput(p.starts_at), ends_at: isoToLocalInput(p.ends_at),
      is_active: p.is_active !== false,
    })
    setFormType('promotion')
    setView('form')
  }

  function editCoupon(c) {
    setCouponForm({ id: c.id, code: c.code || '', points: pickNumber(c.points) || 100, max_uses: pickNumber(c.max_uses) || 1, used_count: pickNumber(c.used_count), expires_at: isoToLocalInput(c.expires_at), is_active: c.is_active !== false })
    setFormType('coupon')
    setView('form')
  }

  function editDiscount(d) {
    setDiscountForm({
      id: d.id, code: d.code || '', title: d.title || '',
      discount_percent: d.discount_percent != null ? String(d.discount_percent) : '',
      discount_amount_points: d.discount_amount_points != null ? String(d.discount_amount_points) : '',
      max_uses: d.max_uses != null ? String(d.max_uses) : '', used_count: pickNumber(d.used_count),
      expires_at: isoToLocalInput(d.expires_at), is_active: d.is_active !== false,
    })
    setFormType('discount')
    setView('form')
  }

  async function togglePromotionActive(p) {
    if (!canManage) return
    try {
      setActionState({ status: 'working', message: 'กำลังปรับสถานะ...' })
      await fetchJson(`/api/admin/promotions/${p.id}/toggle`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !p.is_active }) })
      setActionState({ status: 'success', message: `เปลี่ยนสถานะเป็น ${!p.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} เรียบร้อย` })
      await loadModuleData('promotions')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function savePromotion() {
    const f = promotionForm
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const body = {
        scope: f.scope, product_id: f.scope === 'product' && f.product_id ? Number(f.product_id) : null,
        category_id: f.scope === 'category' && f.category_id ? Number(f.category_id) : null,
        title: f.title.trim(), badge_text: f.badge_text ? f.badge_text.trim() : null,
        discount_percent: f.discount_percent !== '' ? Number(f.discount_percent) : null,
        discount_amount_points: f.discount_amount_points !== '' ? Number(f.discount_amount_points) : null,
        min_spend_points: f.min_spend_points !== '' ? Number(f.min_spend_points) : 0,
        max_discount_points: f.max_discount_points !== '' ? Number(f.max_discount_points) : null,
        is_flash_sale: Boolean(f.is_flash_sale), starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
        ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null, is_active: Boolean(f.is_active),
      }
      if (f.id) await fetchJson(`/api/admin/promotions/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      else await fetchJson('/api/admin/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setActionState({ status: 'success', message: 'บันทึกโปรโมชันเรียบร้อย' })
      setView('list')
      await loadModuleData('promotions')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function saveCoupon() {
    const f = couponForm
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const body = { code: f.code.trim(), points: Number(f.points), max_uses: Number(f.max_uses), used_count: Number(f.used_count), expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null, is_active: Boolean(f.is_active) }
      if (f.id) await fetchJson(`/api/admin/coupons/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      else await fetchJson('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setActionState({ status: 'success', message: 'บันทึกคูปองเรียบร้อย' })
      setView('list')
      await loadModuleData('promotions')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function saveDiscount() {
    const f = discountForm
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const body = {
        code: f.code.trim(), title: f.title.trim(), discount_percent: f.discount_percent !== '' ? Number(f.discount_percent) : null,
        discount_amount_points: f.discount_amount_points !== '' ? Number(f.discount_amount_points) : null,
        max_uses: f.max_uses !== '' ? Number(f.max_uses) : null, used_count: Number(f.used_count),
        expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null, is_active: Boolean(f.is_active),
      }
      if (f.id) await fetchJson(`/api/admin/discount-coupons/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      else await fetchJson('/api/admin/discount-coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setActionState({ status: 'success', message: 'บันทึกส่วนลดเรียบร้อย' })
      setView('list')
      await loadModuleData('promotions')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteItem(item) {
    if (!window.confirm('ยืนยันลบรายการนี้หรือไม่?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      const endpoint = item._type === 'promotion' ? `/api/admin/promotions/${item.id}` : item._type === 'discount' ? `/api/admin/discount-coupons/${item.id}` : `/api/admin/coupons/${item.id}`
      await fetchJson(endpoint, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบเรียบร้อย' })
      await loadModuleData('promotions')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  const bannerTone = actionState.status === 'error' ? 'crit' : actionState.status === 'success' ? 'ok' : 'info'

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`lgx-banner ${bannerTone}`}>
          <span>{actionState.message}</span>
          <button type="button" className="lgx-banner-close" onClick={() => setActionState({ status: 'idle', message: '' })}>×</button>
        </div>
      )}

      <div className="lgx-strip">
        <div className="lgx-stat"><div className="l">โปรโมชันสินค้า / Flash Sale</div><div className="v">{formatNumber(promotions.length)}</div><div className="d">ลดทั้งร้าน / หมวดหมู่ / สินค้า</div></div>
        <div className="lgx-stat"><div className="l">คูปองส่วนลด (Code)</div><div className="v">{formatNumber(discountCoupons.length)}</div><div className="d">โค้ดส่วนลด % หรือพอยท์</div></div>
        <div className="lgx-stat"><div className="l">คูปองแจกแต้มฟรี</div><div className="v">{formatNumber(coupons.length)}</div><div className="d">โค้ดเติมพอยท์เข้ากระเป๋า</div></div>
      </div>

      {view === 'list' && (
        <>
          <div className="lgx-panel">
            <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <div className="lgx-segmented">
                {[{ id: 'all', label: 'ทั้งหมด' }, { id: 'promotion', label: 'โปรโมชัน' }, { id: 'flash_sale', label: 'Flash Sale' }, { id: 'discount', label: 'โค้ดส่วนลด' }, { id: 'coupon', label: 'คูปองแต้ม' }].map((t) => (
                  <button key={t.id} type="button" className={`lgx-segmented-btn${scope === t.id ? ' is-active' : ''}`} onClick={() => setScope(t.id)}>{t.label}</button>
                ))}
              </div>
              <select className="lgx-select" style={{ width: 140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">ทุกสถานะ</option>
                <option value="active">กำลังใช้งาน</option>
                <option value="inactive">ปิดใช้งาน</option>
                <option value="expired">หมดอายุ</option>
                <option value="exhausted">ใช้ครบ</option>
              </select>
              <input className="lgx-input" style={{ width: 200 }} placeholder="ค้นหาโปร / สินค้า..." value={search} onChange={(e) => setSearch(e.target.value)} />

              <div className="lgx-dropdown-wrap" style={{ marginLeft: 'auto' }} ref={createMenuRef}>
                <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => setCreateMenuOpen((v) => !v)}><i className="bi bi-plus-lg" />สร้างแคมเปญ<i className="bi bi-chevron-down" style={{ fontSize: 10 }} /></button>
                {createMenuOpen && (
                  <div className="lgx-dropdown" style={{ minWidth: 280 }}>
                    <button type="button" className="lgx-dropdown-item" onClick={() => { setPromotionForm({ ...DEFAULT_PROMOTION_FORM, is_flash_sale: false }); setFormType('promotion'); setView('form'); setCreateMenuOpen(false) }}>
                      <i className="bi bi-tag-fill" style={{ color: 'var(--lgx-accent)' }} />
                      <div><div style={{ fontWeight: 700 }}>โปรโมชันสินค้า / หมวดหมู่</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>ลดเฉพาะชิ้น, ทั้งหมวดหมู่ หรือทั้งร้าน</div></div>
                    </button>
                    <button type="button" className="lgx-dropdown-item" onClick={() => { setPromotionForm({ ...DEFAULT_PROMOTION_FORM, is_flash_sale: true, badge_text: 'FLASH SALE', title: 'Flash Sale พิเศษ' }); setFormType('promotion'); setView('form'); setCreateMenuOpen(false) }}>
                      <i className="bi bi-lightning-charge-fill" style={{ color: 'var(--lgx-warn)' }} />
                      <div><div style={{ fontWeight: 700 }}>แคมเปญ Flash Sale</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>แสดงเวลานับถอยหลัง &amp; ไฮไลท์</div></div>
                    </button>
                    <div style={{ borderTop: '1px solid var(--lgx-border)' }} />
                    <button type="button" className="lgx-dropdown-item" onClick={() => { setDiscountForm(DEFAULT_DISCOUNT_COUPON_FORM); setFormType('discount'); setView('form'); setCreateMenuOpen(false) }}>
                      <i className="bi bi-ticket-perforated-fill" style={{ color: 'var(--lgx-accent)' }} />
                      <div><div style={{ fontWeight: 700 }}>คูปองโค้ดส่วนลด</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>ผู้ซื้อกรอกรหัสเพื่อรับส่วนลด</div></div>
                    </button>
                    <button type="button" className="lgx-dropdown-item" onClick={() => { setCouponForm(DEFAULT_COUPON_FORM); setFormType('coupon'); setView('form'); setCreateMenuOpen(false) }}>
                      <i className="bi bi-coin" style={{ color: 'var(--lgx-ok)' }} />
                      <div><div style={{ fontWeight: 700 }}>คูปองแจกแต้มฟรี</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>กรอกรหัสเพื่อเติมแต้มเข้ากระเป๋า</div></div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lgx-panel">
            <table className="lgx-table">
              <thead><tr><th>ประเภท</th><th>ชื่อแคมเปญ / ขอบเขต</th><th>ส่วนลด &amp; เงื่อนไข</th><th>สถานะ</th><th>ใช้แล้ว</th><th>ช่วงเวลานับถอยหลัง</th><th /></tr></thead>
              <tbody>
                {allItems.map((item) => {
                  const typeLabel = item._type === 'promotion' ? (item.is_flash_sale ? 'Flash Sale' : 'โปรโมชัน') : item._type === 'discount' ? 'โค้ดส่วนลด' : 'คูปองแต้ม'
                  const typeTone = item._type === 'promotion' ? (item.is_flash_sale ? 'warn' : '') : item._type === 'discount' ? '' : 'ok'
                  const statusMeta = item._type === 'coupon' ? getCouponStatusMeta(item) : getPromotionStatusMeta(item)
                  const statusTone = statusMeta.key === 'active' ? 'ok' : statusMeta.key === 'expired' || statusMeta.key === 'exhausted' ? 'neutral' : 'warn'
                  const isActiveFlash = statusMeta.key === 'active' && item._type === 'promotion'
                  const scopeText = item._type === 'promotion'
                    ? (item.scope === 'all' ? 'ทั้งร้าน' : item.scope === 'category' ? `หมวด: ${item.category_name || '#' + item.category_id}` : `สินค้า: ${item.product_name || '#' + item.product_id}`)
                    : null

                  return (
                    <tr key={`${item._type}-${item.id}`}>
                      <td>
                        <span className={`lgx-pill ${typeTone || 'neutral'}`} style={!typeTone ? { background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' } : undefined}>{typeLabel}</span>
                        {item.badge_text ? <div style={{ marginTop: 4 }}><span className="lgx-pill crit">{item.badge_text}</span></div> : null}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{item.title || item.code || '-'}</div>
                        {scopeText ? <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 2 }}><i className="bi bi-bullseye" style={{ marginRight: 3 }} />{scopeText}</div> : null}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--lgx-accent)' }}>{item._type === 'coupon' ? `${formatNumber(item.points)} แต้ม` : formatDiscountSummary(item)}</div>
                        {item._type === 'promotion' && (item.min_spend_points > 0 || item.max_discount_points > 0) ? (
                          <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)', marginTop: 2 }}>
                            {item.min_spend_points > 0 && `ขั้นต่ำ ${formatNumber(item.min_spend_points)}P `}
                            {item.max_discount_points > 0 && `(สูงสุด ${formatNumber(item.max_discount_points)}P)`}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {item._type === 'promotion' ? (
                            <label className="lgx-switch" title="เปิด/ปิดใช้งานทันที">
                              <input type="checkbox" checked={Boolean(item.is_active)} disabled={!canManage} onChange={() => togglePromotionActive(item)} />
                            </label>
                          ) : null}
                          <span className={`lgx-pill ${statusTone}`}>{statusMeta.label}</span>
                        </div>
                      </td>
                      <td>{item._type !== 'promotion' ? <span className="lgx-pill neutral">{pickNumber(item.used_count)} / {item.max_uses || '∞'}</span> : '-'}</td>
                      <td style={{ fontSize: 11 }}>
                        {item._type !== 'coupon' ? (
                          <>
                            {item.starts_at && <div style={{ color: 'var(--lgx-text-muted)' }}>เริ่ม {formatDateTime(item.starts_at)}</div>}
                            {item.ends_at && <div style={{ color: 'var(--lgx-text-muted)' }}>จบ {formatDateTime(item.ends_at)}</div>}
                            {isActiveFlash && item.ends_at ? <div style={{ marginTop: 4 }}><CountdownCell row={item} /></div> : null}
                          </>
                        ) : (item.expires_at ? <div style={{ color: 'var(--lgx-text-muted)' }}>จบ {formatDateTime(item.expires_at)}</div> : <span style={{ color: 'var(--lgx-text-muted)' }}>—</span>)}
                      </td>
                      <td>
                        <div className="lgx-btn-group">
                          <button type="button" className="lgx-icon-action" disabled={!canManage} onClick={() => { if (item._type === 'promotion') editPromotion(item); else if (item._type === 'discount') editDiscount(item); else editCoupon(item) }}><i className="bi bi-pencil" /></button>
                          <button type="button" className="lgx-icon-action danger" disabled={!canManage} onClick={() => deleteItem(item)}><i className="bi bi-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {allItems.length === 0 && <tr><td colSpan={7} className="lgx-empty"><i className="bi bi-tags" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />ไม่พบรายการโปรโมชั่นหรือคูปองส่วนลด</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'form' && formType === 'promotion' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head">
            <h2><i className={`bi ${promotionForm.is_flash_sale ? 'bi-lightning-charge-fill' : 'bi-tag-fill'}`} style={{ marginRight: 6, color: promotionForm.is_flash_sale ? 'var(--lgx-warn)' : 'var(--lgx-accent)' }} />{promotionForm.id ? 'แก้ไขโปรโมชัน' : promotionForm.is_flash_sale ? 'สร้างแคมเปญ Flash Sale' : 'สร้างโปรโมชันใหม่'}</h2>
            <button type="button" className="lgx-icon-action" onClick={() => setView('list')}><i className="bi bi-x-lg" /></button>
          </div>
          <div className="lgx-panel-body">
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 8 }}>ขอบเขตการใช้ส่วนลด (Scope) *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {[{ id: 'product', label: 'สินค้าเฉพาะชิ้น', desc: 'ระบุสินค้าที่ต้องการลดราคา' }, { id: 'category', label: 'ทั้งหมวดหมู่', desc: 'ลดทุกสินค้าในหมวดหมู่ที่เลือก' }, { id: 'all', label: 'ทั้งร้าน (Storewide)', desc: 'ลดราคาทุกสินค้าทั้งระบบ' }].map((sc) => (
                  <button type="button" key={sc.id} onClick={() => setPromotionForm((prev) => ({ ...prev, scope: sc.id }))}
                    style={{ flex: '1 1 200px', textAlign: 'left', cursor: 'pointer', padding: 12, borderRadius: 'var(--lgx-radius)', border: `1.5px solid ${promotionForm.scope === sc.id ? 'var(--lgx-accent)' : 'var(--lgx-border)'}`, background: promotionForm.scope === sc.id ? 'var(--lgx-accent-soft)' : 'var(--lgx-surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="radio" name="promo_scope" checked={promotionForm.scope === sc.id} onChange={() => setPromotionForm((prev) => ({ ...prev, scope: sc.id }))} style={{ accentColor: 'var(--lgx-accent)' }} />
                      <div style={{ fontWeight: 700 }}>{sc.label}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 4, marginLeft: 22 }}>{sc.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {promotionForm.scope === 'product' && (
              <div className="lgx-field" style={{ marginBottom: 16, maxWidth: 420 }}>
                <label>เลือกสินค้า *</label>
                <select className="lgx-select" value={promotionForm.product_id} onChange={(e) => setPromotionForm((prev) => ({ ...prev, product_id: e.target.value }))}>
                  <option value="">-- เลือกสินค้าที่ต้องการลดราคา --</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} (ราคาปกติ: {formatNumber(p.price)}P)</option>)}
                </select>
              </div>
            )}
            {promotionForm.scope === 'category' && (
              <div className="lgx-field" style={{ marginBottom: 16, maxWidth: 420 }}>
                <label>เลือกหมวดหมู่ *</label>
                <select className="lgx-select" value={promotionForm.category_id} onChange={(e) => setPromotionForm((prev) => ({ ...prev, category_id: e.target.value }))}>
                  <option value="">-- เลือกหมวดหมู่ที่ต้องการลดราคา --</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>)}
                </select>
              </div>
            )}

            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>ชื่อโปรโมชัน *</label><input className="lgx-input" placeholder="เช่น Mid-Month Sale, ลดกระหน่ำวันหยุด" value={promotionForm.title} onChange={(e) => setPromotionForm((prev) => ({ ...prev, title: e.target.value }))} /></div>
              <div className="lgx-field">
                <label>ป้ายกำกับพิเศษ (Badge Text)</label>
                <input className="lgx-input" placeholder="เช่น FLASH SALE, ลดแรง, HOT DEAL" value={promotionForm.badge_text} onChange={(e) => setPromotionForm((prev) => ({ ...prev, badge_text: e.target.value }))} />
              </div>
            </div>

            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>ลดแบบเปอร์เซ็นต์ (%)</label><input type="number" min="1" max="95" className="lgx-input" placeholder="เช่น 15" value={promotionForm.discount_percent} onChange={(e) => setPromotionForm((prev) => ({ ...prev, discount_percent: e.target.value, discount_amount_points: '' }))} /></div>
              <div className="lgx-field"><label>หรือ ลดเป็นจำนวนแต้ม</label><input type="number" min="1" className="lgx-input" placeholder="เช่น 50" value={promotionForm.discount_amount_points} onChange={(e) => setPromotionForm((prev) => ({ ...prev, discount_amount_points: e.target.value, discount_percent: '' }))} /></div>
            </div>

            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>ยอดซื้อขั้นต่ำ (Points)</label><input type="number" min="0" className="lgx-input" placeholder="0 = ไม่มีขั้นต่ำ" value={promotionForm.min_spend_points} onChange={(e) => setPromotionForm((prev) => ({ ...prev, min_spend_points: e.target.value }))} /></div>
              <div className="lgx-field">
                <label>จำกัดส่วนลดสูงสุด</label>
                <input type="number" min="0" className="lgx-input" placeholder="ว่าง = ไม่จำกัด" value={promotionForm.max_discount_points} onChange={(e) => setPromotionForm((prev) => ({ ...prev, max_discount_points: e.target.value }))} />
                <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>ใช้สำหรับส่วนลด % เพื่อไม่ให้ยอดลดเกินเพดาน</span>
              </div>
            </div>

            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>วัน-เวลาเริ่มต้น</label><input type="datetime-local" className="lgx-input" value={promotionForm.starts_at} onChange={(e) => setPromotionForm((prev) => ({ ...prev, starts_at: e.target.value }))} /></div>
              <div className="lgx-field"><label>วัน-เวลาสิ้นสุด</label><input type="datetime-local" className="lgx-input" value={promotionForm.ends_at} onChange={(e) => setPromotionForm((prev) => ({ ...prev, ends_at: e.target.value }))} /></div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 12, background: 'var(--lgx-surface-alt)', borderRadius: 'var(--lgx-radius)' }}>
              <label className="lgx-switch"><input type="checkbox" checked={promotionForm.is_active} onChange={(e) => setPromotionForm((prev) => ({ ...prev, is_active: e.target.checked }))} />เปิดใช้งานโปรโมชั่นทันที</label>
              <label className="lgx-switch"><input type="checkbox" checked={promotionForm.is_flash_sale} onChange={(e) => setPromotionForm((prev) => ({ ...prev, is_flash_sale: e.target.checked }))} />ตั้งเป็น Flash Sale (นาฬิกานับถอยหลัง)</label>
            </div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', justifyContent: 'flex-end' }}>
            <div className="lgx-btn-group">
              <button type="button" className="lgx-btn" onClick={() => setView('list')}>ยกเลิก</button>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={savePromotion} disabled={!canManage}><i className="bi bi-floppy" />บันทึกโปรโมชั่น</button>
            </div>
          </div>
        </div>
      )}

      {view === 'form' && formType === 'coupon' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2><i className="bi bi-coin" style={{ marginRight: 6, color: 'var(--lgx-ok)' }} />{couponForm.id ? 'แก้ไขคูปองแต้ม' : 'สร้างคูปองแต้มใหม่'}</h2><button type="button" className="lgx-icon-action" onClick={() => setView('list')}><i className="bi bi-x-lg" /></button></div>
          <div className="lgx-panel-body">
            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>โค้ดคูปอง *</label><input className="lgx-input mono" placeholder="เช่น FREE100PTS" value={couponForm.code} onChange={(e) => setCouponForm((prev) => ({ ...prev, code: e.target.value }))} /></div>
              <div className="lgx-field"><label>จำนวนแต้มที่แจก *</label><input type="number" className="lgx-input" value={couponForm.points} onChange={(e) => setCouponForm((prev) => ({ ...prev, points: Number(e.target.value) }))} /></div>
              <div className="lgx-field"><label>จำนวนครั้งที่ใช้ได้สูงสุด</label><input type="number" className="lgx-input" value={couponForm.max_uses} onChange={(e) => setCouponForm((prev) => ({ ...prev, max_uses: Number(e.target.value) }))} /></div>
              <div className="lgx-field lgx-field-end"><label className="lgx-checkbox-row"><input type="checkbox" checked={couponForm.is_active} onChange={(e) => setCouponForm((prev) => ({ ...prev, is_active: e.target.checked }))} />เปิดใช้งาน</label></div>
            </div>
            <div className="lgx-field" style={{ maxWidth: 300 }}><label>วัน-เวลาหมดอายุ</label><input type="datetime-local" className="lgx-input" value={couponForm.expires_at} onChange={(e) => setCouponForm((prev) => ({ ...prev, expires_at: e.target.value }))} /></div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', justifyContent: 'flex-end' }}>
            <div className="lgx-btn-group">
              <button type="button" className="lgx-btn" onClick={() => setView('list')}>ยกเลิก</button>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveCoupon} disabled={!canManage}><i className="bi bi-floppy" />บันทึกคูปอง</button>
            </div>
          </div>
        </div>
      )}

      {view === 'form' && formType === 'discount' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head"><h2><i className="bi bi-ticket-perforated-fill" style={{ marginRight: 6, color: 'var(--lgx-accent)' }} />{discountForm.id ? 'แก้ไขคูปองส่วนลด' : 'สร้างคูปองส่วนลดใหม่'}</h2><button type="button" className="lgx-icon-action" onClick={() => setView('list')}><i className="bi bi-x-lg" /></button></div>
          <div className="lgx-panel-body">
            <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
              <div className="lgx-field"><label>โค้ดส่วนลด *</label><input className="lgx-input mono" placeholder="เช่น DISCOUNT20" value={discountForm.code} onChange={(e) => setDiscountForm((prev) => ({ ...prev, code: e.target.value }))} /></div>
              <div className="lgx-field"><label>ชื่อส่วนลด</label><input className="lgx-input" placeholder="เช่น ส่วนลดลูกค้าใหม่" value={discountForm.title} onChange={(e) => setDiscountForm((prev) => ({ ...prev, title: e.target.value }))} /></div>
              <div className="lgx-field"><label>ใช้ได้สูงสุด (ครั้ง)</label><input type="number" className="lgx-input" placeholder="ว่าง = ไม่จำกัด" value={discountForm.max_uses} onChange={(e) => setDiscountForm((prev) => ({ ...prev, max_uses: e.target.value }))} /></div>
              <div className="lgx-field"><label>ลด %</label><input type="number" min="1" max="95" className="lgx-input" placeholder="เช่น 20" value={discountForm.discount_percent} onChange={(e) => setDiscountForm((prev) => ({ ...prev, discount_percent: e.target.value, discount_amount_points: '' }))} /></div>
              <div className="lgx-field"><label>หรือ ลด (แต้ม)</label><input type="number" min="1" className="lgx-input" placeholder="เช่น 100" value={discountForm.discount_amount_points} onChange={(e) => setDiscountForm((prev) => ({ ...prev, discount_amount_points: e.target.value, discount_percent: '' }))} /></div>
              <div className="lgx-field lgx-field-end"><label className="lgx-checkbox-row"><input type="checkbox" checked={discountForm.is_active} onChange={(e) => setDiscountForm((prev) => ({ ...prev, is_active: e.target.checked }))} />เปิดใช้งาน</label></div>
            </div>
            <div className="lgx-field" style={{ maxWidth: 300 }}><label>วัน-เวลาหมดอายุ</label><input type="datetime-local" className="lgx-input" value={discountForm.expires_at} onChange={(e) => setDiscountForm((prev) => ({ ...prev, expires_at: e.target.value }))} /></div>
          </div>
          <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)', justifyContent: 'flex-end' }}>
            <div className="lgx-btn-group">
              <button type="button" className="lgx-btn" onClick={() => setView('list')}>ยกเลิก</button>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveDiscount} disabled={!canManage}><i className="bi bi-floppy" />บันทึกส่วนลด</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
