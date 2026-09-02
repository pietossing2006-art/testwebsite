import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'

export default function MysteryUnboxModal({
  isOpen,
  isLoading = false,
  onClose,
  onRollAgain,
  boxName = 'กล่องสุ่ม',
  boxImage = '',
  picks = [],
  orderRef = '',
  canRollAgain = true,
  rollPriceLabel = '',
}) {
  const [phase, setPhase] = useState('shaking') // 'shaking' (real network wait) -> 'burst' -> 'revealed'

  const panelRef = useRef(null)
  const boxRef = useRef(null)
  const glowRef = useRef(null)
  const ringRef = useRef(null)
  const ring2Ref = useRef(null)
  const flashRef = useRef(null)
  const revealRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setPhase('shaking')
      return
    }
    // Still waiting on the server — keep shaking for as long as the real request takes,
    // instead of a canned timer that's disconnected from actual latency.
    if (isLoading || picks.length === 0) {
      setPhase('shaking')
      return
    }
    // Result has arrived: play a short celebratory burst, then reveal.
    setPhase('burst')
    const timer = setTimeout(() => setPhase('revealed'), 650)
    return () => clearTimeout(timer)
  }, [isOpen, isLoading, picks])

  // Panel entrance, driven by GSAP.
  useEffect(() => {
    if (!isOpen || !panelRef.current) return undefined
    const ctx = gsap.context(() => {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 26, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.6)' },
      )
    })
    return () => ctx.revert()
  }, [isOpen])

  // Shake (looping) / burst (one-shot) box animation, driven by GSAP.
  useEffect(() => {
    if (!isOpen || phase === 'revealed') return undefined
    const ctx = gsap.context(() => {
      if (phase === 'shaking') {
        if (boxRef.current) {
          gsap.timeline({ repeat: -1 })
            .to(boxRef.current, { rotate: -9, scale: 1.04, duration: 0.12, ease: 'power1.inOut' })
            .to(boxRef.current, { rotate: 8, scale: 1.06, duration: 0.12, ease: 'power1.inOut' })
            .to(boxRef.current, { rotate: -6, scale: 1.03, duration: 0.12, ease: 'power1.inOut' })
            .to(boxRef.current, { rotate: 0, scale: 1, duration: 0.14, ease: 'power1.inOut' })
        }
        if (glowRef.current) {
          gsap.fromTo(glowRef.current, { opacity: 0.35, scale: 0.9 }, { opacity: 0.9, scale: 1.15, duration: 0.6, repeat: -1, yoyo: true, ease: 'sine.inOut' })
        }
        if (ringRef.current) {
          gsap.set(ringRef.current, { opacity: 0.55, scale: 0.85 })
          gsap.to(ringRef.current, { opacity: 0, scale: 1.7, duration: 1.1, repeat: -1, ease: 'power1.out' })
        }
      } else if (phase === 'burst') {
        if (boxRef.current) {
          gsap.timeline()
            .to(boxRef.current, { scale: 1.35, rotate: -6, duration: 0.16, ease: 'power2.out' })
            .to(boxRef.current, { scale: 1.14, rotate: 4, duration: 0.18, ease: 'power2.inOut' })
            .to(boxRef.current, { scale: 1.2, rotate: 0, duration: 0.2, ease: 'power2.out' })
        }
        if (glowRef.current) gsap.to(glowRef.current, { opacity: 0, duration: 0.25 })
        if (ringRef.current) gsap.fromTo(ringRef.current, { opacity: 0.9, scale: 0.6 }, { opacity: 0, scale: 2.4, duration: 0.6, ease: 'power2.out' })
        if (ring2Ref.current) gsap.fromTo(ring2Ref.current, { opacity: 0.7, scale: 0.6 }, { opacity: 0, scale: 2.1, duration: 0.6, delay: 0.12, ease: 'power2.out' })
        if (flashRef.current) {
          gsap.timeline()
            .fromTo(flashRef.current, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1.25, duration: 0.18, ease: 'power2.out' })
            .to(flashRef.current, { opacity: 0, duration: 0.3, ease: 'power2.in' })
        }
      }
    })
    return () => ctx.revert()
  }, [isOpen, phase])

  // Reveal entrance, driven by GSAP.
  useEffect(() => {
    if (phase !== 'revealed' || !revealRef.current) return undefined
    const ctx = gsap.context(() => {
      const tl = gsap.timeline()
      const head = revealRef.current.querySelectorAll('.mystery-reveal-head > *')
      if (head.length) tl.fromTo(head, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.32, stagger: 0.06, ease: 'power2.out' })
      const card = revealRef.current.querySelector('.mystery-prize-card')
      if (card) tl.fromTo(card, { opacity: 0, scale: 0.7, rotate: -4 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(1.7)' }, '-=0.12')
      const items = revealRef.current.querySelectorAll('.mystery-grid-item')
      if (items.length) tl.fromTo(items, { opacity: 0, y: 10, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, stagger: 0.05, ease: 'power2.out' }, '-=0.1')
      const actions = revealRef.current.querySelector('.mystery-actions')
      if (actions) tl.fromTo(actions, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, '-=0.1')
    }, revealRef)
    return () => ctx.revert()
  }, [phase])

  if (!isOpen) return null

  const isMultiple = picks.length > 1
  const hasRealWin = picks.some((p) => p.kind !== 'salt')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(224, 242, 254, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-b from-white via-white to-sky-50 p-6 text-center shadow-2xl shadow-sky-500/15 sm:p-8"
      >
        {/* Glow ambient circle */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-sky-400/25 blur-3xl" />

        {/* Decorative sparkle dots (purely cosmetic, never intercepts clicks) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-50">
          {[...Array(10)].map((_, i) => (
            <span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-sky-400"
              style={{
                top: `${(i * 37) % 100}%`,
                left: `${(i * 53) % 100}%`,
                animation: `mysteryGlowPulse ${1.4 + (i % 4) * 0.3}s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Phase 1 & 2: Box Shaking & Burst */}
        {phase !== 'revealed' ? (
          <div className="relative py-8">
            <div className="relative mx-auto flex h-48 w-48 items-center justify-center">
              {/* Charging energy glow */}
              <div ref={glowRef} className="pointer-events-none absolute inset-4 rounded-full bg-sky-400/40 blur-2xl" />

              {/* Energy rings */}
              <div ref={ringRef} className="pointer-events-none absolute inset-0 rounded-full border-2 border-sky-400/50" />
              <div ref={ring2Ref} className="pointer-events-none absolute inset-0 rounded-full border-2 border-cyan-300/60 opacity-0" />

              {/* Shaking / Bursting Mystery Box Image */}
              <div ref={boxRef} className="relative z-10">
                {boxImage ? (
                  <img
                    src={boxImage}
                    alt={boxName}
                    className="h-36 w-36 object-contain drop-shadow-[0_0_25px_rgba(56,189,248,0.5)]"
                  />
                ) : (
                  <div className="grid h-32 w-32 place-items-center rounded-3xl bg-gradient-to-br from-sky-400 to-cyan-500 text-5xl shadow-xl shadow-sky-500/30">
                    🎁
                  </div>
                )}
              </div>

              {/* Flash on burst */}
              <div
                ref={flashRef}
                className="pointer-events-none absolute inset-0 rounded-full opacity-0"
                style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(56,189,248,0.5) 35%, transparent 70%)' }}
              />
            </div>

            <h3 className="mt-6 text-xl font-black text-slate-900">
              {phase === 'burst' ? '✨ ปิ๊งงงง! กำลังเปิดรางวัล...' : '⚡ กำลังลุ้นรางวัลในกล่องสุ่ม...'}
            </h3>
            <p className="mt-1 text-xs font-semibold text-sky-600/80">
              {boxName}
            </p>
          </div>
        ) : (
          /* Phase 3: Reveal Result */
          <div ref={revealRef} className="relative space-y-6">
            <div className="mystery-reveal-head">
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-black shadow-sm ${
                hasRealWin
                  ? 'border-amber-300 bg-amber-50 text-amber-600'
                  : 'border-slate-200 bg-slate-100 text-slate-500'
              }`}>
                <span>{hasRealWin ? '🎉' : '🧂'}</span>
                <span>{hasRealWin ? 'เปิดกล่องสุ่มสำเร็จ!' : 'เปิดกล่องสุ่มเรียบร้อย'}</span>
              </div>
              <h2 className="mt-2 text-2xl font-black text-slate-900">
                {hasRealWin ? 'ยินดีด้วย! คุณได้รับ' : 'ผลการเปิดกล่องสุ่ม'}
              </h2>
              {orderRef ? (
                <div className="text-[11px] font-semibold text-slate-400">เลขอ้างอิง #{orderRef}</div>
              ) : null}
            </div>

            {/* Single Prize Card */}
            {!isMultiple && picks.length > 0 ? (
              <div
                className={`mystery-prize-card mx-auto max-w-sm rounded-2xl border p-5 shadow-lg ${
                  picks[0].kind === 'salt'
                    ? 'border-slate-200 bg-slate-50 shadow-slate-200/40'
                    : 'border-sky-200 bg-gradient-to-b from-sky-50 via-white to-white shadow-sky-500/10'
                }`}
              >
                <div className={`relative mx-auto mb-3 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border p-2 shadow-inner ${
                  picks[0].kind === 'salt' ? 'border-slate-200 bg-white' : 'border-sky-200 bg-white'
                }`}>
                  {picks[0].prize_image_url ? (
                    <img
                      src={picks[0].prize_image_url}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-md"
                    />
                  ) : picks[0].kind === 'salt' ? (
                    <span className="text-4xl grayscale opacity-70">🧂</span>
                  ) : (
                    <span className="text-4xl">🎁</span>
                  )}
                </div>

                <div className="text-lg font-black text-slate-900">
                  {picks[0].prize_name || picks[0].prize_product_name || (picks[0].kind === 'salt' ? 'ไม่ได้รับของรางวัลรอบนี้' : 'ของรางวัล')}
                </div>

                <div className="mt-2">
                  {picks[0].kind === 'salt' ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-[11px] font-bold text-slate-500">
                      ลองเปิดใหม่อีกครั้งเพื่อลุ้นรางวัล
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[11px] font-black text-emerald-600">
                      ✨ รับเข้ากล่องรับของแล้ว
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {/* Multiple Prizes Grid */}
            {isMultiple ? (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {picks.map((item, idx) => (
                    <div
                      key={idx}
                      className={`mystery-grid-item rounded-xl border p-3 text-center ${
                        item.kind === 'salt' ? 'border-slate-200 bg-slate-50' : 'border-sky-200 bg-white shadow-xs'
                      }`}
                    >
                      <div className="mx-auto mb-1.5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-sky-50 p-1">
                        {item.prize_image_url ? (
                          <img src={item.prize_image_url} alt="" className="h-full w-full object-contain" />
                        ) : item.kind === 'salt' ? (
                          <span className="text-xl grayscale opacity-70">🧂</span>
                        ) : (
                          <span className="text-xl">🎁</span>
                        )}
                      </div>
                      <div className="truncate text-xs font-black text-slate-800">
                        {item.prize_name || item.prize_product_name || (item.kind === 'salt' ? 'เกลือ' : 'รางวัล')}
                      </div>
                      <div className="mt-1 text-[10px]">
                        {item.kind === 'salt' ? (
                          <span className="text-slate-400">ไม่ได้รางวัล</span>
                        ) : (
                          <span className="font-bold text-emerald-600">ได้รางวัล</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="mystery-actions relative z-10 flex flex-col gap-2 pt-2 sm:flex-row">
              {canRollAgain && onRollAgain ? (
                <button
                  type="button"
                  onClick={onRollAgain}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 text-xs font-black text-white shadow-lg shadow-sky-500/25 transition-all hover:brightness-110 active:scale-95"
                >
                  🎁 สุ่มอีกครั้ง {rollPriceLabel ? `(${rollPriceLabel})` : ''}
                </button>
              ) : null}

              <Link
                to="/inbox"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 text-xs font-black text-sky-700 transition-all hover:bg-sky-100 active:scale-95"
              >
                📦 ไปที่กล่องรับของ
              </Link>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-500 transition-all hover:bg-slate-50"
              >
                ปิด
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
