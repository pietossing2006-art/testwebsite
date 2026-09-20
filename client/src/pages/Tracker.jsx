import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { resolveApiUrl } from '../api.js'
import { connectTrackerSocket } from '../socket.js'
import './tracker.css'

const SOCKET_FALLBACK_INTERVAL = 30000
const API = '/api/tracker'
const PAGE_SIZE = 240
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Work+Sans:wght@400;500;600&display=swap'

// Behaviour switches mirrored from the design mockup.
const REQUIRE_ALL_CATEGORIES = false
const DEFAULT_CHECK_STATUS = 'ok' // 'ok' preselects "ปกติ", null leaves the checklist blank

const FALLBACK_CATEGORIES = [
  { key: 'structure', label: 'โครงสร้าง / พื้น-ผนัง-ฝ้าเพดาน' },
  { key: 'doors', label: 'ประตู-หน้าต่าง' },
  { key: 'electric', label: 'ระบบไฟฟ้า-แสงสว่าง' },
  { key: 'plumbing', label: 'ระบบประปา-สุขาภิบาล' },
  { key: 'ac', label: 'เครื่องปรับอากาศ' },
  { key: 'fixtures', label: 'เฟอร์นิเจอร์บิลท์อิน/สุขภัณฑ์' },
]

const UNIT_STATUS = {
  pending: { label: 'รอตรวจ', cls: '' },
  ok: { label: 'ตรวจแล้ว ปกติ', cls: 'is-ok' },
  issue: { label: 'พบปัญหา', cls: 'is-issue' },
  skipped: { label: 'ข้าม', cls: 'is-skipped' },
}

const ISSUE_STATUS = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังซ่อม',
  done: 'เสร็จแล้ว',
}
const ISSUE_ORDER = ['pending', 'in_progress', 'done']

function getRoomIdFromPath() {
  if (typeof window === 'undefined') return ''
  const match = window.location.pathname.match(/^\/tracker\/rooms\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

async function trackerFetch(path, options = {}) {
  const res = await fetch(resolveApiUrl(`${API}${path}`), {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.success === false) {
    const err = new Error(data.message || 'Request failed')
    err.status = res.status
    throw err
  }
  return data
}

function numberWidth(totalRooms) {
  return Math.max(1, String(Number(totalRooms)).length)
}

function formatUnitLabel(unitNumber, prefix, totalRooms) {
  return `${prefix}${String(unitNumber).padStart(numberWidth(totalRooms), '0')}`
}

function formatThaiDate(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const then = new Date(isoString).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return 'เมื่อสักครู่'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`
  return `${Math.floor(diffHour / 24)} วันที่แล้ว`
}

// Splits 1..total into range chips (the mockup's "building" filter); rooms
// here have no building, so number ranges stand in for it.
function buildRangeGroups(total, prefix) {
  const size = total > 400 ? 100 : total > 120 ? 50 : total > 40 ? 20 : 0
  if (!size) return []
  const groups = []
  for (let start = 1; start <= total; start += size) {
    const end = Math.min(total, start + size - 1)
    groups.push({
      key: `${start}-${end}`,
      start,
      end,
      label: `${formatUnitLabel(start, prefix, total)} – ${String(end).padStart(numberWidth(total), '0')}`,
    })
  }
  return groups
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`tk-chip ${active ? 'is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

function Badge({ status }) {
  const meta = UNIT_STATUS[status] || UNIT_STATUS.pending
  return <span className={`tk-badge ${meta.cls}`}>{meta.label}</span>
}

export default function Tracker() {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [checkedUnits, setCheckedUnits] = useState(() => new Set())
  const [markedUnits, setMarkedUnits] = useState(() => new Set())
  const [inspections, setInspections] = useState(() => new Map())
  const [issues, setIssues] = useState([])
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES)
  const [online, setOnline] = useState(true)
  const [roomsLoaded, setRoomsLoaded] = useState(false)
  const [currentRoomId, setCurrentRoomId] = useState(getRoomIdFromPath)
  const [roomStateLoading, setRoomStateLoading] = useState(Boolean(getRoomIdFromPath()))

  const [joinPassword, setJoinPassword] = useState('')
  const [joinFeedback, setJoinFeedback] = useState('')
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const [lobbySearch, setLobbySearch] = useState('')
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [sessionForm, setSessionForm] = useState({ name: '', password: '', guest_name: '', prefix: '42/', total: '755' })
  const [sessionFeedback, setSessionFeedback] = useState('')
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false)
  const [roomNameDraft, setRoomNameDraft] = useState('')
  const [roomSettingsFeedback, setRoomSettingsFeedback] = useState('')
  const [roomActionBusy, setRoomActionBusy] = useState(false)

  const [view, setView] = useState('units') // units | inspect | issues
  const [activeUnit, setActiveUnit] = useState(null)
  const [draft, setDraft] = useState({})
  const [rangeFilter, setRangeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [issueFilter, setIssueFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [layout, setLayout] = useState('grid')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [saving, setSaving] = useState(false)
  const [busyIssueId, setBusyIssueId] = useState(null)
  const [toast, setToast] = useState(null)

  const toastTimer = useRef(null)
  const backdropPointerStartedRef = useRef(false)

  const prefix = activeSession?.prefix || '42/'
  const totalRooms = Number(activeSession?.total_rooms || 0)

  const showToast = useCallback((text, type = 'info') => {
    setToast({ text, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const applyState = useCallback((data) => {
    setSessions(data.rooms || data.sessions || [])
    setActiveSession(data.active_room || data.active_session || null)
    setCheckedUnits(new Set(data.units || []))
    setMarkedUnits(new Set(data.marked || []))
    setInspections(new Map((data.inspections || []).map((item) => [Number(item.unit_number), item])))
    setIssues(data.issues || [])
    if (Array.isArray(data.categories) && data.categories.length) setCategories(data.categories)
  }, [])

  const resetRoomData = useCallback(() => {
    setActiveSession(null)
    setCheckedUnits(new Set())
    setMarkedUnits(new Set())
    setInspections(new Map())
    setIssues([])
    setView('units')
    setActiveUnit(null)
  }, [])

  const loadRooms = useCallback(async () => {
    try {
      const data = await trackerFetch('/rooms')
      setSessions(data.rooms || [])
    } catch {
      // lobby stays with whatever it had
    } finally {
      setRoomsLoaded(true)
    }
  }, [])

  const loadRoomState = useCallback(async (roomId) => {
    const data = await trackerFetch(`/rooms/${encodeURIComponent(roomId)}/state`)
    applyState(data)
    setOnline(true)
    return data
  }, [applyState])

  const loadData = useCallback(async () => {
    if (!activeSession?.id) return
    try {
      await loadRoomState(activeSession.id)
    } catch {
      setOnline(false)
    }
  }, [activeSession?.id, loadRoomState])

  useEffect(() => {
    loadRooms()
    const onPopState = () => setCurrentRoomId(getRoomIdFromPath())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [loadRooms])

  useEffect(() => {
    if (!currentRoomId) {
      setRoomStateLoading(false)
      resetRoomData()
      return undefined
    }
    let cancelled = false
    setRoomStateLoading(true)
    setJoinFeedback('')
    loadRoomState(currentRoomId)
      .catch((err) => {
        if (cancelled) return
        resetRoomData()
        if (err.status !== 401) setOnline(false)
      })
      .finally(() => {
        if (!cancelled) setRoomStateLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentRoomId, loadRoomState, resetRoomData])

  useEffect(() => {
    if (!activeSession?.id) return undefined
    const socket = connectTrackerSocket(activeSession.id)
    const onConnect = () => { setOnline(true); loadData() }
    const onDisconnect = () => setOnline(false)
    const onTrackerUpdate = (data) => {
      if (data?.deleted) {
        window.history.pushState({}, '', '/tracker')
        setCurrentRoomId('')
        resetRoomData()
        loadRooms()
        showToast('ห้องนี้ถูกลบแล้ว', 'error')
        return
      }
      applyState(data || {})
      setOnline(true)
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onDisconnect)
    socket.on('tracker_update', onTrackerUpdate)
    const timer = setInterval(() => {
      if (!socket.connected) loadData()
    }, SOCKET_FALLBACK_INTERVAL)
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onDisconnect)
      socket.off('tracker_update', onTrackerUpdate)
      clearInterval(timer)
    }
  }, [activeSession?.id, applyState, loadData, loadRooms, resetRoomData, showToast])

  useEffect(() => {
    document.title = 'ตรวจห้องชุด - ระบบตรวจห้องชุด'
    document.body.classList.add('tracker-page')
    let link = document.querySelector('link[data-tracker-font]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = FONT_HREF
      link.setAttribute('data-tracker-font', '1')
      document.head.appendChild(link)
    }
    return () => {
      document.body.classList.remove('tracker-page')
      clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!sessionModalOpen && !roomSettingsOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      setSessionModalOpen(false)
      setRoomSettingsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sessionModalOpen, roomSettingsOpen])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [rangeFilter, statusFilter, searchQuery, activeSession?.id])

  // ---------- derived data ----------
  const unitStatusOf = useCallback((unitNumber) => {
    const code = formatUnitLabel(unitNumber, prefix, totalRooms)
    if (markedUnits.has(code)) return 'skipped'
    const inspection = inspections.get(unitNumber)
    if (inspection) return inspection.result === 'issue' ? 'issue' : 'ok'
    if (checkedUnits.has(code)) return 'ok'
    return 'pending'
  }, [prefix, totalRooms, markedUnits, inspections, checkedUnits])

  const allUnits = useMemo(() => {
    const list = []
    for (let n = 1; n <= totalRooms; n += 1) {
      const inspection = inspections.get(n)
      list.push({
        n,
        code: formatUnitLabel(n, prefix, totalRooms),
        status: unitStatusOf(n),
        lastInspected: inspection?.inspected_at || null,
      })
    }
    return list
  }, [totalRooms, prefix, inspections, unitStatusOf])

  const rangeGroups = useMemo(() => buildRangeGroups(totalRooms, prefix), [totalRooms, prefix])

  const deferredSearch = useDeferredValue(searchQuery)
  const filteredUnits = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    const range = rangeGroups.find((g) => g.key === rangeFilter)
    return allUnits.filter((u) => {
      if (range && (u.n < range.start || u.n > range.end)) return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (query && !u.code.toLowerCase().includes(query) && !String(u.n).includes(query)) return false
      return true
    })
  }, [allUnits, rangeGroups, rangeFilter, statusFilter, deferredSearch])

  const counts = useMemo(() => {
    const c = { ok: 0, issue: 0, skipped: 0, pending: 0 }
    for (const u of allUnits) c[u.status] += 1
    return c
  }, [allUnits])

  // Per-range breakdown for the summary tab; falls back to one row for small rooms.
  const rangeSummary = useMemo(() => {
    const groups = rangeGroups.length
      ? rangeGroups
      : [{ key: 'all', start: 1, end: totalRooms, label: `${formatUnitLabel(1, prefix, totalRooms)} – ${formatUnitLabel(totalRooms, prefix, totalRooms)}` }]
    return groups.map((g) => {
      const row = { ...g, total: g.end - g.start + 1, ok: 0, issue: 0, skipped: 0, pending: 0 }
      for (let n = g.start; n <= g.end; n += 1) row[allUnits[n - 1].status] += 1
      row.inspected = row.ok + row.issue
      row.percent = row.total ? (row.inspected / row.total) * 100 : 0
      return row
    })
  }, [rangeGroups, allUnits, totalRooms, prefix])

  const openIssues = useMemo(() => issues.filter((i) => i.status !== 'done'), [issues])
  const filteredIssues = useMemo(
    () => (issueFilter === 'all' ? issues : issues.filter((i) => i.status === issueFilter)),
    [issues, issueFilter],
  )

  const deferredLobbySearch = useDeferredValue(lobbySearch)
  const filteredSessions = useMemo(() => {
    const query = deferredLobbySearch.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter((room) => room.name.toLowerCase().includes(query))
  }, [sessions, deferredLobbySearch])

  // ---------- navigation ----------
  const navigateToRoom = (roomId, replace = false) => {
    const url = `/tracker/rooms/${encodeURIComponent(roomId)}`
    if (replace) window.history.replaceState({}, '', url)
    else window.history.pushState({}, '', url)
    setCurrentRoomId(String(roomId))
  }

  const navigateToLobby = () => {
    window.history.pushState({}, '', '/tracker')
    setCurrentRoomId('')
    resetRoomData()
    loadRooms()
  }

  const openInspect = (unitNumber) => {
    const existing = inspections.get(unitNumber)?.checklist || {}
    const next = {}
    for (const c of categories) {
      const prev = existing[c.key]
      next[c.key] = prev ? { status: prev.status ?? null, note: prev.note || '' } : { status: DEFAULT_CHECK_STATUS, note: '' }
    }
    setDraft(next)
    setActiveUnit(unitNumber)
    setView('inspect')
    window.scrollTo({ top: 0 })
  }

  const backToUnits = () => {
    setView('units')
    setActiveUnit(null)
    window.scrollTo({ top: 0 })
  }

  // ---------- room actions ----------
  const handleJoinRoom = async (e) => {
    e.preventDefault()
    const password = joinPassword.trim()
    if (!password) {
      setJoinFeedback('กรอกรหัสห้องก่อน')
      return
    }
    setJoinSubmitting(true)
    setJoinFeedback('')
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(currentRoomId)}/join`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      applyState(data)
      setJoinPassword('')
      setOnline(true)
      navigateToRoom(data.active_room?.id || currentRoomId, true)
    } catch (err) {
      setJoinFeedback(err.message || 'รหัสห้องไม่ถูกต้อง')
    } finally {
      setJoinSubmitting(false)
    }
  }

  const handleCreateSession = async (e) => {
    e.preventDefault()
    setSessionFeedback('')
    try {
      const data = await trackerFetch('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: sessionForm.name.trim(),
          password: sessionForm.password,
          guest_name: sessionForm.guest_name.trim(),
          prefix: sessionForm.prefix.trim(),
          total_rooms: Number(sessionForm.total),
        }),
      })
      applyState(data)
      setSessionForm({ name: '', password: '', guest_name: '', prefix: '42/', total: '755' })
      setSessionModalOpen(false)
      navigateToRoom(data.active_room.id, true)
      showToast(`สร้างห้อง '${data.active_room.name}' แล้ว`)
    } catch (err) {
      setSessionFeedback(err.message)
    }
  }

  const openRoomSettings = () => {
    setRoomNameDraft(activeSession?.name || '')
    setRoomSettingsFeedback('')
    setRoomSettingsOpen(true)
  }

  const handleRenameRoom = async (e) => {
    e.preventDefault()
    if (!activeSession?.id || !roomNameDraft.trim()) return
    setRoomActionBusy(true)
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: roomNameDraft.trim() }),
      })
      applyState(data)
      setRoomSettingsOpen(false)
      showToast('เปลี่ยนชื่อห้องแล้ว')
    } catch (err) {
      setRoomSettingsFeedback(err.message)
    } finally {
      setRoomActionBusy(false)
    }
  }

  const handleDeleteRoom = async () => {
    if (!activeSession?.id) return
    if (!window.confirm(`ลบห้อง '${activeSession.name}' และข้อมูลทั้งหมดในห้องนี้ใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return
    setRoomActionBusy(true)
    try {
      await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}`, { method: 'DELETE' })
      setRoomSettingsOpen(false)
      navigateToLobby()
      showToast('ลบห้องแล้ว')
    } catch (err) {
      setRoomSettingsFeedback(err.message)
    } finally {
      setRoomActionBusy(false)
    }
  }

  // ---------- inspection actions ----------
  const setCatStatus = (key, status) => setDraft((d) => ({ ...d, [key]: { ...d[key], status } }))
  const setCatNote = (key, note) => setDraft((d) => ({ ...d, [key]: { ...d[key], note } }))
  const canSave = !REQUIRE_ALL_CATEGORIES || categories.every((c) => draft[c.key]?.status)

  const saveInspection = async () => {
    if (!activeSession?.id || !activeUnit || !canSave || saving) return
    const code = formatUnitLabel(activeUnit, prefix, totalRooms)
    setSaving(true)
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/inspections`, {
        method: 'PUT',
        body: JSON.stringify({ unit: activeUnit, checklist: draft }),
      })
      applyState(data)
      backToUnits()
      showToast(`บันทึกผลตรวจห้อง ${code} แล้ว`)
    } catch (err) {
      showToast(err.message || 'บันทึกไม่สำเร็จ', 'error')
    } finally {
      setSaving(false)
    }
  }

  const clearInspection = async () => {
    if (!activeSession?.id || !activeUnit) return
    const code = formatUnitLabel(activeUnit, prefix, totalRooms)
    if (!window.confirm(`ล้างผลตรวจห้อง ${code} และงานซ่อมที่ยังไม่เสร็จของห้องนี้?`)) return
    setSaving(true)
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/inspections/${activeUnit}`, { method: 'DELETE' })
      applyState(data)
      backToUnits()
      showToast(`ล้างผลตรวจห้อง ${code} แล้ว`)
    } catch (err) {
      showToast(err.message || 'ล้างผลตรวจไม่สำเร็จ', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleSkip = async () => {
    if (!activeSession?.id || !activeUnit) return
    const code = formatUnitLabel(activeUnit, prefix, totalRooms)
    setSaving(true)
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/marked/${activeUnit}/toggle`, { method: 'POST' })
      applyState(data)
      backToUnits()
      showToast(data.action === 'marked' ? `ข้ามห้อง ${code} แล้ว` : `ยกเลิกข้ามห้อง ${code} แล้ว`)
    } catch (err) {
      showToast(err.message || 'ทำรายการไม่สำเร็จ', 'error')
    } finally {
      setSaving(false)
    }
  }

  const cycleIssueStatus = async (issue) => {
    if (!activeSession?.id || busyIssueId) return
    const next = ISSUE_ORDER[(ISSUE_ORDER.indexOf(issue.status) + 1) % ISSUE_ORDER.length]
    setBusyIssueId(issue.id)
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/issues/${encodeURIComponent(issue.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      })
      applyState(data)
    } catch (err) {
      showToast(err.message || 'อัปเดตสถานะไม่สำเร็จ', 'error')
    } finally {
      setBusyIssueId(null)
    }
  }

  const handleBackdropPointerDown = (event) => {
    backdropPointerStartedRef.current = event.target === event.currentTarget
  }
  const handleBackdropClick = (event, close) => {
    if (backdropPointerStartedRef.current && event.target === event.currentTarget) close()
    backdropPointerStartedRef.current = false
  }

  const joinTargetRoom = sessions.find((room) => room.id === currentRoomId)
  const toastEl = toast ? <div className={`tk-toast ${toast.type === 'error' ? 'is-error' : ''}`}>{toast.text}</div> : null

  // ---------- screens ----------
  if (!roomsLoaded || (currentRoomId && !activeSession && roomStateLoading)) {
    return (
      <div className="tk">
        <div className="tk-auth">
          <div className="tk-auth-card">
            <div className="tk-spinner" aria-hidden="true" />
            <h1>{joinTargetRoom?.name || 'ตรวจห้องชุด'}</h1>
            <p>{currentRoomId ? 'กำลังตรวจสอบสิทธิ์เข้าห้อง...' : 'กำลังโหลดห้อง...'}</p>
          </div>
        </div>
      </div>
    )
  }

  if (currentRoomId && !activeSession) {
    return (
      <div className="tk">
        <div className="tk-auth">
          <form className="tk-auth-card" onSubmit={handleJoinRoom}>
            <div className="tk-logo" style={{ margin: '0 auto 4px' }} aria-hidden="true" />
            <h1>{joinTargetRoom?.name || 'เข้าห้อง'}</h1>
            <p>กรอกรหัสของห้องนี้เพื่อเข้าตรวจห้องชุด</p>
            <div className="tk-field">
              <label htmlFor="tk-join-password">รหัสห้อง</label>
              <input
                id="tk-join-password"
                type="password"
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </div>
            {joinFeedback ? <div className="tk-error">{joinFeedback}</div> : null}
            <button type="submit" className="tk-btn" disabled={joinSubmitting}>
              {joinSubmitting ? 'กำลังเข้าห้อง...' : 'เข้าห้อง'}
            </button>
            <button type="button" className="tk-btn is-ghost" onClick={navigateToLobby}>← กลับหน้ารวมห้อง</button>
          </form>
        </div>
      </div>
    )
  }

  if (!activeSession) {
    return (
      <div className="tk">
        <div className="tk-header">
          <div className="tk-brand">
            <div className="tk-logo" aria-hidden="true" />
            <div>
              <div className="tk-brand-title">ตรวจห้องชุด</div>
              <div className="tk-brand-sub">เลือกโครงการ/ห้องเพื่อเริ่มตรวจ</div>
            </div>
          </div>
          <button type="button" className="tk-btn" onClick={() => { setSessionFeedback(''); setSessionModalOpen(true) }}>+ สร้างห้องใหม่</button>
        </div>
        <div className="tk-lobby">
          <div className="tk-lobby-head">
            <div>
              <h1 className="tk-h1">ห้องทั้งหมด</h1>
              <p className="tk-sub">{filteredSessions.length} / {sessions.length} ห้อง</p>
            </div>
            {sessions.length > 6 ? (
              <div className="tk-search">
                <input type="text" value={lobbySearch} onChange={(e) => setLobbySearch(e.target.value)} placeholder="ค้นหาชื่อห้อง..." />
                {lobbySearch ? <button type="button" onClick={() => setLobbySearch('')} aria-label="ล้างคำค้น">×</button> : null}
              </div>
            ) : null}
          </div>
          <div className="tk-room-grid">
            {filteredSessions.map((room) => (
              <article key={room.id} className="tk-room">
                <h2>{room.name}</h2>
                <div className="tk-room-meta">
                  <span>ตรวจแล้ว {room.checked_count || 0} / {room.total_rooms}</span>
                  {room.issue_unit_count ? <span>พบปัญหา {room.issue_unit_count}</span> : null}
                  {room.open_issue_count ? <span>งานซ่อมค้าง {room.open_issue_count}</span> : null}
                </div>
                <p>เลขห้อง {formatUnitLabel(1, room.prefix, room.total_rooms)} – {formatUnitLabel(room.total_rooms, room.prefix, room.total_rooms)}</p>
                <p>ผู้สร้าง: {room.created_by_guest_name || (room.created_by_user_id ? `User #${room.created_by_user_id}` : 'guest')}</p>
                {room.last_active_at ? <p>ใช้งานล่าสุด {formatRelativeTime(room.last_active_at)}</p> : null}
                <button type="button" className="tk-btn" onClick={() => navigateToRoom(room.id)}>เข้าห้อง</button>
              </article>
            ))}
          </div>
          {!sessions.length ? <div className="tk-empty">ยังไม่มีห้อง สร้างห้องแรกได้เลย</div> : null}
          {sessions.length && !filteredSessions.length ? <div className="tk-empty">ไม่พบห้องที่ตรงกับ “{lobbySearch}”</div> : null}
        </div>

        {sessionModalOpen ? (
          <div className="tk-modal" onPointerDown={handleBackdropPointerDown} onClick={(e) => handleBackdropClick(e, () => setSessionModalOpen(false))}>
            <form className="tk-modal-card" onSubmit={handleCreateSession} autoComplete="off">
              <div className="tk-modal-head">
                <h3>สร้างห้องใหม่</h3>
                <button type="button" className="tk-iconbtn" onClick={() => setSessionModalOpen(false)} aria-label="ปิด">×</button>
              </div>
              <div className="tk-field">
                <label htmlFor="tk-session-name">ชื่อห้อง / โครงการ</label>
                <input id="tk-session-name" value={sessionForm.name} onChange={(e) => setSessionForm((f) => ({ ...f, name: e.target.value }))} placeholder="เช่น อาคาร A" required />
              </div>
              <div className="tk-field">
                <label htmlFor="tk-session-password">รหัสห้อง</label>
                <input id="tk-session-password" type="password" value={sessionForm.password} onChange={(e) => setSessionForm((f) => ({ ...f, password: e.target.value }))} placeholder="ตั้งรหัสสำหรับเข้าห้อง" required />
              </div>
              <div className="tk-field">
                <label htmlFor="tk-session-guest">ชื่อผู้สร้าง</label>
                <input id="tk-session-guest" value={sessionForm.guest_name} onChange={(e) => setSessionForm((f) => ({ ...f, guest_name: e.target.value }))} placeholder="เช่น Noble" />
              </div>
              <div className="tk-field-row">
                <div className="tk-field">
                  <label htmlFor="tk-session-prefix">Prefix เลขห้อง</label>
                  <input id="tk-session-prefix" value={sessionForm.prefix} onChange={(e) => setSessionForm((f) => ({ ...f, prefix: e.target.value }))} placeholder="42/" required />
                </div>
                <div className="tk-field">
                  <label htmlFor="tk-session-total">จำนวนห้อง</label>
                  <input id="tk-session-total" type="number" min="1" max="10000" value={sessionForm.total} onChange={(e) => setSessionForm((f) => ({ ...f, total: e.target.value }))} placeholder="755" required />
                </div>
              </div>
              {sessionFeedback ? <div className="tk-error">{sessionFeedback}</div> : null}
              <button type="submit" className="tk-btn">สร้างห้อง</button>
            </form>
          </div>
        ) : null}
        {toastEl}
      </div>
    )
  }

  const activeUnitCode = activeUnit ? formatUnitLabel(activeUnit, prefix, totalRooms) : ''
  const activeUnitStatus = activeUnit ? unitStatusOf(activeUnit) : 'pending'
  const activeInspection = activeUnit ? inspections.get(activeUnit) : null
  const inspectedCount = counts.ok + counts.issue
  const remainingCount = counts.pending
  const pct = (n) => (totalRooms ? (n / totalRooms) * 100 : 0)
  const percent = Math.round(pct(inspectedCount))
  const fmtPct = (n) => `${pct(n).toFixed(1)}%`
  const visibleUnits = filteredUnits.slice(0, visibleCount)

  return (
    <div className="tk">
      <div className="tk-header">
        <div className="tk-brand">
          <div className="tk-logo" aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className="tk-brand-title">ตรวจห้องชุด</div>
            <div className="tk-brand-sub">
              <span>{activeSession.name}</span>
              <span>·</span>
              <button type="button" className="tk-linkbtn" onClick={navigateToLobby}>เปลี่ยนห้อง</button>
            </div>
          </div>
        </div>
        <div className="tk-tabs">
          <button type="button" className={`tk-tab ${view === 'units' || view === 'inspect' ? 'is-active' : ''}`} onClick={backToUnits}>ห้องชุด</button>
          <button type="button" className={`tk-tab ${view === 'issues' ? 'is-active' : ''}`} onClick={() => { setView('issues'); setActiveUnit(null) }}>
            งานซ่อม
            {openIssues.length ? <span className="tk-tab-badge">{openIssues.length}</span> : null}
          </button>
          <button type="button" className={`tk-tab ${view === 'summary' ? 'is-active' : ''}`} onClick={() => { setView('summary'); setActiveUnit(null) }}>สรุป</button>
          <button type="button" className="tk-iconbtn" onClick={openRoomSettings} title="ตั้งค่าห้อง" aria-label="ตั้งค่าห้อง">⚙</button>
        </div>
      </div>

      <div className="tk-main">
        {view === 'units' ? (
          <>
            <div className="tk-stats">
              <span>ตรวจแล้ว <strong>{inspectedCount}</strong> / {totalRooms} ห้อง ({percent}%)</span>
              <div className="tk-progress"><span style={{ width: `${percent}%` }} /></div>
              {counts.issue ? <span>พบปัญหา <strong>{counts.issue}</strong></span> : null}
              {counts.skipped ? <span>ข้าม <strong>{counts.skipped}</strong></span> : null}
              <span className="tk-sync"><span className={`tk-dot ${online ? '' : 'is-off'}`} />{online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
            </div>

            <div className="tk-toolbar">
              {rangeGroups.length ? (
                <>
                  <Chip active={rangeFilter === 'all'} onClick={() => setRangeFilter('all')}>ทุกช่วง</Chip>
                  {rangeGroups.map((g) => (
                    <Chip key={g.key} active={rangeFilter === g.key} onClick={() => setRangeFilter(g.key)}>{g.label}</Chip>
                  ))}
                  <div className="tk-divider" />
                </>
              ) : null}
              <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>ทุกสถานะ</Chip>
              <Chip active={statusFilter === 'pending'} onClick={() => setStatusFilter('pending')}>รอตรวจ</Chip>
              <Chip active={statusFilter === 'ok'} onClick={() => setStatusFilter('ok')}>ตรวจแล้ว</Chip>
              <Chip active={statusFilter === 'issue'} onClick={() => setStatusFilter('issue')}>พบปัญหา</Chip>
              {counts.skipped ? <Chip active={statusFilter === 'skipped'} onClick={() => setStatusFilter('skipped')}>ข้าม</Chip> : null}
              <div className="tk-search">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ค้นหาเลขห้อง..." />
                {searchQuery ? <button type="button" onClick={() => setSearchQuery('')} aria-label="ล้างคำค้น">×</button> : null}
              </div>
              <div className="tk-layout-toggle" role="group" aria-label="รูปแบบการแสดงผล">
                <button type="button" className={layout === 'grid' ? 'is-active' : ''} onClick={() => setLayout('grid')}>การ์ด</button>
                <button type="button" className={layout === 'list' ? 'is-active' : ''} onClick={() => setLayout('list')}>รายการ</button>
              </div>
            </div>

            {layout === 'grid' ? (
              <div className="tk-grid">
                {visibleUnits.map((u) => (
                  <div key={u.n} className="tk-card">
                    <div className="tk-card-head">
                      <div>
                        <div className="tk-unit-code">{u.code}</div>
                        <div className="tk-unit-meta">{activeSession.name}</div>
                      </div>
                      <Badge status={u.status} />
                    </div>
                    <div className="tk-unit-last">ตรวจล่าสุด: {u.lastInspected ? formatThaiDate(u.lastInspected) : 'ยังไม่เคยตรวจ'}</div>
                    <button type="button" className="tk-btn" onClick={() => openInspect(u.n)}>เข้าตรวจห้อง</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tk-list">
                {visibleUnits.map((u) => (
                  <div key={u.n} className="tk-row">
                    <div className="tk-row-main">
                      <div className="tk-unit-code">{u.code}</div>
                      <Badge status={u.status} />
                      <div className="tk-unit-last">ตรวจล่าสุด: {u.lastInspected ? formatThaiDate(u.lastInspected) : 'ยังไม่เคยตรวจ'}</div>
                    </div>
                    <button type="button" className="tk-btn is-sm" onClick={() => openInspect(u.n)}>เข้าตรวจห้อง</button>
                  </div>
                ))}
              </div>
            )}
            {!filteredUnits.length ? <div className="tk-empty">ไม่พบห้องที่ตรงกับตัวกรอง</div> : null}
            {filteredUnits.length > visibleCount ? (
              <div className="tk-more">
                <button type="button" className="tk-btn is-ghost" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                  แสดงเพิ่ม ({filteredUnits.length - visibleCount} ห้อง)
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {view === 'inspect' && activeUnit ? (
          <div className="tk-inspect">
            <div className="tk-inspect-head">
              <button type="button" className="tk-btn is-ghost is-sm" onClick={backToUnits}>← กลับ</button>
              <div>
                <div className="tk-unit-code">{activeUnitCode}</div>
                <div className="tk-unit-meta">
                  {activeSession.name}
                  {activeInspection?.inspected_at ? ` • ตรวจล่าสุด ${formatThaiDate(activeInspection.inspected_at)}` : ''}
                </div>
              </div>
              <Badge status={activeUnitStatus} />
            </div>

            <div className="tk-cats">
              {categories.map((c) => {
                const d = draft[c.key] || { status: null, note: '' }
                return (
                  <div key={c.key} className="tk-cat">
                    <div className="tk-cat-label">{c.label}</div>
                    <div className="tk-cat-opts">
                      <button type="button" className={`tk-opt ${d.status === 'ok' ? 'is-ok' : ''}`} onClick={() => setCatStatus(c.key, 'ok')}>ปกติ</button>
                      <button type="button" className={`tk-opt ${d.status === 'bad' ? 'is-bad' : ''}`} onClick={() => setCatStatus(c.key, 'bad')}>ชำรุด</button>
                      <button type="button" className={`tk-opt ${d.status === 'na' ? 'is-na' : ''}`} onClick={() => setCatStatus(c.key, 'na')}>N/A</button>
                    </div>
                    {d.status === 'bad' ? (
                      <textarea
                        className="tk-note"
                        value={d.note}
                        onChange={(e) => setCatNote(c.key, e.target.value)}
                        placeholder="ระบุรายละเอียดปัญหา..."
                        maxLength={1000}
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="tk-save-bar">
              <button type="button" className="tk-save" disabled={!canSave || saving} onClick={saveInspection}>
                {saving ? 'กำลังบันทึก...' : 'บันทึกผลตรวจ'}
              </button>
              <div className="tk-inspect-actions">
                <button type="button" className="tk-btn is-ghost is-sm" disabled={saving} onClick={toggleSkip}>
                  {activeUnitStatus === 'skipped' ? 'ยกเลิกข้ามห้องนี้' : 'ข้ามห้องนี้'}
                </button>
                {activeInspection || activeUnitStatus === 'ok' ? (
                  <button type="button" className="tk-btn is-danger is-sm" disabled={saving} onClick={clearInspection}>ล้างผลตรวจ</button>
                ) : null}
              </div>
              {REQUIRE_ALL_CATEGORIES && !canSave ? <div className="tk-inspect-hint">เลือกผลให้ครบทุกหมวดก่อนบันทึก</div> : null}
            </div>
          </div>
        ) : null}

        {view === 'summary' ? (
          <div className="tk-summary">
            <div className="tk-summary-hero">
              <svg className="tk-ring" viewBox="0 0 120 120" role="img" aria-label={`ตรวจแล้ว ${fmtPct(inspectedCount)}`}>
                <circle cx="60" cy="60" r="52" className="tk-ring-track" />
                <circle
                  cx="60" cy="60" r="52" className="tk-ring-fill"
                  strokeDasharray={`${(pct(inspectedCount) / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                />
                <text x="60" y="56" textAnchor="middle" className="tk-ring-value">{pct(inspectedCount).toFixed(1)}%</text>
                <text x="60" y="74" textAnchor="middle" className="tk-ring-label">ตรวจแล้ว</text>
              </svg>
              <div className="tk-summary-hero-text">
                <div className="tk-h1">{activeSession.name}</div>
                <p className="tk-sub">ห้องทั้งหมด {totalRooms} ห้อง ({formatUnitLabel(1, prefix, totalRooms)} – {formatUnitLabel(totalRooms, prefix, totalRooms)})</p>
                <div className="tk-progress tk-progress-lg" aria-hidden="true">
                  <span className="is-ok" style={{ width: `${pct(counts.ok)}%` }} />
                  <span className="is-issue" style={{ width: `${pct(counts.issue)}%` }} />
                  <span className="is-skipped" style={{ width: `${pct(counts.skipped)}%` }} />
                </div>
                <div className="tk-legend">
                  <span><i className="is-ok" />ปกติ {counts.ok}</span>
                  <span><i className="is-issue" />พบปัญหา {counts.issue}</span>
                  {counts.skipped ? <span><i className="is-skipped" />ข้าม {counts.skipped}</span> : null}
                  <span><i />รอตรวจ {counts.pending}</span>
                </div>
              </div>
            </div>

            <div className="tk-tiles">
              <div className="tk-tile is-ok">
                <div className="tk-tile-label">ตรวจแล้ว</div>
                <div className="tk-tile-value">{inspectedCount} <small>ห้อง</small></div>
                <div className="tk-tile-pct">{fmtPct(inspectedCount)}</div>
              </div>
              <div className="tk-tile">
                <div className="tk-tile-label">คงเหลือ (รอตรวจ)</div>
                <div className="tk-tile-value">{remainingCount} <small>ห้อง</small></div>
                <div className="tk-tile-pct">{fmtPct(remainingCount)}</div>
              </div>
              <div className="tk-tile is-issue">
                <div className="tk-tile-label">พบปัญหา</div>
                <div className="tk-tile-value">{counts.issue} <small>ห้อง</small></div>
                <div className="tk-tile-pct">{fmtPct(counts.issue)} · งานซ่อมค้าง {openIssues.length}</div>
              </div>
              <div className="tk-tile is-skipped">
                <div className="tk-tile-label">ข้าม</div>
                <div className="tk-tile-value">{counts.skipped} <small>ห้อง</small></div>
                <div className="tk-tile-pct">{fmtPct(counts.skipped)}</div>
              </div>
            </div>

            <div className="tk-table-wrap">
              <table className="tk-table">
                <thead>
                  <tr>
                    <th>ช่วงห้อง</th>
                    <th>ทั้งหมด</th>
                    <th>ตรวจแล้ว</th>
                    <th>คงเหลือ</th>
                    <th>พบปัญหา</th>
                    <th>ข้าม</th>
                    <th>% ตรวจแล้ว</th>
                    <th className="tk-table-bar" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {rangeSummary.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>{r.total}</td>
                      <td>{r.inspected}</td>
                      <td>{r.pending}</td>
                      <td>{r.issue || '–'}</td>
                      <td>{r.skipped || '–'}</td>
                      <td>{r.percent.toFixed(1)}%</td>
                      <td className="tk-table-bar"><div className="tk-progress"><span style={{ width: `${r.percent}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>รวม</td>
                    <td>{totalRooms}</td>
                    <td>{inspectedCount}</td>
                    <td>{remainingCount}</td>
                    <td>{counts.issue || '–'}</td>
                    <td>{counts.skipped || '–'}</td>
                    <td>{fmtPct(inspectedCount)}</td>
                    <td className="tk-table-bar"><div className="tk-progress"><span style={{ width: `${percent}%` }} /></div></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}

        {view === 'issues' ? (
          <div>
            <div className="tk-toolbar">
              <Chip active={issueFilter === 'all'} onClick={() => setIssueFilter('all')}>ทั้งหมด</Chip>
              {ISSUE_ORDER.map((s) => (
                <Chip key={s} active={issueFilter === s} onClick={() => setIssueFilter(s)}>{ISSUE_STATUS[s]}</Chip>
              ))}
            </div>
            <div className="tk-list">
              {filteredIssues.map((i) => (
                <div key={i.id} className="tk-issue">
                  <div>
                    <div className="tk-issue-title">
                      <button type="button" onClick={() => openInspect(i.unit_number)}>{i.unit}</button>
                      {' — '}{i.category_label}
                    </div>
                    <div className="tk-issue-note">{i.note || '(ไม่ระบุรายละเอียด)'}</div>
                    <div className="tk-issue-date">พบเมื่อ {formatThaiDate(i.created_at)}</div>
                  </div>
                  <button
                    type="button"
                    className={`tk-issue-status is-${i.status}`}
                    disabled={busyIssueId === i.id}
                    onClick={() => cycleIssueStatus(i)}
                    title="คลิกเพื่อเปลี่ยนสถานะ"
                  >
                    {ISSUE_STATUS[i.status] || i.status} →
                  </button>
                </div>
              ))}
              {!filteredIssues.length ? <div className="tk-empty">ไม่มีรายการงานซ่อมในหมวดนี้</div> : null}
            </div>
          </div>
        ) : null}
      </div>

      {roomSettingsOpen ? (
        <div className="tk-modal" onPointerDown={handleBackdropPointerDown} onClick={(e) => handleBackdropClick(e, () => setRoomSettingsOpen(false))}>
          <form className="tk-modal-card" onSubmit={handleRenameRoom} autoComplete="off">
            <div className="tk-modal-head">
              <h3>ตั้งค่าห้อง</h3>
              <button type="button" className="tk-iconbtn" onClick={() => setRoomSettingsOpen(false)} aria-label="ปิด">×</button>
            </div>
            <div className="tk-field">
              <label htmlFor="tk-room-name">ชื่อห้อง</label>
              <input id="tk-room-name" value={roomNameDraft} onChange={(e) => setRoomNameDraft(e.target.value)} required />
            </div>
            <p className="tk-sub">เลขห้อง {formatUnitLabel(1, prefix, totalRooms)} – {formatUnitLabel(totalRooms, prefix, totalRooms)} ({totalRooms} ห้อง)</p>
            {roomSettingsFeedback ? <div className="tk-error">{roomSettingsFeedback}</div> : null}
            <div className="tk-modal-foot">
              <button type="button" className="tk-btn is-danger" onClick={handleDeleteRoom} disabled={roomActionBusy}>ลบห้องนี้</button>
              <button type="submit" className="tk-btn" disabled={roomActionBusy}>บันทึกชื่อห้อง</button>
            </div>
          </form>
        </div>
      ) : null}
      {toastEl}
    </div>
  )
}
