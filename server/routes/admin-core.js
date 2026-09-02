import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { spawn } from 'node:child_process'
import { decodeDataUrlImage, sanitizeProductImage } from '../lib/image.js'
import {
  adminGetAuditLogById,
  adminListAuditLogs,
  adminGetAuditLogStats,
  adminGetDashboardOverview,
  adminGetOpsPulse,
  getUiSettings,
  updateUiSettings,
  getAutoAssignConfig,
  updateAutoAssignConfig,
  adminCreateSiteMessage,
  adminListSiteMessages,
  adminDeleteSiteMessage,
  adminListDirectChatUsers,
  adminGetDirectChatMessages,
  adminListAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
  adminReorderAnnouncements,
  listAllTransactions,
  listWebhookLogs,
  pool,
} from '../db.js'
import multer from 'multer'
import { ZipArchive } from 'archiver'
import {
  getStorageBrowserRoot,
  STORAGE_THUMB_DEFAULT_WIDTH,
  STORAGE_THUMB_MIN_WIDTH,
  STORAGE_THUMB_MAX_WIDTH,
  STORAGE_THUMB_DEFAULT_QUALITY,
  STORAGE_THUMB_MIN_QUALITY,
  STORAGE_THUMB_MAX_QUALITY,
  STORAGE_VIDEO_THUMB_DEFAULT_WIDTH,
  STORAGE_VIDEO_THUMB_MIN_WIDTH,
  STORAGE_VIDEO_THUMB_MAX_WIDTH,
  STORAGE_VIDEO_THUMB_DEFAULT_QUALITY,
  STORAGE_VIDEO_THUMB_MIN_QUALITY,
  STORAGE_VIDEO_THUMB_MAX_QUALITY,
  STORAGE_ACCESS_TOKEN_MAX_AGE_SECONDS,
  STORAGE_LIST_STAT_CONCURRENCY,
  STORAGE_THUMB_MEMORY_CACHE_MAX_ENTRIES,
  STORAGE_FFMPEG_MAX_CONCURRENCY,
  resolveStoragePath,
  getStorageMediaKindByPath,
  getStorageMimeByPath,
  parseStorageNumberInRange,
  mapThumbQualityToFfmpegQ,
  buildStorageVideoThumbFfmpegArgs,
  mapStorageItemsWithConcurrency,
  buildStorageThumbnailCacheKey,
  createStorageMemoryCache,
  readStorageDiskCache,
  writeStorageDiskCache,
  createStorageConcurrencyLimiter,
  buildStorageFolderTree,
  createStorageAccessToken,
  verifyStorageAccessToken,
  sanitizeStorageFileName,
  createStorageFolder,
  renameStorageItem,
  deleteStorageItem,
} from '../lib/storage.js'
import {
  requireAuth,
  requireAnyRole,
  requireAdmin,
  requireOwner,
  requireFinance,
  ADMIN_ROLE_MODULE_ACCESS,
  ADMIN_ROLE_ACTION_ACCESS,
} from '../lib/auth.js'
import { redis, QUEUE_SLA_SECONDS, QUEUE_TICK_MS, lastQueueTick, queueTimer } from '../lib/queue.js'

const router = Router()
const storageThumbCache = createStorageMemoryCache({ maxEntries: STORAGE_THUMB_MEMORY_CACHE_MAX_ENTRIES })
const storageFfmpegLimiter = createStorageConcurrencyLimiter(STORAGE_FFMPEG_MAX_CONCURRENCY)
const storageUploadMulter = multer({
  limits: { fileSize: 1024 * 1024 * 1024, files: 50 }, // 1GB per file, max 50 files per batch
  storage: multer.memoryStorage(),
})

function sendStorageThumbnail(res, { etag, contentType, output }) {
  res.setHeader('ETag', etag)
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', String(output.length))
  res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate')
  return res.status(200).send(output)
}

function getStorageMediaToken(req) {
  const raw = req.query.st ?? req.query.storage_token
  return typeof raw === 'string' ? raw : ''
}

function getStorageRequestPath(req) {
  let raw = ''
  if (typeof req.params?.[0] === 'string') raw = req.params[0]
  else if (typeof req.query.path === 'string') raw = req.query.path
  if (!raw) return ''
  try {
    if (raw.includes('%')) return decodeURIComponent(raw)
  } catch {
    // ignore
  }
  return raw
}

function requireStorageMediaAccess(req, res, next) {
  const rawPath = getStorageRequestPath(req)
  const token = getStorageMediaToken(req)
  if (token && verifyStorageAccessToken(token, rawPath)) {
    req.storageMediaAccess = true
    return next()
  }
  return requireAuth(req, res, () => requireOwner(req, res, next))
}

function buildAuditReplay(log) {
  const detail = log?.detail_json && typeof log.detail_json === 'object' ? log.detail_json : {}
  return [
    {
      key: 'at',
      label: 'Timestamp',
      value: log?.created_at ?? null,
    },
    {
      key: 'actor',
      label: 'Actor',
      value: {
        user_id: log?.actor_user_id ?? null,
        username: log?.actor_username || null,
        display_name: log?.actor_display_name || null,
        role: log?.actor_role || null,
        email: log?.actor_email || null,
      },
    },
    {
      key: 'action',
      label: 'Action',
      value: log?.action || null,
      severity: log?.severity || 'info',
      status: log?.status || 'success',
    },
    {
      key: 'network',
      label: 'Network & Client',
      value: {
        ip_address: log?.ip_address || null,
        user_agent: log?.user_agent || null,
        request_method: log?.request_method || null,
        request_path: log?.request_path || null,
      },
    },
    {
      key: 'entity',
      label: 'Entity Target',
      value: {
        entity_type: log?.entity_type || null,
        entity_id: log?.entity_id || null,
      },
    },
    {
      key: 'detail',
      label: 'Detail Payload',
      value: detail,
    },
  ]
}

router.get('/api/admin/queue-health', requireAuth, requireAdmin, async (req, res) => {
  try {
    let redisOk = false
    if (redis) {
      try {
        const pong = await redis.ping()
        redisOk = pong === 'PONG'
      } catch {
        redisOk = false
      }
    }

    res.json({
      ok: true,
      redis: { configured: Boolean(redis), ok: redisOk },
      worker: {
        enabled: Boolean(queueTimer),
        tick_ms: QUEUE_TICK_MS,
        sla_seconds: QUEUE_SLA_SECONDS,
        last: lastQueueTick,
      },
    })
  } catch {
    res.status(500).json({ error: 'server_error' })
  }
})

router.get('/api/admin/audit-logs/stats', requireAuth, requireOwner, async (req, res) => {
  try {
    const stats = await adminGetAuditLogStats()
    res.json({ ok: true, stats })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/audit-logs/export', requireAuth, requireOwner, async (req, res) => {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'json'
    const result = await adminListAuditLogs({
      limit: 500,
      offset: 0,
      search: req.query.search,
      action: req.query.action,
      category: req.query.category,
      severity: req.query.severity,
      status: req.query.status,
      actorUserId: req.query.actor_user_id ? Number(req.query.actor_user_id) : undefined,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
    })

    if (format === 'csv') {
      const header = ['ID', 'Timestamp', 'Actor Username', 'Actor Email', 'Action', 'Severity', 'Status', 'Entity Type', 'Entity ID', 'IP Address', 'Detail JSON']
      const rows = (result.logs || []).map((l) => [
        l.id,
        `"${new Date(l.created_at).toISOString()}"`,
        `"${(l.actor_username || '').replace(/"/g, '""')}"`,
        `"${(l.actor_email || '').replace(/"/g, '""')}"`,
        `"${(l.action || '').replace(/"/g, '""')}"`,
        `"${l.severity || 'info'}"`,
        `"${l.status || 'success'}"`,
        `"${(l.entity_type || '').replace(/"/g, '""')}"`,
        `"${(l.entity_id || '').replace(/"/g, '""')}"`,
        `"${(l.ip_address || '').replace(/"/g, '""')}"`,
        `"${JSON.stringify(l.detail_json || {}).replace(/"/g, '""')}"`,
      ])
      const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`)
      return res.send(csv)
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.json"`)
    res.json({ ok: true, exported_at: new Date().toISOString(), total: result.total, logs: result.logs })
  } catch {
    res.status(500).json({ error: 'export_error' })
  }
})

router.get('/api/admin/audit-logs/:id', requireAuth, requireOwner, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const log = await adminGetAuditLogById(id)
    res.json({ ok: true, log, replay: buildAuditReplay(log) })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/audit-logs', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined
    const page = req.query.page ? Number(req.query.page) : 1
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    const action = typeof req.query.action === 'string' ? req.query.action : undefined
    const category = typeof req.query.category === 'string' ? req.query.category : undefined
    const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const actorUserId = req.query.actor_user_id ? Number(req.query.actor_user_id) : undefined
    const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : undefined
    const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : undefined

    const result = await adminListAuditLogs({
      limit,
      offset,
      page,
      search,
      action,
      category,
      severity,
      status,
      actorUserId,
      dateFrom,
      dateTo,
    })
    res.json({ ok: true, ...result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/rbac/matrix', requireAuth, requireAnyRole(['finance', 'support', 'booster', 'admin', 'owner']), async (req, res) => {
  const role = typeof req.user?.role === 'string' ? req.user.role.trim().toLowerCase() : 'user'
  const modules = ADMIN_ROLE_MODULE_ACCESS[role] || []
  const actions = Object.fromEntries(
    Object.entries(ADMIN_ROLE_ACTION_ACCESS).map(([action, roles]) => [action, roles.includes(role)]),
  )
  res.json({ ok: true, role, modules, actions, matrix: { modules: ADMIN_ROLE_MODULE_ACCESS, actions: ADMIN_ROLE_ACTION_ACCESS } })
})

router.get('/api/admin/storage/tree', requireAuth, requireOwner, async (req, res) => {
  const rawPath = typeof req.query.path === 'string' ? req.query.path : ''

  try {
    const result = await buildStorageFolderTree(rawPath, {
      maxDepth: req.query.max_depth,
      maxFolders: req.query.max_folders,
    })
    res.json({ ok: true, ...result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_path') return res.status(400).json({ error: 'invalid_path' })
    if (msg === 'not_directory') return res.status(400).json({ error: 'not_directory' })
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'storage_tree_failed' })
  }
})

router.get('/api/admin/storage/list', requireAuth, requireOwner, async (req, res) => {
  const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
  let target
  try {
    target = resolveStoragePath(rawPath)
  } catch {
    return res.status(400).json({ error: 'invalid_path' })
  }

  try {
    const st = await fs.promises.stat(target.absolute)
    if (!st.isDirectory()) return res.status(400).json({ error: 'not_directory' })

    const allEntries = await fs.promises.readdir(target.absolute, { withFileTypes: true })
    const entries = (await mapStorageItemsWithConcurrency(allEntries, async (entry) => {
      const name = String(entry?.name || '')
      if (!name || name.startsWith('.')) return null
      const relPath = target.rel ? `${target.rel}/${name}` : name
      const absolutePath = path.join(target.absolute, name)

      if (entry.isDirectory()) {
        return {
          name,
          path: relPath,
          type: 'directory',
          media_kind: null,
          size: null,
          mtime: null,
        }
      }

      if (!entry.isFile()) return null
      const mediaKind = getStorageMediaKindByPath(absolutePath)
      if (!mediaKind) return null

      let fileStat = null
      try {
        fileStat = await fs.promises.stat(absolutePath)
      } catch {
        fileStat = null
      }

      return {
        name,
        path: relPath,
        type: 'file',
        media_kind: mediaKind,
        size: fileStat?.size ?? null,
        mtime: fileStat?.mtime ?? null,
        access_token: createStorageAccessToken(relPath),
      }
    }, { concurrency: STORAGE_LIST_STAT_CONCURRENCY })).filter(Boolean)

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true })
    })

    const parentPath = target.rel.includes('/') ? target.rel.slice(0, target.rel.lastIndexOf('/')) : ''

    res.json({
      ok: true,
      root: getStorageBrowserRoot(),
      path: target.rel,
      parent_path: target.rel ? parentPath : null,
      truncated: false,
      media_token_expires_in_seconds: STORAGE_ACCESS_TOKEN_MAX_AGE_SECONDS,
      entries,
    })
  } catch (e) {
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'storage_read_failed' })
  }
})

router.get(['/api/admin/storage/file', '/api/admin/storage/file/raw/*'], requireStorageMediaAccess, async (req, res) => {
  const rawPath = getStorageRequestPath(req)
  let target
  try {
    target = resolveStoragePath(rawPath)
  } catch {
    return res.status(400).json({ error: 'invalid_path' })
  }

  try {
    const stat = await fs.promises.stat(target.absolute)
    if (!stat.isFile()) return res.status(400).json({ error: 'not_file' })

    const mediaKind = getStorageMediaKindByPath(target.absolute)
    if (!mediaKind) return res.status(400).json({ error: 'unsupported_media' })

    const totalSize = Number(stat.size || 0)
    const contentType = getStorageMimeByPath(target.absolute, mediaKind)
    const range = typeof req.headers.range === 'string' ? req.headers.range : ''

    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')

    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [startRaw, endRaw] = range.replace('bytes=', '').split('-')
      let start = startRaw ? Number(startRaw) : 0
      let end = endRaw ? Number(endRaw) : totalSize - 1
      if (!Number.isFinite(start) || start < 0) start = 0
      if (!Number.isFinite(end) || end < start) end = totalSize - 1
      end = Math.min(end, totalSize - 1)

      if (start >= totalSize) {
        res.status(416)
        res.setHeader('Content-Range', `bytes */${totalSize}`)
        return res.end()
      }

      const chunkSize = end - start + 1
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`)
      res.setHeader('Content-Length', String(chunkSize))
      return fs.createReadStream(target.absolute, { start, end }).pipe(res)
    }

    res.status(200)
    res.setHeader('Content-Length', String(totalSize))
    fs.createReadStream(target.absolute).pipe(res)
  } catch (e) {
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'storage_read_failed' })
  }
})

router.get(['/api/admin/storage/thumb', '/api/admin/storage/thumb/raw/*'], requireStorageMediaAccess, async (req, res) => {
  const rawPath = getStorageRequestPath(req)
  let target
  try {
    target = resolveStoragePath(rawPath)
  } catch {
    return res.status(400).json({ error: 'invalid_path' })
  }

  try {
    const stat = await fs.promises.stat(target.absolute)
    if (!stat.isFile()) return res.status(400).json({ error: 'not_file' })

    const mediaKind = getStorageMediaKindByPath(target.absolute)
    if (mediaKind !== 'image') return res.status(400).json({ error: 'unsupported_media' })

    const width = parseStorageNumberInRange(req.query.w, {
      fallback: STORAGE_THUMB_DEFAULT_WIDTH,
      min: STORAGE_THUMB_MIN_WIDTH,
      max: STORAGE_THUMB_MAX_WIDTH,
    })
    const quality = parseStorageNumberInRange(req.query.q, {
      fallback: STORAGE_THUMB_DEFAULT_QUALITY,
      min: STORAGE_THUMB_MIN_QUALITY,
      max: STORAGE_THUMB_MAX_QUALITY,
    })

    const etag = `W/"thumb-${stat.size}-${Number(stat.mtimeMs || 0)}-${width}-${quality}"`
    if (req.headers['if-none-match'] === etag) return res.status(304).end()

    const cacheKey = buildStorageThumbnailCacheKey({
      kind: 'image-webp',
      absolutePath: target.absolute,
      stat,
      width,
      quality,
    })

    // 1. Tier 1: In-memory LRU cache
    const memoryCached = storageThumbCache.get(cacheKey)
    if (memoryCached) {
      return sendStorageThumbnail(res, { etag, contentType: 'image/webp', output: memoryCached })
    }

    // 2. Tier 2: Persistent disk cache
    const diskCached = await readStorageDiskCache(cacheKey, 'webp')
    if (diskCached) {
      storageThumbCache.set(cacheKey, diskCached)
      return sendStorageThumbnail(res, { etag, contentType: 'image/webp', output: diskCached })
    }

    // 3. Tier 3: Sharp generation with lanczos3 downsampling and edge-sharpening
    const output = await sharp(target.absolute)
      .rotate()
      .resize({ width, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
      .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 })
      .webp({ quality, effort: 4 })
      .toBuffer()

    storageThumbCache.set(cacheKey, output)
    writeStorageDiskCache(cacheKey, 'webp', output)
    return sendStorageThumbnail(res, { etag, contentType: 'image/webp', output })
  } catch (e) {
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    return res.status(500).json({ error: 'thumbnail_failed' })
  }
})

router.get(['/api/admin/storage/video-thumb', '/api/admin/storage/video-thumb/raw/*'], requireStorageMediaAccess, async (req, res) => {
  const rawPath = getStorageRequestPath(req)
  let target
  try {
    target = resolveStoragePath(rawPath)
  } catch {
    return res.status(400).json({ error: 'invalid_path' })
  }

  try {
    const stat = await fs.promises.stat(target.absolute)
    if (!stat.isFile()) return res.status(400).json({ error: 'not_file' })

    const mediaKind = getStorageMediaKindByPath(target.absolute)
    if (mediaKind !== 'video') return res.status(400).json({ error: 'unsupported_media' })

    const width = parseStorageNumberInRange(req.query.w, {
      fallback: STORAGE_VIDEO_THUMB_DEFAULT_WIDTH,
      min: STORAGE_VIDEO_THUMB_MIN_WIDTH,
      max: STORAGE_VIDEO_THUMB_MAX_WIDTH,
    })
    const quality = parseStorageNumberInRange(req.query.q, {
      fallback: STORAGE_VIDEO_THUMB_DEFAULT_QUALITY,
      min: STORAGE_VIDEO_THUMB_MIN_QUALITY,
      max: STORAGE_VIDEO_THUMB_MAX_QUALITY,
    })
    const ffmpegQ = mapThumbQualityToFfmpegQ(quality)

    const etag = `W/"vthumb-${stat.size}-${Number(stat.mtimeMs || 0)}-${width}-${quality}"`
    if (req.headers['if-none-match'] === etag) return res.status(304).end()

    const cacheKey = buildStorageThumbnailCacheKey({
      kind: 'video-webp',
      absolutePath: target.absolute,
      stat,
      width,
      quality,
    })

    // 1. Tier 1: In-memory LRU cache
    const memoryCached = storageThumbCache.get(cacheKey)
    if (memoryCached) {
      return sendStorageThumbnail(res, { etag, contentType: 'image/webp', output: memoryCached })
    }

    // 2. Tier 2: Persistent disk cache
    const diskCached = await readStorageDiskCache(cacheKey, 'webp')
    if (diskCached) {
      storageThumbCache.set(cacheKey, diskCached)
      return sendStorageThumbnail(res, { etag, contentType: 'image/webp', output: diskCached })
    }

    // 3. Tier 3: Concurrency-limited FFmpeg extraction + Sharp WebP conversion & sharpening
    const output = await storageFfmpegLimiter(async () => {
      const args = buildStorageVideoThumbFfmpegArgs({ inputPath: target.absolute, width, ffmpegQ })
      const child = spawn('ffmpeg', args, { windowsHide: true })
      const outChunks = []
      const errChunks = []

      child.stdout.on('data', (chunk) => outChunks.push(Buffer.from(chunk)))
      child.stderr.on('data', (chunk) => errChunks.push(Buffer.from(chunk)))

      const aborted = new Promise((resolve) => {
        req.on('close', () => {
          try {
            child.kill('SIGKILL')
          } catch {
            // ignore
          }
          resolve({ aborted: true })
        })
      })

      const finished = new Promise((resolve) => {
        child.on('error', (err) => resolve({ error: err }))
        child.on('close', (code) => resolve({ code }))
      })

      const result = await Promise.race([aborted, finished])
      if (result?.aborted) return null

      if (result?.error) {
        throw new Error(result.error.code === 'ENOENT' ? 'ffmpeg_not_found' : 'thumbnail_failed')
      }

      if (result?.code !== 0) {
        const stderrText = Buffer.concat(errChunks).toString('utf8').trim().toLowerCase()
        if (stderrText.includes('no such file') || stderrText.includes('cannot find')) {
          throw new Error('not_found')
        }
        throw new Error('thumbnail_failed')
      }

      const rawFrame = Buffer.concat(outChunks)
      if (!rawFrame.length) throw new Error('thumbnail_failed')

      const webpOutput = await sharp(rawFrame)
        .rotate()
        .resize({ width, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
        .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 })
        .webp({ quality, effort: 4 })
        .toBuffer()

      return webpOutput
    })

    if (!output) return

    storageThumbCache.set(cacheKey, output)
    writeStorageDiskCache(cacheKey, 'webp', output)
    return sendStorageThumbnail(res, { etag, contentType: 'image/webp', output })
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg === 'not_found' || e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    if (msg === 'ffmpeg_not_found') return res.status(500).json({ error: 'ffmpeg_not_found' })
    return res.status(500).json({ error: 'thumbnail_failed' })
  }
})

// -------------------------------------------------------------
// 📁 File Operations Endpoints (Strictly requireAuth, requireOwner)
// -------------------------------------------------------------

router.post('/api/admin/storage/upload', requireAuth, requireOwner, storageUploadMulter.array('files', 50), async (req, res) => {
    try {
      const rawPath = typeof req.body?.path === 'string' ? req.body.path : ''
      const targetDir = resolveStoragePath(rawPath)

      const dirStat = await fs.promises.stat(targetDir.absolute)
      if (!dirStat.isDirectory()) return res.status(400).json({ error: 'not_directory' })

      const files = Array.isArray(req.files) ? req.files : []
      if (!files.length) return res.status(400).json({ error: 'no_files' })

      const uploaded = []
      for (const file of files) {
        const originalName = String(file.originalname || 'file')
        const safeName = sanitizeStorageFileName(originalName)
        let finalName = safeName
        let targetFilePath = path.join(targetDir.absolute, finalName)

        // If file already exists, generate a unique numbered name
        if (fs.existsSync(targetFilePath)) {
          const ext = path.extname(safeName)
          const base = path.basename(safeName, ext)
          finalName = `${base}-${Date.now().toString().slice(-4)}${ext}`
          targetFilePath = path.join(targetDir.absolute, finalName)
        }

        await fs.promises.writeFile(targetFilePath, file.buffer)
        const relPath = targetDir.rel ? `${targetDir.rel}/${finalName}` : finalName
        const mediaKind = getStorageMediaKindByPath(targetFilePath)

        uploaded.push({
          name: finalName,
          path: relPath,
          size: file.size,
          media_kind: mediaKind,
        })
      }

      res.status(201).json({ ok: true, uploaded })
    } catch (e) {
      const msg = String(e?.message || '')
      if (msg === 'invalid_path' || msg === 'invalid_name') return res.status(400).json({ error: msg })
      if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
      res.status(500).json({ error: 'upload_failed' })
    }
  },
)

router.post('/api/admin/storage/folder', requireAuth, requireOwner, async (req, res) => {
  try {
    const parentPath = typeof req.body?.path === 'string' ? req.body.path : ''
    const folderName = typeof req.body?.name === 'string' ? req.body.name : ''
    const result = await createStorageFolder(parentPath, folderName)
    res.status(201).json({ ok: true, folder: result })
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg === 'already_exists') return res.status(409).json({ error: 'already_exists' })
    if (msg === 'invalid_path' || msg === 'invalid_name') return res.status(400).json({ error: msg })
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'create_folder_failed' })
  }
})

router.patch('/api/admin/storage/rename', requireAuth, requireOwner, async (req, res) => {
  try {
    const sourcePath = typeof req.body?.path === 'string' ? req.body.path : ''
    const newName = typeof req.body?.new_name === 'string' ? req.body.new_name : ''
    const result = await renameStorageItem(sourcePath, newName)
    res.json({ ok: true, renamed: result })
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg === 'already_exists') return res.status(409).json({ error: 'already_exists' })
    if (msg === 'invalid_path' || msg === 'invalid_name' || msg === 'cannot_rename_root') {
      return res.status(400).json({ error: msg })
    }
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'rename_failed' })
  }
})

router.delete('/api/admin/storage/delete', requireAuth, requireOwner, async (req, res) => {
  try {
    const rawPaths = Array.isArray(req.body?.paths)
      ? req.body.paths
      : typeof req.body?.path === 'string'
        ? [req.body.path]
        : []

    if (!rawPaths.length) return res.status(400).json({ error: 'no_paths_provided' })

    const deleted = []
    for (const p of rawPaths) {
      const result = await deleteStorageItem(p)
      deleted.push(result.deleted_path)
    }

    res.json({ ok: true, deleted })
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg === 'invalid_path' || msg === 'cannot_delete_root') return res.status(400).json({ error: msg })
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'delete_failed' })
  }
})

router.post('/api/admin/storage/download-zip', requireAuth, requireOwner, async (req, res) => {
  try {
    const rawPaths = Array.isArray(req.body?.paths) ? req.body.paths : []
    if (!rawPaths.length) return res.status(400).json({ error: 'no_paths_provided' })

    const archive = new ZipArchive({ zlib: { level: 6 } })

    archive.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'archive_failed' })
      }
    })

    const zipFilename = `vxpers-storage-${Date.now().toString().slice(-6)}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`)

    archive.pipe(res)

    for (const raw of rawPaths) {
      try {
        const resolved = resolveStoragePath(raw)
        if (!fs.existsSync(resolved.absolute)) continue

        const stat = await fs.promises.stat(resolved.absolute)
        const entryName = path.basename(resolved.absolute)
        if (stat.isDirectory()) {
          archive.directory(resolved.absolute, entryName)
        } else if (stat.isFile()) {
          archive.file(resolved.absolute, { name: entryName })
        }
      } catch {
        // Skip invalid paths safely
      }
    }

    await archive.finalize()
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'download_zip_failed' })
    }
  }
})

router.get('/api/admin/dashboard/overview', requireAuth, requireAnyRole(['admin', 'owner', 'finance', 'support', 'booster']), async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 14
    const urgentMinutes = req.query.urgent_minutes ? Number(req.query.urgent_minutes) : 60
    const urgentLimit = req.query.urgent_limit ? Number(req.query.urgent_limit) : 5
    const overview = await adminGetDashboardOverview({ days, urgentMinutes, urgentLimit })
    res.json({ ok: true, overview })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_days') return res.status(400).json({ error: 'invalid_days' })
    if (msg === 'invalid_urgent_minutes') return res.status(400).json({ error: 'invalid_urgent_minutes' })
    if (msg === 'invalid_urgent_limit') return res.status(400).json({ error: 'invalid_urgent_limit' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/dashboard/ops-pulse', requireAuth, requireAnyRole(['admin', 'owner', 'finance', 'support', 'booster']), async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 14
    const limit = req.query.limit ? Number(req.query.limit) : 12
    const supportSlaMinutes = req.query.support_sla_minutes ? Number(req.query.support_sla_minutes) : 30
    const farmSlaMinutes = req.query.farm_sla_minutes ? Number(req.query.farm_sla_minutes) : 60
    const pulse = await adminGetOpsPulse({ days, limit, supportSlaMinutes, farmSlaMinutes })
    res.json({ ok: true, pulse })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_days') return res.status(400).json({ error: 'invalid_days' })
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_support_sla_minutes') return res.status(400).json({ error: 'invalid_support_sla_minutes' })
    if (msg === 'invalid_farm_sla_minutes') return res.status(400).json({ error: 'invalid_farm_sla_minutes' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/ui-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await getUiSettings()
    res.json({
      ok: true,
      image_settings: settings?.image_settings,
      branding_settings: settings?.branding_settings,
      homepage_settings: settings?.homepage_settings,
      site_settings: settings?.site_settings,
      topup_settings: settings?.topup_settings,
    })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/ui-settings', requireAuth, requireAdmin, async (req, res) => {
  const { image_settings, branding_settings, homepage_settings, site_settings, topup_settings } = req.body ?? {}
  try {
    const settings = await updateUiSettings({
      imageSettings: image_settings,
      brandingSettings: branding_settings,
      homepageSettings: homepage_settings,
      siteSettings: site_settings,
      topupSettings: topup_settings,
    })
    res.json({
      ok: true,
      image_settings: settings?.image_settings,
      branding_settings: settings?.branding_settings,
      homepage_settings: settings?.homepage_settings,
      site_settings: settings?.site_settings,
      topup_settings: settings?.topup_settings,
    })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Auto-assign config ──

router.get('/api/admin/auto-assign-config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = await getAutoAssignConfig()
    res.json({ ok: true, config })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/auto-assign-config', requireAuth, requireAdmin, async (req, res) => {
  const { config } = req.body ?? {}
  try {
    const next = await updateAutoAssignConfig(config)
    res.json({ ok: true, config: next })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/site-messages', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const data = await adminListSiteMessages({ limit, offset })
    res.json({ ok: true, ...data })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/site-messages', requireAuth, requireAdmin, async (req, res) => {
  const { target_type, target_user_id, title, body } = req.body ?? {}
  try {
    const row = await adminCreateSiteMessage({ senderId: req.user.id, targetType: target_type, targetUserId: target_user_id, title, body })
    res.json({ ok: true, id: row.id, created_at: row.created_at })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_title') return res.status(400).json({ error: 'invalid_title' })
    if (msg === 'invalid_target_user') return res.status(400).json({ error: 'invalid_target_user' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/site-messages/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await adminDeleteSiteMessage(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Admin Direct Chat & Dispatch ──

router.get('/api/admin/direct-chat/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await adminListDirectChatUsers()
    res.json({ ok: true, users })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/direct-chat/:userId/messages', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_user_id' })
  try {
    const messages = await adminGetDirectChatMessages(userId)
    res.json({ ok: true, messages })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_target_user') return res.status(400).json({ error: 'invalid_target_user' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/direct-chat/:userId/messages', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId)
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid_user_id' })
  const { title, body } = req.body ?? {}
  try {
    const row = await adminCreateSiteMessage({
      senderId: req.user.id,
      targetType: 'individual',
      targetUserId: userId,
      title: title || 'ข้อความตรงจากทีมงาน',
      body,
    })
    res.json({ ok: true, id: row.id, created_at: row.created_at })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_title') return res.status(400).json({ error: 'invalid_title' })
    if (msg === 'invalid_target_user') return res.status(400).json({ error: 'invalid_target_user' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Admin Announcements CRUD ──

router.get('/api/admin/announcements', requireAuth, requireAdmin, async (req, res) => {
  try {
    const list = await adminListAnnouncements()
    res.json({ ok: true, announcements: list })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/announcements', requireAuth, requireAdmin, async (req, res) => {
  const { title, text, link, bg, icon, enabled, push_to_inbox, sort_order, start_at, end_at } = req.body ?? {}
  try {
    const row = await adminCreateAnnouncement({ title, text, link, bg, icon, enabled, pushToInbox: push_to_inbox, sortOrder: sort_order, startAt: start_at, endAt: end_at })
    res.json({ ok: true, announcement: row })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_text') return res.status(400).json({ error: 'invalid_text' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/announcements/:id', requireAuth, requireAdmin, async (req, res) => {
  const { title, text, link, bg, icon, enabled, push_to_inbox, sort_order, start_at, end_at } = req.body ?? {}
  try {
    const row = await adminUpdateAnnouncement(req.params.id, { title, text, link, bg, icon, enabled, pushToInbox: push_to_inbox, sortOrder: sort_order, startAt: start_at, endAt: end_at })
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true, announcement: row })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id' || msg === 'invalid_text') return res.status(400).json({ error: msg })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/announcements/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await adminDeleteAnnouncement(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/announcements/reorder', requireAuth, requireAdmin, async (req, res) => {
  const { ordered_ids } = req.body ?? {}
  try {
    await adminReorderAnnouncements(ordered_ids)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/transactions', requireAuth, requireFinance, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const items = await listAllTransactions({ limit, offset })
    res.json({ ok: true, transactions: items })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/owner/stats', requireAuth, requireOwner, async (req, res) => {
  try {
    const [userStats, balanceStats, orderStats, revenueStats, adminActivity] = await Promise.all([
      pool.query(`
        SELECT role, COUNT(*)::int AS count
        FROM users
        GROUP BY role
        ORDER BY count DESC
      `),
      pool.query(`SELECT COALESCE(SUM(balance), 0)::bigint AS total_balance FROM wallets`),
      pool.query(`SELECT COUNT(*)::int AS total_orders FROM orders`),
      pool.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total_revenue FROM topups WHERE status = 'approved'`),
      pool.query(`
        SELECT u.id, u.username, u.email, u.role,
               COUNT(al.id)::int AS audit_count,
               MAX(al.created_at) AS last_action_at
        FROM users u
        LEFT JOIN audit_logs al ON al.actor_user_id = u.id
        WHERE u.role IN ('owner', 'admin', 'finance', 'support', 'booster')
        GROUP BY u.id
        ORDER BY last_action_at DESC NULLS LAST
        LIMIT 20
      `),
    ])
    const by_role = Object.fromEntries(userStats.rows.map((r) => [r.role, r.count]))
    const total_users = userStats.rows.reduce((s, r) => s + r.count, 0)
    res.json({
      ok: true,
      stats: {
        total_users,
        by_role,
        total_balance: Number(balanceStats.rows[0]?.total_balance ?? 0),
        total_orders: Number(orderStats.rows[0]?.total_orders ?? 0),
        total_revenue: Number(revenueStats.rows[0]?.total_revenue ?? 0),
      },
      top_admins: adminActivity.rows,
    })
  } catch (e) {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/webhooks', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const items = await listWebhookLogs({ limit, offset })
    res.json({ ok: true, webhooks: items })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads')
const PRODUCT_UPLOADS_ROOT = path.join(UPLOADS_ROOT, 'products')
if (!fs.existsSync(PRODUCT_UPLOADS_ROOT)) {
  fs.mkdirSync(PRODUCT_UPLOADS_ROOT, { recursive: true })
}

router.post('/api/admin/media/upload', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rawImage = req.body?.image_data
    if (!rawImage || typeof rawImage !== 'string') {
      return res.status(400).json({ error: 'invalid_image_data' })
    }
    const decoded = decodeDataUrlImage(rawImage)
    const maxBytes = 15 * 1024 * 1024
    if (decoded.buffer.length > maxBytes) return res.status(413).json({ error: 'image_too_large' })
    const { buffer, ext } = await sanitizeProductImage(decoded)
    const filename = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.${ext}`
    const target = path.join(PRODUCT_UPLOADS_ROOT, filename)
    await fs.promises.writeFile(target, buffer)
    const url = `/uploads/products/${filename}`
    res.status(201).json({ ok: true, url })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_image_data') return res.status(400).json({ error: 'invalid_image_data' })
    if (msg === 'unsupported_image_type') return res.status(400).json({ error: 'unsupported_image_type' })
    res.status(500).json({ error: 'upload_failed' })
  }
})
router.post('/api/admin/media/fetch-remote', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rawUrl = String(req.body?.url || '').trim()
    if (!rawUrl) return res.status(400).json({ error: 'invalid_url' })

    let buffer
    let mimeType = 'image/jpeg'

    if (rawUrl.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), 'server', rawUrl)
      buffer = await fs.promises.readFile(filePath)
    } else if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const resp = await fetch(rawUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      clearTimeout(timeout)
      if (!resp.ok) return res.status(400).json({ error: 'fetch_failed' })
      const arrayBuf = await resp.arrayBuffer()
      buffer = Buffer.from(arrayBuf)
      mimeType = resp.headers.get('content-type') || 'image/jpeg'
    } else {
      return res.status(400).json({ error: 'invalid_url' })
    }

    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
    res.json({ ok: true, data_url: dataUrl })
  } catch (err) {
    res.status(500).json({ error: 'fetch_failed' })
  }
})

export default router
