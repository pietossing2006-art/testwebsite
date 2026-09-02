import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchJson } from '../api.js'

function CategoryFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 via-sky-50 to-cyan-100">
      <svg viewBox="0 0 24 24" className="h-11 w-11 text-sky-400/50" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
      </svg>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-3xl border border-sky-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto h-1.5 w-44 overflow-hidden rounded-full bg-sky-100">
        <div className="h-full w-1/2 animate-pulse bg-sky-500" />
      </div>
      <div className="mt-4 text-sm font-black text-slate-800">กำลังโหลดหมวดหมู่...</div>
      <div className="mt-1 text-xs text-slate-500">ระบบกำลังดึงข้อมูลสินค้าและหมวดหมู่ล่าสุด</div>
    </div>
  )
}

function CategoryCard({ category, count, subcategories = [], delayClass }) {
  const description = String(category.description || '').trim()
  const hasSubs = Array.isArray(subcategories) && subcategories.length > 0

  return (
    <div
      className={`group g2a-card relative flex flex-col overflow-hidden rounded-3xl border border-sky-200/80 bg-white shadow-sm transition-all duration-300 hover:border-sky-400 hover:shadow-xl hover:-translate-y-1 ${delayClass}`}
    >
      <Link to={`/category/${category.slug}`} className="relative block overflow-hidden bg-sky-50/60" style={{ aspectRatio: '16 / 7' }}>
        {category.image_url ? (
          <img
            src={category.image_url}
            alt={category.name}
            loading="lazy"
            decoding="async"
            className="motion-image absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-sky-100 via-sky-50 to-cyan-100">
            <span className="text-4xl filter drop-shadow-sm">{category.icon || '📁'}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
        
        {/* Top Badges */}
        <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5 z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white/95 px-2.5 py-0.5 text-[11px] font-black text-sky-800 backdrop-blur shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm" />
            {count.toLocaleString()} รายการ
          </span>
          {hasSubs && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-950/75 px-2 py-0.5 text-[10px] font-bold text-sky-200 backdrop-blur">
              {subcategories.length} หมวดหมู่ย่อย
            </span>
          )}
        </div>
      </Link>

      {/* Card Info & Action Footer */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 group-hover:text-sky-600 transition-colors">
            {category.icon && <span className="text-xl">{category.icon}</span>}
            <span className="line-clamp-1">{category.name}</span>
          </h2>
          {description && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-sky-100 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-500">
              {hasSubs ? `เลือกหมวดหมู่ย่อย (${subcategories.length})` : `มีสินค้าทั้งหมด ${count.toLocaleString()} ชิ้น`}
            </div>
            <div className="text-[10.5px] font-mono text-slate-400">/{category.slug}</div>
          </div>
          <Link
            to={`/category/${category.slug}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 text-xs font-black shadow-md hover:shadow-lg transition-all shrink-0"
          >
            <span>{hasSubs ? 'เลือกหมวดหมู่' : 'สินค้าทั้งหมด'}</span>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
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
          fetchJson('/api/categories').catch((err) => {
            console.error('Failed to load categories:', err)
            return null
          }),
          fetchJson('/api/products').catch((err) => {
            console.error('Failed to load products:', err)
            return null
          }),
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

  const categoryMap = useMemo(() => {
    const map = new Map()
    categories.forEach(c => map.set(Number(c.id), c))
    return map
  }, [categories])

  const rootCategoriesWithChildren = useMemo(() => {
    const isSub = (c) => Boolean(c?.parent_id) && Number(c.parent_id) > 0
    const roots = categories.filter(c => !isSub(c))
    // If no roots found (e.g. legacy data), use all categories as roots
    const effectiveRoots = roots.length > 0 ? roots : categories
    return effectiveRoots.map(root => {
      const children = categories.filter(c => Number(c.parent_id) === Number(root.id))
      return { ...root, children }
    })
  }, [categories])

  const visibleCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rootCategoriesWithChildren

    // If query matches a subcategory or root category, include it
    return rootCategoriesWithChildren
      .map(root => {
        const rootMatch = String(root.name || '').toLowerCase().includes(q)
          || String(root.description || '').toLowerCase().includes(q)
          || String(root.slug || '').toLowerCase().includes(q)
        const matchingChildren = root.children.filter(c => 
          String(c.name || '').toLowerCase().includes(q)
          || String(c.description || '').toLowerCase().includes(q)
          || String(c.slug || '').toLowerCase().includes(q)
        )
        if (rootMatch || matchingChildren.length > 0) {
          return {
            ...root,
            children: rootMatch ? root.children : matchingChildren,
          }
        }
        return null
      })
      .filter(Boolean)
  }, [rootCategoriesWithChildren, query])

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
      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white/90 px-4 py-7 sm:px-6 sm:py-9 md:px-8 md:py-10 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_8%_0%,rgba(56,189,248,0.12),transparent_62%),radial-gradient(45%_70%_at_100%_8%,rgba(6,182,212,0.10),transparent_62%)]" />
        <div className="motion-stagger relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <div>
            <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700">
              เลือกหมวดหมู่ที่ต้องการ
            </div>
            <h1 className="mt-4 font-display text-4xl font-black text-slate-900 md:text-5xl">
              หมวดหมู่ <span className="bg-gradient-to-r from-sky-600 to-cyan-500 bg-clip-text text-transparent">สินค้า</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
              รวมหมวดหมู่สินค้าและบริการดิจิทัลทั้งหมด จัดตามหมวดหมู่หลักและหมวดหมู่ย่อย เลือกชมสินค้าได้ทันที
            </p>
            <div className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                </svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="ui-field h-12 w-full pl-11 pr-4 text-sm"
                  placeholder="ค้นหาหมวดหมู่หลัก หรือหมวดหมู่ย่อย..."
                />
              </div>
              {query ? (
                <button type="button" onClick={() => setQuery('')} className="ui-btn h-12 px-4 text-xs font-bold">ล้าง</button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 sm:p-5 text-center sm:text-left">
              <div className="text-3xl font-black text-slate-900">{loading ? '...' : categories.length.toLocaleString()}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">หมวดหมู่ทั้งหมด</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 sm:p-5 text-center sm:text-left">
              <div className="text-3xl font-black text-sky-600">{loading ? '...' : totalProducts.toLocaleString()}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">สินค้าทั้งหมด</div>
            </div>
          </div>
        </div>
      </section>

      {featuredCategory && !loading ? (
        <Link
          to={`/category/${featuredCategory.slug}`}
          className="group g2a-card grid overflow-hidden rounded-3xl border border-sky-200/80 bg-white transition hover:border-sky-400 hover:shadow-xl md:grid-cols-[minmax(220px,360px)_minmax(0,1fr)] lg:grid-cols-[420px_minmax(0,1fr)]"
        >
          <div className="relative min-h-[220px] overflow-hidden bg-sky-50">
            {featuredCategory.image_url ? (
              <img src={featuredCategory.image_url} alt={featuredCategory.name} className="motion-image absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-sky-100">
                <span className="text-5xl">{featuredCategory.icon || '📁'}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/20 to-slate-950/70" />
          </div>
          <div className="flex flex-col justify-center p-6 md:p-8">
            <div className="text-xs font-black uppercase tracking-wider text-sky-600 bg-sky-50 px-2.5 py-0.5 rounded-md w-fit">แนะนำ</div>
            <div className="mt-3 text-2xl font-black text-slate-900 flex items-center gap-2">
              {featuredCategory.icon && <span>{featuredCategory.icon}</span>}
              <span>{featuredCategory.name}</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{featuredCategory.description || 'เริ่มดูสินค้าจากหมวดหมู่ยอดนิยมของร้าน'}</p>
            <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-xl bg-sky-500 text-white px-4 py-2 text-xs font-black shadow-md hover:bg-sky-600 transition-colors">
              ดูหมวดนี้
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </div>
          </div>
        </Link>
      ) : null}

      {loading ? (
        <SkeletonCard />
      ) : visibleCategories.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-sky-200 bg-white p-12 text-center shadow-sm">
          <div className="text-lg font-black text-slate-800">ไม่พบหมวดหมู่</div>
          <p className="mt-1 text-sm text-slate-500">ลองเปลี่ยนคำค้นหา หรือกลับมาดูใหม่ภายหลัง</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCategories.map((category, index) => (
            <CategoryCard
              key={category.id}
              category={category}
              count={category.total_product_count ?? category.product_count ?? 0}
              subcategories={category.children}
              delayClass={['fade-in-delay-0', 'fade-in-delay-1', 'fade-in-delay-2', 'fade-in-delay-3'][index % 4] ?? ''}
            />
          ))}
        </div>
      )}
    </div>
  )
}
