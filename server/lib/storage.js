import path from 'node:path'
import crypto from 'node:crypto'

export const STORAGE_THUMB_DEFAULT_WIDTH = 240
export const STORAGE_THUMB_MIN_WIDTH = 96
export const STORAGE_THUMB_MAX_WIDTH = 640
export const STORAGE_THUMB_DEFAULT_QUALITY = 50
export const STORAGE_THUMB_MIN_QUALITY = 30
export const STORAGE_THUMB_MAX_QUALITY = 85
export const STORAGE_VIDEO_THUMB_DEFAULT_WIDTH = 200
export const STORAGE_VIDEO_THUMB_MIN_WIDTH = 96
export const STORAGE_VIDEO_THUMB_MAX_WIDTH = 480
export const STORAGE_VIDEO_THUMB_DEFAULT_QUALITY = 45
export const STORAGE_VIDEO_THUMB_MIN_QUALITY = 25
export const STORAGE_VIDEO_THUMB_MAX_QUALITY = 80

export const STORAGE_IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tif', '.tiff', '.ico', '.heic', '.heif', '.avif',
])
export const STORAGE_VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.mpeg', '.mpg', '.ts',
])

export const STORAGE_ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60

export const STORAGE_MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.ico': 'image/x-icon',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.ts': 'video/mp2t',
}

let _storageBrowserRoot = null
const _fallbackStorageAccessSecret = crypto.randomBytes(32).toString('hex')

export function getStorageBrowserRoot() {
  if (_storageBrowserRoot) return _storageBrowserRoot
  _storageBrowserRoot = path.resolve(
    process.env.STORAGE_BROWSER_ROOT ? String(process.env.STORAGE_BROWSER_ROOT) : process.cwd(),
  )
  return _storageBrowserRoot
}

export function normalizeStorageRelativePath(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text || text === '.' || text === '/') return ''
  const unified = text.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = unified
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean)
  const safe = []
  for (const part of parts) {
    if (part === '.' || part === '..') throw new Error('invalid_path')
    safe.push(part)
  }
  return safe.join('/')
}

export function resolveStoragePath(raw) {
  const rel = normalizeStorageRelativePath(raw)
  const rootResolved = path.resolve(getStorageBrowserRoot())
  const candidate = rel ? path.resolve(rootResolved, rel) : rootResolved
  const rootLower = rootResolved.toLowerCase()
  const candidateLower = candidate.toLowerCase()
  const rootPrefix = `${rootLower}${path.sep}`
  if (candidateLower !== rootLower && !candidateLower.startsWith(rootPrefix)) throw new Error('invalid_path')
  return { rel, absolute: candidate, root: rootResolved }
}

export function getStorageMediaKindByPath(targetPath) {
  const ext = path.extname(String(targetPath || '')).toLowerCase()
  if (STORAGE_IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (STORAGE_VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

export function getStorageMimeByPath(targetPath, mediaKind) {
  const ext = path.extname(String(targetPath || '')).toLowerCase()
  const mapped = STORAGE_MIME_BY_EXT[ext]
  if (mapped) return mapped
  return mediaKind === 'video' ? 'video/mp4' : 'application/octet-stream'
}

export function parseStorageNumberInRange(raw, { fallback, min, max }) {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  const n = Math.floor(value)
  if (n < min) return min
  if (n > max) return max
  return n
}

export function mapThumbQualityToFfmpegQ(quality) {
  const q = Number(quality)
  if (!Number.isFinite(q)) return 8
  const clamped = Math.min(STORAGE_VIDEO_THUMB_MAX_QUALITY, Math.max(STORAGE_VIDEO_THUMB_MIN_QUALITY, q))
  const ratio = (clamped - STORAGE_VIDEO_THUMB_MIN_QUALITY) / (STORAGE_VIDEO_THUMB_MAX_QUALITY - STORAGE_VIDEO_THUMB_MIN_QUALITY)
  return Math.max(3, Math.min(20, Math.round(20 - ratio * 17)))
}

export function buildStorageVideoThumbFfmpegArgs({ inputPath, width, ffmpegQ }) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-ss',
    '00:00:01',
    '-protocol_whitelist',
    'file,pipe',
    '-i',
    String(inputPath || ''),
    '-frames:v',
    '1',
    '-vf',
    `scale=${width}:-2:force_original_aspect_ratio=decrease`,
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    '-q:v',
    String(ffmpegQ),
    'pipe:1',
  ]
}

function getStorageAccessSecret() {
  return String(
    process.env.STORAGE_BROWSER_TOKEN_SECRET ||
    process.env.STORAGE_MEDIA_TOKEN_SECRET ||
    process.env.SESSION_SECRET ||
    _fallbackStorageAccessSecret,
  )
}

function toBase64Url(input) {
  return Buffer.from(input).toString('base64url')
}

function signStoragePayload(payloadText) {
  return crypto
    .createHmac('sha256', getStorageAccessSecret())
    .update(payloadText)
    .digest('base64url')
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function createStorageAccessToken(rawPath, { expiresInSeconds = STORAGE_ACCESS_TOKEN_MAX_AGE_SECONDS } = {}) {
  const rel = normalizeStorageRelativePath(rawPath)
  const now = Math.floor(Date.now() / 1000)
  const ttl = Math.max(60, Math.min(STORAGE_ACCESS_TOKEN_MAX_AGE_SECONDS, Number(expiresInSeconds) || STORAGE_ACCESS_TOKEN_MAX_AGE_SECONDS))
  const payload = {
    v: 1,
    scope: 'storage-media',
    path: rel,
    iat: now,
    exp: now + ttl,
  }
  const payloadText = toBase64Url(JSON.stringify(payload))
  const signature = signStoragePayload(payloadText)
  return `${payloadText}.${signature}`
}

export function verifyStorageAccessToken(rawToken, rawPath) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : ''
  if (!token || token.length > 1200) return false
  const dotIdx = token.lastIndexOf('.')
  if (dotIdx <= 0) return false
  const payloadText = token.slice(0, dotIdx)
  const signature = token.slice(dotIdx + 1)
  const expectedSignature = signStoragePayload(payloadText)
  if (!timingSafeEqualText(signature, expectedSignature)) return false

  let payload = null
  try {
    payload = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8'))
  } catch {
    return false
  }

  if (!payload || payload.v !== 1 || payload.scope !== 'storage-media') return false
  const now = Math.floor(Date.now() / 1000)
  const exp = Number(payload.exp)
  if (!Number.isFinite(exp) || exp < now) return false

  let requestedPath = ''
  let tokenPath = ''
  try {
    requestedPath = normalizeStorageRelativePath(rawPath)
    tokenPath = normalizeStorageRelativePath(String(payload.path || ''))
  } catch {
    return false
  }
  return requestedPath === tokenPath
}
