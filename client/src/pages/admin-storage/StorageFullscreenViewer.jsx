import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { copyToClipboard } from '../../api.js'
import { Icon } from './StoragePrimitives.jsx'
import { clampMediaTime, getDoubleTapSeekDelta, getSwipeNavigationAction } from './storageInteractionUtils.js'
import { canPreviewInBrowser, formatBytes, formatDate, getExtension } from './storageMediaUtils.js'

function AudioPlayerView({ mediaUrl, mediaName }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLooping, setIsLooping] = useState(false)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    setIsPlaying(false)
    setCurrentTime(0)
  }, [mediaUrl])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().catch(() => {})
      setIsPlaying(true)
    }
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime)
    if (!duration && audio.duration) setDuration(audio.duration)
  }

  const handleLoadedMetadata = () => {
    const audio = audioRef.current
    if (audio) setDuration(audio.duration || 0)
  }

  const handleSeek = (e) => {
    const audio = audioRef.current
    if (!audio) return
    const nextTime = Number(e.target.value)
    audio.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const formatSecs = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-white">
      <audio
        ref={audioRef}
        src={mediaUrl}
        loop={isLooping}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-purple-400/30 bg-purple-500/10 text-purple-300">
            <Icon name="audio" className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-black text-white" title={mediaName}>
              {mediaName}
            </div>
            <div className="mt-0.5 text-xs font-semibold text-purple-300/70">Audio Track</div>
          </div>
        </div>

        {/* Scrubber */}
        <div className="mt-6">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-purple-500"
          />
          <div className="mt-1.5 flex justify-between text-[11px] font-bold text-white/50">
            <span>{formatSecs(currentTime)}</span>
            <span>{formatSecs(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setIsLooping(!isLooping)}
            className={`grid h-9 w-9 place-items-center rounded-xl border text-xs font-black transition ${
              isLooping ? 'border-purple-400 bg-purple-500/20 text-purple-300' : 'border-white/10 text-white/40 hover:text-white'
            }`}
            title="Loop track"
          >
            <Icon name="refresh" className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="grid h-12 w-12 place-items-center rounded-full bg-purple-600 text-white shadow-lg transition hover:scale-105 hover:bg-purple-500 active:scale-95"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} className="h-6 w-6" />
          </button>

          <div className="flex items-center gap-1.5 text-white/60">
            <button
              type="button"
              onClick={() => {
                const next = volume === 0 ? 1 : 0
                setVolume(next)
                if (audioRef.current) audioRef.current.volume = next
              }}
              className="grid h-8 w-8 place-items-center rounded-lg hover:text-white"
            >
              <Icon name={volume === 0 ? 'volume-x' : 'volume'} className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const val = Number(e.target.value)
                setVolume(val)
                if (audioRef.current) audioRef.current.volume = val
              }}
              className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-white/20 accent-purple-500"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentViewer({ mediaUrl, mediaName }) {
  const ext = getExtension(mediaName).toLowerCase()
  const isPdf = ext === 'pdf'
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(!isPdf)

  useEffect(() => {
    if (isPdf) return
    let active = true
    setLoading(true)
    fetch(mediaUrl)
      .then((res) => res.text())
      .then((data) => {
        if (active) {
          setText(data.slice(0, 100000)) // Max 100KB preview
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setText('Could not load text preview.')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [isPdf, mediaUrl])

  if (isPdf) {
    return (
      <div className="h-[75vh] w-full overflow-hidden rounded-[20px] bg-slate-900">
        <iframe src={mediaUrl} className="h-full w-full border-0 bg-white" title={mediaName} />
      </div>
    )
  }

  return (
    <div className="max-h-[75vh] min-h-[40vh] w-full overflow-auto rounded-[20px] border border-white/10 bg-[#0d1117] p-5 font-mono text-xs text-slate-200">
      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading document content...</div>
      ) : (
        <pre className="whitespace-pre-wrap break-words">{text}</pre>
      )}
    </div>
  )
}

export default function StorageFullscreenViewer({ media, mediaUrl, previewUrl, onClose, onPrev, onNext }) {
  const touchStartRef = useRef(null)
  const lastVideoTapRef = useRef(null)
  const videoRef = useRef(null)
  const [previewFailure, setPreviewFailure] = useState({ key: '', failed: false })
  const [copyStatus, setCopyStatus] = useState({ key: '', value: '' })
  const [videoSpeed, setVideoSpeed] = useState(1)

  const mediaStateKey = `${media?.path || ''}|${mediaUrl || ''}|${previewUrl || ''}`
  const previewFailed = previewFailure.key === mediaStateKey && previewFailure.failed
  const copyState = copyStatus.key === mediaStateKey ? copyStatus.value : ''

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onNext()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'd' || e.key === 'D') {
        const a = document.createElement('a')
        a.href = mediaUrl
        a.download = media?.name || 'file'
        a.click()
      } else if (e.key === 'c' || e.key === 'C') {
        handleCopyLink()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [media, mediaUrl, onNext, onPrev, onClose])

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
    const nextValue = ok ? 'copied' : 'failed'
    setCopyStatus({ key: mediaStateKey, value: nextValue })
    window.setTimeout(() => {
      setCopyStatus((current) => (current.key === mediaStateKey ? { key: mediaStateKey, value: '' } : current))
    }, 1400)
  }

  const handleSpeedChange = (speed) => {
    setVideoSpeed(speed)
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/94 p-3 backdrop-blur-sm" onClick={onClose}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onPrev()
        }}
        className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/16 bg-black/60 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white md:left-5"
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
        {/* Top bar */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/12 bg-black/60 px-3 py-2 text-xs text-white/75 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="truncate font-black text-white">{media.name}</div>
            <div className="mt-0.5 truncate text-[11px] text-white/45">{media.path}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {media.media_kind === 'video' ? (
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 text-[11px] font-bold text-white/70">
                {[0.5, 1, 1.25, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => handleSpeedChange(spd)}
                    className={`rounded px-1.5 py-0.5 ${videoSpeed === spd ? 'bg-amber-500 text-slate-950' : 'hover:bg-white/10'}`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            ) : null}

            <a
              href={mediaUrl}
              download={media.name}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-bold text-white/65 hover:bg-white/[0.08] hover:text-white"
              title="Download file (D)"
            >
              <Icon name="download" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-bold text-white/65 hover:bg-white/[0.08] hover:text-white"
              aria-label="Copy exact link"
              title="Copy link (C)"
            >
              <Icon name="copy" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Failed' : 'Copy link'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white"
              aria-label="Close"
              title="Close (Esc)"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Media Container */}
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
              onError={() => setPreviewFailure({ key: mediaStateKey, failed: true })}
            />
          ) : media.media_kind === 'video' ? (
            <video
              key={media.path}
              ref={videoRef}
              src={mediaUrl}
              poster={previewUrl || undefined}
              playsInline
              webkit-playsinline="true"
              preload="metadata"
              controls
              onDoubleClick={handleVideoDoubleClick}
              onError={() => setPreviewFailure({ key: mediaStateKey, failed: true })}
              className="max-h-[84vh] w-full bg-black"
            />
          ) : media.media_kind === 'audio' ? (
            <AudioPlayerView mediaUrl={mediaUrl} mediaName={media.name} />
          ) : media.media_kind === 'document' ? (
            <DocumentViewer mediaUrl={mediaUrl} mediaName={media.name} />
          ) : null}
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
        className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/16 bg-black/60 text-white/80 backdrop-blur transition hover:bg-white/10 hover:text-white md:right-5"
        aria-label="Next"
      >
        <Icon name="arrow-right" className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  )
}
