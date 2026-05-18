import { useMemo, useState } from 'react'
import { formatDateTime, formatNumber, getErrorMessage, isoToLocalInput } from '../helpers.js'

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  image_url: '',
  bundle_price: '',
  is_active: true,
  is_hidden: false,
  sort_order: 0,
  starts_at: '',
  ends_at: '',
  items: [],
}

const EMPTY_ITEM = { product_id: '', product_option_id: '', qty: 1 }

function makeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getOptionList(product) {
  return Array.isArray(product?.product_options) ? product.product_options : []
}

function getOptionLabel(option) {
  if (!option) return ''
  return String(option.label || option.id || '').trim()
}

function getOptionPrice(option) {
  const price = Number(option?.price_points)
  return Number.isFinite(price) ? price : null
}

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
    name: bundle.name || '',
    slug: bundle.slug || '',
    description: bundle.description || '',
    image_url: bundle.image_url || '',
    bundle_price: String(bundle.bundle_price ?? ''),
    is_active: bundle.is_active !== false,
    is_hidden: Boolean(bundle.is_hidden),
    sort_order: bundle.sort_order ?? 0,
    starts_at: isoToLocalInput(bundle.starts_at),
    ends_at: isoToLocalInput(bundle.ends_at),
    items: Array.isArray(bundle.items)
      ? bundle.items.map((item) => ({
          product_id: Number(item.product_id),
          product_option_id: item.product_option_id ? String(item.product_option_id) : '',
          product_name: item.product_name || `#${item.product_id}`,
          product_image_url: item.product_image_url || '',
          product_option_label: item.product_option?.label || item.product_option_label || '',
          qty: Math.max(1, Number(item.qty) || 1),
          unit_price_points: Number(item.product_price ?? item.product_option?.price_points ?? 0) || 0,
        }))
      : [],
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

  const formTotals = (() => {
    const original = form.items.reduce((sum, item) => sum + getItemUnitPrice(item) * (Number(item.qty) || 1), 0)
    const price = Number(form.bundle_price)
    const bundlePrice = Number.isFinite(price) ? Math.max(0, Math.trunc(price)) : 0
    const saving = Math.max(0, original - bundlePrice)
    const savingPct = original > 0 ? Math.round((saving / original) * 100) : 0
    return { original, bundlePrice, saving, savingPct }
  })()

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
      const data = await fetchJson(`/api/admin/bundles/${bundle.id}`)
      setForm(mapBundleToForm(data?.bundle || bundle))
      setEditId(bundle.id)
      setNewItem(EMPTY_ITEM)
      setView('form')
      setStatus({ status: 'idle', message: '' })
    } catch (error) {
      setStatus({ status: 'error', message: getBundleErrorMessage(error) })
    }
  }

  function addItem() {
    const productId = Number(newItem.product_id)
    if (!Number.isFinite(productId) || productId <= 0) {
      setStatus({ status: 'error', message: 'กรุณาเลือกสินค้า' })
      return
    }

    const product = productById.get(productId)
    if (!product) {
      setStatus({ status: 'error', message: 'ไม่พบสินค้านี้' })
      return
    }

    const optionList = getOptionList(product)
    const optionId = String(newItem.product_option_id || '')
    if (optionList.length > 0 && !optionId) {
      setStatus({ status: 'error', message: 'สินค้านี้มีตัวเลือก กรุณาเลือก option ก่อนเพิ่ม' })
      return
    }

    const option = optionList.find((entry) => String(entry.id) === optionId) || null
    const qty = Math.max(1, Math.trunc(Number(newItem.qty) || 1))
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: productId,
          product_option_id: option?.id ? String(option.id) : '',
          product_name: product.name || `#${productId}`,
          product_image_url: product.image_url || '',
          product_option_label: getOptionLabel(option),
          qty,
          unit_price_points: getOptionPrice(option) ?? (Number.isFinite(Number(product.price)) ? Number(product.price) : 0),
        },
      ],
    }))
    setNewItem(EMPTY_ITEM)
    setStatus({ status: 'idle', message: '' })
  }

  function removeItem(index) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) }))
  }

  function updateItemQty(index, qty) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, qty: Math.max(1, Math.trunc(Number(qty) || 1)) } : item
      )),
    }))
  }

  async function save() {
    const name = form.name.trim()
    const slug = form.slug.trim()
    if (!name || !slug) {
      setStatus({ status: 'error', message: 'กรุณากรอกชื่อ Bundle และ slug' })
      return
    }
    const price = Number(form.bundle_price)
    if (!Number.isFinite(price) || price < 0) {
      setStatus({ status: 'error', message: 'ราคา Bundle ต้องเป็นตัวเลขและไม่ติดลบ' })
      return
    }
    if (form.items.length < 1) {
      setStatus({ status: 'error', message: 'ต้องมีสินค้าในชุดอย่างน้อย 1 รายการ' })
      return
    }

    setStatus({ status: 'loading', message: '' })
    try {
      const body = {
        name,
        slug,
        description: form.description.trim(),
        image_url: form.image_url.trim(),
        bundle_price: Math.trunc(price),
        is_active: Boolean(form.is_active),
        is_hidden: Boolean(form.is_hidden),
        sort_order: Number(form.sort_order) || 0,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        items: form.items.map((item) => ({
          product_id: Number(item.product_id),
          product_option_id: item.product_option_id || null,
          qty: Math.max(1, Math.trunc(Number(item.qty) || 1)),
        })),
      }

      if (editId) {
        await fetchJson(`/api/admin/bundles/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        await fetchJson('/api/admin/bundles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      setStatus({ status: 'ok', message: editId ? 'บันทึก Bundle แล้ว' : 'สร้าง Bundle แล้ว' })
      await loadModuleData('bundles')
      setTimeout(() => setView('list'), 650)
    } catch (error) {
      setStatus({ status: 'error', message: getBundleErrorMessage(error) })
    }
  }

  async function deleteBundle(bundle) {
    if (!window.confirm(`ลบ Bundle "${bundle.name}" ?`)) return
    setStatus({ status: 'loading', message: '' })
    try {
      await fetchJson(`/api/admin/bundles/${bundle.id}`, { method: 'DELETE' })
      await loadModuleData('bundles')
      setStatus({ status: 'idle', message: '' })
    } catch (error) {
      setStatus({ status: 'error', message: getBundleErrorMessage(error) })
    }
  }

  if (view === 'form') {
    return (
      <div className="admin-module admin-bundles-module">
        <div className="d-flex align-items-center justify-content-between gap-3 mb-4">
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setView('list')}>
              <i className="bi bi-arrow-left"></i>
            </button>
            <div>
              <h5 className="mb-0 fw-bold">{editId ? 'แก้ไข Bundle' : 'สร้าง Bundle ใหม่'}</h5>
              <div className="text-muted small">ตั้งราคา ช่วงเวลา และสินค้าในชุดได้จากหน้านี้</div>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <span className="admin-chip">มูลค่ารวม {formatNumber(formTotals.original)}</span>
            <span className="admin-chip">ลด {formatNumber(formTotals.saving)} ({formTotals.savingPct}%)</span>
          </div>
        </div>

        {status.status === 'error' ? <div className="alert alert-danger py-2">{status.message}</div> : null}
        {status.status === 'ok' ? <div className="alert alert-success py-2">{status.message}</div> : null}

        <div className="row g-3">
          <div className="col-xl-8">
            <div className="card h-100">
              <div className="card-header d-flex justify-content-between align-items-center">
                <strong>ข้อมูล Bundle</strong>
                <span className="badge text-bg-light">#{editId || 'new'}</span>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-7">
                    <label className="form-label">ชื่อ Bundle *</label>
                    <input
                      className="form-control"
                      value={form.name}
                      onChange={(event) => {
                        const value = event.target.value
                        setForm((prev) => ({ ...prev, name: value, slug: prev.slug || makeSlug(value) }))
                      }}
                    />
                  </div>
                  <div className="col-md-5">
                    <label className="form-label">Slug *</label>
                    <input className="form-control font-monospace" value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: makeSlug(event.target.value) }))} />
                  </div>
                  <div className="col-12">
                    <label className="form-label">รายละเอียด</label>
                    <textarea className="form-control" rows={3} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
                  </div>
                  <div className="col-md-8">
                    <label className="form-label">URL รูปภาพ</label>
                    <input className="form-control" value={form.image_url} onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">ราคา Bundle *</label>
                    <input type="number" min="0" className="form-control" value={form.bundle_price} onChange={(event) => setForm((prev) => ({ ...prev, bundle_price: event.target.value }))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">เริ่มขาย</label>
                    <input type="datetime-local" className="form-control" value={form.starts_at} onChange={(event) => setForm((prev) => ({ ...prev, starts_at: event.target.value }))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">สิ้นสุด</label>
                    <input type="datetime-local" className="form-control" value={form.ends_at} onChange={(event) => setForm((prev) => ({ ...prev, ends_at: event.target.value }))} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">ลำดับ</label>
                    <input type="number" className="form-control" value={form.sort_order} onChange={(event) => setForm((prev) => ({ ...prev, sort_order: Number(event.target.value) || 0 }))} />
                  </div>
                  <div className="col-md-8 d-flex align-items-end gap-4 pb-2">
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" id="bundle-active" checked={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
                      <label className="form-check-label" htmlFor="bundle-active">เปิดขาย</label>
                    </div>
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" id="bundle-hidden" checked={form.is_hidden} onChange={(event) => setForm((prev) => ({ ...prev, is_hidden: event.target.checked }))} />
                      <label className="form-check-label" htmlFor="bundle-hidden">ซ่อนจากหน้าร้าน</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-xl-4">
            <div className="card h-100">
              <div className="card-header"><strong>สรุปราคา</strong></div>
              <div className="card-body">
                <div className="d-grid gap-2">
                  <div className="module-stat-card">
                    <div className="text-muted small fw-bold">มูลค่าสินค้ารวม</div>
                    <div className="h4 mb-0 fw-black">{formatNumber(formTotals.original)}</div>
                  </div>
                  <div className="module-stat-card">
                    <div className="text-muted small fw-bold">ราคา Bundle</div>
                    <div className="h4 mb-0 fw-black text-primary">{formatNumber(formTotals.bundlePrice)}</div>
                  </div>
                  <div className="module-stat-card">
                    <div className="text-muted small fw-bold">ส่วนลดโดยประมาณ</div>
                    <div className="h4 mb-0 fw-black text-success">{formatNumber(formTotals.saving)} <span className="fs-6">({formTotals.savingPct}%)</span></div>
                  </div>
                </div>
                {form.image_url ? <img src={form.image_url} alt="" className="mt-3 w-100 rounded object-fit-cover" style={{ aspectRatio: '16/9' }} /> : null}
              </div>
            </div>
          </div>

          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <strong>สินค้าในชุด</strong>
                <span className="badge text-bg-primary">{form.items.length} รายการ</span>
              </div>
              <div className="card-body">
                {form.items.length === 0 ? (
                  <div className="module-empty py-4">ยังไม่มีสินค้าในชุด</div>
                ) : (
                  <div className="vstack gap-2 mb-3">
                    {form.items.map((item, index) => (
                      <div key={`${item.product_id}-${item.product_option_id}-${index}`} className="d-flex align-items-center gap-3 rounded border bg-light-subtle p-2">
                        {item.product_image_url ? <img src={item.product_image_url} alt="" className="rounded object-fit-cover" style={{ width: 52, height: 52 }} /> : <div className="rounded bg-secondary-subtle" style={{ width: 52, height: 52 }} />}
                        <div className="min-w-0 flex-grow-1">
                          <div className="fw-bold text-truncate">{item.product_name}</div>
                          <div className="small text-muted">
                            {getItemOptionLabel(item) ? <>Option: {getItemOptionLabel(item)} · </> : null}
                            {formatNumber(getItemUnitPrice(item))} พ้อยต่อชิ้น
                          </div>
                        </div>
                        <input type="number" min="1" className="form-control form-control-sm" style={{ width: 86 }} value={item.qty} onChange={(event) => updateItemQty(index, event.target.value)} />
                        <div className="text-end" style={{ width: 120 }}>
                          <div className="fw-bold">{formatNumber(getItemUnitPrice(item) * Number(item.qty || 1))}</div>
                          <div className="small text-muted">พ้อย</div>
                        </div>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeItem(index)} disabled={!canManage}>
                          <i className="bi bi-x-lg"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="row g-2 align-items-end">
                  <div className="col-lg-5">
                    <label className="form-label">สินค้า</label>
                    <select
                      className="form-select"
                      value={newItem.product_id}
                      onChange={(event) => {
                        const productId = event.target.value
                        const product = productById.get(Number(productId))
                        const options = getOptionList(product)
                        setNewItem({ product_id: productId, product_option_id: options.length === 1 ? String(options[0].id) : '', qty: 1 })
                      }}
                    >
                      <option value="">เลือกสินค้า</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name} · {formatNumber(product.price)} พ้อย</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-lg-4">
                    <label className="form-label">Option</label>
                    <select className="form-select" value={newItem.product_option_id} onChange={(event) => setNewItem((prev) => ({ ...prev, product_option_id: event.target.value }))} disabled={!selectedProduct || selectedOptions.length === 0}>
                      <option value="">{selectedOptions.length > 0 ? 'เลือก option' : 'ค่าเริ่มต้น'}</option>
                      {selectedOptions.map((option) => (
                        <option key={option.id} value={option.id}>{getOptionLabel(option)} · {formatNumber(getOptionPrice(option) ?? selectedProduct?.price ?? 0)} พ้อย</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-lg-1 col-4">
                    <label className="form-label">จำนวน</label>
                    <input type="number" min="1" className="form-control" value={newItem.qty} onChange={(event) => setNewItem((prev) => ({ ...prev, qty: event.target.value }))} />
                  </div>
                  <div className="col-lg-2 col-8">
                    <button type="button" className="btn btn-outline-primary w-100" onClick={addItem} disabled={!canManage}>
                      <i className="bi bi-plus-lg me-1"></i>เพิ่ม
                    </button>
                  </div>
                </div>

                <div className="mt-4 d-flex flex-wrap gap-2">
                  <button className="btn btn-primary" type="button" onClick={save} disabled={!canManage || status.status === 'loading'}>
                    {status.status === 'loading' ? 'กำลังบันทึก...' : 'บันทึก Bundle'}
                  </button>
                  <button className="btn btn-outline-secondary" type="button" onClick={() => setView('list')}>ยกเลิก</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-module admin-bundles-module">
      <div className="d-flex align-items-center justify-content-between gap-3 mb-4">
        <div>
          <h5 className="mb-1 fw-bold">Product Bundles</h5>
          <div className="text-muted small">จัดชุดสินค้า ตั้งราคาพิเศษ และควบคุมช่วงเวลาขาย</div>
        </div>
        {canManage ? (
          <button className="btn btn-primary btn-sm" type="button" onClick={openNew}>
            <i className="bi bi-plus-lg me-1"></i>สร้าง Bundle
          </button>
        ) : null}
      </div>

      {status.status === 'error' ? <div className="alert alert-danger py-2">{status.message}</div> : null}

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="module-stat-card">
            <div className="text-muted small fw-bold">Bundle ทั้งหมด</div>
            <div className="h3 mb-0 fw-black">{formatNumber(bundles.length)}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="module-stat-card">
            <div className="text-muted small fw-bold">เปิดขายอยู่</div>
            <div className="h3 mb-0 fw-black text-success">{formatNumber(activeCount)}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="module-stat-card">
            <div className="text-muted small fw-bold">สินค้าใน Bundle</div>
            <div className="h3 mb-0 fw-black text-primary">{formatNumber(totalItems)}</div>
          </div>
        </div>
      </div>

      {bundles.length === 0 ? (
        <div className="module-empty py-5">ยังไม่มี Bundle</div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Bundle</th>
                  <th>ราคา</th>
                  <th>สินค้า</th>
                  <th>ช่วงเวลา</th>
                  <th>สถานะ</th>
                  <th className="text-end">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((bundle) => {
                  const expired = bundle.ends_at && new Date(bundle.ends_at).getTime() < nowMs
                  const notStarted = bundle.starts_at && new Date(bundle.starts_at).getTime() > nowMs
                  const statusBadge = bundle.is_active === false
                    ? <span className="badge text-bg-secondary">ปิด</span>
                    : expired
                      ? <span className="badge text-bg-dark">หมดเวลา</span>
                      : notStarted
                        ? <span className="badge text-bg-info">รอเปิด</span>
                        : <span className="badge text-bg-success">ขายอยู่</span>

                  return (
                    <tr key={bundle.id}>
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          {bundle.image_url ? <img src={bundle.image_url} alt="" className="rounded object-fit-cover" style={{ width: 56, height: 42 }} /> : <div className="rounded bg-secondary-subtle" style={{ width: 56, height: 42 }} />}
                          <div className="min-w-0">
                            <div className="fw-bold text-truncate">{bundle.name}</div>
                            <div className="small text-muted font-monospace">{bundle.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="fw-black text-success">{formatNumber(bundle.bundle_price)}</span> <span className="text-muted small">พ้อย</span></td>
                      <td><span className="badge text-bg-primary">{formatNumber(bundle.item_count || 0)} รายการ</span></td>
                      <td className="small text-muted">
                        {bundle.starts_at ? <div>เริ่ม {formatDateTime(bundle.starts_at)}</div> : null}
                        {bundle.ends_at ? <div>จบ {formatDateTime(bundle.ends_at)}</div> : null}
                        {!bundle.starts_at && !bundle.ends_at ? '-' : null}
                      </td>
                      <td>
                        {statusBadge}
                        {bundle.is_hidden ? <span className="badge text-bg-light ms-1">ซ่อน</span> : null}
                      </td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          <button className="btn btn-outline-primary" type="button" disabled={!canManage || status.status === 'loading'} onClick={() => openEdit(bundle)}>
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button className="btn btn-outline-danger" type="button" disabled={!canManage || status.status === 'loading'} onClick={() => deleteBundle(bundle)}>
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hiddenCount > 0 ? <div className="mt-3 small text-muted">มี Bundle ที่ซ่อนอยู่ {formatNumber(hiddenCount)} รายการ</div> : null}
    </div>
  )
}
