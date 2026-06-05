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
    <section className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400">Current</span>
            <span className="truncate text-xs font-black text-slate-950">{currentPath || 'All files'}</span>
          </div>
          <div className="mt-1 hidden truncate text-[11px] font-semibold text-slate-400 xl:block" title={rootPath || '-'}>
            Root: {rootPath || '-'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCopy('path', currentPath || rootPath)}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
          >
            <Icon name="copy" className="h-3.5 w-3.5" />
            {copiedKey === 'path' ? 'Copied' : 'Copy path'}
          </button>
        </div>
      </div>

      <div className="mt-2 -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 pb-1 whitespace-nowrap text-xs scrollbar-thin">
        {breadcrumbItems.map((item, idx) => {
          const active = idx === breadcrumbItems.length - 1
          return (
            <div key={`${item.path || 'root'}-${idx}`} className="flex items-center gap-1.5">
              {idx > 0 ? <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-300" /> : null}
              <button
                type="button"
                onClick={() => onSelectPath(item.path)}
                disabled={active}
                className={joinClasses(
                  'rounded-md px-2 py-1 font-bold transition',
                  active ? 'cursor-default bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
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
