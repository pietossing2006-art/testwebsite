import { useState } from 'react'
import AnnIcon from '../../../components/AnnIcon.jsx'
import AnnRichText from '../../../components/AnnRichText.jsx'
import { formatDateTime, getErrorMessage, isoToLocalInput } from '../helpers.js'

const DEFAULT_ANN_BG = 'linear-gradient(135deg, rgba(8,145,178,0.92) 0%, rgba(14,116,144,0.88) 48%, rgba(15,23,42,0.95) 100%)'
const EMPTY_FORM = { id: null, title: '', text: '', link: '', bg: '', enabled: true, push_to_inbox: false, icon: 'megaphone', start_at: '', end_at: '' }

const THEME_PRESETS = [
  { id: 'store', label: 'Store', icon: 'megaphone', bg: DEFAULT_ANN_BG },
  { id: 'deal', label: 'Deal', icon: 'tag', bg: 'linear-gradient(135deg, rgba(6,182,212,0.94) 0%, rgba(8,145,178,0.9) 46%, rgba(15,23,42,0.96) 100%)' },
  { id: 'gift', label: 'Gift', icon: 'gift', bg: 'linear-gradient(135deg, rgba(16,185,129,0.92) 0%, rgba(8,145,178,0.86) 52%, rgba(15,23,42,0.96) 100%)' },
  { id: 'warning', label: 'Alert', icon: 'alert-triangle', bg: 'linear-gradient(135deg, rgba(245,158,11,0.94) 0%, rgba(180,83,9,0.9) 46%, rgba(30,41,59,0.96) 100%)' },
  { id: 'maintenance', label: 'System', icon: 'wrench', bg: 'linear-gradient(135deg, rgba(99,102,241,0.94) 0%, rgba(14,116,144,0.86) 50%, rgba(15,23,42,0.96) 100%)' },
]

const ICON_OPTIONS = ['megaphone', 'sparkles', 'tag', 'gift', 'bell-ring', 'info', 'shield', 'clock']

function buildPayload(form) {
  return {
    title: String(form.title ?? '').trim(),
    text: String(form.text ?? '').trim(),
    link: String(form.link ?? '').trim(),
    bg: String(form.bg ?? '').trim(),
    icon: String(form.icon ?? '').trim(),
    enabled: form.enabled !== false,
    push_to_inbox: form.push_to_inbox === true,
    start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
    end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
  }
}

function AnnouncementPreview({ form }) {
  const preview = {
    title: form.title || 'ประกาศจาก VXPERS STORE',
    text: form.text || 'ข้อความประกาศจะแสดงตรงนี้',
    icon: form.icon || 'megaphone',
    bg: form.bg || DEFAULT_ANN_BG,
  }
  return (
    <div className="ann-admin-preview">
      <div className="ann-card ann-admin-preview-card" style={{ background: preview.bg }}>
        <span className="ann-card__glow" aria-hidden />
        <div className="ann-card__icon"><AnnIcon icon={preview.icon} className="h-4 w-4" /></div>
        <div className="ann-card__body">
          <div className="ann-card__title">{preview.title}</div>
          <AnnRichText text={preview.text} className="ann-card__text" />
        </div>
        {form.link ? <span className="ann-admin-preview-link">เปิดดู</span> : null}
      </div>
    </div>
  )
}

export default function AnnouncementsModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [form, setForm] = useState(EMPTY_FORM)
  const [view, setView] = useState('list')

  if (!data) return null

  const canManage = canAction('settings.manage')
  const announcements = Array.isArray(data.announcements) ? data.announcements : []
  const enabledCount = announcements.filter((a) => a.enabled !== false).length
  const scheduledCount = announcements.filter((a) => a.start_at || a.end_at).length
  const inboxCount = announcements.filter((a) => a.push_to_inbox).length

  function resetForm() { setForm({ ...EMPTY_FORM }) }

  function editAnn(a) {
    setForm({
      id: a.id, title: a.title || '', text: a.text || '', link: a.link || '', bg: a.bg || '',
      enabled: a.enabled !== false, push_to_inbox: Boolean(a.push_to_inbox), icon: a.icon || 'megaphone',
      start_at: isoToLocalInput(a.start_at), end_at: isoToLocalInput(a.end_at),
    })
    setView('form')
  }

  async function saveAnn() {
    const body = buildPayload(form)
    if (!body.text) { setActionState({ status: 'error', message: 'กรุณากรอกข้อความประกาศ' }); return }
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึกประกาศ...' })
      if (form.id) await fetchJson(`/api/admin/announcements/${form.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      else await fetchJson('/api/admin/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, sort_order: announcements.length }) })
      setActionState({ status: 'success', message: form.id ? 'แก้ไขประกาศเรียบร้อย' : 'สร้างประกาศเรียบร้อย' })
      resetForm()
      setView('list')
      await loadModuleData('announcements')
      window.dispatchEvent(new Event('app_refresh'))
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteAnn(id) {
    if (!window.confirm('ยืนยันลบประกาศนี้?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบประกาศ...' })
      await fetchJson(`/api/admin/announcements/${id}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบประกาศเรียบร้อย' })
      await loadModuleData('announcements')
      window.dispatchEvent(new Event('app_refresh'))
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function toggleAnn(ann) {
    try {
      setActionState({ status: 'working', message: 'กำลังอัปเดตสถานะ...' })
      const body = buildPayload({ ...ann, enabled: ann.enabled === false, start_at: isoToLocalInput(ann.start_at), end_at: isoToLocalInput(ann.end_at) })
      await fetchJson(`/api/admin/announcements/${ann.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setActionState({ status: 'success', message: 'อัปเดตสถานะเรียบร้อย' })
      await loadModuleData('announcements')
      window.dispatchEvent(new Event('app_refresh'))
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function moveAnn(index, dir) {
    const next = announcements.map((a) => a.id)
    const target = index + dir
    if (target < 0 || target >= next.length) return
    const [id] = next.splice(index, 1)
    next.splice(target, 0, id)
    try {
      setActionState({ status: 'working', message: 'กำลังจัดลำดับ...' })
      await fetchJson('/api/admin/announcements/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordered_ids: next }) })
      setActionState({ status: 'success', message: 'จัดลำดับเรียบร้อย' })
      await loadModuleData('announcements')
      window.dispatchEvent(new Event('app_refresh'))
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
        <div className="lgx-stat"><div className="l">ประกาศทั้งหมด</div><div className="v">{announcements.length}</div><div className="d">สร้างไว้ในระบบ</div></div>
        <div className="lgx-stat"><div className="l">กำลังแสดงหน้าร้าน</div><div className="v ok">{enabledCount}</div><div className="d">ลูกค้ามองเห็นตอนนี้</div></div>
        <div className="lgx-stat"><div className="l">ตั้งเวลาล่วงหน้า</div><div className="v">{scheduledCount}</div><div className="d">มีกำหนดเริ่ม/สิ้นสุด</div></div>
        <div className="lgx-stat"><div className="l">ส่งเข้า Inbox</div><div className="v">{inboxCount}</div><div className="d">แจ้งเตือนกล่องจดหมาย</div></div>
      </div>

      {view === 'list' && (
        <div className="lgx-panel">
          <div className="lgx-panel-head">
            <h2>ประกาศหน้าเว็บ</h2>
            <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => { resetForm(); setView('form') }} disabled={!canManage}><i className="bi bi-plus-lg" />สร้างประกาศ</button>
          </div>
          <div className="lgx-panel-body">
            {announcements.length === 0 ? (
              <div className="lgx-empty">ยังไม่มีประกาศ</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {announcements.map((ann, index) => (
                  <div key={ann.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, border: '1.5px solid var(--lgx-border)', borderRadius: 'var(--lgx-radius)', padding: 10 }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0, background: ann.bg || DEFAULT_ANN_BG, borderRadius: 'var(--lgx-radius)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
                      <AnnIcon icon={ann.icon} className="h-4 w-4" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ann.title || 'ประกาศ'}</div>
                        <div style={{ fontSize: 11, opacity: .85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ann.text || '-'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span className={`lgx-pill ${ann.enabled !== false ? 'ok' : 'neutral'}`}>{ann.enabled !== false ? 'เปิดใช้งาน' : 'ปิดอยู่'}</span>
                      {ann.push_to_inbox ? <span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>Inbox</span> : null}
                      {(ann.start_at || ann.end_at) ? <span className="lgx-pill warn">ตั้งเวลา</span> : null}
                      <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>สร้าง {formatDateTime(ann.created_at)}</span>
                    </div>
                    <div className="lgx-btn-group" style={{ marginLeft: 'auto' }}>
                      <button type="button" className="lgx-icon-action" onClick={() => moveAnn(index, -1)} disabled={!canManage || index === 0} title="เลื่อนขึ้น"><i className="bi bi-arrow-up" /></button>
                      <button type="button" className="lgx-icon-action" onClick={() => moveAnn(index, 1)} disabled={!canManage || index === announcements.length - 1} title="เลื่อนลง"><i className="bi bi-arrow-down" /></button>
                      <button type="button" className="lgx-btn" onClick={() => toggleAnn(ann)} disabled={!canManage}>{ann.enabled !== false ? 'ปิด' : 'เปิด'}</button>
                      <button type="button" className="lgx-icon-action" onClick={() => editAnn(ann)} disabled={!canManage}><i className="bi bi-pencil" /></button>
                      <button type="button" className="lgx-icon-action danger" onClick={() => deleteAnn(ann.id)} disabled={!canManage}><i className="bi bi-trash" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'form' && (
        <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
          <div className="lgx-panel">
            <div className="lgx-panel-head">
              <h2>{form.id ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}</h2>
              <button type="button" className="lgx-btn" onClick={() => setView('list')}>กลับ</button>
            </div>
            <div className="lgx-panel-body">
              <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
                <div className="lgx-field"><label>หัวข้อ</label><input className="lgx-input" value={form.title} maxLength={200} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="เช่น โปรโมชันสุดสัปดาห์" /></div>
                <div className="lgx-field"><label>ลิงก์</label><input className="lgx-input" value={form.link} maxLength={300} onChange={(e) => setForm((prev) => ({ ...prev, link: e.target.value }))} placeholder="/categories" /></div>
              </div>
              <div className="lgx-field" style={{ marginBottom: 12 }}>
                <label>ข้อความ</label>
                <textarea className="lgx-textarea" rows={4} maxLength={300} value={form.text} onChange={(e) => setForm((prev) => ({ ...prev, text: e.target.value }))} placeholder="ข้อความที่จะแสดงบนหน้าเว็บ" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--lgx-text-muted)', display: 'block', marginBottom: 6 }}>ธีม</label>
                <div className="ann-admin-preset-grid">
                  {THEME_PRESETS.map((theme) => (
                    <button type="button" key={theme.id} className={`ann-admin-preset ${form.bg === theme.bg ? 'active' : ''}`} style={{ background: theme.bg }} onClick={() => setForm((prev) => ({ ...prev, bg: theme.bg, icon: theme.icon }))}>
                      <AnnIcon icon={theme.icon} className="h-4 w-4" />
                      <span>{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--lgx-text-muted)', display: 'block', marginBottom: 6 }}>Icon</label>
                  <div className="ann-admin-icon-grid">
                    {ICON_OPTIONS.map((icon) => (
                      <button type="button" key={icon} className={`ann-admin-icon-choice ${form.icon === icon ? 'active' : ''}`} onClick={() => setForm((prev) => ({ ...prev, icon }))} title={icon}>
                        <AnnIcon icon={icon} className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lgx-field"><label>Background CSS</label><input className="lgx-input" value={form.bg} onChange={(e) => setForm((prev) => ({ ...prev, bg: e.target.value }))} placeholder={DEFAULT_ANN_BG} /></div>
              </div>
              <div className="lgx-form-grid" style={{ marginBottom: 12 }}>
                <div className="lgx-field"><label>เริ่มแสดง</label><input type="datetime-local" className="lgx-input" value={form.start_at} onChange={(e) => setForm((prev) => ({ ...prev, start_at: e.target.value }))} /></div>
                <div className="lgx-field"><label>หยุดแสดง</label><input type="datetime-local" className="lgx-input" value={form.end_at} onChange={(e) => setForm((prev) => ({ ...prev, end_at: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <label className="lgx-checkbox-row"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))} />เปิดใช้งาน</label>
                <label className="lgx-checkbox-row"><input type="checkbox" checked={form.push_to_inbox} onChange={(e) => setForm((prev) => ({ ...prev, push_to_inbox: e.target.checked }))} />ส่งเข้า Inbox</label>
              </div>
            </div>
            <div className="lgx-panel-head" style={{ borderBottom: 'none', borderTop: '1.5px solid var(--lgx-border)' }}>
              <div className="lgx-btn-group">
                <button type="button" className="lgx-btn lgx-btn-accent" onClick={saveAnn} disabled={!canManage || actionState.status === 'working'}><i className="bi bi-floppy" />{form.id ? 'บันทึกการแก้ไข' : 'สร้างประกาศ'}</button>
                <button type="button" className="lgx-btn" onClick={() => setView('list')}>ยกเลิก</button>
              </div>
            </div>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-head"><h2>Preview</h2></div>
            <div className="lgx-panel-body"><AnnouncementPreview form={form} /></div>
          </div>
        </div>
      )}
    </>
  )
}
