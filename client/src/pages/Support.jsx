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
    category: 'topup',
    priority: 'urgent',
    icon: '💳',
    title: 'เติมเงินไม่เข้า',
    subject: 'เติมเงินไม่เข้า / ปัญหาการโอนเงิน',
    message: 'ยอดเงินยังไม่เข้าในกระเป๋าเงิน\n- เลขอ้างอิง/สลิปโอน:\n- เวลาที่โอนโดยประมาณ:\n- ยอดเงิน (บาท):',
  },
  {
    id: 'order',
    category: 'order',
    priority: 'urgent',
    icon: '📦',
    title: 'ไม่ได้รับสินค้า',
    subject: 'ไม่ได้รับสินค้าหลังสั่งซื้อ',
    message: 'ยังไม่ได้รับสินค้าในกล่องรับของหลังชำระเงิน\n- เลขที่ Order / Ref:\n- ชื่อสินค้า:\n- รายละเอียดเพิ่มเติม:',
  },
  {
    id: 'service',
    category: 'service',
    priority: 'normal',
    icon: '🎮',
    title: 'งานบริการ / ฟาร์ม',
    subject: 'สอบถามสถานะงานบริการ / บูสต์ฟาร์ม',
    message: 'ต้องการติดต่อเจ้าหน้าที่เกี่ยวกับงานบริการ\n- Order Ref:\n- รายละเอียดงาน:',
  },
  {
    id: 'account',
    category: 'account',
    priority: 'normal',
    icon: '🔑',
    title: 'ปัญหาบัญชี / รหัสผ่าน',
    subject: 'ต้องการความช่วยเหลือเกี่ยวกับบัญชี',
    message: 'พบปัญหาเกี่ยวกับบัญชีผู้ใช้\n- อีเมลบัญชี:\n- รายละเอียดปัญหาที่พบ:',
  },
  {
    id: 'general',
    category: 'general',
    priority: 'low',
    icon: '💬',
    title: 'สอบถามทั่วไป',
    subject: 'สอบถามข้อมูลเพิ่มเติมเกี่ยวกับสินค้าและบริการ',
    message: 'ต้องการสอบถามเรื่อง:\n',
  },
]

const CATEGORY_META = {
  topup: { label: 'เติมเงิน', icon: '💳', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  order: { label: 'คำสั่งซื้อ', icon: '📦', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  service: { label: 'งานบริการ', icon: '🎮', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  account: { label: 'บัญชี', icon: '🔑', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  general: { label: 'ทั่วไป', icon: '💬', color: 'bg-slate-50 text-slate-700 border-slate-200' },
}

const FAQS = [
  {
    q: 'เติมเงินผ่าน PromptPay / ทรูมันนี่ ยอดจะเข้าเมื่อไหร่?',
    a: 'ระบบเติมเงินอัตโนมัติจะตรวจสอบและเพิ่มยอดเงินเข้ากระเป๋าของคุณภายใน 5-30 วินาที หากยอดไม่เข้าเกิน 5 นาที สามารถกดเปิดตั๋วเลือกหัวข้อ "เติมเงินไม่เข้า" พร้อมแนบสลิปได้ทันที',
  },
  {
    q: 'หลังจากสั่งซื้อสินค้าแล้ว สามารถดูสินค้าได้ที่ไหน?',
    a: 'สามารถเข้าดูสินค้าได้ที่เมนู "กล่องรับของ (Inbox)" หรือ "ประวัติการสั่งซื้อ" ระบบจะส่งมอบรหัส/คีย์/ข้อมูลให้ทันทีสำหรับสินค้าดิจิทัลอัตโนมัติ',
  },
  {
    q: 'ตั๋วแจ้งปัญหามีทีมงานตอบกลับช่วงเวลาใดบ้าง?',
    a: 'ทีมงานฝ่ายบริการลูกค้าพร้อมตอบกลับและดูแลทุกเคสทุกวันตลอด 24 ชั่วโมง โดยมี SLA เวลาตอบกลับเฉลี่ยไม่เกิน 5-15 นาที',
  },
]

function statusMeta(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'open') return { label: 'เปิดอยู่', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20' }
  if (value === 'pending') return { label: 'รอทีมงาน', className: 'border-amber-200 bg-amber-50 text-amber-700 ring-1 ring-amber-500/20' }
  if (value === 'resolved') return { label: 'แก้ไขแล้ว', className: 'border-sky-200 bg-sky-50 text-sky-700 ring-1 ring-sky-500/20' }
  if (value === 'closed') return { label: 'ปิดแล้ว', className: 'border-slate-200 bg-slate-100 text-slate-600' }
  return { label: status || '-', className: 'border-slate-200 bg-slate-100 text-slate-600' }
}

function priorityMeta(priority) {
  const p = String(priority || '').toLowerCase()
  if (p === 'urgent') return { label: 'ด่วนมาก', className: 'border-rose-200 bg-rose-50 text-rose-700' }
  if (p === 'low') return { label: 'ต่ำ', className: 'border-slate-200 bg-slate-50 text-slate-500' }
  return { label: 'ปกติ', className: 'border-slate-200 bg-slate-50 text-slate-600' }
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
  if (hour < 24) return `${hour} ชม. ที่แล้ว`
  return `${Math.floor(hour / 24)} วันที่แล้ว`
}

function TicketBadge({ status }) {
  const meta = statusMeta(status)
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${meta.className}`}>{meta.label}</span>
}

function CharacterCount({ value, max }) {
  const length = String(value || '').length
  const nearLimit = length > max * 0.9
  return <span className={`text-[11px] ${nearLimit ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>{length}/{max}</span>
}

function AttachmentStrip({ items, onRemove, onPreview }) {
  if (!items || !items.length) return null
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {items.map((item, index) => (
        <div key={`${item.name || 'attachment'}-${index}`} className="group relative">
          <button
            type="button"
            onClick={() => onPreview?.(item.data)}
            className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50 outline-none transition hover:opacity-90 hover:ring-2 hover:ring-sky-400"
          >
            <img src={item.data} alt={item.name || `attachment-${index + 1}`} className="h-16 w-16 object-cover" />
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-white bg-slate-900 text-[10px] font-black text-white shadow-xs hover:bg-rose-600"
              aria-label="ลบรูปแนบ"
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export default function Support() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [tickets, setTickets] = useState([])
  const [ticketLoading, setTicketLoading] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [ticketSuccess, setTicketSuccess] = useState('')
  const [ticketSelectedId, setTicketSelectedId] = useState(null)
  const [ticketSelected, setTicketSelected] = useState(null)
  const [ticketMessages, setTicketMessages] = useState([])
  const [ticketReply, setTicketReply] = useState('')
  const [replyAttachments, setReplyAttachments] = useState([])
  const [previewImage, setPreviewImage] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())

  // New Ticket Modal State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    subject: '',
    message: '',
    category: 'general',
    priority: 'normal',
    orderId: '',
  })
  const [createAttachments, setCreateAttachments] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // FAQ Expanded State
  const [expandedFaq, setExpandedFaq] = useState(null)

  const replyFileRef = useRef(null)
  const createFileRef = useRef(null)
  const chatScrollRef = useRef(null)
  const lastMessageKeyRef = useRef('')
  const ticketSelectedIdRef = useRef(null)

  const user = me?.user
  const displayName = useMemo(() => user?.display_name || user?.username || user?.email?.split('@')?.[0] || 'ผู้ใช้', [user])
  const isClosed = String(ticketSelected?.status || '').toLowerCase() === 'closed'

  const summary = useMemo(() => {
    const result = { all: tickets.length, open: 0, pending: 0, resolved: 0, closed: 0 }
    tickets.forEach((ticket) => {
      const status = String(ticket?.status || '').toLowerCase()
      if (status === 'open') result.open += 1
      else if (status === 'pending') result.pending += 1
      else if (status === 'resolved') result.resolved += 1
      else if (status === 'closed') result.closed += 1
    })
    return result
  }, [tickets])

  const visibleTickets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tickets.filter((ticket) => {
      const status = String(ticket?.status || '').toLowerCase()
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (!q) return true
      return (
        String(ticket?.subject || '').toLowerCase().includes(q) ||
        String(ticket?.id || '').includes(q) ||
        String(ticket?.order_ref || '').toLowerCase().includes(q)
      )
    })
  }, [tickets, query, statusFilter])

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    ticketSelectedIdRef.current = ticketSelectedId
  }, [ticketSelectedId])

  // Load User and Tickets
  useEffect(() => {
    let cancelled = false
    async function load() {
      setTicketLoading(true)
      setTicketError('')
      try {
        const [meRes, ticketsRes] = await Promise.all([
          fetchJson('/api/me'),
          fetchJson('/api/me/support-tickets?limit=100'),
        ])
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

  // Socket.io Real-time connection
  useEffect(() => {
    const uid = Number(user?.id)
    if (!Number.isFinite(uid)) return undefined

    let closed = false
    let pendingRefresh = null

    async function silentRefresh(ticketId) {
      try {
        const ticketsRes = await fetchJson('/api/me/support-tickets?limit=100')
        if (!closed) setTickets(ticketsRes.tickets || [])
      } catch {
        // silent
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
          // silent
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

  // Auto-scroll chat to bottom
  useEffect(() => {
    const node = chatScrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [ticketMessages, ticketSelectedId])

  // Lightbox escape key
  useEffect(() => {
    if (!previewImage) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPreviewImage('')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewImage])

  async function reloadTickets() {
    setTicketLoading(true)
    setTicketError('')
    try {
      const ticketsRes = await fetchJson('/api/me/support-tickets?limit=100')
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

  // Handle paste image from clipboard in textarea
  function handlePasteImage(e, setter, currentAttachments) {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile()
        if (blob) imageFiles.push(blob)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      pickAttachments(imageFiles, currentAttachments, setter)
    }
  }

  async function openCreateModalWithTopic(topic) {
    setCreateForm({
      subject: topic?.subject || '',
      message: topic?.message || '',
      category: topic?.category || 'general',
      priority: topic?.priority || 'normal',
      orderId: '',
    })
    setCreateAttachments([])
    setShowCreateModal(true)

    // Load recent orders if not loaded
    if (recentOrders.length === 0) {
      setLoadingOrders(true)
      try {
        const res = await fetchJson('/api/me/purchases?limit=10')
        setRecentOrders(res.items || res.orders || [])
      } catch {
        // silent
      } finally {
        setLoadingOrders(false)
      }
    }
  }

  async function submitCreateTicket(e) {
    if (e) e.preventDefault()
    const subject = String(createForm.subject || '').trim()
    const message = String(createForm.message || '').trim()
    if (!subject || !message) {
      setTicketError('กรุณากรอกหัวข้อและรายละเอียดให้ครบถ้วน')
      return
    }
    if (subject.length > SUPPORT_SUBJECT_MAX_LENGTH) {
      setTicketError('หัวข้อยาวเกินกำหนด (สูงสุด 120 ตัวอักษร)')
      return
    }
    if (message.length > SUPPORT_MESSAGE_MAX_LENGTH) {
      setTicketError('รายละเอียดยาวเกินกำหนด (สูงสุด 4000 ตัวอักษร)')
      return
    }

    setTicketLoading(true)
    setTicketError('')
    try {
      const result = await fetchJson('/api/me/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          message,
          category: createForm.category,
          priority: createForm.priority,
          order_id: createForm.orderId ? Number(createForm.orderId) : undefined,
          attachments: createAttachments.length > 0 ? createAttachments : undefined,
        }),
      })

      setShowCreateModal(false)
      setCreateForm({ subject: '', message: '', category: 'general', priority: 'normal', orderId: '' })
      setCreateAttachments([])
      setTicketSuccess('เปิดตั๋วปัญหาเรียบร้อยแล้ว ทีมงานจะตอบกลับโดยเร็วที่สุด')
      setTimeout(() => setTicketSuccess(''), 4000)

      await reloadTickets()
      if (result?.ticket?.id) {
        await openTicket(result.ticket.id)
      }
    } catch (error) {
      setTicketError(error?.message || 'สร้างตั๋วปัญหาไม่สำเร็จ')
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
      setTicketError(error?.message || 'ส่งข้อความไม่สำเร็จ')
    } finally {
      setTicketLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Top Hero & KPI Header ── */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-200/80 bg-white p-6 shadow-sm sm:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ศูนย์บริการลูกค้า & ความช่วยเหลือ (Helpdesk 24/7)
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Support Desk</h1>
            <p className="mt-2 max-w-2xl text-xs text-slate-500">
              สวัสดีคุณ <strong className="text-slate-800 font-bold">{displayName}</strong> สามารถเปิดตั๋วปัญหา แนบหลักฐานสลิป หรือรูปภาพ เพื่อรับความช่วยเหลือจากทีมงานได้แบบ Real-time ตลอด 24 ชั่วโมง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openCreateModalWithTopic(QUICK_TOPICS[0])}
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-xs font-black text-white shadow-md transition hover:bg-sky-700 active:scale-95"
            >
              <span className="text-base font-bold">+</span> เปิดตั๋วปัญหาใหม่
            </button>
            <button
              type="button"
              onClick={reloadTickets}
              disabled={ticketLoading}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50"
            >
              🔄 รีเฟรช
            </button>
          </div>
        </div>

        {/* Quick Topic Chips */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">เลือกหัวข้อด่วน:</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {QUICK_TOPICS.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => openCreateModalWithTopic(topic)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-sky-300 hover:bg-sky-100/80 active:scale-95"
              >
                <span>{topic.icon}</span>
                <span>{topic.title}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Alerts */}
      {ticketError ? (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          <span>⚠️ {ticketError}</span>
          <button type="button" onClick={() => setTicketError('')} className="text-rose-500 hover:text-rose-800">✕</button>
        </div>
      ) : null}

      {ticketSuccess ? (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
          <span>✅ {ticketSuccess}</span>
          <button type="button" onClick={() => setTicketSuccess('')} className="text-emerald-500 hover:text-emerald-800">✕</button>
        </div>
      ) : null}

      {/* ── Main Workspace: Tickets List & Live Chat Stream ── */}
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left Column: Tickets Queue */}
        <div className="flex flex-col rounded-3xl border border-sky-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-black text-slate-900">ตั๋วปัญหาของฉัน</h2>
              <div className="text-[11px] text-slate-400">ทั้งหมด {tickets.length} รายการ</div>
            </div>
            <button
              type="button"
              onClick={() => openCreateModalWithTopic(QUICK_TOPICS[0])}
              className="rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-700 transition hover:bg-sky-100"
            >
              + สร้าง
            </button>
          </div>

          {/* Search & Filter Tabs */}
          <div className="mt-3.5 space-y-2.5">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาตามหัวข้อ, เลขเคส, Ref..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 pl-8 text-xs outline-none transition focus:border-sky-400 focus:bg-white"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'ทั้งหมด', count: summary.all },
                { id: 'open', label: 'เปิดอยู่', count: summary.open },
                { id: 'pending', label: 'รอทีมงาน', count: summary.pending },
                { id: 'closed', label: 'ปิดแล้ว', count: summary.closed },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-xl border px-2.5 py-1 text-[11px] font-extrabold transition ${
                    statusFilter === tab.id
                      ? 'border-sky-300 bg-sky-50 text-sky-700 ring-1 ring-sky-400/30'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {tab.label} {tab.count > 0 ? `(${tab.count})` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket Cards Stream */}
          <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '600px' }}>
            {visibleTickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400">
                {query ? 'ไม่พบตั๋วปัญหาที่ตรงกับคำค้นหา' : 'ยังไม่มีตั๋วปัญหาในสถานะนี้'}
              </div>
            ) : null}

            {visibleTickets.map((ticket) => {
              const isSelected = ticketSelectedId === ticket.id
              const catMeta = CATEGORY_META[ticket.category] || CATEGORY_META.general
              const prio = priorityMeta(ticket.priority)

              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => openTicket(ticket.id)}
                  className={`w-full rounded-2xl border p-3.5 text-left transition ${
                    isSelected
                      ? 'border-sky-400 bg-sky-50/70 shadow-sm ring-1 ring-sky-300'
                      : 'border-slate-200/80 bg-white hover:border-sky-200 hover:bg-sky-50/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${catMeta.color}`}>
                        {catMeta.icon} {catMeta.label}
                      </span>
                      {ticket.priority === 'urgent' ? (
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${prio.className}`}>
                          🔥 ด่วน
                        </span>
                      ) : null}
                    </div>
                    <TicketBadge status={ticket.status} />
                  </div>

                  <div className="mt-2 font-bold text-xs text-slate-900 line-clamp-1">
                    #{ticket.id} {ticket.subject}
                  </div>

                  {ticket.order_ref ? (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      🔗 {ticket.order_ref}
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>อัปเดต: {formatRelative(ticket.last_message_at || ticket.created_at, nowMs)}</span>
                    <span className="font-mono text-[10px]">#{ticket.id}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Column: Live Chat & Thread Inspector */}
        <div className="flex min-h-[580px] flex-col rounded-3xl border border-sky-200/80 bg-white shadow-sm overflow-hidden">
          {!ticketSelected ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div className="max-w-md">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-sky-200 bg-sky-50 text-2xl">
                  💬
                </div>
                <h3 className="mt-4 text-base font-black text-slate-900">เลือกตั๋วปัญหาเพื่อดูข้อความ</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  คลิกเลือกรายการด้านซ้าย หรือกดปุ่ม <strong>"+ เปิดตั๋วปัญหาใหม่"</strong> ด้านบนเพื่อส่งคำถามถึงทีมงานทันที
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => openCreateModalWithTopic(QUICK_TOPICS[0])}
                    className="rounded-2xl bg-sky-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-sky-700"
                  >
                    เปิดตั๋วปัญหาใหม่
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Ticket Details Header */}
              <div className="border-b border-slate-100 bg-slate-50/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-sky-700">Ticket #{ticketSelected.id}</span>
                      <TicketBadge status={ticketSelected.status} />
                      {ticketSelected.priority === 'urgent' ? (
                        <span className="rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700">
                          🔥 ด่วนมาก
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-1 text-sm sm:text-base font-black text-slate-900 truncate">
                      {ticketSelected.subject}
                    </h2>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                      <span>สร้างเมื่อ: {formatDateTime(ticketSelected.created_at)}</span>
                      {ticketSelected.order_ref ? (
                        <span className="inline-flex items-center gap-1 font-mono text-slate-600 font-bold">
                          📦 Ref: {ticketSelected.order_ref}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Message Stream */}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/30" style={{ minHeight: '380px' }}>
                {ticketMessages.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-8">ไม่มีประวัติข้อความ</div>
                ) : null}

                {ticketMessages.map((msg) => {
                  const isUser = String(msg.sender_role || '').toLowerCase() === 'user'
                  const attachments = Array.isArray(msg.attachments) ? msg.attachments : []
                  const senderUser = {
                    display_name: msg.sender_display_name,
                    email: msg.sender_email,
                    avatar_url: msg.sender_avatar_url,
                    role: msg.sender_role,
                  }

                  return (
                    <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                      {!isUser ? (
                        <UserAvatar user={senderUser} size={34} rounded="full" />
                      ) : null}

                      <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-4 shadow-xs ${
                        isUser
                          ? 'bg-sky-600 text-white rounded-tr-xs'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                      }`}>
                        {/* Header in bubble */}
                        <div className={`flex items-center justify-between gap-3 text-[11px] pb-1 border-b ${
                          isUser ? 'border-sky-500/50 text-sky-100' : 'border-slate-100 text-slate-400'
                        }`}>
                          <div className="flex items-center gap-1.5 font-bold">
                            <span>{isUser ? 'คุณ' : (msg.sender_display_name || 'เจ้าหน้าที่ฝ่ายบริการ')}</span>
                            {!isUser ? (
                              <span className="rounded-md bg-emerald-100 px-1 py-0.2 text-[9px] font-extrabold text-emerald-800">
                                STAFF
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[10px]">{formatDateTime(msg.created_at)}</span>
                        </div>

                        {/* Content */}
                        {msg.message ? (
                          <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">
                            {msg.message}
                          </div>
                        ) : null}

                        {/* Attachments */}
                        {attachments.length > 0 ? (
                          <div className="mt-2.5">
                            <AttachmentStrip items={attachments} onPreview={setPreviewImage} />
                          </div>
                        ) : null}
                      </div>

                      {isUser ? (
                        <UserAvatar user={{ display_name: displayName, avatar_url: user?.avatar_url }} size={34} rounded="full" />
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/* Chat Composer */}
              <div className="border-t border-slate-200 bg-white p-4">
                {isClosed ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                    🔒 ตั๋วปัญหานี้ถูกปิดแล้ว หากยังพบปัญหาหรือต้องการความช่วยเหลือเพิ่มเติม สามารถกด <strong>"+ เปิดตั๋วปัญหาใหม่"</strong> ได้เสมอครับ
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">ตอบกลับข้อความ</span>
                      <CharacterCount value={ticketReply} max={SUPPORT_MESSAGE_MAX_LENGTH} />
                    </div>

                    <textarea
                      value={ticketReply}
                      onChange={(e) => setTicketReply(e.target.value)}
                      onPaste={(e) => handlePasteImage(e, setReplyAttachments, replyAttachments)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (!ticketLoading && (ticketReply.trim() || replyAttachments.length > 0)) {
                            sendTicketReply()
                          }
                        }
                      }}
                      placeholder="พิมพ์ข้อความตอบกลับ... (กด Enter เพื่อส่ง, Shift+Enter เพื่อขึ้นบรรทัดใหม่, หรือวางรูปจากคลิปบอร์ด)"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3 text-xs outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
                      rows={3}
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
                      onChange={(e) => {
                        pickAttachments(e.target.files, replyAttachments, setReplyAttachments)
                        e.target.value = ''
                      }}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => replyFileRef.current?.click()}
                        disabled={replyAttachments.length >= SUPPORT_ATTACHMENT_MAX_COUNT}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        📷 แนบรูปภาพ {replyAttachments.length > 0 ? `(${replyAttachments.length}/3)` : ''}
                      </button>

                      <button
                        type="button"
                        onClick={sendTicketReply}
                        disabled={ticketLoading || (!ticketReply.trim() && replyAttachments.length === 0)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-5 py-2 text-xs font-black text-white shadow-sm hover:bg-sky-700 active:scale-95 disabled:opacity-50"
                      >
                        <span>ส่งข้อความ</span> ✈️
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── FAQs Section ── */}
      <section className="rounded-3xl border border-sky-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-base font-black text-slate-900">คำถามที่พบบ่อย (FAQs)</h2>
        <p className="mt-0.5 text-xs text-slate-500">รวมข้อสงสัยและคำแนะนำเบื้องต้นสำหรับการใช้งาน</p>

        <div className="mt-4 space-y-2.5">
          {FAQS.map((faq, i) => {
            const isOpen = expandedFaq === i
            return (
              <div key={i} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 overflow-hidden transition">
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isOpen ? null : i)}
                  className="flex w-full items-center justify-between p-4 text-left font-bold text-xs text-slate-800 hover:bg-slate-100/60"
                >
                  <span>{faq.q}</span>
                  <span className="text-slate-400 font-bold">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen ? (
                  <div className="border-t border-slate-200/60 bg-white p-4 text-xs leading-relaxed text-slate-600">
                    {faq.a}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Modal: Create New Ticket Wizard ── */}
      {showCreateModal && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div className="relative w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl animate-scaleIn">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">เปิดตั๋วปัญหาใหม่</h3>
                    <p className="mt-0.5 text-xs text-slate-500">กรอกข้อมูลปัญหาเพื่อให้เจ้าหน้าที่ช่วยเหลือได้อย่างรวดเร็ว</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={submitCreateTicket} className="mt-4 space-y-4">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">หมวดหมู่ปัญหา</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(CATEGORY_META).map(([key, meta]) => {
                        const isSelected = createForm.category === key
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setCreateForm((prev) => ({ ...prev, category: key }))}
                            className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-bold transition ${
                              isSelected
                                ? 'border-sky-400 bg-sky-50 text-sky-700 ring-2 ring-sky-300'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Priority & Linked Order */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">ความสำคัญ</label>
                      <select
                        value={createForm.priority}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, priority: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-400 focus:bg-white"
                      >
                        <option value="low">ปกติ / ทั่วไป (Normal)</option>
                        <option value="normal">ปานกลาง (Medium)</option>
                        <option value="urgent">🔥 ด่วนมาก (Urgent)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">ผูกกับคำสั่งซื้อ (ถ้ามี)</label>
                      <select
                        value={createForm.orderId}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, orderId: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-400 focus:bg-white"
                      >
                        <option value="">-- ไม่ระบุคำสั่งซื้อ --</option>
                        {recentOrders.map((ord) => (
                          <option key={ord.id} value={ord.id}>
                            Order #{ord.id} - {ord.ref || `${ord.total_points} P`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">หัวข้อปัญหา</label>
                      <CharacterCount value={createForm.subject} max={SUPPORT_SUBJECT_MAX_LENGTH} />
                    </div>
                    <input
                      value={createForm.subject}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, subject: e.target.value }))}
                      placeholder="เช่น เติมเงินไม่เข้า / ออเดอร์ไม่ส่งรหัส"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-400 focus:bg-white"
                      maxLength={SUPPORT_SUBJECT_MAX_LENGTH}
                      required
                    />
                  </div>

                  {/* Message */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">รายละเอียดปัญหา</label>
                      <CharacterCount value={createForm.message} max={SUPPORT_MESSAGE_MAX_LENGTH} />
                    </div>
                    <textarea
                      value={createForm.message}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, message: e.target.value }))}
                      onPaste={(e) => handlePasteImage(e, setCreateAttachments, createAttachments)}
                      placeholder="อธิบายรายละเอียดปัญหา พร้อมข้อมูลที่เกี่ยวข้อง (สามารถวางรูปภาพสกรีนช็อตได้โดยตรง)"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-sky-400 focus:bg-white"
                      rows={4}
                      maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
                      required
                    />
                  </div>

                  {/* Attachments */}
                  <div>
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
                      onChange={(e) => {
                        pickAttachments(e.target.files, createAttachments, setCreateAttachments)
                        e.target.value = ''
                      }}
                    />

                    <div className="mt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => createFileRef.current?.click()}
                        disabled={createAttachments.length >= SUPPORT_ATTACHMENT_MAX_COUNT}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        📷 แนบรูปภาพสลิป/หลักฐาน {createAttachments.length > 0 ? `(${createAttachments.length}/3)` : ''}
                      </button>
                      <span className="text-[11px] text-slate-400">สูงสุด 3 รูป (รูปละไม่เกิน 20MB)</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={ticketLoading || !createForm.subject.trim() || !createForm.message.trim()}
                      className="rounded-xl bg-sky-600 px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-sky-700 disabled:opacity-50"
                    >
                      {ticketLoading ? 'กำลังส่ง...' : 'ยืนยันเปิดตั๋วปัญหา'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* ── Lightbox Image Modal ── */}
      {previewImage && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
              onClick={() => setPreviewImage('')}
            >
              <button
                type="button"
                onClick={() => setPreviewImage('')}
                className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-black/60 text-lg font-bold text-white hover:bg-black"
                aria-label="ปิดรูปตัวอย่าง"
              >
                ✕
              </button>
              <img
                src={previewImage}
                alt="attachment-preview"
                onClick={(e) => e.stopPropagation()}
                className="max-h-[90vh] max-w-[95vw] rounded-2xl border border-white/20 bg-black object-contain shadow-2xl"
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
