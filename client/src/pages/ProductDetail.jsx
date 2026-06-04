import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchJson, reloadPageSoon, triggerAppRefresh } from '../api.js'
import DiscountBreakdown from '../components/growth/DiscountBreakdown.jsx'
import ReviewSummary from '../components/growth/ReviewSummary.jsx'
import WishlistButton from '../components/growth/WishlistButton.jsx'
import { DEFAULT_UI_IMAGE_SETTINGS, normalizeUiImageSettings } from '../uiImageSettings.js'

function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString()
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
    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-black text-cyan-100">
      <span>หมดใน</span>
      <span className="tabular-nums">{time.d > 0 ? `${time.d}วัน ` : ''}{pad(time.h)}:{pad(time.m)}:{pad(time.s)}</span>
    </div>
  )
}

function Modal({ children, onClose, maxWidth = 'max-w-md' }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="popup-overlay-animate fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onMouseDown={onClose}>
      <div
        className={`popup-panel-animate w-full ${maxWidth} rounded-3xl border border-white/[0.08] bg-[#080b0f]/90 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.8)] backdrop-blur`}
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
  if (code === 'invalid_order_item_id') return 'กรุณาใส่เลขรายการสั่งซื้อให้ถูกต้อง'
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
  const [mysteryPrizes, setMysteryPrizes] = useState([])
  const [mysteryRecentWins, setMysteryRecentWins] = useState([])
  const [wishlist, setWishlist] = useState({ followed: false, loaded: false })
  const [reviews, setReviews] = useState({ summary: null, reviews: [] })
  const [reviewForm, setReviewForm] = useState({ order_item_id: '', rating: 5, comment: '' })
  const [reviewStatus, setReviewStatus] = useState('idle')
  const [reviewMessage, setReviewMessage] = useState('')

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
  const maxQty = isMystery ? serverQtyLimit : stockAwareMaxQty
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

    const orderItemId = Number(reviewForm.order_item_id)
    if (!Number.isFinite(orderItemId) || orderItemId <= 0) {
      setReviewStatus('error')
      setReviewMessage('กรุณาใส่เลขรายการสั่งซื้อให้ถูกต้อง')
      return
    }

    setReviewStatus('submitting')
    setReviewMessage('')
    try {
      await fetchJson(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_item_id: Math.trunc(orderItemId),
          rating: Number(reviewForm.rating),
          comment: reviewForm.comment,
        }),
      })
      setReviewForm({ order_item_id: '', rating: 5, comment: '' })
      setReviewStatus('success')
      setReviewMessage('ส่งรีวิวแล้ว รอแอดมินอนุมัติก่อนแสดงผล')
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
      setSuccessData(data)
      setSuccessOption(selectedOption ?? null)
      setSuccessOpen(true)
      triggerAppRefresh()
      reloadPageSoon()
      const nextProduct = await fetchJson(`/api/products/${id}`).catch(() => null)
      if (nextProduct?.product) setProduct(nextProduct.product)
      const nextStock = await fetchJson(`/api/products/${id}/option-stock`).catch(() => null)
      if (nextStock) setOptionStock(nextStock?.option_stock ?? null)
    } catch (error) {
      setBuyError(getApiErrorMessage(error))
      setBuyStatus('error')
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

  if (loading) {
    return (
      <div className="grid min-h-[460px] place-items-center rounded-3xl border border-white/[0.08] bg-white/[0.025]">
        <div className="text-sm font-bold text-white/55">กำลังโหลดสินค้า...</div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-3xl border border-white/[0.08] bg-white/[0.025] text-center">
        <div>
          <div className="text-lg font-black text-white">ไม่พบสินค้า</div>
          <Link to="/categories" className="ui-btn-primary mt-5 inline-flex h-11 items-center px-5 text-sm font-black">ดูหมวดหมู่สินค้า</Link>
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
              ? 'เริ่มสุ่มสินค้า'
              : 'ซื้อสินค้า'
  const successPicks = Array.isArray(successData?.picks) ? successData.picks : []
  const successItems = successPicks.length > 0 ? successPicks : []
  const reviewItems = Array.isArray(reviews.reviews) ? reviews.reviews : []

  return (
    <div className="space-y-7 fade-in-up">
      <div className="text-xs font-bold text-white/50">
        <Link to={`/category/${product.category_slug}`} className="hover:text-white">{product.category_name}</Link>
        <span className="mx-2 text-white/20">/</span>
        <span className="text-white/75">{product.name}</span>
      </div>

      <section className="motion-stagger grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <div className="space-y-4">
          <div className="motion-card motion-hover motion-soft-glow relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] shadow-[0_30px_100px_rgba(0,0,0,0.32)]" style={{ aspectRatio: uiImageSettings.product_detail_ratio }}>
            <div className="absolute inset-0 scanline opacity-35" />
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className={`motion-image absolute inset-0 h-full w-full ${uiImageSettings.product_detail_force_fit ? 'object-fill' : 'object-contain'}`}
              />
            ) : (
              <div className="grid h-full place-items-center bg-cyan-500/5 text-white/25">ไม่มีรูปสินค้า</div>
            )}
            {hasPromo ? (
              <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-300/20 bg-cyan-500/20 px-3 py-1 text-xs font-black text-cyan-100 backdrop-blur">ลดราคา</span>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-100 backdrop-blur">{promoBadgeLabel}</span>
              </div>
            ) : null}
          </div>

          {isMystery && mysteryPrizes.length > 0 ? (
            <div className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-sm font-black text-white">รายการสุ่ม</div>
                  <div className="mt-1 text-xs text-white/42">โอกาสและของรางวัลที่มีในกล่องนี้</div>
                </div>
                <div className="text-xs font-bold text-cyan-200">{mysteryRecentWins.length} ล่าสุด</div>
              </div>
              <div className="motion-stagger mt-4 grid gap-3 sm:grid-cols-2">
                {mysteryPrizes.slice(0, 8).map((prize) => {
                  const chance = Number(prize.chance_percent ?? 0)
                  return (
                    <div key={prize.id} className="motion-card motion-hover flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-black/30">
                        {prize.prize_image_url ? <img src={prize.prize_image_url} alt={prize.prize_name} className="h-full w-full object-contain" /> : <span className="text-xs font-black text-white/50">Prize</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-white">{prize.prize_name}</div>
                        <div className="mt-1 text-xs font-black text-cyan-200">{chance.toFixed(chance >= 1 ? 2 : 4)}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="motion-card rounded-3xl border border-white/[0.08] glass-strong p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black leading-tight text-white">{product.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-black ${outOfStock ? 'bg-red-500/10 text-red-200' : 'bg-emerald-500/10 text-emerald-200'}`}>
                  {outOfStock ? 'ไม่พร้อมขาย' : 'พร้อมสั่งซื้อ'}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/55">{product.category_name}</span>
                <ReviewSummary summary={reviews.summary} compact />
              </div>
            </div>
            <WishlistButton
              productId={product.id}
              initialFollowed={wishlist.followed}
              isAuthed={isAuthed}
              onChange={(followed) => setWishlist({ followed, loaded: true })}
            />
          </div>

          <div className="mt-5">
            <div className="text-xs font-bold text-white/45">ราคา</div>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <div className="motion-price text-4xl font-black text-emerald-300 [text-shadow:0_0_12px_rgba(110,231,183,0.18)]">{priceDisplayLabel}</div>
              {hasPromo ? <div className="text-sm font-bold text-white/35 line-through">{originalPriceLabel}</div> : null}
            </div>
            {hasPromo && product.promo_ends_at ? (
              <div className="mt-3">
                <CountdownPill endsAt={product.promo_ends_at} />
              </div>
            ) : null}
          </div>

          {highlights.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
              <div className="text-xs font-black text-white/55">ไฮไลท์</div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/68">
                {highlights.map((highlight, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-white/55">สต็อก</span>
                <span className={outOfStock ? 'text-sm font-black text-red-200' : 'text-sm font-black text-white'}>{stockLabel}</span>
              </div>
            </div>

            {hasProductOptions ? (
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <label className="text-xs font-black text-white/55" htmlFor="product-option">ตัวเลือกสินค้า</label>
                <select
                  id="product-option"
                  value={selectedOptionId}
                  onChange={(event) => setSelectedOptionId(event.target.value)}
                  className="ui-field mt-2 h-12"
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
                {optionStockStatus === 'loading' ? <div className="mt-2 text-[11px] text-white/45">กำลังโหลดสต็อกตัวเลือก...</div> : null}
                {!canOptionSubmit && !allOptionsOut ? <div className="mt-2 text-[11px] font-bold text-cyan-200">กรุณาเลือกตัวเลือกก่อนสั่งซื้อ</div> : null}
                {selectedOption ? (
                  <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3 text-xs text-white/55">
                    <div><span className="text-white/35">เลือกแล้ว:</span> <span className="font-bold text-white/80">{selectedOption.label}</span></div>
                    {selectedOption.value ? <div className="mt-1"><span className="text-white/35">ค่า:</span> {selectedOption.value}</div> : null}
                    {selectedOptionHasLimit ? <div className="mt-1"><span className="text-white/35">คงเหลือ:</span> {fmt(selectedOptionRemaining)} ชิ้น</div> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isFarm ? (
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-xs font-black text-white/55">กรอกข้อมูลของคุณ</div>
                <div className="mt-3 grid gap-3">
                  {farmFields.length > 0 ? farmFields.map((field) => (
                    <div key={field.id}>
                      {field.type === 'checkbox' ? (
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-white/65">
                          <input type="checkbox" checked={Boolean(farmForm?.[field.id])} onChange={(event) => setFarmForm((prev) => ({ ...prev, [field.id]: event.target.checked }))} />
                          <span>{field.label}{field.required ? <span className="text-cyan-300"> *</span> : null}</span>
                        </label>
                      ) : (
                        <>
                          <label className="text-[11px] font-bold text-white/55">{field.label}{field.required ? <span className="text-cyan-300"> *</span> : null}</label>
                          <input value={farmForm?.[field.id] ?? ''} onChange={(event) => setFarmForm((prev) => ({ ...prev, [field.id]: event.target.value }))} placeholder={field.label} className="ui-field mt-1 h-11" />
                        </>
                      )}
                    </div>
                  )) : <div className="text-xs text-white/45">ไม่ต้องกรอกข้อมูลเพิ่มเติม</div>}
                  <div className="text-[11px] leading-5 text-white/42">ระบบจะส่งข้อมูลนี้ให้แอดมินเพื่อดำเนินการ</div>
                </div>
              </div>
            ) : null}

            {isUidForm ? (
              <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                <div className="text-xs font-black text-white/55">กรอก UID ของคุณ</div>
                <input value={uidForm.uid} onChange={(event) => setUidForm((prev) => ({ ...prev, uid: event.target.value }))} placeholder="กรอก UID" className="ui-field mt-3 h-11" />
                <label className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-white/65">
                  <input type="checkbox" checked={Boolean(uidForm.confirmed)} onChange={(event) => setUidForm((prev) => ({ ...prev, confirmed: event.target.checked }))} />
                  ยืนยันว่า UID ถูกต้อง
                </label>
                <div className="mt-2 text-[11px] leading-5 text-white/42">กรุณาตรวจสอบ UID ก่อนสั่งซื้อเพื่อป้องกันการเติมผิดบัญชี</div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs font-black text-white/55">จำนวน</label>
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
                    className="ui-field mt-2 h-12 w-32"
                  />
                </div>
                <div className="pb-2 text-sm text-white/55">
                  รวม <span className="font-black text-emerald-300">{fmt(displayTotalPoints)}</span> พ้อยท์
                </div>
              </div>
              <div className="mt-2 text-[11px] text-white/42">เลือกได้ 1 - {fmt(maxQty)}</div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              <label className="text-xs font-black text-white/55">โค้ดส่วนลด</label>
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
                  className="ui-field h-11"
                />
                <button type="button" onClick={() => { setCouponCode(couponInput.trim().toUpperCase()); setCouponError('') }} className="ui-btn h-11 px-4 text-xs font-black">
                  ใช้โค้ด
                </button>
              </div>
              {quoteStatus === 'loading' ? <div className="mt-2 text-[11px] text-white/45">กำลังคำนวณส่วนลด...</div> : null}
              {couponError ? <div className="mt-2 text-[11px] font-bold text-cyan-200">{couponError}</div> : null}
              {!couponError && quote?.coupon_valid && couponCode ? <div className="mt-2 text-[11px] font-bold text-emerald-300">โค้ด {quote.coupon_code} ใช้ได้</div> : null}
              {quote && (Number(quote.promo_discount_total_points ?? 0) > 0 || Number(quote.coupon_discount_total_points ?? 0) > 0) ? (
                <div className="mt-3 space-y-1 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3 text-xs text-white/62">
                  <div>ราคาเดิม: <span className="font-bold text-white">{fmt(quote.subtotal_points)}</span> พ้อยท์</div>
                  {Number(quote.promo_discount_total_points ?? 0) > 0 ? <div>ลดโปรโมชัน: <span className="font-bold text-cyan-200">-{fmt(quote.promo_discount_total_points)}</span> พ้อยท์</div> : null}
                  {Number(quote.coupon_discount_total_points ?? 0) > 0 ? <div>ลดคูปอง: <span className="font-bold text-cyan-200">-{fmt(quote.coupon_discount_total_points)}</span> พ้อยท์</div> : null}
                  <div className="border-t border-white/10 pt-1">สุทธิ: <span className="font-black text-emerald-300">{fmt(quote.total_points)}</span> พ้อยท์</div>
                </div>
              ) : null}
              <DiscountBreakdown quote={quote} />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={openConfirm}
              disabled={outOfStock || selectedOptionOut || optionInsufficient || buyStatus === 'submitting' || !canSubmit}
              className="ui-btn-primary h-12 w-full px-6 text-sm font-black disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
            >
              {primaryButtonLabel}
            </button>
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              disabled={!hasManual}
              className="ui-btn h-12 w-full px-6 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              คู่มือ / วิธีใช้งาน
            </button>
          </div>
          {buyError ? <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-cyan-500/10 px-4 py-3 text-xs font-bold text-cyan-100">{buyError}</div> : null}
        </aside>
      </section>

      <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
        <div className="text-base font-black text-white">รายละเอียดสินค้า</div>
        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/62">{product.description || 'ยังไม่มีรายละเอียดสินค้า'}</div>
      </section>

      <section id="reviews" className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-base font-black text-white">รีวิวจากผู้ซื้อจริง</div>
            <div className="mt-1 text-sm text-white/45">แสดงเฉพาะรีวิวที่ผ่านการอนุมัติ เพื่อให้ข้อมูลน่าเชื่อถือและไม่รกสายตา</div>
          </div>
          <ReviewSummary summary={reviews.summary} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
            {isAuthed === true ? (
              <form onSubmit={submitReview} className="grid gap-3">
                <div>
                  <label className="text-[11px] font-black text-white/55">เลขรายการสั่งซื้อ</label>
                  <input
                    type="number"
                    min={1}
                    value={reviewForm.order_item_id}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, order_item_id: event.target.value }))}
                    placeholder="เช่น 1234"
                    className="ui-field mt-1 h-11"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-white/55">คะแนน</label>
                  <select
                    value={reviewForm.rating}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}
                    className="ui-field mt-1 h-11"
                  >
                    {[5, 4, 3, 2, 1].map((rating) => (
                      <option key={rating} value={rating}>{ratingStars(rating)} {rating}/5</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-black text-white/55">รีวิว</label>
                  <textarea
                    value={reviewForm.comment}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, comment: event.target.value }))}
                    rows={4}
                    maxLength={1200}
                    placeholder="เล่าประสบการณ์หลังซื้อสินค้า"
                    className="ui-field mt-1 min-h-28 py-3"
                  />
                </div>
                <button type="submit" disabled={reviewStatus === 'submitting'} className="ui-btn-primary h-11 text-xs font-black disabled:cursor-wait disabled:opacity-60">
                  {reviewStatus === 'submitting' ? 'กำลังส่งรีวิว...' : 'ส่งรีวิว'}
                </button>
                {reviewMessage ? (
                  <div className={`text-xs font-bold ${reviewStatus === 'success' ? 'text-emerald-200' : 'text-rose-200'}`}>{reviewMessage}</div>
                ) : null}
              </form>
            ) : (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4 text-sm leading-6 text-white/55">
                เข้าสู่ระบบและซื้อสินค้าสำเร็จก่อน จึงจะเขียนรีวิวได้
                <div className="mt-3">
                  <Link to="/login" className="ui-btn inline-flex h-10 items-center px-4 text-xs font-black">เข้าสู่ระบบ</Link>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {reviewItems.length > 0 ? reviewItems.map((review) => (
              <div key={review.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-black text-white">{review.reviewer_name || 'ผู้ซื้อ'}</div>
                  <div className="text-xs font-black text-amber-100">{ratingStars(review.rating)}</div>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/62">{review.comment}</div>
                {review.created_at ? <div className="mt-3 text-[11px] text-white/35">{new Date(review.created_at).toLocaleDateString('th-TH')}</div> : null}
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm font-bold text-white/42">ยังไม่มีรีวิวที่ผ่านการอนุมัติ</div>
            )}
          </div>
        </div>
      </section>

      {qtyRequiredOpen ? (
        <Modal onClose={() => setQtyRequiredOpen(false)} maxWidth="max-w-sm">
          <div className="text-lg font-black text-white">กรุณาใส่จำนวนสินค้า</div>
          <div className="mt-2 text-sm leading-6 text-white/55">กรุณาใส่จำนวนสินค้าก่อนกดสั่งซื้อ</div>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setQtyRequiredOpen(false)} className="ui-btn-primary h-10 px-5 text-sm font-black">ตกลง</button>
          </div>
        </Modal>
      ) : null}

      {confirmOpen ? (
        <Modal onClose={() => setConfirmOpen(false)}>
          <div className="text-lg font-black text-white">ยืนยันการสั่งซื้อ</div>
          <div className="mt-2 text-sm leading-6 text-white/55">ตรวจสอบรายการก่อนกดยืนยัน ระบบจะตัดพ้อยท์ทันที</div>
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
            <div className="text-xs font-bold text-white/45">ยอดชำระ</div>
            <div className="mt-1 text-3xl font-black text-emerald-300">{fmt(displayTotalPoints)} พ้อยท์</div>
            <div className="mt-3 grid gap-1 text-xs text-white/55">
              <div>จำนวน: <span className="font-bold text-white/80">{safeQty}</span></div>
              <div>ราคา/ชิ้น: <span className="font-bold text-white/80">{fmt(displayUnitPoints)} พ้อยท์</span></div>
              {selectedOption ? <div>ตัวเลือก: <span className="font-bold text-cyan-100">{selectedOption.label}</span></div> : null}
            </div>
          </div>
          {buyError ? <div className="mt-3 text-xs font-bold text-cyan-200">{buyError}</div> : null}
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
          <div className="text-lg font-black text-white">{isMystery ? 'สุ่มสำเร็จ' : 'ซื้อสำเร็จ'}</div>
          <div className="mt-2 text-sm leading-6 text-white/55">ระบบทำรายการเรียบร้อยแล้ว สามารถดูสินค้าที่ได้รับได้ที่กล่องรับของ</div>
          {successOption ? (
            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-xs text-white/58">
              ตัวเลือก: <span className="font-bold text-cyan-100">{successOption.label}</span>
              {successOption.value ? <span> • {successOption.value}</span> : null}
            </div>
          ) : null}
          {successItems.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-xs text-white/58">
              {successItems.slice(0, 3).map((item, index) => (
                <div key={index}>{item.prize_name || item.prize_product_name || item.delivery_name || 'รายการที่ได้รับ'}</div>
              ))}
            </div>
          ) : null}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => { setSuccessOpen(false); nav('/inbox') }} className="ui-btn-primary h-10 flex-1 text-xs font-black">ไปกล่องรับของ</button>
            <button type="button" onClick={() => setSuccessOpen(false)} className="ui-btn h-10 flex-1 text-xs font-black">อยู่ต่อ</button>
          </div>
        </Modal>
      ) : null}

      {manualOpen ? (
        <Modal onClose={() => setManualOpen(false)} maxWidth="max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-black text-white">คู่มือ / วิธีใช้งาน</div>
              <div className="mt-1 text-sm text-white/45">{product.name}</div>
            </div>
            <button type="button" onClick={() => setManualOpen(false)} className="ui-btn h-9 px-4 text-xs font-black">ปิด</button>
          </div>
          <div className="mt-5 space-y-3">
            {manualText ? (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                <div className="whitespace-pre-wrap text-sm leading-7 text-white/70">{manualText}</div>
              </div>
            ) : null}
            {manualUrl ? (
              <a href={manualUrl} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4 text-sm font-bold text-white hover:bg-white/[0.055]">
                เปิดลิงก์คู่มือ →
                <div className="mt-1 break-all text-xs text-white/42">{manualUrl}</div>
              </a>
            ) : null}
            {manualVideoUrl ? (
              <a href={manualVideoUrl} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4 text-sm font-bold text-white hover:bg-white/[0.055]">
                เปิดคลิปวิดีโอ →
                <div className="mt-1 break-all text-xs text-white/42">{manualVideoUrl}</div>
              </a>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
