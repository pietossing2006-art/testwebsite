import dotenv from 'dotenv'
import http from 'node:http'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initDbPg, seedDb, processAutoClockOuts } from './db.js'
import { initSocketIO } from './lib/socket.js'
import authRoutes from './routes/auth.js'
import meRoutes from './routes/me.js'
import publicRoutes from './routes/public.js'
import topupsRoutes from './routes/topups.js'
import discordRoutes from './routes/discord.js'
import growthRoutes from './routes/growth.js'
import adminCoreRoutes from './routes/admin-core.js'
import adminCatalogRoutes from './routes/admin-catalog.js'
import adminOpsRoutes from './routes/admin-ops.js'
import trackerRoutes from './routes/tracker.js'
import { initTrackerStore } from './lib/trackerStore.js'
import { startDiscordBot } from './lib/discordBot.js'
import { csrfOriginGuard, globalErrorHandler, securityHeaders } from './lib/security.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
function normalizeOriginValue(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase()
}
function isLocalDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(origin || ''))
}
const CLIENT_ORIGINS_RAW = process.env.CLIENT_ORIGINS ? String(process.env.CLIENT_ORIGINS) : process.env.CLIENT_ORIGIN ? String(process.env.CLIENT_ORIGIN) : 'http://localhost:5173'
const CLIENT_ORIGINS = CLIENT_ORIGINS_RAW.split(',')
  .map((x) => normalizeOriginValue(x))
  .filter(Boolean)
const CLIENT_ORIGIN_SET = new Set(CLIENT_ORIGINS)
const ALLOW_LOCAL_DEV_ORIGINS = TRUE_VALUES.has(
  String(process.env.ALLOW_LOCAL_DEV_ORIGINS ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')).trim().toLowerCase(),
)
const ALLOW_NULL_ORIGIN = TRUE_VALUES.has(
  String(process.env.ALLOW_NULL_ORIGIN ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')).trim().toLowerCase(),
)
const UPLOADS_ROOT = path.join(__dirname, 'uploads')
const AVATAR_UPLOADS_ROOT = path.join(UPLOADS_ROOT, 'avatars')

const corsOriginFn = (origin, cb) => {
  if (!origin) return cb(null, true)
  const normalizedOrigin = normalizeOriginValue(origin)
  if (normalizedOrigin === 'null' && ALLOW_NULL_ORIGIN) return cb(null, true)
  if (CLIENT_ORIGIN_SET.has(normalizedOrigin)) return cb(null, true)
  if (ALLOW_LOCAL_DEV_ORIGINS && isLocalDevOrigin(normalizedOrigin)) return cb(null, true)
  console.warn(`[CORS] blocked origin: ${origin}`)
  return cb(null, false)
}

app.use(compression())
app.use(securityHeaders({ clientOrigins: CLIENT_ORIGINS, allowLocalDevOrigins: ALLOW_LOCAL_DEV_ORIGINS }))
app.use(cors({ origin: corsOriginFn, credentials: true }))
app.use(cookieParser())
app.use(csrfOriginGuard({ clientOrigins: CLIENT_ORIGINS, allowLocalDevOrigins: ALLOW_LOCAL_DEV_ORIGINS }))
app.use(express.json({ limit: '10mb' }))

// Mobile / PWA friendly cache headers
app.use((req, res, next) => {
  // Allow service worker scope at root
  if (req.path === '/sw-push.js') {
    res.setHeader('Service-Worker-Allowed', '/')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  }
  // Manifest: no cache so updates apply fast
  if (req.path === '/manifest.webmanifest') {
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Content-Type', 'application/manifest+json')
  }
  next()
})
if (!fs.existsSync(AVATAR_UPLOADS_ROOT)) fs.mkdirSync(AVATAR_UPLOADS_ROOT, { recursive: true })
app.use('/uploads', express.static(UPLOADS_ROOT, { index: false, maxAge: '7d' }))

app.use((req, res, next) => {
  const host = String(req.hostname || req.headers.host || '').split(':')[0].toLowerCase()
  if (host === 'key.vxpers.com' && (req.path === '/' || req.path === '')) {
    return res.redirect(302, '/tracker')
  }
  next()
})

app.use(authRoutes)
app.use(meRoutes)
app.use(publicRoutes)
app.use(topupsRoutes)
app.use(discordRoutes)
app.use(growthRoutes)
app.use(adminCoreRoutes)
app.use(adminCatalogRoutes)
app.use(adminOpsRoutes)
app.use('/api/tracker', trackerRoutes)

;(async () => {
  try {
    await initDbPg()
    await seedDb()
    await initTrackerStore()
    await startDiscordBot()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('DB init failed', e)
    process.exit(1)
  }
})()

const port = process.env.PORT ? Number(process.env.PORT) : 3001

function enableClientServing() {
  const enabled = process.env.SERVE_CLIENT === '1' || process.env.NODE_ENV === 'production'
  if (!enabled) return

  const distDir = path.join(__dirname, '..', 'client', 'dist')
  const indexFile = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexFile)) {
    console.warn('SERVE_CLIENT enabled but client/dist/index.html not found:', indexFile)
    return
  }

  app.use(express.static(distDir, {
    index: false,
    setHeaders(res, filePath) {
      // Hashed assets (JS/CSS bundles) — cache 1 year
      if (/\/assets\//.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      // Service worker — never cache
      if (filePath.endsWith('sw-push.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.setHeader('Service-Worker-Allowed', '/')
      }
    },
  }))
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not_found' })
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexFile)
  })
}

enableClientServing()

app.use(globalErrorHandler)

const httpServer = http.createServer(app)
initSocketIO(httpServer, { origin: corsOriginFn, credentials: true })

httpServer.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  // Auto clock-out checker every 30 seconds
  setInterval(() => {
    processAutoClockOuts().catch(() => {})
  }, 30_000)
})
