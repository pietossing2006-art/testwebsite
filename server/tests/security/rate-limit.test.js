import test from 'node:test'
import assert from 'node:assert/strict'

import { createMemoryRateLimitStore, rateLimitMiddleware } from '../../lib/auth.js'

function createResponseRecorder() {
  let done
  const result = new Promise((resolve) => {
    done = resolve
  })
  const res = {
    statusCode: 200,
    body: null,
    headers: new Map(),
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), String(value))
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      done({ nextCalled: false, res: this })
      return this
    },
  }
  return { res, result }
}

async function runMiddleware(middleware, req) {
  const { res, result } = createResponseRecorder()
  const nextResult = new Promise((resolve, reject) => {
    const next = (err) => (err ? reject(err) : resolve({ nextCalled: true, res }))
    const returned = middleware(req, res, next)
    if (returned && typeof returned.then === 'function') returned.catch(reject)
  })
  return Promise.race([result, nextResult])
}

class FakeRedis {
  constructor() {
    this.calls = []
    this.counts = new Map()
    this.ttls = new Map()
  }

  async incr(key) {
    this.calls.push(['incr', key])
    const next = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, next)
    return next
  }

  async pexpire(key, ms) {
    this.calls.push(['pexpire', key, ms])
    this.ttls.set(key, ms)
    return 1
  }

  async pttl(key) {
    this.calls.push(['pttl', key])
    return this.ttls.get(key) ?? 0
  }
}

test('rateLimitMiddleware uses Redis counters when a Redis client is available', async () => {
  const redisClient = new FakeRedis()
  const middleware = rateLimitMiddleware({
    windowMs: 60_000,
    max: 1,
    keyPrefix: 'login',
    redisClient,
  })
  const req = { headers: {}, socket: { remoteAddress: '203.0.113.10' } }

  const first = await runMiddleware(middleware, req)
  const second = await runMiddleware(middleware, req)

  assert.equal(first.nextCalled, true)
  assert.equal(second.res.statusCode, 429)
  assert.deepEqual(second.res.body, { error: 'too_many_requests' })
  assert.ok(redisClient.calls.some(([cmd]) => cmd === 'incr'))
})

test('memory rate limit store prunes expired buckets and caps tracked keys', () => {
  let now = 1_000
  const store = createMemoryRateLimitStore({ maxBuckets: 2, now: () => now })

  store.hit('a', 100)
  store.hit('b', 100)
  assert.equal(store.size, 2)

  now = 1_200
  store.hit('c', 100)
  assert.equal(store.has('a'), false)
  assert.equal(store.has('b'), false)
  assert.equal(store.has('c'), true)

  store.hit('d', 100)
  store.hit('e', 100)
  assert.equal(store.size, 2)
  assert.equal(store.has('c'), false)
  assert.equal(store.has('d'), true)
  assert.equal(store.has('e'), true)
})
