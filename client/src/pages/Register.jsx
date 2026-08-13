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

  if (score <= 2) return { score, level: 'weak', label: 'Weak' }
  if (score <= 4) return { score, level: 'medium', label: 'Medium' }
  return { score, level: 'strong', label: 'Strong' }
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
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tos, setTos] = useState(false)
  const [status, setStatus] = useState('idle')
  const [errorText, setErrorText] = useState('')
  const [usernameAvailability, setUsernameAvailability] = useState('idle')
  const usernameCheckSeq = useRef(0)
  const [discordConfig, setDiscordConfig] = useState({ enabled: false, loaded: false })
  const discordErrorText = discordErrorMessage(new URLSearchParams(loc.search).get('discord_error'))

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
    const url = `/api/auth/discord?return_to=${encodeURIComponent('/')}&remember=0&client_origin=${encodeURIComponent(origin)}`
    window.location.assign(resolveApiUrl(url))
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="ui-panel relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/30 hover:shadow-cyan-950/10">
        {/* Glow decoration */}
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="text-center mb-6">
          <h2 className="ui-title text-2xl font-bold tracking-tight text-white">สมัครสมาชิก</h2>
          <p className="ui-subtitle mt-2 text-sm text-white/55">สร้างบัญชีด้วยอีเมลและรหัสผ่าน</p>
        </div>

        {discordErrorText ? (
          <div className="ui-error p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/30 text-xs text-center text-cyan-300 mb-4">
            {discordErrorText}
          </div>
        ) : null}

        <form className="ui-form space-y-5" onSubmit={onSubmit}>
          <button
            type="button"
            onClick={onDiscordLogin}
            disabled={status === 'submitting' || !discordConfig.enabled}
            className="ui-btn-discord w-full flex items-center justify-center gap-2 py-3 font-bold transition-all duration-300 disabled:opacity-50 cursor-pointer"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="ui-btn-discord-icon w-5 h-5 fill-current"
            >
              <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.078.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.13 14.13 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.771 1.364 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .031-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.094 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z" />
            </svg>
            <span>{discordConfig.loaded && !discordConfig.enabled ? 'Discord login not configured' : 'Continue with Discord'}</span>
          </button>

          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/25 py-1">
            <span className="h-px flex-1 bg-white/5" />
            <span>or</span>
            <span className="h-px flex-1 bg-white/5" />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/55">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="my_username"
              className="ui-field focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
            />
            <div className="flex items-center gap-2 text-[11px]">
              {usernameValid ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_0_3px_rgba(74,222,128,0.2)]" /> : null}
              <span className={usernameValid ? 'text-emerald-200/90' : 'text-white/55'}>Username อย่างน้อย 6 ตัว (a-z, 0-9, ., -, _)</span>
            </div>
            {!usernameCharsetValid && usernameTrimmed.length > 0 ? <div className="text-[11px] text-cyan-200">ห้ามมีเว้นวรรคหรืออักขระพิเศษ ใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด, ขีด, ขีดล่าง</div> : null}
            {usernameCharsetValid && !usernameValid && usernameTrimmed.length > 0 ? <div className="text-[11px] text-cyan-200">Username ต้องมีอย่างน้อย 6 ตัวอักษร</div> : null}
            {usernameValid ? (
              <div className="flex items-center gap-2 text-[11px]">
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
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/55">
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              type="email"
              autoComplete="email"
              className="ui-field focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
            />
            {!emailValid && emailTrimmed.length > 0 ? <div className="text-[11px] text-cyan-200">กรุณากรอก Email ให้ถูกต้อง</div> : null}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/55">
              Password
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              className="ui-field focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
            />

            <div className="space-y-1 pt-1">
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
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="ui-btn-primary w-full py-3 font-bold transition-all duration-300 disabled:opacity-50 cursor-pointer"
          >
            {status === 'submitting' ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
          </button>

          <div className="space-y-2.5 pt-2">
            <label className="ui-label cursor-pointer select-none">
              <input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} />
              <span>
                ยอมรับ{' '}
                <Link className="ui-link text-cyan-400 hover:text-cyan-300" to="/tos" target="_blank" rel="noreferrer">
                  เงื่อนไขการใช้งาน
                </Link>
              </span>
            </label>
          </div>

          {status === 'error' ? (
            <div className="ui-error p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/30 text-xs text-center text-cyan-300">
              {errorText || 'สมัครไม่สำเร็จ (ตรวจสอบข้อมูลการสมัคร)'}
            </div>
          ) : null}
        </form>

        <div className="mt-6 pt-6 border-t border-white/5 text-center ui-help text-xs text-white/45">
          มีบัญชีแล้ว?{' '}
          <Link className="ui-link text-cyan-400 hover:text-cyan-300 font-semibold" to="/login">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  )
}
