import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import UserAvatar from '../../../components/UserAvatar.jsx'

export default function TopBar({
  onBrandClick,
  search,
  onSearchChange,
  isStaff,
  clockedIn,
  clockLoading,
  clockMenuOpen,
  setClockMenuOpen,
  clockMenuRef,
  autoRemain,
  formatClockRemain,
  onClockIn,
  onClockOut,
  notifItems,
  notifUnread,
  notifOpen,
  setNotifOpen,
  notifRef,
  onNotifOpen,
  onMarkAllRead,
  onMarkOneRead,
  onNotifItemLink,
  displayName,
  role,
  meUser,
  onLogout,
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    if (!userMenuOpen) return
    function onClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [userMenuOpen])

  return (
    <div className="lgx-topbar">
      <button type="button" className="lgx-brand" onClick={onBrandClick}>
        <span className="lgx-brand-mark">VX</span>
        <span>
          <span className="lgx-brand-name" style={{ display: 'block' }}>VXPERS Ledger</span>
          <span className="lgx-brand-sub" style={{ display: 'block' }}>ADMIN CONSOLE</span>
        </span>
      </button>

      <div className="lgx-topbar-right">
        <label className="lgx-search">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m16 16-3.2-3.2" />
          </svg>
          <input
            type="search"
            placeholder="ค้นหาเมนู..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>

        {isStaff && (
          <div className="lgx-dropdown-wrap" ref={clockMenuRef}>
            {clockedIn ? (
              <button type="button" className="lgx-clock-btn is-on" onClick={onClockOut} disabled={clockLoading} title="ออกงาน (Clock Out)">
                <i className="bi bi-clock-fill" />
                <span className="value">{clockLoading ? '...' : autoRemain != null && autoRemain > 0 ? formatClockRemain(autoRemain) : 'ออกงาน'}</span>
              </button>
            ) : (
              <button type="button" className="lgx-clock-btn" onClick={() => setClockMenuOpen((v) => !v)} disabled={clockLoading} title="เข้างาน (Clock In)">
                <i className="bi bi-clock" />
                <span className="value">{clockLoading ? '...' : 'เข้างาน'}</span>
              </button>
            )}
            {clockMenuOpen && !clockedIn && (
              <div className="lgx-dropdown" style={{ minWidth: 200 }}>
                <div className="lgx-dropdown-head">เลือกระยะเวลาเข้างาน</div>
                <button type="button" className="lgx-dropdown-item" onClick={() => onClockIn(null)}>
                  <i className="bi bi-infinity" />ไม่กำหนด (ออกเอง)
                </button>
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((h) => (
                  <button key={h} type="button" className="lgx-dropdown-item" onClick={() => onClockIn(h * 60)}>
                    <i className="bi bi-alarm" />{h} ชั่วโมง
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isStaff && (
          <div className="lgx-dropdown-wrap" ref={notifRef}>
            <button
              type="button"
              className="lgx-icon-btn"
              onClick={() => { setNotifOpen((p) => !p); if (!notifOpen) onNotifOpen() }}
              title="แจ้งเตือน"
            >
              <i className="bi bi-bell" />
              {notifUnread > 0 && <span className="lgx-badge-dot">{notifUnread > 99 ? '99+' : notifUnread}</span>}
            </button>
            {notifOpen && (
              <div className="lgx-dropdown" style={{ width: 340 }}>
                <div className="lgx-dropdown-head">
                  แจ้งเตือน
                  {notifUnread > 0 && <button type="button" className="lgx-notif-mark-all" onClick={onMarkAllRead}>อ่านทั้งหมด</button>}
                </div>
                <div className="lgx-notif-list">
                  {notifItems.length === 0 ? (
                    <div className="lgx-notif-empty">ไม่มีแจ้งเตือน</div>
                  ) : notifItems.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`lgx-notif-item${!n.is_read ? ' is-unread' : ''}`}
                      onClick={() => {
                        if (!n.is_read) onMarkOneRead(n.id)
                        if (n.link) onNotifItemLink(n.link)
                      }}
                    >
                      <div className="row">
                        <strong>{n.title}</strong>
                        {!n.is_read && <span className="new">ใหม่</span>}
                      </div>
                      <p>{n.body}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="lgx-dropdown-wrap" ref={userMenuRef}>
          <button type="button" className="lgx-avatar-btn" onClick={() => setUserMenuOpen((v) => !v)}>
            <UserAvatar user={meUser} size={28} rounded="full" />
            <span className="lgx-avatar-name">{displayName}</span>
          </button>
          {userMenuOpen && (
            <div className="lgx-dropdown" style={{ minWidth: 200 }}>
              <div className="lgx-dropdown-head" style={{ display: 'block' }}>
                <div>{displayName}</div>
                <div style={{ fontWeight: 400, color: 'var(--lgx-text-muted)', fontSize: 11 }}>{role}</div>
              </div>
              <Link to="/" className="lgx-dropdown-item"><i className="bi bi-house" />กลับหน้าเว็บ</Link>
              <button type="button" className="lgx-dropdown-item is-danger" onClick={onLogout}>
                <i className="bi bi-box-arrow-right" />ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
