import { useEffect, useRef } from 'react'
import 'plyr/dist/plyr.css'
import { Icon, MediaMeta, ToolbarButton } from './StoragePrimitives.jsx'

export default function StorageFocusViewer({
  media,
  mediaUrl,
  onPrev,
  onNext,
  onOpenFullscreen,
}) {
  const playerVideoRef = useRef(null)
  const plyrInstanceRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    if (media?.media_kind !== 'video') {
      if (plyrInstanceRef.current) {
        try {
          plyrInstanceRef.current.destroy()
        } catch {
          // ignore
        }
        plyrInstanceRef.current = null
      }
      return undefined
    }

    async function setupPlyr() {
      const el = playerVideoRef.current
      if (!el || cancelled) return

      const mod = await import('plyr')
      if (cancelled) return
      const Plyr = mod?.default
      if (!Plyr) return

      if (plyrInstanceRef.current) {
        try {
          plyrInstanceRef.current.destroy()
        } catch {
          // ignore
        }
        plyrInstanceRef.current = null
      }

      plyrInstanceRef.current = new Plyr(el, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'],
        seekTime: 5,
        autoplay: true,
        invertTime: false,
        keyboard: { focused: true, global: false },
        tooltips: { controls: true, seek: true },
        clickToPlay: true,
        hideControls: true,
        resetOnEnd: false,
      })
    }

    setupPlyr().catch(() => {
      // Native controls remain available if Plyr cannot initialize.
    })

    return () => {
      cancelled = true
      if (plyrInstanceRef.current) {
        try {
          plyrInstanceRef.current.destroy()
        } catch {
          // ignore
        }
        plyrInstanceRef.current = null
      }
    }
  }, [media?.path, media?.media_kind])

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,24,0.96),rgba(5,9,14,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-4 md:px-5">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-white/38">Focus viewer</div>
          {media ? (
            <>
              <div className="mt-2 truncate text-lg font-black text-white">{media.name}</div>
              <div className="mt-1 truncate text-xs text-white/42">{media.path}</div>
              <div className="mt-2"><MediaMeta item={media} /></div>
            </>
          ) : (
            <div className="mt-2 text-sm text-white/52">ยังไม่มี media ให้แสดง</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ToolbarButton onClick={onPrev} disabled={!media} className="px-2.5">
            <Icon name="arrow-left" className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={onNext} disabled={!media} className="px-2.5">
            <Icon name="arrow-right" className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={onOpenFullscreen} disabled={!media}>
            <Icon name="expand" className="h-4 w-4" />
            เต็มจอ
          </ToolbarButton>
        </div>
      </div>

      <div className="relative bg-black/65 p-3 md:p-4">
        <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/90">
          {media ? (
            media.media_kind === 'image' ? (
              <img src={mediaUrl} alt={media.name} className="max-h-[72vh] min-h-[320px] w-full object-contain" />
            ) : (
              <video
                ref={playerVideoRef}
                src={mediaUrl}
                autoPlay
                loop
                playsInline
                preload="metadata"
                className="max-h-[72vh] min-h-[320px] w-full bg-black"
              />
            )
          ) : (
            <div className="grid min-h-[320px] place-items-center text-white/42">
              <div className="text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Icon name="image" className="h-5 w-5" />
                </div>
                <div className="mt-3 text-sm font-bold text-white/72">เลือก media จากด้านขวาเพื่อเริ่มดู</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
