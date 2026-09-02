import { lazy, Suspense, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'

const Categories = lazy(() => import('./pages/Categories.jsx'))
const Category = lazy(() => import('./pages/Category.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'))
const AdminV3 = lazy(() => import('./pages/AdminV3/index.jsx'))
const AdminStorage = lazy(() => import('./pages/AdminStorage.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Topup = lazy(() => import('./pages/Topup.jsx'))
const Register = lazy(() => import('./pages/Register.jsx'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const TopupHistory = lazy(() => import('./pages/TopupHistory.jsx'))
const PurchaseHistory = lazy(() => import('./pages/PurchaseHistory.jsx'))
const OrderTracking = lazy(() => import('./pages/OrderTracking.jsx'))
const Tos = lazy(() => import('./pages/Tos.jsx'))
const Inbox = lazy(() => import('./pages/Inbox.jsx'))
const Support = lazy(() => import('./pages/Support.jsx'))
const BundleDetail = lazy(() => import('./pages/BundleDetail.jsx'))
const DiscordInvite = lazy(() => import('./pages/DiscordInvite.jsx'))
const Tracker = lazy(() => import('./pages/Tracker.jsx'))

function canUseDocumentNavigation(event, anchor) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (anchor.hasAttribute('download')) return false
  if (anchor.dataset?.spa === 'true') return false

  const target = String(anchor.getAttribute('target') || '').trim().toLowerCase()
  if (target && target !== '_self') return false

  const rawHref = anchor.getAttribute('href')
  if (!rawHref || rawHref.startsWith('#')) return false

  let url
  try {
    url = new URL(rawHref, window.location.href)
  } catch {
    return false
  }

  if (!['http:', 'https:'].includes(url.protocol)) return false
  if (url.origin !== window.location.origin) return false

  const current = new URL(window.location.href)
  if (url.pathname === current.pathname && url.search === current.search) return false

  return true
}

function NavigationProgress() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    function showProgress() {
      flushSync(() => setActive(true))
    }

    function hideProgress() {
      setActive(false)
    }

    function onClick(event) {
      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest('a[href]')
      if (!canUseDocumentNavigation(event, anchor)) return

      const url = new URL(anchor.getAttribute('href'), window.location.href)
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      showProgress()
      requestAnimationFrame(() => {
        window.location.assign(url.href)
      })
    }

    window.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', showProgress)
    window.addEventListener('pagehide', showProgress)
    window.addEventListener('pageshow', hideProgress)

    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', showProgress)
      window.removeEventListener('pagehide', showProgress)
      window.removeEventListener('pageshow', hideProgress)
    }
  }, [])

  return (
    <div aria-hidden className={`route-progress ${active ? 'is-active' : ''}`}>
      <span className="route-progress__bar" />
    </div>
  )
}

function CrystalPageLoader() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-16">
      <div className="relative flex items-center justify-center">
        <div className="absolute -inset-4 animate-ping rounded-full bg-sky-400/20 duration-1000" />
        <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-sky-400/30 to-blue-500/20 blur-md" />
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-sky-100 border-t-sky-500 shadow-[0_0_20px_rgba(2,132,199,0.25)]" />
        <div className="absolute grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-md">
          <svg className="h-4 w-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      </div>
      
      <div className="mt-5 flex flex-col items-center gap-1">
        <span className="text-sm font-black text-slate-800 tracking-wide">กำลังโหลดหน้า...</span>
        <span className="text-xs font-semibold text-sky-600/80">VxperS Store</span>
      </div>

      <div className="mt-6 w-full max-w-md space-y-3 px-4">
        <div className="h-3.5 w-3/5 animate-pulse rounded-full bg-sky-100/80" />
        <div className="h-10 w-full animate-pulse rounded-2xl bg-sky-100/60" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-14 animate-pulse rounded-2xl bg-sky-100/50" />
          <div className="h-14 animate-pulse rounded-2xl bg-sky-100/50" />
          <div className="h-14 animate-pulse rounded-2xl bg-sky-100/50" />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <NavigationProgress />
      <Suspense fallback={<CrystalPageLoader />}>
        <Routes>
          <Route path="/tracker/*" element={<Tracker />} />
          <Route path="/admin-v3" element={<AdminV3 />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/category/:slug" element={<Category />} />
            <Route path="/p/:id" element={<ProductDetail />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/bundle/:id" element={<BundleDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<Navigate to="/history/purchases" replace />} />
            <Route path="/history/topups" element={<TopupHistory />} />
            <Route path="/history/purchases" element={<PurchaseHistory />} />
            <Route path="/history/orders/:id" element={<OrderTracking />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/support" element={<Support />} />
            <Route path="/discord" element={<DiscordInvite />} />
            <Route path="/tos" element={<Tos />} />
            <Route path="/topup" element={<Navigate to="/topup/angpao" replace />} />
            <Route path="/topup/:method" element={<Topup />} />
            <Route path="/admin" element={<Navigate to="/admin-v3" replace />} />
            <Route path="/admin-v2" element={<Navigate to="/admin-v3" replace />} />
            <Route path="/admin/storage" element={<AdminStorage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}
