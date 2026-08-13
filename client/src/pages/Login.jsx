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

export default function Login() {
  const loc = useLocation()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [tos, setTos] = useState(false)
  const [remember, setRemember] = useState(true)
  const [status, setStatus] = useState('idle')
  const [errorText, setErrorText] = useState('')
  const [discordConfig, setDiscordConfig] = useState({ enabled: false, loaded: false })
  const discordErrorText = discordErrorMessage(new URLSearchParams(loc.search).get('discord_error'))

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
      const data = await fetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password, remember }),
      })
      setAuthToken(data?.token ?? null)
      setStatus('success')
      window.location.assign('/')
    } catch (e) {
      setStatus('error')
      const code = String(e?.data?.error || '')
      if (code === 'banned') setErrorText('บัญชีนี้ถูกระงับการใช้งาน')
      else setErrorText('ชื่อผู้ใช้หรือรหัสผ่านผิด')
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
    const url = `/api/auth/discord?return_to=${encodeURIComponent('/')}&remember=${remember ? '1' : '0'}&client_origin=${encodeURIComponent(origin)}`
    window.location.assign(resolveApiUrl(url))
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="ui-panel relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/30 hover:shadow-cyan-950/10">
        {/* Glow decoration */}
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="text-center mb-6">
          <h2 className="ui-title text-2xl font-bold tracking-tight text-white">เข้าสู่ระบบ</h2>
          <p className="ui-subtitle mt-2 text-sm text-white/55">เข้าสู่ระบบเพื่อจัดการบัญชีของคุณ</p>
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
              Email หรือ Username
            </label>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="example@email.com"
              className="ui-field focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/55">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline font-semibold">
                ลืมรหัสผ่าน?
              </Link>
            </div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              className="ui-field focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="ui-btn-primary w-full py-3 font-bold transition-all duration-300 disabled:opacity-50 cursor-pointer"
          >
            {status === 'submitting' ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
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

            <label className="ui-label cursor-pointer select-none">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>จำฉันไว้ (Remember me)</span>
            </label>
          </div>

          {status === 'error' ? (
            <div className="ui-error p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/30 text-xs text-center text-cyan-300">
              {errorText || 'ชื่อผู้ใช้หรือรหัสผ่านผิด'}
            </div>
          ) : null}
        </form>

        <div className="mt-6 pt-6 border-t border-white/5 text-center ui-help text-xs text-white/45">
          ยังไม่มีบัญชี?{' '}
          <Link className="ui-link text-cyan-400 hover:text-cyan-300 font-semibold" to="/register">
            สมัครสมาชิก
          </Link>
        </div>
      </div>
    </div>
  )
}
