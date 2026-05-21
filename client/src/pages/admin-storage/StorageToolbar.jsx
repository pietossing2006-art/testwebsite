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
  return (
    <section className="sticky top-3 z-20 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,16,26,0.96),rgba(7,16,26,0.88))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-300/8 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100/82">
            <Icon name="storage" className="h-3.5 w-3.5" />
            Owner Storage
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-white md:text-3xl">Storage Host</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/55">
            Media browser สำหรับไถดูรูปและวิดีโอให้ลื่นขึ้น เปิดดูต่อเนื่องได้เร็ว และลดน้ำหนักของ UI ที่ไม่จำเป็นกับงานดูสื่อ
          </p>
        </div>

        <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0">
          <div className="min-w-[120px] shrink-0 sm:min-w-0"><StatPill label="Media" value={summary.media.toLocaleString('th-TH')} tone="emerald" /></div>
          <div className="min-w-[120px] shrink-0 sm:min-w-0"><StatPill label="Images" value={summary.images.toLocaleString('th-TH')} /></div>
          <div className="min-w-[120px] shrink-0 sm:min-w-0"><StatPill label="Videos" value={summary.videos.toLocaleString('th-TH')} tone="amber" /></div>
          <div className="min-w-[120px] shrink-0 sm:min-w-0"><StatPill label="Folders" value={summary.folders.toLocaleString('th-TH')} /></div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="relative block min-w-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="ค้นหาชื่อไฟล์หรือ path"
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/25 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-300/36"
          />
        </label>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <div className="flex shrink-0 rounded-2xl border border-white/10 bg-black/20 p-1">
            {[
              ['all', 'ทั้งหมด'],
              ['image', 'รูป'],
              ['video', 'วิดีโอ'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onMediaFilterChange(key)}
                className={joinClasses(
                  'h-9 shrink-0 rounded-xl px-3 text-[11px] font-bold transition',
                  mediaFilter === key ? 'bg-cyan-400/16 text-cyan-100' : 'text-white/55 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 rounded-2xl border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={joinClasses(
                'grid h-9 w-10 place-items-center rounded-xl transition',
                viewMode === 'grid' ? 'bg-cyan-400/16 text-cyan-100' : 'text-white/55 hover:bg-white/[0.08] hover:text-white',
              )}
              aria-label="Grid view"
            >
              <Icon name="grid" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('column')}
              className={joinClasses(
                'grid h-9 w-10 place-items-center rounded-xl transition',
                viewMode === 'column' ? 'bg-cyan-400/16 text-cyan-100' : 'text-white/55 hover:bg-white/[0.08] hover:text-white',
              )}
              aria-label="List view"
            >
              <Icon name="list" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 sm:flex sm:flex-wrap sm:items-center">
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value)}
            className="h-10 min-w-0 rounded-2xl border border-white/10 bg-black/25 px-3 text-xs font-bold text-white/78 outline-none"
          >
            <option value="name">เรียงตามชื่อ</option>
            <option value="date">เรียงตามวันที่</option>
            <option value="size">เรียงตามขนาด</option>
          </select>

          <ToolbarButton onClick={onToggleSortOrder} title="สลับลำดับการเรียง" className="h-10 px-3">
            <Icon name="sort" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{sortOrder === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'}</span>
          </ToolbarButton>

          <ToolbarButton onClick={onRefresh} disabled={status === 'loading'} className="h-10 px-3">
            <Icon name="refresh" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">รีเฟรช</span>
          </ToolbarButton>
        </div>
      </div>
    </section>
  )
}
