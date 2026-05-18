import { useState, useEffect } from 'react'
import { fetchJson } from '../../../api.js'
import { formatDateTime } from '../helpers.js'

function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} นาที`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 24) return `${h} ชม. ${rm > 0 ? `${rm} น.` : ''}`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return `${d} วัน ${rh > 0 ? `${rh} ชม.` : ''}`
}

function sumDurationToday(sessions) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  let total = 0
  for (const s of sessions) {
    const ci = new Date(s.clock_in).getTime()
    if (ci < todayStart) continue
    total += Math.max(0, Number(s.duration_seconds) || 0)
  }
  return total
}

const DURATION_OPTIONS = [
  { label: 'ไม่กำหนด (ออกเอง)', value: null },
  { label: '1 ชั่วโมง', value: 60 },
  { label: '2 ชั่วโมง', value: 120 },
  { label: '3 ชั่วโมง', value: 180 },
  { label: '4 ชั่วโมง', value: 240 },
  { label: '5 ชั่วโมง', value: 300 },
  { label: '6 ชั่วโมง', value: 360 },
  { label: '8 ชั่วโมง', value: 480 },
  { label: '10 ชั่วโมง', value: 600 },
  { label: '12 ชั่วโมง', value: 720 },
]

export default function TimesheetModule({ data, ctx }) {
  const [tab, setTab] = useState('my')
  const [clockedIn, setClockedIn] = useState(data?.clockedIn || false)
  const [clockIn, setClockIn] = useState(data?.clockIn || null)
  const [autoClockOutAt, setAutoClockOutAt] = useState(data?.autoClockOutAt || null)
  const [clockLoading, setClockLoading] = useState(false)
  const [selectedDuration, setSelectedDuration] = useState(null)
  const [mySessions, setMySessions] = useState(data?.mySessions || [])
  const [allSessions] = useState(data?.allSessions || null)

  const isAdmin = ctx?.role === 'admin' || ctx?.role === 'owner'

  async function doClockIn() {
    if (clockLoading) return
    setClockLoading(true)
    try {
      const body = selectedDuration ? { duration_minutes: selectedDuration } : {}
      const r = await fetchJson('/api/staff/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setClockedIn(true)
      setClockIn(r?.clock_in || new Date().toISOString())
      setAutoClockOutAt(r?.auto_clock_out_at || null)
    } catch {}
    setClockLoading(false)
  }

  async function doClockOut() {
    if (clockLoading) return
    setClockLoading(true)
    try {
      await fetchJson('/api/staff/clock-out', { method: 'POST' })
      setClockedIn(false)
      setClockIn(null)
      setAutoClockOutAt(null)
      const updated = await fetchJson('/api/staff/clock-sessions?limit=100')
      if (updated?.items) setMySessions(updated.items)
    } catch {}
    setClockLoading(false)
  }

  // live timer + auto countdown
  const [elapsed, setElapsed] = useState(0)
  const [autoRemain, setAutoRemain] = useState(null)
  useEffect(() => {
    if (!clockedIn || !clockIn) { setElapsed(0); setAutoRemain(null); return }
    const calc = () => {
      setElapsed(Math.floor((Date.now() - new Date(clockIn).getTime()) / 1000))
      if (autoClockOutAt) {
        const diff = Math.max(0, Math.floor((new Date(autoClockOutAt).getTime() - Date.now()) / 1000))
        setAutoRemain(diff)
        if (diff <= 0) {
          setClockedIn(false)
          setClockIn(null)
          setAutoClockOutAt(null)
          fetchJson('/api/staff/clock-sessions?limit=100').then(r => { if (r?.items) setMySessions(r.items) }).catch(() => {})
        }
      } else {
        setAutoRemain(null)
      }
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [clockedIn, clockIn, autoClockOutAt])

  const todayTotal = sumDurationToday(mySessions) + (clockedIn ? elapsed : 0)

  return (
    <div>
      <h5 className="mb-3"><i className="bi bi-clock-history me-2"></i>ลงเวลางาน</h5>

      {/* Clock status card */}
      <div className="row mb-4">
        <div className="col-md-6">
          <div className={`card border-0 shadow-sm ${clockedIn ? 'border-start border-success border-4' : ''}`}>
            <div className="card-body d-flex align-items-center justify-content-between">
              <div>
                <div className="text-secondary" style={{ fontSize: '0.8rem' }}>สถานะปัจจุบัน</div>
                <div className="fw-bold fs-5">
                  {clockedIn ? (
                    <span className="text-success"><i className="bi bi-circle-fill me-2" style={{ fontSize: '0.6rem' }}></i>กำลังทำงาน</span>
                  ) : (
                    <span className="text-secondary"><i className="bi bi-circle me-2" style={{ fontSize: '0.6rem' }}></i>ไม่ได้ลงเวลา</span>
                  )}
                </div>
                {clockedIn && (
                  <div className="text-secondary mt-1" style={{ fontSize: '0.85rem' }}>
                    เข้างานตั้งแต่ {formatDateTime(clockIn)} — <strong>{formatDuration(elapsed)}</strong>
                    {autoRemain != null && autoRemain > 0 && (
                      <span className="ms-2 badge bg-info text-dark">ออกอัตโนมัติใน {formatDuration(autoRemain)}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="d-flex align-items-center gap-2">
                {!clockedIn && (
                  <select
                    className="form-select form-select-sm"
                    style={{ width: 'auto', minWidth: 150 }}
                    value={selectedDuration || ''}
                    onChange={e => setSelectedDuration(e.target.value ? Number(e.target.value) : null)}
                  >
                    {DURATION_OPTIONS.map((opt, i) => (
                      <option key={i} value={opt.value || ''}>{opt.label}</option>
                    ))}
                  </select>
                )}
                <button
                  className={`btn ${clockedIn ? 'btn-outline-danger' : 'btn-success'} px-4`}
                  onClick={clockedIn ? doClockOut : doClockIn}
                  disabled={clockLoading}
                >
                  {clockLoading ? (
                    <span className="spinner-border spinner-border-sm me-1"></span>
                  ) : (
                    <i className={`bi ${clockedIn ? 'bi-box-arrow-right' : 'bi-box-arrow-in-right'} me-1`}></i>
                  )}
                  {clockedIn ? 'ออกงาน' : 'เข้างาน'}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="text-secondary" style={{ fontSize: '0.8rem' }}>ชั่วโมงวันนี้</div>
              <div className="fw-bold fs-4 text-primary">{formatDuration(todayTotal)}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="text-secondary" style={{ fontSize: '0.8rem' }}>รวมทั้งหมด</div>
              <div className="fw-bold fs-4">{mySessions.length} ครั้ง</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      {isAdmin && (
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button className={`nav-link ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>ประวัติของฉัน</button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>ประวัติทั้งหมด</button>
          </li>
        </ul>
      )}

      {/* My sessions */}
      {tab === 'my' && (
        <div className="table-responsive">
          <table className="table table-hover table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th>#</th>
                <th>เข้างาน</th>
                <th>ออกงาน</th>
                <th>ระยะเวลา</th>
                <th>โหมด</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {mySessions.map((s, i) => (
                <tr key={s.id}>
                  <td className="text-secondary">{mySessions.length - i}</td>
                  <td>{formatDateTime(s.clock_in)}</td>
                  <td>{s.clock_out ? formatDateTime(s.clock_out) : '-'}</td>
                  <td><strong>{formatDuration(s.duration_seconds)}</strong></td>
                  <td>
                    {s.auto_clock_out_at ? (
                      <span className="badge bg-info text-dark" title={`ออกอัตโนมัติเวลา ${formatDateTime(s.auto_clock_out_at)}`}>⭐ อัตโนมัติ</span>
                    ) : (
                      <span className="text-secondary" style={{ fontSize: '0.8rem' }}>ออกเอง</span>
                    )}
                  </td>
                  <td>
                    {s.clock_out ? (
                      <span className="badge bg-secondary">เสร็จสิ้น</span>
                    ) : (
                      <span className="badge bg-success">กำลังทำงาน</span>
                    )}
                  </td>
                </tr>
              ))}
              {mySessions.length === 0 && (
                <tr><td colSpan={6} className="text-center text-secondary py-4">ยังไม่มีประวัติการลงเวลา</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* All sessions (admin/owner) */}
      {tab === 'all' && isAdmin && (
        <div className="table-responsive">
          <table className="table table-hover table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th>#</th>
                <th>สตาฟ</th>
                <th>ยศ</th>
                <th>เข้างาน</th>
                <th>ออกงาน</th>
                <th>ระยะเวลา</th>
                <th>โหมด</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {(allSessions || []).map((s) => (
                <tr key={s.id}>
                  <td className="text-secondary">{s.id}</td>
                  <td>
                    <div className="fw-semibold" style={{ fontSize: '0.85rem' }}>{s.display_name || s.email}</div>
                    {s.display_name && <small className="text-secondary">{s.email}</small>}
                  </td>
                  <td><span className="badge bg-info text-dark">{s.role}</span></td>
                  <td>{formatDateTime(s.clock_in)}</td>
                  <td>{s.clock_out ? formatDateTime(s.clock_out) : '-'}</td>
                  <td><strong>{formatDuration(s.duration_seconds)}</strong></td>
                  <td>
                    {s.auto_clock_out_at ? (
                      <span className="badge bg-info text-dark">⭐ อัตโนมัติ</span>
                    ) : (
                      <span className="text-secondary" style={{ fontSize: '0.8rem' }}>ออกเอง</span>
                    )}
                  </td>
                  <td>
                    {s.clock_out ? (
                      <span className="badge bg-secondary">เสร็จสิ้น</span>
                    ) : (
                      <span className="badge bg-success">กำลังทำงาน</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!allSessions || allSessions.length === 0) && (
                <tr><td colSpan={8} className="text-center text-secondary py-4">ยังไม่มีประวัติ</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
