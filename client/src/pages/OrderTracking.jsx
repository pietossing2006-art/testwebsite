import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchJson, setAuthToken } from '../api.js'

function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString()
}

function formatDate(value) {
  if (!value) return null
  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusMeta(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'claimed') return { text: 'รับแล้ว', cls: 'bg-emerald-500/10 text-emerald-200' }
  if (value === 'fulfilled' || value === 'pending_claim') return { text: 'พร้อมรับ', cls: 'bg-cyan-500/10 text-cyan-100' }
  if (value === 'in_progress') return { text: 'กำลังดำเนินการ', cls: 'bg-blue-500/10 text-blue-200' }
  if (value === 'cancelled' || value === 'canceled') return { text: 'ยกเลิก', cls: 'bg-red-500/10 text-red-200' }
  if (value === 'pending' || value === 'pending_fulfillment') return { text: 'รอดำเนินการ', cls: 'bg-amber-500/10 text-amber-200' }
  if (value === 'paid' || value === 'completed') return { text: 'สำเร็จ', cls: 'bg-emerald-500/10 text-emerald-200' }
  return { text: value || 'รายการ', cls: 'bg-white/[0.06] text-white/58' }
}

function StatusBadge({ status }) {
  const meta = statusMeta(status)
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${meta.cls}`}>{meta.text}</span>
}

function buildTimeline(delivery) {
  const isFarm = Boolean(delivery.farm_request_id)
  const deliveryStatus = String(delivery.status || '')
  const farmStatus = String(delivery.farm_status || '')
  const cancelled = deliveryStatus === 'cancelled' || farmStatus === 'cancelled' || farmStatus === 'canceled'

  if (cancelled) {
    return [
      { label: 'สั่งซื้อสำเร็จ', time: delivery.farm_created_at || delivery.created_at, done: true },
      { label: 'รายการถูกยกเลิก', time: delivery.farm_cancelled_at, done: true, danger: true },
    ]
  }

  if (!isFarm) {
    return [
      { label: 'สั่งซื้อสำเร็จ', time: delivery.created_at, done: true },
      { label: 'เตรียมสินค้า', time: delivery.created_at, done: deliveryStatus !== 'pending_fulfillment' },
      { label: 'พร้อมรับสินค้า', time: deliveryStatus === 'pending_claim' || deliveryStatus === 'claimed' ? delivery.created_at : null, done: deliveryStatus === 'pending_claim' || deliveryStatus === 'claimed' },
      { label: 'รับสินค้าแล้ว', time: delivery.claimed_at, done: deliveryStatus === 'claimed' },
    ]
  }

  return [
    { label: 'สั่งซื้อสำเร็จ', time: delivery.farm_created_at || delivery.created_at, done: true },
    { label: 'รอมอบหมายเจ้าหน้าที่', time: delivery.farm_created_at, done: Boolean(delivery.farm_assigned_at || delivery.farm_started_at || delivery.farm_fulfilled_at) },
    { label: 'เจ้าหน้าที่รับงาน', time: delivery.farm_assigned_at, done: Boolean(delivery.farm_assigned_at || delivery.farm_started_at || delivery.farm_fulfilled_at) },
    { label: 'กำลังดำเนินการ', time: delivery.farm_started_at, done: Boolean(delivery.farm_started_at || delivery.farm_fulfilled_at) },
    { label: 'เสร็จแล้ว รอรับสินค้า', time: delivery.farm_fulfilled_at, done: Boolean(delivery.farm_fulfilled_at) },
    { label: 'รับสินค้าแล้ว', time: delivery.claimed_at, done: deliveryStatus === 'claimed' },
  ]
}

function activeIndex(steps) {
  let lastDone = 0
  steps.forEach((step, index) => {
    if (step.done) lastDone = index
  })
  return Math.min(lastDone + 1, steps.length - 1)
}

function TimelineStep({ step, index, active, last }) {
  const doneClass = step.danger
    ? 'border-red-300/45 bg-red-500/10 text-red-100'
    : step.done
      ? 'border-emerald-300/45 bg-emerald-500/10 text-emerald-100'
      : active
        ? 'border-cyan-300/45 bg-cyan-500/10 text-cyan-100'
        : 'border-white/[0.08] bg-white/[0.035] text-white/40'
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <div className={`grid h-10 w-10 place-items-center rounded-full border text-sm font-black ${doneClass}`}>{index + 1}</div>
        {!last ? <div className={`mt-1 min-h-8 w-px flex-1 rounded-full ${step.done ? 'bg-emerald-300/30' : 'bg-white/[0.08]'}`} /> : null}
      </div>
      <div className="pb-5 pt-1">
        <div className={`text-sm font-black ${step.done ? 'text-white' : active ? 'text-cyan-100' : 'text-white/40'}`}>{step.label}</div>
        {step.time ? <div className="mt-1 text-xs text-white/42">{formatDate(step.time)}</div> : null}
      </div>
    </div>
  )
}

export default function OrderTracking() {
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetchJson(`/api/me/orders/${id}`)
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled && err?.status === 401) {
          setAuthToken(null)
          nav('/login', { replace: true })
          return
        }
        if (!cancelled && err?.status === 404) {
          setError('not_found')
          return
        }
        if (!cancelled) setError(String(err?.message ?? 'load_failed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [id, nav])

  const order = data?.order
  const deliveries = useMemo(() => (Array.isArray(data?.deliveries) ? data.deliveries : []), [data])
  const totalPoints = order ? Number(order.unit_price_points ?? 0) * Number(order.qty ?? 0) : 0

  return (
    <div className="space-y-7 fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong p-5 sm:p-7">
        <div className="absolute inset-0 scanline opacity-35" />
        <div className="absolute inset-0 grid-pattern opacity-35" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/[0.08] blur-[90px]" />
        <div className="motion-stagger relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to="/history/purchases" className="text-xs font-black text-cyan-200/80 hover:text-cyan-100">กลับประวัติการซื้อ</Link>
            <h1 className="mt-2 text-4xl font-black text-white">ติดตามคำสั่งซื้อ</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
              {order ? `รายการ ${order.ref || `#${order.id}`} อัปเดตสถานะอัตโนมัติทุก 30 วินาที` : 'กำลังโหลดรายละเอียดคำสั่งซื้อ'}
            </p>
          </div>
          {order ? (
            <div className="motion-card rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
              <div className="motion-price text-2xl font-black text-emerald-300">{fmt(totalPoints)}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">พ้อยท์</div>
            </div>
          ) : null}
        </div>
      </section>

      {loading && !data ? (
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-white/[0.08] bg-white/[0.025] text-sm font-bold text-white/55">กำลังโหลดคำสั่งซื้อ...</div>
      ) : null}

      {error === 'not_found' ? (
        <div className="grid min-h-[300px] place-items-center rounded-3xl border border-white/[0.08] bg-white/[0.025] p-8 text-center">
          <div>
            <div className="text-lg font-black text-white">ไม่พบคำสั่งซื้อนี้</div>
            <Link to="/history/purchases" className="ui-btn-primary mt-5 inline-flex h-11 items-center px-5 text-sm font-black">กลับไปประวัติการซื้อ</Link>
          </div>
        </div>
      ) : null}

      {error && error !== 'not_found' ? (
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4 text-sm font-bold text-cyan-100">โหลดไม่สำเร็จ: {error}</div>
      ) : null}

      {order ? (
        <>
          <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/[0.06] bg-black/25">
                {order.product_image_url ? <img src={order.product_image_url} alt={order.product_name} className="h-full w-full object-cover" /> : <span className="text-xs font-black text-white/35">ITEM</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-xl font-black text-white">{order.product_name}</div>
                  <StatusBadge status={order.status} />
                  {order.category_name ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-white/45">{order.category_name}</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/42">
                  <span className="font-mono">{order.ref || `#${order.id}`}</span>
                  <span>จำนวน {order.qty}</span>
                  <span>{formatDate(order.created_at)}</span>
                </div>
                {order.product_option?.label ? <div className="mt-2 text-xs font-bold text-cyan-200/80">ตัวเลือก: {order.product_option.label}</div> : null}
              </div>
              <div className="text-lg font-black text-emerald-300">{fmt(totalPoints)} <span className="text-xs font-bold text-white/40">พ้อยท์</span></div>
            </div>
          </section>

          {deliveries.length === 0 ? (
            <div className="grid min-h-[240px] place-items-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center text-sm text-white/45">
              ยังไม่มีข้อมูลการจัดส่ง
            </div>
          ) : (
            <div className="motion-stagger grid gap-4 lg:grid-cols-2">
              {deliveries.map((delivery, index) => {
                const steps = buildTimeline(delivery)
                const active = activeIndex(steps)
                const farmStatus = delivery.status === 'pending_fulfillment' && delivery.farm_status ? delivery.farm_status : delivery.status
                const cancelled = delivery.status === 'cancelled' || delivery.farm_status === 'cancelled' || delivery.farm_status === 'canceled'
                return (
                  <section key={delivery.id} className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-white/42">{deliveries.length > 1 ? `รายการที่ ${index + 1}` : 'รายการจัดส่ง'}</div>
                        <div className="mt-1 text-lg font-black text-white">{delivery.delivery_name}</div>
                      </div>
                      <StatusBadge status={farmStatus} />
                    </div>

                    {steps.map((step, stepIndex) => (
                      <TimelineStep key={`${delivery.id}-${step.label}`} step={step} index={stepIndex} active={stepIndex === active && !step.done} last={stepIndex === steps.length - 1} />
                    ))}

                    {delivery.assigned_staff_name && !cancelled ? (
                      <div className="mt-2 rounded-2xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-xs text-white/55">
                        เจ้าหน้าที่: <span className="font-bold text-white/80">{delivery.assigned_staff_name}</span>
                      </div>
                    ) : null}

                    {cancelled && delivery.farm_cancel_note ? (
                      <div className="mt-3 rounded-2xl border border-red-300/15 bg-red-500/10 px-4 py-3 text-xs leading-6 text-red-100">
                        เหตุผล: {delivery.farm_cancel_note}
                      </div>
                    ) : null}

                    {delivery.status === 'claimed' && delivery.payload ? (
                      <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-4">
                        <div className="mb-2 text-xs font-black text-emerald-200">ข้อมูลสินค้า</div>
                        <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-emerald-50/80">{delivery.payload}</pre>
                      </div>
                    ) : null}

                    {delivery.status === 'pending_claim' ? (
                      <Link to="/inbox" className="ui-btn-primary mt-4 inline-flex h-11 w-full items-center justify-center text-sm font-black">
                        ไปรับสินค้าที่กล่องรับของ
                      </Link>
                    ) : null}
                  </section>
                )
              })}
            </div>
          )}

          <div className="text-center text-xs text-white/30">อัปเดตสถานะอัตโนมัติทุก 30 วินาที</div>
        </>
      ) : null}
    </div>
  )
}
