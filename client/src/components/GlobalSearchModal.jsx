import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { fetchJson } from '../api.js'

function formatPoints(pts) {
  const n = Number(pts)
  return Number.isFinite(n) ? n.toLocaleString() : '0'
}

export default function GlobalSearchModal({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [categories, setCategories] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)

  // Fetch categories once
  useEffect(() => {
    let cancelled = false
    async function loadCats() {
      try {
        const res = await fetchJson('/api/categories')
        if (!cancelled && Array.isArray(res?.categories)) {
          setCategories(res.categories)
        }
      } catch {
        // ignore
      }
    }
    loadCats()
    return () => { cancelled = true }
  }, [])

  // Auto focus on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      setSelectedIndex(0)
    } else {
      setQuery('')
      setResults([])
    }
  }, [isOpen])

  // Global keydown for Ctrl+K
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (isOpen) onClose?.()
        else {
          window.dispatchEvent(new CustomEvent('open_global_search'))
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Debounced search
  useEffect(() => {
    if (!isOpen) return
    let timer = null
    let cancelled = false
    setLoading(true)

    timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set('q', query.trim())
        if (selectedCategory && selectedCategory !== 'all') params.set('category', selectedCategory)
        params.set('limit', '12')

        const res = await fetchJson(`/api/products/search?${params.toString()}`)
        if (!cancelled) {
          setResults(Array.isArray(res?.products) ? res.products : [])
          setSelectedIndex(0)
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, query, selectedCategory])

  function handleSelectProduct(product) {
    onClose?.()
    if (product?.slug) {
      navigate(`/p/${product.slug}`)
    } else if (product?.id) {
      navigate(`/p/${product.id}`)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIndex]) {
        handleSelectProduct(results[selectedIndex])
      }
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-start justify-center p-3 pt-12 sm:p-6 sm:pt-20 bg-slate-950/70 backdrop-blur-md search-modal-backdrop-animate"
      style={{ width: '100vw', minHeight: '100vh' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-sky-100 flex flex-col max-h-[85vh] search-modal-panel-animate"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="relative border-b border-slate-100 p-4 pb-3">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent text-base font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
              placeholder="ค้นหาชื่อสินค้า, SKU, หมวดหมู่ หรือแท็ก..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                onClick={() => setQuery('')}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <span className="hidden sm:inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-medium text-slate-500 border border-slate-200">
              ESC เพื่อปิด
            </span>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              type="button"
              className={`rounded-lg px-2.5 py-1 font-bold whitespace-nowrap transition-all ${
                selectedCategory === 'all'
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setSelectedCategory('all')}
            >
              ทั้งหมด
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`rounded-lg px-2.5 py-1 font-bold whitespace-nowrap transition-all ${
                  selectedCategory === c.slug
                    ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                onClick={() => setSelectedCategory(c.slug)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Search Results Area */}
        <div ref={resultsRef} className="flex-1 overflow-y-auto p-2 divide-y divide-slate-50">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent"></div>
              <span className="text-sm font-medium">กำลังค้นหาสินค้า...</span>
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <svg className="mx-auto h-10 w-10 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm font-bold text-slate-600">ไม่พบสินค้าที่ตรงกับการค้นหา</div>
              <div className="text-xs text-slate-400 mt-1">ลองเปลี่ยนคำค้นหาหรือเลือกหมวดหมู่อื่น</div>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-1">
              {results.map((product, idx) => {
                const isSelected = idx === selectedIndex
                const price = Number(product.price_final_points ?? product.price)
                const origPrice = Number(product.price)
                const hasDiscount = origPrice > price
                const isUnlimited = Boolean(product.is_unlimited_stock)
                const inStock = isUnlimited || Number(product.stock ?? 0) > 0

                return (
                  <div
                    key={product.id}
                    className={`group flex items-center justify-between gap-3 rounded-xl p-2.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-sky-50 text-slate-900 ring-1 ring-sky-300/80'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                    onClick={() => handleSelectProduct(product)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover shadow-sm shrink-0 border border-slate-100"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 group-hover:text-sky-600 transition truncate">
                            {product.name}
                          </span>
                          {product.badge && (
                            <span className="rounded-full bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 shadow-sm">
                              {product.badge}
                            </span>
                          )}
                          {product.promo_discount_percent > 0 && (
                            <span className="rounded-full bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2">
                              -{product.promo_discount_percent}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>{product.category_name || 'ทั่วไป'}</span>
                          {product.sku && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-slate-500">{product.sku}</span>
                            </>
                          )}
                          <span>•</span>
                          {inStock ? (
                            <span className="text-emerald-600 font-medium">พร้อมส่ง</span>
                          ) : (
                            <span className="text-rose-500 font-medium">หมด</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-sky-600">
                        {formatPoints(price)} <span className="text-xs font-bold text-slate-500">แต้ม</span>
                      </div>
                      {hasDiscount && (
                        <div className="text-[11px] text-slate-400 line-through">
                          {formatPoints(origPrice)} แต้ม
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Search Footer info */}
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono bg-white border border-slate-200 rounded px-1">↑</kbd> <kbd className="font-mono bg-white border border-slate-200 rounded px-1">↓</kbd> เพื่อเลือก</span>
            <span><kbd className="font-mono bg-white border border-slate-200 rounded px-1.5">Enter</kbd> เพื่อเปิด</span>
          </div>
          <span>แสดง {results.length} รายการ</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
