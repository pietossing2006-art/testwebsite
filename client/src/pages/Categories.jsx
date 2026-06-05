import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchJson } from '../api.js'

function CategoryFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(80%_80%_at_50%_0%,rgba(34,211,238,0.18),transparent_62%),linear-gradient(135deg,#07111f,#020617)]">
      <svg viewBox="0 0 24 24" className="h-11 w-11 text-cyan-100/28" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
      </svg>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-3xl border border-[#152b62] bg-[#050d22] px-6 py-10 text-center">
      <div className="mx-auto h-1 w-44 overflow-hidden rounded-full bg-[#091637]">
        <div className="h-full w-1/2 animate-pulse bg-cyan-300/70" />
      </div>
      <div className="mt-4 text-sm font-black text-white/85">กำลังโหลดหมวดหมู่</div>
      <div className="mt-2 text-xs text-white/45">ระบบกำลังดึงข้อมูลสินค้าและหมวดหมู่ล่าสุด</div>
    </div>
  )
}

function CategoryCard({ category, count, delayClass }) {
  const description = String(category.description || '').trim()
  return (
    <Link
      to={`/category/${category.slug}`}
      className={`group motion-card motion-hover motion-soft-glow relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] shadow-[0_18px_60px_rgba(0,0,0,0.24)] transition duration-300 hover:border-cyan-300/28 hover:bg-white/[0.055] hover:shadow-[0_24px_80px_rgba(8,145,178,0.16)] fade-in-up ${delayClass}`}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
        {category.image_url ? (
          <img
            src={category.image_url}
            alt={category.name}
            loading="lazy"
            decoding="async"
            className="motion-image absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <CategoryFallback />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/18 to-transparent" />
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-black/34 px-3 py-1 text-[11px] font-extrabold text-cyan-50 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.7)]" />
          {count.toLocaleString()} รายการ
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h2 className="truncate text-lg font-black text-white">{category.name}</h2>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-white/58">
            {description || 'รวมสินค้าและบริการยอดนิยมในหมวดนี้'}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">/{category.slug}</span>
        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-cyan-100/80 transition group-hover:text-cyan-50">
          ดูสินค้า
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [featuredCategoryId, setFeaturedCategoryId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [catRes, productRes, settingsRes] = await Promise.all([
          fetchJson('/api/categories'),
          fetchJson('/api/products'),
          fetchJson('/api/ui-settings').catch(() => ({})),
        ])
        if (!cancelled) {
          setCategories(Array.isArray(catRes?.categories) ? catRes.categories : [])
          setProducts(Array.isArray(productRes?.products) ? productRes.products : [])
          const configuredCategoryId = Number(settingsRes?.homepage_settings?.featured_category_id)
          setFeaturedCategoryId(Number.isFinite(configuredCategoryId) && configuredCategoryId > 0 ? configuredCategoryId : null)
        }
      } catch {
        if (!cancelled) {
          setCategories([])
          setProducts([])
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
  }, [])

  const productCountByCategory = useMemo(() => {
    const map = new Map()
    products.forEach((product) => {
      const key = String(product?.category_slug || '')
      if (!key) return
      map.set(key, (map.get(key) || 0) + 1)
    })
    return map
  }, [products])

  const visibleCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((category) => {
      return String(category?.name || '').toLowerCase().includes(q)
        || String(category?.description || '').toLowerCase().includes(q)
        || String(category?.slug || '').toLowerCase().includes(q)
    })
  }, [categories, query])

  const featuredCategory = useMemo(() => {
    if (query.trim()) return visibleCategories[0]
    if (featuredCategoryId) {
      return categories.find((category) => Number(category?.id) === Number(featuredCategoryId)) || visibleCategories[0]
    }
    return visibleCategories[0]
  }, [categories, featuredCategoryId, query, visibleCategories])
  const totalProducts = products.length

  return (
    <div className="space-y-8 fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong px-4 py-7 sm:px-6 sm:py-9 md:px-8 md:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_8%_0%,rgba(34,211,238,0.16),transparent_62%),radial-gradient(45%_70%_at_100%_8%,rgba(244,63,94,0.1),transparent_62%)]" />
        <div className="motion-stagger relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-extrabold text-cyan-100">
              เลือกหมวดหมู่ที่ต้องการ
            </div>
            <h1 className="mt-4 font-display text-4xl font-semibold text-white md:text-5xl">
              หมวดหมู่ <span className="hero-title-glow bg-gradient-to-r from-white via-[#67e8f9] to-[#22d3ee] bg-clip-text text-transparent">สินค้า</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/58">
              รวมหมวดหมู่สินค้าและบริการดิจิทัลทั้งหมด เลือกหมวดที่สนใจแล้วเข้าไปดูสินค้าได้ทันที
            </p>
            <div className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                </svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="ui-field h-12 w-full pl-11 pr-4 text-sm"
                  placeholder="ค้นหาหมวดหมู่..."
                />
              </div>
              {query ? (
                <button type="button" onClick={() => setQuery('')} className="ui-btn h-12 px-4 text-xs">ล้าง</button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="text-3xl font-black text-white">{loading ? '...' : categories.length.toLocaleString()}</div>
              <div className="mt-1 text-xs font-bold text-white/45">หมวดหมู่</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="text-3xl font-black text-cyan-100">{loading ? '...' : totalProducts.toLocaleString()}</div>
              <div className="mt-1 text-xs font-bold text-white/45">สินค้าทั้งหมด</div>
            </div>
          </div>
        </div>
      </section>

      {featuredCategory && !loading ? (
        <Link
          to={`/category/${featuredCategory.slug}`}
          className="group motion-card motion-hover motion-soft-glow grid overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] transition hover:border-cyan-300/24 hover:bg-white/[0.055] md:grid-cols-[minmax(220px,360px)_minmax(0,1fr)] lg:grid-cols-[420px_minmax(0,1fr)]"
        >
          <div className="relative min-h-[220px] overflow-hidden">
            {featuredCategory.image_url ? (
              <img src={featuredCategory.image_url} alt={featuredCategory.name} className="motion-image absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            ) : (
              <CategoryFallback />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/18 to-black/70" />
          </div>
          <div className="flex flex-col justify-center p-6 md:p-8">
            <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-100/65">แนะนำ</div>
            <div className="mt-3 text-2xl font-black text-white">{featuredCategory.name}</div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/54">{featuredCategory.description || 'เริ่มดูสินค้าจากหมวดหมู่ยอดนิยมของร้าน'}</p>
            <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/24 bg-cyan-400/10 px-4 py-2 text-xs font-extrabold text-cyan-50">
              ดูหมวดนี้
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </div>
          </div>
        </Link>
      ) : null}

      {loading ? (
        <SkeletonCard />
      ) : visibleCategories.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/12 bg-white/[0.025] px-6 py-14 text-center">
          <div className="text-lg font-extrabold text-white">ไม่พบหมวดหมู่</div>
          <p className="mt-2 text-sm text-white/45">ลองเปลี่ยนคำค้นหา หรือกลับมาดูใหม่ภายหลัง</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCategories.map((category, index) => (
            <CategoryCard
              key={category.id}
              category={category}
              count={productCountByCategory.get(String(category.slug)) || 0}
              delayClass={['fade-in-delay-0', 'fade-in-delay-1', 'fade-in-delay-2', 'fade-in-delay-3'][index % 4] ?? ''}
            />
          ))}
        </div>
      )}
    </div>
  )
}
