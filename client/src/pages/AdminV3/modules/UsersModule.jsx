import { useState } from 'react'
import UserAvatar from '../../../components/UserAvatar.jsx'
import {
  formatNumber, formatDateTime, getErrorMessage, USER_ROLE_OPTIONS,
} from '../helpers.js'

const ROLE_BADGE = {
  owner:   'text-bg-danger',
  admin:   'text-bg-warning',
  finance: 'text-bg-info',
  support: 'text-bg-primary',
  booster: 'text-bg-success',
  user:    'text-bg-secondary',
}
const ROLE_LABEL = {
  owner: 'Owner', admin: 'Admin', finance: 'Finance',
  support: 'Support', booster: 'Booster', user: 'User',
}
function RoleBadge({ role }) {
  const r = String(role || 'user').toLowerCase()
  return <span className={`badge ${ROLE_BADGE[r] || 'text-bg-secondary'}`}>{ROLE_LABEL[r] || r}</span>
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

  if (!data) return null

  const canEdit = canAction('users.edit')
  const canFinance = canAction('users.adjust_points')
  const users = data.users || []
  const detailUser = detail.data?.user || null

  function patch(obj) { setUsersQuery((prev) => ({ ...prev, ...obj })) }

  const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

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
        email: d?.user?.email || '',
        username: d?.user?.username || '',
        display_name: d?.user?.display_name || '',
        avatar_url: d?.user?.avatar_url || '',
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

  // ── Bulk actions ──
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
      setBulkDraft(prev => ({ ...prev, points: '' }))
      await loadModuleData('users')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  const dd = detail.data
  const snap = dd?.snapshot || {}
  const sec = dd?.security || {}

  return (
    <div className="admin-module admin-users-module">
      {/* ── Toast ── */}
      {actionState.status !== 'idle' && (
        <div className={`alert alert-dismissible fade show mb-3 ${actionState.status === 'error' ? 'alert-danger' : actionState.status === 'success' ? 'alert-success' : 'alert-info'}`} role="alert">
          {actionState.status === 'working' && <span className="spinner-border spinner-border-sm me-2" />}
          {actionState.message}
          <button type="button" className="btn-close" onClick={() => setActionState({ status: 'idle', message: '' })} />
        </div>
      )}

      {/* ── Summary cards ── */}
      {data.summary && (
        <div className="row g-3 mb-3">
          {[
            { label: 'ผู้ใช้ทั้งหมด', val: data.summary.total, icon: 'bi-people-fill', bg: 'bg-primary' },
            { label: 'ปกติ',          val: data.summary.active, icon: 'bi-person-check-fill', bg: 'bg-success' },
            { label: 'แบนอยู่',       val: data.summary.banned, icon: 'bi-person-x-fill', bg: 'bg-danger' },
            { label: 'แต้มรวม',       val: data.summary.total_balance, icon: 'bi-coin', bg: 'bg-warning' },
          ].map((c, i) => (
            <div className="col-6 col-md-3" key={i}>
              <div className="small-box text-white" style={{ background: 'var(--bs-' + c.bg.replace('bg-','') + ')' }}>
                <div className="inner">
                  <h3>{formatNumber(c.val)}</h3>
                  <p>{c.label}</p>
                </div>
                <div className="small-box-icon"><i className={`bi ${c.icon}`} /></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {selection.length > 0 && (
        <div className="card mb-3 border-primary">
          <div className="card-body py-2">
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="badge text-bg-primary fs-6">{selection.length} คนที่เลือก</span>
              <div className="d-flex gap-1 align-items-center">
                <select className="form-select form-select-sm" style={{ width: 'auto' }} value={bulkDraft.role} onChange={(e) => setBulkDraft(p => ({ ...p, role: e.target.value }))}>
                  {USER_ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
                </select>
                <button className="btn btn-outline-primary btn-sm" onClick={bulkRole} disabled={!canEdit}>
                  <i className="bi bi-shield me-1" />ตั้งสิทธิ์
                </button>
              </div>
              <div className="d-flex gap-1 align-items-center">
                <input type="number" className="form-control form-control-sm" style={{ width: 90 }} placeholder="แต้ม ±" value={bulkDraft.points} onChange={(e) => setBulkDraft(p => ({ ...p, points: e.target.value }))} />
                <input type="text" className="form-control form-control-sm" style={{ width: 130 }} placeholder="เหตุผล" value={bulkDraft.reason} onChange={(e) => setBulkDraft(p => ({ ...p, reason: e.target.value }))} />
                <button className="btn btn-outline-success btn-sm" onClick={bulkPoints} disabled={!canFinance}>
                  <i className="bi bi-coin me-1" />ปรับแต้ม
                </button>
              </div>
              <button className="btn btn-outline-secondary btn-sm ms-auto" onClick={() => setSelection([])}>ยกเลิกการเลือก</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="card mb-3">
        <div className="card-body py-2">
          <div className="row g-2">
            <div className="col-md-4">
              <input type="text" className="form-control form-control-sm" placeholder="ค้นหาชื่อ, email, username, ID..." value={usersQuery.search} onChange={(e) => patch({ search: e.target.value, page: 1 })} />
            </div>
            <div className="col-6 col-md-2">
              <select className="form-select form-select-sm" value={usersQuery.role} onChange={(e) => patch({ role: e.target.value, page: 1 })}>
                <option value="all">ทุกสิทธิ์</option>
                {USER_ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
              </select>
            </div>
            <div className="col-6 col-md-2">
              <select className="form-select form-select-sm" value={usersQuery.status} onChange={(e) => patch({ status: e.target.value, page: 1 })}>
                <option value="all">ทุกสถานะ</option>
                <option value="active">ปกติ</option>
                <option value="banned">แบนอยู่</option>
              </select>
            </div>
            <div className="col-6 col-md-2">
              <select className="form-select form-select-sm" value={usersQuery.sort} onChange={(e) => patch({ sort: e.target.value, page: 1 })}>
                <option value="created_desc">สมัครล่าสุด</option>
                <option value="created_asc">สมัครเก่าสุด</option>
                <option value="points_desc">แต้มมากสุด</option>
                <option value="spend_desc">ใช้จ่ายมากสุด</option>
                <option value="orders_desc">ออเดอร์มากสุด</option>
              </select>
            </div>
            <div className="col-6 col-md-2">
              <button className="btn btn-outline-secondary btn-sm w-100" onClick={() => loadModuleData('users')}>
                <i className="bi bi-arrow-clockwise me-1" />โหลดใหม่
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        {/* ── Users table ── */}
        <div className={detailUser ? 'col-xl-6' : 'col-12'}>
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title">ผู้ใช้ทั้งหมด <span className="badge text-bg-secondary ms-1">{formatNumber(data.total)}</span></h3>
            </div>
            <div className="card-body p-0" style={{ overflowX: 'auto' }}>
              <table className="table table-hover table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" className="form-check-input" checked={selection.length === users.length && users.length > 0} onChange={(e) => setSelection(e.target.checked ? users.map(u => u.id) : [])} />
                    </th>
                    <th>ผู้ใช้</th>
                    <th>สิทธิ์</th>
                    <th>แต้ม</th>
                    <th>สถานะ</th>
                    <th className="d-none d-lg-table-cell">สมัคร</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} role="button" onClick={() => openDetail(u.id)} className={detail.userId === u.id ? 'table-active' : ''}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="form-check-input" checked={selection.includes(u.id)} onChange={(e) => setSelection(p => e.target.checked ? [...p, u.id] : p.filter(id => id !== u.id))} />
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <UserAvatar user={u} size={34} rounded="full" status={u.is_banned ? 'banned' : 'active'} />
                          <div className="min-w-0">
                            <div className="fw-semibold lh-sm" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {u.display_name || u.username || '—'}
                            </div>
                            <small className="text-secondary" style={{ fontSize: 11 }}>{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td><RoleBadge role={u.role} /></td>
                      <td><span className="fw-semibold">{formatNumber(u.balance ?? u.points)}</span></td>
                      <td>
                        {u.is_banned
                          ? <span className="badge text-bg-danger">แบน</span>
                          : <span className="badge text-bg-success">ปกติ</span>}
                      </td>
                      <td className="d-none d-lg-table-cell"><small className="text-secondary">{formatDateTime(u.created_at)}</small></td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-secondary py-5">ไม่พบผู้ใช้</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.totalPages > 1 && (
              <div className="card-footer py-2">
                <nav aria-label="pagination">
                  <ul className="pagination pagination-sm justify-content-center mb-0">
                    <li className={`page-item ${data.page <= 1 ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => patch({ page: data.page - 1 })}>«</button>
                    </li>
                    {Array.from({ length: Math.min(data.totalPages, 10) }, (_, i) => {
                      const p = i + 1
                      return (
                        <li key={p} className={`page-item ${data.page === p ? 'active' : ''}`}>
                          <button className="page-link" onClick={() => patch({ page: p })}>{p}</button>
                        </li>
                      )
                    })}
                    <li className={`page-item ${data.page >= data.totalPages ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => patch({ page: data.page + 1 })}>»</button>
                    </li>
                  </ul>
                </nav>
              </div>
            )}
          </div>
        </div>

        {/* ── Detail panel ── */}
        {(detail.status === 'loading' || detailUser) && (
          <div className="col-xl-6">
            <div className="card card-outline card-primary h-100">
              {/* Header */}
              <div className="card-header">
                {detail.status === 'loading' ? (
                  <h3 className="card-title"><span className="spinner-border spinner-border-sm me-2" />กำลังโหลด...</h3>
                ) : (
                  <h3 className="card-title d-flex align-items-center gap-2">
                    <UserAvatar user={detailUser} size={30} rounded="full" status={detailUser?.is_banned ? 'banned' : 'active'} />
                    <span className="text-truncate" style={{ maxWidth: 200 }}>{detailUser?.display_name || detailUser?.username || detailUser?.email}</span>
                    <RoleBadge role={detailUser?.role} />
                    {detailUser?.is_banned && <span className="badge text-bg-danger">แบน</span>}
                  </h3>
                )}
                <div className="card-tools">
                  <button className="btn btn-tool" onClick={closeDetail}><i className="bi bi-x-lg" /></button>
                </div>
              </div>

              {detailUser && (
                <>
                  {/* Tab nav */}
                  <div className="card-header p-0 border-bottom-0">
                    <ul className="nav nav-tabs" style={{ borderBottom: 'none' }}>
                      {[
                        { id: 'profile',  label: 'โปรไฟล์',  icon: 'bi-person' },
                        { id: 'points',   label: 'แต้ม',      icon: 'bi-coin' },
                        { id: 'security', label: 'ความปลอดภัย', icon: 'bi-shield-lock' },
                        { id: 'orders',   label: 'ออเดอร์',  icon: 'bi-bag' },
                        { id: 'activity', label: 'ประวัติ',   icon: 'bi-clock-history' },
                      ].map(t => (
                        <li className="nav-item" key={t.id}>
                          <button
                            className={`nav-link py-2 px-3 ${detailTab === t.id ? 'active' : ''}`}
                            style={{ fontSize: 13 }}
                            onClick={() => { setDetailTab(t.id); if (t.id === 'orders' && userOrders.length === 0) { setTimeout(() => { const uid = detail.userId; if (uid) { setOrdersLoading(true); fetchJson(`/api/admin/users/${uid}/orders?limit=100`).then(r => setUserOrders(Array.isArray(r?.orders) ? r.orders : [])).catch(() => setUserOrders([])).finally(() => setOrdersLoading(false)) } }, 0) } }}
                          >
                            <i className={`bi ${t.icon} me-1`} />{t.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="card-body" style={{ overflowY: 'auto', maxHeight: 520 }}>

                    {/* ── Tab: Profile ── */}
                    {detailTab === 'profile' && (
                      <div>
                        <div className="row g-2 mb-3 p-2 rounded" style={{ background: 'var(--bs-tertiary-bg)' }}>
                          <div className="col-6 text-center">
                            <div className="small text-secondary">แต้มคงเหลือ</div>
                            <div className="fw-bold fs-5">{formatNumber(detailUser.balance)}</div>
                          </div>
                          <div className="col-6 text-center">
                            <div className="small text-secondary">ออเดอร์ทั้งหมด</div>
                            <div className="fw-bold fs-5">{formatNumber(snap.transactions_total ?? detailUser.orders_count)}</div>
                          </div>
                        </div>

                        <div className="mb-2">
                          <label className="form-label form-label-sm fw-semibold mb-1">Email</label>
                          <input className="form-control form-control-sm" value={profileDraft.email} onChange={(e) => setProfileDraft(p => ({ ...p, email: e.target.value }))} disabled={!canEdit} />
                        </div>
                        <div className="mb-2">
                          <label className="form-label form-label-sm fw-semibold mb-1">Username</label>
                          <input className="form-control form-control-sm" value={profileDraft.username} onChange={(e) => setProfileDraft(p => ({ ...p, username: e.target.value }))} disabled={!canEdit} />
                          <div className="form-text" style={{ fontSize: 11 }}>6+ ตัวอักษร, ใช้ได้เฉพาะ a-z A-Z 0-9 . - _</div>
                        </div>
                        <div className="mb-2">
                          <label className="form-label form-label-sm fw-semibold mb-1">ชื่อแสดง</label>
                          <input className="form-control form-control-sm" value={profileDraft.display_name} onChange={(e) => setProfileDraft(p => ({ ...p, display_name: e.target.value }))} disabled={!canEdit} />
                        </div>
                        <div className="mb-3">
                          <label className="form-label form-label-sm fw-semibold mb-1">Avatar URL</label>
                          <input className="form-control form-control-sm" value={profileDraft.avatar_url} onChange={(e) => setProfileDraft(p => ({ ...p, avatar_url: e.target.value }))} disabled={!canEdit} />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={saveProfile} disabled={!canEdit}>
                          <i className="bi bi-floppy me-1" />บันทึกโปรไฟล์
                        </button>

                        <hr className="my-3" />

                        <div className="mb-2">
                          <label className="form-label form-label-sm fw-semibold mb-1">
                            <i className="bi bi-shield me-1" />สิทธิ์ / Role
                          </label>
                          <div className="d-flex gap-2 align-items-center">
                            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={detailUser.role} onChange={(e) => applyRole(detailUser.id, e.target.value)} disabled={!canEdit}>
                              {USER_ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
                            </select>
                            <RoleBadge role={detailUser.role} />
                          </div>
                          <div className="form-text" style={{ fontSize: 11 }}>
                            owner › admin › finance / support / booster › user
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Tab: Points ── */}
                    {detailTab === 'points' && (
                      <div>
                        <div className="row g-2 mb-3 p-2 rounded" style={{ background: 'var(--bs-tertiary-bg)' }}>
                          <div className="col-4 text-center">
                            <div className="small text-secondary">แต้มคงเหลือ</div>
                            <div className="fw-bold fs-5 text-success">{formatNumber(detailUser.balance)}</div>
                          </div>
                          <div className="col-4 text-center">
                            <div className="small text-secondary">รับเข้าทั้งหมด</div>
                            <div className="fw-bold">{formatNumber(snap.transactions_credit_points)}</div>
                          </div>
                          <div className="col-4 text-center">
                            <div className="small text-secondary">ใช้ไปทั้งหมด</div>
                            <div className="fw-bold">{formatNumber(snap.transactions_debit_points)}</div>
                          </div>
                        </div>

                        {canFinance && (
                          <div className="card border mb-3">
                            <div className="card-header py-2"><strong className="small">ปรับแต้ม</strong></div>
                            <div className="card-body py-2">
                              <div className="row g-2">
                                <div className="col-5">
                                  <label className="form-label form-label-sm">จำนวน (+ หรือ -)</label>
                                  <input type="number" className="form-control form-control-sm" placeholder="เช่น 500 หรือ -100" value={pointsDraft.amount} onChange={(e) => setPointsDraft(p => ({ ...p, amount: e.target.value }))} />
                                </div>
                                <div className="col-7">
                                  <label className="form-label form-label-sm">เหตุผล</label>
                                  <input type="text" className="form-control form-control-sm" placeholder="เช่น คืนแต้มโปรโมชั่น" value={pointsDraft.reason} onChange={(e) => setPointsDraft(p => ({ ...p, reason: e.target.value }))} />
                                </div>
                              </div>
                              <div className="mt-2 d-flex gap-2">
                                <button className="btn btn-success btn-sm" onClick={submitAdjustPoints} disabled={!pointsDraft.amount || Number(pointsDraft.amount) === 0}>
                                  <i className="bi bi-check-lg me-1" />ยืนยันปรับแต้ม
                                </button>
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => setPointsDraft({ amount: '', reason: '' })}>ล้าง</button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="small fw-semibold mb-1 text-secondary">ประวัติธุรกรรมล่าสุด</div>
                        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                          <table className="table table-sm table-striped mb-0" style={{ fontSize: 12 }}>
                            <thead className="table-light"><tr><th>ประเภท</th><th>แต้ม</th><th>อ้างอิง</th><th>วันที่</th></tr></thead>
                            <tbody>
                              {(dd?.transactions || []).map(tx => (
                                <tr key={tx.id}>
                                  <td><span className={`badge ${tx.type === 'credit' ? 'text-bg-success' : 'text-bg-danger'}`}>{tx.type}</span></td>
                                  <td className={tx.type === 'credit' ? 'text-success' : 'text-danger'}>{tx.type === 'credit' ? '+' : '-'}{formatNumber(tx.points)}</td>
                                  <td className="text-secondary" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txRefLabel(tx.ref_type)}</td>
                                  <td className="text-secondary">{formatDateTime(tx.created_at)}</td>
                                </tr>
                              ))}
                              {!(dd?.transactions?.length) && <tr><td colSpan={4} className="text-center text-secondary">ไม่มีธุรกรรม</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── Tab: Security ── */}
                    {detailTab === 'security' && (
                      <div>
                        <div className="row g-2 mb-3 p-2 rounded" style={{ background: 'var(--bs-tertiary-bg)' }}>
                          <div className="col-6">
                            <div className="small text-secondary">เซสชันที่ใช้งานอยู่</div>
                            <div className="fw-bold">{sec.active_sessions ?? 0} / {sec.total_sessions ?? 0}</div>
                          </div>
                          <div className="col-6">
                            <div className="small text-secondary">สถานะบัญชี</div>
                            <div>{detailUser.is_banned ? <span className="badge text-bg-danger fs-6">แบนอยู่</span> : <span className="badge text-bg-success fs-6">ปกติ</span>}</div>
                          </div>
                          <div className="col-6">
                            <div className="small text-secondary">สิทธิ์ปัจจุบัน</div>
                            <div><RoleBadge role={detailUser.role} /></div>
                          </div>
                          <div className="col-6">
                            <div className="small text-secondary">เข้าสู่ระบบล่าสุด</div>
                            <div className="small">{sec.last_session_at ? formatDateTime(sec.last_session_at) : '—'}</div>
                          </div>
                        </div>

                        <div className="mb-3">
                          <label className="form-label form-label-sm fw-semibold">รีเซ็ตรหัสผ่าน</label>
                          <div className="input-group input-group-sm">
                            <input type="text" className="form-control" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" value={passwordDraft} onChange={(e) => setPasswordDraft(e.target.value)} disabled={!canEdit} />
                            <button className="btn btn-outline-warning" onClick={resetPassword} disabled={!canEdit || passwordDraft.length < 8}>
                              <i className="bi bi-key me-1" />รีเซ็ต
                            </button>
                          </div>
                        </div>

                        <div className="d-flex flex-wrap gap-2 mb-3">
                          <button className="btn btn-outline-secondary btn-sm" onClick={revokeSessions} disabled={!canEdit}>
                            <i className="bi bi-box-arrow-right me-1" />ยกเลิกเซสชันทั้งหมด
                          </button>
                          <button
                            className={`btn btn-sm ${detailUser.is_banned ? 'btn-success' : 'btn-outline-warning'}`}
                            onClick={() => toggleBan(detailUser.id, !detailUser.is_banned)}
                            disabled={!canEdit}
                          >
                            <i className={`bi ${detailUser.is_banned ? 'bi-person-check' : 'bi-person-slash'} me-1`} />
                            {detailUser.is_banned ? 'ปลดแบน' : 'แบนผู้ใช้'}
                          </button>
                        </div>

                        <hr className="my-3" />
                        <div className="small fw-semibold text-danger mb-2"><i className="bi bi-exclamation-triangle me-1" />Danger Zone</div>
                        {!deleteConfirm ? (
                          <button className="btn btn-outline-danger btn-sm" onClick={() => setDeleteConfirm(true)} disabled={!canEdit}>
                            <i className="bi bi-trash me-1" />ลบบัญชีผู้ใช้นี้
                          </button>
                        ) : (
                          <div className="alert alert-danger p-2">
                            <div className="mb-2 fw-semibold small">⚠️ ยืนยันการลบ <strong>{detailUser.display_name || detailUser.email}</strong>?</div>
                            <div className="d-flex gap-2">
                              <button className="btn btn-danger btn-sm" onClick={deleteUser}>ยืนยันลบ</button>
                              <button className="btn btn-outline-secondary btn-sm" onClick={() => setDeleteConfirm(false)}>ยกเลิก</button>
                            </div>
                          </div>
                        )}

                        <div className="mt-3 small fw-semibold mb-1 text-secondary">เซสชันที่เปิดอยู่</div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                            <thead className="table-light"><tr><th>Token (บางส่วน)</th><th>เปิดเมื่อ</th></tr></thead>
                            <tbody>
                              {(dd?.sessions || []).map((s, i) => (
                                <tr key={i}>
                                  <td className="font-monospace">{String(s.token || '').slice(0, 12)}…</td>
                                  <td>{formatDateTime(s.created_at)}</td>
                                </tr>
                              ))}
                              {!(dd?.sessions?.length) && <tr><td colSpan={2} className="text-center text-secondary">ไม่มีเซสชัน</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── Tab: Orders ── */}
                    {detailTab === 'orders' && (
                      <div>
                        <div className="d-flex gap-2 mb-3">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="ค้นหา Ref ID หรือชื่อสินค้า..."
                            value={ordersSearch}
                            onChange={(e) => setOrdersSearch(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') loadUserOrders() }}
                          />
                          <button className="btn btn-primary btn-sm" onClick={loadUserOrders} disabled={ordersLoading}>
                            <i className="bi bi-search" />
                          </button>
                        </div>
                        {ordersLoading && <div className="text-center text-secondary py-3"><i className="bi bi-arrow-repeat spin" /> กำลังโหลด...</div>}
                        {!ordersLoading && (
                          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                            <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
                              <thead className="table-light">
                                <tr>
                                  <th>Product / สินค้า</th>
                                  <th>ID / รหัสอ้างอิง</th>
                                  <th>Purchase At / วันที่สั่งซื้อ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {userOrders.map((o) => (
                                  <tr key={o.order_item_id}>
                                    <td>
                                      <div className="d-flex align-items-center gap-2">
                                        {o.product_image_url
                                          ? <img src={o.product_image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                                          : <div style={{ width: 36, height: 36, borderRadius: 4, background: '#eee' }} className="d-flex align-items-center justify-content-center"><i className="bi bi-box text-secondary" /></div>}
                                        <div>
                                          <div className="fw-semibold text-truncate" style={{ maxWidth: 200 }}>{o.product_name}</div>
                                          <div className="text-secondary" style={{ fontSize: 10 }}>{o.product_option ? JSON.parse(o.product_option)?.label || 'ตัวเลือกเริ่มต้น' : 'ตัวเลือกเริ่มต้น'}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td><code className="text-primary" style={{ fontSize: 11 }}>{o.ref || `#${o.order_id}`}</code></td>
                                    <td className="text-secondary">{formatDateTime(o.created_at)}</td>
                                  </tr>
                                ))}
                                {userOrders.length === 0 && <tr><td colSpan={3} className="text-center text-secondary py-3">ไม่มีออเดอร์</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Tab: Activity ── */}
                    {detailTab === 'activity' && (
                      <div>
                        <div className="row g-2 mb-3 p-2 rounded" style={{ background: 'var(--bs-tertiary-bg)' }}>
                          <div className="col-4 text-center">
                            <div className="small text-secondary">เติมเงินทั้งหมด</div>
                            <div className="fw-bold">{snap.topups_total ?? 0}</div>
                          </div>
                          <div className="col-4 text-center">
                            <div className="small text-secondary">อนุมัติแล้ว</div>
                            <div className="fw-bold text-success">{snap.topups_approved ?? 0}</div>
                          </div>
                          <div className="col-4 text-center">
                            <div className="small text-secondary">รอดำเนินการ</div>
                            <div className="fw-bold text-warning">{snap.topups_pending ?? 0}</div>
                          </div>
                        </div>

                        <div className="small fw-semibold mb-1 text-secondary">ประวัติการเติมเงิน</div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }} className="mb-3">
                          <table className="table table-sm table-striped mb-0" style={{ fontSize: 11 }}>
                            <thead className="table-light"><tr><th>จำนวน</th><th>วิธี</th><th>สถานะ</th><th>วันที่</th></tr></thead>
                            <tbody>
                              {(dd?.topups || []).map(t => (
                                <tr key={t.id}>
                                  <td>{formatNumber(t.amount)} ฿</td>
                                  <td>{t.method || t.provider}</td>
                                  <td><span className={`badge ${t.status === 'approved' ? 'text-bg-success' : t.status === 'pending' ? 'text-bg-warning' : 'text-bg-secondary'}`}>{t.status}</span></td>
                                  <td>{formatDateTime(t.created_at)}</td>
                                </tr>
                              ))}
                              {!(dd?.topups?.length) && <tr><td colSpan={4} className="text-center text-secondary">ไม่มีประวัติ</td></tr>}
                            </tbody>
                          </table>
                        </div>

                        <div className="small fw-semibold mb-1 text-secondary">Audit Log</div>
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                            <thead className="table-light"><tr><th>Action</th><th>ผู้ดำเนินการ</th><th>วันที่</th></tr></thead>
                            <tbody>
                              {(dd?.audits || []).map(a => (
                                <tr key={a.id}>
                                  <td className="font-monospace">{a.action}</td>
                                  <td className="text-secondary">{a.actor_username || a.actor_email}</td>
                                  <td className="text-secondary">{formatDateTime(a.created_at)}</td>
                                </tr>
                              ))}
                              {!(dd?.audits?.length) && <tr><td colSpan={3} className="text-center text-secondary">ไม่มี audit log</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
