import { lazy, Suspense } from 'react'
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
const TopupHistory = lazy(() => import('./pages/TopupHistory.jsx'))
const PurchaseHistory = lazy(() => import('./pages/PurchaseHistory.jsx'))
const OrderTracking = lazy(() => import('./pages/OrderTracking.jsx'))
const Tos = lazy(() => import('./pages/Tos.jsx'))
const Inbox = lazy(() => import('./pages/Inbox.jsx'))
const Support = lazy(() => import('./pages/Support.jsx'))
const BundleDetail = lazy(() => import('./pages/BundleDetail.jsx'))
const DiscordInvite = lazy(() => import('./pages/DiscordInvite.jsx'))

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
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
          <Route path="/tos" element={<Tos />} />
          <Route path="/topup" element={<Navigate to="/topup/angpao" replace />} />
          <Route path="/topup/:method" element={<Topup />} />
          <Route path="/admin" element={<Navigate to="/admin-v3" replace />} />
          <Route path="/admin-v2" element={<Navigate to="/admin-v3" replace />} />
          <Route path="/admin/storage" element={<AdminStorage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
