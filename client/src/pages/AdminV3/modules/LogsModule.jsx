import { useState } from 'react'
import { formatDateTime, getErrorMessage } from '../helpers.js'

export default function LogsModule({ data, ctx }) {
  const { logsQuery, setLogsQuery, canAction, loadModuleData, fetchJson } = ctx
  const [replayState, setReplayState] = useState({ status: 'idle', log: null, replay: [], error: '' })

  if (!data) return null

  const logs = data.logs || []

  function patch(obj) { setLogsQuery(prev => ({ ...prev, ...obj })) }

  async function replayLog(log) {
    try {
      setReplayState({ status: 'loading', log, replay: [], error: '' })
      const res = await fetchJson(`/api/admin/audit-logs/${log.id}`, { method: 'GET' })
      setReplayState({ status: 'ready', log: res?.log || log, replay: Array.isArray(res?.events) ? res.events : [], error: '' })
    } catch (err) {
      setReplayState({ status: 'error', log, replay: [], error: getErrorMessage(err) })
    }
  }

  return (
    <>
      <div className="card mb-3">
        <div className="card-body py-2">
          <div className="row g-2 align-items-center">
            <div className="col-md-3">
              <input className="form-control form-control-sm" placeholder="Action filter..." value={logsQuery.action} onChange={(e) => patch({ action: e.target.value })} />
            </div>
            <div className="col-md-3">
              <input className="form-control form-control-sm" placeholder="Entity type..." value={logsQuery.entity_type} onChange={(e) => patch({ entity_type: e.target.value })} />
            </div>
            <div className="col-md-2">
              <select className="form-select form-select-sm" value={logsQuery.limit} onChange={(e) => patch({ limit: Number(e.target.value) })}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="col-md-2">
              <button className="btn btn-outline-secondary btn-sm w-100" onClick={() => loadModuleData('logs')}>
                <i className="bi bi-arrow-clockwise me-1"></i>โหลดใหม่
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">บันทึกการใช้งาน ({logs.length})</h3></div>
        <div className="card-body p-0">
          <table className="table table-hover table-striped mb-0" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>เวลา</th><th>ผู้กระทำ</th><th>Action</th><th>Entity</th><th>รายละเอียด</th><th></th></tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td><small>{formatDateTime(log.created_at)}</small></td>
                  <td>{log.actor_display_name || log.actor_email || '-'}</td>
                  <td><span className="badge text-bg-secondary">{log.action}</span></td>
                  <td><small>{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</small></td>
                  <td>
                    {log.details && (
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 11 }}>ดูเพิ่มเติม</summary>
                        <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}</pre>
                      </details>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-outline-info btn-sm" style={{ padding: '0 4px', fontSize: 11 }} onClick={() => replayLog(log)} title="Replay">
                      <i className="bi bi-play"></i>
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} className="text-center text-secondary py-4">ไม่พบบันทึก</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {replayState.status !== 'idle' && (
        <div className="card mt-3">
          <div className="card-header d-flex justify-content-between">
            <h3 className="card-title">Replay: {replayState.log?.action} — {replayState.log?.entity_type}</h3>
            <button className="btn btn-tool" onClick={() => setReplayState({ status: 'idle', log: null, replay: [], error: '' })}><i className="bi bi-x-lg"></i></button>
          </div>
          <div className="card-body">
            {replayState.status === 'loading' && <div className="spinner-border spinner-border-sm"></div>}
            {replayState.status === 'error' && <div className="alert alert-danger py-1">{replayState.error}</div>}
            {replayState.status === 'ready' && (
              <>
                {replayState.replay.length > 0 && (
                  <div className="mb-3">
                    <div className="fw-bold mb-1" style={{ fontSize: 12 }}>Replay Events</div>
                    <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: '#f8f9fa', padding: 8, borderRadius: 4 }}>{JSON.stringify(replayState.replay, null, 2)}</pre>
                  </div>
                )}
                <div>
                  <div className="fw-bold mb-1" style={{ fontSize: 12 }}>ข้อมูลบันทึกดิบ (JSON)</div>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', background: '#f8f9fa', padding: 8, borderRadius: 4 }}>{JSON.stringify(replayState.log || {}, null, 2)}</pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
