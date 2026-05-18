import { formatNumber, formatMinutes, formatDateTime } from '../helpers.js'

function KpiCard({ label, value, detail, icon, tone = 'primary', onClick }) {
  const buttonProps = onClick
    ? { onClick }
    : {}

  return (
    <div className="col-12 col-sm-6 col-xl-3">
      <div
        className={`card h-100 border-0 shadow-sm dashboard-kpi dashboard-kpi-${tone}`}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!onClick) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        {...buttonProps}
      >
        <div className="card-body">
          <div className="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div className="text-secondary small fw-bold text-uppercase">{label}</div>
              <div className="display-6 fw-black lh-1 mt-2">{value}</div>
            </div>
            <div className={`dashboard-kpi-icon text-bg-${tone}`}>
              <i className={`bi ${icon}`} />
            </div>
          </div>
          {detail ? <div className="small text-secondary mt-3">{detail}</div> : null}
        </div>
      </div>
    </div>
  )
}

function HealthRow({ label, value, tone = 'secondary', helper }) {
  return (
    <div className="d-flex align-items-center justify-content-between gap-3 py-2 border-bottom">
      <div className="min-w-0">
        <div className="fw-semibold">{label}</div>
        {helper ? <div className="small text-secondary">{helper}</div> : null}
      </div>
      <span className={`badge text-bg-${tone}`}>{value}</span>
    </div>
  )
}

function SeverityBadge({ severity }) {
  const key = String(severity || 'info').toLowerCase()
  const tone = key === 'critical' || key === 'high' ? 'danger' : key === 'medium' ? 'warning' : 'info'
  return <span className={`badge text-bg-${tone}`}>{key}</span>
}

export default function DashboardModule({ data, ctx }) {
  if (!data) return null

  const supportRisk = Number(data.supportUnassigned || 0) + Number(data.supportOverSla || 0)
  const fulfillmentRisk = Number(data.farmUnassigned || 0) + Number(data.farmOverSla || 0)
  const hasNotifications = Array.isArray(data.notifications) && data.notifications.length > 0

  return (
    <div className="dashboard-module">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="fw-bold mb-1">ภาพรวมวันนี้</h4>
          <div className="text-secondary small">สถานะงานที่ต้องดูแล รายได้ และสัญญาณเตือนจากระบบ</div>
        </div>
        {data.generatedAt ? (
          <span className="badge rounded-pill text-bg-light border">
            อัปเดต {formatDateTime(data.generatedAt)}
          </span>
        ) : null}
      </div>

      <div className="row g-3 mb-4">
        <KpiCard
          label="ผู้ใช้ทั้งหมด"
          value={formatNumber(data.totalUsers)}
          detail="กดเพื่อรีโหลดรายการผู้ใช้"
          icon="bi-people-fill"
          tone="primary"
          onClick={() => ctx.loadModuleData('users')}
        />
        <KpiCard
          label="รายได้เดือนนี้"
          value={formatNumber(data.totalRevenuePoints)}
          detail="หน่วยเป็นพอยท์จากยอดเติมที่สำเร็จ"
          icon="bi-coin"
          tone="success"
        />
        <KpiCard
          label="Ticket เปิดอยู่"
          value={formatNumber(data.openTickets)}
          detail={supportRisk > 0 ? `${formatNumber(supportRisk)} รายการควรดูแลก่อน` : 'ไม่มีสัญญาณเสี่ยงเด่น'}
          icon="bi-chat-dots-fill"
          tone={supportRisk > 0 ? 'warning' : 'info'}
          onClick={() => ctx.loadModuleData('support')}
        />
        <KpiCard
          label="งานบริการรอดำเนินการ"
          value={formatNumber(data.pendingFulfillment)}
          detail={fulfillmentRisk > 0 ? `${formatNumber(fulfillmentRisk)} รายการควรเร่งตาม` : 'คิวงานอยู่ในระดับปกติ'}
          icon="bi-truck"
          tone={fulfillmentRisk > 0 ? 'danger' : 'secondary'}
          onClick={() => ctx.loadModuleData('fulfillment')}
        />
      </div>

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header d-flex align-items-center justify-content-between">
              <strong><i className="bi bi-headset me-2" />ซัพพอร์ต</strong>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => ctx.loadModuleData('support')}>เปิดโมดูล</button>
            </div>
            <div className="card-body">
              <HealthRow label="รอดำเนินการ" value={formatNumber(data.supportPending)} tone="warning" />
              <HealthRow label="ยังไม่มีผู้รับผิดชอบ" value={formatNumber(data.supportUnassigned)} tone={data.supportUnassigned > 0 ? 'danger' : 'success'} />
              <HealthRow label="เกิน SLA" value={formatNumber(data.supportOverSla)} tone={data.supportOverSla > 0 ? 'danger' : 'success'} />
              <HealthRow label="ตอบกลับเฉลี่ย" value={formatMinutes(data.supportFirstResponseAvgMinutes)} helper="เวลาตอบกลับครั้งแรก" />
              <HealthRow label="ปิดเคสเฉลี่ย" value={formatMinutes(data.supportResolutionAvgMinutes)} helper="เวลาจนแก้ไขสำเร็จ" />
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header d-flex align-items-center justify-content-between">
              <strong><i className="bi bi-briefcase-fill me-2" />งานบริการ</strong>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => ctx.loadModuleData('fulfillment')}>เปิดโมดูล</button>
            </div>
            <div className="card-body">
              <HealthRow label="กำลังดำเนินการ" value={formatNumber(data.farmInProgress)} tone="info" />
              <HealthRow label="ยังไม่มีผู้รับผิดชอบ" value={formatNumber(data.farmUnassigned)} tone={data.farmUnassigned > 0 ? 'danger' : 'success'} />
              <HealthRow label="เกิน SLA" value={formatNumber(data.farmOverSla)} tone={data.farmOverSla > 0 ? 'danger' : 'success'} />
              <HealthRow label="มอบหมายเฉลี่ย" value={formatMinutes(data.farmAssignAvgMinutes)} helper="เวลาจากเข้าคิวถึงมีผู้รับงาน" />
              <HealthRow label="เสร็จงานเฉลี่ย" value={formatMinutes(data.farmFulfillAvgMinutes)} helper="เวลาจากเริ่มงานถึงส่งมอบ" />
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between">
              <strong><i className="bi bi-bell-fill me-2" />การแจ้งเตือนล่าสุด</strong>
              <span className="badge text-bg-light border">{formatNumber(data.notifications?.length || 0)} รายการ</span>
            </div>
            <div className="card-body p-0">
              {hasNotifications ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th style={{ width: 120 }}>ระดับ</th>
                        <th>ข้อความ</th>
                        <th style={{ width: 180 }}>เวลา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.notifications.map((n, i) => (
                        <tr key={`${n?.created_at || 'notice'}-${i}`}>
                          <td><SeverityBadge severity={n?.severity} /></td>
                          <td>{n?.message || '-'}</td>
                          <td className="text-secondary small">{formatDateTime(n?.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-center text-secondary">
                  <i className="bi bi-check-circle fs-3 text-success d-block mb-2" />
                  ยังไม่มีแจ้งเตือนสำคัญในช่วงนี้
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
