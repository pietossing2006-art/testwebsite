import { useState } from 'react'
import {
  formatNumber, formatDateTime, getErrorMessage, pickNumber, splitStockLines,
  DEFAULT_POOL_FORM, DEFAULT_STOCK_ITEM_EDIT, DEFAULT_MYSTERY_FORM, DEFAULT_MYSTERY_EDIT, DEFAULT_MYSTERY_SIMULATION,
  computeMysteryChanceMeta, formatMysteryChancePercent, formatMysteryEffectiveWeight,
} from '../helpers.js'

export default function StockModule({ data, ctx }) {
  const { canAction, loadModuleData, patchModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [stockProductId, setStockProductId] = useState('')
  const [stockText, setStockText] = useState('')
  const [stockItemEdit, setStockItemEdit] = useState(DEFAULT_STOCK_ITEM_EDIT)
  const [poolForm, setPoolForm] = useState(DEFAULT_POOL_FORM)
  const [poolSelectedId, setPoolSelectedId] = useState('')
  const [poolItemsText, setPoolItemsText] = useState('')
  const [poolItemEdit, setPoolItemEdit] = useState(DEFAULT_STOCK_ITEM_EDIT)
  const [bindProductId, setBindProductId] = useState('')
  const [bindOptionId, setBindOptionId] = useState('')
  const [bindPoolId, setBindPoolId] = useState('')
  // mystery box
  const [mysteryBoxProductId, setMysteryBoxProductId] = useState('')
  const [mysteryPrizes, setMysteryPrizes] = useState([])
  const [mysteryForm, setMysteryForm] = useState(DEFAULT_MYSTERY_FORM)
  const [mysteryFormStockText, setMysteryFormStockText] = useState('')
  const [mysteryEdit, setMysteryEdit] = useState(DEFAULT_MYSTERY_EDIT)
  const [mysteryPrizeStockPrizeId, setMysteryPrizeStockPrizeId] = useState('')
  const [mysteryPrizeStockText, setMysteryPrizeStockText] = useState('')
  const [mysteryPrizeStockItems, setMysteryPrizeStockItems] = useState([])
  const [mysteryPrizeStockItemEdit, setMysteryPrizeStockItemEdit] = useState(DEFAULT_STOCK_ITEM_EDIT)
  const [mysterySimDraft, setMysterySimDraft] = useState(DEFAULT_MYSTERY_SIMULATION)
  const [mysterySimResult, setMysterySimResult] = useState(null)
  const [mysteryError, setMysteryError] = useState('')
  const [view, setView] = useState('products')

  if (!data) return null

  const canManage = canAction('stock.manage')
  const products = data.products || []
  const pools = data.pools || []
  const stockItems = data.stockItems || []
  const stockSummary = data.stockSummary || null
  const poolItems = data.poolItems || []
  const poolSummary = data.poolSummary || null
  const poolBindings = data.poolBindings || []

  // ── Digital Stock ──
  async function addStockToProduct() {
    const pid = Number(stockProductId)
    if (!Number.isFinite(pid) || pid <= 0) return
    if (!stockText.trim()) return
    try {
      setActionState({ status: 'working', message: 'กำลังเพิ่มสต็อก...' })
      const res = await fetchJson('/api/admin/stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: pid, text: stockText }),
      })
      setActionState({ status: 'success', message: `เพิ่ม ${res?.result?.inserted ?? 0} รายการเรียบร้อย` })
      setStockText('')
      await loadStockItems(pid)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function loadStockItems(pid) {
    try {
      const res = await fetchJson(`/api/admin/stock-items?product_id=${pid}&limit=200`, { method: 'GET' })
      patchModuleData('stock', prev => ({
        ...prev,
        stockItems: Array.isArray(res?.items) ? res.items : [],
        stockSummary: res?.summary || null,
      }))
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function viewProductStock(pid) {
    setStockProductId(String(pid))
    setStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
    await loadStockItems(pid)
    setView('product-stock')
  }

  async function saveStockItemEdit() {
    const sid = Number(stockItemEdit.id)
    if (!Number.isFinite(sid) || sid <= 0) return
    try {
      setActionState({ status: 'working', message: 'กำลังอัปเดตรายการสต็อก...' })
      await fetchJson(`/api/admin/stock-items/${sid}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: stockItemEdit.payload, status: stockItemEdit.status }),
      })
      setStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      setActionState({ status: 'success', message: 'อัปเดตรายการสต็อกเรียบร้อย' })
      await loadStockItems(stockProductId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteStockItem(sid) {
    if (!window.confirm(`ลบรายการสต็อก #${sid}?`)) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      await fetchJson(`/api/admin/stock-items/${sid}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบรายการสต็อกเรียบร้อย' })
      await loadStockItems(stockProductId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  // ── Stock Pools ──
  async function savePool() {
    const payload = {
      name: poolForm.name.trim(), kind: poolForm.kind, is_active: Boolean(poolForm.is_active),
    }
    if (poolForm.kind === 'quantity') payload.quantity_remaining = pickNumber(poolForm.quantity_remaining)
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก Pool...' })
      if (poolForm.id) {
        await fetchJson(`/api/admin/stock-pools/${poolForm.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        await fetchJson('/api/admin/stock-pools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
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

  async function loadPoolItems(poolId) {
    const pid = Number(poolId)
    if (!Number.isFinite(pid) || pid <= 0) return
    try {
      const res = await fetchJson(`/api/admin/stock-pool-items?pool_id=${pid}&limit=200&offset=0`, { method: 'GET' })
      patchModuleData('stock', prev => ({
        ...prev,
        poolItems: Array.isArray(res?.items) ? res.items : [],
        poolSummary: res?.summary || null,
      }))
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function viewPoolItemsPage(poolId) {
    setPoolSelectedId(String(poolId))
    setPoolItemEdit(DEFAULT_STOCK_ITEM_EDIT)
    await loadPoolItems(poolId)
    setView('pool-items')
  }

  async function addPoolItems() {
    const pid = Number(poolSelectedId)
    if (!Number.isFinite(pid) || pid <= 0) return
    if (!poolItemsText.trim()) return
    try {
      setActionState({ status: 'working', message: 'กำลังเพิ่มรายการ...' })
      await fetchJson('/api/admin/stock-pool-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_id: pid, text: poolItemsText }),
      })
      setActionState({ status: 'success', message: 'เพิ่มรายการเรียบร้อย' })
      setPoolItemsText('')
      await loadPoolItems(pid)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function savePoolItemEdit() {
    const sid = Number(poolItemEdit.id)
    if (!Number.isFinite(sid) || sid <= 0) return
    try {
      setActionState({ status: 'working', message: 'กำลังอัปเดต...' })
      await fetchJson(`/api/admin/stock-pool-items/${sid}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: poolItemEdit.payload, status: poolItemEdit.status }),
      })
      setPoolItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      setActionState({ status: 'success', message: 'อัปเดตเรียบร้อย' })
      await loadPoolItems(poolSelectedId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deletePoolItem(sid) {
    if (!window.confirm(`ลบรายการ #${sid}?`)) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      await fetchJson(`/api/admin/stock-pool-items/${sid}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบรายการเรียบร้อย' })
      await loadPoolItems(poolSelectedId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  // ── Bindings ──
  async function loadBindings(pid) {
    try {
      const res = await fetchJson(`/api/admin/product-option-stock-bindings?product_id=${pid}`, { method: 'GET' })
      patchModuleData('stock', prev => ({
        ...prev,
        poolBindings: Array.isArray(res?.bindings) ? res.bindings : [],
      }))
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function addBinding() {
    if (!bindProductId || !bindPoolId) return
    try {
      setActionState({ status: 'working', message: 'กำลังผูก...' })
      const body = { product_id: Number(bindProductId), pool_id: Number(bindPoolId) }
      if (bindOptionId.trim()) body.product_option_id = bindOptionId.trim()
      await fetchJson('/api/admin/product-option-stock-bindings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setActionState({ status: 'success', message: 'ผูกเรียบร้อย' })
      await loadBindings(bindProductId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function unsetBinding(optionId) {
    if (!bindProductId) return
    if (!window.confirm('ยกเลิกการผูก?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังยกเลิก...' })
      await fetchJson('/api/admin/product-option-stock-bindings', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: Number(bindProductId), product_option_id: optionId || null }),
      })
      setActionState({ status: 'success', message: 'ยกเลิกการผูกเรียบร้อย' })
      await loadBindings(bindProductId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  // ── Mystery Box ──
  const mysteryProducts = products.filter(p => String(p.fulfillment_type || '') === 'mystery_box')

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
        await fetchJson('/api/admin/mystery-box-prize-stock', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ box_product_id: bid, prize_id: cid, items: stockLines }),
        })
      }
      setMysteryForm(DEFAULT_MYSTERY_FORM)
      setMysteryFormStockText('')
      await loadMysteryPrizes(bid)
      setActionState({ status: 'success', message: 'สร้างรางวัลเรียบร้อย' })
    } catch (err) { setMysteryError(getErrorMessage(err)); setActionState({ status: 'error', message: 'สร้างรางวัลไม่สำเร็จ' }) }
  }

  async function saveMysteryPrizeEdit() {
    const id = Number(mysteryEdit.id)
    if (!Number.isFinite(id) || id <= 0) return
    const weight = Number(mysteryEdit.weight)
    const remaining = Number(mysteryEdit.remaining)
    if (!Number.isFinite(weight) || weight <= 0) { setMysteryError('น้ำหนักต้อง > 0'); return }
    try {
      setActionState({ status: 'working', message: 'อัปเดตรางวัล...' })
      setMysteryError('')
      await fetchJson(`/api/admin/mystery-box-prizes/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prize_name: String(mysteryEdit.prize_name || '').trim(), prize_image_url: mysteryEdit.prize_image_url || null, weight, remaining, is_active: Boolean(mysteryEdit.is_active) }),
      })
      setMysteryEdit(DEFAULT_MYSTERY_EDIT)
      await loadMysteryPrizes(mysteryBoxProductId)
      setActionState({ status: 'success', message: 'อัปเดตรางวัลเรียบร้อย' })
    } catch (err) { setMysteryError(getErrorMessage(err)); setActionState({ status: 'error', message: 'อัปเดตรางวัลไม่สำเร็จ' }) }
  }

  async function deleteMysteryPrize(prizeId) {
    if (!window.confirm(`ลบรางวัล #${prizeId}?`)) return
    try {
      setActionState({ status: 'working', message: 'ลบรางวัล...' })
      await fetchJson(`/api/admin/mystery-box-prizes/${prizeId}`, { method: 'DELETE' })
      if (Number(mysteryEdit.id) === Number(prizeId)) setMysteryEdit(DEFAULT_MYSTERY_EDIT)
      await loadMysteryPrizes(mysteryBoxProductId)
      setActionState({ status: 'success', message: 'ลบรางวัลเรียบร้อย' })
    } catch (err) { setMysteryError(getErrorMessage(err)); setActionState({ status: 'error', message: 'ลบรางวัลไม่สำเร็จ' }) }
  }

  async function loadMysteryPrizeStock(prizeId) {
    const pid = Number(prizeId)
    if (!Number.isFinite(pid) || pid <= 0) return
    try {
      const res = await fetchJson(`/api/admin/mystery-box-prize-stock?prize_id=${pid}&limit=200`, { method: 'GET' })
      setMysteryPrizeStockPrizeId(String(pid))
      setMysteryPrizeStockItems(Array.isArray(res?.items) ? res.items : [])
      setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
    } catch (err) { setMysteryError(getErrorMessage(err)) }
  }

  async function addMysteryPrizeStockItems() {
    const bid = Number(mysteryBoxProductId)
    const pid = Number(mysteryPrizeStockPrizeId)
    const lines = splitStockLines(mysteryPrizeStockText)
    if (!Number.isFinite(pid) || pid <= 0 || lines.length < 1) { setMysteryError('เลือกรางวัลและกรอกสต็อก'); return }
    try {
      setActionState({ status: 'working', message: 'เพิ่มสต็อกรางวัล...' })
      await fetchJson('/api/admin/mystery-box-prize-stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box_product_id: bid, prize_id: pid, items: lines }),
      })
      setMysteryPrizeStockText('')
      await Promise.all([loadMysteryPrizes(bid), loadMysteryPrizeStock(pid)])
      setActionState({ status: 'success', message: 'เพิ่มสต็อกรางวัลเรียบร้อย' })
    } catch (err) { setMysteryError(getErrorMessage(err)); setActionState({ status: 'error', message: 'เพิ่มสต็อกไม่สำเร็จ' }) }
  }

  async function saveMysteryPrizeStockItemEdit() {
    const sid = Number(mysteryPrizeStockItemEdit.id)
    if (!Number.isFinite(sid) || sid <= 0) return
    try {
      await fetchJson(`/api/admin/mystery-box-prize-stock-items/${sid}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: mysteryPrizeStockItemEdit.status, image_url: mysteryPrizeStockItemEdit.image_url || null }),
      })
      setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      await Promise.all([loadMysteryPrizes(mysteryBoxProductId), loadMysteryPrizeStock(mysteryPrizeStockPrizeId)])
    } catch (err) { setMysteryError(getErrorMessage(err)) }
  }

  async function deleteMysteryPrizeStockItem(sid) {
    if (!window.confirm(`ลบรายการ #${sid}?`)) return
    try {
      await fetchJson(`/api/admin/mystery-box-prize-stock-items/${sid}`, { method: 'DELETE' })
      if (Number(mysteryPrizeStockItemEdit.id) === Number(sid)) setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)
      await Promise.all([loadMysteryPrizes(mysteryBoxProductId), loadMysteryPrizeStock(mysteryPrizeStockPrizeId)])
    } catch (err) { setMysteryError(getErrorMessage(err)) }
  }

  async function runMysterySimulation() {
    const bid = Number(mysteryBoxProductId)
    if (!Number.isFinite(bid) || bid <= 0) { setMysteryError('เลือกสินค้า Mystery Box ก่อน'); return }
    const qty = Number(mysterySimDraft.qty)
    const trials = Number(mysterySimDraft.trials)
    if (!Number.isFinite(qty) || qty <= 0 || qty > 20) { setMysteryError('จำนวนสุ่มต่อรอบ 1-20'); return }
    if (!Number.isFinite(trials) || trials <= 0 || trials > 20000) { setMysteryError('จำนวนรอบ 1-20000'); return }
    try {
      setActionState({ status: 'working', message: 'จำลองผลสุ่ม...' })
      setMysteryError('')
      const qs = new URLSearchParams({ box_product_id: String(bid), qty: String(Math.trunc(qty)), trials: String(Math.trunc(trials)) })
      const res = await fetchJson(`/api/admin/mystery-box/simulate?${qs}`, { method: 'GET' })
      setMysterySimResult(res?.simulation || null)
      setActionState({ status: 'success', message: 'จำลองผลเรียบร้อย' })
    } catch (err) { setMysteryError(getErrorMessage(err)); setActionState({ status: 'error', message: 'จำลองผลไม่สำเร็จ' }) }
  }

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`alert ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show`}>
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })}></button>
        </div>
      )}

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${view === 'products' || view === 'product-stock' ? 'active' : ''}`} onClick={() => setView('products')}>สินค้า</button></li>
        <li className="nav-item"><button className={`nav-link ${view === 'pools' || view === 'pool-items' ? 'active' : ''}`} onClick={() => setView('pools')}>Stock Pools ({pools.length})</button></li>
        <li className="nav-item"><button className={`nav-link ${view === 'bindings' ? 'active' : ''}`} onClick={() => setView('bindings')}>Bindings</button></li>
        <li className="nav-item"><button className={`nav-link ${view === 'mystery' || view === 'mystery-stock' ? 'active' : ''}`} onClick={() => setView('mystery')}>Mystery Box</button></li>
      </ul>

      {/* ── Digital Stock ── */}
      {view === 'products' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">เพิ่มสต็อกสินค้า</h3></div>
          <div className="card-body">
            <div className="row g-2 mb-3">
              <div className="col-md-4">
                <select className="form-select" value={stockProductId} onChange={(e) => setStockProductId(e.target.value)}>
                  <option value="">เลือกสินค้า...</option>
                  {products.map(p => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <textarea className="form-control" rows={4} placeholder="ใส่สต็อก 1 ต่อบรรทัด..." value={stockText} onChange={(e) => setStockText(e.target.value)}></textarea>
              </div>
              <div className="col-md-2 d-grid">
                <button className="btn btn-primary" onClick={addStockToProduct} disabled={!canManage || !stockProductId || !stockText.trim()}>
                  <i className="bi bi-plus-lg me-1"></i>เพิ่มสต็อก
                </button>
              </div>
            </div>
            <table className="table table-sm table-hover">
              <thead><tr><th>สินค้า</th><th>สต็อก</th><th>ดู</th></tr></thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.is_unlimited_stock ? '∞' : formatNumber(p.available_stock ?? p.stock)}</td>
                    <td><button className="btn btn-outline-info btn-sm" onClick={() => viewProductStock(p.id)}><i className="bi bi-eye"></i></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'product-stock' && (
        <div className="card">
          <div className="card-header d-flex justify-content-between">
            <h3 className="card-title">สต็อกสินค้า #{stockProductId}</h3>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => loadStockItems(stockProductId)}>รีโหลด</button>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setView('products')}>กลับ</button>
            </div>
          </div>
          <div className="card-body">
            {stockSummary && (
              <div className="alert alert-info py-2 mb-3" style={{ fontSize: 13 }}>
                พร้อมใช้ {formatNumber(stockSummary.available)} | จองแล้ว {formatNumber(stockSummary.reserved)} | ส่งแล้ว {formatNumber(stockSummary.delivered)}
              </div>
            )}
            <table className="table table-sm mb-0">
              <thead><tr><th>ID</th><th>Payload</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {stockItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td><code style={{ fontSize: 11 }}>{item.payload}</code></td>
                    <td><span className={`badge ${item.status === 'available' ? 'text-bg-success' : 'text-bg-secondary'}`}>{item.status}</span></td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-primary" onClick={() => setStockItemEdit({ id: item.id, payload: item.payload || '', status: item.status || 'available' })}><i className="bi bi-pencil"></i></button>
                        <button className="btn btn-outline-danger" onClick={() => deleteStockItem(item.id)}><i className="bi bi-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {stockItems.length === 0 && <tr><td colSpan={4} className="text-center text-secondary py-3">ไม่มีรายการ</td></tr>}
              </tbody>
            </table>
            {stockItemEdit.id && (
              <div className="card mt-3">
                <div className="card-body py-2">
                  <div className="row g-2 align-items-end">
                    <div className="col-md-5"><label className="form-label mb-0" style={{ fontSize: 12 }}>Payload</label><input className="form-control form-control-sm" value={stockItemEdit.payload} onChange={(e) => setStockItemEdit(prev => ({ ...prev, payload: e.target.value }))} /></div>
                    <div className="col-md-3"><label className="form-label mb-0" style={{ fontSize: 12 }}>สถานะ</label><select className="form-select form-select-sm" value={stockItemEdit.status} onChange={(e) => setStockItemEdit(prev => ({ ...prev, status: e.target.value }))}><option value="available">พร้อมใช้</option><option value="disabled">ปิดใช้งาน</option></select></div>
                    <div className="col-md-4 d-flex gap-2"><button className="btn btn-primary btn-sm" onClick={saveStockItemEdit}>บันทึก</button><button className="btn btn-outline-secondary btn-sm" onClick={() => setStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)}>ยกเลิก</button></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stock Pools ── */}
      {view === 'pools' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">พูลสต็อก</h3></div>
          <div className="card-body">
            <div className="row g-2 mb-3">
              <div className="col-md-3"><input className="form-control form-control-sm" placeholder="ชื่อ Pool" value={poolForm.name} onChange={(e) => setPoolForm(prev => ({ ...prev, name: e.target.value }))} /></div>
              <div className="col-md-2">
                <select className="form-select form-select-sm" value={poolForm.kind} onChange={(e) => setPoolForm(prev => ({ ...prev, kind: e.target.value }))}>
                  <option value="digital_code">โค้ดดิจิทัล</option>
                  <option value="quantity">แบบจำนวนคงเหลือ</option>
                </select>
              </div>
              {poolForm.kind === 'quantity' && (
                <div className="col-md-2"><input type="number" className="form-control form-control-sm" placeholder="คงเหลือ" value={poolForm.quantity_remaining} onChange={(e) => setPoolForm(prev => ({ ...prev, quantity_remaining: e.target.value }))} /></div>
              )}
              <div className="col-md-2">
                <div className="form-check mt-1"><input type="checkbox" className="form-check-input" checked={poolForm.is_active} onChange={(e) => setPoolForm(prev => ({ ...prev, is_active: e.target.checked }))} /><label className="form-check-label" style={{ fontSize: 13 }}>เปิดใช้งาน</label></div>
              </div>
              <div className="col-md-2">
                <button className="btn btn-primary btn-sm w-100" onClick={savePool} disabled={!canManage || !poolForm.name.trim()}>{poolForm.id ? 'อัปเดต' : 'สร้าง'}</button>
              </div>
              {poolForm.id && <div className="col-md-1"><button className="btn btn-outline-secondary btn-sm" onClick={() => setPoolForm(DEFAULT_POOL_FORM)}>รีเซ็ต</button></div>}
            </div>
            <table className="table table-hover table-sm">
              <thead><tr><th>ID</th><th>ชื่อ</th><th>ประเภท</th><th>คงเหลือ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {pools.map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td><td>{p.name}</td><td>{p.kind}</td>
                    <td>{p.kind === 'quantity' ? formatNumber(p.quantity_remaining) : '-'}</td>
                    <td>{p.is_active ? <span className="badge text-bg-success">Active</span> : <span className="badge text-bg-secondary">Inactive</span>}</td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-info" onClick={() => viewPoolItemsPage(p.id)}><i className="bi bi-eye"></i></button>
                        <button className="btn btn-outline-primary" onClick={() => setPoolForm({ id: p.id, name: p.name || '', kind: p.kind || 'digital_code', quantity_remaining: p.quantity_remaining || '', is_active: p.is_active !== false })}><i className="bi bi-pencil"></i></button>
                        <button className="btn btn-outline-danger" onClick={() => deletePool(p.id)} disabled={!canManage}><i className="bi bi-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pools.length === 0 && <tr><td colSpan={6} className="text-center text-secondary py-3">ไม่มีพูล</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'pool-items' && (
        <div className="card">
          <div className="card-header d-flex justify-content-between">
            <h3 className="card-title">Pool #{poolSelectedId} Items</h3>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => loadPoolItems(poolSelectedId)}>รีโหลด</button>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setView('pools')}>กลับ</button>
            </div>
          </div>
          <div className="card-body">
            {poolSummary && (
              <div className="alert alert-info py-2 mb-3" style={{ fontSize: 13 }}>
                {poolSummary.kind === 'quantity' ? `คงเหลือ ${formatNumber(poolSummary.quantity_remaining)}` : `พร้อมใช้ ${formatNumber(poolSummary.available)} | จองแล้ว ${formatNumber(poolSummary.reserved)} | ส่งแล้ว ${formatNumber(poolSummary.delivered)}`}
              </div>
            )}
            <div className="row g-2 mb-3">
              <div className="col-md-8">
                <textarea className="form-control form-control-sm" rows={3} placeholder="ใส่รายการ 1 ต่อบรรทัด..." value={poolItemsText} onChange={(e) => setPoolItemsText(e.target.value)}></textarea>
              </div>
              <div className="col-md-4 d-grid">
                <button className="btn btn-primary btn-sm" onClick={addPoolItems} disabled={!canManage || !poolItemsText.trim()}>เพิ่มรายการ</button>
              </div>
            </div>
            <table className="table table-sm mb-0">
              <thead><tr><th>ID</th><th>Payload</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {poolItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td><code style={{ fontSize: 11 }}>{item.payload}</code></td>
                    <td><span className={`badge ${item.status === 'available' ? 'text-bg-success' : 'text-bg-secondary'}`}>{item.status}</span></td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-primary" onClick={() => setPoolItemEdit({ id: item.id, payload: item.payload || '', status: item.status || 'available' })}><i className="bi bi-pencil"></i></button>
                        <button className="btn btn-outline-danger" onClick={() => deletePoolItem(item.id)}><i className="bi bi-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {poolItems.length === 0 && <tr><td colSpan={4} className="text-center text-secondary py-3">ไม่มีรายการ</td></tr>}
              </tbody>
            </table>
            {poolItemEdit.id && (
              <div className="card mt-3">
                <div className="card-body py-2">
                  <div className="row g-2 align-items-end">
                    <div className="col-md-5"><label className="form-label mb-0" style={{ fontSize: 12 }}>Payload</label><input className="form-control form-control-sm" value={poolItemEdit.payload} onChange={(e) => setPoolItemEdit(prev => ({ ...prev, payload: e.target.value }))} /></div>
                    <div className="col-md-3"><label className="form-label mb-0" style={{ fontSize: 12 }}>สถานะ</label><select className="form-select form-select-sm" value={poolItemEdit.status} onChange={(e) => setPoolItemEdit(prev => ({ ...prev, status: e.target.value }))}><option value="available">พร้อมใช้</option><option value="disabled">ปิดใช้งาน</option></select></div>
                    <div className="col-md-4 d-flex gap-2"><button className="btn btn-primary btn-sm" onClick={savePoolItemEdit}>บันทึก</button><button className="btn btn-outline-secondary btn-sm" onClick={() => setPoolItemEdit(DEFAULT_STOCK_ITEM_EDIT)}>ยกเลิก</button></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bindings ── */}
      {view === 'bindings' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">การผูกพูล (Product-Pool Bindings)</h3></div>
          <div className="card-body">
            <div className="row g-2 mb-3">
              <div className="col-md-3">
                <select className="form-select form-select-sm" value={bindProductId} onChange={(e) => {
                  setBindProductId(e.target.value)
                  if (e.target.value) loadBindings(e.target.value)
                  else patchModuleData('stock', prev => ({ ...prev, poolBindings: [] }))
                }}>
                  <option value="">เลือกสินค้า...</option>
                  {products.map(p => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
                </select>
              </div>
              <div className="col-md-2"><input className="form-control form-control-sm" placeholder="Option ID (ไม่บังคับ)" value={bindOptionId} onChange={(e) => setBindOptionId(e.target.value)} /></div>
              <div className="col-md-3">
                <select className="form-select form-select-sm" value={bindPoolId} onChange={(e) => setBindPoolId(e.target.value)}>
                  <option value="">เลือก Pool...</option>
                  {pools.map(p => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
                </select>
              </div>
              <div className="col-md-2"><button className="btn btn-primary btn-sm" onClick={addBinding} disabled={!canManage || !bindProductId || !bindPoolId}>ตั้งค่าการผูก</button></div>
            </div>
            {poolBindings.length > 0 && (
              <table className="table table-sm">
                <thead><tr><th>ตัวเลือก</th><th>Pool</th><th>จัดการ</th></tr></thead>
                <tbody>
                  {poolBindings.map(b => (
                    <tr key={b.id}>
                      <td>{b.product_option_id || 'DEFAULT'}</td>
                      <td>#{b.pool_id} {b.pool_name || ''}</td>
                      <td><button className="btn btn-outline-danger btn-sm" onClick={() => unsetBinding(b.product_option_id)} disabled={!canManage}><i className="bi bi-x-lg"></i></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {poolBindings.length === 0 && bindProductId && <div className="text-secondary" style={{ fontSize: 13 }}>ยังไม่มีการผูก</div>}
          </div>
        </div>
      )}

      {/* ── Mystery Box ── */}
      {view === 'mystery' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">พูลสุ่ม (Mystery Pool)</h3></div>
          <div className="card-body">
            {mysteryError && <div className="alert alert-danger py-2">{mysteryError}<button type="button" className="btn-close float-end" onClick={() => setMysteryError('')} style={{ fontSize: 10 }}></button></div>}
            <div className="row g-2 mb-3">
              <div className="col-md-4">
                <select className="form-select" value={mysteryBoxProductId} onChange={(e) => { setMysteryBoxProductId(e.target.value); if (e.target.value) loadMysteryPrizes(e.target.value); else setMysteryPrizes([]) }}>
                  <option value="">เลือก Mystery Box...</option>
                  {mysteryProducts.map(p => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
                </select>
              </div>
              <div className="col-md-2"><button className="btn btn-outline-secondary btn-sm" onClick={runMysterySimulation} disabled={!mysteryBoxProductId}><i className="bi bi-dice-5 me-1"></i>จำลอง</button></div>
            </div>

            {/* Simulation config */}
            {mysteryBoxProductId && (
              <div className="row g-2 mb-3">
                <div className="col-auto"><input type="number" className="form-control form-control-sm" style={{ width: 90 }} value={mysterySimDraft.qty} onChange={(e) => setMysterySimDraft(prev => ({ ...prev, qty: e.target.value }))} placeholder="จำนวน/รอบ" /></div>
                <div className="col-auto"><input type="number" className="form-control form-control-sm" style={{ width: 110 }} value={mysterySimDraft.trials} onChange={(e) => setMysterySimDraft(prev => ({ ...prev, trials: e.target.value }))} placeholder="จำนวนรอบ" /></div>
              </div>
            )}

            {/* Simulation result */}
            {mysterySimResult && (
              <div className="card mb-3"><div className="card-body py-2">
                <div className="fw-bold mb-1" style={{ fontSize: 13 }}>ผลจำลอง ({formatNumber(mysterySimResult.total_trials)} รอบ × {mysterySimResult.qty_per_trial} ชิ้น)</div>
                <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                  <thead><tr><th>รางวัล</th><th>จำนวน</th><th>%</th></tr></thead>
                  <tbody>
                    {Array.isArray(mysterySimResult.results) && mysterySimResult.results.map((r, i) => (
                      <tr key={i}><td>{r.prize_name || `Prize #${r.prize_id}`}</td><td>{formatNumber(r.count)}</td><td>{typeof r.percent === 'number' ? r.percent.toFixed(2) + '%' : '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div></div>
            )}

            {/* Prize list */}
            {mysteryPrizes.length > 0 && (() => {
              const totalEffWeight = mysteryPrizes.reduce((sum, row) => sum + computeMysteryChanceMeta(row).effectiveWeight, 0)
              return (
                <table className="table table-sm table-hover mb-3">
                  <thead><tr><th>ID</th><th style={{ width: 44 }}>รูป</th><th>ชื่อ</th><th>ประเภท</th><th>น้ำหนัก</th><th>คงเหลือ</th><th>โอกาส</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                  <tbody>
                    {mysteryPrizes.map(row => {
                      const meta = computeMysteryChanceMeta(row)
                      const pct = totalEffWeight > 0 ? (meta.effectiveWeight / totalEffWeight) * 100 : 0
                      return (
                        <tr key={row.id}>
                          <td>{row.id}</td>
                          <td>{(row.prize_image_url || row.prize_product_image_url) ? <img src={row.prize_image_url || row.prize_product_image_url} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4 }} /> : <span className="text-secondary">-</span>}</td>
                          <td>{row.prize_name || '-'}</td>
                          <td><span className="badge text-bg-info">{row.prize_kind}</span></td>
                          <td>{row.weight}</td>
                          <td>{meta.remaining}</td>
                          <td>{formatMysteryChancePercent(pct)}</td>
                          <td>{row.is_active ? <span className="badge text-bg-success">Active</span> : <span className="badge text-bg-secondary">Off</span>}</td>
                          <td>
                            <div className="btn-group btn-group-sm">
                              {row.prize_kind === 'product' && <button className="btn btn-outline-info" onClick={() => { loadMysteryPrizeStock(row.id); setView('mystery-stock') }}><i className="bi bi-box-seam"></i></button>}
                              <button className="btn btn-outline-primary" onClick={() => setMysteryEdit({ id: row.id, prize_name: row.prize_name || '', prize_image_url: row.prize_image_url || '', weight: row.weight || 1, remaining: row.remaining || 0, is_active: row.is_active !== false })}><i className="bi bi-pencil"></i></button>
                              <button className="btn btn-outline-danger" onClick={() => deleteMysteryPrize(row.id)}><i className="bi bi-trash"></i></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            })()}

            {/* Edit prize inline */}
            {mysteryEdit.id && (
              <div className="card mb-3"><div className="card-body py-2">
                <div className="fw-bold mb-2" style={{ fontSize: 13 }}>แก้ไขรางวัล #{mysteryEdit.id}</div>
                <div className="row g-2 align-items-end">
                  <div className="col-md-3"><label className="form-label mb-0" style={{ fontSize: 12 }}>ชื่อ</label><input className="form-control form-control-sm" value={mysteryEdit.prize_name} onChange={(e) => setMysteryEdit(prev => ({ ...prev, prize_name: e.target.value }))} /></div>
                  <div className="col-md-2"><label className="form-label mb-0" style={{ fontSize: 12 }}>น้ำหนัก</label><input type="number" className="form-control form-control-sm" value={mysteryEdit.weight} onChange={(e) => setMysteryEdit(prev => ({ ...prev, weight: e.target.value }))} /></div>
                  <div className="col-md-2"><label className="form-label mb-0" style={{ fontSize: 12 }}>คงเหลือ</label><input type="number" className="form-control form-control-sm" value={mysteryEdit.remaining} onChange={(e) => setMysteryEdit(prev => ({ ...prev, remaining: e.target.value }))} /></div>
                  <div className="col-md-2"><div className="form-check mt-2"><input type="checkbox" className="form-check-input" checked={mysteryEdit.is_active} onChange={(e) => setMysteryEdit(prev => ({ ...prev, is_active: e.target.checked }))} /><label className="form-check-label" style={{ fontSize: 12 }}>เปิด</label></div></div>
                  <div className="col-md-3 d-flex gap-2"><button className="btn btn-primary btn-sm" onClick={saveMysteryPrizeEdit}>บันทึก</button><button className="btn btn-outline-secondary btn-sm" onClick={() => setMysteryEdit(DEFAULT_MYSTERY_EDIT)}>ยกเลิก</button></div>
                </div>
                <div className="row g-2 mt-1 align-items-end">
                  <div className="col-md-8"><label className="form-label mb-0" style={{ fontSize: 12 }}>URL รูปรางวัล</label><input type="text" className="form-control form-control-sm" placeholder="https://..." value={mysteryEdit.prize_image_url || ''} onChange={(e) => setMysteryEdit(prev => ({ ...prev, prize_image_url: e.target.value }))} /></div>
                  <div className="col-md-4 d-flex align-items-center gap-2">{mysteryEdit.prize_image_url && <img src={mysteryEdit.prize_image_url} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, border: '1px solid #dee2e6' }} />}</div>
                </div>
              </div></div>
            )}

            {/* Create prize form */}
            {mysteryBoxProductId && !mysteryEdit.id && (
              <div className="card"><div className="card-body py-2">
                <div className="fw-bold mb-2" style={{ fontSize: 13 }}>สร้างรางวัลใหม่</div>
                <div className="row g-2">
                  <div className="col-md-3">
                    <label className="form-label mb-0" style={{ fontSize: 12 }}>ประเภท</label>
                    <select className="form-select form-select-sm" value={mysteryForm.prize_kind} onChange={(e) => setMysteryForm(prev => ({ ...prev, prize_kind: e.target.value }))}>
                      <option value="product">Internal (สต็อกเฉพาะ)</option>
                      <option value="linked_product">เชื่อมสินค้า</option>
                      <option value="salt">เกลือ (ไม่มีสต็อก)</option>
                    </select>
                  </div>
                  <div className="col-md-3"><label className="form-label mb-0" style={{ fontSize: 12 }}>ชื่อรางวัล</label><input className="form-control form-control-sm" value={mysteryForm.prize_name} onChange={(e) => setMysteryForm(prev => ({ ...prev, prize_name: e.target.value }))} /></div>
                  {mysteryForm.prize_kind === 'linked_product' && (
                    <div className="col-md-3">
                      <label className="form-label mb-0" style={{ fontSize: 12 }}>สินค้าที่เชื่อม</label>
                      <select className="form-select form-select-sm" value={mysteryForm.prize_product_id} onChange={(e) => setMysteryForm(prev => ({ ...prev, prize_product_id: e.target.value }))}>
                        <option value="">เลือก...</option>
                        {products.map(p => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="col-md-1"><label className="form-label mb-0" style={{ fontSize: 12 }}>น้ำหนัก</label><input type="number" className="form-control form-control-sm" value={mysteryForm.weight} onChange={(e) => setMysteryForm(prev => ({ ...prev, weight: e.target.value }))} /></div>
                  <div className="col-md-1"><label className="form-label mb-0" style={{ fontSize: 12 }}>คงเหลือ</label><input type="number" className="form-control form-control-sm" value={mysteryForm.remaining} onChange={(e) => setMysteryForm(prev => ({ ...prev, remaining: e.target.value }))} /></div>
                </div>
                <div className="row g-2 mt-1">
                  <div className="col-md-6"><label className="form-label mb-0" style={{ fontSize: 12 }}>URL รูปรางวัล (ไม่บังคับ)</label><input type="text" className="form-control form-control-sm" placeholder="https://..." value={mysteryForm.prize_image_url || ''} onChange={(e) => setMysteryForm(prev => ({ ...prev, prize_image_url: e.target.value }))} /></div>
                  <div className="col-md-2 d-flex align-items-end">{mysteryForm.prize_image_url && <img src={mysteryForm.prize_image_url} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }} />}</div>
                </div>
                {mysteryForm.prize_kind === 'product' && (
                  <div className="mt-2"><label className="form-label mb-0" style={{ fontSize: 12 }}>สต็อก (1 บรรทัด = 1 ชิ้น)</label><textarea className="form-control form-control-sm" rows={3} value={mysteryFormStockText} onChange={(e) => setMysteryFormStockText(e.target.value)} placeholder="ใส่สต็อก 1 ต่อบรรทัด..."></textarea></div>
                )}
                <div className="mt-2"><button className="btn btn-primary btn-sm" onClick={createMysteryPrize} disabled={!canManage}><i className="bi bi-plus-lg me-1"></i>สร้างรางวัล</button></div>
              </div></div>
            )}
          </div>
        </div>
      )}

      {/* Mystery prize stock detail */}
      {view === 'mystery-stock' && (
        <div className="card">
          <div className="card-header d-flex justify-content-between">
            <h3 className="card-title">สต็อกรางวัล #{mysteryPrizeStockPrizeId}</h3>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setView('mystery')}>กลับ</button>
          </div>
          <div className="card-body">
            {mysteryError && <div className="alert alert-danger py-2">{mysteryError}</div>}
            <div className="row g-2 mb-3">
              <div className="col-md-8"><textarea className="form-control form-control-sm" rows={3} placeholder="ใส่สต็อก 1 ต่อบรรทัด..." value={mysteryPrizeStockText} onChange={(e) => setMysteryPrizeStockText(e.target.value)}></textarea></div>
              <div className="col-md-4 d-grid"><button className="btn btn-primary btn-sm" onClick={addMysteryPrizeStockItems} disabled={!canManage || !mysteryPrizeStockText.trim()}>เพิ่มสต็อก</button></div>
            </div>
            <table className="table table-sm mb-0">
              <thead><tr><th>ID</th><th style={{ width: 48 }}>รูป</th><th>Payload</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {mysteryPrizeStockItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.image_url ? <img src={item.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4 }} /> : <span className="text-secondary" style={{ fontSize: 11 }}>-</span>}</td>
                    <td><code style={{ fontSize: 11 }}>{item.payload}</code></td>
                    <td><span className={`badge ${item.status === 'available' ? 'text-bg-success' : 'text-bg-secondary'}`}>{item.status}</span></td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-primary" onClick={() => setMysteryPrizeStockItemEdit({ id: item.id, payload: item.payload || '', status: item.status || 'available', image_url: item.image_url || '' })}><i className="bi bi-pencil"></i></button>
                        <button className="btn btn-outline-danger" onClick={() => deleteMysteryPrizeStockItem(item.id)}><i className="bi bi-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {mysteryPrizeStockItems.length === 0 && <tr><td colSpan={5} className="text-center text-secondary py-3">ไม่มีรายการ</td></tr>}
              </tbody>
            </table>
            {mysteryPrizeStockItemEdit.id && (
              <div className="card mt-3"><div className="card-body py-2">
                <div className="row g-2 align-items-end">
                  <div className="col-md-3"><label className="form-label mb-0" style={{ fontSize: 12 }}>สถานะ</label><select className="form-select form-select-sm" value={mysteryPrizeStockItemEdit.status} onChange={(e) => setMysteryPrizeStockItemEdit(prev => ({ ...prev, status: e.target.value }))}><option value="available">พร้อมใช้</option><option value="disabled">ปิดใช้งาน</option></select></div>
                  <div className="col-md-5"><label className="form-label mb-0" style={{ fontSize: 12 }}>URL รูปภาพ</label><input type="text" className="form-control form-control-sm" placeholder="https://..." value={mysteryPrizeStockItemEdit.image_url || ''} onChange={(e) => setMysteryPrizeStockItemEdit(prev => ({ ...prev, image_url: e.target.value }))} /></div>
                  <div className="col-md-4 d-flex gap-2 align-items-end">
                    {mysteryPrizeStockItemEdit.image_url && <img src={mysteryPrizeStockItemEdit.image_url} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, border: '1px solid #dee2e6' }} />}
                    <button className="btn btn-primary btn-sm" onClick={saveMysteryPrizeStockItemEdit}>บันทึก</button><button className="btn btn-outline-secondary btn-sm" onClick={() => setMysteryPrizeStockItemEdit(DEFAULT_STOCK_ITEM_EDIT)}>ยกเลิก</button>
                  </div>
                </div>
              </div></div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
