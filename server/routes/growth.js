import { Router } from 'express'
import * as db from '../db.js'
import { requireAuth, requireAdmin } from '../lib/auth.js'
import {
  DiscountPreviewBodySchema,
  GrowthCampaignBodySchema,
  GrowthNotificationTestBodySchema,
  NotificationPreferencesBodySchema,
  ReviewBodySchema,
  VipTierBodySchema,
  WishlistBodySchema,
} from '../lib/requestSchemas.js'
import { validateBody } from '../lib/validation.js'

function defaultAuth() {
  return { requireAuth, requireAdmin }
}

function mapError(res, error) {
  const msg = String(error?.message || '')
  if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
  if (msg === 'forbidden') return res.status(403).json({ error: 'forbidden' })
  if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_product_id' })
  if (msg === 'invalid_order_item_id') return res.status(400).json({ error: 'invalid_order_item_id' })
  if (msg === 'invalid_reviewer_name') return res.status(400).json({ error: 'invalid_reviewer_name' })
  if (msg === 'invalid_reviewer_name_too_long') return res.status(400).json({ error: 'invalid_reviewer_name_too_long' })
  if (msg === 'review_not_allowed') return res.status(403).json({ error: 'review_not_allowed' })
  if (msg === 'review_exists') return res.status(409).json({ error: 'review_exists' })
  return res.status(500).json({ error: 'db_error' })
}

async function callStore(res, action, onSuccess) {
  try {
    const result = await action()
    return onSuccess(result)
  } catch (error) {
    return mapError(res, error)
  }
}

export function createGrowthRouter({ store = db, auth = defaultAuth() } = {}) {
  const router = Router()

  router.get('/api/me/wishlist', auth.requireAuth, async (req, res) => {
    try {
      const wishlist = await store.listMyWishlist(req.user.id)
      res.json({ ok: true, wishlist })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.post('/api/me/wishlist', auth.requireAuth, async (req, res) => {
    const parsed = validateBody(WishlistBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try {
      const item = await store.upsertWishlistItem({ userId: req.user.id, productId: parsed.data.product_id, ...parsed.data })
      res.json({ ok: true, item })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.delete('/api/me/wishlist/:productId(\\d+)', auth.requireAuth, async (req, res) => {
    try {
      await store.deleteWishlistItem({ userId: req.user.id, productId: Number(req.params.productId) })
      res.json({ ok: true })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.get('/api/me/notification-preferences', auth.requireAuth, async (req, res) => {
    try {
      const preferences = await store.getNotificationPreferences(req.user.id)
      res.json({ ok: true, preferences })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.put('/api/me/notification-preferences', auth.requireAuth, async (req, res) => {
    const parsed = validateBody(NotificationPreferencesBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try {
      const preferences = await store.updateNotificationPreferences({ userId: req.user.id, preferences: parsed.data })
      res.json({ ok: true, preferences })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.get('/api/products/:id/reviews', async (req, res) => {
    try {
      let productId = Number(req.params.id)
      if (!Number.isFinite(productId) && store.getProductById) {
        const p = await store.getProductById(req.params.id)
        if (p) productId = p.id
      }
      if (!Number.isFinite(productId)) return res.json({ ok: true, summary: null, reviews: [] })
      const data = await store.listProductReviewsPublic({ productId, limit: req.query.limit, offset: req.query.offset })
      res.json({ ok: true, ...data })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.post('/api/products/:id/reviews', auth.requireAuth, async (req, res) => {
    const parsed = validateBody(ReviewBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try {
      let productId = Number(req.params.id)
      if (!Number.isFinite(productId) && store.getProductById) {
        const p = await store.getProductById(req.params.id)
        if (p) productId = p.id
      }
      if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
      const review = await store.createProductReview({ userId: req.user.id, productId, ...parsed.data })
      res.status(201).json({ ok: true, review })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.get('/api/products/:id/reviews/mine', auth.requireAuth, async (req, res) => {
    try {
      let productId = Number(req.params.id)
      if (!Number.isFinite(productId) && store.getProductById) {
        const p = await store.getProductById(req.params.id)
        if (p) productId = p.id
      }
      if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
      const review = await store.getMyReviewForProduct({ userId: req.user.id, productId })
      res.json({ ok: true, review: review || null })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.patch('/api/me/reviews/:id(\\d+)', auth.requireAuth, async (req, res) => {
    const parsed = validateBody(ReviewBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    return callStore(
      res,
      () => store.updateMyReview({ userId: req.user.id, reviewId: Number(req.params.id), ...parsed.data }),
      (review) => res.json({ ok: true, review }),
    )
  })

  router.delete('/api/me/reviews/:id(\\d+)', auth.requireAuth, async (req, res) => {
    return callStore(res, () => store.deleteMyReview({ userId: req.user.id, reviewId: Number(req.params.id) }), () => res.json({ ok: true }))
  })

  router.get('/api/growth-campaigns/active', async (req, res) => {
    try {
      const data = await store.listActiveGrowthCampaigns({ targetType: req.query.target_type, targetId: req.query.target_id })
      res.json({ ok: true, ...data })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.get('/api/me/vip', auth.requireAuth, async (req, res) => {
    try {
      const vip = await store.getMyVip(req.user.id)
      res.json({ ok: true, vip })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.get('/api/admin/growth-campaigns', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    return callStore(res, () => store.adminListGrowthCampaigns({ limit: req.query.limit, offset: req.query.offset }), (data) => res.json({ ok: true, ...data }))
  })

  router.post('/api/admin/growth-campaigns', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(GrowthCampaignBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    return callStore(res, () => store.adminCreateGrowthCampaign(parsed.data), (campaign) => res.status(201).json({ ok: true, campaign }))
  })

  router.put('/api/admin/growth-campaigns/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(GrowthCampaignBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    return callStore(res, () => store.adminUpdateGrowthCampaign({ id: Number(req.params.id), ...parsed.data }), (campaign) => res.json({ ok: true, campaign }))
  })

  router.delete('/api/admin/growth-campaigns/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    return callStore(res, () => store.adminDeleteGrowthCampaign(Number(req.params.id)), () => res.json({ ok: true }))
  })

  router.get('/api/admin/reviews', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    return callStore(res, () => store.adminListReviews({ status: req.query.status, limit: req.query.limit, offset: req.query.offset }), (data) => res.json({ ok: true, ...data }))
  })

  router.patch('/api/admin/reviews/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    return callStore(
      res,
      () => store.adminModerateReview({ id: Number(req.params.id), status: req.body?.status, adminNote: req.body?.admin_note, moderatorId: req.user.id }),
      (review) => res.json({ ok: true, review }),
    )
  })

  router.get('/api/admin/vip-tiers', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    return callStore(res, () => store.adminListVipTiers(), (data) => res.json({ ok: true, ...data }))
  })

  router.post('/api/admin/vip-tiers', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(VipTierBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    return callStore(res, () => store.adminCreateVipTier(parsed.data), (tier) => res.status(201).json({ ok: true, tier }))
  })

  router.put('/api/admin/vip-tiers/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(VipTierBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    return callStore(res, () => store.adminUpdateVipTier({ id: Number(req.params.id), ...parsed.data }), (tier) => res.json({ ok: true, tier }))
  })

  router.delete('/api/admin/vip-tiers/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    return callStore(res, () => store.adminDeleteVipTier(Number(req.params.id)), () => res.json({ ok: true }))
  })

  router.get('/api/admin/wishlist-signals', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    return callStore(res, () => store.adminListWishlistSignals({ limit: req.query.limit }), (data) => res.json({ ok: true, ...data }))
  })

  router.get('/api/admin/growth-notifications', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    return callStore(res, () => store.adminListGrowthNotifications({ limit: req.query.limit, offset: req.query.offset }), (data) => res.json({ ok: true, ...data }))
  })

  router.post('/api/admin/discount-preview', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(DiscountPreviewBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    return callStore(res, () => store.adminPreviewDiscounts(parsed.data), (quote) => res.json({ ok: true, quote }))
  })

  router.post('/api/admin/growth-notifications/test', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(GrowthNotificationTestBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    return callStore(res, () => store.adminTestGrowthNotification(parsed.data), (result) => res.json({ ok: true, ...result }))
  })

  // ── Back-in-Stock Alerts ──

  router.get('/api/me/back-in-stock', auth.requireAuth, async (req, res) => {
    try {
      const subscriptions = await store.listMyBackInStockSubscriptions(req.user.id)
      res.json({ ok: true, subscriptions })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.post('/api/me/back-in-stock/:productId(\\d+)', auth.requireAuth, async (req, res) => {
    try {
      const sub = await store.subscribeBackInStock({
        userId: req.user.id,
        productId: Number(req.params.productId),
        productOptionId: req.body?.product_option_id || null,
        notifyInbox: req.body?.notify_inbox !== false,
        notifyPush: req.body?.notify_push !== false,
      })
      res.json({ ok: true, subscription: sub })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.delete('/api/me/back-in-stock/:productId(\\d+)', auth.requireAuth, async (req, res) => {
    try {
      await store.unsubscribeBackInStock({
        userId: req.user.id,
        productId: Number(req.params.productId),
        productOptionId: req.query?.product_option_id || null,
      })
      res.json({ ok: true })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.get('/api/products/:id/stock-alerts', async (req, res) => {
    try {
      const productId = Number(req.params.id)
      if (!Number.isFinite(productId)) return res.json({ ok: true, subscriber_count: 0, preorder_info: { total_waiting: 0, total_qty: 0 } })
      const [subscriberCount, preorderInfo] = await Promise.all([
        store.getBackInStockSubscriberCount(productId),
        store.getPreorderQueueInfo(productId, req.query?.product_option_id || null),
      ])
      res.json({ ok: true, subscriber_count: subscriberCount, preorder_info: preorderInfo })
    } catch (error) {
      mapError(res, error)
    }
  })

  // ── Pre-Order Queue ──

  router.post('/api/me/preorder/:productId(\\d+)', auth.requireAuth, async (req, res) => {
    try {
      const preorder = await store.createPreorder({
        userId: req.user.id,
        productId: Number(req.params.productId),
        productOptionId: req.body?.product_option_id || null,
        qty: req.body?.qty || 1,
        unitPricePoints: req.body?.unit_price_points || 0,
      })
      res.json({ ok: true, preorder })
    } catch (error) {
      const msg = String(error?.message || '')
      if (msg === 'preorder_exists') return res.status(409).json({ error: 'preorder_exists' })
      if (msg === 'insufficient_points') return res.status(400).json({ error: 'insufficient_points' })
      mapError(res, error)
    }
  })

  router.delete('/api/me/preorder/:preorderId(\\d+)', auth.requireAuth, async (req, res) => {
    try {
      const result = await store.cancelPreorder({
        userId: req.user.id,
        preorderId: Number(req.params.preorderId),
      })
      res.json({ ok: true, ...result })
    } catch (error) {
      const msg = String(error?.message || '')
      if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
      mapError(res, error)
    }
  })

  router.get('/api/me/preorders', auth.requireAuth, async (req, res) => {
    try {
      const preorders = await store.listMyPreorders(req.user.id)
      res.json({ ok: true, preorders })
    } catch (error) {
      mapError(res, error)
    }
  })

  return router
}

export default createGrowthRouter()
