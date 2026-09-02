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
  if (value === 'claimed') return { text: 'รับแล้ว', cls: 'border border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (value === 'fulfilled' || value === 'pending_claim') return { text: 'พร้อมรับ', cls: 'border border-sky-200 bg-sky-50 text-sky-700' }
  if (value === 'in_progress') return { text: 'กำลังดำเนินการ', cls: 'border border-blue-200 bg-blue-50 text-blue-700' }
  if (value === 'cancelled' || value === 'canceled') return { text: 'ยกเลิก', cls: 'border border-rose-200 bg-rose-50 text-rose-700' }
  if (value === 'pending' || value === 'pending_fulfillment') return { text: 'รอดำเนินการ', cls: 'border border-amber-200 bg-amber-50 text-amber-700' }
  if (value === 'paid' || value === 'completed') return { text: 'สำเร็จ', cls: 'border border-emerald-200 bg-emerald-50 text-emerald-700' }
  return { text: value || 'รายการ', cls: 'border border-slate-200 bg-slate-100 text-slate-700' }
}

function StatusBadge({ status }) {
  const meta = statusMeta(status)
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${meta.cls}`}>{meta.text}</span>
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
    ? 'border-rose-300 bg-rose-50 text-rose-700'
    : step.done
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : active
        ? 'border-sky-300 bg-sky-50 text-sky-700'
        : 'border-slate-200 bg-slate-50 text-slate-400'
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <div className={`grid h-9 w-9 place-items-center rounded-full border text-xs font-black ${doneClass}`}>{index + 1}</div>
        {!last ? <div className={`mt-1 min-h-8 w-px flex-1 rounded-full ${step.done ? 'bg-emerald-300' : 'bg-slate-200'}`} /> : null}
      </div>
      <div className="pb-4 pt-0.5">
        <div className={`text-xs font-black ${step.done ? 'text-slate-900' : active ? 'text-sky-700' : 'text-slate-400'}`}>{step.label}</div>
        {step.time ? <div className="mt-0.5 text-[11px] text-slate-400">{formatDate(step.time)}</div> : null}
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
    <div className="space-y-6 fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to="/history/purchases" className="text-xs font-bold text-sky-600 hover:text-sky-700">← กลับประวัติการซื้อ</Link>
            <h1 className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">ติดตามคำสั่งซื้อ</h1>
            <p className="mt-1.5 max-w-2xl text-xs text-slate-500">
              {order ? `รายการ ${order.ref || `#${order.id}`} อัปเดตสถานะอัตโนมัติทุก 30 วินาที` : 'กำลังโหลดรายละเอียดคำสั่งซื้อ'}
            </p>
          </div>
          {order ? (
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 shadow-xs">
              <div className="text-2xl font-black text-emerald-600">{fmt(totalPoints)}</div>
              <div className="mt-0.5 text-[10px] font-bold text-slate-500">พ้อยท์</div>
            </div>
          ) : null}
        </div>
      </section>

      {loading && !data ? (
        <div className="grid min-h-[300px] place-items-center rounded-3xl border border-sky-200 bg-white text-xs font-bold text-slate-400 shadow-sm">กำลังโหลดคำสั่งซื้อ...</div>
      ) : null}

      {error === 'not_found' ? (
        <div className="grid min-h-[260px] place-items-center rounded-3xl border border-sky-200 bg-white p-8 text-center shadow-sm">
          <div>
            <div className="text-lg font-black text-slate-900">ไม่พบคำสั่งซื้อนี้</div>
            <Link to="/history/purchases" className="ui-btn-primary mt-4 inline-flex h-10 items-center px-5 text-xs font-black">กลับไปประวัติการซื้อ</Link>
          </div>
        </div>
      ) : null}

      {error && error !== 'not_found' ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">โหลดไม่สำเร็จ: {error}</div>
      ) : null}

      {order ? (
        <>
          <section className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-sky-100 bg-sky-50">
                {order.product_image_url ? <img src={order.product_image_url} alt={order.product_name} className="h-full w-full object-cover" /> : <span className="text-xs font-black text-slate-400">ITEM</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-lg font-black text-slate-900">{order.product_name}</div>
                  <StatusBadge status={order.status} />
                  {order.category_name ? <span className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">{order.category_name}</span> : null}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="font-mono">{order.ref || `#${order.id}`}</span>
                  <span>จำนวน {order.qty}</span>
                  <span>{formatDate(order.created_at)}</span>
                </div>
                {order.product_option?.label ? <div className="mt-1 text-xs font-bold text-sky-700">ตัวเลือก: {order.product_option.label}</div> : null}
              </div>
              <div className="text-lg font-black text-emerald-600">{fmt(totalPoints)} <span className="text-xs font-bold text-slate-400">พ้อยท์</span></div>
            </div>
          </section>

          {deliveries.length === 0 ? (
            <div className="grid min-h-[200px] place-items-center rounded-3xl border border-dashed border-sky-200 bg-white p-8 text-center text-xs text-slate-400 shadow-sm">
              ยังไม่มีข้อมูลการจัดส่ง
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {deliveries.map((delivery, index) => {
                const steps = buildTimeline(delivery)
                const active = activeIndex(steps)
                const farmStatus = delivery.status === 'pending_fulfillment' && delivery.farm_status ? delivery.farm_status : delivery.status
                const cancelled = delivery.status === 'cancelled' || delivery.farm_status === 'cancelled' || delivery.farm_status === 'canceled'
                return (
                  <section key={delivery.id} className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-400">{deliveries.length > 1 ? `รายการที่ ${index + 1}` : 'รายการจัดส่ง'}</div>
                        <div className="mt-0.5 text-base font-black text-slate-900">{delivery.delivery_name}</div>
                      </div>
                      <StatusBadge status={farmStatus} />
                    </div>

                    {steps.map((step, stepIndex) => (
                      <TimelineStep key={`${delivery.id}-${step.label}`} step={step} index={stepIndex} active={stepIndex === active && !step.done} last={stepIndex === steps.length - 1} />
                    ))}

                    {delivery.assigned_staff_name && !cancelled ? (
                      <div className="mt-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-2.5 text-xs text-slate-600">
                        เจ้าหน้าที่: <span className="font-bold text-slate-900">{delivery.assigned_staff_name}</span>
                      </div>
                    ) : null}

                    {cancelled && delivery.farm_cancel_note ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-700">
                        เหตุผล: {delivery.farm_cancel_note}
                      </div>
                    ) : null}

                    {delivery.status === 'claimed' && delivery.payload ? (
                      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="mb-2 text-xs font-black text-emerald-800">ข้อมูลสินค้า</div>
                        <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-emerald-950">{delivery.payload}</pre>
                      </div>
                    ) : null}

                    {delivery.status === 'pending_claim' ? (
                      <Link to="/inbox" className="ui-btn-primary mt-4 inline-flex h-10 w-full items-center justify-center text-xs font-black">
                        ไปรับสินค้าที่กล่องรับของ
                      </Link>
                    ) : null}
                  </section>
                )
              })}
            </div>
          )}

          <div className="text-center text-xs text-slate-400">อัปเดตสถานะอัตโนมัติทุก 30 วินาที</div>
        </>
      ) : null}
    </div>
  )
}
