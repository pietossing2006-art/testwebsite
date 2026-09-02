import { useEffect, useMemo, useState } from 'react'
import { formatDateTime, getErrorMessage } from '../helpers.js'

const PRESETS = [
  { id: 'credentials', label: 'ส่งรหัสผ่าน/บัญชี', title: 'ข้อมูลบัญชี / รหัสผ่านของคุณ', body: 'สวัสดีครับคุณลูกค้า ทีมงานขอนำส่งข้อมูลบัญชีและรหัสผ่านสำหรับเข้าใช้งานดังนี้ครับ:\n\nUsername: \nPassword: \n\nเพื่อความปลอดภัย แนะนำให้เปลี่ยนรหัสผ่านทันทีหลังเข้าสู่ระบบครับ' },
  { id: 'shipping', label: 'แจ้งจัดส่งออเดอร์', title: 'แจ้งสถานะการจัดส่งสินค้า', body: 'สวัสดีครับ ทีมงานได้ดำเนินการจัดส่งออเดอร์ของท่านเรียบร้อยแล้ว รายละเอียดเพิ่มเติม:\n\n- หมายเลขออเดอร์:\n- ข้อมูลจัดส่ง:\n\nขอบคุณที่ใช้บริการครับ' },
  { id: 'gift', label: 'โค้ดส่วนลด/ของขวัญ', title: 'โค้ดส่วนลดและของขวัญพิเศษสำหรับคุณ', body: 'ขอบคุณที่สนับสนุนร้านเรามาโดยตลอดครับ! ทีมงานขอมอบโค้ดส่วนลดพิเศษให้คุณโดยเฉพาะ:\n\nCode: VIP-GIFT-\nส่วนลด: 10%\n\nสามารถนำไปใช้ในหน้าชำระเงินได้ทันทีครับ!' },
  { id: 'urgent', label: 'แจ้งเตือนด่วน', title: 'แจ้งเตือนสำคัญเร่งด่วนจากทีมงาน', body: 'สวัสดีครับคุณลูกค้า มีเรื่องสำคัญเกี่ยวกับบัญชีหรือคำสั่งซื้อของท่านที่ต้องตรวจสอบด่วน:\n\nรายละเอียด:\n\nหากมีข้อสงสัยสามารถติดต่อศูนย์ช่วยเหลือ (Ticket) ได้ทันทีครับ' },
]

export default function MessagesModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [activeTab, setActiveTab] = useState('direct')

  const [chatUsers, setChatUsers] = useState([])
  const [chatUsersLoading, setChatUsersLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [conversation, setConversation] = useState([])
  const [convLoading, setConvLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  const [serverSearchResults, setServerSearchResults] = useState([])
  const [searchingServer, setSearchingServer] = useState(false)

  const [showPickerModal, setShowPickerModal] = useState(false)
  const [pickerUsers, setPickerUsers] = useState([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerRole, setPickerRole] = useState('all')

  const [draftTitle, setDraftTitle] = useState('ข้อความตรงจากทีมงาน')
  const [draftBody, setDraftBody] = useState('')
  const [sending, setSending] = useState(false)

  const [broadcastDraft, setBroadcastDraft] = useState({ title: '', body: '' })

  const canManage = canAction('settings.manage')
  const messages = data?.messages || []

  async function loadDirectChatUsers() {
    setChatUsersLoading(true)
    try {
      const res = await fetchJson('/api/admin/direct-chat/users')
      if (Array.isArray(res?.users) && res.users.length > 0) {
        setChatUsers(res.users)
      } else {
        setChatUsers(buildUsersFromMessages(data?.messages))
      }
    } catch {
      setChatUsers(buildUsersFromMessages(data?.messages))
    } finally {
      setChatUsersLoading(false)
    }
  }

  function buildUsersFromMessages(allMsgs) {
    const userMap = new Map()
    for (const m of allMsgs || []) {
      if (m.target_type === 'individual' && m.target_user_id && !userMap.has(m.target_user_id)) {
        userMap.set(m.target_user_id, {
          user_id: m.target_user_id, id: m.target_user_id,
          username: m.target_username || m.target_email || `User #${m.target_user_id}`,
          display_name: m.target_display_name || `User #${m.target_user_id}`,
          email: m.target_email || '', last_message_at: m.created_at, last_message_title: m.title, last_message_body: m.body,
        })
      }
    }
    return Array.from(userMap.values())
  }

  useEffect(() => { loadDirectChatUsers() }, [])

  async function loadUserConversation(userId) {
    if (!userId) return
    setConvLoading(true)
    try {
      const res = await fetchJson(`/api/admin/direct-chat/${userId}/messages`)
      setConversation(Array.isArray(res?.messages) ? res.messages : [])
    } catch {
      const allMsgs = data?.messages || []
      setConversation(allMsgs.filter((m) => Number(m.target_user_id) === Number(userId)))
    } finally { setConvLoading(false) }
  }

  useEffect(() => {
    if (selectedUser?.user_id || selectedUser?.id) loadUserConversation(selectedUser.user_id || selectedUser.id)
  }, [selectedUser])

  useEffect(() => {
    const q = userSearch.trim()
    if (!q) { setServerSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearchingServer(true)
      try {
        const res = await fetchJson(`/api/admin/users?search=${encodeURIComponent(q)}&limit=8`)
        setServerSearchResults(Array.isArray(res?.users) ? res.users : Array.isArray(res?.items) ? res.items : [])
      } catch { setServerSearchResults([]) } finally { setSearchingServer(false) }
    }, 280)
    return () => clearTimeout(timer)
  }, [userSearch])

  async function loadPickerUsers() {
    setPickerLoading(true)
    try {
      const params = new URLSearchParams()
      if (pickerSearch.trim()) params.set('search', pickerSearch.trim())
      if (pickerRole !== 'all') params.set('role', pickerRole)
      params.set('limit', '50')
      const res = await fetchJson(`/api/admin/users?${params.toString()}`)
      setPickerUsers(Array.isArray(res?.users) ? res.users : Array.isArray(res?.items) ? res.items : [])
    } catch {} finally { setPickerLoading(false) }
  }

  useEffect(() => { if (showPickerModal) loadPickerUsers() }, [showPickerModal, pickerSearch, pickerRole])

  const filteredChatUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return chatUsers
    return chatUsers.filter((u) => `${u.user_id || u.id} ${u.username || ''} ${u.display_name || ''} ${u.email || ''}`.toLowerCase().includes(q))
  }, [chatUsers, userSearch])

  function selectUser(user) {
    setSelectedUser(user)
    setUserSearch('')
    setServerSearchResults([])
    setShowPickerModal(false)
  }

  function applyPreset(id) {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    setDraftTitle(preset.title)
    setDraftBody(preset.body)
  }

  async function handleSendDirectMessage(e) {
    e?.preventDefault?.()
    const uid = selectedUser?.user_id || selectedUser?.id
    if (!uid) { setActionState({ status: 'error', message: 'กรุณาเลือกผู้ใช้ที่ต้องการส่งข้อความ' }); return }
    if (!draftTitle.trim() || !draftBody.trim()) { setActionState({ status: 'error', message: 'กรุณากรอกหัวข้อและข้อความ' }); return }
    setSending(true)
    try {
      try {
        await fetchJson(`/api/admin/direct-chat/${uid}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: draftTitle.trim(), body: draftBody.trim() }) })
      } catch {
        await fetchJson('/api/admin/site-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_type: 'individual', target_user_id: Number(uid), title: draftTitle.trim(), body: draftBody.trim() }) })
      }
      setActionState({ status: 'success', message: `ส่งข้อความตรงถึง ${selectedUser.display_name || selectedUser.username} เรียบร้อย!` })
      setDraftBody('')
      await loadUserConversation(uid)
      await loadDirectChatUsers()
      await loadModuleData('messages')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) } finally { setSending(false) }
  }

  async function handleSendBroadcast(e) {
    e?.preventDefault?.()
    if (!broadcastDraft.title.trim() || !broadcastDraft.body.trim()) { setActionState({ status: 'error', message: 'กรุณากรอกหัวข้อและข้อความประกาศ' }); return }
    try {
      setActionState({ status: 'working', message: 'กำลังส่งประกาศ...' })
      await fetchJson('/api/admin/site-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_type: 'global', title: broadcastDraft.title.trim(), body: broadcastDraft.body.trim() }) })
      setActionState({ status: 'success', message: 'ส่งประกาศถึงสมาชิกทุกคนเรียบร้อย' })
      setBroadcastDraft({ title: '', body: '' })
      await loadModuleData('messages')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function handleDeleteMessage(id) {
    if (!window.confirm('ยืนยันลบข้อความนี้?')) return
    try {
      await fetchJson(`/api/admin/site-messages/${id}`, { method: 'DELETE' })
      if (selectedUser) await loadUserConversation(selectedUser.user_id || selectedUser.id)
      await loadDirectChatUsers()
      await loadModuleData('messages')
    } catch {}
  }

  const bannerTone = actionState.status === 'error' ? 'crit' : actionState.status === 'success' ? 'ok' : 'info'

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`lgx-banner ${bannerTone}`}>
          <span>{actionState.message}</span>
          <button type="button" className="lgx-banner-close" onClick={() => setActionState({ status: 'idle', message: '' })}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div className="lgx-segmented">
          <button type="button" className={`lgx-segmented-btn${activeTab === 'direct' ? ' is-active' : ''}`} onClick={() => setActiveTab('direct')}><i className="bi bi-chat-dots-fill" />แชทตรงรายบุคคล</button>
          <button type="button" className={`lgx-segmented-btn${activeTab === 'global' ? ' is-active' : ''}`} onClick={() => setActiveTab('global')}><i className="bi bi-broadcast" />ประกาศทุกคน</button>
        </div>
      </div>

      {activeTab === 'direct' && (
        <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1fr 1.7fr' }}>
          <div className="lgx-panel">
            <div className="lgx-panel-body" style={{ borderBottom: '1.5px solid var(--lgx-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lgx-text-muted)' }}><i className="bi bi-people-fill" style={{ marginRight: 4 }} />ค้นหา / เลือกผู้ใช้</span>
                <button type="button" className="lgx-btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setShowPickerModal(true)}>ดูรายชื่อทั้งหมด</button>
              </div>
              <label className="lgx-sidebar-search" style={{ width: '100%' }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 14, height: 14 }}><circle cx="8.5" cy="8.5" r="5.5" /><path d="m16 16-3.2-3.2" /></svg>
                <input type="text" placeholder="พิมพ์ชื่อ / Username / Email / ID..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
              </label>

              {userSearch.trim() ? (
                <div style={{ marginTop: 8, border: '1.5px solid var(--lgx-border)', borderRadius: 'var(--lgx-radius)', maxHeight: 200, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--lgx-text-muted)' }}>
                    <span>ผลค้นหาทั้งระบบ</span>{searchingServer ? <span>...</span> : null}
                  </div>
                  {serverSearchResults.length === 0 && !searchingServer ? (
                    <div className="lgx-empty" style={{ padding: '10px 0' }}>ไม่พบสมาชิกที่ตรงกับ &quot;{userSearch}&quot;</div>
                  ) : serverSearchResults.map((u) => (
                    <button key={u.id} type="button" onClick={() => selectUser(u)} className="lgx-notif-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--lgx-text-muted)' }}>#{u.id}</span>
                        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><strong>{u.display_name || u.username}</strong> <span style={{ color: 'var(--lgx-text-muted)' }}>({u.email || u.username})</span></span>
                      </span>
                      <span className="lgx-pill neutral">{u.role || 'member'}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ padding: '8px 18px', fontSize: 10.5, fontWeight: 700, color: 'var(--lgx-text-muted)', borderBottom: '1px solid var(--lgx-border)' }}>ประวัติแชทล่าสุด ({filteredChatUsers.length})</div>
            <div className="lgx-ticket-list" style={{ maxHeight: 480, overflowY: 'auto' }}>
              {chatUsersLoading ? <div className="lgx-empty">กำลังโหลดรายการแชท...</div> : filteredChatUsers.length === 0 ? (
                <div className="lgx-empty">
                  <i className="bi bi-chat-square-text" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />
                  ยังไม่มีประวัติแชทตรงกับผู้ใช้
                  <div style={{ fontSize: 11, marginTop: 4 }}>กดปุ่ม &quot;ดูรายชื่อทั้งหมด&quot; หรือค้นหาด้านบนเพื่อเริ่มแชท</div>
                </div>
              ) : filteredChatUsers.map((u) => {
                const uid = u.user_id || u.id
                const isSelected = selectedUser && Number(selectedUser.user_id || selectedUser.id) === Number(uid)
                const hasUnread = Number(u.unread_by_user || 0) > 0
                return (
                  <button key={uid} type="button" onClick={() => selectUser(u)} className={`lgx-ticket-item${isSelected ? ' is-active' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.display_name || u.username}</span>
                      <span className={`lgx-pill ${hasUnread ? 'warn' : 'neutral'}`}>#{uid}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.last_message_title ? `[${u.last_message_title}] ` : ''}{u.last_message_body || 'ไม่มีข้อความ'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--lgx-text-muted)' }}>{formatDateTime(u.last_message_at)}</span>
                      {hasUnread ? <span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>รอเปิดอ่าน ({u.unread_by_user})</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedUser ? (
            <div className="lgx-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="lgx-panel-body" style={{ borderBottom: '1.5px solid var(--lgx-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="lgx-avatar" style={{ width: 38, height: 38 }}>{(selectedUser.display_name || selectedUser.username || 'U').charAt(0).toUpperCase()}</span>
                  <div>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {selectedUser.display_name || selectedUser.username}
                      <span className="lgx-pill neutral">#{selectedUser.user_id || selectedUser.id}</span>
                      {selectedUser.role ? <span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>{selectedUser.role}</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{selectedUser.email || `@${selectedUser.username || ''}`}</div>
                  </div>
                </div>
                <div className="lgx-btn-group">
                  <button type="button" className="lgx-btn" onClick={() => setShowPickerModal(true)}><i className="bi bi-person-plus" />เปลี่ยนผู้ใช้</button>
                  <button type="button" className="lgx-icon-action" onClick={() => loadUserConversation(selectedUser.user_id || selectedUser.id)}><i className="bi bi-arrow-clockwise" /></button>
                  <button type="button" className="lgx-icon-action" onClick={() => setSelectedUser(null)}><i className="bi bi-x-lg" /></button>
                </div>
              </div>

              <div style={{ padding: 16, background: 'var(--lgx-surface-alt)', flex: 1, minHeight: 320, maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {convLoading ? <div className="lgx-empty">กำลังโหลดบทสนทนา...</div> : conversation.length === 0 ? (
                  <div className="lgx-empty">
                    <i className="bi bi-send-check" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />
                    <div style={{ fontWeight: 700, color: 'var(--lgx-text)' }}>ยังไม่มีข้อความส่งถึง {selectedUser.display_name || selectedUser.username}</div>
                    <div>พิมพ์ข้อความหรือเลือกเทมเพลตด้านล่างเพื่อส่งรหัส/ข้อมูลให้ลูกค้าทันที</div>
                  </div>
                ) : conversation.map((msg) => (
                  <div key={msg.id} className="lgx-chat-row is-mine">
                    <div className="lgx-chat-bubble is-mine" style={{ maxWidth: '85%' }}>
                      <div className="lgx-chat-meta">
                        <span style={{ fontWeight: 700 }}>{msg.sender_display_name || msg.sender_username || 'แอดมิน'} · {msg.title}</span>
                        <button type="button" onClick={() => handleDeleteMessage(msg.id)} style={{ background: 'none', border: 'none', color: 'inherit', opacity: .8, cursor: 'pointer' }} title="ลบข้อความนี้">×</button>
                      </div>
                      <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11.5, margin: 0 }}>{msg.body}</pre>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10 }}>
                        <span style={{ opacity: .85 }}>{formatDateTime(msg.created_at)}</span>
                        {msg.is_read_by_user ? <span>เปิดอ่านแล้ว ({formatDateTime(msg.user_read_at)})</span> : <span>รอลูกค้าเปิด</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="lgx-panel-body" style={{ borderTop: '1.5px solid var(--lgx-border)' }}>
                <div className="lgx-chip-row" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lgx-text-muted)', marginRight: 2 }}>เทมเพลตด่วน:</span>
                  {PRESETS.map((p) => <button key={p.id} type="button" className="lgx-chip" onClick={() => applyPreset(p.id)}>{p.label}</button>)}
                </div>
                <form onSubmit={handleSendDirectMessage}>
                  <input type="text" className="lgx-input" style={{ marginBottom: 8, fontWeight: 700 }} placeholder="หัวข้อข้อความ..." value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} required />
                  <textarea className="lgx-textarea" rows={4} placeholder="พิมพ์ข้อความ รหัสลับ ข้อมูลเข้าสู่ระบบ หรือข้อความที่ต้องการส่งตรงถึงลูกค้า..." value={draftBody} onChange={(e) => setDraftBody(e.target.value)} required style={{ marginBottom: 8 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>ข้อความนี้จะส่งตรงเข้ากล่องข้อความของ <strong>{selectedUser.display_name || selectedUser.username}</strong> เท่านั้น</span>
                    <button type="submit" className="lgx-btn lgx-btn-accent" disabled={sending || !draftBody.trim() || !canManage}>{sending ? 'กำลังส่ง...' : <><i className="bi bi-send-fill" />ส่งข้อความทันที</>}</button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="lgx-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
              <div className="lgx-empty">
                <i className="bi bi-chat-dots" style={{ display: 'block', fontSize: 32, marginBottom: 10 }} />
                <div style={{ fontWeight: 700, color: 'var(--lgx-text)', fontSize: 14 }}>เลือกผู้ใช้เพื่อเปิดหน้าต่างแชทตรง</div>
                <div style={{ margin: '6px 0 14px' }}>พิมพ์ค้นหาชื่อ/Username ทางซ้าย หรือกดปุ่ม &quot;ดูรายชื่อทั้งหมด&quot;</div>
                <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => setShowPickerModal(true)}><i className="bi bi-people-fill" />เลือกจากรายชื่อสมาชิกในระบบ</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'global' && (
        <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2><i className="bi bi-broadcast" style={{ marginRight: 6 }} />ส่งประกาศทุกคน</h2></div>
            <div className="lgx-panel-body">
              <form onSubmit={handleSendBroadcast}>
                <div className="lgx-field" style={{ marginBottom: 12 }}><label>หัวข้อประกาศ *</label><input className="lgx-input" placeholder="เช่น แจ้งอัปเดตระบบ หรือโปรโมชันใหม่..." value={broadcastDraft.title} onChange={(e) => setBroadcastDraft((prev) => ({ ...prev, title: e.target.value }))} required /></div>
                <div className="lgx-field" style={{ marginBottom: 12 }}><label>เนื้อหาประกาศ *</label><textarea className="lgx-textarea" rows={5} placeholder="พิมพ์ข้อความประกาศที่จะส่งถึงสมาชิกทุกคนในระบบ..." value={broadcastDraft.body} onChange={(e) => setBroadcastDraft((prev) => ({ ...prev, body: e.target.value }))} required /></div>
                <button type="submit" className="lgx-btn lgx-btn-accent" disabled={!canManage}><i className="bi bi-send" />ส่งประกาศถึงทุกคน</button>
              </form>
            </div>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2>ประวัติข้อความระบบ</h2><span>{messages.length} รายการ</span></div>
            <table className="lgx-table">
              <thead><tr><th>ประเภท</th><th>หัวข้อ</th><th>ผู้รับ</th><th>วันที่</th><th /></tr></thead>
              <tbody>
                {messages.length === 0 ? <tr><td colSpan={5} className="lgx-empty">ไม่มีข้อความในประวัติ</td></tr> : messages.map((m) => (
                  <tr key={m.id}>
                    <td><span className={`lgx-pill ${m.target_type === 'global' ? '' : 'ok'}`} style={m.target_type === 'global' ? { background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' } : undefined}>{m.target_type === 'global' ? 'ทุกคน' : 'เฉพาะคน'}</span></td>
                    <td style={{ fontWeight: 700 }}>{m.title}</td>
                    <td>{m.target_type === 'global' ? 'สมาชิกทุกคน' : m.target_display_name || m.target_email || `#${m.target_user_id}`}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{formatDateTime(m.created_at)}</td>
                    <td><button type="button" className="lgx-icon-action danger" onClick={() => handleDeleteMessage(m.id)}><i className="bi bi-trash" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPickerModal && (
        <div className="lgx-modal-backdrop" onClick={() => setShowPickerModal(false)}>
          <div className="lgx-modal-card" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
            <div className="lgx-modal-head">
              <div style={{ fontWeight: 700 }}><i className="bi bi-people-fill" style={{ marginRight: 6 }} />เลือกสมาชิกเพื่อเปิดแชทตรง</div>
              <button type="button" className="lgx-icon-action" onClick={() => setShowPickerModal(false)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="lgx-panel-body" style={{ borderBottom: '1.5px solid var(--lgx-border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="text" className="lgx-input" style={{ flex: '1 1 260px' }} placeholder="ค้นหาชื่อ, Username, Email..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} autoFocus />
              <select className="lgx-select" style={{ width: 'auto' }} value={pickerRole} onChange={(e) => setPickerRole(e.target.value)}>
                <option value="all">ทุกระดับบทบาท</option>
                <option value="member">สมาชิกทั่วไป</option>
                <option value="vip">VIP</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {pickerLoading ? <div className="lgx-empty">กำลังโหลดรายชื่อสมาชิก...</div> : pickerUsers.length === 0 ? (
              <div className="lgx-empty"><i className="bi bi-person-x" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />ไม่พบสมาชิกตามเงื่อนไขที่ค้นหา</div>
            ) : (
              <table className="lgx-table">
                <thead><tr><th>ID</th><th>ผู้ใช้</th><th>อีเมล</th><th>บทบาท</th><th /></tr></thead>
                <tbody>
                  {pickerUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="mono" style={{ color: 'var(--lgx-text-muted)' }}>#{u.id}</td>
                      <td><div style={{ fontWeight: 700 }}>{u.display_name || u.username}</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>@{u.username}</div></td>
                      <td style={{ color: 'var(--lgx-text-muted)' }}>{u.email || '-'}</td>
                      <td><span className={`lgx-pill ${u.role === 'admin' ? 'crit' : u.role === 'vip' ? 'ok' : u.role === 'staff' ? 'warn' : 'neutral'}`}>{u.role || 'member'}</span></td>
                      <td><button type="button" className="lgx-btn lgx-btn-accent" onClick={() => selectUser(u)}>เลือกแชท</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="lgx-modal-foot" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>แสดงสมาชิก {pickerUsers.length} รายการ</span>
              <button type="button" className="lgx-btn" onClick={() => setShowPickerModal(false)}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
