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
  if (name === 'close') return <svg {...common}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
  if (name === 'copy') return <svg {...common}><rect x="9" y="9" width="13" height="13" rx="2" /><rect x="2" y="2" width="13" height="13" rx="2" /></svg>
  if (name === 'folder') return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" /></svg>
  if (name === 'grid') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
  if (name === 'image') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-5-5L5 19" /></svg>
  if (name === 'list') return <svg {...common}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>
  if (name === 'play') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></svg>
  if (name === 'refresh') return <svg {...common}><path d="M21 12a9 9 0 0 1-15.5 6.2" /><path d="M3 12A9 9 0 0 1 18.5 5.8" /><path d="M18 2v4h4" /><path d="M6 22v-4H2" /></svg>
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
  if (name === 'sort') return <svg {...common}><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
  if (name === 'storage') return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
  if (name === 'expand') return <svg {...common}><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /></svg>
  return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>
}

export function ToolbarButton({ active, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={joinClasses(
        'inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition',
        active
          ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100'
          : 'border-white/10 bg-white/[0.04] text-white/68 hover:border-white/18 hover:bg-white/[0.08] hover:text-white',
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
        <div key={idx} className="rounded-2xl border border-white/10 bg-white/[0.035] p-2.5">
          <div className="aspect-[4/3] animate-pulse rounded-xl bg-white/[0.055]" />
          <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-white/[0.055]" />
          <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-white/[0.04]" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, detail }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/14 bg-black/18 px-4 py-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/45">
        <Icon name="search" className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-bold text-white/82">{title}</div>
      {detail ? <div className="mt-1 text-xs text-white/48">{detail}</div> : null}
    </div>
  )
}

export const StatPill = memo(function StatPill({ label, value, tone = 'cyan' }) {
  const toneClass = tone === 'amber' ? 'text-amber-200' : tone === 'emerald' ? 'text-emerald-200' : 'text-cyan-200'
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">{label}</div>
      <div className={joinClasses('mt-1 truncate text-base font-black leading-tight', toneClass)}>{value}</div>
    </div>
  )
})

export const SmartMediaPreview = memo(function SmartMediaPreview({ mediaKind, mediaUrl, name }) {
  const boxRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => {
    setPreviewFailed(false)
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

  return (
    <div ref={boxRef} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-[#0b111a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_40%),linear-gradient(160deg,rgba(12,18,28,0.9),rgba(5,9,14,0.95))]" />
      {shouldLoadPreview && !previewFailed ? (
        <img
          src={mediaUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="relative z-10 h-full w-full object-cover"
          onError={() => setPreviewFailed(true)}
        />
      ) : null}
      {!shouldLoadPreview || previewFailed ? (
        <div className="absolute inset-0 z-20 grid place-items-center text-white/42">
          <Icon name={mediaKind === 'video' ? 'play' : 'image'} className="h-8 w-8" />
        </div>
      ) : null}
      {mediaKind === 'video' ? (
        <div className="absolute inset-0 z-30 grid place-items-center">
          <div className="grid h-11 w-11 place-items-center rounded-full border border-white/18 bg-black/55 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur">
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
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/70 transition hover:border-cyan-300/30 hover:bg-white/[0.08] hover:text-white"
    >
      <Icon name="folder" className="h-3.5 w-3.5 text-cyan-200" />
      <span className="max-w-[180px] truncate">{formatNameForCard(name, 24)}</span>
    </button>
  )
})

export const MediaMeta = memo(function MediaMeta({ item }) {
  if (!item) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/48">
      <span>{formatBytes(item.size)}</span>
      <span className="text-white/22">|</span>
      <span>{formatDate(item.mtime)}</span>
      {getExtension(item.name) ? (
        <>
          <span className="text-white/22">|</span>
          <span>{getExtension(item.name)}</span>
        </>
      ) : null}
    </div>
  )
})
