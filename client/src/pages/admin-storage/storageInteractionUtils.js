export function getSwipeNavigationAction({
  startX,
  startY,
  endX,
  endY,
  minDistance = 56,
  maxVerticalRatio = 0.8,
}) {
  const dx = Number(endX) - Number(startX)
  const dy = Number(endY) - Number(startY)
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return ''
  if (absX < minDistance) return ''
  if (absY > absX * maxVerticalRatio) return ''
  return dx < 0 ? 'next' : 'prev'
}

export function getDoubleTapSeekDelta({ clientX, rectLeft, rectWidth, seconds = 10 }) {
  const width = Number(rectWidth)
  if (!Number.isFinite(width) || width <= 0) return seconds
  const midpoint = Number(rectLeft) + width / 2
  return Number(clientX) < midpoint ? -Math.abs(seconds) : Math.abs(seconds)
}

export function clampMediaTime({ currentTime, deltaSeconds, duration }) {
  const current = Number(currentTime)
  const delta = Number(deltaSeconds)
  const max = Number(duration)
  const next = (Number.isFinite(current) ? current : 0) + (Number.isFinite(delta) ? delta : 0)
  if (!Number.isFinite(max) || max <= 0) return Math.max(0, next)
  return Math.min(max, Math.max(0, next))
}
