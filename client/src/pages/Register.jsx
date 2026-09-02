import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchJson, resolveApiUrl, setAuthToken } from '../api.js'

function isEnglishOnlyPassword(value) {
  if (typeof value !== 'string' || value.length === 0) return false
  return /^[\x20-\x7E]+$/.test(value)
}

function getPasswordStrengthMeta(value) {
  const pwd = typeof value === 'string' ? value : ''
  if (!pwd) return { score: 0, level: 'none', label: 'ยังไม่ได้กรอก' }

  let score = 0
  if (pwd.length >= 8) score += 1
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1
  if (/\d/.test(pwd)) score += 1
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1
  if (pwd.length >= 12) score += 1
  if (score > 5) score = 5

  if (score <= 2) return { score, level: 'weak', label: 'ระดับต่ำ (Weak)' }
  if (score <= 4) return { score, level: 'medium', label: 'ปานกลาง (Medium)' }
  return { score, level: 'strong', label: 'ปลอดภัยสูง (Strong)' }
}

const COMMON_EMAIL_DOMAINS = {
  'gamil.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.co.th': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlock.com': 'outlook.com',
  'iclud.com': 'icloud.com',
}

function detectEmailTypo(emailStr) {
  const trimmed = String(emailStr || '').trim().toLowerCase()
  if (!trimmed.includes('@')) return null
  const parts = trimmed.split('@')
  if (parts.length !== 2) return null
  const [user, domain] = parts
  if (COMMON_EMAIL_DOMAINS[domain]) {
    return `${user}@${COMMON_EMAIL_DOMAINS[domain]}`
  }
  return null
}

function discordErrorMessage(code) {
  const raw = String(code || '').trim()
  if (!raw) return ''
  const [value, detailRaw] = raw.split(':')
  const detail = detailRaw ? decodeURIComponent(detailRaw) : ''

  if (value === 'banned') return 'บัญชีนี้ถูกระงับการใช้งาน'
  if (value === 'not_configured' || value === 'discord_login_not_configured') return 'Discord login ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์'
  if (value === 'user_already_linked') return 'บัญชีเว็บนี้ถูกผูกกับ Discord อื่นอยู่แล้ว'
  if (value === 'invalid_state') return 'Discord login หมดอายุ กรุณาลองใหม่'
  if (value === 'token_exchange_failed') return `Discord แลก token ไม่สำเร็จ${detail ? ` (${detail})` : ''}`
  if (value === 'profile_failed') return `ดึงข้อมูลบัญชี Discord ไม่สำเร็จ${detail ? ` (${detail})` : ''}`
  if (value === 'db_unique_violation') return 'บันทึกบัญชี Discord ลงฐานข้อมูลไม่สำเร็จ เพราะข้อมูลซ้ำ'
  if (value === 'discord_login_failed') return `Discord login ไม่สำเร็จ${detail ? `: ${detail}` : ' กรุณาลองใหม่'}`
  return `Discord login ไม่สำเร็จ${raw ? `: ${raw}` : ''}`
}

export default function Register() {
  const loc = useLocation()
  const searchParams = new URLSearchParams(loc.search)
  const returnTo = searchParams.get('return_to') || '/'

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [tos, setTos] = useState(true)
  const [status, setStatus] = useState('idle')
  const [errorText, setErrorText] = useState('')
  const [usernameAvailability, setUsernameAvailability] = useState('idle')
  const usernameCheckSeq = useRef(0)
  const [discordConfig, setDiscordConfig] = useState({ enabled: false, loaded: false })
  const discordErrorText = discordErrorMessage(searchParams.get('discord_error'))

  const usernameTrimmed = String(username || '').trim()
  const emailTrimmed = String(email || '').trim()
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)
  const emailTypoSuggestion = detectEmailTypo(emailTrimmed)

  const usernameCharsetValid = /^[a-zA-Z0-9._-]*$/.test(usernameTrimmed)
  const usernameValid = usernameTrimmed.length >= 6 && usernameCharsetValid
  const passwordValidLength = password.length >= 8
  const passwordEnglishOnly = isEnglishOnlyPassword(password)
  const passwordMatches = password === confirmPassword && confirmPassword.length > 0
  const passwordValid = passwordValidLength && passwordEnglishOnly && passwordMatches

  const strength = getPasswordStrengthMeta(password)
  const strengthWidth = `${Math.max(0, Math.min(100, Math.round((strength.score / 5) * 100)))}%`
  const strengthColorClass =
    strength.level === 'strong'
      ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
      : strength.level === 'medium'
        ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
        : strength.level === 'weak'
          ? 'bg-gradient-to-r from-rose-400 to-red-500'
          : 'bg-slate-200'

  const usernameAvailable = usernameAvailability === 'available'
  const canSubmit = status !== 'submitting' && tos && emailValid && usernameValid && usernameAvailable && passwordValid

  useEffect(() => {
    let cancelled = false
    fetchJson('/api/auth/discord/config')
      .then((data) => {
        if (!cancelled) setDiscordConfig({ enabled: Boolean(data?.enabled), loaded: true })
      })
      .catch(() => {
        if (!cancelled) setDiscordConfig({ enabled: false, loaded: true })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const raw = usernameTrimmed
    if (!raw || !usernameValid || !usernameCharsetValid) {
      setUsernameAvailability('idle')
      return
    }

    const seq = usernameCheckSeq.current + 1
    usernameCheckSeq.current = seq
    setUsernameAvailability('checking')

    const timer = setTimeout(async () => {
      try {
        const data = await fetchJson(`/api/auth/check-username?username=${encodeURIComponent(raw)}`)
        if (usernameCheckSeq.current !== seq) return
        setUsernameAvailability(data?.available ? 'available' : 'taken')
      } catch (e) {
        if (usernameCheckSeq.current !== seq) return
        if (e?.status === 400) setUsernameAvailability('idle')
        else setUsernameAvailability('error')
      }
    }, 350)

    return () => {
      clearTimeout(timer)
    }
  }, [usernameTrimmed, usernameValid, usernameCharsetValid])

  async function onSubmit(e) {
    e.preventDefault()
    if (status === 'submitting') return
    setErrorText('')
    if (!tos) {
      setStatus('error')
      setErrorText('กรุณายอมรับเงื่อนไขการใช้งาน')
      return
    }
    if (!emailValid) {
      setStatus('error')
      setErrorText('กรุณากรอก Email ให้ถูกต้อง (เช่น user@example.com)')
      return
    }
    if (!usernameCharsetValid) {
      setStatus('error')
      setErrorText('Username ใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด (.), ขีด (-), ขีดล่าง (_) เท่านั้น')
      return
    }
    if (!usernameValid) {
      setStatus('error')
      setErrorText('Username ต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }
    if (usernameAvailability === 'checking') {
      setStatus('error')
      setErrorText('กำลังตรวจสอบ Username กรุณารอสักครู่')
      return
    }
    if (usernameAvailability === 'taken') {
      setStatus('error')
      setErrorText('Username นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น')
      return
    }
    if (usernameAvailability !== 'available') {
      setStatus('error')
      setErrorText('ไม่สามารถยืนยัน Username ได้ กรุณาลองใหม่')
      return
    }
    if (!passwordValidLength) {
      setStatus('error')
      setErrorText('Password ต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    if (!passwordEnglishOnly) {
      setStatus('error')
      setErrorText('Password ต้องเป็นภาษาอังกฤษ/ASCII เท่านั้น')
      return
    }
    if (!passwordMatches) {
      setStatus('error')
      setErrorText('รหัสผ่านยืนยันไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง')
      return
    }

    setStatus('submitting')
    try {
      const data = await fetchJson('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameTrimmed, email: emailTrimmed, password, remember: true }),
      })
      setAuthToken(data?.token ?? null)
      setStatus('success')
      window.location.assign(returnTo)
    } catch (e) {
      const code = String(e?.data?.error || '')
      setStatus('error')
      if (code === 'invalid_email') setErrorText('กรุณากรอก Email ให้ถูกต้อง')
      else if (code === 'invalid_username') setErrorText('Username ต้องมีอย่างน้อย 6 ตัวอักษร')
      else if (code === 'invalid_username_charset') setErrorText('Username ใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด (.), ขีด (-), ขีดล่าง (_) เท่านั้น')
      else if (code === 'weak_password') setErrorText('Password ต้องมีอย่างน้อย 8 ตัวอักษร')
      else if (code === 'invalid_password_charset') setErrorText('Password ต้องเป็นภาษาอังกฤษเท่านั้น')
      else if (code === 'email_or_username_taken') setErrorText('Email หรือ Username นี้ถูกลงทะเบียนไว้แล้ว')
      else setErrorText('สมัครสมาชิกไม่สำเร็จ กรุณาตรวจสอบข้อมูลอีกครั้ง')
    }
  }

  function onDiscordLogin() {
    if (!discordConfig.enabled) {
      setStatus('error')
      setErrorText('Discord login ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์')
      return
    }

    setTos(true)
    setStatus('idle')
    setErrorText('')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `/api/auth/discord?return_to=${encodeURIComponent(returnTo)}&remember=1&client_origin=${encodeURIComponent(origin)}`
    window.location.assign(resolveApiUrl(url))
  }

  const loginLink = returnTo && returnTo !== '/' ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-14 animate-fade-in">
      <div className="relative overflow-hidden rounded-3xl border border-sky-200/80 bg-white/95 backdrop-blur-md p-7 sm:p-9 shadow-2xl shadow-sky-500/10 ring-1 ring-black/5">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-500/30">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">สมัครสมาชิกใหม่</h2>
          <p className="mt-1 text-xs text-slate-500">สร้างบัญชีผู้ใช้เพื่อเริ่มสั่งซื้อสินค้าและสะสมแต้ม VIP</p>
        </div>

        {discordErrorText ? (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-center font-bold text-rose-700 mb-4 shadow-sm">
            ⚠️ {discordErrorText}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onSubmit}>
          {/* Discord Register Option */}
          <button
            type="button"
            onClick={onDiscordLogin}
            disabled={status === 'submitting' || !discordConfig.enabled}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl border border-[#5865F2]/20 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs shadow-md shadow-[#5865F2]/20 transition-all hover:shadow-lg disabled:opacity-50 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
              <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.078.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.13 14.13 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.771 1.364 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .031-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.094 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z" />
            </svg>
            <span>{discordConfig.loaded && !discordConfig.enabled ? 'Discord register ยังไม่ได้เปิด' : 'สมัครทันใจด้วย Discord'}</span>
          </button>

          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 py-1">
            <span className="h-px flex-1 bg-slate-200" />
            <span>หรือกรอกข้อมูลสมัคร</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Username Field */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                Username (ชื่อบัญชีผู้ใช้)
              </label>
              {usernameTrimmed.length > 0 ? (
                <span className="text-[11px] font-mono text-slate-400">
                  {usernameTrimmed.length}/20
                </span>
              ) : null}
            </div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เช่น username_99"
              autoComplete="username"
              maxLength={20}
              className="ui-field h-11 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 font-mono"
            />
            <div className="flex items-center gap-2 text-[11px] pt-0.5">
              {usernameValid ? <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /> : null}
              <span className={usernameValid ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                อย่างน้อย 6 ตัวอักษร (a-z, 0-9, ., -, _)
              </span>
            </div>
            {!usernameCharsetValid && usernameTrimmed.length > 0 ? (
              <div className="text-[11px] font-bold text-rose-600">ห้ามมีเว้นวรรคหรืออักขระพิเศษ ใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด, ขีด, ขีดล่าง</div>
            ) : null}
            {usernameCharsetValid && !usernameValid && usernameTrimmed.length > 0 ? (
              <div className="text-[11px] font-bold text-rose-600">Username ต้องมีอย่างน้อย 6 ตัวอักษร</div>
            ) : null}
            {usernameValid ? (
              <div className="flex items-center gap-2 text-[11px]">
                {usernameAvailable ? <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /> : null}
                <span
                  className={
                    usernameAvailability === 'available'
                      ? 'text-emerald-700 font-bold'
                      : usernameAvailability === 'taken'
                        ? 'text-rose-600 font-bold'
                        : usernameAvailability === 'error'
                          ? 'text-rose-600 font-bold'
                          : 'text-slate-500'
                  }
                >
                  {usernameAvailability === 'available'
                    ? '✓ Username นี้สามารถใช้งานได้'
                    : usernameAvailability === 'taken'
                      ? '✕ Username นี้ถูกใช้งานแล้ว'
                      : usernameAvailability === 'error'
                        ? 'ตรวจสอบ Username ไม่สำเร็จ'
                        : 'กำลังตรวจสอบสถานะ Username...'}
                </span>
              </div>
            ) : null}
          </div>

          {/* Email Field */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Email (อีเมลสำหรับติดต่อ/รีเซ็ตรหัสผ่าน)
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              type="email"
              autoComplete="email"
              className="ui-field h-11 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
            {emailTypoSuggestion ? (
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 animate-fade-in">
                <span>💡 คุณหมายถึง</span>
                <button
                  type="button"
                  onClick={() => setEmail(emailTypoSuggestion)}
                  className="font-bold underline text-sky-700 hover:text-sky-900 cursor-pointer"
                >
                  {emailTypoSuggestion}
                </button>
                <span>ใช่หรือไม่? (คลิกเพื่อแก้ไข)</span>
              </div>
            ) : null}
            {!emailValid && emailTrimmed.length > 0 && !emailTypoSuggestion ? (
              <div className="text-[11px] font-bold text-rose-600">กรุณากรอก Email ให้ถูกต้อง (เช่น user@example.com)</div>
            ) : null}
          </div>

          {/* Password Field */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Password (รหัสผ่าน)
            </label>
            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="อย่างน้อย 8 ตัวอักษร (ภาษาอังกฤษ)"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="ui-field h-11 pr-10 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1"
                title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Strength Meter */}
            <div className="space-y-1.5 pt-1">
              <div className="h-1.5 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <div className={`h-full ${strengthColorClass} transition-all duration-300`} style={{ width: strengthWidth }} />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">ความปลอดภัยของรหัสผ่าน:</span>
                <span
                  className={
                    strength.level === 'strong'
                      ? 'text-emerald-600 font-bold'
                      : strength.level === 'medium'
                        ? 'text-amber-600 font-bold'
                        : strength.level === 'weak'
                          ? 'text-rose-600 font-bold'
                          : 'text-slate-400'
                  }
                >
                  {strength.label}
                </span>
              </div>
              <div className="grid gap-1 text-[11px] sm:grid-cols-2">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${passwordValidLength ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className={passwordValidLength ? 'text-emerald-700 font-bold' : 'text-slate-500'}>อย่างน้อย 8 ตัวอักษร</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${passwordEnglishOnly ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className={passwordEnglishOnly ? 'text-emerald-700 font-bold' : 'text-slate-500'}>ภาษาอังกฤษเท่านั้น</span>
                </div>
              </div>
              {!passwordValidLength && password.length > 0 ? <div className="text-[11px] font-bold text-rose-600">Password ต้องมีอย่างน้อย 8 ตัวอักษร</div> : null}
              {password.length > 0 && !passwordEnglishOnly ? <div className="text-[11px] font-bold text-rose-600">Password ต้องเป็นภาษาอังกฤษเท่านั้น</div> : null}
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Confirm Password (ยืนยันรหัสผ่านอีกครั้ง)
            </label>
            <div className="relative">
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="พิมพ์รหัสผ่านเดิมซ้ำอีกครั้ง"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="ui-field h-11 pr-10 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1"
                title={showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showConfirmPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {confirmPassword.length > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
                {passwordMatches ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-emerald-700 font-bold">✓ รหัสผ่านตรงกันถูกต้อง</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-rose-600 font-bold">✕ รหัสผ่านไม่ตรงกัน</span>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="ui-btn-primary w-full h-11 text-xs font-black shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer transition-all"
          >
            {status === 'submitting' ? 'กำลังสร้างบัญชี...' : 'สมัครสมาชิก'}
          </button>

          <div className="space-y-2 pt-1 text-xs text-slate-600">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} className="rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              <span>
                ยอมรับ{' '}
                <Link className="text-sky-600 hover:underline font-bold" to="/tos" target="_blank" rel="noreferrer">
                  เงื่อนไขการใช้งาน
                </Link>
              </span>
            </label>
          </div>

          {status === 'error' ? (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-center font-bold text-rose-700 shadow-sm animate-shake">
              {errorText || 'สมัครไม่สำเร็จ (ตรวจสอบข้อมูลการสมัคร)'}
            </div>
          ) : null}
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-500">
          มีบัญชีอยู่แล้ว?{' '}
          <Link className="text-sky-600 hover:text-sky-700 hover:underline font-bold" to={loginLink}>
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  )
}
