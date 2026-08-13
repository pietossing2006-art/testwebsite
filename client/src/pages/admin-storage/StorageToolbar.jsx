import { Icon, StatPill, ToolbarButton } from './StoragePrimitives.jsx'
import { joinClasses } from './storageMediaUtils.js'

export default function StorageToolbar({
  query,
  onQueryChange,
  mediaFilter,
  onMediaFilterChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onToggleSortOrder,
  summary,
  status,
  onRefresh,
  viewMode,
  onViewModeChange,
}) {
  const mediaCount = Number(summary?.media || 0)
  const imageCount = Number(summary?.images || 0)
  const videoCount = Number(summary?.videos || 0)
  const folderCount = Number(summary?.folders || 0)

  return (
    <section className="sticky top-0 z-30 border-b border-slate-200 bg-[#f6f7f9]/95 py-3 backdrop-blur">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-400">
              <Icon name="storage" className="h-3.5 w-3.5" />
              Owner Storage
            </div>
            <h1 className="truncate text-xl font-black text-slate-950 sm:text-2xl">Storage Host</h1>
          </div>

          <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="min-w-[92px] shrink-0"><StatPill label="Media" value={mediaCount.toLocaleString('th-TH')} tone="emerald" /></div>
            <div className="min-w-[92px] shrink-0"><StatPill label="Images" value={imageCount.toLocaleString('th-TH')} /></div>
            <div className="min-w-[92px] shrink-0"><StatPill label="Videos" value={videoCount.toLocaleString('th-TH')} tone="amber" /></div>
            <div className="min-w-[92px] shrink-0"><StatPill label="Folders" value={folderCount.toLocaleString('th-TH')} /></div>
          </div>
        </div>

        <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_auto_auto] xl:items-center">
          <label className="relative block min-w-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search file name or path"
              className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
          </label>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:overflow-visible xl:px-0 xl:pb-0">
            <div className="flex shrink-0 rounded-md border border-slate-200 bg-white p-1">
              {[
                ['all', 'All'],
                ['image', 'Images'],
                ['video', 'Videos'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onMediaFilterChange(key)}
                  className={joinClasses(
                    'h-8 shrink-0 rounded px-3 text-xs font-black transition',
                    mediaFilter === key ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex shrink-0 rounded-md border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                className={joinClasses(
                  'grid h-8 w-9 place-items-center rounded transition',
                  viewMode === 'grid' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                )}
                aria-label="Grid view"
              >
                <Icon name="grid" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('column')}
                className={joinClasses(
                  'grid h-8 w-9 place-items-center rounded transition',
                  viewMode === 'column' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                )}
                aria-label="List view"
              >
                <Icon name="list" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2">
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value)}
              className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-slate-400"
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="size">Size</option>
            </select>

            <ToolbarButton onClick={onToggleSortOrder} title="Toggle sort order" className="h-10 px-3">
              <Icon name="sort" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{sortOrder === 'asc' ? 'Asc' : 'Desc'}</span>
            </ToolbarButton>

            <ToolbarButton onClick={onRefresh} disabled={status === 'loading'} className="h-10 px-3" title="Refresh">
              <Icon name="refresh" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </ToolbarButton>
          </div>
        </div>
      </div>
    </section>
  )
}
