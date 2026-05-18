import { Icon } from './StoragePrimitives.jsx'
import { joinClasses } from './storageMediaUtils.js'

export default function StoragePathBar({
  currentPath,
  rootPath,
  breadcrumbItems,
  onSelectPath,
  copiedKey,
  onCopy,
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-[#07101a]/72 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Current path</div>
          <div className="mt-1 text-sm font-bold text-white">{currentPath || 'All files'}</div>
          <div className="mt-1 truncate text-[11px] text-white/38" title={rootPath || '-'}>
            Root: {rootPath || '-'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onCopy('path', currentPath || rootPath)}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-bold text-white/58 hover:bg-white/[0.08] hover:text-white"
        >
          <Icon name="copy" className="h-3.5 w-3.5" />
          {copiedKey === 'path' ? 'คัดลอกแล้ว' : 'คัดลอก path'}
        </button>
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-xs scrollbar-thin">
        {breadcrumbItems.map((item, idx) => {
          const active = idx === breadcrumbItems.length - 1
          return (
            <div key={`${item.path || 'root'}-${idx}`} className="flex items-center gap-1.5">
              {idx > 0 ? <Icon name="chevron-right" className="h-3.5 w-3.5 text-white/25" /> : null}
              <button
                type="button"
                onClick={() => onSelectPath(item.path)}
                disabled={active}
                className={joinClasses(
                  'rounded-full px-2.5 py-1 font-bold transition',
                  active ? 'cursor-default bg-white/[0.07] text-white' : 'text-white/62 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                {item.label}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
