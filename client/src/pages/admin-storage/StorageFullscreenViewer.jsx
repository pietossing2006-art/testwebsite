import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { copyToClipboard } from '../../api.js'
import { Icon } from './StoragePrimitives.jsx'
import { clampMediaTime, getDoubleTapSeekDelta, getSwipeNavigationAction } from './storageInteractionUtils.js'
import { canPreviewInBrowser, formatBytes, formatDate, getExtension } from './storageMediaUtils.js'

export default function StorageFullscreenViewer({ media, mediaUrl, previewUrl, onClose, onPrev, onNext }) {
  const touchStartRef = useRef(null)
  const lastVideoTapRef = useRef(null)
  const videoRef = useRef(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [copyState, setCopyState] = useState('')

  useEffect(() => {
    setPreviewFailed(false)
    setCopyState('')
  }, [media?.path, mediaUrl, previewUrl])

  if (!media || typeof document === 'undefined') return null

  const canInlinePreview = canPreviewInBrowser(media) && !previewFailed

  const handleTouchStart = (e) => {
    const touch = e.changedTouches?.[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const seekVideoAt = (video, clientX) => {
    if (!video) return
    const rect = video.getBoundingClientRect()
    const deltaSeconds = getDoubleTapSeekDelta({
      clientX,
      rectLeft: rect.left,
      rectWidth: rect.width,
    })
    video.currentTime = clampMediaTime({
      currentTime: video.currentTime,
      deltaSeconds,
      duration: video.duration,
    })
  }

  const handleTouchEnd = (e) => {
    const start = touchStartRef.current
    const touch = e.changedTouches?.[0]
    touchStartRef.current = null
    if (!start || !touch) return

    const action = getSwipeNavigationAction({
      startX: start.x,
      startY: start.y,
      endX: touch.clientX,
      endY: touch.clientY,
    })
    if (action === 'next') {
      lastVideoTapRef.current = null
      onNext()
      return
    }
    if (action === 'prev') {
      lastVideoTapRef.current = null
      onPrev()
      return
    }

    const targetVideo = e.target?.tagName === 'VIDEO' ? e.target : e.target?.closest?.('video')
    if (media.media_kind !== 'video' || !targetVideo) return

    const now = Date.now()
    const lastTap = lastVideoTapRef.current
    if (lastTap && now - lastTap.time < 320 && Math.abs(touch.clientX - lastTap.x) < 28 && Math.abs(touch.clientY - lastTap.y) < 28) {
      lastVideoTapRef.current = null
      seekVideoAt(targetVideo, touch.clientX)
      return
    }

    lastVideoTapRef.current = { time: now, x: touch.clientX, y: touch.clientY }
  }

  const handleVideoDoubleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    seekVideoAt(videoRef.current, e.clientX)
  }

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(mediaUrl)
    setCopyState(ok ? 'copied' : 'failed')
    window.setTimeout(() => setCopyState(''), 1400)
  }

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

      <div
        className="relative max-h-[95vh] w-full max-w-[min(1280px,96vw)]"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/12 bg-black/58 px-3 py-2 text-xs text-white/72 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate font-black text-white">{media.name}</div>
            <div className="mt-0.5 truncate text-[11px] text-white/42">{media.path}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-bold text-white/65 hover:bg-white/[0.08] hover:text-white"
              aria-label="Copy exact link"
            >
              <Icon name="copy" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Failed' : 'Copy link'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white"
              aria-label="Close"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/86">
          {!canInlinePreview ? (
            <div className="grid min-h-[60vh] place-items-center px-6 py-10 text-center text-white/70">
              <div className="max-w-md">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Icon name={media.media_kind === 'video' ? 'play' : 'image'} className="h-5 w-5" />
                </div>
                <div className="mt-3 text-sm font-bold text-white/88">
                  ไฟล์ชนิดนี้ไม่เหมาะสำหรับพรีวิวเต็มจอในเบราว์เซอร์โดยตรง
                </div>
                <div className="mt-2 text-xs text-white/48">
                  {media.name}
                  {getExtension(media.name) ? ` | ${getExtension(media.name)}` : ''}
                </div>
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 text-xs font-bold text-cyan-100 transition hover:bg-cyan-400/16"
                >
                  เปิดไฟล์ในแท็บใหม่
                </a>
              </div>
            </div>
          ) : media.media_kind === 'image' ? (
            <img
              key={media.path}
              src={previewUrl || mediaUrl}
              alt={media.name}
              className="max-h-[84vh] w-full object-contain"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <video
              key={media.path}
              ref={videoRef}
              src={mediaUrl}
              poster={previewUrl || undefined}
              playsInline
              preload="metadata"
              controls
              onDoubleClick={handleVideoDoubleClick}
              onError={() => setPreviewFailed(true)}
              className="max-h-[84vh] w-full bg-black"
            />
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/45">
          <span>{formatBytes(media.size)}</span>
          <span className="text-white/22">|</span>
          <span>{formatDate(media.mtime)}</span>
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
