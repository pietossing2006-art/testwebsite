import { useEffect, useMemo, useState } from 'react'
import { fetchJson, getCookieConsent, setCookieConsent } from '../api.js'

function normalize(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  return {
    essential: true,
    analytics: Boolean(data.analytics),
    marketing: Boolean(data.marketing),
    personalization: Boolean(data.personalization),
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState('idle')
  const [prefs, setPrefs] = useState(() => normalize(null))

  const dirty = useMemo(() => {
    const local = getCookieConsent()
    if (!local) return true
    return JSON.stringify(local) !== JSON.stringify(prefs)
  }, [prefs])

  useEffect(() => {
    let cancelled = false

    async function loadConsent() {
      try {
        const local = getCookieConsent()
        if (local) {
          if (!cancelled) {
            setPrefs(normalize(local))
            setVisible(false)
          }
          return
        }
        const data = await fetchJson('/api/cookie-consent')
        const serverConsent = data?.consent ? normalize(data.consent) : null
        if (!cancelled) {
          if (serverConsent) {
            setCookieConsent(serverConsent)
            setPrefs(serverConsent)
            setVisible(false)
          } else {
            setVisible(true)
          }
        }
      } catch {
        if (!cancelled) setVisible(true)
      }
    }

    loadConsent()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function openSettings() {
      setVisible(true)
      setExpanded(true)
    }
    window.addEventListener('open_cookie_settings', openSettings)
    return () => window.removeEventListener('open_cookie_settings', openSettings)
  }, [])

  async function saveConsent(nextConsent) {
    const normalized = setCookieConsent(normalize(nextConsent))
    setPrefs(normalized)
    setStatus('submitting')
    try {
      await fetchJson('/api/cookie-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: normalized }),
      })
      setStatus('success')
      setVisible(false)
      setTimeout(() => setStatus('idle'), 800)
    } catch {
      // Even if network fails, localStorage is already updated
      setStatus('error')
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-[120] mx-auto w-[min(960px,94vw)] transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
      <div className="rounded-2xl border border-cyan-500/20 bg-[#080d1a]/95 p-4 md:p-5 shadow-[0_20px_80px_rgba(0,0,0,0.8)] backdrop-blur-xl ring-1 ring-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2">
              <span className="text-base">🍪</span>
              <span className="text-sm font-black tracking-wide text-white">Cookie Preferences / การตั้งค่าคุกกี้</span>
            </div>
            <div className="mt-1 text-xs leading-relaxed text-slate-300">
              เว็บไซต์นี้ใช้คุกกี้ที่จำเป็นต่อการเข้าสู่ระบบ และขอความยินยอมสำหรับคุกกี้วิเคราะห์ การตลาด และการปรับแต่งประสบการณ์ผู้ใช้
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 transition-colors"
          >
            {expanded ? 'ซ่อนรายละเอียด (Hide details)' : 'ปรับแต่ง (Customize)'}
          </button>
        </div>

        {expanded ? (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 md:grid-cols-4 border-t border-white/10 pt-4">
            <label className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/90 flex flex-col justify-between">
              <div>
                <div className="font-bold text-white flex items-center justify-between">
                  <span>Essential</span>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">จำเป็น</span>
                </div>
                <div className="mt-1.5 text-[11px] leading-relaxed text-slate-400">จำเป็นต่อระบบล็อกอินและความปลอดภัย</div>
              </div>
              <div className="mt-2 text-[11px] font-semibold text-emerald-400">เปิดตลอดเวลา (Always on)</div>
            </label>
            <label className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/90 flex flex-col justify-between cursor-pointer hover:bg-white/[0.06] transition-colors">
              <div>
                <div className="font-bold text-white">Analytics</div>
                <div className="mt-1.5 text-[11px] leading-relaxed text-slate-400">ช่วยวิเคราะห์การใช้งานเพื่อปรับปรุงระบบ</div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.analytics}
                  onChange={(e) => setPrefs((s) => ({ ...s, analytics: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/30 accent-cyan-500"
                />
                <span className="text-[11px] text-slate-300">{prefs.analytics ? 'เปิดใช้งาน' : 'ปิด'}</span>
              </div>
            </label>
            <label className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/90 flex flex-col justify-between cursor-pointer hover:bg-white/[0.06] transition-colors">
              <div>
                <div className="font-bold text-white">Marketing</div>
                <div className="mt-1.5 text-[11px] leading-relaxed text-slate-400">ใช้เพื่อเสนอโปรโมชันและแคมเปญ</div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.marketing}
                  onChange={(e) => setPrefs((s) => ({ ...s, marketing: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/30 accent-cyan-500"
                />
                <span className="text-[11px] text-slate-300">{prefs.marketing ? 'เปิดใช้งาน' : 'ปิด'}</span>
              </div>
            </label>
            <label className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/90 flex flex-col justify-between cursor-pointer hover:bg-white/[0.06] transition-colors">
              <div>
                <div className="font-bold text-white">Personalization</div>
                <div className="mt-1.5 text-[11px] leading-relaxed text-slate-400">จดจำการล็อกอินและการตั้งค่าอุปกรณ์</div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.personalization}
                  onChange={(e) => setPrefs((s) => ({ ...s, personalization: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/30 accent-cyan-500"
                />
                <span className="text-[11px] text-slate-300">{prefs.personalization ? 'เปิดใช้งาน' : 'ปิด'}</span>
              </div>
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => saveConsent({ analytics: false, marketing: false, personalization: false })}
              disabled={status === 'submitting'}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
            >
              ปฏิเสธทั้งหมด (Decline)
            </button>
            {expanded ? (
              <button
                type="button"
                onClick={() => saveConsent(prefs)}
                disabled={status === 'submitting' || !dirty}
                className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
              >
                บันทึกการตั้งค่า (Save preferences)
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => saveConsent({ analytics: true, marketing: true, personalization: true })}
              disabled={status === 'submitting'}
              className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2 text-xs font-black text-white hover:from-sky-400 hover:to-cyan-400 shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50"
            >
              {status === 'submitting' ? 'กำลังบันทึก...' : 'ยอมรับทั้งหมด (Accept all)'}
            </button>
          </div>
        </div>

        {status === 'error' ? (
          <div className="mt-2 text-xs font-bold text-rose-300">
            บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง
          </div>
        ) : null}
      </div>
    </div>
  )
}

