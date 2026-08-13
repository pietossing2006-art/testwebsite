import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchJson } from '../api.js'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle, submitting, success, error
  const [errorText, setErrorText] = useState('')

  const emailTrimmed = String(email || '').trim()
  const emailValid = emailTrimmed.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)
  const canSubmit = status !== 'submitting' && emailValid

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setStatus('submitting')
    setErrorText('')
    try {
      await fetchJson('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrimmed }),
      })
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorText(err?.message || 'ส่งลิงก์กู้คืนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="ui-panel relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/30 hover:shadow-cyan-950/10">
        {/* Glow decoration */}
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />

        {/* Lock Icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400 ring-4 ring-cyan-500/5">
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        </div>

        <div className="text-center">
          <h2 className="ui-title text-2xl font-bold tracking-tight text-white">ลืมรหัสผ่าน?</h2>
          <p className="ui-subtitle mt-2 text-sm text-white/55">
            กรอกอีเมลของคุณเพื่อรับลิงก์สำหรับตั้งค่ารหัสผ่านใหม่
          </p>
        </div>

        {status === 'success' ? (
          <div className="mt-8 space-y-6 text-center animate-fade-in">
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-white">ส่งอีเมลสำเร็จ!</p>
              <p className="text-xs leading-relaxed text-white/55">
                ระบบได้ส่งลิงก์สำหรับรีเซ็ตรหัสผ่านไปยังอีเมลของคุณเรียบร้อยแล้ว (หากบัญชีของคุณผูกไว้กับ Discord ลิงก์กู้คืนจะส่งไปทาง Discord DM ด้วย) กรุณาตรวจสอบและคลิกลิงก์ภายใน 30 นาที
              </p>
            </div>
            <div className="pt-4 border-t border-white/5">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-400 transition hover:text-cyan-300 hover:underline"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          </div>
        ) : (
          <form className="ui-form mt-8 space-y-5" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-white/55">
                อีเมลของคุณ
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="ui-field focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
              />
              {emailTrimmed.length > 0 && !emailValid && (
                <div className="ui-error mt-1 text-[11px] text-cyan-300">
                  กรุณากรอกอีเมลในรูปแบบที่ถูกต้อง
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="ui-btn-primary w-full flex items-center justify-center gap-2 py-3 font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {status === 'submitting' ? (
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
                  <span>กำลังส่งข้อมูล...</span>
                </>
              ) : (
                'ส่งลิงก์กู้คืนรหัสผ่าน'
              )}
            </button>

            {status === 'error' && (
              <div className="ui-error p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/30 text-xs text-center text-cyan-300">
                {errorText}
              </div>
            )}

            <div className="flex items-center justify-center pt-4 border-t border-white/5">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-xs font-semibold text-white/55 transition hover:text-white hover:underline"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                กลับไปเข้าสู่ระบบ
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
