import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import UserAvatar from '../UserAvatar.jsx'

// High-quality SVG Preset Avatars
export const AVATAR_PRESETS = [
  {
    id: 'cyber-samurai',
    name: 'Cyber Samurai',
    category: 'Gamer',
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#0f172a"/><circle cx="50" cy="50" r="38" fill="url(#g1)"/><path d="M50 20L68 45H32L50 20Z" fill="#38bdf8"/><circle cx="50" cy="52" r="18" fill="#1e293b"/><circle cx="43" cy="50" r="3" fill="#38bdf8"/><circle cx="57" cy="50" r="3" fill="#38bdf8"/><path d="M42 62C46 66 54 66 58 62" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/><defs><linearGradient id="g1" x1="12" y1="12" x2="88" y2="88" gradientUnits="userSpaceOnUse"><stop stop-color="#0284c7"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs></svg>`,
  },
  {
    id: 'neon-cat',
    name: 'Neon Cat',
    category: 'Cute',
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#18181b"/><circle cx="50" cy="52" r="34" fill="url(#g2)"/><path d="M26 30L38 48L24 50Z" fill="#ec4899"/><path d="M74 30L62 48L76 50Z" fill="#ec4899"/><circle cx="40" cy="52" r="4.5" fill="#18181b"/><circle cx="60" cy="52" r="4.5" fill="#18181b"/><circle cx="41.5" cy="50.5" r="1.5" fill="#ffffff"/><circle cx="61.5" cy="50.5" r="1.5" fill="#ffffff"/><path d="M47 60L50 63L53 60" stroke="#18181b" stroke-width="2" stroke-linecap="round"/><defs><linearGradient id="g2" x1="16" y1="18" x2="84" y2="86" gradientUnits="userSpaceOnUse"><stop stop-color="#f43f5e"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs></svg>`,
  },
  {
    id: 'astro-explorer',
    name: 'Astro Explorer',
    category: 'Sci-Fi',
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#090d16"/><circle cx="50" cy="50" r="36" fill="#1e293b"/><circle cx="50" cy="48" r="24" fill="#0f172a"/><ellipse cx="50" cy="48" rx="20" ry="15" fill="url(#g3)"/><ellipse cx="45" cy="44" rx="6" ry="3" fill="#ffffff" fill-opacity="0.6"/><rect x="42" y="74" width="16" height="10" rx="4" fill="#334155"/><defs><linearGradient id="g3" x1="30" y1="33" x2="70" y2="63" gradientUnits="userSpaceOnUse"><stop stop-color="#06b6d4"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs></svg>`,
  },
  {
    id: 'pixel-wizard',
    name: 'Pixel Wizard',
    category: 'Gamer',
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#172554"/><circle cx="50" cy="50" r="36" fill="#1e1b4b"/><path d="M50 16L72 56H28L50 16Z" fill="#6366f1"/><circle cx="50" cy="58" r="16" fill="#fed7aa"/><rect x="42" y="55" width="4" height="4" fill="#1e1b4b"/><rect x="54" y="55" width="4" height="4" fill="#1e1b4b"/><path d="M36 68C42 78 58 78 64 68" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/><circle cx="68" cy="28" r="4" fill="#fbbf24"/></svg>`,
  },
  {
    id: 'fox-spirit',
    name: 'Fox Spirit',
    category: 'Anime',
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#431407"/><circle cx="50" cy="52" r="35" fill="url(#g5)"/><path d="M22 24L40 48L18 46Z" fill="#ea580c"/><path d="M78 24L60 48L82 46Z" fill="#ea580c"/><path d="M26 28L36 44L24 42Z" fill="#ffedd5"/><path d="M74 28L64 44L76 42Z" fill="#ffedd5"/><ellipse cx="38" cy="54" rx="4" ry="5" fill="#1c1917"/><ellipse cx="62" cy="54" rx="4" ry="5" fill="#1c1917"/><circle cx="39" cy="52" r="1.5" fill="#ffffff"/><circle cx="63" cy="52" r="1.5" fill="#ffffff"/><polygon points="46,62 54,62 50,66" fill="#1c1917"/><defs><linearGradient id="g5" x1="15" y1="17" x2="85" y2="87" gradientUnits="userSpaceOnUse"><stop stop-color="#f97316"/><stop offset="1" stop-color="#fb923c"/></linearGradient></defs></svg>`,
  },
  {
    id: 'cyber-bot',
    name: 'Cyber Bot',
    category: 'Sci-Fi',
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#022c22"/><rect x="22" y="26" width="56" height="48" rx="14" fill="#0f766e"/><rect x="30" y="36" width="40" height="26" rx="8" fill="#134e4a"/><circle cx="40" cy="48" r="5" fill="#34d399"/><circle cx="60" cy="48" r="5" fill="#34d399"/><rect x="46" y="16" width="8" height="10" rx="2" fill="#14b8a6"/><circle cx="50" cy="14" r="3" fill="#2dd4bf"/></svg>`,
  },
  {
    id: 'glitch-skull',
    name: 'Glitch Skull',
    category: 'Gamer',
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#18181b"/><circle cx="50" cy="46" r="26" fill="#f4f4f5"/><rect x="36" y="58" width="28" height="18" rx="6" fill="#f4f4f5"/><ellipse cx="40" cy="46" rx="6" ry="8" fill="#18181b"/><ellipse cx="60" cy="46" rx="6" ry="8" fill="#18181b"/><polygon points="48,56 52,56 50,60" fill="#18181b"/><path d="M42 66V72M50 66V72M58 66V72" stroke="#18181b" stroke-width="2.5" stroke-linecap="round"/><circle cx="40" cy="46" r="2" fill="#06b6d4"/><circle cx="60" cy="46" r="2" fill="#ec4899"/></svg>`,
  },
  {
    id: 'golden-crown',
    name: 'Golden King',
    category: 'VIP',
    svg: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#2e1065"/><circle cx="50" cy="50" r="36" fill="url(#g8)"/><path d="M25 45L35 30L50 42L65 30L75 45L70 65H30L25 45Z" fill="#fbbf24"/><circle cx="35" cy="30" r="3" fill="#fef08a"/><circle cx="50" cy="42" r="3" fill="#fef08a"/><circle cx="65" cy="30" r="3" fill="#fef08a"/><circle cx="50" cy="55" r="4" fill="#dc2626"/><defs><linearGradient id="g8" x1="14" y1="14" x2="86" y2="86" gradientUnits="userSpaceOnUse"><stop stop-color="#7c3aed"/><stop offset="1" stop-color="#4c1d95"/></linearGradient></defs></svg>`,
  },
]

function svgToDataUrl(svgString) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`
}

export default function AvatarStudioModal({
  isOpen,
  onClose,
  currentAvatarUrl,
  displayName = 'User',
  onSaveAvatar,
  saving = false,
}) {
  const [tab, setTab] = useState('upload') // 'upload' | 'presets' | 'initials'
  const [imageSrc, setImageSrc] = useState('')
  const [zoom, setZoom] = useState(1.0)
  const [rotation, setRotation] = useState(0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [maskShape, setMaskShape] = useState('circle') // 'circle' | 'square'
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [previewDataUrl, setPreviewDataUrl] = useState('')

  const fileInputRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setTab('upload')
      setImageSrc('')
      setZoom(1.0)
      setRotation(0)
      setPan({ x: 0, y: 0 })
      setSelectedPreset(null)
      setPreviewDataUrl(currentAvatarUrl || '')
    }
  }, [isOpen, currentAvatarUrl])

  // Handle file select
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const src = event.target.result
      setImageSrc(src)
      setZoom(1.0)
      setRotation(0)
      setPan({ x: 0, y: 0 })
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        renderCroppedCanvas(img, 1.0, 0, { x: 0, y: 0 })
      }
      img.src = src
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Render 1:1 cropped canvas
  const renderCroppedCanvas = useCallback((img, z, rot, p) => {
    if (!img) return
    const canvas = document.createElement('canvas')
    const size = 400
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.translate(size / 2 + p.x, size / 2 + p.y)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.scale(z, z)

    // Draw image centered
    const nw = img.naturalWidth || img.width
    const nh = img.naturalHeight || img.height
    const scale = Math.max(size / nw, size / nh)
    const dw = nw * scale
    const dh = nh * scale

    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()

    const dataUrl = canvas.toDataURL('image/png', 0.95)
    setPreviewDataUrl(dataUrl)
  }, [])

  // Update canvas when controls change
  useEffect(() => {
    if (imgRef.current && imageSrc) {
      renderCroppedCanvas(imgRef.current, zoom, rotation, pan)
    }
  }, [zoom, rotation, pan, imageSrc, renderCroppedCanvas])

  // Pan dragging
  function handleMouseDown(e) {
    if (!imageSrc) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  function handleMouseMove(e) {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  function handleMouseUp() {
    setIsDragging(false)
  }

  // Preset Selection
  function handleSelectPreset(preset) {
    setSelectedPreset(preset)
    const dataUrl = svgToDataUrl(preset.svg)
    setPreviewDataUrl(dataUrl)
    setImageSrc('')
    imgRef.current = null
  }

  // Reset to default initials
  function handleSelectInitials() {
    setSelectedPreset(null)
    setImageSrc('')
    imgRef.current = null
    setPreviewDataUrl('')
  }

  // Confirm and Save
  async function handleConfirm() {
    if (tab === 'initials') {
      await onSaveAvatar('')
    } else if (tab === 'presets' && selectedPreset) {
      await onSaveAvatar(svgToDataUrl(selectedPreset.svg))
    } else if (previewDataUrl) {
      await onSaveAvatar(previewDataUrl)
    }
  }

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="text-lg font-black text-slate-900">สตูดิโอปรับแต่งรูปโปรไฟล์ (Avatar Studio)</h3>
            <p className="mt-0.5 text-xs text-slate-500">อัปโหลดภาพครอบตัด 1:1 หรือเลือกจากคลังรูปภาพสำเร็จรูป</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 px-5 pt-3">
          {[
            { id: 'upload', label: '📷 อัปโหลด & ครอบตัด 1:1', icon: 'bi-crop' },
            { id: 'presets', label: '🎨 คลังรูปสำเร็จรูป (Gallery)', icon: 'bi-grid-fill' },
            { id: 'initials', label: '✨ ตัวอักษรย่อ (Initials)', icon: 'bi-fonts' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                if (t.id === 'initials') handleSelectInitials()
              }}
              className={`border-b-2 px-4 py-2.5 text-xs font-bold transition ${
                tab === t.id
                  ? 'border-sky-500 text-sky-600 bg-white rounded-t-xl shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {tab === 'upload' && (
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_200px]">
              {/* Crop Stage / Drop Area */}
              <div>
                {!imageSrc ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/40 p-6 text-center transition hover:border-sky-400 hover:bg-sky-50"
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-2xl text-sky-600">
                      📷
                    </div>
                    <div className="mt-3 text-xs font-black text-slate-800">คลิกเพื่อเลือกรูปภาพจากเครื่อง</div>
                    <div className="mt-1 text-[11px] text-slate-400">รองรับ JPG, PNG, WEBP (ไม่เกิน 6MB)</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Interactive Stage */}
                    <div
                      className="relative mx-auto h-64 w-full overflow-hidden rounded-2xl bg-slate-900 cursor-move select-none border border-slate-200"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    >
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
                          transition: isDragging ? 'none' : 'transform 0.1s ease',
                        }}
                      >
                        <img
                          src={imageSrc}
                          alt="to-crop"
                          className="max-h-full max-w-full object-contain pointer-events-none"
                        />
                      </div>

                      {/* Mask Guide Overlay */}
                      <div
                        className={`pointer-events-none absolute inset-4 border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] ${
                          maskShape === 'circle' ? 'rounded-full' : 'rounded-3xl'
                        }`}
                      />
                    </div>

                    {/* Stage Tools */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      {/* Zoom Slider */}
                      <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                        <span className="text-xs text-slate-500 font-bold">ซูม:</span>
                        <input
                          type="range"
                          min="1"
                          max="3"
                          step="0.05"
                          value={zoom}
                          onChange={(e) => setZoom(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
                        />
                        <span className="text-[11px] font-mono font-bold text-slate-600">{zoom.toFixed(1)}x</span>
                      </div>

                      {/* Rotate & Mask Toggle */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRotation((r) => (r + 90) % 360)}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          title="หมุน 90 องศา"
                        >
                          🔄 หมุน 90°
                        </button>
                        <button
                          type="button"
                          onClick={() => setMaskShape((m) => (m === 'circle' ? 'square' : 'circle'))}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          {maskShape === 'circle' ? '⚪ วงกลม' : '⬛ ขอบมน'}
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100"
                        >
                          เปลี่ยนรูป
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Live Multi-Size Preview Sidebar */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 text-center">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">ตัวอย่างการแสดงผล</div>

                <div className="mt-4 flex flex-col items-center gap-4">
                  {/* Large 96px */}
                  <div>
                    <UserAvatar
                      src={previewDataUrl}
                      name={displayName}
                      size={80}
                      rounded="full"
                      className="shadow-md border-2 border-white ring-2 ring-sky-200"
                    />
                    <div className="mt-1 text-[10px] text-slate-400 font-bold">Profile (80px)</div>
                  </div>

                  {/* Medium 44px */}
                  <div className="flex items-center gap-3">
                    <div>
                      <UserAvatar
                        src={previewDataUrl}
                        name={displayName}
                        size={44}
                        rounded="xl"
                        className="shadow-xs border border-white"
                      />
                      <div className="mt-1 text-[10px] text-slate-400 font-bold">Chat (44px)</div>
                    </div>

                    {/* Small 32px */}
                    <div>
                      <UserAvatar
                        src={previewDataUrl}
                        name={displayName}
                        size={32}
                        rounded="full"
                        className="shadow-xs"
                      />
                      <div className="mt-1 text-[10px] text-slate-400 font-bold">Navbar (32px)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'presets' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-500 font-medium">
                เลือกรูปภาพอวตารที่คุณชื่นชอบเพื่อนำไปใช้เป็นรูปโปรไฟล์ได้ทันที:
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {AVATAR_PRESETS.map((preset) => {
                  const isSelected = selectedPreset?.id === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`flex flex-col items-center rounded-2xl border p-3.5 transition ${
                        isSelected
                          ? 'border-sky-500 bg-sky-50 shadow-md ring-2 ring-sky-300'
                          : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className="h-16 w-16 overflow-hidden rounded-2xl shadow-xs"
                        dangerouslySetInnerHTML={{ __html: preset.svg }}
                      />
                      <div className="mt-2 text-xs font-black text-slate-800">{preset.name}</div>
                      <span className="mt-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">
                        {preset.category}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'initials' && (
            <div className="py-8 text-center space-y-4">
              <UserAvatar
                name={displayName}
                size={96}
                rounded="full"
                className="mx-auto shadow-lg ring-4 ring-sky-100"
              />
              <div className="max-w-sm mx-auto">
                <div className="text-sm font-black text-slate-900">ใช้ตัวอักษรย่อและสีพื้นหลังอัตโนมัติ</div>
                <div className="mt-1 text-xs text-slate-500 leading-relaxed">
                  ระบบจะสร้างรูปโปรไฟล์จากตัวอักษรย่อของ <strong>{displayName}</strong> พร้อมคู่สี Gradient ที่ปรับแต่งเฉพาะตามบัญชีของคุณ
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 p-4 px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || (tab === 'upload' && !previewDataUrl && !imageSrc)}
            className="rounded-xl bg-sky-600 px-6 py-2 text-xs font-black text-white shadow-md hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกรูปโปรไฟล์'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
