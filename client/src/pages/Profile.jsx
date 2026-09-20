import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { copyToClipboard, fetchJson, setAuthToken } from '../api.js'
import { formatWishlistStockStatus, getVipProgressPercent, normalizeNotificationPreferences } from '../components/growth/growthDisplayUtils.js'
import UserAvatar from '../components/UserAvatar.jsx'
import AvatarStudioModal from '../components/profile/AvatarStudioModal.jsx'

function isEnglishOnlyPassword(value) {
  return typeof value === 'string' && value.length > 0 && /^[\x20-\x7E]+$/.test(value)
}

function getPasswordStrengthMeta(value) {
  const password = typeof value === 'string' ? value : ''
  if (!password) return { score: 0, level: 'none', label: 'ยังไม่ได้กรอก' }

  let score = 0
  if (password.length >= 8) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  if (password.length >= 12) score += 1

  if (score <= 2) return { score, level: 'weak', label: 'อ่อน' }
  if (score <= 4) return { score, level: 'medium', label: 'ปานกลาง' }
  return { score, level: 'strong', label: 'แข็งแรง' }
}

function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString()
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 pb-3">
      <div>
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        {subtitle ? <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div> : null}
      </div>
      {action}
    </div>
  )
}

function txLabel(tx) {
  const type = String(tx?.ref_type || '')
  if (type === 'purchase') return 'ซื้อสินค้า'
  if (type === 'coupon') return 'ใช้คูปอง'
  if (type === 'farm_cancel') return 'ยกเลิกงานบริการ'
  if (type === 'angpao_voucher') return 'เติมเงินอั่งเปา'
  if (type === 'admin_approve') return 'เติมเงินโดยแอดมิน'
  if (type === 'webhook') return 'เติมเงิน'
  if (type === 'admin_adjust' || type === 'points_adjustment') return 'ปรับพ้อยท์โดยแอดมิน'
  return type || 'รายการ'
}

const NOTIFICATION_PREFERENCE_ROWS = [
  ['wishlist_stock', 'สินค้าใน Wishlist กลับมาขาย'],
  ['wishlist_promo', 'สินค้าใน Wishlist มีโปรโมชันลดราคา'],
  ['campaigns', 'Flash Deal และกิจกรรมพิเศษ'],
  ['vip', 'อัปเดตสิทธิประโยชน์ระดับ VIP'],
  ['reviews', 'อัปเดตรีวิวและคะแนนสินค้า'],
  ['push_enabled', 'การแจ้งเตือนแบบ Push Notifications'],
]

export default function Profile() {
  const nav = useNavigate()
  const loc = useLocation()
  const [me, setMe] = useState(null)
  const [tx, setTx] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Active Tab
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'profile' | 'vip' | 'security' | 'discord' | 'notifications' | 'history'

  // Avatar Studio Modal
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)

  // Profile Form States
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [profileStatus, setProfileStatus] = useState('idle')
  const [profileMessage, setProfileMessage] = useState('')

  // Password & Security States
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [twoFactorMethod, setTwoFactorMethod] = useState('email') // 'email' | 'discord'
  const [emailPasswordCode, setEmailPasswordCode] = useState('')
  const [pwEmailStatus, setPwEmailStatus] = useState('idle')
  const [pwEmailExpiresAt, setPwEmailExpiresAt] = useState('')
  const [emailCountdown, setEmailCountdown] = useState(0)

  const [discordPasswordCode, setDiscordPasswordCode] = useState('')
  const [pwStatus, setPwStatus] = useState('idle')
  const [pwErrorText, setPwErrorText] = useState('')
  const [pwDiscordStatus, setPwDiscordStatus] = useState('idle')
  const [pwDiscordExpiresAt, setPwDiscordExpiresAt] = useState('')

  // Email Verification States
  const [verifyEmailCode, setVerifyEmailCode] = useState('')
  const [verifyEmailStatus, setVerifyEmailStatus] = useState('idle')
  const [verifyEmailMessage, setVerifyEmailMessage] = useState('')
  const [verifyEmailCountdown, setVerifyEmailCountdown] = useState(0)

  // Discord Link States
  const [discordLink, setDiscordLink] = useState(null)
  const [discordCode, setDiscordCode] = useState(null)
  const [discordStatus, setDiscordStatus] = useState('idle')
  const [discordCopyStatus, setDiscordCopyStatus] = useState('idle')

  // Wishlist & VIP & Notifications
  const [wishlist, setWishlist] = useState([])
  const [vip, setVip] = useState(null)
  const [notificationPreferences, setNotificationPreferences] = useState(normalizeNotificationPreferences(null))
  const [preferencesStatus, setPreferencesStatus] = useState('idle')

  // Delete Account
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteDiscordCode, setDeleteDiscordCode] = useState('')
  const [deleteStatus, setDeleteStatus] = useState('idle')
  const [deleteError, setDeleteError] = useState('')
  const [deleteDiscordSent, setDeleteDiscordSent] = useState(false)

  // Copy toast
  const [toastMessage, setToastMessage] = useState('')

  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2500)
  }

  // 2FA Hub States
  const [twoFactorInfo, setTwoFactorInfo] = useState({ enabled: false, type: 'none', backup_codes_count: 0 })
  const [twoFactorLoading, setTwoFactorLoading] = useState(false)
  const [totpModalOpen, setTotpModalOpen] = useState(false)
  const [totpSetupData, setTotpSetupData] = useState(null)
  const [totpInputCode, setTotpInputCode] = useState('')
  const [totpSetupStep, setTotpSetupStep] = useState(1) // 1: scan QR, 2: backup codes
  const [totpError, setTotpError] = useState('')
  const [totpSubmitting, setTotpSubmitting] = useState(false)

  const [email2faModalOpen, setEmail2faModalOpen] = useState(false)
  const [email2faInputCode, setEmail2faInputCode] = useState('')
  const [email2faStep, setEmail2faStep] = useState(1)
  const [email2faError, setEmail2faError] = useState('')
  const [email2faSubmitting, setEmail2faSubmitting] = useState(false)
  const [email2faCountdown, setEmail2faCountdown] = useState(0)

  const [disable2faModalOpen, setDisable2faModalOpen] = useState(false)
  const [disable2faPassword, setDisable2faPassword] = useState('')
  const [disable2faCode, setDisable2faCode] = useState('')
  const [disable2faCooldown, setDisable2faCooldown] = useState(0)
  const [disable2faSendingOtp, setDisable2faSendingOtp] = useState(false)
  const [disable2faOtpSentMsg, setDisable2faOtpSentMsg] = useState('')
  const [disable2faError, setDisable2faError] = useState('')
  const [disable2faSubmitting, setDisable2faSubmitting] = useState(false)

  const [backupCodesModalOpen, setBackupCodesModalOpen] = useState(false)
  const [regenPassword, setRegenPassword] = useState('')
  const [regenBackupCodes, setRegenBackupCodes] = useState([])
  const [regenError, setRegenError] = useState('')
  const [regenSubmitting, setRegenSubmitting] = useState(false)

  // Active Sessions & Devices State
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Email Countdowns
  useEffect(() => {
    if (emailCountdown <= 0) return
    const t = setInterval(() => setEmailCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [emailCountdown])

  useEffect(() => {
    if (email2faCountdown <= 0) return
    const t = setInterval(() => setEmail2faCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [email2faCountdown])

  useEffect(() => {
    if (verifyEmailCountdown <= 0) return
    const t = setInterval(() => setVerifyEmailCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [verifyEmailCountdown])

  useEffect(() => {
    if (disable2faCooldown <= 0) return
    const t = setInterval(() => setDisable2faCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [disable2faCooldown])

  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2500)
  }

  async function loadSessions() {
    setSessionsLoading(true)
    try {
      const data = await fetchJson('/api/auth/sessions')
      setSessions(Array.isArray(data?.sessions) ? data.sessions : [])
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false)
    }
  }

  async function revokeSession(tokenHash) {
    try {
      await fetchJson(`/api/auth/sessions/${encodeURIComponent(tokenHash)}`, { method: 'DELETE' })
      showToast('ตัดการเชื่อมต่ออุปกรณ์สำเร็จ')
      loadSessions()
    } catch {
      showToast('เกิดข้อผิดพลาดในการตัดการเชื่อมต่อ')
    }
  }

  async function revokeOtherSessions() {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบอุปกรณ์อื่นทั้งหมด?')) return
    try {
      await fetchJson('/api/auth/sessions/revoke-others', { method: 'POST' })
      showToast('ออกจากระบบอุปกรณ์อื่นทั้งหมดเรียบร้อยแล้ว')
      loadSessions()
    } catch {
      showToast('เกิดข้อผิดพลาด')
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [meRes, txRes, ordersRes, discordRes, wishlistRes, vipRes, prefRes] = await Promise.all([
          fetchJson('/api/me'),
          fetchJson('/api/me/transactions?limit=20'),
          fetchJson('/api/me/orders?limit=20'),
          fetchJson('/api/me/discord-link'),
          fetchJson('/api/me/wishlist').catch(() => ({})),
          fetchJson('/api/me/vip').catch(() => ({})),
          fetchJson('/api/me/notification-preferences').catch(() => ({})),
        ])
        if (!cancelled) {
          setMe(meRes)
          setDisplayNameInput(String(meRes?.user?.display_name || ''))
          setEditUsername(String(meRes?.user?.username || ''))
          setEditEmail(String(meRes?.user?.email || ''))
          setTx(Array.isArray(txRes?.transactions) ? txRes.transactions : [])
          setOrders(Array.isArray(ordersRes?.orders) ? ordersRes.orders : [])
          setDiscordLink(discordRes)
          setWishlist(Array.isArray(wishlistRes?.wishlist?.items) ? wishlistRes.wishlist.items : [])
          setVip(vipRes?.vip || null)
          setNotificationPreferences(normalizeNotificationPreferences(prefRes?.preferences))
        }
      } catch (err) {
        if (!cancelled && err?.status === 401) {
          setAuthToken(null)
          nav('/login', { replace: true })
          return
        }
        if (!cancelled) setError(String(err?.message ?? 'load_failed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'security') {
      loadSessions()
      load2FAStatus()
    }
  }, [activeTab])

  useEffect(() => {
    const id = String(loc.hash || '').replace('#', '')
    if (id) {
      if (['overview', 'profile', 'vip', 'security', 'discord', 'notifications', 'wishlist', 'history'].includes(id)) {
        setActiveTab(id)
      }
    }
  }, [loc.hash])

  const user = me?.user
  const wallet = me?.wallet
  const displayName = user?.display_name || user?.username || user?.email?.split('@')?.[0] || 'ผู้ใช้'
  const role = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : 'user'
  const canAccessAdmin = role !== 'user'
  const totalSpent = useMemo(() => orders.reduce((sum, order) => sum + (Number(order.unit_price_points || 0) * Number(order.qty || 1)), 0), [orders])

  const passwordValidLength = newPassword.length >= 8
  const passwordEnglishOnly = isEnglishOnlyPassword(newPassword)
  const strength = getPasswordStrengthMeta(newPassword)
  const strengthWidth = `${Math.max(0, Math.min(100, Math.round((strength.score / 5) * 100)))}%`
  const strengthColorClass = strength.level === 'strong' ? 'bg-emerald-500' : strength.level === 'medium' ? 'bg-amber-400' : strength.level === 'weak' ? 'bg-rose-500' : 'bg-slate-200'

  const discordBot = discordCode?.bot || discordLink?.bot || {}
  const discordLinked = Boolean(discordLink?.linked && discordLink?.link)
  const discordCommand = discordCode?.command || (discordCode?.code ? `/link code:${discordCode.code}` : '')

  const vipProgress = getVipProgressPercent(vip)
  const vipNextThreshold = Number(vip?.next_threshold_points)
  const vipPointsSpent = Number(vip?.points_spent || 0)

  // Save Avatar from Studio Modal
  async function handleSaveAvatar(avatarDataUrl) {
    setSavingAvatar(true)
    try {
      let finalAvatarUrl = avatarDataUrl
      if (avatarDataUrl && avatarDataUrl.startsWith('data:image/')) {
        const upload = await fetchJson('/api/me/avatar-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_data: avatarDataUrl }),
        })
        finalAvatarUrl = String(upload?.avatar_url || '')
      }

      await fetchJson('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: finalAvatarUrl || null }),
      })

      const meRes = await fetchJson('/api/me')
      setMe(meRes)
      setAvatarModalOpen(false)
      showToast('อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว')
      window.dispatchEvent(new Event('app_refresh'))
    } catch (err) {
      showToast(err?.message || 'บันทึกรูปโปรไฟล์ไม่สำเร็จ')
    } finally {
      setSavingAvatar(false)
    }
  }

  // Save Profile Text Info
  async function saveProfileInfo(e) {
    if (e) e.preventDefault()
    if (profileStatus === 'submitting') return
    setProfileStatus('submitting')
    setProfileMessage('')

    try {
      await fetchJson('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayNameInput.trim(),
          username: editUsername.trim(),
          email: editEmail.trim(),
        }),
      })

      const meRes = await fetchJson('/api/me')
      setMe(meRes)
      setDisplayNameInput(String(meRes?.user?.display_name || ''))
      setEditUsername(String(meRes?.user?.username || ''))
      setEditEmail(String(meRes?.user?.email || ''))
      setProfileStatus('success')
      setProfileMessage('บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว')
      showToast('บันทึกโปรไฟล์สำเร็จ')
      window.dispatchEvent(new Event('app_refresh'))
      setTimeout(() => setProfileStatus('idle'), 2500)
    } catch (err) {
      setProfileStatus('error')
      const code = String(err?.data?.error || '')
      if (code === 'username_taken') setProfileMessage('Username นี้มีผู้ใช้งานแล้ว')
      else if (code === 'email_taken') setProfileMessage('Email นี้มีผู้ใช้งานแล้ว')
      else if (code === 'invalid_username') setProfileMessage('Username ไม่ถูกต้อง (อย่างน้อย 6 ตัว, a-z, 0-9, ., -, _)')
      else if (code === 'invalid_email') setProfileMessage('รูปแบบอีเมลไม่ถูกต้อง')
      else setProfileMessage('บันทึกข้อมูลไม่สำเร็จ')
    }
  }

  // Change Password
  async function changePassword(e) {
    e.preventDefault()
    if (pwStatus === 'submitting') return
    setPwErrorText('')

    if (!oldPassword) {
      setPwStatus('error')
      setPwErrorText('กรุณากรอกรหัสผ่านปัจจุบัน')
      return
    }

    if (twoFactorMethod === 'email' && !String(emailPasswordCode || '').trim()) {
      setPwStatus('error')
      setPwErrorText('กรุณากดรับและกรอกรหัส OTP จาก Gmail')
      return
    }

    if (twoFactorMethod === 'discord' && discordLinked && !String(discordPasswordCode || '').trim()) {
      setPwStatus('error')
      setPwErrorText('กรุณากรอกรหัสยืนยันจาก Discord DM')
      return
    }
    if (!passwordValidLength) {
      setPwStatus('error')
      setPwErrorText('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    if (!passwordEnglishOnly) {
      setPwStatus('error')
      setPwErrorText('รหัสผ่านต้องใช้ตัวอักษรภาษาอังกฤษหรือสัญลักษณ์ ASCII เท่านั้น')
      return
    }

    setPwStatus('submitting')
    try {
      await fetchJson('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
          discord_code: twoFactorMethod === 'discord' ? discordPasswordCode : undefined,
          email_code: twoFactorMethod === 'email' ? emailPasswordCode : undefined,
        }),
      })
      setOldPassword('')
      setNewPassword('')
      setEmailPasswordCode('')
      setDiscordPasswordCode('')
      setPwStatus('success')
      setPwDiscordStatus('idle')
      setPwDiscordExpiresAt('')
      showToast('เปลี่ยนรหัสผ่านสำเร็จ')
      setTimeout(() => setPwStatus('idle'), 2000)
    } catch (err) {
      const code = String(err?.data?.error || '')
      setPwStatus('error')
      if (code === 'weak_password') setPwErrorText('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      else if (code === 'invalid_password_charset') setPwErrorText('รหัสผ่านต้องใช้ภาษาอังกฤษหรือสัญลักษณ์ ASCII เท่านั้น')
      else if (code === 'invalid_old_password') setPwErrorText('รหัสผ่านเดิมไม่ถูกต้อง')
      else if (code === 'discord_code_required') setPwErrorText('ต้องใช้รหัสยืนยันจาก Discord DM')
      else if (code === 'discord_code_invalid') setPwErrorText('รหัสยืนยันจาก Discord ไม่ถูกต้อง')
      else if (code === 'discord_code_expired') setPwErrorText('รหัสยืนยันจาก Discord หมดอายุแล้ว กรุณาขอรหัสใหม่')
      else setPwErrorText('เปลี่ยนรหัสผ่านไม่สำเร็จ')
    }
  }

  // Request Email OTP for Password Change
  async function requestEmailPasswordCode() {
    if (pwEmailStatus === 'sending' || emailCountdown > 0) return
    setPwEmailStatus('sending')
    setPwErrorText('')
    try {
      const res = await fetchJson('/api/me/password/email-code', { method: 'POST' })
      setPwEmailExpiresAt(String(res?.expiresAt || ''))
      setPwEmailStatus('sent')
      setEmailCountdown(60)
      showToast('ส่งรหัส OTP ไปที่ Gmail เรียบร้อยแล้ว')
    } catch {
      setPwEmailStatus('error')
      setPwErrorText('ส่งรหัส OTP ไปที่ Gmail ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  // Email Verification
  async function requestVerifyEmailCode() {
    if (verifyEmailStatus === 'sending' || verifyEmailCountdown > 0) return
    setVerifyEmailStatus('sending')
    setVerifyEmailMessage('')
    try {
      await fetchJson('/api/me/email/send-code', { method: 'POST' })
      setVerifyEmailStatus('sent')
      setVerifyEmailCountdown(60)
      showToast('ส่งรหัสยืนยันไปที่ Gmail แล้ว')
    } catch {
      setVerifyEmailStatus('error')
      setVerifyEmailMessage('ส่งรหัสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  async function submitVerifyEmail(e) {
    e.preventDefault()
    if (!verifyEmailCode.trim()) return
    setVerifyEmailStatus('verifying')
    setVerifyEmailMessage('')
    try {
      await fetchJson('/api/me/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyEmailCode.trim() }),
      })
      setVerifyEmailStatus('success')
      setVerifyEmailMessage('✓ ยืนยันอีเมลสำเร็จเรียบร้อยแล้ว!')
      showToast('ยืนยันอีเมลสำเร็จ!')
      setMe((prev) => (prev ? { ...prev, user: { ...prev.user, is_email_verified: true } } : prev))
    } catch (err) {
      setVerifyEmailStatus('error')
      setVerifyEmailMessage(err?.data?.message || 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ')
    }
  }

  // ── 2FA Functions ──
  async function load2FAStatus() {
    setTwoFactorLoading(true)
    try {
      const data = await fetchJson('/api/me/2fa/status')
      setTwoFactorInfo({
        enabled: Boolean(data?.two_factor_enabled),
        type: data?.two_factor_type || 'none',
        backup_codes_count: Number(data?.backup_codes_count || 0),
        confirmed_at: data?.confirmed_at || null,
      })
    } catch {
      // ignore
    } finally {
      setTwoFactorLoading(false)
    }
  }

  async function startTotpSetup() {
    setTotpError('')
    setTotpInputCode('')
    setTotpSetupStep(1)
    setTotpModalOpen(true)
    try {
      const data = await fetchJson('/api/me/2fa/totp/setup', { method: 'POST' })
      setTotpSetupData(data)
    } catch {
      setTotpError('สร้างข้อมูลสำหรับผูกแอปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  async function confirmTotpSetup(e) {
    e.preventDefault()
    if (!totpInputCode.trim() || totpSubmitting) return
    setTotpSubmitting(true)
    setTotpError('')
    try {
      await fetchJson('/api/me/2fa/totp/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: totpInputCode.trim(),
          secret: totpSetupData?.secret,
          backup_codes_hashed: totpSetupData?.backup_codes_hashed,
        }),
      })
      setTotpSetupStep(2)
      showToast('เปิดใช้งาน Google Authenticator สำเร็จ')
      load2FAStatus()
    } catch (err) {
      setTotpError(err?.data?.message || 'รหัสยืนยัน 6 หลักไม่ถูกต้อง')
    } finally {
      setTotpSubmitting(false)
    }
  }

  async function startEmail2faSetup() {
    setEmail2faError('')
    setEmail2faInputCode('')
    setEmail2faStep(1)
    setEmail2faModalOpen(true)
    try {
      const res = await fetchJson('/api/me/2fa/totp/setup', { method: 'POST' })
      setTotpSetupData(res)
      await fetchJson('/api/me/2fa/email/send-code', { method: 'POST' })
      setEmail2faCountdown(60)
    } catch {
      setEmail2faError('ส่งรหัส OTP ไปยัง Gmail ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  async function confirmEmail2faSetup(e) {
    e.preventDefault()
    if (!email2faInputCode.trim() || email2faSubmitting) return
    setEmail2faSubmitting(true)
    setEmail2faError('')
    try {
      await fetchJson('/api/me/2fa/email/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: email2faInputCode.trim(),
          backup_codes_hashed: totpSetupData?.backup_codes_hashed,
        }),
      })
      setEmail2faStep(2)
      showToast('เปิดใช้งาน Email 2FA สำเร็จ')
      load2FAStatus()
    } catch (err) {
      setEmail2faError(err?.data?.message || 'รหัส OTP ไม่ถูกต้อง')
    } finally {
      setEmail2faSubmitting(false)
    }
  }

  async function handleSendDisable2faEmailOtp() {
    if (disable2faCooldown > 0 || disable2faSendingOtp) return
    setDisable2faSendingOtp(true)
    setDisable2faError('')
    setDisable2faOtpSentMsg('')
    try {
      await fetchJson('/api/me/2fa/email/send-disable-code', { method: 'POST' })
      setDisable2faCooldown(60)
      setDisable2faOtpSentMsg(`ส่งรหัส OTP ไปยัง ${user?.email || 'อีเมลของคุณ'} เรียบร้อยแล้ว`)
      showToast('ส่งรหัส OTP เรียบร้อยแล้ว')
    } catch (err) {
      setDisable2faError(err?.data?.message || 'ส่งรหัส OTP ไปยังอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setDisable2faSendingOtp(false)
    }
  }

  async function handleDisable2FA(e) {
    e.preventDefault()
    if (!disable2faPassword || !disable2faCode.trim() || disable2faSubmitting) return
    setDisable2faSubmitting(true)
    setDisable2faError('')
    try {
      await fetchJson('/api/me/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: disable2faPassword,
          code: disable2faCode.trim(),
        }),
      })
      try {
        localStorage.removeItem('trusted_device_token')
      } catch {}
      setDisable2faModalOpen(false)
      setDisable2faPassword('')
      setDisable2faCode('')
      setDisable2faOtpSentMsg('')
      showToast('ปิดใช้งานระบบ 2FA เรียบร้อยแล้ว')
      load2FAStatus()
    } catch (err) {
      setDisable2faError(err?.data?.message || 'รหัสผ่านหรือรหัส OTP 2FA ไม่ถูกต้อง')
    } finally {
      setDisable2faSubmitting(false)
    }
  }

  async function handleRevokeAllTrustedDevices() {
    if (!window.confirm('คุณต้องการยกเลิกการจดจำอุปกรณ์ 2FA ทั้งหมดใช่หรือไม่? ครั้งต่อไปจะต้องยืนยันรหัส 2FA ทุกเครื่อง')) return
    try {
      await fetchJson('/api/auth/trusted-devices/revoke-all', { method: 'POST' })
      try {
        localStorage.removeItem('trusted_device_token')
      } catch {}
      showToast('ยกเลิกการจดจำอุปกรณ์ 2FA ทั้งหมดเรียบร้อยแล้ว')
    } catch {
      showToast('เกิดข้อผิดพลาดในการยกเลิกอุปกรณ์')
    }
  }

  async function handleRegenBackupCodes(e) {
    e.preventDefault()
    if (!regenPassword || regenSubmitting) return
    setRegenSubmitting(true)
    setRegenError('')
    try {
      const res = await fetchJson('/api/me/2fa/backup-codes/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: regenPassword }),
      })
      setRegenBackupCodes(Array.isArray(res?.backup_codes) ? res.backup_codes : [])
      showToast('สร้างรหัสสำรองฉุกเฉินชุดใหม่สำเร็จ')
      load2FAStatus()
    } catch (err) {
      setRegenError(err?.data?.message || 'รหัสผ่านไม่ถูกต้อง')
    } finally {
      setRegenSubmitting(false)
    }
  }

  // Request Discord Reset Code
  async function requestDiscordPasswordCode() {
    if (!discordLinked || pwDiscordStatus === 'sending') return
    setPwDiscordStatus('sending')
    setPwErrorText('')
    try {
      const res = await fetchJson('/api/me/password/discord-code', { method: 'POST' })
      setPwDiscordExpiresAt(String(res?.expires_at || ''))
      setPwDiscordStatus('sent')
      showToast('ส่งรหัสยืนยันไปยัง Discord DM แล้ว')
    } catch (err) {
      const code = String(err?.data?.error || '')
      setPwDiscordStatus('error')
      if (code === 'discord_dm_failed') setPwErrorText('ส่ง DM ไม่สำเร็จ กรุณาเปิดรับข้อความจากบอทหรือสมาชิกเซิร์ฟเวอร์')
      else if (code === 'bot_not_ready') setPwErrorText('บอทยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง')
      else setPwErrorText('ส่งรหัสยืนยันไปที่ Discord ไม่สำเร็จ')
    }
  }

  // Discord Linking
  async function refreshDiscordLink() {
    const res = await fetchJson('/api/me/discord-link')
    setDiscordLink(res)
    return res
  }

  async function createDiscordCode() {
    if (discordStatus === 'submitting') return
    setDiscordStatus('submitting')
    setDiscordCopyStatus('idle')
    try {
      const res = await fetchJson('/api/me/discord-link/code', { method: 'POST' })
      setDiscordCode(res)
      await refreshDiscordLink()
      setDiscordStatus('code_ready')
      showToast('สร้างรหัสเชื่อมต่อ Discord สำเร็จ')
    } catch {
      setDiscordStatus('error')
    }
  }

  async function unlinkDiscord() {
    if (discordStatus === 'unlinking') return
    setDiscordStatus('unlinking')
    try {
      await fetchJson('/api/me/discord-link', { method: 'DELETE' })
      setDiscordCode(null)
      await refreshDiscordLink()
      setDiscordStatus('unlinked')
      showToast('ยกเลิกการเชื่อมต่อ Discord แล้ว')
      setTimeout(() => setDiscordStatus('idle'), 1500)
    } catch {
      setDiscordStatus('error')
    }
  }

  async function copyDiscordCommand() {
    const ok = await copyToClipboard(discordCommand)
    setDiscordCopyStatus(ok ? 'copied' : 'error')
    if (ok) showToast('คัดลอกคำสั่งเรียบร้อย')
    if (ok) setTimeout(() => setDiscordCopyStatus('idle'), 1500)
  }

  // Save Notifications
  async function saveNotificationPreferences(nextPreferences) {
    setPreferencesStatus('submitting')
    try {
      const res = await fetchJson('/api/me/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPreferences),
      })
      setNotificationPreferences(normalizeNotificationPreferences(res?.preferences))
      setPreferencesStatus('success')
      showToast('บันทึกการตั้งค่าแจ้งเตือนแล้ว')
      setTimeout(() => setPreferencesStatus('idle'), 1500)
    } catch {
      setPreferencesStatus('error')
    }
  }

  // Delete Account
  async function requestDeleteDiscordCode() {
    if (deleteDiscordSent) return
    try {
      await fetchJson('/api/me/password/discord-code', { method: 'POST' })
      setDeleteDiscordSent(true)
      showToast('ส่งรหัสยืนยันไปที่ Discord DM แล้ว')
    } catch {
      setDeleteError('ส่งรหัสยืนยัน Discord ไม่สำเร็จ')
    }
  }

  async function confirmDeleteAccount() {
    if (deleteStatus === 'submitting') return
    setDeleteError('')
    setDeleteStatus('submitting')
    try {
      await fetchJson('/api/me/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword, discord_code: deleteDiscordCode }),
      })
      setAuthToken(null)
      window.location.assign('/')
    } catch (err) {
      const code = String(err?.data?.error || '')
      setDeleteStatus('error')
      if (code === 'invalid_password') setDeleteError('รหัสผ่านไม่ถูกต้อง')
      else if (code === 'discord_code_required') setDeleteError('ต้องใส่รหัสยืนยันจาก Discord')
      else if (code === 'discord_code_invalid') setDeleteError('รหัสยืนยัน Discord ไม่ถูกต้อง')
      else setDeleteError('ลบบัญชีไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[460px] place-items-center rounded-3xl border border-sky-100 bg-white p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
          <div className="text-xs font-bold text-slate-500">กำลังโหลดโปรไฟล์...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-rose-50/50 p-8 text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <div className="text-base font-black text-slate-900">โหลดข้อมูลโปรไฟล์ไม่สำเร็จ</div>
        <div className="mt-1 text-xs text-slate-500">{error}</div>
        <button type="button" onClick={() => nav(0)} className="ui-btn-primary mt-5 h-10 px-5 text-xs font-bold">
          ลองใหม่อีกครั้ง
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage ? (
        <div className="fixed bottom-5 right-5 z-[150] rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl animate-fade-in">
          ✓ {toastMessage}
        </div>
      ) : null}

      {/* ── Top Hero & Avatar Studio Showcase ── */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-200/90 bg-white p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_70%_at_0%_0%,rgba(56,189,248,0.15),transparent_60%),radial-gradient(40%_60%_at_100%_10%,rgba(14,165,233,0.12),transparent_55%)]" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* User Identity */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* Avatar with Studio Trigger */}
            <div className="group relative shrink-0">
              <UserAvatar
                user={user}
                name={displayName}
                size={96}
                rounded="2xl"
                className="shadow-md border-3 border-white ring-2 ring-sky-200"
              />
              <button
                type="button"
                onClick={() => setAvatarModalOpen(true)}
                className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60 opacity-0 transition group-hover:opacity-100 text-white text-[11px] font-bold backdrop-blur-xs"
              >
                <span>📷</span>
                <span>เปลี่ยนรูป</span>
              </button>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-sky-700">
                  {role === 'owner' ? '👑 Owner' : role === 'admin' ? '🛡️ Admin' : role === 'support' ? '🎧 Support' : '🌟 Member'}
                </span>
                {vip?.tier?.name ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-700">
                    👑 {vip.tier.name}
                  </span>
                ) : null}
              </div>

              <h1 className="mt-1.5 truncate text-2xl font-black text-slate-900 md:text-3xl">
                {displayName}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                <span className="font-mono">{user?.email || user?.username || '-'}</span>
                {user?.created_at ? (
                  <span>• สมาชิกตั้งแต่: {formatDateOnly(user.created_at)}</span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-sky-100"
                >
                  <span>📷</span> ปรับแต่งรูปโปรไฟล์ (Avatar Studio)
                </button>
                {canAccessAdmin ? (
                  <Link
                    to="/admin-v3"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    ⚙️ แดชบอร์ดแอดมิน
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[340px]">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-black text-emerald-600">{fmt(wallet?.balance)}</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-500">พ้อยท์คงเหลือ</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-black text-slate-900">{orders.length}</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-500">คำสั่งซื้อ</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-black text-sky-600">{fmt(totalSpent)}</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-500">ยอดซื้อสะสม</div>
            </div>
          </div>
        </div>

        {/* ── Sub Navigation Tabs ── */}
        <div className="mt-6 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
          {[
            { id: 'overview', label: '📊 ภาพรวม & เมนูทางลัด', icon: 'bi-grid-fill' },
            { id: 'profile', label: '👤 ข้อมูลโปรไฟล์', icon: 'bi-person-circle' },
            { id: 'vip', label: '👑 สิทธิพิเศษ VIP', icon: 'bi-gem' },
            { id: 'security', label: '🔒 รหัสผ่าน & ความปลอดภัย', icon: 'bi-shield-lock' },
            { id: 'discord', label: '🎮 เชื่อมต่อ Discord', icon: 'bi-discord' },
            { id: 'notifications', label: '🔔 การแจ้งเตือน', icon: 'bi-bell' },
            { id: 'wishlist', label: '💖 Wishlist', count: wishlist.length },
            { id: 'history', label: '📜 ประวัติทำรายการ' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                activeTab === t.id
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span>{t.label}</span>
              {t.count > 0 ? (
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === t.id ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {/* ── Tab Content Sections ── */}

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Action Shortcuts */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/topup/angpao" className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm transition hover:border-sky-400 hover:bg-sky-50">
              <div className="text-2xl mb-1">💳</div>
              <div className="text-sm font-black text-slate-900">เติมเงินกระเป๋า</div>
              <div className="mt-0.5 text-xs text-slate-500">อั่งเปา / PromptPay อัตโนมัติ</div>
            </Link>
            <Link to="/inbox" className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm transition hover:border-sky-400 hover:bg-sky-50">
              <div className="text-2xl mb-1">📥</div>
              <div className="text-sm font-black text-slate-900">กล่องรับของ (Inbox)</div>
              <div className="mt-0.5 text-xs text-slate-500">ดูรหัส/คีย์และสินค้าดิจิทัล</div>
            </Link>
            <Link to="/history/purchases" className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm transition hover:border-sky-400 hover:bg-sky-50">
              <div className="text-2xl mb-1">🛍️</div>
              <div className="text-sm font-black text-slate-900">ประวัติสั่งซื้อ</div>
              <div className="mt-0.5 text-xs text-slate-500">ติดตามรายการคำสั่งซื้อทั้งหมด</div>
            </Link>
            <Link to="/support" className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm transition hover:border-sky-400 hover:bg-sky-50">
              <div className="text-2xl mb-1">🎧</div>
              <div className="text-sm font-black text-slate-900">ศูนย์ช่วยเหลือ (Support)</div>
              <div className="mt-0.5 text-xs text-slate-500">เปิดตั๋วปัญหาและแชทกับทีมงาน</div>
            </Link>
          </div>

          {/* VIP Progress Snapshot */}
          <section className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50/70 via-white to-sky-50/40 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500 text-2xl text-white shadow-md">👑</span>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-sky-600">VIP Membership</div>
                  <div className="text-lg font-black text-slate-900">{vip?.tier?.name || 'Member (สมาชิกทั่วไป)'}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('vip')}
                className="rounded-xl border border-sky-200 bg-white px-3.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
              >
                ดูสิทธิประโยชน์ VIP ทั้งหมด →
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-600">ความคืบหน้าสะสมพ้อยท์</span>
                <span className="text-sky-600">{vipProgress}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 p-0.5">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-500 transition-all duration-700" style={{ width: `${vipProgress}%` }} />
              </div>
            </div>
          </section>

          {/* Wishlist Snapshot */}
          {wishlist.length > 0 ? (
            <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm">
              <SectionTitle
                title="Wishlist ที่ติดตาม"
                subtitle="สินค้าที่คุณบันทึกไว้"
                action={
                  <button type="button" onClick={() => setActiveTab('wishlist')} className="text-xs font-bold text-sky-600 hover:text-sky-800">
                    ดูทั้งหมด ({wishlist.length}) →
                  </button>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {wishlist.slice(0, 3).map((item) => (
                  <Link key={item.product_id} to={`/product/${item.product_id}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-sky-50">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-12 w-12 rounded-xl object-cover border" />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-xl bg-sky-100 text-xs font-black text-sky-700">ITEM</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-black text-slate-900">{item.name}</div>
                      <div className="text-[11px] font-bold text-sky-600">{formatWishlistStockStatus(item.stock_status)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {/* 2. EDIT PROFILE & AVATAR STUDIO TAB */}
      {activeTab === 'profile' && (
        <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm">
          <SectionTitle title="แก้ไขข้อมูลโปรไฟล์" subtitle="ปรับแต่งรูปโปรไฟล์ ชื่อผู้ใช้ อีเมล และชื่อที่แสดง" />

          {profileMessage ? (
            <div className={`mb-4 rounded-2xl p-3 text-xs font-bold ${profileStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {profileMessage}
            </div>
          ) : null}

          <form onSubmit={saveProfileInfo} className="space-y-4 max-w-xl">
            {/* Avatar Preview Card */}
            <div className="flex items-center gap-4 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
              <UserAvatar user={user} name={displayName} size={64} rounded="2xl" className="shadow-sm border-2 border-white ring-2 ring-sky-200" />
              <div>
                <div className="text-xs font-black text-slate-900">รูปโปรไฟล์ปัจจุบัน</div>
                <div className="text-[11px] text-slate-500">อัปโหลดภาพครอบตัด 1:1 หรือเลือกจากคลังอวตาร</div>
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-sky-700"
                >
                  📷 เปิดสตูดิโอปรับแต่งรูปภาพ
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อที่แสดง (Display Name)</label>
              <input
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                placeholder="ชื่อที่ต้องการให้แสดงในเว็บไซต์"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs outline-none focus:border-sky-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อผู้ใช้ (Username)</label>
              <input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="เช่น player_01"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs outline-none focus:border-sky-400 focus:bg-white font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">อีเมล (Email)</label>
                {user?.is_email_verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    ✓ ยืนยันอีเมลแล้ว
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                    ⚠️ ยังไม่ยืนยันอีเมล
                  </span>
                )}
              </div>
              <input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="yourname@example.com"
                type="email"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs outline-none focus:border-sky-400 focus:bg-white"
              />

              {/* Email Verification Box if unverified */}
              {!user?.is_email_verified && (
                <div className="mt-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-amber-900">
                      ✉️ ยืนยันอีเมลเพื่อความปลอดภัยของบัญชี
                    </span>
                    <button
                      type="button"
                      onClick={requestVerifyEmailCode}
                      disabled={verifyEmailStatus === 'sending' || verifyEmailCountdown > 0}
                      className="rounded-xl border border-amber-300 bg-white px-3 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100/50 disabled:opacity-50 cursor-pointer"
                    >
                      {verifyEmailStatus === 'sending'
                        ? 'กำลังส่ง...'
                        : verifyEmailCountdown > 0
                          ? `ส่งใหม่ใน (${verifyEmailCountdown}s)`
                          : 'ส่งรหัส OTP ไปที่ Gmail'}
                    </button>
                  </div>

                  {verifyEmailStatus === 'sent' || verifyEmailStatus === 'verifying' || verifyEmailStatus === 'error' ? (
                    <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60">
                      <input
                        value={verifyEmailCode}
                        onChange={(e) => setVerifyEmailCode(e.target.value)}
                        placeholder="รหัส OTP 6 หลัก"
                        maxLength={6}
                        inputMode="numeric"
                        className="w-32 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-mono text-center font-bold tracking-widest outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={submitVerifyEmail}
                        disabled={verifyEmailStatus === 'verifying' || !verifyEmailCode}
                        className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                      >
                        {verifyEmailStatus === 'verifying' ? 'กำลังตรวจ...' : 'ยืนยัน'}
                      </button>
                      {verifyEmailMessage && (
                        <span className={`text-[11px] font-bold ${verifyEmailStatus === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {verifyEmailMessage}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={profileStatus === 'submitting'}
                className="rounded-xl bg-sky-600 px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-sky-700 disabled:opacity-50"
              >
                {profileStatus === 'submitting' ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('open_cookie_settings'))}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                ตั้งค่าคุกกี้
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 3. VIP TAB */}
      {activeTab === 'vip' && (
        <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm space-y-6">
          <SectionTitle title="ระดับสมาชิก VIP & สิทธิประโยชน์" subtitle="คำนวณจากยอดการซื้อสินค้าสะสม ยิ่งซื้อมากยิ่งได้รับส่วนลดเพิ่ม" />

          {/* Current Tier Perks Grid */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-lg text-emerald-600">🏷️</span>
              <div>
                <div className="text-[11px] font-bold text-slate-500">ส่วนลดสมาชิก</div>
                <div className="text-sm font-black text-emerald-700">
                  {vip?.tier?.discount_percent ? `ลดเพิ่ม ${vip.tier.discount_percent}% ทุกออเดอร์` : 'ส่วนลดตามโปรโมชัน'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-lg text-sky-600">⚡</span>
              <div>
                <div className="text-[11px] font-bold text-slate-500">บริการช่วยเหลือ</div>
                <div className="text-sm font-black text-sky-700">
                  {vip?.tier?.priority_support ? 'Priority Support ด่วนพิเศษ' : 'ซัพพอร์ต 24 ชม.'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-100 text-lg text-purple-600">⏳</span>
              <div>
                <div className="text-[11px] font-bold text-slate-500">สิทธิ์ Flash Sale</div>
                <div className="text-sm font-black text-purple-700">
                  {vip?.tier?.early_access_minutes ? `เข้าถึงก่อน ${vip.tier.early_access_minutes} นาที` : 'ตามรอบเวลาปกติ'}
                </div>
              </div>
            </div>
          </div>

          {/* All Tiers Roadmap */}
          {Array.isArray(vip?.all_tiers) && vip.all_tiers.length > 0 ? (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-black uppercase tracking-wider text-slate-500">ตารางระดับ VIP ทั้งหมด</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {vip.all_tiers.map((tierItem) => {
                  const isCurrent = vip?.tier?.id === tierItem.id
                  const isUnlocked = vipPointsSpent >= Number(tierItem.threshold_points_spent)
                  return (
                    <div
                      key={tierItem.id}
                      className={`relative flex flex-col justify-between rounded-2xl p-4 transition-all ${
                        isCurrent
                          ? 'border-2 border-sky-500 bg-sky-50 shadow-sm ring-2 ring-sky-300'
                          : isUnlocked
                            ? 'border border-emerald-200 bg-emerald-50/40'
                            : 'border border-slate-200 bg-slate-50/60 opacity-75'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-black text-slate-900">{tierItem.name}</span>
                          {isCurrent ? (
                            <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[9px] font-black text-white">ปัจจุบัน</span>
                          ) : isUnlocked ? (
                            <span className="text-emerald-600 text-xs font-bold">✓ ผ่านแล้ว</span>
                          ) : (
                            <span className="text-slate-400 text-xs">🔒</span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] font-bold text-slate-500">สะสม {fmt(tierItem.threshold_points_spent)} พ้อยท์</div>
                        <div className="mt-3 space-y-1.5 border-t border-slate-200/60 pt-2.5 text-[11px] font-semibold text-slate-600">
                          <div>● ส่วนลด {tierItem.discount_percent}%</div>
                          {tierItem.priority_support ? <div>● ซัพพอร์ตด่วน Priority</div> : null}
                          {tierItem.early_access_minutes > 0 ? <div>● Flash Sale ก่อน {tierItem.early_access_minutes} น.</div> : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* 4. SECURITY TAB */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm space-y-6">
            <SectionTitle title="เปลี่ยนรหัสผ่าน" subtitle="ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร และเป็นภาษาอังกฤษ/ASCII" />

            <form onSubmit={changePassword} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">รหัสผ่านปัจจุบัน</label>
                <div className="relative">
                  <input
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่านเดิม"
                    type={showOldPassword ? 'text' : 'password'}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs outline-none focus:border-sky-400 focus:bg-white pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1"
                    title={showOldPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showOldPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">รหัสผ่านใหม่</label>
                <div className="relative">
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                    type={showNewPassword ? 'text' : 'password'}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs outline-none focus:border-sky-400 focus:bg-white pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1"
                    title={showNewPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showNewPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 2FA Method Selector */}
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">🛡️ เลือกวิธียืนยันรหัสความปลอดภัย (2FA):</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTwoFactorMethod('email')}
                    className={`flex items-center justify-center gap-2 rounded-xl p-2.5 text-xs font-bold transition border cursor-pointer ${
                      twoFactorMethod === 'email'
                        ? 'border-sky-500 bg-white text-sky-700 shadow-sm ring-1 ring-sky-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <span>✉️</span>
                    <span>รหัส OTP ผ่าน Gmail</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTwoFactorMethod('discord')}
                    disabled={!discordLinked}
                    className={`flex items-center justify-center gap-2 rounded-xl p-2.5 text-xs font-bold transition border cursor-pointer ${
                      twoFactorMethod === 'discord'
                        ? 'border-[#5865F2] bg-white text-[#5865F2] shadow-sm ring-1 ring-[#5865F2]/40'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    <span>🎮</span>
                    <span>Discord Bot DM {!discordLinked ? '(ยังไม่ผูก)' : ''}</span>
                  </button>
                </div>

                {/* 2FA Body: Gmail Option */}
                {twoFactorMethod === 'email' && (
                  <div className="space-y-2 pt-2 border-t border-sky-100 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-600">
                        ส่งรหัสไปที่: <strong className="text-slate-900">{user?.email || 'Gmail ของคุณ'}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={requestEmailPasswordCode}
                        disabled={pwEmailStatus === 'sending' || emailCountdown > 0}
                        className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50 cursor-pointer shadow-2xs"
                      >
                        {pwEmailStatus === 'sending'
                          ? 'กำลังส่ง...'
                          : emailCountdown > 0
                            ? `ส่งใหม่ใน (${emailCountdown}s)`
                            : 'ส่งรหัส OTP เข้า Gmail'}
                      </button>
                    </div>

                    <input
                      value={emailPasswordCode}
                      onChange={(e) => setEmailPasswordCode(e.target.value)}
                      placeholder="กรอกรหัส OTP 6 หลักที่ได้รับใน Gmail"
                      maxLength={6}
                      inputMode="numeric"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-mono font-bold tracking-widest outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                )}

                {/* 2FA Body: Discord Option */}
                {twoFactorMethod === 'discord' && discordLinked && (
                  <div className="space-y-2 pt-2 border-t border-sky-100 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-600">
                        ส่งไปที่ Discord: <strong className="text-slate-900">{discordLink?.link?.discord_username || 'Discord DM'}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={requestDiscordPasswordCode}
                        disabled={pwDiscordStatus === 'sending'}
                        className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50 cursor-pointer shadow-2xs"
                      >
                        {pwDiscordStatus === 'sending' ? 'กำลังส่งรหัส...' : 'ส่งรหัสไปที่ Discord'}
                      </button>
                    </div>

                    <input
                      value={discordPasswordCode}
                      onChange={(e) => setDiscordPasswordCode(e.target.value)}
                      placeholder="รหัสยืนยัน 6 หลักจาก Discord DM"
                      maxLength={6}
                      inputMode="numeric"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-mono font-bold tracking-widest outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                )}
              </div>

              {/* Strength Meter */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-bold">ความแข็งแรงของรหัสผ่าน:</span>
                  <span className={strength.level === 'strong' ? 'text-emerald-600 font-bold' : strength.level === 'medium' ? 'text-amber-600 font-bold' : 'text-slate-500'}>
                    {strength.label}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full ${strengthColorClass} transition-all duration-300`} style={{ width: strengthWidth }} />
                </div>
              </div>

              {pwErrorText ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  ⚠️ {pwErrorText}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={pwStatus === 'submitting' || !newPassword || !oldPassword}
                className="rounded-xl bg-sky-600 px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
              >
                {pwStatus === 'submitting' ? 'กำลังเปลี่ยน...' : 'ยืนยันเปลี่ยนรหัสผ่าน'}
              </button>
            </form>
          </section>

          {/* ── 2FA Security Hub Section ── */}
          <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm space-y-6">
            <SectionTitle
              title="การยืนยันตัวตน 2 ขั้นตอน (Two-Factor Authentication - 2FA)"
              subtitle="เพิ่มความปลอดภัยสูงสุดให้กับบัญชีของคุณ ระบบจะขอรหัสยืนยัน 6 หลักทุกครั้งที่เข้าสู่ระบบ"
            />

            {/* Current 2FA Status Card */}
            <div className="rounded-2xl border p-5 transition-all bg-slate-50/70 border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl ${
                    twoFactorInfo.enabled
                      ? twoFactorInfo.type === 'totp' ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20' : 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    {twoFactorInfo.enabled ? (twoFactorInfo.type === 'totp' ? '📱' : '✉️') : '🛡️'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900">
                        {twoFactorInfo.enabled
                          ? twoFactorInfo.type === 'totp' ? 'Google Authenticator / Authy' : 'รหัส OTP ทางอีเมล (Gmail)'
                          : 'ระบบ 2FA ปิดใช้งานอยู่'}
                      </span>
                      {twoFactorInfo.enabled ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-200">
                          🟢 เปิดใช้งานแล้ว
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black text-slate-600">
                          ⚪ ปิดอยู่
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {twoFactorInfo.enabled
                        ? `เปิดใช้งานเมื่อ: ${formatDate(twoFactorInfo.confirmed_at)} • รหัสสำรองฉุกเฉินคงเหลือ: ${twoFactorInfo.backup_codes_count} ชุด`
                        : 'แนะนำให้เปิดใช้งานเพื่อป้องกันการถูกแฮ็กหรือเข้าถึงบัญชีโดยไม่ได้รับอนุญาต'}
                    </p>
                  </div>
                </div>

                {twoFactorInfo.enabled ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRegenPassword('')
                        setRegenError('')
                        setRegenBackupCodes([])
                        setBackupCodesModalOpen(true)
                      }}
                      className="rounded-xl border border-sky-300 bg-white px-3.5 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 transition cursor-pointer"
                    >
                      🔑 รหัสสำรองฉุกเฉิน ({twoFactorInfo.backup_codes_count})
                    </button>
                    <button
                      type="button"
                      onClick={handleRevokeAllTrustedDevices}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                      title="ยกเลิกการจดจำอุปกรณ์เบราว์เซอร์ทั้งหมด ครั้งต่อไปจะต้องยืนยัน 2FA ใหม่ทุกเครื่อง"
                    >
                      🛡️ ยกเลิกอุปกรณ์ที่จำไว้ทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDisable2faPassword('')
                        setDisable2faCode('')
                        setDisable2faError('')
                        setDisable2faOtpSentMsg('')
                        setDisable2faModalOpen(true)
                      }}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                    >
                      ปิดใช้งาน 2FA
                    </button>
                  </div>
                ) : null}
              </div>

              {/* 2FA Enable Options (when disabled) */}
              {!twoFactorInfo.enabled && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 pt-4 border-t border-slate-200/80">
                  {/* Option 1: Authenticator App */}
                  <div className="rounded-2xl border border-indigo-100 bg-white p-4 space-y-3 shadow-2xs hover:border-indigo-300 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">📱</span>
                      <div>
                        <div className="text-xs font-black text-slate-900">แอป Authenticator (แนะนำ)</div>
                        <div className="text-[11px] text-slate-500">Google Authenticator, Authy, Microsoft</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      สแกน QR Code แล้วรับรหัส 6 หลักจากแอป ทำงานได้แม้ออฟไลน์ ปลอดภัยและรวดเร็วที่สุด
                    </p>
                    <button
                      type="button"
                      onClick={startTotpSetup}
                      className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer"
                    >
                      + ตั้งค่าผ่านแอป Authenticator
                    </button>
                  </div>

                  {/* Option 2: Email OTP */}
                  <div className="rounded-2xl border border-sky-100 bg-white p-4 space-y-3 shadow-2xs hover:border-sky-300 transition">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">✉️</span>
                      <div>
                        <div className="text-xs font-black text-slate-900">รหัส OTP ผ่าน Gmail</div>
                        <div className="text-[11px] text-slate-500">ส่งรหัสยืนยัน 6 หลักเข้ากล่องจดหมาย</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      ส่งรหัส OTP 6 หลักไปยัง {user?.email || 'Gmail ของคุณ'} ทุกครั้งที่เข้าสู่ระบบ
                    </p>
                    <button
                      type="button"
                      onClick={startEmail2faSetup}
                      className="w-full rounded-xl bg-sky-600 py-2 text-xs font-bold text-white shadow-xs hover:bg-sky-700 transition cursor-pointer"
                    >
                      + ตั้งค่าผ่าน Email OTP
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Active Sessions & Device Management */}
          <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm space-y-4">
            <SectionTitle
              title="อุปกรณ์และเซสชันที่เข้าสู่ระบบ (Active Sessions)"
              subtitle="รายการอุปกรณ์ที่กำลังล็อกอินค้างอยู่ในระบบ สามารถเลือกตัดการเชื่อมต่อได้ทันที"
              action={
                sessions.length > 1 ? (
                  <button
                    type="button"
                    onClick={revokeOtherSessions}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                  >
                    🚪 ออกจากระบบอุปกรณ์อื่นทั้งหมด
                  </button>
                ) : null
              }
            />

            {sessionsLoading ? (
              <div className="text-center py-6 text-slate-400 text-xs font-bold">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent mr-2" />
                กำลังโหลดข้อมูลอุปกรณ์...
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs font-bold">
                ไม่พบข้อมูลเซสชัน
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => {
                  const isMobile = (s.user_agent || '').toLowerCase().includes('mobile') || (s.user_agent || '').toLowerCase().includes('iphone') || (s.user_agent || '').toLowerCase().includes('android')
                  return (
                    <div
                      key={s.token_hash}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                        s.is_current
                          ? 'border-sky-300 bg-sky-50/50 shadow-xs'
                          : 'border-slate-200/80 bg-white hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${
                          s.is_current ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isMobile ? '📱' : '💻'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{s.device_name}</span>
                            {s.is_current ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                                🟢 อุปกรณ์เครื่องนี้
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span className="font-mono">IP: {s.ip_address}</span>
                            <span>•</span>
                            <span>ใช้งานล่าสุด: {formatDate(s.last_active_at || s.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      {!s.is_current ? (
                        <button
                          type="button"
                          onClick={() => revokeSession(s.token_hash)}
                          className="self-end sm:self-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition cursor-pointer"
                        >
                          ตัดการเชื่อมต่อ
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 5. DISCORD TAB */}
      {activeTab === 'discord' && (
        <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm space-y-6">
          <SectionTitle
            title="เชื่อมต่อบัญชี Discord"
            subtitle="เชื่อมโยง Discord ID เพื่อรับแจ้งเตือน ยืนยันตัวตน 2FA และรับสิทธิพิเศษ"
            action={discordBot?.invite_url ? <a href={discordBot.invite_url} target="_blank" rel="noreferrer" className="ui-btn h-8 px-3 text-xs font-bold">เชิญบอทเข้าเซิร์ฟเวอร์</a> : null}
          />

          {discordLinked ? (
            <div className="space-y-4 max-w-lg">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">LINKED DISCORD ACCOUNT</div>
                <div className="mt-1 font-black text-base text-slate-900">{discordLink?.link?.discord_username || discordLink?.link?.discord_user_id}</div>
                <div className="mt-0.5 text-xs text-slate-500 font-medium">เชื่อมต่อเมื่อ: {formatDate(discordLink?.link?.linked_at)}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={refreshDiscordLink} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
                  รีเฟรชสถานะ
                </button>
                <button
                  type="button"
                  onClick={unlinkDiscord}
                  disabled={discordStatus === 'unlinking'}
                  className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                >
                  {discordStatus === 'unlinking' ? 'กำลังยกเลิก...' : 'ยกเลิกการเชื่อมต่อ'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-lg">
              <button
                type="button"
                onClick={createDiscordCode}
                disabled={discordStatus === 'submitting'}
                className="rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-black text-white shadow-md hover:bg-sky-700 disabled:opacity-50"
              >
                {discordStatus === 'submitting' ? 'กำลังสร้างรหัส...' : '+ สร้างรหัสเชื่อมต่อ Discord'}
              </button>

              {discordCode?.code ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">LINK CODE</div>
                  <div className="font-mono text-3xl font-black tracking-widest text-sky-600">{discordCode.code}</div>
                  <div className="rounded-xl border border-sky-200 bg-white p-3 font-mono text-xs font-bold text-slate-800 shadow-xs select-all">
                    {discordCommand}
                  </div>
                  <div className="text-[11px] text-slate-500">นำคำสั่งด้านบนไปพิมพ์ในเซิร์ฟเวอร์ Discord ของร้าน (หมดอายุ {formatDate(discordCode.expires_at)})</div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={copyDiscordCommand} className="rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-sky-700">
                      คัดลอกคำสั่ง
                    </button>
                    <button type="button" onClick={refreshDiscordLink} className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      ตรวจสอบสถานะ
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}

      {/* 6. NOTIFICATIONS TAB */}
      {activeTab === 'notifications' && (
        <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm space-y-4">
          <SectionTitle title="การตั้งค่าการแจ้งเตือน" subtitle="เลือกประเภทข่าวสารและอัปเดตที่ต้องการรับ" />

          <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
            {NOTIFICATION_PREFERENCE_ROWS.map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 text-xs font-bold text-slate-800 hover:bg-sky-50 cursor-pointer transition">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={notificationPreferences?.[key] === true}
                  disabled={preferencesStatus === 'submitting'}
                  onChange={(e) => {
                    const next = normalizeNotificationPreferences({ ...(notificationPreferences || {}), [key]: e.target.checked })
                    setNotificationPreferences(next)
                    saveNotificationPreferences(next)
                  }}
                  className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {/* 7. WISHLIST TAB */}
      {activeTab === 'wishlist' && (
        <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm space-y-4">
          <SectionTitle title="รายการสินค้าที่ติดตาม (Wishlist)" subtitle="สินค้าที่คุณบันทึกไว้ พร้อมสถานะสต็อกล่าสุด" />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {wishlist.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-400 sm:col-span-2 xl:col-span-3">
                ยังไม่มีสินค้าใน Wishlist
              </div>
            ) : null}

            {wishlist.map((item) => (
              <Link key={item.product_id} to={`/product/${item.product_id}`} className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 hover:border-sky-200 hover:bg-sky-50">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-14 w-14 rounded-xl object-cover border bg-white" />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-xl bg-sky-100 text-xs font-black text-sky-700">ITEM</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-slate-900">{item.name}</div>
                  <div className="mt-1 text-[11px] font-bold text-sky-600">{formatWishlistStockStatus(item.stock_status)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 8. HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title="ธุรกรรมพ้อยท์ล่าสุด"
              subtitle="ประวัติการเข้า-ออกของพ้อยท์"
              action={<Link to="/history/topups" className="text-xs font-bold text-sky-600 hover:text-sky-800">ดูทั้งหมด →</Link>}
            />
            <div className="space-y-2">
              {tx.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">ยังไม่มีรายการ</div> : null}
              {tx.slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">{txLabel(item)}</div>
                    <div className="text-[10px] text-slate-400">{formatDate(item.created_at)}</div>
                  </div>
                  <div className={`text-xs font-black ${item.type === 'credit' ? 'text-emerald-600' : 'text-sky-600'}`}>
                    {item.type === 'credit' ? '+' : '-'}{fmt(item.points)} P
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-sky-200 bg-white p-6 shadow-sm">
            <SectionTitle
              title="คำสั่งซื้อล่าสุด"
              subtitle="รายการสั่งซื้อสินค้า"
              action={<Link to="/history/purchases" className="text-xs font-bold text-sky-600 hover:text-sky-800">ดูทั้งหมด →</Link>}
            />
            <div className="space-y-2">
              {orders.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">ยังไม่มีรายการสั่งซื้อ</div> : null}
              {orders.slice(0, 8).map((order) => (
                <Link key={`${order.id}-${order.product_id}`} to={`/history/orders/${order.id}`} className="block rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3 hover:bg-sky-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-slate-900">{order.product_name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500 font-mono">{order.ref || `#${order.id}`} • {order.qty} ชิ้น</div>
                    </div>
                    <div className="text-xs font-black text-sky-600 shrink-0">{fmt(Number(order.unit_price_points) * Number(order.qty))} P</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Danger Zone: Delete Account ── */}
      <section className="rounded-3xl border border-rose-200 bg-rose-50/40 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-black text-rose-800">โซนอันตราย (Danger Zone)</h3>
          <p className="mt-0.5 text-xs text-rose-600">การลบบัญชีจะลบประวัติการสั่งซื้อ พ้อยท์ และข้อมูลทั้งหมดถาวร ไม่สามารถกู้คืนได้</p>
        </div>
        <button
          type="button"
          onClick={() => setDeleteModalOpen(true)}
          className="rounded-xl border border-rose-300 bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-700 shadow-xs"
        >
          ลบบัญชีผู้ใช้
        </button>
      </section>

      {/* ── Delete Account Modal ── */}
      {deleteModalOpen && typeof document !== 'undefined' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl animate-scaleIn">
            <h3 className="text-base font-black text-slate-900">ยืนยันการลบบัญชีผู้ใช้</h3>
            <p className="mt-1 text-xs text-slate-600">กรุณากรอกรหัสผ่านเพื่อยืนยันการลบบัญชีถาวร</p>
            <div className="mt-4 space-y-3">
              <input
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="รหัสผ่านปัจจุบัน"
                type="password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs outline-none"
              />
              {discordLinked ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2">
                  <div className="text-xs font-bold text-sky-900">ต้องยืนยันรหัส OTP จาก Discord DM</div>
                  <button type="button" onClick={requestDeleteDiscordCode} disabled={deleteDiscordSent} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">
                    {deleteDiscordSent ? 'ส่งรหัสแล้ว' : 'ขอรหัส OTP'}
                  </button>
                  <input
                    value={deleteDiscordCode}
                    onChange={(e) => setDeleteDiscordCode(e.target.value)}
                    placeholder="รหัส OTP 6 หลัก"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono"
                  />
                </div>
              ) : null}
            </div>

            {deleteError ? <div className="mt-3 text-xs font-bold text-rose-600">{deleteError}</div> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmDeleteAccount}
                disabled={deleteStatus === 'submitting' || !deletePassword}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteStatus === 'submitting' ? 'กำลังลบ...' : 'ยืนยันลบบัญชี'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 2FA: TOTP Setup Modal ── */}
      {totpModalOpen && typeof document !== 'undefined' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl border border-indigo-200 bg-white p-6 shadow-2xl animate-scaleIn my-8">
            {totpSetupStep === 1 ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-2xl text-indigo-600">
                    📱
                  </div>
                  <h3 className="text-lg font-black text-slate-900">ตั้งค่า Google Authenticator / Authy</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    สแกน QR Code นี้ด้วยแอป Authenticator บนมือถือของคุณ
                  </p>
                </div>

                {totpSetupData?.qr_code_url ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <img
                      src={totpSetupData.qr_code_url}
                      alt="TOTP QR Code"
                      className="w-48 h-48 rounded-xl shadow-xs border bg-white p-2"
                    />
                    <div className="mt-3 text-center w-full">
                      <div className="text-[11px] font-bold text-slate-400">หรือกรอก Secret Key ด้วยตนเอง:</div>
                      <div className="mt-1 flex items-center justify-center gap-2">
                        <code className="rounded-lg bg-slate-200/70 px-2.5 py-1 text-xs font-mono font-bold text-slate-800 tracking-wider select-all">
                          {totpSetupData.secret}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(totpSetupData.secret)
                            showToast('คัดลอก Secret Key แล้ว')
                          }}
                          className="rounded-lg border border-slate-300 bg-white p-1 text-xs text-slate-600 hover:bg-slate-50"
                          title="คัดลอก"
                        >
                          📋
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-xs font-bold">
                    กำลังสร้าง QR Code...
                  </div>
                )}

                {totpError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                    ⚠️ {totpError}
                  </div>
                ) : null}

                <form onSubmit={confirmTotpSetup} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      กรอกรหัส 6 หลักจากแอปพลิเคชันเพื่อยืนยัน:
                    </label>
                    <input
                      type="text"
                      value={totpInputCode}
                      onChange={(e) => setTotpInputCode(e.target.value)}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      required
                      autoFocus
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-lg font-mono font-black tracking-widest outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setTotpModalOpen(false)}
                      className="w-1/3 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={totpSubmitting || !totpInputCode.trim()}
                      className="w-2/3 rounded-xl bg-indigo-600 py-2.5 text-xs font-black text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                    >
                      {totpSubmitting ? 'กำลังตรวจสอบ...' : 'ยืนยันและเปิดใช้งาน'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Step 2: Backup Codes Display */
              <div className="space-y-4 animate-fade-in">
                <div className="text-center">
                  <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600">
                    🎉
                  </div>
                  <h3 className="text-lg font-black text-slate-900">เปิดใช้งาน 2FA สำเร็จ!</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    กรุณาบันทึกรหัสสำรองฉุกเฉิน (Backup Codes) เหล่านี้เก็บไว้ในที่ปลอดภัย
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                  <div className="text-xs font-bold text-amber-900">
                    ⚠️ สำคัญมาก: หากคุณทำโทรศัพท์หายหรือไม่สามารถเปิดแอปได้ คุณจะต้องใช้รหัสเหล่านี้ในการเข้าสู่ระบบ (แต่ละรหัสใช้ได้ครั้งเดียว)
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-amber-200/60">
                    {(totpSetupData?.backup_codes || []).map((code, idx) => (
                      <div key={idx} className="font-mono text-xs font-black text-slate-800 text-center py-1 bg-slate-50 rounded-lg select-all">
                        {code}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const txt = (totpSetupData?.backup_codes || []).join('\n')
                        navigator.clipboard.writeText(txt)
                        showToast('คัดลอกรหัสสำรองทั้งหมดแล้ว')
                      }}
                      className="flex-1 rounded-xl border border-amber-300 bg-white py-2 text-xs font-bold text-amber-800 hover:bg-amber-100/50 cursor-pointer"
                    >
                      📋 คัดลอกทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const txt = `VxperS Store - 2FA Backup Codes\nGenerated at: ${new Date().toISOString()}\n\n` + (totpSetupData?.backup_codes || []).join('\n')
                        const blob = new Blob([txt], { type: 'text/plain' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `vxpers-backup-codes-${Date.now()}.txt`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="flex-1 rounded-xl border border-amber-300 bg-white py-2 text-xs font-bold text-amber-800 hover:bg-amber-100/50 cursor-pointer"
                    >
                      💾 ดาวน์โหลด .txt
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTotpModalOpen(false)}
                  className="w-full rounded-xl bg-slate-900 py-3 text-xs font-black text-white hover:bg-slate-800 cursor-pointer"
                >
                  ฉันบันทึกรหัสเรียบร้อยแล้ว (ปิดหน้าต่าง)
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── 2FA: Email 2FA Setup Modal ── */}
      {email2faModalOpen && typeof document !== 'undefined' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl border border-sky-200 bg-white p-6 shadow-2xl animate-scaleIn my-8">
            {email2faStep === 1 ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-sky-50 text-2xl text-sky-600">
                    ✉️
                  </div>
                  <h3 className="text-lg font-black text-slate-900">เปิดใช้งาน 2FA ผ่าน Email OTP</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    เราได้ส่งรหัส OTP 6 หลักไปยังอีเมล <strong>{user?.email}</strong>
                  </p>
                </div>

                {email2faError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                    ⚠️ {email2faError}
                  </div>
                ) : null}

                <form onSubmit={confirmEmail2faSetup} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      กรอกรหัส OTP 6 หลักจาก Gmail:
                    </label>
                    <input
                      type="text"
                      value={email2faInputCode}
                      onChange={(e) => setEmail2faInputCode(e.target.value)}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      required
                      autoFocus
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-lg font-mono font-black tracking-widest outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEmail2faModalOpen(false)}
                      className="w-1/3 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={email2faSubmitting || !email2faInputCode.trim()}
                      className="w-2/3 rounded-xl bg-sky-600 py-2.5 text-xs font-black text-white shadow-md hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
                    >
                      {email2faSubmitting ? 'กำลังตรวจสอบ...' : 'ยืนยันและเปิดใช้งาน'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Step 2: Backup Codes */
              <div className="space-y-4 animate-fade-in">
                <div className="text-center">
                  <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600">
                    🎉
                  </div>
                  <h3 className="text-lg font-black text-slate-900">เปิดใช้งาน Email 2FA สำเร็จ!</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    กรุณาบันทึกรหัสสำรองฉุกเฉิน (Backup Codes) เหล่านี้เก็บไว้
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-amber-200/60">
                    {(totpSetupData?.backup_codes || []).map((code, idx) => (
                      <div key={idx} className="font-mono text-xs font-black text-slate-800 text-center py-1 bg-slate-50 rounded-lg select-all">
                        {code}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const txt = (totpSetupData?.backup_codes || []).join('\n')
                      navigator.clipboard.writeText(txt)
                      showToast('คัดลอกรหัสสำรองทั้งหมดแล้ว')
                    }}
                    className="w-full rounded-xl border border-amber-300 bg-white py-2 text-xs font-bold text-amber-800 hover:bg-amber-100/50 cursor-pointer"
                  >
                    📋 คัดลอกรหัสสำรองทั้งหมด
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setEmail2faModalOpen(false)}
                  className="w-full rounded-xl bg-slate-900 py-3 text-xs font-black text-white hover:bg-slate-800 cursor-pointer"
                >
                  ฉันบันทึกรหัสเรียบร้อยแล้ว (ปิดหน้าต่าง)
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── 2FA: Disable 2FA Modal ── */}
      {disable2faModalOpen && typeof document !== 'undefined' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200">
                <span className="text-xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">ยืนยันปิดการใช้งาน 2FA</h3>
                <p className="text-[11px] text-slate-500">
                  {twoFactorInfo.type === 'email'
                    ? 'กรุณากรอกรหัส OTP จากอีเมล และรหัสผ่านเพื่อยืนยัน'
                    : 'กรุณากรอกรหัส Authenticator และรหัสผ่านเพื่อยืนยัน'}
                </p>
              </div>
            </div>

            <form onSubmit={handleDisable2FA} className="mt-5 space-y-4">
              {/* If Email 2FA: OTP requesting section */}
              {twoFactorInfo.type === 'email' ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700">รหัสยืนยัน OTP ทางอีเมล</span>
                    <button
                      type="button"
                      onClick={handleSendDisable2faEmailOtp}
                      disabled={disable2faCooldown > 0 || disable2faSendingOtp}
                      className="rounded-xl border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-bold text-sky-600 shadow-2xs hover:bg-sky-50 disabled:opacity-50 transition cursor-pointer"
                    >
                      {disable2faSendingOtp
                        ? 'กำลังส่ง OTP...'
                        : disable2faCooldown > 0
                        ? `ขอรหัสใหม่ใน (${disable2faCooldown}s)`
                        : '📨 ขอรหัส OTP ทางอีเมล'}
                    </button>
                  </div>

                  {disable2faOtpSentMsg ? (
                    <div className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                      ✅ {disable2faOtpSentMsg}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 leading-tight">
                      กดปุ่ม "ขอรหัส OTP ทางอีเมล" เพื่อรับรหัส 6 หลักทาง {user?.email || 'Gmail'}
                    </p>
                  )}

                  <input
                    value={disable2faCode}
                    onChange={(e) => setDisable2faCode(e.target.value)}
                    placeholder="000000"
                    maxLength={10}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-center text-base font-mono font-black tracking-widest text-slate-900 outline-none focus:border-sky-400 focus:ring-3 focus:ring-sky-100"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    รหัส 6 หลักจากแอป Authenticator หรือรหัสสำรอง
                  </label>
                  <input
                    value={disable2faCode}
                    onChange={(e) => setDisable2faCode(e.target.value)}
                    placeholder="000000 หรือ ABCD-1234"
                    maxLength={10}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-center text-sm font-mono font-bold tracking-widest text-slate-900 outline-none focus:border-rose-400 focus:bg-white"
                  />
                </div>
              )}

              {/* Current Password Field */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">รหัสผ่านปัจจุบัน</label>
                <input
                  value={disable2faPassword}
                  onChange={(e) => setDisable2faPassword(e.target.value)}
                  placeholder="••••••••••••"
                  type="password"
                  required
                  autoFocus={twoFactorInfo.type !== 'email'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs outline-none focus:border-rose-400 focus:bg-white"
                />
              </div>

              {disable2faError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-bold text-rose-600">
                  ⚠️ {disable2faError}
                </div>
              ) : null}

              <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDisable2faModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={disable2faSubmitting || !disable2faPassword || !disable2faCode.trim()}
                  className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer transition"
                >
                  {disable2faSubmitting ? 'กำลังปิด 2FA...' : 'ยืนยันปิด 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── 2FA: Backup Codes Modal ── */}
      {backupCodesModalOpen && typeof document !== 'undefined' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl border border-sky-200 bg-white p-6 shadow-2xl animate-scaleIn my-8">
            <h3 className="text-base font-black text-slate-900">จัดการรหัสสำรองฉุกเฉิน (Backup Codes)</h3>
            <p className="mt-1 text-xs text-slate-600">
              ปัจจุบันคุณมีรหัสสำรองคงเหลือ <strong>{twoFactorInfo.backup_codes_count}</strong> ชุด
            </p>

            {regenBackupCodes.length > 0 ? (
              <div className="mt-4 space-y-3 animate-fade-in">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                  <div className="text-xs font-bold text-emerald-900">✓ รหัสสำรองฉุกเฉินชุดใหม่:</div>
                  <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-emerald-200/60">
                    {regenBackupCodes.map((c, i) => (
                      <div key={i} className="font-mono text-xs font-black text-slate-800 text-center py-1 bg-slate-50 rounded-lg select-all">
                        {c}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(regenBackupCodes.join('\n'))
                      showToast('คัดลอกรหัสสำรองแล้ว')
                    }}
                    className="w-full rounded-xl border border-emerald-300 bg-white py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100/50 cursor-pointer"
                  >
                    📋 คัดลอกทั้งหมด
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setBackupCodesModalOpen(false)}
                  className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-black text-white hover:bg-slate-800 cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegenBackupCodes} className="mt-4 space-y-3">
                <p className="text-xs text-slate-500">
                  หากต้องการสร้างรหัสสำรองชุดใหม่ 8 ชุด (รหัสเดิมจะถูกยกเลิกทั้งหมด) กรุณากรอกรหัสผ่านเพื่อยืนยัน:
                </p>
                <input
                  value={regenPassword}
                  onChange={(e) => setRegenPassword(e.target.value)}
                  placeholder="รหัสผ่านปัจจุบัน"
                  type="password"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs outline-none focus:border-sky-400 focus:bg-white"
                />
                {regenError ? <div className="text-xs font-bold text-rose-600">⚠️ {regenError}</div> : null}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setBackupCodesModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    ปิด
                  </button>
                  <button
                    type="submit"
                    disabled={regenSubmitting || !regenPassword}
                    className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-black text-white hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
                  >
                    {regenSubmitting ? 'กำลังสร้าง...' : '🔄 สร้างรหัสชุดใหม่'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Avatar Studio Modal ── */}
      <AvatarStudioModal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        currentAvatarUrl={user?.avatar_url}
        displayName={displayName}
        onSaveAvatar={handleSaveAvatar}
        saving={savingAvatar}
      />
    </div>
  )
}
