import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'

export const STORAGE_THUMB_DEFAULT_WIDTH = 400
export const STORAGE_THUMB_MIN_WIDTH = 96
export const STORAGE_THUMB_MAX_WIDTH = 1024
export const STORAGE_THUMB_DEFAULT_QUALITY = 72
export const STORAGE_THUMB_MIN_QUALITY = 30
export const STORAGE_THUMB_MAX_QUALITY = 90
export const STORAGE_VIDEO_THUMB_DEFAULT_WIDTH = 380
export const STORAGE_VIDEO_THUMB_MIN_WIDTH = 96
export const STORAGE_VIDEO_THUMB_MAX_WIDTH = 1024
export const STORAGE_VIDEO_THUMB_DEFAULT_QUALITY = 70
export const STORAGE_VIDEO_THUMB_MIN_QUALITY = 25
export const STORAGE_VIDEO_THUMB_MAX_QUALITY = 88

export const STORAGE_IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tif', '.tiff', '.ico', '.heic', '.heif', '.avif',
])
export const STORAGE_VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.mpeg', '.mpg', '.ts',
])
export const STORAGE_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.opus',
])
export const STORAGE_DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.txt', '.json', '.md', '.log', '.csv', '.xml', '.yaml', '.yml',
])

export const STORAGE_ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60
export const STORAGE_TREE_DEFAULT_MAX_DEPTH = 16
export const STORAGE_TREE_DEFAULT_MAX_FOLDERS = 50000
export const STORAGE_TREE_HARD_MAX_DEPTH = 24
export const STORAGE_TREE_HARD_MAX_FOLDERS = 100000
export const STORAGE_LIST_STAT_CONCURRENCY = 32
export const STORAGE_THUMB_MEMORY_CACHE_MAX_ENTRIES = 180
export const STORAGE_FFMPEG_MAX_CONCURRENCY = 2

export const STORAGE_MIME_BY_EXT = {
  // Images
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
  // Videos
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.ts': 'video/mp2t',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
  '.opus': 'audio/opus',
  // Documents & Text
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
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
  let text = typeof raw === 'string' ? raw.trim() : ''
  if (!text || text === '.' || text === '/') return ''
  try {
    if (text.includes('%')) text = decodeURIComponent(text)
  } catch {
    // ignore
  }
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
  if (STORAGE_AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (STORAGE_DOCUMENT_EXTENSIONS.has(ext)) return 'document'
  return null
}

export function getStorageMimeByPath(targetPath, mediaKind) {
  const ext = path.extname(String(targetPath || '')).toLowerCase()
  const mapped = STORAGE_MIME_BY_EXT[ext]
  if (mapped) return mapped
  if (mediaKind === 'video') return 'video/mp4'
  if (mediaKind === 'audio') return 'audio/mpeg'
  if (mediaKind === 'document') return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
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

export function buildStorageVideoThumbFfmpegArgs({ inputPath, width, ffmpegQ, seekTime = '00:00:02.500' }) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-ss',
    String(seekTime || '00:00:02.500'),
    '-protocol_whitelist',
    'file,pipe',
    '-i',
    String(inputPath || ''),
    '-frames:v',
    '1',
    '-vf',
    `scale=${width}:-2:force_original_aspect_ratio=decrease:flags=lanczos`,
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    '-q:v',
    String(ffmpegQ || 5),
    'pipe:1',
  ]
}

export async function mapStorageItemsWithConcurrency(items, worker, options = {}) {
  const rows = Array.isArray(items) ? items : []
  if (!rows.length) return []

  const requestedConcurrency = Number(options.concurrency)
  const concurrency = Math.max(
    1,
    Math.min(
      rows.length,
      Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : STORAGE_LIST_STAT_CONCURRENCY,
    ),
  )
  const results = new Array(rows.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < rows.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(rows[index], index)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()))
  return results
}

export function buildStorageThumbnailCacheKey({ kind, absolutePath, stat, width, quality }) {
  const normalizedKind = String(kind || 'thumb').trim().toLowerCase() || 'thumb'
  const filePath = path.resolve(String(absolutePath || ''))
  const fileSize = Number(stat?.size || 0)
  const fileMtime = String(Number(stat?.mtimeMs || 0))
  const targetWidth = Math.floor(Number(width) || 0)
  const targetQuality = Math.floor(Number(quality) || 0)
  return `${normalizedKind}:${filePath}:${fileSize}:${fileMtime}:${targetWidth}:${targetQuality}`
}

export function createStorageMemoryCache(options = {}) {
  const requestedMaxEntries = Number(options.maxEntries)
  const maxEntries = Math.max(
    1,
    Number.isFinite(requestedMaxEntries) ? Math.floor(requestedMaxEntries) : STORAGE_THUMB_MEMORY_CACHE_MAX_ENTRIES,
  )
  const entries = new Map()

  return {
    get(key) {
      const cacheKey = String(key || '')
      if (!cacheKey || !entries.has(cacheKey)) return null
      const value = entries.get(cacheKey)
      entries.delete(cacheKey)
      entries.set(cacheKey, value)
      return value
    },
    set(key, value) {
      const cacheKey = String(key || '')
      if (!cacheKey || !value) return value
      entries.delete(cacheKey)
      entries.set(cacheKey, value)
      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value
        entries.delete(oldestKey)
      }
      return value
    },
    clear() {
      entries.clear()
    },
    get size() {
      return entries.size
    },
  }
}

let _storageDiskCacheDir = null

export function getStorageDiskCacheDir() {
  if (_storageDiskCacheDir) return _storageDiskCacheDir
  const candidate = path.join(process.cwd(), 'uploads', '.cache', 'storage-thumbs')
  try {
    if (!fs.existsSync(candidate)) {
      fs.mkdirSync(candidate, { recursive: true })
    }
    _storageDiskCacheDir = candidate
  } catch {
    _storageDiskCacheDir = path.join(os.tmpdir(), 'vxpers-storage-thumbs')
    if (!fs.existsSync(_storageDiskCacheDir)) {
      fs.mkdirSync(_storageDiskCacheDir, { recursive: true })
    }
  }
  return _storageDiskCacheDir
}

export function hashStorageCacheKey(cacheKey) {
  return crypto.createHash('sha256').update(String(cacheKey || '')).digest('hex')
}

export async function readStorageDiskCache(cacheKey, ext = 'webp') {
  try {
    const hash = hashStorageCacheKey(cacheKey)
    const filePath = path.join(getStorageDiskCacheDir(), `${hash}.${ext}`)
    return await fs.promises.readFile(filePath)
  } catch {
    return null
  }
}

export async function writeStorageDiskCache(cacheKey, ext = 'webp', buffer) {
  try {
    if (!buffer || !buffer.length) return
    const hash = hashStorageCacheKey(cacheKey)
    const filePath = path.join(getStorageDiskCacheDir(), `${hash}.${ext}`)
    await fs.promises.writeFile(filePath, buffer)
  } catch {
    // Disk cache writes fail silently without breaking media response
  }
}

export function createStorageConcurrencyLimiter(maxConcurrency = 2) {
  let running = 0
  const queue = []

  const next = () => {
    if (running >= maxConcurrency || queue.length === 0) return
    running++
    const { fn, resolve, reject } = queue.shift()
    Promise.resolve()
      .then(fn)
      .then(
        (val) => {
          running--
          resolve(val)
          next()
        },
        (err) => {
          running--
          reject(err)
          next()
        },
      )
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      next()
    })
  }
}

function parseStorageTreeLimit(raw, { fallback, min, max }) {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  const n = Math.floor(value)
  if (n < min) return min
  if (n > max) return max
  return n
}

async function hasVisibleDirectoryChild(absolutePath) {
  try {
    const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true })
    return entries.some((entry) => {
      const name = String(entry?.name || '')
      return name && !name.startsWith('.') && entry.isDirectory()
    })
  } catch {
    return false
  }
}

export async function buildStorageFolderTree(rawPath = '', options = {}) {
  const target = resolveStoragePath(rawPath)
  const maxDepth = parseStorageTreeLimit(options.maxDepth, {
    fallback: STORAGE_TREE_DEFAULT_MAX_DEPTH,
    min: 0,
    max: STORAGE_TREE_HARD_MAX_DEPTH,
  })
  const maxFolders = parseStorageTreeLimit(options.maxFolders, {
    fallback: STORAGE_TREE_DEFAULT_MAX_FOLDERS,
    min: 1,
    max: STORAGE_TREE_HARD_MAX_FOLDERS,
  })

  const stat = await fs.promises.stat(target.absolute)
  if (!stat.isDirectory()) throw new Error('not_directory')

  let folderCount = 0
  let traversalTruncated = false

  async function buildNode(absolutePath, relPath, depth) {
    const node = {
      name: relPath ? path.basename(relPath) : 'All files',
      path: relPath,
      children: [],
      truncated: false,
    }

    let entries = []
    try {
      entries = await fs.promises.readdir(absolutePath, { withFileTypes: true })
    } catch (e) {
      if (e?.code === 'ENOENT') throw e
      node.truncated = true
      traversalTruncated = true
      return node
    }

    const folders = entries
      .filter((entry) => {
        const name = String(entry?.name || '')
        return name && !name.startsWith('.') && entry.isDirectory()
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, {
        sensitivity: 'base',
        numeric: true,
      }))

    for (const entry of folders) {
      if (folderCount >= maxFolders) {
        node.truncated = true
        traversalTruncated = true
        break
      }

      const name = String(entry.name)
      const childRelPath = relPath ? `${relPath}/${name}` : name
      const childAbsolutePath = path.join(absolutePath, name)
      folderCount += 1

      if (depth + 1 >= maxDepth) {
        const childNode = {
          name,
          path: childRelPath,
          children: [],
          truncated: await hasVisibleDirectoryChild(childAbsolutePath),
        }
        if (childNode.truncated) traversalTruncated = true
        node.children.push(childNode)
        continue
      }

      node.children.push(await buildNode(childAbsolutePath, childRelPath, depth + 1))
    }

    return node
  }

  const tree = await buildNode(target.absolute, target.rel, 0)

  return {
    root: target.root,
    path: target.rel,
    tree,
    folder_count: folderCount,
    max_depth: maxDepth,
    max_folders: maxFolders,
    truncated: traversalTruncated,
  }
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

export function sanitizeStorageFileName(rawName) {
  const name = String(rawName || '').trim()
  if (!name) throw new Error('invalid_name')
  if (name.includes('/') || name.includes('\\') || name.includes('..')) throw new Error('invalid_name')
  const sanitized = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  if (!sanitized || sanitized === '.' || sanitized === '..') throw new Error('invalid_name')
  return sanitized
}

export async function createStorageFolder(rawParentPath, rawFolderName) {
  const folderName = sanitizeStorageFileName(rawFolderName)
  const targetParent = resolveStoragePath(rawParentPath)
  const newDirPath = path.join(targetParent.absolute, folderName)
  const check = resolveStoragePath(targetParent.rel ? `${targetParent.rel}/${folderName}` : folderName)
  if (fs.existsSync(newDirPath)) {
    throw new Error('already_exists')
  }
  await fs.promises.mkdir(newDirPath, { recursive: true })
  return {
    name: folderName,
    path: check.rel,
    type: 'directory',
  }
}

export async function renameStorageItem(rawSourcePath, rawNewName) {
  const newName = sanitizeStorageFileName(rawNewName)
  const source = resolveStoragePath(rawSourcePath)
  if (!source.rel) throw new Error('cannot_rename_root')

  const parentRel = source.rel.includes('/') ? source.rel.slice(0, source.rel.lastIndexOf('/')) : ''
  const newRel = parentRel ? `${parentRel}/${newName}` : newName
  const dest = resolveStoragePath(newRel)

  if (fs.existsSync(dest.absolute)) {
    throw new Error('already_exists')
  }

  await fs.promises.rename(source.absolute, dest.absolute)
  return {
    old_path: source.rel,
    new_path: dest.rel,
    name: newName,
  }
}

export async function deleteStorageItem(rawPath) {
  const target = resolveStoragePath(rawPath)
  if (!target.rel) throw new Error('cannot_delete_root')

  const stat = await fs.promises.stat(target.absolute)
  if (stat.isDirectory()) {
    await fs.promises.rm(target.absolute, { recursive: true, force: true })
  } else {
    await fs.promises.unlink(target.absolute)
  }
  return {
    deleted_path: target.rel,
  }
}
