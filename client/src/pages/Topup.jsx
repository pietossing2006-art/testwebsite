import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchJson, reloadPageSoon, setAuthToken, triggerAppRefresh } from '../api.js'

const QUICK_AMOUNTS = [50, 100, 199, 300, 500, 1000]

const METHOD_META = {
  angpao: {
    label: 'ซองอั่งเปา',
    short: 'TrueMoney',
    detail: 'เติมผ่านลิงก์ซองอั่งเปา เครดิตเข้าอัตโนมัติหลังตรวจสอบสำเร็จ',
    icon: 'gift',
  },
  coupon: {
    label: 'คูปอง',
    short: 'Redeem Code',
    detail: 'กรอกโค้ดคูปองเพื่อรับพ้อยท์ทันที',
    icon: 'ticket',
  },
  omise: {
    label: 'บัตร / PromptPay',
    short: 'Coming soon',
    detail: 'ช่องทางชำระเงินอัตโนมัติผ่านผู้ให้บริการภายนอก',
    icon: 'card',
  },
}

METHOD_META.promptpay = {
  label: 'PromptPay',
  short: 'Manual QR',
  detail: 'สร้าง QR PromptPay แล้วอัปโหลดสลิปเพื่อให้ระบบตรวจยอดและเครดิตพ้อยท์',
  icon: 'card',
}

function Card({ children, className = '' }) {
  return <section className={`ui-panel motion-card ${className}`}>{children}</section>
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
    <div className="popup-overlay-animate fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="popup-panel-animate w-full max-w-md rounded-3xl border border-white/10 bg-[#05070d]/90 p-6 shadow-[0_30px_140px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className={`grid h-16 w-16 place-items-center rounded-full border ${isSuccess ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100'}`}>
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
          <div className="mt-4 text-lg font-extrabold text-white">{title}</div>
          {message ? <div className="mt-2 text-sm leading-6 text-white/66">{message}</div> : null}
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
      className={`group motion-card motion-hover motion-soft-glow relative overflow-hidden rounded-2xl border p-4 text-left transition ${
        disabled
          ? 'cursor-not-allowed border-white/10 bg-white/[0.025] opacity-45'
          : active
            ? 'border-cyan-300/36 bg-cyan-400/12 shadow-[0_0_28px_rgba(34,211,238,0.12)]'
            : 'border-white/10 bg-white/[0.025] hover:border-cyan-300/24 hover:bg-white/[0.045]'
      }`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_80%_at_0%_0%,rgba(34,211,238,0.12),transparent_58%)] opacity-0 transition group-hover:opacity-100" />
      <div className="relative flex items-start gap-3">
        <div className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-white/10 bg-black/20 text-cyan-100">
          <MethodIcon type={meta.icon} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-white">{meta.label}</div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-100/55">{meta.short}</div>
          <div className="mt-2 text-xs leading-5 text-white/48">{meta.detail}</div>
        </div>
      </div>
    </button>
  )
}

function Step({ index, title, body }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-7 w-7 flex-none place-items-center rounded-full border border-cyan-300/22 bg-cyan-400/10 text-xs font-black text-cyan-100">{index}</div>
      <div>
        <div className="text-xs font-extrabold text-white">{title}</div>
        <div className="mt-1 text-[11px] leading-5 text-white/45">{body}</div>
      </div>
    </div>
  )
}

function friendlyError(errorText) {
  if (errorText === 'invalid_reference') return 'ลิงก์ซองอั่งเปาไม่ถูกต้อง'
  if (errorText === 'invalid_voucher') return 'ลิงก์นี้ถูกใช้แล้ว หรือไม่สามารถตรวจสอบได้'
  if (errorText === 'duplicate_reference') return 'ลิงก์นี้ถูกใช้ไปแล้ว'
  if (errorText === 'omise_disabled') return 'ช่องทางบัตร / PromptPay ยังไม่เปิดใช้งาน'
  if (errorText === 'invalid_code') return 'โค้ดคูปองไม่ถูกต้อง'
  if (errorText === 'coupon_used') return 'คูปองนี้ถูกใช้แล้ว'
  if (errorText === 'coupon_expired') return 'คูปองหมดอายุแล้ว'
  return errorText || 'ทำรายการไม่สำเร็จ'
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('invalid_slip_image'))
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
  if (errorText === 'slip_qr_not_found') return 'ไม่พบ QR ในรูปสลิป'
  if (errorText === 'slip_amount_not_found') return 'อ่านยอดเงินจาก QR ในสลิปไม่ได้'
  if (errorText === 'payment_qr_uploaded') return 'รูปนี้เป็น QR สำหรับจ่ายเงิน ไม่ใช่สลิปโอนเงิน'
  if (errorText === 'slip_amount_mismatch') return 'ยอดเงินในสลิปไม่ตรงกับรายการเติมเงิน'
  if (errorText === 'duplicate_slip') return 'สลิปนี้ถูกใช้แล้ว'
  if (errorText === 'already_paid') return 'รายการนี้ถูกเติมเครดิตแล้ว'
  if (errorText === 'topup_not_found') return 'ไม่พบรายการเติมเงินนี้'
  return friendlyError(errorText)
}

export default function Topup() {
  const nav = useNavigate()
  const { method: urlMethod } = useParams()
  const method = ['angpao', 'coupon', 'promptpay'].includes(urlMethod) ? urlMethod : 'angpao'
  const [me, setMe] = useState(null)
  const [points, setPoints] = useState(199)
  const [reference, setReference] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [omiseChannel, setOmiseChannel] = useState('promptpay')
  const [omiseBank, setOmiseBank] = useState('bbl')
  const [omiseCardToken, setOmiseCardToken] = useState('')
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

  const omiseEnabled = false
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
    if (!['angpao', 'coupon', 'promptpay'].includes(urlMethod)) {
      nav('/topup/angpao', { replace: true })
    }
  }, [urlMethod, nav])

  useEffect(() => {
    if (method !== 'promptpay' || promptpayOrder) return undefined

    let cancelled = false
    async function loadPendingPromptpay() {
      setPendingStatus('loading')
      try {
        const data = await fetchJson('/api/topups/promptpay/pending')
        if (cancelled) return
        if (data?.topup) {
          setPromptpayOrder(data.topup)
          if (Number(data.topup.points) > 0) setPoints(Number(data.topup.points))
        }
        setPendingStatus('success')
      } catch (error) {
        if (cancelled) return
        if (error?.status === 401) {
          setAuthToken(null)
          nav('/login', { replace: true })
          return
        }
        setPendingStatus('error')
      }
    }

    loadPendingPromptpay()
    return () => {
      cancelled = true
    }
  }, [method, nav, promptpayOrder])

  const canSubmit = useMemo(() => {
    if (status === 'submitting') return false
    if (method === 'angpao') return reference.trim().length > 0
    if (method === 'coupon') return couponCode.trim().length > 0
    if (method === 'promptpay') return Number.isInteger(Number(points)) && Number(points) > 0
    return false
  }, [couponCode, method, points, reference, status])

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
        setPopup({ kind: 'success', title: 'สร้าง QR แล้ว', message: 'สแกน QR แล้วอัปโหลดสลิปเพื่อยืนยันการเติมพ้อยท์' })
      } else {
        if (!omiseEnabled) {
          setStatus('error')
          setErrorMsg('omise_disabled')
          return
        }
        await fetchJson('/api/topups/omise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: Number(points),
            channel: omiseChannel,
            bank: omiseChannel === 'transfer' ? omiseBank : undefined,
            card_token: omiseChannel === 'card' ? omiseCardToken : undefined,
          }),
        })
        setPopup({ kind: 'success', title: 'สร้างคำขอสำเร็จ', message: 'ดำเนินการชำระเงินตามช่องทางที่เลือก' })
      }
      setStatus('success')
      triggerAppRefresh()
      if (method === 'angpao' || method === 'coupon') reloadPageSoon()
      try {
        const data = await fetchJson('/api/me')
        setMe(data)
      } catch {
        // Balance refresh is nice to have; global app refresh already ran.
      }
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
    if (!file) {
      setSlipImage('')
      setSlipPreview('')
      setSlipName('')
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setSlipImage(dataUrl)
      setSlipPreview(dataUrl)
      setSlipName(file.name)
      setVerifyStatus('idle')
    } catch {
      setSlipImage('')
      setSlipPreview('')
      setSlipName('')
      setVerifyStatus('error')
      setErrorMsg('invalid_slip_image')
    }
  }

  async function verifySlip() {
    if (!promptpayOrder?.topup_id || !slipImage || verifyStatus === 'submitting') return
    if (promptpayExpired) {
      setErrorMsg('topup_expired')
      setVerifyStatus('error')
      setStatus('error')
      setPopup({ kind: 'error', title: 'ตรวจสลิปไม่สำเร็จ', message: topupFriendlyError('topup_expired') })
      return
    }

    setVerifyStatus('submitting')
    setErrorMsg('')
    try {
      const result = await fetchJson('/api/topups/promptpay/verify-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topup_id: promptpayOrder.topup_id,
          slip_image: slipImage,
        }),
      })

      setVerifyStatus('success')
      setStatus('success')
      setPopup({
        kind: 'success',
        title: 'เติมเงินสำเร็จ',
        message: `ได้รับ ${Number(result?.credited_points || 0).toLocaleString()} พ้อยท์`,
      })
      triggerAppRefresh()
      reloadPageSoon()
      try {
        const data = await fetchJson('/api/me')
        setMe(data)
      } catch {
        // Balance refresh is nice to have; global app refresh already ran.
      }
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
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 fade-in-up">
      {popup ? <Popup title={popup.title} message={popup.message} kind={popup.kind} onClose={() => setPopup(null)} /> : null}

      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong px-4 py-7 sm:px-6 sm:py-8 md:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_8%_0%,rgba(34,211,238,0.16),transparent_62%),radial-gradient(45%_70%_at_100%_8%,rgba(16,185,129,0.1),transparent_60%)]" />
        <div className="motion-stagger relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-extrabold text-cyan-100">
              เติมพ้อยท์อัตโนมัติ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">เติมเงิน</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58">
              เลือกช่องทาง เติมด้วยซองอั่งเปาหรือคูปอง แล้วรับพ้อยท์เข้าบัญชีอย่างรวดเร็ว
            </p>
          </div>
          <div className="motion-card grid min-w-[240px] rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="text-xs font-bold text-white/45">พ้อยท์คงเหลือ</div>
            <div className="motion-price mt-2 text-3xl font-black text-white">{balance.toLocaleString()}</div>
            <Link to="/history/topups" className="mt-3 text-xs font-extrabold text-cyan-100/80 hover:text-cyan-50">
              ดูประวัติเติมเงิน
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-white/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-white">เลือกช่องทาง</div>
                <div className="mt-1 text-xs text-white/45">ช่องทางที่เลือก: {selectedMethod.label}</div>
              </div>
              {status === 'submitting' ? <div className="text-xs font-bold text-cyan-100">กำลังดำเนินการ...</div> : null}
            </div>
            <div className="motion-stagger mt-4 grid gap-3 md:grid-cols-3">
              <MethodOption id="angpao" active={method === 'angpao'} onClick={() => nav('/topup/angpao', { replace: true })} />
              <MethodOption id="coupon" active={method === 'coupon'} onClick={() => nav('/topup/coupon', { replace: true })} />
              <MethodOption id="promptpay" active={method === 'promptpay'} onClick={() => nav('/topup/promptpay', { replace: true })} />
            </div>
          </div>

          <form onSubmit={onSubmit} className="p-5">
            {method === 'angpao' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-white/65">ลิงก์ซองอั่งเปา</label>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    className="mt-2 ui-field h-12 px-4 text-sm"
                    placeholder="https://gift.truemoney.com/campaign/?v=XXXX"
                    autoComplete="off"
                  />
                  <div className="mt-2 text-[11px] leading-5 text-white/45">ระบบจะตรวจสอบซองและเครดิตพ้อยท์ให้ทันทีเมื่อสำเร็จ</div>
                </div>
              </div>
            ) : null}

            {method === 'coupon' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-white/65">โค้ดคูปอง</label>
                  <input
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    className="mt-2 ui-field h-12 px-4 font-mono text-sm uppercase tracking-[0.08em]"
                    placeholder="เช่น VXPERS-2026"
                    autoComplete="off"
                  />
                  <div className="mt-2 text-[11px] leading-5 text-white/45">คูปองจะเครดิตพ้อยท์ทันที ไม่ต้องรออนุมัติ</div>
                </div>
              </div>
            ) : null}

            {method === 'promptpay' ? (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-white/65">จำนวนพ้อยท์</label>
                  {pendingStatus === 'loading' ? <div className="mt-1 text-[11px] font-bold text-cyan-100/70">กำลังโหลดรายการ PromptPay ที่ค้างอยู่...</div> : null}
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {QUICK_AMOUNTS.map((amount) => (
                      <button
                        type="button"
                        key={amount}
                        onClick={() => setPoints(amount)}
                        className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${Number(points) === amount ? 'border-cyan-300/35 bg-cyan-400/12 text-cyan-50' : 'border-white/10 bg-white/[0.025] text-white/60 hover:text-white'}`}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                  <input value={points} onChange={(event) => setPoints(event.target.value)} className="mt-3 ui-field h-12 px-4 text-sm" placeholder="เช่น 199" inputMode="numeric" />
                  <div className="mt-2 text-[11px] leading-5 text-white/45">1 พ้อยท์ = 1 บาท ระบบจะสร้าง QR ตามยอดนี้</div>
                </div>

                {promptpayOrder ? (
                  <div className="grid gap-4 rounded-2xl border border-cyan-300/18 bg-cyan-400/[0.06] p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="rounded-2xl bg-white p-3">
                      {promptpayOrder.qr?.image_data_url ? (
                        <img src={promptpayOrder.qr.image_data_url} alt="PromptPay QR" className="h-auto w-full rounded-xl" />
                      ) : null}
                    </div>
                    <div className="min-w-0 space-y-3">
                      <div>
                        <div className="text-xs font-bold text-white/45">รายการเติมเงิน</div>
                        <div className="mt-1 text-xl font-black text-white">#{promptpayOrder.topup_id}</div>
                      </div>
                      <div className="grid gap-2 text-xs text-white/60 sm:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="font-bold text-white/40">ยอดโอน</div>
                          <div className="mt-1 font-black text-cyan-100">{Number(promptpayOrder.payable_amount || 0).toLocaleString()} บาท</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="font-bold text-white/40">Reference</div>
                          <div className="mt-1 truncate font-mono text-cyan-100">{promptpayOrder.reference}</div>
                        </div>
                      </div>
                      {promptpayExpiryText ? (
                        <div className={`rounded-xl border px-3 py-2 text-[11px] font-bold ${promptpayExpired ? 'border-red-300/20 bg-red-400/10 text-red-100' : 'border-amber-300/20 bg-amber-400/10 text-amber-100'}`}>
                          {promptpayExpired ? 'QR หมดอายุแล้ว กรุณาสร้าง QR ใหม่' : `QR นี้ใช้ได้ถึง ${promptpayExpiryText} (${promptpaySecondsLeft?.toLocaleString('th-TH')} วินาที)`}
                        </div>
                      ) : null}
                      <div className="text-[11px] leading-5 text-white/45">หลังโอนเงินแล้วให้อัปโหลดสลิป ระบบจะอ่าน QR ในสลิป ตรวจ ref ซ้ำ และตรวจยอดให้ตรงกับรายการนี้</div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <label className="text-xs font-bold text-white/65">อัปโหลดสลิป</label>
                  <input type="file" accept="image/*" onChange={onSlipChange} className="mt-2 block w-full text-xs text-white/65 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-400/15 file:px-4 file:py-2 file:text-xs file:font-extrabold file:text-cyan-50 hover:file:bg-cyan-400/22" />
                  {slipName ? <div className="mt-2 text-[11px] text-white/45">{slipName}</div> : null}
                  {slipPreview ? <img src={slipPreview} alt="Transfer slip preview" className="mt-3 max-h-64 rounded-2xl border border-white/10 object-contain" /> : null}
                  {!promptpayOrder ? <div className="mt-3 rounded-xl border border-cyan-300/16 bg-cyan-400/10 px-3 py-2 text-[11px] font-bold text-cyan-100/80">สร้าง QR ก่อน หรือเปิดด้วยบัญชีเดียวกับเครื่องที่สร้าง QR ไว้ แล้วค่อยกดตรวจสลิป</div> : null}
                  <button type="button" disabled={!promptpayOrder || promptpayExpired || !slipImage || verifyStatus === 'submitting'} onClick={verifySlip} className="mt-4 ui-btn-primary h-12 w-full text-sm disabled:opacity-50">
                    {verifyStatus === 'submitting' ? 'กำลังตรวจสลิป...' : promptpayExpired ? 'QR หมดอายุแล้ว' : 'ตรวจสลิปและเติมพ้อยท์'}
                  </button>
                </div>
              </div>
            ) : null}

            {method === 'omise' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-white/65">จำนวนพ้อยท์</label>
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {QUICK_AMOUNTS.map((amount) => (
                      <button
                        type="button"
                        key={amount}
                        onClick={() => setPoints(amount)}
                        className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${Number(points) === amount ? 'border-cyan-300/35 bg-cyan-400/12 text-cyan-50' : 'border-white/10 bg-white/[0.025] text-white/60 hover:text-white'}`}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                  <input value={points} onChange={(event) => setPoints(event.target.value)} className="mt-3 ui-field h-12 px-4 text-sm" placeholder="เช่น 199" />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/65">ช่องทางชำระเงิน</label>
                  <select value={omiseChannel} onChange={(event) => setOmiseChannel(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none">
                    <option value="promptpay">PromptPay</option>
                    <option value="transfer">โอนธนาคาร</option>
                    <option value="card">บัตร</option>
                  </select>
                </div>
                {omiseChannel === 'transfer' ? (
                  <div>
                    <label className="text-xs font-bold text-white/65">ธนาคาร</label>
                    <select value={omiseBank} onChange={(event) => setOmiseBank(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none">
                      <option value="bbl">Bangkok Bank (BBL)</option>
                      <option value="bay">Krungsri (BAY)</option>
                    </select>
                  </div>
                ) : null}
                {omiseChannel === 'card' ? (
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-white/65">Card Token</label>
                    <input value={omiseCardToken} onChange={(event) => setOmiseCardToken(event.target.value)} className="mt-2 ui-field h-12 px-4 text-sm" placeholder="tokn_test_..." />
                  </div>
                ) : null}
              </div>
            ) : null}

            <button type="submit" disabled={!canSubmit} className="mt-5 ui-btn-primary h-12 w-full text-sm disabled:opacity-50">
              {status === 'submitting' ? 'กำลังดำเนินการ...' : method === 'coupon' ? 'แลกคูปอง' : method === 'promptpay' ? (promptpayOrder ? 'สร้าง QR ใหม่' : 'สร้าง PromptPay QR') : 'ยืนยันเติมเงิน'}
            </button>

            {status === 'success' ? <div className="mt-3 rounded-2xl border border-emerald-300/16 bg-emerald-400/10 px-4 py-3 text-center text-xs font-bold text-emerald-100">ทำรายการสำเร็จ</div> : null}
            {status === 'error' ? <div className="mt-3 rounded-2xl border border-cyan-300/18 bg-cyan-400/10 px-4 py-3 text-center text-xs font-bold text-cyan-100">{topupFriendlyError(errorMsg)}</div> : null}
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="text-sm font-extrabold text-white">วิธีเติมเงิน</div>
            <div className="mt-4 space-y-4">
              <Step index="1" title="เลือกช่องทาง" body="เลือกซองอั่งเปาหรือคูปองตามข้อมูลที่มี" />
              <Step index="2" title="กรอกข้อมูล" body="วางลิงก์ซองอั่งเปาหรือกรอกโค้ดคูปองให้ถูกต้อง" />
              <Step index="3" title="รับพ้อยท์" body="เมื่อระบบตรวจสอบสำเร็จ พ้อยท์จะเข้าบัญชีทันที" />
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-sm font-extrabold text-white">ข้อควรรู้</div>
            <div className="mt-3 space-y-3 text-xs leading-6 text-white/48">
              <p>ลิงก์ซองอั่งเปาใช้ได้ครั้งเดียว หากเคยใช้แล้วระบบจะปฏิเสธอัตโนมัติ</p>
              <p>หากเติมแล้วพ้อยท์ยังไม่เข้า ให้เก็บหลักฐานและติดต่อ Support พร้อมเวลาและลิงก์อ้างอิง</p>
              <Link to="/support" className="inline-flex font-extrabold text-cyan-100/85 hover:text-cyan-50">ติดต่อ Support</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
