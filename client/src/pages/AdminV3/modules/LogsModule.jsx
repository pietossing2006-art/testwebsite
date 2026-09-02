import { useEffect, useRef, useState } from 'react'
import { formatDateTime } from '../helpers.js'

function formatRelativeTime(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diffSec < 45) return 'เมื่อสักครู่'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชม. ที่แล้ว`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} วันที่แล้ว`
  return d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric', year: '2-digit' })
}

const SEVERITY_TONE = { critical: 'crit', security: 'crit', warning: 'warn', info: 'neutral' }
const SEVERITY_ICON = { critical: 'bi-fire', security: 'bi-shield-lock-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' }

const ACTION_LABELS = {
  'user.role_set': { title: 'เปลี่ยนสิทธิ์ผู้ใช้', icon: 'bi-person-badge' },
  'user.ban': { title: 'ระงับบัญชีผู้ใช้', icon: 'bi-slash-circle' },
  'user.unban': { title: 'ปลดระงับบัญชี', icon: 'bi-check-circle' },
  'user.points_adjust': { title: 'ปรับยอดเงิน/พอยท์', icon: 'bi-wallet2' },
  'user.password_reset': { title: 'รีเซ็ตรหัสผ่าน', icon: 'bi-key' },
  'user.deleted': { title: 'ลบบัญชีผู้ใช้', icon: 'bi-trash' },
  'auth.login': { title: 'เข้าสู่ระบบ', icon: 'bi-box-arrow-in-right' },
  'auth.failed': { title: 'เข้าสู่ระบบล้มเหลว', icon: 'bi-shield-x' },
  'product.create': { title: 'สร้างสินค้าใหม่', icon: 'bi-plus-square' },
  'product.update': { title: 'แก้ไขสินค้า', icon: 'bi-pencil-square' },
  'product.delete': { title: 'ลบสินค้า', icon: 'bi-trash' },
  'category.create': { title: 'สร้างหมวดหมู่', icon: 'bi-folder-plus' },
  'category.update': { title: 'แก้ไขหมวดหมู่', icon: 'bi-folder-check' },
  'stock.pool_create': { title: 'สร้าง Stock Pool', icon: 'bi-collection-play' },
  'stock.pool_update': { title: 'แก้ไข Stock Pool', icon: 'bi-collection' },
  'stock.item_add': { title: 'เติมสินค้าในสต็อก', icon: 'bi-box-arrow-in-down' },
  'stock.item_delete': { title: 'ลบไอเทมสต็อก', icon: 'bi-box-arrow-up' },
  'order.cancel': { title: 'ยกเลิกคำสั่งซื้อ', icon: 'bi-x-octagon' },
  'order.refund': { title: 'คืนเงินคำสั่งซื้อ', icon: 'bi-arrow-counterclockwise' },
  'order.fulfill': { title: 'ส่งมอบสินค้าสำเร็จ', icon: 'bi-check2-circle' },
  'coupon.create': { title: 'สร้างคูปองส่วนลด', icon: 'bi-ticket-perforated' },
  'coupon.delete': { title: 'ลบคูปองส่วนลด', icon: 'bi-ticket-detailed' },
  'settings.update': { title: 'บันทึกตั้งค่าระบบ', icon: 'bi-gear' },
}

function parseHumanAction(action) {
  if (!action) return { title: 'Unspecified Action', icon: 'bi-activity' }
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const parts = action.split('.')
  return { title: parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' '), icon: 'bi-activity' }
}

const INSPECTOR_TABS = [
  { id: 'overview', label: 'ภาพรวม & บริบท', icon: 'bi-info-circle' },
  { id: 'diff', label: 'การเปลี่ยนแปลง', icon: 'bi-arrow-left-right' },
  { id: 'raw', label: 'ข้อมูลดิบ (JSON)', icon: 'bi-code-square' },
]

export default function LogsModule({ data, ctx }) {
  const { logsQuery, setLogsQuery, loadModuleData, authToken } = ctx

  const [selectedLog, setSelectedLog] = useState(null)
  const [inspectorTab, setInspectorTab] = useState('overview')
  const [copyFeedback, setCopyFeedback] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef(null)

  useEffect(() => {
    if (!exportMenuOpen) return
    function onClickOutside(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [exportMenuOpen])

  if (!data) return null

  const logs = data.logs || []
  const summary = data.summary || { total_count: logs.length, critical_count: 0, warning_count: 0, security_count: 0, unique_actors: 0, unique_ips: 0 }
  const stats = data.stats || null
  const page = data.page || logsQuery.page || 1
  const limit = data.limit || logsQuery.limit || 50
  const totalPages = data.totalPages || 1
  const total = data.total != null ? data.total : logs.length

  function patch(obj) { setLogsQuery((prev) => ({ ...prev, ...obj, page: obj.page !== undefined ? obj.page : 1 })) }

  function handleCopy(text, label = 'คัดลอกแล้ว') {
    if (!text) return
    navigator.clipboard.writeText(typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text))
    setCopyFeedback(label)
    setTimeout(() => setCopyFeedback(''), 2500)
  }

  function handleExport(format = 'csv') {
    setExporting(true)
    setExportMenuOpen(false)
    const qs = new URLSearchParams()
    if (logsQuery.search) qs.set('search', logsQuery.search)
    if (logsQuery.action) qs.set('action', logsQuery.action)
    if (logsQuery.category && logsQuery.category !== 'all') qs.set('category', logsQuery.category)
    if (logsQuery.severity && logsQuery.severity !== 'all') qs.set('severity', logsQuery.severity)
    if (logsQuery.status && logsQuery.status !== 'all') qs.set('status', logsQuery.status)
    if (logsQuery.actorUserId) qs.set('actor_user_id', logsQuery.actorUserId)
    if (logsQuery.dateFrom) qs.set('date_from', logsQuery.dateFrom)
    if (logsQuery.dateTo) qs.set('date_to', logsQuery.dateTo)
    qs.set('format', format)
    const token = authToken || ''
    const url = `/api/admin/audit-logs/export?${qs.toString()}`
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => { if (!res.ok) throw new Error('Download failed'); return res.blob() })
      .then((blob) => {
        const a = document.createElement('a')
        a.href = window.URL.createObjectURL(blob)
        a.download = `vxpers-audit-logs-${new Date().toISOString().slice(0, 10)}.${format}`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setExporting(false)
      })
      .catch(() => setExporting(false))
  }

  function setDatePreset(preset) {
    const now = new Date()
    if (preset === 'today') patch({ dateFrom: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), dateTo: '' })
    else if (preset === '7d') patch({ dateFrom: new Date(now.getTime() - 7 * 86400000).toISOString(), dateTo: '' })
    else if (preset === '30d') patch({ dateFrom: new Date(now.getTime() - 30 * 86400000).toISOString(), dateTo: '' })
    else patch({ dateFrom: '', dateTo: '' })
  }

  const hasActiveFilters = Boolean(logsQuery.search || (logsQuery.category && logsQuery.category !== 'all') || (logsQuery.severity && logsQuery.severity !== 'all') || (logsQuery.status && logsQuery.status !== 'all') || logsQuery.dateFrom)

  return (
    <>
      {copyFeedback ? <div className="lgx-toast"><i className="bi bi-check-circle-fill" /><span>{copyFeedback}</span></div> : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <div className="lgx-dropdown-wrap" ref={exportMenuRef}>
          <button type="button" className="lgx-btn" onClick={() => setExportMenuOpen((v) => !v)} disabled={exporting}>
            <i className="bi bi-download" />{exporting ? 'กำลังส่งออก...' : 'ส่งออกข้อมูล'}
          </button>
          {exportMenuOpen && (
            <div className="lgx-dropdown" style={{ minWidth: 200 }}>
              <button type="button" className="lgx-dropdown-item" onClick={() => handleExport('csv')}><i className="bi bi-filetype-csv" />ส่งออกเป็น CSV</button>
              <button type="button" className="lgx-dropdown-item" onClick={() => handleExport('json')}><i className="bi bi-filetype-json" />ส่งออกเป็น JSON</button>
            </div>
          )}
        </div>
        <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => loadModuleData('logs')}><i className="bi bi-arrow-clockwise" />รีเฟรชข้อมูล</button>
      </div>

      <div className="lgx-strip">
        <div className="lgx-stat"><div className="l">บันทึกทั้งหมด</div><div className="v">{total.toLocaleString()}</div><div className="d">24 ชม. ล่าสุด: {stats?.kpis?.count_24h || 0} รายการ</div></div>
        <div className="lgx-stat"><div className="l">เหตุการณ์วิกฤต</div><div className="v crit">{(summary.critical_count + summary.security_count).toLocaleString()}</div><div className="d">24 ชม. ล่าสุด: {stats?.kpis?.critical_24h || 0} เหตุการณ์</div></div>
        <div className="lgx-stat"><div className="l">Staff ที่มีบันทึก</div><div className="v">{summary.unique_actors || 0}</div><div className="d">ใช้งานใน 24h: {stats?.kpis?.active_actors_24h || 0} ท่าน</div></div>
        <div className="lgx-stat"><div className="l">IP ที่บันทึก</div><div className="v">{summary.unique_ips || 0}</div><div className="d">IP ใน 24h: {stats?.kpis?.unique_ips_24h || 0} IPs</div></div>
      </div>

      <div className="lgx-panel">
        <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <input type="text" className="lgx-input" style={{ flex: '1 1 260px', maxWidth: 360 }} placeholder="ค้นหา Action, ผู้กระทำ, Email, IP, รายละเอียด..." value={logsQuery.search || ''} onChange={(e) => patch({ search: e.target.value })} />
            <select className="lgx-select" style={{ width: 'auto' }} value={logsQuery.category || 'all'} onChange={(e) => patch({ category: e.target.value })}>
              <option value="all">ทุกหมวดหมู่</option>
              <option value="user">ผู้ใช้ & สิทธิ์</option>
              <option value="balance">เงิน & เติมเงิน</option>
              <option value="catalog">สินค้า & หมวดหมู่</option>
              <option value="stock">สต็อก & Pool</option>
              <option value="order">ออเดอร์ & ส่งมอบ</option>
              <option value="settings">ตั้งค่าระบบ</option>
              <option value="auth">ความปลอดภัย / Auth</option>
            </select>
            <select className="lgx-select" style={{ width: 'auto' }} value={logsQuery.severity || 'all'} onChange={(e) => patch({ severity: e.target.value })}>
              <option value="all">ทุกระดับความสำคัญ</option>
              <option value="critical">Critical (วิกฤต)</option>
              <option value="warning">Warning (เตือน)</option>
              <option value="security">Security</option>
              <option value="info">Info (ทั่วไป)</option>
            </select>
            <select className="lgx-select" style={{ width: 'auto' }} value={logsQuery.status || 'all'} onChange={(e) => patch({ status: e.target.value })}>
              <option value="all">ทุกสถานะ</option>
              <option value="success">สำเร็จ</option>
              <option value="failed">ล้มเหลว</option>
            </select>
            <select className="lgx-select" style={{ width: 'auto' }} value={limit} onChange={(e) => patch({ limit: Number(e.target.value) })}>
              <option value={25}>25 / หน้า</option>
              <option value={50}>50 / หน้า</option>
              <option value={100}>100 / หน้า</option>
              <option value={200}>200 / หน้า</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, borderTop: '1.5px solid var(--lgx-border)', paddingTop: 12 }}>
            <div className="lgx-chip-row">
              <span style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginRight: 2 }}>ช่วงเวลา:</span>
              <button type="button" className={`lgx-chip${!logsQuery.dateFrom ? ' is-active' : ''}`} onClick={() => setDatePreset('all')}>ทั้งหมด</button>
              <button type="button" className={`lgx-chip${logsQuery.dateFrom && !logsQuery.dateTo ? ' is-active' : ''}`} onClick={() => setDatePreset('today')}>วันนี้</button>
              <button type="button" className="lgx-chip" onClick={() => setDatePreset('7d')}>7 วันที่ผ่านมา</button>
              <button type="button" className="lgx-chip" onClick={() => setDatePreset('30d')}>30 วันที่ผ่านมา</button>
            </div>
            {hasActiveFilters && (
              <button type="button" className="lgx-btn" style={{ color: 'var(--lgx-crit)', borderColor: 'var(--lgx-crit)' }} onClick={() => setLogsQuery({ search: '', action: '', category: 'all', severity: 'all', status: 'all', actorUserId: '', dateFrom: '', dateTo: '', limit: 50, page: 1 })}>
                <i className="bi bi-x-circle" />ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="lgx-panel">
        <div className="lgx-panel-head">
          <h2>รายการบันทึกกิจกรรม ({total.toLocaleString()})</h2>
          <span>หน้า {page} / {totalPages}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="lgx-table">
            <thead><tr><th>เวลา</th><th>ระดับ</th><th>ผู้กระทำ</th><th>กิจกรรม</th><th>สรุปข้อมูล</th><th>IP / เครื่อง</th><th /></tr></thead>
            <tbody>
              {logs.map((log) => {
                const tone = SEVERITY_TONE[log.severity] || 'neutral'
                const icon = SEVERITY_ICON[log.severity] || SEVERITY_ICON.info
                const actionMeta = parseHumanAction(log.action)
                const details = log.detail_json || {}
                return (
                  <tr key={log.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedLog(log); setInspectorTab('overview') }}>
                    <td><div className="mono" style={{ fontWeight: 600, fontSize: 12 }}>{formatDateTime(log.created_at)}</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{formatRelativeTime(log.created_at)}</div></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        <span className={`lgx-pill ${tone}`}><i className={`bi ${icon}`} style={{ marginRight: 3 }} />{String(log.severity || 'info').toUpperCase()}</span>
                        <span className={`lgx-pill ${log.status === 'failed' ? 'crit' : 'ok'}`} style={{ fontSize: 9 }}>{log.status === 'failed' ? 'FAILED' : 'SUCCESS'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="lgx-avatar" style={{ width: 28, height: 28 }}>{(log.actor_display_name || log.actor_username || log.actor_email || 'S').charAt(0).toUpperCase()}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontWeight: 700, fontSize: 12, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.actor_display_name || log.actor_username || 'System'}</span>
                            {log.actor_role ? <span className={`lgx-pill ${log.actor_role === 'owner' ? 'crit' : 'neutral'}`} style={{ fontSize: 9 }}>{log.actor_role}</span> : null}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.actor_email || (log.actor_user_id ? `User #${log.actor_user_id}` : '-')}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}><i className={`bi ${actionMeta.icon}`} style={{ color: 'var(--lgx-accent)' }} /><span style={{ fontWeight: 700, fontSize: 12 }}>{actionMeta.title}</span></div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span className="mono lgx-pill neutral" style={{ fontSize: 9.5 }}>{log.action}</span>
                        {log.entity_type ? <span className="mono lgx-pill neutral" style={{ fontSize: 9.5 }}>{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="mono" style={{ fontSize: 10.5, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--lgx-text-muted)' }}>
                        {details.before !== undefined && details.after !== undefined ? <span className="lgx-pill warn" style={{ marginRight: 4 }}>Diff</span> : null}
                        {typeof details === 'object' && Object.keys(details).length > 0 ? Object.entries(details).slice(0, 3).map(([k, v]) => <span key={k} style={{ marginRight: 6 }}>{k}: <span style={{ color: 'var(--lgx-accent)' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span></span>) : '-'}
                      </div>
                    </td>
                    <td>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{log.ip_address || '-'}</div>
                      <div style={{ fontSize: 10, color: 'var(--lgx-text-muted)' }}>{log.user_agent ? (log.user_agent.includes('Windows') ? 'Windows' : log.user_agent.includes('Mac') ? 'macOS' : log.user_agent.includes('Android') ? 'Android' : log.user_agent.includes('iPhone') ? 'iOS' : 'Web/API') : '-'}</div>
                    </td>
                    <td><button type="button" className="lgx-btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setSelectedLog(log); setInspectorTab('overview') }}><i className="bi bi-eye-fill" />Inspect</button></td>
                  </tr>
                )
              })}
              {logs.length === 0 && <tr><td colSpan={7} className="lgx-empty"><i className="bi bi-journal-x" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />ไม่พบบันทึกการใช้งานตามเงื่อนไข</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="lgx-panel-head" style={{ borderTop: '1.5px solid var(--lgx-border)', borderBottom: 'none' }}>
          <span>แสดง {logs.length > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, total)} จากทั้งหมด {total.toLocaleString()} รายการ</span>
          <div className="lgx-btn-group">
            <button type="button" className="lgx-icon-action" disabled={page <= 1} onClick={() => patch({ page: 1 })}><i className="bi bi-chevron-double-left" /></button>
            <button type="button" className="lgx-icon-action" disabled={page <= 1} onClick={() => patch({ page: page - 1 })}><i className="bi bi-chevron-left" /></button>
            <span className="mono" style={{ padding: '0 8px', fontSize: 12, fontWeight: 700 }}>{page} / {totalPages}</span>
            <button type="button" className="lgx-icon-action" disabled={page >= totalPages} onClick={() => patch({ page: page + 1 })}><i className="bi bi-chevron-right" /></button>
            <button type="button" className="lgx-icon-action" disabled={page >= totalPages} onClick={() => patch({ page: totalPages })}><i className="bi bi-chevron-double-right" /></button>
          </div>
        </div>
      </div>

      {selectedLog && (
        <div className="lgx-modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="lgx-modal-card" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="lgx-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`lgx-pill ${SEVERITY_TONE[selectedLog.severity] || 'neutral'}`}>{selectedLog.severity?.toUpperCase() || 'INFO'}</span>
                <span style={{ fontWeight: 700 }}>Audit Log #{selectedLog.id}: {selectedLog.action}</span>
              </div>
              <button type="button" className="lgx-icon-action" onClick={() => setSelectedLog(null)}><i className="bi bi-x-lg" /></button>
            </div>

            <div className="lgx-inline-tabs" style={{ padding: '0 18px' }}>
              {INSPECTOR_TABS.map((t) => <button key={t.id} type="button" className={`lgx-inline-tab${inspectorTab === t.id ? ' is-active' : ''}`} onClick={() => setInspectorTab(t.id)}><i className={`bi ${t.icon}`} style={{ marginRight: 5 }} />{t.label}</button>)}
            </div>

            <div className="lgx-modal-body">
              {inspectorTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="lgx-panel">
                      <div className="lgx-panel-head"><h2><i className="bi bi-person-badge" style={{ marginRight: 5 }} />ข้อมูลผู้กระทำ</h2></div>
                      <div className="lgx-panel-body">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span className="lgx-avatar" style={{ width: 40, height: 40, fontSize: 15 }}>{(selectedLog.actor_display_name || selectedLog.actor_username || selectedLog.actor_email || 'S').charAt(0).toUpperCase()}</span>
                          <div>
                            <div style={{ fontWeight: 700 }}>{selectedLog.actor_display_name || selectedLog.actor_username || 'System / Auto Bot'}</div>
                            <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{selectedLog.actor_email || 'ไม่มีอีเมล'}</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              <span className="lgx-pill neutral">#{selectedLog.actor_user_id || 'System'}</span>
                              {selectedLog.actor_role ? <span className="lgx-pill crit">{selectedLog.actor_role}</span> : null}
                            </div>
                          </div>
                        </div>
                        {selectedLog.actor_user_id && (
                          <button type="button" className="lgx-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { patch({ actorUserId: selectedLog.actor_user_id, search: '' }); setSelectedLog(null) }}>
                            <i className="bi bi-filter" />กรองกิจกรรมทั้งหมดของ Staff ท่านนี้
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="lgx-panel">
                      <div className="lgx-panel-head"><h2><i className="bi bi-bullseye" style={{ marginRight: 5 }} />เป้าหมายกิจกรรม</h2></div>
                      <div className="lgx-panel-body">
                        <div className="lgx-kv"><span className="k">Entity Type</span><span className="v mono">{selectedLog.entity_type || '-'}</span></div>
                        <div className="lgx-kv"><span className="k">Entity ID</span><span className="v mono" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{selectedLog.entity_id || '-'}{selectedLog.entity_id ? <button type="button" className="lgx-icon-action" style={{ width: 22, height: 22 }} onClick={() => handleCopy(selectedLog.entity_id, 'คัดลอก Entity ID แล้ว')}><i className="bi bi-clipboard" style={{ fontSize: 11 }} /></button> : null}</span></div>
                        <div className="lgx-kv"><span className="k">Action Name</span><span className="v mono" style={{ color: 'var(--lgx-warn)' }}>{selectedLog.action}</span></div>
                        <div className="lgx-kv"><span className="k">Timestamp</span><span className="v">{formatDateTime(selectedLog.created_at)}</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="lgx-panel">
                    <div className="lgx-panel-head"><h2><i className="bi bi-hdd-network" style={{ marginRight: 5 }} />ข้อมูลการเชื่อมต่อ &amp; เครือข่าย</h2></div>
                    <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="lgx-kv"><span className="k">IP Address</span><span className="v mono" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{selectedLog.ip_address || '-'}{selectedLog.ip_address ? <button type="button" className="lgx-icon-action" style={{ width: 22, height: 22 }} onClick={() => handleCopy(selectedLog.ip_address, 'คัดลอก IP แล้ว')}><i className="bi bi-clipboard" style={{ fontSize: 11 }} /></button> : null}</span></div>
                      <div className="lgx-kv"><span className="k">HTTP Method / Path</span><span className="v mono">{selectedLog.request_method ? <span className="lgx-pill neutral" style={{ marginRight: 6 }}>{selectedLog.request_method}</span> : null}{selectedLog.request_path || '-'}</span></div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', marginBottom: 4 }}>User Agent</div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)', wordBreak: 'break-all' }}>{selectedLog.user_agent || 'ไม่มีบันทึก User Agent'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {inspectorTab === 'diff' && (
                selectedLog.detail_json?.before !== undefined || selectedLog.detail_json?.after !== undefined ? (
                  <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="lgx-panel" style={{ borderColor: 'var(--lgx-crit)' }}>
                      <div className="lgx-panel-head"><h2 style={{ color: 'var(--lgx-crit)' }}><i className="bi bi-dash-circle" style={{ marginRight: 5 }} />ข้อมูลเดิม</h2><button type="button" className="lgx-btn" style={{ fontSize: 11 }} onClick={() => handleCopy(selectedLog.detail_json.before, 'คัดลอก Before แล้ว')}><i className="bi bi-clipboard" />Copy</button></div>
                      <pre className="lgx-code-block" style={{ margin: 12, maxHeight: 280 }}>{JSON.stringify(selectedLog.detail_json.before, null, 2)}</pre>
                    </div>
                    <div className="lgx-panel" style={{ borderColor: 'var(--lgx-ok)' }}>
                      <div className="lgx-panel-head"><h2 style={{ color: 'var(--lgx-ok)' }}><i className="bi bi-plus-circle" style={{ marginRight: 5 }} />ข้อมูลใหม่</h2><button type="button" className="lgx-btn" style={{ fontSize: 11 }} onClick={() => handleCopy(selectedLog.detail_json.after, 'คัดลอก After แล้ว')}><i className="bi bi-clipboard" />Copy</button></div>
                      <pre className="lgx-code-block" style={{ margin: 12, maxHeight: 280 }}>{JSON.stringify(selectedLog.detail_json.after, null, 2)}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="lgx-empty">
                    <i className="bi bi-file-earmark-diff" style={{ display: 'block', fontSize: 22, marginBottom: 6 }} />
                    <div style={{ fontWeight: 700, color: 'var(--lgx-text)' }}>ไม่มีโครงสร้าง Diff แบบ Before/After โดยตรง</div>
                    <div>กิจกรรมนี้บันทึกข้อมูลแบบ Snapshot Payload ตรวจสอบได้ที่แท็บ &quot;ข้อมูลดิบ&quot;</div>
                  </div>
                )
              )}

              {inspectorTab === 'raw' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>JSON Payload ฉบับเต็ม</span>
                    <button type="button" className="lgx-btn" onClick={() => handleCopy(selectedLog, 'คัดลอก JSON ทั้งหมดแล้ว')}><i className="bi bi-clipboard" />คัดลอก JSON</button>
                  </div>
                  <pre className="lgx-code-block" style={{ maxHeight: 380 }}>{JSON.stringify(selectedLog, null, 2)}</pre>
                </div>
              )}
            </div>

            <div className="lgx-modal-foot">
              <button type="button" className="lgx-btn" onClick={() => setSelectedLog(null)}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
