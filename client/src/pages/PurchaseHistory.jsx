import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchJson, setAuthToken } from '../api.js'

function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString()
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PageTab({ active, to, children }) {
  return (
    <Link
      to={to}
      className={`motion-tab motion-hover inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-black transition ${
        active
          ? 'border-cyan-300/30 bg-cyan-500/15 text-cyan-100'
          : 'border-white/[0.08] bg-white/[0.035] text-white/58 hover:border-cyan-300/22 hover:text-white'
      }`}
    >
      {children}
    </Link>
  )
}

function statusLabel(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'paid' || value === 'completed') return { text: 'สำเร็จ', cls: 'bg-emerald-500/10 text-emerald-200' }
  if (value === 'cancelled' || value === 'canceled') return { text: 'ยกเลิก', cls: 'bg-red-500/10 text-red-200' }
  if (value === 'pending') return { text: 'รอดำเนินการ', cls: 'bg-amber-500/10 text-amber-200' }
  return { text: value || 'รายการ', cls: 'bg-white/[0.06] text-white/58' }
}

export default function PurchaseHistory() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [meRes, ordersRes] = await Promise.all([fetchJson('/api/me'), fetchJson('/api/me/orders')])
        if (!cancelled) {
          setMe(meRes)
          setOrders(Array.isArray(ordersRes?.orders) ? ordersRes.orders : [])
        }
      } catch (err) {
        if (!cancelled && err?.status === 401) {
          setAuthToken(null)
          nav('/login', { replace: true })
          return
        }
        if (!cancelled) setError(String(err?.message ?? 'load_failed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [nav])

  const user = me?.user
  const displayName = user?.display_name || user?.email?.split('@')?.[0] || user?.username || 'user'
  const totalSpent = useMemo(() => orders.reduce((sum, order) => sum + Number(order.unit_price_points ?? 0) * Number(order.qty ?? 0), 0), [orders])
  const totalQty = useMemo(() => orders.reduce((sum, order) => sum + Number(order.qty ?? 0), 0), [orders])
  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((order) => {
      const option = order.product_option && typeof order.product_option === 'object' ? order.product_option : null
      return `${order.product_name || ''} ${order.category_name || ''} ${order.ref || ''} ${option?.label || ''}`.toLowerCase().includes(q)
    })
  }, [orders, query])

  return (
    <div className="space-y-7 fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong p-4 sm:p-7">
        <div className="absolute inset-0 scanline opacity-35" />
        <div className="absolute inset-0 grid-pattern opacity-35" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/[0.08] blur-[90px]" />
        <div className="motion-stagger relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">บัญชีผู้ใช้</div>
            <h1 className="mt-2 text-4xl font-black text-white">ประวัติการซื้อ</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
              ดูรายการสั่งซื้อทั้งหมดของ {displayName} พร้อมยอดพ้อยท์ จำนวนสินค้า และลิงก์ติดตามคำสั่งซื้อ
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-white">{orders.length}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">ออเดอร์</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-cyan-200">{fmt(totalQty)}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">ชิ้น</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-emerald-300">{fmt(totalSpent)}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">พ้อยท์</div>
            </div>
          </div>
        </div>
      </section>

      <nav className="motion-stagger grid gap-3 md:grid-cols-3">
        <PageTab to="/inbox">กล่องรับของ</PageTab>
        <PageTab to="/history/purchases" active>ประวัติการซื้อ</PageTab>
        <PageTab to="/history/topups">ประวัติเติมเงิน</PageTab>
      </nav>

      <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
        <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
              </svg>
            </span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="ui-field h-12 pl-11" placeholder="ค้นหาสินค้า เลขอ้างอิง หรือหมวดหมู่" />
          </label>
          <Link to="/categories" className="ui-btn h-12 px-5 text-sm font-black">เลือกซื้อสินค้า</Link>
        </div>

        {loading ? <div className="grid min-h-[260px] place-items-center text-sm font-bold text-white/55">กำลังโหลดประวัติ...</div> : null}
        {error ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4 text-sm font-bold text-cyan-100">โหลดไม่สำเร็จ: {error}</div> : null}
        {!loading && !error && visibleOrders.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center">
            <div>
              <div className="text-lg font-black text-white">ยังไม่มีรายการสั่งซื้อ</div>
              <p className="mt-2 text-sm text-white/45">เมื่อสั่งซื้อสินค้าแล้ว รายการจะมาแสดงที่นี่</p>
              <Link to="/categories" className="ui-btn-primary mt-5 inline-flex h-11 items-center px-5 text-sm font-black">เริ่มเลือกสินค้า</Link>
            </div>
          </div>
        ) : null}

        {!loading && !error && visibleOrders.length > 0 ? (
          <div className="motion-stagger space-y-3">
            {visibleOrders.map((order) => {
              const option = order.product_option && typeof order.product_option === 'object' ? order.product_option : null
              const total = Number(order.unit_price_points ?? 0) * Number(order.qty ?? 0)
              const badge = statusLabel(order.status)
              return (
                <Link
                  key={`${order.id}-${order.product_id}`}
                  to={`/history/orders/${order.id}`}
                  className="motion-card motion-hover block rounded-3xl border border-white/[0.07] bg-white/[0.035] p-4 transition hover:border-cyan-300/20 hover:bg-white/[0.055]"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/[0.06] bg-black/25">
                      {order.product_image_url ? (
                        <img src={order.product_image_url} alt={order.product_name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-black text-white/35">ITEM</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-black text-white">{order.product_name}</div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${badge.cls}`}>{badge.text}</span>
                        {order.category_name ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-white/45">{order.category_name}</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/42">
                        <span className="font-mono">{order.ref || `#${order.id}`}</span>
                        <span>จำนวน {order.qty}</span>
                        <span>{formatDate(order.created_at)}</span>
                      </div>
                      {option?.label || option?.id ? <div className="mt-2 text-xs font-bold text-cyan-200/80">ตัวเลือก: {option.label || option.id}</div> : null}
                    </div>
                    <div className="flex items-center justify-between gap-3 md:block md:text-right">
                      <div className="text-lg font-black text-emerald-300">{fmt(total)} <span className="text-xs font-bold text-white/40">พ้อยท์</span></div>
                      <div className="mt-1 text-xs font-bold text-cyan-200/80">ติดตามรายการ</div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : null}
      </section>
    </div>
  )
}
