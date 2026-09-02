import { Link } from 'react-router-dom'

export default function PageBar({
  title,
  subtitle,
  quickModules,
  activeModule,
  onSelectModule,
  getModuleLabel,
  showStorageLink,
  onRefresh,
  updatedAt,
}) {
  return (
    <div className="lgx-pagebar">
      <div className="lgx-page-title-wrap">
        <h1 className="lgx-page-title">{title}</h1>
        <span className="lgx-page-subtitle">{subtitle}</span>
      </div>

      <div className="lgx-quick-actions">
        {quickModules.map((mod) => (
          <button
            key={mod.id}
            type="button"
            className={`lgx-quick-chip${activeModule === mod.id ? ' is-active' : ''}`}
            onClick={() => onSelectModule(mod.id)}
          >
            <i className={`bi ${mod.icon}`} />
            {getModuleLabel(mod)}
          </button>
        ))}
        {showStorageLink ? (
          <Link to="/admin/storage" className="lgx-quick-chip">
            <i className="bi bi-hdd-stack" />
            Storage
          </Link>
        ) : null}
        <button type="button" className="lgx-quick-chip" onClick={onRefresh}>
          <i className="bi bi-arrow-clockwise" />
          รีเฟรช
        </button>
        {updatedAt ? <span className="lgx-updated-at">อัปเดต {updatedAt}</span> : null}
      </div>
    </div>
  )
}
