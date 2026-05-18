import { createPortal } from 'react-dom'
import { Icon } from './StoragePrimitives.jsx'
import { formatBytes, formatDate } from './storageMediaUtils.js'

export default function StorageFullscreenViewer({ media, mediaUrl, onClose, onPrev, onNext }) {
  if (!media || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/92 p-3" onClick={onClose}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onPrev()
        }}
        className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/16 bg-black/58 text-white/82 backdrop-blur transition hover:bg-white/10 hover:text-white md:left-5"
        aria-label="Previous"
      >
        <Icon name="arrow-left" className="h-5 w-5" />
      </button>

      <div className="relative max-h-[95vh] w-full max-w-[min(1280px,96vw)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/12 bg-black/58 px-3 py-2 text-xs text-white/72 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate font-black text-white">{media.name}</div>
            <div className="mt-0.5 truncate text-[11px] text-white/42">{media.path}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white"
            aria-label="Close"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/86">
          {media.media_kind === 'image' ? (
            <img src={mediaUrl} alt={media.name} className="max-h-[84vh] w-full object-contain" />
          ) : (
            <video src={mediaUrl} autoPlay loop playsInline preload="metadata" controls className="max-h-[84vh] w-full bg-black" />
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/45">
          <span>{formatBytes(media.size)}</span>
          <span className="text-white/22">|</span>
          <span>{formatDate(media.mtime)}</span>
          <span className="text-white/22">|</span>
          <span>Arrow keys / Esc</span>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onNext()
        }}
        className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/16 bg-black/58 text-white/82 backdrop-blur transition hover:bg-white/10 hover:text-white md:right-5"
        aria-label="Next"
      >
        <Icon name="arrow-right" className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  )
}
