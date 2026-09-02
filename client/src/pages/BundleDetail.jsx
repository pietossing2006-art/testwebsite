import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchJson, reloadPageSoon, triggerAppRefresh } from '../api.js'
import DiscountBreakdown from '../components/growth/DiscountBreakdown.jsx'
import { formatGrowthErrorMessage } from '../components/growth/growthDisplayUtils.js'

function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString('th-TH')
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function useCountdown(endsAt) {
  const calc = useCallback(() => {
    if (!endsAt) return null
    const diff = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000))
    if (diff <= 0) return null
    return {
      d: Math.floor(diff / 86400),
      h: Math.floor((diff % 86400) / 3600),
      m: Math.floor((diff % 3600) / 60),
      s: diff % 60,
    }
  }, [endsAt])

  const [time, setTime] = useState(calc)

  useEffect(() => {
    if (!endsAt) return undefined
    const id = setInterval(() => setTime(calc()), 1000)
    return () => clearInterval(id)
  }, [calc, endsAt])

  return time
}

function getApiErrorMessage(error) {
  const code = error?.data?.error || error
  if (code === 'insufficient_points') return 'พ้อยไม่เพียงพอสำหรับการซื้อ Bundle นี้'
  if (code === 'out_of_stock') return 'สินค้าในชุดบางรายการหมดสต็อกแล้ว'
  if (code === 'bundle_expired') return 'Bundle นี้หมดเวลาแล้ว'
  if (code === 'bundle_not_started') return 'Bundle นี้ยังไม่เปิดขาย'
  if (code === 'bundle_empty') return 'Bundle นี้ยังไม่มีสินค้าในชุด'
  if (code === 'invalid_coupon') return 'โค้ดส่วนลดไม่ถูกต้อง'
  if (code === 'coupon_expired') return 'โค้ดส่วนลดหมดอายุแล้ว'
  if (code === 'coupon_exhausted') return 'โค้ดส่วนลดถูกใช้ครบจำนวนแล้ว'
  if (code === 'campaign_expired') return formatGrowthErrorMessage(code)
  if (code === 'campaign_sold_out') return formatGrowthErrorMessage(code)
  if (code === 'quote_stale') return formatGrowthErrorMessage(code)
  if (code === 'invalid_product_option') return 'ตัวเลือกสินค้าใน Bundle ไม่ถูกต้อง กรุณาแจ้งแอดมิน'
  if (code === 'duplicate_purchase') return 'ระบบป้องกันรายการซ้ำ กรุณาลองใหม่อีกครั้ง'
  return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}

function CountdownPill({ countdown }) {
  if (!countdown) return null
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-black text-cyan-100">
      <span>หมดใน</span>
      <span className="tabular-nums">
        {countdown.d > 0 ? `${countdown.d} วัน ` : ''}{pad(countdown.h)}:{pad(countdown.m)}:{pad(countdown.s)}
      </span>
    </div>
  )
}

function StockBadge({ item }) {
  const stock = item?.stock || {}
  if (stock.out_of_stock) {
    return <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black text-rose-200">หมด</span>
  }
  if (stock.remaining == null) {
    return <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-200">พร้อม</span>
  }
  return <span className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black text-cyan-100">เหลือ {fmt(stock.remaining)}</span>
}

export default function BundleDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthed, setIsAuthed] = useState(null)
  const [quote, setQuote] = useState(null)
  const [quoteStatus, setQuoteStatus] = useState('idle')
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const [couponError, setCouponError] = useState('')
  const [buyStatus, setBuyStatus] = useState('idle')
  const [buyError, setBuyError] = useState('')
  const [successData, setSuccessData] = useState(null)

  const countdown = useCountdown(bundle?.ends_at)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setBuyError('')
      try {
        const data = await fetchJson(`/api/bundles/${id}`)
        if (!cancelled) setBundle(data?.bundle ?? null)
      } catch {
        if (!cancelled) setBundle(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (id) load()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
      try {
        await fetchJson('/api/me')
        if (!cancelled) setIsAuthed(true)
      } catch (error) {
        if (!cancelled && error?.status === 401) setIsAuthed(false)
      }
    }
    checkAuth()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadQuote() {
      if (!bundle?.id) return
      setQuoteStatus('loading')
      setCouponError('')
      try {
        const data = await fetchJson(`/api/bundles/${bundle.id}/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coupon_code: appliedCoupon || undefined }),
        })
        if (cancelled) return
        setQuote(data?.quote ?? null)
        setQuoteStatus('success')
      } catch (error) {
        if (cancelled) return
        setQuote(null)
        setQuoteStatus('error')
        if (appliedCoupon) setCouponError(getApiErrorMessage(error))
      }
    }
    loadQuote()
    return () => {
      cancelled = true
    }
  }, [appliedCoupon, bundle?.id])

  const items = useMemo(() => {
    if (Array.isArray(quote?.items) && quote.items.length > 0) return quote.items
    return (Array.isArray(bundle?.items) ? bundle.items : []).map((item) => ({
      bundle_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      product_option: item.product_option,
      qty: item.qty,
      unit_price_points: item.product_price,
      subtotal_points: Number(item.product_price ?? 0) * Number(item.qty ?? 1),
      stock: {
        remaining: item.is_unlimited_stock ? null : item.stock,
        out_of_stock: !item.is_unlimited_stock && item.fulfillment_type === 'digital_stock' && Number(item.stock ?? 0) <= 0,
      },
      available: true,
    }))
  }, [bundle?.items, quote?.items])

  const nowMs = Date.now()
  const startsMs = bundle?.starts_at ? new Date(bundle.starts_at).getTime() : null
  const endsMs = bundle?.ends_at ? new Date(bundle.ends_at).getTime() : null
  const notStarted = Boolean(startsMs && startsMs > nowMs)
  const isExpired = Boolean(endsMs && endsMs < nowMs)
  const isUnavailable = notStarted || isExpired || bundle?.is_active === false || quote?.available === false

  const originalTotal = Number(quote?.original_total_points ?? bundle?.original_total ?? 0)
  const bundlePrice = Number(quote?.bundle_price_points ?? bundle?.bundle_price ?? 0)
  const bundleDiscount = Number(quote?.bundle_discount_points ?? Math.max(0, originalTotal - bundlePrice))
  const couponDiscount = Number(quote?.coupon_discount_points ?? 0)
  const total = Number(quote?.total_points ?? bundlePrice)
  const savingsPct = originalTotal > 0 ? Math.round((bundleDiscount / originalTotal) * 100) : 0

  function applyCoupon() {
    const code = couponInput.trim().toUpperCase()
    setAppliedCoupon(code)
    setCouponError('')
  }

  async function handlePurchase() {
    if (isAuthed === false) {
      nav('/login')
      return
    }
    setBuyStatus('working')
    setBuyError('')
    try {
      const data = await fetchJson(`/api/bundles/${id}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_code: appliedCoupon || undefined }),
      })
      setSuccessData(data)
      setBuyStatus('success')
      triggerAppRefresh()
      reloadPageSoon()
    } catch (error) {
      setBuyError(getApiErrorMessage(error))
      setBuyStatus('idle')
    }
  }

  if (loading) {
    return <div className="py-24 text-center text-sm font-bold text-slate-500">กำลังโหลด Bundle...</div>
  }

  if (!bundle) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <div className="text-lg font-black text-slate-900">ไม่พบ Bundle นี้</div>
        <p className="mt-2 text-sm text-slate-500">รายการอาจถูกปิดหรือหมดช่วงเวลาแสดงผลแล้ว</p>
        <Link to="/" className="mt-5 inline-flex h-10 items-center rounded-2xl border border-sky-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm hover:bg-sky-50">
          กลับหน้าหลัก
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8 fade-in-up">
      <div className="text-xs font-bold text-slate-500">
        <Link to="/" className="text-sky-600 hover:underline">หน้าหลัก</Link>
        <span className="mx-2 text-slate-400">/</span>
        <span className="text-slate-800">{bundle.name}</span>
      </div>

      <section className="grid min-w-0 gap-6 lg:grid-cols-12 items-start">
        <div className="overflow-hidden rounded-3xl border border-sky-200 bg-white p-2 shadow-sm lg:col-span-6">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-sky-50">
            {bundle.image_url ? (
              <img src={bundle.image_url} alt={bundle.name} className="h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-sm font-black text-slate-400">Bundle</div>
            )}
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-sky-300 bg-sky-500 px-3 py-1 text-[11px] font-black text-white shadow-sm">Bundle</span>
              {savingsPct > 0 ? <span className="rounded-full border border-emerald-300 bg-emerald-500 px-3 py-1 text-[11px] font-black text-white shadow-sm">ประหยัด {savingsPct}%</span> : null}
            </div>
          </div>
        </div>

        <aside className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm sm:p-7 lg:col-span-6">
          <div className="flex flex-wrap items-center gap-2">
            <CountdownPill countdown={!isExpired && !notStarted ? countdown : null} />
            {notStarted ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-800">รอเปิดขาย</span> : null}
            {isExpired ? <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500">หมดเวลา</span> : null}
          </div>

          <div className="mt-4">
            <h1 className="text-2xl font-black leading-tight text-slate-900 sm:text-3xl">{bundle.name}</h1>
            <div className="mt-2 text-xs font-bold text-slate-500">ราคา Bundle</div>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <div className="text-3xl font-black text-emerald-600 sm:text-4xl">{fmt(total)} พ้อยท์</div>
              {couponDiscount > 0 ? <div className="pb-1 text-sm font-bold text-slate-400 line-through">{fmt(bundlePrice)} พ้อยท์</div> : null}
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
              <div className="text-[11px] font-black text-slate-500">มูลค่ารวม</div>
              <div className="mt-1 text-lg font-black text-slate-800">{fmt(originalTotal)}</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
              <div className="text-[11px] font-black text-sky-700">ลดจาก Bundle</div>
              <div className="mt-1 text-lg font-black text-sky-700">{fmt(bundleDiscount)}</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
              <div className="text-[11px] font-black text-emerald-700">จ่ายจริง</div>
              <div className="mt-1 text-lg font-black text-emerald-700">{fmt(total)}</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-black text-slate-900">สินค้าในชุด</div>
              <div className="text-xs font-bold text-slate-500">{items.length} รายการ</div>
            </div>
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={`${item.bundle_item_id || item.product_id}-${item.product_option?.id || 'default'}`} className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-white p-2.5 shadow-xs">
                  {item.product_image_url ? (
                    <img src={item.product_image_url} alt={item.product_name} className="h-11 w-11 shrink-0 rounded-xl border border-sky-100 object-cover" />
                  ) : (
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-sky-100 bg-sky-50 text-[10px] font-black text-slate-400">ITEM</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-black text-slate-900">{item.product_name}</div>
                      <StockBadge item={item} />
                    </div>
                    {item.product_option?.label ? <div className="mt-0.5 truncate text-[11px] font-bold text-sky-700">{item.product_option.label}</div> : null}
                    <div className="mt-0.5 text-xs font-bold text-slate-500">x{item.qty} · {fmt(item.subtotal_points)} พ้อยท์</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
            <label className="text-xs font-black text-slate-700">โค้ดส่วนลด</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                className="ui-field h-10"
                placeholder="กรอกโค้ดคูปอง ถ้ามี"
                value={couponInput}
                onChange={(event) => setCouponInput(event.target.value)}
                disabled={buyStatus === 'working'}
              />
              <button type="button" onClick={applyCoupon} disabled={buyStatus === 'working' || quoteStatus === 'loading'} className="ui-btn h-10 px-4 text-xs font-black">
                ใช้โค้ด
              </button>
            </div>
            {appliedCoupon && !couponError ? (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-emerald-700">
                <span>ใช้โค้ด {appliedCoupon}{couponDiscount > 0 ? ` ลด ${fmt(couponDiscount)} พ้อยท์` : ''}</span>
                <button type="button" className="text-slate-500 hover:text-slate-900 underline" onClick={() => { setAppliedCoupon(''); setCouponInput('') }}>ลบ</button>
              </div>
            ) : null}
            {couponError ? <div className="mt-2 text-xs font-bold text-rose-600">{couponError}</div> : null}
            <DiscountBreakdown quote={quote} />
          </div>

          {quote?.available === false ? <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">มีสินค้าบางรายการไม่พอสำหรับ Bundle นี้</div> : null}
          {buyError ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{buyError}</div> : null}
          {successData ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-sm font-black text-emerald-800">สั่งซื้อสำเร็จแล้ว</div>
              <div className="mt-1 text-xs font-bold text-emerald-700">เลขออเดอร์ {successData?.order?.ref || successData?.order?.id}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/inbox" className="ui-btn-primary px-3 py-1.5 text-xs font-black">เปิดกล่องรับของ</Link>
                <Link to="/history/purchases" className="ui-btn px-3 py-1.5 text-xs font-black">ดูประวัติ</Link>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handlePurchase}
            disabled={isUnavailable || buyStatus === 'working' || buyStatus === 'success' || quoteStatus === 'loading'}
            className="ui-btn-primary mt-4 h-12 w-full text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buyStatus === 'working'
              ? 'กำลังดำเนินการ...'
              : isExpired
                ? 'Bundle หมดเวลาแล้ว'
                : notStarted
                  ? 'ยังไม่เปิดขาย'
                  : quote?.available === false
                    ? 'สินค้าในชุดไม่พอ'
                    : `ซื้อ Bundle · ${fmt(total)} พ้อยท์`}
          </button>
        </aside>
      </section>

      {bundle.description ? (
        <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm">
          <div className="text-base font-black text-slate-900">รายละเอียด Bundle</div>
          <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-slate-600">{bundle.description}</p>
        </section>
      ) : null}
    </div>
  )
}
