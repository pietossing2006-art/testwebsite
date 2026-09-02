import { memo, useState } from 'react'
import { EmptyState, Icon, MediaMeta, SmartMediaPreview, ToolbarButton } from './StoragePrimitives.jsx'
import { buildStorageMediaUrl, formatNameForCard, getEntryThumbnailUrl, getExtension, joinClasses } from './storageMediaUtils.js'

const ActionMenu = memo(function ActionMenu({ item, onRename, onDelete, onDownload, onCopyLink }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"
        aria-label="Item actions"
        title="More actions"
      >
        <Icon name="more-vertical" className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5">
            {item.type !== 'directory' ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onDownload?.(item)
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              >
                <Icon name="download" className="h-3.5 w-3.5 text-slate-400" />
                Download
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onCopyLink?.(item)
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            >
              <Icon name="copy" className="h-3.5 w-3.5 text-slate-400" />
              Copy Link
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onRename?.(item)
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            >
              <Icon name="edit" className="h-3.5 w-3.5 text-slate-400" />
              Rename
            </button>

            <div className="my-1 border-t border-slate-100" />

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onDelete?.(item)
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
})

const FolderCard = memo(function FolderCard({ item, isSelected, onSelectFolder, onToggleSelect, onRename, onDelete, onCopyLink }) {
  return (
    <div
      onClick={() => onSelectFolder(item.path)}
      className={joinClasses(
        'group relative flex cursor-pointer flex-col justify-between rounded-lg border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        isSelected ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect?.(item.path)
            }}
            className={joinClasses(
              'grid h-5 w-5 shrink-0 place-items-center rounded border transition',
              isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:border-slate-400',
            )}
            aria-label="Select folder"
          >
            {isSelected ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
          </button>
          <Icon name="folder" className="h-7 w-7 shrink-0 text-slate-300 transition group-hover:text-slate-400" />
        </div>

        <ActionMenu item={item} onRename={onRename} onDelete={onDelete} onCopyLink={onCopyLink} />
      </div>

      <div className="mt-3 min-w-0">
        <div className="truncate text-sm font-black text-slate-900 group-hover:text-slate-950" title={item.name}>
          {item.name}
        </div>
        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Folder</div>
      </div>
    </div>
  )
})

const FolderRow = memo(function FolderRow({ item, isSelected, onSelectFolder, onToggleSelect, onRename, onDelete, onCopyLink }) {
  return (
    <div
      onClick={() => onSelectFolder(item.path)}
      className={joinClasses(
        'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-50',
        isSelected ? 'bg-blue-50/60' : 'bg-white',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.(item.path)
          }}
          className={joinClasses(
            'grid h-5 w-5 place-items-center rounded border transition',
            isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:border-slate-400',
          )}
          aria-label="Select folder"
        >
          {isSelected ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
        </button>
        <div className="flex h-12 w-14 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
          <Icon name="folder" className="h-6 w-6 text-slate-300" />
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-slate-900">{item.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">{item.path || '/'}</div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden min-w-[90px] text-right sm:block">
          <div className="text-[11px] font-black text-slate-700">FOLDER</div>
          <div className="mt-0.5 text-[11px] text-slate-500">-</div>
        </div>
        <ActionMenu item={item} onRename={onRename} onDelete={onDelete} onCopyLink={onCopyLink} />
      </div>
    </div>
  )
})

const MediaCard = memo(function MediaCard({ item, isSelected, onSelect, onToggleSelect, onRename, onDelete, onDownload, onCopyLink }) {
  const isVideo = item.media_kind === 'video'
  const isAudio = item.media_kind === 'audio'
  const isDoc = item.media_kind === 'document'
  const rowUrl = getEntryThumbnailUrl(item)

  const badgeClass = isVideo
    ? 'border-amber-300 bg-amber-50/95 text-amber-800'
    : isAudio
      ? 'border-purple-300 bg-purple-50/95 text-purple-800'
      : isDoc
        ? 'border-blue-300 bg-blue-50/95 text-blue-800'
        : 'border-slate-300 bg-white/90 text-slate-700'

  const badgeText = isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : isDoc ? 'DOC' : 'IMAGE'

  return (
    <div
      onClick={() => onSelect(item.path)}
      className={joinClasses(
        'group relative flex cursor-pointer flex-col justify-between rounded-lg border bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200',
      )}
    >
      <div className="relative">
        <SmartMediaPreview mediaKind={item.media_kind} mediaUrl={rowUrl} name={item.name} />

        <div className="absolute left-2 top-2 z-30 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect?.(item.path)
            }}
            className={joinClasses(
              'grid h-5 w-5 place-items-center rounded border shadow-sm transition',
              isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white/90 hover:border-slate-400',
            )}
            aria-label="Select item"
          >
            {isSelected ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
          </button>
          <div className={joinClasses('pointer-events-none rounded border px-1.5 py-0.5 text-[10px] font-black', badgeClass)}>
            {badgeText}
          </div>
        </div>

        <div className="absolute right-2 top-2 z-30">
          <ActionMenu item={item} onRename={onRename} onDelete={onDelete} onDownload={onDownload} onCopyLink={onCopyLink} />
        </div>

        {getExtension(item.name) ? (
          <div className="pointer-events-none absolute bottom-2 right-2 z-20 rounded bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-black text-white">
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
    </div>
  )
})

const MediaRow = memo(function MediaRow({ item, isSelected, onSelect, onToggleSelect, onRename, onDelete, onDownload, onCopyLink }) {
  const rowUrl = getEntryThumbnailUrl(item)
  const isVideo = item.media_kind === 'video'
  const isAudio = item.media_kind === 'audio'
  const isDoc = item.media_kind === 'document'

  const badgeText = isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : isDoc ? 'DOC' : 'IMAGE'
  const badgeColor = isVideo ? 'text-amber-700' : isAudio ? 'text-purple-700' : isDoc ? 'text-blue-700' : 'text-slate-700'

  return (
    <div
      onClick={() => onSelect(item.path)}
      className={joinClasses(
        'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-50',
        isSelected ? 'bg-blue-50/60' : 'bg-white',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.(item.path)
          }}
          className={joinClasses(
            'grid h-5 w-5 place-items-center rounded border transition',
            isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:border-slate-400',
          )}
          aria-label="Select item"
        >
          {isSelected ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
        </button>

        <div className="h-12 w-14 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          {item.media_kind === 'audio' ? (
            <div className="grid h-full w-full place-items-center bg-purple-50 text-purple-600">
              <Icon name="audio" className="h-5 w-5" />
            </div>
          ) : item.media_kind === 'document' ? (
            <div className="grid h-full w-full place-items-center bg-blue-50 text-blue-600">
              <Icon name="document" className="h-5 w-5" />
            </div>
          ) : rowUrl ? (
            <img src={rowUrl} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-slate-400">
              <Icon name={isVideo ? 'play' : 'image'} className="h-5 w-5" />
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-slate-900">{item.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">{item.path}</div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden min-w-[90px] text-right sm:block">
          <div className={joinClasses('text-[11px] font-black', badgeColor)}>{badgeText}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{getExtension(item.name) || '-'}</div>
        </div>
        <ActionMenu item={item} onRename={onRename} onDelete={onDelete} onDownload={onDownload} onCopyLink={onCopyLink} />
      </div>
    </div>
  )
})

export default function StorageMediaGrid({
  items,
  viewMode,
  selectedPath,
  selectedPaths = new Set(),
  onSelect,
  onSelectFolder,
  onToggleSelect,
  onRename,
  onDelete,
  onDownload,
  onCopyLink,
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
          <div className="mt-0.5 text-sm font-semibold text-slate-600">Browse folders or click files to preview.</div>
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
            const isSelected = selectedPaths.has(item.path) || selectedPath === item.path
            if (item.type === 'directory') {
              return (
                <FolderCard
                  key={item.path}
                  item={item}
                  isSelected={selectedPaths.has(item.path)}
                  onSelectFolder={onSelectFolder}
                  onToggleSelect={onToggleSelect}
                  onRename={onRename}
                  onDelete={onDelete}
                  onCopyLink={onCopyLink}
                />
              )
            }
            return (
              <MediaCard
                key={item.path}
                item={item}
                isSelected={isSelected}
                onSelect={onSelect}
                onToggleSelect={onToggleSelect}
                onRename={onRename}
                onDelete={onDelete}
                onDownload={onDownload}
                onCopyLink={onCopyLink}
              />
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {items.map((item) => {
            const isSelected = selectedPaths.has(item.path) || selectedPath === item.path
            if (item.type === 'directory') {
              return (
                <FolderRow
                  key={item.path}
                  item={item}
                  isSelected={selectedPaths.has(item.path)}
                  onSelectFolder={onSelectFolder}
                  onToggleSelect={onToggleSelect}
                  onRename={onRename}
                  onDelete={onDelete}
                  onCopyLink={onCopyLink}
                />
              )
            }
            return (
              <MediaRow
                key={item.path}
                item={item}
                isSelected={isSelected}
                onSelect={onSelect}
                onToggleSelect={onToggleSelect}
                onRename={onRename}
                onDelete={onDelete}
                onDownload={onDownload}
                onCopyLink={onCopyLink}
              />
            )
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
