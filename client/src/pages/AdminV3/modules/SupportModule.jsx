import { useState, useEffect, useRef } from 'react'
import {
  formatNumber, formatDateTime, formatRelativeTime, getErrorMessage,
  getSupportStatusMeta, normalizeSupportAttachments,
} from '../helpers.js'
import { loadSupportTicketDetail, loadSupportModule } from '../loaders.js'
import { connectSocket } from '../../../socket.js'
import UserAvatar from '../../../components/UserAvatar.jsx'

const CANNED_REPLIES = [
  { id: 'ask_slip', label: 'ขอสลิป/หลักฐานเพิ่มเติม', text: 'สวัสดีครับ รบกวนขอภาพถ่ายสลิปการโอนเงิน หรือหลักฐานเพิ่มเติมเพื่อตรวจสอบยอดเงินในระบบให้ครับ ขอบคุณครับ' },
  { id: 'checking', label: 'กำลังดำเนินการตรวจสอบ', text: 'ทางทีมงานได้รับเรื่องเรียบร้อยแล้วครับ ขณะนี้กำลังเร่งดำเนินการตรวจสอบข้อมูลให้สักครู่ครับผม' },
  { id: 'order_resolved', label: 'ส่งมอบ/แก้ไขออเดอร์แล้ว', text: 'ระบบได้ทำการตรวจสอบและปรับยอดเงิน / ส่งมอบสินค้าเข้าในกล่องรับของของคุณเรียบร้อยแล้วครับ สามารถเข้าตรวจสอบได้ทันทีครับ' },
  { id: 'thank_you', label: 'ขอบคุณและปิดเคส', text: 'ยินดีให้บริการครับ หากมีข้อสงสัยหรือต้องการความช่วยเหลือเพิ่มเติมสามารถเปิดตั๋วปัญหาใหม่ได้ตลอด 24 ชั่วโมงครับผม ขอบคุณครับ' },
]

const CATEGORY_META = {
  topup: { label: 'เติมเงิน', icon: 'bi-credit-card' },
  order: { label: 'คำสั่งซื้อ', icon: 'bi-bag' },
  service: { label: 'งานบริการ', icon: 'bi-controller' },
  account: { label: 'บัญชี', icon: 'bi-key' },
  general: { label: 'ทั่วไป', icon: 'bi-chat-dots' },
}

const STATUS_TONE = { open: 'ok', pending: 'warn', closed: 'neutral' }

export default function SupportModule({ data: rawData, ctx }) {
  const { supportQuery, setSupportQuery, canAction, patchModuleData, fetchJson, session } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [draft, setDraft] = useState({ assignTo: '', status: 'open', reply: '', isInternal: false })
  const [replyAttachments, setReplyAttachments] = useState([])
  const [searchDraft, setSearchDraft] = useState(supportQuery.search || '')
  const [previewImage, setPreviewImage] = useState('')
  const [copyToast, setCopyToast] = useState('')

  const chatScrollRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const queryRef = useRef(supportQuery)
  const selectedIdRef = useRef(rawData?.selectedTicketId ?? null)
  const data = rawData || {}

  const canManage = canAction('support.manage')
  const tickets = data.tickets || []
  const summary = data.summary || {}
  const agents = data.agents || []
  const selectedTicket = data.selectedTicket
  const messages = data.messages || []

  const scopeTabs = [
    { id: 'all', label: 'ทั้งหมด', count: data.total },
    { id: 'mine', label: 'ของฉัน', count: summary.mine },
    { id: 'unassigned', label: 'ไม่มีผู้รับ', count: summary.unassigned },
    { id: 'needs_reply', label: 'รอตอบกลับ', count: summary.needs_reply },
    { id: 'closed', label: 'ปิดแล้ว', count: summary.closed },
  ]

  function patchQuery(obj) { setSupportQuery((prev) => ({ ...prev, ...obj })) }
  function applySearch(e) { if (e) e.preventDefault(); patchQuery({ search: searchDraft.trim() }) }

  function scrollChatToBottom(behavior = 'smooth') {
    window.requestAnimationFrame(() => {
      const node = chatScrollRef.current
      if (!node) return
      node.scrollTo({ top: node.scrollHeight, behavior })
    })
  }

  async function copyText(text, label = 'ข้อความ') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(String(text))
      setCopyToast(`คัดลอก ${label} เรียบร้อย`)
      setTimeout(() => setCopyToast(''), 2500)
    } catch {}
  }

  useEffect(() => {
    queryRef.current = supportQuery
    selectedIdRef.current = data.selectedTicketId ?? null
  }, [supportQuery, data.selectedTicketId])

  useEffect(() => {
    if (session.status !== 'ready') return
    let closed = false
    const socket = connectSocket()

    const scheduleRefresh = (eventTicketId) => {
      if (closed) return
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(async () => {
        if (closed) return
        try {
          const next = await loadSupportModule(queryRef.current, selectedIdRef.current)
          patchModuleData('support', (prev) => ({ ...prev, ...next }))
        } catch {}
        const sid = selectedIdRef.current
        if (sid && (!eventTicketId || Number(eventTicketId) === Number(sid))) {
          try {
            const detail = await loadSupportTicketDetail(sid)
            patchModuleData('support', (prev) => ({ ...prev, selectedTicketId: detail.selectedTicketId, selectedTicket: detail.selectedTicket, messages: detail.messages }))
          } catch {}
        }
        refreshTimerRef.current = null
      }, 150)
    }

    const onTicketUpdate = (d) => scheduleRefresh(d?.ticket_id)
    socket.on('ticket_update', onTicketUpdate)
    return () => {
      closed = true
      socket.off('ticket_update', onTicketUpdate)
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [session.status, patchModuleData])

  useEffect(() => {
    scrollChatToBottom(messages.length > 0 ? 'smooth' : 'auto')
  }, [data.selectedTicketId, messages.length])

  if (!rawData) return null

  async function refreshSilently() {
    try {
      const next = await loadSupportModule(queryRef.current, selectedIdRef.current)
      patchModuleData('support', (prev) => ({ ...prev, ...next }))
    } catch {}
  }

  async function openTicket(ticketId) {
    try {
      setActionState({ status: 'working', message: 'กำลังโหลดข้อมูลทิกเก็ต...' })
      const detail = await loadSupportTicketDetail(ticketId)
      patchModuleData('support', (prev) => ({ ...prev, selectedTicketId: detail.selectedTicketId, selectedTicket: detail.selectedTicket, messages: detail.messages }))
      scrollChatToBottom('auto')
      setDraft({
        assignTo: detail?.selectedTicket?.assigned_to == null ? '' : String(detail.selectedTicket.assigned_to),
        status: String(detail?.selectedTicket?.status || 'open').toLowerCase(),
        reply: '', isInternal: false,
      })
      setReplyAttachments([])
      setActionState({ status: 'idle', message: '' })
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function claimTicket(ticketId) {
    try {
      setActionState({ status: 'working', message: 'กำลังรับเคส...' })
      await fetchJson(`/api/admin/support-tickets/${ticketId}/claim`, { method: 'POST' })
      setActionState({ status: 'success', message: 'รับเคสเรียบร้อย' })
      await openTicket(ticketId)
      await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function updateAssign(ticketId, newAssignTo) {
    const aid = newAssignTo !== undefined ? newAssignTo : draft.assignTo
    try {
      setActionState({ status: 'working', message: 'กำลังมอบหมายงาน...' })
      await fetchJson(`/api/admin/support-tickets/${ticketId}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigned_to: aid || null }) })
      setActionState({ status: 'success', message: 'มอบหมายงานเรียบร้อย' })
      await openTicket(ticketId)
      await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function updateStatus(ticketId, newStatus) {
    const st = newStatus !== undefined ? newStatus : draft.status
    try {
      setActionState({ status: 'working', message: 'กำลังอัปเดตสถานะ...' })
      await fetchJson(`/api/admin/support-tickets/${ticketId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: st }) })
      setActionState({ status: 'success', message: 'อัปเดตสถานะเรียบร้อย' })
      await openTicket(ticketId)
      await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function sendReply(ticketId, andClose = false) {
    const text = draft.reply.trim()
    if (!text && replyAttachments.length === 0) return
    try {
      setActionState({ status: 'working', message: 'กำลังส่งข้อความ...' })
      await fetchJson(`/api/admin/support-tickets/${ticketId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, attachments: replyAttachments, is_internal: draft.isInternal }) })
      if (andClose && !draft.isInternal) {
        await fetchJson(`/api/admin/support-tickets/${ticketId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'closed' }) })
      }
      setDraft((prev) => ({ ...prev, reply: '', isInternal: false }))
      setReplyAttachments([])
      setActionState({ status: 'success', message: andClose ? 'ส่งข้อความและปิดเคสเรียบร้อย' : 'ส่งข้อความเรียบร้อย' })
      await openTicket(ticketId)
      await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  function handleAttachment(e) {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = () => setReplyAttachments((prev) => [...prev, { data: reader.result, mime: file.type }])
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  function handlePasteImage(e) {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile()
        if (blob) {
          e.preventDefault()
          const reader = new FileReader()
          reader.onload = () => setReplyAttachments((prev) => [...prev, { data: reader.result, mime: blob.type }])
          reader.readAsDataURL(blob)
        }
      }
    }
  }

  function insertCannedReply(text) {
    setDraft((prev) => ({ ...prev, reply: prev.reply ? `${prev.reply}\n${text}` : text }))
  }

  const bannerTone = actionState.status === 'error' ? 'crit' : actionState.status === 'success' ? 'ok' : 'info'

  return (
    <>
      {copyToast ? <div className="lgx-toast"><i className="bi bi-check-circle-fill" /><span>{copyToast}</span></div> : null}

      {actionState.status !== 'idle' && (
        <div className={`lgx-banner ${bannerTone}`}>
          <span>{actionState.message}</span>
          <button type="button" className="lgx-banner-close" onClick={() => setActionState({ status: 'idle', message: '' })}>×</button>
        </div>
      )}

      <div className="lgx-strip">
        <div className="lgx-stat"><div className="l">เคสเปิดอยู่</div><div className="v">{formatNumber(summary.open)}</div><div className="d">กำลังรอการแก้ไข</div></div>
        <div className="lgx-stat"><div className="l">รอดำเนินการ</div><div className="v warn">{formatNumber(summary.pending)}</div><div className="d">รอลูกค้าหรือทีมงาน</div></div>
        <div className="lgx-stat"><div className="l">ไม่มีผู้รับผิดชอบ</div><div className="v crit">{formatNumber(summary.unassigned)}</div><div className="d">เคสใหม่ที่ยังไม่มอบหมาย</div></div>
        <div className="lgx-stat"><div className="l">เกิน SLA (30 นาที)</div><div className="v crit">{formatNumber(summary.over_sla || 0)}</div><div className="d">ควรเร่งตอบ</div></div>
        <div className="lgx-stat"><div className="l">ปิดเคสแล้ว</div><div className="v">{formatNumber(summary.closed)}</div><div className="d">แก้ไขสำเร็จ</div></div>
      </div>

      <div className="lgx-panel">
        <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
          <div className="lgx-segmented">
            {scopeTabs.map((tab) => (
              <button key={tab.id} type="button" className={`lgx-segmented-btn${supportQuery.scope === tab.id ? ' is-active' : ''}`} onClick={() => patchQuery({ scope: tab.id })}>
                {tab.label}<span className="count">{formatNumber(tab.count)}</span>
              </button>
            ))}
          </div>
          <form style={{ display: 'flex', gap: 6 }} onSubmit={applySearch}>
            <input type="text" className="lgx-input" style={{ width: 220 }} placeholder="ค้นหา ID, อีเมล, หัวข้อ, Ref..." value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
            {searchDraft ? <button type="button" className="lgx-icon-action" onClick={() => { setSearchDraft(''); patchQuery({ search: '' }) }}><i className="bi bi-x-lg" /></button> : null}
            <button type="submit" className="lgx-btn lgx-btn-accent"><i className="bi bi-search" /></button>
          </form>
        </div>
      </div>

      <div className="lgx-detail-grid" style={{ gridTemplateColumns: selectedTicket ? '1fr 1.4fr' : '1fr', alignItems: 'stretch' }}>
        <div className="lgx-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="lgx-panel-head">
            <h2>รายการตั๋วปัญหา ({formatNumber(data.total)})</h2>
            <button type="button" className="lgx-btn" onClick={refreshSilently}><i className="bi bi-arrow-clockwise" />รีเฟรช</button>
          </div>
          <div className="lgx-ticket-list" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
            {tickets.map((t) => {
              const statusMeta = getSupportStatusMeta(t.status)
              const isActive = data.selectedTicketId === t.id
              const cat = CATEGORY_META[t.category] || CATEGORY_META.general
              return (
                <button key={t.id} type="button" className={`lgx-ticket-item${isActive ? ' is-active' : ''}`} onClick={() => openTicket(t.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <UserAvatar user={{ display_name: t.user_display_name, email: t.user_email, avatar_url: t.user_avatar_url }} size={28} rounded="full" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{t.id} {t.subject || '-'}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{t.user_display_name || t.user_username || t.user_email}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <span className={`lgx-pill ${STATUS_TONE[String(t.status || '').toLowerCase()] || 'neutral'}`}>{statusMeta.label}</span>
                      {t.priority === 'urgent' ? <div className="lgx-pill crit" style={{ marginTop: 4 }}>ด่วน</div> : null}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--lgx-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.last_message_preview || '-'}</div>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, fontSize: 10.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="lgx-pill neutral"><i className={`bi ${cat.icon}`} style={{ marginRight: 4 }} />{cat.label}</span>
                      {t.order_ref ? <span className="lgx-pill neutral mono">{t.order_ref}</span> : null}
                    </div>
                    <div>
                      {t.assigned_display_name ? <span style={{ fontWeight: 700 }}><i className="bi bi-person-fill" style={{ marginRight: 3 }} />{t.assigned_display_name}</span> : <span style={{ color: 'var(--lgx-crit)', fontWeight: 700 }}>ยังไม่มีคนรับ</span>}
                      <span style={{ marginLeft: 6, color: 'var(--lgx-text-muted)' }}>{formatRelativeTime(t.last_sender_at || t.created_at)}</span>
                    </div>
                  </div>
                </button>
              )
            })}
            {tickets.length === 0 && <div className="lgx-empty"><i className="bi bi-inbox" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />ไม่พบรายการทิกเก็ต</div>}
          </div>
        </div>

        {selectedTicket && (
          <div className="lgx-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="lgx-panel-body" style={{ borderBottom: '1.5px solid var(--lgx-border)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <UserAvatar user={{ display_name: selectedTicket.user_display_name, email: selectedTicket.user_email, avatar_url: selectedTicket.user_avatar_url }} size={38} rounded="full" />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h2 style={{ fontFamily: 'var(--lgx-font)', fontStyle: 'normal', fontSize: 14, margin: 0 }}>#{selectedTicket.id} — {selectedTicket.subject}</h2>
                      <span className={`lgx-pill ${STATUS_TONE[String(selectedTicket.status || '').toLowerCase()] || 'neutral'}`}>{getSupportStatusMeta(selectedTicket.status).label}</span>
                      {selectedTicket.priority === 'urgent' ? <span className="lgx-pill crit">ด่วนมาก</span> : null}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <span>ลูกค้า: <strong style={{ color: 'var(--lgx-text)' }}>{selectedTicket.user_display_name || selectedTicket.user_email}</strong></span>
                      {selectedTicket.order_ref ? <button type="button" className="mono" style={{ background: 'none', border: 'none', color: 'var(--lgx-accent)', cursor: 'pointer', padding: 0, fontWeight: 700 }} onClick={() => copyText(selectedTicket.order_ref, 'Order Ref')}>{selectedTicket.order_ref}</button> : null}
                      <span>สร้างเมื่อ {formatDateTime(selectedTicket.created_at)}</span>
                    </div>
                  </div>
                </div>
                <button type="button" className="lgx-icon-action" onClick={() => patchModuleData('support', (prev) => ({ ...prev, selectedTicketId: null, selectedTicket: null, messages: [] }))}><i className="bi bi-x-lg" /></button>
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--lgx-border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <select className="lgx-select" style={{ width: 'auto' }} value={draft.status} onChange={(e) => { setDraft((prev) => ({ ...prev, status: e.target.value })); updateStatus(selectedTicket.id, e.target.value) }} disabled={!canManage}>
                  <option value="open">เปิด (Open)</option>
                  <option value="pending">รอดำเนินการ (Pending)</option>
                  <option value="closed">ปิดเคส (Closed)</option>
                </select>
                <select className="lgx-select" style={{ width: 'auto' }} value={draft.assignTo} onChange={(e) => { setDraft((prev) => ({ ...prev, assignTo: e.target.value })); updateAssign(selectedTicket.id, e.target.value) }} disabled={!canManage}>
                  <option value="">-- ยังไม่มีคนรับ --</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.display_name || a.username || a.email}</option>)}
                </select>
                <button type="button" className="lgx-btn lgx-btn-ok" onClick={() => claimTicket(selectedTicket.id)} disabled={!canManage}><i className="bi bi-hand-index-thumb" />รับเคสนี้</button>
              </div>
            </div>

            <div ref={chatScrollRef} style={{ padding: 16, background: 'var(--lgx-surface-alt)', flex: 1, maxHeight: '42vh', minHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((msg) => {
                const isAdmin = String(msg.sender_role || '').toLowerCase() !== 'user'
                const isInternal = Boolean(msg.is_internal)
                const attachments = normalizeSupportAttachments(msg.attachments)
                const senderUser = { display_name: msg.sender_display_name, email: msg.sender_email, avatar_url: msg.sender_avatar_url, role: msg.sender_role }

                if (isInternal) {
                  return (
                    <div key={msg.id} className="lgx-chat-bubble is-internal">
                      <div className="lgx-chat-meta"><span style={{ fontWeight: 700 }}><i className="bi bi-lock-fill" style={{ marginRight: 4 }} />บันทึกภายในโดย {msg.sender_display_name || msg.sender_email}</span><span>{formatDateTime(msg.created_at)}</span></div>
                      <div>{msg.message}</div>
                    </div>
                  )
                }

                return (
                  <div key={msg.id} className={`lgx-chat-row${isAdmin ? ' is-mine' : ''}`}>
                    <UserAvatar user={senderUser} size={30} rounded="full" />
                    <div className={`lgx-chat-bubble${isAdmin ? ' is-mine' : ''}`}>
                      <div className="lgx-chat-meta"><span style={{ fontWeight: 700 }}>{isAdmin ? (msg.sender_display_name || 'Staff') : (msg.sender_display_name || msg.sender_email || 'Customer')}</span><span>{formatDateTime(msg.created_at)}</span></div>
                      <div>{msg.message}</div>
                      {attachments.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {attachments.map((att, ai) => (
                            att.isImage ? (
                              <img key={ai} src={att.data} alt="attachment" className="lgx-thumb" style={{ maxWidth: 120, maxHeight: 80, cursor: 'pointer' }} onClick={() => setPreviewImage(att.data)} />
                            ) : (
                              <a key={ai} href={att.data} target="_blank" rel="noreferrer" className="lgx-btn" style={{ fontSize: 11 }}><i className="bi bi-paperclip" />ไฟล์แนบ</a>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="lgx-panel-body" style={{ borderTop: '1.5px solid var(--lgx-border)' }}>
              <div className="lgx-chip-row" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lgx-text-muted)', marginRight: 2 }}>คำตอบด่วน:</span>
                {CANNED_REPLIES.map((c) => <button key={c.id} type="button" className="lgx-chip" onClick={() => insertCannedReply(c.text)}>+ {c.label}</button>)}
              </div>

              <textarea
                className="lgx-textarea"
                style={{ fontFamily: 'var(--lgx-font)' }}
                rows={2}
                placeholder="พิมพ์ข้อความตอบกลับ... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่, วางรูปจากคลิปบอร์ดได้)"
                value={draft.reply}
                onChange={(e) => setDraft((prev) => ({ ...prev, reply: e.target.value }))}
                onPaste={handlePasteImage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (canManage && (draft.reply.trim() || replyAttachments.length > 0)) sendReply(selectedTicket.id, false)
                  }
                }}
              />

              {replyAttachments.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {replyAttachments.map((att, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={att.data} alt="" className="lgx-thumb" style={{ width: 48, height: 48 }} />
                      <button type="button" className="lgx-icon-action" style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, background: 'var(--lgx-crit)', borderColor: 'var(--lgx-crit)', color: '#fff' }} onClick={() => setReplyAttachments((prev) => prev.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <label className="lgx-btn" style={{ cursor: 'pointer' }}>
                    <i className="bi bi-paperclip" />แนบรูป
                    <input type="file" hidden accept="image/*" multiple onChange={handleAttachment} />
                  </label>
                  <label className="lgx-switch">
                    <input type="checkbox" checked={draft.isInternal} onChange={(e) => setDraft((prev) => ({ ...prev, isInternal: e.target.checked }))} />
                    <i className="bi bi-lock-fill" />โน้ตภายใน (ลูกค้าไม่เห็น)
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!draft.isInternal && (
                    <button type="button" className="lgx-btn lgx-btn-ok" onClick={() => sendReply(selectedTicket.id, true)} disabled={!canManage || (!draft.reply.trim() && replyAttachments.length === 0)}><i className="bi bi-check-lg" />ส่ง &amp; ปิดเคส</button>
                  )}
                  <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => sendReply(selectedTicket.id, false)} disabled={!canManage || (!draft.reply.trim() && replyAttachments.length === 0)}>
                    <i className="bi bi-send" />{draft.isInternal ? 'บันทึกโน้ตภายใน' : 'ส่งข้อความ'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {previewImage && (
        <div className="lgx-modal-backdrop" onClick={() => setPreviewImage('')}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 'var(--lgx-radius)' }} />
            <button type="button" className="lgx-icon-action" style={{ position: 'absolute', top: 10, right: 10, background: '#fff' }} onClick={() => setPreviewImage('')}><i className="bi bi-x-lg" /></button>
          </div>
        </div>
      )}
    </>
  )
}
