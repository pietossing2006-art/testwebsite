import { useMemo, useState } from 'react'
import ImageUploadCropper from '../../../components/admin/ImageUploadCropper.jsx'
import { formatDateTime, formatNumber, getErrorMessage, isoToLocalInput } from '../helpers.js'

const EMPTY_FORM = {
  name: '', slug: '', description: '', image_url: '', bundle_price: '', is_active: true, is_hidden: false, sort_order: 0, starts_at: '', ends_at: '', items: [],
}
const EMPTY_ITEM = { product_id: '', product_option_id: '', qty: 1 }

function makeSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function getOptionList(product) { return Array.isArray(product?.product_options) ? product.product_options : [] }
function getOptionLabel(option) { if (!option) return ''; return String(option.label || option.id || '').trim() }
function getOptionPrice(option) { const price = Number(option?.price_points); return Number.isFinite(price) ? price : null }

function getBundleErrorMessage(error) {
  const code = error?.data?.error
  if (code === 'invalid_name_or_slug') return 'กรุณากรอกชื่อและ slug ให้ถูกต้อง'
  if (code === 'invalid_price') return 'ราคา Bundle ต้องเป็นตัวเลขและไม่ติดลบ'
  if (code === 'invalid_bundle_items') return 'ต้องมีสินค้าในชุดอย่างน้อย 1 รายการ'
  if (code === 'invalid_product_option') return 'สินค้าที่มีตัวเลือกต้องเลือก option ให้ถูกต้อง'
  if (code === 'product_not_found') return 'ไม่พบสินค้าบางรายการในชุด'
  if (code === 'slug_taken') return 'Slug นี้ถูกใช้งานแล้ว'
  return getErrorMessage(error) || 'เกิดข้อผิดพลาด'
}

function mapBundleToForm(bundle) {
  return {
    name: bundle.name || '', slug: bundle.slug || '', description: bundle.description || '', image_url: bundle.image_url || '',
    bundle_price: String(bundle.bundle_price ?? ''), is_active: bundle.is_active !== false, is_hidden: Boolean(bundle.is_hidden),
    sort_order: bundle.sort_order ?? 0, starts_at: isoToLocalInput(bundle.starts_at), ends_at: isoToLocalInput(bundle.ends_at),
    items: Array.isArray(bundle.items) ? bundle.items.map((item) => ({
      product_id: Number(item.product_id),
      product_option_id: item.product_option_id ? String(item.product_option_id) : '',
      product_name: item.product_name || `#${item.product_id}`,
      product_image_url: item.product_image_url || '',
      product_option_label: item.product_option?.label || item.product_option_label || '',
      qty: Math.max(1, Number(item.qty) || 1),
      unit_price_points: Number(item.product_price ?? item.product_option?.price_points ?? 0) || 0,
    })) : [],
  }
}

export default function BundlesModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const canManage = canAction('bundles.manage')
  const [view, setView] = useState('list')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [status, setStatus] = useState({ status: 'idle', message: '' })
  const [newItem, setNewItem] = useState(EMPTY_ITEM)

  const [nowMs] = useState(() => Date.now())
  const moduleData = useMemo(() => ({
    bundles: Array.isArray(data?.bundles) ? data.bundles : [],
    products: Array.isArray(data?.products) ? data.products : [],
  }), [data])
  const bundles = moduleData.bundles
  const products = moduleData.products

  const productById = useMemo(() => {
    const map = new Map()
    for (const product of products) map.set(Number(product.id), product)
    return map
  }, [products])

  const activeCount = bundles.filter((bundle) => bundle.is_active !== false && !bundle.is_hidden).length
  const hiddenCount = bundles.filter((bundle) => bundle.is_hidden).length
  const totalItems = bundles.reduce((sum, bundle) => sum + Number(bundle.item_count ?? 0), 0)

  const selectedProduct = productById.get(Number(newItem.product_id)) || null
  const selectedOptions = getOptionList(selectedProduct)

  function getItemUnitPrice(item) {
    const product = productById.get(Number(item.product_id))
    const optionId = String(item.product_option_id || '')
    if (product && optionId) {
      const option = getOptionList(product).find((entry) => String(entry.id) === optionId)
      const optionPrice = getOptionPrice(option)
      if (optionPrice != null) return optionPrice
    }
    if (Number.isFinite(Number(item.unit_price_points))) return Number(item.unit_price_points)
    return Number(product?.price ?? 0) || 0
  }

  const formTotals = (() => {
    const original = form.items.reduce((sum, item) => sum + getItemUnitPrice(item) * (Number(item.qty) || 1), 0)
    const price = Number(form.bundle_price)
    const bundlePrice = Number.isFinite(price) ? Math.max(0, Math.trunc(price)) : 0
    const saving = Math.max(0, original - bundlePrice)
    const savingPct = original > 0 ? Math.round((saving / original) * 100) : 0
    return { original, bundlePrice, saving, savingPct }
  })()

  function getItemOptionLabel(item) {
    const product = productById.get(Number(item.product_id))
    const optionId = String(item.product_option_id || '')
    if (!optionId) return ''
    const option = getOptionList(product).find((entry) => String(entry.id) === optionId)
    return getOptionLabel(option) || item.product_option_label || optionId
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setNewItem(EMPTY_ITEM)
    setStatus({ status: 'idle', message: '' })
    setView('form')
  }

  async function openEdit(bundle) {
    setStatus({ status: 'loading', message: 'กำลังโหลดรายละเอียด Bundle...' })
    try {
      const d = await fetchJson(`/api/admin/bundles/${bundle.id}`)
      setForm(mapBundleToForm(d?.bundle || bundle))
      setEditId(bundle.id)
      setNewItem(EMPTY_ITEM)
      setView('form')
      setStatus({ status: 'idle', message: '' })
    } catch (error) { setStatus({ status: 'error', message: getBundleErrorMessage(error) }) }
  }

  function addItem() {
    const productId = Number(newItem.product_id)
    if (!Number.isFinite(productId) || productId <= 0) { setStatus({ status: 'error', message: 'กรุณาเลือกสินค้า' }); return }
    const product = productById.get(productId)
    if (!product) { setStatus({ status: 'error', message: 'ไม่พบสินค้านี้' }); return }
    const optionList = getOptionList(product)
    const optionId = String(newItem.product_option_id || '')
    if (optionList.length > 0 && !optionId) { setStatus({ status: 'error', message: 'สินค้านี้มีตัวเลือก กรุณาเลือก option ก่อนเพิ่ม' }); return }
    const option = optionList.find((entry) => String(entry.id) === optionId) || null
    const qty = Math.max(1, Math.trunc(Number(newItem.qty) || 1))
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, {
        product_id: productId, product_option_id: option?.id ? String(option.id) : '', product_name: product.name || `#${productId}`,
        product_image_url: product.image_url || '', product_option_label: getOptionLabel(option), qty,
        unit_price_points: getOptionPrice(option) ?? (Number.isFinite(Number(product.price)) ? Number(product.price) : 0),
      }],
    }))
    setNewItem(EMPTY_ITEM)
    setStatus({ status: 'idle', message: '' })
  }

  function removeItem(index) { setForm((prev) => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) })) }
  function updateItemQty(index, qty) {
    setForm((prev) => ({ ...prev, items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, qty: Math.max(1, Math.trunc(Number(qty) || 1)) } : item)) }))
  }

  async function save() {
    const name = form.name.trim()
    const slug = form.slug.trim()
    if (!name || !slug) { setStatus({ status: 'error', message: 'กรุณากรอกชื่อ Bundle และ slug' }); return }
    const price = Number(form.bundle_price)
    if (!Number.isFinite(price) || price < 0) { setStatus({ status: 'error', message: 'ราคา Bundle ต้องเป็นตัวเลขและไม่ติดลบ' }); return }
    if (form.items.length < 1) { setStatus({ status: 'error', message: 'ต้องมีสินค้าในชุดอย่างน้อย 1 รายการ' }); return }

    setStatus({ status: 'loading', message: '' })
    try {
      const body = {
        name, slug, description: form.description.trim(), image_url: form.image_url.trim(), bundle_price: Math.trunc(price),
        is_active: Boolean(form.is_active), is_hidden: Boolean(form.is_hidden), sort_order: Number(form.sort_order) || 0,
        starts_at: form.starts_at || null, ends_at: form.ends_at || null,
        items: form.items.map((item) => ({ product_id: Number(item.product_id), product_option_id: item.product_option_id || null, qty: Math.max(1, Math.trunc(Number(item.qty) || 1)) })),
      }
      if (editId) await fetchJson(`/api/admin/bundles/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      else await fetchJson('/api/admin/bundles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setStatus({ status: 'ok', message: editId ? 'บันทึก Bundle แล้ว' : 'สร้าง Bundle แล้ว' })
      await loadModuleData('bundles')
      setTimeout(() => setView('list'), 650)
    } catch (error) { setStatus({ status: 'error', message: getBundleErrorMessage(error) }) }
  }

  async function deleteBundle(bundle) {
    if (!window.confirm(`ลบ Bundle "${bundle.name}" ?`)) return
    setStatus({ status: 'loading', message: '' })
    try {
      await fetchJson(`/api/admin/bundles/${bundle.id}`, { method: 'DELETE' })
      await loadModuleData('bundles')
      setStatus({ status: 'idle', message: '' })
    } catch (error) { setStatus({ status: 'error', message: getBundleErrorMessage(error) }) }
  }

  if (view === 'form') {
    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="lgx-icon-action" onClick={() => setView('list')}><i className="bi bi-arrow-left" /></button>
            <div>
              <div style={{ fontWeight: 700 }}>{editId ? 'แก้ไข Bundle' : 'สร้าง Bundle ใหม่'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)' }}>ตั้งราคา ช่วงเวลา และสินค้าในชุดได้จากหน้านี้</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="lgx-pill neutral">มูลค่ารวม {formatNumber(formTotals.original)}</span>
            <span className="lgx-pill ok">ลด {formatNumber(formTotals.saving)} ({formTotals.savingPct}%)</span>
          </div>
        </div>

        {status.status === 'error' ? <div className="lgx-banner crit">{status.message}</div> : null}
        {status.status === 'ok' ? <div className="lgx-banner ok">{status.message}</div> : null}

        <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2>ข้อมูล Bundle</h2><span className="mono">#{editId || 'new'}</span></div>
            <div className="lgx-panel-body">
              <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
                <div className="lgx-field">
                  <label>ชื่อ Bundle *</label>
                  <input className="lgx-input" value={form.name} onChange={(event) => { const value = event.target.value; setForm((prev) => ({ ...prev, name: value, slug: prev.slug || makeSlug(value) })) }} />
                </div>
                <div className="lgx-field"><label>Slug *</label><input className="lgx-input mono" value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: makeSlug(event.target.value) }))} /></div>
              </div>
              <div className="lgx-field" style={{ marginBottom: 12 }}><label>รายละเอียด</label><textarea className="lgx-textarea" rows={3} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} /></div>
              <div style={{ marginBottom: 12 }}>
                <ImageUploadCropper label="URL รูปภาพ Bundle" value={form.image_url} onChange={(url) => setForm((prev) => ({ ...prev, image_url: url }))} aspectRatio={16 / 9} helpText="อัปโหลดรูปภาพชุด Bundle หรือตัดแต่งสัดส่วน 16:9 ได้ทันที" />
              </div>
              <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
                <div className="lgx-field"><label>ราคา Bundle *</label><input type="number" min="0" className="lgx-input" value={form.bundle_price} onChange={(event) => setForm((prev) => ({ ...prev, bundle_price: event.target.value }))} /></div>
                <div className="lgx-field"><label>เริ่มขาย</label><input type="datetime-local" className="lgx-input" value={form.starts_at} onChange={(event) => setForm((prev) => ({ ...prev, starts_at: event.target.value }))} /></div>
                <div className="lgx-field"><label>สิ้นสุด</label><input type="datetime-local" className="lgx-input" value={form.ends_at} onChange={(event) => setForm((prev) => ({ ...prev, ends_at: event.target.value }))} /></div>
                <div className="lgx-field"><label>ลำดับ</label><input type="number" className="lgx-input" value={form.sort_order} onChange={(event) => setForm((prev) => ({ ...prev, sort_order: Number(event.target.value) || 0 }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <label className="lgx-checkbox-row"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} />เปิดขาย</label>
                <label className="lgx-checkbox-row"><input type="checkbox" checked={form.is_hidden} onChange={(event) => setForm((prev) => ({ ...prev, is_hidden: event.target.checked }))} />ซ่อนจากหน้าร้าน</label>
              </div>
            </div>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2>สรุปราคา</h2></div>
            <div className="lgx-panel-body">
              <div className="lgx-mini-stats" style={{ gridTemplateColumns: '1fr', gap: 8 }}>
                <div className="lgx-mini-stat" style={{ textAlign: 'left' }}><div className="l">มูลค่าสินค้ารวม</div><div className="v" style={{ fontSize: 20 }}>{formatNumber(formTotals.original)}</div></div>
                <div className="lgx-mini-stat" style={{ textAlign: 'left' }}><div className="l">ราคา Bundle</div><div className="v" style={{ fontSize: 20, color: 'var(--lgx-accent)' }}>{formatNumber(formTotals.bundlePrice)}</div></div>
                <div className="lgx-mini-stat" style={{ textAlign: 'left' }}><div className="l">ส่วนลดโดยประมาณ</div><div className="v" style={{ fontSize: 20, color: 'var(--lgx-ok)' }}>{formatNumber(formTotals.saving)} <span style={{ fontSize: 12 }}>({formTotals.savingPct}%)</span></div></div>
              </div>
              {form.image_url ? <img src={form.image_url} alt="" style={{ marginTop: 12, width: '100%', borderRadius: 'var(--lgx-radius)', objectFit: 'cover', aspectRatio: '16/9' }} /> : null}
            </div>
          </div>

          <div className="lgx-panel" style={{ gridColumn: '1 / -1' }}>
            <div className="lgx-panel-head"><h2>สินค้าในชุด</h2><span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>{form.items.length} รายการ</span></div>
            <div className="lgx-panel-body">
              {form.items.length === 0 ? (
                <div className="lgx-empty">ยังไม่มีสินค้าในชุด</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {form.items.map((item, index) => (
                    <div key={`${item.product_id}-${item.product_option_id}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid var(--lgx-border)', borderRadius: 'var(--lgx-radius)', padding: 8 }}>
                      {item.product_image_url ? <img src={item.product_image_url} alt="" className="lgx-thumb" style={{ width: 48, height: 48 }} /> : <div className="lgx-thumb-empty" style={{ width: 48, height: 48 }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{getItemOptionLabel(item) ? `Option: ${getItemOptionLabel(item)} · ` : ''}{formatNumber(getItemUnitPrice(item))} พอยท์ต่อชิ้น</div>
                      </div>
                      <input type="number" min="1" className="lgx-input" style={{ width: 80 }} value={item.qty} onChange={(event) => updateItemQty(index, event.target.value)} />
                      <div style={{ textAlign: 'right', width: 100 }}>
                        <div style={{ fontWeight: 700 }}>{formatNumber(getItemUnitPrice(item) * Number(item.qty || 1))}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>พอยท์</div>
                      </div>
                      <button type="button" className="lgx-icon-action danger" onClick={() => removeItem(index)} disabled={!canManage}><i className="bi bi-x-lg" /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="lgx-form-grid" style={{ gridTemplateColumns: '2fr 1.6fr 0.7fr auto', alignItems: 'flex-end' }}>
                <div className="lgx-field">
                  <label>สินค้า</label>
                  <select className="lgx-select" value={newItem.product_id} onChange={(event) => { const productId = event.target.value; const product = productById.get(Number(productId)); const options = getOptionList(product); setNewItem({ product_id: productId, product_option_id: options.length === 1 ? String(options[0].id) : '', qty: 1 }) }}>
                    <option value="">เลือกสินค้า</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatNumber(product.price)} พอยท์</option>)}
                  </select>
                </div>
                <div className="lgx-field">
                  <label>Option</label>
                  <select className="lgx-select" value={newItem.product_option_id} onChange={(event) => setNewItem((prev) => ({ ...prev, product_option_id: event.target.value }))} disabled={!selectedProduct || selectedOptions.length === 0}>
                    <option value="">{selectedOptions.length > 0 ? 'เลือก option' : 'ค่าเริ่มต้น'}</option>
                    {selectedOptions.map((option) => <option key={option.id} value={option.id}>{getOptionLabel(option)} · {formatNumber(getOptionPrice(option) ?? selectedProduct?.price ?? 0)} พอยท์</option>)}
                  </select>
                </div>
                <div className="lgx-field"><label>จำนวน</label><input type="number" min="1" className="lgx-input" value={newItem.qty} onChange={(event) => setNewItem((prev) => ({ ...prev, qty: event.target.value }))} /></div>
                <button type="button" className="lgx-btn lgx-btn-accent" onClick={addItem} disabled={!canManage}><i className="bi bi-plus-lg" />เพิ่ม</button>
              </div>

              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="lgx-btn lgx-btn-accent" onClick={save} disabled={!canManage || status.status === 'loading'}>{status.status === 'loading' ? 'กำลังบันทึก...' : 'บันทึก Bundle'}</button>
                <button type="button" className="lgx-btn" onClick={() => setView('list')}>ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {canManage ? <button type="button" className="lgx-btn lgx-btn-accent" onClick={openNew}><i className="bi bi-plus-lg" />สร้าง Bundle ใหม่</button> : null}
      </div>

      {status.status === 'error' ? <div className="lgx-banner crit">{status.message}</div> : null}

      <div className="lgx-strip">
        <div className="lgx-stat"><div className="l">Bundle ทั้งหมด</div><div className="v">{formatNumber(bundles.length)}</div><div className="d">ชุดสินค้าทั้งหมดที่สร้างไว้</div></div>
        <div className="lgx-stat"><div className="l">เปิดขายอยู่</div><div className="v ok">{formatNumber(activeCount)}</div><div className="d">กำลังเปิดให้ลูกค้าสั่งซื้อ</div></div>
        <div className="lgx-stat"><div className="l">สินค้าใน Bundle</div><div className="v">{formatNumber(totalItems)}</div><div className="d">จำนวนรายการสินค้ารวม</div></div>
      </div>

      {bundles.length === 0 ? (
        <div className="lgx-panel"><div className="lgx-empty">ยังไม่มี Bundle</div></div>
      ) : (
        <div className="lgx-panel">
          <table className="lgx-table">
            <thead><tr><th>Bundle</th><th>ราคา</th><th>สินค้า</th><th>ช่วงเวลา</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {bundles.map((bundle) => {
                const expired = bundle.ends_at && new Date(bundle.ends_at).getTime() < nowMs
                const notStarted = bundle.starts_at && new Date(bundle.starts_at).getTime() > nowMs
                const statusBadge = bundle.is_active === false
                  ? <span className="lgx-pill neutral">ปิด</span>
                  : expired ? <span className="lgx-pill neutral">หมดเวลา</span>
                  : notStarted ? <span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>รอเปิด</span>
                  : <span className="lgx-pill ok">ขายอยู่</span>

                return (
                  <tr key={bundle.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {bundle.image_url ? <img src={bundle.image_url} alt="" className="lgx-thumb" style={{ width: 52, height: 40 }} /> : <div className="lgx-thumb-empty" style={{ width: 52, height: 40 }} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bundle.name}</div>
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{bundle.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td><span style={{ fontWeight: 700, color: 'var(--lgx-ok)' }}>{formatNumber(bundle.bundle_price)}</span> <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>พอยท์</span></td>
                    <td><span className="lgx-pill neutral">{formatNumber(bundle.item_count || 0)} รายการ</span></td>
                    <td style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>
                      {bundle.starts_at ? <div>เริ่ม {formatDateTime(bundle.starts_at)}</div> : null}
                      {bundle.ends_at ? <div>จบ {formatDateTime(bundle.ends_at)}</div> : null}
                      {!bundle.starts_at && !bundle.ends_at ? '-' : null}
                    </td>
                    <td>{statusBadge}{bundle.is_hidden ? <span className="lgx-pill neutral" style={{ marginLeft: 4 }}>ซ่อน</span> : null}</td>
                    <td>
                      <div className="lgx-btn-group">
                        <button type="button" className="lgx-icon-action" disabled={!canManage || status.status === 'loading'} onClick={() => openEdit(bundle)}><i className="bi bi-pencil" /></button>
                        <button type="button" className="lgx-icon-action danger" disabled={!canManage || status.status === 'loading'} onClick={() => deleteBundle(bundle)}><i className="bi bi-trash" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {hiddenCount > 0 ? <div style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)' }}>มี Bundle ที่ซ่อนอยู่ {formatNumber(hiddenCount)} รายการ</div> : null}
    </>
  )
}
