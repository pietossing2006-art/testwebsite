import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
      className={`motion-tab motion-hover inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-black transition ${
        active
          ? 'border-cyan-300/30 bg-cyan-500/15 text-cyan-100'
          : 'border-white/[0.08] bg-white/[0.035] text-white/58 hover:border-cyan-300/22 hover:text-white'
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

  if (farmCancelled) return { text: 'ยกเลิก', cls: 'bg-red-500/10 text-red-200', tone: 'red', canClaim: false, isFarm, farmCancelled }
  if (isFarm && farmStatus === 'fulfilled' && status !== 'claimed') return { text: 'พร้อมรับ', cls: 'bg-cyan-500/10 text-cyan-100', tone: 'cyan', canClaim: true, isFarm, farmCancelled }
  if (isFarm && farmStatus === 'in_progress') return { text: 'กำลังดำเนินการ', cls: 'bg-blue-500/10 text-blue-200', tone: 'blue', canClaim: false, isFarm, farmCancelled }
  if (isFarm) return { text: 'รอดำเนินการ', cls: 'bg-amber-500/10 text-amber-200', tone: 'amber', canClaim: false, isFarm, farmCancelled }
  if (status === 'claimed') return { text: 'รับแล้ว', cls: 'bg-emerald-500/10 text-emerald-200', tone: 'emerald', canClaim: false, isFarm, farmCancelled }
  if (status === 'pending_claim') return { text: 'พร้อมรับ', cls: 'bg-cyan-500/10 text-cyan-100', tone: 'cyan', canClaim: true, isFarm, farmCancelled }
  if (status === 'pending_fulfillment') return { text: 'รอดำเนินการ', cls: 'bg-amber-500/10 text-amber-200', tone: 'amber', canClaim: false, isFarm, farmCancelled }
  return { text: 'รายการ', cls: 'bg-white/[0.06] text-white/58', tone: 'muted', canClaim: false, isFarm, farmCancelled }
}

export default function Inbox() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claiming, setClaiming] = useState(null)
  const [revealed, setRevealed] = useState({})
  const [shown, setShown] = useState({})
  const [copiedId, setCopiedId] = useState(null)
  const [subTab, setSubTab] = useState('deliveries')
  const [messages, setMessages] = useState([])
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [expandedMsg, setExpandedMsg] = useState(null)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [query, setQuery] = useState('')

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

  useEffect(() => {
    let cancelled = false
    async function loadUnread() {
      try {
        const res = await fetchJson('/api/me/messages/unread-count')
        if (!cancelled) setUnreadMsgCount(res?.unread_count || 0)
      } catch {
        // ignore
      }
    }
    loadUnread()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (subTab !== 'messages') return undefined
    let cancelled = false
    async function loadMessages() {
      setMsgsLoading(true)
      try {
        const res = await fetchJson('/api/me/messages')
        if (!cancelled) {
          const nextMessages = Array.isArray(res?.messages) ? res.messages : []
          setMessages(nextMessages)
          setUnreadMsgCount(nextMessages.filter((message) => !message.is_read).length)
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
  const displayName = useMemo(() => user?.display_name || user?.email?.split('@')?.[0] || user?.username || 'user', [user])
  const readyCount = items.filter((item) => deliveryMeta(item).canClaim).length
  const claimedCount = items.filter((item) => String(item.status) === 'claimed').length
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => `${item.product_name || ''} ${item.order_id || ''} ${item.product_option?.label || ''}`.toLowerCase().includes(q))
  }, [items, query])

  async function markRead(id) {
    try {
      await fetchJson(`/api/me/messages/${id}/read`, { method: 'POST' })
      const next = messages.map((message) => (message.id === id ? { ...message, is_read: true } : message))
      setMessages(next)
      setUnreadMsgCount(next.filter((message) => !message.is_read).length)
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    try {
      await fetchJson('/api/me/messages/read-all', { method: 'POST' })
      setMessages((prev) => prev.map((message) => ({ ...message, is_read: true })))
      setUnreadMsgCount(0)
    } catch {
      // ignore
    }
  }

  async function claim(id) {
    if (claiming) return
    setClaiming(id)
    try {
      const res = await fetchJson(`/api/me/inbox/${id}/claim`, { method: 'POST' })
      setRevealed((prev) => ({ ...prev, [id]: res.payload }))
      setShown((prev) => ({ ...prev, [id]: true }))
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'claimed', claimed_at: new Date().toISOString(), payload: res.payload } : item)))
    } catch (err) {
      if (err?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
      }
    } finally {
      setClaiming(null)
    }
  }

  async function copyPayload(id, payload) {
    const text = String(payload || '').trim()
    if (!text) return
    try {
      await copyToClipboard(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-7 fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong p-4 sm:p-7">
        <div className="absolute inset-0 scanline opacity-35" />
        <div className="absolute inset-0 grid-pattern opacity-35" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/[0.08] blur-[90px]" />
        <div className="motion-stagger relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">บัญชีผู้ใช้</div>
            <h1 className="mt-2 text-4xl font-black text-white">กล่องรับของ</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
              รวมสินค้าที่รอรับ รายการที่รับแล้ว และข้อความแจ้งเตือนของ {displayName}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-white">{items.length}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">ทั้งหมด</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-cyan-200">{readyCount}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">พร้อมรับ</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-emerald-300">{claimedCount}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">รับแล้ว</div>
            </div>
          </div>
        </div>
      </section>

      <nav className="motion-stagger grid gap-3 md:grid-cols-3">
        <PageTab to="/inbox" active>กล่องรับของ</PageTab>
        <PageTab to="/history/purchases">ประวัติการซื้อ</PageTab>
        <PageTab to="/history/topups">ประวัติเติมเงิน</PageTab>
      </nav>

      <div className="motion-stagger flex flex-wrap gap-2">
        <button type="button" onClick={() => setSubTab('deliveries')} className={`motion-tab motion-hover h-11 rounded-2xl border px-4 text-sm font-black transition ${subTab === 'deliveries' ? 'border-cyan-300/30 bg-cyan-500/15 text-cyan-100' : 'border-white/[0.08] bg-white/[0.035] text-white/58 hover:text-white'}`}>
          รายการสินค้า
        </button>
        <button type="button" onClick={() => setSubTab('messages')} className={`motion-tab motion-hover relative h-11 rounded-2xl border px-4 text-sm font-black transition ${subTab === 'messages' ? 'border-cyan-300/30 bg-cyan-500/15 text-cyan-100' : 'border-white/[0.08] bg-white/[0.035] text-white/58 hover:text-white'}`}>
          ข้อความแจ้งเตือน
          {unreadMsgCount > 0 ? <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-cyan-500 px-1 text-[10px] text-white">{unreadMsgCount > 99 ? '99+' : unreadMsgCount}</span> : null}
        </button>
      </div>

      {subTab === 'messages' ? (
        <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">ข้อความแจ้งเตือน</h2>
              <div className="mt-1 text-xs text-white/42">{messages.length} รายการ</div>
            </div>
            {messages.some((message) => !message.is_read) ? <button type="button" onClick={markAllRead} className="ui-btn h-10 px-4 text-xs font-black">อ่านทั้งหมด</button> : null}
          </div>
          {msgsLoading ? <div className="grid min-h-[220px] place-items-center text-sm font-bold text-white/55">กำลังโหลดข้อความ...</div> : null}
          {!msgsLoading && messages.length === 0 ? (
            <div className="grid min-h-[240px] place-items-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center text-sm text-white/45">
              ยังไม่มีข้อความ
            </div>
          ) : null}
          {!msgsLoading && messages.length > 0 ? (
            <div className="motion-stagger space-y-3">
              {messages.map((message) => {
                const expanded = expandedMsg === message.id
                return (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => {
                      setExpandedMsg(expanded ? null : message.id)
                      if (!message.is_read) markRead(message.id)
                    }}
                    className={`motion-card motion-hover w-full rounded-3xl border p-4 text-left transition ${message.is_read ? 'border-white/[0.06] bg-white/[0.025]' : 'border-cyan-300/18 bg-cyan-500/10'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!message.is_read ? <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-300" /> : null}
                          <div className="text-sm font-black text-white"><AnnRichText text={message.title} plainHighlight /></div>
                        </div>
                        {expanded && message.body ? <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/58">{message.body}</div> : null}
                      </div>
                      <div className="shrink-0 text-xs text-white/35">{formatDate(message.created_at)}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {subTab === 'deliveries' ? (
        <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
          <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <label className="relative block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                </svg>
              </span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="ui-field h-12 pl-11" placeholder="ค้นหาชื่อสินค้า เลขออเดอร์ หรือตัวเลือก" />
            </label>
            <div className="text-xs font-bold text-white/42">{fmt(visibleItems.length)} รายการ</div>
          </div>

          {loading ? <div className="grid min-h-[260px] place-items-center text-sm font-bold text-white/55">กำลังโหลดกล่องรับของ...</div> : null}
          {error ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4 text-sm font-bold text-cyan-100">โหลดไม่สำเร็จ: {error}</div> : null}
          {!loading && !error && visibleItems.length === 0 ? (
            <div className="grid min-h-[280px] place-items-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center">
              <div>
                <div className="text-lg font-black text-white">ยังไม่มีของในกล่องรับของ</div>
                <p className="mt-2 text-sm text-white/45">เมื่อซื้อสินค้าและพร้อมรับ รายการจะมาแสดงที่นี่</p>
                <Link to="/categories" className="ui-btn-primary mt-5 inline-flex h-11 items-center px-5 text-sm font-black">เลือกสินค้า</Link>
              </div>
            </div>
          ) : null}

          {!loading && !error && visibleItems.length > 0 ? (
            <div className="motion-stagger space-y-3">
              {visibleItems.map((item) => {
                const meta = deliveryMeta(item)
                const payload = revealed[item.id] || item.payload
                const shownPayload = Boolean(shown[item.id])
                const masked = item.payload_masked || '••••'
                const optionLabel = item.product_option?.label || item.product_option?.id || ''
                const canReveal = String(item.status) === 'claimed' && !meta.isFarm
                return (
                  <div key={item.id} className="motion-card motion-hover rounded-3xl border border-white/[0.07] bg-white/[0.035] p-4 transition hover:border-cyan-300/18 hover:bg-white/[0.05]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-black text-white">{item.product_name}</div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${meta.cls}`}>{meta.text}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/42">
                          <span className="font-mono">Order #{item.order_id}</span>
                          <span>{formatDate(item.created_at)}</span>
                          {item.claimed_at ? <span>รับเมื่อ {formatDate(item.claimed_at)}</span> : null}
                        </div>
                        {optionLabel ? <div className="mt-2 text-xs font-bold text-cyan-200/80">ตัวเลือก: {optionLabel}</div> : null}
                        {meta.farmCancelled ? <div className="mt-2 text-xs font-bold text-red-200">{item.farm_cancel_note || 'รายการถูกยกเลิก'}</div> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {meta.canClaim ? (
                          <button type="button" onClick={() => claim(item.id)} disabled={claiming === item.id} className="ui-btn-primary h-10 px-4 text-xs font-black">
                            {claiming === item.id ? 'กำลังยืนยัน...' : 'ยืนยันรับของ'}
                          </button>
                        ) : null}
                        {canReveal ? (
                          <>
                            <button type="button" onClick={() => setShown((prev) => ({ ...prev, [item.id]: !prev[item.id] }))} className="ui-btn h-10 px-4 text-xs font-black">
                              {shownPayload ? 'ซ่อน' : 'แสดง'}
                            </button>
                            <button type="button" onClick={() => copyPayload(item.id, payload)} disabled={!payload} className="ui-btn h-10 px-4 text-xs font-black">
                              {copiedId === item.id ? 'คัดลอกแล้ว' : 'คัดลอก'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {(String(item.status) === 'claimed' || String(item.status) === 'pending_fulfillment' || meta.isFarm) ? (
                      <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                        {String(item.status) === 'pending_fulfillment' && !meta.isFarm ? (
                          <div className="text-xs leading-6 text-white/50">ระบบกำลังจัดเตรียมสินค้า เมื่อพร้อมรับจะแสดงในกล่องนี้</div>
                        ) : meta.isFarm && String(item.status) !== 'claimed' ? (
                          <div className="text-xs leading-6 text-white/50">งานบริการกำลังดำเนินการ หากเสร็จแล้วจะสามารถยืนยันรับของได้</div>
                        ) : (
                          <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-white/70">{shownPayload ? (payload || '-') : masked}</pre>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
