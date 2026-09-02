import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { resolveApiUrl } from '../api.js'
import { connectTrackerSocket } from '../socket.js'
import './tracker-isolation.css'

const SOCKET_FALLBACK_INTERVAL = 30000
const API = '/api/tracker'

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

function unitDomSafeId(unitName) {
  return unitName.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function getSortValue(str) {
  try {
    const parts = str.split('/')
    const lastPart = parts[parts.length - 1]
    const num = parseInt(lastPart, 10)
    return Number.isNaN(num) ? str : num
  } catch {
    return str
  }
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
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay} วันที่แล้ว`
}

export default function Tracker() {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [checkedUnits, setCheckedUnits] = useState(new Set())
  const [markedUnits, setMarkedUnits] = useState(new Set())
  const [online, setOnline] = useState(true)
  const [roomsLoaded, setRoomsLoaded] = useState(false)
  const [currentRoomId, setCurrentRoomId] = useState(getRoomIdFromPath)
  const [roomStateLoading, setRoomStateLoading] = useState(Boolean(getRoomIdFromPath()))
  const [joinPassword, setJoinPassword] = useState('')
  const [joinFeedback, setJoinFeedback] = useState('')
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')
  const [currentView, setCurrentView] = useState('grid')
  const [unitInput, setUnitInput] = useState('')
  const [feedback, setFeedback] = useState({ text: '', type: '', visible: false })
  const [inputBorder, setInputBorder] = useState('')
  const [latestHighlightedUnit, setLatestHighlightedUnit] = useState(null)
  const [selectedUnit, setSelectedUnit] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [modalFeedback, setModalFeedback] = useState({ text: '', type: '', visible: false })
  const [sessionForm, setSessionForm] = useState({ name: '', password: '', guest_name: '', prefix: '42/', total: '755' })
  const [sessionFeedback, setSessionFeedback] = useState({ text: '', type: '', visible: false })
  const [lobbySearch, setLobbySearch] = useState('')
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false)
  const [roomNameDraft, setRoomNameDraft] = useState('')
  const [roomSettingsFeedback, setRoomSettingsFeedback] = useState({ text: '', type: '', visible: false })
  const [roomActionBusy, setRoomActionBusy] = useState(false)

  const unitInputRef = useRef(null)
  const backdropPointerStartedRef = useRef(false)

  const prefix = activeSession?.prefix || '42/'
  const totalRooms = Number(activeSession?.total_rooms || 755)

  const handleBackdropPointerDown = useCallback((event) => {
    backdropPointerStartedRef.current = event.target === event.currentTarget
  }, [])

  const handleBackdropClick = useCallback((event, close) => {
    if (backdropPointerStartedRef.current && event.target === event.currentTarget) {
      close()
    }
    backdropPointerStartedRef.current = false
  }, [])

  const allUnitsList = useMemo(() => {
    const list = []
    for (let i = 1; i <= totalRooms; i += 1) {
      list.push(formatUnitLabel(i, prefix, totalRooms))
    }
    return list
  }, [prefix, totalRooms])

  const applyState = useCallback((data) => {
    setSessions(data.rooms || data.sessions || [])
    setActiveSession(data.active_room || data.active_session || null)
    setCheckedUnits(new Set(data.units || []))
    setMarkedUnits(new Set(data.marked || []))
  }, [])

  const loadRooms = useCallback(async () => {
    try {
      const data = await trackerFetch('/rooms')
      setSessions(data.rooms || [])
      setRoomsLoaded(true)
    } catch {
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
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/state`)
      applyState(data)
      setOnline(true)
    } catch {
      setOnline(false)
    }
  }, [activeSession?.id, applyState])

  useEffect(() => {
    let cancelled = false
    loadRooms().finally(() => {
      if (!cancelled) setRoomsLoaded(true)
    })
    const onPopState = () => setCurrentRoomId(getRoomIdFromPath())
    window.addEventListener('popstate', onPopState)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPopState)
    }
  }, [loadRooms])

  useEffect(() => {
    if (!currentRoomId) {
      setRoomStateLoading(false)
      setActiveSession(null)
      setCheckedUnits(new Set())
      setMarkedUnits(new Set())
      return
    }
    let cancelled = false
    setRoomStateLoading(true)
    setJoinFeedback('')
    loadRoomState(currentRoomId).then(() => {
      if (!cancelled) setRoomStateLoading(false)
    }).catch((err) => {
      if (cancelled) return
      setActiveSession(null)
      setCheckedUnits(new Set())
      setMarkedUnits(new Set())
      if (err.status !== 401) setOnline(false)
      setRoomStateLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [currentRoomId, loadRoomState])

  useEffect(() => {
    if (!activeSession?.id) return undefined

    const socket = connectTrackerSocket(activeSession.id)
    const initialTimer = setTimeout(() => {
      loadData()
    }, 0)

    const onConnect = () => {
      setOnline(true)
      loadData()
    }
    const onDisconnect = () => {
      setOnline(false)
    }
    const onConnectError = () => {
      setOnline(false)
    }
    const onTrackerUpdate = (data) => {
      if (data?.deleted) {
        if (typeof window !== 'undefined') window.history.pushState({}, '', '/tracker')
        setCurrentRoomId('')
        setActiveSession(null)
        loadRooms()
        setFeedback({ text: '🗑️ ห้องนี้ถูกลบแล้ว', type: 'error', visible: true })
        return
      }
      applyState(data || {})
      setOnline(true)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('tracker_update', onTrackerUpdate)

    const timer = setInterval(() => {
      if (!socket.connected) loadData()
    }, SOCKET_FALLBACK_INTERVAL)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('tracker_update', onTrackerUpdate)
      clearTimeout(initialTimer)
      clearInterval(timer)
    }
  }, [activeSession?.id, applyState, loadData, loadRooms])

  useEffect(() => {
    document.title = '🔑 Unit Key Tracker - ระบบบันทึกคีย์ห้องชุด'
    document.body.classList.add('tracker-page')

    let link = document.querySelector('link[data-tracker-css]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.setAttribute('data-tracker-css', '1')
      document.head.appendChild(link)
    }
    link.href = '/tracker/style.css?v=9'

    return () => {
      document.body.classList.remove('tracker-page')
    }
  }, [])

  useEffect(() => {
    if (!modalOpen && !sessionModalOpen && !roomSettingsOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (modalOpen) closeModal()
      else if (roomSettingsOpen) closeRoomSettings()
      else if (sessionModalOpen) setSessionModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen, sessionModalOpen, roomSettingsOpen])

  const showFeedback = (text, type, autoHide = true) => {
    setFeedback({ text, type, visible: true })
    if (autoHide) {
      setTimeout(() => {
        setFeedback((prev) => (prev.text === text ? { text: '', type: '', visible: false } : prev))
      }, 4000)
    }
  }

  const parseInput = (rawVal) => {
    let parsed = rawVal.trim()
    if (parsed.startsWith(prefix)) parsed = parsed.slice(prefix.length)
    if (/^\d+$/.test(parsed)) parsed = String(Number(parsed)).padStart(numberWidth(totalRooms), '0')
    return `${prefix}${parsed}`
  }

  const deferredSearchQuery = useDeferredValue(searchQuery)

  const filteredUnits = useMemo(() => {
    const combined = new Set([...allUnitsList, ...checkedUnits, ...markedUnits])
    const unitsArray = Array.from(combined).sort((a, b) => {
      const valA = getSortValue(a)
      const valB = getSortValue(b)
      if (typeof valA === 'number' && typeof valB === 'number') return valA - valB
      return String(valA).localeCompare(String(valB))
    })

    const query = deferredSearchQuery.trim().toLowerCase()
    return unitsArray.filter((unit) => {
      if (!unit.toLowerCase().includes(query)) return false
      const isChecked = checkedUnits.has(unit)
      const isMarked = markedUnits.has(unit)
      if (currentFilter === 'checked') return isChecked
      if (currentFilter === 'unchecked') return !isChecked && !isMarked
      if (currentFilter === 'marked') return isMarked
      return true
    })
  }, [allUnitsList, checkedUnits, markedUnits, deferredSearchQuery, currentFilter])

  const deferredLobbySearch = useDeferredValue(lobbySearch)
  const filteredSessions = useMemo(() => {
    const query = deferredLobbySearch.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter((room) => room.name.toLowerCase().includes(query))
  }, [sessions, deferredLobbySearch])

  const count = checkedUnits.size
  const markedCount = markedUnits.size
  const percentage = totalRooms ? ((count / totalRooms) * 100).toFixed(2) : '0.00'
  const exampleUnit = formatUnitLabel(Math.min(5, totalRooms), prefix, totalRooms)
  const dashboardTitle = activeSession
    ? `แดชบอร์ดแสดงผลห้องทั้งหมด (${formatUnitLabel(1, prefix, totalRooms)} - ${formatUnitLabel(totalRooms, prefix, totalRooms)})`
    : 'แดชบอร์ดแสดงผลห้องทั้งหมด'

  const handleUnitInput = (value) => {
    setUnitInput(value)
    const rawVal = value.trim()
    if (!rawVal) {
      setFeedback({ text: '', type: '', visible: false })
      setInputBorder('')
      return
    }
    const fullUnitName = parseInput(rawVal)
    if (markedUnits.has(fullUnitName)) {
      setFeedback({ text: `⚠️ ห้อง '${fullUnitName}' มาร์คไว้ว่ายังไม่มีข้อมูล/กรอกไม่ได้`, type: 'error', visible: true })
      setInputBorder('var(--pink-color)')
    } else if (checkedUnits.has(fullUnitName)) {
      setFeedback({ text: `⚠️ ซ้ำ! ห้อง '${fullUnitName}' ถูกคีย์ไปแล้ว`, type: 'error', visible: true })
      setInputBorder('var(--danger-color)')
    } else {
      setFeedback({ text: `🟢 ห้อง '${fullUnitName}' ยังไม่ถูกบันทึก (กด Enter เพื่อบันทึก)`, type: 'success', visible: true })
      setInputBorder('var(--success-color)')
    }
  }

  const navigateToRoom = (roomId, replace = false) => {
    const url = `/tracker/rooms/${encodeURIComponent(roomId)}`
    if (typeof window !== 'undefined') {
      if (replace) window.history.replaceState({}, '', url)
      else window.history.pushState({}, '', url)
    }
    setCurrentRoomId(String(roomId))
  }

  const navigateToLobby = () => {
    if (typeof window !== 'undefined') window.history.pushState({}, '', '/tracker')
    setCurrentRoomId('')
    setActiveSession(null)
    loadRooms()
  }

  const handleJoinRoom = async (e) => {
    e.preventDefault()
    if (!currentRoomId) return
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

  const highlightUnit = (unitName) => {
    setTimeout(() => {
      const safeId = unitDomSafeId(unitName)
      const id = currentView === 'grid' ? `cell-${safeId}` : `list-item-${safeId}`
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('latest-pulse')
        setTimeout(() => el.classList.remove('latest-pulse'), 900)
      }
    }, 100)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const rawVal = unitInput.trim()
    if (!rawVal) return
    const fullUnitName = parseInput(rawVal)
    if (markedUnits.has(fullUnitName)) {
      showFeedback(`⚠️ ห้อง '${fullUnitName}' มาร์คไว้ว่ายังไม่มีข้อมูล/กรอกไม่ได้ (กรุณาปลดมาร์คก่อน)`, 'error')
      unitInputRef.current?.select()
      setInputBorder('var(--pink-color)')
      return
    }
    if (checkedUnits.has(fullUnitName)) {
      showFeedback(`⚠️ ซ้ำ! ห้อง '${fullUnitName}' ถูกคีย์ไปแล้ว`, 'error')
      unitInputRef.current?.select()
      return
    }
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/units`, { method: 'POST', body: JSON.stringify({ unit: fullUnitName }) })
      setLatestHighlightedUnit(data.unit)
      applyState(data)
      showFeedback(`✅ บันทึก '${data.unit}' สำเร็จ!`, 'success')
      setUnitInput('')
      setInputBorder('')
      unitInputRef.current?.focus()
      highlightUnit(data.unit)
    } catch (err) {
      showFeedback(`⚠️ ${err.message}`, 'error')
      unitInputRef.current?.select()
    }
  }

  const openModal = (unit) => {
    setSelectedUnit(unit)
    setEditMode(false)
    setModalFeedback({ text: '', type: '', visible: false })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelectedUnit(null)
    setEditMode(false)
    setModalFeedback({ text: '', type: '', visible: false })
  }

  const modalStatus = useMemo(() => {
    if (!selectedUnit) return { text: '', color: '', isChecked: false, isMarked: false }
    const isChecked = checkedUnits.has(selectedUnit)
    const isMarked = markedUnits.has(selectedUnit)
    if (isMarked) return { text: '🌸 ยังไม่มีข้อมูล / ยังกรอกไม่ได้', color: 'var(--pink-color)', isChecked, isMarked }
    if (isChecked) return { text: '✅ บันทึกคีย์เรียบร้อยแล้ว', color: 'var(--success-color)', isChecked, isMarked }
    return { text: '❌ ยังไม่ได้คีย์บันทึกคีย์', color: 'var(--danger-color)', isChecked, isMarked }
  }, [selectedUnit, checkedUnits, markedUnits])

  const handleModalToggle = async () => {
    if (!selectedUnit) return
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/units`, { method: 'POST', body: JSON.stringify({ unit: selectedUnit }) })
      setLatestHighlightedUnit(data.unit)
      applyState(data)
      closeModal()
    } catch (err) {
      setModalFeedback({ text: err.message, type: 'error', visible: true })
    }
  }

  const handleModalDelete = async () => {
    if (!selectedUnit) return
    if (!window.confirm(`คุณต้องการยกเลิกการบันทึกคีย์ห้อง ${selectedUnit} ใช่หรือไม่?`)) return
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/units/${encodeURIComponent(selectedUnit)}`, { method: 'DELETE' })
      applyState(data)
      closeModal()
      showFeedback(`🗑️ ยกเลิกการคีย์ห้อง '${selectedUnit}' แล้ว`, 'success')
    } catch (err) {
      setModalFeedback({ text: err.message, type: 'error', visible: true })
    }
  }

  const handleModalMark = async () => {
    if (!selectedUnit) return
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/marked/${encodeURIComponent(selectedUnit)}/toggle`, { method: 'POST' })
      applyState(data)
      closeModal()
      const actionText = data.action === 'unmarked'
        ? `ปลดมาร์คห้อง '${selectedUnit}' แล้ว`
        : `มาร์คห้อง '${selectedUnit}' ว่าไม่มีข้อมูลแล้ว`
      showFeedback(`🌸 ${actionText}`, 'success')
    } catch (err) {
      setModalFeedback({ text: err.message, type: 'error', visible: true })
    }
  }

  const handleSaveEdit = async () => {
    if (!selectedUnit || !editValue.trim()) {
      setModalFeedback({ text: 'กรุณากรอกหมายเลขห้องใหม่', type: 'error', visible: true })
      return
    }
    try {
      const data = await trackerFetch(`/rooms/${encodeURIComponent(activeSession.id)}/units`, {
        method: 'PUT',
        body: JSON.stringify({ old_unit: selectedUnit, new_unit: editValue.trim() }),
      })
      setLatestHighlightedUnit(data.unit)
      applyState(data)
      closeModal()
      showFeedback(`✏️ แก้ไขห้องเป็น '${data.unit}' เรียบร้อย`, 'success')
      highlightUnit(data.unit)
    } catch (err) {
      setModalFeedback({ text: err.message, type: 'error', visible: true })
    }
  }

  const handleSessionChange = async (sessionId) => {
    if (sessionId) navigateToRoom(sessionId)
  }

  const openRoomSettings = () => {
    setRoomNameDraft(activeSession?.name || '')
    setRoomSettingsFeedback({ text: '', type: '', visible: false })
    setRoomSettingsOpen(true)
  }

  const closeRoomSettings = () => {
    setRoomSettingsOpen(false)
    setRoomSettingsFeedback({ text: '', type: '', visible: false })
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
      closeRoomSettings()
      showFeedback('✅ เปลี่ยนชื่อห้องแล้ว', 'success')
    } catch (err) {
      setRoomSettingsFeedback({ text: err.message, type: 'error', visible: true })
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
      closeRoomSettings()
      navigateToLobby()
      showFeedback('🗑️ ลบห้องแล้ว', 'success')
    } catch (err) {
      setRoomSettingsFeedback({ text: err.message, type: 'error', visible: true })
    } finally {
      setRoomActionBusy(false)
    }
  }

  const handleCreateSession = async (e) => {
    e.preventDefault()
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
      showFeedback(`✅ สร้างห้อง '${data.active_room.name}' แล้ว`, 'success')
    } catch (err) {
      setSessionFeedback({ text: err.message, type: 'error', visible: true })
    }
  }

  const joinTargetRoom = sessions.find((room) => room.id === currentRoomId)

  if (!roomsLoaded) {
    return (
      <div className="tracker-auth-screen">
        <div className="tracker-auth-card">
          <div className="auth-spinner" aria-hidden="true" />
          <div className="logo-icon">🏠</div>
          <h1>Unit Key Tracker</h1>
          <p>กำลังโหลดห้อง...</p>
        </div>
      </div>
    )
  }

  if (currentRoomId && !activeSession && roomStateLoading) {
    return (
      <div className="tracker-auth-screen">
        <div className="tracker-auth-card">
          <div className="auth-spinner" aria-hidden="true" />
          <div className="logo-icon">🔐</div>
          <h1>{joinTargetRoom?.name || 'กำลังเข้าห้อง'}</h1>
          <p>กำลังตรวจสอบสิทธิ์เข้าห้อง...</p>
        </div>
      </div>
    )
  }

  if (currentRoomId && !activeSession) {
    return (
      <div className="tracker-auth-screen">
        <form className="tracker-auth-card" onSubmit={handleJoinRoom}>
          <div className="logo-icon">🔑</div>
          <h1>{joinTargetRoom?.name || 'เข้าห้อง'}</h1>
          <p>กรอกรหัสของห้องนี้เพื่อเข้า dashboard</p>
          <input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            placeholder="รหัสห้อง"
            autoFocus
            autoComplete="current-password"
          />
          {joinFeedback ? <div className="tracker-auth-error">{joinFeedback}</div> : null}
          <button type="submit" className="btn btn-success" disabled={joinSubmitting}>
            {joinSubmitting ? 'กำลังเข้าห้อง...' : 'เข้าห้อง'}
          </button>
          <button type="button" className="btn btn-primary" onClick={navigateToLobby}>กลับ Lobby</button>
        </form>
      </div>
    )
  }

  if (!activeSession) {
    return (
      <div className="tracker-lobby">
        <aside className="lobby-sidebar">
          <div className="brand">
            <div className="logo-icon">🔑</div>
            <div className="brand-text">
              <h1>Unit Key Tracker</h1>
              <span className="subtext">Room Lobby</span>
            </div>
          </div>
          <button type="button" className="btn btn-success lobby-create-btn" onClick={() => setSessionModalOpen(true)}>สร้างห้อง</button>
        </aside>
        <main className="lobby-main">
          <header className="lobby-header">
            <div>
              <h1>Active Rooms</h1>
              <p>เลือกห้อง</p>
            </div>
            <span>{filteredSessions.length} / {sessions.length} ห้อง</span>
          </header>
          {sessions.length > 6 ? (
            <div className="search-box lobby-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={lobbySearch}
                onChange={(e) => setLobbySearch(e.target.value)}
                placeholder="ค้นหาชื่อห้อง..."
              />
              {lobbySearch ? (
                <button type="button" className="clear-btn" style={{ display: 'block' }} onClick={() => setLobbySearch('')}>&times;</button>
              ) : null}
            </div>
          ) : null}
          <div className="lobby-grid">
            {filteredSessions.map((room) => (
              <article key={room.id} className="room-card">
                <div className="room-card-head">
                  <h2>{room.name}</h2>
                  <span>OPEN</span>
                </div>
                <div className="room-card-meta">
                  <span>✅ {room.checked_count || 0} / {room.total_rooms}</span>
                  <span>🌸 {room.marked_count || 0}</span>
                </div>
                <p>Prefix: {room.prefix}</p>
                <p>Owner: {room.created_by_guest_name || (room.created_by_user_id ? `User #${room.created_by_user_id}` : 'guest')}</p>
                {room.last_active_at ? <p className="room-card-active">🕓 ใช้งานล่าสุด {formatRelativeTime(room.last_active_at)}</p> : null}
                <button type="button" className="btn btn-primary" onClick={() => navigateToRoom(room.id)}>Join</button>
              </article>
            ))}
          </div>
          {!sessions.length ? <div className="empty-lobby">ยังไม่มีห้อง สร้างห้องแรกได้เลย</div> : null}
          {sessions.length && !filteredSessions.length ? <div className="empty-lobby">ไม่พบห้องที่ตรงกับ &quot;{lobbySearch}&quot;</div> : null}
        </main>
        {sessionModalOpen ? (
          <div
            className="modal active"
            onPointerDown={handleBackdropPointerDown}
            onClick={(e) => handleBackdropClick(e, () => setSessionModalOpen(false))}
          >
            <div className="modal-content glass">
              <span className="close-modal" onClick={() => setSessionModalOpen(false)} role="button" tabIndex={0}>&times;</span>
              <div className="modal-header">
                <span className="modal-icon">🏠</span>
                <h3>สร้างห้องใหม่</h3>
              </div>
              <form id="session-form" onSubmit={handleCreateSession} autoComplete="off">
                <label className="field-label" htmlFor="session-name-input">ชื่อห้อง</label>
                <div className="input-group">
                  <input id="session-name-input" value={sessionForm.name} onChange={(e) => setSessionForm((f) => ({ ...f, name: e.target.value }))} placeholder="เช่น ห้อง 2 - NOOBS ONLY" required />
                </div>
                <label className="field-label" htmlFor="session-password-input">รหัสห้อง</label>
                <div className="input-group">
                  <input id="session-password-input" type="password" value={sessionForm.password} onChange={(e) => setSessionForm((f) => ({ ...f, password: e.target.value }))} placeholder="ตั้งรหัสห้อง" required />
                </div>
                <label className="field-label" htmlFor="session-guest-input">ชื่อผู้สร้าง (guest)</label>
                <div className="input-group">
                  <input id="session-guest-input" value={sessionForm.guest_name} onChange={(e) => setSessionForm((f) => ({ ...f, guest_name: e.target.value }))} placeholder="เช่น Noble" />
                </div>
                <div className="session-form-row">
                  <div>
                    <label className="field-label" htmlFor="session-prefix-input">Prefix</label>
                    <div className="input-group">
                      <input id="session-prefix-input" value={sessionForm.prefix} onChange={(e) => setSessionForm((f) => ({ ...f, prefix: e.target.value }))} placeholder="42/" required />
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="session-total-input">จำนวนห้อง</label>
                    <div className="input-group">
                      <input id="session-total-input" type="number" min="1" max="10000" value={sessionForm.total} onChange={(e) => setSessionForm((f) => ({ ...f, total: e.target.value }))} placeholder="755" required />
                    </div>
                  </div>
                </div>
                {sessionFeedback.visible ? <div className={`feedback-message ${sessionFeedback.type}`}>{sessionFeedback.text}</div> : null}
                <button type="submit" className="btn btn-primary session-submit" style={{ marginTop: 12, width: '100%' }}>สร้างห้อง</button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
    <div className="app-container">
        <aside className="sidebar">
          <div className="brand">
            <div className="logo-icon">🔑</div>
            <div className="brand-text">
              <h1>Unit Key Tracker</h1>
              <span className="subtext">ระบบบันทึกคีย์ห้องชุด</span>
            </div>
          </div>

          <div className="session-bar">
            <button type="button" className="session-new-btn" onClick={navigateToLobby} title="กลับ Lobby">←</button>
            <select
              value={activeSession?.id || ''}
              onChange={(e) => handleSessionChange(e.target.value)}
              aria-label="เลือกห้อง"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button type="button" className="session-new-btn" onClick={openRoomSettings} title="ตั้งค่าห้อง">⚙️</button>
          </div>

          <div className="stats-card">
            <div className="progress-info">
              <div className="progress-text">
                <span className="label">บันทึกคีย์แล้ว</span>
                <span className="percentage">{percentage}%</span>
              </div>
              <span className="count">{count} / {totalRooms} ห้อง</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${Math.min(Number(percentage), 100)}%` }} />
            </div>
            <div className="sync-status">
              <span className={`status-dot ${online ? 'online' : 'offline'}`} />
              <span className="status-text">{online ? 'เชื่อมต่อเซิร์ฟเวอร์แล้ว' : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'}</span>
              {markedCount > 0 ? <span className="marked-count">🌸 {markedCount} ห้อง</span> : null}
            </div>
          </div>

          <div className="card form-card">
            <h2>📥 บันทึกข้อมูลคีย์ใหม่</h2>
            <p className="input-tip">พิมพ์เลขห้องแล้วกด Enter ได้เลย! (เช่น 5 -&gt; {exampleUnit})</p>
            <form onSubmit={handleAdd} autoComplete="off">
              <div className="input-group" style={inputBorder ? { borderColor: inputBorder } : undefined}>
                <span className="prefix">{prefix}</span>
                <input
                  ref={unitInputRef}
                  type="text"
                  value={unitInput}
                  onChange={(e) => handleUnitInput(e.target.value)}
                  placeholder={`เลขห้อง (เช่น ${String(1).padStart(numberWidth(totalRooms), '0')}, ${String(Math.min(150, totalRooms)).padStart(numberWidth(totalRooms), '0')})`}
                  required
                  autoFocus
                />
                <button type="submit" className="btn btn-success">
                  <span className="btn-icon">➕</span> บันทึก
                </button>
              </div>
            </form>
            {feedback.visible ? (
              <div className={`feedback-message ${feedback.type}`}>{feedback.text}</div>
            ) : null}
          </div>

          <div className="card filter-card">
            <h2>🔍 ค้นหาและกรองข้อมูล</h2>
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาหมายเลขห้อง..."
              />
              {searchQuery ? (
                <button type="button" className="clear-btn" style={{ display: 'block' }} onClick={() => setSearchQuery('')}>&times;</button>
              ) : null}
            </div>
            <div className="filter-buttons">
              {[
                ['all', 'ทั้งหมด'],
                ['checked', '✅ บันทึกแล้ว'],
                ['unchecked', '❌ ยังไม่บันทึก'],
                ['marked', '🌸 ไม่มีข้อมูล'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-btn ${currentFilter === key ? 'active' : ''}`}
                  onClick={() => setCurrentFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="footer-info">
            <button type="button" className="session-add-link" onClick={navigateToLobby}>← กลับ Lobby</button>
            <p>Cloudflare Tunnel Active 🌐</p>
            <p>Domain: <span id="domain-display">{typeof window !== 'undefined' ? window.location.hostname : 'key.vxpers.com'}</span></p>
          </div>
        </aside>

        <main id="dashboard" className="dashboard">
          <header className="dashboard-header">
            <div className="title-area">
              <h2>{dashboardTitle}</h2>
              <p className="subtitle">คลิกที่ห้องเพื่อบันทึกหรือจัดการรายละเอียด</p>
            </div>
            <div className="view-toggles">
              <button type="button" className={`toggle-btn ${currentView === 'grid' ? 'active' : ''}`} onClick={() => setCurrentView('grid')}>🔳 ตาราง (Grid)</button>
              <button type="button" className={`toggle-btn ${currentView === 'list' ? 'active' : ''}`} onClick={() => setCurrentView('list')}>📃 รายการ (List)</button>
            </div>
          </header>

          <div className={`room-grid ${currentView === 'grid' ? 'active-view' : ''}`}>
            {filteredUnits.map((unit) => {
              const isChecked = checkedUnits.has(unit)
              const isMarked = markedUnits.has(unit)
              let cellClass = 'unchecked'
              let statusIcon = '❌'
              if (isMarked) { cellClass = 'marked'; statusIcon = '🌸' }
              else if (isChecked) { cellClass = 'checked'; statusIcon = '✅' }
              const displayNum = unit.startsWith(prefix) ? unit.slice(prefix.length) : unit
              const latestClass = unit === latestHighlightedUnit ? ' latest-unit' : ''
              return (
                <div
                  key={unit}
                  id={`cell-${unitDomSafeId(unit)}`}
                  className={`room-cell ${cellClass}${latestClass}`}
                  onClick={() => openModal(unit)}
                  onKeyDown={(e) => e.key === 'Enter' && openModal(unit)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="cell-prefix">{prefix}</span>
                  <span className="cell-number">{displayNum}</span>
                  <span className="status-icon">{statusIcon}</span>
                </div>
              )
            })}
          </div>

          <div className={`room-list ${currentView === 'list' ? 'active-view' : ''}`}>
            {filteredUnits.map((unit) => {
              const isChecked = checkedUnits.has(unit)
              const isMarked = markedUnits.has(unit)
              let itemClass = 'unchecked'
              let itemStatusText = '❌ ยังไม่บันทึก'
              if (isMarked) { itemClass = 'marked'; itemStatusText = '🌸 ไม่มีข้อมูล' }
              else if (isChecked) { itemClass = 'checked'; itemStatusText = '✅ บันทึกแล้ว' }
              const latestClass = unit === latestHighlightedUnit ? ' latest-unit' : ''
              return (
                <div
                  key={unit}
                  id={`list-item-${unitDomSafeId(unit)}`}
                  className={`room-list-item ${itemClass}${latestClass}`}
                  onClick={() => openModal(unit)}
                  onKeyDown={(e) => e.key === 'Enter' && openModal(unit)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="item-title">{unit}</span>
                  <span className="item-status">{itemStatusText}</span>
                </div>
              )
            })}
          </div>
        </main>
      </div>

      <div className="card mobile-form-dock">
        <h2>📥 บันทึกข้อมูลคีย์ใหม่</h2>
        <p className="input-tip">พิมพ์เลขห้องแล้วกด Enter ได้เลย! เช่น 5 → {exampleUnit}</p>
        <form onSubmit={handleAdd} autoComplete="off">
          <div className="input-group" style={inputBorder ? { borderColor: inputBorder } : undefined}>
            <span className="prefix">{prefix}</span>
            <input
              type="text"
              value={unitInput}
              onChange={(e) => handleUnitInput(e.target.value)}
              placeholder={`เลขห้อง เช่น ${String(1).padStart(numberWidth(totalRooms), '0')}`}
              required
            />
            <button type="submit" className="btn btn-success" aria-label="บันทึก">
              <span className="btn-icon">+</span> บันทึก
            </button>
          </div>
        </form>
        {feedback.visible ? (
          <div className={`feedback-message ${feedback.type}`}>{feedback.text}</div>
        ) : null}
      </div>

      {modalOpen ? (
        <div
          className="modal active"
          onPointerDown={handleBackdropPointerDown}
          onClick={(e) => handleBackdropClick(e, closeModal)}
        >
          <div className="modal-content glass">
            <span className="close-modal" onClick={closeModal} onKeyDown={(e) => e.key === 'Enter' && closeModal()} role="button" tabIndex={0}>&times;</span>
            <div className="modal-header">
              <span className="modal-icon">🚪</span>
              <h3>ห้อง {selectedUnit}</h3>
            </div>
            <div className="modal-body">
              <p>สถานะปัจจุบัน: <span style={{ color: modalStatus.color }}>{modalStatus.text}</span></p>
              {editMode ? (
                <div className="edit-section active">
                  <label htmlFor="edit-unit-input">แก้ไขหมายเลขห้อง:</label>
                  <div className="input-group">
                    <span className="prefix">{prefix}</span>
                    <input
                      id="edit-unit-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSaveEdit())}
                    />
                  </div>
                  {modalFeedback.visible ? <div className={`feedback-message ${modalFeedback.type}`}>{modalFeedback.text}</div> : null}
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              {!editMode && !modalStatus.isMarked && !modalStatus.isChecked ? (
                <button type="button" className="btn btn-primary" onClick={handleModalToggle}>✅ บันทึกคีย์</button>
              ) : null}
              {!editMode ? (
                <button type="button" className="btn btn-pink" onClick={handleModalMark}>
                  {modalStatus.isMarked ? '🔓 ปลดมาร์คสีชมพู' : '🌸 มาร์คไม่มีข้อมูล'}
                </button>
              ) : null}
              {!editMode && modalStatus.isChecked ? (
                <>
                  <button type="button" className="btn btn-warning" onClick={() => { setEditMode(true); setEditValue(selectedUnit.startsWith(prefix) ? selectedUnit.slice(prefix.length) : selectedUnit) }}>✏️ แก้ไขเลขห้อง</button>
                  <button type="button" className="btn btn-danger" onClick={handleModalDelete}>🗑️ ยกเลิกการคีย์</button>
                </>
              ) : null}
              {editMode ? (
                <>
                  <button type="button" className="btn btn-success" onClick={handleSaveEdit}>💾 บันทึกที่แก้ไข</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditMode(false)}>ยกเลิก</button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {sessionModalOpen ? (
        <div
          className="modal active"
          onPointerDown={handleBackdropPointerDown}
          onClick={(e) => handleBackdropClick(e, () => setSessionModalOpen(false))}
        >
          <div className="modal-content glass">
            <span className="close-modal" onClick={() => setSessionModalOpen(false)} role="button" tabIndex={0}>&times;</span>
            <div className="modal-header">
              <span className="modal-icon">🗂️</span>
              <h3>สร้างโปรเจกต์ใหม่</h3>
            </div>
            <div className="modal-body">
              <form id="session-form" onSubmit={handleCreateSession} autoComplete="off">
                <label className="field-label" htmlFor="session-name-input">ชื่อ</label>
                <div className="input-group">
                  <input id="session-name-input" value={sessionForm.name} onChange={(e) => setSessionForm((f) => ({ ...f, name: e.target.value }))} placeholder="เช่น อาคาร A" required />
                </div>
                <div className="session-form-row">
                  <div>
                    <label className="field-label" htmlFor="session-prefix-input">Prefix</label>
                    <div className="input-group">
                      <input id="session-prefix-input" value={sessionForm.prefix} onChange={(e) => setSessionForm((f) => ({ ...f, prefix: e.target.value }))} placeholder="42/" required />
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="session-total-input">จำนวนห้อง</label>
                    <div className="input-group">
                      <input id="session-total-input" type="number" min="1" max="10000" value={sessionForm.total} onChange={(e) => setSessionForm((f) => ({ ...f, total: e.target.value }))} placeholder="755" required />
                    </div>
                  </div>
                </div>
                {sessionFeedback.visible ? <div className={`feedback-message ${sessionFeedback.type}`}>{sessionFeedback.text}</div> : null}
                <button type="submit" className="btn btn-primary session-submit" style={{ marginTop: 12, width: '100%' }}>สร้าง</button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {roomSettingsOpen ? (
        <div
          className="modal active"
          onPointerDown={handleBackdropPointerDown}
          onClick={(e) => handleBackdropClick(e, closeRoomSettings)}
        >
          <div className="modal-content glass">
            <span className="close-modal" onClick={closeRoomSettings} role="button" tabIndex={0}>&times;</span>
            <div className="modal-header">
              <span className="modal-icon">⚙️</span>
              <h3>ตั้งค่าห้อง</h3>
            </div>
            <div className="modal-body">
              <form onSubmit={handleRenameRoom} autoComplete="off">
                <label className="field-label" htmlFor="room-name-input">ชื่อห้อง</label>
                <div className="input-group">
                  <input
                    id="room-name-input"
                    value={roomNameDraft}
                    onChange={(e) => setRoomNameDraft(e.target.value)}
                    required
                  />
                </div>
                {roomSettingsFeedback.visible ? <div className={`feedback-message ${roomSettingsFeedback.type}`}>{roomSettingsFeedback.text}</div> : null}
                <button type="submit" className="btn btn-primary session-submit" style={{ marginTop: 12, width: '100%' }} disabled={roomActionBusy}>บันทึกชื่อห้อง</button>
              </form>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-danger" onClick={handleDeleteRoom} disabled={roomActionBusy}>🗑️ ลบห้องนี้</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
