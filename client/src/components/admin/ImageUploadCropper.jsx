import { useState, useRef, useEffect, useCallback } from 'react'
import { fetchJson } from '../../api.js'

/**
 * Interactive Resizable Crop Stage Component
 * Provides 8 resize handles, box dragging, aspect ratio lock & free mode.
 */
function ResizableCropStage({
  imageSrc,
  aspectRatio,
  onCropBoxChange,
  containerHeight = 440,
}) {
  const [imgBounds, setImgBounds] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [renderedDims, setRenderedDims] = useState({ width: 0, height: 0 })
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [activeHandle, setActiveHandle] = useState(null)

  const stageRef = useRef(null)
  const imgRef = useRef(null)

  // Calculate centered crop box based on aspect ratio and image bounds
  const computeInitialBox = useCallback((ratio, bounds) => {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return
    const imgRatio = bounds.width / bounds.height
    let boxW = bounds.width * 0.92
    let boxH = bounds.height * 0.92

    if (ratio && ratio > 0) {
      if (imgRatio > ratio) {
        boxH = bounds.height * 0.92
        boxW = boxH * ratio
      } else {
        boxW = bounds.width * 0.92
        boxH = boxW / ratio
      }
    }

    const boxX = bounds.x + (bounds.width - boxW) / 2
    const boxY = bounds.y + (bounds.height - boxH) / 2
    const newBox = { x: Math.round(boxX), y: Math.round(boxY), width: Math.round(boxW), height: Math.round(boxH) }
    setCropBox(newBox)
    onCropBoxChange?.({ box: newBox, bounds, imgEl: imgRef.current })
  }, [onCropBoxChange])

  // Measure rendered image position inside stage
  const updateImageBounds = useCallback(() => {
    if (!imgRef.current || !stageRef.current) return
    const img = imgRef.current
    const stage = stageRef.current

    const stageRect = stage.getBoundingClientRect()
    const naturalW = img.naturalWidth || 1
    const naturalH = img.naturalHeight || 1

    const maxW = Math.max(100, stageRect.width - 32)
    const maxH = Math.max(100, containerHeight - 32)

    const scale = Math.min(maxW / naturalW, maxH / naturalH)
    const dispW = Math.max(40, Math.round(naturalW * scale))
    const dispH = Math.max(40, Math.round(naturalH * scale))

    setRenderedDims({ width: dispW, height: dispH })

    const dispX = Math.round((stageRect.width - dispW) / 2)
    const dispY = Math.round((containerHeight - dispH) / 2)

    const bounds = {
      x: dispX,
      y: dispY,
      width: dispW,
      height: dispH,
    }

    setImgBounds(bounds)
    computeInitialBox(aspectRatio, bounds)
  }, [aspectRatio, computeInitialBox, containerHeight])

  const handleImageLoad = () => {
    updateImageBounds()
  }

  // Re-fit crop box when aspect ratio changes
  useEffect(() => {
    if (imgBounds.width > 0) {
      computeInitialBox(aspectRatio, imgBounds)
    }
  }, [aspectRatio, computeInitialBox, imgBounds])

  // Update on window resize
  useEffect(() => {
    const handleResize = () => updateImageBounds()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateImageBounds])

  // Handle Dragging Crop Box & Handles
  const startDrag = (e, handleType) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveHandle(handleType)

    const startPointerX = e.clientX
    const startPointerY = e.clientY
    const startBox = { ...cropBox }

    const onPointerMove = (moveEvt) => {
      const dx = moveEvt.clientX - startPointerX
      const dy = moveEvt.clientY - startPointerY

      setCropBox(prev => {
        let { x, y, width, height } = startBox
        const minW = Math.max(32, aspectRatio ? 32 * aspectRatio : 32)
        const minH = Math.max(32, aspectRatio ? 32 / aspectRatio : 32)
        const maxX = imgBounds.x + imgBounds.width
        const maxY = imgBounds.y + imgBounds.height

        if (handleType === 'move') {
          let newX = x + dx
          let newY = y + dy
          newX = Math.max(imgBounds.x, Math.min(maxX - width, newX))
          newY = Math.max(imgBounds.y, Math.min(maxY - height, newY))
          const updated = { x: newX, y: newY, width, height }
          onCropBoxChange?.({ box: updated, bounds: imgBounds, imgEl: imgRef.current })
          return updated
        }

        if (aspectRatio && aspectRatio > 0) {
          if (handleType === 'se') {
            let newW = Math.max(minW, Math.min(maxX - x, startBox.width + dx))
            let newH = newW / aspectRatio
            if (y + newH > maxY) {
              newH = maxY - y
              newW = newH * aspectRatio
            }
            if (newW < minW || newH < minH) return prev
            const updated = { x, y, width: newW, height: newH }
            onCropBoxChange?.({ box: updated, bounds: imgBounds, imgEl: imgRef.current })
            return updated
          }
          if (handleType === 'sw') {
            let newW = Math.max(minW, Math.min(startBox.x + startBox.width - imgBounds.x, startBox.width - dx))
            let newH = newW / aspectRatio
            if (y + newH > maxY) {
              newH = maxY - y
              newW = newH * aspectRatio
            }
            if (newW < minW || newH < minH) return prev
            const newX = startBox.x + (startBox.width - newW)
            const updated = { x: newX, y, width: newW, height: newH }
            onCropBoxChange?.({ box: updated, bounds: imgBounds, imgEl: imgRef.current })
            return updated
          }
          if (handleType === 'ne') {
            let newW = Math.max(minW, Math.min(maxX - x, startBox.width + dx))
            let newH = newW / aspectRatio
            if (startBox.y + startBox.height - newH < imgBounds.y) {
              newH = startBox.y + startBox.height - imgBounds.y
              newW = newH * aspectRatio
            }
            if (newW < minW || newH < minH) return prev
            const newY = startBox.y + (startBox.height - newH)
            const updated = { x, y: newY, width: newW, height: newH }
            onCropBoxChange?.({ box: updated, bounds: imgBounds, imgEl: imgRef.current })
            return updated
          }
          if (handleType === 'nw') {
            let newW = Math.max(minW, Math.min(startBox.x + startBox.width - imgBounds.x, startBox.width - dx))
            let newH = newW / aspectRatio
            if (startBox.y + startBox.height - newH < imgBounds.y) {
              newH = startBox.y + startBox.height - imgBounds.y
              newW = newH * aspectRatio
            }
            if (newW < minW || newH < minH) return prev
            const newX = startBox.x + (startBox.width - newW)
            const newY = startBox.y + (startBox.height - newH)
            const updated = { x: newX, y: newY, width: newW, height: newH }
            onCropBoxChange?.({ box: updated, bounds: imgBounds, imgEl: imgRef.current })
            return updated
          }
          if (handleType === 'e' || handleType === 'w') {
            let newW = handleType === 'e'
              ? Math.max(minW, Math.min(maxX - x, startBox.width + dx))
              : Math.max(minW, Math.min(startBox.x + startBox.width - imgBounds.x, startBox.width - dx))
            let newH = newW / aspectRatio
            let newY = startBox.y + (startBox.height - newH) / 2
            if (newY < imgBounds.y) {
              newH = (startBox.y + startBox.height / 2 - imgBounds.y) * 2
              newW = newH * aspectRatio
              newY = imgBounds.y
            } else if (newY + newH > maxY) {
              newH = (maxY - (startBox.y + startBox.height / 2)) * 2
              newW = newH * aspectRatio
              newY = maxY - newH
            }
            const newX = handleType === 'e' ? x : startBox.x + (startBox.width - newW)
            const updated = { x: Math.max(imgBounds.x, newX), y: Math.max(imgBounds.y, newY), width: newW, height: newH }
            onCropBoxChange?.({ box: updated, bounds: imgBounds, imgEl: imgRef.current })
            return updated
          }
          if (handleType === 's' || handleType === 'n') {
            let newH = handleType === 's'
              ? Math.max(minH, Math.min(maxY - y, startBox.height + dy))
              : Math.max(minH, Math.min(startBox.y + startBox.height - imgBounds.y, startBox.height - dy))
            let newW = newH * aspectRatio
            let newX = startBox.x + (startBox.width - newW) / 2
            if (newX < imgBounds.x) {
              newW = (startBox.x + startBox.width / 2 - imgBounds.x) * 2
              newH = newW / aspectRatio
              newX = imgBounds.x
            } else if (newX + newW > maxX) {
              newW = (maxX - (startBox.x + startBox.width / 2)) * 2
              newH = newW / aspectRatio
              newX = maxX - newW
            }
            const newY = handleType === 's' ? y : startBox.y + (startBox.height - newH)
            const updated = { x: Math.max(imgBounds.x, newX), y: Math.max(imgBounds.y, newY), width: newW, height: newH }
            onCropBoxChange?.({ box: updated, bounds: imgBounds, imgEl: imgRef.current })
            return updated
          }
        } else {
          // Free form / custom aspect ratio
          let newX = x
          let newY = y
          let newW = width
          let newH = height

          if (handleType.includes('e')) {
            newW = Math.max(minW, Math.min(maxX - x, startBox.width + dx))
          }
          if (handleType.includes('w')) {
            const maxLeftW = startBox.x + startBox.width - imgBounds.x
            newW = Math.max(minW, Math.min(maxLeftW, startBox.width - dx))
            newX = startBox.x + (startBox.width - newW)
          }
          if (handleType.includes('s')) {
            newH = Math.max(minH, Math.min(maxY - y, startBox.height + dy))
          }
          if (handleType.includes('n')) {
            const maxTopH = startBox.y + startBox.height - imgBounds.y
            newH = Math.max(minH, Math.min(maxTopH, startBox.height - dy))
            newY = startBox.y + (startBox.height - newH)
          }
          const updated = { x: newX, y: newY, width: newW, height: newH }
          onCropBoxChange?.({ box: updated, bounds: imgBounds, imgEl: imgRef.current })
          return updated
        }

        return prev
      })
    }

    const onPointerUp = () => {
      setActiveHandle(null)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  return (
    <div
      ref={stageRef}
      className="position-relative d-flex align-items-center justify-content-center bg-dark rounded-3 overflow-hidden select-none user-select-none"
      style={{
        width: '100%',
        minHeight: `${containerHeight}px`,
        maxHeight: `${containerHeight + 40}px`,
        backgroundColor: '#090d16',
        touchAction: 'none',
      }}
    >
      {/* Background Grid Pattern */}
      <div
        className="position-absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #38bdf8 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Main Image being cropped */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Source to crop"
        crossOrigin="anonymous"
        onLoad={handleImageLoad}
        draggable={false}
        className="position-relative pointer-events-none"
        style={{
          width: renderedDims.width > 0 ? `${renderedDims.width}px` : 'auto',
          height: renderedDims.height > 0 ? `${renderedDims.height}px` : 'auto',
          maxWidth: '100%',
          maxHeight: `${containerHeight - 32}px`,
          display: 'block',
          borderRadius: 4,
        }}
      />

      {/* 4 Dark Translucent Overlays around the crop box */}
      {imgBounds.width > 0 && cropBox.width > 0 && (
        <>
          {/* Top overlay */}
          <div
            className="position-absolute bg-dark bg-opacity-75 pointer-events-none"
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: `${Math.max(0, cropBox.y)}px`,
              transition: activeHandle ? 'none' : 'height 0.1s ease',
            }}
          />
          {/* Bottom overlay */}
          <div
            className="position-absolute bg-dark bg-opacity-75 pointer-events-none"
            style={{
              top: `${cropBox.y + cropBox.height}px`,
              left: 0,
              right: 0,
              bottom: 0,
              transition: activeHandle ? 'none' : 'top 0.1s ease',
            }}
          />
          {/* Left overlay */}
          <div
            className="position-absolute bg-dark bg-opacity-75 pointer-events-none"
            style={{
              top: `${cropBox.y}px`,
              left: 0,
              width: `${Math.max(0, cropBox.x)}px`,
              height: `${cropBox.height}px`,
              transition: activeHandle ? 'none' : 'all 0.1s ease',
            }}
          />
          {/* Right overlay */}
          <div
            className="position-absolute bg-dark bg-opacity-75 pointer-events-none"
            style={{
              top: `${cropBox.y}px`,
              left: `${cropBox.x + cropBox.width}px`,
              right: 0,
              height: `${cropBox.height}px`,
              transition: activeHandle ? 'none' : 'all 0.1s ease',
            }}
          />

          {/* Active Interactive Crop Box */}
          <div
            className="position-absolute user-select-none"
            style={{
              top: `${cropBox.y}px`,
              left: `${cropBox.x}px`,
              width: `${cropBox.width}px`,
              height: `${cropBox.height}px`,
              boxShadow: '0 0 0 1.5px #38bdf8, 0 0 16px rgba(56, 189, 248, 0.4)',
              cursor: activeHandle === 'move' ? 'grabbing' : 'grab',
              touchAction: 'none',
            }}
            onPointerDown={(e) => startDrag(e, 'move')}
          >
            {/* Rule of Thirds Guidelines */}
            <div
              className="position-absolute inset-0 pointer-events-none"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gridTemplateRows: '1fr 1fr 1fr',
              }}
            >
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.35)', borderBottom: '1px dashed rgba(255,255,255,0.35)' }} />
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.35)', borderBottom: '1px dashed rgba(255,255,255,0.35)' }} />
              <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.35)' }} />
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.35)', borderBottom: '1px dashed rgba(255,255,255,0.35)' }} />
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.35)', borderBottom: '1px dashed rgba(255,255,255,0.35)' }} />
              <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.35)' }} />
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.35)' }} />
              <div style={{ borderRight: '1px dashed rgba(255,255,255,0.35)' }} />
              <div />
            </div>

            {/* Hint in center while moving */}
            <div className="position-absolute top-50 start-50 translate-middle pointer-events-none opacity-60">
              <i className="bi bi-arrows-move text-white fs-4 drop-shadow" />
            </div>

            {/* 4 Corner Resize Handles */}
            <div
              className="position-absolute bg-white rounded-circle shadow border border-2 border-primary"
              style={{
                width: 18,
                height: 18,
                top: -9,
                left: -9,
                cursor: 'nwse-resize',
                zIndex: 10,
              }}
              onPointerDown={(e) => startDrag(e, 'nw')}
            />
            <div
              className="position-absolute bg-white rounded-circle shadow border border-2 border-primary"
              style={{
                width: 18,
                height: 18,
                top: -9,
                right: -9,
                cursor: 'nesw-resize',
                zIndex: 10,
              }}
              onPointerDown={(e) => startDrag(e, 'ne')}
            />
            <div
              className="position-absolute bg-white rounded-circle shadow border border-2 border-primary"
              style={{
                width: 18,
                height: 18,
                bottom: -9,
                left: -9,
                cursor: 'nesw-resize',
                zIndex: 10,
              }}
              onPointerDown={(e) => startDrag(e, 'sw')}
            />
            <div
              className="position-absolute bg-white rounded-circle shadow border border-2 border-primary"
              style={{
                width: 18,
                height: 18,
                bottom: -9,
                right: -9,
                cursor: 'nwse-resize',
                zIndex: 10,
              }}
              onPointerDown={(e) => startDrag(e, 'se')}
            />

            {/* 4 Edge Resize Handles */}
            <div
              className="position-absolute bg-white rounded-pill shadow border border-primary"
              style={{
                width: 24,
                height: 8,
                top: -4,
                left: '50%',
                transform: 'translateX(-50%)',
                cursor: 'ns-resize',
                zIndex: 9,
              }}
              onPointerDown={(e) => startDrag(e, 'n')}
            />
            <div
              className="position-absolute bg-white rounded-pill shadow border border-primary"
              style={{
                width: 24,
                height: 8,
                bottom: -4,
                left: '50%',
                transform: 'translateX(-50%)',
                cursor: 'ns-resize',
                zIndex: 9,
              }}
              onPointerDown={(e) => startDrag(e, 's')}
            />
            <div
              className="position-absolute bg-white rounded-pill shadow border border-primary"
              style={{
                width: 8,
                height: 24,
                left: -4,
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'ew-resize',
                zIndex: 9,
              }}
              onPointerDown={(e) => startDrag(e, 'w')}
            />
            <div
              className="position-absolute bg-white rounded-pill shadow border border-primary"
              style={{
                width: 8,
                height: 24,
                right: -4,
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'ew-resize',
                zIndex: 9,
              }}
              onPointerDown={(e) => startDrag(e, 'e')}
            />
          </div>
        </>
      )}
    </div>
  )
}

export function CropModal({ imageSrc, initialAspectRatio = 16 / 10, onClose, onCropComplete }) {
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio)
  const [cropData, setCropData] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleCropBoxChange = useCallback((data) => {
    setCropData(data)
  }, [])

  const performCrop = async () => {
    if (!cropData || !cropData.imgEl || !cropData.bounds) {
      setError('กรุณารอโหลดรูปภาพให้เสร็จสมบูรณ์')
      return
    }
    setUploading(true)
    setError('')

    try {
      const { box, bounds, imgEl } = cropData
      const scaleX = imgEl.naturalWidth / bounds.width
      const scaleY = imgEl.naturalHeight / bounds.height

      const sx = Math.max(0, Math.round((box.x - bounds.x) * scaleX))
      const sy = Math.max(0, Math.round((box.y - bounds.y) * scaleY))
      const sw = Math.min(imgEl.naturalWidth - sx, Math.round(box.width * scaleX))
      const sh = Math.min(imgEl.naturalHeight - sy, Math.round(box.height * scaleY))

      // Determine output canvas aspect ratio from the actual user crop box
      const boxRatio = box.width > 0 && box.height > 0 ? (box.width / box.height) : (aspectRatio || (16 / 10))

      const targetWidth = 1280
      const targetHeight = Math.round(targetWidth / boxRatio)

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)

      let dataUrl = ''
      try {
        dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      } catch (taintErr) {
        console.warn('Canvas tainted, fallback to direct upload', taintErr)
        throw new Error('ไม่สามารถตัดภาพจากลิงก์ภายนอกที่มีการป้องกัน CORS ได้ กรุณาอัปโหลดไฟล์จากเครื่องโดยตรง')
      }

      const res = await fetchJson('/api/admin/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: dataUrl }),
      })

      if (res.ok && res.url) {
        onCropComplete(res.url)
        onClose()
      } else {
        setError(res.error || 'อัปโหลดภาพไม่สำเร็จ')
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'เกิดข้อผิดพลาดในการ Crop และอัปโหลด')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 1060 }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '24px', overflow: 'hidden' }}>
          {/* Header */}
          <div className="modal-header border-bottom px-4 py-3 bg-light d-flex justify-content-between align-items-center">
            <h5 className="modal-title fw-bold text-dark fs-6 d-flex align-items-center gap-2 m-0">
              <i className="bi bi-crop text-primary" /> ปรับแต่งและตัดรูปภาพ (Interactive Image Cropper)
            </h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={uploading} />
          </div>

          <div className="modal-body p-4">
            {/* Aspect Ratio Preset Selectors */}
            <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <span className="text-secondary small fw-bold">สัดส่วนกรอบ:</span>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 16 / 10 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(16 / 10)}
                >
                  16:10 (แนะนำ สินค้า/ปก)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 4 / 3 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(4 / 3)}
                >
                  4:3 (ปกเกมมาตรฐาน)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 1 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(1)}
                >
                  1:1 (จัตุรัส / Logo)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 16 / 9 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(16 / 9)}
                >
                  16:9 (แบนเนอร์กว้าง)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 0 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(0)}
                  title="ปรับขนาดและสัดส่วนได้อิสระทุกทิศทาง"
                >
                  ✨ อิสระ (Free Form)
                </button>
              </div>

              <div className="text-secondary small d-none d-md-block">
                <i className="bi bi-cursor-fill text-primary me-1" />
                คลิกค้างที่จุดมุม/ขอบเพื่อลากปรับขนาด
              </div>
            </div>

            {/* Interactive Resizable Stage Viewport */}
            <ResizableCropStage
              imageSrc={imageSrc}
              aspectRatio={aspectRatio}
              onCropBoxChange={handleCropBoxChange}
              containerHeight={400}
            />

            <div className="d-flex align-items-center justify-content-between mt-2.5 text-secondary small">
              <div>
                <i className="bi bi-info-circle me-1" />
                คลิกค้างตรงกลางกรอบเพื่อย้ายตำแหน่ง หรือลากจุดกลมสีขาวตามมุมเพื่อขยาย/ย่อขนาด
              </div>
              <span className="badge bg-light text-dark border">
                ความละเอียดส่งออก: 1280px (High Quality)
              </span>
            </div>

            {error && <div className="alert alert-danger mt-3 py-2 small">{error}</div>}
          </div>

          {/* Footer */}
          <div className="modal-footer border-top px-4 py-3 bg-light d-flex justify-content-between">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={uploading}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary px-4 fw-bold" onClick={performCrop} disabled={uploading}>
              {uploading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" /> กำลังประมวลผลและบันทึก...
                </>
              ) : (
                <>
                  <i className="bi bi-check-lg me-1" /> ยืนยันและใช้ภาพนี้
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export async function autoCropImage(src, targetRatio = 16 / 10, targetWidth = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const targetHeight = Math.round(targetWidth / targetRatio)
        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        const imgRatio = img.naturalWidth / img.naturalHeight
        let sWidth = img.naturalWidth
        let sHeight = img.naturalHeight
        let sx = 0
        let sy = 0

        if (imgRatio > targetRatio) {
          sWidth = img.naturalHeight * targetRatio
          sx = (img.naturalWidth - sWidth) / 2
        } else {
          sHeight = img.naturalWidth / targetRatio
          sy = (img.naturalHeight - sHeight) / 2
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
        resolve(dataUrl)
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = reject
    img.src = src
  })
}

export function BatchCropModal({
  items = [],
  initialAspectRatio = 16 / 10,
  onClose,
  onBatchComplete,
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio)
  const [cropData, setCropData] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState('')
  const [croppedMap, setCroppedMap] = useState({})

  const currentItem = items[currentIndex]
  const currentSrc = typeof currentItem === 'string' ? currentItem : currentItem?.src || ''
  const currentName = typeof currentItem === 'object' ? currentItem?.name : `รูปที่ ${currentIndex + 1}`

  const handleCropBoxChange = useCallback((data) => {
    setCropData(data)
  }, [])

  const getCurrentCropDataUrl = () => {
    if (!cropData || !cropData.imgEl || !cropData.bounds) return currentSrc
    const { box, bounds, imgEl } = cropData
    const scaleX = imgEl.naturalWidth / bounds.width
    const scaleY = imgEl.naturalHeight / bounds.height

    const sx = Math.max(0, Math.round((box.x - bounds.x) * scaleX))
    const sy = Math.max(0, Math.round((box.y - bounds.y) * scaleY))
    const sw = Math.min(imgEl.naturalWidth - sx, Math.round(box.width * scaleX))
    const sh = Math.min(imgEl.naturalHeight - sy, Math.round(box.height * scaleY))

    const boxRatio = box.width > 0 && box.height > 0 ? (box.width / box.height) : (aspectRatio || (16 / 10))
    const targetWidth = 1280
    const targetHeight = Math.round(targetWidth / boxRatio)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)
    return canvas.toDataURL('image/jpeg', 0.92)
  }

  const uploadAllFinalResults = async (finalMap) => {
    setUploading(true)
    setError('')
    try {
      const uploadedUrls = []
      for (let i = 0; i < items.length; i++) {
        setUploadProgress(`กำลังอัปโหลดรูปที่ ${i + 1} จาก ${items.length}...`)
        const dataUrl = finalMap[i] || (typeof items[i] === 'string' ? items[i] : items[i]?.src)
        const res = await fetchJson('/api/admin/media/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_data: dataUrl }),
        })
        if (res.ok && res.url) {
          uploadedUrls.push(res.url)
        } else {
          throw new Error(res.error || `อัปโหลดรูปที่ ${i + 1} ไม่สำเร็จ`)
        }
      }
      onBatchComplete(uploadedUrls)
      onClose()
    } catch (err) {
      console.error(err)
      setError(err.message || 'เกิดข้อผิดพลาดในการอัปโหลดภาพ')
    } finally {
      setUploading(false)
    }
  }

  const handleCropAndNext = async () => {
    let dataUrl = currentSrc
    try {
      dataUrl = getCurrentCropDataUrl()
    } catch {
      dataUrl = currentSrc
    }
    const nextMap = { ...croppedMap, [currentIndex]: dataUrl }
    setCroppedMap(nextMap)

    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      await uploadAllFinalResults(nextMap)
    }
  }

  const handleSkipCurrent = async () => {
    const nextMap = { ...croppedMap, [currentIndex]: currentSrc }
    setCroppedMap(nextMap)
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      await uploadAllFinalResults(nextMap)
    }
  }

  const handleAutoCropAllRemaining = async () => {
    setUploading(true)
    setError('')
    setUploadProgress('กำลัง Auto-Crop 16:10 ทุกภาพอัตโนมัติ...')
    try {
      const nextMap = { ...croppedMap }
      for (let i = 0; i < items.length; i++) {
        if (!nextMap[i]) {
          const rawSrc = typeof items[i] === 'string' ? items[i] : items[i]?.src
          try {
            nextMap[i] = await autoCropImage(rawSrc, aspectRatio || 16 / 10)
          } catch {
            nextMap[i] = rawSrc
          }
        }
      }
      setCroppedMap(nextMap)
      await uploadAllFinalResults(nextMap)
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการ Auto-Crop')
      setUploading(false)
    }
  }

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)', zIndex: 1060 }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '24px', overflow: 'hidden' }}>
          {/* Header */}
          <div className="modal-header border-bottom px-4 py-3 bg-light d-flex justify-content-between align-items-center">
            <div>
              <h5 className="modal-title fw-bold text-dark fs-6 d-flex align-items-center gap-2 m-0">
                <i className="bi bi-images text-primary" /> ตัดแต่งรูปภาพแบบหลายรูป (Batch Crop Hub)
              </h5>
              <div className="text-secondary small mt-0.5">
                รูปที่ <strong className="text-primary">{currentIndex + 1}</strong> จาก {items.length} ({currentName})
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1">
                {currentIndex + 1} / {items.length} รูป
              </span>
              <button type="button" className="btn-close" onClick={onClose} disabled={uploading} />
            </div>
          </div>

          <div className="modal-body p-4">
            {/* Aspect ratio presets */}
            <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <span className="text-secondary small fw-bold">สัดส่วนภาพ:</span>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 16 / 10 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(16 / 10)}
                >
                  16:10 (แนะนำ เหมือนรูปปก)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 4 / 3 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(4 / 3)}
                >
                  4:3
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 1 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(1)}
                >
                  1:1
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 16 / 9 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(16 / 9)}
                >
                  16:9
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${aspectRatio === 0 ? 'btn-primary shadow-xs' : 'btn-outline-secondary'}`}
                  onClick={() => setAspectRatio(0)}
                >
                  ✨ อิสระ (Free)
                </button>
              </div>

              <div className="text-secondary small d-none d-md-block">
                ลากขอบหรือมุมกรอบเพื่อจัดองค์ประกอบ
              </div>
            </div>

            {/* Interactive Resizable Stage Viewport */}
            <ResizableCropStage
              key={currentIndex}
              imageSrc={currentSrc}
              aspectRatio={aspectRatio}
              onCropBoxChange={handleCropBoxChange}
              containerHeight={360}
            />

            {/* Batch Thumbnail Queue Strip */}
            <div className="mt-3 pt-3 border-top">
              <div className="d-flex align-items-center justify-content-between mb-1.5">
                <span className="text-secondary small fw-bold">คิวรูปภาพทั้งหมด ({items.length} รูป):</span>
                <span className="text-muted small">คลิกรูปเพื่อสลับไปแก้ไข</span>
              </div>
              <div className="d-flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {items.map((item, idx) => {
                  const src = typeof item === 'string' ? item : item?.src
                  const isDone = Boolean(croppedMap[idx])
                  const isCurrent = idx === currentIndex
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`position-relative border rounded-2 overflow-hidden p-0 shrink-0 transition-all ${
                        isCurrent
                          ? 'border-primary ring-2 ring-primary shadow-sm'
                          : 'border-secondary-subtle opacity-70 hover:opacity-100'
                      }`}
                      style={{ width: 64, height: 44 }}
                    >
                      <img src={croppedMap[idx] || src} alt="" className="w-100 h-100 object-fit-cover" />
                      <span className="badge bg-dark bg-opacity-75 position-absolute top-0 start-0 m-0.5 py-0 px-1" style={{ fontSize: 9 }}>
                        #{idx + 1}
                      </span>
                      {isDone && (
                        <span className="badge bg-success position-absolute bottom-0 end-0 m-0.5 py-0 px-1" style={{ fontSize: 9 }}>
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {uploadProgress && (
              <div className="alert alert-info mt-3 py-2 small d-flex align-items-center gap-2">
                <span className="spinner-border spinner-border-sm" />
                <span>{uploadProgress}</span>
              </div>
            )}

            {error && <div className="alert alert-danger mt-3 py-2 small">{error}</div>}
          </div>

          {/* Footer Actions */}
          <div className="modal-footer border-top px-4 py-3 bg-light d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={uploading}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn btn-outline-info fw-bold d-flex align-items-center gap-1"
                onClick={handleAutoCropAllRemaining}
                disabled={uploading}
                title="ระบบจะตัดกลางภาพ 16:10 ให้ทุกรูปที่เหลืออัตโนมัติ"
              >
                <span>⚡ Auto-Crop ทั้งหมด (16:10)</span>
              </button>
            </div>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSkipCurrent}
                disabled={uploading}
              >
                ข้ามรูปนี้ →
              </button>
              <button
                type="button"
                className="btn btn-primary px-4 fw-bold"
                onClick={handleCropAndNext}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" /> กำลังบันทึก...
                  </>
                ) : currentIndex < items.length - 1 ? (
                  <>
                    <span>✂️ ครอปรูปนี้ & ถัดไป ({currentIndex + 2}/{items.length}) →</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-all me-1" /> ยืนยันและอัปโหลดทั้งหมด ({items.length} รูป)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ImageUploadCropper({
  value = '',
  onChange,
  aspectRatio = 16 / 10,
  label = 'รูปภาพสินค้า',
  placeholder = 'https://... หรืออัปโหลดไฟล์ภาพ',
  helpText = '',
}) {
  const [cropSrc, setCropSrc] = useState(null)
  const [loadingRemote, setLoadingRemote] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (JPG, PNG, WebP)')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setCropSrc(reader.result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCropExisting = async () => {
    if (!value) return

    if (value.startsWith('data:image/')) {
      setCropSrc(value)
      return
    }

    setLoadingRemote(true)
    try {
      const res = await fetchJson('/api/admin/media/fetch-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      })
      if (res.ok && res.data_url) {
        setCropSrc(res.data_url)
      } else {
        setCropSrc(value)
      }
    } catch {
      setCropSrc(value)
    } finally {
      setLoadingRemote(false)
    }
  }

  return (
    <div className="col-12">
      {label && <label className="form-label fw-semibold small text-secondary">{label}</label>}

      <div className="d-flex gap-2 align-items-center">
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/jpg"
          className="d-none"
          onChange={handleFileSelect}
        />

        <button
          type="button"
          className="btn btn-outline-primary shrink-0 d-flex align-items-center gap-1.5"
          onClick={() => fileInputRef.current?.click()}
          title="อัปโหลดภาพจากเครื่อง"
        >
          <i className="bi bi-cloud-arrow-up" />
          <span>อัปโหลด</span>
        </button>

        {value && (
          <button
            type="button"
            className="btn btn-outline-secondary shrink-0 d-flex align-items-center gap-1.5"
            onClick={handleCropExisting}
            disabled={loadingRemote}
            title="Crop / ตัดแต่งรูปภาพ"
          >
            {loadingRemote ? (
              <span className="spinner-border spinner-border-sm" />
            ) : (
              <i className="bi bi-crop" />
            )}
            <span>Crop</span>
          </button>
        )}
      </div>

      {helpText && <div className="text-secondary small mt-1" style={{ fontSize: 11 }}>{helpText}</div>}

      {value ? (
        <div className="mt-2.5 d-flex align-items-center gap-3">
          <div
            className="rounded border overflow-hidden bg-light shadow-xs"
            style={{ width: 80, height: 50, position: 'relative' }}
          >
            <img src={value} alt="Preview" className="w-100 h-100 object-fit-cover" />
          </div>
          <div className="text-secondary small">
            <div className="fw-semibold text-dark">รูปภาพที่เลือก</div>
            <div className="d-flex align-items-center gap-2 mt-0.5">
              <button
                type="button"
                className="btn btn-link btn-sm text-primary p-0 text-decoration-none"
                onClick={handleCropExisting}
              >
                <i className="bi bi-crop me-0.5" /> ตัดขอบอีกครั้ง
              </button>
              <span className="text-secondary">•</span>
              <button
                type="button"
                className="btn btn-link btn-sm text-danger p-0 text-decoration-none"
                onClick={() => onChange('')}
              >
                <i className="bi bi-trash me-0.5" /> ลบรูป
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          initialAspectRatio={aspectRatio}
          onClose={() => setCropSrc(null)}
          onCropComplete={(url) => onChange(url)}
        />
      )}
    </div>
  )
}

