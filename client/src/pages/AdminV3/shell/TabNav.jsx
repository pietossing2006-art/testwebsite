export default function TabNav({ sections, activeModule, onSelectModule, getModuleLabel, getModuleDescription }) {
  const hasAny = sections.some((section) => section.modules.length > 0)

  return (
    <nav className="lgx-tabs" aria-label="เมนูโมดูล">
      {!hasAny ? (
        <span className="lgx-tabs-empty">ไม่พบเมนูที่ค้นหา</span>
      ) : sections.map((section, idx) => (
        section.modules.length ? (
          <span key={section.id} style={{ display: 'flex', alignItems: 'center' }}>
            {idx > 0 ? <span className="lgx-tab-sep" /> : null}
            {section.modules.map((mod) => (
              <button
                key={mod.id}
                type="button"
                className={`lgx-tab${activeModule === mod.id ? ' is-active' : ''}`}
                title={getModuleDescription(mod)}
                onClick={() => onSelectModule(mod.id)}
              >
                <i className={`bi ${mod.icon}`} />
                {getModuleLabel(mod)}
              </button>
            ))}
          </span>
        ) : null
      ))}
    </nav>
  )
}
