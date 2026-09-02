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

function SessionRow({ s, index, total, showStaff }) {
  return (
    <tr className={s.clock_out ? undefined : 'st-ok'}>
      <td className="mono">{showStaff ? s.id : total - index}</td>
      {showStaff && (
        <>
          <td>
            <div style={{ fontWeight: 600 }}>{s.display_name || s.email}</div>
            {s.display_name ? <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{s.email}</div> : null}
          </td>
          <td><span className="lgx-pill neutral">{s.role}</span></td>
        </>
      )}
      <td className="mono">{formatDateTime(s.clock_in)}</td>
      <td className="mono">{s.clock_out ? formatDateTime(s.clock_out) : '-'}</td>
      <td style={{ fontWeight: 600 }}>{formatDuration(s.duration_seconds)}</td>
      <td>
        {s.auto_clock_out_at ? (
          <span className="lgx-pill warn" title={`ออกอัตโนมัติเวลา ${formatDateTime(s.auto_clock_out_at)}`}>อัตโนมัติ</span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>ออกเอง</span>
        )}
      </td>
      <td>{s.clock_out ? <span className="lgx-pill neutral">เสร็จสิ้น</span> : <span className="lgx-pill ok">กำลังทำงาน</span>}</td>
    </tr>
  )
}

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
          fetchJson('/api/staff/clock-sessions?limit=100').then((r) => { if (r?.items) setMySessions(r.items) }).catch(() => {})
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
    <>
      <div className="lgx-strip">
        <div className="lgx-stat">
          <div className="l">สถานะกะทำงาน</div>
          <div className={`v${clockedIn ? '' : ' warn'}`}>{clockedIn ? 'กำลังทำงาน' : 'ไม่ได้ลงเวลา'}</div>
          <div className="d">{clockedIn ? `เข้างานเมื่อ ${formatDateTime(clockIn)}` : 'กดลงเวลาเพื่อเริ่มกะ'}</div>
        </div>
        <div className="lgx-stat">
          <div className="l">เวลาสะสมวันนี้</div>
          <div className="v">{formatDuration(todayTotal)}</div>
          <div className="d">รวมทุกช่วงเวลาในวันนี้</div>
        </div>
        <div className="lgx-stat">
          <div className="l">บันทึกทั้งหมด</div>
          <div className="v">{mySessions.length}</div>
          <div className="d">รอบการลงเวลาที่ผ่านมา</div>
        </div>
      </div>

      <div className="lgx-panel">
        <div className="lgx-panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)' }}>สถานะปัจจุบัน</div>
            <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: clockedIn ? 'var(--lgx-ok)' : 'var(--lgx-text-muted)' }} />
              {clockedIn ? 'กำลังทำงาน' : 'ไม่ได้ลงเวลา'}
            </div>
            {clockedIn ? (
              <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)', marginTop: 4 }}>
                เข้างานตั้งแต่ {formatDateTime(clockIn)} — <strong style={{ color: 'var(--lgx-text)' }}>{formatDuration(elapsed)}</strong>
                {autoRemain != null && autoRemain > 0 && (
                  <span className="lgx-pill warn" style={{ marginLeft: 8 }}>ออกอัตโนมัติใน {formatDuration(autoRemain)}</span>
                )}
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!clockedIn && (
              <select
                className="lgx-select"
                style={{ width: 'auto', minWidth: 170 }}
                value={selectedDuration || ''}
                onChange={(e) => setSelectedDuration(e.target.value ? Number(e.target.value) : null)}
              >
                {DURATION_OPTIONS.map((opt, i) => (
                  <option key={i} value={opt.value || ''}>{opt.label}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              className={`lgx-btn${clockedIn ? '' : ' lgx-btn-ok'}`}
              onClick={clockedIn ? doClockOut : doClockIn}
              disabled={clockLoading}
            >
              <i className={`bi ${clockedIn ? 'bi-box-arrow-right' : 'bi-box-arrow-in-right'}`} />
              {clockLoading ? '...' : clockedIn ? 'ออกงาน' : 'เข้างาน'}
            </button>
          </div>
        </div>
      </div>

      <div className="lgx-panel">
        {isAdmin && (
          <div className="lgx-inline-tabs" style={{ padding: '0 18px' }}>
            <button type="button" className={`lgx-inline-tab${tab === 'my' ? ' is-active' : ''}`} onClick={() => setTab('my')}>ประวัติของฉัน</button>
            <button type="button" className={`lgx-inline-tab${tab === 'all' ? ' is-active' : ''}`} onClick={() => setTab('all')}>ประวัติทั้งหมด</button>
          </div>
        )}

        {tab === 'my' && (
          <table className="lgx-table">
            <thead><tr><th>#</th><th>เข้างาน</th><th>ออกงาน</th><th>ระยะเวลา</th><th>โหมด</th><th>สถานะ</th></tr></thead>
            <tbody>
              {mySessions.map((s, i) => (
                <SessionRow key={s.id} s={s} index={i} total={mySessions.length} showStaff={false} />
              ))}
              {mySessions.length === 0 && <tr><td colSpan={6} className="lgx-empty">ยังไม่มีประวัติการลงเวลา</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'all' && isAdmin && (
          <table className="lgx-table">
            <thead><tr><th>#</th><th>สตาฟ</th><th>ยศ</th><th>เข้างาน</th><th>ออกงาน</th><th>ระยะเวลา</th><th>โหมด</th><th>สถานะ</th></tr></thead>
            <tbody>
              {(allSessions || []).map((s) => (
                <SessionRow key={s.id} s={s} showStaff />
              ))}
              {(!allSessions || allSessions.length === 0) && <tr><td colSpan={8} className="lgx-empty">ยังไม่มีประวัติ</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
