import { Fragment, useEffect, useMemo, useState } from 'react'
import { copyToClipboard } from '../../../api.js'
import { formatDateTime, formatRelativeTime } from '../helpers.js'
import { loadOrdersModule, loadOrderDetail } from '../loaders.js'

const ORDER_STATUS_MAP = {
  pending: { label: 'รอดำเนินการ', tone: 'warn' },
  completed: { label: 'เสร็จสิ้น', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
}

const DELIVERY_STATUS_MAP = {
  pending_fulfillment: { label: 'รอเตรียมสินค้า', tone: 'warn' },
  pending_claim: { label: 'รอลูกค้ารับ', tone: 'accent' },
  claimed: { label: 'รับแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
}

const FARM_STATUS_MAP = {
  pending: { label: 'รอมอบหมาย', tone: 'warn' },
  in_progress: { label: 'กำลังดำเนินการ', tone: 'accent' },
  fulfilled: { label: 'งานเสร็จแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
}

const FULFILLMENT_TYPE_MAP = {
  digital: { label: 'ดิจิทัล', icon: 'bi-lightning-charge-fill' },
  farm_form: { label: 'งานบริการ', icon: 'bi-truck' },
  mystery_box: { label: 'กล่องสุ่ม', icon: 'bi-gift-fill' },
}

const STAGE_META = {
  cancelled: { label: 'ยกเลิก', detail: 'ออเดอร์หรือรายการถูกยกเลิก', tone: 'neutral', progress: 100, icon: 'bi-x-circle-fill' },
  needs_assign: { label: 'ต้องมอบหมาย', detail: 'งานบริการยังไม่มีคนรับผิดชอบ', tone: 'warn', progress: 30, icon: 'bi-person-plus-fill' },
  in_progress: { label: 'กำลังทำงาน', detail: 'ทีมกำลังดำเนินการรายการนี้', tone: 'accent', progress: 60, icon: 'bi-arrow-repeat' },
  preparing: { label: 'เตรียมสินค้า', detail: 'ระบบกำลังเตรียมของให้ลูกค้า', tone: 'warn', progress: 40, icon: 'bi-box-seam-fill' },
  ready: { label: 'รอลูกค้ารับ', detail: 'สินค้าเข้ากล่องรับของแล้ว', tone: 'accent', progress: 80, icon: 'bi-inbox-fill' },
  claimed: { label: 'รับแล้ว', detail: 'ลูกค้ากดรับสินค้าแล้ว', tone: 'ok', progress: 100, icon: 'bi-check2-circle' },
  completed: { label: 'เสร็จสิ้น', detail: 'ออเดอร์เสร็จสมบูรณ์', tone: 'ok', progress: 100, icon: 'bi-check-circle-fill' },
  pending: { label: 'รอดำเนินการ', detail: 'กำลังรอขั้นตอนถัดไป', tone: 'warn', progress: 20, icon: 'bi-clock-fill' },
}

const STAGE_OPTIONS = [
  { value: '', label: 'ทั้งหมดทุกขั้นตอน' },
  { value: 'preparing', label: 'รอเตรียมสินค้า' },
  { value: 'ready', label: 'รอลูกค้ารับของ' },
  { value: 'claimed', label: 'รับสินค้าแล้ว' },
  { value: 'needs_assign', label: 'งานรอมอบหมาย' },
  { value: 'in_progress', label: 'กำลังดำเนินการ' },
  { value: 'completed', label: 'เสร็จสิ้น' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'ล่าสุด' },
  { value: 'oldest', label: 'เก่าที่สุด' },
  { value: 'points_desc', label: 'ยอดพอยท์สูงสุด' },
  { value: 'points_asc', label: 'ยอดพอยท์ต่ำสุด' },
]

function pillTone(map, status) {
  return (map[status] || {}).tone || 'neutral'
}

function StatusPill({ status, map }) {
  const meta = map[status] || { label: status || '-', tone: 'neutral' }
  return <span className={`lgx-pill ${meta.tone === 'accent' ? '' : meta.tone}`} style={meta.tone === 'accent' ? { background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' } : undefined}>{meta.label}</span>
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
  return FULFILLMENT_TYPE_MAP[String(type || '')] || { label: type || 'ทั่วไป', icon: 'bi-box-seam' }
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
        productImages: [],
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
      if (row.product_image_url) order.productImages.push(row.product_image_url)
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
      { icon: 'bi-receipt-cutoff', label: 'สร้างออเดอร์', time: delivery.created_at, done: true },
      { icon: 'bi-box-seam', label: 'เตรียมสินค้า', time: delivery.created_at, done: !['pending_fulfillment', 'cancelled'].includes(delivery.status) },
      { icon: 'bi-inbox', label: 'เข้ากล่องรับของ', time: delivery.status === 'pending_claim' || delivery.status === 'claimed' ? delivery.created_at : null, done: delivery.status === 'pending_claim' || delivery.status === 'claimed' },
      { icon: 'bi-check2-circle', label: 'ลูกค้ารับแล้ว', time: delivery.claimed_at, done: delivery.status === 'claimed' },
    ]
  }
  return [
    { icon: 'bi-receipt-cutoff', label: 'สร้างงานบริการ', time: delivery.farm_created_at || delivery.created_at, done: true },
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
      <div className="lgx-banner crit">
        <span><i className="bi bi-x-circle-fill" style={{ marginRight: 6 }} /><strong>รายการนี้ถูกยกเลิก</strong>{delivery.cancel_note ? ` — ${delivery.cancel_note}` : ''}</span>
      </div>
    )
  }
  return (
    <div className="lgx-timeline">
      {steps.map((step, idx) => {
        const isDone = step.done
        const isActive = idx === active
        return (
          <div className={`lgx-timeline-step${isDone ? ' is-done' : isActive ? ' is-active' : ''}`} key={`${step.label}-${idx}`}>
            <div className="lgx-timeline-dot">{isDone ? <i className="bi bi-check-lg" /> : <i className={`bi ${step.icon}`} style={{ fontSize: 10 }} />}</div>
            <div className="lgx-timeline-body">
              <span className="lgx-timeline-label">{step.label}</span>
              <span className="lgx-timeline-time">{step.time ? formatDateTime(step.time) : isActive ? 'กำลังดำเนินการขั้นตอนนี้' : 'รอดำเนินการ'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OrderMiniProgress({ stage }) {
  const meta = STAGE_META[stage] || STAGE_META.pending
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span className={`lgx-pill ${meta.tone}`}>{meta.label}</span>
        <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)', fontFamily: 'var(--lgx-mono)' }}>{meta.progress}%</span>
      </div>
      <div className="lgx-progress-track"><div className={`lgx-progress-bar ${meta.tone}`} style={{ width: `${meta.progress}%` }} /></div>
      <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)', marginTop: 4 }} title={meta.detail}>{meta.detail}</div>
    </div>
  )
}

function OrderDetailPanel({ order, detail, loading, onCopy, showPayloadMap, setShowPayloadMap }) {
  if (loading) {
    return <div className="lgx-empty"><i className="bi bi-hourglass-split" style={{ marginRight: 6 }} />กำลังโหลดรายละเอียดออเดอร์ #{order.id}...</div>
  }
  if (!detail) return null

  return (
    <div className="lgx-detail-grid">
      <div className="lgx-panel">
        <div className="lgx-panel-head">
          <h2>ข้อมูลคำสั่งซื้อ</h2>
          <StatusPill status={detail.order?.status} map={ORDER_STATUS_MAP} />
        </div>
        <div className="lgx-panel-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            {detail.order?.product_image_url ? (
              <img src={detail.order.product_image_url} alt="" className="lgx-thumb" style={{ width: 56, height: 56 }} />
            ) : (
              <div className="lgx-thumb-empty" style={{ width: 56, height: 56 }}><i className="bi bi-box-seam" /></div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{detail.order?.product_name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)' }}>{detail.order?.category_name}</div>
              {detail.order?.product_option ? <span className="lgx-pill neutral" style={{ marginTop: 4 }}>{getOptionLabel(detail.order.product_option)}</span> : null}
            </div>
          </div>
          <div className="lgx-kv"><span className="k">Order ID</span><span className="v">#{detail.order?.id}</span></div>
          <div className="lgx-kv">
            <span className="k">Ref Code</span>
            <span className="v" style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--lgx-mono)' }}>
              {detail.order?.ref || '-'}
              <button type="button" className="lgx-icon-action" style={{ width: 22, height: 22 }} onClick={() => onCopy(detail.order?.ref, 'รหัส Ref')} title="คัดลอก Ref"><i className="bi bi-copy" style={{ fontSize: 11 }} /></button>
            </span>
          </div>
          <div className="lgx-kv"><span className="k">ลูกค้า</span><span className="v">{detail.order?.user_display_name || detail.order?.user_email}</span></div>
          <div className="lgx-kv"><span className="k">Email</span><span className="v">{detail.order?.user_email || '-'}</span></div>
          <div className="lgx-kv"><span className="k">จำนวนชิ้น</span><span className="v">{formatPoints(detail.order?.qty || 1)} ชิ้น</span></div>
          <div className="lgx-kv"><span className="k">ยอดชำระ</span><span className="v" style={{ color: 'var(--lgx-ok)' }}>{formatPoints(detail.order?.total_points)} พอยท์</span></div>
          <div className="lgx-kv"><span className="k">วันที่สั่งซื้อ</span><span className="v">{formatDateTime(detail.order?.created_at)}</span></div>
        </div>
      </div>

      <div className="lgx-panel">
        <div className="lgx-panel-head">
          <h2>การจัดส่ง & สถานะการส่งมอบ</h2>
          <span>{detail.deliveries?.length || 0} รายการ</span>
        </div>
        <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(detail.deliveries || []).map((delivery, idx) => {
            const isPayloadVisible = showPayloadMap[delivery.id]
            return (
              <div key={delivery.id} style={{ border: '1.5px solid var(--lgx-border)', borderRadius: 'var(--lgx-radius)', padding: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--lgx-border)' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{detail.deliveries.length > 1 ? `รายการที่ ${idx + 1}: ` : ''}{delivery.delivery_name || detail.order?.product_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>Delivery #{delivery.id}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <StatusPill status={delivery.status} map={DELIVERY_STATUS_MAP} />
                    {delivery.farm_status ? <StatusPill status={delivery.farm_status} map={FARM_STATUS_MAP} /> : null}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
                  <Timeline delivery={delivery} />
                  <div>
                    <div style={{ background: 'var(--lgx-surface-alt)', borderRadius: 'var(--lgx-radius)', padding: 10 }}>
                      <div className="lgx-kv"><span className="k">ผู้รับผิดชอบ</span><span className="v">{delivery.assigned_staff_name || 'ยังไม่มอบหมาย'}</span></div>
                      {delivery.farm_request_id ? <div className="lgx-kv"><span className="k">Farm Request</span><span className="v">#{delivery.farm_request_id}</span></div> : null}
                      {delivery.claimed_at ? <div className="lgx-kv"><span className="k">รับของเมื่อ</span><span className="v" style={{ color: 'var(--lgx-ok)' }}>{formatDateTime(delivery.claimed_at)}</span></div> : null}
                    </div>

                    {delivery.payload_masked ? (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--lgx-text-muted)' }}><i className="bi bi-key-fill" style={{ marginRight: 4 }} />ข้อมูลสินค้า/รหัส</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" className="lgx-icon-action" style={{ width: 22, height: 22 }} onClick={() => setShowPayloadMap((prev) => ({ ...prev, [delivery.id]: !prev[delivery.id] }))} title={isPayloadVisible ? 'ซ่อน' : 'แสดง'}><i className={`bi ${isPayloadVisible ? 'bi-eye-slash' : 'bi-eye'}`} style={{ fontSize: 11 }} /></button>
                            <button type="button" className="lgx-icon-action" style={{ width: 22, height: 22 }} onClick={() => onCopy(delivery.payload_masked, 'Payload')} title="คัดลอก Payload"><i className="bi bi-copy" style={{ fontSize: 11 }} /></button>
                          </div>
                        </div>
                        <pre className="lgx-code-block" style={{ margin: 0, filter: isPayloadVisible ? 'none' : 'blur(4px)', userSelect: isPayloadVisible ? 'text' : 'none' }}>{delivery.payload_masked}</pre>
                      </div>
                    ) : null}

                    {delivery.farm_request_id ? (
                      <a className="lgx-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} href={`/admin-v3?module=fulfillment&id=${delivery.farm_request_id}`}>
                        <i className="bi bi-arrow-right-circle" />เปิดดูในโมดูล Fulfillment
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
          {(!detail.deliveries || detail.deliveries.length === 0) ? <div className="lgx-empty">ยังไม่มีรายการจัดส่งสำหรับออเดอร์นี้</div> : null}
        </div>
      </div>
    </div>
  )
}

export default function OrdersModule({ data }) {
  const [query, setQuery] = useState({ status: '', fulfillmentType: '', stageFilter: '', search: '', limit: 50, page: 1, sort: 'newest' })
  const [searchDraft, setSearchDraft] = useState('')
  const [localData, setLocalData] = useState(data)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [showPayloadMap, setShowPayloadMap] = useState({})

  useEffect(() => { setLocalData(data) }, [data])

  const groupedOrders = useMemo(() => {
    let list = groupOrders(localData?.items || [])
    if (query.stageFilter) list = list.filter((o) => o.stage === query.stageFilter)
    if (query.sort === 'oldest') list.sort((a, b) => a.id - b.id)
    else if (query.sort === 'points_desc') list.sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0))
    else if (query.sort === 'points_asc') list.sort((a, b) => Number(a.total_points || 0) - Number(b.total_points || 0))
    else list.sort((a, b) => b.id - a.id)
    return list
  }, [localData?.items, query.stageFilter, query.sort])

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

  async function copyText(text, label = 'ข้อความ') {
    const ok = await copyToClipboard(text)
    setNotice(ok ? `คัดลอก${label}เรียบร้อยแล้ว` : 'คัดลอกไม่สำเร็จ')
    window.setTimeout(() => setNotice(''), 2200)
  }

  function exportOrdersCsv() {
    if (!groupedOrders.length) {
      setNotice('ไม่มีข้อมูลคำสั่งซื้อที่จะส่งออก')
      window.setTimeout(() => setNotice(''), 2200)
      return
    }
    const headers = ['Order ID', 'Ref', 'วันที่สั่งซื้อ', 'ลูกค้า', 'Email', 'สินค้า', 'ตัวเลือก (Option)', 'ประเภท', 'สถานะ Order', 'Stage', 'ยอดพอยท์ (Points)']
    const rows = groupedOrders.map((o) => [
      `#${o.id}`, o.ref || '', formatDateTime(o.created_at), o.user_display_name || o.user_email || '', o.user_email || '',
      o.productNames.join('; '), o.optionLabels.join('; '), getTypeMeta(o.fulfillment_type).label,
      ORDER_STATUS_MAP[o.status]?.label || o.status, STAGE_META[o.stage]?.label || o.stage, o.total_points || 0,
    ])
    const csvContent = '﻿' + [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `orders_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (!localData) return null

  const items = groupedOrders
  const summary = localData.summary || {}
  const total = localData.total || 0
  const limit = Number(query.limit) || 50
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.min(Math.max(1, Number(query.page) || 1), totalPages)

  const statusTabs = [
    { val: '', label: 'ทั้งหมด', count: total },
    { val: 'pending', label: 'รอดำเนินการ', count: summary.pending },
    { val: 'completed', label: 'เสร็จสิ้น', count: summary.completed },
    { val: 'cancelled', label: 'ยกเลิก', count: summary.cancelled },
  ]

  const typeTabs = [
    { val: '', label: 'ทุกประเภท', icon: 'bi-grid-fill' },
    { val: 'digital', label: 'ดิจิทัล', icon: 'bi-lightning-charge-fill' },
    { val: 'farm_form', label: 'งานบริการ', icon: 'bi-truck' },
    { val: 'mystery_box', label: 'กล่องสุ่ม', icon: 'bi-gift-fill' },
  ]

  const kpis = [
    { label: 'คำสั่งซื้อทั้งหมด', val: total, desc: 'รายการสะสมในระบบ' },
    { label: 'รอลูกค้ารับ', val: summary.pending_claim, tone: 'warn', desc: 'เข้ากล่องรอเปิดรับ' },
    { label: 'รับสินค้าแล้ว', val: summary.claimed, desc: 'ลูกค้าเปิดรับเรียบร้อย' },
    { label: 'งานรอมอบหมาย', val: summary.fr_pending, tone: 'warn', desc: 'คิวงานรอ assign' },
    { label: 'งานกำลังทำ', val: summary.fr_in_progress, desc: 'อยู่ระหว่างดำเนินการ' },
  ]

  return (
    <>
      {notice ? (
        <div className="lgx-toast">
          <i className="bi bi-info-circle-fill" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>×</button>
        </div>
      ) : null}

      <div className="lgx-strip">
        {kpis.map((kpi) => (
          <div className="lgx-stat" key={kpi.label}>
            <div className="l">{kpi.label}</div>
            <div className={`v${kpi.tone ? ` ${kpi.tone}` : ''}`}>{formatPoints(kpi.val)}</div>
            <div className="d">{kpi.desc}</div>
          </div>
        ))}
      </div>

      <div className="lgx-panel">
        <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
            <div className="lgx-segmented">
              <span className="lgx-segmented-label">สถานะ</span>
              {statusTabs.map((tab) => (
                <button key={tab.val} type="button" className={`lgx-segmented-btn${query.status === tab.val ? ' is-active' : ''}`} onClick={() => patchQuery({ status: tab.val })}>
                  {tab.label}<span className="count">{formatPoints(tab.count || 0)}</span>
                </button>
              ))}
            </div>
            <div className="lgx-segmented">
              <span className="lgx-segmented-label">ประเภท</span>
              {typeTabs.map((tab) => (
                <button key={tab.val} type="button" className={`lgx-segmented-btn${query.fulfillmentType === tab.val ? ' is-active' : ''}`} onClick={() => patchQuery({ fulfillmentType: tab.val })}>
                  <i className={`bi ${tab.icon}`} />{tab.label}
                </button>
              ))}
            </div>
            <button type="button" className="lgx-btn" onClick={exportOrdersCsv} title="ส่งออกเป็น CSV">
              <i className="bi bi-file-earmark-spreadsheet" />Export CSV
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', borderTop: '1.5px solid var(--lgx-border)', paddingTop: 12 }}>
            <form style={{ display: 'flex', gap: 6, flex: '1 1 260px', maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); patchQuery({ search: searchDraft }) }}>
              <input className="lgx-input" placeholder="ค้นหา Order ID, Ref, Email, สินค้า, ลูกค้า..." value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
              <button type="submit" className="lgx-btn lgx-btn-accent">ค้นหา</button>
              {searchDraft || query.search ? (
                <button type="button" className="lgx-icon-action" onClick={() => { setSearchDraft(''); patchQuery({ search: '' }) }} title="ล้างคำค้นหา"><i className="bi bi-x-lg" /></button>
              ) : null}
            </form>
            <select className="lgx-select" style={{ width: 'auto', minWidth: 150 }} value={query.stageFilter} onChange={(e) => patchQuery({ stageFilter: e.target.value })}>
              {STAGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <select className="lgx-select" style={{ width: 'auto', minWidth: 140 }} value={query.sort} onChange={(e) => patchQuery({ sort: e.target.value })}>
              {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>เรียง: {opt.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? <div className="lgx-empty"><i className="bi bi-hourglass-split" style={{ marginRight: 6 }} />กำลังโหลดรายการคำสั่งซื้อ...</div> : null}

      {!loading && items.length === 0 ? (
        <div className="lgx-panel">
          <div className="lgx-empty">
            <i className="bi bi-inbox" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />
            <div style={{ fontWeight: 700, color: 'var(--lgx-text)' }}>ไม่พบคำสั่งซื้อที่ตรงกับเงื่อนไข</div>
            <div style={{ margin: '4px 0 12px' }}>ลองปรับเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองสถานะด้านบน</div>
            <button type="button" className="lgx-btn" onClick={() => { setSearchDraft(''); patchQuery({ status: '', fulfillmentType: '', stageFilter: '', search: '', sort: 'newest' }) }}>
              <i className="bi bi-arrow-clockwise" />รีเซ็ตตัวกรองทั้งหมด
            </button>
          </div>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="lgx-panel">
          <div className="lgx-panel-head">
            <h2>รายการคำสั่งซื้อ</h2>
            <span>{items.length} จาก {formatPoints(total)} รายการ &middot; หน้า {currentPage}/{totalPages}</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="lgx-table">
              <thead>
                <tr>
                  <th>Order &amp; Ref</th>
                  <th>ลูกค้า</th>
                  <th>สินค้า &amp; ตัวเลือก</th>
                  <th>ประเภท</th>
                  <th>Tracking &amp; Stage</th>
                  <th className="num">ยอดรวม</th>
                  <th>เวลาที่สั่งซื้อ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((order) => {
                  const isOpen = selectedId === order.id
                  const typeMeta = getTypeMeta(order.fulfillment_type)
                  const primaryProduct = order.productNames[0] || order.product_name || 'สินค้า'
                  const moreProducts = Math.max(0, (order.productNames.length || 1) - 1)
                  const thumbUrl = order.productImages[0] || order.product_image_url

                  return (
                    <Fragment key={order.id}>
                      <tr className={pillTone(ORDER_STATUS_MAP, order.status) === 'ok' ? 'st-ok' : pillTone(ORDER_STATUS_MAP, order.status) === 'warn' ? 'st-warn' : ''} style={{ cursor: 'pointer', background: isOpen ? 'var(--lgx-accent-soft)' : undefined }} onClick={() => openDetail(order.id)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontWeight: 800 }}>#{order.id}</span>
                            <button type="button" className="lgx-icon-action" style={{ width: 22, height: 22 }} onClick={(e) => { e.stopPropagation(); void copyText(order.ref || `#${order.id}`, 'รหัส Ref') }} title="คัดลอก Ref"><i className="bi bi-copy" style={{ fontSize: 10.5 }} /></button>
                          </div>
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)', marginBottom: 4 }}>{order.ref || '-'}</div>
                          <StatusPill status={order.status} map={ORDER_STATUS_MAP} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="lgx-avatar" style={{ width: 32, height: 32 }}>{(order.user_display_name || order.user_email || 'U').charAt(0).toUpperCase()}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{order.user_display_name || order.user_email || '-'}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{order.user_email || '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {thumbUrl ? <img src={thumbUrl} alt="" className="lgx-thumb" /> : <div className="lgx-thumb-empty"><i className="bi bi-box-seam" /></div>}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }} title={primaryProduct}>
                                {primaryProduct}{moreProducts ? <span className="lgx-pill neutral" style={{ marginLeft: 5 }}>+{moreProducts}</span> : null}
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{order.category_name || 'หมวดหมู่ทั่วไป'}</div>
                              {order.optionLabels?.length ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                                  {order.optionLabels.map((lbl, i) => <span key={i} className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>{lbl}</span>)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td><span className="lgx-pill neutral"><i className={`bi ${typeMeta.icon}`} style={{ marginRight: 4 }} />{typeMeta.label}</span></td>
                        <td style={{ minWidth: 170 }}><OrderMiniProgress stage={order.stage} /></td>
                        <td className="num" style={{ fontWeight: 700, color: 'var(--lgx-ok)' }}>{formatPoints(order.total_points || Number(order.unit_price_points || 0) * Number(order.qty || 1))}</td>
                        <td>
                          <div className="mono" style={{ fontSize: 12 }}>{formatDateTime(order.created_at)}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{formatRelativeTime(order.created_at)}</div>
                        </td>
                        <td>
                          <button type="button" className="lgx-icon-action" onClick={(e) => { e.stopPropagation(); openDetail(order.id) }} title={isOpen ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}>
                            <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
                          </button>
                        </td>
                      </tr>

                      {isOpen ? (
                        <tr className="lgx-row-expand">
                          <td colSpan={8}>
                            <div className="lgx-row-expand-inner">
                              <OrderDetailPanel order={order} detail={detail} loading={detailLoading} onCopy={copyText} showPayloadMap={showPayloadMap} setShowPayloadMap={setShowPayloadMap} />
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

          <div className="lgx-panel-head" style={{ borderTop: '1.5px solid var(--lgx-border)', borderBottom: 'none' }}>
            <span>แสดงหน้า {currentPage} จาก {totalPages} หน้า (รวม {formatPoints(total)} รายการ)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select className="lgx-select" style={{ width: 80 }} value={query.limit} onChange={(e) => patchQuery({ limit: Number(e.target.value) })}>
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}/หน้า</option>)}
              </select>
              <div className="lgx-btn-group">
                <button type="button" className="lgx-icon-action" disabled={currentPage <= 1} onClick={() => patchQuery({ page: 1 }, { resetPage: false })} title="หน้าแรก"><i className="bi bi-chevron-double-left" /></button>
                <button type="button" className="lgx-icon-action" disabled={currentPage <= 1} onClick={() => patchQuery({ page: currentPage - 1 }, { resetPage: false })} title="ก่อนหน้า"><i className="bi bi-chevron-left" /></button>
                <button type="button" className="lgx-icon-action" disabled={currentPage >= totalPages} onClick={() => patchQuery({ page: currentPage + 1 }, { resetPage: false })} title="ถัดไป"><i className="bi bi-chevron-right" /></button>
                <button type="button" className="lgx-icon-action" disabled={currentPage >= totalPages} onClick={() => patchQuery({ page: totalPages }, { resetPage: false })} title="หน้าสุดท้าย"><i className="bi bi-chevron-double-right" /></button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
