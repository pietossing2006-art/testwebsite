import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchJson } from '../api.js'

export default function DiscordInvite() {
  const [bot, setBot] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const data = await fetchJson('/api/discord/bot')
        if (!cancelled) {
          setBot(data?.bot || null)
          setStatus('ready')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const inviteUrl = bot?.invite_url || ''
  const configured = Boolean(bot?.configured && inviteUrl)

  return (
    <div className="mx-auto max-w-3xl fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong p-6 sm:p-8">
        <div className="absolute inset-0 scanline opacity-30" />
        <div className="absolute inset-0 grid-pattern opacity-35" />
        <div className="relative">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/55">Discord Bot</div>
          <h1 className="mt-3 text-4xl font-black text-white sm:text-5xl">VxperS Store Discord</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/55">
            เชิญบอทเข้าเซิร์ฟเวอร์เพื่อใช้คำสั่งบัญชีเว็บ เช่นตรวจโปรไฟล์ ออเดอร์ล่าสุด และลิงก์บัญชี Discord กับเว็บ
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {configured ? (
              <a href={inviteUrl} target="_blank" rel="noreferrer" className="ui-btn-primary h-12 px-6 text-sm font-black">
                Invite Discord Bot
              </a>
            ) : (
              <button type="button" disabled className="ui-btn h-12 px-6 text-sm font-black opacity-60">
                Invite not configured
              </button>
            )}
            <Link to="/login" className="ui-btn h-12 px-6 text-sm font-black">Login with Discord</Link>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
              <div className="text-sm font-black text-white">/link</div>
              <div className="mt-1 text-xs font-semibold text-white/45">ผูกบัญชีเว็บกับ Discord</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
              <div className="text-sm font-black text-white">/profile</div>
              <div className="mt-1 text-xs font-semibold text-white/45">ดูข้อมูลบัญชีและพ้อยท์</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
              <div className="text-sm font-black text-white">/orders</div>
              <div className="mt-1 text-xs font-semibold text-white/45">ดูออเดอร์ล่าสุด</div>
            </div>
          </div>

          {status === 'error' ? <div className="mt-5 text-xs font-bold text-cyan-200">โหลดข้อมูล Discord bot ไม่สำเร็จ</div> : null}
          {status === 'ready' && !configured ? <div className="mt-5 rounded-2xl border border-yellow-300/15 bg-yellow-400/10 p-3 text-xs font-bold text-yellow-100/80">ยังไม่ได้ตั้งค่า invite URL หรือ Client ID บน server</div> : null}
        </div>
      </section>
    </div>
  )
}
