import { useState } from 'react'
import UserAvatar from '../../../components/UserAvatar.jsx'
import {
  formatNumber, formatDateTime, getErrorMessage, USER_ROLE_OPTIONS,
} from '../helpers.js'

const ROLE_TONE = {
  owner: 'crit', admin: 'warn', finance: 'accent', support: 'accent', booster: 'ok', user: 'neutral',
}
const ROLE_LABEL = {
  owner: 'Owner', admin: 'Admin', finance: 'Finance', support: 'Support', booster: 'Booster', user: 'User',
}
function RoleBadge({ role }) {
  const r = String(role || 'user').toLowerCase()
  const tone = ROLE_TONE[r] || 'neutral'
  return <span className={`lgx-pill ${tone === 'accent' ? '' : tone}`} style={tone === 'accent' ? { background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' } : undefined}>{ROLE_LABEL[r] || r}</span>
}

const TX_REF_LABEL = {
  purchase: 'ซื้อสินค้า',
  coupon: 'ใช้คูปอง',
  farm_cancel: 'ยกเลิกการฟาร์ม',
  angpao_voucher: 'เติมเงิน (อั่งเปา)',
  admin_approve: 'เติมเงิน (อนุมัติโดยแอดมิน)',
  webhook: 'เติมเงิน (อัตโนมัติ)',
  admin_adjust: 'ปรับแต้มโดยแอดมิน',
  points_adjustment: 'ปรับแต้มโดยแอดมิน',
}
function txRefLabel(ref_type) {
  return TX_REF_LABEL[String(ref_type || '')] || String(ref_type || '-')
}

const DETAIL_TABS = [
  { id: 'profile', label: 'โปรไฟล์', icon: 'bi-person' },
  { id: 'points', label: 'แต้ม', icon: 'bi-coin' },
  { id: 'security', label: 'ความปลอดภัย', icon: 'bi-shield-lock' },
  { id: 'orders', label: 'ออเดอร์', icon: 'bi-bag' },
  { id: 'activity', label: 'ประวัติ', icon: 'bi-clock-history' },
]

export default function UsersModule({ data, ctx }) {
  const { usersQuery, setUsersQuery, canAction, loadModuleData, fetchJson } = ctx
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [detail, setDetail] = useState({ status: 'idle', userId: null, data: null })
  const [detailTab, setDetailTab] = useState('profile')
  const [profileDraft, setProfileDraft] = useState({ email: '', username: '', display_name: '', avatar_url: '' })
  const [passwordDraft, setPasswordDraft] = useState('')
  const [pointsDraft, setPointsDraft] = useState({ amount: '', reason: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [selection, setSelection] = useState([])
  const [bulkDraft, setBulkDraft] = useState({ role: 'user', points: '', reason: 'ปรับแต้มแบบหมู่' })
  const [userOrders, setUserOrders] = useState([])
  const [ordersSearch, setOrdersSearch] = useState('')
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [pointModal, setPointModal] = useState({
    open: false, user: null, mode: 'add', amount: '', reason: 'เติมเงินระบบ (โอนเงิน)', loading: false,
  })

  if (!data) return null

  const canEdit = canAction('users.edit')
  const canFinance = canAction('users.adjust_points')
  const users = data.users || []
  const detailUser = detail.data?.user || null

  function patch(obj) { setUsersQuery((prev) => ({ ...prev, ...obj })) }

  const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  function openPointModal(u, defaultMode = 'add') {
    const defaultReason = defaultMode === 'add' ? 'เติมเงินระบบ (โอนเงิน)' : defaultMode === 'sub' ? 'หักแต้มสินค้า / ค่าบริการ' : 'ปรับยอดแต้มคงเหลือ'
    setPointModal({ open: true, user: u, mode: defaultMode, amount: '', reason: defaultReason, loading: false })
  }

  function closePointModal() {
    setPointModal({ open: false, user: null, mode: 'add', amount: '', reason: '', loading: false })
  }

  async function handleConfirmPointModal() {
    if (!pointModal.user) return
    const rawAmount = Number(pointModal.amount)
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      setActionState({ status: 'error', message: 'กรุณากรอกจำนวนแต้มที่ถูกต้องมากกว่า 0' })
      return
    }
    const currentBal = Number(pointModal.user.balance ?? pointModal.user.points ?? 0)
    let delta = 0
    if (pointModal.mode === 'add') delta = rawAmount
    else if (pointModal.mode === 'sub') delta = -rawAmount
    else if (pointModal.mode === 'set') delta = rawAmount - currentBal

    if (delta === 0) {
      setActionState({ status: 'error', message: 'ยอดแต้มใหม่เท่ากับยอดเดิม ไม่มีการเปลี่ยนแปลง' })
      return
    }

    setPointModal((prev) => ({ ...prev, loading: true }))
    try {
      const reason = (pointModal.reason || '').trim() || (delta > 0 ? 'เติมเงินโดยแอดมิน' : 'หักแต้มโดยแอดมิน')
      await fetchJson(`/api/admin/users/${pointModal.user.id}/points`, json({ points: delta, reason }))
      setActionState({
        status: 'success',
        message: `ปรับแต้มให้ ${pointModal.user.display_name || pointModal.user.username} เรียบร้อย: ${delta > 0 ? '+' : ''}${formatNumber(delta)} แต้ม (ยอดคงเหลือใหม่: ${formatNumber(currentBal + delta)} แต้ม)`,
      })
      const targetId = pointModal.user.id
      closePointModal()
      await loadModuleData('users')
      if (detail.userId === targetId) await openDetail(targetId)
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
      setPointModal((prev) => ({ ...prev, loading: false }))
    }
  }

  async function openDetail(userId) {
    const uid = Number(userId)
    if (!Number.isFinite(uid) || uid <= 0) return
    setDetail({ status: 'loading', userId: uid, data: null })
    setDetailTab('profile')
    setDeleteConfirm(false)
    try {
      const d = await fetchJson(`/api/admin/users/${uid}/management-detail`)
      setDetail({ status: 'ready', userId: uid, data: d })
      setProfileDraft({
        email: d?.user?.email || '', username: d?.user?.username || '',
        display_name: d?.user?.display_name || '', avatar_url: d?.user?.avatar_url || '',
      })
      setPasswordDraft('')
      setPointsDraft({ amount: '', reason: '' })
    } catch (err) {
      setDetail({ status: 'error', userId: uid, data: null })
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
  }

  function closeDetail() {
    setDetail({ status: 'idle', userId: null, data: null })
    setDeleteConfirm(false)
    setUserOrders([])
    setOrdersSearch('')
  }

  async function loadUserOrders() {
    const uid = detail.userId
    if (!uid) return
    setOrdersLoading(true)
    try {
      const q = ordersSearch.trim() ? `&search=${encodeURIComponent(ordersSearch.trim())}` : ''
      const res = await fetchJson(`/api/admin/users/${uid}/orders?limit=100${q}`)
      setUserOrders(Array.isArray(res?.orders) ? res.orders : [])
    } catch { setUserOrders([]) }
    setOrdersLoading(false)
  }

  function openOrdersTab() {
    setDetailTab('orders')
    if (userOrders.length === 0) {
      const uid = detail.userId
      if (!uid) return
      setOrdersLoading(true)
      fetchJson(`/api/admin/users/${uid}/orders?limit=100`)
        .then((r) => setUserOrders(Array.isArray(r?.orders) ? r.orders : []))
        .catch(() => setUserOrders([]))
        .finally(() => setOrdersLoading(false))
    }
  }

  async function applyRole(userId, role) {
    try {
      setActionState({ status: 'working', message: 'กำลังอัปเดตสิทธิ์...' })
      await fetchJson(`/api/admin/users/${userId}/role`, json({ role }))
      setActionState({ status: 'success', message: 'อัปเดตสิทธิ์เรียบร้อย' })
      await loadModuleData('users')
      await openDetail(userId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function toggleBan(userId, nextBanned) {
    try {
      setActionState({ status: 'working', message: nextBanned ? 'กำลังแบน...' : 'กำลังปลดแบน...' })
      await fetchJson(`/api/admin/users/${userId}/${nextBanned ? 'ban' : 'unban'}`, { method: 'POST' })
      setActionState({ status: 'success', message: nextBanned ? 'แบนเรียบร้อย' : 'ปลดแบนเรียบร้อย' })
      await loadModuleData('users')
      await openDetail(userId)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function submitAdjustPoints() {
    const uid = detail.userId
    if (!uid) return
    const points = Number(pointsDraft.amount)
    if (!Number.isFinite(points) || points === 0) {
      setActionState({ status: 'error', message: 'กรุณาระบุจำนวนแต้มที่ถูกต้อง' })
      return
    }
    const reason = pointsDraft.reason.trim() || 'ปรับโดยแอดมิน'
    try {
      setActionState({ status: 'working', message: 'กำลังปรับแต้ม...' })
      await fetchJson(`/api/admin/users/${uid}/points`, json({ points, reason }))
      setActionState({ status: 'success', message: `ปรับแต้ม ${points > 0 ? '+' : ''}${points} เรียบร้อย` })
      setPointsDraft({ amount: '', reason: '' })
      await loadModuleData('users')
      await openDetail(uid)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function saveProfile() {
    const uid = detail.userId
    if (!uid) return
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึก...' })
      await fetchJson(`/api/admin/users/${uid}/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profileDraft) })
      setActionState({ status: 'success', message: 'บันทึกโปรไฟล์เรียบร้อย' })
      await loadModuleData('users')
      await openDetail(uid)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function resetPassword() {
    const uid = detail.userId
    if (!uid || passwordDraft.length < 8) return
    try {
      setActionState({ status: 'working', message: 'กำลังรีเซ็ตรหัสผ่าน...' })
      await fetchJson(`/api/admin/users/${uid}/password`, json({ password: passwordDraft }))
      setActionState({ status: 'success', message: 'รีเซ็ตรหัสผ่านเรียบร้อย' })
      setPasswordDraft('')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function revokeSessions() {
    const uid = detail.userId
    if (!uid) return
    try {
      setActionState({ status: 'working', message: 'กำลังยกเลิกเซสชัน...' })
      await fetchJson(`/api/admin/users/${uid}/revoke-sessions`, { method: 'POST' })
      setActionState({ status: 'success', message: 'ยกเลิกเซสชันเรียบร้อย' })
      await openDetail(uid)
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function deleteUser() {
    const uid = detail.userId
    if (!uid) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบผู้ใช้...' })
      await fetchJson(`/api/admin/users/${uid}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบผู้ใช้เรียบร้อย' })
      closeDetail()
      await loadModuleData('users')
    } catch (err) {
      setDeleteConfirm(false)
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
  }

  async function bulkRole() {
    const ids = selection.filter(Boolean)
    if (ids.length < 1) return
    try {
      setActionState({ status: 'working', message: `กำลังตั้งค่าสิทธิ์ ${ids.length} คน...` })
      for (const uid of ids) await fetchJson(`/api/admin/users/${uid}/role`, json({ role: bulkDraft.role }))
      setActionState({ status: 'success', message: `อัปเดตสิทธิ์ ${ids.length} คน เรียบร้อย` })
      setSelection([])
      await loadModuleData('users')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function bulkPoints() {
    const ids = selection.filter(Boolean)
    const points = Number(bulkDraft.points)
    if (ids.length < 1 || !Number.isFinite(points) || points === 0) return
    try {
      setActionState({ status: 'working', message: `กำลังปรับแต้ม ${ids.length} คน...` })
      for (const uid of ids) await fetchJson(`/api/admin/users/${uid}/points`, json({ points, reason: bulkDraft.reason || 'admin_bulk' }))
      setActionState({ status: 'success', message: `ปรับแต้ม ${ids.length} คน เรียบร้อย` })
      setSelection([])
      setBulkDraft((prev) => ({ ...prev, points: '' }))
      await loadModuleData('users')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  const dd = detail.data
  const snap = dd?.snapshot || {}
  const sec = dd?.security || {}
  const bannerTone = actionState.status === 'error' ? 'crit' : actionState.status === 'success' ? 'ok' : 'info'

  return (
    <>
      {actionState.status !== 'idle' && (
        <div className={`lgx-banner ${bannerTone}`}>
          <span>{actionState.status === 'working' ? <i className="bi bi-arrow-repeat" style={{ marginRight: 6 }} /> : null}{actionState.message}</span>
          <button type="button" className="lgx-banner-close" onClick={() => setActionState({ status: 'idle', message: '' })}>×</button>
        </div>
      )}

      {data.summary && (
        <div className="lgx-strip">
          <div className="lgx-stat"><div className="l">ผู้ใช้ทั้งหมด</div><div className="v">{formatNumber(data.summary.total)}</div><div className="d">บัญชีทั้งหมดในระบบ</div></div>
          <div className="lgx-stat"><div className="l">สถานะปกติ</div><div className="v">{formatNumber(data.summary.active)}</div><div className="d">ใช้งานได้ตามปกติ</div></div>
          <div className="lgx-stat"><div className="l">บัญชีที่แบนอยู่</div><div className={`v${data.summary.banned > 0 ? ' crit' : ''}`}>{formatNumber(data.summary.banned)}</div><div className="d">{data.summary.banned > 0 ? `${formatNumber(data.summary.banned)} บัญชีถูกระงับ` : 'ไม่มีบัญชีถูกแบน'}</div></div>
          <div className="lgx-stat"><div className="l">แต้มรวมทั้งระบบ</div><div className="v">{formatNumber(data.summary.total_balance)}</div><div className="d">ยอดหมุนเวียนคงเหลือ</div></div>
        </div>
      )}

      {selection.length > 0 && (
        <div className="lgx-panel" style={{ borderColor: 'var(--lgx-accent)' }}>
          <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span className="lgx-pill" style={{ background: 'var(--lgx-accent-soft)', color: 'var(--lgx-accent)' }}>{selection.length} คนที่เลือก</span>
            <select className="lgx-select" style={{ width: 'auto' }} value={bulkDraft.role} onChange={(e) => setBulkDraft((p) => ({ ...p, role: e.target.value }))}>
              {USER_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
            </select>
            <button type="button" className="lgx-btn" onClick={bulkRole} disabled={!canEdit}><i className="bi bi-shield" />ตั้งสิทธิ์</button>
            <input type="number" className="lgx-input" style={{ width: 90 }} placeholder="แต้ม ±" value={bulkDraft.points} onChange={(e) => setBulkDraft((p) => ({ ...p, points: e.target.value }))} />
            <input type="text" className="lgx-input" style={{ width: 150 }} placeholder="เหตุผล" value={bulkDraft.reason} onChange={(e) => setBulkDraft((p) => ({ ...p, reason: e.target.value }))} />
            <button type="button" className="lgx-btn lgx-btn-ok" onClick={bulkPoints} disabled={!canFinance}><i className="bi bi-coin" />ปรับแต้ม</button>
            <button type="button" className="lgx-btn" style={{ marginLeft: 'auto' }} onClick={() => setSelection([])}>ยกเลิกการเลือก</button>
          </div>
        </div>
      )}

      <div className="lgx-panel">
        <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input type="text" className="lgx-input" style={{ flex: '1 1 220px', maxWidth: 320 }} placeholder="ค้นหาชื่อ, email, username, ID..." value={usersQuery.search} onChange={(e) => patch({ search: e.target.value, page: 1 })} />
          <select className="lgx-select" style={{ width: 'auto' }} value={usersQuery.role} onChange={(e) => patch({ role: e.target.value, page: 1 })}>
            <option value="all">ทุกสิทธิ์</option>
            {USER_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
          </select>
          <select className="lgx-select" style={{ width: 'auto' }} value={usersQuery.status} onChange={(e) => patch({ status: e.target.value, page: 1 })}>
            <option value="all">ทุกสถานะ</option>
            <option value="active">ปกติ</option>
            <option value="banned">แบนอยู่</option>
          </select>
          <select className="lgx-select" style={{ width: 'auto' }} value={usersQuery.sort} onChange={(e) => patch({ sort: e.target.value, page: 1 })}>
            <option value="created_desc">สมัครล่าสุด</option>
            <option value="created_asc">สมัครเก่าสุด</option>
            <option value="points_desc">แต้มมากสุด</option>
            <option value="spend_desc">ใช้จ่ายมากสุด</option>
            <option value="orders_desc">ออเดอร์มากสุด</option>
          </select>
          <button type="button" className="lgx-btn" style={{ marginLeft: 'auto' }} onClick={() => loadModuleData('users')}><i className="bi bi-arrow-clockwise" />โหลดใหม่</button>
        </div>
      </div>

      <div className="lgx-detail-grid" style={{ gridTemplateColumns: detailUser || detail.status === 'loading' ? '1.1fr 1fr' : '1fr' }}>
        <div className="lgx-panel">
          <div className="lgx-panel-head">
            <h2>ผู้ใช้ทั้งหมด</h2>
            <span>{formatNumber(data.total)} คน</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="lgx-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" checked={selection.length === users.length && users.length > 0} onChange={(e) => setSelection(e.target.checked ? users.map((u) => u.id) : [])} />
                  </th>
                  <th>ผู้ใช้</th>
                  <th>สิทธิ์</th>
                  <th>แต้มคงเหลือ</th>
                  <th>สถานะ</th>
                  <th>สมัครเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ cursor: 'pointer', background: detail.userId === u.id ? 'var(--lgx-accent-soft)' : undefined }} onClick={() => openDetail(u.id)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selection.includes(u.id)} onChange={(e) => setSelection((p) => (e.target.checked ? [...p, u.id] : p.filter((id) => id !== u.id)))} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <UserAvatar user={u} size={32} rounded="full" status={u.is_banned ? 'banned' : 'active'} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.display_name || u.username || '—'}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><RoleBadge role={u.role} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono" style={{ fontWeight: 700 }}>{formatNumber(u.balance ?? u.points)}</span>
                        {canFinance && (
                          <button type="button" className="lgx-icon-action" style={{ width: 24, height: 24 }} title="ปรับแต้มให้ผู้ใช้คนนี้ทันที" onClick={(e) => { e.stopPropagation(); openPointModal(u, 'add') }}>
                            <i className="bi bi-plus-slash-minus" style={{ fontSize: 11 }} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td>{u.is_banned ? <span className="lgx-pill crit">แบน</span> : <span className="lgx-pill ok">ปกติ</span>}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(u.created_at)}</td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={6} className="lgx-empty">ไม่พบผู้ใช้</td></tr>}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="lgx-panel-head" style={{ borderTop: '1.5px solid var(--lgx-border)', borderBottom: 'none' }}>
              <span>หน้า {data.page} / {data.totalPages}</span>
              <div className="lgx-btn-group">
                <button type="button" className="lgx-icon-action" disabled={data.page <= 1} onClick={() => patch({ page: 1 })}><i className="bi bi-chevron-double-left" /></button>
                <button type="button" className="lgx-icon-action" disabled={data.page <= 1} onClick={() => patch({ page: data.page - 1 })}><i className="bi bi-chevron-left" /></button>
                <button type="button" className="lgx-icon-action" disabled={data.page >= data.totalPages} onClick={() => patch({ page: data.page + 1 })}><i className="bi bi-chevron-right" /></button>
                <button type="button" className="lgx-icon-action" disabled={data.page >= data.totalPages} onClick={() => patch({ page: data.totalPages })}><i className="bi bi-chevron-double-right" /></button>
              </div>
            </div>
          )}
        </div>

        {(detail.status === 'loading' || detailUser) && (
          <div className="lgx-panel">
            <div className="lgx-panel-head">
              {detail.status === 'loading' ? (
                <h2><i className="bi bi-hourglass-split" style={{ marginRight: 6 }} />กำลังโหลด...</h2>
              ) : (
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserAvatar user={detailUser} size={26} rounded="full" status={detailUser?.is_banned ? 'banned' : 'active'} />
                  <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailUser?.display_name || detailUser?.username || detailUser?.email}</span>
                  <RoleBadge role={detailUser?.role} />
                </h2>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {canFinance && detailUser && (
                  <button type="button" className="lgx-btn" onClick={() => openPointModal(detailUser, 'add')} title="ปรับแต้มให้ผู้ใช้คนนี้"><i className="bi bi-coin" />ปรับแต้ม</button>
                )}
                <button type="button" className="lgx-icon-action" onClick={closeDetail}><i className="bi bi-x-lg" /></button>
              </div>
            </div>

            {detailUser && (
              <>
                <div className="lgx-inline-tabs" style={{ padding: '0 18px' }}>
                  {DETAIL_TABS.map((t) => (
                    <button key={t.id} type="button" className={`lgx-inline-tab${detailTab === t.id ? ' is-active' : ''}`} onClick={() => (t.id === 'orders' ? openOrdersTab() : setDetailTab(t.id))}>
                      <i className={`bi ${t.icon}`} style={{ marginRight: 5 }} />{t.label}
                    </button>
                  ))}
                </div>

                <div className="lgx-panel-body" style={{ maxHeight: 560, overflowY: 'auto' }}>
                  {detailTab === 'profile' && (
                    <div>
                      <div className="lgx-mini-stats" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
                        <div className="lgx-mini-stat"><div className="l">แต้มคงเหลือ</div><div className="v">{formatNumber(detailUser.balance)}</div></div>
                        <div className="lgx-mini-stat"><div className="l">ออเดอร์ทั้งหมด</div><div className="v">{formatNumber(snap.transactions_total ?? detailUser.orders_count)}</div></div>
                      </div>

                      <div className="lgx-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                        <div className="lgx-field"><label>Email</label><input className="lgx-input" value={profileDraft.email} onChange={(e) => setProfileDraft((p) => ({ ...p, email: e.target.value }))} disabled={!canEdit} /></div>
                        <div className="lgx-field">
                          <label>Username</label>
                          <input className="lgx-input" value={profileDraft.username} onChange={(e) => setProfileDraft((p) => ({ ...p, username: e.target.value }))} disabled={!canEdit} />
                          <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>6+ ตัวอักษร, ใช้ได้เฉพาะ a-z A-Z 0-9 . - _</span>
                        </div>
                        <div className="lgx-field"><label>ชื่อแสดง</label><input className="lgx-input" value={profileDraft.display_name} onChange={(e) => setProfileDraft((p) => ({ ...p, display_name: e.target.value }))} disabled={!canEdit} /></div>
                        <div className="lgx-field"><label>Avatar URL</label><input className="lgx-input" value={profileDraft.avatar_url} onChange={(e) => setProfileDraft((p) => ({ ...p, avatar_url: e.target.value }))} disabled={!canEdit} /></div>
                      </div>
                      <button type="button" className="lgx-btn lgx-btn-accent" style={{ marginTop: 12 }} onClick={saveProfile} disabled={!canEdit}><i className="bi bi-floppy" />บันทึกโปรไฟล์</button>

                      <div style={{ borderTop: '1.5px solid var(--lgx-border)', margin: '16px 0' }} />

                      <div className="lgx-field">
                        <label><i className="bi bi-shield" style={{ marginRight: 4 }} />สิทธิ์ / Role</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select className="lgx-select" style={{ width: 'auto' }} value={detailUser.role} onChange={(e) => applyRole(detailUser.id, e.target.value)} disabled={!canEdit}>
                            {USER_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
                          </select>
                          <RoleBadge role={detailUser.role} />
                        </div>
                        <span style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>owner › admin › finance / support / booster › user</span>
                      </div>
                    </div>
                  )}

                  {detailTab === 'points' && (
                    <div>
                      <div className="lgx-mini-stats" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 14 }}>
                        <div className="lgx-mini-stat"><div className="l">แต้มคงเหลือ</div><div className="v" style={{ color: 'var(--lgx-ok)' }}>{formatNumber(detailUser.balance)}</div></div>
                        <div className="lgx-mini-stat"><div className="l">รับเข้าทั้งหมด</div><div className="v">{formatNumber(snap.transactions_credit_points)}</div></div>
                        <div className="lgx-mini-stat"><div className="l">ใช้ไปทั้งหมด</div><div className="v">{formatNumber(snap.transactions_debit_points)}</div></div>
                      </div>

                      {canFinance && (
                        <div className="lgx-panel" style={{ marginBottom: 14 }}>
                          <div className="lgx-panel-head"><h2 style={{ fontStyle: 'normal', fontSize: 13 }}><i className="bi bi-coin" style={{ marginRight: 5 }} />ปรับแต้มด่วน</h2><span>ยอดปัจจุบัน {formatNumber(detailUser.balance)}</span></div>
                          <div className="lgx-panel-body">
                            <div className="lgx-chip-row" style={{ marginBottom: 10 }}>
                              {['+50', '+100', '+300', '+500', '+1000', '+5000', '-50', '-100', '-500'].map((chip) => (
                                <button key={chip} type="button" className={`lgx-chip${pointsDraft.amount === chip.replace('+', '') ? ' is-active' : ''}`} onClick={() => setPointsDraft((p) => ({ ...p, amount: chip.replace('+', '') }))}>{chip}</button>
                              ))}
                            </div>
                            <div className="lgx-form-grid" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
                              <div className="lgx-field"><label>จำนวน (+ หรือ -)</label><input type="number" className="lgx-input" placeholder="เช่น 500 หรือ -100" value={pointsDraft.amount} onChange={(e) => setPointsDraft((p) => ({ ...p, amount: e.target.value }))} /></div>
                              <div className="lgx-field"><label>เหตุผล</label><input type="text" className="lgx-input" placeholder="เช่น คืนแต้ม, เติมเงินมือ" value={pointsDraft.reason} onChange={(e) => setPointsDraft((p) => ({ ...p, reason: e.target.value }))} /></div>
                            </div>
                            <div className="lgx-chip-row" style={{ marginTop: 8 }}>
                              {['เติมเงินระบบ', 'ของรางวัลกิจกรรม', 'ชดเชยระบบ', 'แก้ไขข้อผิดพลาด', 'หักแต้มสินค้า'].map((r) => (
                                <button key={r} type="button" className="lgx-chip" onClick={() => setPointsDraft((p) => ({ ...p, reason: r }))}>{r}</button>
                              ))}
                            </div>
                            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                              <button type="button" className="lgx-btn lgx-btn-accent" onClick={submitAdjustPoints} disabled={!pointsDraft.amount || Number(pointsDraft.amount) === 0}>
                                <i className="bi bi-check-lg" />ยืนยัน ({pointsDraft.amount ? `${Number(pointsDraft.amount) > 0 ? '+' : ''}${pointsDraft.amount}` : '0'})
                              </button>
                              <button type="button" className="lgx-btn" onClick={() => setPointsDraft({ amount: '', reason: '' })}>ล้างค่า</button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', marginBottom: 6 }}>ประวัติธุรกรรมล่าสุด</div>
                      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                        <table className="lgx-table">
                          <thead><tr><th>ประเภท</th><th>แต้ม</th><th>อ้างอิง</th><th>วันที่</th></tr></thead>
                          <tbody>
                            {(dd?.transactions || []).map((tx) => (
                              <tr key={tx.id}>
                                <td><span className={`lgx-pill ${tx.type === 'credit' ? 'ok' : 'crit'}`}>{tx.type}</span></td>
                                <td style={{ color: tx.type === 'credit' ? 'var(--lgx-ok)' : 'var(--lgx-crit)', fontWeight: 700 }}>{tx.type === 'credit' ? '+' : '-'}{formatNumber(tx.points)}</td>
                                <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--lgx-text-muted)' }}>{txRefLabel(tx.ref_type)}</td>
                                <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(tx.created_at)}</td>
                              </tr>
                            ))}
                            {!(dd?.transactions?.length) && <tr><td colSpan={4} className="lgx-empty">ไม่มีธุรกรรม</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {detailTab === 'security' && (
                    <div>
                      <div className="lgx-mini-stats" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
                        <div className="lgx-mini-stat" style={{ textAlign: 'left' }}><div className="l">เซสชันที่ใช้งานอยู่</div><div className="v">{sec.active_sessions ?? 0} / {sec.total_sessions ?? 0}</div></div>
                        <div className="lgx-mini-stat" style={{ textAlign: 'left' }}><div className="l">สถานะบัญชี</div><div style={{ marginTop: 4 }}>{detailUser.is_banned ? <span className="lgx-pill crit">แบนอยู่</span> : <span className="lgx-pill ok">ปกติ</span>}</div></div>
                        <div className="lgx-mini-stat" style={{ textAlign: 'left' }}><div className="l">สิทธิ์ปัจจุบัน</div><div style={{ marginTop: 4 }}><RoleBadge role={detailUser.role} /></div></div>
                        <div className="lgx-mini-stat" style={{ textAlign: 'left' }}><div className="l">เข้าสู่ระบบล่าสุด</div><div className="v" style={{ fontSize: 12 }}>{sec.last_session_at ? formatDateTime(sec.last_session_at) : '—'}</div></div>
                      </div>

                      <div className="lgx-field" style={{ marginBottom: 14 }}>
                        <label>รีเซ็ตรหัสผ่าน</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input type="text" className="lgx-input" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" value={passwordDraft} onChange={(e) => setPasswordDraft(e.target.value)} disabled={!canEdit} />
                          <button type="button" className="lgx-btn" onClick={resetPassword} disabled={!canEdit || passwordDraft.length < 8}><i className="bi bi-key" />รีเซ็ต</button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                        <button type="button" className="lgx-btn" onClick={revokeSessions} disabled={!canEdit}><i className="bi bi-box-arrow-right" />ยกเลิกเซสชันทั้งหมด</button>
                        <button type="button" className="lgx-btn" onClick={() => toggleBan(detailUser.id, !detailUser.is_banned)} disabled={!canEdit}>
                          <i className={`bi ${detailUser.is_banned ? 'bi-person-check' : 'bi-person-slash'}`} />{detailUser.is_banned ? 'ปลดแบน' : 'แบนผู้ใช้'}
                        </button>
                      </div>

                      <div style={{ borderTop: '1.5px solid var(--lgx-border)', margin: '14px 0' }} />
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-crit)', marginBottom: 8 }}><i className="bi bi-exclamation-triangle" style={{ marginRight: 4 }} />Danger Zone</div>
                      {!deleteConfirm ? (
                        <button type="button" className="lgx-btn" style={{ borderColor: 'var(--lgx-crit)', color: 'var(--lgx-crit)' }} onClick={() => setDeleteConfirm(true)} disabled={!canEdit}><i className="bi bi-trash" />ลบบัญชีผู้ใช้นี้</button>
                      ) : (
                        <div className="lgx-banner crit" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                          <span>ยืนยันการลบ <strong>{detailUser.display_name || detailUser.email}</strong>?</span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="lgx-btn" style={{ background: 'var(--lgx-crit)', borderColor: 'var(--lgx-crit)', color: '#fff' }} onClick={deleteUser}>ยืนยันลบ</button>
                            <button type="button" className="lgx-btn" onClick={() => setDeleteConfirm(false)}>ยกเลิก</button>
                          </div>
                        </div>
                      )}

                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', margin: '16px 0 6px' }}>เซสชันที่เปิดอยู่</div>
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        <table className="lgx-table">
                          <thead><tr><th>Token (บางส่วน)</th><th>เปิดเมื่อ</th></tr></thead>
                          <tbody>
                            {(dd?.sessions || []).map((s, i) => (
                              <tr key={i}><td className="mono">{String(s.token || '').slice(0, 12)}…</td><td className="mono" style={{ fontSize: 11 }}>{formatDateTime(s.created_at)}</td></tr>
                            ))}
                            {!(dd?.sessions?.length) && <tr><td colSpan={2} className="lgx-empty">ไม่มีเซสชัน</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {detailTab === 'orders' && (
                    <div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                        <input type="text" className="lgx-input" placeholder="ค้นหา Ref ID หรือชื่อสินค้า..." value={ordersSearch} onChange={(e) => setOrdersSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadUserOrders() }} />
                        <button type="button" className="lgx-btn lgx-btn-accent" onClick={loadUserOrders} disabled={ordersLoading}><i className="bi bi-search" /></button>
                      </div>
                      {ordersLoading ? <div className="lgx-empty">กำลังโหลด...</div> : (
                        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                          <table className="lgx-table">
                            <thead><tr><th>สินค้า</th><th>รหัสอ้างอิง</th><th>วันที่สั่งซื้อ</th></tr></thead>
                            <tbody>
                              {userOrders.map((o) => (
                                <tr key={o.order_item_id}>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      {o.product_image_url ? <img src={o.product_image_url} alt="" className="lgx-thumb" style={{ width: 32, height: 32 }} /> : <div className="lgx-thumb-empty" style={{ width: 32, height: 32 }}><i className="bi bi-box" style={{ fontSize: 12 }} /></div>}
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.product_name}</div>
                                        <div style={{ fontSize: 10, color: 'var(--lgx-text-muted)' }}>{o.product_option ? JSON.parse(o.product_option)?.label || 'ตัวเลือกเริ่มต้น' : 'ตัวเลือกเริ่มต้น'}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="mono" style={{ color: 'var(--lgx-accent)' }}>{o.ref || `#${o.order_id}`}</td>
                                  <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(o.created_at)}</td>
                                </tr>
                              ))}
                              {userOrders.length === 0 && <tr><td colSpan={3} className="lgx-empty">ไม่มีออเดอร์</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'activity' && (
                    <div>
                      <div className="lgx-mini-stats" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 14 }}>
                        <div className="lgx-mini-stat"><div className="l">เติมเงินทั้งหมด</div><div className="v">{snap.topups_total ?? 0}</div></div>
                        <div className="lgx-mini-stat"><div className="l">อนุมัติแล้ว</div><div className="v" style={{ color: 'var(--lgx-ok)' }}>{snap.topups_approved ?? 0}</div></div>
                        <div className="lgx-mini-stat"><div className="l">รอดำเนินการ</div><div className="v" style={{ color: 'var(--lgx-warn)' }}>{snap.topups_pending ?? 0}</div></div>
                      </div>

                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', marginBottom: 6 }}>ประวัติการเติมเงิน</div>
                      <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 14 }}>
                        <table className="lgx-table">
                          <thead><tr><th>จำนวน</th><th>วิธี</th><th>สถานะ</th><th>วันที่</th></tr></thead>
                          <tbody>
                            {(dd?.topups || []).map((t) => (
                              <tr key={t.id}>
                                <td>{formatNumber(t.amount)} ฿</td>
                                <td>{t.method || t.provider}</td>
                                <td><span className={`lgx-pill ${t.status === 'approved' ? 'ok' : t.status === 'pending' ? 'warn' : 'neutral'}`}>{t.status}</span></td>
                                <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(t.created_at)}</td>
                              </tr>
                            ))}
                            {!(dd?.topups?.length) && <tr><td colSpan={4} className="lgx-empty">ไม่มีประวัติ</td></tr>}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--lgx-text-muted)', marginBottom: 6 }}>Audit Log</div>
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        <table className="lgx-table">
                          <thead><tr><th>Action</th><th>ผู้ดำเนินการ</th><th>วันที่</th></tr></thead>
                          <tbody>
                            {(dd?.audits || []).map((a) => (
                              <tr key={a.id}><td className="mono">{a.action}</td><td style={{ color: 'var(--lgx-text-muted)' }}>{a.actor_username || a.actor_email}</td><td className="mono" style={{ fontSize: 11 }}>{formatDateTime(a.created_at)}</td></tr>
                            ))}
                            {!(dd?.audits?.length) && <tr><td colSpan={3} className="lgx-empty">ไม่มี audit log</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {pointModal.open && pointModal.user && (() => {
        const curBal = Number(pointModal.user.balance ?? pointModal.user.points ?? 0)
        const amt = Number(pointModal.amount || 0)
        let projectedBal = curBal
        let projectedDelta = 0
        if (pointModal.mode === 'add') { projectedDelta = amt; projectedBal = curBal + amt }
        else if (pointModal.mode === 'sub') { projectedDelta = -amt; projectedBal = Math.max(0, curBal - amt) }
        else if (pointModal.mode === 'set') { projectedDelta = amt - curBal; projectedBal = amt }

        return (
          <div className="lgx-modal-backdrop" onClick={closePointModal}>
            <div className="lgx-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="lgx-modal-head">
                <div>
                  <div style={{ fontWeight: 700 }}><i className="bi bi-coin" style={{ marginRight: 6, color: 'var(--lgx-warn)' }} />จัดการพอยท์ผู้ใช้</div>
                  <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>รวดเร็ว แม่นยำ แสดงยอดคำนวณสด</div>
                </div>
                <button type="button" className="lgx-icon-action" onClick={closePointModal}><i className="bi bi-x-lg" /></button>
              </div>

              <div className="lgx-modal-body">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 'var(--lgx-radius)', background: 'var(--lgx-surface-alt)', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UserAvatar user={pointModal.user} size={34} rounded="full" status={pointModal.user.is_banned ? 'banned' : 'active'} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pointModal.user.display_name || pointModal.user.username}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{pointModal.user.email}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>แต้มปัจจุบัน</div>
                    <div className="mono" style={{ fontWeight: 700 }}>{formatNumber(curBal)}</div>
                  </div>
                </div>

                <div className="lgx-segmented" style={{ marginBottom: 14 }}>
                  <button type="button" className={`lgx-segmented-btn${pointModal.mode === 'add' ? ' is-active' : ''}`} onClick={() => setPointModal((p) => ({ ...p, mode: 'add', reason: p.reason === 'หักแต้มสินค้า / ค่าบริการ' || p.reason === 'ปรับยอดแต้มคงเหลือ' ? 'เติมเงินระบบ (โอนเงิน)' : p.reason }))}>
                    <i className="bi bi-plus-circle-fill" />เพิ่มแต้ม
                  </button>
                  <button type="button" className={`lgx-segmented-btn${pointModal.mode === 'sub' ? ' is-active' : ''}`} onClick={() => setPointModal((p) => ({ ...p, mode: 'sub', reason: p.reason === 'เติมเงินระบบ (โอนเงิน)' || p.reason === 'ปรับยอดแต้มคงเหลือ' ? 'หักแต้มสินค้า / ค่าบริการ' : p.reason }))}>
                    <i className="bi bi-dash-circle-fill" />ลด/หักแต้ม
                  </button>
                  <button type="button" className={`lgx-segmented-btn${pointModal.mode === 'set' ? ' is-active' : ''}`} onClick={() => setPointModal((p) => ({ ...p, mode: 'set', reason: 'ปรับยอดแต้มคงเหลือ' }))}>
                    <i className="bi bi-bullseye" />กำหนดตรง
                  </button>
                </div>

                <div className="lgx-field" style={{ marginBottom: 10 }}>
                  <label>{pointModal.mode === 'add' ? 'จำนวนแต้มที่ต้องการเพิ่ม' : pointModal.mode === 'sub' ? 'จำนวนแต้มที่ต้องการหัก' : 'ยอดแต้มคงเหลือใหม่'}</label>
                  <input type="number" min="1" className="lgx-input" style={{ fontSize: 16, fontWeight: 700 }} placeholder="ระบุจำนวนแต้ม เช่น 100, 500" value={pointModal.amount} onChange={(e) => setPointModal((p) => ({ ...p, amount: e.target.value }))} autoFocus />
                </div>

                <div className="lgx-chip-row" style={{ marginBottom: 14 }}>
                  {pointModal.mode === 'add' && ['50', '100', '200', '300', '500', '1000', '2500', '5000', '10000'].map((val) => (
                    <button key={val} type="button" className={`lgx-chip${pointModal.amount === val ? ' is-active' : ''}`} onClick={() => setPointModal((p) => ({ ...p, amount: val }))}>+{formatNumber(Number(val))}</button>
                  ))}
                  {pointModal.mode === 'sub' && ['50', '100', '200', '300', '500', '1000', '2500', '5000', String(curBal)].map((val) => (
                    <button key={val} type="button" className={`lgx-chip${pointModal.amount === val ? ' is-active' : ''}`} onClick={() => setPointModal((p) => ({ ...p, amount: val }))}>{val === String(curBal) ? 'หักหมด (0)' : `-${formatNumber(Number(val))}`}</button>
                  ))}
                  {pointModal.mode === 'set' && ['0', '100', '500', '1000', '2500', '5000', '10000'].map((val) => (
                    <button key={val} type="button" className={`lgx-chip${pointModal.amount === val ? ' is-active' : ''}`} onClick={() => setPointModal((p) => ({ ...p, amount: val }))}>={formatNumber(Number(val))}</button>
                  ))}
                </div>

                {amt > 0 && (
                  <div className="lgx-preview-box" style={{ marginBottom: 14 }}>
                    <span>ยอดเดิม: <strong>{formatNumber(curBal)}</strong></span>
                    <span style={{ fontWeight: 700, color: projectedDelta > 0 ? 'var(--lgx-ok)' : projectedDelta < 0 ? 'var(--lgx-crit)' : 'var(--lgx-text-muted)' }}>{projectedDelta > 0 ? `+${formatNumber(projectedDelta)}` : projectedDelta < 0 ? formatNumber(projectedDelta) : '0'}</span>
                    <span>ยอดใหม่: <strong>{formatNumber(projectedBal)}</strong></span>
                  </div>
                )}

                <div className="lgx-field">
                  <label>เหตุผล / บันทึกกำกับ</label>
                  <input type="text" className="lgx-input" placeholder="เช่น เติมเงินมือ, กิจกรรม, ชดเชยระบบ" value={pointModal.reason} onChange={(e) => setPointModal((p) => ({ ...p, reason: e.target.value }))} />
                  <div className="lgx-chip-row" style={{ marginTop: 8 }}>
                    {['เติมเงินระบบ (โอนเงิน)', 'กิจกรรม / แจกรางวัล', 'ชดเชยระบบ', 'แก้ไขแต้มผิดพลาด', 'หักค่าบริการ / สินค้า', 'ยกเลิกรายการ / รีฟันด์'].map((r) => (
                      <button key={r} type="button" className="lgx-chip" onClick={() => setPointModal((p) => ({ ...p, reason: r }))}>{r}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lgx-modal-foot">
                <button type="button" className="lgx-btn" onClick={closePointModal} disabled={pointModal.loading}>ยกเลิก</button>
                <button type="button" className={`lgx-btn ${pointModal.mode === 'sub' ? '' : 'lgx-btn-accent'}`} style={pointModal.mode === 'sub' ? { background: 'var(--lgx-crit)', borderColor: 'var(--lgx-crit)', color: '#fff' } : undefined} onClick={handleConfirmPointModal} disabled={pointModal.loading || !pointModal.amount || Number(pointModal.amount) <= 0}>
                  {pointModal.loading ? <><i className="bi bi-arrow-repeat" />กำลังดำเนินการ...</> : <><i className="bi bi-check-circle-fill" />ยืนยัน {amt > 0 ? `(${pointModal.mode === 'add' ? '+' : pointModal.mode === 'sub' ? '-' : '='}${formatNumber(amt)})` : ''}</>}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
