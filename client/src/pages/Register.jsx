import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchJson, setAuthToken } from '../api.js'

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

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tos, setTos] = useState(false)
  const [status, setStatus] = useState('idle')
  const [errorText, setErrorText] = useState('')
  const [usernameAvailability, setUsernameAvailability] = useState('idle')
  const usernameCheckSeq = useRef(0)

  const usernameTrimmed = String(username || '').trim()
  const emailTrimmed = String(email || '').trim()
  const emailValid = emailTrimmed.includes('@')
  const usernameCharsetValid = /^[a-zA-Z0-9._-]*$/.test(usernameTrimmed)
  const usernameValid = usernameTrimmed.length >= 6 && usernameCharsetValid
  const passwordValidLength = password.length >= 8
  const passwordEnglishOnly = isEnglishOnlyPassword(password)
  const passwordValid = passwordValidLength && passwordEnglishOnly
  const strength = getPasswordStrengthMeta(password)
  const strengthWidth = `${Math.max(0, Math.min(100, Math.round((strength.score / 5) * 100)))}%`
  const strengthColorClass =
    strength.level === 'strong' ? 'bg-emerald-400' : strength.level === 'medium' ? 'bg-yellow-300' : strength.level === 'weak' ? 'bg-red-400' : 'bg-white/20'
  const usernameAvailable = usernameAvailability === 'available'
  const canSubmit = status !== 'submitting' && tos && emailValid && usernameValid && usernameAvailable && passwordValid

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
      setErrorText('กรุณากรอก Email ให้ถูกต้อง')
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
      setErrorText('Username นี้ถูกใช้แล้ว')
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
      setErrorText('Password ต้องเป็นภาษาอังกฤษเท่านั้น')
      return
    }

    setStatus('submitting')
    try {
      const data = await fetchJson('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameTrimmed, email: emailTrimmed, password, remember: false }),
      })
      setAuthToken(data?.token ?? null)
      setStatus('success')
      window.location.assign('/')
    } catch (e) {
      const code = String(e?.data?.error || '')
      setStatus('error')
      if (code === 'invalid_email') setErrorText('กรุณากรอก Email ให้ถูกต้อง')
      else if (code === 'invalid_username') setErrorText('Username ต้องมีอย่างน้อย 6 ตัวอักษร')
      else if (code === 'invalid_username_charset') setErrorText('Username ใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด (.), ขีด (-), ขีดล่าง (_) เท่านั้น')
      else if (code === 'weak_password') setErrorText('Password ต้องมีอย่างน้อย 8 ตัวอักษร')
      else if (code === 'invalid_password_charset') setErrorText('Password ต้องเป็นภาษาอังกฤษเท่านั้น')
      else if (code === 'email_or_username_taken') setErrorText('Email หรือ Username นี้ถูกใช้แล้ว')
      else setErrorText('สมัครไม่สำเร็จ กรุณาตรวจสอบข้อมูลอีกครั้ง')
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="ui-panel p-6">
        <div className="ui-title">สมัครสมาชิก</div>
        <div className="ui-subtitle">สร้างบัญชีด้วยอีเมลและรหัสผ่าน</div>

        <form className="ui-form" onSubmit={onSubmit}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="ui-field"
          />
          <div className="-mt-2 flex items-center gap-2 text-[11px]">
            {usernameValid ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_0_3px_rgba(74,222,128,0.2)]" /> : null}
            <span className={usernameValid ? 'text-emerald-200/90' : 'text-white/55'}>Username อย่างน้อย 6 ตัว (a-z, 0-9, ., -, _)</span>
          </div>
          {!usernameCharsetValid && usernameTrimmed.length > 0 ? <div className="ui-help -mt-2 text-[11px] text-cyan-200">ห้ามมีเว้นวรรคหรืออักขระพิเศษ ใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด, ขีด, ขีดล่าง</div> : null}
          {usernameCharsetValid && !usernameValid && usernameTrimmed.length > 0 ? <div className="ui-help -mt-2 text-[11px] text-cyan-200">Username ต้องมีอย่างน้อย 6 ตัวอักษร</div> : null}
          {usernameValid ? (
            <div className="-mt-2 flex items-center gap-2 text-[11px]">
              {usernameAvailable ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_0_3px_rgba(74,222,128,0.2)]" /> : null}
              <span
                className={
                  usernameAvailability === 'available'
                    ? 'text-emerald-200/90'
                    : usernameAvailability === 'taken'
                      ? 'text-cyan-200/90'
                      : usernameAvailability === 'error'
                        ? 'text-cyan-200/90'
                        : 'text-white/55'
                }
              >
                {usernameAvailability === 'available'
                  ? 'Username นี้ใช้งานได้'
                  : usernameAvailability === 'taken'
                    ? 'Username นี้ถูกใช้แล้ว'
                    : usernameAvailability === 'error'
                      ? 'ตรวจสอบ Username ไม่สำเร็จ'
                      : 'กำลังตรวจสอบ Username...'}
              </span>
            </div>
          ) : null}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            autoComplete="email"
            className="ui-field"
          />
          {!emailValid && emailTrimmed.length > 0 ? <div className="ui-help -mt-2 text-[11px] text-cyan-200">กรุณากรอก Email ให้ถูกต้อง</div> : null}
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            className="ui-field"
          />

          <div className="-mt-1 space-y-1">
            <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-black/30">
              <div className={`h-full ${strengthColorClass} transition-all duration-300`} style={{ width: strengthWidth }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/55">Password Strength</span>
              <span
                className={
                  strength.level === 'strong'
                    ? 'text-emerald-300'
                    : strength.level === 'medium'
                      ? 'text-yellow-200'
                      : strength.level === 'weak'
                        ? 'text-red-200'
                        : 'text-white/45'
                }
              >
                {strength.label}
              </span>
            </div>
            <div className="grid gap-1 text-[11px] sm:grid-cols-2">
              <div className="flex items-center gap-2">
                {passwordValidLength ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_0_3px_rgba(74,222,128,0.2)]" /> : null}
                <span className={passwordValidLength ? 'text-emerald-200/90' : 'text-white/55'}>อย่างน้อย 8 ตัว</span>
              </div>
              <div className="flex items-center gap-2">
                {passwordEnglishOnly ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_0_3px_rgba(74,222,128,0.2)]" /> : null}
                <span className={passwordEnglishOnly ? 'text-emerald-200/90' : 'text-white/55'}>ตัวอักษรภาษาอังกฤษเท่านั้น</span>
              </div>
            </div>
            {!passwordValidLength && password.length > 0 ? <div className="text-[11px] text-cyan-200">Password ต้องมีอย่างน้อย 8 ตัวอักษร</div> : null}
            {password.length > 0 && !passwordEnglishOnly ? <div className="text-[11px] text-cyan-200">Password ต้องเป็นภาษาอังกฤษเท่านั้น</div> : null}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="ui-btn-primary w-full"
          >
            {status === 'submitting' ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
          </button>

          <label className="ui-label">
            <input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} />
            <span>
              ยอมรับ{' '}
              <Link className="ui-link" to="/tos" target="_blank" rel="noreferrer">
                เงื่อนไขการใช้งาน
              </Link>
            </span>
          </label>

          {status === 'error' ? <div className="ui-error">{errorText || 'สมัครไม่สำเร็จ (ตรวจสอบข้อมูลการสมัคร)'}</div> : null}
        </form>

        <div className="mt-4 ui-help">
          มีบัญชีแล้ว?{' '}
          <Link className="ui-link" to="/login">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  )
}
