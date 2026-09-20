import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchJson, reloadPageSoon, setAuthToken, triggerAppRefresh, copyToClipboard } from '../api.js'

const QUICK_AMOUNTS = [50, 100, 199, 300, 500, 1000]
const TOPUP_METHODS = ['angpao', 'coupon', 'promptpay']
const DEFAULT_TOPUP_SETTINGS = { angpao: true, coupon: true, promptpay: true }

const METHOD_META = {
  angpao: {
    label: 'ซองอั่งเปา',
    short: 'TrueMoney',
    detail: 'เติมผ่านลิงก์ซองอั่งเปา ค่าธรรมเนียม 0%',
    icon: 'gift',
  },
  coupon: {
    label: 'คูปอง',
    short: 'Redeem Code',
    detail: 'กรอกโค้ดคูปองเพื่อรับพ้อยท์ทันที',
    icon: 'ticket',
  },
}

METHOD_META.promptpay = {
  label: 'PromptPay',
  short: 'Manual QR',
  detail: 'เติมเงินผ่าน QR PromptPay สะดวกจ่ายง่ายค่าธรรมเนียม 0%',
  icon: 'card',
}

function Card({ children, className = '' }) {
  return <section className={`rounded-3xl border border-sky-200 bg-white shadow-sm ${className}`}>{children}</section>
}

function MethodIcon({ type }) {
  if (type === 'ticket') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 1 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 1 0 0-4V8Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 6v12" />
      </svg>
    )
  }
  if (type === 'card') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12v8H4v-8M2 7h20v5H2V7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 22V7M12 7H8.5A2.5 2.5 0 1 1 11 4.5V7Zm0 0h3.5A2.5 2.5 0 1 0 13 4.5V7Z" />
    </svg>
  )
}

function Popup({ title, message, kind = 'success', onClose }) {
  const isSuccess = kind === 'success'
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="popup-overlay-animate fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="popup-panel-animate w-full max-w-md rounded-3xl border border-sky-200 bg-white p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className={`grid h-16 w-16 place-items-center rounded-full border ${isSuccess ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-sky-200 bg-sky-50 text-sky-600'}`}>
            {isSuccess ? (
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4 10-10" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18m0-12 12 12" />
              </svg>
            )}
          </div>
          <div className="mt-4 text-lg font-black text-slate-900">{title}</div>
          {message ? <div className="mt-2 text-sm leading-6 text-slate-600">{message}</div> : null}
          <button type="button" onClick={onClose} className="mt-5 ui-btn w-full">ปิด</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function MethodOption({ id, active, disabled = false, onClick }) {
  const meta = METHOD_META[id]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-50'
          : active
            ? 'border-sky-500 bg-sky-50/80 shadow-md shadow-sky-500/10'
            : 'border-sky-100 bg-white hover:border-sky-300 hover:bg-sky-50/30'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${active ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-200 bg-sky-50 text-sky-700 group-hover:border-sky-300'}`}>
          <MethodIcon type={meta.icon} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-black text-slate-900">{meta.label}</div>
          <div className="truncate text-[11px] font-bold text-slate-400">{meta.short}</div>
        </div>
      </div>
    </button>
  )
}

function Step({ index, title, body }) {
  return (
    <div className="flex gap-4">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-sky-200 bg-sky-50 text-xs font-black text-sky-700">{index}</div>
      <div>
        <div className="text-xs font-black text-slate-900">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{body}</div>
      </div>
    </div>
  )
}

function friendlyError(errorText) {
  if (errorText === 'missing_config') return 'ระบบยังไม่พร้อมใช้งาน (ติดต่อแอดมิน)'
  if (errorText === 'invalid_reference') return 'รูปแบบลิงก์ไม่ถูกต้อง'
  if (errorText === 'duplicate_reference') return 'ลิงก์นี้ถูกใช้งานไปแล้ว'
  if (errorText === 'invalid_voucher') return 'ซองอั่งเปาไม่ถูกต้องหรือถูกรับไปแล้ว'
  if (errorText === 'coupon_not_found') return 'ไม่พบคูปองนี้ในระบบ'
  if (errorText === 'coupon_expired') return 'คูปองนี้หมดอายุแล้ว'
  if (errorText === 'coupon_usage_limit_reached') return 'คูปองนี้ถูกใช้งานครบจำนวนแล้ว'
  if (errorText === 'coupon_already_used') return 'คุณเคยใช้งานคูปองนี้ไปแล้ว'
  return errorText || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('invalid_file'))
    }
    reader.onerror = () => reject(new Error('read_file_error'))
    reader.readAsDataURL(file)
  })
}

function formatPromptpayExpiry(value) {
  const time = value ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(time)) return ''
  return new Date(time).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function topupFriendlyError(errorText) {
  if (errorText === 'missing_promptpay_config') return 'ยังไม่ได้ตั้งค่า PromptPay สำหรับร้าน'
  if (errorText === 'topup_expired') return 'QR นี้หมดอายุแล้ว กรุณาสร้าง QR ใหม่'
  if (errorText === 'invalid_points') return 'จำนวนพ้อยท์ไม่ถูกต้อง'
  if (errorText === 'invalid_slip_image') return 'ไฟล์สลิปไม่ถูกต้อง'
  if (errorText === 'slip_qr_not_found') return 'ไม่พบ QR Code ในรูปสลิป กรุณาใช้สลิปที่มี QR ชัดเจน'
  if (errorText === 'slip_amount_not_found') return 'อ่านยอดเงินจาก QR ในสลิปไม่ได้'
  if (errorText === 'payment_qr_uploaded') return 'รูปนี้เป็น QR สำหรับจ่ายเงิน ไม่ใช่สลิปโอนเงินของธนาคาร'
  if (errorText === 'slip_amount_mismatch') return 'ยอดเงินในสลิปไม่ตรงกับรายการที่สร้างไว้'
  if (errorText === 'duplicate_slip') return 'สลิปนี้ถูกใช้เติมเงินในระบบไปแล้ว'
  if (errorText === 'already_paid') return 'รายการนี้ถูกเติมเครดิตแล้ว'
  if (errorText === 'topup_not_found') return 'ไม่พบรายการเติมเงินนี้'
  if (errorText === 'topup_method_disabled') return 'ช่องทาง PromptPay ถูกปิดชั่วคราว'
  if (errorText === 'slip_not_verified') return 'ตรวจสอบกับธนาคารแล้วไม่พบธุรกรรมนี้ กรุณาตรวจสอบสลิปอีกครั้ง'
  if (errorText === 'slip_receiver_mismatch') return 'สลิปนี้โอนเข้าบัญชีอื่น ไม่ใช่บัญชีของร้าน'
  if (errorText === 'slip_verify_unavailable') return 'ระบบตรวจสอบสลิปขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่'
  if (errorText === 'rate_limit_exceeded') return 'คุณตรวจสอบสลิปถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'
  return friendlyError(errorText)
}

export default function Topup() {
  const nav = useNavigate()
  const { method: urlMethod } = useParams()
  const [topupSettings, setTopupSettings] = useState(DEFAULT_TOPUP_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const method = TOPUP_METHODS.includes(urlMethod) ? urlMethod : 'angpao'
  const [me, setMe] = useState(null)
  const [points, setPoints] = useState(199)
  const [reference, setReference] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [promptpayOrder, setPromptpayOrder] = useState(null)
  const [slipImage, setSlipImage] = useState('')
  const [slipPreview, setSlipPreview] = useState('')
  const [slipName, setSlipName] = useState('')
  const [verifyStatus, setVerifyStatus] = useState('idle')
  const [pendingStatus, setPendingStatus] = useState('idle')
  const [status, setStatus] = useState('idle')
  const [popup, setPopup] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [nowMs, setNowMs] = useState(Date.now())
  const [isDragging, setIsDragging] = useState(false)
  const [copiedTarget, setCopiedTarget] = useState(false)
  const fileInputRef = useRef(null)

  const balance = Number(me?.wallet?.balance ?? me?.user?.balance ?? 0)
  const selectedMethod = METHOD_META[method]
  const promptpayExpiresAtMs = promptpayOrder?.expires_at ? Date.parse(promptpayOrder.expires_at) : Number.NaN
  const promptpaySecondsLeft = Number.isFinite(promptpayExpiresAtMs)
    ? Math.max(0, Math.ceil((promptpayExpiresAtMs - nowMs) / 1000))
    : null
  const promptpayExpired = promptpaySecondsLeft === 0
  const promptpayExpiryText = formatPromptpayExpiry(promptpayOrder?.expires_at)

  useEffect(() => {
    let cancelled = false
    async function loadTopupSettings() {
      try {
        const data = await fetchJson('/api/ui-settings')
        if (cancelled) return
        const next = {
          angpao: data?.topup_settings?.angpao !== false,
          coupon: data?.topup_settings?.coupon !== false,
          promptpay: data?.topup_settings?.promptpay !== false,
        }
        setTopupSettings(next)
      } catch {
        if (!cancelled) setTopupSettings(DEFAULT_TOPUP_SETTINGS)
      } finally {
        if (!cancelled) setSettingsLoaded(true)
      }
    }

    loadTopupSettings()
    return () => {
      cancelled = true
    }
  }, [])

  const firstEnabledMethod = useMemo(
    () => TOPUP_METHODS.find((id) => topupSettings[id] !== false) || null,
    [topupSettings],
  )

  useEffect(() => {
    if (!settingsLoaded) return
    if (!TOPUP_METHODS.includes(urlMethod)) {
      nav(firstEnabledMethod ? `/topup/${firstEnabledMethod}` : '/topup', { replace: true })
      return
    }
    if (topupSettings[method] === false && firstEnabledMethod) {
      nav(`/topup/${firstEnabledMethod}`, { replace: true })
    }
  }, [urlMethod, nav, method, topupSettings, settingsLoaded, firstEnabledMethod])

  useEffect(() => {
    let cancelled = false
    async function verify() {
      try {
        const data = await fetchJson('/api/me')
        if (!cancelled) setMe(data)
      } catch (error) {
        if (!cancelled && error?.status === 401) {
          setAuthToken(null)
          nav('/login', { replace: true })
        }
      }
    }

    verify()
    return () => {
      cancelled = true
    }
  }, [nav])

  useEffect(() => {
    if (!promptpayOrder?.expires_at) return undefined
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [promptpayOrder?.expires_at])

  useEffect(() => {
    if (method !== 'promptpay' || promptpayOrder) return undefined

    let cancelled = false
    async function loadPendingPromptpay() {
      setPendingStatus('loading')
      try {
        const data = await fetchJson('/api/topups/promptpay/pending')
        if (cancelled) return
        if (data?.topup) setPromptpayOrder(data.topup)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setPendingStatus('idle')
      }
    }

    loadPendingPromptpay()
    return () => {
      cancelled = true
    }
  }, [method, promptpayOrder])

  const canSubmit = useMemo(() => {
    if (status === 'submitting') return false
    if (topupSettings[method] === false) return false
    if (method === 'angpao') return reference.trim().length > 0
    if (method === 'coupon') return couponCode.trim().length > 0
    if (method === 'promptpay') return Number.isInteger(Number(points)) && Number(points) > 0
    return false
  }, [couponCode, method, points, reference, status, topupSettings])

  const verifySlipDirect = useCallback(async (imageDataUrl) => {
    if (!promptpayOrder?.topup_id || !imageDataUrl) return
    if (promptpayExpired) {
      setErrorMsg('topup_expired')
      setVerifyStatus('error')
      setStatus('error')
      setPopup({ kind: 'error', title: 'ตรวจสลิปไม่สำเร็จ', message: topupFriendlyError('topup_expired') })
      return
    }

    setVerifyStatus('reading')
    setErrorMsg('')
    try {
      setTimeout(() => {
        setVerifyStatus((current) => (current === 'reading' ? 'validating' : current))
      }, 400)

      const result = await fetchJson('/api/topups/promptpay/verify-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topup_id: promptpayOrder.topup_id,
          slip_image: imageDataUrl,
        }),
      })

      setVerifyStatus('success')
      setStatus('success')
      if (result?.status === 'pending_review') {
        setPopup({
          kind: 'success',
          title: '📤 ส่งสลิปเรียบร้อย',
          message: 'ทีมงานกำลังตรวจสอบสลิปของคุณ พ้อยท์จะเข้าบัญชีทันทีหลังตรวจสอบเสร็จ ดูสถานะได้ที่หน้าประวัติการเติมเงิน',
        })
      } else {
        setPopup({
          kind: 'success',
          title: '🎉 เติมเงินสำเร็จ!',
          message: `ระบบได้เพิ่มเครดิตจำนวน ${Number(result?.credited_points || 0).toLocaleString()} พ้อยท์ เข้าสู่บัญชีของคุณเรียบร้อยแล้ว`,
        })
      }
      triggerAppRefresh()
      reloadPageSoon()
      try {
        const data = await fetchJson('/api/me')
        setMe(data)
      } catch {}
    } catch (error) {
      if (error?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      const data = error?.data
      const errorText = typeof data === 'string' ? data : data?.error
      setErrorMsg(String(errorText || ''))
      setVerifyStatus('error')
      setStatus('error')
      setPopup({ kind: 'error', title: 'ตรวจสลิปไม่สำเร็จ', message: topupFriendlyError(errorText) })
    }
  }, [promptpayOrder, promptpayExpired, nav])

  useEffect(() => {
    if (method !== 'promptpay' || !promptpayOrder) return undefined

    async function handlePaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            try {
              const dataUrl = await readFileAsDataUrl(file)
              setSlipImage(dataUrl)
              setSlipPreview(dataUrl)
              setSlipName(file.name || 'สลิปจาก Clipboard (Ctrl+V)')
              verifySlipDirect(dataUrl)
            } catch {}
            break
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [method, promptpayOrder, verifySlipDirect])

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    setIsDragging(false)
  }

  async function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        setSlipImage(dataUrl)
        setSlipPreview(dataUrl)
        setSlipName(file.name)
        if (promptpayOrder) {
          verifySlipDirect(dataUrl)
        }
      } catch {}
    }
  }

  function downloadQrImage() {
    if (!promptpayOrder?.qr?.image_data_url) return
    const a = document.createElement('a')
    a.href = promptpayOrder.qr.image_data_url
    a.download = `PromptPay_QR_${promptpayOrder.payable_amount || points}THB_${promptpayOrder.topup_id || Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function handleCopyPromptpayTarget() {
    const target = promptpayOrder?.promptpay_target
    if (!target) return
    copyToClipboard(target)
    setCopiedTarget(true)
    setTimeout(() => setCopiedTarget(false), 2000)
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    setStatus('submitting')
    setErrorMsg('')
    try {
      if (method === 'angpao') {
        await fetchJson('/api/topups/angpao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: reference.trim() }),
        })
        setReference('')
        setPopup({ kind: 'success', title: 'เติมสำเร็จ', message: 'ระบบเพิ่มพ้อยท์ให้ในบัญชีแล้ว' })
      } else if (method === 'coupon') {
        const result = await fetchJson('/api/coupons/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: couponCode.trim() }),
        })
        const received = Number(result?.result?.points)
        setCouponCode('')
        setPopup({
          kind: 'success',
          title: 'แลกคูปองสำเร็จ',
          message: Number.isFinite(received) ? `คุณได้รับ ${received.toLocaleString()} พ้อยท์` : 'รับพ้อยท์สำเร็จ',
        })
      } else if (method === 'promptpay') {
        const result = await fetchJson('/api/topups/promptpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: Number(points) }),
        })
        setPromptpayOrder(result)
        setSlipImage('')
        setSlipPreview('')
        setSlipName('')
        setVerifyStatus('idle')
        setPopup({ kind: 'success', title: 'สร้าง QR แล้ว', message: 'สแกน QR แล้วอัปโหลดหรือวางสลิปเพื่อรับพ้อยท์' })
      }
      setStatus('success')
      triggerAppRefresh()
      if (method === 'angpao' || method === 'coupon') reloadPageSoon()
      try {
        const data = await fetchJson('/api/me')
        setMe(data)
      } catch {}
    } catch (error) {
      if (error?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      const data = error?.data
      const errorText = typeof data === 'string' ? data : data?.error
      setErrorMsg(String(errorText || ''))
      setStatus('error')
      setPopup({ kind: 'error', title: 'ไม่สำเร็จ', message: topupFriendlyError(errorText) })
    }
  }

  async function onSlipChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setSlipImage(dataUrl)
      setSlipPreview(dataUrl)
      setSlipName(file.name)
      setVerifyStatus('idle')
      if (promptpayOrder) {
        verifySlipDirect(dataUrl)
      }
    } catch {
      setSlipImage('')
      setSlipPreview('')
      setSlipName('')
      setVerifyStatus('error')
      setErrorMsg('invalid_slip_image')
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 fade-in-up">
      {popup ? <Popup title={popup.title} message={popup.message} kind={popup.kind} onClose={() => setPopup(null)} /> : null}

      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white/90 p-6 sm:p-8 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_8%_0%,rgba(56,189,248,0.14),transparent_62%),radial-gradient(45%_70%_at_100%_8%,rgba(6,182,212,0.10),transparent_60%)]" />
        <div className="motion-stagger relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              เติมพ้อยท์อัตโนมัติ 24 ชม.
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">เติมเงิน</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              เลือกช่องทาง เติมด้วยซองอั่งเปา คูปอง หรือ PromptPay แล้วรับพ้อยท์เข้าบัญชีทันที
            </p>
          </div>
          <div className="grid min-w-[240px] rounded-2xl border border-sky-100 bg-sky-50/70 p-5">
            <div className="text-xs font-bold text-slate-500">พ้อยท์คงเหลือ</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{balance.toLocaleString()} พ้อยท์</div>
            <div className="mt-1 text-xs font-bold text-sky-600">1 บาท = 1 พ้อยท์</div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-sky-100 p-5 bg-sky-50/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-900">เลือกช่องทางชำระเงิน</div>
                <div className="mt-0.5 text-xs text-slate-500">ช่องทางที่เลือก: {selectedMethod.label}</div>
              </div>
              {status === 'submitting' ? <div className="text-xs font-bold text-sky-600">กำลังดำเนินการ...</div> : null}
            </div>
            <div className="motion-stagger mt-4 grid gap-3 md:grid-cols-3">
              <MethodOption id="angpao" active={method === 'angpao'} disabled={topupSettings.angpao === false} onClick={() => nav('/topup/angpao', { replace: true })} />
              <MethodOption id="coupon" active={method === 'coupon'} disabled={topupSettings.coupon === false} onClick={() => nav('/topup/coupon', { replace: true })} />
              <MethodOption id="promptpay" active={method === 'promptpay'} disabled={topupSettings.promptpay === false} onClick={() => nav('/topup/promptpay', { replace: true })} />
            </div>
          </div>

          <form onSubmit={onSubmit} className="p-5 space-y-5">
            {method === 'angpao' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">ลิงก์ซองอั่งเปา TrueMoney</label>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    className="mt-2 ui-field h-12 px-4 text-sm"
                    placeholder="https://gift.truemoney.com/campaign/?v=XXXX"
                    autoComplete="off"
                  />
                  <div className="mt-2 text-xs leading-relaxed text-slate-500">ระบบจะตรวจสอบซองและเครดิตพ้อยท์ให้ทันทีเมื่อสำเร็จ</div>
                </div>
              </div>
            ) : null}

            {method === 'coupon' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">โค้ดคูปอง</label>
                  <input
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    className="mt-2 ui-field h-12 px-4 font-mono text-sm uppercase tracking-[0.08em]"
                    placeholder="เช่น VXPERS-2026"
                    autoComplete="off"
                  />
                  <div className="mt-2 text-xs leading-relaxed text-slate-500">คูปองจะเครดิตพ้อยท์ทันที ไม่ต้องรออนุมัติ</div>
                </div>
              </div>
            ) : null}

            {method === 'promptpay' ? (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-700">จำนวนพ้อยท์ที่ต้องการเติม</label>
                  {pendingStatus === 'loading' ? <div className="mt-1 text-xs font-bold text-sky-600">กำลังโหลดรายการ PromptPay ที่ค้างอยู่...</div> : null}
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {QUICK_AMOUNTS.map((amount) => (
                      <button
                        type="button"
                        key={amount}
                        onClick={() => setPoints(amount)}
                        className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${Number(points) === amount ? 'border-sky-500 bg-sky-500 text-white shadow-md' : 'border-sky-200 bg-white text-slate-700 hover:bg-sky-50'}`}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                  <input value={points} onChange={(event) => setPoints(event.target.value)} className="mt-3 ui-field h-12 px-4 text-sm" placeholder="เช่น 199" inputMode="numeric" />
                  <div className="mt-2 text-xs leading-relaxed text-slate-500">1 พ้อยท์ = 1 บาท ระบบจะสร้าง QR ตามยอดนี้</div>
                </div>

                {promptpayOrder ? (
                  <div className="grid gap-5 rounded-3xl border border-sky-200 bg-sky-50/50 p-5 md:grid-cols-[240px_minmax(0,1fr)] shadow-sm">
                    <div className="flex flex-col items-center justify-between rounded-2xl bg-white p-4 border border-sky-100 shadow-sm text-center">
                      {promptpayOrder.qr?.image_data_url ? (
                        <div className="relative group w-full">
                          <img src={promptpayOrder.qr.image_data_url} alt="PromptPay QR" className="h-auto w-full rounded-xl shadow-xs" />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={downloadQrImage}
                        className="mt-3 inline-flex items-center justify-center gap-1.5 w-full rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 transition shadow-xs"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        บันทึกรูป QR Code
                      </button>
                    </div>

                    <div className="min-w-0 space-y-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 pb-2.5">
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 text-uppercase tracking-wider">รายการเติมเงิน</div>
                          <div className="text-xl font-black text-slate-900">#{promptpayOrder.topup_id}</div>
                        </div>
                        {promptpayExpiryText ? (
                          <div className={`rounded-xl border px-3 py-1 text-xs font-bold ${promptpayExpired ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                            {promptpayExpired ? 'QR หมดอายุแล้ว' : `ใช้ได้อีก ${promptpaySecondsLeft?.toLocaleString('th-TH')} วินาที`}
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="rounded-xl border border-sky-100 bg-white p-3 shadow-xs">
                          <div className="text-[11px] font-bold text-slate-400">ยอดที่ต้องชำระ</div>
                          <div className="mt-0.5 font-black text-sky-600 text-lg">{Number(promptpayOrder.payable_amount || 0).toLocaleString()} บาท</div>
                        </div>

                        {promptpayOrder.promptpay_target ? (
                          <div className="rounded-xl border border-sky-100 bg-white p-3 shadow-xs flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-400 truncate">{promptpayOrder.promptpay_name || 'พร้อมเพย์'}</div>
                              <div className="mt-0.5 font-mono font-bold text-slate-800 text-sm truncate">{promptpayOrder.promptpay_target}</div>
                            </div>
                            <button
                              type="button"
                              onClick={handleCopyPromptpayTarget}
                              className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100 transition"
                            >
                              {copiedTarget ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-sky-100 bg-white p-3 shadow-xs">
                            <div className="text-[11px] font-bold text-slate-400">Reference</div>
                            <div className="mt-0.5 truncate font-mono text-slate-800 font-bold text-xs">{promptpayOrder.reference}</div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-sky-200/60 bg-sky-100/40 p-3 text-xs leading-relaxed text-slate-600">
                        💡 <strong>สะดวกยิ่งขึ้น:</strong> หลังโอนเงินเสร็จแล้ว สามารถ <strong>กด Ctrl+V ที่หน้านี้</strong> หรือลากรูปสลิปลงในกล่องด้านล่าง ระบบจะตรวจสอบยอดและเติมพ้อยท์ให้อัตโนมัติทันที
                      </div>
                    </div>
                  </div>
                ) : null}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`rounded-3xl border-2 border-dashed p-6 transition-all duration-200 text-center ${
                    isDragging
                      ? 'border-sky-500 bg-sky-100/60 shadow-lg scale-[1.01]'
                      : 'border-sky-200 bg-sky-50/40 hover:border-sky-300 hover:bg-sky-50/70'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onSlipChange}
                    className="hidden"
                  />

                  {slipPreview ? (
                    <div className="flex flex-col items-center">
                      <div className="relative group max-w-xs">
                        <img
                          src={slipPreview}
                          alt="Transfer slip preview"
                          className="max-h-56 rounded-2xl border border-sky-200 object-contain bg-white p-2 shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => { setSlipImage(''); setSlipPreview(''); setSlipName(''); setVerifyStatus('idle') }}
                          className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600 transition"
                          title="ลบรูปสลิป"
                        >
                          ✕
                        </button>
                      </div>
                      {slipName ? <div className="mt-2 text-xs font-bold text-slate-600">{slipName}</div> : null}
                    </div>
                  ) : (
                    <div
                      className="cursor-pointer py-4"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-100 text-sky-600 mb-3 shadow-xs">
                        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                      <div className="text-sm font-black text-slate-900">
                        คลิกเพื่อเลือกไฟล์สลิป หรือลากไฟล์มาวางที่นี่
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        หรือกด <kbd className="rounded bg-white px-2 py-0.5 border text-slate-700 font-mono shadow-xs">Ctrl + V</kbd> เพื่อวางรูปสลิปจาก Clipboard ได้ทันที
                      </div>
                    </div>
                  )}

                  {/* Verification Status Animation */}
                  {verifyStatus === 'reading' || verifyStatus === 'validating' ? (
                    <div className="mt-4 rounded-2xl border border-sky-300 bg-sky-500/10 p-4 text-center">
                      <div className="inline-flex items-center gap-2 text-sky-700 font-black text-sm">
                        <span className="spinner-border spinner-border-sm" />
                        {verifyStatus === 'reading' ? 'กำลังอ่าน QR Code จากสลิป...' : 'กำลังตรวจสอบยอดเงินกับระบบธนาคาร...'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">ระบบกำลังประมวลผลอัตโนมัติ กรุณารอสักครู่</div>
                    </div>
                  ) : null}

                  {verifyStatus === 'success' ? (
                    <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center text-emerald-700 font-black text-sm">
                      ✅ ตรวจสอบสลิปสำเร็จและเครดิตพ้อยท์เรียบร้อยแล้ว!
                    </div>
                  ) : null}

                  {/* Fallback Manual Verify Button */}
                  {slipPreview && verifyStatus !== 'reading' && verifyStatus !== 'validating' && verifyStatus !== 'success' ? (
                    <button
                      type="button"
                      disabled={!promptpayOrder || promptpayExpired || !slipImage}
                      onClick={() => verifySlipDirect(slipImage)}
                      className="mt-4 ui-btn-primary h-12 w-full text-sm font-black disabled:opacity-50 shadow-sm"
                    >
                      {promptpayExpired ? 'QR หมดอายุแล้ว กรุณาสร้างใหม่' : '🔍 ตรวจสลิปและรับพ้อยท์'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <button type="submit" disabled={!canSubmit} className="mt-5 ui-btn-primary h-12 w-full text-sm font-black disabled:opacity-50 shadow-sm">
              {status === 'submitting' ? 'กำลังดำเนินการ...' : method === 'coupon' ? 'แลกคูปอง' : method === 'promptpay' ? (promptpayOrder ? 'สร้าง PromptPay QR ใหม่' : 'สร้าง PromptPay QR') : 'ยืนยันเติมเงิน'}
            </button>

            {status === 'success' ? <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-xs font-bold text-emerald-700">ทำรายการสำเร็จ</div> : null}
            {status === 'error' ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs font-bold text-red-700">{topupFriendlyError(errorMsg)}</div> : null}
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="text-sm font-black text-slate-900">วิธีเติมเงิน</div>
            <div className="mt-4 space-y-4">
              <Step index="1" title="เลือกช่องทาง" body="เลือกซองอั่งเปา คูปอง หรือ PromptPay" />
              <Step index="2" title="กรอกข้อมูล" body="วางลิงก์ซองอั่งเปา หรือกรอกโค้ดคูปองให้ถูกต้อง" />
              <Step index="3" title="รับพ้อยท์" body="เมื่อระบบตรวจสอบสำเร็จ พ้อยท์จะเข้าบัญชีทันที" />
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-sm font-black text-slate-900">ข้อควรรู้</div>
            <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate-600">
              <p>• ลิงก์ซองอั่งเปาใช้ได้ครั้งเดียว ต้องเป็นลิงค์ที่ไม่เคยใช้มาก่อน</p>
              <p>• หากเติมแล้วพ้อยท์ยังไม่เข้า ให้เก็บหลักฐานและติดต่อ Support พร้อมเวลาและเลขอ้างอิง</p>
              <Link to="/support" className="inline-flex font-black text-sky-600 hover:text-sky-800">ติดต่อ Support →</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
