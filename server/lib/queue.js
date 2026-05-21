import { queueReleaseExpiredBoosterClaims } from '../db.js'
import { redis } from './redis.js'

const QUEUE_SLA_SECONDS = process.env.QUEUE_SLA_SECONDS ? Number(process.env.QUEUE_SLA_SECONDS) : 300
const QUEUE_TICK_MS = process.env.QUEUE_TICK_MS ? Number(process.env.QUEUE_TICK_MS) : 10_000
const QUEUE_LOCK_TTL_MS = process.env.QUEUE_LOCK_TTL_MS ? Number(process.env.QUEUE_LOCK_TTL_MS) : 15_000

export { QUEUE_SLA_SECONDS, QUEUE_TICK_MS }
export { redis }

export async function withRedisLock({ key, ttlMs }, fn) {
  if (!redis) return { ok: false, skipped: true, reason: 'redis_not_configured' }
  const k = String(key || '')
  const ttl = Number(ttlMs)
  if (!k) return { ok: false, skipped: true, reason: 'invalid_lock_key' }
  if (!Number.isFinite(ttl) || ttl <= 0) return { ok: false, skipped: true, reason: 'invalid_lock_ttl' }

  const token = `${process.pid}:${Date.now()}:${Math.random()}`
  const setRes = await redis.set(k, token, 'PX', ttl, 'NX')
  if (setRes !== 'OK') return { ok: false, skipped: true, reason: 'lock_busy' }
  try {
    const data = await fn()
    return { ok: true, data }
  } finally {
    // best-effort unlock; TTL is the real safety net
    try {
      const v = await redis.get(k)
      if (v === token) await redis.del(k)
    } catch {
      // ignore
    }
  }
}

export const lastQueueTick = { at: null, released: null, error: null }
export let queueTimer = null

async function queueTick() {
  if (!Number.isFinite(QUEUE_TICK_MS) || QUEUE_TICK_MS < 1000) return
  if (!Number.isFinite(QUEUE_SLA_SECONDS) || QUEUE_SLA_SECONDS <= 0) return

  const res = await withRedisLock(
    { key: 'splitwise:queue:sla_release_lock', ttlMs: QUEUE_LOCK_TTL_MS },
    async () => queueReleaseExpiredBoosterClaims({ slaSeconds: QUEUE_SLA_SECONDS, limit: 50 }),
  )

  lastQueueTick.at = new Date().toISOString()
  if (res.ok) {
    lastQueueTick.released = res.data?.released ?? null
    lastQueueTick.error = null
  } else {
    // treat lock busy / redis missing as non-error (stable behavior)
    lastQueueTick.released = null
    lastQueueTick.error = res.reason || null
  }
}

if (redis && QUEUE_TICK_MS && QUEUE_TICK_MS > 0) {
  queueTimer = setInterval(() => {
    queueTick().catch((e) => {
      lastQueueTick.at = new Date().toISOString()
      lastQueueTick.error = String(e?.message ?? 'queue_tick_error')
    })
  }, QUEUE_TICK_MS)
  queueTimer.unref?.()
}
