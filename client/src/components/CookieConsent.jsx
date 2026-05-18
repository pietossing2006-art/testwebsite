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
      setStatus('error')
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-[120] mx-auto w-[min(960px,94vw)]">
      <div className="rounded-2xl border border-white/15 bg-[#0a0d13]/95 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.65)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-white">Cookie Preferences</div>
            <div className="mt-1 text-xs text-white/60">
              เราใช้คุกกี้ที่จำเป็นต่อการเข้าสู่ระบบ และขออนุญาตสำหรับคุกกี้วิเคราะห์/การตลาด/การปรับแต่ง
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            {expanded ? 'Hide details' : 'Customize'}
          </button>
        </div>

        {expanded ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <label className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/80">
              <div className="font-semibold">Essential</div>
              <div className="mt-1 text-white/50">จำเป็นต่อระบบล็อกอินและความปลอดภัย</div>
              <div className="mt-2 text-emerald-200">Always on</div>
            </label>
            <label className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/80">
              <div className="font-semibold">Analytics</div>
              <div className="mt-1 text-white/50">ช่วยวิเคราะห์การใช้งานเพื่อปรับปรุงระบบ</div>
              <input
                type="checkbox"
                checked={prefs.analytics}
                onChange={(e) => setPrefs((s) => ({ ...s, analytics: e.target.checked }))}
                className="mt-2"
              />
            </label>
            <label className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/80">
              <div className="font-semibold">Marketing</div>
              <div className="mt-1 text-white/50">ใช้เพื่อเสนอโปรโมชันและแคมเปญ</div>
              <input
                type="checkbox"
                checked={prefs.marketing}
                onChange={(e) => setPrefs((s) => ({ ...s, marketing: e.target.checked }))}
                className="mt-2"
              />
            </label>
            <label className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/80 md:col-span-3">
              <div className="font-semibold">Personalization</div>
              <div className="mt-1 text-white/50">อนุญาตการจำค่าบางอย่างในอุปกรณ์ เช่นการล็อกอินที่จดจำไว้</div>
              <input
                type="checkbox"
                checked={prefs.personalization}
                onChange={(e) => setPrefs((s) => ({ ...s, personalization: e.target.checked }))}
                className="mt-2"
              />
            </label>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => saveConsent({ analytics: false, marketing: false, personalization: false })}
            disabled={status === 'submitting'}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => saveConsent({ analytics: true, marketing: true, personalization: true })}
            disabled={status === 'submitting'}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => saveConsent(prefs)}
            disabled={status === 'submitting' || !dirty}
            className="rounded-xl bg-white/10 px-3 py-2 text-xs font-extrabold text-white hover:bg-white/15 disabled:opacity-60"
          >
            Save preferences
          </button>
          {status === 'error' ? <span className="text-xs text-red-200">บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง</span> : null}
        </div>
      </div>
    </div>
  )
}
