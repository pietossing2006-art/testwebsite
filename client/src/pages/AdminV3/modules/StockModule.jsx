import { useState, useMemo, Fragment } from 'react'
import {
  formatNumber, formatDateTime, getErrorMessage, pickNumber, splitStockLines,
  DEFAULT_POOL_FORM, DEFAULT_STOCK_ITEM_EDIT, DEFAULT_MYSTERY_FORM, DEFAULT_MYSTERY_EDIT,
} from '../helpers.js'
import { resolveApiUrl, getAuthToken } from '../../../api.js'

const MAIN_TABS = [
  { id: 'hub', label: 'คลังสินค้าหลัก', icon: 'bi-box-seam' },
  { id: 'pools', label: 'สต็อกร่วม (Pools)', icon: 'bi-link-45deg' },
  { id: 'mystery', label: 'กล่องสุ่ม', icon: 'bi-gift-fill' },
]

export default function StockModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [mainTab, setMainTab] = useState('hub')

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedProductIds, setExpandedProductIds] = useState({})
  const [thresholdDrafts, setThresholdDrafts] = useState({})

  const [showAddModal, setShowAddModal] = useState(false)
  const [modalMode, setModalMode] = useState('product')
  const [modalProductId, setModalProductId] = useState('')
  const [modalOptionId, setModalOptionId] = useState('')
  const [modalPoolId, setModalPoolId] = useState('')
  const [modalText, setModalText] = useState('')
  const [modalAllowDuplicates, setModalAllowDuplicates] = useState(false)
  const [isSubmittingStock, setIsSubmittingStock] = useState(false)

  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorProductId, setInspectorProductId] = useState(null)
  const [inspectorOptionId, setInspectorOptionId] = useState(null)
  const [inspectorPoolId, setInspectorPoolId] = useState(null)
  const [inspectorProductName, setInspectorProductName] = useState('')
  const [inspectorOptionName, setInspectorOptionName] = useState('')
  const [inspectorItems, setInspectorItems] = useState([])
  const [inspectorTotal, setInspectorTotal] = useState(0)
  const [inspectorSummary, setInspectorSummary] = useState({ available: 0, reserved: 0, delivered: 0, disabled: 0 })
  const [inspectorStatus, setInspectorStatus] = useState('all')
  const [inspectorSearch, setInspectorSearch] = useState('')
  const [inspectorMasked, setInspectorMasked] = useState(true)
  const [inspectorSelectedIds, setInspectorSelectedIds] = useState(new Set())
  const [inspectorItemEdit, setInspectorItemEdit] = useState(DEFAULT_STOCK_ITEM_EDIT)
  const [inspectorLoading, setInspectorLoading] = useState(false)

  const [poolForm, setPoolForm] = useState(DEFAULT_POOL_FORM)

  const [mysteryBoxProductId, setMysteryBoxProductId] = useState('')
  const [mysteryPrizes, setMysteryPrizes] = useState([])
  const [mysteryForm, setMysteryForm] = useState(DEFAULT_MYSTERY_FORM)
  const [mysteryFormStockText, setMysteryFormStockText] = useState('')
  const [mysteryEdit, setMysteryEdit] = useState(null)
  const [mysteryError, setMysteryError] = useState('')

  if (!data) return null

  const canManage = canAction('stock.manage')
  const products = data.products || []
  const categories = data.categories || []
  const pools = data.pools || []

  const kpi = useMemo(() => {
    let totalAvailable = 0, lowCount = 0, outCount = 0
    for (const p of products) {
      const avail = Number(p.available_stock ?? p.stock ?? 0)
      const thresh = Number(p.low_stock_threshold ?? 3)
      if (!p.is_unlimited_stock) {
        totalAvailable += avail
        if (avail <= 0) outCount += 1
        else if (avail <= thresh) lowCount += 1
      }
    }
    return { total_products: products.length, total_available_stock: totalAvailable, low_stock_count: lowCount, out_of_stock_count: outCount }
  }, [products])

  const filteredProducts = useMemo(() => products.filter((p) => {
    const q = searchQuery.toLowerCase().trim()
    const catName = categories.find((c) => String(c.id) === String(p.category_id))?.name || ''
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q) || catName.toLowerCase().includes(q) || String(p.id) === q
    const matchCategory = categoryFilter === 'all' || String(p.category_id) === String(categoryFilter)
    const avail = Number(p.available_stock ?? p.stock ?? 0)
    const thresh = Number(p.low_stock_threshold ?? 3)
    const isOut = !p.is_unlimited_stock && avail <= 0
    const isLow = !p.is_unlimited_stock && avail > 0 && avail <= thresh
    let matchStatus = true
    if (statusFilter === 'out') matchStatus = isOut
    else if (statusFilter === 'low') matchStatus = isLow
    else if (statusFilter === 'in') matchStatus = !isOut && !isLow
    return matchSearch && matchCategory && matchStatus
  }), [products, categories, searchQuery, categoryFilter, statusFilter])

  const selectedModalProduct = useMemo(() => products.find((p) => String(p.id) === String(modalProductId)) || null, [products, modalProductId])

  const modalLinesInfo = useMemo(() => {
    const rawLines = modalText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const unique = new Set(rawLines)
    return { total: rawLines.length, unique: unique.size, duplicates: rawLines.length - unique.size, samples: rawLines.slice(0, 3) }
  }, [modalText])

  function openAddStockModal(productId = '', optionId = '', poolId = '') {
    if (poolId) {
      setModalMode('pool')
      setModalPoolId(String(poolId))
      setModalProductId('')
      setModalOptionId('')
    } else {
      setModalMode('product')
      const initialPid = productId ? String(productId) : (products[0] ? String(products[0].id) : '')
      setModalProductId(initialPid)
      setModalOptionId(optionId ? String(optionId) : '')
      setModalPoolId('')
    }
    setModalText('')
    setModalAllowDuplicates(false)
    setShowAddModal(true)
  }

  function handleModalFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result
      if (typeof content === 'string') setModalText((prev) => (prev ? `${prev}\n${content.trim()}` : content.trim()))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function submitAddStock() {
    if (modalLinesInfo.total === 0) { setActionState({ status: 'error', message: 'กรุณากรอกหรืออัปโหลดข้อมูลสต็อก' }); return }
    const payload = { text: modalText, allow_duplicates: modalAllowDuplicates }
    if (modalMode === 'pool') {
      const pId = Number(modalPoolId)
      if (!Number.isFinite(pId) || pId <= 0) { setActionState({ status: 'error', message: 'กรุณาเลือกพูลสต็อกที่ต้องการเติม' }); return }
      payload.pool_id = pId
    } else {
      const pid = Number(modalProductId)
      if (!Number.isFinite(pid) || pid <= 0) { setActionState({ status: 'error', message: 'กรุณาเลือกสินค้าที่ต้องการเติมสต็อก' }); return }
      payload.product_id = pid
      payload.option_id = modalOptionId || null
    }
    try {
      setIsSubmittingStock(true)
      setActionState({ status: 'working', message: 'กำลังเพิ่มสต็อกและตรวจสอบข้อมูล...' })
      const res = await fetchJson('/api/admin/stock/quick-add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const ins = res?.result?.inserted ?? 0
      const dupBatch = res?.result?.duplicates_in_batch ?? 0
      const dupDb = res?.result?.duplicates_in_db ?? 0
      let msg = `เพิ่มสต็อกสำเร็จ ${ins} รายการ`
      if (dupBatch > 0 || dupDb > 0) msg += ` (ข้ามซ้ำในชุด: ${dupBatch}, ซ้ำในระบบ: ${dupDb})`
      setActionState({ status: 'success', message: msg })
      setShowAddModal(false)
      setModalText('')
      await loadModuleData('stock')
      if (inspectorOpen) await loadInspectorItems({ productId: inspectorProductId, optionId: inspectorOptionId, poolId: inspectorPoolId, status: inspectorStatus, search: inspectorSearch })
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) } finally { setIsSubmittingStock(false) }
  }

  async function openInspector(product, option = null) {
    if (!product || !product.id) return
    const pid = Number(product.id)
    const optId = option ? (option.id || option.name || null) : null
    setInspectorProductId(pid)
    setInspectorOptionId(optId)
    setInspectorPoolId(null)
    setInspectorProductName(product.name || `สินค้า #${pid}`)
    setInspectorOptionName(option ? (option.label || option.name || option.id) : '')
    setInspectorStatus('all')
    setInspectorSearch('')
    setInspectorSelectedIds(new Set())
    setInspectorItemEdit(DEFAULT_STOCK_ITEM_EDIT)
    setInspectorOpen(true)
    await loadInspectorItems({ productId: pid, optionId: optId, poolId: null, status: 'all', search: '' })
  }

  async function openPoolInspector(pool) {
    if (!pool || !pool.id) return
    const pId = Number(pool.id)
    setInspectorProductId(null)
    setInspectorOptionId(null)
    setInspectorPoolId(pId)
    setInspectorProductName(`พูลสต็อก #${pool.id}: ${pool.name}`)
    setInspectorOptionName(pool.kind === 'digital_code' ? 'Digital Code Pool' : 'Quantity Counter')
    setInspectorStatus('all')
    setInspectorSearch('')
    setInspectorSelectedIds(new Set())
    setInspectorItemEdit(DEFAULT_STOCK_ITEM_EDIT)
    setInspectorOpen(true)
    await loadInspectorItems({ productId: null, optionId: null, poolId: pId, status: 'all', search: '' })
  }

  async function loadInspectorItems({ productId = inspectorProductId, optionId = inspectorOptionId, poolId = inspectorPoolId, status = inspectorStatus, search = inspectorSearch } = {}) {
    try {
      setInspectorLoading(true)
      const qs = new URLSearchParams()
      if (poolId) qs.set('pool_id', String(poolId))
      else if (productId) {
        qs.set('product_id', String(productId))
        if (optionId) qs.set('option_id', String(optionId))
      }
      if (status && status !== 'all') qs.set('status', status)
      if (search && search.trim()) qs.set('search', search.trim())
      qs.set('limit', '200')
      const res = await fetchJson(`/api/admin/stock/unified-items?${qs.toString()}`, { method: 'GET' })
      setInspectorItems(Array.isArray(res?.items) ? res.items : [])
      setInspectorTotal(res?.total || 0)
      if (res?.summary) setInspectorSummary(res.summary)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) } finally { setInspectorLoading(false) }
  }

  async function handleInspectorStatusChange(st) { setInspectorStatus(st); await loadInspectorItems({ status: st }) }
  async function handleInspectorSearchSubmit(e) { e.preventDefault(); await loadInspectorItems({ search: inspectorSearch }) }

  async function saveInspectorItemEdit() {
    const sid = Number(inspectorItemEdit.id)
    if (!Number.isFinite(sid) || sid <= 0) return
    try {
      setActionState({ status: 'working', message: 'กำลังอัปเดตรายการสต็อก...' })
      await fetchJson(`/api/admin/stock-pool-items/${sid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: inspectorItemEdit.payload, status: inspectorItemEdit.status }) })
      setInspectorItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      setActionState({ status: 'success', message: 'อัปเดตรายการสต็อกเรียบร้อย' })
      await Promise.all([loadInspectorItems(), loadModuleData('stock')])
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteSingleInspectorItem(sid) {
    if (!window.confirm(`ยืนยันการลบรายการสต็อก #${sid}?`)) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      await fetchJson(`/api/admin/stock-pool-items/${sid}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบรายการสต็อกเรียบร้อย' })
      await Promise.all([loadInspectorItems(), loadModuleData('stock')])
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteBatchInspectorItems() {
    const ids = Array.from(inspectorSelectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`ยืนยันการลบ ${ids.length} รายการที่เลือก?`)) return
    try {
      setActionState({ status: 'working', message: `กำลังลบ ${ids.length} รายการ...` })
      await fetchJson('/api/admin/stock/items/batch-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
      setInspectorSelectedIds(new Set())
      setActionState({ status: 'success', message: `ลบสำเร็จ ${ids.length} รายการ` })
      await Promise.all([loadInspectorItems(), loadModuleData('stock')])
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function exportStockFile(format = 'csv') {
    try {
      setActionState({ status: 'working', message: `กำลังส่งออก ${format.toUpperCase()}...` })
      const qs = new URLSearchParams({ format, status: inspectorStatus === 'all' ? 'all' : inspectorStatus, mask: inspectorMasked ? 'true' : 'false' })
      if (inspectorPoolId) qs.set('pool_id', String(inspectorPoolId))
      else if (inspectorProductId) qs.set('product_id', String(inspectorProductId))
      const blob = await fetch(resolveApiUrl(`/api/admin/stock/export?${qs}`), { credentials: 'include', headers: { Authorization: `Bearer ${getAuthToken()}` } }).then((r) => { if (!r.ok) throw new Error('export_failed'); return r.blob() })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock-export-${inspectorPoolId ? `pool-${inspectorPoolId}` : `product-${inspectorProductId}`}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setActionState({ status: 'success', message: `ส่งออก ${format.toUpperCase()} เรียบร้อย` })
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err, 'ส่งออกสต็อกไม่สำเร็จ') }) }
  }

  async function saveProductThreshold(pid) {
    const val = thresholdDrafts[pid]
    if (val === undefined) return
    try {
      const parsed = Math.max(0, parseInt(val, 10) || 0)
      await fetchJson(`/api/admin/products/${pid}/stock-threshold`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threshold: parsed }) })
      await loadModuleData('stock')
      setActionState({ status: 'success', message: `บันทึกเกณฑ์แจ้งเตือนสินค้า #${pid} เป็น ${parsed} ชิ้น` })
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  function maskPayloadString(s) {
    if (!s) return '••••'
    const str = String(s).trim()
    return `${str.slice(0, Math.min(4, str.length))}••••••••`
  }

  function toggleSelectAllInspector(e) {
    if (e.target.checked) setInspectorSelectedIds(new Set(inspectorItems.filter((i) => i.status === 'available' || i.status === 'disabled').map((i) => i.id)))
    else setInspectorSelectedIds(new Set())
  }
  function toggleSelectItem(id) {
    setInspectorSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  async function savePool() {
    const payload = { name: poolForm.name.trim(), kind: poolForm.kind, is_active: Boolean(poolForm.is_active) }
    if (poolForm.kind === 'quantity') payload.quantity_remaining = pickNumber(poolForm.quantity_remaining)
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก Pool...' })
      if (poolForm.id) await fetchJson(`/api/admin/stock-pools/${poolForm.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      else await fetchJson('/api/admin/stock-pools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      setActionState({ status: 'success', message: 'บันทึก Pool เรียบร้อย' })
      setPoolForm(DEFAULT_POOL_FORM)
      await loadModuleData('stock')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deletePool(id) {
    if (!window.confirm(`ลบพูล #${id}? จะลบรายการในพูลและ binding ด้วย`)) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบพูล...' })
      await fetchJson(`/api/admin/stock-pools/${id}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบพูลเรียบร้อย' })
      await loadModuleData('stock')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function loadMysteryPrizes(boxPid) {
    const bid = Number(boxPid)
    if (!Number.isFinite(bid) || bid <= 0) return
    try {
      setMysteryError('')
      const res = await fetchJson(`/api/admin/mystery-box-prizes?box_product_id=${bid}&limit=200`, { method: 'GET' })
      setMysteryPrizes(Array.isArray(res?.items) ? res.items : [])
    } catch (err) { setMysteryError(getErrorMessage(err, 'โหลดพูลสุ่มไม่สำเร็จ')) }
  }

  async function createMysteryPrize() {
    const bid = Number(mysteryBoxProductId)
    const kind = String(mysteryForm.prize_kind || 'product')
    const prizeName = String(mysteryForm.prize_name || '').trim()
    const prizeProductId = mysteryForm.prize_product_id === '' ? null : Number(mysteryForm.prize_product_id)
    const weight = Number(mysteryForm.weight)
    const remaining = Number(mysteryForm.remaining)
    const stockLines = splitStockLines(mysteryFormStockText)
    const effectiveRemaining = kind === 'product' ? Math.max(remaining, stockLines.length) : remaining
    if (!Number.isFinite(bid) || bid <= 0) { setMysteryError('เลือกสินค้า Mystery Box ก่อน'); return }
    if (!['product', 'linked_product', 'salt'].includes(kind)) { setMysteryError('ประเภทรางวัลไม่ถูกต้อง'); return }
    if (kind === 'linked_product' && (!Number.isFinite(prizeProductId) || prizeProductId <= 0)) { setMysteryError('เลือกสินค้าเพื่อเชื่อมสต็อก'); return }
    if (kind === 'salt' && !prizeName) { setMysteryError('ตั้งชื่อรางวัลเกลือ'); return }
    if (kind === 'product' && stockLines.length < 1) { setMysteryError('รางวัล Internal ต้องมีสต็อกอย่างน้อย 1'); return }
    if (!Number.isFinite(weight) || weight <= 0) { setMysteryError('น้ำหนักต้อง > 0'); return }
    try {
      setActionState({ status: 'working', message: 'กำลังสร้างรางวัล...' })
      setMysteryError('')
      const created = await fetchJson('/api/admin/mystery-box-prizes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box_product_id: bid, prize_kind: kind, prize_name: prizeName, prize_image_url: mysteryForm.prize_image_url || null, prize_product_id: kind === 'linked_product' ? prizeProductId : null, weight, remaining: effectiveRemaining, is_active: Boolean(mysteryForm.is_active) }),
      })
      const cid = Number(created?.id)
      if (kind === 'product' && Number.isFinite(cid) && cid > 0 && stockLines.length > 0) {
        await fetchJson('/api/admin/mystery-box-prize-stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ box_product_id: bid, prize_id: cid, items: stockLines }) })
      }
      setMysteryForm(DEFAULT_MYSTERY_FORM)
      setMysteryFormStockText('')
      await loadMysteryPrizes(bid)
      setActionState({ status: 'success', message: 'สร้างรางวัลเรียบร้อย' })
    } catch (err) { setMysteryError(getErrorMessage(err)); setActionState({ status: 'error', message: 'สร้างรางวัลไม่สำเร็จ' }) }
  }

  async function deleteMysteryPrize(prizeId) {
    if (!window.confirm(`ลบรางวัล #${prizeId}?`)) return
    try {
      setActionState({ status: 'working', message: 'ลบรางวัล...' })
      await fetchJson(`/api/admin/mystery-box-prizes/${prizeId}`, { method: 'DELETE' })
      await loadMysteryPrizes(mysteryBoxProductId)
      setActionState({ status: 'success', message: 'ลบรางวัลเรียบร้อย' })
    } catch (err) { setMysteryError(getErrorMessage(err)); setActionState({ status: 'error', message: 'ลบรางวัลไม่สำเร็จ' }) }
  }

  function editMysteryPrize(pz) {
    setMysteryError('')
    setMysteryEdit({
      ...DEFAULT_MYSTERY_EDIT,
      id: pz.id,
      prize_name: pz.prize_name || '',
      prize_image_url: pz.prize_image_url || '',
      weight: pz.weight,
      remaining: pz.remaining,
      is_active: Boolean(pz.is_active),
    })
  }

  function cancelMysteryEdit() {
    setMysteryEdit(null)
  }

  async function updateMysteryPrize() {
    if (!mysteryEdit?.id) return
    const prizeName = String(mysteryEdit.prize_name || '').trim()
    const weight = Number(mysteryEdit.weight)
    const remaining = Number(mysteryEdit.remaining)
    if (!prizeName) { setMysteryError('ตั้งชื่อรางวัล'); return }
    if (!Number.isFinite(weight) || weight <= 0) { setMysteryError('น้ำหนักต้อง > 0'); return }
    if (!Number.isFinite(remaining) || remaining < 0) { setMysteryError('โควตาคงเหลือไม่ถูกต้อง'); return }
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึกรางวัล...' })
      setMysteryError('')
      await fetchJson(`/api/admin/mystery-box-prizes/${mysteryEdit.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prize_name: prizeName, prize_image_url: mysteryEdit.prize_image_url || null, weight, remaining, is_active: Boolean(mysteryEdit.is_active) }),
      })
      setMysteryEdit(null)
      await loadMysteryPrizes(mysteryBoxProductId)
      setActionState({ status: 'success', message: 'บันทึกรางวัลเรียบร้อย' })
    } catch (err) { setMysteryError(getErrorMessage(err)); setActionState({ status: 'error', message: 'บันทึกรางวัลไม่สำเร็จ' }) }
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

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => openAddStockModal()} disabled={!canManage}><i className="bi bi-plus-circle-fill" />เติมสต็อกสินค้า</button>
      </div>

      <div className="lgx-strip">
        <div className="lgx-stat"><div className="l">สินค้าในระบบ</div><div className="v">{formatNumber(kpi.total_products)}</div><div className="d">ทั้งหมด {products.length} รายการ</div></div>
        <div className="lgx-stat"><div className="l">สต็อกพร้อมขาย</div><div className="v ok">{formatNumber(kpi.total_available_stock)}</div><div className="d">รหัส/ไอดีพร้อมส่งทันที</div></div>
        <div className="lgx-stat"><div className="l">สต็อกใกล้หมด</div><div className="v warn">{formatNumber(kpi.low_stock_count)}</div><div className="d">ต่ำกว่าเกณฑ์แจ้งเตือน</div></div>
        <div className="lgx-stat"><div className="l">สินค้าหมด</div><div className="v crit">{formatNumber(kpi.out_of_stock_count)}</div><div className="d">ต้องเติมสต็อกด่วน</div></div>
      </div>

      <div className="lgx-panel">
        <div className="lgx-inline-tabs" style={{ padding: '0 18px' }}>
          {MAIN_TABS.map((t) => <button key={t.id} type="button" className={`lgx-inline-tab${mainTab === t.id ? ' is-active' : ''}`} onClick={() => setMainTab(t.id)}><i className={`bi ${t.icon}`} style={{ marginRight: 5 }} />{t.label}{t.id === 'pools' ? ` (${pools.length})` : ''}</button>)}
        </div>

        {mainTab === 'hub' && (
          <>
            <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <input type="text" className="lgx-input" style={{ flex: '1 1 220px', maxWidth: 300 }} placeholder="ค้นหาชื่อสินค้า, slug, หรือ #ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <select className="lgx-select" style={{ width: 'auto' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">ทุกหมวดหมู่ ({categories.length})</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="lgx-segmented" style={{ marginLeft: 'auto' }}>
                <button type="button" className={`lgx-segmented-btn${statusFilter === 'all' ? ' is-active' : ''}`} onClick={() => setStatusFilter('all')}>ทั้งหมด</button>
                <button type="button" className={`lgx-segmented-btn${statusFilter === 'in' ? ' is-active' : ''}`} onClick={() => setStatusFilter('in')}>พร้อมส่ง</button>
                <button type="button" className={`lgx-segmented-btn${statusFilter === 'low' ? ' is-active' : ''}`} onClick={() => setStatusFilter('low')}>ใกล้หมด ({kpi.low_stock_count})</button>
                <button type="button" className={`lgx-segmented-btn${statusFilter === 'out' ? ' is-active' : ''}`} onClick={() => setStatusFilter('out')}>หมด ({kpi.out_of_stock_count})</button>
              </div>
            </div>

            <table className="lgx-table">
              <thead><tr><th>สินค้า</th><th>สต็อกพร้อมขาย</th><th>เกณฑ์ใกล้หมด</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const optionsArray = Array.isArray(p.product_options) ? p.product_options : []
                  const hasOptions = optionsArray.length > 0
                  const isExpanded = Boolean(expandedProductIds[p.id])
                  const avail = Number(p.available_stock ?? p.stock ?? 0)
                  const thresh = Number(p.low_stock_threshold ?? 3)
                  const isOut = !p.is_unlimited_stock && avail <= 0
                  const isLow = !p.is_unlimited_stock && avail > 0 && avail <= thresh
                  const draftVal = thresholdDrafts[p.id] !== undefined ? thresholdDrafts[p.id] : thresh
                  const catName = categories.find((c) => String(c.id) === String(p.category_id))?.name || ''

                  return (
                    <Fragment key={p.id}>
                      <tr style={{ background: isExpanded ? 'var(--lgx-surface-alt)' : undefined }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {p.image_url ? <img src={p.image_url} alt="" className="lgx-thumb" /> : <div className="lgx-thumb-empty"><i className="bi bi-box-seam" /></div>}
                            <div>
                              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>{p.name}</span>
                                {hasOptions && <button type="button" className="lgx-pill neutral" style={{ cursor: 'pointer', border: 'none' }} onClick={() => setExpandedProductIds((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}>{optionsArray.length} ตัวเลือก {isExpanded ? '▲' : '▼'}</button>}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>#{p.id} &middot; {catName || 'ไม่มีหมวดหมู่'} &middot; ฿{formatNumber(p.price)}</div>
                            </div>
                          </div>
                        </td>
                        <td>{p.is_unlimited_stock ? <span className="lgx-pill neutral">ไม่จำกัด (∞)</span> : <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{formatNumber(avail)}</span>}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, maxWidth: 120 }}>
                            <input type="number" min="0" max="999" className="lgx-input" value={draftVal} onChange={(e) => setThresholdDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))} />
                            <button type="button" className="lgx-icon-action" disabled={!canManage || thresholdDrafts[p.id] === undefined} onClick={() => saveProductThreshold(p.id)} title="บันทึกเกณฑ์"><i className="bi bi-check-lg" /></button>
                          </div>
                        </td>
                        <td>
                          {p.is_unlimited_stock ? <span className="lgx-pill neutral">พร้อมส่ง (∞)</span> : isOut ? <span className="lgx-pill crit">หมดสต็อก</span> : isLow ? <span className="lgx-pill warn">ใกล้หมด (≤{thresh})</span> : <span className="lgx-pill ok">พร้อมส่ง</span>}
                        </td>
                        <td>
                          <div className="lgx-btn-group">
                            <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => openAddStockModal(p.id)} disabled={!canManage}><i className="bi bi-plus-lg" />เติม</button>
                            <button type="button" className="lgx-btn" onClick={() => openInspector(p)}><i className="bi bi-search" />ตรวจสอบ</button>
                          </div>
                        </td>
                      </tr>

                      {hasOptions && isExpanded && (
                        <tr className="lgx-row-expand">
                          <td colSpan={5}>
                            <div className="lgx-row-expand-inner">
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lgx-text-muted)', marginBottom: 8 }}><i className="bi bi-diagram-3-fill" style={{ marginRight: 4 }} />ตัวเลือกย่อยของสินค้านี้ ({optionsArray.length})</div>
                              <table className="lgx-table">
                                <thead><tr><th>ชื่อตัวเลือก</th><th>ราคาขาย</th><th /></tr></thead>
                                <tbody>
                                  {optionsArray.map((opt) => {
                                    const optId = String(opt.id || opt.name || '')
                                    const optName = opt.label || opt.name || opt.id || 'Option'
                                    const optPrice = opt.price_override != null ? Number(opt.price_override) : (Number(p.price) + (Number(opt.price_modifier) || 0))
                                    return (
                                      <tr key={optId}>
                                        <td style={{ fontWeight: 700 }}>{optName} <span style={{ fontWeight: 400, color: 'var(--lgx-text-muted)' }}>({optId})</span></td>
                                        <td>฿{formatNumber(optPrice)}</td>
                                        <td>
                                          <div className="lgx-btn-group">
                                            <button type="button" className="lgx-btn" onClick={() => openAddStockModal(p.id, optId)} disabled={!canManage}><i className="bi bi-plus-lg" />เติม</button>
                                            <button type="button" className="lgx-btn" onClick={() => openInspector(p, opt)}><i className="bi bi-eye" />ดูสต็อก</button>
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {filteredProducts.length === 0 && <tr><td colSpan={5} className="lgx-empty">ไม่พบสินค้าที่ตรงกับเงื่อนไขการค้นหา</td></tr>}
              </tbody>
            </table>
          </>
        )}

        {mainTab === 'pools' && (
          <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1fr 1.4fr', padding: 18 }}>
            <div className="lgx-panel">
              <div className="lgx-panel-head"><h2>{poolForm.id ? `แก้ไขพูลสต็อก #${poolForm.id}` : 'สร้างพูลสต็อกใหม่'}</h2></div>
              <div className="lgx-panel-body">
                <div className="lgx-field" style={{ marginBottom: 10 }}><label>ชื่อพูลสต็อก</label><input type="text" className="lgx-input" placeholder="เช่น Shared Netflix Pool..." value={poolForm.name} onChange={(e) => setPoolForm((prev) => ({ ...prev, name: e.target.value }))} /></div>
                <div className="lgx-field" style={{ marginBottom: 10 }}>
                  <label>ประเภทพูล</label>
                  <select className="lgx-select" value={poolForm.kind} onChange={(e) => setPoolForm((prev) => ({ ...prev, kind: e.target.value }))}>
                    <option value="digital_code">รหัสดิจิทัล / ไอดี</option>
                    <option value="quantity">ตัวนับจำนวนสต็อก</option>
                  </select>
                </div>
                {poolForm.kind === 'quantity' && <div className="lgx-field" style={{ marginBottom: 10 }}><label>จำนวนคงเหลือ</label><input type="number" className="lgx-input" value={poolForm.quantity_remaining} onChange={(e) => setPoolForm((prev) => ({ ...prev, quantity_remaining: e.target.value }))} /></div>}
                <label className="lgx-checkbox-row" style={{ marginBottom: 12 }}><input type="checkbox" checked={poolForm.is_active} onChange={(e) => setPoolForm((prev) => ({ ...prev, is_active: e.target.checked }))} />เปิดใช้งานพูลนี้</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="lgx-btn lgx-btn-accent" onClick={savePool} disabled={!canManage || !poolForm.name.trim()}>{poolForm.id ? 'บันทึกการแก้ไข' : 'สร้างพูล'}</button>
                  {poolForm.id && <button type="button" className="lgx-btn" onClick={() => setPoolForm(DEFAULT_POOL_FORM)}>ยกเลิก</button>}
                </div>
              </div>
            </div>

            <div className="lgx-panel">
              <div className="lgx-panel-head"><h2>รายการพูลทั้งหมด ({pools.length})</h2></div>
              <table className="lgx-table">
                <thead><tr><th>ID</th><th>ชื่อพูล</th><th>ประเภท</th><th>สถานะ</th><th /></tr></thead>
                <tbody>
                  {pools.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">#{p.id}</td>
                      <td style={{ fontWeight: 700 }}>{p.name}</td>
                      <td><span className="lgx-pill neutral">{p.kind}</span></td>
                      <td>{p.is_active ? <span className="lgx-pill ok">เปิดใช้งาน</span> : <span className="lgx-pill neutral">ปิดใช้งาน</span>}</td>
                      <td>
                        <div className="lgx-btn-group">
                          {p.kind === 'digital_code' && (
                            <>
                              <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => openAddStockModal('', '', p.id)} disabled={!canManage}><i className="bi bi-plus-lg" />เติม</button>
                              <button type="button" className="lgx-btn" onClick={() => openPoolInspector(p)}><i className="bi bi-eye" />รายการ</button>
                            </>
                          )}
                          <button type="button" className="lgx-icon-action" onClick={() => setPoolForm({ id: p.id, name: p.name, kind: p.kind, quantity_remaining: p.quantity_remaining ?? 0, is_active: Boolean(p.is_active) })}><i className="bi bi-pencil" /></button>
                          <button type="button" className="lgx-icon-action danger" onClick={() => deletePool(p.id)}><i className="bi bi-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pools.length === 0 && <tr><td colSpan={5} className="lgx-empty">ยังไม่มีพูลสต็อกในระบบ</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mainTab === 'mystery' && (
          <div className="lgx-panel-body">
            <div className="lgx-field" style={{ maxWidth: 420, marginBottom: 14 }}>
              <label>เลือกสินค้าประเภทกล่องสุ่ม</label>
              <select className="lgx-select" value={mysteryBoxProductId} onChange={(e) => { setMysteryBoxProductId(e.target.value); loadMysteryPrizes(e.target.value) }}>
                <option value="">เลือกสินค้า Mystery Box...</option>
                {products.filter((p) => p.fulfillment_type === 'mystery_box').map((p) => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
              </select>
            </div>

            {mysteryError && <div className="lgx-banner crit" style={{ marginBottom: 14 }}>{mysteryError}</div>}

            {mysteryBoxProductId && (
              <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
                <div className="lgx-panel">
                  <div className="lgx-panel-head"><h2>เพิ่มรางวัลในกล่องสุ่ม</h2></div>
                  <div className="lgx-panel-body">
                    <div className="lgx-field" style={{ marginBottom: 8 }}>
                      <label>ประเภทรางวัล</label>
                      <select className="lgx-select" value={mysteryForm.prize_kind} onChange={(e) => setMysteryForm((prev) => ({ ...prev, prize_kind: e.target.value }))}>
                        <option value="product">รหัสดิจิทัลในระบบ</option>
                        <option value="linked_product">เชื่อมกับสินค้าอื่น</option>
                        <option value="salt">เกลือ / รางวัลปลอบใจ</option>
                      </select>
                    </div>
                    <div className="lgx-field" style={{ marginBottom: 8 }}><label>ชื่อรางวัล</label><input type="text" className="lgx-input" value={mysteryForm.prize_name} onChange={(e) => setMysteryForm((prev) => ({ ...prev, prize_name: e.target.value }))} /></div>
                    {mysteryForm.prize_kind === 'linked_product' && (
                      <div className="lgx-field" style={{ marginBottom: 8 }}>
                        <label>เลือกสินค้าที่จะเชื่อมสต็อกด้วย</label>
                        <select className="lgx-select" value={mysteryForm.prize_product_id} onChange={(e) => setMysteryForm((prev) => ({ ...prev, prize_product_id: e.target.value }))}>
                          <option value="">-- เลือกสินค้า --</option>
                          {products.filter((p) => p.fulfillment_type !== 'mystery_box').map((p) => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
                        </select>
                        <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 4 }}>โอกาสจริงจะขึ้นกับสต็อกคงเหลือของสินค้าที่เลือกด้วย</div>
                      </div>
                    )}
                    <div className="lgx-form-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
                      <div className="lgx-field"><label>น้ำหนักโอกาส</label><input type="number" className="lgx-input" value={mysteryForm.weight} onChange={(e) => setMysteryForm((prev) => ({ ...prev, weight: e.target.value }))} /></div>
                      <div className="lgx-field"><label>โควตาคงเหลือ</label><input type="number" className="lgx-input" value={mysteryForm.remaining} onChange={(e) => setMysteryForm((prev) => ({ ...prev, remaining: e.target.value }))} /></div>
                    </div>
                    {mysteryForm.prize_kind === 'product' && <div className="lgx-field" style={{ marginBottom: 10 }}><label>สต็อกรางวัล (1 ต่อบรรทัด)</label><textarea className="lgx-textarea" rows={3} value={mysteryFormStockText} onChange={(e) => setMysteryFormStockText(e.target.value)} /></div>}
                    <label className="lgx-checkbox-row" style={{ marginBottom: 10 }}>
                      <input type="checkbox" checked={Boolean(mysteryForm.is_active)} onChange={(e) => setMysteryForm((prev) => ({ ...prev, is_active: e.target.checked }))} /> เปิดใช้งานทันที
                    </label>
                    <button type="button" className="lgx-btn lgx-btn-accent" onClick={createMysteryPrize} disabled={!canManage}>เพิ่มรางวัล</button>
                  </div>
                </div>

                <div className="lgx-panel">
                  <div className="lgx-panel-head">
                    <h2>รายการรางวัล ({mysteryPrizes.length})</h2>
                    <span>โอกาสจริง = คำนวณสดจากน้ำหนักและสต็อกคงเหลือ ณ ขณะนี้</span>
                  </div>
                  <table className="lgx-table">
                    <thead><tr><th>ชื่อรางวัล</th><th>ประเภท</th><th>น้ำหนัก</th><th>คงเหลือ</th><th>โอกาสจริง</th><th /></tr></thead>
                    <tbody>
                      {mysteryPrizes.map((pz) => {
                        const isEligible = pz.is_active && Number(pz.remaining) > 0 && Number(pz.weight) > 0
                        const pct = Number(pz.probability_percent || 0)
                        return (
                          <tr key={pz.id} className={!isEligible ? '' : pct === 0 ? 'st-crit' : ''}>
                            <td style={{ fontWeight: 700 }}>{pz.prize_name}{!pz.is_active && <span className="lgx-pill neutral" style={{ marginLeft: 6 }}>ปิดใช้งาน</span>}</td>
                            <td><span className="lgx-pill neutral">{pz.prize_kind}</span></td>
                            <td>{pz.weight}</td>
                            <td>{pz.remaining}</td>
                            <td>
                              {isEligible ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div className="lgx-progress-track" style={{ width: 70 }}>
                                    <div className="lgx-progress-bar" style={{ width: `${Math.min(100, pct)}%` }} />
                                  </div>
                                  <span className="mono" style={{ fontWeight: 700 }}>{pct.toFixed(2)}%</span>
                                </div>
                              ) : <span className="lgx-pill neutral">0% (ไม่พร้อมสุ่ม)</span>}
                            </td>
                            <td>
                              <div className="lgx-btn-group">
                                <button type="button" className="lgx-icon-action" disabled={!canManage} onClick={() => editMysteryPrize(pz)}><i className="bi bi-pencil" /></button>
                                <button type="button" className="lgx-icon-action danger" disabled={!canManage} onClick={() => deleteMysteryPrize(pz.id)}><i className="bi bi-trash" /></button>
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
          </div>
        )}
      </div>

      {mysteryEdit && (
        <div className="lgx-modal-backdrop" onClick={cancelMysteryEdit}>
          <div className="lgx-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="lgx-modal-head">
              <div style={{ fontWeight: 700 }}><i className="bi bi-pencil-fill" style={{ marginRight: 6, color: 'var(--lgx-accent)' }} />แก้ไขรางวัล #{mysteryEdit.id}</div>
              <button type="button" className="lgx-icon-action" onClick={cancelMysteryEdit}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="lgx-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mysteryError && <div className="lgx-banner crit"><span>{mysteryError}</span></div>}
              <div className="lgx-field"><label>ชื่อรางวัล</label><input type="text" className="lgx-input" value={mysteryEdit.prize_name} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, prize_name: e.target.value }))} /></div>
              <div className="lgx-field"><label>URL รูปภาพรางวัล</label><input type="text" className="lgx-input" value={mysteryEdit.prize_image_url || ''} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, prize_image_url: e.target.value }))} /></div>
              <div className="lgx-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="lgx-field"><label>น้ำหนักโอกาส</label><input type="number" className="lgx-input" value={mysteryEdit.weight} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, weight: e.target.value }))} /></div>
                <div className="lgx-field"><label>โควตาคงเหลือ</label><input type="number" className="lgx-input" value={mysteryEdit.remaining} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, remaining: e.target.value }))} /></div>
              </div>
              <label className="lgx-checkbox-row">
                <input type="checkbox" checked={Boolean(mysteryEdit.is_active)} onChange={(e) => setMysteryEdit((prev) => ({ ...prev, is_active: e.target.checked }))} /> เปิดใช้งาน (มีผลกับการสุ่มจริง)
              </label>
            </div>
            <div className="lgx-modal-foot">
              <button type="button" className="lgx-btn" onClick={cancelMysteryEdit}>ยกเลิก</button>
              <button type="button" className="lgx-btn lgx-btn-accent" disabled={!canManage || actionState.status === 'working'} onClick={updateMysteryPrize}>บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="lgx-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="lgx-modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="lgx-modal-head">
              <div style={{ fontWeight: 700 }}><i className="bi bi-plus-circle-fill" style={{ marginRight: 6, color: 'var(--lgx-accent)' }} />เติมสต็อกสินค้าดิจิทัล</div>
              <button type="button" className="lgx-icon-action" onClick={() => setShowAddModal(false)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="lgx-modal-body">
              <div className="lgx-segmented" style={{ marginBottom: 14 }}>
                <button type="button" className={`lgx-segmented-btn${modalMode === 'product' ? ' is-active' : ''}`} onClick={() => setModalMode('product')}><i className="bi bi-box-seam" />เติมเข้าสินค้า</button>
                <button type="button" className={`lgx-segmented-btn${modalMode === 'pool' ? ' is-active' : ''}`} onClick={() => { setModalMode('pool'); if (!modalPoolId && pools[0]) setModalPoolId(String(pools[0].id)) }}><i className="bi bi-link-45deg" />เติมเข้าพูลสต็อกร่วม</button>
              </div>

              {modalMode === 'product' ? (
                <div className="lgx-form-grid" style={{ marginBottom: 14 }}>
                  <div className="lgx-field">
                    <label>เลือกสินค้าเป้าหมาย *</label>
                    <select className="lgx-select" value={modalProductId} onChange={(e) => { setModalProductId(e.target.value); setModalOptionId('') }}>
                      {products.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
                    </select>
                  </div>
                  {selectedModalProduct && Array.isArray(selectedModalProduct.product_options) && selectedModalProduct.product_options.length > 0 && (
                    <div className="lgx-field">
                      <label>เลือกตัวเลือกย่อย</label>
                      <select className="lgx-select" value={modalOptionId} onChange={(e) => setModalOptionId(e.target.value)}>
                        <option value="">สต็อกหลักของสินค้า</option>
                        {selectedModalProduct.product_options.map((opt) => <option key={opt.id || opt.name} value={opt.id || opt.name}>{opt.label || opt.name || opt.id}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="lgx-field" style={{ marginBottom: 14 }}>
                  <label>เลือกพูลสต็อกเป้าหมาย *</label>
                  <select className="lgx-select" value={modalPoolId} onChange={(e) => setModalPoolId(e.target.value)}>
                    {pools.map((pl) => <option key={pl.id} value={pl.id}>#{pl.id} {pl.name} ({pl.kind})</option>)}
                  </select>
                </div>
              )}

              <div className="lgx-field" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ margin: 0 }}>ข้อมูลรหัส/ไอดี (1 รายการ ต่อ 1 บรรทัด)</label>
                  <label className="lgx-btn" style={{ cursor: 'pointer', fontSize: 11, padding: '4px 10px' }}>
                    <i className="bi bi-file-earmark-arrow-up" />นำเข้าไฟล์
                    <input type="file" accept=".txt,.csv" hidden onChange={handleModalFileUpload} />
                  </label>
                </div>
                <textarea className="lgx-textarea" rows={7} placeholder={'วางรหัสที่นี่ 1 ต่อบรรทัด เช่น:\nuser1:pass1\nuser2:pass2'} value={modalText} onChange={(e) => setModalText(e.target.value)} />
              </div>

              <div className="lgx-mini-stats" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 12 }}>
                <div className="lgx-mini-stat"><div className="l">รายการทั้งหมด</div><div className="v">{modalLinesInfo.total}</div></div>
                <div className="lgx-mini-stat"><div className="l">ไม่ซ้ำ</div><div className="v" style={{ color: 'var(--lgx-ok)' }}>{modalLinesInfo.unique}</div></div>
                <div className="lgx-mini-stat"><div className="l">ซ้ำในชุดนี้</div><div className="v" style={{ color: 'var(--lgx-warn)' }}>{modalLinesInfo.duplicates}</div></div>
              </div>

              <label className="lgx-checkbox-row"><input type="checkbox" checked={modalAllowDuplicates} onChange={(e) => setModalAllowDuplicates(e.target.checked)} />อนุญาตข้อมูลซ้ำ (บันทึกโดยไม่ข้ามรหัสที่เคยมีในระบบ)</label>
            </div>
            <div className="lgx-modal-foot">
              <button type="button" className="lgx-btn" onClick={() => setShowAddModal(false)}>ยกเลิก</button>
              <button type="button" className="lgx-btn lgx-btn-accent" onClick={submitAddStock} disabled={isSubmittingStock || modalLinesInfo.total === 0}>{isSubmittingStock ? 'กำลังบันทึก...' : `ยืนยันเพิ่ม ${modalLinesInfo.unique} รายการ`}</button>
            </div>
          </div>
        </div>
      )}

      {inspectorOpen && (
        <div className="lgx-modal-backdrop" onClick={() => setInspectorOpen(false)}>
          <div className="lgx-modal-card" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
            <div className="lgx-modal-head">
              <div>
                <div style={{ fontWeight: 700 }}><i className="bi bi-search" style={{ marginRight: 6 }} />ตรวจสอบคลังสต็อก: {inspectorProductName} {inspectorOptionName ? <span className="lgx-pill neutral">{inspectorOptionName}</span> : null}</div>
                <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{inspectorPoolId ? `รหัสพูล #${inspectorPoolId}` : `รหัสสินค้า #${inspectorProductId}`} &middot; มีทั้งหมด {inspectorTotal} รายการ</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type="button" className="lgx-btn" onClick={() => setInspectorMasked(!inspectorMasked)}><i className={`bi ${inspectorMasked ? 'bi-eye' : 'bi-eye-slash'}`} />{inspectorMasked ? 'แสดงรหัสเต็ม' : 'ซ่อนรหัส'}</button>
                <button type="button" className="lgx-btn" onClick={() => exportStockFile('csv')}><i className="bi bi-file-earmark-spreadsheet" />CSV</button>
                <button type="button" className="lgx-btn" onClick={() => exportStockFile('txt')}><i className="bi bi-file-earmark-text" />TXT</button>
                <button type="button" className="lgx-icon-action" onClick={() => setInspectorOpen(false)}><i className="bi bi-x-lg" /></button>
              </div>
            </div>

            <div className="lgx-panel-body" style={{ borderBottom: '1.5px solid var(--lgx-border)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
              <div className="lgx-segmented">
                <button type="button" className={`lgx-segmented-btn${inspectorStatus === 'all' ? ' is-active' : ''}`} onClick={() => handleInspectorStatusChange('all')}>ทั้งหมด ({inspectorSummary.available + inspectorSummary.reserved + inspectorSummary.delivered + inspectorSummary.disabled})</button>
                <button type="button" className={`lgx-segmented-btn${inspectorStatus === 'available' ? ' is-active' : ''}`} onClick={() => handleInspectorStatusChange('available')}>พร้อมขาย ({inspectorSummary.available})</button>
                <button type="button" className={`lgx-segmented-btn${inspectorStatus === 'reserved' ? ' is-active' : ''}`} onClick={() => handleInspectorStatusChange('reserved')}>จองอยู่ ({inspectorSummary.reserved})</button>
                <button type="button" className={`lgx-segmented-btn${inspectorStatus === 'delivered' ? ' is-active' : ''}`} onClick={() => handleInspectorStatusChange('delivered')}>ส่งมอบแล้ว ({inspectorSummary.delivered})</button>
              </div>
              <form style={{ display: 'flex', gap: 6 }} onSubmit={handleInspectorSearchSubmit}>
                <input type="text" className="lgx-input" placeholder="ค้นหาในรหัส..." value={inspectorSearch} onChange={(e) => setInspectorSearch(e.target.value)} />
                <button type="submit" className="lgx-icon-action"><i className="bi bi-search" /></button>
              </form>
            </div>

            {inspectorLoading ? <div className="lgx-empty">กำลังโหลดรายการสต็อก...</div> : (
              <table className="lgx-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}><input type="checkbox" onChange={toggleSelectAllInspector} checked={inspectorSelectedIds.size > 0 && inspectorSelectedIds.size === inspectorItems.filter((i) => i.status === 'available' || i.status === 'disabled').length} /></th>
                    <th>ID</th><th>ข้อมูลรหัส / Payload</th><th>สถานะ</th><th>ประวัติ / วันที่</th><th />
                  </tr>
                </thead>
                <tbody>
                  {inspectorItems.map((item) => {
                    const isDelivered = item.status === 'delivered'
                    const isSelected = inspectorSelectedIds.has(item.id)
                    return (
                      <tr key={item.id} style={{ background: isSelected ? 'var(--lgx-accent-soft)' : undefined }}>
                        <td>{!isDelivered ? <input type="checkbox" checked={isSelected} onChange={() => toggleSelectItem(item.id)} /> : <span style={{ opacity: .3 }}>•</span>}</td>
                        <td className="mono" style={{ color: 'var(--lgx-text-muted)' }}>#{item.id}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <code className="mono" style={{ background: 'var(--lgx-surface-alt)', padding: '3px 8px', borderRadius: 'var(--lgx-radius)', border: '1px solid var(--lgx-border)' }}>{inspectorMasked && isDelivered ? maskPayloadString(item.payload) : item.payload}</code>
                            <button type="button" className="lgx-icon-action" style={{ width: 24, height: 24 }} onClick={() => { navigator.clipboard.writeText(item.payload); setActionState({ status: 'success', message: `คัดลอกรหัส #${item.id} แล้ว` }) }}><i className="bi bi-clipboard" style={{ fontSize: 11 }} /></button>
                          </div>
                        </td>
                        <td>
                          {item.status === 'available' && <span className="lgx-pill ok">พร้อมขาย</span>}
                          {item.status === 'delivered' && <span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>ส่งมอบแล้ว</span>}
                          {item.status === 'reserved' && <span className="lgx-pill warn">จองแล้ว</span>}
                          {item.status === 'disabled' && <span className="lgx-pill neutral">ปิดใช้งาน</span>}
                        </td>
                        <td style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)' }}>
                          {isDelivered ? (
                            <div>
                              <div style={{ color: 'var(--lgx-accent)', fontWeight: 700 }}><i className="bi bi-receipt" style={{ marginRight: 3 }} />Order #{item.order_id || 'N/A'}{item.order_username ? ` (${item.order_username})` : ''}</div>
                              <div>{formatDateTime(item.delivered_at || item.created_at)}</div>
                            </div>
                          ) : <div>สร้างเมื่อ {formatDateTime(item.created_at)}</div>}
                        </td>
                        <td>
                          {!isDelivered && (
                            <div className="lgx-btn-group">
                              <button type="button" className="lgx-icon-action" onClick={() => setInspectorItemEdit({ id: item.id, payload: item.payload, status: item.status })}><i className="bi bi-pencil" /></button>
                              <button type="button" className="lgx-icon-action danger" onClick={() => deleteSingleInspectorItem(item.id)}><i className="bi bi-trash" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {inspectorItems.length === 0 && <tr><td colSpan={6} className="lgx-empty">ไม่พบรายการสต็อกในตัวกรองนี้</td></tr>}
                </tbody>
              </table>
            )}

            {inspectorItemEdit.id && (
              <div className="lgx-panel-body" style={{ borderTop: '1.5px solid var(--lgx-border)', background: 'var(--lgx-surface-alt)' }}>
                <div className="lgx-form-grid" style={{ gridTemplateColumns: '1.5fr 1fr auto', alignItems: 'flex-end' }}>
                  <div className="lgx-field"><label>แก้ไขรหัส #{inspectorItemEdit.id}</label><input type="text" className="lgx-input mono" value={inspectorItemEdit.payload} onChange={(e) => setInspectorItemEdit((prev) => ({ ...prev, payload: e.target.value }))} /></div>
                  <div className="lgx-field">
                    <label>สถานะ</label>
                    <select className="lgx-select" value={inspectorItemEdit.status} onChange={(e) => setInspectorItemEdit((prev) => ({ ...prev, status: e.target.value }))}>
                      <option value="available">พร้อมขาย</option>
                      <option value="disabled">ปิดใช้งาน</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveInspectorItemEdit}>บันทึก</button>
                    <button type="button" className="lgx-btn" onClick={() => setInspectorItemEdit(DEFAULT_STOCK_ITEM_EDIT)}>ยกเลิก</button>
                  </div>
                </div>
              </div>
            )}

            <div className="lgx-modal-foot" style={{ justifyContent: 'space-between' }}>
              <div>{inspectorSelectedIds.size > 0 && <button type="button" className="lgx-btn" style={{ background: 'var(--lgx-crit)', borderColor: 'var(--lgx-crit)', color: '#fff' }} onClick={deleteBatchInspectorItems}><i className="bi bi-trash" />ลบ {inspectorSelectedIds.size} รายการที่เลือก</button>}</div>
              <button type="button" className="lgx-btn" onClick={() => setInspectorOpen(false)}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
