import { resolveApiUrl } from '../../api.js'

export const INITIAL_MEDIA_RENDER_LIMIT = 120
export const MEDIA_RENDER_STEP = 120
export const THUMB_WIDTH = 220
export const THUMB_QUALITY = 52
export const VIDEO_THUMB_WIDTH = 200
export const VIDEO_THUMB_QUALITY = 48
export const VIEW_MODE_COOKIE = 'AdminSessionViewMode'
export const VIEW_MODE_GRID_TOKEN = 'qf51qw781455s1fw54w8f4w1aaafwlvk'
export const VIEW_MODE_COLUMN_TOKEN = 'qf51qw781455s1fw54w8f4w1aaafwlv2'

export function encodeViewMode(mode) {
  return mode === 'column' ? VIEW_MODE_COLUMN_TOKEN : VIEW_MODE_GRID_TOKEN
}

export function decodeViewMode(value) {
  if (value === VIEW_MODE_COLUMN_TOKEN) return 'column'
  if (value === VIEW_MODE_GRID_TOKEN) return 'grid'
  return ''
}

export function getCookieValue(name) {
  if (typeof document === 'undefined') return ''
  const cookieName = `${String(name || '').trim()}=`
  const chunks = String(document.cookie || '').split(';')
  for (const chunk of chunks) {
    const item = chunk.trim()
    if (item.startsWith(cookieName)) return decodeURIComponent(item.slice(cookieName.length))
  }
  return ''
}

export function setCookieValue(name, value, maxAgeSeconds = 31536000) {
  if (typeof document === 'undefined') return
  const key = String(name || '').trim()
  if (!key) return
  const encoded = encodeURIComponent(String(value || ''))
  document.cookie = `${key}=${encoded}; Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}; Path=/; SameSite=Lax`
}

export function formatBytes(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = n / 1024
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx += 1
  }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[idx]}`
}

export function formatDate(value) {
  if (!value) return '-'
  const t = new Date(value)
  if (Number.isNaN(t.getTime())) return '-'
  return t.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatNameForCard(name, max = 34) {
  const txt = String(name || '').trim()
  if (!txt) return '-'
  return txt.length > max ? `${txt.slice(0, max)}...` : txt
}

export function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

export function getExtension(name) {
  const txt = String(name || '')
  const idx = txt.lastIndexOf('.')
  return idx >= 0 ? txt.slice(idx + 1).toUpperCase() : ''
}

const BROWSER_SAFE_IMAGE_EXTENSIONS = new Set([
  'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'BMP', 'SVG', 'AVIF',
])

const BROWSER_SAFE_VIDEO_EXTENSIONS = new Set([
  'MP4', 'WEBM', 'M4V',
])

export function buildStorageMediaUrl(endpoint, row, extraParams = {}) {
  const qs = new URLSearchParams()
  qs.set('path', String(row?.path || ''))
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  }
  if (row?.access_token) qs.set('st', String(row.access_token))
  return resolveApiUrl(`/api/admin/storage/${endpoint}?${qs.toString()}`)
}

export function canPreviewInBrowser(row) {
  if (!row) return false
  const ext = getExtension(row.name)
  if (row.media_kind === 'image') return BROWSER_SAFE_IMAGE_EXTENSIONS.has(ext)
  if (row.media_kind === 'video') return BROWSER_SAFE_VIDEO_EXTENSIONS.has(ext)
  return false
}

export function compareEntries(a, b, sortBy, sortOrder) {
  let result = 0
  if (sortBy === 'size') {
    result = Number(a?.size || 0) - Number(b?.size || 0)
  } else if (sortBy === 'date') {
    result = Date.parse(a?.mtime || 0) - Date.parse(b?.mtime || 0)
  } else {
    result = String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  }

  if (result === 0) {
    result = String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  }

  return sortOrder === 'desc' ? -result : result
}

export function joinClasses(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function getEntryThumbnailUrl(row) {
  if (!row) return ''
  return row.media_kind === 'image'
    ? buildStorageMediaUrl('thumb', row, { w: THUMB_WIDTH, q: THUMB_QUALITY })
    : buildStorageMediaUrl('video-thumb', row, { w: VIDEO_THUMB_WIDTH, q: VIDEO_THUMB_QUALITY })
}
