import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { gsap } from 'gsap'
import { fetchJson } from '../api.js'
import { applyUiBrandingToDocument, DEFAULT_UI_BRANDING_SETTINGS, normalizeUiBrandingSettings } from '../uiBrandingSettings.js'
import { applyRouteSeo } from '../seo.js'
import Navbar from './Navbar.jsx'
import CookieConsent from './CookieConsent.jsx'
import AnnIcon from './AnnIcon.jsx'
import AnnRichText from './AnnRichText.jsx'

const ANIM_TARGETS = [
  '.page-fade',
  '.fade-in-up',
  '.motion-stagger',
  '.motion-card',
  '.motion-price',
  '.motion-tab',
  '.motion-float',
  '.popup-overlay-animate',
  '.popup-panel-animate',
  '.popup-media-animate',
  '.hero-title-glow',
  '.hero-status-dot-pulse',
].join(', ')
const ANNOUNCEMENT_DEFAULT_BG = 'linear-gradient(135deg, rgba(8,145,178,0.92) 0%, rgba(14,116,144,0.88) 48%, rgba(15,23,42,0.95) 100%)'
const ANNOUNCEMENT_DISMISS_MS = 86400000

function getAnnouncementKey(ann) {
  return String(ann?.id ?? ann?.text ?? '').trim()
}

function getAnnouncementDismissExpiry() {
  return Date.now() + ANNOUNCEMENT_DISMISS_MS
}

// Footer hover helper components
function SocialIcon({ link }) {
  const [hover, setHover] = useState(false)
  return (
    <a href={link.url || '#'} target="_blank" rel="noreferrer"
      style={{ width:'2rem', height:'2rem', borderRadius:'9999px', background: hover ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:700, color: hover ? '#22d3ee' : 'rgba(255,255,255,0.5)', textDecoration:'none', transition:'all 0.2s', cursor:'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      {String(link.platform).slice(0,2).toUpperCase()}
    </a>
  )
}

function FooterLink({ to, children }) {
  const [hover, setHover] = useState(false)
  return (
    <Link to={to}
      style={{ fontSize:'0.875rem', color: hover ? 'white' : 'rgba(255,255,255,0.45)', textDecoration:'none', display:'block', transition:'color 0.2s', cursor:'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      {children}
    </Link>
  )
}

function FooterA({ href, children }) {
  const [hover, setHover] = useState(false)
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ fontSize:'0.875rem', color: hover ? 'white' : 'rgba(255,255,255,0.45)', textDecoration:'none', display:'block', transition:'color 0.2s', cursor:'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      {children}
    </a>
  )
}

export default function Layout() {
  const loc = useLocation()
  const rootRef = useRef(null)
  const [routeProgress, setRouteProgress] = useState(0)
  const [routeLoading, setRouteLoading] = useState(false)
  const [branding, setBranding] = useState(DEFAULT_UI_BRANDING_SETTINGS)
  const [siteSettings, setSiteSettings] = useState(null)
  const [announcements, setAnnouncements] = useState([])
  const [annClosedSet, setAnnClosedSet] = useState(new Set())
  const [annDismissedSet, setAnnDismissedSet] = useState(() => {
    try {
      const raw = localStorage.getItem('ann_dismissed')
      if (!raw) return new Set()
      const parsed = JSON.parse(raw)
      const now = Date.now()
      const valid = Object.entries(parsed).filter(([, exp]) => exp > now)
      if (valid.length !== Object.keys(parsed).length) localStorage.setItem('ann_dismissed', JSON.stringify(Object.fromEntries(valid)))
      return new Set(valid.map(([k]) => k))
    } catch { return new Set() }
  })
  const dismissAnn = (ann) => {
    const key = typeof ann === 'string' ? ann.trim() : getAnnouncementKey(ann)
    if (!key) return
    setAnnDismissedSet((prev) => new Set(prev).add(key))
    try {
      const raw = localStorage.getItem('ann_dismissed')
      const obj = raw ? JSON.parse(raw) : {}
      obj[key] = getAnnouncementDismissExpiry()
      localStorage.setItem('ann_dismissed', JSON.stringify(obj))
    } catch { /* noop */ }
  }
  const closeAnn = (ann) => {
    const key = typeof ann === 'string' ? ann.trim() : getAnnouncementKey(ann)
    if (!key) return
    setAnnClosedSet((prev) => new Set(prev).add(key))
  }
  const firstRoutePaintRef = useRef(true)
  const isAdminRoute = String(loc.pathname || '').startsWith('/admin')
  const isAuthRoute = ['/login', '/register'].includes(String(loc.pathname || '').trim())

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      try {
        const data = await fetchJson('/api/ui-settings')
        const next = normalizeUiBrandingSettings(data?.branding_settings)
        if (!cancelled) {
          setBranding(next)
          setSiteSettings(data?.site_settings && typeof data.site_settings === 'object' ? data.site_settings : null)
        }
        applyUiBrandingToDocument(next)
      } catch {
        if (!cancelled) setBranding(DEFAULT_UI_BRANDING_SETTINGS)
        applyUiBrandingToDocument(DEFAULT_UI_BRANDING_SETTINGS)
      }
    }

    loadSettings()
    function onRefresh() {
      loadSettings()
    }
    window.addEventListener('app_refresh', onRefresh)
    return () => {
      cancelled = true
      window.removeEventListener('app_refresh', onRefresh)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadAnnouncements() {
      try {
        const data = await fetchJson('/api/announcements')
        if (!cancelled) setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : [])
      } catch { if (!cancelled) setAnnouncements([]) }
    }
    loadAnnouncements()
    function onRefresh() { loadAnnouncements() }
    window.addEventListener('app_refresh', onRefresh)
    return () => { cancelled = true; window.removeEventListener('app_refresh', onRefresh) }
  }, [])

  useEffect(() => {
    if (firstRoutePaintRef.current) {
      firstRoutePaintRef.current = false
      return
    }

    let cancelled = false
    const start = setTimeout(() => {
      if (cancelled) return
      setRouteLoading(true)
      setRouteProgress(14)
    }, 0)

    const t1 = setTimeout(() => {
      if (!cancelled) setRouteProgress(42)
    }, 80)
    const t2 = setTimeout(() => {
      if (!cancelled) setRouteProgress(68)
    }, 170)
    const t3 = setTimeout(() => {
      if (!cancelled) setRouteProgress(84)
    }, 280)
    const done = setTimeout(() => {
      if (cancelled) return
      setRouteProgress(100)
      setTimeout(() => {
        if (cancelled) return
        setRouteLoading(false)
        setRouteProgress(0)
      }, 220)
    }, 430)

    return () => {
      cancelled = true
      clearTimeout(start)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(done)
    }
  }, [loc.pathname, loc.search])

  useEffect(() => {
    applyRouteSeo(loc.pathname, branding?.site_name, siteSettings)
  }, [loc.pathname, branding?.site_name, siteSettings])

  useEffect(() => {
    if (typeof window === 'undefined' || !rootRef.current) return undefined

    const activeTweens = new Set()
    const mm = gsap.matchMedia()

    function resolveDelay(el) {
      if (el.classList.contains('fade-in-delay-3')) return 0.24
      if (el.classList.contains('fade-in-delay-2')) return 0.16
      if (el.classList.contains('fade-in-delay-1')) return 0.08
      return 0
    }

    function markAnimated(el) {
      el.dataset.gsapAnimated = '1'
    }

    function hasMotionBehavior(el) {
      return el.classList.contains('motion-stagger')
        || el.classList.contains('motion-card')
        || el.classList.contains('motion-price')
        || el.classList.contains('motion-tab')
        || el.classList.contains('motion-float')
    }

    function getStaggerChildren(el) {
      return Array.from(el.children).filter((child) => child instanceof HTMLElement)
    }

    function animateDesktop(el) {
      if (!el || el.dataset.gsapAnimated === '1') return

      if (el.classList.contains('page-fade')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.44, ease: 'power3.out' })
        return
      }

      if (el.classList.contains('fade-in-up') && !hasMotionBehavior(el)) {
        markAnimated(el)
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 18 },
          { autoAlpha: 1, y: 0, duration: 0.54, ease: 'power3.out', delay: resolveDelay(el) },
        )
        return
      }

      if (el.classList.contains('motion-stagger')) {
        markAnimated(el)
        const children = getStaggerChildren(el)
        children.forEach(markAnimated)
        if (children.length) {
          gsap.fromTo(
            children,
            { autoAlpha: 0, y: 20, scale: 0.985 },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.52,
              ease: 'power3.out',
              stagger: { each: 0.055, from: 'start' },
              delay: resolveDelay(el),
            },
          )
        }
        return
      }

      if (el.classList.contains('motion-card')) {
        markAnimated(el)
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 18, scale: 0.985 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.46, ease: 'power3.out', delay: resolveDelay(el) },
        )
        return
      }

      if (el.classList.contains('motion-price')) {
        markAnimated(el)
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 8, scale: 0.94 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.55)', delay: resolveDelay(el) },
        )
        return
      }

      if (el.classList.contains('motion-tab')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power2.out', delay: resolveDelay(el) })
        return
      }

      if (el.classList.contains('motion-float')) {
        markAnimated(el)
        const tween = gsap.to(el, { y: -6, duration: 2.8, ease: 'sine.inOut', repeat: -1, yoyo: true })
        activeTweens.add(tween)
        return
      }

      if (el.classList.contains('popup-overlay-animate')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: 'power1.out' })
        return
      }

      if (el.classList.contains('popup-panel-animate')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0, y: 10, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.24, ease: 'power3.out' })
        return
      }

      if (el.classList.contains('popup-media-animate')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0, y: 10, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.24, ease: 'power3.out' })
        return
      }

      if (el.classList.contains('hero-title-glow')) {
        markAnimated(el)
        el.classList.add('hero-title-glow--animated')
        return
      }

      if (el.classList.contains('hero-status-dot-pulse')) {
        markAnimated(el)
        el.classList.add('hero-status-dot-pulse--animated')
      }
    }

    function animateMobile(el) {
      if (!el || el.dataset.gsapAnimated === '1') return

      if (el.classList.contains('page-fade')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out' })
        return
      }

      if (el.classList.contains('fade-in-up') && !hasMotionBehavior(el)) {
        markAnimated(el)
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 12 },
          { autoAlpha: 1, y: 0, duration: 0.34, ease: 'power2.out', delay: resolveDelay(el) },
        )
        return
      }

      if (el.classList.contains('motion-stagger')) {
        markAnimated(el)
        const children = getStaggerChildren(el)
        children.forEach(markAnimated)
        if (children.length) {
          gsap.fromTo(
            children,
            { autoAlpha: 0, y: 12, scale: 0.992 },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.3,
              ease: 'power2.out',
              stagger: { each: 0.035, from: 'start' },
              delay: resolveDelay(el),
            },
          )
        }
        return
      }

      if (el.classList.contains('motion-card')) {
        markAnimated(el)
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 10, scale: 0.992 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out', delay: resolveDelay(el) },
        )
        return
      }

      if (el.classList.contains('motion-price')) {
        markAnimated(el)
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 6, scale: 0.96 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out', delay: resolveDelay(el) },
        )
        return
      }

      if (el.classList.contains('motion-tab')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out', delay: resolveDelay(el) })
        return
      }

      if (el.classList.contains('motion-float')) {
        markAnimated(el)
        return
      }

      if (el.classList.contains('popup-overlay-animate')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.14, ease: 'power1.out' })
        return
      }

      if (el.classList.contains('popup-panel-animate')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0, y: 8, scale: 0.992 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, ease: 'power2.out' })
        return
      }

      if (el.classList.contains('popup-media-animate')) {
        markAnimated(el)
        gsap.fromTo(el, { autoAlpha: 0, y: 8, scale: 0.994 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, ease: 'power2.out' })
        return
      }

      if (el.classList.contains('hero-title-glow')) {
        markAnimated(el)
        return
      }

      if (el.classList.contains('hero-status-dot-pulse')) {
        markAnimated(el)
      }
    }

    function scanWithin(node, selector, animator) {
      if (!(node instanceof Element)) return
      if (node.matches(selector)) animator(node)
      const list = node.querySelectorAll(selector)
      for (const item of list) {
        animator(item)
      }
    }

    function createThrottledObserver(animator) {
      let rafId = 0
      let pendingNodes = []
      const observer = new MutationObserver((records) => {
        for (const rec of records) {
          for (const added of rec.addedNodes) {
            if (added instanceof Element) pendingNodes.push(added)
          }
        }
        if (pendingNodes.length && !rafId) {
          rafId = requestAnimationFrame(() => {
            const batch = pendingNodes
            pendingNodes = []
            rafId = 0
            for (const node of batch) scanWithin(node, ANIM_TARGETS, animator)
          })
        }
      })
      observer.observe(rootRef.current, { childList: true, subtree: true })
      return () => {
        observer.disconnect()
        if (rafId) cancelAnimationFrame(rafId)
        for (const tween of activeTweens) tween.kill()
        activeTweens.clear()
      }
    }

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      scanWithin(rootRef.current, ANIM_TARGETS, animateDesktop)
      return createThrottledObserver(animateDesktop)
    })

    mm.add('(max-width: 1023px) and (prefers-reduced-motion: no-preference)', () => {
      scanWithin(rootRef.current, ANIM_TARGETS, animateMobile)
      return createThrottledObserver(animateMobile)
    })

    return () => {
      mm.revert()
    }
  }, [])

  if (isAdminRoute) {
    return (
      <div ref={rootRef} className="relative min-h-screen overflow-hidden bg-[#04070d] text-white">
        <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(80%_70%_at_12%_-6%,rgba(56,189,248,0.16),transparent_60%),radial-gradient(70%_70%_at_100%_0%,rgba(59,130,246,0.16),transparent_56%),linear-gradient(180deg,#070d18_0%,#04070d_54%,#03060b_100%)]" />
        <div
          aria-hidden
          className={`pointer-events-none fixed left-0 right-0 top-0 z-[70] h-[3px] transition-opacity duration-200 ${routeLoading ? 'opacity-100' : 'opacity-0'}`}
        >
          <div
            className="h-full rounded-r-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 shadow-[0_0_24px_rgba(59,130,246,0.65)] transition-[width] duration-250 ease-out"
            style={{ width: `${routeProgress}%` }}
          />
        </div>
        <main className="relative z-10 min-h-screen w-full p-0">
          <div key={loc.pathname} className="page-fade min-h-screen">
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative min-h-screen flex flex-col">
      <div
        aria-hidden
        className={`pointer-events-none fixed left-0 right-0 top-0 z-[70] h-[3px] transition-opacity duration-200 ${routeLoading ? 'opacity-100' : 'opacity-0'}`}
      >
        <div
          className="h-full rounded-r-full bg-gradient-to-r from-[#22d3ee] via-[#06b6d4] to-[#67e8f9] shadow-[0_0_22px_rgba(34,211,238,0.72)] transition-[width] duration-250 ease-out"
          style={{ width: `${routeProgress}%` }}
        />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_12%_-8%,rgba(255,255,255,0.06),transparent_38%),radial-gradient(circle_at_88%_0%,rgba(163,23,23,0.12),transparent_34%)]" />
      <div aria-hidden className="snow-fall-overlay pointer-events-none fixed inset-0 z-0" />
      <div aria-hidden className="crt-overlay" />
      <Navbar />
      {(() => {
        if (isAdminRoute || isAuthRoute || !announcements.length) return null
        const visible = announcements.filter((a) => {
          const key = getAnnouncementKey(a)
          return a.text && !annDismissedSet.has(key) && !annClosedSet.has(key) && !annDismissedSet.has(a.text) && !annClosedSet.has(a.text)
        })
        if (!visible.length) return null
        return (
          <div className="ann-tray">
            {visible.map((ann, idx) => (
              <div key={getAnnouncementKey(ann) || ann.text} className="ann-card ann-slide-in" style={{ background: ann.bg || ANNOUNCEMENT_DEFAULT_BG, animationDelay: `${idx * 90}ms` }}>
                <span className="ann-card__glow" aria-hidden />
                <div className="ann-card__icon">
                  <AnnIcon icon={ann.icon} className="h-4 w-4" />
                </div>
                <div className="ann-card__body">
                  {ann.title ? <div className="ann-card__title">{ann.title}</div> : null}
                  <AnnRichText text={ann.text} className="ann-card__text" />
                </div>
                {ann.link ? (
                  (() => {
                    const isExt = ann.link.startsWith('http://') || ann.link.startsWith('https://')
                    return isExt
                      ? <a href={ann.link} target="_blank" rel="noreferrer" className="ann-card__link">เปิดดู</a>
                      : <Link to={ann.link} className="ann-card__link">เปิดดู</Link>
                  })()
                ) : null}
                <button type="button" onClick={() => dismissAnn(ann)} className="ann-card__dismiss" aria-label="ไม่แสดงอีกวันนี้" title="ไม่แสดงอีก 24 ชม.">
                  ไม่แสดงอีก
                </button>
                <button type="button" onClick={() => closeAnn(ann)} className="ann-card__close" aria-label="ปิด" title="ปิด (จะกลับมาเมื่อรีเฟรช)">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )
      })()}
      <main className={isAdminRoute ? 'relative z-10 w-full flex-1 px-3 py-3 sm:px-4 sm:py-4' : 'relative z-10 mx-auto w-full max-w-[min(1500px,96vw)] flex-1 px-3 py-7 sm:px-4 sm:py-9 md:max-w-[min(1500px,92vw)] md:px-6 md:py-12'}>
        <div key={loc.pathname} className="page-fade">
          <Outlet />
        </div>
      </main>
      {!isAdminRoute ? (
        <footer style={{ position: 'relative', zIndex: 10, borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.6)', marginTop: '5rem', padding: '4rem 1.5rem' }}>
          <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
            {(() => {
              const siteName = branding?.site_name || 'VXPERS STORE'
              const footerLinks = Array.isArray(siteSettings?.footer_links) ? siteSettings.footer_links.filter((l) => l.label && l.url) : []
              const socialLinks = Array.isArray(siteSettings?.social_links) ? siteSettings.social_links.filter((l) => l.platform && l.url) : []

              return (
                <>
                  {/* 4-column grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3rem', marginBottom: '4rem' }}>
                    {/* Column 1 - Brand */}
                    <div>
                      <div className="neon-text" style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: '1.5rem', textTransform: 'uppercase', fontStyle: 'italic' }}>
                        {siteName}
                      </div>
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                        จุดหมายปลายทางสำหรับเกมเมอร์ที่ต้องการคีย์เกมคุณภาพสูง ส่งมอบทันที และราคาดีที่สุด
                      </p>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        {(socialLinks.length > 0 ? socialLinks : [{ platform: 'TW' }, { platform: 'DC' }, { platform: 'IG' }, { platform: 'YT' }]).map((l, i) => (
                          <SocialIcon key={i} link={l} />
                        ))}
                      </div>
                    </div>

                    {/* Column 2 - Store */}
                    <div>
                      <h4 style={{ fontWeight: 700, marginBottom: '1.5rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#22d3ee' }}>ร้านค้า</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <li><FooterLink to="/categories">ดีลเด็ด</FooterLink></li>
                        <li><FooterLink to="/categories">มาใหม่</FooterLink></li>
                        <li><FooterLink to="/categories">ขายดี</FooterLink></li>
                        <li><FooterLink to="/categories">Gift Cards</FooterLink></li>
                      </ul>
                    </div>

                    {/* Column 3 - Support */}
                    <div>
                      <h4 style={{ fontWeight: 700, marginBottom: '1.5rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#22d3ee' }}>ช่วยเหลือ</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <li><FooterLink to="/support">คำถามที่พบบ่อย</FooterLink></li>
                        <li><FooterLink to="/tos">นโยบายคืนเงิน</FooterLink></li>
                        <li><FooterLink to="/history/purchases">ติดตามคำสั่งซื้อ</FooterLink></li>
                        <li><FooterLink to="/support">ติดต่อเรา</FooterLink></li>
                      </ul>
                    </div>

                    {/* Column 4 - Legal */}
                    <div>
                      <h4 style={{ fontWeight: 700, marginBottom: '1.5rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#22d3ee' }}>กฎหมาย</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <li><FooterLink to="/tos">ข้อกำหนดการใช้งาน</FooterLink></li>
                        <li><FooterLink to="/tos">นโยบายความเป็นส่วนตัว</FooterLink></li>
                        <li><FooterLink to="/tos">นโยบายคุกกี้</FooterLink></li>
                        {footerLinks.map((l, i) => {
                          const isExt = l.url.startsWith('http://') || l.url.startsWith('https://')
                          return (
                            <li key={i}>
                              {isExt ? <FooterA href={l.url}>{l.label}</FooterA> : <FooterLink to={l.url}>{l.label}</FooterLink>}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>

                  {/* Bottom bar */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                    <div>© {new Date().getFullYear()} {siteName}. สงวนลิขสิทธิ์</div>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                      <span>ไทย (TH)</span>
                      <span>บาท (฿)</span>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </footer>
      ) : null}
      <CookieConsent />
    </div>
  )
}
