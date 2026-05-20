import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchJson, getAuthToken } from '../api.js'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../uiImageSettings.js'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion.jsx'

const DEFAULT_HOMEPAGE_SETTINGS = {
  hero_title: '',
  hero_subtitle: '',
  hero_description: '',
  hero_button_text: '',
  hero_button_link: '',
  showcase_enabled: true,
  showcase_title: 'สินค้าแนะนำ',
  showcase_scroll_interval: 2600,
  showcase_max_items: 12,
  featured_product_ids: [],
  showcase_product_ids: [],
  faq_items: [],
  trust_items: [],
}

const DEFAULT_FAQ_ITEMS = [
  {
    question: 'สั่งซื้อแล้วได้รับสินค้าเมื่อไหร่?',
    answer: 'ระบบจะส่งมอบสินค้าอัตโนมัติหลังชำระเงินสำเร็จ โดยส่วนใหญ่ใช้เวลาไม่เกิน 1-2 นาที',
  },
  {
    question: 'สินค้าแบบมีตัวเลือกดูราคาตรงไหน?',
    answer: 'หน้าแต่ละสินค้าจะแสดงราคาตามตัวเลือกที่เลือก และบนหน้าแรกจะแสดงเป็นช่วงราคาต่ำสุดถึงสูงสุด',
  },
  {
    question: 'เติมเงินแล้วไม่เข้า ต้องทำอย่างไร?',
    answer: 'ตรวจสอบประวัติเติมเงินก่อน หากสถานะยังไม่อัปเดตสามารถเปิดเคส Support พร้อมแนบหลักฐานได้ทันที',
  },
  {
    question: 'ติดต่อทีมงานได้ช่องทางไหน?',
    answer: 'ใช้หน้า Support ในระบบได้ตลอด พร้อมแนบรูปหรือรายละเอียดเพื่อให้ทีมงานช่วยตรวจสอบได้เร็วขึ้น',
  },
]

const DEFAULT_TRUST_ITEMS = [
  {
    icon: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
    title: 'ปลอดภัย',
    desc: 'ระบบตรวจสอบคำสั่งซื้อและประวัติครบถ้วน',
  },
  {
    icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
    title: 'รวดเร็ว',
    desc: 'สินค้าดิจิทัลพร้อมส่งอัตโนมัติ',
  },
  {
    icon: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155',
    title: 'มีทีมช่วยเหลือ',
    desc: 'เปิดเคสติดตามได้จากหน้า Support',
  },
]

function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString()
}

function computeDiscountedUnitPrice(unitPrice, promoPercent, promoAmount) {
  const price = Number(unitPrice)
  if (!Number.isFinite(price) || price < 0) return 0
  let discount = 0
  if (Number.isFinite(promoPercent) && promoPercent > 0) discount = Math.floor((price * promoPercent) / 100)
  else if (Number.isFinite(promoAmount) && promoAmount > 0) discount = Math.floor(promoAmount)
  return Math.max(0, price - Math.min(price, discount))
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

function getProductPrice(product) {
  const options = Array.isArray(product?.product_options) ? product.product_options : []
  const optionPrices = options
    .map((option) => (option?.price_points == null || option?.price_points === '' ? null : Number(option.price_points)))
    .filter((price) => Number.isFinite(price) && price >= 0)
  const prices = optionPrices.length > 0 ? optionPrices : [Number(product?.price ?? 0)]
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceLabel = minPrice === maxPrice ? fmt(minPrice) : `${fmt(minPrice)} - ${fmt(maxPrice)}`
  const promoPercent = Number(product?.promo_discount_percent ?? 0) > 0 ? Number(product.promo_discount_percent) : 0
  const promoAmount = Number(product?.promo_discount_amount_points ?? 0) > 0 ? Number(product.promo_discount_amount_points) : 0
  const hasPromo = Number(product?.promo_discount_points ?? 0) > 0 || promoPercent > 0 || promoAmount > 0
  const discountedPrices = hasPromo ? prices.map((price) => computeDiscountedUnitPrice(price, promoPercent, promoAmount)) : prices
  const minDiscounted = Math.min(...discountedPrices)
  const maxDiscounted = Math.max(...discountedPrices)
  const discountedLabel = minDiscounted === maxDiscounted ? fmt(minDiscounted) : `${fmt(minDiscounted)} - ${fmt(maxDiscounted)}`
  const discountBadge = hasPromo
    ? promoPercent > 0
      ? `-${Math.trunc(promoPercent)}%`
      : promoAmount > 0
        ? `-${fmt(promoAmount)} พ้อยท์`
        : 'ลดราคา'
    : ''

  return { priceLabel, discountedLabel, hasPromo, discountBadge }
}

function CountdownPill({ endsAt, tone = 'cyan' }) {
  const time = useCountdown(endsAt)
  if (!time) return null
  const pad = (value) => String(value).padStart(2, '0')
  const color = tone === 'violet' ? 'text-violet-200 bg-violet-500/10 border-violet-300/15' : 'text-cyan-200 bg-cyan-500/10 border-cyan-300/15'

  return (
    <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold tabular-nums ${color}`}>
      <span>หมดใน</span>
      <span>{time.d > 0 ? `${time.d}วัน ` : ''}{pad(time.h)}:{pad(time.m)}:{pad(time.s)}</span>
    </div>
  )
}

function IconPlaceholder({ className = 'h-8 w-8 text-white/15' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
    </svg>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="home-empty-state">
      <div>
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-500/10">
          <IconPlaceholder className="h-5 w-5 text-cyan-200/70" />
        </div>
        <div className="mt-3 text-sm font-black text-white/85">{title}</div>
        {description ? <div className="mt-1 text-xs leading-5 text-white/45">{description}</div> : null}
      </div>
    </div>
  )
}

function ProductCard({ product, optionStock, imageRatio, forceFit = true, compact = false }) {
  const options = Array.isArray(product?.product_options) ? product.product_options : []
  const price = getProductPrice(product)
  const legacyOutOfStock = !product.is_unlimited_stock && Number(product.stock ?? 0) <= 0
  const optionRows = options
    .map((option) => {
      const id = String(option?.id ?? '')
      const row = optionStock && typeof optionStock === 'object' ? optionStock[id] : null
      const remaining = row?.remaining == null ? null : Number(row.remaining)
      return id ? { remaining } : null
    })
    .filter(Boolean)
  const optionRemaining = optionRows.map((row) => row.remaining).filter((value) => value != null && Number.isFinite(value))
  const optionOutOfStock = options.length > 0 && optionRemaining.length > 0 && optionRemaining.reduce((sum, value) => sum + value, 0) <= 0
  const isOutOfStock = options.length > 0 ? optionOutOfStock : legacyOutOfStock

  return (
    <Link
      to={`/product/${product.id}`}
      className={`home-product-card group motion-card motion-hover motion-soft-glow motion-sweep block overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] transition duration-200 hover:border-cyan-300/25 hover:bg-white/[0.055] ${compact ? '' : 'p-3'}`}
    >
      <div className={`home-product-image relative overflow-hidden bg-white/[0.04] ${compact ? '' : 'rounded-xl border border-white/[0.06]'}`} style={{ aspectRatio: imageRatio }}>
        {price.hasPromo ? (
          <span className="absolute left-2 top-2 z-10 rounded-full border border-cyan-300/20 bg-cyan-500/20 px-2 py-1 text-[10px] font-black text-cyan-100 backdrop-blur">
            {price.discountBadge}
          </span>
        ) : null}
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className={`motion-image absolute inset-0 h-full w-full ${forceFit ? 'object-fill' : 'object-contain'} transition duration-500 group-hover:scale-105`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <IconPlaceholder />
          </div>
        )}
      </div>
      <div className={compact ? 'p-3' : 'pt-3'}>
        <div className="truncate text-sm font-bold text-white/90 transition group-hover:text-cyan-200">{product.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-emerald-300">{price.hasPromo ? price.discountedLabel : price.priceLabel} พ้อยท์</span>
          {price.hasPromo ? <span className="text-[10px] font-bold text-white/35 line-through">{price.priceLabel}</span> : null}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isOutOfStock ? 'bg-red-500/10 text-red-200' : 'bg-emerald-500/10 text-emerald-200'}`}>
            {isOutOfStock ? 'สินค้าหมด' : 'พร้อมสั่งซื้อ'}
          </span>
          {product.promo_ends_at ? <CountdownPill endsAt={product.promo_ends_at} /> : null}
        </div>
      </div>
    </Link>
  )
}

function ShowcaseScroller({ products, optionStockByProduct, imageRatio, forceFit, scrollInterval }) {
  const trackRef = useRef(null)
  const pausedRef = useRef(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return undefined
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 4)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [products.length])

  useEffect(() => {
    if (!overflows) return undefined
    const interval = Math.max(800, Number(scrollInterval) || 2600)
    const timer = setInterval(() => {
      const el = trackRef.current
      if (!el || pausedRef.current) return
      const cardWidth = 236
      const maxScroll = el.scrollWidth - el.clientWidth
      if (el.scrollLeft >= maxScroll - 4) el.scrollTo({ left: 0, behavior: 'smooth' })
      else el.scrollBy({ left: cardWidth, behavior: 'smooth' })
    }, interval)
    return () => clearInterval(timer)
  }, [overflows, scrollInterval])

  return (
    <div
      ref={trackRef}
      className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin"
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
      onTouchStart={() => { pausedRef.current = true }}
      onTouchEnd={() => { setTimeout(() => { pausedRef.current = false }, 3000) }}
    >
      {products.map((product) => (
        <div key={product.id} className="w-[220px] shrink-0">
          <ProductCard
            product={product}
            optionStock={optionStockByProduct?.[String(product.id)]}
            imageRatio={imageRatio}
            forceFit={forceFit}
          />
        </div>
      ))}
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.035]" />
      ))}
    </div>
  )
}

export default function Home() {
  const [categories, setCategories] = useState([])
  const [featuredProducts, setFeaturedProducts] = useState([])
  const [showcaseProducts, setShowcaseProducts] = useState([])
  const [bundles, setBundles] = useState([])
  const [optionStockByProduct, setOptionStockByProduct] = useState({})
  const [uiImageSettings, setUiImageSettings] = useState(DEFAULT_UI_IMAGE_SETTINGS)
  const [homepageSettings, setHomepageSettings] = useState(DEFAULT_HOMEPAGE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [hasToken, setHasToken] = useState(Boolean(getAuthToken()))

  useEffect(() => {
    const onChange = () => setHasToken(Boolean(getAuthToken()))
    window.addEventListener('auth_token_changed', onChange)
    return () => window.removeEventListener('auth_token_changed', onChange)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function syncAuthState() {
      try {
        await fetchJson('/api/me')
        if (!cancelled) setHasToken(true)
      } catch (error) {
        if (!cancelled && error?.status === 401) setHasToken(false)
      }
    }
    syncAuthState()
    window.addEventListener('app_refresh', syncAuthState)
    return () => {
      cancelled = true
      window.removeEventListener('app_refresh', syncAuthState)
    }
  }, [])

  const loadAll = useCallback(async (signal) => {
    try {
      const [cat, settings, bundlesRes] = await Promise.all([
        fetchJson('/api/categories'),
        fetchJson('/api/ui-settings'),
        fetchJson('/api/bundles').catch(() => ({})),
      ])
      if (signal?.aborted) return

      const hp = settings?.homepage_settings && typeof settings.homepage_settings === 'object' ? settings.homepage_settings : {}
      const merged = { ...DEFAULT_HOMEPAGE_SETTINGS, ...hp }
      const featIds = Array.isArray(merged.featured_product_ids) ? merged.featured_product_ids.filter((id) => Number.isFinite(id) && id > 0) : []
      const showIds = Array.isArray(merged.showcase_product_ids) ? merged.showcase_product_ids.filter((id) => Number.isFinite(id) && id > 0) : []
      const allIds = [...new Set([...featIds, ...showIds])]
      let byIdProducts = []

      if (allIds.length > 0) {
        try {
          const res = await fetchJson(`/api/products/by-ids?ids=${allIds.join(',')}`)
          byIdProducts = Array.isArray(res?.products) ? res.products : []
        } catch {
          byIdProducts = []
        }
      }

      if (signal?.aborted) return
      const byIdMap = new Map(byIdProducts.map((product) => [Number(product.id), product]))
      setCategories(Array.isArray(cat?.categories) ? cat.categories : [])
      setBundles(Array.isArray(bundlesRes?.bundles) ? bundlesRes.bundles : [])
      setUiImageSettings(normalizeUiImageSettings(settings?.image_settings))
      setHomepageSettings(merged)
      setFeaturedProducts(featIds.map((id) => byIdMap.get(id)).filter(Boolean))
      setShowcaseProducts(showIds.map((id) => byIdMap.get(id)).filter(Boolean))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    loadAll(ac.signal)
    const onRefresh = () => loadAll(ac.signal)
    window.addEventListener('app_refresh', onRefresh)
    return () => {
      ac.abort()
      window.removeEventListener('app_refresh', onRefresh)
    }
  }, [loadAll])

  useEffect(() => {
    let cancelled = false
    async function loadOptionStock() {
      const unique = [...new Map([...featuredProducts, ...showcaseProducts].map((product) => [product.id, product])).values()]
      const withOptions = unique.filter((product) => (Array.isArray(product?.product_options) ? product.product_options : []).length > 0)
      if (withOptions.length === 0) {
        setOptionStockByProduct({})
        return
      }
      try {
        const ids = withOptions.map((product) => product.id).join(',')
        const data = await fetchJson(`/api/products/option-stock-bulk?ids=${ids}`)
        if (!cancelled) setOptionStockByProduct(data?.option_stock ?? {})
      } catch {
        if (!cancelled) setOptionStockByProduct({})
      }
    }
    loadOptionStock()
    return () => {
      cancelled = true
    }
  }, [featuredProducts, showcaseProducts])

  const visibleBundles = useMemo(() => {
    const now = Date.now()
    return bundles.filter((bundle) => {
      const expired = bundle.ends_at && new Date(bundle.ends_at).getTime() < now
      const notStarted = bundle.starts_at && new Date(bundle.starts_at).getTime() > now
      return bundle.is_active && !expired && !notStarted
    })
  }, [bundles])

  const heroTitle = homepageSettings.hero_title || 'VxperS Store'
  const heroSubtitle = homepageSettings.hero_subtitle || 'Digital & Gaming Store'
  const heroDesc = homepageSettings.hero_description || 'ร้านค้าไอเท็มเกมและสินค้าดิจิทัลครบวงจร เติมพ้อยท์ได้ทันทีหลังชำระเงิน พร้อมระบบอัตโนมัติที่รวดเร็วและตรวจสอบย้อนหลังได้'
  const heroBtnText = homepageSettings.hero_button_text || 'ช้อปเลย'
  const heroBtnLink = homepageSettings.hero_button_link || '/categories'
  const showcaseTitle = homepageSettings.showcase_title || 'สินค้าแนะนำ'
  const showcaseEnabled = homepageSettings.showcase_enabled !== false
  const scrollInterval = Number(homepageSettings.showcase_scroll_interval) || 2600
  const trustData = Array.isArray(homepageSettings.trust_items) && homepageSettings.trust_items.length > 0 ? homepageSettings.trust_items : DEFAULT_TRUST_ITEMS
  const faqData = Array.isArray(homepageSettings.faq_items) && homepageSettings.faq_items.length > 0 ? homepageSettings.faq_items : DEFAULT_FAQ_ITEMS

  return (
    <div className="space-y-10 sm:space-y-14">
      <section className="home-hero home-premium-panel relative overflow-hidden rounded-3xl border border-white/[0.1] px-4 py-6 sm:px-7 sm:py-8 md:px-10 md:py-12">
        <div className="absolute inset-0 grid-pattern opacity-25" />
        <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent" />
        <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-cyan-500/[0.08] blur-[90px]" />

        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_430px] xl:gap-9">
          <div className="fade-in-up motion-stagger">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/[0.08] px-3.5 py-1.5 text-[11px] font-bold text-emerald-100/85">
              <span className="hero-status-dot-pulse h-2 w-2 rounded-full bg-emerald-300" />
              ร้านค้าออนไลน์พร้อมใช้งาน
            </div>

            <h1 className="font-display mt-5 max-w-4xl text-4xl font-black leading-[1.04] text-white sm:text-5xl lg:text-6xl xl:text-7xl">
              <span className="bg-gradient-to-r from-white via-cyan-50 to-cyan-200 bg-clip-text text-transparent">{heroTitle}</span>
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/46">
              <span>{heroSubtitle}</span>
              <span className="hidden h-px w-10 bg-gradient-to-r from-cyan-300/35 to-transparent sm:block" />
              <span className="text-cyan-100/55">Instant digital delivery</span>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-[15px]">{heroDesc}</p>

            <div className="mt-7 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap">
              <Link to={heroBtnLink} className="ui-btn-primary w-full px-7 py-2.5 text-sm font-bold sm:w-auto">
                {heroBtnText}
              </Link>
              {!hasToken ? (
                <Link to="/register" className="ui-btn w-full px-7 py-2.5 text-sm font-bold sm:w-auto">
                  สมัครสมาชิก
                </Link>
              ) : (
                <Link to="/topup/angpao" className="ui-btn w-full px-7 py-2.5 text-sm font-bold sm:w-auto">
                  เติมเงิน
                </Link>
              )}
            </div>

            <div className="motion-stagger mt-7 grid max-w-md grid-cols-3 gap-2 sm:mt-8 sm:gap-3">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3">
                <div className="text-2xl font-black text-cyan-200">{categories.length}</div>
                <div className="mt-1 text-[10px] font-bold text-white/45">หมวดหมู่</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3">
                <div className="text-2xl font-black text-emerald-300">24/7</div>
                <div className="mt-1 text-[10px] font-bold text-white/45">อัตโนมัติ</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3">
                <div className="text-2xl font-black text-white">{featuredProducts.length + showcaseProducts.length}</div>
                <div className="mt-1 text-[10px] font-bold text-white/45">แนะนำ</div>
              </div>
            </div>
          </div>

          <div className="fade-in-up fade-in-delay-1">
            <div className="home-premium-panel motion-hover motion-soft-glow rounded-3xl border border-white/[0.09] bg-black/15 p-3">
              <div className="mb-3 flex items-center justify-between px-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-400/75" />
                  <span className="h-2 w-2 rounded-full bg-white/25" />
                  <span className="h-2 w-2 rounded-full bg-white/15" />
                </div>
                <span className="rounded-full border border-cyan-300/15 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/75">Featured</span>
              </div>
              {loading ? (
                <div className="motion-stagger grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.04]" />)}
                </div>
              ) : featuredProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {featuredProducts.slice(0, 4).map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      optionStock={optionStockByProduct?.[String(product.id)]}
                      imageRatio={uiImageSettings.home_featured_ratio}
                      forceFit={uiImageSettings.home_featured_force_fit}
                      compact
                    />
                  ))}
                </div>
              ) : (
                <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.025] p-8 text-center">
                  <div>
                    <div className="text-sm font-bold text-white/80">ยังไม่มีสินค้าเด่น</div>
                    <div className="mt-1 text-xs text-white/40">เพิ่มสินค้าเด่นได้จากหน้า Admin Settings</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {showcaseEnabled && showcaseProducts.length > 0 ? (
        <section className="fade-in-up">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-black text-white">{showcaseTitle}</h2>
              <div className="mt-1 text-xs font-semibold text-white/40">
                {showcaseProducts.length > 4 ? 'เลื่อนดูสินค้าที่คัดไว้สำหรับคุณ' : `${showcaseProducts.length} รายการ`}
              </div>
            </div>
            <Link to={heroBtnLink} className="shrink-0 text-xs font-bold text-cyan-200/80 transition hover:text-cyan-100">
              ดูทั้งหมด →
            </Link>
          </div>
          <ShowcaseScroller
            products={showcaseProducts}
            optionStockByProduct={optionStockByProduct}
            imageRatio={uiImageSettings.home_featured_ratio}
            forceFit={uiImageSettings.home_featured_force_fit}
            scrollInterval={scrollInterval}
          />
        </section>
      ) : null}

      {visibleBundles.length > 0 ? (
        <section className="fade-in-up">
          <div className="mb-4">
            <h2 className="font-display text-2xl font-black text-white">Bundle ราคาพิเศษ</h2>
            <div className="mt-1 text-xs font-semibold text-white/40">ซื้อเป็นชุด ประหยัดกว่า และดูแลง่ายกว่า</div>
          </div>
          <div className="motion-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBundles.map((bundle) => (
              <Link
                key={bundle.id}
                to={`/bundle/${bundle.id}`}
                className="home-offer-card group motion-card motion-hover motion-soft-glow motion-sweep overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-violet-300/25 hover:bg-white/[0.055]"
              >
                {bundle.image_url ? (
                  <div className="mb-3 overflow-hidden rounded-xl border border-white/[0.06]" style={{ aspectRatio: '16/7' }}>
                    <img src={bundle.image_url} alt={bundle.name} className="motion-image h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  </div>
                ) : null}
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-violet-300/25 bg-violet-500/15 px-2 py-0.5 text-[10px] font-black text-violet-200">Bundle</span>
                  {Number(bundle.item_count) > 0 ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/50">{bundle.item_count} รายการ</span>
                  ) : null}
                </div>
                <div className="truncate text-sm font-bold text-white/90">{bundle.name}</div>
                <div className="mt-1.5 text-sm font-black text-violet-200">{fmt(bundle.bundle_price)} <span className="text-xs font-semibold text-violet-300/60">พ้อยท์</span></div>
                <CountdownPill endsAt={bundle.ends_at} tone="violet" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="fade-in-up">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-black text-white">หมวดหมู่สินค้า</h2>
            <div className="mt-1 text-xs font-semibold text-white/40">เริ่มเลือกจากหมวดที่ต้องการ แล้วไปต่อได้เร็วขึ้น</div>
          </div>
          <Link to="/categories" className="shrink-0 text-xs font-bold text-cyan-200/80 transition hover:text-cyan-100">
            ดูทั้งหมด →
          </Link>
        </div>

        {loading ? (
          <HomeSkeleton />
        ) : categories.length === 0 ? (
          <EmptyState title="No categories yet" description="Categories configured in admin will appear here." />
        ) : (
          <div className="motion-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.slug}`}
                className="group motion-card motion-hover motion-soft-glow overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] transition hover:border-cyan-300/25 hover:bg-white/[0.055]"
              >
                <div className="relative overflow-hidden" style={{ aspectRatio: uiImageSettings.home_categories_ratio }}>
                  {category.image_url ? (
                    <img
                      src={category.image_url}
                      alt={category.name}
                      loading="lazy"
                      decoding="async"
                      className={`motion-image absolute inset-0 h-full w-full ${uiImageSettings.home_categories_force_fit ? 'object-fill' : 'object-contain'} transition duration-500 group-hover:scale-105`}
                    />
                  ) : (
                    <div className="grid h-full place-items-center bg-cyan-500/5">
                      <svg viewBox="0 0 24 24" className="h-8 w-8 text-white/15" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6A1.125 1.125 0 0 1 2.25 10.875v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="truncate text-sm font-black text-white">{category.name}</div>
                  <div className="mt-1 line-clamp-1 text-xs text-white/45">{String(category.description || '').trim() || `/${category.slug}`}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="fade-in-up relative overflow-hidden rounded-3xl border border-white/[0.08] glass p-5 sm:p-6">
        <div className="absolute inset-0 grid-pattern opacity-25" />
        <div className={`motion-stagger relative grid gap-4 ${trustData.length <= 3 ? 'sm:grid-cols-3' : trustData.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
          {trustData.map((item, idx) => (
            <div key={`trust-${idx}`} className="motion-card motion-hover flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
              {item.icon ? (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-500/10">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-cyan-300" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </div>
              ) : null}
              <div>
                <div className="text-sm font-black text-white">{item.title}</div>
                {item.desc ? <div className="mt-1 text-xs leading-5 text-white/50">{item.desc}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="fade-in-up">
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
          <div className="mb-3">
            <h2 className="font-display text-2xl font-black text-white">คำถามที่พบบ่อย</h2>
            <div className="mt-1 text-xs font-semibold text-white/40">ข้อมูลสั้น ๆ ก่อนสั่งซื้อ</div>
          </div>
          <Accordion type="single" collapsible>
            {faqData.map((item, idx) => (
              <AccordionItem key={`faq-${idx}`} value={`faq-${idx}`} className={idx === faqData.length - 1 ? 'border-b-0' : ''}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  )
}
