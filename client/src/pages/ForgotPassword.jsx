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
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white p-8 shadow-xl">
        {/* Lock Icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 shadow-sm">
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
          <h2 className="text-2xl font-black tracking-tight text-slate-900">ลืมรหัสผ่าน?</h2>
          <p className="mt-1.5 text-xs text-slate-500">
            กรอกอีเมลของคุณเพื่อรับลิงก์สำหรับตั้งค่ารหัสผ่านใหม่
          </p>
        </div>

        {status === 'success' ? (
          <div className="mt-8 space-y-5 text-center animate-fade-in">
            <div className="flex justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
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
            <div className="space-y-1.5">
              <p className="text-base font-black text-slate-900">ส่งอีเมลสำเร็จ!</p>
              <p className="text-xs leading-relaxed text-slate-500">
                ระบบได้ส่งลิงก์สำหรับรีเซ็ตรหัสผ่านไปยังอีเมลของคุณเรียบร้อยแล้ว (หากบัญชีของคุณผูกไว้กับ Discord ลิงก์กู้คืนจะส่งไปทาง Discord DM ด้วย) กรุณาตรวจสอบและคลิกลิงก์ภายใน 30 นาที
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-xs font-bold text-sky-600 transition hover:text-sky-700 hover:underline"
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
          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label htmlFor="email" className="block text-xs font-bold text-slate-700">
                อีเมลของคุณ
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="ui-field h-11"
              />
              {emailTrimmed.length > 0 && !emailValid && (
                <div className="mt-1 text-[11px] font-bold text-rose-600">
                  กรุณากรอกอีเมลในรูปแบบที่ถูกต้อง
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="ui-btn-primary w-full flex items-center justify-center gap-2 h-11 text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                  กำลังส่งลิงก์...
                </>
              ) : (
                'ส่งลิงก์กู้คืนรหัสผ่าน'
              )}
            </button>

            {status === 'error' && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-center font-bold text-red-600">
                {errorText}
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline"
              >
                ← กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
