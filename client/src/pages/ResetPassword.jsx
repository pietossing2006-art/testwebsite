import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchJson } from '../api.js'

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

  if (score <= 2) return { score, level: 'weak', label: 'Weak' }
  if (score <= 4) return { score, level: 'medium', label: 'Medium' }
  return { score, level: 'strong', label: 'Strong' }
}

export default function ResetPassword() {
  const loc = useLocation()
  const token = new URLSearchParams(loc.search).get('token') || ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [tokenStatus, setTokenStatus] = useState('checking') // checking, valid, invalid
  const [submitStatus, setSubmitStatus] = useState('idle') // idle, submitting, success, error
  const [errorText, setErrorText] = useState('')

  const passwordValidLength = password.length >= 8
  const passwordEnglishOnly = isEnglishOnlyPassword(password)
  const passwordMatches = password === confirmPassword && password.length > 0
  const passwordValid = passwordValidLength && passwordEnglishOnly && passwordMatches
  
  const strength = getPasswordStrengthMeta(password)
  const strengthWidth = `${Math.max(0, Math.min(100, Math.round((strength.score / 5) * 100)))}%`
  const strengthColorClass =
    strength.level === 'strong' ? 'bg-emerald-400' : strength.level === 'medium' ? 'bg-yellow-300' : strength.level === 'weak' ? 'bg-red-400' : 'bg-white/20'

  const canSubmit = token && tokenStatus === 'valid' && submitStatus !== 'submitting' && passwordValid

  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid')
      return
    }

    let cancelled = false
    setTokenStatus('checking')
    fetchJson('/api/auth/verify-reset-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((data) => {
        if (cancelled) return
        if (data?.valid) {
          setTokenStatus('valid')
          setEmail(data.email || '')
        } else {
          setTokenStatus('invalid')
        }
      })
      .catch(() => {
        if (cancelled) return
        setTokenStatus('invalid')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitStatus('submitting')
    setErrorText('')
    try {
      await fetchJson('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      setSubmitStatus('success')
    } catch (err) {
      setSubmitStatus('error')
      setErrorText(err?.message || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ ลิงก์กู้คืนอาจหมดอายุแล้ว')
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="ui-panel relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/30 hover:shadow-cyan-950/10">
        {/* Glow decoration */}
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="text-center mb-6">
          <h2 className="ui-title text-2xl font-bold tracking-tight text-white">ตั้งรหัสผ่านใหม่</h2>
          <p className="ui-subtitle mt-2 text-sm text-white/55">
            สร้างรหัสผ่านใหม่ที่ปลอดภัยสำหรับบัญชีของคุณ
          </p>
        </div>

        {tokenStatus === 'checking' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <svg
              className="h-10 w-10 animate-spin text-cyan-400"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="text-xs text-white/55">กำลังตรวจสอบความถูกต้องของลิงก์...</p>
          </div>
        )}

        {tokenStatus === 'invalid' && (
          <div className="text-center py-6 space-y-6">
            <div className="flex justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-950/40 text-cyan-400 border border-cyan-800/30">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-white">ลิงก์ไม่ถูกต้องหรือหมดอายุ</p>
              <p className="text-xs leading-relaxed text-white/55 px-4">
                ลิงก์กู้คืนรหัสผ่านนี้ไม่มีความปลอดภัย หมดอายุ หรือใช้ไปแล้ว กรุณาส่งคำขอใหม่อีกครั้ง
              </p>
            </div>
            <div className="pt-6 border-t border-white/5 flex flex-col gap-3">
              <Link
                to="/forgot-password"
                className="ui-btn-primary py-2.5 text-sm font-semibold transition duration-200"
              >
                ขอลิงก์กู้คืนรหัสผ่านใหม่
              </Link>
              <Link
                to="/login"
                className="text-xs text-white/45 hover:text-white transition hover:underline"
              >
                กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          </div>
        )}

        {tokenStatus === 'valid' && submitStatus === 'success' && (
          <div className="text-center py-6 space-y-6 animate-fade-in">
            <div className="flex justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-white">เปลี่ยนรหัสผ่านสำเร็จ!</p>
              <p className="text-xs text-white/55 px-4">
                รหัสผ่านใหม่ของคุณพร้อมใช้งานแล้ว คุณสามารถใช้รหัสผ่านใหม่นี้เข้าสู่ระบบได้ทันที
              </p>
            </div>
            <div className="pt-6 border-t border-white/5">
              <Link
                to="/login"
                className="ui-btn-primary w-full py-2.5 text-sm font-semibold transition duration-200 block text-center"
              >
                เข้าสู่ระบบตอนนี้
              </Link>
            </div>
          </div>
        )}

        {tokenStatus === 'valid' && submitStatus !== 'success' && (
          <form className="ui-form mt-6 space-y-5" onSubmit={onSubmit}>
            {email && (
              <div className="rounded-lg bg-white/5 px-4 py-2 text-xs border border-white/5 text-white/60">
                กู้คืนรหัสผ่านสำหรับ: <span className="font-semibold text-white">{email}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/55">
                รหัสผ่านใหม่
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ป้อนรหัสผ่านอย่างน้อย 8 ตัวอักษร"
                className="ui-field focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/55">
                ยืนยันรหัสผ่านใหม่
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="ป้อนรหัสผ่านอีกครั้ง"
                className="ui-field focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
              />
              {confirmPassword.length > 0 && !passwordMatches && (
                <div className="text-[11px] text-cyan-300">รหัสผ่านยืนยันไม่ตรงกัน</div>
              )}
            </div>

            {/* Password strength details */}
            <div className="space-y-2 pt-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/40 border border-white/5">
                <div className={`h-full ${strengthColorClass} transition-all duration-300`} style={{ width: strengthWidth }} />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/55">ความปลอดภัยรหัสผ่าน</span>
                <span className={`font-semibold ${strength.level === 'strong' ? 'text-emerald-400' : strength.level === 'medium' ? 'text-yellow-300' : 'text-red-400'}`}>
                  {strength.label === 'Strong' ? 'แข็งแรง' : strength.label === 'Medium' ? 'ปานกลาง' : strength.label === 'Weak' ? 'อ่อนแอ' : 'ยังไม่ได้กรอก'}
                </span>
              </div>

              <div className="grid gap-1 text-[11px] sm:grid-cols-2 pt-1 border-t border-white/5">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${passwordValidLength ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-white/20'}`} />
                  <span className={passwordValidLength ? 'text-emerald-300' : 'text-white/45'}>อย่างน้อย 8 ตัวอักษร</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${passwordEnglishOnly ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-white/20'}`} />
                  <span className={passwordEnglishOnly ? 'text-emerald-300' : 'text-white/45'}>ภาษาอังกฤษ/ASCII เท่านั้น</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="ui-btn-primary w-full flex items-center justify-center gap-2 py-3 font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitStatus === 'submitting' ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>กำลังอัปเดตรหัสผ่าน...</span>
                </>
              ) : (
                'รีเซ็ตรหัสผ่านใหม่'
              )}
            </button>

            {submitStatus === 'error' && (
              <div className="ui-error p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/30 text-xs text-center text-cyan-300">
                {errorText}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
