import { memo } from 'react'
import { EmptyState, Icon, MediaMeta, SmartMediaPreview, ToolbarButton } from './StoragePrimitives.jsx'
import { formatNameForCard, getEntryThumbnailUrl, getExtension, joinClasses } from './storageMediaUtils.js'

const FolderCard = memo(function FolderCard({ item, onSelectFolder }) {
  return (
    <button
      type="button"
      onClick={() => onSelectFolder(item.path)}
      className="group flex flex-col justify-center rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <Icon name="folder" className="h-8 w-8 shrink-0 text-slate-300 transition group-hover:text-slate-400" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-900 group-hover:text-slate-950" title={item.name}>
            {item.name}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Folder</div>
        </div>
      </div>
    </button>
  )
})

const FolderRow = memo(function FolderRow({ item, onSelectFolder }) {
  return (
    <button
      type="button"
      onClick={() => onSelectFolder(item.path)}
      className="grid w-full grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b border-slate-200 px-3 py-2.5 text-left transition hover:bg-slate-50 sm:grid-cols-[72px_minmax(0,1fr)_auto]"
    >
      <div className="flex h-14 w-[72px] items-center justify-center rounded-md border border-slate-200 bg-slate-50">
        <Icon name="folder" className="h-6 w-6 text-slate-300" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-black text-slate-900">{item.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">{item.path || '/'}</div>
      </div>
      <div className="hidden min-w-[130px] text-right sm:block">
        <div className="text-[11px] font-black text-slate-700">FOLDER</div>
        <div className="mt-0.5 text-[11px] text-slate-500">-</div>
      </div>
    </button>
  )
})

const MediaCard = memo(function MediaCard({ item, isSelected, onSelect }) {
  const isVideo = item.media_kind === 'video'
  const rowUrl = getEntryThumbnailUrl(item)

  return (
    <button
      type="button"
      onClick={() => onSelect(item.path)}
      className={joinClasses(
        'group rounded-lg border bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        isSelected ? 'border-slate-950 ring-2 ring-slate-950/10' : 'border-slate-200',
      )}
    >
      <div className="relative">
        <SmartMediaPreview mediaKind={item.media_kind} mediaUrl={rowUrl} name={item.name} />
        <div
          className={joinClasses(
            'pointer-events-none absolute left-2 top-2 rounded border px-1.5 py-0.5 text-[10px] font-black',
            isVideo ? 'border-amber-300 bg-amber-50/95 text-amber-800' : 'border-slate-300 bg-white/90 text-slate-700',
          )}
        >
          {isVideo ? 'VIDEO' : 'IMAGE'}
        </div>
        {getExtension(item.name) ? (
          <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-slate-950/74 px-1.5 py-0.5 text-[10px] font-black text-white">
            {getExtension(item.name)}
          </div>
        ) : null}
      </div>
      <div className="px-1 pb-1 pt-2">
        <div className="truncate text-xs font-black text-slate-900 group-hover:text-slate-950" title={item.name}>
          {formatNameForCard(item.name, 48)}
        </div>
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
        'grid w-full grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b border-slate-200 px-3 py-2.5 text-left transition last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_auto]',
        isSelected ? 'bg-slate-950 text-white' : 'bg-white hover:bg-slate-50',
      )}
    >
      <div className="h-14 w-[72px] overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        <img src={rowUrl} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        <div className={joinClasses('truncate text-sm font-black', isSelected ? 'text-white' : 'text-slate-900')}>{item.name}</div>
        <div className={joinClasses('mt-0.5 truncate text-[11px]', isSelected ? 'text-white/58' : 'text-slate-500')}>{item.path}</div>
      </div>
      <div className="hidden min-w-[130px] text-right sm:block">
        <div className={joinClasses('text-[11px] font-black', isSelected ? 'text-white' : isVideo ? 'text-amber-700' : 'text-slate-700')}>
          {isVideo ? 'VIDEO' : 'IMAGE'}
        </div>
        <div className={joinClasses('mt-0.5 text-[11px]', isSelected ? 'text-white/58' : 'text-slate-500')}>{getExtension(item.name) || '-'}</div>
      </div>
    </button>
  )
})

export default function StorageMediaGrid({
  items,
  viewMode,
  selectedPath,
  onSelect,
  onSelectFolder,
  renderLimit,
  onLoadMore,
  hasMore,
  emptyTitle,
  emptyDetail,
  totalCount,
}) {
  return (
    <section className="py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase text-slate-400">Content</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-600">Browse folders or open media thumbnails.</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">
          <Icon name="storage" className="h-3.5 w-3.5" />
          {Math.min(renderLimit, totalCount).toLocaleString('th-TH')}/{totalCount.toLocaleString('th-TH')}
        </div>
      </div>

      {items.length < 1 ? (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((item) => {
            if (item.type === 'directory') {
              return <FolderCard key={item.path} item={item} onSelectFolder={onSelectFolder} />
            }
            return <MediaCard key={item.path} item={item} isSelected={selectedPath === item.path} onSelect={onSelect} />
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {items.map((item) => {
            if (item.type === 'directory') {
              return <FolderRow key={item.path} item={item} onSelectFolder={onSelectFolder} />
            }
            return <MediaRow key={item.path} item={item} isSelected={selectedPath === item.path} onSelect={onSelect} />
          })}
        </div>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center md:justify-start">
          <ToolbarButton onClick={onLoadMore} className="h-10 w-full px-4 sm:w-auto">
            Load more
          </ToolbarButton>
        </div>
      ) : null}
    </section>
  )
}
