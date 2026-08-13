import { lazy, Suspense, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'

const Categories = lazy(() => import('./pages/Categories.jsx'))
const Category = lazy(() => import('./pages/Category.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'))
const AdminV2 = lazy(() => import('./pages/AdminV2.jsx'))
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
const MangaOcr = lazy(() => import('./pages/MangaOcr.jsx'))

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

export default function App() {
  return (
    <>
      <NavigationProgress />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/tracker/*" element={<Tracker />} />
          <Route path="/admin-v3" element={<AdminV3 />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/category/:slug" element={<Category />} />
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
            <Route path="/mangaocr" element={<MangaOcr />} />
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
