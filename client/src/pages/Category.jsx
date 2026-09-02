import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchJson, resolveImageUrl } from '../api.js'
import { normalizeGrowthCampaigns } from '../components/growth/growthDisplayUtils.js'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../uiImageSettings.js'

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

  return { minPrice, maxPrice, priceLabel, discountedLabel, hasPromo, discountBadge }
}

function getStockState(product, optionStock) {
  const options = Array.isArray(product?.product_options) ? product.product_options : []
  if (options.length === 0) {
    const rawStock = Number(product?.stock ?? 0)
    const isUnlimited = Boolean(product?.is_unlimited_stock)
    const out = !isUnlimited && rawStock <= 0
    const isLow = !isUnlimited && rawStock > 0 && rawStock <= 5
    return {
      out,
      isLow,
      stockCount: rawStock,
      label: isUnlimited ? 'ไม่จำกัด' : out ? 'สินค้าหมด' : `เหลือ ${rawStock.toLocaleString()} ชิ้น`,
      detail: '',
    }
  }

  const rows = options
    .map((option) => {
      const id = String(option?.id ?? '')
      const row = optionStock && typeof optionStock === 'object' ? optionStock[id] : null
      const remaining = row?.remaining == null ? null : Number(row.remaining)
      return id ? { label: String(option?.label ?? id), remaining } : null
    })
    .filter(Boolean)
  const remainingValues = rows.map((row) => row.remaining).filter((value) => value != null && Number.isFinite(value))
  const total = remainingValues.length > 0 ? remainingValues.reduce((sum, value) => sum + value, 0) : null
  const out = remainingValues.length > 0 && total <= 0
  const isLow = total != null && total > 0 && total <= 5
  const detail = rows
    .slice(0, 3)
    .map((row) => `${row.label}: ${row.remaining == null ? '-' : Math.max(0, Number(row.remaining) || 0)}`)
    .join(' • ')

  return {
    out,
    isLow,
    stockCount: total,
    label: out ? 'ตัวเลือกหมด' : total == null ? 'มีตัวเลือกสินค้า' : `เหลือรวม ${Math.max(0, Number(total) || 0).toLocaleString()} ชิ้น`,
    detail,
  }
}

function ProductSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="h-[420px] animate-pulse rounded-3xl border border-sky-200 bg-white" />
      ))}
    </div>
  )
}

function ProductCard({ product, optionStock, imageRatio, forceFit }) {
  const price = getProductPrice(product)
  const stock = getStockState(product, optionStock)
  const description = String(product.description || '').trim()
  const hasVolumePricing = Array.isArray(product?.volume_pricing) && product.volume_pricing.length > 0
  const tags = Array.isArray(product?.tags) ? product.tags : []

  return (
    <Link
      to={`/p/${product.slug || product.id}`}
      className="group flex min-h-[430px] flex-col overflow-hidden rounded-3xl border border-sky-200 bg-white p-3.5 shadow-sm transition-all duration-250 hover:border-sky-400 hover:shadow-xl hover:-translate-y-1"
    >
      <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-sky-50/60" style={{ aspectRatio: imageRatio }}>
        {/* Badges on Top Left */}
        <div className="absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-1 max-w-[65%]">
          {product.badge ? (
            <span className="rounded-full border border-rose-400 bg-rose-500 px-2.5 py-0.5 text-[10px] font-black text-white shadow-md">
              {product.badge}
            </span>
          ) : null}
          {product.promo_is_flash_sale ? (
            <span className="rounded-full border border-amber-300 bg-gradient-to-r from-amber-500 to-rose-500 px-2.5 py-0.5 text-[10px] font-black text-white shadow-md">
              ⚡ Flash Sale
            </span>
          ) : product.promo_badge_text ? (
            <span className="rounded-full border border-sky-400 bg-sky-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-md">
              {product.promo_badge_text}
            </span>
          ) : price.hasPromo ? (
            <span className="rounded-full border border-amber-400 bg-amber-500 px-2.5 py-0.5 text-[10px] font-black text-white shadow-md">
              {price.discountBadge}
            </span>
          ) : null}
          {hasVolumePricing ? (
            <span className="rounded-full border border-emerald-400 bg-emerald-600 px-2 py-0.5 text-[9px] font-black text-white shadow-md">
              ราคาส่ง
            </span>
          ) : null}
        </div>

        {/* Low Stock Warning Badge */}
        {stock.isLow ? (
          <div className="absolute right-2.5 top-2.5 z-10">
            <span className="rounded-full border border-amber-300 bg-amber-100/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-black text-amber-800 shadow-sm animate-pulse">
              ⚡ เหลือ {stock.stockCount} ชิ้น
            </span>
          </div>
        ) : null}

        {product.image_url ? (
          <img
            src={resolveImageUrl(product.image_url)}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className={`motion-image absolute inset-0 h-full w-full ${forceFit ? 'object-cover' : 'object-contain'} transition duration-500 group-hover:scale-105`}
          />
        ) : (
          <div className="grid h-full place-items-center bg-sky-50">
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-sky-200" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pb-1 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-black leading-6 text-slate-900 transition group-hover:text-sky-600">{product.name}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-base font-black text-sky-600">{price.hasPromo ? price.discountedLabel : price.priceLabel} พ้อยท์</span>
              {price.hasPromo ? <span className="text-xs font-bold text-slate-400 line-through">{price.priceLabel} พ้อยท์</span> : null}
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${stock.out ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {stock.out ? 'หมด' : 'พร้อม'}
          </span>
        </div>

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t, idx) => (
              <span key={idx} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/50 px-3 py-2">
          <div className="text-[11px] font-bold text-slate-700">{stock.label}</div>
          {stock.detail ? <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{stock.detail}</div> : null}
        </div>

        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
          {description || 'ดูรายละเอียดสินค้า ตัวเลือก และขั้นตอนการรับสินค้าได้ในหน้าสินค้า'}
        </p>

        <div className="mt-auto pt-4">
          <span className={`inline-flex h-10 w-full items-center justify-center rounded-xl px-4 text-xs font-black ${stock.out ? 'border border-sky-200 bg-slate-50 text-slate-500' : 'ui-btn-primary w-full'}`}>
            {stock.out ? 'ดูรายละเอียด' : 'เลือกสินค้า'}
          </span>
        </div>
      </div>
    </Link>
  )
}

function ProductListItem({ product, optionStock, imageRatio }) {
  const price = getProductPrice(product)
  const stock = getStockState(product, optionStock)
  const description = String(product.description || '').trim()
  const hasVolumePricing = Array.isArray(product?.volume_pricing) && product.volume_pricing.length > 0
  const tags = Array.isArray(product?.tags) ? product.tags : []

  return (
    <Link
      to={`/p/${product.slug || product.id}`}
      className="group flex flex-col sm:flex-row items-stretch gap-4 overflow-hidden rounded-3xl border border-sky-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-sky-400 hover:shadow-lg"
    >
      <div className="relative shrink-0 w-full sm:w-48 overflow-hidden rounded-2xl border border-sky-100 bg-sky-50/60" style={{ aspectRatio: imageRatio || 16 / 10 }}>
        {product.badge ? (
          <span className="absolute left-2 top-2 z-10 rounded-full border border-rose-400 bg-rose-500 px-2 py-0.5 text-[9px] font-black text-white shadow-sm">
            {product.badge}
          </span>
        ) : null}
        {product.image_url ? (
          <img
            src={resolveImageUrl(product.image_url)}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-sky-50 text-sky-200">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-sky-600 transition">{product.name}</h3>
              {product.sku && <div className="text-[11px] font-mono text-slate-400">SKU: {product.sku}</div>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black ${stock.out ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {stock.out ? 'หมด' : stock.label}
            </span>
          </div>

          <p className="mt-1 line-clamp-2 text-xs text-slate-500 leading-relaxed">{description || 'รายละเอียดสินค้า...'}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tags.map((t, i) => (
              <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                #{t}
              </span>
            ))}
            {hasVolumePricing && (
              <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                🏷️ ราคาส่งตามจำนวน
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            <div className="text-base font-black text-sky-600">
              {price.hasPromo ? price.discountedLabel : price.priceLabel} พ้อยท์
            </div>
            {price.hasPromo && <div className="text-xs font-bold text-slate-400 line-through">{price.priceLabel} พ้อยท์</div>}
          </div>
          <span className={`inline-flex h-9 items-center px-4 rounded-xl text-xs font-black ${stock.out ? 'border border-sky-200 bg-slate-50 text-slate-500' : 'ui-btn-primary'}`}>
            {stock.out ? 'ดูรายละเอียด' : 'เลือกสินค้า'}
          </span>
        </div>
      </div>
    </Link>
  )
}

function SubcategoryCard({ category, count = 0, delayClass = '' }) {
  const description = String(category.description || '').trim()

  return (
    <div
      className={`group g2a-card relative flex flex-col overflow-hidden rounded-3xl border border-sky-200/80 bg-white shadow-sm transition-all duration-300 hover:border-sky-400 hover:shadow-xl hover:-translate-y-1 ${delayClass}`}
    >
      <Link to={`/category/${category.slug}`} className="relative block overflow-hidden bg-sky-50/60" style={{ aspectRatio: '16 / 7' }}>
        {category.image_url ? (
          <img
            src={resolveImageUrl(category.image_url)}
            alt={category.name}
            loading="lazy"
            decoding="async"
            className="motion-image absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-sky-100 via-sky-50 to-cyan-100">
            <span className="text-4xl filter drop-shadow-sm">{category.icon || '⚡'}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />

        {/* Top Badges */}
        <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5 z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white/95 px-2.5 py-0.5 text-[11px] font-black text-sky-800 backdrop-blur shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm" />
            {count.toLocaleString()} รายการ
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-950/75 px-2 py-0.5 text-[10px] font-bold text-sky-200 backdrop-blur">
            หมวดย่อย
          </span>
        </div>
      </Link>

      {/* Card Info & Action Footer */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 group-hover:text-sky-600 transition-colors">
            {category.icon && <span className="text-xl">{category.icon}</span>}
            <span className="line-clamp-1">{category.name}</span>
          </h3>
          {description ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500 leading-relaxed">
              {description}
            </p>
          ) : (
            <p className="mt-1 line-clamp-1 text-xs text-slate-400">
              คลิกเพื่อดูสินค้าในหมวดหมู่นี้
            </p>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-sky-100 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-500">
              มีสินค้าทั้งหมด {count.toLocaleString()} ชิ้น
            </div>
            <div className="text-[10.5px] font-mono text-slate-400">/{category.slug}</div>
          </div>
          <Link
            to={`/category/${category.slug}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 text-xs font-black shadow-md hover:shadow-lg transition-all shrink-0"
          >
            <span>สินค้าทั้งหมด</span>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function Category() {
  const { slug } = useParams()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [growthCampaigns, setGrowthCampaigns] = useState([])
  const [optionStockByProduct, setOptionStockByProduct] = useState({})
  const [uiImageSettings, setUiImageSettings] = useState(DEFAULT_UI_IMAGE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('recommended')
  const [stockFilter, setStockFilter] = useState('all')
  const [badgeFilter, setBadgeFilter] = useState('all')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [catRes, prodRes, growthRes, settingsRes] = await Promise.all([
          fetchJson('/api/categories').catch(() => null),
          fetchJson(`/api/products?category=${encodeURIComponent(slug)}`).catch(() => null),
          fetchJson('/api/growth/campaigns/active').catch(() => null),
          fetchJson('/api/ui-settings').catch(() => null),
        ])
        if (!cancelled) {
          setCategories(Array.isArray(catRes?.categories) ? catRes.categories : [])
          setProducts(Array.isArray(prodRes?.products) ? prodRes.products : [])
          setGrowthCampaigns(normalizeGrowthCampaigns(growthRes?.campaigns))
          setUiImageSettings(normalizeUiImageSettings(settingsRes?.image_settings))
        }
      } catch {
        if (!cancelled) {
          setCategories([])
          setProducts([])
          setGrowthCampaigns([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    function onRefresh() {
      load()
    }
    window.addEventListener('app_refresh', onRefresh)
    return () => {
      cancelled = true
      window.removeEventListener('app_refresh', onRefresh)
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false

    async function loadOptionStock() {
      const optionProductIds = products
        .filter((p) => Array.isArray(p.product_options) && p.product_options.length > 0)
        .map((p) => p.id)
      if (optionProductIds.length === 0) {
        setOptionStockByProduct({})
        return
      }

      try {
        const data = await fetchJson(`/api/products/option-stock-bulk?ids=${encodeURIComponent(optionProductIds.join(','))}`)
        if (!cancelled && data?.ok && data.stockByProduct) {
          setOptionStockByProduct(data.stockByProduct)
        }
      } catch {
        // non-blocking
      }
    }

    loadOptionStock()
    return () => {
      cancelled = true
    }
  }, [products])

  const current = useMemo(() => categories.find((category) => category.slug === slug), [categories, slug])
  const parentCategory = useMemo(() => {
    if (!current?.parent_id) return null
    return categories.find((c) => Number(c.id) === Number(current.parent_id)) || null
  }, [categories, current])

  const subcategories = useMemo(() => {
    if (!current) return []
    return categories.filter((c) => Number(c.parent_id) === Number(current.id))
  }, [categories, current])

  const siblingCategories = useMemo(() => {
    if (!parentCategory) return []
    return categories.filter((c) => Number(c.parent_id) === Number(parentCategory.id))
  }, [categories, parentCategory])

  const productMeta = useMemo(() => {
    return products.map((product) => {
      const price = getProductPrice(product)
      const stock = getStockState(product, optionStockByProduct?.[String(product.id)])
      return { product, price, stock }
    })
  }, [optionStockByProduct, products])

  const availableCount = productMeta.filter((item) => !item.stock.out).length
  const promoCount = productMeta.filter((item) => item.price.hasPromo).length

  const availableBadges = useMemo(() => {
    const set = new Set()
    products.forEach((p) => {
      if (p.badge) set.add(p.badge)
    })
    return Array.from(set)
  }, [products])

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const minP = Number(minPrice)
    const maxP = Number(maxPrice)

    const filtered = productMeta.filter(({ product, price, stock }) => {
      const searchable = `${product.name || ''} ${product.description || ''} ${product.sku || ''} ${(Array.isArray(product.tags) ? product.tags : []).join(' ')}`.toLowerCase()
      const matchQuery = !q || searchable.includes(q)
      const matchStock = stockFilter === 'all' || (stockFilter === 'available' ? !stock.out : stock.out)
      const matchBadge = badgeFilter === 'all' || product.badge === badgeFilter
      const matchMinPrice = !Number.isFinite(minP) || minP <= 0 || price.minPrice >= minP
      const matchMaxPrice = !Number.isFinite(maxP) || maxP <= 0 || price.maxPrice <= maxP
      return matchQuery && matchStock && matchBadge && matchMinPrice && matchMaxPrice
    })

    filtered.sort((a, b) => {
      if (sortBy === 'price_low') return a.price.minPrice - b.price.minPrice
      if (sortBy === 'price_high') return b.price.maxPrice - a.price.maxPrice
      if (sortBy === 'name') return String(a.product.name || '').localeCompare(String(b.product.name || ''))
      return Number(b.price.hasPromo) - Number(a.price.hasPromo)
    })
    return filtered.map((item) => item.product)
  }, [productMeta, query, sortBy, stockFilter, badgeFilter, minPrice, maxPrice])

  return (
    <div className="space-y-7 fade-in-up">
      {/* Breadcrumbs Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-semibold text-slate-500 overflow-x-auto py-1">
        <Link to="/" className="hover:text-sky-600 transition flex items-center gap-1 shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          หน้าแรก
        </Link>
        <span className="text-slate-300">/</span>
        <Link to="/categories" className="hover:text-sky-600 transition shrink-0">
          หมวดหมู่ทั้งหมด
        </Link>
        {parentCategory && (
          <>
            <span className="text-slate-300">/</span>
            <Link to={`/category/${parentCategory.slug}`} className="hover:text-sky-600 transition shrink-0 flex items-center gap-1">
              {parentCategory.icon && <span>{parentCategory.icon}</span>}
              <span>{parentCategory.name}</span>
            </Link>
          </>
        )}
        <span className="text-slate-300">/</span>
        <span className="text-sky-700 font-bold shrink-0 flex items-center gap-1">
          {current?.icon && <span>{current.icon}</span>}
          <span>{current?.name ?? slug}</span>
        </span>
      </nav>

      {/* Category Hero Header */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white/90 p-6 sm:p-8 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_8%_0%,rgba(56,189,248,0.12),transparent_62%),radial-gradient(45%_70%_at_100%_8%,rgba(6,182,212,0.10),transparent_60%)]" />

        <div className="motion-stagger relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-sky-600">
                {parentCategory ? 'หมวดหมู่ย่อย' : 'หมวดหมู่สินค้า'}
              </span>
              {parentCategory && (
                <Link
                  to={`/category/${parentCategory.slug}`}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100 transition shadow-2xs"
                >
                  <span>↳ อยู่ภายใต้: {parentCategory.icon ? `${parentCategory.icon} ` : ''}{parentCategory.name}</span>
                </Link>
              )}
            </div>

            <h1 className="font-display mt-2 text-3xl font-black leading-tight text-slate-900 md:text-4xl flex items-center gap-2.5">
              {current?.icon && <span className="text-3xl md:text-4xl">{current.icon}</span>}
              <span>{current?.name ?? slug}</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              {String(current?.description || '').trim() || 'เลือกสินค้าในหมวดนี้ พร้อมดูราคา โปรโมชัน และสถานะสต็อกก่อนสั่งซื้อ'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3.5 sm:p-4 text-center sm:text-left">
              <div className="text-2xl font-black text-slate-900">{products.length}</div>
              <div className="mt-0.5 text-xs font-bold text-slate-500">ทั้งหมด</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3.5 sm:p-4 text-center sm:text-left">
              <div className="text-2xl font-black text-emerald-600">{availableCount}</div>
              <div className="mt-0.5 text-xs font-bold text-slate-500">พร้อมขาย</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3.5 sm:p-4 text-center sm:text-left">
              <div className="text-2xl font-black text-sky-600">{promoCount}</div>
              <div className="mt-0.5 text-xs font-bold text-slate-500">โปรโมชัน</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CASE 1: Has Subcategories -> Render Subcategory Cards Grid ── */}
      {subcategories.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-sky-600">Select Category</div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900">
                เลือกหมวดหมู่ที่คุณสนใจ
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                เลือกหมวดหมู่ย่อยใน <strong className="text-slate-800">{current?.name}</strong> เพื่อเข้าดูรายการสินค้าเฉพาะกลุ่ม
              </p>
            </div>
            <span className="rounded-2xl border border-sky-200 bg-white px-3.5 py-1.5 text-xs font-black text-sky-700 shadow-2xs">
              {subcategories.length} หมวดหมู่ย่อย
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {subcategories.map((sub, idx) => (
              <SubcategoryCard
                key={sub.id}
                category={sub}
                count={sub.product_count ?? 0}
                delayClass={['fade-in-delay-0', 'fade-in-delay-1', 'fade-in-delay-2', 'fade-in-delay-3'][idx % 4]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sibling Subcategories Cards (When viewing a subcategory) */}
      {parentCategory && siblingCategories.length > 1 && (
        <section className="rounded-3xl border border-sky-200/80 bg-sky-50/60 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <span className="text-xs font-black text-slate-700">
                หมวดหมู่อื่นๆ ในกลุ่ม {parentCategory.name}:
              </span>
              <p className="text-[11px] text-slate-500">สลับไปยังหมวดหมู่ย่อยอื่นในกลุ่มเดียวกัน</p>
            </div>
            <Link
              to={`/category/${parentCategory.slug}`}
              className="inline-flex items-center gap-1 rounded-xl bg-white border border-sky-200 px-3 py-1 text-xs font-bold text-sky-600 hover:bg-sky-50 shadow-2xs transition"
            >
              <span>⬅️ ดูทั้งหมดใน {parentCategory.name}</span>
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {siblingCategories
              .filter((sib) => sib.slug !== slug)
              .map((sib) => (
                <SubcategoryCard key={sib.id} category={sib} count={sib.product_count ?? 0} />
              ))}
          </div>
        </section>
      )}

      {/* Growth Campaigns / Flash Deals */}
      {growthCampaigns.length > 0 ? (
        <section className="rounded-3xl border border-sky-200 bg-sky-50/70 p-6 shadow-sm">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Flash Deal พิเศษ</h2>
              <div className="mt-0.5 text-xs font-semibold text-slate-500">ดีลเวลาจำกัดและสินค้าจำนวนจำกัด</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {growthCampaigns.slice(0, 6).map((campaign) => (
              <Link key={campaign.id} to={campaign.primaryLink || '/categories'} className="rounded-2xl border border-sky-200 bg-white p-4 transition-all hover:border-sky-400 hover:shadow-md">
                <div className="text-xs font-black uppercase tracking-wider text-sky-600">{campaign.badgeText}</div>
                <div className="mt-1.5 text-base font-black text-slate-900">{campaign.title}</div>
                {campaign.description ? <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{campaign.description}</div> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Advanced Filters & Search Bar */}
      <section className="rounded-3xl border border-sky-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto]">
          <label className="relative block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
              </svg>
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="ui-field h-11 pl-11 text-sm font-semibold"
              placeholder="ค้นหาชื่อ, SKU หรือแท็ก..."
            />
          </label>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="ui-field h-11 text-xs font-bold">
            <option value="recommended">เรียงแนะนำ</option>
            <option value="price_low">ราคาต่ำไปสูง</option>
            <option value="price_high">ราคาสูงไปต่ำ</option>
            <option value="name">ชื่อสินค้า ก-ฮ</option>
          </select>
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="ui-field h-11 text-xs font-bold">
            <option value="all">สต็อก: ทั้งหมด</option>
            <option value="available">พร้อมขายเท่านั้น</option>
            <option value="out">สินค้าหมด</option>
          </select>

          {/* Grid / List View Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              className={`p-2 rounded-xl transition ${viewMode === 'grid' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setViewMode('grid')}
              title="มุมมองตาราง (Grid)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              type="button"
              className={`p-2 rounded-xl transition ${viewMode === 'list' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setViewMode('list')}
              title="มุมมองรายการ (List)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Secondary filters: Price range & Badges */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500">ช่วงราคา:</span>
            <input
              type="number"
              placeholder="ต่ำสุด"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-20 rounded-xl border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-sky-500"
            />
            <span className="text-slate-400">-</span>
            <input
              type="number"
              placeholder="สูงสุด"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-20 rounded-xl border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-sky-500"
            />
          </div>

          {availableBadges.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <span className="font-bold text-slate-500">ป้าย:</span>
              <button
                type="button"
                className={`rounded-lg px-2 py-0.5 font-bold transition ${badgeFilter === 'all' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                onClick={() => setBadgeFilter('all')}
              >
                ทั้งหมด
              </button>
              {availableBadges.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`rounded-lg px-2 py-0.5 font-bold transition ${badgeFilter === b ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  onClick={() => setBadgeFilter(b)}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Product List/Grid View */}
      {loading ? (
        <ProductSkeleton />
      ) : visibleProducts.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="motion-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                optionStock={optionStockByProduct?.[String(product.id)]}
                imageRatio={uiImageSettings.category_products_ratio}
                forceFit={uiImageSettings.category_products_force_fit}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleProducts.map((product) => (
              <ProductListItem
                key={product.id}
                product={product}
                optionStock={optionStockByProduct?.[String(product.id)]}
                imageRatio={uiImageSettings.category_products_ratio}
              />
            ))}
          </div>
        )
      ) : (
        <section className="grid min-h-[280px] place-items-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/40 p-8 text-center">
          <div>
            <div className="text-lg font-black text-slate-900">ไม่พบสินค้า</div>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">ลองเปลี่ยนคำค้นหา ตัวกรอง หรือกลับไปเลือกหมวดหมู่อื่น</p>
            <Link to="/categories" className="ui-btn-primary mt-4 inline-flex h-11 items-center px-5 text-sm font-black">
              ดูหมวดหมู่ทั้งหมด
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
