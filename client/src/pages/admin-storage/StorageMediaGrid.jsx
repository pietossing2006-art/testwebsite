import { memo } from 'react'
import { EmptyState, Icon, MediaMeta, SmartMediaPreview, ToolbarButton } from './StoragePrimitives.jsx'
import { formatNameForCard, getEntryThumbnailUrl, getExtension, joinClasses } from './storageMediaUtils.js'

const MediaCard = memo(function MediaCard({ item, isSelected, onSelect }) {
  const isVideo = item.media_kind === 'video'
  const rowUrl = getEntryThumbnailUrl(item)

  return (
    <button
      type="button"
      onClick={() => onSelect(item.path)}
      className={joinClasses(
        'group rounded-2xl border p-2.5 text-left transition',
        isSelected
          ? 'border-cyan-300/34 bg-cyan-400/[0.08] shadow-[0_12px_40px_rgba(34,211,238,0.12)]'
          : 'border-white/10 bg-white/[0.035] hover:border-cyan-300/28 hover:bg-white/[0.065]',
      )}
    >
      <div className="relative">
        <SmartMediaPreview mediaKind={item.media_kind} mediaUrl={rowUrl} name={item.name} />
        <div
          className={joinClasses(
            'pointer-events-none absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-black',
            isVideo ? 'border-amber-300/42 bg-amber-950/55 text-amber-100' : 'border-cyan-300/42 bg-cyan-950/55 text-cyan-100',
          )}
        >
          {isVideo ? 'VIDEO' : 'IMAGE'}
        </div>
        {getExtension(item.name) ? (
          <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/58 px-2 py-0.5 text-[10px] font-black text-white/75">
            {getExtension(item.name)}
          </div>
        ) : null}
      </div>
      <div className="px-1 pb-1 pt-2">
        <div className="truncate text-xs font-bold text-white/88 group-hover:text-white" title={item.name}>{formatNameForCard(item.name, 42)}</div>
        <div className="mt-1">
          <MediaMeta item={item} />
        </div>
      </div>
    </button>
  )
})

const MediaRow = memo(function MediaRow({ item, isSelected, onSelect }) {
  const rowUrl = getEntryThumbnailUrl(item)
  const isVideo = item.media_kind === 'video'

  return (
    <button
      type="button"
      onClick={() => onSelect(item.path)}
      className={joinClasses(
        'grid w-full grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b px-3 py-2.5 text-left transition last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_auto]',
        isSelected ? 'border-white/8 bg-cyan-400/[0.09]' : 'border-white/6 hover:bg-white/[0.045]',
      )}
    >
      <div className="h-14 w-[72px] overflow-hidden rounded-xl border border-white/10 bg-[#0b111a]">
        <img src={rowUrl} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-white/88">{item.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/42">{item.path}</div>
      </div>
      <div className="hidden min-w-[130px] text-right sm:block">
        <div className={joinClasses('text-[11px] font-black', isVideo ? 'text-amber-200' : 'text-cyan-200')}>
          {isVideo ? 'VIDEO' : 'IMAGE'}
        </div>
        <div className="mt-0.5 text-[11px] text-white/42">{getExtension(item.name) || '-'}</div>
      </div>
    </button>
  )
})

export default function StorageMediaGrid({
  items,
  viewMode,
  selectedPath,
  onSelect,
  renderLimit,
  onLoadMore,
  hasMore,
  emptyTitle,
  emptyDetail,
  totalCount,
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#07101a]/72 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Media Browser</div>
          <div className="mt-1 text-sm text-white/55">เลือก thumbnail เพื่อเปิดดูแบบเต็มจอทันที แล้วปิดกลับมาที่รายการเดิมได้</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/58">
          <Icon name="image" className="h-3.5 w-3.5" />
          {Math.min(renderLimit, totalCount).toLocaleString('th-TH')}/{totalCount.toLocaleString('th-TH')}
        </div>
      </div>

      {items.length < 1 ? (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((item) => (
            <MediaCard key={item.path} item={item} isSelected={selectedPath === item.path} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/18">
          {items.map((item) => (
            <MediaRow key={item.path} item={item} isSelected={selectedPath === item.path} onSelect={onSelect} />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center md:justify-start">
          <ToolbarButton onClick={onLoadMore} className="h-10 w-full px-4 sm:w-auto">
            โหลดเพิ่ม
          </ToolbarButton>
        </div>
      ) : null}
    </section>
  )
}
