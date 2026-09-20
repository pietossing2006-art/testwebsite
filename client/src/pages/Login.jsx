import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchJson, resolveApiUrl, setAuthToken } from '../api.js'

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

function googleErrorMessage(code) {
  const raw = String(code || '').trim()
  if (!raw) return ''
  const [value, detailRaw] = raw.split(':')
  const detail = detailRaw ? decodeURIComponent(detailRaw) : ''

  if (value === 'banned') return 'บัญชีนี้ถูกระงับการใช้งาน'
  if (value === 'not_configured' || value === 'google_login_not_configured') return 'Google login ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์'
  if (value === 'access_denied') return 'คุณยกเลิกการเข้าสู่ระบบด้วย Google'
  if (value === 'user_already_linked') return 'บัญชีเว็บนี้ถูกผูกกับ Google อื่นอยู่แล้ว'
  if (value === 'invalid_state') return 'Google login หมดอายุ กรุณาลองใหม่'
  if (value === 'token_exchange_failed') return `Google แลก token ไม่สำเร็จ${detail ? ` (${detail})` : ''}`
  if (value === 'profile_failed') return `ดึงข้อมูลบัญชี Google ไม่สำเร็จ${detail ? ` (${detail})` : ''}`
  if (value === 'db_unique_violation') return 'บันทึกบัญชี Google ลงฐานข้อมูลไม่สำเร็จ เพราะข้อมูลซ้ำ'
  if (value === 'google_login_failed') return `Google login ไม่สำเร็จ${detail ? `: ${detail}` : ' กรุณาลองใหม่'}`
  return `Google login ไม่สำเร็จ${raw ? `: ${raw}` : ''}`
}

// Social logins that land on a 2FA-protected account come back here carrying a temp token,
// so the challenge screen can be seeded on the very first render.
function readOauth2faChallenge(search) {
  const params = new URLSearchParams(search || '')
  if (params.get('two_factor') !== '1') return null
  const tempToken = params.get('temp_token') || ''
  if (!tempToken) return null
  return {
    tempToken,
    type: params.get('two_factor_type') === 'email' ? 'email' : 'totp',
    maskedEmail: params.get('email_masked') || '',
  }
}

export default function Login() {
  const loc = useLocation()
  const searchParams = new URLSearchParams(loc.search)
  const returnTo = searchParams.get('return_to') || '/'
  const oauth2fa = readOauth2faChallenge(loc.search)

  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [tos, setTos] = useState(true)
  const [remember, setRemember] = useState(true)
  const [status, setStatus] = useState('idle')
  const [errorText, setErrorText] = useState('')
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0)

  // 2FA Challenge States
  const [twoFactorRequired, setTwoFactorRequired] = useState(Boolean(oauth2fa))
  const [twoFactorType, setTwoFactorType] = useState(oauth2fa?.type || 'totp') // 'totp' | 'email'
  const [tempToken, setTempToken] = useState(oauth2fa?.tempToken || '')
  const [maskedEmail, setMaskedEmail] = useState(oauth2fa?.maskedEmail || '')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(true)
  const [resendCooldown, setResendCooldown] = useState(oauth2fa?.type === 'email' ? 60 : 0)

  const [discordConfig, setDiscordConfig] = useState({ enabled: false, loaded: false })
  const [googleConfig, setGoogleConfig] = useState({ enabled: false, loaded: false })
  const discordErrorText = discordErrorMessage(searchParams.get('discord_error'))
  const googleErrorText = googleErrorMessage(searchParams.get('google_error'))
  const clientOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const oauthQuery = `return_to=${encodeURIComponent(returnTo)}&remember=${remember ? '1' : '0'}&client_origin=${encodeURIComponent(clientOrigin)}`

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      fetchJson('/api/auth/discord/config'),
      fetchJson('/api/auth/google/config'),
    ]).then(([discRes, googRes]) => {
      if (cancelled) return
      if (discRes.status === 'fulfilled') {
        setDiscordConfig({ enabled: Boolean(discRes.value?.enabled), loaded: true })
      } else {
        setDiscordConfig({ enabled: false, loaded: true })
      }
      if (googRes.status === 'fulfilled') {
        setGoogleConfig({ enabled: Boolean(googRes.value?.enabled), loaded: true })
      } else {
        setGoogleConfig({ enabled: false, loaded: true })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the temp token out of the address bar (and out of the browser history).
  useEffect(() => {
    if (!oauth2fa) return
    const params = new URLSearchParams(window.location.search)
    params.delete('two_factor')
    params.delete('temp_token')
    params.delete('two_factor_type')
    params.delete('email_masked')
    const query = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [oauth2fa])

  // Lockout countdown timer effect
  useEffect(() => {
    if (retryAfterSeconds <= 0) return
    const interval = setInterval(() => {
      setRetryAfterSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setErrorText('')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [retryAfterSeconds])

  // Resend OTP countdown timer effect
  useEffect(() => {
    if (resendCooldown <= 0) return
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [resendCooldown])

  async function onSubmit(e) {
    e.preventDefault()
    if (status === 'submitting') return
    if (!tos) {
      setStatus('error')
      setErrorText('กรุณายอมรับเงื่อนไขการใช้งาน')
      return
    }

    setStatus('submitting')
    setErrorText('')
    try {
      const trustedDeviceToken = localStorage.getItem('trusted_device_token') || ''
      const data = await fetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login,
          password,
          remember,
          trusted_device_token: trustedDeviceToken,
        }),
      })

      if (data?.two_factor_required) {
        setTwoFactorRequired(true)
        setTwoFactorType(data.two_factor_type || 'totp')
        setTempToken(data.temp_token)
        setMaskedEmail(data.email_masked || '')
        setTwoFactorCode('')
        setStatus('idle')
        if (data.two_factor_type === 'email') {
          setResendCooldown(60)
        }
        return
      }

      if (data?.trusted_device_token) {
        localStorage.setItem('trusted_device_token', data.trusted_device_token)
      }

      setAuthToken(data?.token ?? null)
      setStatus('success')
      window.location.assign(returnTo)
    } catch (e) {
      setStatus('error')
      const code = String(e?.data?.error || '')
      if (code === 'too_many_failed_attempts') {
        const retrySec = Number(e?.data?.retry_after_seconds) || 600
        setRetryAfterSeconds(retrySec)
        setErrorText(e?.data?.message || 'ใส่รหัสผ่านผิดเกินกำหนด บัญชีถูกล็อกชั่วคราว')
      } else if (code === 'invalid_credentials') {
        setErrorText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      } else if (code === 'banned') {
        setErrorText('บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อทีมงาน')
      } else {
        setErrorText(e?.data?.message || e?.message || 'เข้าสู่ระบบไม่สำเร็จ')
      }
    }
  }

  async function onVerify2FA(e) {
    e.preventDefault()
    if (status === 'submitting' || !twoFactorCode.trim()) return

    setStatus('submitting')
    setErrorText('')
    try {
      const data = await fetchJson('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          temp_token: tempToken,
          code: twoFactorCode.trim(),
          is_backup_code: useBackupCode,
          remember_device: rememberDevice,
        }),
      })

      if (data?.trusted_device_token) {
        localStorage.setItem('trusted_device_token', data.trusted_device_token)
      }

      setAuthToken(data?.token ?? null)
      setStatus('success')
      window.location.assign(returnTo)
    } catch (e) {
      setStatus('error')
      setErrorText(e?.data?.message || 'รหัสยืนยัน 2FA ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง')
    }
  }

  async function resendEmailOtp() {
    if (resendCooldown > 0 || status === 'submitting') return
    try {
      await fetchJson('/api/auth/2fa/resend-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken }),
      })
      setResendCooldown(60)
      setErrorText('')
    } catch {
      setErrorText('ส่งรหัส OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="relative overflow-hidden rounded-3xl border border-sky-200/80 bg-white/95 p-8 shadow-2xl backdrop-blur-xl transition-all">
        {/* Decorative Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-sky-400 via-sky-600 to-indigo-600" />

        {/* ── SCREEN 1: 2FA CHALLENGE ── */}
        {twoFactorRequired ? (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 shadow-sm">
                <span className="text-2xl">🛡️</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                {useBackupCode ? 'รหัสสำรองฉุกเฉิน' : 'ยืนยันตัวตน 2 ขั้นตอน (2FA)'}
              </h1>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                {useBackupCode ? (
                  'กรอกรหัสกู้คืนฉุกเฉิน 8 หลักของคุณ (เช่น ABCD-1234)'
                ) : twoFactorType === 'totp' ? (
                  'กรอกรหัส 6 หลักจากแอปพลิเคชัน Authenticator (Google Authenticator / Authy)'
                ) : (
                  <>รหัส OTP 6 หลักถูกส่งไปยัง <strong className="text-slate-700">{maskedEmail}</strong></>
                )}
              </p>
            </div>

            {errorText ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs font-bold text-rose-700 animate-shake">
                ⚠️ {errorText}
              </div>
            ) : null}

            <form onSubmit={onVerify2FA} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {useBackupCode ? 'รหัสสำรองฉุกเฉิน (Backup Code)' : 'รหัสยืนยันความปลอดภัย (OTP)'}
                </label>
                <input
                  type="text"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder={useBackupCode ? 'เช่น ABCD-1234' : '000000'}
                  maxLength={useBackupCode ? 10 : 6}
                  autoFocus
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-center text-lg font-mono font-black tracking-widest text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </div>

              {twoFactorType === 'email' && !useBackupCode && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={resendEmailOtp}
                    disabled={resendCooldown > 0}
                    className="text-xs font-bold text-sky-600 hover:text-sky-700 disabled:text-slate-400 cursor-pointer"
                  >
                    {resendCooldown > 0 ? `ส่งรหัสใหม่ได้ใน (${resendCooldown}s)` : 'ส่งรหัส OTP ใหม่อีกครั้ง'}
                  </button>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3 text-left">
                <input
                  id="remember-device"
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-md border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
                <label htmlFor="remember-device" className="text-xs font-semibold text-slate-700 cursor-pointer select-none leading-tight">
                  จดจำอุปกรณ์นี้ (30 วัน)
                  <span className="block mt-0.5 text-[11px] font-normal text-slate-500">
                    ไม่ต้องกรอกรหัสยืนยัน 2FA ซ้ำเมื่อเข้าสู่ระบบจากอุปกรณ์นี้
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={status === 'submitting' || !twoFactorCode.trim()}
                className="w-full rounded-2xl bg-sky-600 py-3 text-xs font-black text-white shadow-lg shadow-sky-600/25 transition hover:bg-sky-700 hover:shadow-sky-600/40 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {status === 'submitting' ? 'กำลังตรวจสอบ...' : 'ยืนยันและเข้าสู่ระบบ'}
              </button>

              <div className="flex flex-col items-center gap-2 pt-2 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode)
                    setTwoFactorCode('')
                    setErrorText('')
                  }}
                  className="font-bold text-slate-600 hover:text-sky-600 transition cursor-pointer"
                >
                  {useBackupCode ? 'สลับไปใช้รหัส 6 หลักจากแอป/อีเมล' : '🔑 ใช้รหัสสำรองฉุกเฉิน (Backup Code)'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTwoFactorRequired(false)
                    setTempToken('')
                    setErrorText('')
                  }}
                  className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  ← กลับไปหน้าเข้าสู่ระบบ
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ── SCREEN 2: STANDARD LOGIN ── */
          <>
            <div className="text-center">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">ยินดีต้อนรับกลับมา</h1>
              <p className="mt-1.5 text-xs text-slate-500">
                เข้าสู่ระบบเพื่อจัดการบัญชีและสั่งซื้อสินค้าบน VxperS Store
              </p>
            </div>

            {discordErrorText ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs font-bold text-amber-900 shadow-xs">
                ⚠️ {discordErrorText}
              </div>
            ) : null}

            {googleErrorText ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs font-bold text-amber-900 shadow-xs">
                ⚠️ {googleErrorText}
              </div>
            ) : null}

            {errorText ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs font-bold text-rose-700 shadow-xs animate-shake">
                ⚠️ {errorText}
                {retryAfterSeconds > 0 ? (
                  <div className="mt-1 font-mono text-[11px] text-rose-600">
                    ลองใหม่ได้ในอีก: {Math.floor(retryAfterSeconds / 60)}:{(retryAfterSeconds % 60).toString().padStart(2, '0')} นาที
                  </div>
                ) : null}
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">ชื่อผู้ใช้ หรือ อีเมล</label>
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="username หรือ yourname@email.com"
                  autoComplete="username"
                  required
                  disabled={retryAfterSeconds > 0}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 disabled:opacity-50"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">รหัสผ่าน</label>
                  <Link
                    to="/forgot-password"
                    className="text-[11px] font-bold text-sky-600 transition hover:text-sky-700 hover:underline"
                  >
                    ลืมรหัสผ่าน?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    disabled={retryAfterSeconds > 0}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 pr-11 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded-md border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  จดจำการเข้าสู่ระบบ (30 วัน)
                </label>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={tos}
                    onChange={(e) => setTos(e.target.checked)}
                    className="h-4 w-4 rounded-md border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                  ฉันยอมรับ{' '}
                  <Link to="/tos" target="_blank" className="font-bold text-sky-600 hover:underline">
                    เงื่อนไขและข้อตกลงการใช้งาน
                  </Link>
                </label>
              </div>

              <button
                type="submit"
                disabled={status === 'submitting' || !tos || retryAfterSeconds > 0}
                className="mt-2 w-full rounded-2xl bg-sky-600 py-3 text-xs font-black text-white shadow-lg shadow-sky-600/25 transition hover:bg-sky-700 hover:shadow-sky-600/40 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {status === 'submitting' ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            {/* Social Logins */}
            {discordConfig.enabled || googleConfig.enabled ? (
              <div className="mt-6">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <span className="relative bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    หรือเข้าสู่ระบบด้วย
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {discordConfig.enabled ? (
                    <a
                      href={resolveApiUrl(`/api/auth/discord?${oauthQuery}`)}
                      className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[#5865F2]/20 bg-[#5865F2] py-2.5 text-xs font-bold text-white shadow-md shadow-[#5865F2]/20 transition hover:bg-[#4752C4] hover:shadow-lg"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.894a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                      <span>ลงชื่อเข้าใช้ด้วย Discord</span>
                    </a>
                  ) : null}

                  {googleConfig.enabled ? (
                    <a
                      href={resolveApiUrl(`/api/auth/google?${oauthQuery}`)}
                      className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 shadow-md shadow-slate-500/10 transition hover:bg-slate-50 hover:shadow-lg"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.351z"/>
                        <path fill="#34A853" d="M12 22c2.7 0 4.964-.895 6.618-2.422l-3.232-2.51c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.759-5.596-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22z"/>
                        <path fill="#FBBC05" d="M6.404 13.9a5.999 5.999 0 0 1 0-3.8V7.51H3.064a10.003 10.003 0 0 0 0 8.98l3.34-2.59z"/>
                        <path fill="#EA4335" d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.959 2.99 14.695 2 12 2a9.996 9.996 0 0 0-8.936 5.51l3.34 2.59C7.19 7.736 9.395 5.977 12 5.977z"/>
                      </svg>
                      <span>ลงชื่อเข้าใช้ด้วย Google</span>
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-8 border-t border-slate-100 pt-6 text-center">
              <p className="text-xs text-slate-500">
                ยังไม่มีบัญชีผู้ใช้งาน?{' '}
                <Link
                  to={returnTo && returnTo !== '/' ? `/register?return_to=${encodeURIComponent(returnTo)}` : '/register'}
                  className="font-bold text-sky-600 transition hover:text-sky-700 hover:underline"
                >
                  สมัครสมาชิกใหม่ที่นี่
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
