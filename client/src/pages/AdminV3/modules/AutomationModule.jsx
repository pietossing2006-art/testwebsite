import { useState } from 'react'
import { formatNumber, formatDateTime, getErrorMessage, DEFAULT_AUTOMATION_RULE_FORM } from '../helpers.js'

const TRIGGER_LABELS = {
  support_unassigned_overdue: 'Support ค้างไม่มีผู้รับ',
  farm_unassigned_overdue: 'Farm ค้างไม่มีผู้รับ',
  support_no_reply_overdue: 'Support ค้างไม่ตอบกลับ',
  farm_in_progress_overdue: 'Farm ค้างอยู่ระหว่างดำเนินการ',
}

function severityTone(sev) {
  const key = String(sev || '').toLowerCase()
  return key === 'high' || key === 'critical' ? 'crit' : key === 'medium' ? 'warn' : 'neutral'
}

export default function AutomationModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [ruleForm, setRuleForm] = useState(DEFAULT_AUTOMATION_RULE_FORM)
  const [view, setView] = useState('list')

  if (!data) return null

  const canManage = canAction('automation.manage')
  const rules = data.rules || []
  const events = data.events || []
  const activeCount = rules.filter((r) => r.is_active !== false).length

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

  const bannerTone = actionState.status === 'error' ? 'crit' : actionState.status === 'success' ? 'ok' : 'info'

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`lgx-banner ${bannerTone}`}>
          <span>{actionState.message}</span>
          <button type="button" className="lgx-banner-close" onClick={() => setActionState({ status: 'idle', message: '' })}>×</button>
        </div>
      )}

      <div className="lgx-strip">
        <div className="lgx-stat">
          <div className="l">กฎทั้งหมด</div>
          <div className="v">{formatNumber(rules.length)}</div>
          <div className="d">กฎการทำงานที่กำหนดไว้</div>
        </div>
        <div className="lgx-stat">
          <div className="l">เปิดใช้งานอยู่</div>
          <div className="v">{formatNumber(activeCount)}</div>
          <div className="d">กฎที่กำลังทำงานอัตโนมัติ</div>
        </div>
        <div className="lgx-stat">
          <div className="l">เหตุการณ์ที่ตรวจพบ</div>
          <div className="v">{formatNumber(events.length)}</div>
          <div className="d">เหตุการณ์แจ้งเตือนที่สร้างขึ้น</div>
        </div>
      </div>

      <div className="lgx-panel">
        <div className="lgx-inline-tabs" style={{ padding: '0 18px' }}>
          <button type="button" className={`lgx-inline-tab${view === 'list' || view === 'form' ? ' is-active' : ''}`} onClick={() => setView('list')}>กฎ ({rules.length})</button>
          <button type="button" className={`lgx-inline-tab${view === 'events' ? ' is-active' : ''}`} onClick={() => setView('events')}>เหตุการณ์ ({events.length})</button>
        </div>

        {view === 'list' && (
          <>
            <div className="lgx-panel-head">
              <h2>Workflow Rules</h2>
              <div className="lgx-btn-group">
                <button type="button" className="lgx-btn lgx-btn-ok" onClick={runAutomation} disabled={!canManage}><i className="bi bi-play-fill" />รันอัตโนมัติ</button>
                <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => { setRuleForm(DEFAULT_AUTOMATION_RULE_FORM); setView('form') }} disabled={!canManage}><i className="bi bi-plus-lg" />เพิ่มกฎ</button>
              </div>
            </div>
            <table className="lgx-table">
              <thead><tr><th>ชื่อ</th><th>Trigger</th><th className="num">นาที</th><th>Severity</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{TRIGGER_LABELS[r.trigger_type] || r.trigger_type}</td>
                    <td className="num">{r.trigger_minutes}</td>
                    <td><span className={`lgx-pill ${severityTone(r.action_severity)}`}>{r.action_severity}</span></td>
                    <td><span className={`lgx-pill ${r.is_active ? 'ok' : 'neutral'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div className="lgx-btn-group">
                        <button type="button" className="lgx-icon-action" onClick={() => editRule(r)} disabled={!canManage}><i className="bi bi-pencil" /></button>
                        <button type="button" className="lgx-icon-action danger" onClick={() => deleteRule(r.id)} disabled={!canManage}><i className="bi bi-trash" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && <tr><td colSpan={6} className="lgx-empty">ไม่มีกฎ</td></tr>}
              </tbody>
            </table>
          </>
        )}

        {view === 'form' && (
          <>
            <div className="lgx-panel-head"><h2>{ruleForm.id ? 'แก้ไขกฎ' : 'สร้างกฎใหม่'}</h2></div>
            <div className="lgx-panel-body">
              <div className="lgx-form-grid">
                <div className="lgx-field">
                  <label>ชื่อกฎ</label>
                  <input className="lgx-input" value={ruleForm.name} onChange={(e) => setRuleForm((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="lgx-field">
                  <label>Trigger Type</label>
                  <select className="lgx-select" value={ruleForm.trigger_type} onChange={(e) => setRuleForm((prev) => ({ ...prev, trigger_type: e.target.value }))}>
                    {Object.entries(TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="lgx-field">
                  <label>Trigger Minutes</label>
                  <input type="number" className="lgx-input" value={ruleForm.trigger_minutes} onChange={(e) => setRuleForm((prev) => ({ ...prev, trigger_minutes: Number(e.target.value) }))} />
                </div>
                <div className="lgx-field">
                  <label>Severity</label>
                  <select className="lgx-select" value={ruleForm.action_severity} onChange={(e) => setRuleForm((prev) => ({ ...prev, action_severity: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="lgx-field lgx-field-end">
                  <label className="lgx-checkbox-row">
                    <input type="checkbox" checked={ruleForm.is_active} onChange={(e) => setRuleForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
                    เปิดใช้งาน
                  </label>
                </div>
              </div>
            </div>
            <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)' }}>
              <div className="lgx-btn-group">
                <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveRule} disabled={!canManage}><i className="bi bi-floppy" />บันทึก</button>
                <button type="button" className="lgx-btn" onClick={() => setView('list')}>ยกเลิก</button>
              </div>
            </div>
          </>
        )}

        {view === 'events' && (
          <>
            <div className="lgx-panel-head"><h2>เหตุการณ์ล่าสุด</h2></div>
            <table className="lgx-table">
              <thead><tr><th>เวลา</th><th>กฎ</th><th>Severity</th><th>รายละเอียด</th></tr></thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i}>
                    <td className="mono">{formatDateTime(ev.created_at)}</td>
                    <td>{ev.rule_name || '-'}</td>
                    <td><span className={`lgx-pill ${severityTone(ev.severity)}`}>{ev.severity}</span></td>
                    <td>{ev.message || '-'}</td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={4} className="lgx-empty">ไม่มีเหตุการณ์</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  )
}
