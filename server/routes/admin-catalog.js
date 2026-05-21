import { Router } from 'express'
import {
  adminAddDigitalStock,
  adminGetDigitalStockSummary,
  adminListDigitalStockItems,
  adminUpdateDigitalStockItem,
  adminDeleteDigitalStockItem,
  adminListStockPools,
  adminGetStockPoolSummary,
  adminCreateStockPool,
  adminUpdateStockPool,
  adminDeleteStockPool,
  adminAddStockPoolItems,
  adminListStockPoolItems,
  adminUpdateStockPoolItem,
  adminDeleteStockPoolItem,
  adminListProductOptionStockBindings,
  adminSetProductOptionStockBinding,
  adminUnsetProductOptionStockBinding,
  adminSetProductHidden,
  adminSetCategoryHidden,
  adminListCategories,
  adminCreateProductPromotion,
  adminDeleteProductPromotion,
  adminListProductPromotions,
  adminUpdateProductPromotion,
  adminCreateDiscountCoupon,
  adminDeleteDiscountCoupon,
  adminListDiscountCoupons,
  adminUpdateDiscountCoupon,
  adminListMysteryBoxPrizes,
  adminCreateMysteryBoxPrize,
  adminUpdateMysteryBoxPrize,
  adminDeleteMysteryBoxPrize,
  adminSimulateMysteryBox,
  adminAddMysteryBoxPrizeStock,
  adminListMysteryBoxPrizeStockItems,
  adminUpdateMysteryBoxPrizeStockItem,
  adminDeleteMysteryBoxPrizeStockItem,
  adminListWorkflowAutomationRules,
  adminCreateWorkflowAutomationRule,
  adminUpdateWorkflowAutomationRule,
  adminDeleteWorkflowAutomationRule,
  adminListWorkflowAutomationEvents,
  adminRunWorkflowAutomationRules,
  adminCancelTopup,
  adminListBundles,
  adminGetBundleDetail,
  adminCreateBundle,
  adminUpdateBundle,
  adminDeleteBundle,
  createCoupon,
  createCategory,
  createProduct,
  deleteCategory,
  deleteCoupon,
  deleteProduct,
  listCoupons,
  listProducts,
  logAuditEvent,
  updateCoupon,
  updateCategory,
  updateProduct,
} from '../db.js'
import { requireAuth, requireAdmin, requireFinance } from '../lib/auth.js'
import { CategoryBodySchema, ProductBodySchema, StockItemsBodySchema } from '../lib/requestSchemas.js'
import { validateBody } from '../lib/validation.js'

const router = Router()

// ── Categories ──

router.get('/api/admin/categories', requireAuth, requireAdmin, async (req, res) => {
  try {
    const categories = await adminListCategories()
    res.json({ ok: true, categories })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/categories', requireAuth, requireAdmin, async (req, res) => {
  const parsed = validateBody(CategoryBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { name, slug, image_url, description } = parsed.data

  try {
    const id = await createCategory({
      name,
      slug,
      imageUrl: image_url,
      description,
    })
    res.status(201).json({ ok: true, id })
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'slug_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const parsed = validateBody(CategoryBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { name, slug, image_url, description } = parsed.data

  try {
    const category = await updateCategory({
      id,
      name,
      slug,
      imageUrl: image_url,
      description,
    })
    res.json({ ok: true, category })
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'slug_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await deleteCategory(id)
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'category_in_use') return res.status(409).json({ error: 'category_in_use' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/categories/:id/hidden', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const { is_hidden } = req.body ?? {}
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await adminSetCategoryHidden({ categoryId: id, isHidden: Boolean(is_hidden) })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_category_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Products ──

router.get('/api/admin/products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const products = await listProducts({ includeHidden: true })
    res.json({ ok: true, products })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/products/:id/hidden', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const { is_hidden } = req.body ?? {}
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await adminSetProductHidden({ productId: id, isHidden: Boolean(is_hidden) })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/products', requireAuth, requireAdmin, async (req, res) => {
  const parsed = validateBody(ProductBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const {
    category_id: cid,
    name,
    slug,
    price: pr,
    description,
    image_url,
    stock: st,
    highlights,
    manual_url,
    manual_text,
    manual_video_url,
    fulfillment_type,
    farm_form_username_enabled,
    farm_form_password_enabled,
    farm_form_auth_key_enabled,
    farm_form_fields,
    product_options,
    sort_order: so,
    is_featured,
    is_unlimited_stock,
  } = parsed.data

  try {
    const productId = await createProduct({
      categoryId: cid,
      name,
      slug,
      price: pr,
      description,
      imageUrl: image_url,
      stock: st,
      highlights,
      manualUrl: manual_url,
      manualText: manual_text,
      manualVideoUrl: manual_video_url,
      fulfillmentType: fulfillment_type,
      farmFormUsernameEnabled: farm_form_username_enabled,
      farmFormPasswordEnabled: farm_form_password_enabled,
      farmFormAuthKeyEnabled: farm_form_auth_key_enabled,
      farmFormFields: farm_form_fields,
      productOptions: product_options,
      sortOrder: so,
      isFeatured: Boolean(is_featured),
      isUnlimitedStock: Boolean(is_unlimited_stock),
    })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'product.create',
        entityType: 'product',
        entityId: String(productId),
        detail: { name, slug, price: pr },
      })
    } catch {
      // ignore
    }
    res.status(201).json({ ok: true, id: productId })
  } catch (e) {
    if (String(e?.message ?? '') === 'invalid_product_option') return res.status(400).json({ error: 'invalid_product_option' })
    if (e?.code === '23505') return res.status(409).json({ error: 'slug_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/products/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const parsed = validateBody(ProductBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const {
    category_id: cid,
    name,
    slug,
    price: pr,
    description,
    image_url,
    stock: st,
    highlights,
    manual_url,
    manual_text,
    manual_video_url,
    fulfillment_type,
    farm_form_username_enabled,
    farm_form_password_enabled,
    farm_form_auth_key_enabled,
    farm_form_fields,
    product_options,
    sort_order: so,
    is_featured,
    is_unlimited_stock,
  } = parsed.data

  try {
    const product = await updateProduct({
      id,
      categoryId: cid,
      name,
      slug,
      price: pr,
      description,
      imageUrl: image_url,
      stock: st,
      highlights,
      manualUrl: manual_url,
      manualText: manual_text,
      manualVideoUrl: manual_video_url,
      fulfillmentType: fulfillment_type,
      farmFormUsernameEnabled: farm_form_username_enabled,
      farmFormPasswordEnabled: farm_form_password_enabled,
      farmFormAuthKeyEnabled: farm_form_auth_key_enabled,
      farmFormFields: farm_form_fields,
      productOptions: product_options,
      sortOrder: so,
      isFeatured: Boolean(is_featured),
      isUnlimitedStock: Boolean(is_unlimited_stock),
    })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'product.update',
        entityType: 'product',
        entityId: String(id),
        detail: { name, slug, price: pr, stock: st },
      })
    } catch {
      // ignore
    }
    res.json({ ok: true, product })
  } catch (e) {
    if (String(e?.message ?? '') === 'invalid_product_option') return res.status(400).json({ error: 'invalid_product_option' })
    if (e?.code === '23505') return res.status(409).json({ error: 'slug_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/products/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await deleteProduct(id)
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'product.delete',
        entityType: 'product',
        entityId: String(id),
        detail: {},
      })
    } catch {
      // ignore
    }
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'product_in_use') return res.status(409).json({ error: 'product_in_use' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Digital Stock ──

router.post('/api/admin/stock', requireAuth, requireAdmin, async (req, res) => {
  const parsed = validateBody(StockItemsBodySchema, { ...(req.body ?? {}), target_id: req.body?.product_id })
  if (!parsed.ok) return res.status(400).json({ error: parsed.error === 'invalid_id' ? 'invalid_product_id' : parsed.error })
  const { target_id: productId, items: arr } = parsed.data

  try {
    const result = await adminAddDigitalStock({ productId, items: arr })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'stock.add',
        entityType: 'product',
        entityId: String(productId),
        detail: { inserted: Number(result?.inserted ?? 0) },
      })
    } catch {
      // ignore
    }
    const summary = await adminGetDigitalStockSummary(productId)
    res.json({ ok: true, result, summary })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_product_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/stock/:productId', requireAuth, requireAdmin, async (req, res) => {
  const productId = Number(req.params.productId)
  if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
  try {
    const summary = await adminGetDigitalStockSummary(productId)
    res.json({ ok: true, summary })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/stock-items', requireAuth, requireAdmin, async (req, res) => {
  const productId = Number(req.query.product_id)
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
  try {
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'sensitive.stock_items.list',
        entityType: 'product',
        entityId: String(productId),
        detail: { limit: Number(limit) || 0, offset: Number(offset) || 0, status: status ?? null },
      })
    } catch {
      // ignore
    }
    const items = await adminListDigitalStockItems(productId, { limit, offset, status })
    const summary = await adminGetDigitalStockSummary(productId)
    res.json({ ok: true, items, summary })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_product_id' })
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/stock-items/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { payload, status } = req.body ?? {}
  try {
    const item = await adminUpdateDigitalStockItem({ id, payload, status })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'stock.item_update',
        entityType: 'stock_item',
        entityId: String(id),
        detail: { status: item?.status ?? null, product_id: item?.product_id ?? null },
      })
    } catch {
      // ignore
    }
    res.json({ ok: true, item })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_stock_item_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'invalid_status') return res.status(400).json({ error: 'invalid_status' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/stock-items/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await adminDeleteDigitalStockItem({ id })
    try {
      await logAuditEvent({
        actorUserId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'stock.item_delete',
        entityType: 'stock_item',
        entityId: String(id),
        detail: {},
      })
    } catch {
      // ignore
    }
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_stock_item_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'locked') return res.status(409).json({ error: 'locked' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Stock Pools ──

router.get('/api/admin/stock-pools', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 200
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const is_active = req.query.is_active
    const isActive = is_active == null ? undefined : is_active === '1' || is_active === 'true' || is_active === true
    const pools = await adminListStockPools({ limit, offset, isActive })
    res.json({ ok: true, pools })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/stock-pools', requireAuth, requireAdmin, async (req, res) => {
  const { name, kind, quantity_remaining, is_active } = req.body ?? {}
  try {
    const id = await adminCreateStockPool({
      name,
      kind,
      quantityRemaining: quantity_remaining,
      isActive: is_active,
    })
    res.json({ ok: true, id })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_name') return res.status(400).json({ error: 'invalid_name' })
    if (msg === 'invalid_kind') return res.status(400).json({ error: 'invalid_kind' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/stock-pools/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_pool_id' })
  const { name, kind, quantity_remaining, is_active } = req.body ?? {}
  try {
    const pool = await adminUpdateStockPool({
      id,
      name,
      kind,
      quantityRemaining: quantity_remaining,
      isActive: is_active,
    })
    res.json({ ok: true, pool })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_pool_id') return res.status(400).json({ error: 'invalid_pool_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'invalid_name') return res.status(400).json({ error: 'invalid_name' })
    if (msg === 'invalid_kind') return res.status(400).json({ error: 'invalid_kind' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/stock-pools/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_pool_id' })
  try {
    await adminDeleteStockPool({ id })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_pool_id') return res.status(400).json({ error: 'invalid_pool_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Stock Pool Items ──

router.get('/api/admin/stock-pool-items', requireAuth, requireAdmin, async (req, res) => {
  const poolId = Number(req.query.pool_id)
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  if (!Number.isFinite(poolId)) return res.status(400).json({ error: 'invalid_pool_id' })
  try {
    const items = await adminListStockPoolItems(poolId, { limit, offset, status })
    const summary = await adminGetStockPoolSummary(poolId)
    res.json({ ok: true, items, summary })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_pool_id') return res.status(400).json({ error: 'invalid_pool_id' })
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/stock-pool-items', requireAuth, requireAdmin, async (req, res) => {
  const parsed = validateBody(StockItemsBodySchema, { ...(req.body ?? {}), target_id: req.body?.pool_id })
  if (!parsed.ok) return res.status(400).json({ error: parsed.error === 'invalid_id' ? 'invalid_pool_id' : parsed.error })
  const { target_id: poolId, items: arr } = parsed.data

  try {
    const result = await adminAddStockPoolItems({ poolId, items: arr })
    const summary = await adminGetStockPoolSummary(poolId)
    res.json({ ok: true, result, summary })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_pool_id') return res.status(400).json({ error: 'invalid_pool_id' })
    if (msg === 'pool_not_found') return res.status(404).json({ error: 'pool_not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/stock-pool-items/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { payload, status } = req.body ?? {}
  try {
    const item = await adminUpdateStockPoolItem({ id, payload, status })
    res.json({ ok: true, item })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'invalid_status') return res.status(400).json({ error: 'invalid_status' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/stock-pool-items/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await adminDeleteStockPoolItem({ id })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Product Option Stock Bindings ──

router.get('/api/admin/product-option-stock-bindings', requireAuth, requireAdmin, async (req, res) => {
  const productId = Number(req.query.product_id)
  if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
  try {
    const bindings = await adminListProductOptionStockBindings(productId)
    res.json({ ok: true, bindings })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/product-option-stock-bindings', requireAuth, requireAdmin, async (req, res) => {
  const { product_id, product_option_id, pool_id } = req.body ?? {}
  const productId = Number(product_id)
  const poolId = Number(pool_id)
  if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
  if (!Number.isFinite(poolId)) return res.status(400).json({ error: 'invalid_pool_id' })
  try {
    const binding = await adminSetProductOptionStockBinding({ productId, productOptionId: product_option_id, poolId })
    res.json({ ok: true, binding })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_product_id' })
    if (msg === 'invalid_pool_id') return res.status(400).json({ error: 'invalid_pool_id' })
    if (msg === 'pool_not_found') return res.status(404).json({ error: 'pool_not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/product-option-stock-bindings', requireAuth, requireAdmin, async (req, res) => {
  const { product_id, product_option_id } = req.body ?? {}
  const productId = Number(product_id)
  if (!Number.isFinite(productId)) return res.status(400).json({ error: 'invalid_product_id' })
  try {
    await adminUnsetProductOptionStockBinding({ productId, productOptionId: product_option_id })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_product_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Promotions ──

router.get('/api/admin/promotions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const productId = req.query.product_id
    const items = await adminListProductPromotions({ productId })
    res.json({ ok: true, promotions: items })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_product_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/promotions', requireAuth, requireAdmin, async (req, res) => {
  const { product_id, title, discount_percent, discount_amount_points, starts_at, ends_at, is_active } = req.body ?? {}
  try {
    const id = await adminCreateProductPromotion({
      productId: Number(product_id),
      title,
      discountPercent: discount_percent,
      discountAmountPoints: discount_amount_points,
      startsAt: starts_at,
      endsAt: ends_at,
      isActive: is_active,
    })
    res.status(201).json({ ok: true, id })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_product_id') return res.status(400).json({ error: 'invalid_product_id' })
    if (msg === 'invalid_discount') return res.status(400).json({ error: 'invalid_discount' })
    if (msg === 'invalid_discount_percent') return res.status(400).json({ error: 'invalid_discount_percent' })
    if (msg === 'invalid_discount_amount') return res.status(400).json({ error: 'invalid_discount_amount' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/promotions/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { title, discount_percent, discount_amount_points, starts_at, ends_at, is_active } = req.body ?? {}
  try {
    await adminUpdateProductPromotion({
      id,
      title,
      discountPercent: discount_percent,
      discountAmountPoints: discount_amount_points,
      startsAt: starts_at,
      endsAt: ends_at,
      isActive: is_active,
    })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'invalid_discount_percent') return res.status(400).json({ error: 'invalid_discount_percent' })
    if (msg === 'invalid_discount_amount') return res.status(400).json({ error: 'invalid_discount_amount' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/promotions/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await adminDeleteProductPromotion(id)
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Discount Coupons ──

router.get('/api/admin/discount-coupons', requireAuth, requireAdmin, async (req, res) => {
  try {
    const items = await adminListDiscountCoupons({})
    res.json({ ok: true, coupons: items })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/discount-coupons', requireAuth, requireAdmin, async (req, res) => {
  const { code, title, discount_percent, discount_amount_points, max_uses, expires_at, is_active } = req.body ?? {}
  try {
    const id = await adminCreateDiscountCoupon({
      code,
      title,
      discountPercent: discount_percent,
      discountAmountPoints: discount_amount_points,
      maxUses: max_uses,
      expiresAt: expires_at,
      isActive: is_active,
    })
    res.status(201).json({ ok: true, id })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_code') return res.status(400).json({ error: 'invalid_code' })
    if (msg === 'invalid_discount') return res.status(400).json({ error: 'invalid_discount' })
    if (msg === 'invalid_discount_percent') return res.status(400).json({ error: 'invalid_discount_percent' })
    if (msg === 'invalid_discount_amount') return res.status(400).json({ error: 'invalid_discount_amount' })
    if (msg === 'invalid_max_uses') return res.status(400).json({ error: 'invalid_max_uses' })
    if (e?.code === '23505') return res.status(409).json({ error: 'code_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/discount-coupons/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { title, discount_percent, discount_amount_points, max_uses, used_count, expires_at, is_active } = req.body ?? {}
  try {
    await adminUpdateDiscountCoupon({
      id,
      title,
      discountPercent: discount_percent,
      discountAmountPoints: discount_amount_points,
      maxUses: max_uses,
      usedCount: used_count,
      expiresAt: expires_at,
      isActive: is_active,
    })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'invalid_discount_percent') return res.status(400).json({ error: 'invalid_discount_percent' })
    if (msg === 'invalid_discount_amount') return res.status(400).json({ error: 'invalid_discount_amount' })
    if (msg === 'invalid_max_uses') return res.status(400).json({ error: 'invalid_max_uses' })
    if (msg === 'invalid_used_count') return res.status(400).json({ error: 'invalid_used_count' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/discount-coupons/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await adminDeleteDiscountCoupon(id)
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Point Coupons ──

router.get('/api/admin/coupons', requireAuth, requireAdmin, async (req, res) => {
  try {
    const coupons = await listCoupons()
    res.json({ ok: true, coupons })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/coupons', requireAuth, requireAdmin, async (req, res) => {
  const { code, points, max_uses, expires_at, is_active } = req.body ?? {}
  try {
    const id = await createCoupon({
      code,
      points,
      maxUses: max_uses,
      expiresAt: expires_at ?? null,
      isActive: is_active,
    })
    res.status(201).json({ ok: true, id })
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'code_taken' })
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_code') return res.status(400).json({ error: 'invalid_code' })
    if (msg === 'invalid_points') return res.status(400).json({ error: 'invalid_points' })
    if (msg === 'invalid_max_uses') return res.status(400).json({ error: 'invalid_max_uses' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/coupons/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { points, max_uses, used_count, expires_at, is_active } = req.body ?? {}
  try {
    await updateCoupon({
      id,
      points,
      maxUses: max_uses,
      usedCount: used_count,
      expiresAt: expires_at ?? null,
      isActive: is_active,
    })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_points') return res.status(400).json({ error: 'invalid_points' })
    if (msg === 'invalid_max_uses') return res.status(400).json({ error: 'invalid_max_uses' })
    if (msg === 'invalid_used_count') return res.status(400).json({ error: 'invalid_used_count' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/coupons/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await deleteCoupon(id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Topup Cancel (finance) ──

router.post('/api/admin/topups/:id/cancel', requireAuth, requireFinance, async (req, res) => {
  const topupId = Number(req.params.id)
  if (!Number.isFinite(topupId)) return res.status(400).json({ error: 'invalid_id' })

  try {
    const result = await adminCancelTopup({ topupId })
    res.json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'topup_not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'already_paid') return res.status(409).json({ error: 'already_paid' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Mystery Box ──

router.get('/api/admin/mystery-box-prizes', requireAuth, requireAdmin, async (req, res) => {
  const boxProductId = Number(req.query.box_product_id)
  if (!Number.isFinite(boxProductId)) return res.status(400).json({ error: 'invalid_box_product_id' })
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  try {
    const items = await adminListMysteryBoxPrizes({ boxProductId, limit, offset })
    res.json({ ok: true, items })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_box_product_id') return res.status(400).json({ error: 'invalid_box_product_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/mystery-box-prizes', requireAuth, requireAdmin, async (req, res) => {
  const { box_product_id, prize_kind, prize_product_id, prize_name, prize_image_url, weight, remaining, is_active } = req.body ?? {}
  try {
    const id = await adminCreateMysteryBoxPrize({
      boxProductId: box_product_id,
      prizeKind: prize_kind,
      prizeProductId: prize_product_id,
      prizeName: prize_name,
      prizeImageUrl: prize_image_url,
      weight,
      remaining,
      isActive: is_active,
    })
    res.status(201).json({ ok: true, id })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_box_product_id') return res.status(400).json({ error: 'invalid_box_product_id' })
    if (msg === 'invalid_prize_kind') return res.status(400).json({ error: 'invalid_prize_kind' })
    if (msg === 'invalid_prize_product_id') return res.status(400).json({ error: 'invalid_prize_product_id' })
    if (msg === 'invalid_prize_name') return res.status(400).json({ error: 'invalid_prize_name' })
    if (msg === 'invalid_weight') return res.status(400).json({ error: 'invalid_weight' })
    if (msg === 'invalid_remaining') return res.status(400).json({ error: 'invalid_remaining' })
    if (e?.code === '23505') return res.status(409).json({ error: 'duplicate' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/mystery-box-prizes/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { prize_name, prize_image_url, weight, remaining, is_active } = req.body ?? {}
  try {
    const item = await adminUpdateMysteryBoxPrize({ id, prizeName: prize_name, prizeImageUrl: prize_image_url, weight, remaining, isActive: is_active })
    res.json({ ok: true, item })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'invalid_prize_name') return res.status(400).json({ error: 'invalid_prize_name' })
    if (msg === 'invalid_weight') return res.status(400).json({ error: 'invalid_weight' })
    if (msg === 'invalid_remaining') return res.status(400).json({ error: 'invalid_remaining' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/mystery-box-prizes/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    await adminDeleteMysteryBoxPrize(id)
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/mystery-box/simulate', requireAuth, requireAdmin, async (req, res) => {
  const boxProductId = Number(req.query.box_product_id)
  const qty = req.query.qty ? Number(req.query.qty) : 1
  const trials = req.query.trials ? Number(req.query.trials) : 5000
  try {
    const simulation = await adminSimulateMysteryBox({ boxProductId, qty, trials })
    res.json({ ok: true, simulation })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_box_product_id') return res.status(400).json({ error: 'invalid_box_product_id' })
    if (msg === 'invalid_qty') return res.status(400).json({ error: 'invalid_qty' })
    if (msg === 'invalid_trials') return res.status(400).json({ error: 'invalid_trials' })
    if (msg === 'out_of_stock') return res.status(409).json({ error: 'out_of_stock' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/mystery-box-prize-stock', requireAuth, requireAdmin, async (req, res) => {
  const { box_product_id, prize_id, items } = req.body ?? {}
  try {
    const result = await adminAddMysteryBoxPrizeStock({ boxProductId: box_product_id, prizeId: prize_id, items })
    res.status(201).json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_box_product_id') return res.status(400).json({ error: 'invalid_box_product_id' })
    if (msg === 'invalid_prize_id') return res.status(400).json({ error: 'invalid_prize_id' })
    if (msg === 'invalid_prize_product_id') return res.status(400).json({ error: 'invalid_prize_product_id' })
    if (msg === 'prize_not_found') return res.status(404).json({ error: 'prize_not_found' })
    if (msg === 'prize_box_mismatch') return res.status(409).json({ error: 'prize_box_mismatch' })
    if (msg === 'invalid_prize_kind') return res.status(400).json({ error: 'invalid_prize_kind' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/mystery-box-prize-stock', requireAuth, requireAdmin, async (req, res) => {
  const prizeId = Number(req.query.prize_id)
  if (!Number.isFinite(prizeId)) return res.status(400).json({ error: 'invalid_prize_id' })
  const limit = req.query.limit ? Number(req.query.limit) : 200
  const offset = req.query.offset ? Number(req.query.offset) : 0
  try {
    const items = await adminListMysteryBoxPrizeStockItems({ prizeId, limit, offset })
    res.json({ ok: true, items })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_prize_id') return res.status(400).json({ error: 'invalid_prize_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/mystery-box-prize-stock-items/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { status, image_url } = req.body ?? {}
  try {
    const item = await adminUpdateMysteryBoxPrizeStockItem({ id, status, image_url })
    res.json({ ok: true, item })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'invalid_status') return res.status(400).json({ error: 'invalid_status' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/mystery-box-prize-stock-items/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const result = await adminDeleteMysteryBoxPrizeStockItem(id)
    res.json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Workflow Automation ──

router.get('/api/admin/workflow-automation/rules', requireAuth, requireAdmin, async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100
  const offset = req.query.offset ? Number(req.query.offset) : 0
  try {
    const rules = await adminListWorkflowAutomationRules({ limit, offset })
    res.json({ ok: true, rules })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    if (msg === 'invalid_offset') return res.status(400).json({ error: 'invalid_offset' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/workflow-automation/rules', requireAuth, requireAdmin, async (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config, is_active } = req.body ?? {}
  try {
    const id = await adminCreateWorkflowAutomationRule({
      name,
      triggerType: trigger_type,
      triggerConfig: trigger_config,
      actionType: action_type,
      actionConfig: action_config,
      isActive: is_active,
    })
    res.status(201).json({ ok: true, id })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_name') return res.status(400).json({ error: 'invalid_name' })
    if (msg === 'invalid_trigger_type') return res.status(400).json({ error: 'invalid_trigger_type' })
    if (msg === 'invalid_action_type') return res.status(400).json({ error: 'invalid_action_type' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/workflow-automation/rules/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const { name, trigger_type, trigger_config, action_type, action_config, is_active } = req.body ?? {}
  try {
    const rule = await adminUpdateWorkflowAutomationRule({
      id,
      name,
      triggerType: trigger_type,
      triggerConfig: trigger_config,
      actionType: action_type,
      actionConfig: action_config,
      isActive: is_active,
    })
    res.json({ ok: true, rule })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'invalid_name') return res.status(400).json({ error: 'invalid_name' })
    if (msg === 'invalid_trigger_type') return res.status(400).json({ error: 'invalid_trigger_type' })
    if (msg === 'invalid_action_type') return res.status(400).json({ error: 'invalid_action_type' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/workflow-automation/rules/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  try {
    const result = await adminDeleteWorkflowAutomationRule(id)
    res.json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_id') return res.status(400).json({ error: 'invalid_id' })
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/workflow-automation/events', requireAuth, requireAdmin, async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100
  try {
    const events = await adminListWorkflowAutomationEvents({ limit })
    res.json({ ok: true, events })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/workflow-automation/run', requireAuth, requireAdmin, async (req, res) => {
  const limitPerRule = req.body?.limit_per_rule ? Number(req.body.limit_per_rule) : 20
  try {
    const result = await adminRunWorkflowAutomationRules({ limitPerRule })
    res.json({ ok: true, result })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_limit') return res.status(400).json({ error: 'invalid_limit' })
    res.status(500).json({ error: 'db_error' })
  }
})

// ── Product Bundles ──

router.get('/api/admin/bundles', requireAuth, requireAdmin, async (req, res) => {
  try {
    const bundles = await adminListBundles()
    res.json({ ok: true, bundles })
  } catch (e) {
    res.status(500).json({ error: 'db_error' })
  }
})

router.get('/api/admin/bundles/:id(\\d+)', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  try {
    const bundle = await adminGetBundleDetail(id)
    res.json({ ok: true, bundle })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/admin/bundles', requireAuth, requireAdmin, async (req, res) => {
  const { name, slug, description, image_url, bundle_price, is_active, is_hidden, sort_order, starts_at, ends_at, items } = req.body ?? {}
  try {
    const id = await adminCreateBundle({
      name, slug, description, imageUrl: image_url,
      bundlePrice: bundle_price, isActive: is_active, isHidden: is_hidden,
      sortOrder: sort_order, startsAt: starts_at, endsAt: ends_at, items,
    })
    res.status(201).json({ ok: true, id })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_name_or_slug') return res.status(400).json({ error: 'invalid_name_or_slug' })
    if (msg === 'invalid_price') return res.status(400).json({ error: 'invalid_price' })
    if (msg === 'invalid_bundle_items') return res.status(400).json({ error: 'invalid_bundle_items' })
    if (msg === 'product_not_found') return res.status(400).json({ error: 'product_not_found' })
    if (msg === 'invalid_product_option') return res.status(400).json({ error: 'invalid_product_option' })
    if (e?.code === '23505') return res.status(409).json({ error: 'slug_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.put('/api/admin/bundles/:id(\\d+)', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const { name, slug, description, image_url, bundle_price, is_active, is_hidden, sort_order, starts_at, ends_at, items } = req.body ?? {}
  try {
    await adminUpdateBundle({
      id, name, slug, description, imageUrl: image_url,
      bundlePrice: bundle_price, isActive: is_active, isHidden: is_hidden,
      sortOrder: sort_order, startsAt: starts_at, endsAt: ends_at, items,
    })
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (msg === 'invalid_price') return res.status(400).json({ error: 'invalid_price' })
    if (msg === 'invalid_bundle_items') return res.status(400).json({ error: 'invalid_bundle_items' })
    if (msg === 'product_not_found') return res.status(400).json({ error: 'product_not_found' })
    if (msg === 'invalid_product_option') return res.status(400).json({ error: 'invalid_product_option' })
    if (e?.code === '23505') return res.status(409).json({ error: 'slug_taken' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.delete('/api/admin/bundles/:id(\\d+)', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  try {
    await adminDeleteBundle(id)
    res.json({ ok: true })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'not_found') return res.status(404).json({ error: 'not_found' })
    res.status(500).json({ error: 'db_error' })
  }
})

export default router
