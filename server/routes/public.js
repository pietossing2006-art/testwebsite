import { Router } from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listCategories,
  listProducts,
  listProductsByIds,
  getProductById,
  getDiscordLinkForUser,
  getProductOptionStockAvailability,
  getBulkProductOptionStockAvailability,
  getUiSettings,
  listAnnouncementsPublic,
  quoteProductPurchase,
  purchaseDigitalProduct,
  purchaseFarmProduct,
  purchaseUidProduct,
  purchaseMysteryBox,
  redeemCoupon,
  listMysteryBoxPrizesPublic,
  listMysteryBoxRecentWins,
  listBundles,
  getBundleById,
  quoteBundlePurchase,
  purchaseBundle,
} from '../db.js'
import { requireAuth, requireAdmin, rateLimitMiddleware } from '../lib/auth.js'
import { sendDiscordOrderTracking } from '../lib/discordBot.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

function buildProductOrderTrackingMeta(fulfillmentType) {
  const ft = String(fulfillmentType || 'digital_stock')
  if (ft === 'digital_stock') {
    return {
      statusLabel: 'ชำระเงินสำเร็จแล้ว สามารถไปรับสินค้าได้จากกล่องรับของ',
      actionLabel: 'เปิดกล่องรับของ',
      actionPath: '/inbox',
    }
  }
  if (ft === 'mystery_box') {
    return {
      statusLabel: 'เปิดกล่องรับของเพื่อตรวจสอบรางวัลและรับสินค้าได้ทันที',
      actionLabel: 'เปิดกล่องรับของ',
      actionPath: '/inbox',
    }
  }
  if (ft === 'farm_form' || ft === 'uid_form') {
    return {
      statusLabel: 'คำสั่งซื้อถูกส่งเข้าคิวให้ทีมงานดำเนินการแล้ว',
      actionLabel: 'ดูประวัติคำสั่งซื้อ',
      actionPath: '/profile',
    }
  }
  return {
    statusLabel: 'คำสั่งซื้อสำเร็จแล้ว คุณสามารถติดตามสถานะต่อได้จากหน้าออเดอร์',
    actionLabel: 'ดูประวัติคำสั่งซื้อ',
    actionPath: '/profile',
  }
}

async function notifyLinkedDiscordOrder({
  userId,
  order,
  itemName,
  quantity,
  statusLabel,
  actionLabel,
  actionPath,
}) {
  const uid = Number(userId)
  const oid = Number(order?.id)
  if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(oid) || oid <= 0) return

  const link = await getDiscordLinkForUser(uid)
  const discordUserId = String(link?.discord_user_id || '').trim()
  if (!discordUserId) return

  await sendDiscordOrderTracking({
    discordUserId,
    orderId: oid,
    orderRef: order?.ref,
    itemName,
    quantity,
    totalPoints: order?.total_points,
    createdAt: order?.created_at,
    statusLabel,
    actionLabel,
    actionPath,
  })
}

router.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

router.get('/api/version', requireAuth, requireAdmin, (req, res) => {
  res.json({
    ok: true,
    pid: process.pid,
    node: process.version,
    cwd: process.cwd(),
    dirname: path.resolve(__dirname, '..'),
  })
})

router.get('/api/omise/public-key', (req, res) => {
  const key = process.env.OMISE_PUBLIC_KEY ? String(process.env.OMISE_PUBLIC_KEY) : ''
  if (!key) return res.status(404).json({ error: 'not_configured' })
  res.json({ ok: true, public_key: key })
})

router.get('/api/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY ? String(process.env.VAPID_PUBLIC_KEY) : ''
  if (!key) return res.status(404).json({ error: 'not_configured' })
  res.json({ ok: true, public_key: key })
})

router.get('/api/ui-settings', async (req, res) => {
  try {
    const settings = await getUiSettings()
    res.json({ ok: true, image_settings: settings?.image_settings, branding_settings: settings?.branding_settings, homepage_settings: settings?.homepage_settings, site_settings: settings?.site_settings })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/announcements', async (req, res) => {
  try {
    const list = await listAnnouncementsPublic()
    res.json({ ok: true, announcements: list })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/categories', async (req, res) => {
  try {
    const categories = await listCategories()
    res.json({ categories })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/products', async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined
    const products = await listProducts({ categorySlug: category })
    res.json({ products })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/products/by-ids', async (req, res) => {
  const raw = typeof req.query.ids === 'string' ? req.query.ids : ''
  const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
  if (ids.length === 0) return res.json({ ok: true, products: [] })
  if (ids.length > 100) return res.status(400).json({ error: 'too_many_ids' })
  try {
    const products = await listProductsByIds(ids)
    res.json({ ok: true, products })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/products/option-stock-bulk', async (req, res) => {
  const raw = typeof req.query.ids === 'string' ? req.query.ids : ''
  const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
  if (ids.length === 0) return res.json({ ok: true, option_stock: {} })
  if (ids.length > 100) return res.status(400).json({ error: 'too_many_ids' })

  try {
    const data = await getBulkProductOptionStockAvailability(ids)
    res.json({ ok: true, option_stock: data })
  } catch (e) {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

  try {
    const product = await getProductById(id)
    if (!product) return res.status(404).json({ error: 'not_found' })
    res.json({ product })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/products/:id/option-stock', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

  try {
    const data = await getProductOptionStockAvailability(id)
    res.json({ ok: true, ...data })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/quote', async (req, res) => {
  const { product_id, qty, coupon_code, product_option_id } = req.body ?? {}
  const productId = Number(product_id)
  const q = qty == null ? 1 : Number(qty)
  if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
  if (!Number.isFinite(q) || q <= 0) return res.status(400).json({ error: 'invalid_qty' })
  try {
    const quote = await quoteProductPurchase({ productId, qty: q, couponCode: coupon_code, productOptionId: product_option_id })
    res.json({ ok: true, quote })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'product_not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'invalid_coupon') return res.status(400).json({ error: 'invalid_coupon' })
    if (msg === 'coupon_expired') return res.status(400).json({ error: 'coupon_expired' })
    if (msg === 'coupon_exhausted') return res.status(400).json({ error: 'coupon_exhausted' })
    if (msg === 'invalid_product_option') return res.status(400).json({ error: 'invalid_product_option' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/purchase', requireAuth, rateLimitMiddleware({ windowMs: 60_000, max: 20, keyPrefix: 'purchase' }), async (req, res) => {
  const { product_id, qty, username, password, auth_key, uid, uid_confirmed, coupon_code, form_data, product_option_id } = req.body ?? {}
  const productId = Number(product_id)
  const q = qty == null ? 1 : Number(qty)
  if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
  if (!Number.isFinite(q) || q <= 0) return res.status(400).json({ error: 'invalid_qty' })

  try {
    const p = await getProductById(productId)
    if (!p) return res.status(404).json({ error: 'not_found' })

    const ft = String(p.fulfillment_type || 'digital_stock')
    const result =
      ft === 'farm_form'
        ? await purchaseFarmProduct({
            userId: req.user.id,
            productId,
            qty: q,
            username,
            password,
            authKey: auth_key,
            couponCode: coupon_code,
            formData: form_data,
            productOptionId: product_option_id,
          })
        : ft === 'uid_form'
          ? await purchaseUidProduct({
              userId: req.user.id,
              productId,
              qty: q,
              uid,
              uidConfirmed: uid_confirmed,
              couponCode: coupon_code,
              productOptionId: product_option_id,
            })
        : ft === 'mystery_box'
          ? await purchaseMysteryBox({ userId: req.user.id, productId, qty: q, couponCode: coupon_code })
          : await purchaseDigitalProduct({ userId: req.user.id, productId, qty: q, couponCode: coupon_code, productOptionId: product_option_id })

    const trackingMeta = buildProductOrderTrackingMeta(ft)
    notifyLinkedDiscordOrder({
      userId: req.user.id,
      order: result?.order,
      itemName: p?.name || `Product #${productId}`,
      quantity: q,
      ...trackingMeta,
    }).catch((err) => {
      console.error('discord_order_tracking_failed', {
        userId: req.user?.id,
        orderId: result?.order?.id,
        productId,
        err: String(err?.message || err),
      })
    })

    res.json({ ok: true, ...result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'product_not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'out_of_stock') return res.status(409).json({ error: 'out_of_stock' })
    if (msg === 'insufficient_points') return res.status(400).json({ error: 'insufficient_points' })
    if (msg === 'invalid_qty') return res.status(400).json({ error: 'invalid_qty' })
    if (msg === 'invalid_farm_form') return res.status(400).json({ error: 'invalid_farm_form' })
    if (msg === 'invalid_uid') return res.status(400).json({ error: 'invalid_uid' })
    if (msg === 'uid_not_confirmed') return res.status(400).json({ error: 'uid_not_confirmed' })
    if (msg === 'duplicate_purchase') return res.status(409).json({ error: 'duplicate_purchase' })
    if (msg === 'invalid_coupon') return res.status(400).json({ error: 'invalid_coupon' })
    if (msg === 'coupon_expired') return res.status(400).json({ error: 'coupon_expired' })
    if (msg === 'coupon_exhausted') return res.status(400).json({ error: 'coupon_exhausted' })

    if (msg === 'invalid_user_id') return res.status(400).json({ error: 'invalid_user_id' })
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_product_id' })
    if (msg === 'invalid_price') return res.status(400).json({ error: 'invalid_price' })
    if (msg === 'invalid_product_option') return res.status(400).json({ error: 'invalid_product_option' })

    console.error('purchase_failed', {
      userId: req.user?.id,
      productId,
      qty: q,
      err: msg,
      code: e?.code,
    })
    res.status(500).json({ error: 'db_error', detail: msg || String(e?.code || '') || 'unknown' })
  }
})

router.get('/api/products/:id/mystery-prizes', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const [prizes, recentWins] = await Promise.all([
      listMysteryBoxPrizesPublic(id),
      listMysteryBoxRecentWins(id, { limit: 20 }),
    ])
    res.json({ ok: true, prizes, recent_wins: recentWins })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_box_product_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/coupons/redeem', requireAuth, async (req, res) => {
  const { code } = req.body ?? {}
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'invalid_code' })
  try {
    const result = await redeemCoupon({ userId: req.user.id, code: code.trim() })
    res.json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'coupon_not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'coupon_inactive') return res.status(400).json({ error: 'inactive' })
    if (msg === 'coupon_expired') return res.status(400).json({ error: 'expired' })
    if (msg === 'coupon_exhausted') return res.status(409).json({ error: 'exhausted' })
    if (msg === 'coupon_already_used') return res.status(409).json({ error: 'already_used' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Bundles ──

router.get('/api/bundles', async (req, res) => {
  try {
    const bundles = await listBundles({ includeHidden: false, activeOnly: true })
    res.json({ ok: true, bundles })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/bundles/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id)
  try {
    const bundle = await getBundleById(id)
    if (!bundle) return res.status(404).json({ error: 'not_found' })
    if (bundle.is_hidden || !bundle.is_active) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true, bundle })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/bundles/:id(\\d+)/quote', async (req, res) => {
  const id = Number(req.params.id)
  const { coupon_code } = req.body ?? {}
  try {
    const quote = await quoteBundlePurchase({ bundleId: id, couponCode: coupon_code })
    res.json({ ok: true, quote })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'bundle_not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'bundle_not_available') return res.status(404).json({ error: 'not_found' })
    if (msg === 'bundle_not_started') return res.status(400).json({ error: 'bundle_not_started' })
    if (msg === 'bundle_expired') return res.status(400).json({ error: 'bundle_expired' })
    if (msg === 'bundle_empty') return res.status(400).json({ error: 'bundle_empty' })
    if (msg === 'invalid_coupon') return res.status(400).json({ error: 'invalid_coupon' })
    if (msg === 'coupon_expired') return res.status(400).json({ error: 'coupon_expired' })
    if (msg === 'coupon_exhausted') return res.status(400).json({ error: 'coupon_exhausted' })
    if (msg === 'invalid_product_option') return res.status(400).json({ error: 'invalid_product_option' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/bundles/:id(\\d+)/purchase', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  const { coupon_code } = req.body ?? {}
  try {
    const result = await purchaseBundle({ userId: req.user.id, bundleId: id, couponCode: coupon_code })
    notifyLinkedDiscordOrder({
      userId: req.user.id,
      order: result?.order,
      itemName: result?.bundle_name || `Bundle #${id}`,
      quantity: null,
      statusLabel: 'คำสั่งซื้อ Bundle สำเร็จแล้ว ตรวจสอบสถานะสินค้าแต่ละรายการได้จากหน้าติดตามคำสั่งซื้อ',
      actionLabel: 'เปิดประวัติคำสั่งซื้อ',
      actionPath: '/profile',
    }).catch((err) => {
      console.error('discord_order_tracking_failed', {
        userId: req.user?.id,
        orderId: result?.order?.id,
        bundleId: id,
        err: String(err?.message || err),
      })
    })
    res.json({ ok: true, ...result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'bundle_not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'bundle_not_available') return res.status(404).json({ error: 'not_found' })
    if (msg === 'bundle_not_started') return res.status(400).json({ error: 'bundle_not_started' })
    if (msg === 'bundle_expired') return res.status(400).json({ error: 'bundle_expired' })
    if (msg === 'bundle_empty') return res.status(400).json({ error: 'bundle_empty' })
    if (msg === 'insufficient_points') return res.status(400).json({ error: 'insufficient_points' })
    if (msg === 'invalid_coupon') return res.status(400).json({ error: 'invalid_coupon' })
    if (msg === 'coupon_expired') return res.status(400).json({ error: 'coupon_expired' })
    if (msg === 'coupon_exhausted') return res.status(400).json({ error: 'coupon_exhausted' })
    if (msg === 'invalid_product_option') return res.status(400).json({ error: 'invalid_product_option' })
    if (msg === 'duplicate_purchase') return res.status(409).json({ error: 'duplicate_purchase' })
    if (msg.startsWith('product_out_of_stock')) return res.status(409).json({ error: 'out_of_stock' })
    res.status(500).json({ error: 'db_error' })
  }
})

export default router
