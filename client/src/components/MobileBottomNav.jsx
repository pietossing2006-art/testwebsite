import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { fetchJson, getAuthToken } from '../api.js'

const NAV_ITEMS = [
  {
    to: '/',
    label: 'หน้าแรก',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path d="M9 22V12h6v10" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 01-.53 1.28h-1.44v7.44a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-5.25h-3v5.25a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-7.44H2.81a.75.75 0 01-.53-1.28l8.69-8.69z" />
      </svg>
    ),
    exact: true,
  },
  {
    to: '/categories',
    label: 'หมวดหมู่',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    matchPaths: ['/categories', '/category/'],
  },
  {
    to: '/topup/angpao',
    label: 'เติมเงิน',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M2 10h2M20 10h2M2 14h2M20 14h2" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M2 8a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8zm10 7a3 3 0 100-6 3 3 0 000 6z" fillRule="evenodd" clipRule="evenodd" />
      </svg>
    ),
    matchPaths: ['/topup'],
    requiresAuth: true,
  },
  {
    to: '/inbox',
    label: 'กล่องรับของ',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
        <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
      </svg>
    ),
    hasBadge: true,
    requiresAuth: true,
  },
  {
    to: '/profile',
    label: 'โปรไฟล์',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path fillRule="evenodd" clipRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" />
      </svg>
    ),
    requiresAuth: true,
    guestTo: '/login',
  },
]

function isPathMatch(pathname, item) {
  if (item.exact) return pathname === item.to
  if (item.matchPaths) return item.matchPaths.some((p) => pathname === p || pathname.startsWith(p))
  return pathname === item.to || pathname.startsWith(item.to + '/')
}

export default function MobileBottomNav() {
  const loc = useLocation()
  const [isAuthed, setIsAuthed] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        await fetchJson('/api/me')
        if (!cancelled) setIsAuthed(true)
      } catch {
        if (!cancelled) setIsAuthed(false)
      }
    }
    if (getAuthToken()) check()
    else setIsAuthed(false)

    function onTokenChange() {
      if (getAuthToken()) check()
      else { setIsAuthed(false); setUnreadCount(0) }
    }
    window.addEventListener('auth_token_changed', onTokenChange)
    return () => { cancelled = true; window.removeEventListener('auth_token_changed', onTokenChange) }
  }, [])

  useEffect(() => {
    if (!isAuthed) return undefined
    let cancelled = false
    async function load() {
      try {
        const res = await fetchJson('/api/me/messages/unread-count')
        if (!cancelled) setUnreadCount(res?.unread_count || 0)
      } catch { /* ignore */ }
    }
    load()
    const timer = setInterval(load, 30000)
    function onRefresh() { load() }
    window.addEventListener('app_refresh', onRefresh)
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('app_refresh', onRefresh) }
  }, [isAuthed])

  const isAdminRoute = loc.pathname.startsWith('/admin')
  const isAuthRoute = ['/login', '/register', '/forgot-password', '/reset-password'].includes(loc.pathname)
  const isTrackerRoute = loc.pathname.startsWith('/tracker')
  if (isAdminRoute || isAuthRoute || isTrackerRoute) return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-sky-200/80 bg-white/95 backdrop-blur-xl shadow-[0_-4px_20px_rgba(2,132,199,0.06)] lg:hidden">
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active = isPathMatch(loc.pathname, item)
          const needsAuth = item.requiresAuth && !isAuthed
          const href = needsAuth ? (item.guestTo || '/login') : item.to
          const badge = item.hasBadge && unreadCount > 0

          return (
            <NavLink
              key={item.to}
              to={href}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="relative">
                <div className={`transition-all duration-200 ${active ? 'text-sky-600 scale-110' : 'text-slate-400'}`}>
                  {active ? item.iconActive : item.icon}
                </div>
                {badge ? (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white shadow-md ring-2 ring-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </div>
              <span className={`text-[10px] font-bold leading-tight transition-colors ${active ? 'text-sky-600' : 'text-slate-400'}`}>
                {item.label}
              </span>
              {active ? (
                <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-sky-500" />
              ) : null}
            </NavLink>
          )
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
