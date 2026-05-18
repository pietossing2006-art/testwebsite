import { useState } from 'react'
import {
  formatNumber, getErrorMessage, pickNumber, makeSlug,
  DEFAULT_CATEGORY_FORM, DEFAULT_PRODUCT_FORM, DEFAULT_PRODUCT_OPTION_DRAFT,
  DEFAULT_CATALOG_FILTER, normalizeCatalogFulfillmentType, normalizeProductCustomFormFields,
  normalizeCustomFormFieldsForSubmit, normalizeProductOptionsForSubmit,
  normalizeProductOptionId, createCustomFormFieldDraft,
} from '../helpers.js'

export default function CatalogModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [view, setView] = useState('products')
  const [filter, setFilter] = useState(DEFAULT_CATALOG_FILTER)
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [categoryForm, setCategoryForm] = useState(DEFAULT_CATEGORY_FORM)
  const [productForm, setProductForm] = useState(DEFAULT_PRODUCT_FORM)
  const [optionDraft, setOptionDraft] = useState(DEFAULT_PRODUCT_OPTION_DRAFT)
  const [optionError, setOptionError] = useState('')
  const [errors, setErrors] = useState({ category: '', product: '' })

  if (!data) return null

  const canManage = canAction('catalog.manage')
  const categories = data.categories || []
  const products = data.products || []

  const filteredProducts = products.filter(p => {
    if (filter.search && !String(p.name || '').toLowerCase().includes(filter.search.toLowerCase())) return false
    if (filter.categoryId !== 'all' && String(p.category_id) !== filter.categoryId) return false
    if (filter.hidden === 'hidden' && !p.is_hidden) return false
    if (filter.hidden === 'visible' && p.is_hidden) return false
    return true
  })

  function editProduct(p) {
    setView('product-form')
    setProductForm({
      id: p.id, category_id: p.category_id == null ? '' : String(p.category_id),
      name: p.name || '', slug: p.slug || '', price: pickNumber(p.price), stock: pickNumber(p.stock),
      sort_order: pickNumber(p.sort_order), image_url: p.image_url || '', description: p.description || '',
      highlights: p.highlights || '', manual_url: p.manual_url || '', manual_text: p.manual_text || '',
      manual_video_url: p.manual_video_url || '', fulfillment_type: normalizeCatalogFulfillmentType(p.fulfillment_type),
      custom_form_fields: normalizeProductCustomFormFields(p),
      product_options: Array.isArray(p.product_options) ? p.product_options : [],
      is_featured: Boolean(p.is_featured), is_unlimited_stock: Boolean(p.is_unlimited_stock),
    })
    setErrors(prev => ({ ...prev, product: '' }))
  }

  function editCategory(c) {
    setView('category-form')
    setCategoryForm({ id: c.id, name: c.name || '', slug: c.slug || '', image_url: c.image_url || '', description: c.description || '' })
    setErrors(prev => ({ ...prev, category: '' }))
  }

  async function saveCategory() {
    const { id, name, slug, image_url, description } = categoryForm
    if (!name.trim()) { setErrors(prev => ({ ...prev, category: 'ชื่อหมวดหมู่ห้ามว่าง' })); return }
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const body = { name: name.trim(), slug: slug.trim() || makeSlug(name), image_url: image_url.trim(), description: description.trim() }
      if (id) {
        await fetchJson(`/api/admin/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await fetchJson('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      setActionState({ status: 'success', message: 'บันทึกหมวดหมู่เรียบร้อย' })
      setView('categories')
      await loadModuleData('catalog')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteCategory(id) {
    if (!window.confirm('ยืนยันลบหมวดหมู่?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      await fetchJson(`/api/admin/categories/${id}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบหมวดหมู่เรียบร้อย' })
      await loadModuleData('catalog')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function saveProduct() {
    const f = productForm
    const categoryId = Number(f.category_id)
    const price = Number(f.price)
    const stock = Number(f.stock)
    const sortOrder = Number(f.sort_order)
    const name = String(f.name || '').trim()
    const slug = String(f.slug || '').trim() || makeSlug(name)

    if (!Number.isFinite(categoryId) || categoryId <= 0) { setErrors(prev => ({ ...prev, product: 'จำเป็นต้องเลือกหมวดหมู่' })); return }
    if (!name || !slug) { setErrors(prev => ({ ...prev, product: 'จำเป็นต้องกรอกชื่อและ slug' })); return }
    if (!Number.isFinite(price) || price < 0) { setErrors(prev => ({ ...prev, product: 'ราคาต้องเป็นตัวเลขที่ถูกต้อง' })); return }

    let productOptionsPayload = []
    let customFormFieldsPayload = []
    try {
      productOptionsPayload = normalizeProductOptionsForSubmit(f.product_options)
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.includes('_missing_id')) setErrors(prev => ({ ...prev, product: 'ตัวเลือกทุกรายการต้องมี ID' }))
      else if (msg.includes('_missing_label')) setErrors(prev => ({ ...prev, product: 'ตัวเลือกทุกรายการต้องมีชื่อแสดงผล' }))
      else if (msg.includes('_duplicate_id')) setErrors(prev => ({ ...prev, product: 'ID ตัวเลือกต้องไม่ซ้ำกัน' }))
      else setErrors(prev => ({ ...prev, product: 'ข้อมูลตัวเลือกสินค้าไม่ถูกต้อง' }))
      return
    }
    try {
      customFormFieldsPayload = normalizeCustomFormFieldsForSubmit(f.custom_form_fields)
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.includes('_missing_label')) setErrors(prev => ({ ...prev, product: 'ฟอร์มกำหนดเองทุกช่องต้องมีข้อความแสดงผล' }))
      else if (msg.includes('_missing_id')) setErrors(prev => ({ ...prev, product: 'ฟอร์มกำหนดเองทุกช่องต้องมีคีย์ข้อมูล' }))
      else setErrors(prev => ({ ...prev, product: 'ข้อมูลฟอร์มกำหนดเองไม่ถูกต้อง' }))
      return
    }

    const selectedFulfillmentType = normalizeCatalogFulfillmentType(f.fulfillment_type)
    const isMysteryProduct = selectedFulfillmentType === 'mystery_box'
    const useCustomForm = !isMysteryProduct && customFormFieldsPayload.length > 0
    const finalFulfillmentType = isMysteryProduct ? 'mystery_box' : useCustomForm ? 'farm_form' : 'digital_stock'

    const body = {
      category_id: categoryId, name, slug, price, stock: Number.isFinite(stock) ? stock : 0,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      image_url: String(f.image_url || '').trim() || null,
      description: String(f.description || '').trim(),
      highlights: String(f.highlights || '').trim(),
      manual_url: String(f.manual_url || '').trim(),
      manual_text: String(f.manual_text || '').trim(),
      manual_video_url: String(f.manual_video_url || '').trim(),
      fulfillment_type: finalFulfillmentType,
      is_featured: Boolean(f.is_featured),
      is_unlimited_stock: Boolean(f.is_unlimited_stock),
      farm_form_username_enabled: true,
      farm_form_password_enabled: true,
      farm_form_auth_key_enabled: true,
      farm_form_fields: useCustomForm ? customFormFieldsPayload : [],
      product_options: productOptionsPayload,
    }
    try {
      setActionState({ status: 'working', message: f.id ? 'กำลังอัปเดตสินค้า...' : 'กำลังสร้างสินค้า...' })
      setErrors(prev => ({ ...prev, product: '' }))
      if (f.id) {
        await fetchJson(`/api/admin/products/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await fetchJson('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      setActionState({ status: 'success', message: 'บันทึกสินค้าเรียบร้อย' })
      setView('products')
      await loadModuleData('catalog')
    } catch (err) {
      if (Number(err?.status) === 409 && String(err?.data?.error || '') === 'slug_taken') {
        setErrors(prev => ({ ...prev, product: 'slug สินค้านี้ถูกใช้งานแล้ว' }))
      } else {
        setErrors(prev => ({ ...prev, product: getErrorMessage(err, 'ไม่สามารถบันทึกสินค้าได้') }))
      }
      setActionState({ status: 'error', message: 'ดำเนินการสินค้าไม่สำเร็จ' })
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm('ยืนยันลบสินค้า?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      await fetchJson(`/api/admin/products/${id}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบสินค้าเรียบร้อย' })
      await loadModuleData('catalog')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function toggleHidden(p) {
    try {
      await fetchJson(`/api/admin/products/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: !p.is_hidden }) })
      await loadModuleData('catalog')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  // ── Render ──
  return (
    <div className="admin-module admin-catalog-module">
      {actionState.status !== 'idle' && (
        <div className={`alert ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show`}>
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })}></button>
        </div>
      )}

      {/* Tab nav */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${view === 'products' || view === 'product-form' ? 'active' : ''}`} onClick={() => setView('products')}>สินค้า ({products.length})</button></li>
        <li className="nav-item"><button className={`nav-link ${view === 'categories' || view === 'category-form' ? 'active' : ''}`} onClick={() => setView('categories')}>หมวดหมู่ ({categories.length})</button></li>
      </ul>

      {/* ── Products list ── */}
      {view === 'products' && (
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h3 className="card-title">สินค้าทั้งหมด</h3>
            <button className="btn btn-primary btn-sm" onClick={() => { setProductForm(DEFAULT_PRODUCT_FORM); setView('product-form') }} disabled={!canManage}>
              <i className="bi bi-plus-lg me-1"></i>เพิ่มสินค้า
            </button>
          </div>
          <div className="card-body py-2">
            <div className="row g-2">
              <div className="col-md-4"><input className="form-control form-control-sm" placeholder="ค้นหา..." value={filter.search} onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))} /></div>
              <div className="col-md-3">
                <select className="form-select form-select-sm" value={filter.categoryId} onChange={(e) => setFilter(prev => ({ ...prev, categoryId: e.target.value }))}>
                  <option value="all">ทุกหมวดหมู่</option>
                  {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="card-body p-0">
            <table className="table table-hover table-striped mb-0">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>หมวดหมู่</th>
                  <th>ราคา</th>
                  <th>สต็อก</th>
                  <th>ประเภท</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const cat = categories.find(c => c.id === p.category_id)
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          {p.image_url && <img src={p.image_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />}
                          <div>
                            <div className="fw-semibold">{p.name}</div>
                            {p.is_hidden && <span className="badge text-bg-secondary">ซ่อน</span>}
                            {p.is_featured && <span className="badge text-bg-warning ms-1">แนะนำ</span>}
                          </div>
                        </div>
                      </td>
                      <td><small>{cat?.name || '-'}</small></td>
                      <td>{formatNumber(p.price)}</td>
                      <td>{p.is_unlimited_stock ? '∞' : formatNumber(p.available_stock ?? p.stock)}</td>
                      <td><span className="badge text-bg-info">{p.fulfillment_type || 'digital_stock'}</span></td>
                      <td>
                        <div className="btn-group btn-group-sm">
                          <button className="btn btn-outline-primary" onClick={() => editProduct(p)} disabled={!canManage}><i className="bi bi-pencil"></i></button>
                          <button className="btn btn-outline-secondary" onClick={() => toggleHidden(p)} disabled={!canManage}>{p.is_hidden ? <i className="bi bi-eye"></i> : <i className="bi bi-eye-slash"></i>}</button>
                          <button className="btn btn-outline-danger" onClick={() => deleteProduct(p.id)} disabled={!canManage}><i className="bi bi-trash"></i></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredProducts.length === 0 && <tr><td colSpan={6} className="text-center text-secondary py-4">ไม่พบสินค้า</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Product form ── */}
      {view === 'product-form' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">{productForm.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3></div>
          <div className="card-body">
            {errors.product && <div className="alert alert-danger py-1">{errors.product}</div>}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">ชื่อสินค้า *</label>
                <input className="form-control" value={productForm.name} onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Slug</label>
                <input className="form-control" value={productForm.slug} onChange={(e) => setProductForm(prev => ({ ...prev, slug: e.target.value }))} placeholder={makeSlug(productForm.name)} />
              </div>
              <div className="col-md-4">
                <label className="form-label">หมวดหมู่</label>
                <select className="form-select" value={productForm.category_id} onChange={(e) => setProductForm(prev => ({ ...prev, category_id: e.target.value }))}>
                  <option value="">-- เลือก --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">ราคา (แต้ม)</label>
                <input type="number" className="form-control" value={productForm.price} onChange={(e) => setProductForm(prev => ({ ...prev, price: Number(e.target.value) }))} />
              </div>
              <div className="col-md-4">
                <label className="form-label">ลำดับแสดง</label>
                <input type="number" className="form-control" value={productForm.sort_order} onChange={(e) => setProductForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))} />
              </div>
              <div className="col-12">
                <label className="form-label">รูปภาพ URL</label>
                <input className="form-control" value={productForm.image_url} onChange={(e) => setProductForm(prev => ({ ...prev, image_url: e.target.value }))} />
              </div>
              <div className="col-12">
                <label className="form-label">รายละเอียด</label>
                <textarea className="form-control" rows={3} value={productForm.description} onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}></textarea>
              </div>
              <div className="col-md-6">
                <label className="form-label">ประเภท Fulfillment</label>
                <select className="form-select" value={productForm.fulfillment_type} onChange={(e) => setProductForm(prev => ({ ...prev, fulfillment_type: e.target.value }))}>
                  <option value="digital_stock">Digital Stock</option>
                  <option value="mystery_box">Mystery Box</option>
                </select>
              </div>
              <div className="col-md-6 d-flex align-items-end gap-3">
                <div className="form-check">
                  <input type="checkbox" className="form-check-input" id="isFeatured" checked={productForm.is_featured} onChange={(e) => setProductForm(prev => ({ ...prev, is_featured: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="isFeatured">แนะนำ</label>
                </div>
                <div className="form-check">
                  <input type="checkbox" className="form-check-input" id="isUnlimited" checked={productForm.is_unlimited_stock} onChange={(e) => setProductForm(prev => ({ ...prev, is_unlimited_stock: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="isUnlimited">สต็อกไม่จำกัด</label>
                </div>
              </div>

              {/* Custom form fields builder */}
              <div className="col-12">
                <label className="form-label fw-semibold">ฟิลด์ฟอร์มลูกค้า</label>
                {productForm.custom_form_fields.map((field, idx) => (
                  <div key={idx} className="d-flex gap-2 mb-2 align-items-center">
                    <input className="form-control form-control-sm" style={{ width: 150 }} placeholder="Label" value={field.label} onChange={(e) => {
                      const next = [...productForm.custom_form_fields]
                      next[idx] = { ...next[idx], label: e.target.value }
                      setProductForm(prev => ({ ...prev, custom_form_fields: next }))
                    }} />
                    <select className="form-select form-select-sm" style={{ width: 100 }} value={field.type} onChange={(e) => {
                      const next = [...productForm.custom_form_fields]
                      next[idx] = { ...next[idx], type: e.target.value }
                      setProductForm(prev => ({ ...prev, custom_form_fields: next }))
                    }}>
                      <option value="text">Text</option>
                      <option value="checkbox">Checkbox</option>
                    </select>
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" checked={field.required} onChange={(e) => {
                        const next = [...productForm.custom_form_fields]
                        next[idx] = { ...next[idx], required: e.target.checked }
                        setProductForm(prev => ({ ...prev, custom_form_fields: next }))
                      }} />
                      <label className="form-check-label" style={{ fontSize: 12 }}>จำเป็น</label>
                    </div>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => {
                      const next = productForm.custom_form_fields.filter((_, i) => i !== idx)
                      setProductForm(prev => ({ ...prev, custom_form_fields: next }))
                    }}>×</button>
                  </div>
                ))}
                <div className="btn-group btn-group-sm">
                  <button className="btn btn-outline-primary" onClick={() => setProductForm(prev => ({ ...prev, custom_form_fields: [...prev.custom_form_fields, createCustomFormFieldDraft('text')] }))}>
                    + Text Field
                  </button>
                  <button className="btn btn-outline-primary" onClick={() => setProductForm(prev => ({ ...prev, custom_form_fields: [...prev.custom_form_fields, createCustomFormFieldDraft('checkbox')] }))}>
                    + Checkbox
                  </button>
                </div>
              </div>

              {/* Product options */}
              <div className="col-12">
                <label className="form-label fw-semibold">ตัวเลือกสินค้า (Dropdown)</label>
                {productForm.product_options.map((opt, idx) => (
                  <div key={idx} className="d-flex gap-2 mb-1 align-items-center" style={{ fontSize: 13 }}>
                    <span className="badge text-bg-secondary">{opt.id}</span>
                    <span>{opt.label}</span>
                    <span className="text-secondary">({formatNumber(opt.price_points)} แต้ม)</span>
                    <button className="btn btn-outline-danger btn-sm ms-auto" style={{ padding: '0 4px' }} onClick={() => {
                      const next = productForm.product_options.filter((_, i) => i !== idx)
                      setProductForm(prev => ({ ...prev, product_options: next }))
                    }}>×</button>
                  </div>
                ))}
                <div className="d-flex gap-2 mt-1">
                  <input className="form-control form-control-sm" style={{ width: 100 }} placeholder="ID" value={optionDraft.id} onChange={(e) => setOptionDraft(prev => ({ ...prev, id: e.target.value }))} />
                  <input className="form-control form-control-sm" style={{ width: 120 }} placeholder="Label" value={optionDraft.label} onChange={(e) => setOptionDraft(prev => ({ ...prev, label: e.target.value }))} />
                  <input className="form-control form-control-sm" style={{ width: 100 }} placeholder="Value" value={optionDraft.value} onChange={(e) => setOptionDraft(prev => ({ ...prev, value: e.target.value }))} />
                  <input type="number" className="form-control form-control-sm" style={{ width: 80 }} placeholder="แต้ม" value={optionDraft.price_points} onChange={(e) => setOptionDraft(prev => ({ ...prev, price_points: e.target.value }))} />
                  <button className="btn btn-outline-primary btn-sm" onClick={() => {
                    const id = normalizeProductOptionId(optionDraft.id || optionDraft.label)
                    if (!id || !optionDraft.label.trim()) { setOptionError('ต้องกรอก ID และ Label'); return }
                    const price = Number(optionDraft.price_points)
                    if (!Number.isFinite(price) || price < 0) { setOptionError('ราคาไม่ถูกต้อง'); return }
                    setProductForm(prev => ({
                      ...prev,
                      product_options: [...prev.product_options, { id, label: optionDraft.label.trim(), value: optionDraft.value.trim(), price_points: price }],
                    }))
                    setOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
                    setOptionError('')
                  }}>เพิ่ม</button>
                </div>
                {optionError && <small className="text-danger">{optionError}</small>}
              </div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2">
            <button className="btn btn-primary" onClick={saveProduct} disabled={!canManage}>
              <i className="bi bi-floppy me-1"></i>บันทึก
            </button>
            <button className="btn btn-outline-secondary" onClick={() => setView('products')}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* ── Categories list ── */}
      {view === 'categories' && (
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h3 className="card-title">หมวดหมู่</h3>
            <button className="btn btn-primary btn-sm" onClick={() => { setCategoryForm(DEFAULT_CATEGORY_FORM); setView('category-form') }} disabled={!canManage}>
              <i className="bi bi-plus-lg me-1"></i>เพิ่มหมวดหมู่
            </button>
          </div>
          <div className="card-body p-0">
            <table className="table table-hover mb-0">
              <thead><tr><th>ชื่อ</th><th>Slug</th><th>จัดการ</th></tr></thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td className="fw-semibold">{c.name}</td>
                    <td><small className="text-secondary">{c.slug}</small></td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-primary" onClick={() => editCategory(c)} disabled={!canManage}><i className="bi bi-pencil"></i></button>
                        <button className="btn btn-outline-danger" onClick={() => deleteCategory(c.id)} disabled={!canManage}><i className="bi bi-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Category form ── */}
      {view === 'category-form' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">{categoryForm.id ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}</h3></div>
          <div className="card-body">
            {errors.category && <div className="alert alert-danger py-1">{errors.category}</div>}
            <div className="row g-3">
              <div className="col-md-6"><label className="form-label">ชื่อ *</label><input className="form-control" value={categoryForm.name} onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))} /></div>
              <div className="col-md-6"><label className="form-label">Slug</label><input className="form-control" value={categoryForm.slug} onChange={(e) => setCategoryForm(prev => ({ ...prev, slug: e.target.value }))} placeholder={makeSlug(categoryForm.name)} /></div>
              <div className="col-12"><label className="form-label">รูปภาพ URL</label><input className="form-control" value={categoryForm.image_url} onChange={(e) => setCategoryForm(prev => ({ ...prev, image_url: e.target.value }))} /></div>
              <div className="col-12"><label className="form-label">รายละเอียด</label><textarea className="form-control" rows={2} value={categoryForm.description} onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}></textarea></div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2">
            <button className="btn btn-primary" onClick={saveCategory} disabled={!canManage}><i className="bi bi-floppy me-1"></i>บันทึก</button>
            <button className="btn btn-outline-secondary" onClick={() => setView('categories')}>ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  )
}
