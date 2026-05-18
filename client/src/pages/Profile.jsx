import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { copyToClipboard, fetchJson, setAuthToken } from '../api.js'
import UserAvatar from '../components/UserAvatar.jsx'

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

function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-black text-white">{title}</h2>
        {subtitle ? <div className="mt-1 text-xs font-semibold text-white/42">{subtitle}</div> : null}
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

export default function Profile() {
  const nav = useNavigate()
  const loc = useLocation()
  const [me, setMe] = useState(null)
  const [tx, setTx] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [discordPasswordCode, setDiscordPasswordCode] = useState('')
  const [pwStatus, setPwStatus] = useState('idle')
  const [pwErrorText, setPwErrorText] = useState('')
  const [pwDiscordStatus, setPwDiscordStatus] = useState('idle')
  const [pwDiscordExpiresAt, setPwDiscordExpiresAt] = useState('')
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarData, setAvatarData] = useState('')
  const [profileStatus, setProfileStatus] = useState('idle')
  const [avatarStatus, setAvatarStatus] = useState('idle')
  const [discordLink, setDiscordLink] = useState(null)
  const [discordCode, setDiscordCode] = useState(null)
  const [discordStatus, setDiscordStatus] = useState('idle')
  const [discordCopyStatus, setDiscordCopyStatus] = useState('idle')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [meRes, txRes, ordersRes, discordRes] = await Promise.all([
          fetchJson('/api/me'),
          fetchJson('/api/me/transactions'),
          fetchJson('/api/me/orders'),
          fetchJson('/api/me/discord-link'),
        ])
        if (!cancelled) {
          setMe(meRes)
          setDisplayNameInput(String(meRes?.user?.display_name || ''))
          setTx(Array.isArray(txRes?.transactions) ? txRes.transactions : [])
          setOrders(Array.isArray(ordersRes?.orders) ? ordersRes.orders : [])
          setDiscordLink(discordRes)
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
  }, [nav])

  useEffect(() => {
    const id = String(loc.hash || '').replace('#', '')
    if (!id) return
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loc.hash])

  const user = me?.user
  const wallet = me?.wallet
  const displayName = user?.display_name || user?.email?.split('@')?.[0] || user?.username || 'user'
  const currentAvatarUrl = String(avatarPreview || user?.avatar_url || '')
  const avatarUser = { ...user, avatar_url: currentAvatarUrl }
  const role = typeof user?.role === 'string' ? user.role.trim().toLowerCase() : 'user'
  const canAccessAdmin = role !== 'user'
  const shortTx = useMemo(() => tx.slice(0, 8), [tx])
  const shortOrders = useMemo(() => orders.slice(0, 6), [orders])
  const totalSpent = useMemo(() => orders.reduce((sum, order) => sum + (Number(order.unit_price_points) * Number(order.qty)), 0), [orders])
  const passwordValidLength = newPassword.length >= 8
  const passwordEnglishOnly = isEnglishOnlyPassword(newPassword)
  const strength = getPasswordStrengthMeta(newPassword)
  const strengthWidth = `${Math.max(0, Math.min(100, Math.round((strength.score / 5) * 100)))}%`
  const strengthColorClass = strength.level === 'strong' ? 'bg-emerald-400' : strength.level === 'medium' ? 'bg-yellow-300' : strength.level === 'weak' ? 'bg-red-400' : 'bg-white/20'
  const discordBot = discordCode?.bot || discordLink?.bot || {}
  const discordLinked = Boolean(discordLink?.linked && discordLink?.link)
  const discordCommand = discordCode?.command || (discordCode?.code ? `/link code:${discordCode.code}` : '')

  function onPickAvatarFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(String(file.type || ''))) {
      setAvatarStatus('invalid_type')
      return
    }
    if (Number(file.size || 0) > 6 * 1024 * 1024) {
      setAvatarStatus('too_large')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : ''
      if (!data) return
      setAvatarData(data)
      setAvatarPreview(data)
      setAvatarStatus('ready')
    }
    reader.onerror = () => setAvatarStatus('error')
    reader.readAsDataURL(file)
  }

  async function saveProfile() {
    if (profileStatus === 'submitting') return
    setProfileStatus('submitting')
    try {
      let avatarUrl = String(user?.avatar_url || '')
      if (avatarData) {
        const upload = await fetchJson('/api/me/avatar-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_data: avatarData }),
        })
        avatarUrl = String(upload?.avatar_url || '')
      }

      await fetchJson('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayNameInput, avatar_url: avatarUrl }),
      })

      const meRes = await fetchJson('/api/me')
      setMe(meRes)
      setDisplayNameInput(String(meRes?.user?.display_name || ''))
      setAvatarData('')
      setAvatarPreview('')
      setAvatarStatus('idle')
      setProfileStatus('success')
      window.dispatchEvent(new Event('app_refresh'))
      setTimeout(() => setProfileStatus('idle'), 1300)
    } catch (err) {
      if (err?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      if (err?.status === 413 || String(err?.data?.error || '') === 'image_too_large') {
        setAvatarStatus('too_large')
      }
      setProfileStatus('error')
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    if (pwStatus === 'submitting') return
    setPwErrorText('')

    if (discordLinked && !String(discordPasswordCode || '').trim()) {
      setPwStatus('error')
      setPwErrorText('กรอกรหัสยืนยันจาก Discord DM ก่อนเปลี่ยนรหัสผ่าน')
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
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, discord_code: discordPasswordCode }),
      })
      setOldPassword('')
      setNewPassword('')
      setDiscordPasswordCode('')
      setPwStatus('success')
      setPwDiscordStatus('idle')
      setPwDiscordExpiresAt('')
      setTimeout(() => setPwStatus('idle'), 1300)
    } catch (err) {
      if (err?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      const code = String(err?.data?.error || '')
      setPwStatus('error')
      if (code === 'weak_password') setPwErrorText('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      else if (code === 'invalid_password_charset') setPwErrorText('รหัสผ่านต้องใช้ภาษาอังกฤษหรือสัญลักษณ์ ASCII เท่านั้น')
      else if (code === 'invalid_old_password') setPwErrorText('รหัสผ่านเดิมไม่ถูกต้อง')
      else if (code === 'discord_code_required') setPwErrorText('ต้องใช้รหัสยืนยันจาก Discord DM ก่อน')
      else if (code === 'discord_code_invalid') setPwErrorText('รหัสยืนยันจาก Discord ไม่ถูกต้อง')
      else if (code === 'discord_code_expired') setPwErrorText('รหัสยืนยันจาก Discord หมดอายุแล้ว กรุณาขอรหัสใหม่')
      else setPwErrorText('เปลี่ยนรหัสผ่านไม่สำเร็จ')
    }
  }

  async function requestDiscordPasswordCode() {
    if (!discordLinked || pwDiscordStatus === 'sending') return
    setPwDiscordStatus('sending')
    setPwErrorText('')
    try {
      const res = await fetchJson('/api/me/password/discord-code', { method: 'POST' })
      setPwDiscordExpiresAt(String(res?.expires_at || ''))
      setPwDiscordStatus('sent')
    } catch (err) {
      if (err?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      const code = String(err?.data?.error || '')
      setPwDiscordStatus('error')
      if (code === 'discord_dm_failed') setPwErrorText('ส่ง DM ไม่สำเร็จ กรุณาเปิดรับข้อความจากบอทหรือสมาชิกเซิร์ฟเวอร์')
      else if (code === 'bot_not_ready') setPwErrorText('บอทยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง')
      else setPwErrorText('ส่งรหัสยืนยันไปที่ Discord ไม่สำเร็จ')
    }
  }

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
    } catch (err) {
      if (err?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
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
      setTimeout(() => setDiscordStatus('idle'), 1300)
    } catch (err) {
      if (err?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      setDiscordStatus('error')
    }
  }

  async function copyDiscordCommand() {
    const ok = await copyToClipboard(discordCommand)
    setDiscordCopyStatus(ok ? 'copied' : 'error')
    if (ok) setTimeout(() => setDiscordCopyStatus('idle'), 1300)
  }

  if (loading) {
    return (
      <div className="grid min-h-[460px] place-items-center rounded-3xl border border-white/[0.08] bg-white/[0.025]">
        <div className="text-sm font-bold text-white/55">กำลังโหลดโปรไฟล์...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[680px] rounded-3xl border border-white/[0.08] bg-white/[0.025] p-6 text-center">
        <div className="text-lg font-black text-white">โหลดโปรไฟล์ไม่สำเร็จ</div>
        <div className="mt-2 text-sm text-white/50">{error}</div>
        <button type="button" onClick={() => nav(0)} className="ui-btn-primary mt-5 h-11 px-5 text-sm font-black">ลองใหม่</button>
      </div>
    )
  }

  return (
    <div className="space-y-7 fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong p-4 sm:p-7">
        <div className="absolute inset-0 scanline opacity-35" />
        <div className="absolute inset-0 grid-pattern opacity-35" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/[0.08] blur-[90px]" />
        <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-red-500/[0.05] blur-[90px]" />

        <div className="motion-stagger relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <UserAvatar
              user={avatarUser}
              name={displayName}
              size={96}
              rounded="xl"
              className="shadow-[0_16px_50px_rgba(0,0,0,0.28)]"
            />
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">โปรไฟล์ผู้ใช้</div>
              <h1 className="mt-2 truncate text-4xl font-black text-white">{displayName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-white/55">{user?.email || user?.username || '-'}</span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-100">{role}</span>
              </div>
            </div>
          </div>

          <div className="motion-stagger grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="motion-price text-2xl font-black text-emerald-300">{fmt(wallet?.balance)}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">พ้อยท์</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-white">{orders.length}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">ออเดอร์</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-cyan-200">{fmt(totalSpent)}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">ใช้ไป</div>
            </div>
          </div>
        </div>
      </section>

      <section className="motion-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Link to="/topup/angpao" className="motion-card motion-hover rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-cyan-300/25 hover:bg-white/[0.055]">
          <div className="text-sm font-black text-white">เติมเงิน</div>
          <div className="mt-1 text-xs text-white/42">เพิ่มพ้อยท์เข้ากระเป๋า</div>
        </Link>
        <Link to="/inbox" className="motion-card motion-hover rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-cyan-300/25 hover:bg-white/[0.055]">
          <div className="text-sm font-black text-white">กล่องรับของ</div>
          <div className="mt-1 text-xs text-white/42">ดูสินค้าที่ได้รับ</div>
        </Link>
        <Link to="/history/purchases" className="motion-card motion-hover rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-cyan-300/25 hover:bg-white/[0.055]">
          <div className="text-sm font-black text-white">ประวัติซื้อ</div>
          <div className="mt-1 text-xs text-white/42">ติดตามรายการสินค้า</div>
        </Link>
        <Link to="/history/topups" className="motion-card motion-hover rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-cyan-300/25 hover:bg-white/[0.055]">
          <div className="text-sm font-black text-white">ประวัติเติมเงิน</div>
          <div className="mt-1 text-xs text-white/42">ตรวจสอบรายการเติม</div>
        </Link>
        <button
          type="button"
          onClick={() => {
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
          className="motion-card motion-hover rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 text-left transition hover:border-red-300/20 hover:bg-white/[0.055]"
        >
          <div className="text-sm font-black text-white">ออกจากระบบ</div>
          <div className="mt-1 text-xs text-white/42">กลับไปหน้าแรก</div>
        </button>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <div className="space-y-6">
          <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <SectionTitle
              title="Discord"
              subtitle="Link Discord with this website account"
              action={discordBot?.invite_url ? <a href={discordBot.invite_url} target="_blank" rel="noreferrer" className="ui-btn h-9 px-4 text-xs font-black">Invite bot</a> : null}
            />

            {discordLinked ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200/70">Linked account</div>
                  <div className="mt-2 break-all text-sm font-black text-white">{discordLink?.link?.discord_username || discordLink?.link?.discord_user_id}</div>
                  <div className="mt-1 text-xs font-semibold text-white/45">{formatDate(discordLink?.link?.linked_at)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={refreshDiscordLink} className="ui-btn h-11 px-5 text-sm font-black">Refresh</button>
                  <button type="button" onClick={unlinkDiscord} disabled={discordStatus === 'unlinking'} className="ui-btn h-11 px-5 text-sm font-black">
                    {discordStatus === 'unlinking' ? 'Unlinking...' : 'Unlink'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button type="button" onClick={createDiscordCode} disabled={discordStatus === 'submitting'} className="ui-btn-primary h-11 px-5 text-sm font-black">
                  {discordStatus === 'submitting' ? 'Generating...' : 'Generate link code'}
                </button>

                {discordCode?.code ? (
                  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/70">Link code</div>
                    <div className="mt-2 font-mono text-3xl font-black tracking-[0.12em] text-white">{discordCode.code}</div>
                    <div className="mt-3 break-all rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs font-bold text-white/70">{discordCommand}</div>
                    <div className="mt-2 text-xs font-semibold text-white/45">Expires {formatDate(discordCode.expires_at)}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={copyDiscordCommand} className="ui-btn h-10 px-4 text-xs font-black">Copy command</button>
                      <button type="button" onClick={refreshDiscordLink} className="ui-btn h-10 px-4 text-xs font-black">Check link</button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {!discordBot?.configured ? <div className="mt-4 rounded-2xl border border-yellow-300/15 bg-yellow-400/10 p-3 text-xs font-bold text-yellow-100/80">Discord bot is not configured on the server yet.</div> : null}
            {discordStatus === 'error' ? <div className="mt-3 text-xs font-bold text-cyan-200">Discord request failed</div> : null}
            {discordStatus === 'unlinked' ? <div className="mt-3 text-xs font-bold text-emerald-300">Discord unlinked</div> : null}
            {discordCopyStatus === 'copied' ? <div className="mt-3 text-xs font-bold text-emerald-300">Command copied</div> : null}
            {discordCopyStatus === 'error' ? <div className="mt-3 text-xs font-bold text-cyan-200">Copy failed</div> : null}
          </section>

          <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <SectionTitle
              title="แก้ไขโปรไฟล์"
              subtitle="เปลี่ยนชื่อที่แสดงและรูปโปรไฟล์"
              action={canAccessAdmin ? <Link to="/admin-v2" className="ui-btn h-9 px-4 text-xs font-black">Admin</Link> : null}
            />
            <div className="grid gap-4">
              <label className="grid gap-1">
                <span className="text-xs font-bold text-white/50">Username</span>
                <input value={user?.username || ''} readOnly disabled className="ui-field h-11 cursor-not-allowed opacity-50" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-bold text-white/50">Display name</span>
                <input value={displayNameInput} onChange={(event) => setDisplayNameInput(event.target.value)} placeholder="Display name" className="ui-field h-11" />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-bold text-white/50">รูปโปรไฟล์</span>
                <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={onPickAvatarFile} className="ui-field h-11 py-2 text-xs" />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={saveProfile} disabled={profileStatus === 'submitting'} className="ui-btn-primary h-11 px-5 text-sm font-black">
                  {profileStatus === 'submitting' ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
                </button>
                <button type="button" onClick={() => window.dispatchEvent(new Event('open_cookie_settings'))} className="ui-btn h-11 px-5 text-sm font-black">
                  Cookie Settings
                </button>
              </div>
              {avatarStatus === 'invalid_type' ? <div className="text-xs font-bold text-cyan-200">รองรับเฉพาะ JPG/PNG/WEBP</div> : null}
              {avatarStatus === 'too_large' ? <div className="text-xs font-bold text-cyan-200">ไฟล์ใหญ่เกิน 6MB</div> : null}
              {profileStatus === 'success' ? <div className="text-xs font-bold text-emerald-300">บันทึกสำเร็จ</div> : null}
              {profileStatus === 'error' ? <div className="text-xs font-bold text-cyan-200">บันทึกไม่สำเร็จ</div> : null}
            </div>
          </section>

          <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <SectionTitle title="เปลี่ยนรหัสผ่าน" subtitle="ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร และเป็น ASCII" />
            <form onSubmit={changePassword} className="space-y-3">
              <input value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} placeholder="รหัสผ่านเดิม" type="password" className="ui-field h-11" />
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="รหัสผ่านใหม่" type="password" className="ui-field h-11" />
              {discordLinked ? (
                <div className='rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-3'>
                  <div className='text-xs font-bold text-cyan-100/85'>บัญชีนี้ลิงก์ Discord อยู่ การเปลี่ยนรหัสผ่านต้องยืนยันรหัสจาก DM ของบอทก่อน</div>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <button type='button' onClick={requestDiscordPasswordCode} disabled={pwDiscordStatus === 'sending'} className='ui-btn h-10 px-4 text-xs font-black'>
                      {pwDiscordStatus === 'sending' ? 'กำลังส่งรหัส...' : 'ส่งรหัสยืนยันไปที่ Discord'}
                    </button>
                    {pwDiscordStatus === 'sent' && pwDiscordExpiresAt ? <div className='self-center text-xs font-semibold text-emerald-200'>ส่งแล้ว หมดอายุ {formatDate(pwDiscordExpiresAt)}</div> : null}
                  </div>
                  <input value={discordPasswordCode} onChange={(event) => setDiscordPasswordCode(event.target.value)} placeholder='รหัสยืนยัน 6 หลักจาก Discord DM' inputMode='numeric' className='ui-field mt-3 h-11' />
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-black/30">
                  <div className={`h-full ${strengthColorClass} transition-all duration-300`} style={{ width: strengthWidth }} />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/50">Password strength</span>
                  <span className={strength.level === 'strong' ? 'text-emerald-300' : strength.level === 'medium' ? 'text-yellow-200' : strength.level === 'weak' ? 'text-red-200' : 'text-white/45'}>{strength.label}</span>
                </div>
                <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                  <div className={passwordValidLength ? 'text-emerald-200' : 'text-white/50'}>อย่างน้อย 8 ตัว</div>
                  <div className={passwordEnglishOnly ? 'text-emerald-200' : 'text-white/50'}>ภาษาอังกฤษ/ASCII เท่านั้น</div>
                </div>
              </div>
              <button type="submit" disabled={pwStatus === 'submitting'} className="ui-btn-primary h-11 w-full text-sm font-black">
                {pwStatus === 'submitting' ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}
              </button>
              {pwStatus === 'success' ? <div className="text-xs font-bold text-emerald-300">เปลี่ยนรหัสผ่านสำเร็จ</div> : null}
              {pwStatus === 'error' ? <div className="text-xs font-bold text-cyan-200">{pwErrorText || 'เปลี่ยนไม่สำเร็จ'}</div> : null}
            </form>
          </section>
        </div>

        <div className="space-y-6">
          <section id="tx" className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <SectionTitle
              title="ธุรกรรมล่าสุด"
              subtitle="รายการพ้อยท์เข้าออกล่าสุด"
              action={<Link to="/history/topups" className="text-xs font-black text-cyan-200/80 hover:text-cyan-100">ดูทั้งหมด →</Link>}
            />
            <div className="space-y-2">
              {shortTx.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.08] p-5 text-center text-sm text-white/45">ยังไม่มีรายการ</div> : null}
              {shortTx.map((item) => (
                <div key={item.id} className="motion-card motion-hover flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.035] px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">{txLabel(item)}</div>
                    <div className="mt-1 truncate text-xs text-white/42">{formatDate(item.created_at)}</div>
                  </div>
                  <div className={item.type === 'credit' ? 'text-sm font-black text-emerald-300' : 'text-sm font-black text-cyan-200'}>
                    {item.type === 'credit' ? '+' : '-'}{fmt(item.points)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="purchases" className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <SectionTitle
              title="การซื้อสินค้าล่าสุด"
              subtitle="รายการที่เพิ่งซื้อและยอดรวม"
              action={<Link to="/history/purchases" className="text-xs font-black text-cyan-200/80 hover:text-cyan-100">ดูทั้งหมด →</Link>}
            />
            <div className="space-y-2">
              {shortOrders.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.08] p-5 text-center text-sm text-white/45">ยังไม่มีรายการสั่งซื้อ</div> : null}
              {shortOrders.map((order) => (
                <Link key={`${order.id}-${order.product_id}`} to={`/history/orders/${order.id}`} className="motion-card motion-hover block rounded-2xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 transition hover:border-cyan-300/20 hover:bg-white/[0.055]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-white">{order.product_name}</div>
                      <div className="mt-1 text-xs text-white/42">{order.ref || `#${order.id}`} • จำนวน {order.qty}</div>
                      <div className="mt-1 text-xs text-white/42">{formatDate(order.created_at)}</div>
                    </div>
                    <div className="shrink-0 text-sm font-black text-white">{fmt(Number(order.unit_price_points) * Number(order.qty))}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
