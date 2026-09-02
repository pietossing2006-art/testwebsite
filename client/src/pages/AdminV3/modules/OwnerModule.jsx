import { useState } from 'react'
import { formatNumber, formatDateTime, getErrorMessage } from '../helpers.js'
import LogsModule from './LogsModule.jsx'

const TABS = [
  { id: 'overview', label: 'ภาพรวม', icon: 'bi-speedometer2' },
  { id: 'audit', label: 'Audit Log', icon: 'bi-journal-text' },
  { id: 'webhooks', label: 'Webhook Logs', icon: 'bi-broadcast' },
  { id: 'queue', label: 'Queue Health', icon: 'bi-cpu' },
]

export default function OwnerModule({ data, ctx }) {
  const { fetchJson, loadModuleData } = ctx
  const [tab, setTab] = useState('overview')
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })

  const [auditQuery, setAuditQuery] = useState({ search: '', action: '', category: 'all', severity: 'all', status: 'all', limit: 50, page: 1 })
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
      const qs = new URLSearchParams({ limit: String(query.limit || 50), page: String(query.page || 1) })
      if (query.search?.trim()) qs.set('search', query.search.trim())
      if (query.action?.trim()) qs.set('action', query.action.trim())
      if (query.category?.trim() && query.category !== 'all') qs.set('category', query.category.trim())
      if (query.severity?.trim() && query.severity !== 'all') qs.set('severity', query.severity.trim())
      if (query.status?.trim() && query.status !== 'all') qs.set('status', query.status.trim())
      if (query.actorUserId?.trim()) qs.set('actor_user_id', query.actorUserId.trim())
      if (query.dateFrom?.trim()) qs.set('date_from', query.dateFrom.trim())
      if (query.dateTo?.trim()) qs.set('date_to', query.dateTo.trim())

      const [auditRes, statsRes] = await Promise.allSettled([
        fetchJson(`/api/admin/audit-logs?${qs.toString()}`),
        fetchJson('/api/admin/audit-logs/stats'),
      ])
      const d = auditRes.status === 'fulfilled' ? auditRes.value : {}
      const s = statsRes.status === 'fulfilled' ? statsRes.value?.stats : null
      setAuditData({
        logs: Array.isArray(d?.logs) ? d.logs : [], total: d?.total || 0, page: d?.page || 1,
        limit: d?.limit || query.limit || 50, totalPages: d?.totalPages || 1, summary: d?.summary || null, stats: s,
      })
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
    setLoadingTab(null)
  }

  async function fetchWebhooks() {
    setLoadingTab('webhooks')
    try {
      const d = await fetchJson('/api/admin/webhooks?limit=100')
      setWebhookData(Array.isArray(d?.webhooks) ? d.webhooks : [])
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
    setLoadingTab(null)
  }

  async function fetchQueue() {
    setLoadingTab('queue')
    try {
      const d = await fetchJson('/api/admin/queue-health')
      setQueueData(d)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
    setLoadingTab(null)
  }

  const bannerTone = actionState.status === 'error' ? 'crit' : 'info'

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`lgx-banner ${bannerTone}`}>
          <span>{actionState.message}</span>
          <button type="button" className="lgx-banner-close" onClick={() => setActionState({ status: 'idle', message: '' })}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span className="lgx-pill crit"><i className="bi bi-shield-fill-check" style={{ marginRight: 4 }} />Owner Access Only</span>
      </div>

      <div className="lgx-panel">
        <div className="lgx-inline-tabs" style={{ padding: '0 18px' }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`lgx-inline-tab${tab === t.id ? ' is-active' : ''}`} onClick={() => switchTab(t.id)}>
              <i className={`bi ${t.icon}`} style={{ marginRight: 5 }} />{t.label}{loadingTab === t.id ? ' …' : ''}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="lgx-panel-body">
            <div className="lgx-strip" style={{ marginBottom: 16 }}>
              <div className="lgx-stat"><div className="l">ผู้ใช้ทั้งหมด</div><div className="v">{formatNumber(stats.total_users ?? 0)}</div><div className="d">สมาชิกทั้งหมดในระบบ</div></div>
              <div className="lgx-stat"><div className="l">แต้มในระบบ</div><div className="v">{formatNumber(stats.total_balance ?? 0)}</div><div className="d">พอยท์หมุนเวียนคงเหลือ</div></div>
              <div className="lgx-stat"><div className="l">ออเดอร์ทั้งหมด</div><div className="v">{formatNumber(stats.total_orders ?? 0)}</div><div className="d">คำสั่งซื้อที่เกิดขึ้น</div></div>
              <div className="lgx-stat"><div className="l">รายได้รวมทั้งหมด</div><div className="v">{formatNumber(stats.total_revenue ?? 0)}</div><div className="d">ยอดเติมเงินรวมสะสม</div></div>
            </div>

            {stats.by_role && (
              <div className="lgx-panel" style={{ marginBottom: 16 }}>
                <div className="lgx-panel-head"><h2>สัดส่วนตาม Role</h2></div>
                <div className="lgx-panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
                  {Object.entries(stats.by_role).map(([role, count]) => (
                    <div key={role} style={{ textAlign: 'center', border: '1.5px solid var(--lgx-border)', borderRadius: 'var(--lgx-radius)', padding: 10 }}>
                      <div className="mono" style={{ fontWeight: 700, fontSize: 16 }}>{formatNumber(count)}</div>
                      <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{role}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topAdmins.length > 0 && (
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>Admin ที่มีกิจกรรมล่าสุด</h2></div>
                <table className="lgx-table">
                  <thead><tr><th>Admin</th><th>Role</th><th>Actions (audit)</th><th>ล่าสุด</th></tr></thead>
                  <tbody>
                    {topAdmins.map((a, i) => (
                      <tr key={i}>
                        <td><div style={{ fontWeight: 700 }}>{a.username || a.email}</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{a.email}</div></td>
                        <td><span className="lgx-pill neutral">{a.role}</span></td>
                        <td className="mono">{formatNumber(a.audit_count)}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(a.last_action_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <button type="button" className="lgx-btn" onClick={() => loadModuleData('owner')}><i className="bi bi-arrow-clockwise" />รีเฟรช</button>
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="lgx-panel-body">
            {loadingTab === 'audit' && !auditData ? (
              <div className="lgx-empty">กำลังโหลดบันทึกระบบ...</div>
            ) : (
              <LogsModule
                data={auditData || { logs: [], total: 0, summary: null, stats: null }}
                ctx={{
                  ...ctx,
                  logsQuery: auditQuery,
                  setLogsQuery: (updater) => {
                    const next = typeof updater === 'function' ? updater(auditQuery) : updater
                    setAuditQuery(next)
                    fetchAudit(next)
                  },
                  loadModuleData: () => fetchAudit(auditQuery),
                }}
              />
            )}
          </div>
        )}

        {tab === 'webhooks' && (
          <div className="lgx-panel-body">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button type="button" className="lgx-btn" onClick={fetchWebhooks}><i className="bi bi-arrow-clockwise" />รีเฟรช</button>
            </div>
            {loadingTab === 'webhooks' ? <div className="lgx-empty">กำลังโหลด...</div> : (
              <table className="lgx-table">
                <thead><tr><th>ID</th><th>Provider</th><th>Event ID</th><th>รับเมื่อ</th><th>ประมวลผลเมื่อ</th></tr></thead>
                <tbody>
                  {(webhookData || []).map((w) => (
                    <tr key={w.id}>
                      <td className="mono" style={{ color: 'var(--lgx-text-muted)' }}>{w.id}</td>
                      <td>{w.provider}</td>
                      <td className="mono" style={{ color: 'var(--lgx-text-muted)' }}>{w.event_id}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(w.received_at)}</td>
                      <td>{w.processed_at ? <span className="mono" style={{ fontSize: 11 }}>{formatDateTime(w.processed_at)}</span> : <span className="lgx-pill warn">pending</span>}</td>
                    </tr>
                  ))}
                  {!(webhookData?.length) && !loadingTab && <tr><td colSpan={5} className="lgx-empty">ไม่มี webhook log</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'queue' && (
          <div className="lgx-panel-body">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button type="button" className="lgx-btn" onClick={fetchQueue}><i className="bi bi-arrow-clockwise" />รีเฟรช</button>
            </div>
            {loadingTab === 'queue' ? <div className="lgx-empty">กำลังโหลด...</div> : queueData ? (
              <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="lgx-panel">
                  <div className="lgx-panel-head"><h2>Redis</h2></div>
                  <div className="lgx-panel-body">
                    <div className="lgx-kv"><span className="k">Configured</span><span className="v"><span className={`lgx-pill ${queueData.redis?.configured ? 'ok' : 'neutral'}`}>{queueData.redis?.configured ? 'Yes' : 'No'}</span></span></div>
                    <div className="lgx-kv"><span className="k">Status</span><span className="v"><span className={`lgx-pill ${queueData.redis?.ok ? 'ok' : 'crit'}`}>{queueData.redis?.ok ? 'OK' : 'ERROR'}</span></span></div>
                  </div>
                </div>
                <div className="lgx-panel">
                  <div className="lgx-panel-head"><h2>Worker</h2></div>
                  <div className="lgx-panel-body">
                    <div className="lgx-kv"><span className="k">Enabled</span><span className="v"><span className={`lgx-pill ${queueData.worker?.enabled ? 'ok' : 'neutral'}`}>{queueData.worker?.enabled ? 'Running' : 'Stopped'}</span></span></div>
                    <div className="lgx-kv"><span className="k">Tick (ms)</span><span className="v mono">{queueData.worker?.tick_ms ?? '—'}</span></div>
                    <div className="lgx-kv"><span className="k">SLA (sec)</span><span className="v mono">{queueData.worker?.sla_seconds ?? '—'}</span></div>
                    <div className="lgx-kv"><span className="k">Last tick</span><span className="v mono" style={{ fontSize: 11 }}>{queueData.worker?.last ? formatDateTime(queueData.worker.last) : '—'}</span></div>
                  </div>
                </div>
              </div>
            ) : <div className="lgx-empty">คลิก &quot;รีเฟรช&quot; เพื่อโหลดข้อมูล</div>}
          </div>
        )}
      </div>
    </>
  )
}
