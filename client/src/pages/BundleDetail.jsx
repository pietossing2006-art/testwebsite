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
    return <div className="py-24 text-center text-sm font-bold text-white/45">กำลังโหลด Bundle...</div>
  }

  if (!bundle) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <div className="text-lg font-black text-white">ไม่พบ Bundle นี้</div>
        <p className="mt-2 text-sm text-white/45">รายการอาจถูกปิดหรือหมดช่วงเวลาแสดงผลแล้ว</p>
        <Link to="/" className="mt-5 inline-flex h-10 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/80 hover:bg-white/[0.08]">
          กลับหน้าหลัก
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8 fade-in-up">
      <div className="text-xs font-bold text-white/45">
        <Link to="/" className="text-white/55 hover:text-white">หน้าหลัก</Link>
        <span className="mx-2 text-white/20">/</span>
        <span className="text-white/80">{bundle.name}</span>
      </div>

      <section className="motion-stagger grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="motion-card motion-hover motion-soft-glow overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.04] shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="relative aspect-[4/3] bg-black/30">
            {bundle.image_url ? (
              <img src={bundle.image_url} alt={bundle.name} className="motion-image absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-sm font-black text-white/30">Bundle</div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/65 to-transparent" />
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-black text-white/85 backdrop-blur">Bundle</span>
              {savingsPct > 0 ? <span className="rounded-full border border-cyan-300/25 bg-cyan-500/15 px-3 py-1 text-[11px] font-black text-cyan-100 backdrop-blur">ประหยัด {savingsPct}%</span> : null}
            </div>
          </div>
        </div>

        <aside className="motion-card rounded-[28px] border border-white/[0.08] bg-white/[0.045] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.38)] sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CountdownPill countdown={!isExpired && !notStarted ? countdown : null} />
            {notStarted ? <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-[11px] font-black text-amber-100">รอเปิดขาย</span> : null}
            {isExpired ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-black text-white/45">หมดเวลา</span> : null}
          </div>

          <div className="mt-5">
            <h1 className="text-3xl font-black leading-tight text-white">{bundle.name}</h1>
            <div className="mt-2 text-sm font-bold text-white/45">ราคา Bundle</div>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <div className="motion-price text-4xl font-black text-emerald-300 [text-shadow:0_0_18px_rgba(110,231,183,0.22)]">{fmt(total)} พ้อย</div>
              {couponDiscount > 0 ? <div className="pb-1 text-sm font-black text-white/35 line-through">{fmt(bundlePrice)} พ้อย</div> : null}
            </div>
          </div>

          <div className="motion-stagger mt-5 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-3">
              <div className="text-[11px] font-black text-white/40">มูลค่ารวม</div>
              <div className="mt-1 text-lg font-black text-white">{fmt(originalTotal)}</div>
            </div>
            <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-3">
              <div className="text-[11px] font-black text-cyan-100/65">ลดจาก Bundle</div>
              <div className="mt-1 text-lg font-black text-cyan-100">{fmt(bundleDiscount)}</div>
            </div>
            <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-3">
              <div className="text-[11px] font-black text-emerald-100/65">จ่ายจริง</div>
              <div className="mt-1 text-lg font-black text-emerald-100">{fmt(total)}</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/28 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-black text-white">สินค้าในชุด</div>
              <div className="text-xs font-bold text-white/35">{items.length} รายการ</div>
            </div>
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={`${item.bundle_item_id || item.product_id}-${item.product_option?.id || 'default'}`} className="motion-card motion-hover flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-2.5">
                  {item.product_image_url ? (
                    <img src={item.product_image_url} alt={item.product_name} className="h-11 w-11 shrink-0 rounded-xl border border-white/10 object-cover" />
                  ) : (
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[10px] font-black text-white/30">ITEM</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-black text-white">{item.product_name}</div>
                      <StockBadge item={item} />
                    </div>
                    {item.product_option?.label ? <div className="mt-0.5 truncate text-[11px] font-bold text-cyan-100/65">{item.product_option.label}</div> : null}
                    <div className="mt-0.5 text-xs font-bold text-white/35">x{item.qty} · {fmt(item.subtotal_points)} พ้อย</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/24 p-3">
            <div className="grid gap-2 sm:flex">
              <input
                className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-cyan-300/35"
                placeholder="โค้ดส่วนลด"
                value={couponInput}
                onChange={(event) => setCouponInput(event.target.value)}
                disabled={buyStatus === 'working'}
              />
              <button type="button" onClick={applyCoupon} disabled={buyStatus === 'working' || quoteStatus === 'loading'} className="h-11 shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white/80 hover:bg-white/[0.1] disabled:opacity-50">
                ใช้โค้ด
              </button>
            </div>
            {appliedCoupon && !couponError ? (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-emerald-200">
                <span>ใช้โค้ด {appliedCoupon}{couponDiscount > 0 ? ` ลด ${fmt(couponDiscount)} พ้อย` : ''}</span>
                <button type="button" className="text-white/45 hover:text-white" onClick={() => { setAppliedCoupon(''); setCouponInput('') }}>ลบ</button>
              </div>
            ) : null}
            {couponError ? <div className="mt-2 text-xs font-bold text-rose-200">{couponError}</div> : null}
            <DiscountBreakdown quote={quote} />
          </div>

          {quote?.available === false ? <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100">มีสินค้าบางรายการไม่พอสำหรับ Bundle นี้</div> : null}
          {buyError ? <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100">{buyError}</div> : null}
          {successData ? (
            <div className="motion-card mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3">
              <div className="text-sm font-black text-emerald-100">สั่งซื้อสำเร็จแล้ว</div>
              <div className="mt-1 text-xs font-bold text-emerald-100/65">เลขออเดอร์ {successData?.order?.ref || successData?.order?.id}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/inbox" className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black text-black">เปิดกล่องรับของ</Link>
                <Link to="/history/purchases" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/80">ดูประวัติ</Link>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handlePurchase}
            disabled={isUnavailable || buyStatus === 'working' || buyStatus === 'success' || quoteStatus === 'loading'}
            className="mt-4 h-12 w-full rounded-2xl bg-cyan-500 px-5 text-sm font-black text-white shadow-[0_18px_42px_rgba(6,182,212,0.22)] hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
          >
            {buyStatus === 'working'
              ? 'กำลังดำเนินการ...'
              : isExpired
                ? 'Bundle หมดเวลาแล้ว'
                : notStarted
                  ? 'ยังไม่เปิดขาย'
                  : quote?.available === false
                    ? 'สินค้าในชุดไม่พอ'
                    : `ซื้อ Bundle · ${fmt(total)} พ้อย`}
          </button>
        </aside>
      </section>

      {bundle.description ? (
        <section className="motion-card rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-5">
          <div className="text-sm font-black text-white">รายละเอียด</div>
          <p className="mt-3 whitespace-pre-line text-sm font-medium leading-7 text-white/58">{bundle.description}</p>
        </section>
      ) : null}
    </div>
  )
}
