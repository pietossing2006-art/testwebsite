import { Fragment, useEffect, useMemo, useState } from 'react'
import { copyToClipboard } from '../../../api.js'
import { formatDateTime, formatRelativeTime } from '../helpers.js'
import { loadOrdersModule, loadOrderDetail } from '../loaders.js'

const ORDER_STATUS_MAP = {
  pending: { label: 'รอดำเนินการ', badge: 'text-bg-warning' },
  completed: { label: 'เสร็จสิ้น', badge: 'text-bg-success' },
  cancelled: { label: 'ยกเลิก', badge: 'text-bg-secondary' },
}

const DELIVERY_STATUS_MAP = {
  pending_fulfillment: { label: 'รอเตรียมสินค้า', badge: 'text-bg-warning' },
  pending_claim: { label: 'รอลูกค้ารับ', badge: 'text-bg-info' },
  claimed: { label: 'รับแล้ว', badge: 'text-bg-success' },
  cancelled: { label: 'ยกเลิก', badge: 'text-bg-secondary' },
}

const FARM_STATUS_MAP = {
  pending: { label: 'รอมอบหมาย', badge: 'text-bg-warning' },
  in_progress: { label: 'กำลังดำเนินการ', badge: 'text-bg-primary' },
  fulfilled: { label: 'งานเสร็จแล้ว', badge: 'text-bg-success' },
  cancelled: { label: 'ยกเลิก', badge: 'text-bg-secondary' },
}

const FULFILLMENT_TYPE_MAP = {
  digital: { label: 'ดิจิทัล', icon: 'bi-lightning-charge' },
  farm_form: { label: 'งานบริการ', icon: 'bi-truck' },
  mystery_box: { label: 'กล่องสุ่ม', icon: 'bi-gift' },
}

const STAGE_META = {
  cancelled: { label: 'ยกเลิก', detail: 'ออเดอร์หรือรายการถูกยกเลิก', tone: 'secondary', progress: 100 },
  needs_assign: { label: 'ต้องมอบหมาย', detail: 'งานบริการยังไม่มีคนรับผิดชอบ', tone: 'warning', progress: 32 },
  in_progress: { label: 'กำลังทำงาน', detail: 'ทีมกำลังดำเนินการรายการนี้', tone: 'primary', progress: 58 },
  preparing: { label: 'เตรียมสินค้า', detail: 'ระบบกำลังเตรียมของให้ลูกค้า', tone: 'warning', progress: 42 },
  ready: { label: 'รอลูกค้ารับ', detail: 'สินค้าเข้ากล่องรับของแล้ว', tone: 'info', progress: 78 },
  claimed: { label: 'รับแล้ว', detail: 'ลูกค้ากดรับสินค้าแล้ว', tone: 'success', progress: 100 },
  completed: { label: 'เสร็จสิ้น', detail: 'ออเดอร์เสร็จสมบูรณ์', tone: 'success', progress: 100 },
  pending: { label: 'รอดำเนินการ', detail: 'กำลังรอขั้นตอนถัดไป', tone: 'warning', progress: 18 },
}

function StatusBadge({ status, map }) {
  const meta = map[status] || { label: status || '-', badge: 'text-bg-secondary' }
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>
}

function StageBadge({ stage }) {
  const meta = STAGE_META[stage] || STAGE_META.pending
  return <span className={`badge text-bg-${meta.tone}`}>{meta.label}</span>
}

function formatPoints(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('th-TH') : '0'
}

function getOptionLabel(option) {
  if (!option) return ''
  if (typeof option === 'object') return option.label || option.name || option.id || ''
  try {
    const parsed = JSON.parse(String(option))
    return parsed?.label || parsed?.name || parsed?.id || ''
  } catch {
    return String(option)
  }
}

function getTypeMeta(type) {
  return FULFILLMENT_TYPE_MAP[String(type || '')] || { label: type || '-', icon: 'bi-box-seam' }
}

function computeStage(order) {
  if (order.status === 'cancelled') return 'cancelled'
  const deliveries = order.deliveries || []
  if (deliveries.some((d) => d.status === 'cancelled' || d.farm_status === 'cancelled')) return 'cancelled'
  if (deliveries.some((d) => d.farm_status === 'in_progress')) return 'in_progress'
  if (deliveries.some((d) => d.farm_status === 'pending' && !d.assigned_staff_name)) return 'needs_assign'
  if (deliveries.some((d) => d.status === 'pending_fulfillment')) return 'preparing'
  if (deliveries.some((d) => d.status === 'pending_claim')) return 'ready'
  if (deliveries.length > 0 && deliveries.every((d) => d.status === 'claimed')) return 'claimed'
  if (order.status === 'completed') return 'completed'
  return 'pending'
}

function groupOrders(items) {
  const map = new Map()
  for (const row of items || []) {
    const id = row.id
    if (!map.has(id)) {
      map.set(id, {
        ...row,
        itemCount: 0,
        productNames: [],
        optionLabels: [],
        deliveries: [],
        _deliveryKeys: new Set(),
        _productKeys: new Set(),
      })
    }
    const order = map.get(id)
    const productKey = `${row.order_item_id || row.product_id}:${row.product_name}`
    if (!order._productKeys.has(productKey)) {
      order._productKeys.add(productKey)
      order.itemCount += 1
      if (row.product_name) order.productNames.push(row.product_name)
      const optionLabel = getOptionLabel(row.product_option)
      if (optionLabel) order.optionLabels.push(optionLabel)
    }
    if (row.delivery_id) {
      const deliveryKey = `${row.delivery_id}:${row.farm_request_id || ''}`
      if (!order._deliveryKeys.has(deliveryKey)) {
        order._deliveryKeys.add(deliveryKey)
        order.deliveries.push({
          id: row.delivery_id,
          status: row.delivery_status,
          claimed_at: row.claimed_at,
          farm_request_id: row.farm_request_id,
          farm_status: row.farm_status,
          assigned_at: row.assigned_at,
          started_at: row.started_at,
          fulfilled_at: row.fulfilled_at,
          assigned_staff_name: row.assigned_staff_name,
        })
      }
    }
  }
  return [...map.values()].map((order) => {
    delete order._deliveryKeys
    delete order._productKeys
    return { ...order, stage: computeStage(order) }
  })
}

function buildTimeline(delivery) {
  const isFarm = Boolean(delivery.farm_request_id)
  if (!isFarm) {
    return [
      { icon: 'bi-bag-check', label: 'สร้างออเดอร์', time: delivery.created_at, done: true },
      { icon: 'bi-box', label: 'เตรียมสินค้า', time: delivery.created_at, done: !['pending_fulfillment', 'cancelled'].includes(delivery.status) },
      { icon: 'bi-inbox', label: 'เข้ากล่องรับของ', time: delivery.status === 'pending_claim' || delivery.status === 'claimed' ? delivery.created_at : null, done: delivery.status === 'pending_claim' || delivery.status === 'claimed' },
      { icon: 'bi-check2-circle', label: 'ลูกค้ารับแล้ว', time: delivery.claimed_at, done: delivery.status === 'claimed' },
    ]
  }
  return [
    { icon: 'bi-bag-check', label: 'สร้างงานบริการ', time: delivery.farm_created_at || delivery.created_at, done: true },
    { icon: 'bi-person-plus', label: 'มอบหมายงาน', time: delivery.assigned_at, done: Boolean(delivery.assigned_at || delivery.started_at || delivery.fulfilled_at) },
    { icon: 'bi-play-circle', label: 'เริ่มดำเนินการ', time: delivery.started_at, done: Boolean(delivery.started_at || delivery.fulfilled_at) },
    { icon: 'bi-flag', label: 'ส่งมอบงาน', time: delivery.fulfilled_at, done: Boolean(delivery.fulfilled_at) },
    { icon: 'bi-check2-circle', label: 'ลูกค้ารับแล้ว', time: delivery.claimed_at, done: delivery.status === 'claimed' },
  ]
}

function nextActiveIndex(steps) {
  const lastDone = steps.reduce((last, step, idx) => (step.done ? idx : last), -1)
  return Math.min(lastDone + 1, steps.length - 1)
}

function Timeline({ delivery }) {
  const steps = buildTimeline(delivery)
  const active = nextActiveIndex(steps)
  const cancelled = delivery.status === 'cancelled' || delivery.farm_status === 'cancelled'
  if (cancelled) {
    return (
      <div className="alert alert-secondary mb-0 py-2">
        รายการนี้ถูกยกเลิก{delivery.cancel_note ? `: ${delivery.cancel_note}` : ''}
      </div>
    )
  }
  return (
    <div className="order-timeline">
      {steps.map((step, idx) => (
        <div className={`order-timeline-step ${step.done ? 'is-done' : idx === active ? 'is-active' : ''}`} key={`${step.label}-${idx}`}>
          <div className="order-timeline-icon"><i className={`bi ${step.icon}`} /></div>
          <div className="min-w-0">
            <div className="fw-bold small">{step.label}</div>
            <div className="text-secondary" style={{ fontSize: 11 }}>
              {step.time ? formatDateTime(step.time) : idx === active ? 'รอขั้นตอนนี้' : 'ยังไม่ถึงขั้นตอน'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function OrderMiniProgress({ stage }) {
  const meta = STAGE_META[stage] || STAGE_META.pending
  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
        <StageBadge stage={stage} />
        <span className="text-secondary" style={{ fontSize: 11 }}>{meta.progress}%</span>
      </div>
      <div className="order-progress">
        <div className={`order-progress-bar is-${meta.tone}`} style={{ width: `${meta.progress}%` }} />
      </div>
      <div className="text-secondary mt-1" style={{ fontSize: 11 }}>{meta.detail}</div>
    </div>
  )
}

export default function OrdersModule({ data }) {
  const [query, setQuery] = useState({ status: '', fulfillmentType: '', search: '', limit: 100, page: 1 })
  const [searchDraft, setSearchDraft] = useState('')
  const [localData, setLocalData] = useState(data)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => { setLocalData(data) }, [data])

  const groupedOrders = useMemo(() => groupOrders(localData?.items || []), [localData?.items])

  async function applyQuery(nextQuery) {
    setLoading(true)
    try {
      const result = await loadOrdersModule(nextQuery)
      setLocalData(result)
      if (selectedId && !result.items?.some((item) => item.id === selectedId)) {
        setSelectedId(null)
        setDetail(null)
      }
    } finally {
      setLoading(false)
    }
  }

  function patchQuery(obj, options = {}) {
    const next = { ...query, ...obj }
    if (options.resetPage !== false && !Object.prototype.hasOwnProperty.call(obj, 'page')) next.page = 1
    setQuery(next)
    void applyQuery(next)
  }

  async function openDetail(id) {
    if (selectedId === id) {
      setSelectedId(null)
      setDetail(null)
      return
    }
    setSelectedId(id)
    setDetailLoading(true)
    setDetail(null)
    try {
      const d = await loadOrderDetail(id)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }

  async function copyOrderRef(order) {
    const value = order?.ref || `#${order?.id}`
    const ok = await copyToClipboard(value)
    setNotice(ok ? `คัดลอก ${value} แล้ว` : 'คัดลอกไม่สำเร็จ')
    window.setTimeout(() => setNotice(''), 1800)
  }

  if (!localData) return null

  const items = groupedOrders
  const summary = localData.summary || {}
  const total = localData.total || 0
  const limit = Number(query.limit) || 100
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.min(Math.max(1, Number(query.page) || 1), totalPages)

  const statusTabs = [
    { val: '', label: 'ทั้งหมด', count: total },
    { val: 'pending', label: 'รอดำเนินการ', count: summary.pending },
    { val: 'completed', label: 'เสร็จสิ้น', count: summary.completed },
    { val: 'cancelled', label: 'ยกเลิก', count: summary.cancelled },
  ]

  const typeTabs = [
    { val: '', label: 'ทุกประเภท', icon: 'bi-grid' },
    { val: 'digital', label: 'ดิจิทัล', icon: 'bi-lightning-charge' },
    { val: 'farm_form', label: 'งานบริการ', icon: 'bi-truck' },
    { val: 'mystery_box', label: 'กล่องสุ่ม', icon: 'bi-gift' },
  ]

  const kpis = [
    { label: 'Order ทั้งหมด', val: total, icon: 'bi-receipt', tone: 'primary' },
    { label: 'รอลูกค้ารับ', val: summary.pending_claim, icon: 'bi-inbox', tone: 'info' },
    { label: 'รับแล้ว', val: summary.claimed, icon: 'bi-check2-circle', tone: 'success' },
    { label: 'งานรอมอบหมาย', val: summary.fr_pending, icon: 'bi-person-plus', tone: 'warning' },
    { label: 'งานกำลังทำ', val: summary.fr_in_progress, icon: 'bi-arrow-repeat', tone: 'primary' },
  ]

  return (
    <div className="admin-module admin-orders-module">
      {notice ? <div className="alert alert-info py-2 mb-3">{notice}</div> : null}

      <div className="row g-3 mb-3">
        {kpis.map((kpi) => (
          <div className="col-6 col-md-4 col-xl" key={kpi.label}>
            <div className="module-stat-card order-kpi-card">
              <div className={`order-kpi-icon text-bg-${kpi.tone}`}><i className={`bi ${kpi.icon}`} /></div>
              <div>
                <div className="fw-black fs-4 lh-1">{formatPoints(kpi.val)}</div>
                <div className="text-muted small mt-1">{kpi.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex flex-column gap-3">
            <div className="d-flex flex-wrap gap-2 align-items-center">
              {statusTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.val}
                  className={`admin-chip ${query.status === tab.val ? 'border-info text-info' : ''}`}
                  onClick={() => patchQuery({ status: tab.val })}
                >
                  {tab.label}
                  <span className="badge text-bg-light">{formatPoints(tab.count || 0)}</span>
                </button>
              ))}
            </div>

            <div className="d-flex flex-column flex-lg-row gap-2 align-items-lg-center">
              <div className="d-flex flex-wrap gap-2">
                {typeTabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.val}
                    className={`btn btn-sm ${query.fulfillmentType === tab.val ? 'btn-info' : 'btn-outline-secondary'}`}
                    onClick={() => patchQuery({ fulfillmentType: tab.val })}
                  >
                    <i className={`bi ${tab.icon} me-1`} />
                    {tab.label}
                  </button>
                ))}
              </div>

              <form className="d-flex gap-2 ms-lg-auto order-search-form" onSubmit={(e) => { e.preventDefault(); patchQuery({ search: searchDraft }) }}>
                <input
                  className="form-control form-control-sm"
                  placeholder="ค้นหา order, ref, email, สินค้า..."
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                />
                <button type="submit" className="btn btn-sm btn-primary"><i className="bi bi-search" /></button>
                {(searchDraft || query.search) ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setSearchDraft(''); patchQuery({ search: '' }) }}>
                    <i className="bi bi-x-lg" />
                  </button>
                ) : null}
              </form>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="module-empty"><span><span className="spinner-border spinner-border-sm me-2" />กำลังโหลด order...</span></div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="module-empty">ไม่พบออเดอร์ที่ตรงกับเงื่อนไข</div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="card">
          <div className="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
            <div>
              <div className="fw-bold">Order Tracking</div>
              <div className="text-secondary small">แสดง {items.length} รายการ จากทั้งหมด {formatPoints(total)} รายการ</div>
            </div>
            <div className="d-flex gap-2 align-items-center">
              <select className="form-select form-select-sm" value={query.limit} onChange={(e) => patchQuery({ limit: Number(e.target.value) })}>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <button className="btn btn-sm btn-outline-secondary" disabled={currentPage <= 1} onClick={() => patchQuery({ page: currentPage - 1 }, { resetPage: false })}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="small text-secondary">{currentPage}/{totalPages}</span>
              <button className="btn btn-sm btn-outline-secondary" disabled={currentPage >= totalPages} onClick={() => patchQuery({ page: currentPage + 1 }, { resetPage: false })}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>ลูกค้า</th>
                  <th>สินค้า</th>
                  <th>ประเภท</th>
                  <th>Tracking</th>
                  <th>ยอดรวม</th>
                  <th>เวลา</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => {
                  const isOpen = selectedId === order.id
                  const typeMeta = getTypeMeta(order.fulfillment_type)
                  const primaryProduct = order.productNames[0] || order.product_name || '-'
                  const moreProducts = Math.max(0, (order.productNames.length || 1) - 1)
                  return (
                    <Fragment key={order.id}>
                      <tr role="button" className={isOpen ? 'table-active' : ''} onClick={() => openDetail(order.id)}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <div className="fw-black">#{order.id}</div>
                            <button className="btn btn-sm btn-outline-secondary py-0 px-1" onClick={(e) => { e.stopPropagation(); void copyOrderRef(order) }} title="คัดลอก ref">
                              <i className="bi bi-copy" />
                            </button>
                          </div>
                          <div className="font-monospace text-secondary" style={{ fontSize: 11 }}>{order.ref || '-'}</div>
                          <StatusBadge status={order.status} map={ORDER_STATUS_MAP} />
                        </td>
                        <td>
                          <div className="fw-semibold small">{order.user_display_name || order.user_email || '-'}</div>
                          <div className="text-secondary" style={{ fontSize: 11 }}>{order.user_email || '-'}</div>
                        </td>
                        <td>
                          <div className="fw-bold small">{primaryProduct}{moreProducts ? ` +${moreProducts}` : ''}</div>
                          <div className="text-secondary" style={{ fontSize: 11 }}>{order.category_name || '-'}</div>
                          {order.optionLabels?.length ? <div className="text-info" style={{ fontSize: 11 }}>{order.optionLabels.join(', ')}</div> : null}
                        </td>
                        <td>
                          <span className="badge text-bg-dark">
                            <i className={`bi ${typeMeta.icon} me-1`} />
                            {typeMeta.label}
                          </span>
                        </td>
                        <td style={{ minWidth: 220 }}>
                          <OrderMiniProgress stage={order.stage} />
                        </td>
                        <td>
                          <div className="fw-black text-success">{formatPoints(order.total_points || Number(order.unit_price_points || 0) * Number(order.qty || 1))}</div>
                          <div className="text-secondary" style={{ fontSize: 11 }}>พอยท์</div>
                        </td>
                        <td>
                          <div className="small">{formatDateTime(order.created_at)}</div>
                          <div className="text-secondary" style={{ fontSize: 11 }}>{formatRelativeTime(order.created_at)}</div>
                        </td>
                        <td>
                          <button className="btn btn-sm btn-outline-primary" onClick={(e) => { e.stopPropagation(); openDetail(order.id) }}>
                            <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
                          </button>
                        </td>
                      </tr>

                      {isOpen ? (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <div className="order-detail-panel">
                              {detailLoading ? (
                                <div className="text-center text-secondary py-4"><span className="spinner-border spinner-border-sm me-2" />กำลังโหลดรายละเอียด...</div>
                              ) : null}

                              {!detailLoading && detail ? (
                                <div className="order-detail-grid">
                                  <div className="order-detail-card">
                                    <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                                      <div>
                                        <div className="text-secondary small">Order #{detail.order?.id}</div>
                                        <div className="h5 fw-black mb-1">{detail.order?.product_name || primaryProduct}</div>
                                        <div className="font-monospace text-secondary small">{detail.order?.ref}</div>
                                      </div>
                                      <StatusBadge status={detail.order?.status} map={ORDER_STATUS_MAP} />
                                    </div>
                                    <div className="order-info-list">
                                      <div><span>ลูกค้า</span><strong>{detail.order?.user_display_name || detail.order?.user_email}</strong></div>
                                      <div><span>Email</span><strong>{detail.order?.user_email || '-'}</strong></div>
                                      <div><span>จำนวน</span><strong>{formatPoints(detail.order?.qty || 1)}</strong></div>
                                      <div><span>ยอดรวม</span><strong className="text-success">{formatPoints(detail.order?.total_points)} pt</strong></div>
                                      <div><span>ประเภท</span><strong>{getTypeMeta(detail.order?.fulfillment_type).label}</strong></div>
                                      <div><span>สร้างเมื่อ</span><strong>{formatDateTime(detail.order?.created_at)}</strong></div>
                                    </div>
                                  </div>

                                  <div className="order-detail-card">
                                    <div className="d-flex justify-content-between align-items-center mb-3">
                                      <div>
                                        <div className="fw-black">Delivery Timeline</div>
                                        <div className="text-secondary small">{detail.deliveries?.length || 0} รายการจัดส่ง/งานบริการ</div>
                                      </div>
                                      <button className="btn btn-sm btn-outline-secondary" onClick={() => copyOrderRef(detail.order)}>
                                        <i className="bi bi-copy me-1" />คัดลอก Ref
                                      </button>
                                    </div>

                                    <div className="vstack gap-3">
                                      {(detail.deliveries || []).map((delivery, idx) => (
                                        <div className="order-delivery-card" key={delivery.id}>
                                          <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
                                            <div>
                                              <div className="fw-black">
                                                {detail.deliveries.length > 1 ? `รายการที่ ${idx + 1}: ` : ''}
                                                {delivery.delivery_name || detail.order?.product_name}
                                              </div>
                                              <div className="text-secondary small">Delivery #{delivery.id}</div>
                                            </div>
                                            <div className="d-flex flex-wrap gap-1 align-items-start">
                                              <StatusBadge status={delivery.status} map={DELIVERY_STATUS_MAP} />
                                              {delivery.farm_status ? <StatusBadge status={delivery.farm_status} map={FARM_STATUS_MAP} /> : null}
                                            </div>
                                          </div>

                                          <div className="row g-3">
                                            <div className="col-lg-7">
                                              <Timeline delivery={delivery} />
                                            </div>
                                            <div className="col-lg-5">
                                              <div className="order-info-list compact">
                                                <div><span>ผู้รับผิดชอบ</span><strong>{delivery.assigned_staff_name || 'ยังไม่มอบหมาย'}</strong></div>
                                                <div><span>Farm ID</span><strong>{delivery.farm_request_id ? `#${delivery.farm_request_id}` : '-'}</strong></div>
                                                <div><span>เริ่มงาน</span><strong>{delivery.started_at ? formatDateTime(delivery.started_at) : '-'}</strong></div>
                                                <div><span>ส่งมอบ</span><strong>{delivery.fulfilled_at ? formatDateTime(delivery.fulfilled_at) : '-'}</strong></div>
                                                <div><span>รับสินค้า</span><strong>{delivery.claimed_at ? formatDateTime(delivery.claimed_at) : '-'}</strong></div>
                                              </div>
                                              {delivery.payload_masked ? (
                                                <div className="mt-2 rounded border bg-light p-2 small">
                                                  <div className="text-secondary mb-1">Payload ที่ส่งให้ลูกค้า</div>
                                                  <pre className="mb-0 small text-wrap">{delivery.payload_masked}</pre>
                                                </div>
                                              ) : null}
                                              {delivery.farm_request_id ? (
                                                <a className="btn btn-sm btn-outline-primary mt-2" href={`/admin-v3?module=fulfillment&id=${delivery.farm_request_id}`}>
                                                  <i className="bi bi-arrow-right-circle me-1" />เปิดใน Fulfillment
                                                </a>
                                              ) : null}
                                            </div>
                                          </div>
                                        </div>
                                      ))}

                                      {(!detail.deliveries || detail.deliveries.length === 0) ? (
                                        <div className="module-empty">ยังไม่มี Delivery สำหรับออเดอร์นี้</div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
