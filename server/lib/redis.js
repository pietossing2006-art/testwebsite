import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ? String(process.env.REDIS_URL) : ''

export const redis = REDIS_URL ? new Redis(REDIS_URL, { maxRetriesPerRequest: 1, enableReadyCheck: true }) : null

if (redis) {
  redis.on('error', () => {
    // Keep request handling stable if Redis is temporarily unavailable.
  })
}
