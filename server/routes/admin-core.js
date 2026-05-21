import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { spawn } from 'node:child_process'
import {
  adminGetAuditLogById,
  adminListAuditLogs,
  adminGetDashboardOverview,
  adminGetOpsPulse,
  getUiSettings,
  updateUiSettings,
  getAutoAssignConfig,
  updateAutoAssignConfig,
  adminCreateSiteMessage,
  adminListSiteMessages,
  adminDeleteSiteMessage,
  adminListAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
  adminReorderAnnouncements,
  listAllTransactions,
  listWebhookLogs,
  pool,
} from '../db.js'
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
  resolveStoragePath,
  getStorageMediaKindByPath,
  getStorageMimeByPath,
  parseStorageNumberInRange,
  mapThumbQualityToFfmpegQ,
  buildStorageVideoThumbFfmpegArgs,
  createStorageAccessToken,
  verifyStorageAccessToken,
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

function getStorageMediaToken(req) {
  const raw = req.query.st ?? req.query.storage_token
  return typeof raw === 'string' ? raw : ''
}

function requireStorageMediaAccess(req, res, next) {
  const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
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
        email: log?.actor_email || null,
      },
    },
    {
      key: 'action',
      label: 'Action',
      value: log?.action || null,
    },
    {
      key: 'entity',
      label: 'Entity',
      value: {
        entity_type: log?.entity_type || null,
        entity_id: log?.entity_id || null,
      },
    },
    {
      key: 'detail',
      label: 'Detail',
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
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const action = typeof req.query.action === 'string' ? req.query.action : undefined
    const logs = await adminListAuditLogs({ limit, offset, action })
    res.json({ ok: true, logs })
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
    const entries = []

    for (const entry of allEntries) {
      const name = String(entry?.name || '')
      if (!name || name.startsWith('.')) continue
      const relPath = target.rel ? `${target.rel}/${name}` : name
      const absolutePath = path.join(target.absolute, name)

      if (entry.isDirectory()) {
        entries.push({
          name,
          path: relPath,
          type: 'directory',
          media_kind: null,
          size: null,
          mtime: null,
        })
        continue
      }

      if (!entry.isFile()) continue
      const mediaKind = getStorageMediaKindByPath(absolutePath)
      if (!mediaKind) continue

      let fileStat = null
      try {
        fileStat = await fs.promises.stat(absolutePath)
      } catch {
        fileStat = null
      }

      entries.push({
        name,
        path: relPath,
        type: 'file',
        media_kind: mediaKind,
        size: fileStat?.size ?? null,
        mtime: fileStat?.mtime ?? null,
        access_token: createStorageAccessToken(relPath),
      })
    }

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

router.get('/api/admin/storage/file', requireStorageMediaAccess, async (req, res) => {
  const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
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

router.get('/api/admin/storage/thumb', requireStorageMediaAccess, async (req, res) => {
  const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
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

    const output = await sharp(target.absolute)
      .rotate()
      .resize({ width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()

    res.setHeader('ETag', etag)
    res.setHeader('Content-Type', 'image/webp')
    res.setHeader('Content-Length', String(output.length))
    res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate')
    return res.status(200).send(output)
  } catch (e) {
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    return res.status(500).json({ error: 'thumbnail_failed' })
  }
})

router.get('/api/admin/storage/video-thumb', requireStorageMediaAccess, async (req, res) => {
  const rawPath = typeof req.query.path === 'string' ? req.query.path : ''
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
    if (result?.aborted) return

    if (result?.error) {
      if (result.error?.code === 'ENOENT') return res.status(500).json({ error: 'ffmpeg_not_found' })
      return res.status(500).json({ error: 'thumbnail_failed' })
    }

    if (result?.code !== 0) {
      const stderrText = Buffer.concat(errChunks).toString('utf8').trim().toLowerCase()
      if (stderrText.includes('no such file') || stderrText.includes('cannot find')) return res.status(404).json({ error: 'not_found' })
      return res.status(500).json({ error: 'thumbnail_failed' })
    }

    const output = Buffer.concat(outChunks)
    if (!output.length) return res.status(500).json({ error: 'thumbnail_failed' })

    res.setHeader('ETag', etag)
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Content-Length', String(output.length))
    res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate')
    return res.status(200).send(output)
  } catch (e) {
    if (e?.code === 'ENOENT') return res.status(404).json({ error: 'not_found' })
    return res.status(500).json({ error: 'thumbnail_failed' })
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
    res.json({ ok: true, image_settings: settings?.image_settings, branding_settings: settings?.branding_settings, homepage_settings: settings?.homepage_settings })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/ui-settings', requireAuth, requireAdmin, async (req, res) => {
  const { image_settings, branding_settings, homepage_settings, site_settings } = req.body ?? {}
  try {
    const settings = await updateUiSettings({ imageSettings: image_settings, brandingSettings: branding_settings, homepageSettings: homepage_settings, siteSettings: site_settings })
    res.json({ ok: true, image_settings: settings?.image_settings, branding_settings: settings?.branding_settings, homepage_settings: settings?.homepage_settings, site_settings: settings?.site_settings })
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

export default router
