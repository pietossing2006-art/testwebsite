import { useState } from 'react'
import { formatNumber, formatDateTime, getErrorMessage, DEFAULT_AUTOMATION_RULE_FORM } from '../helpers.js'

export default function AutomationModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [ruleForm, setRuleForm] = useState(DEFAULT_AUTOMATION_RULE_FORM)
  const [view, setView] = useState('list')

  if (!data) return null

  const canManage = canAction('automation.manage')
  const rules = data.rules || []
  const events = data.events || []

  function editRule(r) {
    const tc = r?.trigger_config && typeof r.trigger_config === 'object' ? r.trigger_config : {}
    const ac = r?.action_config && typeof r.action_config === 'object' ? r.action_config : {}
    setRuleForm({
      id: r.id, name: r.name || '', trigger_type: r.trigger_type || 'support_unassigned_overdue',
      trigger_minutes: Math.max(1, Number(tc.minutes || r.trigger_minutes || 30)),
      action_severity: String(ac.severity || r.action_severity || 'high'),
      is_active: r.is_active !== false,
    })
    setView('form')
  }

  async function saveRule() {
    const name = String(ruleForm.name || '').trim()
    const triggerType = String(ruleForm.trigger_type || '').trim().toLowerCase()
    const triggerMinutes = Number(ruleForm.trigger_minutes)
    const severity = String(ruleForm.action_severity || '').trim().toLowerCase()
    if (!name) { setActionState({ status: 'error', message: 'ชื่อกฎห้ามว่าง' }); return }
    if (!Number.isFinite(triggerMinutes) || triggerMinutes <= 0 || triggerMinutes > 43200) { setActionState({ status: 'error', message: 'Trigger minutes ต้องอยู่ระหว่าง 1-43200' }); return }
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      const body = {
        name, trigger_type: triggerType,
        trigger_config: { minutes: Math.trunc(triggerMinutes) },
        action_type: 'create_notification',
        action_config: { severity },
        is_active: Boolean(ruleForm.is_active),
      }
      if (ruleForm.id) {
        await fetchJson(`/api/admin/workflow-automation/rules/${ruleForm.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await fetchJson('/api/admin/workflow-automation/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      setActionState({ status: 'success', message: 'บันทึกเรียบร้อย' })
      setRuleForm(DEFAULT_AUTOMATION_RULE_FORM)
      setView('list')
      await loadModuleData('automation')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function runAutomation() {
    try {
      setActionState({ status: 'working', message: 'กำลังรันกฎอัตโนมัติ...' })
      const res = await fetchJson('/api/admin/workflow-automation/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit_per_rule: 20 }),
      })
      await loadModuleData('automation')
      const matched = Number(res?.result?.matched || 0)
      const created = Number(res?.result?.created_events || 0)
      setActionState({ status: 'success', message: `รันเสร็จ • matched ${formatNumber(matched)} • created ${formatNumber(created)}` })
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteRule(id) {
    if (!window.confirm('ยืนยันลบกฎ?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      await fetchJson(`/api/admin/workflow-automation/rules/${id}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบเรียบร้อย' })
      await loadModuleData('automation')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`alert ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'} alert-dismissible fade show`}>
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })}></button>
        </div>
      )}

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${view === 'list' || view === 'form' ? 'active' : ''}`} onClick={() => setView('list')}>กฎ ({rules.length})</button></li>
        <li className="nav-item"><button className={`nav-link ${view === 'events' ? 'active' : ''}`} onClick={() => setView('events')}>เหตุการณ์ ({events.length})</button></li>
      </ul>

      {view === 'list' && (
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h3 className="card-title">Workflow Rules</h3>
            <div className="d-flex gap-2">
              <button className="btn btn-success btn-sm" onClick={runAutomation} disabled={!canManage}><i className="bi bi-play-fill me-1"></i>รันอัตโนมัติ</button>
              <button className="btn btn-primary btn-sm" onClick={() => { setRuleForm(DEFAULT_AUTOMATION_RULE_FORM); setView('form') }} disabled={!canManage}><i className="bi bi-plus-lg me-1"></i>เพิ่มกฎ</button>
            </div>
          </div>
          <div className="card-body p-0">
            <table className="table table-hover mb-0">
              <thead><tr><th>ชื่อ</th><th>Trigger</th><th>นาที</th><th>Severity</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id}>
                    <td className="fw-semibold">{r.name}</td>
                    <td><span className="badge text-bg-info">{r.trigger_type}</span></td>
                    <td>{r.trigger_minutes}</td>
                    <td><span className={`badge ${r.action_severity === 'high' || r.action_severity === 'critical' ? 'text-bg-danger' : 'text-bg-warning'}`}>{r.action_severity}</span></td>
                    <td>{r.is_active ? <span className="badge text-bg-success">Active</span> : <span className="badge text-bg-secondary">Inactive</span>}</td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-primary" onClick={() => editRule(r)} disabled={!canManage}><i className="bi bi-pencil"></i></button>
                        <button className="btn btn-outline-danger" onClick={() => deleteRule(r.id)} disabled={!canManage}><i className="bi bi-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && <tr><td colSpan={6} className="text-center text-secondary py-4">ไม่มีกฎ</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'form' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">{ruleForm.id ? 'แก้ไขกฎ' : 'สร้างกฎใหม่'}</h3></div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6"><label className="form-label">ชื่อกฎ</label><input className="form-control" value={ruleForm.name} onChange={(e) => setRuleForm(prev => ({ ...prev, name: e.target.value }))} /></div>
              <div className="col-md-6">
                <label className="form-label">Trigger Type</label>
                <select className="form-select" value={ruleForm.trigger_type} onChange={(e) => setRuleForm(prev => ({ ...prev, trigger_type: e.target.value }))}>
                  <option value="support_unassigned_overdue">Support ค้างไม่มีผู้รับ</option>
                  <option value="farm_unassigned_overdue">Farm ค้างไม่มีผู้รับ</option>
                  <option value="support_no_reply_overdue">Support ค้างไม่ตอบกลับ</option>
                  <option value="farm_in_progress_overdue">Farm ค้างอยู่ระหว่างดำเนินการ</option>
                </select>
              </div>
              <div className="col-md-4"><label className="form-label">Trigger Minutes</label><input type="number" className="form-control" value={ruleForm.trigger_minutes} onChange={(e) => setRuleForm(prev => ({ ...prev, trigger_minutes: Number(e.target.value) }))} /></div>
              <div className="col-md-4">
                <label className="form-label">Severity</label>
                <select className="form-select" value={ruleForm.action_severity} onChange={(e) => setRuleForm(prev => ({ ...prev, action_severity: e.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="form-check"><input type="checkbox" className="form-check-input" checked={ruleForm.is_active} onChange={(e) => setRuleForm(prev => ({ ...prev, is_active: e.target.checked }))} /><label className="form-check-label">เปิดใช้งาน</label></div>
              </div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2">
            <button className="btn btn-primary" onClick={saveRule} disabled={!canManage}><i className="bi bi-floppy me-1"></i>บันทึก</button>
            <button className="btn btn-outline-secondary" onClick={() => setView('list')}>ยกเลิก</button>
          </div>
        </div>
      )}

      {view === 'events' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">เหตุการณ์ล่าสุด</h3></div>
          <div className="card-body p-0">
            <table className="table table-hover table-striped mb-0" style={{ fontSize: 13 }}>
              <thead><tr><th>เวลา</th><th>กฎ</th><th>Severity</th><th>รายละเอียด</th></tr></thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i}>
                    <td><small>{formatDateTime(ev.created_at)}</small></td>
                    <td>{ev.rule_name || '-'}</td>
                    <td><span className={`badge ${ev.severity === 'high' || ev.severity === 'critical' ? 'text-bg-danger' : 'text-bg-warning'}`}>{ev.severity}</span></td>
                    <td><small>{ev.message || '-'}</small></td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={4} className="text-center text-secondary py-4">ไม่มีเหตุการณ์</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
