import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import cookieParser from 'cookie-parser'

import * as security from '../../lib/security.js'

async function withHttpServer(app, fn) {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    await fn(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  }
}

test('securityHeaders adds modern HTTP security headers', async () => {
  const app = express()
  app.use(security.securityHeaders())
  app.get('/probe', (req, res) => res.json({ ok: true }))

  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/probe`)

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN')
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
    assert.ok(res.headers.get('strict-transport-security')?.includes('max-age=15552000'))
    assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"))
  })
})

test('csrfOriginGuard rejects cookie-authenticated unsafe requests from untrusted origins', async () => {
  const app = express()
  app.use(cookieParser())
  app.use(security.csrfOriginGuard({ clientOrigins: ['https://store.example'] }))
  app.post('/api/me/profile', (req, res) => res.json({ ok: true }))

  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/me/profile`, {
      method: 'POST',
      headers: {
        Cookie: 'auth_token=session-token',
        Origin: 'https://evil.example',
      },
    })

    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { error: 'csrf_origin_blocked' })
  })
})

test('csrfOriginGuard allows bearer-authenticated unsafe API requests without origin coupling', async () => {
  const app = express()
  app.use(cookieParser())
  app.use(security.csrfOriginGuard({ clientOrigins: ['https://store.example'] }))
  app.post('/api/me/profile', (req, res) => res.json({ ok: true }))

  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/me/profile`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer api-token',
        Origin: 'https://evil.example',
      },
    })

    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
  })
})

test('globalErrorHandler hides unexpected system error details', () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  let statusCode = null
  let body = null
  const res = {
    headersSent: false,
    status(code) {
      statusCode = code
      return this
    },
    json(payload) {
      body = payload
      return this
    },
  }

  try {
    security.globalErrorHandler(Object.assign(new Error('password_hash column missing'), { code: '42703' }), {}, res, () => {})
  } finally {
    if (previousNodeEnv == null) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }

  assert.equal(statusCode, 500)
  assert.deepEqual(body, { error: 'internal_server_error' })
  assert.equal(JSON.stringify(body).includes('password_hash'), false)
  assert.equal(JSON.stringify(body).includes('42703'), false)
})
