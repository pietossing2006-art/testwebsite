import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { fetchJson, getAuthToken, setAuthToken } from '../api.js'
import UserAvatar from './UserAvatar.jsx'
import { DEFAULT_UI_BRANDING_SETTINGS, normalizeUiBrandingSettings } from '../uiBrandingSettings.js'

function NavItem({ to, children }) {
  const [hover, setHover] = useState(false)
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `text-sm font-medium uppercase transition-colors cursor-pointer ${
          isActive ? 'text-cyan-400' : ''
        }`
      }
      style={{ color: hover ? '#22d3ee' : 'rgba(156,163,175,1)' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </NavLink>
  )
}

function isExternalUrl(url) {
  const txt = String(url ?? '').trim().toLowerCase()
  return txt.startsWith('http://') || txt.startsWith('https://')
}

export default function Navbar() {
  const nav = useNavigate()
  const loc = useLocation()
  const [sessionChecked, setSessionChecked] = useState(false)
  const [me, setMe] = useState(null)
  const [branding, setBranding] = useState(DEFAULT_UI_BRANDING_SETTINGS)
  const [open, setOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const menuRef = useRef(null)
  const mobileRef = useRef(null)
  const toggleRef = useRef(null)
  const user = me?.user
  const wallet = me?.wallet
  const isAuthed = Boolean(user)

  useEffect(() => {
    const onChange = () => {
      const nextHasToken = Boolean(getAuthToken())
      if (nextHasToken) {
        setSessionChecked(false)
      } else {
        setMe(null)
        setUnreadMsgCount(0)
        setSessionChecked(true)
      }
    }
    window.addEventListener('auth_token_changed', onChange)
    return () => window.removeEventListener('auth_token_changed', onChange)
  }, [])

  useEffect(() => {
    if (!isAuthed) return undefined
    let cancelled = false
    async function loadUnread() {
      try {
        const res = await fetchJson('/api/me/messages/unread-count')
        if (!cancelled) setUnreadMsgCount(res?.unread_count || 0)
      } catch { /* ignore */ }
    }
    loadUnread()
    const timer = setInterval(loadUnread, 30000)
    function onRefreshUnread() { loadUnread() }
    window.addEventListener('app_refresh', onRefreshUnread)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('app_refresh', onRefreshUnread)
    }
  }, [isAuthed])

  useEffect(() => {
    let cancelled = false
    async function loadBranding() {
      try {
        const data = await fetchJson('/api/ui-settings')
        if (!cancelled) setBranding(normalizeUiBrandingSettings(data?.branding_settings))
      } catch {
        if (!cancelled) setBranding(DEFAULT_UI_BRANDING_SETTINGS)
      }
    }

    loadBranding()
    function onRefreshBranding() {
      loadBranding()
    }
    window.addEventListener('app_refresh', onRefreshBranding)
    return () => {
      cancelled = true
      window.removeEventListener('app_refresh', onRefreshBranding)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchJson('/api/me')
        if (!cancelled) {
          setMe(data)
          setSessionChecked(true)
        }
      } catch (e) {
        if (!cancelled) {
          if (e?.status === 401) {
            setAuthToken(null)
            setMe(null)
          }
          setSessionChecked(true)
        }
      }
    }
    load()

    function onRefresh() {
      load()
    }
    window.addEventListener('app_refresh', onRefresh)
    return () => {
      cancelled = true
      window.removeEventListener('app_refresh', onRefresh)
    }
  }, [nav])

  // ── PWA push subscription for logged-in users ──
  useEffect(() => {
    if (!me?.id) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw-push.js')
        const vapidRes = await fetchJson('/api/vapid-public-key').catch(() => null)
        if (!vapidRes?.public_key) return
        const existing = await reg.pushManager.getSubscription()
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidRes.public_key,
        })
        await fetchJson('/api/me/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        })
      } catch {
        // Push setup is optional; navigation should stay quiet if the browser blocks it.
      }
    })()
  }, [me?.id])

  useEffect(() => {
    if (!open) return

    function onDoc(e) {
      const el = menuRef.current
      if (!el) return
      if (el.contains(e.target)) return
      setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!mobileOpen) return

    function onKey(e) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  useEffect(() => {
    // close mobile menu when route changes
    const id = setTimeout(() => {
      setMobileOpen(false)
    }, 0)
    return () => clearTimeout(id)
  }, [loc.pathname])

  const displayName = user?.display_name || user?.email?.split('@')?.[0] || 'user'
  const brandTitle = String(branding?.navbar_title || branding?.site_name || DEFAULT_UI_BRANDING_SETTINGS.navbar_title)
  const _brandInitials = String(brandTitle || DEFAULT_UI_BRANDING_SETTINGS.site_name)
    .replace(/[^a-zA-Z0-9ก-๙ ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase() || 'WS'
  const siteNameParts = brandTitle.split(' ')
  const siteNameFirst = siteNameParts[0] || 'VXPERS'
  const siteNameRest = siteNameParts.slice(1).join(' ') || 'STORE'
  const role = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : 'user'
  const isOwner = role === 'owner'
  const canAccessAdmin = role !== 'user'

  const navLinks = (Array.isArray(branding?.navbar_links) ? branding.navbar_links : [])
    .map((item) => ({
      to: String(item?.to || '/').trim() || '/',
      label: String(item?.label || '').trim(),
      auth_required: Boolean(item?.auth_required),
    }))
    .filter((item) => item.label && (!item.auth_required || isAuthed))

  const isAdminRoute = String(loc.pathname || '').startsWith('/admin')
  const _containerClass = isAdminRoute
    ? 'relative flex w-full items-center gap-3 px-4 py-3'
    : 'relative mx-auto flex w-full max-w-[min(1500px,92vw)] items-center gap-3 px-4 py-3 md:px-6'

  const [logoHover, setLogoHover] = useState(false)

  return (
    <header className="glass sticky top-0 z-50 border-b border-[#152b62] px-3 py-3 sm:px-4 md:px-12 md:py-4">
      <div className="mx-auto flex w-full max-w-[80rem] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4 lg:gap-12">
          <Link to="/" className="flex min-w-0 items-center gap-2 lg:min-w-max" onMouseEnter={() => setLogoHover(true)} onMouseLeave={() => setLogoHover(false)}>
            <div className="shrink-0" style={{ width: 'clamp(1.55rem, 7vw, 2rem)', height: 'clamp(1.55rem, 7vw, 2rem)', background: '#06b6d4', borderRadius: '0.125rem', transform: logoHover ? 'rotate(180deg)' : 'rotate(45deg)', transition: 'transform 0.7s' }} />
            <span className="block max-w-[calc(100vw-6rem)] overflow-hidden pr-1 text-base font-black uppercase italic tracking-tight text-ellipsis whitespace-nowrap neon-text sm:max-w-[58vw] sm:text-xl lg:max-w-none lg:overflow-visible">
              {siteNameFirst} <span style={{ color: '#22d3ee' }}>{siteNameRest}</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((item) => (
              isExternalUrl(item.to) ? (
                <a
                  key={`${item.to}:${item.label}`}
                  href={item.to}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium uppercase text-gray-400 hover:text-cyan-400 transition-colors"
                >
                  {item.label}
                </a>
              ) : (
                <NavItem key={`${item.to}:${item.label}`} to={item.to}>
                  {item.label}
                </NavItem>
              )
            ))}
          </nav>
        </div>

        {/* Search bar - user said to keep as is */}

        <button
          type="button"
          aria-expanded={mobileOpen}
          className="ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1b3470] bg-[#091637] text-white/85 lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          ref={toggleRef}
        >
          <span className="sr-only">Toggle menu</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div className="ml-auto hidden items-center gap-6 lg:flex" ref={menuRef}>
          {isAuthed ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="relative inline-flex h-10 items-center justify-center gap-3 rounded-xl border border-[#1b3470] bg-[#091637] px-3 text-sm font-medium text-white/90 hover:border-[#284a92] hover:bg-[#112455]"
              >
                {unreadMsgCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg">{unreadMsgCount > 99 ? '99+' : unreadMsgCount}</span>
                ) : null}
                <UserAvatar user={user} size={32} rounded="md" />
                <div className="hidden text-left md:block">
                  <div className="text-xs font-bold leading-tight text-white">{displayName}</div>
                  <div className="text-[11px] leading-tight text-white/50">ยอดคงเหลือ: {wallet?.balance ?? 0}</div>
                </div>
              </button>

              {open ? (
                <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-[#1b3470] bg-[#050d22] shadow-[0_26px_90px_rgba(0,0,0,0.78)]">
                  <div className="border-b border-white/10 p-3">
                    <div className="text-xs font-extrabold text-white">ยอดคงเหลือ</div>
                    <div className="mt-1 text-sm font-black tracking-wide text-cyan-300">{wallet?.balance ?? 0} พ้อย</div>
                  </div>
                  <div className="p-2">
                    <Link
                      to="/profile"
                      onClick={() => setOpen(false)}
                      className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                    >
                      โปรไฟล์ผู้ใช้
                    </Link>
                    <Link
                      to="/inbox"
                      onClick={() => setOpen(false)}
                      className="relative block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                    >
                      กล่องรับของ
                      {unreadMsgCount > 0 ? (
                        <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadMsgCount > 99 ? '99+' : unreadMsgCount}</span>
                      ) : null}
                    </Link>
                    <Link
                      to="/history/topups"
                      onClick={() => setOpen(false)}
                      className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                    >
                      ประวัติการเติมเงิน
                    </Link>
                    <Link
                      to="/history/purchases"
                      onClick={() => setOpen(false)}
                      className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                    >
                      ประวัติการซื้อของ
                    </Link>
                    <Link
                      to="/support"
                      onClick={() => setOpen(false)}
                      className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                    >
                      แจ้งปัญหา
                    </Link>
                    {(canAccessAdmin || isOwner) ? (
                      <div className="mt-1 border-t border-white/[0.07] pt-1">
                        <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">Admin</div>
                        {canAccessAdmin ? (
                          <Link
                            to="/admin-v2"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                          >
                            <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                            หลังบ้าน
                          </Link>
                        ) : null}
                        {isOwner ? (
                          <Link
                            to="/admin/storage"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                          >
                            <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
                            จัดการไฟล์
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        ;(async () => {
                          try {
                            await fetchJson('/api/auth/logout', { method: 'POST' })
                          } catch {
                            // ignore
                          }
                          setAuthToken(null)
                          window.location.assign('/')
                        })()
                      }}
                      className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : sessionChecked ? (
            <>
              <Link
                to="/login"
                className="ui-btn"
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                to="/register"
                className="ui-btn-primary"
              >
                สมัครสมาชิก
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div
        ref={mobileRef}
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 top-[64px] z-40 transition-all duration-250 ease-out lg:hidden ${
          mobileOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="absolute inset-0 z-10" aria-hidden />
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative z-20 mx-3 mt-1 max-h-[calc(100dvh-76px)] overflow-y-auto rounded-2xl border border-[#1b3470] bg-[#050d22] shadow-[0_24px_80px_rgba(0,0,0,0.74)] sm:mx-5"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="text-xs font-semibold text-white/50">เมนู</span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#1b3470] bg-[#091637] text-white/70 hover:bg-[#112455]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18m0-12 12 12" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col divide-y divide-white/10">
            {isAuthed ? (
              <div className="px-4 py-3">
                <div className="flex items-center gap-3 rounded-2xl border border-[#1b3470] bg-[#091637] p-3">
                  <UserAvatar user={user} size={40} rounded="md" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-white">{displayName}</div>
                    <div className="mt-0.5 text-xs font-bold text-cyan-100/70">ยอดคงเหลือ: {wallet?.balance ?? 0}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {navLinks.map((item) => (
              isExternalUrl(item.to) ? (
                <a
                  key={`${item.to}:${item.label}`}
                  href={item.to}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/5"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              ) : (
                <NavLink
                  key={`${item.to}:${item.label}`}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-4 py-3 text-sm font-semibold transition ${
                      isActive ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5'
                    }`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </NavLink>
              )
            ))}
            {isAuthed ? (
              <div className="grid gap-2 px-4 py-3">
                <Link to="/profile" onClick={() => setMobileOpen(false)} className="ui-btn h-11 w-full justify-center">โปรไฟล์</Link>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/inbox" onClick={() => setMobileOpen(false)} className="ui-btn h-11 justify-center">
                    กล่องรับของ
                    {unreadMsgCount > 0 ? <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadMsgCount > 99 ? '99+' : unreadMsgCount}</span> : null}
                  </Link>
                  <Link to="/topup/angpao" onClick={() => setMobileOpen(false)} className="ui-btn-primary h-11 justify-center">เติมเงิน</Link>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/history/purchases" onClick={() => setMobileOpen(false)} className="ui-btn h-11 justify-center">ประวัติซื้อ</Link>
                  <Link to="/history/topups" onClick={() => setMobileOpen(false)} className="ui-btn h-11 justify-center">ประวัติเติม</Link>
                </div>
                {(canAccessAdmin || isOwner) ? (
                  <div className="grid gap-2 border-t border-white/[0.07] pt-3">
                    <div className="px-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">Admin</div>
                    {canAccessAdmin ? (
                      <Link to="/admin-v3" onClick={() => setMobileOpen(false)} className="ui-btn-primary h-11 w-full justify-center">
                        หลังบ้าน
                      </Link>
                    ) : null}
                    {isOwner ? (
                      <Link to="/admin/storage" onClick={() => setMobileOpen(false)} className="ui-btn h-11 w-full justify-center">
                        จัดการไฟล์
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid gap-2 border-t border-white/[0.07] pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false)
                      ;(async () => {
                        try {
                          await fetchJson('/api/auth/logout', { method: 'POST' })
                        } catch {
                          // ignore
                        }
                        setAuthToken(null)
                        window.location.assign('/')
                      })()
                    }}
                    className="ui-btn h-11 w-full justify-center text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              </div>
            ) : null}
            {sessionChecked && !isAuthed ? (
              <div className="flex items-center gap-2 px-4 py-3">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="ui-btn flex-1 h-10 px-3"
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="ui-btn-primary flex-1 h-10 px-3"
                >
                  สมัครสมาชิก
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
