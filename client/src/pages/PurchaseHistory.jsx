import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { copyToClipboard, fetchJson, setAuthToken } from '../api.js'

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
      className={`inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-xs font-black transition ${
        active
          ? 'border-sky-500 bg-sky-600 text-white shadow-xs'
          : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
      }`}
    >
      {children}
    </Link>
  )
}

function statusLabel(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'paid' || value === 'completed') {
    return { text: 'สำเร็จ', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', tone: 'emerald' }
  }
  if (value === 'cancelled' || value === 'canceled') {
    return { text: 'ยกเลิก', cls: 'border-rose-200 bg-rose-50 text-rose-700', tone: 'rose' }
  }
  if (value === 'pending' || value === 'pending_fulfillment') {
    return { text: 'กำลังดำเนินการ', cls: 'border-amber-200 bg-amber-50 text-amber-700', tone: 'amber' }
  }
  return { text: value || 'รายการ', cls: 'border-slate-200 bg-slate-50 text-slate-600', tone: 'slate' }
}

export default function PurchaseHistory() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filter States
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'completed' | 'pending' | 'cancelled'
  const [timeFilter, setTimeFilter] = useState('all') // 'all' | '7d' | '30d'
  const [query, setQuery] = useState('')

  // Modals State
  const [receiptOrder, setReceiptOrder] = useState(null)
  const [reviewOrder, setReviewOrder] = useState(null)
  const [rating, setRating] = useState(5)
  const [reviewName, setReviewName] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')

  // Toast
  const [toastMessage, setToastMessage] = useState('')
  const [copiedRef, setCopiedRef] = useState(null)

  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2200)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [meRes, ordersRes] = await Promise.all([fetchJson('/api/me'), fetchJson('/api/me/orders?limit=100')])
        if (!cancelled) {
          setMe(meRes)
          setReviewName(meRes?.user?.display_name || meRes?.user?.username || '')
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
  const displayName = user?.display_name || user?.username || user?.email?.split('@')?.[0] || 'ผู้ใช้'

  // Metric Computations
  const totalSpent = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.unit_price_points || 0) * Number(order.qty || 1), 0),
    [orders],
  )
  const totalQty = useMemo(() => orders.reduce((sum, order) => sum + Number(order.qty || 1), 0), [orders])
  const completedCount = useMemo(
    () => orders.filter((o) => ['paid', 'completed'].includes(String(o.status || '').toLowerCase())).length,
    [orders],
  )
  const pendingCount = useMemo(
    () => orders.filter((o) => ['pending', 'pending_fulfillment'].includes(String(o.status || '').toLowerCase())).length,
    [orders],
  )
  const cancelledCount = useMemo(
    () => orders.filter((o) => ['cancelled', 'canceled'].includes(String(o.status || '').toLowerCase())).length,
    [orders],
  )

  // Filtered Orders List
  const visibleOrders = useMemo(() => {
    let list = orders

    // Status Filter
    if (statusFilter === 'completed') {
      list = list.filter((o) => ['paid', 'completed'].includes(String(o.status || '').toLowerCase()))
    } else if (statusFilter === 'pending') {
      list = list.filter((o) => ['pending', 'pending_fulfillment'].includes(String(o.status || '').toLowerCase()))
    } else if (statusFilter === 'cancelled') {
      list = list.filter((o) => ['cancelled', 'canceled'].includes(String(o.status || '').toLowerCase()))
    }

    // Time Filter
    if (timeFilter === '7d') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      list = list.filter((o) => new Date(o.created_at).getTime() >= cutoff)
    } else if (timeFilter === '30d') {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      list = list.filter((o) => new Date(o.created_at).getTime() >= cutoff)
    }

    // Query Search
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((order) => {
      const option = order.product_option && typeof order.product_option === 'object' ? order.product_option : null
      return `${order.product_name || ''} ${order.category_name || ''} ${order.ref || ''} ${option?.label || ''}`
        .toLowerCase()
        .includes(q)
    })
  }, [orders, statusFilter, timeFilter, query])

  // Copy Order Ref
  async function copyRef(refText) {
    if (!refText) return
    const ok = await copyToClipboard(refText)
    if (ok) {
      setCopiedRef(refText)
      showToast(`คัดลอกเลขอ้างอิง ${refText} แล้ว`)
      setTimeout(() => setCopiedRef(null), 1500)
    }
  }

  // Submit Product Review
  async function submitReview(e) {
    e.preventDefault()
    if (!reviewOrder || reviewSubmitting) return
    setReviewSubmitting(true)
    setReviewError('')

    try {
      await fetchJson(`/api/products/${reviewOrder.product_id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_name: reviewName.trim() || displayName,
          rating: Number(rating),
          comment: reviewComment.trim(),
        }),
      })

      showToast('ส่งรีวิวสินค้าเรียบร้อยแล้ว ขอบคุณสำหรับคะแนน!')
      setReviewOrder(null)
      setReviewComment('')
      setRating(5)
    } catch (err) {
      setReviewError(err?.message || 'ส่งรีวิวไม่สำเร็จ กรุณากรอกความคิดเห็นอย่างน้อย 2 ตัวอักษร')
    } finally {
      setReviewSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[150] rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl animate-fade-in">
          ✓ {toastMessage}
        </div>
      )}

      {/* ── Top Hero & Metric Highlights ── */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_70%_at_0%_0%,rgba(56,189,248,0.14),transparent_60%),radial-gradient(40%_60%_at_100%_10%,rgba(14,165,233,0.10),transparent_55%)]" />

        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-end">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-sky-600">ประวัติการสั่งซื้อและติดตามคำสั่งซื้อ</div>
            <h1 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">ประวัติการซื้อสินค้า</h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              ตรวจสอบรายการสั่งซื้อทั้งหมดของ {displayName} พิมพ์ใบเสร็จดิจิทัล เขียนรีวิว หรือติดต่อแจ้งปัญหา
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-center">
              <div className="text-lg sm:text-2xl font-black text-slate-900">{orders.length}</div>
              <div className="mt-0.5 text-[10px] font-bold text-slate-500">ออเดอร์</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-center">
              <div className="text-lg sm:text-2xl font-black text-sky-600">{fmt(totalQty)}</div>
              <div className="mt-0.5 text-[10px] font-bold text-slate-500">ชิ้นทั้งหมด</div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-center">
              <div className="text-lg sm:text-2xl font-black text-emerald-600">{fmt(totalSpent)}</div>
              <div className="mt-0.5 text-[10px] font-bold text-emerald-700">พ้อยท์รวม</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-100/60 p-3 text-center">
              <div className="text-lg sm:text-2xl font-black text-emerald-800">{completedCount}</div>
              <div className="mt-0.5 text-[10px] font-bold text-emerald-800">สำเร็จแล้ว</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Page Level Nav Tabs ── */}
      <nav className="grid gap-2.5 md:grid-cols-3">
        <PageTab to="/inbox">📦 กล่องรับของ</PageTab>
        <PageTab to="/history/purchases" active>
          🛍️ ประวัติการซื้อ
        </PageTab>
        <PageTab to="/history/topups">💳 ประวัติเติมเงิน</PageTab>
      </nav>

      {/* ── Filter & Search Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sky-100 bg-white p-4 shadow-sm">
        {/* Status Filter Badges */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'ทั้งหมด', count: orders.length },
            { id: 'completed', label: '✓ สำเร็จ', count: completedCount },
            { id: 'pending', label: '⏳ กำลังทำ', count: pendingCount },
            { id: 'cancelled', label: '✕ ยกเลิก', count: cancelledCount },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === f.id
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{f.label}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${statusFilter === f.id ? 'bg-sky-800 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Time Filter & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-400"
          >
            <option value="all">ทุกช่วงเวลา</option>
            <option value="7d">7 วันล่าสุด</option>
            <option value="30d">30 วันล่าสุด</option>
          </select>

          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า / Ref..."
              className="w-48 sm:w-64 rounded-2xl border border-slate-200 bg-white px-3 py-2 pl-8 text-xs outline-none focus:border-sky-400"
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              🔍
            </span>
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Order List Stream ── */}
      {loading ? (
        <div className="grid min-h-[260px] place-items-center rounded-3xl border border-sky-100 bg-white p-8">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-sky-200 border-t-sky-600" />
            <div className="text-xs font-bold text-slate-500">กำลังโหลดประวัติการสั่งซื้อ...</div>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-6 text-center text-xs font-bold text-rose-700">
          ⚠️ โหลดข้อมูลไม่สำเร็จ: {error}
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="grid min-h-[260px] place-items-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/20 p-8 text-center">
          <div>
            <div className="text-4xl mb-2">🛍️</div>
            <div className="text-base font-black text-slate-900">ไม่พบรายการสั่งซื้อ</div>
            <p className="mt-1 text-xs text-slate-500">
              {query || statusFilter !== 'all' || timeFilter !== 'all'
                ? 'ไม่พบออเดอร์ที่ตรงกับเงื่อนไขการค้นหา'
                : 'คุณยังไม่มีประวัติการสั่งซื้อสินค้า เริ่มเลือกดูสินค้าที่คุณชื่นชอบได้เลย'}
            </p>
            <Link to="/categories" className="ui-btn-primary mt-4 inline-flex h-10 items-center px-4 text-xs font-bold">
              เริ่มเลือกดูสินค้า
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((order) => {
            const st = statusLabel(order.status)
            const itemTotalPoints = Number(order.unit_price_points || 0) * Number(order.qty || 1)
            const option = order.product_option && typeof order.product_option === 'object' ? order.product_option : null

            return (
              <div
                key={`${order.id}-${order.product_id}`}
                className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs transition hover:border-sky-300"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Product Info & Thumb */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    {order.product_image_url ? (
                      <img
                        src={order.product_image_url}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-2xl border border-slate-200 object-cover bg-white shadow-xs"
                      />
                    ) : (
                      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-sky-100 text-xl font-black text-sky-600 shadow-xs">
                        🛍️
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${st.cls}`}>
                          {st.text}
                        </span>

                        {order.ref ? (
                          <button
                            type="button"
                            onClick={() => copyRef(order.ref)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                            title="คลิกเพื่อคัดลอกเลขอ้างอิง"
                          >
                            <span>{order.ref}</span>
                            <span className="text-[9px] text-slate-400">
                              {copiedRef === order.ref ? '✓' : '📋'}
                            </span>
                          </button>
                        ) : null}

                        {order.category_name ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {order.category_name}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-1 truncate text-base font-black text-slate-900">
                        {order.product_name}
                      </h3>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-medium">
                        {option?.label ? (
                          <span className="rounded-lg bg-sky-50 px-2 py-0.5 text-sky-700 font-bold border border-sky-100">
                            ตัวเลือก: {option.label}
                          </span>
                        ) : null}
                        <span>• จำนวน: <strong>{order.qty}</strong> ชิ้น</span>
                        <span>• สั่งซื้อเมื่อ: {formatDate(order.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Price & Action Suite */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
                    <div className="text-left lg:text-right">
                      <div className="text-lg font-black text-sky-600">{fmt(itemTotalPoints)} พ้อยท์</div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        ({fmt(order.unit_price_points)} พ้อยท์ / ชิ้น)
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Receipt Modal Trigger */}
                      <button
                        type="button"
                        onClick={() => setReceiptOrder(order)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
                      >
                        🧾 ใบเสร็จ
                      </button>

                      {/* Review Trigger */}
                      <button
                        type="button"
                        onClick={() => {
                          setReviewOrder(order)
                          setRating(5)
                          setReviewComment('')
                          setReviewError('')
                        }}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100"
                      >
                        ⭐ รีวิว
                      </button>

                      {/* Support Issue Trigger */}
                      <Link
                        to={`/support?order_id=${order.id}&subject=${encodeURIComponent(`สอบถามออเดอร์: ${order.product_name} (${order.ref || `#${order.id}`})`)}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                      >
                        🎧 แจ้งปัญหา
                      </Link>

                      {/* View In Inbox Shortcut */}
                      <Link
                        to="/inbox"
                        className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-sky-700"
                      >
                        📦 ดูในกล่องรับของ
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* ── DIGITAL RECEIPT / INVOICE MODAL ── */}
      {/* ───────────────────────────────────────────── */}
      {receiptOrder && (
        <div id="printable-receipt-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div id="printable-receipt" className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-scaleIn">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-xl">🧾</span>
                <div>
                  <h3 className="text-base font-black text-slate-900">ใบเสร็จรับเงินดิจิทัล</h3>
                  <div className="text-[11px] text-slate-400 font-mono">VXPERS STORE RECEIPT</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="no-print rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Receipt Body */}
            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3.5 border border-slate-100">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">เลขอ้างอิง (Ref)</div>
                  <div className="mt-0.5 font-mono font-black text-slate-900">{receiptOrder.ref || `#${receiptOrder.id}`}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">วันที่สั่งซื้อ</div>
                  <div className="mt-0.5 font-bold text-slate-800">{formatDate(receiptOrder.created_at)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">ผู้สั่งซื้อ</div>
                  <div className="mt-0.5 font-bold text-slate-800">{displayName}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">สถานะออเดอร์</div>
                  <div className="mt-0.5 font-bold text-emerald-700">✓ สำเร็จ (Completed)</div>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                    <tr>
                      <th className="p-3">รายการสินค้า</th>
                      <th className="p-3 text-center">จำนวน</th>
                      <th className="p-3 text-right">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{receiptOrder.product_name}</div>
                        {receiptOrder.product_option?.label ? (
                          <div className="text-[10px] text-slate-500">ตัวเลือก: {receiptOrder.product_option.label}</div>
                        ) : null}
                      </td>
                      <td className="p-3 text-center font-bold text-slate-700">{receiptOrder.qty}</td>
                      <td className="p-3 text-right font-black text-sky-600">
                        {fmt(Number(receiptOrder.unit_price_points || 0) * Number(receiptOrder.qty || 1))} P
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Grand Total */}
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
                <span className="font-bold text-slate-700">ยอดชำระสุทธิ (Total Points):</span>
                <span className="text-xl font-black text-emerald-600">
                  {fmt(Number(receiptOrder.unit_price_points || 0) * Number(receiptOrder.qty || 1))} พ้อยท์
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="no-print mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                🖨️ พิมพ์ใบเสร็จ
              </button>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-black text-white hover:bg-sky-700"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* ── 1-CLICK PRODUCT REVIEW MODAL ── */}
      {/* ───────────────────────────────────────────── */}
      {reviewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⭐</span>
                <h3 className="text-base font-black text-slate-900">ให้คะแนนและรีวิวสินค้า</h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewOrder(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitReview} className="mt-4 space-y-4">
              <div className="rounded-2xl bg-sky-50/50 p-3 border border-sky-100">
                <div className="text-xs font-black text-slate-900">{reviewOrder.product_name}</div>
                <div className="text-[10px] text-slate-500 font-mono">อ้างอิง: {reviewOrder.ref || `#${reviewOrder.id}`}</div>
              </div>

              {/* 5-Star Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ให้คะแนนความพึงพอใจ:</label>
                <div className="flex gap-2 text-2xl">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`transition transform hover:scale-125 ${
                        star <= rating ? 'text-amber-400' : 'text-slate-200'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="self-center ml-2 text-xs font-black text-amber-600">
                    {rating === 5 ? 'ยอดเยี่ยม มากๆ' : rating === 4 ? 'ดีมาก' : rating === 3 ? 'ปานกลาง' : rating === 2 ? 'พอใช้' : 'ต้องปรับปรุง'}
                  </span>
                </div>
              </div>

              {/* Reviewer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อผู้รีวิว (Display Name):</label>
                <input
                  value={reviewName}
                  onChange={(e) => setReviewName(e.target.value)}
                  placeholder="ชื่อที่แสดงในรีวิว"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-400"
                />
              </div>

              {/* Review Comment */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ความคิดเห็นเกี่ยวกับสินค้า:</label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="บอกเล่าความรู้สึกและประสบการณ์ใช้งานของคุณ..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-sky-400"
                  required
                />
              </div>

              {reviewError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  ⚠️ {reviewError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewOrder(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting || !reviewComment.trim()}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-black text-white shadow-md hover:bg-amber-600 disabled:opacity-50"
                >
                  {reviewSubmitting ? 'กำลังส่ง...' : 'ส่งรีวิว'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
