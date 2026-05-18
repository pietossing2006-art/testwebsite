import { useState, useEffect, useCallback } from 'react'
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
  if (!row?.starts_at && !row?.ends_at) return <span className="text-secondary small">—</span>
  if (notStarted) {
    const when = new Date(row.starts_at).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return <span className="badge text-bg-info small">⏰ {when}</span>
  }
  if (expired) return <span className="badge text-bg-secondary small">✕ หมดอายุ</span>
  if (!row?.ends_at) return <span className="text-secondary small">—</span>
  const urgency = endsMs && (endsMs - nowMs) < 3600000
  return (
    <span className={`badge ${urgency ? 'text-bg-danger' : 'text-bg-warning'} font-monospace`}>
      ⚡ {countdown || '...'}
    </span>
  )
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

  if (!data) return null

  const canManage = canAction('promotions.manage')
  const coupons = data.coupons || []
  const promotions = data.promotions || []
  const discountCoupons = data.discountCoupons || []
  const products = data.products || []

  const allItems = [
    ...promotions.map(p => ({ ...p, _type: 'promotion' })),
    ...discountCoupons.map(d => ({ ...d, _type: 'discount' })),
    ...coupons.map(c => ({ ...c, _type: 'coupon' })),
  ].filter(item => {
    if (scope === 'promotion' && item._type !== 'promotion') return false
    if (scope === 'discount' && item._type !== 'discount') return false
    if (scope === 'coupon' && item._type !== 'coupon') return false
    if (search) {
      const q = search.toLowerCase()
      const name = String(item.title || item.code || '').toLowerCase()
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
      id: p.id, product_id: p.product_id ? String(p.product_id) : '', title: p.title || '',
      discount_percent: p.discount_percent || '', discount_amount_points: p.discount_amount_points || '',
      starts_at: isoToLocalInput(p.starts_at), ends_at: isoToLocalInput(p.ends_at), is_active: p.is_active !== false,
    })
    setFormType('promotion')
    setView('form')
  }

  function editCoupon(c) {
    setCouponForm({
      id: c.id, code: c.code || '', points: pickNumber(c.points) || 100,
      max_uses: pickNumber(c.max_uses) || 1, used_count: pickNumber(c.used_count),
      expires_at: isoToLocalInput(c.expires_at), is_active: c.is_active !== false,
    })
    setFormType('coupon')
    setView('form')
  }

  function editDiscount(d) {
    setDiscountForm({
      id: d.id, code: d.code || '', title: d.title || '',
      discount_percent: d.discount_percent || '', discount_amount_points: d.discount_amount_points || '',
      max_uses: d.max_uses != null ? String(d.max_uses) : '', used_count: pickNumber(d.used_count),
      expires_at: isoToLocalInput(d.expires_at), is_active: d.is_active !== false,
    })
    setFormType('discount')
    setView('form')
  }

  async function savePromotion() {
    const f = promotionForm
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const body = {
        product_id: f.product_id ? Number(f.product_id) : null,
        title: f.title.trim(),
        discount_percent: f.discount_percent ? Number(f.discount_percent) : null,
        discount_amount_points: f.discount_amount_points ? Number(f.discount_amount_points) : null,
        starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
        ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
        is_active: f.is_active,
      }
      if (f.id) {
        await fetchJson(`/api/admin/promotions/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await fetchJson('/api/admin/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      setActionState({ status: 'success', message: 'บันทึกโปรโมชันเรียบร้อย' })
      setView('list')
      await loadModuleData('promotions')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function saveCoupon() {
    const f = couponForm
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const body = {
        code: f.code.trim(), points: Number(f.points), max_uses: Number(f.max_uses),
        used_count: Number(f.used_count),
        expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null,
        is_active: f.is_active,
      }
      if (f.id) {
        await fetchJson(`/api/admin/coupons/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await fetchJson('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
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
        code: f.code.trim(), title: f.title.trim(),
        discount_percent: f.discount_percent ? Number(f.discount_percent) : null,
        discount_amount_points: f.discount_amount_points ? Number(f.discount_amount_points) : null,
        max_uses: f.max_uses ? Number(f.max_uses) : null,
        used_count: Number(f.used_count),
        expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null,
        is_active: f.is_active,
      }
      if (f.id) {
        await fetchJson(`/api/admin/discount-coupons/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await fetchJson('/api/admin/discount-coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      setActionState({ status: 'success', message: 'บันทึกส่วนลดเรียบร้อย' })
      setView('list')
      await loadModuleData('promotions')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteItem(item) {
    if (!window.confirm('ยืนยันลบ?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      const endpoint = item._type === 'promotion' ? `/api/admin/promotions/${item.id}` : item._type === 'discount' ? `/api/admin/discount-coupons/${item.id}` : `/api/admin/coupons/${item.id}`
      await fetchJson(endpoint, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบเรียบร้อย' })
      await loadModuleData('promotions')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`alert ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show`}>
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })}></button>
        </div>
      )}

      {/* Summary */}
      <div className="row mb-3">
        {[
          { label: 'โปรโมชัน', val: promotions.length, bg: 'text-bg-primary' },
          { label: 'คูปองส่วนลด', val: discountCoupons.length, bg: 'text-bg-info' },
          { label: 'คูปองแต้ม', val: coupons.length, bg: 'text-bg-success' },
        ].map((c, i) => (
          <div className="col-md-4" key={i}>
            <div className={`small-box ${c.bg}`}>
              <div className="inner"><h3>{c.val}</h3><p>{c.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      {view === 'list' && (
        <>
          {/* Filters */}
          <div className="card mb-3 promotions-filter-card">
            <div className="card-body py-2 promotions-filter-body">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <ul className="nav nav-pills nav-sm me-auto">
                  {[{ id: 'all', label: 'ทั้งหมด' }, { id: 'promotion', label: 'โปรโมชัน' }, { id: 'discount', label: 'ส่วนลด' }, { id: 'coupon', label: 'คูปองแต้ม' }].map(t => (
                    <li className="nav-item" key={t.id}>
                      <button className={`nav-link ${scope === t.id ? 'active' : ''}`} onClick={() => setScope(t.id)}>{t.label}</button>
                    </li>
                  ))}
                </ul>
                <select className="form-select form-select-sm" style={{ width: 130 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">ทุกสถานะ</option>
                  <option value="active">กำลังใช้งาน</option>
                  <option value="inactive">ปิดใช้งาน</option>
                  <option value="expired">หมดอายุ</option>
                  <option value="exhausted">ใช้ครบ</option>
                </select>
                <input className="form-control form-control-sm" style={{ width: 160 }} placeholder="ค้นหา..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="dropdown ms-auto promotions-create-dropdown">
                  <button className="btn btn-primary btn-sm dropdown-toggle" data-bs-toggle="dropdown">
                    <i className="bi bi-plus-lg me-1"></i>สร้าง
                  </button>
                  <ul className="dropdown-menu dropdown-menu-end">
                    <li><button className="dropdown-item" onClick={() => { setPromotionForm(DEFAULT_PROMOTION_FORM); setFormType('promotion'); setView('form') }}>โปรโมชันสินค้า</button></li>
                    <li><button className="dropdown-item" onClick={() => { setDiscountForm(DEFAULT_DISCOUNT_COUPON_FORM); setFormType('discount'); setView('form') }}>คูปองส่วนลด</button></li>
                    <li><button className="dropdown-item" onClick={() => { setCouponForm(DEFAULT_COUPON_FORM); setFormType('coupon'); setView('form') }}>คูปองแต้ม</button></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="card">
            <div className="card-body p-0">
              <table className="table table-hover table-striped mb-0">
                <thead>
                  <tr><th>ประเภท</th><th>ชื่อ / โค้ด</th><th>ส่วนลด</th><th>สถานะ</th><th>ใช้แล้ว</th><th>ช่วงเวลา</th><th>จัดการ</th></tr>
                </thead>
                <tbody>
                  {allItems.map(item => {
                    const typeBadge = item._type === 'promotion' ? 'text-bg-primary' : item._type === 'discount' ? 'text-bg-info' : 'text-bg-success'
                    const typeLabel = item._type === 'promotion' ? 'โปรโมชัน' : item._type === 'discount' ? 'ส่วนลด' : 'คูปองแต้ม'
                    const statusMeta = item._type === 'coupon' ? getCouponStatusMeta(item) : getPromotionStatusMeta(item)
                    const isActiveFlash = statusMeta.key === 'active' && item._type === 'promotion'
                    return (
                      <tr key={`${item._type}-${item.id}`}>
                        <td><span className={`badge ${typeBadge}`}>{typeLabel}</span></td>
                        <td>
                          <div className="fw-semibold">{item.title || item.code || '-'}</div>
                          {item._type === 'promotion' && item.product_id && (
                            <div className="text-muted small">สินค้า #{item.product_id}</div>
                          )}
                        </td>
                        <td>{item._type === 'coupon' ? `${formatNumber(item.points)} แต้ม` : formatDiscountSummary(item)}</td>
                        <td>
                          <span className={`badge ${statusMeta.bg}`}>{statusMeta.label}</span>
                          {isActiveFlash && item.ends_at && (
                            <div className="mt-1"><CountdownCell row={item} /></div>
                          )}
                        </td>
                        <td>
                          {item._type !== 'promotion' ? `${pickNumber(item.used_count)}/${item.max_uses || '∞'}` : '-'}
                        </td>
                        <td className="small text-muted">
                          {item._type !== 'coupon' ? (
                            <>
                              {item.starts_at ? <div>▶ {formatDateTime(item.starts_at)}</div> : null}
                              {item.ends_at ? <div>■ {formatDateTime(item.ends_at)}</div> : null}
                            </>
                          ) : (
                            item.expires_at ? <div>■ {formatDateTime(item.expires_at)}</div> : '—'
                          )}
                        </td>
                        <td>
                          <div className="btn-group btn-group-sm">
                            <button className="btn btn-outline-primary" disabled={!canManage} onClick={() => {
                              if (item._type === 'promotion') editPromotion(item)
                              else if (item._type === 'discount') editDiscount(item)
                              else editCoupon(item)
                            }}><i className="bi bi-pencil"></i></button>
                            <button className="btn btn-outline-danger" disabled={!canManage} onClick={() => deleteItem(item)}><i className="bi bi-trash"></i></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {allItems.length === 0 && <tr><td colSpan={6} className="text-center text-secondary py-4">ไม่พบรายการ</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Forms ── */}
      {view === 'form' && formType === 'promotion' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">{promotionForm.id ? 'แก้ไขโปรโมชัน' : 'สร้างโปรโมชันใหม่'}</h3></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6"><label className="form-label">ชื่อ</label><input className="form-control" value={promotionForm.title} onChange={(e) => setPromotionForm(prev => ({ ...prev, title: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">สินค้า</label>
                <select className="form-select" value={promotionForm.product_id} onChange={(e) => setPromotionForm(prev => ({ ...prev, product_id: e.target.value }))}>
                  <option value="">-- เลือก --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-md-4"><label className="form-label">ลด %</label><input type="number" className="form-control" value={promotionForm.discount_percent} onChange={(e) => setPromotionForm(prev => ({ ...prev, discount_percent: e.target.value, discount_amount_points: '' }))} /></div>
              <div className="col-md-4"><label className="form-label">ลด (แต้ม)</label><input type="number" className="form-control" value={promotionForm.discount_amount_points} onChange={(e) => setPromotionForm(prev => ({ ...prev, discount_amount_points: e.target.value, discount_percent: '' }))} /></div>
              <div className="col-md-4 d-flex align-items-end"><div className="form-check"><input type="checkbox" className="form-check-input" checked={promotionForm.is_active} onChange={(e) => setPromotionForm(prev => ({ ...prev, is_active: e.target.checked }))} /><label className="form-check-label">เปิดใช้งาน</label></div></div>
              <div className="col-md-6"><label className="form-label">เริ่ม</label><input type="datetime-local" className="form-control" value={promotionForm.starts_at} onChange={(e) => setPromotionForm(prev => ({ ...prev, starts_at: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">สิ้นสุด</label><input type="datetime-local" className="form-control" value={promotionForm.ends_at} onChange={(e) => setPromotionForm(prev => ({ ...prev, ends_at: e.target.value }))} /></div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2">
            <button className="btn btn-primary" onClick={savePromotion} disabled={!canManage}><i className="bi bi-floppy me-1"></i>บันทึก</button>
            <button className="btn btn-outline-secondary" onClick={() => setView('list')}>ยกเลิก</button>
          </div>
        </div>
      )}

      {view === 'form' && formType === 'coupon' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">{couponForm.id ? 'แก้ไขคูปองแต้ม' : 'สร้างคูปองแต้มใหม่'}</h3></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4"><label className="form-label">โค้ด</label><input className="form-control" value={couponForm.code} onChange={(e) => setCouponForm(prev => ({ ...prev, code: e.target.value }))} /></div>
              <div className="col-md-3"><label className="form-label">แต้ม</label><input type="number" className="form-control" value={couponForm.points} onChange={(e) => setCouponForm(prev => ({ ...prev, points: Number(e.target.value) }))} /></div>
              <div className="col-md-3"><label className="form-label">ใช้ได้สูงสุด</label><input type="number" className="form-control" value={couponForm.max_uses} onChange={(e) => setCouponForm(prev => ({ ...prev, max_uses: Number(e.target.value) }))} /></div>
              <div className="col-md-2 d-flex align-items-end"><div className="form-check"><input type="checkbox" className="form-check-input" checked={couponForm.is_active} onChange={(e) => setCouponForm(prev => ({ ...prev, is_active: e.target.checked }))} /><label className="form-check-label">เปิด</label></div></div>
              <div className="col-md-6"><label className="form-label">หมดอายุ</label><input type="datetime-local" className="form-control" value={couponForm.expires_at} onChange={(e) => setCouponForm(prev => ({ ...prev, expires_at: e.target.value }))} /></div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2">
            <button className="btn btn-primary" onClick={saveCoupon} disabled={!canManage}><i className="bi bi-floppy me-1"></i>บันทึก</button>
            <button className="btn btn-outline-secondary" onClick={() => setView('list')}>ยกเลิก</button>
          </div>
        </div>
      )}

      {view === 'form' && formType === 'discount' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">{discountForm.id ? 'แก้ไขคูปองส่วนลด' : 'สร้างคูปองส่วนลดใหม่'}</h3></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4"><label className="form-label">โค้ด</label><input className="form-control" value={discountForm.code} onChange={(e) => setDiscountForm(prev => ({ ...prev, code: e.target.value }))} /></div>
              <div className="col-md-4"><label className="form-label">ชื่อ</label><input className="form-control" value={discountForm.title} onChange={(e) => setDiscountForm(prev => ({ ...prev, title: e.target.value }))} /></div>
              <div className="col-md-4"><label className="form-label">ใช้ได้สูงสุด</label><input type="number" className="form-control" value={discountForm.max_uses} onChange={(e) => setDiscountForm(prev => ({ ...prev, max_uses: e.target.value }))} /></div>
              <div className="col-md-4"><label className="form-label">ลด %</label><input type="number" className="form-control" value={discountForm.discount_percent} onChange={(e) => setDiscountForm(prev => ({ ...prev, discount_percent: e.target.value, discount_amount_points: '' }))} /></div>
              <div className="col-md-4"><label className="form-label">ลด (แต้ม)</label><input type="number" className="form-control" value={discountForm.discount_amount_points} onChange={(e) => setDiscountForm(prev => ({ ...prev, discount_amount_points: e.target.value, discount_percent: '' }))} /></div>
              <div className="col-md-4 d-flex align-items-end"><div className="form-check"><input type="checkbox" className="form-check-input" checked={discountForm.is_active} onChange={(e) => setDiscountForm(prev => ({ ...prev, is_active: e.target.checked }))} /><label className="form-check-label">เปิด</label></div></div>
              <div className="col-md-6"><label className="form-label">หมดอายุ</label><input type="datetime-local" className="form-control" value={discountForm.expires_at} onChange={(e) => setDiscountForm(prev => ({ ...prev, expires_at: e.target.value }))} /></div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2">
            <button className="btn btn-primary" onClick={saveDiscount} disabled={!canManage}><i className="bi bi-floppy me-1"></i>บันทึก</button>
            <button className="btn btn-outline-secondary" onClick={() => setView('list')}>ยกเลิก</button>
          </div>
        </div>
      )}
    </>
  )
}
