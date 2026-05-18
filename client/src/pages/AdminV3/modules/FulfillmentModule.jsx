import { useState, useEffect, useRef } from 'react'
import {
  formatNumber, formatDateTime, formatRelativeTime, getErrorMessage,
  DEFAULT_FULFILLMENT_QUERY,
} from '../helpers.js'
import { loadFulfillmentModule, loadFulfillmentRequestDetail } from '../loaders.js'
import { connectSocket } from '../../../socket.js'

export default function FulfillmentModule({ data, ctx }) {
  const { fulfillmentQuery, setFulfillmentQuery, canAction, loadModuleData, patchModuleData, fetchJson, session } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [fulfillForm, setFulfillForm] = useState({ id: null, payload: '' })
  const [cancelForm, setCancelForm] = useState({ id: null, note: '' })
  const [assignForm, setAssignForm] = useState({ id: null, booster_id: '' })
  const [activeAction, setActiveAction] = useState(null)
  const [searchDraft, setSearchDraft] = useState(fulfillmentQuery.search || '')
  const refreshTimerRef = useRef(null)

  if (!data) return null

  const canManage = canAction('fulfillment.manage')
  const requests = data.requests || []
  const boosters = data.boosters || []
  const summary = data.summary || {}

  const scopeTabs = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'mine', label: 'ของฉัน', count: summary.mine },
    { id: 'unassigned', label: 'ไม่มีผู้รับ', count: summary.unassigned },
  ]

  const statusTabs = [
    { val: 'pending', label: 'รอดำเนินการ', count: summary.pending, bg: 'text-bg-warning' },
    { val: 'in_progress', label: 'กำลังดำเนินการ', count: summary.in_progress, bg: 'text-bg-info' },
    { val: 'fulfilled', label: 'สำเร็จ', count: summary.fulfilled, bg: 'text-bg-success' },
    { val: 'cancelled', label: 'ยกเลิก', count: summary.cancelled, bg: 'text-bg-secondary' },
  ]

  function patchQuery(obj) { setFulfillmentQuery(prev => ({ ...prev, ...obj })) }

  // Socket.IO
  useEffect(() => {
    if (session.status !== 'ready') return
    const socket = connectSocket()
    const onUpdate = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(async () => {
        try { await refreshSilently() } finally { refreshTimerRef.current = null }
      }, 300)
    }
    socket.on('fulfillment_update', onUpdate)
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      socket.off('fulfillment_update', onUpdate)
    }
  }, [session.status])

  async function refreshSilently() {
    try {
      const d = await loadFulfillmentModule(fulfillmentQuery)
      patchModuleData('fulfillment', () => d)
    } catch {}
  }

  async function openDetail(requestId) {
    setSelectedId(requestId)
    setDetailLoading(true)
    setActiveAction(null)
    try {
      const d = await loadFulfillmentRequestDetail(requestId)
      setDetail(d)
    } catch { setDetail(null) }
    setDetailLoading(false)
  }

  async function assignRequest(requestId) {
    if (!assignForm.booster_id) return
    try {
      setActionState({ status: 'working', message: 'กำลังมอบหมาย...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booster_id: Number(assignForm.booster_id) }) })
      setActionState({ status: 'success', message: 'มอบหมายเรียบร้อย' })
      setActiveAction(null)
      await refreshSilently()
      await openDetail(requestId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function fulfillRequest(requestId) {
    try {
      setActionState({ status: 'working', message: 'กำลังฟูลฟิล...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/fulfill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: fulfillForm.payload }) })
      setActionState({ status: 'success', message: 'ฟูลฟิลเรียบร้อย' })
      setActiveAction(null)
      await refreshSilently()
      await openDetail(requestId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function startRequest(requestId) {
    try {
      setActionState({ status: 'working', message: 'กำลังเปลี่ยนสถานะ...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/start`, { method: 'POST' })
      setActionState({ status: 'success', message: 'เปลี่ยนเป็น "กำลังดำเนินการ" เรียบร้อย' })
      await refreshSilently()
      await openDetail(requestId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function cancelRequest(requestId) {
    try {
      setActionState({ status: 'working', message: 'กำลังยกเลิก...' })
      await fetchJson(`/api/admin/farm-requests/${requestId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: cancelForm.note }) })
      setActionState({ status: 'success', message: 'ยกเลิกเรียบร้อย' })
      setActiveAction(null)
      await refreshSilently()
      await openDetail(requestId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  const statusBadge = (s) => {
    const key = String(s).toLowerCase()
    if (key === 'pending') return 'text-bg-warning'
    if (key === 'in_progress') return 'text-bg-info'
    if (key === 'fulfilled') return 'text-bg-success'
    if (key === 'cancelled' || key === 'canceled') return 'text-bg-secondary'
    return 'text-bg-light'
  }
  const statusLabel = (s) => {
    const key = String(s).toLowerCase()
    if (key === 'pending') return 'รอดำเนินการ'
    if (key === 'in_progress') return 'กำลังดำเนินการ'
    if (key === 'fulfilled') return 'สำเร็จ'
    if (key === 'cancelled' || key === 'canceled') return 'ยกเลิก'
    return s || '-'
  }

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`alert ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show`}>
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })}></button>
        </div>
      )}

      {/* Summary */}
      <div className="row mb-3">
        {statusTabs.map((s, i) => (
          <div className="col-lg-3 col-6" key={i}>
            <div className={`small-box ${s.bg}`} style={{ cursor: 'pointer' }} onClick={() => patchQuery({ status: s.val })}>
              <div className="inner">
                <h3>{formatNumber(s.count)}</h3>
                <p>{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body py-2">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <ul className="nav nav-pills nav-sm me-auto">
              {scopeTabs.map(tab => (
                <li className="nav-item" key={tab.id}>
                  <button className={`nav-link ${fulfillmentQuery.scope === tab.id ? 'active' : ''}`} onClick={() => patchQuery({ scope: tab.id })}>
                    {tab.label} {tab.count != null && <span className="badge text-bg-light text-dark ms-1">{tab.count}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <form className="d-flex gap-1" onSubmit={(e) => { e.preventDefault(); patchQuery({ search: searchDraft.trim() }) }}>
              <input type="text" className="form-control form-control-sm" style={{ width: 160 }} placeholder="ค้นหา..." value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
              <button className="btn btn-outline-secondary btn-sm" type="submit"><i className="bi bi-search"></i></button>
            </form>
          </div>
        </div>
      </div>

      <div className="row">
        <div className={detail ? 'col-lg-6' : 'col-lg-12'}>
          <div className="card">
            <div className="card-header"><h3 className="card-title">รายการ ({formatNumber(data.total)})</h3></div>
            <div className="card-body p-0" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <table className="table table-hover table-striped mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ผู้ใช้</th>
                    <th>สินค้า</th>
                    <th>สถานะ</th>
                    <th>ผู้รับผิดชอบ</th>
                    <th>เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} style={{ cursor: 'pointer' }} className={selectedId === r.id ? 'table-active' : ''} onClick={() => openDetail(r.id)}>
                      <td>{r.id}</td>
                      <td>{r.user_username || r.user_display_name || r.user_email || '-'}</td>
                      <td><small>{r.product_name || '-'}</small></td>
                      <td><span className={`badge ${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td>
                      <td><small>{r.assigned_username || r.assigned_display_name || '-'}</small></td>
                      <td><small>{formatRelativeTime(r.created_at)}</small></td>
                    </tr>
                  ))}
                  {requests.length === 0 && <tr><td colSpan={6} className="text-center text-secondary py-4">ไม่พบรายการ</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {detail && (
          <div className="col-lg-6">
            <div className="card card-outline card-info">
              <div className="card-header">
                <h3 className="card-title">#{detail.request?.id} — {detail.request?.product_name || '-'}</h3>
                <div className="card-tools">
                  <button className="btn btn-tool" onClick={() => { setDetail(null); setSelectedId(null) }}><i className="bi bi-x-lg"></i></button>
                </div>
              </div>
              <div className="card-body">
                {detailLoading ? (
                  <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>
                ) : detail.request ? (
                  <>
                    <table className="table table-sm">
                      <tbody>
                        <tr><td className="fw-semibold">ผู้ใช้</td><td>{detail.request.user_username || detail.request.user_display_name || detail.request.user_email}</td></tr>
                        <tr><td className="fw-semibold">สินค้า</td><td>{detail.request.product_name}</td></tr>
                        <tr><td className="fw-semibold">สถานะ</td><td><span className={`badge ${statusBadge(detail.request.status)}`}>{statusLabel(detail.request.status)}</span></td></tr>
                        <tr><td className="fw-semibold">ผู้รับ</td><td>{detail.request.assigned_username || detail.request.assigned_display_name || '-'}</td></tr>
                        <tr><td className="fw-semibold">สร้างเมื่อ</td><td>{formatDateTime(detail.request.created_at)}</td></tr>
                        <tr><td className="fw-semibold">จำนวน</td><td>{detail.request.order_qty || 1} ชิ้น</td></tr>
                        {detail.request.form_data && (() => {
                          const fields = Array.isArray(detail.request.farm_form_fields) ? detail.request.farm_form_fields : []
                          const labelMap = Object.fromEntries(fields.map(f => [f.id, f.label || f.id]))
                          const entries = Object.entries(detail.request.form_data)
                          return (
                            <tr><td className="fw-semibold">ข้อมูลฟอร์ม</td><td>
                              <div style={{ fontSize: 12 }}>
                                {entries.map(([k, v]) => (
                                  <div key={k} className="d-flex gap-2 mb-1">
                                    <span className="fw-semibold text-nowrap">{labelMap[k] || k} :</span>
                                    <span>{v === true ? '✅' : v === false ? '❌' : String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            </td></tr>
                          )
                        })()}
                      </tbody>
                    </table>

                    {/* Actions */}
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => { setActiveAction('assign'); setAssignForm({ id: detail.request.id, booster_id: '' }) }} disabled={!canManage}>
                        <i className="bi bi-person-plus me-1"></i>มอบหมาย
                      </button>
                      {detail.request.status === 'pending' && (
                        <button className="btn btn-info btn-sm" onClick={() => startRequest(detail.request.id)} disabled={!canManage || actionState.status === 'working'}>
                          <i className="bi bi-play-circle me-1"></i>เริ่มดำเนินการ
                        </button>
                      )}
                      <button className="btn btn-success btn-sm" onClick={() => { setActiveAction('fulfill'); setFulfillForm({ id: detail.request.id, payload: '' }) }} disabled={!canManage}>
                        <i className="bi bi-check-circle me-1"></i>ฟูลฟิล
                      </button>
                      <button className="btn btn-outline-danger btn-sm" onClick={() => { setActiveAction('cancel'); setCancelForm({ id: detail.request.id, note: '' }) }} disabled={!canManage}>
                        <i className="bi bi-x-circle me-1"></i>ยกเลิก
                      </button>
                    </div>

                    {activeAction === 'assign' && (
                      <div className="mt-2 p-2 border rounded bg-light">
                        <div className="mb-2">
                          <select className="form-select form-select-sm" value={assignForm.booster_id} onChange={(e) => setAssignForm(prev => ({ ...prev, booster_id: e.target.value }))}>
                            <option value="">เลือกสตาฟ...</option>
                            {boosters.map(b => <option key={b.id} value={b.id}>{b.username || b.display_name || b.email} ({b.role || 'user'})</option>)}
                          </select>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => assignRequest(detail.request.id)}>ยืนยัน</button>
                        <button className="btn btn-outline-secondary btn-sm ms-1" onClick={() => setActiveAction(null)}>ยกเลิก</button>
                      </div>
                    )}

                    {activeAction === 'fulfill' && (
                      <div className="mt-2 p-2 border rounded bg-light">
                        <textarea className="form-control form-control-sm mb-2" rows={3} placeholder="Payload (ถ้ามี)" value={fulfillForm.payload} onChange={(e) => setFulfillForm(prev => ({ ...prev, payload: e.target.value }))} />
                        <button className="btn btn-success btn-sm" onClick={() => fulfillRequest(detail.request.id)}>ยืนยันฟูลฟิล</button>
                        <button className="btn btn-outline-secondary btn-sm ms-1" onClick={() => setActiveAction(null)}>ยกเลิก</button>
                      </div>
                    )}

                    {activeAction === 'cancel' && (
                      <div className="mt-2 p-2 border rounded bg-light">
                        <input className="form-control form-control-sm mb-2" placeholder="หมายเหตุ (ถ้ามี)" value={cancelForm.note} onChange={(e) => setCancelForm(prev => ({ ...prev, note: e.target.value }))} />
                        <button className="btn btn-danger btn-sm" onClick={() => cancelRequest(detail.request.id)}>ยืนยันยกเลิก</button>
                        <button className="btn btn-outline-secondary btn-sm ms-1" onClick={() => setActiveAction(null)}>ยกเลิก</button>
                      </div>
                    )}

                    {/* Logs */}
                    {detail.logs && detail.logs.length > 0 && (
                      <div className="mt-3">
                        <h6>บันทึกการเปลี่ยนแปลง</h6>
                        <div className="timeline">
                          {detail.logs.map((log, i) => (
                            <div key={i} className="mb-2 ps-3 border-start border-2">
                              <small className="text-secondary">{formatDateTime(log.created_at)}</small>
                              <div>{log.action} — {log.actor_username || log.actor_display_name || log.actor_email || '-'}</div>
                              {log.note && <small className="text-muted">{log.note}</small>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-secondary text-center">ไม่พบข้อมูล</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
