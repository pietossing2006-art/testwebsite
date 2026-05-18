import { useState } from 'react'
import { formatDateTime, getErrorMessage } from '../helpers.js'

export default function MessagesModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [draft, setDraft] = useState({ target_type: 'global', target_user_id: '', title: '', body: '' })

  if (!data) return null

  const canManage = canAction('settings.manage')
  const messages = data.messages || []

  async function sendMessage() {
    if (!draft.title.trim() || !draft.body.trim()) {
      setActionState({ status: 'error', message: 'กรุณากรอกหัวข้อและข้อความ' })
      return
    }
    try {
      setActionState({ status: 'working', message: 'กำลังส่ง...' })
      const body = {
        target_type: draft.target_type,
        title: draft.title.trim(),
        body: draft.body.trim(),
      }
      if (draft.target_type === 'user' && draft.target_user_id) body.target_user_id = Number(draft.target_user_id)
      await fetchJson('/api/admin/site-messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setActionState({ status: 'success', message: 'ส่งข้อความเรียบร้อย' })
      setDraft({ target_type: 'global', target_user_id: '', title: '', body: '' })
      await loadModuleData('messages')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteMessage(id) {
    if (!window.confirm('ลบข้อความนี้?')) return
    try {
      await fetchJson(`/api/admin/site-messages/${id}`, { method: 'DELETE' })
      await loadModuleData('messages')
    } catch { /* ignore */ }
  }

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`alert ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show`}>
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })}></button>
        </div>
      )}

      <div className="row">
        <div className="col-lg-5">
          <div className="card">
            <div className="card-header"><h3 className="card-title"><i className="bi bi-envelope-plus me-2"></i>ส่งข้อความ</h3></div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">ประเภท</label>
                <select className="form-select" value={draft.target_type} onChange={(e) => setDraft(prev => ({ ...prev, target_type: e.target.value }))}>
                  <option value="global">ทุกคน (Global)</option>
                  <option value="user">ผู้ใช้เฉพาะ</option>
                </select>
              </div>
              {draft.target_type === 'user' && (
                <div className="mb-3">
                  <label className="form-label">User ID</label>
                  <input type="number" className="form-control" value={draft.target_user_id} onChange={(e) => setDraft(prev => ({ ...prev, target_user_id: e.target.value }))} placeholder="User ID" />
                </div>
              )}
              <div className="mb-3">
                <label className="form-label">หัวข้อ *</label>
                <input className="form-control" value={draft.title} onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="mb-3">
                <label className="form-label">ข้อความ *</label>
                <textarea className="form-control" rows={4} value={draft.body} onChange={(e) => setDraft(prev => ({ ...prev, body: e.target.value }))}></textarea>
              </div>
              <button className="btn btn-primary" onClick={sendMessage} disabled={!canManage}>
                <i className="bi bi-send me-1"></i>ส่ง
              </button>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card">
            <div className="card-header"><h3 className="card-title">ข้อความล่าสุด ({messages.length})</h3></div>
            <div className="card-body p-0">
              <table className="table table-hover table-striped mb-0" style={{ fontSize: 13 }}>
                <thead>
                  <tr><th>ประเภท</th><th>หัวข้อ</th><th>ข้อความ</th><th>เวลา</th><th></th></tr>
                </thead>
                <tbody>
                  {messages.map((m, i) => (
                    <tr key={m.id || i}>
                      <td><span className={`badge ${m.target_type === 'global' ? 'text-bg-primary' : 'text-bg-info'}`}>{m.target_type}</span></td>
                      <td className="fw-semibold">{m.title}</td>
                      <td><small>{(m.body || '').slice(0, 80)}</small></td>
                      <td><small>{formatDateTime(m.created_at)}</small></td>
                      <td>{m.id && <button className="btn btn-outline-danger btn-sm" onClick={() => deleteMessage(m.id)}><i className="bi bi-trash"></i></button>}</td>
                    </tr>
                  ))}
                  {messages.length === 0 && <tr><td colSpan={5} className="text-center text-secondary py-4">ไม่มีข้อความ</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
