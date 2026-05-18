import { useState } from 'react'
import { formatNumber, formatDateTime, getErrorMessage } from '../helpers.js'

const TABS = [
  { id: 'overview',  label: 'ภาพรวม',        icon: 'bi-speedometer2' },
  { id: 'audit',     label: 'Audit Log',      icon: 'bi-journal-text' },
  { id: 'webhooks',  label: 'Webhook Logs',   icon: 'bi-broadcast' },
  { id: 'queue',     label: 'Queue Health',   icon: 'bi-cpu' },
]

export default function OwnerModule({ data, ctx }) {
  const { fetchJson, loadModuleData } = ctx
  const [tab, setTab] = useState('overview')
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })

  // sub-query states for audit / webhook pagination
  const [auditQuery, setAuditQuery] = useState({ action: '', entity_type: '', limit: 50 })
  const [auditData, setAuditData] = useState(null)
  const [webhookData, setWebhookData] = useState(null)
  const [queueData, setQueueData] = useState(null)
  const [loadingTab, setLoadingTab] = useState(null)

  if (!data) return null

  const stats = data.stats || {}
  const topAdmins = data.top_admins || []

  async function switchTab(id) {
    setTab(id)
    if (id === 'audit' && !auditData) await fetchAudit()
    if (id === 'webhooks' && !webhookData) await fetchWebhooks()
    if (id === 'queue' && !queueData) await fetchQueue()
  }

  async function fetchAudit(query = auditQuery) {
    setLoadingTab('audit')
    try {
      const qs = new URLSearchParams({ limit: String(query.limit || 50), offset: '0' })
      if (query.action.trim()) qs.set('action', query.action.trim())
      if (query.entity_type.trim()) qs.set('entity_type', query.entity_type.trim())
      const d = await fetchJson(`/api/admin/audit-logs?${qs}`)
      setAuditData(Array.isArray(d?.logs) ? d.logs : [])
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
    setLoadingTab(null)
  }

  async function fetchWebhooks() {
    setLoadingTab('webhooks')
    try {
      const d = await fetchJson('/api/admin/webhooks?limit=100')
      setWebhookData(Array.isArray(d?.webhooks) ? d.webhooks : [])
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
    setLoadingTab(null)
  }

  async function fetchQueue() {
    setLoadingTab('queue')
    try {
      const d = await fetchJson('/api/admin/queue-health')
      setQueueData(d)
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
    setLoadingTab(null)
  }

  function patchAudit(obj) {
    setAuditQuery((p) => ({ ...p, ...obj }))
  }

  return (
    <>
      {/* ── Toast ── */}
      {actionState.status !== 'idle' && (
        <div className={`alert alert-dismissible fade show mb-3 ${actionState.status === 'error' ? 'alert-danger' : 'alert-info'}`} role="alert">
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })} />
        </div>
      )}

      {/* ── Header ── */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <i className="bi bi-shield-fill-check text-danger fs-3" />
        <div>
          <h4 className="mb-0 fw-bold">Owner Panel</h4>
          <small className="text-secondary">เข้าถึงได้เฉพาะ Owner เท่านั้น</small>
        </div>
      </div>

      {/* ── Tabs ── */}
      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.id}>
            <button
              className={`nav-link ${tab === t.id ? 'active' : ''}`}
              onClick={() => switchTab(t.id)}
            >
              <i className={`bi ${t.icon} me-1`} />
              {t.label}
              {loadingTab === t.id && <span className="spinner-border spinner-border-sm ms-2" />}
            </button>
          </li>
        ))}
      </ul>

      {/* ── Tab: Overview ── */}
      {tab === 'overview' && (
        <div>
          <div className="row g-3 mb-4">
            {[
              { label: 'ผู้ใช้ทั้งหมด', val: stats.total_users, icon: 'bi-people-fill', color: 'primary' },
              { label: 'แต้มในระบบ',   val: stats.total_balance, icon: 'bi-coin', color: 'warning' },
              { label: 'ออเดอร์ทั้งหมด', val: stats.total_orders, icon: 'bi-bag-fill', color: 'success' },
              { label: 'รายได้รวม (฿)', val: stats.total_revenue, icon: 'bi-cash-stack', color: 'info' },
            ].map((c, i) => (
              <div className="col-6 col-md-3" key={i}>
                <div className="card border-0 shadow-sm">
                  <div className="card-body">
                    <div className={`text-${c.color} mb-1`}><i className={`bi ${c.icon} fs-4`} /></div>
                    <div className="fw-bold fs-5">{formatNumber(c.val ?? 0)}</div>
                    <div className="small text-secondary">{c.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Role breakdown */}
          {stats.by_role && (
            <div className="card mb-3">
              <div className="card-header"><strong>สัดส่วนตาม Role</strong></div>
              <div className="card-body">
                <div className="row g-2">
                  {Object.entries(stats.by_role).map(([role, count]) => (
                    <div className="col-6 col-md-2 text-center" key={role}>
                      <div className="border rounded p-2">
                        <div className="fw-bold">{formatNumber(count)}</div>
                        <div className="small text-secondary">{role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Top admins recent activity */}
          {topAdmins.length > 0 && (
            <div className="card">
              <div className="card-header"><strong>Admin ที่มีกิจกรรมล่าสุด</strong></div>
              <div className="card-body p-0">
                <table className="table table-sm mb-0">
                  <thead className="table-light">
                    <tr><th>Admin</th><th>Role</th><th>Actions (audit)</th><th>ล่าสุด</th></tr>
                  </thead>
                  <tbody>
                    {topAdmins.map((a, i) => (
                      <tr key={i}>
                        <td>
                          <div className="fw-semibold">{a.username || a.email}</div>
                          <small className="text-secondary">{a.email}</small>
                        </td>
                        <td><span className="badge text-bg-secondary">{a.role}</span></td>
                        <td>{formatNumber(a.audit_count)}</td>
                        <td><small className="text-secondary">{formatDateTime(a.last_action_at)}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-3">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => loadModuleData('owner')}>
              <i className="bi bi-arrow-clockwise me-1" />รีเฟรช
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Audit Log ── */}
      {tab === 'audit' && (
        <div>
          <div className="card mb-3">
            <div className="card-body py-2">
              <div className="row g-2">
                <div className="col-md-4">
                  <input
                    type="text" className="form-control form-control-sm"
                    placeholder="Filter by action (เช่น user.ban)"
                    value={auditQuery.action}
                    onChange={(e) => patchAudit({ action: e.target.value })}
                  />
                </div>
                <div className="col-md-3">
                  <input
                    type="text" className="form-control form-control-sm"
                    placeholder="Filter by entity type"
                    value={auditQuery.entity_type}
                    onChange={(e) => patchAudit({ entity_type: e.target.value })}
                  />
                </div>
                <div className="col-md-2">
                  <select
                    className="form-select form-select-sm"
                    value={auditQuery.limit}
                    onChange={(e) => patchAudit({ limit: Number(e.target.value) })}
                  >
                    {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} รายการ</option>)}
                  </select>
                </div>
                <div className="col-md-3">
                  <button className="btn btn-primary btn-sm w-100" onClick={() => fetchAudit(auditQuery)}>
                    <i className="bi bi-search me-1" />ค้นหา
                  </button>
                </div>
              </div>
            </div>
          </div>

          {loadingTab === 'audit' ? (
            <div className="text-center py-4"><span className="spinner-border" /></div>
          ) : (
            <div className="card">
              <div className="card-body p-0" style={{ overflowX: 'auto' }}>
                <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
                  <thead className="table-light">
                    <tr>
                      <th>ID</th><th>Action</th><th>Entity</th><th>Actor</th><th>Detail</th><th>เวลา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditData || []).map((log) => (
                      <tr key={log.id}>
                        <td className="text-secondary">{log.id}</td>
                        <td className="font-monospace">{log.action}</td>
                        <td className="text-secondary">{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                        <td>
                          <div>{log.actor_username || '—'}</div>
                          <small className="text-secondary">{log.actor_email}</small>
                        </td>
                        <td>
                          <code style={{ fontSize: 10 }}>
                            {log.detail_json ? JSON.stringify(log.detail_json).slice(0, 60) : ''}
                          </code>
                        </td>
                        <td className="text-secondary">{formatDateTime(log.created_at)}</td>
                      </tr>
                    ))}
                    {!(auditData?.length) && !loadingTab && (
                      <tr><td colSpan={6} className="text-center text-secondary py-4">ไม่มี audit log</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Webhook Logs ── */}
      {tab === 'webhooks' && (
        <div>
          <div className="d-flex justify-content-end mb-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={fetchWebhooks}>
              <i className="bi bi-arrow-clockwise me-1" />รีเฟรช
            </button>
          </div>
          {loadingTab === 'webhooks' ? (
            <div className="text-center py-4"><span className="spinner-border" /></div>
          ) : (
            <div className="card">
              <div className="card-body p-0" style={{ overflowX: 'auto' }}>
                <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                  <thead className="table-light">
                    <tr><th>ID</th><th>Provider</th><th>Event ID</th><th>รับเมื่อ</th><th>ประมวลผลเมื่อ</th></tr>
                  </thead>
                  <tbody>
                    {(webhookData || []).map((w) => (
                      <tr key={w.id}>
                        <td className="text-secondary">{w.id}</td>
                        <td>{w.provider}</td>
                        <td className="font-monospace text-secondary">{w.event_id}</td>
                        <td>{formatDateTime(w.received_at)}</td>
                        <td>{w.processed_at ? formatDateTime(w.processed_at) : <span className="badge text-bg-warning">pending</span>}</td>
                      </tr>
                    ))}
                    {!(webhookData?.length) && !loadingTab && (
                      <tr><td colSpan={5} className="text-center text-secondary py-4">ไม่มี webhook log</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Queue Health ── */}
      {tab === 'queue' && (
        <div>
          <div className="d-flex justify-content-end mb-3">
            <button className="btn btn-outline-secondary btn-sm" onClick={fetchQueue}>
              <i className="bi bi-arrow-clockwise me-1" />รีเฟรช
            </button>
          </div>
          {loadingTab === 'queue' ? (
            <div className="text-center py-4"><span className="spinner-border" /></div>
          ) : queueData ? (
            <div className="row g-3">
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header"><strong>Redis</strong></div>
                  <div className="card-body">
                    <div className="d-flex justify-content-between mb-2">
                      <span>Configured</span>
                      <span className={`badge ${queueData.redis?.configured ? 'text-bg-success' : 'text-bg-secondary'}`}>
                        {queueData.redis?.configured ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Status</span>
                      <span className={`badge ${queueData.redis?.ok ? 'text-bg-success' : 'text-bg-danger'}`}>
                        {queueData.redis?.ok ? 'OK' : 'ERROR'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header"><strong>Worker</strong></div>
                  <div className="card-body">
                    <div className="d-flex justify-content-between mb-2">
                      <span>Enabled</span>
                      <span className={`badge ${queueData.worker?.enabled ? 'text-bg-success' : 'text-bg-secondary'}`}>
                        {queueData.worker?.enabled ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Tick (ms)</span>
                      <span className="badge text-bg-secondary">{queueData.worker?.tick_ms ?? '—'}</span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>SLA (sec)</span>
                      <span className="badge text-bg-secondary">{queueData.worker?.sla_seconds ?? '—'}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Last tick</span>
                      <small className="text-secondary">{queueData.worker?.last ? formatDateTime(queueData.worker.last) : '—'}</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-secondary py-4">คลิก "รีเฟรช" เพื่อโหลดข้อมูล</div>
          )}
        </div>
      )}
    </>
  )
}
