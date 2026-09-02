import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { env } from './config/env.js'
import { csrfOriginGuard, globalErrorHandler, securityHeaders } from './lib/security.js'

// API Routes
import apiRouter from './routes/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function isLocalDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
    String(origin || ''),
  )
}

export function corsOriginFn(origin, cb) {
  if (!origin) return cb(null, true)
  const normalizedOrigin = String(origin || '').trim().replace(/\/+$/, '').toLowerCase()
  if (normalizedOrigin === 'null' && env.ALLOW_NULL_ORIGIN) return cb(null, true)
  if (env.CLIENT_ORIGIN_SET.has(normalizedOrigin)) return cb(null, true)
  if (env.ALLOW_LOCAL_DEV_ORIGINS && isLocalDevOrigin(normalizedOrigin)) return cb(null, true)
  console.warn(`[CORS] blocked origin: ${origin}`)
  return cb(null, false)
}

export function createApp() {
  const app = express()

  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1)
  }

  const UPLOADS_ROOT = path.join(__dirname, 'uploads')
  const AVATAR_UPLOADS_ROOT = path.join(UPLOADS_ROOT, 'avatars')

  // Middleware pipeline
  app.use(compression())
  app.use(securityHeaders({ clientOrigins: env.CLIENT_ORIGINS, allowLocalDevOrigins: env.ALLOW_LOCAL_DEV_ORIGINS }))
  app.use(cors({ origin: corsOriginFn, credentials: true }))
  app.use(cookieParser())
  app.use(csrfOriginGuard({ clientOrigins: env.CLIENT_ORIGINS, allowLocalDevOrigins: env.ALLOW_LOCAL_DEV_ORIGINS }))
  app.use(express.json({ limit: '10mb' }))

  // Mobile / PWA friendly cache headers
  app.use((req, res, next) => {
    if (req.path === '/sw-push.js') {
      res.setHeader('Service-Worker-Allowed', '/')
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    }
    if (req.path === '/manifest.webmanifest') {
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Content-Type', 'application/manifest+json')
    }
    next()
  })

  // Static uploads directory
  if (!fs.existsSync(AVATAR_UPLOADS_ROOT)) {
    fs.mkdirSync(AVATAR_UPLOADS_ROOT, { recursive: true })
  }
  app.use('/uploads', express.static(UPLOADS_ROOT, { index: false, maxAge: '7d' }))

  // Domain redirect
  app.use((req, res, next) => {
    const host = String(req.hostname || req.headers.host || '').split(':')[0].toLowerCase()
    if (host === 'key.vxpers.com' && (req.path === '/' || req.path === '')) {
      return res.redirect(302, '/tracker')
    }
    next()
  })

  // API Routes
  app.use(apiRouter)

  // Client serving
  if (env.SERVE_CLIENT) {
    const distDir = path.join(__dirname, '..', 'client', 'dist')
    const indexFile = path.join(distDir, 'index.html')
    if (fs.existsSync(indexFile)) {
      app.use(
        express.static(distDir, {
          index: false,
          setHeaders(res, filePath) {
            if (/\/assets\//.test(filePath)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            }
            if (filePath.endsWith('sw-push.js')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
              res.setHeader('Service-Worker-Allowed', '/')
            }
          },
        }),
      )
      app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not_found' })
        res.setHeader('Cache-Control', 'no-cache')
        res.sendFile(indexFile)
      })
    }
  }

  // Error handling middleware
  app.use(globalErrorHandler)

  return app
}
