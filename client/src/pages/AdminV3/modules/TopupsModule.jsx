import { useState } from 'react'
import { formatDateTime, formatNumber, formatRelativeTime, getErrorMessage } from '../helpers.js'

const STATUS_MAP = {
  pending_review: { label: 'รอตรวจสลิป', tone: 'warn' },
  pending_slip: { label: 'รอลูกค้าแนบสลิป', tone: 'neutral' },
  pending_payment: { label: 'รอชำระเงิน', tone: 'neutral' },
  paid: { label: 'เติมแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
  canceled: { label: 'ยกเลิก', tone: 'neutral' },
}

function StatusPill({ status }) {
  const meta = STATUS_MAP[String(status || '').toLowerCase()] || { label: status || '-', tone: 'neutral' }
  return <span className={`lgx-pill ${meta.tone === 'neutral' ? '' : meta.tone}`}>{meta.label}</span>
}

function customerLabel(row) {
  return row?.display_name || row?.username || row?.email || `user #${row?.user_id ?? '-'}`
}

export default function TopupsModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson, resolveApiUrl } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [busyId, setBusyId] = useState(null)
  const [zoomed, setZoomed] = useState('')

  const pending = Array.isArray(data?.pending) ? data.pending : []
  const recent = Array.isArray(data?.recent) ? data.recent : []
  const canManage = canAction('topups.manage')

  async function runAction(topup, kind) {
    if (!canManage || busyId) return
    const points = Number(topup?.amount_points ?? topup?.amount ?? 0)
    const question = kind === 'approve'
      ? `ยืนยันเติม ${formatNumber(points)} พ้อยท์ ให้ ${customerLabel(topup)} ?\n\nกรุณาตรวจสอบก่อนว่าเงินเข้าบัญชีร้านจริงแล้ว`
      : `ปฏิเสธรายการ #${topup.id} ของ ${customerLabel(topup)} ?`
    if (!window.confirm(question)) return

    setBusyId(topup.id)
    setActionState({ status: 'idle', message: '' })
    try {
      await fetchJson(`/api/admin/topups/${topup.id}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setActionState({
        status: 'ok',
        message: kind === 'approve' ? `เติมพ้อยท์รายการ #${topup.id} เรียบร้อย` : `ปฏิเสธรายการ #${topup.id} แล้ว`,
      })
      await loadModuleData('topups')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err, 'ดำเนินการไม่สำเร็จ') })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="lgx-panel">
        <div className="lgx-panel-head">
          <div>
            <div style={{ fontWeight: 800 }}>
              <i className="bi bi-receipt-cutoff" style={{ marginRight: 6 }} />
              สลิปรอตรวจสอบ
              {pending.length ? <span className="lgx-pill warn" style={{ marginLeft: 8 }}>{pending.length}</span> : null}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--lgx-text-muted)', marginTop: 2 }}>
              เทียบยอดและเวลาในสลิปกับรายการเงินเข้าในแอปธนาคารของร้านก่อนกดอนุมัติทุกครั้ง
            </div>
          </div>
          <button type="button" className="lgx-btn" onClick={() => loadModuleData('topups')}>
            <i className="bi bi-arrow-clockwise" style={{ marginRight: 6 }} />รีเฟรช
          </button>
        </div>

        <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {actionState.message ? (
            <div
              className="lgx-panel"
              style={{ borderColor: actionState.status === 'error' ? 'var(--lgx-crit)' : 'var(--lgx-ok)' }}
            >
              <div className="lgx-panel-body" style={{ fontSize: 12.5, fontWeight: 700 }}>{actionState.message}</div>
            </div>
          ) : null}

          {!pending.length ? (
            <div className="lgx-empty">ไม่มีสลิปค้างตรวจสอบ</div>
          ) : (
            pending.map((row) => {
              const slipUrl = row.slip_image_url ? resolveApiUrl(row.slip_image_url) : ''
              const points = Number(row.amount_points ?? row.amount ?? 0)
              const slipAmount = row.slip_amount == null ? null : Number(row.slip_amount)
              const amountMismatch = slipAmount != null && Math.round(slipAmount * 100) !== Math.round(points * 100)

              return (
                <div key={row.id} className="lgx-panel" style={{ margin: 0 }}>
                  <div className="lgx-panel-body" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {slipUrl ? (
                      <button
                        type="button"
                        onClick={() => setZoomed(slipUrl)}
                        style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }}
                        title="คลิกเพื่อดูเต็มรูป"
                      >
                        <img
                          src={slipUrl}
                          alt={`สลิปรายการ #${row.id}`}
                          style={{ width: 150, borderRadius: 10, display: 'block', border: '1px solid var(--lgx-border)' }}
                        />
                      </button>
                    ) : (
                      <div
                        className="lgx-empty"
                        style={{ width: 150, display: 'grid', placeItems: 'center', fontSize: 12 }}
                      >
                        ไม่มีรูปสลิป
                      </div>
                    )}

                    <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800 }}>#{row.id}</span>
                        <StatusPill status={row.status} />
                        <span style={{ fontSize: 12.5, color: 'var(--lgx-text-muted)' }}>
                          {formatDateTime(row.created_at)} ({formatRelativeTime(row.created_at)})
                        </span>
                      </div>

                      <div style={{ fontSize: 13 }}>
                        <div><b>ลูกค้า:</b> {customerLabel(row)} <span style={{ color: 'var(--lgx-text-muted)' }}>({row.email})</span></div>
                        <div><b>ยอดที่ขอเติม:</b> {formatNumber(points)} พ้อยท์</div>
                        <div>
                          <b>ยอดที่อ่านได้จากสลิป:</b>{' '}
                          {slipAmount == null ? '—' : formatNumber(slipAmount)}
                          {amountMismatch ? <span className="lgx-pill crit" style={{ marginLeft: 6 }}>ยอดไม่ตรง</span> : null}
                        </div>
                        <div style={{ wordBreak: 'break-all' }}><b>เลขอ้างอิงในสลิป:</b> {row.provider_ref || '—'}</div>
                      </div>

                      {canManage ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="lgx-btn lgx-btn-accent"
                            disabled={busyId === row.id}
                            onClick={() => runAction(row, 'approve')}
                          >
                            <i className="bi bi-check2-circle" style={{ marginRight: 6 }} />
                            {busyId === row.id ? 'กำลังทำรายการ...' : 'เงินเข้าจริง อนุมัติ'}
                          </button>
                          <button
                            type="button"
                            className="lgx-btn"
                            disabled={busyId === row.id}
                            onClick={() => runAction(row, 'reject')}
                          >
                            <i className="bi bi-x-circle" style={{ marginRight: 6 }} />ปฏิเสธ
                          </button>
                          <a className="lgx-btn" href={`/admin-v3?module=users&q=${encodeURIComponent(row.email || '')}`}>
                            <i className="bi bi-person" style={{ marginRight: 6 }} />ดูผู้ใช้
                          </a>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5, color: 'var(--lgx-text-muted)' }}>บัญชีของคุณไม่มีสิทธิ์อนุมัติรายการเติมเงิน</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="lgx-panel">
        <div className="lgx-panel-head">
          <div style={{ fontWeight: 800 }}>รายการเติมเงินล่าสุด</div>
        </div>
        <div className="lgx-panel-body" style={{ overflowX: 'auto' }}>
          <table className="lgx-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ลูกค้า</th>
                <th>ช่องทาง</th>
                <th>พ้อยท์</th>
                <th>สถานะ</th>
                <th>เวลา</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{customerLabel(row)}</td>
                  <td>{row.method || '-'}</td>
                  <td>{formatNumber(Number(row.amount_points ?? row.amount ?? 0))}</td>
                  <td><StatusPill status={row.status} /></td>
                  <td>{formatDateTime(row.created_at)}</td>
                </tr>
              ))}
              {!recent.length ? <tr><td colSpan={6} className="lgx-empty">ยังไม่มีรายการ</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {zoomed ? (
        <div
          role="presentation"
          onClick={() => setZoomed('')}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2,6,23,0.82)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 999,
            cursor: 'zoom-out',
            padding: 24,
          }}
        >
          <img src={zoomed} alt="สลิปขยาย" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} />
        </div>
      ) : null}
    </div>
  )
}
