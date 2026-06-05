import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'

import { createGrowthRouter } from '../../routes/growth.js'

async function withServer(app, fn) {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    await fn(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  }
}

function createFakeAuth(role = 'user') {
  return {
    requireAuth(req, res, next) {
      req.user = { id: 7, email: 'user@example.com', role }
      next()
    },
    requireAdmin(req, res, next) {
      if (!['admin', 'owner'].includes(role)) return res.status(403).json({ error: 'forbidden' })
      next()
    },
  }
}

function createFakeStore() {
  const wishlist = new Set()
  return {
    listMyWishlist: async () => ({ items: [...wishlist].map((product_id) => ({ product_id, name: `Product ${product_id}` })) }),
    upsertWishlistItem: async ({ userId, productId }) => {
      wishlist.add(Number(productId))
      return { user_id: userId, product_id: Number(productId) }
    },
    deleteWishlistItem: async ({ productId }) => {
      wishlist.delete(Number(productId))
      return { ok: true }
    },
    getNotificationPreferences: async () => ({
      wishlist_stock: true,
      wishlist_promo: true,
      campaigns: true,
      vip: true,
      reviews: true,
      push_enabled: false,
    }),
    updateNotificationPreferences: async ({ preferences }) => preferences,
    listProductReviewsPublic: async () => ({
      summary: { average_rating: 5, review_count: 1 },
      reviews: [{ id: 1, rating: 5, comment: 'good' }],
    }),
    createProductReview: async () => ({ id: 11, status: 'pending' }),
    listActiveGrowthCampaigns: async () => ({ campaigns: [] }),
    getMyVip: async () => ({ tier: null, points_spent: 0 }),
    adminListGrowthCampaigns: async () => ({ campaigns: [] }),
    adminListReviews: async () => ({ reviews: [] }),
    adminListVipTiers: async () => ({ tiers: [] }),
    adminListWishlistSignals: async () => ({ signals: [] }),
    adminListGrowthNotifications: async () => ({ events: [] }),
    adminPreviewDiscounts: async () => ({ final_total_points: 100 }),
    adminSendGrowthNotificationTest: async () => ({ ok: true }),
  }
}

test('customer wishlist routes require auth and mutate through the store', async () => {
  const app = express()
  app.use(express.json())
  app.use(createGrowthRouter({ store: createFakeStore(), auth: createFakeAuth('user') }))

  await withServer(app, async (baseUrl) => {
    const create = await fetch(`${baseUrl}/api/me/wishlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: 42 }),
    })
    assert.equal(create.status, 200)
    assert.equal((await create.json()).item.product_id, 42)

    const list = await fetch(`${baseUrl}/api/me/wishlist`)
    assert.equal(list.status, 200)
    assert.deepEqual((await list.json()).wishlist.items.map((item) => item.product_id), [42])
  })
})

test('admin growth routes require admin role', async () => {
  const app = express()
  app.use(express.json())
  app.use(createGrowthRouter({ store: createFakeStore(), auth: createFakeAuth('user') }))

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/growth-campaigns`)
    assert.equal(res.status, 403)
  })
})

test('public review route exposes approved review payload', async () => {
  const app = express()
  app.use(express.json())
  app.use(createGrowthRouter({ store: createFakeStore(), auth: createFakeAuth('user') }))

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/products/42/reviews`)
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.summary.average_rating, 5)
    assert.equal(body.reviews.length, 1)
  })
})
