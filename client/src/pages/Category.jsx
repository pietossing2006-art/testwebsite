import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchJson } from '../api.js'
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
    const out = !product?.is_unlimited_stock && Number(product?.stock ?? 0) <= 0
    return {
      out,
      label: product?.is_unlimited_stock ? 'ไม่จำกัด' : out ? 'สินค้าหมด' : `เหลือ ${Number(product?.stock ?? 0).toLocaleString()} ชิ้น`,
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
  const detail = rows
    .slice(0, 3)
    .map((row) => `${row.label}: ${row.remaining == null ? '-' : Math.max(0, Number(row.remaining) || 0)}`)
    .join(' • ')

  return {
    out,
    label: out ? 'ตัวเลือกหมด' : total == null ? 'มีตัวเลือกสินค้า' : `เหลือรวม ${Math.max(0, Number(total) || 0).toLocaleString()} ชิ้น`,
    detail,
  }
}

function ProductSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="h-[420px] animate-pulse rounded-3xl border border-white/[0.06] bg-white/[0.035]" />
      ))}
    </div>
  )
}

function ProductCard({ product, optionStock, imageRatio, forceFit }) {
  const price = getProductPrice(product)
  const stock = getStockState(product, optionStock)
  const description = String(product.description || '').trim()

  return (
    <Link
      to={`/product/${product.id}`}
      className="group motion-card motion-hover motion-soft-glow motion-sweep flex min-h-[430px] flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] p-3 transition duration-200 hover:border-cyan-300/25 hover:bg-white/[0.055] hover:shadow-[0_24px_70px_rgba(0,0,0,0.38)]"
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black/25" style={{ aspectRatio: imageRatio }}>
        {price.hasPromo ? (
          <div className="absolute left-2 top-2 z-10 flex gap-1.5">
            <span className="rounded-full border border-cyan-300/20 bg-cyan-500/20 px-2.5 py-1 text-[10px] font-black text-cyan-100 backdrop-blur">
              ลดราคา
            </span>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black text-emerald-100 backdrop-blur">
              {price.discountBadge}
            </span>
          </div>
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
          <div className="grid h-full place-items-center bg-cyan-500/5">
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-white/15" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pb-1 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-black leading-6 text-white transition group-hover:text-cyan-100">{product.name}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-emerald-300">{price.hasPromo ? price.discountedLabel : price.priceLabel} พ้อยท์</span>
              {price.hasPromo ? <span className="text-xs font-bold text-white/35 line-through">{price.priceLabel} พ้อยท์</span> : null}
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${stock.out ? 'bg-red-500/10 text-red-200' : 'bg-emerald-500/10 text-emerald-200'}`}>
            {stock.out ? 'หมด' : 'พร้อม'}
          </span>
        </div>

        <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="text-[11px] font-bold text-white/60">{stock.label}</div>
          {stock.detail ? <div className="mt-1 line-clamp-1 text-[11px] text-white/38">{stock.detail}</div> : null}
        </div>

        <p className="mt-3 line-clamp-3 text-xs leading-6 text-white/48">
          {description || 'ดูรายละเอียดสินค้า ตัวเลือก และขั้นตอนการรับสินค้าได้ในหน้าสินค้า'}
        </p>

        <div className="mt-auto pt-4">
          <span className={`inline-flex h-10 items-center justify-center rounded-2xl px-4 text-xs font-black ${stock.out ? 'border border-white/10 bg-white/[0.04] text-white/55' : 'ui-btn-primary text-white'}`}>
            {stock.out ? 'ดูรายละเอียด' : 'เลือกสินค้า'}
          </span>
        </div>
      </div>
    </Link>
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

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [cat, prod, settings, campaignRes] = await Promise.all([
          fetchJson('/api/categories'),
          fetchJson(`/api/products?category=${encodeURIComponent(slug)}`),
          fetchJson('/api/ui-settings').catch(() => ({})),
          fetchJson('/api/growth-campaigns/active').catch(() => null),
        ])
        if (!cancelled) {
          setCategories(Array.isArray(cat?.categories) ? cat.categories : [])
          setProducts(Array.isArray(prod?.products) ? prod.products : [])
          setGrowthCampaigns(normalizeGrowthCampaigns(campaignRes))
          setUiImageSettings(normalizeUiImageSettings(settings?.image_settings))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    window.addEventListener('app_refresh', load)
    return () => {
      cancelled = true
      window.removeEventListener('app_refresh', load)
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false

    async function loadOptionStock() {
      const withOptions = products.filter((product) => (Array.isArray(product?.product_options) ? product.product_options : []).length > 0)
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
  }, [products])

  const current = useMemo(() => categories.find((category) => category.slug === slug), [categories, slug])

  const productMeta = useMemo(() => {
    return products.map((product) => {
      const price = getProductPrice(product)
      const stock = getStockState(product, optionStockByProduct?.[String(product.id)])
      return { product, price, stock }
    })
  }, [optionStockByProduct, products])

  const availableCount = productMeta.filter((item) => !item.stock.out).length
  const promoCount = productMeta.filter((item) => item.price.hasPromo).length

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = productMeta.filter(({ product, stock }) => {
      const searchable = `${product.name || ''} ${product.description || ''}`.toLowerCase()
      const matchQuery = !q || searchable.includes(q)
      const matchStock = stockFilter === 'all' || (stockFilter === 'available' ? !stock.out : stock.out)
      return matchQuery && matchStock
    })
    filtered.sort((a, b) => {
      if (sortBy === 'price_low') return a.price.minPrice - b.price.minPrice
      if (sortBy === 'price_high') return b.price.maxPrice - a.price.maxPrice
      if (sortBy === 'name') return String(a.product.name || '').localeCompare(String(b.product.name || ''))
      return Number(b.price.hasPromo) - Number(a.price.hasPromo)
    })
    return filtered.map((item) => item.product)
  }, [productMeta, query, sortBy, stockFilter])

  return (
    <div className="space-y-8 fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong p-4 sm:p-7">
        <div className="absolute inset-0 scanline opacity-35" />
        <div className="absolute inset-0 grid-pattern opacity-35" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/[0.08] blur-[90px]" />
        <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-red-500/[0.05] blur-[90px]" />

        <div className="motion-stagger relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">หมวดหมู่</div>
            <h1 className="font-display mt-2 text-4xl font-black leading-tight text-white md:text-5xl">
              <span className="hero-title-glow bg-gradient-to-r from-white via-cyan-100 to-cyan-300 bg-clip-text text-transparent">{current?.name ?? slug}</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
              {String(current?.description || '').trim() || 'เลือกสินค้าในหมวดนี้ พร้อมดูราคา โปรโมชัน และสถานะสต็อกก่อนสั่งซื้อ'}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/category/${category.slug}`}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                    category.slug === slug
                      ? 'border-cyan-300/35 bg-cyan-500/15 text-cyan-100'
                      : 'border-white/10 bg-white/[0.04] text-white/62 hover:border-cyan-300/25 hover:text-white'
                  }`}
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-white">{products.length}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">ทั้งหมด</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-emerald-300">{availableCount}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">พร้อมขาย</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-cyan-200">{promoCount}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">โปร</div>
            </div>
          </div>
        </div>
      </section>

      {growthCampaigns.length > 0 ? (
        <section className="rounded-3xl border border-cyan-300/15 bg-cyan-500/10 p-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-white">Flash Deal</h2>
              <div className="mt-1 text-xs font-semibold text-cyan-100/55">ดีลเวลาจำกัดและสินค้าจำนวนจำกัด</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {growthCampaigns.slice(0, 6).map((campaign) => (
              <Link key={campaign.id} to={campaign.primaryLink || '/categories'} className="motion-card motion-hover rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/25 hover:bg-black/30">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">{campaign.badgeText}</div>
                <div className="mt-2 text-base font-black text-white">{campaign.title}</div>
                {campaign.description ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">{campaign.description}</div> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_170px]">
          <label className="relative block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
              </svg>
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="ui-field h-12 pl-11"
              placeholder="ค้นหาสินค้าในหมวดนี้"
            />
          </label>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="ui-field h-12">
            <option value="recommended">เรียงแนะนำ</option>
            <option value="price_low">ราคาต่ำไปสูง</option>
            <option value="price_high">ราคาสูงไปต่ำ</option>
            <option value="name">ชื่อสินค้า</option>
          </select>
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="ui-field h-12">
            <option value="all">ทุกสถานะ</option>
            <option value="available">พร้อมขาย</option>
            <option value="out">สินค้าหมด</option>
          </select>
        </div>
      </section>

      {loading ? (
        <ProductSkeleton />
      ) : visibleProducts.length > 0 ? (
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
        <section className="grid min-h-[280px] place-items-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.025] p-8 text-center">
          <div>
            <div className="text-lg font-black text-white">ไม่พบสินค้า</div>
            <p className="mt-2 max-w-md text-sm leading-7 text-white/45">ลองเปลี่ยนคำค้นหา ตัวกรอง หรือกลับไปเลือกหมวดหมู่อื่น</p>
            <Link to="/categories" className="ui-btn-primary mt-5 inline-flex h-11 items-center px-5 text-sm font-black">
              ดูหมวดหมู่ทั้งหมด
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
