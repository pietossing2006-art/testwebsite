import { formatNumber, formatMinutes, formatDateTime } from '../helpers.js'

function StatTile({ label, value, tone, detail, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`lgx-stat${onClick ? ' is-clickable' : ''}`}
      onClick={onClick}
    >
      <div className="l">{label}</div>
      <div className={`v${tone ? ` ${tone}` : ''}`}>{value}</div>
      {detail ? <div className="d">{detail}</div> : null}
    </Tag>
  )
}

function HealthRow({ label, value, tone, helper }) {
  return (
    <div className="lgx-row">
      <div>
        <div className="label">{label}</div>
        {helper ? <div className="helper">{helper}</div> : null}
      </div>
      <span className={`lgx-pill ${tone || 'neutral'}`}>{value}</span>
    </div>
  )
}

function severityTag(severity) {
  const key = String(severity || 'info').toLowerCase()
  if (key === 'critical' || key === 'high') return 'crit'
  if (key === 'medium') return 'warn'
  return 'info'
}

export default function DashboardModule({ data, ctx }) {
  if (!data) return null

  const supportRisk = Number(data.supportUnassigned || 0) + Number(data.supportOverSla || 0)
  const fulfillmentRisk = Number(data.farmUnassigned || 0) + Number(data.farmOverSla || 0)
  const notifications = Array.isArray(data.notifications) ? data.notifications : []

  return (
    <>
      <div className="lgx-strip">
        <StatTile
          label="ผู้ใช้ทั้งหมด"
          value={formatNumber(data.totalUsers)}
          detail="ดูรายการผู้ใช้"
          onClick={() => ctx.loadModuleData('users')}
        />
        <StatTile
          label="รายได้เดือนนี้"
          value={formatNumber(data.totalRevenuePoints)}
          detail="พอยท์จากยอดเติมสำเร็จ"
        />
        <StatTile
          label="Ticket เปิดอยู่"
          value={formatNumber(data.openTickets)}
          tone={supportRisk > 0 ? 'warn' : undefined}
          detail={supportRisk > 0 ? `${formatNumber(supportRisk)} รายการควรดูแลก่อน` : 'ไม่มีสัญญาณเสี่ยงเด่น'}
          onClick={() => ctx.loadModuleData('support')}
        />
        <StatTile
          label="งานบริการรอดำเนินการ"
          value={formatNumber(data.pendingFulfillment)}
          tone={fulfillmentRisk > 0 ? 'crit' : undefined}
          detail={fulfillmentRisk > 0 ? `${formatNumber(fulfillmentRisk)} รายการควรเร่งตาม` : 'คิวงานอยู่ในระดับปกติ'}
          onClick={() => ctx.loadModuleData('fulfillment')}
        />
      </div>

      <div className="lgx-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="lgx-panel">
            <div className="lgx-panel-head">
              <h2><i className="bi bi-headset" style={{ marginRight: 6 }} />ซัพพอร์ต</h2>
              <button type="button" className="lgx-btn" onClick={() => ctx.loadModuleData('support')}>เปิดโมดูล</button>
            </div>
            <div className="lgx-panel-body">
              <HealthRow label="รอดำเนินการ" value={formatNumber(data.supportPending)} tone="warn" />
              <HealthRow label="ยังไม่มีผู้รับผิดชอบ" value={formatNumber(data.supportUnassigned)} tone={data.supportUnassigned > 0 ? 'crit' : 'ok'} />
              <HealthRow label="เกิน SLA" value={formatNumber(data.supportOverSla)} tone={data.supportOverSla > 0 ? 'crit' : 'ok'} />
              <HealthRow label="ตอบกลับเฉลี่ย" value={formatMinutes(data.supportFirstResponseAvgMinutes)} helper="เวลาตอบกลับครั้งแรก" />
              <HealthRow label="ปิดเคสเฉลี่ย" value={formatMinutes(data.supportResolutionAvgMinutes)} helper="เวลาจนแก้ไขสำเร็จ" />
            </div>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-head">
              <h2><i className="bi bi-briefcase-fill" style={{ marginRight: 6 }} />งานบริการ</h2>
              <button type="button" className="lgx-btn" onClick={() => ctx.loadModuleData('fulfillment')}>เปิดโมดูล</button>
            </div>
            <div className="lgx-panel-body">
              <HealthRow label="กำลังดำเนินการ" value={formatNumber(data.farmInProgress)} tone="neutral" />
              <HealthRow label="ยังไม่มีผู้รับผิดชอบ" value={formatNumber(data.farmUnassigned)} tone={data.farmUnassigned > 0 ? 'crit' : 'ok'} />
              <HealthRow label="เกิน SLA" value={formatNumber(data.farmOverSla)} tone={data.farmOverSla > 0 ? 'crit' : 'ok'} />
              <HealthRow label="มอบหมายเฉลี่ย" value={formatMinutes(data.farmAssignAvgMinutes)} helper="เวลาจากเข้าคิวถึงมีผู้รับงาน" />
              <HealthRow label="เสร็จงานเฉลี่ย" value={formatMinutes(data.farmFulfillAvgMinutes)} helper="เวลาจากเริ่มงานถึงส่งมอบ" />
            </div>
          </div>
        </div>

        <div className="lgx-panel">
          <div className="lgx-panel-head">
            <h2>แจ้งเตือน</h2>
            <span>{formatNumber(notifications.length)} รายการ</span>
          </div>
          {notifications.length ? (
            <div className="lgx-alerts">
              {notifications.map((n, i) => (
                <div className="lgx-alert" key={`${n?.created_at || 'notice'}-${i}`}>
                  <span className={`tag ${severityTag(n?.severity)}`}>{String(n?.severity || 'info').toUpperCase()}</span>
                  <div>
                    <p>{n?.message || '-'}</p>
                    <span>{formatDateTime(n?.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="lgx-empty">
              <i className="bi bi-check-circle" style={{ display: 'block', fontSize: 20, marginBottom: 6, color: 'var(--lgx-ok)' }} />
              ยังไม่มีแจ้งเตือนสำคัญในช่วงนี้
            </div>
          )}
        </div>
      </div>

      {data.generatedAt ? (
        <div style={{ textAlign: 'right' }}>
          <span className="lgx-pill neutral">อัปเดต {formatDateTime(data.generatedAt)}</span>
        </div>
      ) : null}
    </>
  )
}
