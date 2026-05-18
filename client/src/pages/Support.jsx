import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { fetchJson, setAuthToken } from '../api.js'
import { connectSocket } from '../socket.js'
import UserAvatar from '../components/UserAvatar.jsx'

const SUPPORT_SUBJECT_MAX_LENGTH = 120
const SUPPORT_MESSAGE_MAX_LENGTH = 4000
const SUPPORT_ATTACHMENT_MAX_COUNT = 3
const SUPPORT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024

const QUICK_TOPICS = [
  {
    id: 'topup',
    title: 'เติมเงินไม่เข้า',
    subject: 'เติมเงินไม่เข้า',
    message: 'ยอดเติมเงินยังไม่เข้าในบัญชี\nเลขอ้างอิง/สลิป:\nเวลาที่โอนโดยประมาณ:',
  },
  {
    id: 'order',
    title: 'ไม่ได้รับสินค้า',
    subject: 'ไม่ได้รับสินค้า',
    message: 'ยังไม่ได้รับสินค้าหลังสั่งซื้อ\nOrder ID:\nชื่อสินค้า:\nรายละเอียดเพิ่มเติม:',
  },
  {
    id: 'account',
    title: 'ปัญหาบัญชี',
    subject: 'ปัญหาบัญชี',
    message: 'ต้องการความช่วยเหลือเกี่ยวกับบัญชี\nอีเมลบัญชี:\nรายละเอียดปัญหา:',
  },
]

function Card({ children, className = '' }) {
  return <section className={`ui-panel ${className}`}>{children}</section>
}

function statusMeta(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'open') return { label: 'เปิดอยู่', className: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' }
  if (value === 'pending') return { label: 'รอทีมงาน', className: 'border-amber-300/30 bg-amber-400/10 text-amber-100' }
  if (value === 'resolved') return { label: 'แก้ไขแล้ว', className: 'border-sky-300/30 bg-sky-400/10 text-sky-100' }
  if (value === 'closed') return { label: 'ปิดแล้ว', className: 'border-white/15 bg-white/5 text-white/55' }
  return { label: status || '-', className: 'border-white/15 bg-white/5 text-white/60' }
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatRelative(value, nowMs) {
  const ts = new Date(value || '').getTime()
  if (!Number.isFinite(ts)) return ''
  const diff = Math.max(0, nowMs - ts)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'เมื่อสักครู่'
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} ชั่วโมงที่แล้ว`
  return `${Math.floor(hour / 24)} วันที่แล้ว`
}

function TicketBadge({ status }) {
  const meta = statusMeta(status)
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${meta.className}`}>{meta.label}</span>
}

function CharacterCount({ value, max }) {
  const length = String(value || '').length
  const nearLimit = length > max * 0.9
  return <span className={`text-[11px] ${nearLimit ? 'text-amber-200' : 'text-white/35'}`}>{length}/{max}</span>
}

function AttachmentStrip({ items, onRemove, onPreview }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <div key={`${item.name || 'attachment'}-${index}`} className="group relative">
          <button type="button" onClick={() => onPreview?.(item.data)} className="block rounded-xl outline-none transition hover:opacity-85">
            <img src={item.data} alt={item.name || `attachment-${index + 1}`} className="h-16 w-16 rounded-xl border border-white/15 object-cover" />
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-white/20 bg-black/85 text-[10px] font-black text-white/80 hover:text-white"
              aria-label="ลบรูปแนบ"
            >
              x
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function HelpItem({ title, body }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="text-xs font-extrabold text-white">{title}</div>
      <div className="mt-1 text-[11px] leading-5 text-white/50">{body}</div>
    </div>
  )
}

export default function Support() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [tickets, setTickets] = useState([])
  const [ticketLoading, setTicketLoading] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [ticketForm, setTicketForm] = useState({ subject: '', message: '' })
  const [ticketSelectedId, setTicketSelectedId] = useState(null)
  const [ticketSelected, setTicketSelected] = useState(null)
  const [ticketMessages, setTicketMessages] = useState([])
  const [ticketReply, setTicketReply] = useState('')
  const [replyAttachments, setReplyAttachments] = useState([])
  const [createAttachments, setCreateAttachments] = useState([])
  const [previewImage, setPreviewImage] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const replyFileRef = useRef(null)
  const createFileRef = useRef(null)
  const chatScrollRef = useRef(null)
  const lastMessageKeyRef = useRef('')
  const ticketSelectedIdRef = useRef(null)

  const user = me?.user
  const displayName = useMemo(() => user?.display_name || user?.email?.split('@')?.[0] || 'user', [user])
  const isClosed = String(ticketSelected?.status || '').toLowerCase() === 'closed'

  const summary = useMemo(() => {
    const result = { all: tickets.length, open: 0, pending: 0, closed: 0 }
    tickets.forEach((ticket) => {
      const status = String(ticket?.status || '').toLowerCase()
      if (status === 'open') result.open += 1
      if (status === 'pending') result.pending += 1
      if (status === 'closed') result.closed += 1
    })
    return result
  }, [tickets])

  const visibleTickets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tickets.filter((ticket) => {
      const status = String(ticket?.status || '').toLowerCase()
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (!q) return true
      return String(ticket?.subject || '').toLowerCase().includes(q) || String(ticket?.id || '').includes(q)
    })
  }, [tickets, query, statusFilter])

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setTicketLoading(true)
      setTicketError('')
      try {
        const [meRes, ticketsRes] = await Promise.all([fetchJson('/api/me'), fetchJson('/api/me/support-tickets?limit=50')])
        if (!cancelled) {
          setMe(meRes)
          setTickets(ticketsRes.tickets || [])
        }
      } catch (error) {
        if (!cancelled && error?.status === 401) {
          setAuthToken(null)
          nav('/login', { replace: true })
          return
        }
        if (!cancelled) setTicketError(String(error?.message ?? 'load_failed'))
      } finally {
        if (!cancelled) setTicketLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [nav])

  useEffect(() => {
    ticketSelectedIdRef.current = ticketSelectedId
  }, [ticketSelectedId])

  useEffect(() => {
    const uid = Number(user?.id)
    if (!Number.isFinite(uid)) return undefined

    let closed = false
    let pendingRefresh = null

    async function silentRefresh(ticketId) {
      try {
        const ticketsRes = await fetchJson('/api/me/support-tickets?limit=50')
        if (!closed) setTickets(ticketsRes.tickets || [])
      } catch {
        // Real-time refresh is best effort; the manual refresh button remains available.
      }
      const selected = Number(ticketSelectedIdRef.current)
      const incoming = Number(ticketId)
      if (Number.isFinite(selected) && selected > 0 && (!Number.isFinite(incoming) || selected === incoming)) {
        try {
          const data = await fetchJson(`/api/me/support-tickets/${selected}`)
          if (closed) return
          const messages = Array.isArray(data.messages) ? data.messages : []
          setTicketSelected(data.ticket || null)
          setTicketMessages(messages)
          lastMessageKeyRef.current = `${selected}:${messages.length ? messages[messages.length - 1]?.id : ''}:${messages.length}`
        } catch {
          // Ignore transient detail refresh failures.
        }
      }
    }

    const socket = connectSocket()
    const scheduleRefresh = (ticketId) => {
      if (closed) return
      if (pendingRefresh) clearTimeout(pendingRefresh)
      pendingRefresh = setTimeout(async () => {
        if (closed) return
        await silentRefresh(ticketId)
        pendingRefresh = null
      }, 150)
    }
    const onTicketUpdate = (data) => scheduleRefresh(data?.ticket_id)

    socket.on('ticket_update', onTicketUpdate)

    return () => {
      closed = true
      if (pendingRefresh) clearTimeout(pendingRefresh)
      socket.off('ticket_update', onTicketUpdate)
    }
  }, [user?.id])

  useEffect(() => {
    const node = chatScrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [ticketMessages, ticketSelectedId])

  useEffect(() => {
    if (!previewImage) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPreviewImage('')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewImage])

  useEffect(() => {
    const tid = Number(ticketSelectedId)
    if (!Number.isFinite(tid)) return undefined

    let cancelled = false
    async function sync() {
      if (cancelled || document.visibilityState === 'hidden') return
      try {
        const data = await fetchJson(`/api/me/support-tickets/${tid}`)
        const messages = Array.isArray(data.messages) ? data.messages : []
        const lastId = messages.length ? messages[messages.length - 1]?.id : ''
        const nextKey = `${tid}:${String(lastId ?? '')}:${messages.length}`
        if (nextKey === lastMessageKeyRef.current) return
        lastMessageKeyRef.current = nextKey
        setTicketSelected(data.ticket || null)
        setTicketMessages(messages)
        setTickets((prev) => {
          const list = Array.isArray(prev) ? prev : []
          return list.map((item) => (item?.id === tid ? { ...item, last_message_at: data?.ticket?.last_message_at ?? item.last_message_at, status: data?.ticket?.status ?? item.status } : item))
        })
      } catch (error) {
        if (error?.status === 401) {
          setAuthToken(null)
          nav('/login', { replace: true })
        }
      }
    }

    const id = setInterval(sync, 12000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [ticketSelectedId, nav])

  async function reloadTickets() {
    setTicketLoading(true)
    setTicketError('')
    try {
      const ticketsRes = await fetchJson('/api/me/support-tickets?limit=50')
      setTickets(ticketsRes.tickets || [])
    } catch (error) {
      if (error?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      setTicketError(String(error?.message ?? 'load_failed'))
    } finally {
      setTicketLoading(false)
    }
  }

  async function openTicket(id) {
    const tid = Number(id)
    if (!Number.isFinite(tid)) return
    setTicketSelectedId(tid)
    setTicketLoading(true)
    setTicketError('')
    try {
      const data = await fetchJson(`/api/me/support-tickets/${tid}`)
      const messages = Array.isArray(data.messages) ? data.messages : []
      setTicketSelected(data.ticket || null)
      setTicketMessages(messages)
      const lastId = messages.length ? messages[messages.length - 1]?.id : ''
      lastMessageKeyRef.current = `${tid}:${String(lastId ?? '')}:${messages.length}`
    } catch (error) {
      if (error?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      setTicketError(String(error?.message ?? 'load_failed'))
    } finally {
      setTicketLoading(false)
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve(event.target.result)
      reader.onerror = () => reject(new Error('read_failed'))
      reader.readAsDataURL(file)
    })
  }

  async function pickAttachments(files, current, setter) {
    if (!files || files.length === 0) return
    const remaining = SUPPORT_ATTACHMENT_MAX_COUNT - current.length
    if (remaining <= 0) {
      setTicketError('แนบรูปได้สูงสุด 3 รูปต่อข้อความ')
      return
    }
    const picked = Array.from(files).slice(0, remaining)
    const results = []
    for (const file of picked) {
      if (!file.type.startsWith('image/')) {
        setTicketError('รองรับเฉพาะไฟล์รูปภาพ (jpg, png, gif, webp)')
        continue
      }
      if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
        setTicketError('รูปภาพต้องมีขนาดไม่เกิน 20MB')
        continue
      }
      const data = await readFileAsDataUrl(file)
      results.push({ data, mime: file.type, name: file.name })
    }
    setter((prev) => [...prev, ...results].slice(0, SUPPORT_ATTACHMENT_MAX_COUNT))
  }

  function mapAttachmentError(code) {
    if (code === 'too_many_attachments') return 'แนบรูปได้สูงสุด 3 รูปต่อข้อความ'
    if (code === 'attachment_too_large') return 'รูปภาพต้องมีขนาดไม่เกิน 20MB'
    if (code === 'invalid_attachment_type') return 'รองรับเฉพาะไฟล์รูปภาพ (jpg, png, gif, webp)'
    return null
  }

  async function createTicket() {
    const subject = String(ticketForm.subject || '').trim()
    const message = String(ticketForm.message || '').trim()
    if (!subject || !message) return
    if (subject.length > SUPPORT_SUBJECT_MAX_LENGTH) {
      setTicketError('หัวข้อยาวเกินกำหนด (สูงสุด 120 ตัวอักษร)')
      return
    }
    if (message.length > SUPPORT_MESSAGE_MAX_LENGTH) {
      setTicketError('รายละเอียดยาวเกินกำหนด (สูงสุด 4000 ตัวอักษร)')
      return
    }
    if (ticketLoading) return
    setTicketLoading(true)
    setTicketError('')
    try {
      const result = await fetchJson('/api/me/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, attachments: createAttachments.length > 0 ? createAttachments : undefined }),
      })
      setTicketForm({ subject: '', message: '' })
      setCreateAttachments([])
      await reloadTickets()
      if (result?.ticket?.id) await openTicket(result.ticket.id)
    } catch (error) {
      if (error?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      const code = String(error?.data?.error || '')
      if (code === 'invalid_subject') setTicketError('กรุณากรอกหัวข้อเคส')
      else if (code === 'invalid_subject_too_long') setTicketError('หัวข้อยาวเกินกำหนด (สูงสุด 120 ตัวอักษร)')
      else if (code === 'invalid_message') setTicketError('กรุณากรอกรายละเอียดปัญหา')
      else if (code === 'invalid_message_too_long') setTicketError('รายละเอียดยาวเกินกำหนด (สูงสุด 4000 ตัวอักษร)')
      else setTicketError(mapAttachmentError(code) || 'สร้างเคสไม่สำเร็จ')
    } finally {
      setTicketLoading(false)
    }
  }

  async function sendTicketReply() {
    const tid = Number(ticketSelectedId)
    const message = String(ticketReply || '').trim()
    if (!Number.isFinite(tid)) return
    if (!message && replyAttachments.length === 0) return
    if (message.length > SUPPORT_MESSAGE_MAX_LENGTH) {
      setTicketError('ข้อความยาวเกินกำหนด (สูงสุด 4000 ตัวอักษร)')
      return
    }
    if (ticketLoading) return
    setTicketLoading(true)
    setTicketError('')
    try {
      await fetchJson(`/api/me/support-tickets/${tid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, attachments: replyAttachments.length > 0 ? replyAttachments : undefined }),
      })
      setTicketReply('')
      setReplyAttachments([])
      await openTicket(tid)
      await reloadTickets()
    } catch (error) {
      if (error?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      const code = String(error?.data?.error || '')
      if (code === 'closed') setTicketError('Ticket นี้ถูกปิดแล้ว')
      else if (code === 'invalid_message_too_long') setTicketError('ข้อความยาวเกินกำหนด (สูงสุด 4000 ตัวอักษร)')
      else setTicketError(mapAttachmentError(code) || 'ส่งข้อความไม่สำเร็จ')
    } finally {
      setTicketLoading(false)
    }
  }

  function applyQuickTopic(topic) {
    setTicketForm({ subject: topic.subject, message: topic.message })
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong px-6 py-8 md:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_8%_0%,rgba(34,211,238,0.14),transparent_62%),radial-gradient(45%_70%_at_100%_8%,rgba(14,165,233,0.1),transparent_60%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-extrabold text-cyan-100">
              ศูนย์ช่วยเหลือ
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">Support</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58">
              สวัสดี {displayName} เปิดเคส แนบรูป และติดตามคำตอบจากทีมงานได้ในที่เดียว
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            {[
              { label: 'ทั้งหมด', value: summary.all },
              { label: 'เปิดอยู่', value: summary.open },
              { label: 'รอทีมงาน', value: summary.pending },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center">
                <div className="text-2xl font-black text-white">{item.value}</div>
                <div className="mt-1 text-[11px] font-bold text-white/45">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {ticketError ? (
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-50">
          ทำรายการไม่สำเร็จ: {ticketError}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-white">เปิดเคสใหม่</h2>
                <p className="mt-1 text-xs leading-5 text-white/45">เลือกหัวข้อด่วนหรือกรอกรายละเอียดเองได้เลย</p>
              </div>
              <button type="button" onClick={reloadTickets} disabled={ticketLoading} className="ui-btn h-9 px-3 text-xs">
                รีเฟรช
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {QUICK_TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => applyQuickTopic(topic)}
                  className="rounded-2xl border border-white/10 bg-white/[0.025] px-3 py-2 text-left text-xs font-extrabold text-white/75 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-white"
                >
                  {topic.title}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-white/65">หัวข้อ</span>
                  <CharacterCount value={ticketForm.subject} max={SUPPORT_SUBJECT_MAX_LENGTH} />
                </div>
                <input
                  value={ticketForm.subject}
                  onChange={(event) => setTicketForm((state) => ({ ...state, subject: event.target.value }))}
                  className="ui-field h-11 px-3 text-sm"
                  placeholder="เช่น เติมเงินไม่เข้า / รับของไม่ได้"
                  maxLength={SUPPORT_SUBJECT_MAX_LENGTH}
                />
              </label>
              <label className="block">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-white/65">รายละเอียด</span>
                  <CharacterCount value={ticketForm.message} max={SUPPORT_MESSAGE_MAX_LENGTH} />
                </div>
                <textarea
                  value={ticketForm.message}
                  onChange={(event) => setTicketForm((state) => ({ ...state, message: event.target.value }))}
                  className="ui-field h-32 rounded-2xl p-3 text-sm"
                  placeholder="อธิบายปัญหา พร้อมแนบข้อมูล เช่น Order ID, เวลาโอน, หรือสกรีนช็อต"
                  maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                />
              </label>
              <AttachmentStrip
                items={createAttachments}
                onPreview={setPreviewImage}
                onRemove={(index) => setCreateAttachments((prev) => prev.filter((_, i) => i !== index))}
              />
              <input
                ref={createFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => { pickAttachments(event.target.files, createAttachments, setCreateAttachments); event.target.value = '' }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => createFileRef.current?.click()}
                  disabled={ticketLoading || createAttachments.length >= SUPPORT_ATTACHMENT_MAX_COUNT}
                  className="ui-btn h-10 px-3 text-xs disabled:opacity-50"
                >
                  แนบรูป {createAttachments.length > 0 ? `(${createAttachments.length}/3)` : ''}
                </button>
                <button
                  type="button"
                  onClick={createTicket}
                  disabled={ticketLoading || !String(ticketForm.subject || '').trim() || !String(ticketForm.message || '').trim()}
                  className="ui-btn-primary h-10 px-5 text-xs"
                >
                  เปิดเคส
                </button>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-extrabold text-white">ช่วยให้ทีมงานตอบไวขึ้น</h2>
            <div className="mt-3 grid gap-3">
              <HelpItem title="แนบหลักฐานให้ครบ" body="สลิป, Order ID, ชื่อสินค้า หรือภาพหน้าจอช่วยให้ทีมงานตรวจสอบได้เร็วขึ้น" />
              <HelpItem title="ตอบกลับในเคสเดิม" body="ถ้าเป็นเรื่องเดียวกัน แนะนำคุยต่อในเคสเดิมเพื่อให้ประวัติครบ" />
            </div>
          </Card>
        </div>

        <Card className={`${ticketSelected ? 'h-[calc(100dvh-104px)] min-h-[560px]' : 'min-h-[560px]'} overflow-hidden p-0 lg:h-[min(760px,calc(100vh-150px))] lg:min-h-[620px]`}>
          <div className="grid h-full min-h-0 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className={`${ticketSelected ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-b border-white/10 p-4 lg:border-b-0 lg:border-r`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-extrabold text-white">เคสของฉัน</h2>
                {ticketLoading ? <span className="text-[11px] text-cyan-100">กำลังโหลด...</span> : null}
              </div>
              <div className="mt-4 space-y-3">
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="ui-field h-10 px-3 text-xs" placeholder="ค้นหาหัวข้อหรือเลขเคส" />
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'ทั้งหมด', count: summary.all },
                    { id: 'open', label: 'เปิด', count: summary.open },
                    { id: 'pending', label: 'รอทีมงาน', count: summary.pending },
                    { id: 'closed', label: 'ปิด', count: summary.closed },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition ${
                        statusFilter === tab.id ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-50' : 'border-white/10 bg-white/[0.025] text-white/50 hover:text-white'
                      }`}
                    >
                      {tab.label} {tab.count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {visibleTickets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/12 p-5 text-center text-xs text-white/45">ยังไม่มีเคสในรายการนี้</div>
                ) : null}
                {visibleTickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => openTicket(ticket.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      ticketSelectedId === ticket.id ? 'border-cyan-300/35 bg-cyan-400/10' : 'border-white/10 bg-white/[0.025] hover:border-white/18 hover:bg-white/[0.045]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-extrabold text-white">#{ticket.id} {ticket.subject}</div>
                        <div className="mt-1 text-[11px] text-white/40">{formatRelative(ticket.last_message_at || ticket.created_at, nowMs)}</div>
                      </div>
                      <TicketBadge status={ticket.status} />
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <section className={`${ticketSelected ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col`}>
              {!ticketSelected ? (
                <div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
                  <div>
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-xl font-black text-cyan-100">?</div>
                    <div className="mt-4 text-sm font-extrabold text-white">เลือกเคสเพื่อดูข้อความ</div>
                    <div className="mt-2 max-w-sm text-xs leading-6 text-white/45">หรือเปิดเคสใหม่ด้านซ้าย ทีมงานจะตอบกลับในช่องสนทนานี้</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-b border-white/10 p-3 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setTicketSelectedId(null)
                            setTicketSelected(null)
                            setTicketMessages([])
                          }}
                          className="ui-btn mt-0.5 h-9 shrink-0 px-3 text-xs lg:hidden"
                        >
                          กลับ
                        </button>
                        <div className="min-w-0">
                        <div className="text-xs font-extrabold text-white">Ticket #{ticketSelected.id}</div>
                        <div className="mt-1 truncate text-sm font-bold text-white/82">{ticketSelected.subject}</div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/42">
                          <span>ตอบครั้งแรก: {formatDateTime(ticketSelected.first_response_at)}</span>
                          <span>แก้ไขเมื่อ: {formatDateTime(ticketSelected.resolved_at)}</span>
                        </div>
                        </div>
                      </div>
                      <TicketBadge status={ticketSelected.status} />
                    </div>
                  </div>

                  <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                    {ticketMessages.length === 0 ? <div className="text-xs text-white/45">ไม่มีข้อความ</div> : null}
                    <div className="space-y-3">
                      {ticketMessages.map((message) => {
                        const isUser = String(message.sender_role || '').toLowerCase() === 'user'
                        const attachments = Array.isArray(message.attachments) ? message.attachments : []
                        const senderUser = {
                          display_name: message.sender_display_name,
                          email: message.sender_email,
                          avatar_url: message.sender_avatar_url,
                          role: message.sender_role,
                        }
                        return (
                          <div key={message.id} className={`flex items-start gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                            {!isUser ? <UserAvatar user={senderUser} size={30} rounded="full" /> : null}
                            <div className={`min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl border p-3 sm:max-w-[min(620px,92%)] ${
                              isUser ? 'border-cyan-300/18 bg-cyan-500/10' : 'border-white/10 bg-white/[0.045]'
                            }`}>
                              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                <span className="text-[11px] font-extrabold text-white/80">{isUser ? (message.sender_display_name || message.sender_email || 'คุณ') : 'Supporter'}</span>
                                <span className="text-[10px] text-white/35">{formatDateTime(message.created_at)}</span>
                              </div>
                              {message.message ? <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/78">{message.message}</div> : null}
                              <div className="mt-2">
                                <AttachmentStrip items={attachments} onPreview={setPreviewImage} />
                              </div>
                            </div>
                            {isUser ? <UserAvatar user={senderUser} size={30} rounded="full" /> : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="border-t border-white/10 p-3 sm:p-4">
                    {isClosed ? (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-xs text-white/50">Ticket นี้ถูกปิดแล้ว หากยังต้องการความช่วยเหลือ กรุณาเปิดเคสใหม่</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white/65">ตอบกลับ</span>
                          <CharacterCount value={ticketReply} max={SUPPORT_MESSAGE_MAX_LENGTH} />
                        </div>
                        <textarea
                          value={ticketReply}
                          onChange={(event) => setTicketReply(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              if (!ticketLoading && (ticketReply.trim() || replyAttachments.length > 0)) sendTicketReply()
                            }
                          }}
                          placeholder="พิมพ์ข้อความ... กด Enter เพื่อส่ง หรือ Shift+Enter เพื่อขึ้นบรรทัดใหม่"
                          className="ui-field h-24 rounded-2xl p-3 text-sm"
                          maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                        />
                        <AttachmentStrip
                          items={replyAttachments}
                          onPreview={setPreviewImage}
                          onRemove={(index) => setReplyAttachments((prev) => prev.filter((_, i) => i !== index))}
                        />
                        <input
                          ref={replyFileRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => { pickAttachments(event.target.files, replyAttachments, setReplyAttachments); event.target.value = '' }}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => replyFileRef.current?.click()}
                            disabled={replyAttachments.length >= SUPPORT_ATTACHMENT_MAX_COUNT}
                            className="ui-btn h-10 px-3 text-xs disabled:opacity-50"
                          >
                            แนบรูป {replyAttachments.length > 0 ? `(${replyAttachments.length}/3)` : ''}
                          </button>
                          <button
                            type="button"
                            onClick={sendTicketReply}
                            disabled={ticketLoading || (!ticketReply.trim() && replyAttachments.length === 0)}
                            className="ui-btn-primary h-10 px-5 text-xs"
                          >
                            ส่งข้อความ
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </Card>
      </div>

      {previewImage && typeof document !== 'undefined'
        ? createPortal(
            <div className="popup-overlay-animate fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4" onClick={() => setPreviewImage('')}>
              <button
                type="button"
                onClick={() => setPreviewImage('')}
                className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-black/50 text-lg font-bold text-white hover:bg-black/70"
                aria-label="ปิดรูปตัวอย่าง"
              >
                x
              </button>
              <img
                src={previewImage}
                alt="attachment-preview"
                onClick={(event) => event.stopPropagation()}
                className="popup-media-animate max-h-[90vh] max-w-[95vw] rounded-2xl border border-white/20 bg-black object-contain shadow-2xl"
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
