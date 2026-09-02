import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchJson, reloadPageSoon, triggerAppRefresh, resolveImageUrl } from '../api.js'
import DiscountBreakdown from '../components/growth/DiscountBreakdown.jsx'
import ReviewSummary from '../components/growth/ReviewSummary.jsx'
import WishlistButton from '../components/growth/WishlistButton.jsx'
import MysteryUnboxModal from '../components/mystery/MysteryUnboxModal.jsx'
import UserAvatar from '../components/UserAvatar.jsx'
import { normalizeReviewSummary } from '../components/growth/growthDisplayUtils.js'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../uiImageSettings.js'

function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString()
}

function maskUsername(name) {
  const s = String(name || '').trim()
  if (!s) return 'ผู้เล่น'
  if (s.length <= 2) return `${s[0]}***`
  return `${s.slice(0, 2)}${'*'.repeat(Math.max(2, s.length - 3))}${s.slice(-1)}`
}

function discountUnitPrice(unitPrice, promoPercent, promoAmount) {
  const price = Number(unitPrice)
  if (!Number.isFinite(price) || price < 0) return 0
  let discount = 0
  if (Number.isFinite(promoPercent) && promoPercent > 0) discount = Math.floor((price * promoPercent) / 100)
  else if (Number.isFinite(promoAmount) && promoAmount > 0) discount = Math.floor(promoAmount)
  return Math.max(0, price - Math.min(price, discount))
}

function ratingStars(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value) || 0)))
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`
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

function CountdownPill({ endsAt }) {
  const time = useCountdown(endsAt)
  if (!time) return null
  const pad = (value) => String(value).padStart(2, '0')
  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-100 to-amber-50 px-3 py-1.5 text-xs font-black text-amber-950 shadow-xs tabular-nums">
      <span className="text-amber-600 animate-pulse">⏰</span>
      <span className="text-[11px] font-bold text-amber-800">หมดใน</span>
      <span className="font-extrabold tracking-tight text-amber-950">{time.d > 0 ? `${time.d}วัน ` : ''}{pad(time.h)}:{pad(time.m)}:{pad(time.s)}</span>
    </div>
  )
}

function Modal({ children, onClose, maxWidth = 'max-w-md' }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="popup-overlay-animate fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={`popup-panel-animate w-full ${maxWidth} rounded-3xl border border-sky-200 bg-white p-6 shadow-2xl text-slate-900`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

function getApiErrorMessage(error) {
  const code = error?.data?.error
  if (code === 'out_of_stock') return 'สินค้าหมดสต็อก'
  if (code === 'insufficient_points') return 'พ้อยท์ไม่เพียงพอ'
  if (code === 'free_box_single_only') return 'กล่องสุ่มฟรีจำกัดการเปิดครั้งละ 1 ครั้ง'
  if (code === 'duplicate_purchase') return 'ระบบป้องกันรายการซ้ำ กรุณาลองใหม่อีกครั้ง'
  if (code === 'invalid_qty') return 'จำนวนสินค้าไม่ถูกต้อง'
  if (code === 'invalid_product_option') return 'กรุณาเลือกตัวเลือกสินค้าให้ถูกต้อง'
  if (code === 'invalid_farm_form') return 'กรุณากรอกข้อมูลให้ครบถ้วน'
  if (code === 'invalid_uid') return 'กรุณากรอก UID ให้ถูกต้อง'
  if (code === 'uid_not_confirmed') return 'กรุณายืนยันว่า UID ถูกต้อง'
  if (code === 'invalid_coupon') return 'โค้ดส่วนลดไม่ถูกต้องหรือไม่มีอยู่ในระบบ'
  if (code === 'coupon_expired') return 'โค้ดส่วนลดหมดอายุแล้ว'
  if (code === 'coupon_exhausted') return 'โค้ดส่วนลดถูกใช้ครบจำนวนแล้ว'
  if (code === 'db_error') return 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง'
  return 'ทำรายการไม่สำเร็จ'
}

function getReviewErrorMessage(error) {
  const code = error?.data?.error
  if (code === 'invalid_reviewer_name') return 'กรุณาใส่ชื่อผู้รีวิว'
  if (code === 'invalid_reviewer_name_too_long') return 'ชื่อผู้รีวิวยาวเกินไป'
  if (code === 'review_not_allowed') return 'รีวิวได้เฉพาะสินค้าที่คุณซื้อสำเร็จแล้ว'
  if (code === 'review_exists') return 'รายการนี้เคยส่งรีวิวแล้ว'
  if (code === 'invalid_rating') return 'กรุณาให้คะแนน 1-5 ดาว'
  if (code === 'invalid_comment') return 'กรุณาเขียนรีวิวอย่างน้อย 2 ตัวอักษร'
  if (code === 'invalid_comment_too_long') return 'รีวิวยาวเกินไป'
  return 'ส่งรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}

export default function ProductDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthed, setIsAuthed] = useState(null)
  const [optionStock, setOptionStock] = useState(null)
  const [optionStockStatus, setOptionStockStatus] = useState('idle')
  const [buyStatus, setBuyStatus] = useState('idle')
  const [buyError, setBuyError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successData, setSuccessData] = useState(null)
  const [successOption, setSuccessOption] = useState(null)
  const [qty, setQty] = useState('1')
  const [farmForm, setFarmForm] = useState({})
  const [uidForm, setUidForm] = useState({ uid: '', confirmed: false })
  const [couponCode, setCouponCode] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [couponError, setCouponError] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteStatus, setQuoteStatus] = useState('idle')
  const [uiImageSettings, setUiImageSettings] = useState(DEFAULT_UI_IMAGE_SETTINGS)
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [qtyRequiredOpen, setQtyRequiredOpen] = useState(false)
  const [mysteryUnboxOpen, setMysteryUnboxOpen] = useState(false)
  const [mysteryPrizes, setMysteryPrizes] = useState([])
  const [mysteryRecentWins, setMysteryRecentWins] = useState([])
  const [wishlist, setWishlist] = useState({ followed: false, loaded: false })
  const [reviews, setReviews] = useState({ summary: null, reviews: [] })
  const [reviewForm, setReviewForm] = useState({ reviewer_name: '', rating: 5, comment: '' })
  const [reviewStatus, setReviewStatus] = useState('idle')
  const [reviewMessage, setReviewMessage] = useState('')
  const [reviewFilter, setReviewFilter] = useState('all')
  const [hoverRating, setHoverRating] = useState(0)
  const [writeReviewOpen, setWriteReviewOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [zoomModalOpen, setZoomModalOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [relatedProducts, setRelatedProducts] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [productRes, settingsRes] = await Promise.all([
          fetchJson(`/api/products/${id}`),
          fetchJson('/api/ui-settings').catch(() => ({})),
        ])
        if (cancelled) return
        const nextProduct = productRes.product
        const options = Array.isArray(nextProduct?.product_options) ? nextProduct.product_options : []
        setProduct(nextProduct)
        setUiImageSettings(normalizeUiImageSettings(settingsRes?.image_settings))
        setSelectedOptionId(options.length === 1 ? String(options[0]?.id ?? '') : '')
        setOptionStock(null)
        setBuyError('')
        setActiveImageIndex(0)

        // Load related products
        if (nextProduct?.category_slug) {
          fetchJson(`/api/products?category=${encodeURIComponent(nextProduct.category_slug)}`)
            .then((res) => {
              if (!cancelled && Array.isArray(res?.products)) {
                setRelatedProducts(res.products.filter((p) => p.id !== nextProduct.id).slice(0, 4))
              }
            })
            .catch(() => {})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
      try {
        const meRes = await fetchJson('/api/me')
        if (!cancelled) {
          setIsAuthed(true)
          setCurrentUser(meRes?.user || null)
        }
      } catch (error) {
        if (!cancelled && error?.status === 401) setIsAuthed(false)
      }
    }
    checkAuth()
    return () => {
      cancelled = true
    }
  }, [])

  const loadReviews = useCallback(async () => {
    if (!id) return
    try {
      const data = await fetchJson(`/api/products/${id}/reviews`)
      setReviews({
        summary: data?.summary ?? null,
        reviews: Array.isArray(data?.reviews) ? data.reviews : [],
      })
    } catch {
      setReviews({ summary: null, reviews: [] })
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      try {
        const data = await fetchJson(`/api/products/${id}/reviews`)
        if (!cancelled) {
          setReviews({
            summary: data?.summary ?? null,
            reviews: Array.isArray(data?.reviews) ? data.reviews : [],
          })
        }
      } catch {
        if (!cancelled) setReviews({ summary: null, reviews: [] })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function loadWishlist() {
      if (isAuthed === false) {
        setWishlist({ followed: false, loaded: true })
        return
      }
      if (isAuthed !== true || !product?.id) return
      try {
        const data = await fetchJson('/api/me/wishlist')
        if (cancelled) return
        const items = Array.isArray(data?.wishlist?.items) ? data.wishlist.items : []
        setWishlist({
          followed: items.some((item) => Number(item?.product_id) === Number(product.id)),
          loaded: true,
        })
      } catch {
        if (!cancelled) setWishlist({ followed: false, loaded: true })
      }
    }
    loadWishlist()
    return () => {
      cancelled = true
    }
  }, [isAuthed, product?.id])

  useEffect(() => {
    let cancelled = false
    async function loadOptionStock() {
      if (!product?.id) return
      setOptionStockStatus('loading')
      try {
        const data = await fetchJson(`/api/products/${id}/option-stock`)
        if (!cancelled) {
          setOptionStock(data?.option_stock ?? null)
          setOptionStockStatus('success')
        }
      } catch {
        if (!cancelled) {
          setOptionStock(null)
          setOptionStockStatus('error')
        }
      }
    }
    loadOptionStock()
    return () => {
      cancelled = true
    }
  }, [id, product?.id])

  const fulfillmentType = typeof product?.fulfillment_type === 'string' ? product.fulfillment_type : 'digital_stock'
  const isFarm = fulfillmentType === 'farm_form'
  const isUidForm = fulfillmentType === 'uid_form'
  const isMystery = fulfillmentType === 'mystery_box'
  const isUnlimited = Boolean(product?.is_unlimited_stock)
  const productOptions = useMemo(() => (Array.isArray(product?.product_options) ? product.product_options : []), [product])
  const hasProductOptions = productOptions.length > 0

  const optionItems = useMemo(() => {
    return productOptions.map((option, index) => {
      const optionId = String(option?.id ?? '').trim()
      const stockRow = optionStock && typeof optionStock === 'object' ? optionStock[optionId] : null
      const remainingRaw = stockRow?.remaining
      const remaining = remainingRaw == null ? null : Number(remainingRaw)
      const hasLimit = remaining != null && Number.isFinite(remaining) && remaining >= 0
      const priceRaw = option?.price_points
      const pricePoints = priceRaw == null || priceRaw === '' ? null : Number(priceRaw)
      const outOfStock = !isUnlimited && hasLimit && remaining <= 0
      return {
        ...option,
        id: optionId,
        label: String(option?.label ?? '').trim() || optionId || `Option ${index + 1}`,
        value: String(option?.value ?? '').trim(),
        price_points: Number.isFinite(pricePoints) ? pricePoints : null,
        remaining,
        has_limit: hasLimit,
        out_of_stock: outOfStock,
      }
    })
  }, [isUnlimited, optionStock, productOptions])

  const selectedOption = hasProductOptions ? optionItems.find((option) => option.id === String(selectedOptionId || '')) || null : null
  const canOptionSubmit = !hasProductOptions || Boolean(selectedOption)
  const allOptionsOut = hasProductOptions && optionItems.length > 0 && optionItems.every((option) => option.out_of_stock)
  const selectedOptionOut = !isUnlimited && Boolean(selectedOption?.out_of_stock)
  const selectedOptionRemaining = selectedOption?.remaining == null ? null : Number(selectedOption.remaining)
  const selectedOptionHasLimit = Boolean(selectedOption?.has_limit)
  const legacyOutOfStock = !isUnlimited && Number(product?.stock ?? 0) <= 0
  const outOfStock = hasProductOptions ? allOptionsOut || (canOptionSubmit ? selectedOptionOut : false) : legacyOutOfStock

  const serverQtyLimit = isFarm || isUidForm ? 10 : 999
  const legacyStockCap = isUnlimited ? serverQtyLimit : Number(product?.stock ?? 1) || 1
  const baseMaxQty = Math.max(1, Math.min(serverQtyLimit, hasProductOptions ? serverQtyLimit : legacyStockCap))
  const stockAwareMaxQty = selectedOptionHasLimit ? Math.max(1, Math.min(baseMaxQty, selectedOptionRemaining)) : baseMaxQty
  const productPrice = Number(product?.price ?? 0)
  const isFreeBox = isMystery && productPrice === 0
  const maxQty = isMystery ? (isFreeBox ? 1 : Math.min(10, serverQtyLimit)) : stockAwareMaxQty
  const qtyValue = String(qty ?? '').trim()
  const parsedQty = Number(qtyValue)
  const isQtyEmpty = qtyValue === ''
  const safeQty = Number.isFinite(parsedQty) && parsedQty > 0 ? Math.max(1, Math.min(maxQty, Math.trunc(parsedQty))) : 1
  const optionInsufficient = !isUnlimited && selectedOptionHasLimit && selectedOptionRemaining < safeQty

  const promoPercent = Number(product?.promo_discount_percent ?? 0) > 0 ? Number(product.promo_discount_percent) : 0
  const promoAmount = Number(product?.promo_discount_amount_points ?? 0) > 0 ? Number(product.promo_discount_amount_points) : 0
  const hasPromo = Number(product?.promo_discount_points ?? 0) > 0 || promoPercent > 0 || promoAmount > 0
  const promoBadgeLabel = hasPromo
    ? promoPercent > 0
      ? `-${Math.trunc(promoPercent)}%`
      : promoAmount > 0
        ? `-${fmt(promoAmount)} พ้อยท์`
        : 'ลดราคา'
    : ''

  const optionPrices = optionItems.map((option) => option.price_points).filter((price) => Number.isFinite(price) && price >= 0)
  const originalPrices = hasProductOptions
    ? selectedOption?.price_points != null
      ? [selectedOption.price_points]
      : optionPrices.length > 0
        ? optionPrices
        : [Number(product?.price ?? 0)]
    : [Number(product?.price ?? 0)]
  const originalMin = Math.min(...originalPrices)
  const originalMax = Math.max(...originalPrices)
  const originalPriceLabel = originalMin === originalMax ? `${fmt(originalMin)} พ้อยท์` : `${fmt(originalMin)} - ${fmt(originalMax)} พ้อยท์`
  const discountedPrices = hasPromo ? originalPrices.map((price) => discountUnitPrice(price, promoPercent, promoAmount)) : originalPrices
  const discountedMin = Math.min(...discountedPrices)
  const discountedMax = Math.max(...discountedPrices)
  const discountedPriceLabel = discountedMin === discountedMax ? `${fmt(discountedMin)} พ้อยท์` : `${fmt(discountedMin)} - ${fmt(discountedMax)} พ้อยท์`

  const quoteUnit = quote?.unit_price_points != null ? Number(quote.unit_price_points) : null
  const quoteTotal = quote?.total_points != null ? Number(quote.total_points) : null
  const displayUnitPoints = Number.isFinite(quoteUnit) ? quoteUnit : discountedMin
  const displayTotalPoints = Number.isFinite(quoteTotal) ? quoteTotal : displayUnitPoints * safeQty
  const priceDisplayLabel = hasPromo ? discountedPriceLabel : originalPriceLabel

  const farmFields = useMemo(() => {
    if (Array.isArray(product?.farm_form_fields)) {
      return product.farm_form_fields.map((field, index) => ({
        id: typeof field?.id === 'string' && field.id.trim() ? field.id.trim() : `field_${index + 1}`,
        label: typeof field?.label === 'string' && field.label.trim() ? field.label.trim() : `Field ${index + 1}`,
        type: field?.type === 'checkbox' ? 'checkbox' : 'text',
        required: Boolean(field?.required),
      }))
    }
    const fields = []
    if (product?.farm_form_username_enabled !== false) fields.push({ id: 'username', label: 'Username', type: 'text', required: true })
    if (product?.farm_form_password_enabled !== false) fields.push({ id: 'password', label: 'Password', type: 'text', required: true })
    if (product?.farm_form_auth_key_enabled !== false) fields.push({ id: 'auth_key', label: 'Auth Key', type: 'text', required: false })
    return fields
  }, [product])

  const farmFormData = useMemo(() => {
    return farmFields.reduce((acc, field) => {
      const rawValue = farmForm?.[field.id]
      acc[field.id] = field.type === 'checkbox' ? Boolean(rawValue) : String(rawValue ?? '').trim()
      return acc
    }, {})
  }, [farmFields, farmForm])

  const canFarmSubmit = !isFarm || farmFields.every((field) => {
    const value = farmFormData?.[field.id]
    if (field.type === 'checkbox') return !field.required || Boolean(value)
    return !field.required || String(value ?? '').trim().length > 0
  })
  const uidText = String(uidForm.uid || '').trim()
  const canUidSubmit = !isUidForm || (uidText.length > 0 && Boolean(uidForm.confirmed))
  const canSubmit = canOptionSubmit && canFarmSubmit && canUidSubmit

  const highlights = String(product?.highlights ?? '').split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 12)
  const manualUrl = typeof product?.manual_url === 'string' && product.manual_url.trim() ? product.manual_url.trim() : ''
  const manualVideoUrl = typeof product?.manual_video_url === 'string' && product.manual_video_url.trim() ? product.manual_video_url.trim() : ''
  const manualText = typeof product?.manual_text === 'string' && product.manual_text.trim() ? product.manual_text.trim() : ''
  const hasManual = Boolean(manualUrl || manualVideoUrl || manualText)

  useEffect(() => {
    let cancelled = false
    async function loadQuote() {
      if (!product?.id) return
      if (hasProductOptions && !selectedOptionId) {
        setQuote(null)
        setQuoteStatus('idle')
        return
      }
      setQuoteStatus('loading')
      try {
        const data = await fetchJson('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: Number(product.id),
            qty: safeQty,
            coupon_code: couponCode.trim() || undefined,
            product_option_id: selectedOptionId || undefined,
          }),
        })
        if (!cancelled) {
          setQuote(data.quote || null)
          setQuoteStatus('success')
          setCouponError('')
        }
      } catch (error) {
        if (!cancelled) {
          setQuote(null)
          setQuoteStatus('error')
          const code = error?.data?.error
          setCouponError(code && code.startsWith('coupon') || code === 'invalid_coupon' ? getApiErrorMessage(error) : '')
        }
      }
    }
    loadQuote()
    return () => {
      cancelled = true
    }
  }, [couponCode, hasProductOptions, product?.id, safeQty, selectedOptionId])

  useEffect(() => {
    let cancelled = false
    async function loadMysteryPrizes() {
      if (!product?.id || fulfillmentType !== 'mystery_box') return
      try {
        const data = await fetchJson(`/api/products/${product.id}/mystery-prizes`)
        if (!cancelled) {
          setMysteryPrizes(Array.isArray(data.prizes) ? data.prizes : [])
          setMysteryRecentWins(Array.isArray(data.recent_wins) ? data.recent_wins : [])
        }
      } catch {
        if (!cancelled) {
          setMysteryPrizes([])
          setMysteryRecentWins([])
        }
      }
    }
    loadMysteryPrizes()
    return () => {
      cancelled = true
    }
  }, [fulfillmentType, product?.id])

  async function ensureAuthed() {
    if (isAuthed === true) return true
    try {
      await fetchJson('/api/me')
      setIsAuthed(true)
      return true
    } catch (error) {
      if (error?.status === 401) {
        setIsAuthed(false)
        return false
      }
      return true
    }
  }

  async function submitReview(event) {
    event.preventDefault()
    if (!(await ensureAuthed())) {
      nav('/login')
      return
    }

    if (!reviewForm.comment.trim()) {
      setReviewStatus('error')
      setReviewMessage('กรุณาเขียนข้อความรีวิวอย่างน้อย 2 ตัวอักษร')
      return
    }

    setReviewStatus('submitting')
    setReviewMessage('')
    try {
      const reviewerName = reviewForm.reviewer_name.trim() || currentUser?.display_name || currentUser?.username || 'ผู้ซื้อ'
      await fetchJson(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_name: reviewerName,
          rating: Number(reviewForm.rating || 5),
          comment: reviewForm.comment.trim(),
        }),
      })
      setReviewForm({ reviewer_name: '', rating: 5, comment: '' })
      setReviewStatus('success')
      setReviewMessage('🎉 ขอบคุณสำหรับรีวิว! ระบบบันทึกรีวิวของคุณเรียบร้อยแล้ว')
      setWriteReviewOpen(false)
      await loadReviews()
    } catch (error) {
      setReviewStatus('error')
      setReviewMessage(getReviewErrorMessage(error))
    }
  }

  async function buy() {
    if (!(await ensureAuthed())) {
      nav('/login')
      return
    }
    if (outOfStock || selectedOptionOut || optionInsufficient || !canSubmit || buyStatus === 'submitting') return
    setBuyStatus('submitting')
    setBuyError('')
    if (isMystery) {
      // Open the unbox modal immediately so the shaking/loading animation covers the real
      // network wait, instead of only appearing after the result is already known.
      setConfirmOpen(false)
      setSuccessData(null)
      setMysteryUnboxOpen(true)
    }
    try {
      const data = await fetchJson('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: Number(product.id),
          qty: safeQty,
          product_option_id: selectedOptionId || undefined,
          username: isFarm ? farmFormData?.username : undefined,
          password: isFarm ? farmFormData?.password : undefined,
          auth_key: isFarm ? farmFormData?.auth_key : undefined,
          form_data: isFarm ? farmFormData : undefined,
          uid: isUidForm ? uidText : undefined,
          uid_confirmed: isUidForm ? Boolean(uidForm.confirmed) : undefined,
          coupon_code: couponCode.trim() || undefined,
        }),
      })
      setBuyStatus('success')
      setConfirmOpen(false)
      const nextProduct = await fetchJson(`/api/products/${id}`).catch(() => null)
      if (nextProduct?.product) setProduct(nextProduct.product)
      const nextStock = await fetchJson(`/api/products/${id}/option-stock`).catch(() => null)
      if (nextStock) setOptionStock(nextStock?.option_stock ?? null)

      if (isMystery && data.picks && data.picks.length > 0) {
        setSuccessData(data)
        setMysteryUnboxOpen(true)
      } else {
        setSuccessData(data)
        setSuccessOption(selectedOption ?? null)
        setSuccessOpen(true)
      }
    } catch (error) {
      setBuyError(getApiErrorMessage(error))
      setBuyStatus('error')
      if (isMystery) setMysteryUnboxOpen(false)
    }
  }

  function openConfirm() {
    if (isAuthed === false) {
      nav('/login')
      return
    }
    if (isQtyEmpty) {
      setBuyError('')
      setQtyRequiredOpen(true)
      return
    }
    if (outOfStock || selectedOptionOut || optionInsufficient || !canSubmit) return
    setBuyError('')
    setConfirmOpen(true)
  }

  function goToInboxAfterPurchase() {
    setSuccessOpen(false)
    triggerAppRefresh()
    nav('/inbox')
  }

  function stayAfterPurchase() {
    setSuccessOpen(false)
    triggerAppRefresh()
    reloadPageSoon(80)
  }

  if (loading) {
    return (
      <div className="grid min-h-[460px] place-items-center rounded-3xl border border-sky-200 bg-white shadow-sm">
        <div className="text-sm font-bold text-slate-500">กำลังโหลดสินค้า...</div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-3xl border border-sky-200 bg-white text-center shadow-sm">
        <div>
          <div className="text-lg font-black text-slate-900">ไม่พบสินค้า</div>
          <Link to="/categories" className="ui-btn-primary mt-5 inline-flex h-11 items-center px-5 text-xs font-black">ดูหมวดหมู่สินค้า</Link>
        </div>
      </div>
    )
  }

  const stockLabel = hasProductOptions
    ? !canOptionSubmit
      ? 'กรุณาเลือกตัวเลือก'
      : selectedOptionHasLimit
        ? `เหลือ ${fmt(selectedOptionRemaining)} ชิ้น`
        : 'ไม่จำกัด'
    : isUnlimited
      ? 'ไม่จำกัด'
      : legacyOutOfStock
        ? 'สินค้าหมด'
        : `เหลือ ${fmt(product.stock)} ชิ้น`
  const primaryButtonLabel = buyStatus === 'submitting'
    ? 'กำลังซื้อ...'
    : allOptionsOut
      ? 'ตัวเลือกหมด'
      : hasProductOptions && !canOptionSubmit
        ? 'เลือกตัวเลือกก่อน'
        : outOfStock || selectedOptionOut
          ? 'สินค้าหมด'
          : optionInsufficient
            ? 'จำนวนเกินสต็อก'
            : isMystery
              ? (isFreeBox ? '✨ สุ่มฟรีตอนนี้!' : `🎲 สุ่มลุ้นรางวัล (${safeQty} ครั้ง)`)
              : 'ซื้อสินค้า'
  const successPicks = Array.isArray(successData?.picks) ? successData.picks : []
  const successItems = successPicks.length > 0 ? successPicks : []
  const reviewItems = Array.isArray(reviews.reviews) ? reviews.reviews : []

  return (
    <div className="mx-auto max-w-7xl space-y-6 fade-in-up">
      <div className="text-xs font-bold text-slate-500">
        <Link to={`/category/${product.category_slug}`} className="text-sky-600 hover:underline">{product.category_name}</Link>
        <span className="mx-2 text-slate-400">/</span>
        <span className="text-slate-800">{product.name}</span>
      </div>

      <section className="grid min-w-0 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Media, Guarantees, Description & Reviews */}
        <div className="min-w-0 space-y-6 lg:col-span-7">
          {(() => {
            const allImages = [product.image_url, ...(Array.isArray(product.gallery_images) ? product.gallery_images : [])].filter(Boolean)
            const currentImg = allImages[activeImageIndex] || product.image_url
            return (
              <div className="space-y-3">
                <div
                  className="product-detail-media-frame relative overflow-hidden rounded-3xl border border-sky-200 bg-white p-2 shadow-sm"
                  style={{ aspectRatio: uiImageSettings?.product_detail_ratio || (16 / 10) }}
                >
                  {currentImg ? (
                    <>
                      <img
                        src={resolveImageUrl(currentImg)}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover blur-xl opacity-20 scale-110"
                      />
                      <img
                        src={resolveImageUrl(currentImg)}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        className="product-detail-media-image relative z-10 h-full w-full rounded-2xl object-cover cursor-zoom-in"
                        onClick={() => setZoomModalOpen(true)}
                      />
                    </>
                  ) : (
                    <div className="grid h-full place-items-center bg-sky-50 text-slate-400 font-bold">ไม่มีรูปสินค้า</div>
                  )}

                  {/* Badges on main image */}
                  <div className="absolute left-4 top-4 z-20 flex flex-wrap gap-2">
                    {product.badge ? (
                      <span className="rounded-full border border-rose-400 bg-rose-500 px-3 py-1 text-xs font-black text-white shadow-sm">
                        {product.badge}
                      </span>
                    ) : null}
                    {product.promo_is_flash_sale ? (
                      <span className="rounded-full border border-amber-300 bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-1 text-xs font-black text-white shadow-md animate-pulse">
                        ⚡ Flash Sale
                      </span>
                    ) : null}
                    {product.promo_badge_text ? (
                      <span className="rounded-full border border-sky-300 bg-sky-600 px-3 py-1 text-xs font-black text-white shadow-sm">
                        {product.promo_badge_text}
                      </span>
                    ) : null}
                    {hasPromo && !product.promo_badge_text && !product.promo_is_flash_sale ? (
                      <>
                        <span className="rounded-full border border-sky-300 bg-sky-500 px-3 py-1 text-xs font-black text-white shadow-sm">ลดราคา</span>
                        <span className="rounded-full border border-emerald-300 bg-emerald-500 px-3 py-1 text-xs font-black text-white shadow-sm">{promoBadgeLabel}</span>
                      </>
                    ) : null}
                  </div>

                  {/* Zoom button on top right */}
                  {currentImg ? (
                    <button
                      type="button"
                      onClick={() => setZoomModalOpen(true)}
                      className="absolute right-4 top-4 z-20 rounded-full bg-white/90 backdrop-blur-md p-2 text-slate-700 shadow-md hover:bg-white transition"
                      title="ขยายรูปภาพ"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                      </svg>
                    </button>
                  ) : null}
                </div>

                {/* Thumbnails Row */}
                {allImages.length > 1 ? (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {allImages.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveImageIndex(idx)}
                        style={{ aspectRatio: uiImageSettings?.product_detail_ratio || (16 / 10) }}
                        className={`relative shrink-0 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                          idx === activeImageIndex
                            ? 'border-sky-500 ring-2 ring-sky-300 shadow-md scale-105'
                            : 'border-slate-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={resolveImageUrl(img)} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Fullscreen Zoom Modal */}
                {zoomModalOpen && currentImg ? (
                  <Modal onClose={() => setZoomModalOpen(false)} maxWidth="max-w-4xl">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setZoomModalOpen(false)}
                        className="absolute -top-2 -right-2 z-10 rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 transition"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <img src={resolveImageUrl(currentImg)} alt={product.name} className="w-full max-h-[75vh] object-contain rounded-2xl" />
                    </div>
                  </Modal>
                ) : null}
              </div>
            )
          })()}

          {/* Quick Trust / Delivery Guarantees */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-sky-100 bg-white p-3.5 text-center shadow-xs">
              <div className="text-lg">⚡</div>
              <div className="mt-1 text-xs font-black text-slate-900">จัดส่งอัตโนมัติ</div>
              <div className="text-[10px] text-slate-400">รับสินค้าทันที 24 ชม.</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white p-3.5 text-center shadow-xs">
              <div className="text-lg">🔒</div>
              <div className="mt-1 text-xs font-black text-slate-900">รับประกัน 100%</div>
              <div className="text-[10px] text-slate-400">คีย์แท้ ปลอดภัย</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white p-3.5 text-center shadow-xs">
              <div className="text-lg">💬</div>
              <div className="mt-1 text-xs font-black text-slate-900">ซัพพอร์ต 24 ชม.</div>
              <div className="text-[10px] text-slate-400">ทีมงานพร้อมช่วยเหลือ</div>
            </div>
          </div>

          {/* Product Description */}
          <div className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm">
            <div className="text-base font-black text-slate-900">รายละเอียดสินค้า</div>
            <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{product.description || 'ยังไม่มีรายละเอียดสินค้า'}</div>
          </div>

          {/* Mystery Box Prizes (if mystery) */}
          {isMystery && mysteryPrizes.length > 0 ? (
            <div className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
              {mysteryRecentWins.length > 0 ? (
                <div className="-mx-5 -mt-5 mb-5 overflow-hidden rounded-t-3xl border-b border-sky-100 bg-gradient-to-r from-sky-50 via-cyan-50/60 to-sky-50 px-5 py-2.5">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <span className="shrink-0 text-[11px] font-black text-sky-600">🔥 เพิ่งเปิดไป</span>
                    {mysteryRecentWins.slice(0, 12).map((win, idx) => (
                      <span
                        key={idx}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-xs"
                      >
                        <span className="text-sky-700">{maskUsername(win.username)}</span>
                        <span className="text-slate-400">ได้</span>
                        <span className="max-w-[110px] truncate text-slate-800">{win.delivery_name || 'รางวัล'}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-sm font-black text-slate-900">รายการสุ่ม</div>
                  <div className="mt-0.5 text-xs text-slate-500">โอกาสและของรางวัลที่มีในกล่องนี้</div>
                </div>
                <div className="text-xs font-bold text-sky-600">{mysteryRecentWins.length} ล่าสุด</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {mysteryPrizes.slice(0, 8).map((prize) => {
                  const chance = Number(prize.chance_percent ?? 0)
                  return (
                    <div key={prize.id} className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white border border-sky-100">
                        {prize.prize_image_url ? <img src={prize.prize_image_url} alt={prize.prize_name} className="h-full w-full object-contain" /> : <span className="text-xs font-black text-slate-400">Prize</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-slate-800">{prize.prize_name}</div>
                        <div className="mt-0.5 text-xs font-black text-sky-600">{chance.toFixed(chance >= 1 ? 2 : 4)}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* Reviews Section */}
          <div id="reviews" className="rounded-3xl border border-sky-200 bg-white p-6 sm:p-7 shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <span>⭐ รีวิวจากผู้ซื้อจริง</span>
                  <span className="rounded-full bg-sky-100 text-sky-700 text-xs px-2.5 py-0.5 font-bold">
                    {reviews.summary?.review_count || 0} รีวิว
                  </span>
                </h3>
                <div className="mt-0.5 text-xs text-slate-500">รีวิวที่ผ่านการยืนยันคำสั่งซื้อจริงเท่านั้น</div>
              </div>

              {isAuthed ? (
                <button
                  type="button"
                  onClick={() => setWriteReviewOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black transition-all ${
                    writeReviewOpen
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/20 hover:from-sky-600 hover:to-cyan-600'
                  }`}
                >
                  <span>{writeReviewOpen ? '✕ ปิดแบบฟอร์ม' : '✍️ เขียนรีวิวสินค้า'}</span>
                </button>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-sky-200 bg-sky-50/60 px-3.5 py-2 text-xs font-black text-sky-700 hover:bg-sky-100"
                >
                  <span>เข้าสู่ระบบเพื่อรีวิว</span>
                  <span>→</span>
                </Link>
              )}
            </div>

            {/* Scorecard Overview */}
            {(() => {
              const summaryData = normalizeReviewSummary(reviews.summary)
              const total = summaryData.reviewCount
              const starsBreakdown = [
                { star: 5, count: summaryData.stars5 },
                { star: 4, count: summaryData.stars4 },
                { star: 3, count: summaryData.stars3 },
                { star: 2, count: summaryData.stars2 },
                { star: 1, count: summaryData.stars1 },
              ]

              return (
                <div className="grid gap-6 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50/70 via-white to-sky-50/30 p-5 sm:p-6 md:grid-cols-12 items-center">
                  {/* Big Rating */}
                  <div className="md:col-span-5 text-center md:text-left space-y-1">
                    <div className="flex items-baseline justify-center md:justify-start gap-2">
                      <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                        {summaryData.averageRating > 0 ? summaryData.averageRating.toFixed(1) : '0.0'}
                      </span>
                      <span className="text-slate-400 font-bold text-sm">/ 5.0</span>
                    </div>
                    <div className="flex items-center justify-center md:justify-start gap-1 text-amber-400 text-lg">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <span key={s} className={s <= Math.round(summaryData.averageRating) ? 'text-amber-400' : 'text-slate-200'}>
                          ★
                        </span>
                      ))}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      จากผู้ซื้อจริงทั้งหมด {total.toLocaleString('th-TH')} รายการ
                    </div>
                  </div>

                  {/* Stars Progress Breakdown */}
                  <div className="md:col-span-7 space-y-1.5 border-t md:border-t-0 md:border-l border-sky-100 pt-4 md:pt-0 md:pl-6">
                    {starsBreakdown.map(({ star, count }) => {
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0
                      return (
                        <div key={star} className="flex items-center gap-2.5 text-xs">
                          <span className="w-9 font-bold text-slate-600 flex items-center gap-1 shrink-0">
                            <span>{star}</span>
                            <span className="text-amber-400">★</span>
                          </span>
                          <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-12 text-right font-semibold text-slate-400 shrink-0 text-[11px]">
                            {pct}% ({count})
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Write Review Card Form (Expandable) */}
            {writeReviewOpen && isAuthed ? (
              <form
                onSubmit={submitReview}
                className="rounded-3xl border-2 border-sky-300 bg-sky-50/50 p-5 sm:p-6 space-y-4 shadow-sm animate-fade-in"
              >
                <div className="flex items-center justify-between border-b border-sky-200/60 pb-3">
                  <div className="text-sm font-black text-slate-900">✍️ แบ่งปันความประทับใจของคุณ</div>
                  <div className="text-xs text-sky-600 font-semibold">ผู้รีวิว: {currentUser?.display_name || currentUser?.username || 'สมาชิก'}</div>
                </div>

                {/* Star Picker */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700">ให้คะแนนความพึงพอใจ:</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 text-3xl cursor-pointer select-none">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setReviewForm((prev) => ({ ...prev, rating: star }))}
                          className={`p-1 transition-transform hover:scale-125 ${
                            star <= (hoverRating || reviewForm.rating)
                              ? 'text-amber-400 drop-shadow-sm'
                              : 'text-slate-300'
                          }`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <span className="rounded-full bg-white border border-sky-200 px-3 py-1 text-xs font-black text-sky-700 shadow-xs">
                      {reviewForm.rating === 5 ? '🤩 ยอดเยี่ยมที่สุด (5 ดาว)'
                        : reviewForm.rating === 4 ? '😊 ดีมาก (4 ดาว)'
                        : reviewForm.rating === 3 ? '😐 ปานกลาง (3 ดาว)'
                        : reviewForm.rating === 2 ? '😕 พอใช้ (2 ดาว)'
                        : '😞 ควรปรับปรุง (1 ดาว)'}
                    </span>
                  </div>
                </div>

                {/* Quick Tags */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-500">แท็กข้อความด่วน (คลิกเพื่อเพิ่ม):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {['⚡ ส่งไวมาก', '💯 ใช้งานได้จริง 100%', '✨ คุ้มค่าคุ้มราคา', '👍 บริการดีมาก', '🔥 แนะนำเลย', '🛡️ ปลอดภัย มั่นใจได้'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setReviewForm((prev) => ({
                            ...prev,
                            comment: prev.comment ? `${prev.comment} ${tag}` : tag,
                          }))
                        }}
                        className="rounded-xl border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-sky-400 hover:bg-sky-50 transition-colors"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comment Text Area */}
                <div>
                  <label className="text-xs font-black text-slate-700">ข้อความรีวิวของคุณ:</label>
                  <textarea
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm((prev) => ({ ...prev, comment: e.target.value }))}
                    rows={3}
                    maxLength={1200}
                    placeholder="เขียนบอกเล่าประสบการณ์หลังสั่งซื้อสินค้า เพื่อเป็นประโยชน์แก่ผู้ซื้อท่านอื่น..."
                    className="ui-field mt-1.5 w-full bg-white rounded-2xl p-3.5 text-xs text-slate-800"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs font-bold text-slate-500">
                    {reviewMessage ? (
                      <span className={reviewStatus === 'success' ? 'text-emerald-600' : 'text-rose-600'}>
                        {reviewMessage}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWriteReviewOpen(false)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={reviewStatus === 'submitting'}
                      className="rounded-xl bg-sky-500 px-5 py-2 text-xs font-black text-white shadow-md shadow-sky-500/20 hover:bg-sky-600 disabled:opacity-60"
                    >
                      {reviewStatus === 'submitting' ? 'กำลังบันทึก...' : 'ส่งรีวิวทันที'}
                    </button>
                  </div>
                </div>
              </form>
            ) : null}

            {/* Filter Tabs */}
            {reviewItems.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-sky-100 pb-3">
                <span className="text-xs font-bold text-slate-500 mr-1">ตัวกรอง:</span>
                {[
                  { id: 'all', label: `ทั้งหมด (${reviewItems.length})` },
                  { id: '5', label: `5 ดาว (${reviewItems.filter((r) => r.rating === 5).length})` },
                  { id: '4', label: `4 ดาว (${reviewItems.filter((r) => r.rating === 4).length})` },
                  { id: '3', label: `3 ดาว (${reviewItems.filter((r) => r.rating === 3).length})` },
                  { id: '2', label: `2 ดาว (${reviewItems.filter((r) => r.rating === 2).length})` },
                  { id: '1', label: `1 ดาว (${reviewItems.filter((r) => r.rating === 1).length})` },
                ].map(({ id: fId, label }) => (
                  <button
                    key={fId}
                    type="button"
                    onClick={() => setReviewFilter(fId)}
                    className={`rounded-xl px-3 py-1 text-xs font-black transition-all ${
                      reviewFilter === fId
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'border border-sky-100 bg-sky-50/60 text-slate-600 hover:bg-sky-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Reviews Feed List */}
            <div className="space-y-3 pt-1">
              {(() => {
                const filtered = reviewFilter === 'all'
                  ? reviewItems
                  : reviewItems.filter((r) => r.rating === Number(reviewFilter))

                if (filtered.length === 0) {
                  return (
                    <div className="rounded-3xl border border-dashed border-sky-200 bg-sky-50/30 p-8 text-center space-y-2">
                      <div className="text-3xl">💬</div>
                      <div className="text-sm font-black text-slate-700">
                        {reviewItems.length === 0 ? 'ยังไม่มีรีวิวสำหรับสินค้านี้' : 'ไม่พบรีวิวในตัวกรองนี้'}
                      </div>
                      <div className="text-xs text-slate-400">สั่งซื้อสินค้าและร่วมเป็นคนแรกที่เขียนรีวิว!</div>
                    </div>
                  )
                }

                return filtered.map((review) => (
                  <div
                    key={review.id}
                    className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/30 p-4 sm:p-5 shadow-xs space-y-2.5 transition-all hover:border-sky-200"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          name={review.reviewer_name}
                          src={review.reviewer_avatar}
                          size={34}
                          rounded="full"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{review.reviewer_name || 'ผู้ซื้อ'}</span>
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.2 text-[9px] font-black text-emerald-700">
                              ✓ ผู้ซื้อจริง
                            </span>
                          </div>
                          {review.created_at ? (
                            <div className="text-[10px] font-semibold text-slate-400">
                              {new Date(review.created_at).toLocaleDateString('th-TH', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-amber-400 text-sm">
                        {'★'.repeat(review.rating)}
                        <span className="text-slate-200">{'★'.repeat(Math.max(0, 5 - review.rating))}</span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-700 font-medium whitespace-pre-wrap border border-slate-100">
                      {review.comment}
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>

        {/* Right Column: Sticky Purchasing Box */}
        <aside className="min-w-0 rounded-3xl border border-sky-200 bg-white p-5 shadow-sm sm:p-7 lg:col-span-5 lg:sticky lg:top-24 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {product.badge && (
                  <span className="rounded-full border border-rose-400 bg-rose-500 px-2.5 py-0.5 text-[10px] font-black text-white shadow-xs">
                    {product.badge}
                  </span>
                )}
                {product.sku && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-500">
                    SKU: {product.sku}
                  </span>
                )}
              </div>
              <h1 className="break-words text-2xl font-black leading-tight text-slate-900 sm:text-3xl">{product.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-0.5 text-[11px] font-black ${outOfStock ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                  {outOfStock ? 'ไม่พร้อมขาย' : 'พร้อมสั่งซื้อ'}
                </span>
                <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-0.5 text-[11px] font-bold text-slate-600">{product.category_name}</span>
                <ReviewSummary summary={reviews.summary} compact />
              </div>

              {/* Tags */}
              {Array.isArray(product.tags) && product.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {product.tags.map((t, idx) => (
                    <span key={idx} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Share / Copy Link Button */}
              <button
                type="button"
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(window.location.href)
                    setCopiedLink(true)
                    setTimeout(() => setCopiedLink(false), 2000)
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-sky-50 transition shadow-xs"
                title="คัดลอกลิงก์สินค้านี้"
              >
                {copiedLink ? (
                  <>
                    <span className="text-emerald-600 font-black">✓</span>
                    <span className="text-emerald-600 font-bold">คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    <span>แชร์</span>
                  </>
                )}
              </button>
              <WishlistButton
                productId={product.id}
                initialFollowed={wishlist.followed}
                isAuthed={isAuthed}
                onChange={(followed) => setWishlist({ followed, loaded: true })}
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-500">ราคา</div>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <div className="break-words text-3xl font-black text-slate-900 sm:text-4xl">{priceDisplayLabel}</div>
              {hasPromo ? <div className="text-sm font-bold text-slate-400 line-through">{originalPriceLabel}</div> : null}
            </div>
            {hasPromo && product.promo_ends_at ? (
              <div className="mt-3">
                <CountdownPill endsAt={product.promo_ends_at} />
              </div>
            ) : null}
          </div>

          {highlights.length > 0 ? (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
              <div className="text-xs font-black text-slate-700">ไฮไลท์</div>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
                {highlights.map((highlight, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-slate-600">สต็อก</span>
                <span className={outOfStock ? 'text-xs font-black text-rose-600' : 'text-xs font-black text-emerald-700'}>{stockLabel}</span>
              </div>
            </div>

            {hasProductOptions ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                <label className="text-xs font-black text-slate-700" htmlFor="product-option">ตัวเลือกสินค้า</label>
                <select
                  id="product-option"
                  value={selectedOptionId}
                  onChange={(event) => setSelectedOptionId(event.target.value)}
                  className="ui-field mt-2 h-11"
                >
                  <option value="">{allOptionsOut ? 'ตัวเลือกหมดทั้งหมด' : 'เลือกตัวเลือก'}</option>
                  {optionItems.map((option, index) => (
                    <option key={option.id || index} value={option.id} disabled={option.out_of_stock}>
                      {option.label}
                      {option.value ? ` • ${option.value}` : ''}
                      {option.price_points != null ? ` • ${fmt(option.price_points)} พ้อยท์` : ''}
                      {option.has_limit ? (option.out_of_stock ? ' • หมด' : ` • เหลือ ${fmt(option.remaining)}`) : ''}
                    </option>
                  ))}
                </select>
                {optionStockStatus === 'loading' ? <div className="mt-2 text-[11px] text-slate-500">กำลังโหลดสต็อกตัวเลือก...</div> : null}
                {!canOptionSubmit && !allOptionsOut ? <div className="mt-2 text-[11px] font-bold text-sky-600">กรุณาเลือกตัวเลือกก่อนสั่งซื้อ</div> : null}
                {selectedOption ? (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-white p-3 text-xs text-slate-600">
                    <div><span className="text-slate-400">เลือกแล้ว:</span> <span className="font-bold text-slate-900">{selectedOption.label}</span></div>
                    {selectedOption.value ? <div className="mt-1"><span className="text-slate-400">ค่า:</span> {selectedOption.value}</div> : null}
                    {selectedOptionHasLimit ? <div className="mt-1"><span className="text-slate-400">คงเหลือ:</span> {fmt(selectedOptionRemaining)} ชิ้น</div> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isFarm ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                <div className="text-xs font-black text-slate-700">กรอกข้อมูลของคุณ</div>
                <div className="mt-3 grid gap-3">
                  {farmFields.length > 0 ? farmFields.map((field) => (
                    <div key={field.id}>
                      {field.type === 'checkbox' ? (
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                          <input type="checkbox" checked={Boolean(farmForm?.[field.id])} onChange={(event) => setFarmForm((prev) => ({ ...prev, [field.id]: event.target.checked }))} />
                          <span>{field.label}{field.required ? <span className="text-rose-500"> *</span> : null}</span>
                        </label>
                      ) : (
                        <>
                          <label className="text-[11px] font-bold text-slate-600">{field.label}{field.required ? <span className="text-rose-500"> *</span> : null}</label>
                          <input value={farmForm?.[field.id] ?? ''} onChange={(event) => setFarmForm((prev) => ({ ...prev, [field.id]: event.target.value }))} placeholder={field.label} className="ui-field mt-1 h-11" />
                        </>
                      )}
                    </div>
                  )) : <div className="text-xs text-slate-500">ไม่ต้องกรอกข้อมูลเพิ่มเติม</div>}
                  <div className="text-[11px] leading-5 text-slate-400">ระบบจะส่งข้อมูลนี้ให้แอดมินเพื่อดำเนินการ</div>
                </div>
              </div>
            ) : null}

            {isUidForm ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                <div className="text-xs font-black text-slate-700">กรอก UID ของคุณ</div>
                <input value={uidForm.uid} onChange={(event) => setUidForm((prev) => ({ ...prev, uid: event.target.value }))} placeholder="กรอก UID" className="ui-field mt-3 h-11" />
                <label className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input type="checkbox" checked={Boolean(uidForm.confirmed)} onChange={(event) => setUidForm((prev) => ({ ...prev, confirmed: event.target.checked }))} />
                  ยืนยันว่า UID ถูกต้อง
                </label>
                <div className="mt-1.5 text-[11px] leading-5 text-slate-400">กรุณาตรวจสอบ UID ก่อนสั่งซื้อเพื่อป้องกันการเติมผิดบัญชี</div>
              </div>
            ) : null}

            {/* Volume Pricing Tiered Discounts Table */}
            {Array.isArray(product.volume_pricing) && product.volume_pricing.length > 0 && !isMystery ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                    <span>🏷️ ราคาส่งพิเศษตามจำนวน</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700">คลิกเพื่อเลือกจำนวน</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {product.volume_pricing.map((tier, i) => {
                    const isTierActive = safeQty >= tier.min_qty
                    const discountLabel = tier.discount_percent
                      ? `ลด ${tier.discount_percent}%`
                      : `ลด ${fmt(tier.discount_amount_points)} แต้ม/ชิ้น`
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setQty(String(tier.min_qty))
                          setQtyRequiredOpen(false)
                        }}
                        className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                          isTierActive
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                            : 'bg-white border-emerald-200 text-slate-800 hover:border-emerald-400'
                        }`}
                      >
                        <div className="text-xs font-black">ซื้อ {tier.min_qty}+ ชิ้น</div>
                        <div className={`text-[11px] font-bold ${isTierActive ? 'text-emerald-100' : 'text-emerald-600'}`}>
                          {discountLabel}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {isMystery ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-700">
                    {isFreeBox ? '🎁 สุ่มฟรี' : '🎲 เลือกจำนวนครั้งที่สุ่ม'}
                  </label>
                  {isFreeBox ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-700">
                      จำกัด 1 กล่องต่อครั้ง
                    </span>
                  ) : null}
                </div>

                {isFreeBox ? (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-sky-200 bg-white p-3.5 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">🎁</span>
                      <div>
                        <div className="text-xs font-black text-slate-900">กล่องสุ่มฟรี (1 กล่อง)</div>
                        <div className="text-[11px] text-slate-400">กดปุ่มสุ่มด้านล่างเพื่อลุ้นรับของรางวัลทันที</div>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-600">ฟรี 0 พ้อยท์</span>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 5, 10].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            setQty(String(count))
                            setQtyRequiredOpen(false)
                          }}
                          className={`flex flex-col items-center justify-center rounded-xl border py-2.5 text-xs font-black transition-all ${
                            safeQty === count
                              ? 'border-sky-500 bg-sky-500 text-white shadow-md shadow-sky-500/20'
                              : 'border-sky-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
                          }`}
                        >
                          <span>สุ่ม {count} ครั้ง</span>
                          <span className={`text-[10px] font-semibold ${safeQty === count ? 'text-sky-100' : 'text-slate-400'}`}>
                            ({fmt(displayUnitPoints * count)} พ้อยท์)
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-white px-3.5 py-2.5 text-xs text-slate-600 shadow-sm">
                      <span className="font-bold text-slate-500">ยอดชำระ ({safeQty} ครั้ง):</span>
                      <span className="text-base font-black text-emerald-600">{fmt(displayTotalPoints)} พ้อยท์</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                <div className="grid gap-3">
                  <div className="min-w-0">
                    <label className="text-xs font-black text-slate-700">จำนวน</label>
                    <input
                      type="number"
                      min={1}
                      max={maxQty}
                      value={qty}
                      onChange={(event) => {
                        const raw = String(event.target.value ?? '')
                        if (raw === '') {
                          setQty('')
                          return
                        }
                        const next = Number(raw)
                        if (!Number.isFinite(next)) return
                        setQty(String(Math.max(1, Math.min(maxQty, Math.trunc(next)))))
                        setQtyRequiredOpen(false)
                      }}
                      className="ui-field mt-2 h-11 w-full"
                    />
                    <div className="mt-1.5 text-[11px] text-slate-400">เลือกได้ 1 - {fmt(maxQty)}</div>
                  </div>
                  <div className="rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-600 shadow-sm">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">รวม</div>
                    <div className="mt-0.5 whitespace-nowrap text-base font-black text-slate-900">
                      <span className="text-emerald-600">{fmt(displayTotalPoints)}</span> พ้อยท์
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
              <label className="text-xs font-black text-slate-700">โค้ดส่วนลด</label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={couponInput}
                  onChange={(event) => {
                    setCouponInput(event.target.value)
                    setCouponError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setCouponCode(couponInput.trim().toUpperCase())
                      setCouponError('')
                    }
                  }}
                  placeholder="กรอกโค้ดคูปอง ถ้ามี"
                  className="ui-field h-10"
                />
                <button type="button" onClick={() => { setCouponCode(couponInput.trim().toUpperCase()); setCouponError('') }} className="ui-btn h-10 px-4 text-xs font-black">
                  ใช้โค้ด
                </button>
              </div>
              {quoteStatus === 'loading' ? <div className="mt-2 text-[11px] text-slate-500">กำลังคำนวณส่วนลด...</div> : null}
              {couponError ? <div className="mt-2 text-[11px] font-bold text-rose-600">{couponError}</div> : null}
              {!couponError && quote?.coupon_valid && couponCode ? <div className="mt-2 text-[11px] font-bold text-emerald-600">โค้ด {quote.coupon_code} ใช้ได้</div> : null}
              {quote && (Number(quote.promo_discount_total_points ?? 0) > 0 || Number(quote.coupon_discount_total_points ?? 0) > 0) ? (
                <div className="mt-3 space-y-1 rounded-xl border border-sky-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
                  <div>ราคาเดิม: <span className="font-bold text-slate-900">{fmt(quote.subtotal_points)}</span> พ้อยท์</div>
                  {Number(quote.promo_discount_total_points ?? 0) > 0 ? <div>ลดโปรโมชัน: <span className="font-bold text-sky-600">-{fmt(quote.promo_discount_total_points)}</span> พ้อยท์</div> : null}
                  {Number(quote.coupon_discount_total_points ?? 0) > 0 ? <div>ลดคูปอง: <span className="font-bold text-sky-600">-{fmt(quote.coupon_discount_total_points)}</span> พ้อยท์</div> : null}
                  <div className="border-t border-sky-100 pt-1">สุทธิ: <span className="font-black text-emerald-600">{fmt(quote.total_points)}</span> พ้อยท์</div>
                </div>
              ) : null}
              <DiscountBreakdown quote={quote} />
            </div>
          </div>

          <div className="grid gap-2.5 pt-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={openConfirm}
              disabled={outOfStock || selectedOptionOut || optionInsufficient || buyStatus === 'submitting' || !canSubmit}
              className="ui-btn-primary h-12 flex-1 px-6 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {primaryButtonLabel}
            </button>
            {hasManual ? (
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="ui-btn h-12 px-5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                คู่มือ
              </button>
            ) : null}
          </div>
          {buyError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{buyError}</div> : null}
        </aside>
      </section>

      {/* Related Products from same category */}
      {relatedProducts.length > 0 ? (
        <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-sky-100 pb-3">
            <div>
              <h3 className="text-lg font-black text-slate-900">สินค้าอื่นๆ ในหมวดหมู่นี้</h3>
              <div className="text-xs text-slate-400">สินค้าที่คุณอาจสนใจเพิ่มเติม</div>
            </div>
            <Link to={`/category/${product.category_slug}`} className="text-xs font-bold text-sky-600 hover:underline">
              ดูทั้งหมดในหมวดหมู่นี้ →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((p) => (
              <Link
                key={p.id}
                to={`/p/${p.slug || p.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-sky-100 bg-slate-50/50 p-3 hover:border-sky-300 hover:bg-white hover:shadow-md transition"
              >
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-white border border-slate-100">
                  {p.badge && (
                    <span className="absolute left-2 top-2 z-10 rounded-full bg-rose-500 text-white text-[9px] font-black px-2 py-0.5 shadow-sm">
                      {p.badge}
                    </span>
                  )}
                  {p.image_url ? (
                    <img src={resolveImageUrl(p.image_url)} alt="" className="h-full w-full object-contain group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="grid h-full place-items-center text-slate-300 text-xs">No Image</div>
                  )}
                </div>
                <div className="mt-2.5 flex-1 flex flex-col justify-between">
                  <div className="text-xs font-bold text-slate-800 line-clamp-2 group-hover:text-sky-600 transition">{p.name}</div>
                  <div className="mt-2 text-sm font-black text-sky-600">{fmt(p.price)} พ้อยท์</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {qtyRequiredOpen ? (
        <Modal onClose={() => setQtyRequiredOpen(false)} maxWidth="max-w-sm">
          <div className="text-lg font-black text-slate-900">กรุณาใส่จำนวนสินค้า</div>
          <div className="mt-2 text-xs leading-relaxed text-slate-600">กรุณาใส่จำนวนสินค้าก่อนกดสั่งซื้อ</div>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setQtyRequiredOpen(false)} className="ui-btn-primary h-10 px-5 text-xs font-black">ตกลง</button>
          </div>
        </Modal>
      ) : null}

      {confirmOpen ? (
        <Modal onClose={() => setConfirmOpen(false)}>
          <div className="text-lg font-black text-slate-900">ยืนยันการสั่งซื้อ</div>
          <div className="mt-1.5 text-xs leading-relaxed text-slate-600">ตรวจสอบรายการก่อนกดยืนยัน ระบบจะตัดพ้อยท์ทันที</div>
          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
            <div className="text-xs font-bold text-slate-500">ยอดชำระ</div>
            <div className="mt-1 text-3xl font-black text-emerald-600">{fmt(displayTotalPoints)} พ้อยท์</div>
            <div className="mt-3 grid gap-1 text-xs text-slate-600">
              <div>จำนวน: <span className="font-bold text-slate-900">{safeQty}</span></div>
              <div>ราคา/ชิ้น: <span className="font-bold text-slate-900">{fmt(displayUnitPoints)} พ้อยท์</span></div>
              {selectedOption ? <div>ตัวเลือก: <span className="font-bold text-sky-700">{selectedOption.label}</span></div> : null}
            </div>
          </div>
          {buyError ? <div className="mt-3 text-xs font-bold text-rose-600">{buyError}</div> : null}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setConfirmOpen(false)} disabled={buyStatus === 'submitting'} className="ui-btn h-10 flex-1 text-xs font-black">ยกเลิก</button>
            <button type="button" onClick={buy} disabled={buyStatus === 'submitting'} className="ui-btn-primary h-10 flex-1 text-xs font-black">
              {buyStatus === 'submitting' ? 'กำลังยืนยัน...' : 'ยืนยันสั่งซื้อ'}
            </button>
          </div>
        </Modal>
      ) : null}

      {successOpen ? (
        <Modal onClose={() => setSuccessOpen(false)}>
          <div className="text-lg font-black text-slate-900">{isMystery ? 'สุ่มสำเร็จ' : 'ซื้อสำเร็จ'}</div>
          <div className="mt-1.5 text-xs leading-relaxed text-slate-600">ระบบทำรายการเรียบร้อยแล้ว สามารถดูสินค้าที่ได้รับได้ที่กล่องรับของ</div>
          {successOption ? (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-slate-700">
              ตัวเลือก: <span className="font-bold text-sky-700">{successOption.label}</span>
              {successOption.value ? <span> • {successOption.value}</span> : null}
            </div>
          ) : null}
          {successItems.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-slate-700">
              {successItems.slice(0, 3).map((item, index) => (
                <div key={index}>{item.prize_name || item.prize_product_name || item.delivery_name || 'รายการที่ได้รับ'}</div>
              ))}
            </div>
          ) : null}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={goToInboxAfterPurchase} className="ui-btn-primary h-10 flex-1 px-4 text-xs font-black">
              ไปกล่องรับของ
            </button>
            <button type="button" onClick={stayAfterPurchase} className="ui-btn h-10 flex-1 px-4 text-xs font-black">
              อยู่ต่อ
            </button>
          </div>
        </Modal>
      ) : null}

      {manualOpen ? (
        <Modal onClose={() => setManualOpen(false)} maxWidth="max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-black text-slate-900">คู่มือ / วิธีใช้งาน</div>
              <div className="mt-0.5 text-xs text-slate-500">{product.name}</div>
            </div>
            <button type="button" onClick={() => setManualOpen(false)} className="ui-btn h-9 px-4 text-xs font-black">ปิด</button>
          </div>
          <div className="mt-5 space-y-3">
            {manualText ? (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                <div className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{manualText}</div>
              </div>
            ) : null}
            {manualUrl ? (
              <a href={manualUrl} target="_blank" rel="noreferrer" className="block rounded-2xl border border-sky-100 bg-sky-50/40 p-4 text-xs font-bold text-sky-700 hover:bg-sky-50">
                เปิดลิงก์คู่มือ →
                <div className="mt-1 break-all text-[11px] text-slate-500">{manualUrl}</div>
              </a>
            ) : null}
            {manualVideoUrl ? (
              <a href={manualVideoUrl} target="_blank" rel="noreferrer" className="block rounded-2xl border border-sky-100 bg-sky-50/40 p-4 text-xs font-bold text-sky-700 hover:bg-sky-50">
                เปิดคลิปวิดีโอ →
                <div className="mt-1 break-all text-[11px] text-slate-500">{manualVideoUrl}</div>
              </a>
            ) : null}
          </div>
        </Modal>
      ) : null}

      <MysteryUnboxModal
        isOpen={mysteryUnboxOpen}
        isLoading={buyStatus === 'submitting'}
        onClose={() => setMysteryUnboxOpen(false)}
        onRollAgain={buy}
        boxName={product.name}
        boxImage={resolveImageUrl(product.image_url)}
        picks={successData?.picks || []}
        orderRef={successData?.order?.ref || ''}
        canRollAgain={!outOfStock && buyStatus !== 'submitting'}
        rollPriceLabel={isFreeBox ? 'ฟรี' : `${fmt(displayTotalPoints)} พ้อยท์`}
      />
    </div>
  )
}
