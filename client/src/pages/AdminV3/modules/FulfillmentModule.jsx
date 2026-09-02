import { useState, useEffect, useRef, useMemo } from 'react'
import { formatNumber, formatDateTime, formatRelativeTime, getErrorMessage } from '../helpers.js'
import { loadFulfillmentModule, loadFulfillmentRequestDetail } from '../loaders.js'
import { connectSocket } from '../../../socket.js'
import { copyToClipboard } from '../../../api.js'

const DELIVERY_PRESETS = [
  { id: 'done_general', label: 'ส่งมอบสำเร็จ', text: 'ดำเนินการฟาร์ม / เติมเงินสำเร็จเรียบร้อยครับ ขอบคุณที่ใช้บริการ VXPERS STORE' },
  { id: 'ready_to_play', label: 'พร้อมเข้าเกม', text: 'ดำเนินการเรียบร้อยแล้วครับ ลูกค้าสามารถเข้าเกมและตรวจสอบไอเทมได้ทันทีครับ' },
  { id: 'delivered_code', label: 'จัดส่งรหัส/ข้อมูล', text: 'จัดส่งรหัส/ข้อมูลสินค้าสำเร็จเรียบร้อยครับ หากติดปัญหาแจ้งทางแชทซัพพอร์ตได้ตลอด 24 ชม.' },
  { id: 'farm_complete', label: 'ฟาร์มเสร็จสิ้น', text: 'ทำภารกิจและฟาร์มเลเวล/ของครบถ้วนตามรายการสั่งซื้อเรียบร้อยครับ ตรวจสอบในเกมได้เลยครับ' },
]

const STATUS_TONE = { pending: 'warn', in_progress: 'accent', fulfilled: 'ok', cancelled: 'neutral', canceled: 'neutral' }
const AGING_HOURS = 2

function statusLabel(s) {
  const key = String(s || '').toLowerCase()
  if (key === 'pending') return 'รอดำเนินการ'
  if (key === 'in_progress') return 'กำลังดำเนินการ'
  if (key === 'fulfilled') return 'สำเร็จแล้ว'
  if (key === 'cancelled' || key === 'canceled') return 'ยกเลิก'
  return s || '-'
}

function hoursSince(dateStr) {
  if (!dateStr) return 0
  const t = new Date(dateStr).getTime()
  if (!Number.isFinite(t)) return 0
  return (Date.now() - t) / 3600000
}

function isAging(r) {
  const status = String(r.status || '').toLowerCase()
  if (status !== 'pending' && status !== 'in_progress') return false
  return hoursSince(r.created_at) >= AGING_HOURS
}

function CopyBtn({ value, keyName, copiedKey, onCopy }) {
  return <button type="button" className="lgx-cred-btn" onClick={() => onCopy(value, keyName)}>{copiedKey === keyName ? <i className="bi bi-check-lg" /> : <i className="bi bi-clipboard" />}</button>
}

function StatusPill({ status }) {
  const tone = STATUS_TONE[String(status || '').toLowerCase()] || 'neutral'
  return <span className={`lgx-pill ${tone === 'accent' ? '' : tone}`} style={tone === 'accent' ? { background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' } : undefined}>{statusLabel(status)}</span>
}

const VIEWS = [
  { id: 'table', label: 'ตารางคิวงาน', icon: 'bi-table' },
  { id: 'kanban', label: 'กระดาน Kanban', icon: 'bi-kanban' },
  { id: 'analytics', label: 'ผลงานทีมงาน', icon: 'bi-bar-chart-line' },
]

export default function FulfillmentModule({ data, ctx }) {
  const { fulfillmentQuery, setFulfillmentQuery, canAction, patchModuleData, fetchJson, session } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [viewMode, setViewMode] = useState('table')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')
  const [newStaffNote, setNewStaffNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [fulfillForm, setFulfillForm] = useState({ id: null, payload: '' })
  const [cancelForm, setCancelForm] = useState({ id: null, note: '' })
  const [assignForm, setAssignForm] = useState({ id: null, booster_id: '' })
  const [activeAction, setActiveAction] = useState(null)
  const [searchDraft, setSearchDraft] = useState(fulfillmentQuery?.search || '')
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [bulkClaiming, setBulkClaiming] = useState(false)
  const [showAgingOnly, setShowAgingOnly] = useState(false)
  const refreshTimerRef = useRef(null)

  const canManage = canAction('fulfillment.manage')
  const requests = data?.requests || []
  const boosters = data?.boosters || []
  const summary = data?.summary || {}
  const agingCount = requests.filter(isAging).length
  const claimableIds = requests.filter((r) => r.status === 'pending' && !r.assigned_booster_id).map((r) => r.id)

  const scopeTabs = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'mine', label: 'ของฉัน', count: summary.mine },
    { id: 'unassigned', label: 'ไม่มีผู้รับ', count: summary.unassigned },
  ]

  function patchQuery(obj) { setFulfillmentQuery((prev) => ({ ...prev, ...obj })) }

  function handleCopy(text, key) {
    if (!text) return
    copyToClipboard(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 2000)
  }

  useEffect(() => {
    if (session?.status !== 'ready') return
    const socket = connectSocket()
    const onUpdate = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(async () => {
        try {
          await refreshSilently()
          if (selectedId) await openDetail(selectedId, false)
        } finally {
          refreshTimerRef.current = null
        }
      }, 300)
    }
    socket.on('fulfillment_update', onUpdate)
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      socket.off('fulfillment_update', onUpdate)
    }
  }, [session?.status, selectedId, fulfillmentQuery])

  async function refreshSilently() {
    try {
      const d = await loadFulfillmentModule(fulfillmentQuery)
      patchModuleData('fulfillment', () => d)
      return d
    } catch { return null }
  }

  function findNextQueueItem(list, currentId) {
    const actionable = (list || []).filter((r) => r.status === 'pending' || r.status === 'in_progress')
    if (actionable.length === 0) return null
    const idx = actionable.findIndex((r) => r.id === currentId)
    if (idx === -1) return actionable[0].id
    return actionable[(idx + 1) % actionable.length]?.id ?? null
  }

  async function goToNextAfter(requestId) {
    const d = await refreshSilently()
    const list = d?.requests || requests
    const nextId = autoAdvance ? findNextQueueItem(list, requestId) : null
    if (nextId) {
      await openDetail(nextId, true)
    } else {
      setViewMode('table')
      setSelectedId(null)
    }
  }

  async function claimAllUnassigned() {
    if (claimableIds.length === 0) return
    if (!window.confirm(`ต้องการรับงานทั้งหมด ${claimableIds.length} รายการที่ยังไม่มีผู้รับหรือไม่?`)) return
    setBulkClaiming(true)
    setActionState({ status: 'working', message: `กำลังรับงาน ${claimableIds.length} รายการ...` })
    let ok = 0
    for (const id of claimableIds) {
      try {
        await fetchJson(`/api/admin/farm-requests/${id}/claim`, { method: 'POST' })
        ok += 1
      } catch { /* skip failed items, continue with the rest */ }
    }
    setActionState({ status: ok === claimableIds.length ? 'success' : 'error', message: `รับงานสำเร็จ ${ok}/${claimableIds.length} รายการ` })
    setBulkClaiming(false)
    await refreshSilently()
  }

  async function openDetail(requestId, switchView = true) {
    const rid = Number(requestId)
    if (!Number.isFinite(rid)) return
    setSelectedId(rid)
    setDetailLoading(true)
    setActiveAction(null)
    setShowPassword(false)
    if (switchView) setViewMode('workstation')
    try {
      const d = await loadFulfillmentRequestDetail(rid)
      setDetail(d)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function claimRequest(requestId) {
    try {
      setActionState({ status: 'working', message: 'กำลังรับงาน...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/claim`, { method: 'POST' })
      setActionState({ status: 'success', message: 'รับงานสำเร็จเรียบร้อย' })
      await refreshSilently()
      if (selectedId === requestId) await openDetail(requestId, false)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถรับงานได้') }) }
  }

  async function startRequest(requestId) {
    try {
      setActionState({ status: 'working', message: 'กำลังเริ่มงาน...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/start`, { method: 'POST' })
      setActionState({ status: 'success', message: 'เปลี่ยนสถานะเป็น "กำลังดำเนินการ" แล้ว' })
      await refreshSilently()
      if (selectedId === requestId) await openDetail(requestId, false)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถเริ่มงานได้') }) }
  }

  async function fulfillRequest(requestId) {
    try {
      setActionState({ status: 'working', message: 'กำลังส่งมอบงาน...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/fulfill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: fulfillForm.payload }) })
      setActionState({ status: 'success', message: autoAdvance ? 'ส่งมอบงานเรียบร้อย — กำลังไปงานถัดไป' : 'ส่งมอบงานให้ลูกค้าเรียบร้อยแล้ว' })
      setActiveAction(null)
      setFulfillForm({ id: null, payload: '' })
      if (selectedId === requestId) await goToNextAfter(requestId)
      else await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err, 'เกิดข้อผิดพลาดในการส่งมอบ') }) }
  }

  async function cancelRequest(requestId) {
    try {
      setActionState({ status: 'working', message: 'กำลังยกเลิกงาน...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: cancelForm.note }) })
      setActionState({ status: 'success', message: 'ยกเลิกงานบริการเรียบร้อยแล้ว' })
      setActiveAction(null)
      setCancelForm({ id: null, note: '' })
      if (selectedId === requestId) await goToNextAfter(requestId)
      else await refreshSilently()
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถยกเลิกงานได้') }) }
  }

  async function assignRequest(requestId) {
    if (!assignForm.booster_id) return
    try {
      setActionState({ status: 'working', message: 'กำลังมอบหมายงาน...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booster_id: Number(assignForm.booster_id) }) })
      setActionState({ status: 'success', message: 'มอบหมายงานให้ทีมงานเรียบร้อย' })
      setActiveAction(null)
      await refreshSilently()
      if (selectedId === requestId) await openDetail(requestId, false)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถมอบหมายงานได้') }) }
  }

  async function handleAddStaffNote(requestId) {
    if (!newStaffNote.trim()) return
    setSavingNote(true)
    try {
      await fetchJson(`/api/admin/farm-requests/${requestId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: newStaffNote.trim() }) })
      setNewStaffNote('')
      await openDetail(requestId, false)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถบันทึกโน้ตได้') }) } finally { setSavingNote(false) }
  }

  const kpis = [
    { val: 'pending', label: 'รอดำเนินการ', count: summary.pending, tone: 'warn', detail: 'รอทีมงานรับงาน' },
    { val: 'in_progress', label: 'กำลังดำเนินการ', count: summary.in_progress, detail: 'ทีมงานกำลังฟาร์ม' },
    { val: 'fulfilled', label: 'สำเร็จแล้ว', count: summary.fulfilled, detail: 'ส่งมอบลูกค้าเรียบร้อย' },
    { val: 'cancelled', label: 'ยกเลิก', count: summary.cancelled, detail: 'งานที่ถูกยกเลิก' },
  ]

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
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={`lgx-segmented-btn${viewMode === v.id ? ' is-active' : ''}`} onClick={() => { setViewMode(v.id); setSelectedId(null) }}>
              <i className={`bi ${v.icon}`} />{v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lgx-strip">
        {kpis.map((k) => {
          const isActive = (fulfillmentQuery?.status || '') === k.val
          return (
            <button key={k.val} type="button" className={`lgx-stat is-clickable`} style={isActive ? { outline: '2px solid var(--lgx-accent)', outlineOffset: -2 } : undefined} onClick={() => patchQuery({ status: isActive ? '' : k.val })}>
              <div className="l">{k.label}</div>
              <div className={`v${k.tone ? ` ${k.tone}` : ''}`}>{formatNumber(k.count)}</div>
              <div className="d">{k.detail}</div>
            </button>
          )
        })}
      </div>

      {viewMode === 'workstation' && selectedId && (
        <FulfillmentWorkstationView
          detail={detail} loading={detailLoading} boosters={boosters} canManage={canManage}
          showPassword={showPassword} setShowPassword={setShowPassword} copiedKey={copiedKey} onCopy={handleCopy}
          onBack={() => { setViewMode('table'); setSelectedId(null) }}
          activeAction={activeAction} setActiveAction={setActiveAction}
          assignForm={assignForm} setAssignForm={setAssignForm}
          fulfillForm={fulfillForm} setFulfillForm={setFulfillForm}
          cancelForm={cancelForm} setCancelForm={setCancelForm}
          onClaim={() => claimRequest(selectedId)} onStart={() => startRequest(selectedId)}
          onAssign={() => assignRequest(selectedId)} onFulfill={() => fulfillRequest(selectedId)} onCancel={() => cancelRequest(selectedId)}
          newStaffNote={newStaffNote} setNewStaffNote={setNewStaffNote} savingNote={savingNote} onAddNote={() => handleAddStaffNote(selectedId)}
          autoAdvance={autoAdvance} setAutoAdvance={setAutoAdvance}
        />
      )}

      {viewMode === 'table' && (
        <>
          {agingCount > 0 && (
            <div className="lgx-banner warn">
              <span><i className="bi bi-alarm-fill" style={{ marginRight: 6 }} /><strong>มีงานค้างเกิน {AGING_HOURS} ชม. อยู่ {agingCount} รายการ</strong> — ควรรีบดำเนินการก่อนคิวอื่น</span>
              <button type="button" className="lgx-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowAgingOnly((v) => !v)}>{showAgingOnly ? 'แสดงทั้งหมด' : 'ดูเฉพาะงานค้าง'}</button>
            </div>
          )}

          <div className="lgx-panel">
            <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <div className="lgx-segmented">
                  {scopeTabs.map((tab) => (
                    <button key={tab.id} type="button" className={`lgx-segmented-btn${(fulfillmentQuery?.scope || 'all') === tab.id ? ' is-active' : ''}`} onClick={() => patchQuery({ scope: tab.id })}>
                      {tab.label}{tab.count != null ? <span className="count">{tab.count}</span> : null}
                    </button>
                  ))}
                </div>
                <select className="lgx-select" style={{ width: 'auto' }} value={fulfillmentQuery?.status || ''} onChange={(e) => patchQuery({ status: e.target.value })}>
                  <option value="">ทุกสถานะ</option>
                  <option value="pending">รอดำเนินการ ({formatNumber(summary.pending)})</option>
                  <option value="in_progress">กำลังดำเนินการ ({formatNumber(summary.in_progress)})</option>
                  <option value="fulfilled">สำเร็จแล้ว ({formatNumber(summary.fulfilled)})</option>
                  <option value="cancelled">ยกเลิก ({formatNumber(summary.cancelled)})</option>
                </select>
                {(fulfillmentQuery?.status || fulfillmentQuery?.search) && (
                  <button type="button" className="lgx-btn" onClick={() => { setSearchDraft(''); patchQuery({ status: '', search: '' }) }}><i className="bi bi-x-circle" />ล้างตัวกรอง</button>
                )}
                {canManage && claimableIds.length > 0 && (
                  <button type="button" className="lgx-btn lgx-btn-ok" disabled={bulkClaiming} onClick={claimAllUnassigned}>
                    <i className="bi bi-hand-index-thumb" />{bulkClaiming ? 'กำลังรับงาน...' : `รับงานทั้งหมด (${claimableIds.length})`}
                  </button>
                )}
              </div>
              <form style={{ display: 'flex', gap: 6 }} onSubmit={(e) => { e.preventDefault(); patchQuery({ search: searchDraft.trim() }) }}>
                <input type="text" className="lgx-input" style={{ width: 220 }} placeholder="ค้นหา Order, ผู้ใช้, สินค้า..." value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
                <button type="submit" className="lgx-btn lgx-btn-accent"><i className="bi bi-search" /></button>
              </form>
            </div>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2>รายการคิวงานบริการ ({formatNumber((showAgingOnly ? requests.filter(isAging) : requests).length)})</h2></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="lgx-table">
                <thead><tr><th>ID</th><th>ลูกค้า</th><th>สินค้า &amp; ตัวเลือก</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>เวลา</th><th /></tr></thead>
                <tbody>
                  {(showAgingOnly ? requests.filter(isAging) : requests).map((r) => (
                    <tr key={r.id} className={isAging(r) ? 'st-crit' : STATUS_TONE[String(r.status || '').toLowerCase()] === 'ok' ? 'st-ok' : STATUS_TONE[String(r.status || '').toLowerCase()] === 'warn' ? 'st-warn' : ''}>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--lgx-text-muted)' }}>#{r.id}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="lgx-avatar" style={{ width: 30, height: 30 }}>{(r.user_username || r.user_display_name || r.user_email || 'U').slice(0, 1).toUpperCase()}</span>
                          <div>
                            <div style={{ fontWeight: 700 }}>{r.user_username || r.user_display_name || '-'}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{r.user_email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.product_name || '-'}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{r.order_qty > 1 ? `จำนวน ${r.order_qty} ชิ้น • ` : ''}Order #{r.order_id || '-'}</div>
                      </td>
                      <td><StatusPill status={r.status} /></td>
                      <td>
                        {r.assigned_booster_id ? (
                          <span style={{ fontWeight: 600 }}><i className="bi bi-person-check-fill" style={{ color: 'var(--lgx-ok)', marginRight: 4 }} />{r.assigned_username || r.assigned_display_name || `#${r.assigned_booster_id}`}</span>
                        ) : <span className="lgx-pill neutral">ยังไม่มีผู้รับ</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }} title={formatDateTime(r.created_at)}>
                        {isAging(r) && <i className="bi bi-alarm-fill" style={{ color: 'var(--lgx-crit)', marginRight: 4 }} title={`ค้างมาแล้วเกิน ${AGING_HOURS} ชม.`} />}
                        {formatRelativeTime(r.created_at)}
                      </td>
                      <td>
                        <div className="lgx-btn-group">
                          {!r.assigned_booster_id && r.status === 'pending' && canManage && <button type="button" className="lgx-btn lgx-btn-ok" onClick={() => claimRequest(r.id)} title="กดรับงานนี้"><i className="bi bi-hand-index-thumb" />รับงาน</button>}
                          {r.status === 'pending' && r.assigned_booster_id && canManage && <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => startRequest(r.id)} title="เริ่มดำเนินการ"><i className="bi bi-play-fill" />เริ่มทำ</button>}
                          {r.status === 'in_progress' && canManage && <button type="button" className="lgx-btn lgx-btn-ok" onClick={() => openDetail(r.id)} title="เปิดโต๊ะทำงานเพื่อส่งมอบ"><i className="bi bi-check-circle" />ส่งงาน</button>}
                          {(r.status === 'fulfilled' || r.status === 'cancelled' || r.status === 'canceled' || (r.status === 'pending' && !canManage)) && (
                            <button type="button" className="lgx-icon-action" onClick={() => openDetail(r.id)} title="ดูรายละเอียด"><i className="bi bi-box-arrow-up-right" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(showAgingOnly ? requests.filter(isAging) : requests).length === 0 && (
                    <tr><td colSpan={7} className="lgx-empty"><i className="bi bi-inbox" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />{showAgingOnly ? 'ไม่มีงานค้างในขณะนี้' : 'ไม่พบรายการงานบริการในหมวดหมู่นี้'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {viewMode === 'kanban' && (
        <FulfillmentKanbanView requests={requests} onOpenDetail={(id) => openDetail(id)} onClaim={claimRequest} onStart={startRequest} canManage={canManage} />
      )}

      {viewMode === 'analytics' && (
        <FulfillmentAnalyticsView requests={requests} boosters={boosters} onFilterBooster={(boosterId) => { patchQuery({ assignedTo: String(boosterId) }); setViewMode('table') }} />
      )}
    </>
  )
}

function FulfillmentWorkstationView({
  detail, loading, boosters, canManage,
  showPassword, setShowPassword, copiedKey, onCopy, onBack,
  activeAction, setActiveAction,
  assignForm, setAssignForm, fulfillForm, setFulfillForm, cancelForm, setCancelForm,
  onClaim, onStart, onAssign, onFulfill, onCancel,
  newStaffNote, setNewStaffNote, savingNote, onAddNote,
  autoAdvance, setAutoAdvance,
}) {
  if (loading) return <div className="lgx-panel"><div className="lgx-empty"><i className="bi bi-hourglass-split" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />กำลังโหลดข้อมูลโต๊ะทำงาน...</div></div>

  const req = detail?.request
  const logs = detail?.logs || []

  if (!req) {
    return (
      <div className="lgx-panel">
        <div className="lgx-empty">
          <div style={{ color: 'var(--lgx-crit)', fontWeight: 700, marginBottom: 8 }}>ไม่พบข้อมูลงานบริการนี้</div>
          <button type="button" className="lgx-btn" onClick={onBack}><i className="bi bi-arrow-left" />กลับไปหน้ารายการ</button>
        </div>
      </div>
    )
  }

  const formFields = Array.isArray(req.farm_form_fields) ? req.farm_form_fields : []
  const formLabels = Object.fromEntries(formFields.map((f) => [f.id, f.label || f.id]))
  const formDataEntries = req.form_data && typeof req.form_data === 'object' ? Object.entries(req.form_data) : []

  return (
    <>
      <div className="lgx-panel">
        <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="button" className="lgx-btn" onClick={onBack}><i className="bi bi-arrow-left" />กลับหน้ารายการ</button>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>#{req.id} — {req.product_name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)' }}>Order #{req.order_id || '-'} &middot; จำนวน {req.order_qty || 1} ชิ้น &middot; สั่งเมื่อ {formatDateTime(req.created_at)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <label className="lgx-checkbox-row" title="เมื่อส่งมอบหรือยกเลิกงานสำเร็จ จะเปิดงานถัดไปในคิวให้อัตโนมัติ">
              <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} /> ทำงานต่อเนื่องอัตโนมัติ
            </label>
            <StatusPill status={req.status} />
          </div>
        </div>
      </div>

      <div className="lgx-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2><i className="bi bi-key-fill" style={{ marginRight: 6, color: 'var(--lgx-warn)' }} />ข้อมูลบัญชีและเข้าเกม</h2><span className="mono">CONFIDENTIAL</span></div>
            <div className="lgx-panel-body">
              <div className="lgx-cred-box">
                {req.uid && <div className="lgx-cred-field"><div><div className="lgx-cred-label">UID / Game ID</div><div className="lgx-cred-value">{req.uid}</div></div><CopyBtn value={req.uid} keyName="uid" copiedKey={copiedKey} onCopy={onCopy} /></div>}
                {req.username && <div className="lgx-cred-field"><div><div className="lgx-cred-label">Username / Account</div><div className="lgx-cred-value">{req.username}</div></div><CopyBtn value={req.username} keyName="username" copiedKey={copiedKey} onCopy={onCopy} /></div>}
                {req.password && (
                  <div className="lgx-cred-field">
                    <div><div className="lgx-cred-label">Password</div><div className="lgx-cred-value">{showPassword ? req.password : '••••••••••••'}</div></div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="lgx-cred-btn" onClick={() => setShowPassword((p) => !p)}><i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} /></button>
                      <CopyBtn value={req.password} keyName="password" copiedKey={copiedKey} onCopy={onCopy} />
                    </div>
                  </div>
                )}
                {req.auth_key && <div className="lgx-cred-field"><div><div className="lgx-cred-label">Auth Key / 2FA Backup</div><div className="lgx-cred-value">{req.auth_key}</div></div><CopyBtn value={req.auth_key} keyName="auth_key" copiedKey={copiedKey} onCopy={onCopy} /></div>}
                {formDataEntries.length > 0 && formDataEntries.map(([k, v]) => (
                  <div className="lgx-cred-field" key={k}><div><div className="lgx-cred-label">{formLabels[k] || k}</div><div className="lgx-cred-value">{v === true ? 'ใช่' : v === false ? 'ไม่ใช่' : String(v)}</div></div><CopyBtn value={String(v)} keyName={k} copiedKey={copiedKey} onCopy={onCopy} /></div>
                ))}
              </div>
            </div>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2><i className="bi bi-person-circle" style={{ marginRight: 6 }} />ข้อมูลลูกค้า &amp; คำสั่งซื้อ</h2></div>
            <div className="lgx-panel-body">
              <div className="lgx-kv"><span className="k">ชื่อลูกค้า</span><span className="v">{req.user_username || req.user_display_name || '-'}</span></div>
              <div className="lgx-kv"><span className="k">อีเมล</span><span className="v mono">{req.user_email || '-'}</span></div>
              <div className="lgx-kv"><span className="k">ผู้รับผิดชอบ</span><span className="v">{req.assigned_username ? <span className="lgx-pill ok">{req.assigned_username}</span> : <span className="lgx-pill neutral">ยังไม่มีผู้รับผิดชอบ</span>}</span></div>
              <div className="lgx-kv"><span className="k">เวลาที่ใช้ไป</span><span className="v mono">{formatRelativeTime(req.created_at)}</span></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2><i className="bi bi-lightning-charge-fill" style={{ marginRight: 6, color: 'var(--lgx-accent)' }} />ศูนย์การส่งมอบและจัดการงาน</h2></div>
            <div className="lgx-panel-body">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {!req.assigned_booster_id && req.status === 'pending' && canManage && <button type="button" className="lgx-btn lgx-btn-ok" onClick={onClaim}><i className="bi bi-hand-index-thumb" />กดรับงานนี้มาทำเอง</button>}
                {req.status === 'pending' && canManage && <button type="button" className="lgx-btn lgx-btn-accent" onClick={onStart}><i className="bi bi-play-fill" />เริ่มดำเนินการ</button>}
                <button type="button" className="lgx-btn" onClick={() => { setActiveAction((a) => (a === 'assign' ? null : 'assign')); setAssignForm({ id: req.id, booster_id: '' }) }} disabled={!canManage}><i className="bi bi-person-gear" />มอบหมายงาน</button>
                {req.status !== 'fulfilled' && req.status !== 'cancelled' && (
                  <button type="button" className="lgx-btn" style={{ marginLeft: 'auto', borderColor: 'var(--lgx-crit)', color: 'var(--lgx-crit)' }} onClick={() => { setActiveAction((a) => (a === 'cancel' ? null : 'cancel')); setCancelForm({ id: req.id, note: '' }) }} disabled={!canManage}><i className="bi bi-x-circle" />ยกเลิกงาน</button>
                )}
              </div>

              {activeAction === 'assign' && (
                <div style={{ background: 'var(--lgx-surface-alt)', borderRadius: 'var(--lgx-radius)', padding: 12, marginBottom: 12 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>เลือก Booster / Staff ที่ต้องการมอบหมายงานนี้</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="lgx-select" value={assignForm.booster_id} onChange={(e) => setAssignForm((p) => ({ ...p, booster_id: e.target.value }))}>
                      <option value="">-- เลือกทีมงาน --</option>
                      {boosters.map((b) => <option key={b.id} value={b.id}>{b.username || b.display_name || b.email} ({b.role})</option>)}
                    </select>
                    <button type="button" className="lgx-btn lgx-btn-accent" onClick={onAssign}>ยืนยัน</button>
                    <button type="button" className="lgx-btn" onClick={() => setActiveAction(null)}>ปิด</button>
                  </div>
                </div>
              )}

              {activeAction === 'cancel' && (
                <div className="lgx-banner crit" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, marginBottom: 12 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700 }}>ระบุเหตุผลในการยกเลิกงานบริการนี้</label>
                  <input type="text" className="lgx-input" placeholder="เช่น ข้อมูลรหัสผ่านไม่ถูกต้อง หรือลูกค้ายกเลิก..." value={cancelForm.note} onChange={(e) => setCancelForm((p) => ({ ...p, note: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="lgx-btn" style={{ background: 'var(--lgx-crit)', borderColor: 'var(--lgx-crit)', color: '#fff' }} onClick={onCancel}>ยืนยันยกเลิกงาน</button>
                    <button type="button" className="lgx-btn" onClick={() => setActiveAction(null)}>ปิด</button>
                  </div>
                </div>
              )}

              {req.status !== 'fulfilled' && req.status !== 'cancelled' && (
                <div style={{ background: 'var(--lgx-surface-alt)', borderRadius: 'var(--lgx-radius)', padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}><i className="bi bi-box-seam" style={{ marginRight: 6, color: 'var(--lgx-ok)' }} />ส่งมอบงานให้ลูกค้า</div>
                  <div className="lgx-chip-row" style={{ marginBottom: 10 }}>
                    {DELIVERY_PRESETS.map((preset) => <button key={preset.id} type="button" className="lgx-chip" onClick={() => setFulfillForm((p) => ({ ...p, payload: preset.text }))}>{preset.label}</button>)}
                  </div>
                  <div className="lgx-field" style={{ marginBottom: 10 }}>
                    <label>ข้อความส่งมอบ / ผลลัพธ์ / รหัส (Payload)</label>
                    <textarea className="lgx-textarea" rows={3} placeholder="กรอกข้อความแจ้งลูกค้า หรือผลลัพธ์การทำงาน..." value={fulfillForm.payload} onChange={(e) => setFulfillForm((p) => ({ ...p, payload: e.target.value }))} />
                  </div>
                  <button type="button" className="lgx-btn lgx-btn-ok" style={{ width: '100%', justifyContent: 'center' }} onClick={onFulfill} disabled={!canManage}><i className="bi bi-check2-circle" />ยืนยันส่งมอบงานให้ลูกค้า</button>
                </div>
              )}

              {req.status === 'fulfilled' && (
                <div className="lgx-banner ok">
                  <span><i className="bi bi-check-circle-fill" style={{ marginRight: 6 }} /><strong>งานนี้ส่งมอบเรียบร้อยแล้ว</strong> — เมื่อ {formatDateTime(req.fulfilled_at)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2><i className="bi bi-chat-left-dots-fill" style={{ marginRight: 6 }} />บันทึกโน้ตภายใน &amp; ประวัติ</h2><span>{logs.length} บันทึก</span></div>
            <div className="lgx-panel-body">
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input type="text" className="lgx-input" placeholder="พิมพ์โน้ตความคืบหน้าภายในทีมงาน..." value={newStaffNote} onChange={(e) => setNewStaffNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onAddNote() }} />
                <button type="button" className="lgx-btn lgx-btn-accent" onClick={onAddNote} disabled={savingNote || !newStaffNote.trim()}>{savingNote ? '...' : <><i className="bi bi-send-fill" />บันทึก</>}</button>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {logs.map((log, i) => {
                  const metaNote = log.meta?.note || (typeof log.meta === 'string' ? log.meta : null)
                  return (
                    <div key={log.id || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--lgx-border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 11.5 }}><i className="bi bi-person-fill" style={{ marginRight: 4, color: 'var(--lgx-accent)' }} />{log.booster_display_name || log.booster_email || 'Staff'}</span>
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{formatDateTime(log.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{metaNote || `Action: ${log.action}`}</div>
                    </div>
                  )
                })}
                {logs.length === 0 && <div className="lgx-empty">ยังไม่มีบันทึกโน้ตภายในสำหรับงานนี้</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function FulfillmentKanbanView({ requests, onOpenDetail, onClaim, onStart, canManage }) {
  const columns = [
    { id: 'pending', title: 'รอดำเนินการ', items: requests.filter((r) => r.status === 'pending') },
    { id: 'in_progress', title: 'กำลังดำเนินการ', items: requests.filter((r) => r.status === 'in_progress') },
    { id: 'fulfilled', title: 'สำเร็จแล้ว', items: requests.filter((r) => r.status === 'fulfilled') },
    { id: 'cancelled', title: 'ยกเลิก', items: requests.filter((r) => r.status === 'cancelled' || r.status === 'canceled') },
  ]

  return (
    <div className="lgx-kanban">
      {columns.map((col) => (
        <div className="lgx-kanban-col" key={col.id}>
          <div className="lgx-kanban-col-head"><span>{col.title}</span><span className="mono" style={{ color: 'var(--lgx-text-muted)' }}>{col.items.length}</span></div>
          <div className="lgx-kanban-col-body">
            {col.items.map((r) => (
              <div className="lgx-kanban-card" key={r.id} onClick={() => onOpenDetail(r.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="mono" style={{ color: 'var(--lgx-text-muted)' }}>#{r.id}</span>
                  <span className="mono" style={{ color: 'var(--lgx-text-muted)', fontSize: 10.5 }}>{formatRelativeTime(r.created_at)}</span>
                </div>
                <div style={{ fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product_name || '-'}</div>
                <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginBottom: 8 }}>ลูกค้า: <strong style={{ color: 'var(--lgx-text)' }}>{r.user_username || r.user_display_name || '-'}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--lgx-border)' }}>
                  {r.assigned_username ? <span className="lgx-pill ok">{r.assigned_username}</span> : <span className="lgx-pill warn">ยังไม่มีผู้รับ</span>}
                  {!r.assigned_booster_id && r.status === 'pending' && canManage && <button type="button" className="lgx-btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); onClaim(r.id) }}>รับงาน</button>}
                  {r.status === 'pending' && r.assigned_booster_id && canManage && <button type="button" className="lgx-btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); onStart(r.id) }}>เริ่มทำ</button>}
                </div>
              </div>
            ))}
            {col.items.length === 0 && <div className="lgx-empty" style={{ padding: '20px 8px' }}>ไม่มีงานในคอลัมน์นี้</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function FulfillmentAnalyticsView({ requests, boosters, onFilterBooster }) {
  const boosterStats = useMemo(() => boosters.map((b) => {
    const myJobs = requests.filter((r) => Number(r.assigned_booster_id) === Number(b.id))
    const inProgress = myJobs.filter((r) => r.status === 'in_progress').length
    const pending = myJobs.filter((r) => r.status === 'pending').length
    return {
      ...b,
      totalJobs: myJobs.length,
      inProgress,
      fulfilled: myJobs.filter((r) => r.status === 'fulfilled').length,
      pending,
      workload: inProgress + pending,
      aging: myJobs.filter(isAging).length,
    }
  }).sort((a, b) => b.workload - a.workload || b.totalJobs - a.totalJobs), [boosters, requests])

  const unassignedAging = requests.filter((r) => !r.assigned_booster_id && isAging(r)).length

  return (
    <div className="lgx-panel">
      <div className="lgx-panel-head">
        <h2><i className="bi bi-people-fill" style={{ marginRight: 6 }} />สรุปภาระงานและผลงานทีมงาน Booster</h2>
        {unassignedAging > 0 && <span style={{ color: 'var(--lgx-crit)' }}>งานไม่มีผู้รับที่ค้างเกิน {AGING_HOURS} ชม.: {unassignedAging} รายการ</span>}
      </div>
      <table className="lgx-table">
        <thead><tr><th>ทีมงาน</th><th>Role</th><th>กำลังทำอยู่</th><th>รอดำเนินการ</th><th>ค้างนาน</th><th>ส่งมอบแล้ว</th><th>งานทั้งหมด</th><th /></tr></thead>
        <tbody>
          {boosterStats.map((b) => (
            <tr key={b.id} className={b.workload >= 5 ? 'st-warn' : ''}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="lgx-avatar" style={{ width: 30, height: 30 }}>{(b.username || b.display_name || b.email || 'S').slice(0, 1).toUpperCase()}</span>
                  <div><div style={{ fontWeight: 700 }}>{b.username || b.display_name || '-'}</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{b.email}</div></div>
                </div>
              </td>
              <td><span className="lgx-pill neutral">{b.role || 'booster'}</span></td>
              <td><span className={`lgx-pill ${b.inProgress > 0 ? '' : 'neutral'}`} style={b.inProgress > 0 ? { background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' } : undefined}>{b.inProgress} งาน</span></td>
              <td><span className={`lgx-pill ${b.pending > 0 ? 'warn' : 'neutral'}`}>{b.pending} งาน</span></td>
              <td><span className={`lgx-pill ${b.aging > 0 ? 'crit' : 'neutral'}`}>{b.aging} งาน</span></td>
              <td><span className="lgx-pill ok">{b.fulfilled} งาน</span></td>
              <td className="mono" style={{ fontWeight: 700 }}>{b.totalJobs}</td>
              <td><button type="button" className="lgx-btn" onClick={() => onFilterBooster(b.id)}><i className="bi bi-filter" />กรองดูงานของคนนี้</button></td>
            </tr>
          ))}
          {boosterStats.length === 0 && <tr><td colSpan={8} className="lgx-empty">ไม่พบข้อมูลทีมงาน</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
