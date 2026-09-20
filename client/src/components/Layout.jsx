import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { gsap } from 'gsap'
import { fetchJson } from '../api.js'
import { applyUiBrandingToDocument, DEFAULT_UI_BRANDING_SETTINGS, normalizeUiBrandingSettings } from '../uiBrandingSettings.js'
import { applyRouteSeo } from '../seo.js'
import Navbar from './Navbar.jsx'
import MobileBottomNav from './MobileBottomNav.jsx'
import CookieConsent from './CookieConsent.jsx'
import AnnIcon from './AnnIcon.jsx'
import AnnRichText from './AnnRichText.jsx'

const ANIM_TARGETS = [
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
const ANNOUNCEMENT_DEFAULT_BG = 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)'
const ANNOUNCEMENT_DISMISS_MS = 86400000

function getAnnouncementKey(ann) {
  return String(ann?.id ?? ann?.text ?? '').trim()
}

function getAnnouncementDismissExpiry() {
  return Date.now() + ANNOUNCEMENT_DISMISS_MS
}

// Social Platform Brand SVG Icons
function getSocialIconSvg(platform) {
  const p = String(platform || '').toLowerCase().trim()
  if (p === 'discord' || p === 'dc') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    )
  }
  if (p === 'x' || p === 'twitter' || p === 'tw') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    )
  }
  if (p === 'facebook' || p === 'fb') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    )
  }
  if (p === 'instagram' || p === 'ig') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    )
  }
  if (p === 'youtube' || p === 'yt') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    )
  }
  if (p === 'tiktok') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    )
  }
  if (p === 'line') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.019 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.589-3.843 2.589-5.992zm-14.717 2.766h-1.921a.555.555 0 0 1-.555-.555v-4.412c0-.307.248-.555.555-.555h1.921c.307 0 .555.248.555.555 0 .307-.248.555-.555.555h-1.366v1.101h1.366c.307 0 .555.248.555.555 0 .307-.248.555-.555.555h-1.366v1.101h1.366c.307 0 .555.248.555.555 0 .307-.248.555-.555.555zm3.178 0a.555.555 0 0 1-.555-.555v-4.412c0-.307.248-.555.555-.555.307 0 .555.248.555.555v4.412c0 .307-.248.555-.555.555zm3.87 0h-1.921a.555.555 0 0 1-.555-.555v-4.412c0-.307.248-.555.555-.555.307 0 .555.248.555.555v3.857h1.366c.307 0 .555.248.555.555 0 .307-.248.555-.555.555zm3.87-3.857l-1.637 2.213v-1.658c0-.307-.248-.555-.555-.555-.307 0-.555.248-.555.555v4.412c0 .307.248.555.555.555.228 0 .428-.139.508-.348l1.684-2.277v1.515c0 .307.248.555.555.555.307 0 .555-.248.555-.555v-4.412c0-.307-.248-.555-.555-.555-.307 0-.555.248-.555.555z" />
      </svg>
    )
  }
  if (p === 'telegram') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    )
  }
  if (p === 'steam') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 12-5.373 12-12S18.605 0 11.979 0z" />
      </svg>
    )
  }
  if (p === 'twitch') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
      </svg>
    )
  }
  if (p === 'github') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.624-5.37-12-12-12" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  )
}

// Footer hover helper components
function SocialIcon({ link }) {
  const [hover, setHover] = useState(false)
  if (!link?.url || !String(link.url).trim()) return null
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      title={link.platform || 'Social Link'}
      style={{
        width: '2.4rem',
        height: '2.4rem',
        borderRadius: '9999px',
        background: hover ? '#0284c7' : '#f0f9ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: hover ? '#ffffff' : '#0284c7',
        textDecoration: 'none',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        border: '1px solid #bae6fd',
        boxShadow: hover ? '0 6px 16px rgba(2,132,199,0.3)' : '0 1px 3px rgba(2,132,199,0.05)',
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {getSocialIconSvg(link.platform)}
    </a>
  )
}

function FooterLink({ to, children }) {
  const [hover, setHover] = useState(false)
  return (
    <Link to={to}
      style={{ fontSize:'0.875rem', fontWeight: 600, color: hover ? '#0284c7' : '#64748b', textDecoration:'none', display:'block', transition:'color 0.2s', cursor:'pointer' }}
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
      style={{ fontSize:'0.875rem', fontWeight: 600, color: hover ? '#0284c7' : '#64748b', textDecoration:'none', display:'block', transition:'color 0.2s', cursor:'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      {children}
    </a>
  )
}

export default function Layout() {
  const loc = useLocation()
  const rootRef = useRef(null)
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
        <main className="relative z-10 min-h-screen w-full p-0">
          <div className="min-h-screen">
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative min-h-screen flex flex-col bg-[#f1f7fe] text-slate-800">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(80%_60%_at_50%_-10%,rgba(56,189,248,0.22),transparent_70%),radial-gradient(50%_40%_at_100%_20%,rgba(6,182,212,0.14),transparent_60%),radial-gradient(50%_40%_at_0%_50%,rgba(14,165,233,0.12),transparent_60%),linear-gradient(180deg,#ffffff_0%,#f1f7fe_100%)]" />
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
              <div key={getAnnouncementKey(ann) || ann.text} className="ann-card ann-slide-in" style={{ background: ANNOUNCEMENT_DEFAULT_BG, animationDelay: `${idx * 90}ms` }}>
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
        <div>
          <Outlet />
        </div>
      </main>
      {!isAdminRoute ? (
        <footer style={{ position: 'relative', zIndex: 10, borderTop: '1px solid #bae6fd', background: '#ffffff', marginTop: '5rem', padding: '4rem 1.5rem', boxShadow: '0 -10px 40px rgba(2,132,199,0.04)' }}>
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
                      <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: '1.5rem', textTransform: 'uppercase', fontStyle: 'italic', color: '#0f172a' }}>
                        {siteName}
                      </div>
                      <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                        จุดหมายปลายทางสำหรับเกมเมอร์ที่ต้องการคีย์เกมคุณภาพสูง ส่งมอบทันที และราคาดีที่สุด
                      </p>
                      {socialLinks.length > 0 ? (
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                          {socialLinks.map((l, i) => (
                            <SocialIcon key={`${l.platform || 'social'}-${i}`} link={l} />
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {/* Column 2 - Store */}
                    <div>
                      <h4 style={{ fontWeight: 800, marginBottom: '1.25rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0284c7' }}>ร้านค้า</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                        <li><FooterLink to="/categories">ดีลเด็ด</FooterLink></li>
                        <li><FooterLink to="/categories">มาใหม่</FooterLink></li>
                        <li><FooterLink to="/categories">ขายดี</FooterLink></li>
                        <li><FooterLink to="/categories">Gift Cards</FooterLink></li>
                      </ul>
                    </div>

                    {/* Column 3 - Support */}
                    <div>
                      <h4 style={{ fontWeight: 800, marginBottom: '1.25rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0284c7' }}>ช่วยเหลือ</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                        <li><FooterLink to="/support">คำถามที่พบบ่อย</FooterLink></li>
                        <li><FooterLink to="/tos">นโยบายคืนเงิน</FooterLink></li>
                        <li><FooterLink to="/history/purchases">ติดตามคำสั่งซื้อ</FooterLink></li>
                        <li><FooterLink to="/support">ติดต่อเรา</FooterLink></li>
                      </ul>
                    </div>

                    {/* Column 4 - Legal */}
                    <div>
                      <h4 style={{ fontWeight: 800, marginBottom: '1.25rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0284c7' }}>กฎหมาย</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                        <li><FooterLink to="/tos">ข้อกำหนดการใช้งาน</FooterLink></li>
                        <li><FooterLink to="/privacy">นโยบายความเป็นส่วนตัว</FooterLink></li>
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
                  <div style={{ borderTop: '1px solid #e0f2fe', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                    <div>© {new Date().getFullYear()} {siteName}. สงวนลิขสิทธิ์</div>
                    <div style={{ display: 'flex', gap: '1.5rem', fontWeight: 600 }}>
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
      <MobileBottomNav />
      <div className="h-16 lg:hidden" />
      <CookieConsent />
    </div>
  )
}
