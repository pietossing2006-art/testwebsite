import { memo, useEffect, useRef, useState } from 'react'
import { formatBytes, formatDate, formatNameForCard, getExtension, joinClasses } from './storageMediaUtils.js'

export function Icon({ name, className = 'h-4 w-4' }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  if (name === 'arrow-left') return <svg {...common}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
  if (name === 'arrow-right') return <svg {...common}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
  if (name === 'chevron-right') return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>
  if (name === 'chevron-down') return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>
  if (name === 'close') return <svg {...common}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
  if (name === 'copy') return <svg {...common}><rect x="9" y="9" width="13" height="13" rx="2" /><rect x="2" y="2" width="13" height="13" rx="2" /></svg>
  if (name === 'folder') return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" /></svg>
  if (name === 'grid') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
  if (name === 'image') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-5-5L5 19" /></svg>
  if (name === 'list') return <svg {...common}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>
  if (name === 'play') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></svg>
  if (name === 'pause') return <svg {...common}><circle cx="12" cy="12" r="9" /><line x1="10" x2="10" y1="15" y2="9" /><line x1="14" x2="14" y1="15" y2="9" /></svg>
  if (name === 'refresh') return <svg {...common}><path d="M21 12a9 9 0 0 1-15.5 6.2" /><path d="M3 12A9 9 0 0 1 18.5 5.8" /><path d="M18 2v4h4" /><path d="M6 22v-4H2" /></svg>
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
  if (name === 'sort') return <svg {...common}><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
  if (name === 'storage') return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
  if (name === 'expand') return <svg {...common}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /></svg>
  if (name === 'audio') return <svg {...common}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
  if (name === 'document') return <svg {...common}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><line x1="10" x2="8" y1="9" y2="9" /></svg>
  if (name === 'upload') return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
  if (name === 'plus') return <svg {...common}><line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" /></svg>
  if (name === 'edit') return <svg {...common}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
  if (name === 'trash') return <svg {...common}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
  if (name === 'download') return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
  if (name === 'zip') return <svg {...common}><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /><path d="M10 16h4" /></svg>
  if (name === 'check') return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>
  if (name === 'more-vertical') return <svg {...common}><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
  if (name === 'volume') return <svg {...common}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
  if (name === 'volume-x') return <svg {...common}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" x2="17" y1="9" y2="15" /><line x1="17" x2="23" y1="9" y2="15" /></svg>
  return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>
}

export function ToolbarButton({ active, tone, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={joinClasses(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-55',
        active
          ? 'border-slate-950 bg-slate-950 text-white'
          : tone === 'danger'
            ? 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50'
            : tone === 'primary'
              ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, idx) => (
        <div key={idx} className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="aspect-[4/3] animate-pulse rounded-md bg-slate-100" />
          <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-slate-100" />
          <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, detail }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
        <Icon name="search" className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-bold text-slate-800">{title}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  )
}

export const StatPill = memo(function StatPill({ label, value, tone = 'cyan' }) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-700'
      : tone === 'emerald'
        ? 'text-emerald-700'
        : tone === 'purple'
          ? 'text-purple-700'
          : tone === 'blue'
            ? 'text-blue-700'
            : 'text-slate-950'
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-slate-400">{label}</div>
      <div className={joinClasses('mt-1 truncate text-base font-black leading-tight', toneClass)}>{value}</div>
    </div>
  )
})

export const SmartMediaPreview = memo(function SmartMediaPreview({ mediaKind, mediaUrl, name }) {
  const boxRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => {
      setPreviewFailed(false)
    }, 0)
    return () => clearTimeout(id)
  }, [mediaUrl])

  useEffect(() => {
    if (!boxRef.current || typeof IntersectionObserver === 'undefined') return undefined
    const el = boxRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries?.[0]?.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { root: null, rootMargin: '180px 0px', threshold: 0.01 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [mediaUrl])

  const shouldLoadPreview = isVisible || typeof IntersectionObserver === 'undefined'
  const isImageOrVideo = mediaKind === 'image' || mediaKind === 'video'

  if (mediaKind === 'audio') {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 via-slate-50 to-indigo-50 p-4">
        <div className="flex h-full flex-col items-center justify-center text-purple-600">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-purple-200 bg-white shadow-sm">
            <Icon name="audio" className="h-6 w-6" />
          </div>
          <div className="mt-2 text-[11px] font-black uppercase tracking-wider text-purple-700">Audio Track</div>
        </div>
      </div>
    )
  }

  if (mediaKind === 'document') {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 via-slate-50 to-sky-50 p-4">
        <div className="flex h-full flex-col items-center justify-center text-blue-600">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-blue-200 bg-white shadow-sm">
            <Icon name="document" className="h-6 w-6" />
          </div>
          <div className="mt-2 text-[11px] font-black uppercase tracking-wider text-blue-700">Document</div>
        </div>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative aspect-[4/3] overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <div className="absolute inset-0 bg-slate-100" />
      {isImageOrVideo && shouldLoadPreview && !previewFailed && mediaUrl ? (
        <img
          src={mediaUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="relative z-10 h-full w-full object-cover"
          onError={() => setPreviewFailed(true)}
        />
      ) : null}
      {(!shouldLoadPreview || previewFailed || !mediaUrl) && (
        <div className="absolute inset-0 z-20 grid place-items-center text-slate-400">
          <Icon name={mediaKind === 'video' ? 'play' : 'image'} className="h-8 w-8" />
        </div>
      )}
      {mediaKind === 'video' ? (
        <div className="absolute inset-0 z-30 grid place-items-center">
          <div className="grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-black/60 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur">
            <Icon name="play" className="h-5 w-5" />
          </div>
        </div>
      ) : null}
    </div>
  )
})

export const FolderChip = memo(function FolderChip({ name, path, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(path)}
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
    >
      <Icon name="folder" className="h-3.5 w-3.5 text-slate-400" />
      <span className="max-w-[180px] truncate">{formatNameForCard(name, 24)}</span>
    </button>
  )
})

export const MediaMeta = memo(function MediaMeta({ item }) {
  if (!item) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
      <span>{formatBytes(item.size)}</span>
      <span className="text-slate-300">|</span>
      <span>{formatDate(item.mtime)}</span>
      {getExtension(item.name) ? (
        <>
          <span className="text-slate-300">|</span>
          <span>{getExtension(item.name)}</span>
        </>
      ) : null}
    </div>
  )
})
