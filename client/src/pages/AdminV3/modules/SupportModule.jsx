import { useState, useEffect, useRef } from 'react'
import {
  formatNumber, formatDateTime, formatRelativeTime, getErrorMessage,
  getSupportStatusMeta, getSupportWaitingMeta, normalizeSupportAttachments,
  DEFAULT_SUPPORT_QUERY,
} from '../helpers.js'
import { loadSupportTicketDetail, loadSupportModule } from '../loaders.js'
import { connectSocket } from '../../../socket.js'
import UserAvatar from '../../../components/UserAvatar.jsx'

export default function SupportModule({ data: rawData, ctx }) {
  const { supportQuery, setSupportQuery, canAction, patchModuleData, fetchJson, session } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [draft, setDraft] = useState({ assignTo: '', status: 'open', reply: '' })
  const [replyAttachments, setReplyAttachments] = useState([])
  const [searchDraft, setSearchDraft] = useState(supportQuery.search || '')
  const [previewImage, setPreviewImage] = useState('')
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

  function applySearch(e) {
    e.preventDefault()
    patchQuery({ search: searchDraft.trim() })
  }

  function scrollChatToBottom(behavior = 'smooth') {
    window.requestAnimationFrame(() => {
      const node = chatScrollRef.current
      if (!node) return
      node.scrollTo({ top: node.scrollHeight, behavior })
    })
  }

  // Keep refs in sync so the socket handler always has fresh values.
  useEffect(() => {
    queryRef.current = supportQuery
    selectedIdRef.current = data.selectedTicketId ?? null
  }, [supportQuery, data.selectedTicketId])

  // Socket.IO for real-time updates
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
        } catch {
          // Keep the current list visible; the next socket/poll event will retry.
        }
        const sid = selectedIdRef.current
        if (sid && (!eventTicketId || Number(eventTicketId) === Number(sid))) {
          try {
            const detail = await loadSupportTicketDetail(sid)
            patchModuleData('support', (prev) => ({
              ...prev,
              selectedTicketId: detail.selectedTicketId,
              selectedTicket: detail.selectedTicket,
              messages: detail.messages,
            }))
          } catch {
            // Detail refresh is opportunistic and should not break the chat view.
          }
        }
        refreshTimerRef.current = null
      }, 150)
    }

    const onTicketUpdate = (data) => {
      scheduleRefresh(data?.ticket_id)
    }

    socket.on('ticket_update', onTicketUpdate)

    return () => {
      closed = true
      socket.off('ticket_update', onTicketUpdate)
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [session.status, patchModuleData])

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollChatToBottom(messages.length > 0 ? 'smooth' : 'auto')
  }, [data.selectedTicketId, messages.length])

  if (!rawData) return null

  async function refreshSilently() {
    try {
      const next = await loadSupportModule(queryRef.current, selectedIdRef.current)
      patchModuleData('support', (prev) => ({ ...prev, ...next }))
    } catch {
      // Silent refresh is best-effort after user actions.
    }
  }

  async function openTicket(ticketId) {
    try {
      setActionState({ status: 'working', message: 'กำลังโหลดทิกเก็ต...' })
      const detail = await loadSupportTicketDetail(ticketId)
      patchModuleData('support', (prev) => ({
        ...prev,
        selectedTicketId: detail.selectedTicketId,
        selectedTicket: detail.selectedTicket,
        messages: detail.messages,
      }))
      scrollChatToBottom('auto')
      setDraft({
        assignTo: detail?.selectedTicket?.assigned_to == null ? '' : String(detail.selectedTicket.assigned_to),
        status: String(detail?.selectedTicket?.status || 'open').toLowerCase(),
        reply: '',
      })
      setReplyAttachments([])
      setActionState({ status: 'idle', message: '' })
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
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

  async function updateAssign(ticketId) {
    try {
      setActionState({ status: 'working', message: 'กำลังมอบหมาย...' })
      await fetchJson(`/api/admin/support-tickets/${ticketId}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: draft.assignTo || null }),
      })
      setActionState({ status: 'success', message: 'มอบหมายเรียบร้อย' })
      await openTicket(ticketId)
      await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function updateStatus(ticketId) {
    try {
      setActionState({ status: 'working', message: 'กำลังอัปเดตสถานะ...' })
      await fetchJson(`/api/admin/support-tickets/${ticketId}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: draft.status }),
      })
      setActionState({ status: 'success', message: 'อัปเดตสถานะเรียบร้อย' })
      await openTicket(ticketId)
      await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function sendReply(ticketId) {
    const text = draft.reply.trim()
    if (!text && replyAttachments.length === 0) return
    try {
      setActionState({ status: 'working', message: 'กำลังส่งข้อความ...' })
      await fetchJson(`/api/admin/support-tickets/${ticketId}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, attachments: replyAttachments }),
      })
      setDraft(prev => ({ ...prev, reply: '' }))
      setReplyAttachments([])
      setActionState({ status: 'success', message: 'ส่งข้อความเรียบร้อย' })
      await openTicket(ticketId)
      await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  function handleAttachment(e) {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = () => {
        setReplyAttachments(prev => [...prev, { data: reader.result, mime: file.type }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  return (
    <div className="admin-module admin-support-module">
      {actionState.status !== 'idle' && (
        <div className={`alert ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show`}>
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })}></button>
        </div>
      )}

      {/* ── Summary info boxes ── */}
      <div className="row mb-3">
        {[
          { label: 'เปิดอยู่', val: summary.open, bg: 'text-bg-success' },
          { label: 'รอดำเนินการ', val: summary.pending, bg: 'text-bg-warning' },
          { label: 'ไม่มีผู้รับ', val: summary.unassigned, bg: 'text-bg-danger' },
          { label: 'ปิดแล้ว', val: summary.closed, bg: 'text-bg-secondary' },
        ].map((c, i) => (
          <div className="col-lg-3 col-6" key={i}>
            <div className={`small-box ${c.bg}`}>
              <div className="inner">
                <h3>{formatNumber(c.val)}</h3>
                <p>{c.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Scope tabs + search ── */}
      <div className="card mb-3">
        <div className="card-body py-2">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <ul className="nav nav-pills nav-sm me-auto">
              {scopeTabs.map(tab => (
                <li className="nav-item" key={tab.id}>
                  <button
                    className={`nav-link ${supportQuery.scope === tab.id ? 'active' : ''}`}
                    onClick={() => patchQuery({ scope: tab.id })}
                  >
                    {tab.label} <span className="badge text-bg-light text-dark ms-1">{formatNumber(tab.count)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <form className="d-flex gap-1" onSubmit={applySearch}>
              <input type="text" className="form-control form-control-sm" style={{ width: 180 }} placeholder="ค้นหา..." value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
              <button className="btn btn-outline-secondary btn-sm" type="submit"><i className="bi bi-search"></i></button>
            </form>
          </div>
        </div>
      </div>

      <div className="row">
        {/* ── Ticket list ── */}
        <div className={selectedTicket ? 'col-lg-5' : 'col-lg-12'}>
          <div className="card">
            <div className="card-header"><h3 className="card-title">ทิกเก็ต ({formatNumber(data.total)})</h3></div>
            <div className="card-body p-0" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <div className="list-group list-group-flush">
                {tickets.map((t) => {
                  const statusMeta = getSupportStatusMeta(t.status)
                  const waitMeta = getSupportWaitingMeta(t)
                  const isActive = data.selectedTicketId === t.id
                  return (
                    <button
                      key={t.id}
                      className={`list-group-item list-group-item-action ${isActive ? 'active' : ''}`}
                      onClick={() => openTicket(t.id)}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="fw-semibold">#{t.id} — {t.subject || t.user_display_name || t.user_email || '-'}</div>
                          <small className={isActive ? 'text-white-50' : 'text-secondary'}>
                            {t.last_message_preview || '-'}
                          </small>
                        </div>
                        <div className="text-end" style={{ minWidth: 80 }}>
                          <span className={`badge ${statusMeta.bg} mb-1`}>{statusMeta.label}</span>
                          <div style={{ fontSize: '11px' }} className={isActive ? 'text-white-50' : waitMeta.bg}>
                            {waitMeta.label} {waitMeta.ageMinutes > 0 ? `(${formatRelativeTime(t.last_sender_at || t.created_at)})` : ''}
                          </div>
                          {t.assigned_display_name && (
                            <div style={{ fontSize: '11px' }} className={isActive ? 'text-white-50' : 'text-secondary'}>
                              <i className="bi bi-person-fill me-1"></i>{t.assigned_display_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {tickets.length === 0 && (
                  <div className="text-center text-secondary py-4">ไม่พบทิกเก็ต</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Ticket detail / chat ── */}
        {selectedTicket && (
          <div className="col-lg-7">
            <div className="card card-outline card-primary direct-chat direct-chat-primary">
              <div className="card-header">
                <h3 className="card-title">
                  #{selectedTicket.id} — {selectedTicket.subject || selectedTicket.user_display_name || '-'}
                </h3>
                <div className="card-tools">
                  <button className="btn btn-tool" onClick={() => patchModuleData('support', prev => ({ ...prev, selectedTicketId: null, selectedTicket: null, messages: [] }))}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>
              <div ref={chatScrollRef} className="card-body" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
                <div className="direct-chat-messages">
                  {messages.map((msg, i) => {
                    const isAdmin = String(msg.sender_role || '').toLowerCase() !== 'user'
                    const attachments = normalizeSupportAttachments(msg.attachments)
                    const senderUser = {
                      display_name: msg.sender_display_name,
                      email: msg.sender_email,
                      avatar_url: msg.sender_avatar_url,
                      role: msg.sender_role,
                    }
                    return (
                      <div key={i} className={`direct-chat-msg ${isAdmin ? 'end' : ''}`}>
                        <div className="direct-chat-infos clearfix">
                          <span className={`direct-chat-name ${isAdmin ? 'float-end' : 'float-start'}`}>
                            {msg.sender_display_name || msg.sender_email || 'User'}
                          </span>
                          <span className={`direct-chat-timestamp ${isAdmin ? 'float-start' : 'float-end'}`}>
                            {formatDateTime(msg.created_at)}
                          </span>
                        </div>
                        <UserAvatar
                          user={senderUser}
                          size={32}
                          rounded="full"
                          className={`direct-chat-img ${isAdmin ? 'float-end' : 'float-start'}`}
                        />
                        <div className="direct-chat-text">
                          {msg.message}
                          {attachments.length > 0 && (
                            <div className="mt-2 d-flex flex-wrap gap-1">
                              {attachments.map((att, ai) => att.isImage ? (
                                <img key={ai} src={att.data} alt="attachment" style={{ maxWidth: 120, maxHeight: 80, cursor: 'pointer', borderRadius: 4 }} onClick={() => setPreviewImage(att.data)} />
                              ) : (
                                <a key={ai} href={att.data} target="_blank" rel="noreferrer" className="btn btn-outline-secondary btn-sm">
                                  <i className="bi bi-paperclip"></i> ไฟล์แนบ
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="card-footer">
                {/* Actions */}
                <div className="row g-2 mb-2">
                  <div className="col-auto">
                    <select className="form-select form-select-sm" value={draft.status} onChange={(e) => setDraft(prev => ({ ...prev, status: e.target.value }))}>
                      <option value="open">เปิด</option>
                      <option value="pending">รอดำเนินการ</option>
                      <option value="closed">ปิด</option>
                    </select>
                  </div>
                  <div className="col-auto">
                    <button className="btn btn-outline-primary btn-sm" onClick={() => updateStatus(selectedTicket.id)} disabled={!canManage}>อัปเดตสถานะ</button>
                  </div>
                  <div className="col-auto">
                    <select className="form-select form-select-sm" value={draft.assignTo} onChange={(e) => setDraft(prev => ({ ...prev, assignTo: e.target.value }))}>
                      <option value="">ไม่มีผู้รับผิดชอบ</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.display_name || a.email}</option>)}
                    </select>
                  </div>
                  <div className="col-auto">
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => updateAssign(selectedTicket.id)} disabled={!canManage}>มอบหมาย</button>
                  </div>
                  <div className="col-auto">
                    <button className="btn btn-outline-success btn-sm" onClick={() => claimTicket(selectedTicket.id)} disabled={!canManage}>
                      <i className="bi bi-hand-index me-1"></i>รับเคส
                    </button>
                  </div>
                </div>
                {/* Reply input */}
                <div className="input-group">
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    placeholder="ตอบกลับ... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
                    value={draft.reply}
                    onChange={(e) => setDraft(prev => ({ ...prev, reply: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (canManage && (draft.reply.trim() || replyAttachments.length > 0)) {
                          sendReply(selectedTicket.id)
                        }
                      }
                    }}
                  ></textarea>
                  <label className="btn btn-outline-secondary">
                    <i className="bi bi-paperclip"></i>
                    <input type="file" className="d-none" accept="image/*" multiple onChange={handleAttachment} />
                  </label>
                  <button className="btn btn-primary" onClick={() => sendReply(selectedTicket.id)} disabled={!canManage || (!draft.reply.trim() && replyAttachments.length === 0)}>
                    <i className="bi bi-send me-1"></i>ส่ง
                  </button>
                </div>
                {replyAttachments.length > 0 && (
                  <div className="mt-1 d-flex gap-1 flex-wrap">
                    {replyAttachments.map((att, i) => (
                      <div key={i} className="position-relative">
                        <img src={att.data} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />
                        <button className="btn btn-sm btn-danger position-absolute top-0 end-0" style={{ padding: '0 3px', fontSize: 10 }} onClick={() => setReplyAttachments(prev => prev.filter((_, j) => j !== i))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Image preview modal */}
      {previewImage && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => setPreviewImage('')}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content bg-transparent border-0" onClick={(e) => e.stopPropagation()}>
              <img src={previewImage} alt="preview" className="img-fluid rounded" />
              <button className="btn btn-light btn-sm position-absolute top-0 end-0 m-2" onClick={() => setPreviewImage('')}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
