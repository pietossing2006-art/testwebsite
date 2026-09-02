import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { copyToClipboard, fetchJson, setAuthToken } from '../api.js'
import AnnRichText from '../components/AnnRichText.jsx'

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

function PageTab({ active, to, children }) {
  return (
    <Link
      to={to}
      className={`inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-xs font-black transition ${active
          ? 'border-sky-500 bg-sky-600 text-white shadow-xs'
          : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
        }`}
    >
      {children}
    </Link>
  )
}

function deliveryMeta(item) {
  const isFarm = item.fulfillment_type === 'farm_form' || Boolean(item.farm_status)
  const farmStatus = String(item.farm_status || '')
  const status = String(item.status || '')
  const farmCancelled = isFarm && (farmStatus === 'cancelled' || farmStatus === 'canceled')

  if (farmCancelled || status === 'cancelled') {
    return { text: 'ยกเลิก', cls: 'border-rose-200 bg-rose-50 text-rose-700', tone: 'red', canClaim: false, isFarm, farmCancelled: true }
  }
  if (item.delivery_kind === 'no_prize') {
    return { text: 'ไม่ได้รางวัล', cls: 'border-slate-200 bg-slate-100 text-slate-500', tone: 'slate', canClaim: false, isFarm, farmCancelled: false, isNoPrize: true }
  }
  if (status === 'claimed') {
    return { text: 'รับแล้ว', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', tone: 'emerald', canClaim: false, isFarm, farmCancelled: false }
  }
  if (status === 'pending_claim' || (isFarm && farmStatus === 'fulfilled')) {
    return { text: 'พร้อมรับ', cls: 'border-sky-300 bg-sky-500 text-white animate-pulse', tone: 'cyan', canClaim: true, isFarm, farmCancelled: false }
  }
  if (isFarm && farmStatus === 'in_progress') {
    return { text: 'กำลังดำเนินการ', cls: 'border-blue-200 bg-blue-50 text-blue-700', tone: 'blue', canClaim: false, isFarm, farmCancelled: false }
  }
  if (isFarm && farmStatus === 'pending') {
    return { text: 'รอดำเนินการ', cls: 'border-amber-200 bg-amber-50 text-amber-700', tone: 'amber', canClaim: false, isFarm, farmCancelled: false }
  }
  return { text: 'รอดำเนินการ', cls: 'border-amber-200 bg-amber-50 text-amber-700', tone: 'amber', canClaim: false, isFarm, farmCancelled: false }
}

function getMessageCategory(msg) {
  const text = `${msg.title || ''} ${msg.body || ''}`.toLowerCase()
  if (text.includes('คำสั่งซื้อ') || text.includes('จัดส่ง') || text.includes('order') || text.includes('สินค้า')) {
    return { id: 'order', label: 'คำสั่งซื้อ & จัดส่ง', icon: '🛍️', color: 'text-sky-700 bg-sky-50 border-sky-200' }
  }
  if (text.includes('เติมเงิน') || text.includes('พ้อยท์') || text.includes('point') || text.includes('topup') || text.includes('อั่งเปา')) {
    return { id: 'topup', label: 'การเงิน & พ้อยท์', icon: '💳', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  }
  if (text.includes('vip') || text.includes('โปร') || text.includes('กิจกรรม') || text.includes('flash sale') || text.includes('ส่วนลด')) {
    return { id: 'promo', label: 'VIP & โปรโมชัน', icon: '👑', color: 'text-amber-700 bg-amber-50 border-amber-200' }
  }
  return { id: 'system', label: 'ระบบ & ความปลอดภัย', icon: '🛡️', color: 'text-purple-700 bg-purple-50 border-purple-200' }
}

export default function Inbox() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [me, setMe] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claiming, setClaiming] = useState(null)
  const [claimingAll, setClaimingAll] = useState(false)
  const [revealed, setRevealed] = useState({})
  const [privacyMode, setPrivacyMode] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [toastMessage, setToastMessage] = useState('')

  // Sub Tab: 'deliveries' | 'direct_chat' | 'messages'
  const initialTab = searchParams.get('tab') === 'direct_chat' ? 'direct_chat' : searchParams.get('tab') === 'messages' ? 'messages' : 'deliveries'
  const [subTab, setSubTab] = useState(initialTab)
  const [deliveryFilter, setDeliveryFilter] = useState('all') // 'all' | 'ready' | 'claimed' | 'in_progress'
  const [query, setQuery] = useState('')

  // Direct Messages Stream State
  const [directMessages, setDirectMessages] = useState([])
  const [directLoading, setDirectLoading] = useState(false)
  const [unreadDirectCount, setUnreadDirectCount] = useState(0)

  // Notifications State
  const [messages, setMessages] = useState([])
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [msgCategoryFilter, setMsgCategoryFilter] = useState('all')

  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2200)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [meRes, inboxRes] = await Promise.all([fetchJson('/api/me'), fetchJson('/api/me/inbox')])
        if (cancelled) return
        const inboxItems = Array.isArray(inboxRes?.inbox) ? inboxRes.inbox : []
        const nextRevealed = {}
        for (const item of inboxItems) {
          if (item?.status === 'claimed' && item?.payload) nextRevealed[item.id] = item.payload
        }
        setMe(meRes)
        setItems(inboxItems)
        setRevealed((prev) => ({ ...nextRevealed, ...prev }))
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

  // Load Direct Messages
  async function loadDirectMessages() {
    setDirectLoading(true)
    try {
      let list = []
      try {
        const res = await fetchJson('/api/me/direct-messages')
        if (Array.isArray(res?.messages) && res.messages.length > 0) {
          list = res.messages
        }
      } catch {
        // ignore
      }

      // If direct-messages was empty or errored, fetch from /api/me/messages and filter direct/individual
      if (list.length === 0) {
        try {
          const res = await fetchJson('/api/me/messages')
          const allMsgs = Array.isArray(res?.messages) ? res.messages : []
          list = allMsgs.filter((m) => m.target_type === 'individual' || m.target_type === 'user')
        } catch {
          // ignore
        }
      }

      setDirectMessages(list)
      const unread = list.filter((m) => !m.is_read).length
      setUnreadDirectCount(unread)

      // Mark read automatically
      if (unread > 0) {
        await fetchJson('/api/me/direct-messages/read', { method: 'POST' }).catch(() => { })
        await fetchJson('/api/me/messages/read-all', { method: 'POST' }).catch(() => { })
        setUnreadDirectCount(0)
      }
    } catch {
      // ignore
    } finally {
      setDirectLoading(false)
    }
  }

  useEffect(() => {
    loadDirectMessages()
  }, [])

  useEffect(() => {
    if (subTab === 'direct_chat') {
      loadDirectMessages()
    }
  }, [subTab])

  // Load General Notifications
  useEffect(() => {
    if (subTab !== 'messages') return
    let cancelled = false
    async function loadMessages() {
      setMsgsLoading(true)
      try {
        const res = await fetchJson('/api/me/messages')
        if (!cancelled) {
          const list = Array.isArray(res?.messages) ? res.messages : []
          setMessages(list)
          setUnreadMsgCount(list.filter((m) => !m.is_read).length)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setMsgsLoading(false)
      }
    }
    loadMessages()
    return () => {
      cancelled = true
    }
  }, [subTab])

  const user = me?.user
  const displayName = useMemo(() => user?.display_name || user?.email?.split('@')?.[0] || user?.username || 'ผู้ใช้', [user])
  const readyCount = useMemo(() => items.filter((item) => deliveryMeta(item).canClaim).length, [items])
  const claimedCount = useMemo(() => items.filter((item) => String(item.status) === 'claimed' && item.delivery_kind !== 'no_prize').length, [items])
  const inProgressCount = useMemo(() => items.filter((item) => String(item.status) === 'pending_fulfillment' || item.farm_status === 'in_progress').length, [items])

  const visibleDeliveries = useMemo(() => {
    let list = items
    if (deliveryFilter === 'ready') list = list.filter((i) => deliveryMeta(i).canClaim)
    else if (deliveryFilter === 'claimed') list = list.filter((i) => String(i.status) === 'claimed' && i.delivery_kind !== 'no_prize')
    else if (deliveryFilter === 'in_progress') list = list.filter((i) => String(i.status) === 'pending_fulfillment' || i.farm_status === 'in_progress')

    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((item) =>
      `${item.product_name || ''} ${item.order_id || ''} ${item.product_option?.label || ''} ${revealed[item.id] || ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [items, deliveryFilter, query, revealed])

  const visibleDirectMessages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return directMessages
    return directMessages.filter((m) => `${m.title || ''} ${m.body || ''}`.toLowerCase().includes(q))
  }, [directMessages, query])

  const visibleMessages = useMemo(() => {
    let list = messages
    if (msgCategoryFilter !== 'all') {
      list = list.filter((m) => getMessageCategory(m).id === msgCategoryFilter)
    }
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((m) => `${m.title || ''} ${m.body || ''}`.toLowerCase().includes(q))
  }, [messages, msgCategoryFilter, query])

  // Single Item Claim
  async function claim(id) {
    if (claiming) return
    setClaiming(id)
    try {
      const res = await fetchJson(`/api/me/inbox/${id}/claim`, { method: 'POST' })
      setRevealed((prev) => ({ ...prev, [id]: res.payload }))
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: 'claimed', claimed_at: new Date().toISOString(), payload: res.payload }
            : item,
        ),
      )
      showToast('รับสินค้าเรียบร้อยแล้ว!')
    } catch {
      showToast('รับสินค้าไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setClaiming(null)
    }
  }

  // Claim All Ready Items
  async function claimAll() {
    if (claimingAll || readyCount === 0) return
    setClaimingAll(true)
    try {
      const res = await fetchJson('/api/me/inbox/claim-all', { method: 'POST' })
      if (res?.ok) {
        const nextRevealed = {}
        const claimedMap = {}
        for (const it of res.items || []) {
          nextRevealed[it.id] = it.payload
          claimedMap[it.id] = it.payload
        }
        setRevealed((prev) => ({ ...prev, ...nextRevealed }))
        setItems((prev) =>
          prev.map((item) =>
            claimedMap[item.id] !== undefined
              ? { ...item, status: 'claimed', claimed_at: new Date().toISOString(), payload: claimedMap[item.id] }
              : item,
          ),
        )
        showToast(`รับสินค้าสำเร็จทั้งหมด ${res.count || readyCount} รายการ!`)
      }
    } catch {
      showToast('รับสินค้าทั้งหมดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setClaimingAll(false)
    }
  }

  // Copy Single Payload / Message Text
  async function copyText(text, label = 'คัดลอกรหัสเรียบร้อยแล้ว') {
    const t = String(text || '').trim()
    if (!t) return
    try {
      await copyToClipboard(t)
      showToast(label)
    } catch {
      // ignore
    }
  }

  // Batch Export Claimed Keys
  async function exportClaimedKeys() {
    const claimedItems = items.filter((it) => it.status === 'claimed' && (revealed[it.id] || it.payload))
    if (claimedItems.length === 0) {
      showToast('ยังไม่มีรายการที่รับแล้ว')
      return
    }

    const lines = claimedItems.map(
      (it, idx) => `[#${idx + 1}] ${it.product_name} (${formatDate(it.claimed_at)})\n${revealed[it.id] || it.payload}\n`,
    )
    const blob = new Blob([lines.join('\n---\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vxpers-keys-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    showToast('ดาวน์โหลดไฟล์ข้อมูลสินค้าเรียบร้อย')
  }

  // Batch Copy All Claimed Keys
  async function copyAllClaimedKeys() {
    const claimedItems = items.filter((it) => it.status === 'claimed' && (revealed[it.id] || it.payload))
    if (claimedItems.length === 0) {
      showToast('ยังไม่มีรายการที่รับแล้ว')
      return
    }
    const text = claimedItems
      .map((it, idx) => `#${idx + 1} ${it.product_name}:\n${revealed[it.id] || it.payload}`)
      .join('\n\n')
    await copyToClipboard(text)
    showToast(`คัดลอกข้อมูลสินค้า ${claimedItems.length} รายการแล้ว`)
  }

  // Mark Message Read
  async function markRead(id) {
    try {
      await fetchJson(`/api/me/messages/${id}/read`, { method: 'POST' })
      const next = messages.map((m) => (m.id === id ? { ...m, is_read: true } : m))
      setMessages(next)
      setUnreadMsgCount(next.filter((m) => !m.is_read).length)
    } catch {
      // ignore
    }
  }

  // Mark All Messages Read
  async function markAllRead() {
    try {
      await fetchJson('/api/me/messages/read-all', { method: 'POST' })
      setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })))
      setUnreadMsgCount(0)
      showToast('อ่านข้อความทั้งหมดแล้ว')
    } catch {
      // ignore
    }
  }

  // Delete Message
  async function deleteMessage(id) {
    try {
      await fetchJson(`/api/me/messages/${id}`, { method: 'DELETE' })
      setMessages((prev) => prev.filter((m) => m.id !== id))
      setDirectMessages((prev) => prev.filter((m) => m.id !== id))
      showToast('ลบข้อความแล้ว')
    } catch {
      showToast('ลบข้อความไม่สำเร็จ')
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[150] rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl animate-fade-in">
          ✓ {toastMessage}
        </div>
      )}

      {/* ── Top Hero & Metric Highlights ── */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_70%_at_0%_0%,rgba(56,189,248,0.14),transparent_60%),radial-gradient(40%_60%_at_100%_10%,rgba(14,165,233,0.10),transparent_55%)]" />

        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-sky-600">ศูนย์จัดส่งสินค้าและกล่องรับของ</div>
            <h1 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">กล่องรับของ & แชทตรง</h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              รับคีย์สินค้าดิจิทัล ตรวจสอบข้อความตรงและรหัสลับจากแอดมินสำหรับ {displayName}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 sm:p-4 text-center">
              <div className="text-xl sm:text-2xl font-black text-slate-900">{items.length}</div>
              <div className="mt-0.5 text-[10px] font-bold text-slate-500">สินค้าทั้งหมด</div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 sm:p-4 text-center">
              <div className="text-xl sm:text-2xl font-black text-sky-600">{readyCount}</div>
              <div className="mt-0.5 text-[10px] font-bold text-sky-700">⚡ พร้อมรับ</div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 sm:p-4 text-center">
              <div className="text-xl sm:text-2xl font-black text-emerald-600">{claimedCount}</div>
              <div className="mt-0.5 text-[10px] font-bold text-emerald-700">✓ รับแล้ว</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Page Level Nav Tabs ── */}
      <nav className="grid gap-2.5 md:grid-cols-3">
        <PageTab to="/inbox" active>
          📦 กล่องรับของ & แชท
        </PageTab>
        <PageTab to="/history/purchases">🛍️ ประวัติการซื้อ</PageTab>
        <PageTab to="/history/topups">💳 ประวัติเติมเงิน</PageTab>
      </nav>

      {/* ── Sub Navigation Tabs (Deliveries vs Direct Chat vs Notifications) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-2">
          {/* Tab 1: Deliveries */}
          <button
            type="button"
            onClick={() => setSubTab('deliveries')}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition ${subTab === 'deliveries'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
          >
            <span>📦 สินค้าดิจิทัล</span>
            {readyCount > 0 ? (
              <span className="rounded-full bg-sky-400 px-1.5 py-0.2 text-[10px] font-extrabold text-slate-900 animate-pulse">
                {readyCount}
              </span>
            ) : (
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${subTab === 'deliveries' ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {items.length}
              </span>
            )}
          </button>

          {/* Tab 2: One-Way Direct Chat Stream from Staff */}
          <button
            type="button"
            onClick={() => setSubTab('direct_chat')}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition ${subTab === 'direct_chat'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
          >
            <span>💬 แชทตรงจากทีมงาน</span>
            {unreadDirectCount > 0 ? (
              <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-extrabold text-slate-900 animate-bounce">
                {unreadDirectCount}
              </span>
            ) : directMessages.length > 0 ? (
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${subTab === 'direct_chat' ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {directMessages.length}
              </span>
            ) : null}
          </button>

          {/* Tab 3: System Broadcasts & Notifications */}
          <button
            type="button"
            onClick={() => setSubTab('messages')}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition ${subTab === 'messages'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
          >
            <span>🔔 ประกาศ & แจ้งเตือน</span>
            {unreadMsgCount > 0 ? (
              <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-extrabold text-slate-900">
                {unreadMsgCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="relative w-full max-w-xs">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              subTab === 'deliveries'
                ? 'ค้นหาชื่อสินค้า รหัส หรือออเดอร์...'
                : subTab === 'direct_chat'
                  ? 'ค้นหาข้อความจากแอดมิน...'
                  : 'ค้นหาข้อความแจ้งเตือน...'
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2 pl-9 text-xs outline-none focus:border-sky-400 shadow-xs"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
            🔍
          </span>
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {/* ───────────────────────────────────────────── */}
      {/* ── 1. DELIVERIES TAB ── */}
      {/* ───────────────────────────────────────────── */}
      {subTab === 'deliveries' && (
        <section className="space-y-4">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sky-100 bg-white p-4 shadow-sm">
            {/* Status Filter Badges */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'ทั้งหมด', count: items.length },
                { id: 'ready', label: '⚡ พร้อมรับ', count: readyCount, highlight: readyCount > 0 },
                { id: 'claimed', label: '✓ รับแล้ว', count: claimedCount },
                { id: 'in_progress', label: '⏳ กำลังดำเนินการ', count: inProgressCount },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDeliveryFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${deliveryFilter === f.id
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  <span>{f.label}</span>
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${f.highlight ? 'bg-amber-400 text-slate-900 font-extrabold' : deliveryFilter === f.id ? 'bg-sky-800 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Batch Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {readyCount > 0 && (
                <button
                  type="button"
                  onClick={claimAll}
                  disabled={claimingAll}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-1.5 text-xs font-black text-white shadow-md hover:bg-sky-700 disabled:opacity-50"
                >
                  <span>⚡</span> {claimingAll ? 'กำลังรับ...' : `รับของทั้งหมด (${readyCount})`}
                </button>
              )}

              {claimedCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPrivacyMode((p) => !p)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    title={privacyMode ? 'แสดงรหัสผ่าน/Token' : 'ซ่อนรหัสผ่าน/Token เพื่อความปลอดภัย'}
                  >
                    <span>{privacyMode ? '👁️ แสดงรหัส' : '🔒 โหมดซ่อนรหัส'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={copyAllClaimedKeys}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <span>📋 คัดลอกทั้งหมด</span>
                  </button>

                  <button
                    type="button"
                    onClick={exportClaimedKeys}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <span>💾 บันทึก .txt</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Delivery List Stream */}
          {loading ? (
            <div className="grid min-h-[260px] place-items-center rounded-3xl border border-sky-100 bg-white p-8">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-sky-200 border-t-sky-600" />
                <div className="text-xs font-bold text-slate-500">กำลังโหลดกล่องรับของ...</div>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-6 text-center text-xs font-bold text-rose-700">
              ⚠️ โหลดข้อมูลไม่สำเร็จ: {error}
            </div>
          ) : visibleDeliveries.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/20 p-8 text-center">
              <div>
                <div className="text-4xl mb-2">🎁</div>
                <div className="text-base font-black text-slate-900">ไม่มีรายการในกล่องรับของ</div>
                <p className="mt-1 text-xs text-slate-500">
                  {query || deliveryFilter !== 'all'
                    ? 'ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา'
                    : 'เมื่อคุณสั่งซื้อสินค้าดิจิทัลหรือเปิดกล่องสุ่ม ของรางวัลจะมาแสดงที่นี่'}
                </p>
                <Link to="/categories" className="ui-btn-primary mt-4 inline-flex h-10 items-center px-4 text-xs font-bold">
                  เลือกซื้อสินค้า
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-1">
              {visibleDeliveries.map((item) => {
                const meta = deliveryMeta(item)
                const isClaimed = item.status === 'claimed'
                const payload = revealed[item.id] || item.payload
                const isCopied = copiedId === item.id

                return (
                  <div
                    key={item.id}
                    className={`relative overflow-hidden rounded-3xl border p-5 transition-all ${meta.canClaim
                        ? 'border-sky-300 bg-sky-50/30 shadow-md shadow-sky-500/10'
                        : meta.isNoPrize
                          ? 'border-slate-200/90 bg-slate-50/60 shadow-xs'
                          : 'border-slate-200/90 bg-white shadow-xs'
                      }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      {/* Product Info */}
                      <div className="flex items-start gap-3.5 min-w-0">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            className={`h-16 w-16 shrink-0 rounded-2xl border border-slate-200 object-cover bg-white shadow-xs ${meta.isNoPrize ? 'grayscale opacity-70' : ''}`}
                          />
                        ) : (
                          <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-black shadow-xs ${meta.isNoPrize ? 'bg-slate-100 text-slate-400' : 'bg-sky-100 text-sky-600'}`}>
                            {meta.isNoPrize ? '🧂' : '🎁'}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${meta.cls}`}>
                              {meta.text}
                            </span>
                            {item.order_id ? (
                              <span className="text-[11px] font-mono font-bold text-slate-500">
                                ออเดอร์ #{item.order_id}
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-1 truncate text-base font-black text-slate-900">
                            {item.product_name}
                          </h3>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-medium">
                            {item.product_option?.label ? (
                              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-slate-700 font-bold">
                                ตัวเลือก: {item.product_option.label}
                              </span>
                            ) : null}
                            <span>• จัดส่งเมื่อ: {formatDate(item.created_at)}</span>
                            {item.claimed_at ? <span>• รับเมื่อ: {formatDate(item.claimed_at)}</span> : null}
                          </div>
                        </div>
                      </div>

                      {/* Top Action Tools */}
                      {!meta.isNoPrize ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            to={`/support?order_id=${item.order_id || ''}&subject=${encodeURIComponent(`แจ้งปัญหาการรับสินค้า: ${item.product_name}`)}`}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                          >
                            🎧 แจ้งปัญหา
                          </Link>
                        </div>
                      ) : null}
                    </div>

                    {/* Delivery Payload Section */}
                    {meta.isNoPrize ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-100/60 p-3.5 text-xs font-bold text-slate-500">
                        🧂 รอบนี้ไม่ได้รับของรางวัล — ลองเปิดกล่องสุ่มอีกครั้งเพื่อลุ้นใหม่ได้เลย
                      </div>
                    ) : meta.canClaim ? (
                      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-100/60 p-3.5">
                        <div className="text-xs font-bold text-sky-900">
                          🎉 สินค้าของคุณพร้อมแล้ว! กดปุ่มรับเพื่อดูรหัสและเริ่มใช้งานได้ทันที
                        </div>
                        <button
                          type="button"
                          onClick={() => claim(item.id)}
                          disabled={claiming === item.id}
                          className="w-full sm:w-auto rounded-xl bg-sky-600 px-6 py-2 text-xs font-black text-white shadow-md hover:bg-sky-700 disabled:opacity-50"
                        >
                          {claiming === item.id ? 'กำลังเปิดของ...' : '⚡ กดรับสินค้าทันที (Claim)'}
                        </button>
                      </div>
                    ) : isClaimed && payload ? (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                          <span>ข้อมูลสินค้า / รหัส (Payload):</span>
                          <span className="text-emerald-700">✓ ได้รับเรียบร้อยแล้ว</span>
                        </div>

                        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-xs font-black text-slate-900 select-all whitespace-pre-wrap break-all">
                            {privacyMode ? '••••••••••••••••••••••••••••••••' : payload}
                          </pre>
                          <button
                            type="button"
                            onClick={() => {
                              copyText(payload)
                              setCopiedId(item.id)
                              setTimeout(() => setCopiedId(null), 1200)
                            }}
                            className="shrink-0 rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-sky-700"
                          >
                            {isCopied ? '✓ คัดลอกแล้ว' : '📋 คัดลอก'}
                          </button>
                        </div>
                      </div>
                    ) : meta.isFarm && !meta.farmCancelled ? (
                      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs font-bold text-blue-900">
                        ⏳ บริการนี้กำลังดำเนินการโดยทีมงาน คุณสามารถติดตามความคืบหน้าได้ในหน้าคำสั่งซื้อ
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* ── 2. ONE-WAY DIRECT CHAT STREAM FROM STAFF ── */}
      {/* ───────────────────────────────────────────── */}
      {subTab === 'direct_chat' && (
        <section className="space-y-4">
          {/* Header Banner */}
          <div className="rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50/50 p-4.5 text-xs">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-sky-600 text-lg text-white shadow-xs">
                🛡️
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-black text-slate-900">
                  ช่องทางรับข้อมูลลับและรหัสผ่านจากทีมงาน (Direct Messages)
                </div>
                <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                  ข้อความในหน้านี้ถูกส่งตรงถึงคุณจากแอดมินอย่าง
                </p>
              </div>
              <button
                type="button"
                onClick={loadDirectMessages}
                className="rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-bold text-sky-700 hover:bg-sky-50"
              >
                🔄 รีเฟรช
              </button>
            </div>
          </div>

          {/* Chat Stream Timeline */}
          {directLoading ? (
            <div className="grid min-h-[260px] place-items-center rounded-3xl border border-sky-100 bg-white p-8">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-sky-200 border-t-sky-600" />
                <div className="text-xs font-bold text-slate-500">กำลังโหลดแชทตรงจากทีมงาน...</div>
              </div>
            </div>
          ) : visibleDirectMessages.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/20 p-8 text-center">
              <div>
                <div className="text-4xl mb-2">💬</div>
                <div className="text-base font-black text-slate-900">ยังไม่มีข้อความตรงจากทีมงาน</div>
                <p className="mt-1 text-xs text-slate-500">
                  เมื่อแอดมินหรือทีมงานส่งรหัสผ่าน ข้อมูลลับ หรือข้อความเฉพาะคุณ จะแสดงในแชทนี้ทันที
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleDirectMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white p-5 shadow-xs transition hover:border-sky-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-600 text-lg text-white shadow-xs">
                        🛡️
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-black text-sky-700 border border-sky-200">
                            ทีมงาน VxperS Official
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {formatDate(msg.created_at)}
                          </span>
                        </div>

                        <h4 className="mt-1 text-sm font-black text-slate-900">
                          {msg.title}
                        </h4>

                        {/* Monospace Formatted Body with 1-Click Copy */}
                        <div className="mt-2.5 rounded-2xl border border-slate-200 bg-slate-50/90 p-3.5">
                          <pre className="font-mono text-xs font-bold text-slate-900 whitespace-pre-wrap break-all leading-relaxed select-all">
                            {privacyMode ? '••••••••••••••••••••••••••••••••' : msg.body}
                          </pre>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5">
                            <button
                              type="button"
                              onClick={() => copyText(msg.body, 'คัดลอกข้อความและรหัสเรียบร้อย')}
                              className="rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-sky-700"
                            >
                              📋 คัดลอกข้อมูลทั้งหมด
                            </button>

                            <Link
                              to={`/support?subject=${encodeURIComponent(`สอบถามเกี่ยวกับข้อความตรง: ${msg.title}`)}`}
                              className="text-[11px] font-bold text-slate-500 hover:text-sky-600"
                            >
                              🎧 สอบถามเพิ่มเติม
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delete Message Button */}
                    <button
                      type="button"
                      onClick={() => deleteMessage(msg.id)}
                      className="rounded-xl border border-slate-200 p-2 text-xs text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition"
                      title="ลบข้อความนี้"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Support Ticket Disclaimer Footer */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>💡</span>
              <span>
                ต้องการส่งข้อความหาทีมงานหรือแจ้งปัญหา? กรุณาเปิดคำร้องผ่านระบบศูนย์ช่วยเหลือ
              </span>
            </div>
            <Link
              to="/support"
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 shadow-xs shrink-0"
            >
              เปิด Ticket ศูนย์ช่วยเหลือ
            </Link>
          </div>
        </section>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* ── 3. MESSAGES & NOTIFICATIONS TAB ── */}
      {/* ───────────────────────────────────────────── */}
      {subTab === 'messages' && (
        <section className="space-y-4">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sky-100 bg-white p-4 shadow-sm">
            {/* Category Badges */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'order', label: '🛍️ คำสั่งซื้อ' },
                { id: 'topup', label: '💳 การเงิน' },
                { id: 'promo', label: '👑 VIP & โปร' },
                { id: 'system', label: '🛡️ ระบบ' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setMsgCategoryFilter(c.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${msgCategoryFilter === c.id
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Read All */}
            {unreadMsgCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                ✓ อ่านทั้งหมด ({unreadMsgCount})
              </button>
            )}
          </div>

          {/* Messages Stream */}
          {msgsLoading ? (
            <div className="grid min-h-[260px] place-items-center rounded-3xl border border-sky-100 bg-white p-8">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-sky-200 border-t-sky-600" />
                <div className="text-xs font-bold text-slate-500">กำลังโหลดข้อความ...</div>
              </div>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/20 p-8 text-center">
              <div>
                <div className="text-4xl mb-2">🔔</div>
                <div className="text-base font-black text-slate-900">ไม่มีข้อความแจ้งเตือน</div>
                <p className="mt-1 text-xs text-slate-500">เมื่อมีข่าวสาร อัปเดตออเดอร์ หรือโปรโมชันจะแสดงที่นี่</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleMessages.map((msg) => {
                const cat = getMessageCategory(msg)
                const isUnread = !msg.is_read

                return (
                  <div
                    key={msg.id}
                    onClick={() => {
                      if (isUnread) markRead(msg.id)
                    }}
                    className={`relative overflow-hidden rounded-3xl border p-5 transition-all cursor-pointer ${isUnread
                        ? 'border-sky-300 bg-sky-50/40 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white border border-slate-200 text-lg shadow-xs">
                          {cat.icon}
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${cat.color}`}>
                              {cat.label}
                            </span>
                            {isUnread ? (
                              <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[9px] font-black text-white">
                                ใหม่
                              </span>
                            ) : null}
                            <span className="text-[11px] text-slate-400 font-medium">
                              {formatDate(msg.created_at)}
                            </span>
                          </div>

                          <h4 className="mt-1 text-sm font-black text-slate-900">
                            {msg.title}
                          </h4>

                          <div className="mt-2 text-xs text-slate-600 leading-relaxed">
                            <AnnRichText content={msg.body} />
                          </div>

                          {/* Quick Action Jump Links */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {cat.id === 'order' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSubTab('deliveries')
                                }}
                                className="rounded-xl bg-sky-600 px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-sky-700"
                              >
                                📦 ไปที่กล่องรับของ
                              </button>
                            )}
                            {cat.id === 'topup' && (
                              <Link
                                to="/history/topups"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                              >
                                💳 ดูประวัติเติมเงิน
                              </Link>
                            )}
                            {cat.id === 'promo' && (
                              <Link
                                to="/categories"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
                              >
                                🛍️ ดูสินค้าโปรโมชัน
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Delete Message Action */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteMessage(msg.id)
                        }}
                        className="rounded-xl border border-slate-200 p-2 text-xs text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="ลบข้อความนี้"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
