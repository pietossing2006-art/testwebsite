import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { fetchJson, getAuthToken, resolveImageUrl } from '../api.js'
import { normalizeGrowthCampaigns } from '../components/growth/growthDisplayUtils.js'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../uiImageSettings.js'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion.jsx'

function HeroSplitTitle({ title }) {
  const containerRef = useRef(null)

  const wordData = useMemo(() => {
    const raw = String(title || 'VxperS Store').trim()
    const words = raw.split(/\s+/).filter(Boolean)
    const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter(['th', 'en'], { granularity: 'grapheme' })
      : null

    return words.map((word) => {
      const chars = segmenter
        ? [...segmenter.segment(word)].map((s) => s.segment)
        : Array.from(word)
      return { word, chars }
    })
  }, [title])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chars = el.querySelectorAll('.split-char')
    if (!chars || chars.length === 0) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        chars,
        {
          opacity: 0,
          y: 28,
          rotateX: -45,
          scale: 0.9,
          filter: 'blur(4px)',
        },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.65,
          ease: 'power3.out',
          stagger: 0.03,
        }
      )
    }, el)

    return () => ctx.revert()
  }, [title])

  return (
    <h1
      ref={containerRef}
      className="font-display text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl select-none"
      style={{ perspective: 1000 }}
    >
      {wordData.map((item, wIdx) => (
        <span key={`w-${wIdx}`} className="inline-block whitespace-nowrap mr-[0.28em] last:mr-0">
          {item.chars.map((char, cIdx) => (
            <span
              key={`c-${wIdx}-${cIdx}`}
              className="split-char inline-block will-change-transform bg-gradient-to-r from-slate-900 via-sky-900 to-sky-600 bg-clip-text text-transparent"
              style={{ display: 'inline-block', transformOrigin: '50% 100%' }}
            >
              {char}
            </span>
          ))}
        </span>
      ))}
    </h1>
  )
}

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

function CountdownPill({ endsAt, tone = 'amber' }) {
  const time = useCountdown(endsAt)
  if (!time) return null
  const pad = (value) => String(value).padStart(2, '0')
  const color = tone === 'violet'
    ? 'text-violet-950 bg-violet-100 border-violet-300 shadow-xs'
    : 'text-amber-950 bg-gradient-to-r from-amber-200/90 to-amber-100 border-amber-300 shadow-xs'

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-black tabular-nums ${color}`}>
      <span className="text-amber-600 animate-pulse text-[11px]">⏰</span>
      <span className="text-[10px] font-bold text-amber-800">หมดใน</span>
      <span className="font-extrabold tracking-tight text-amber-950">
        {time.d > 0 ? `${time.d}ว ` : ''}{pad(time.h)}:{pad(time.m)}:{pad(time.s)}
      </span>
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
    <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-8 text-center">
      <div>
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-sky-200 bg-white shadow-sm text-sky-600">
          <IconPlaceholder className="h-5 w-5" />
        </div>
        <div className="mt-3 text-sm font-black text-slate-800">{title}</div>
        {description ? <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div> : null}
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
      to={`/p/${product.slug || product.id}`}
      className={`g2a-card group block bg-white ${compact ? '' : 'p-3'}`}
    >
      <div className={`relative overflow-hidden bg-sky-50/50 ${compact ? '' : 'rounded-xl border border-sky-100'}`} style={{ aspectRatio: imageRatio }}>
        {/* Top badges bar - vertically stacked on left to never collide with instant pill on right */}
        <div className="absolute inset-x-2.5 top-2.5 z-10 flex items-start justify-between gap-1 pointer-events-none">
          <div className="flex flex-col items-start gap-1 max-w-[62%] pointer-events-auto">
            {product.badge ? (
              <span className="rounded-md border border-rose-400 bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white shadow-md">
                {product.badge}
              </span>
            ) : null}
            {product.promo_is_flash_sale ? (
              <span className="rounded-md border border-amber-300 bg-gradient-to-r from-amber-500 to-rose-500 px-2 py-0.5 text-[10px] font-black text-white shadow-md">
                ⚡ Flash Sale
              </span>
            ) : product.promo_badge_text ? (
              <span className="rounded-md border border-sky-400 bg-sky-600 px-2 py-0.5 text-[10px] font-black text-white shadow-md">
                {product.promo_badge_text}
              </span>
            ) : price.hasPromo ? (
              <span className="g2a-badge-discount shadow-lg">
                {price.discountBadge}
              </span>
            ) : null}
          </div>

          {/* Instant delivery pill */}
          <div className="pointer-events-auto shrink-0">
            <span className="g2a-badge-instant backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ส่งทันที
            </span>
          </div>
        </div>

        {product.image_url ? (
          <img
            src={resolveImageUrl(product.image_url)}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className={`motion-image absolute inset-0 h-full w-full ${forceFit ? 'object-cover' : 'object-contain'} transition-transform duration-500 group-hover:scale-108`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <IconPlaceholder />
          </div>
        )}
      </div>
      <div className={compact ? 'p-3' : 'pt-3'}>
        <div className="truncate text-sm font-extrabold text-slate-900 transition-colors group-hover:text-sky-600">{product.name}</div>
        
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div>
            <div className="text-xs text-slate-500 font-medium">เริ่มต้น</div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-amber-500 group-hover:text-amber-600 transition-colors">
                {price.hasPromo ? price.discountedLabel : price.priceLabel}
              </span>
              <span className="text-[10px] font-bold text-amber-600">พ้อยท์</span>
            </div>
          </div>
          {price.hasPromo ? (
            <span className="text-[11px] font-semibold text-slate-400 line-through">
              {price.priceLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-sky-100 pt-2 text-[11px]">
          <span className={`font-bold ${isOutOfStock ? 'text-rose-600' : 'text-emerald-600'}`}>
            {isOutOfStock ? '● สินค้าหมด' : '● มีสินค้าพร้อมส่ง'}
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
        <div key={product.id} className="w-[min(220px,78vw)] shrink-0">
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
        <div key={item} className="h-48 animate-pulse rounded-2xl border border-sky-100 bg-sky-50" />
      ))}
    </div>
  )
}

export default function Home() {
  const [categories, setCategories] = useState([])
  const [featuredProducts, setFeaturedProducts] = useState([])
  const [showcaseProducts, setShowcaseProducts] = useState([])
  const [bundles, setBundles] = useState([])
  const [growthCampaigns, setGrowthCampaigns] = useState([])
  const [optionStockByProduct, setOptionStockByProduct] = useState({})
  const [uiImageSettings, setUiImageSettings] = useState(DEFAULT_UI_IMAGE_SETTINGS)
  const [homepageSettings, setHomepageSettings] = useState(DEFAULT_HOMEPAGE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [hasToken, setHasToken] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const onChange = () => {
      const nextHasToken = Boolean(getAuthToken())
      setHasToken(nextHasToken)
      setAuthChecked(!nextHasToken)
    }
    window.addEventListener('auth_token_changed', onChange)
    return () => window.removeEventListener('auth_token_changed', onChange)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function syncAuthState() {
      try {
        await fetchJson('/api/me')
        if (!cancelled) {
          setHasToken(true)
          setAuthChecked(true)
        }
      } catch (error) {
        if (!cancelled) {
          if (error?.status === 401) setHasToken(false)
          setAuthChecked(true)
        }
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
      const [cat, settings, bundlesRes, campaignRes, dbFeaturedRes] = await Promise.all([
        fetchJson('/api/categories').catch(() => ({ categories: [] })),
        fetchJson('/api/ui-settings').catch(() => ({})),
        fetchJson('/api/bundles').catch(() => ({})),
        fetchJson('/api/growth-campaigns/active').catch(() => null),
        fetchJson('/api/products?category=featured').catch(() => ({ products: [] })),
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
      const dbFeatured = Array.isArray(dbFeaturedRes?.products) ? dbFeaturedRes.products : []

      const manualFeat = featIds.map((id) => byIdMap.get(id)).filter(Boolean)
      const manualShow = showIds.map((id) => byIdMap.get(id)).filter(Boolean)

      const finalFeatured = manualFeat.length > 0
        ? manualFeat
        : dbFeatured

      const finalShowcase = manualShow.length > 0
        ? manualShow
        : dbFeatured

      setCategories(Array.isArray(cat?.categories) ? cat.categories : [])
      setBundles(Array.isArray(bundlesRes?.bundles) ? bundlesRes.bundles : [])
      setGrowthCampaigns(normalizeGrowthCampaigns(campaignRes))
      setUiImageSettings(normalizeUiImageSettings(settings?.image_settings))
      setHomepageSettings(merged)
      setFeaturedProducts(finalFeatured)
      setShowcaseProducts(finalShowcase)
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

  const mainCategories = useMemo(() => {
    const isSub = (c) => Boolean(c?.parent_id) && Number(c.parent_id) > 0
    const roots = categories.filter((c) => !isSub(c))
    return roots.length > 0 ? roots : categories
  }, [categories])

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
    <div className="space-y-8 sm:space-y-12">
      {/* 🌟 Live Alert & Announcement Ticker */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-cyan-50 to-sky-50 px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-sky-900">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-base">🚀</span>
          <span>ระบบจัดส่งสินค้าอัตโนมัติ 24 ชม. รับของได้ทันทีหลังชำระเงิน</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs font-bold text-sky-700">
          <span>⚡ สต็อกแน่นพร้อมส่ง</span>
          <span>•</span>
          <span>🔒 ปลอดภัย 100%</span>
        </div>
      </div>

      {/* 🚀 Dual-Hero Main Showcase (Reimagined Layout) */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white/80 p-5 sm:p-8 lg:p-10 shadow-[0_10px_40px_rgba(2,132,199,0.08)] backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-100/40 via-transparent to-cyan-50/50 pointer-events-none" />

        <div className="relative grid min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,440px)] xl:gap-12">
          {/* Left Column: Hero Headline & CTAs */}
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1.5 text-xs font-black text-sky-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ร้านค้าออนไลน์ระบบออโต้พร้อมใช้งาน
            </div>

            <HeroSplitTitle title={heroTitle} />

            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-600">
              <span className="bg-sky-100/80 px-2.5 py-1 rounded-lg">{heroSubtitle}</span>
              <span>•</span>
              <span className="text-slate-500">Instant Digital Delivery 24/7</span>
            </div>

            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base font-normal">
              {heroDesc}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to={heroBtnLink}
                className="ui-btn-primary h-12 px-7 text-sm font-black shadow-lg shadow-sky-500/20"
              >
                <span>⚡ {heroBtnText}</span>
              </Link>
              {!authChecked ? (
                <span className="ui-btn h-12 px-6 text-sm font-bold opacity-60 pointer-events-none">
                  กำลังตรวจสอบ...
                </span>
              ) : !hasToken ? (
                <Link
                  to="/register"
                  className="ui-btn h-12 px-6 text-sm font-bold text-slate-700 hover:text-sky-600"
                >
                  สมัครสมาชิก
                </Link>
              ) : (
                <Link
                  to="/topup/angpao"
                  className="ui-btn-primary h-12 px-7 text-sm font-black shadow-lg shadow-sky-500/20"
                >
                  💎 เติมเงินทันที
                </Link>
              )}
            </div>

            {/* Quick Stats Badges */}
            <div className="grid grid-cols-3 gap-2.5 pt-4 sm:gap-4 border-t border-sky-100">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3 text-center sm:text-left sm:p-4">
                <div className="text-xl sm:text-2xl font-black text-sky-600">{mainCategories.length}</div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-500">หมวดหมู่สินค้า</div>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-emerald-50/60 p-3 text-center sm:text-left sm:p-4">
                <div className="text-xl sm:text-2xl font-black text-emerald-600">24/7</div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-500">ระบบอัตโนมัติ</div>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-amber-50/60 p-3 text-center sm:text-left sm:p-4">
                <div className="text-xl sm:text-2xl font-black text-amber-600">{featuredProducts.length + showcaseProducts.length}</div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-500">สินค้าแนะนำ</div>
              </div>
            </div>
          </div>

          {/* Right Column: Hot Featured Showcase Spotlight */}
          <div className="relative">
            <div className="rounded-3xl border border-sky-200 bg-white/90 p-4 sm:p-5 shadow-xl backdrop-blur-xl ring-1 ring-sky-500/10">
              <div className="mb-3.5 flex items-center justify-between border-b border-sky-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔥</span>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">Featured Spotlight</span>
                </div>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
                  HOT DEALS
                </span>
              </div>

              {loading ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="h-40 animate-pulse rounded-2xl border border-sky-100 bg-sky-50" />
                  ))}
                </div>
              ) : featuredProducts.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
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
                <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 p-6 text-center">
                  <div>
                    <div className="text-sm font-bold text-slate-700">ยังไม่มีสินค้าเด่น</div>
                    <div className="mt-1 text-xs text-slate-400">เพิ่มสินค้าเด่นได้จากหน้า Admin Settings</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 🏷️ Interactive Category Quick-Pills Bar */}
      {mainCategories.length > 0 ? (
        <section className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <Link
            to="/categories"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-sky-300 bg-sky-500 text-white px-4 py-2.5 text-xs font-black shadow-md shadow-sky-500/20 transition-all hover:bg-sky-600"
          >
            <span>🎮</span>
            <span>
              สินค้าทั้งหมด
              {mainCategories.reduce((sum, c) => sum + (Number(c.total_product_count ?? c.product_count) || 0), 0) > 0
                ? ` (${mainCategories.reduce((sum, c) => sum + (Number(c.total_product_count ?? c.product_count) || 0), 0)})`
                : ''}
            </span>
          </Link>
          {mainCategories.map((cat) => (
            <Link
              key={cat.id}
              to={`/category/${cat.slug}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:border-sky-400 hover:bg-sky-50 hover:text-sky-600"
            >
              <span>{cat.icon || '💎'}</span>
              <span>{cat.name}</span>
              {Number(cat.total_product_count ?? cat.product_count) > 0 ? (
                <span className="rounded-md bg-sky-100/70 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                  {cat.total_product_count ?? cat.product_count}
                </span>
              ) : null}
            </Link>
          ))}
        </section>
      ) : null}

      {/* ⚡ Flash Deals & Growth Campaigns */}
      {growthCampaigns.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-5 sm:p-6 shadow-md">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-amber-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">⚡</span>
                <h2 className="text-lg font-black text-slate-900">Flash Deals & โปรโมชั่นพิเศษ</h2>
              </div>
              <div className="mt-0.5 text-xs font-semibold text-amber-800/70">ดีลจำกัดเวลาและสิทธิพิเศษสำหรับคุณ</div>
            </div>
            <Link to="/categories" className="shrink-0 text-xs font-black text-amber-700 hover:text-amber-900">
              ดูดีลทั้งหมด →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {growthCampaigns.slice(0, 6).map((campaign) => (
              <Link
                key={campaign.id}
                to={campaign.primaryLink || '/categories'}
                className="g2a-card block p-4 transition-all hover:border-amber-300 bg-white"
              >
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-block">
                  {campaign.badgeText}
                </div>
                <div className="mt-2 text-sm font-black text-slate-900">{campaign.title}</div>
                {campaign.description ? (
                  <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{campaign.description}</div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* 🌟 Showcase Scroller Section */}
      {showcaseEnabled && showcaseProducts.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4 border-b border-sky-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <h2 className="font-display text-2xl font-black text-slate-900">{showcaseTitle}</h2>
              </div>
              <div className="mt-0.5 text-xs font-semibold text-slate-500">
                {showcaseProducts.length > 4 ? 'เลื่อนดูสินค้าที่คัดสรรมาเพื่อคุณ' : `${showcaseProducts.length} รายการ`}
              </div>
            </div>
            <Link to={heroBtnLink} className="shrink-0 text-xs font-bold text-sky-600 hover:text-sky-800 transition-colors">
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

      {/* 🎁 Value Bundles */}
      {visibleBundles.length > 0 ? (
        <section className="space-y-4">
          <div className="border-b border-sky-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🎁</span>
              <h2 className="font-display text-2xl font-black text-slate-900">Bundle ราคาพิเศษ</h2>
            </div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">ซื้อเป็นชุด ประหยัดกว่า และคุ้มค่ากว่า</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBundles.map((bundle) => (
              <Link
                key={bundle.id}
                to={`/bundle/${bundle.id}`}
                className="g2a-card block p-4 bg-white"
              >
                {bundle.image_url ? (
                  <div className="mb-3 overflow-hidden rounded-xl border border-sky-100" style={{ aspectRatio: '16/7' }}>
                    <img src={resolveImageUrl(bundle.image_url)} alt={bundle.name} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                  </div>
                ) : null}
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <span className="rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-black text-purple-700">Bundle</span>
                  {Number(bundle.item_count) > 0 ? (
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">{bundle.item_count} รายการ</span>
                  ) : null}
                </div>
                <div className="truncate text-sm font-extrabold text-slate-900">{bundle.name}</div>
                <div className="mt-1.5 text-base font-black text-purple-700">{fmt(bundle.bundle_price)} <span className="text-xs font-semibold text-slate-500">พ้อยท์</span></div>
                <CountdownPill endsAt={bundle.ends_at} tone="violet" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* 🗂️ Explore Categories Grid */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4 border-b border-sky-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base">🗂️</span>
              <h2 className="font-display text-2xl font-black text-slate-900">หมวดหมู่สินค้า</h2>
            </div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">เลือกดูสินค้าตามหมวดหมู่ที่คุณสนใจ</div>
          </div>
          <Link to="/categories" className="shrink-0 text-xs font-bold text-sky-600 hover:text-sky-800 transition-colors">
            ดูทั้งหมด ({mainCategories.length}) →
          </Link>
        </div>

        {loading ? (
          <HomeSkeleton />
        ) : mainCategories.length === 0 ? (
          <EmptyState title="No categories yet" description="Categories configured in admin will appear here." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mainCategories.slice(0, 8).map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.slug}`}
                className="g2a-card group block bg-white"
              >
                <div className="relative overflow-hidden bg-sky-50" style={{ aspectRatio: uiImageSettings.home_categories_ratio }}>
                  {category.image_url ? (
                    <img
                      src={resolveImageUrl(category.image_url)}
                      alt={category.name}
                      loading="lazy"
                      decoding="async"
                      className={`motion-image absolute inset-0 h-full w-full ${uiImageSettings.home_categories_force_fit ? 'object-fill' : 'object-contain'} transition-transform duration-500 group-hover:scale-108`}
                    />
                  ) : (
                    <div className="grid h-full place-items-center bg-sky-100/50">
                      {category.icon ? (
                        <span className="text-4xl">{category.icon}</span>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-8 w-8 text-sky-300" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6A1.125 1.125 0 0 1 2.25 10.875v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
                        </svg>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="truncate text-sm font-black text-slate-900 group-hover:text-sky-600 transition-colors">
                    {category.icon ? <span className="mr-1.5">{category.icon}</span> : null}
                    {category.name}
                  </div>
                  <div className="mt-1 line-clamp-1 text-xs text-slate-500">{String(category.description || '').trim() || `/${category.slug}`}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 🛡️ Trust & Security 4-Card Section */}
      <section className="rounded-3xl border border-sky-200 bg-white/90 p-6 sm:p-8 shadow-sm">
        <div className="mb-6 text-center max-w-xl mx-auto">
          <div className="text-xs font-black uppercase tracking-wider text-sky-600">จุดเด่นของเรา</div>
          <h2 className="font-display text-2xl font-black text-slate-900 mt-1">ทำไมต้องเลือกซื้อกับเรา</h2>
        </div>
        <div className={`grid gap-4 ${trustData.length <= 3 ? 'sm:grid-cols-3' : trustData.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
          {trustData.map((item, idx) => (
            <div key={`trust-${idx}`} className="flex items-start gap-3.5 rounded-2xl border border-sky-100 bg-sky-50/50 p-4 transition-all hover:bg-sky-50 hover:border-sky-200">
              {item.icon ? (
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-sky-200 bg-white text-sky-600 shadow-sm">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </div>
              ) : null}
              <div>
                <div className="text-sm font-black text-slate-900">{item.title}</div>
                {item.desc ? <div className="mt-1 text-xs leading-relaxed text-slate-600">{item.desc}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ❓ FAQ Accordion */}
      <section className="space-y-4">
        <div className="rounded-3xl border border-sky-200 bg-white/90 p-6 sm:p-8 shadow-sm">
          <div className="mb-5">
            <h2 className="font-display text-2xl font-black text-slate-900">คำถามที่พบบ่อย</h2>
            <div className="mt-1 text-xs font-semibold text-slate-500">ข้อมูลและคำแนะนำก่อนการสั่งซื้อสินค้า</div>
          </div>
          <Accordion type="single" collapsible className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-sky-50/50 px-5">
            {faqData.map((item, idx) => (
              <AccordionItem key={`faq-${idx}`} value={`faq-${idx}`} className="border-sky-100 py-1">
                <AccordionTrigger className="text-slate-900 font-bold hover:text-sky-600 text-sm py-3.5">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-black text-sky-600">Q</span>
                    <span>{item.question}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-xs sm:text-sm leading-relaxed pb-4 pl-7.5">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  )
}
