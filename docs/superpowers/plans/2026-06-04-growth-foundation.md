# Growth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Growth Foundation layer: wishlist notifications, verified reviews, flash deal campaigns, VIP tiers, a shared discount resolver, and a shared notification delivery path.

**Architecture:** Add pure growth helpers first, then database schema and DB helpers, then route surfaces, then wire quote/purchase logic through the resolver, then customer/admin UI. Keep the current product, bundle, coupon, inbox, and push systems intact while new growth behavior uses auditable shared paths.

**Tech Stack:** Node 20+ test runner, Express 4, PostgreSQL via `pg`, Zod, React 19, React Router 7, Vite 7.

---

## Scope Check

The approved spec covers several related growth systems. Keep this as one implementation plan because the shared discount resolver and notification event model are dependencies for wishlist alerts, campaign pricing, VIP pricing, and customer messaging. Execute tasks in order; each task should leave the app buildable or the backend tests passing for the files it touches.

## File Structure

Create:

- `server/lib/growthDiscounts.js`: pure discount candidate normalization, priority, clamping, and quote explanation.
- `server/lib/growthNotifications.js`: pure notification preference, event key, audience/channel, and message rendering helpers.
- `server/routes/growth.js`: customer and admin growth API routes, exported as an injectable router factory for route tests.
- `server/tests/growth/discounts.test.js`: pure discount resolver tests.
- `server/tests/growth/notifications.test.js`: pure notification helper tests.
- `server/tests/growth/routes.test.js`: Express route tests using a fake store.
- `client/src/components/growth/DiscountBreakdown.jsx`: reusable quote discount explanation UI.
- `client/src/components/growth/WishlistButton.jsx`: login-aware wishlist control.
- `client/src/components/growth/ReviewSummary.jsx`: reusable rating and count display.
- `client/src/pages/AdminV3/modules/GrowthModule.jsx`: admin Growth module with Campaigns, Reviews, VIP, Wishlist Signals, Discounts, and Notifications tabs.

Modify:

- `server/db.js`: schema initialization, growth DB helpers, discount audit inserts, resolver-backed quote/purchase integration.
- `server/index.js`: mount `growthRoutes`.
- `server/routes/public.js`: use resolver-enriched quote output and expose public review/campaign reads when they are not handled by `growthRoutes`.
- `server/routes/me.js`: import customer growth helpers only if customer routes are not all kept in `growthRoutes`.
- `server/lib/requestSchemas.js`: add growth request body schemas.
- `server/lib/auth.js`: add `growth` module and `growth.manage` action to RBAC.
- `server/tests/security/admin-routes.test.js`: include `server/routes/growth.js` in scanned admin route files.
- `client/src/pages/ProductDetail.jsx`: wishlist, review summary/list, review submission, and resolver discount breakdown.
- `client/src/pages/BundleDetail.jsx`: resolver discount breakdown and campaign errors.
- `client/src/pages/Profile.jsx`: Wishlist, Reviews, VIP, and notification preference surfaces.
- `client/src/pages/Home.jsx`: active Flash Deal shelf.
- `client/src/pages/Category.jsx`: active Flash Deal shelf and review/wishlist card signals.
- `client/src/pages/AdminV3/helpers.js`: Growth module metadata and RBAC fallback.
- `client/src/pages/AdminV3/loaders.js`: `loadGrowthModule`.
- `client/src/pages/AdminV3/index.jsx`: import/render Growth module.

---

### Task 1: Pure Discount Resolver

**Files:**
- Create: `server/lib/growthDiscounts.js`
- Test: `server/tests/growth/discounts.test.js`

- [ ] **Step 1: Write the failing discount resolver tests**

Create `server/tests/growth/discounts.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DISCOUNT_PRIORITY,
  computeDiscountStep,
  resolveDiscountQuote,
} from '../../lib/growthDiscounts.js'

test('computeDiscountStep clamps percent and amount discounts', () => {
  assert.deepEqual(computeDiscountStep({ unitPrice: 1000, percent: 10 }), {
    discountPoints: 100,
    finalUnitPrice: 900,
  })
  assert.deepEqual(computeDiscountStep({ unitPrice: 100, amount: 150 }), {
    discountPoints: 100,
    finalUnitPrice: 0,
  })
  assert.deepEqual(computeDiscountStep({ unitPrice: -1, percent: 10 }), {
    discountPoints: 0,
    finalUnitPrice: 0,
  })
})

test('resolveDiscountQuote applies promotion, campaign, VIP, and coupon in fixed order', () => {
  const quote = resolveDiscountQuote({
    targetType: 'product',
    targetId: 10,
    originalUnitPricePoints: 1000,
    quantity: 2,
    candidates: [
      { source_type: 'coupon', source_id: 4, source_code: 'SAVE100', label: 'Coupon SAVE100', amount_points: 100 },
      { source_type: 'vip', source_id: 3, source_code: 'gold', label: 'Gold VIP', discount_percent: 5 },
      { source_type: 'growth_campaign', source_id: 2, source_code: 'DROP', label: 'Limited Drop', discount_amount_points: 50 },
      { source_type: 'product_promotion', source_id: 1, source_code: 'PROMO', label: 'Product Promo', discount_percent: 10 },
    ],
  })

  assert.equal(quote.original_unit_price_points, 1000)
  assert.equal(quote.quantity, 2)
  assert.equal(quote.final_unit_price_points, 708)
  assert.equal(quote.final_total_points, 1416)
  assert.deepEqual(quote.discounts_applied.map((d) => d.source_type), DISCOUNT_PRIORITY)
  assert.deepEqual(quote.discounts_applied.map((d) => d.amount_points), [100, 50, 42, 100])
})

test('resolveDiscountQuote reports rejected discounts without applying them', () => {
  const quote = resolveDiscountQuote({
    targetType: 'product',
    targetId: 10,
    originalUnitPricePoints: 500,
    quantity: 1,
    candidates: [
      { source_type: 'growth_campaign', source_id: 8, label: 'Expired campaign', discount_percent: 50, rejected_reason: 'campaign_expired' },
      { source_type: 'coupon', source_id: 9, source_code: 'BAD', label: 'Invalid coupon', rejected_reason: 'invalid_coupon' },
    ],
  })

  assert.equal(quote.final_unit_price_points, 500)
  assert.equal(quote.final_total_points, 500)
  assert.equal(quote.discounts_applied.length, 0)
  assert.deepEqual(quote.discounts_rejected.map((d) => d.reason), ['campaign_expired', 'invalid_coupon'])
})
```

- [ ] **Step 2: Run the discount tests and verify they fail**

Run:

```powershell
Set-Location server
npm test -- tests/growth/discounts.test.js
```

Expected: FAIL with `Cannot find module` for `server/lib/growthDiscounts.js`.

- [ ] **Step 3: Implement the pure resolver helper**

Create `server/lib/growthDiscounts.js`:

```js
export const DISCOUNT_PRIORITY = ['product_promotion', 'growth_campaign', 'vip', 'coupon']

const PRIORITY_INDEX = new Map(DISCOUNT_PRIORITY.map((source, index) => [source, index]))

function toPositiveInt(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.trunc(n))
}

function normalizeSourceType(value) {
  const source = String(value || '').trim()
  return PRIORITY_INDEX.has(source) ? source : 'coupon'
}

export function computeDiscountStep({ unitPrice, percent, amount } = {}) {
  const price = toPositiveInt(unitPrice)
  if (price <= 0) return { finalUnitPrice: 0, discountPoints: 0 }

  const pct = Number(percent)
  const amt = Number(amount)
  let discount = 0
  if (Number.isFinite(pct) && pct > 0) discount = Math.floor((price * pct) / 100)
  else if (Number.isFinite(amt) && amt > 0) discount = Math.floor(amt)

  const discountPoints = Math.max(0, Math.min(price, discount))
  return { finalUnitPrice: price - discountPoints, discountPoints }
}

export function normalizeDiscountCandidate(candidate = {}) {
  const sourceType = normalizeSourceType(candidate.source_type)
  const sourceId = candidate.source_id == null ? null : Number(candidate.source_id)
  const sourceCode = String(candidate.source_code || '').trim() || null
  const label = String(candidate.label || sourceCode || sourceType).trim()
  const rejectedReason = String(candidate.rejected_reason || '').trim()
  return {
    source_type: sourceType,
    source_id: Number.isFinite(sourceId) ? sourceId : null,
    source_code: sourceCode,
    label,
    discount_percent: candidate.discount_percent == null ? null : Number(candidate.discount_percent),
    discount_amount_points: candidate.discount_amount_points ?? candidate.amount_points ?? null,
    rejected_reason: rejectedReason || null,
    metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {},
    priority: PRIORITY_INDEX.get(sourceType) ?? 999,
  }
}

export function resolveDiscountQuote({
  targetType,
  targetId,
  originalUnitPricePoints,
  quantity = 1,
  candidates = [],
  now = new Date(),
} = {}) {
  const qty = Math.max(1, toPositiveInt(quantity, 1))
  const original = toPositiveInt(originalUnitPricePoints)
  let running = original
  const considered = Array.isArray(candidates) ? candidates.map(normalizeDiscountCandidate) : []
  const ordered = considered.slice().sort((a, b) => a.priority - b.priority)
  const discountsApplied = []
  const discountsRejected = []

  for (const candidate of ordered) {
    if (candidate.rejected_reason) {
      discountsRejected.push({
        source_type: candidate.source_type,
        source_id: candidate.source_id,
        source_code: candidate.source_code,
        label: candidate.label,
        reason: candidate.rejected_reason,
      })
      continue
    }

    const step = computeDiscountStep({
      unitPrice: running,
      percent: candidate.discount_percent,
      amount: candidate.discount_amount_points,
    })
    if (step.discountPoints <= 0) {
      discountsRejected.push({
        source_type: candidate.source_type,
        source_id: candidate.source_id,
        source_code: candidate.source_code,
        label: candidate.label,
        reason: 'no_discount',
      })
      continue
    }

    discountsApplied.push({
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      source_code: candidate.source_code,
      label: candidate.label,
      amount_points: step.discountPoints,
      unit_price_before_points: running,
      unit_price_after_points: step.finalUnitPrice,
      metadata: candidate.metadata,
    })
    running = step.finalUnitPrice
  }

  return {
    target_type: String(targetType || '').trim() || null,
    target_id: targetId == null ? null : Number(targetId),
    original_unit_price_points: original,
    quantity: qty,
    discounts_considered: considered.map(({ priority, ...candidate }) => candidate),
    discounts_applied: discountsApplied,
    discounts_rejected: discountsRejected,
    final_unit_price_points: running,
    final_total_points: running * qty,
    resolved_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  }
}
```

- [ ] **Step 4: Run the discount tests and verify they pass**

Run:

```powershell
Set-Location server
npm test -- tests/growth/discounts.test.js
```

Expected: PASS for all three tests.

- [ ] **Step 5: Commit the pure discount resolver**

```powershell
git add server/lib/growthDiscounts.js server/tests/growth/discounts.test.js
git commit -m "feat: add growth discount resolver"
```

---

### Task 2: Pure Notification Helpers

**Files:**
- Create: `server/lib/growthNotifications.js`
- Test: `server/tests/growth/notifications.test.js`

- [ ] **Step 1: Write the failing notification tests**

Create `server/tests/growth/notifications.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildGrowthEventKey,
  filterGrowthNotificationChannels,
  normalizeNotificationPreferences,
  renderGrowthNotification,
} from '../../lib/growthNotifications.js'

test('buildGrowthEventKey creates deterministic keys', () => {
  assert.equal(
    buildGrowthEventKey({ eventType: 'wishlist_stock_back', targetType: 'product', targetId: 42, version: 'stock:7' }),
    'wishlist_stock_back:product:42:stock:7',
  )
})

test('normalizeNotificationPreferences enables safe defaults', () => {
  assert.deepEqual(normalizeNotificationPreferences(null), {
    wishlist_stock: true,
    wishlist_promo: true,
    campaigns: true,
    vip: true,
    reviews: true,
    push_enabled: false,
  })
})

test('filterGrowthNotificationChannels keeps inbox baseline and respects push preference', () => {
  assert.deepEqual(
    filterGrowthNotificationChannels({
      eventType: 'campaign_started',
      preferences: { campaigns: true, push_enabled: true },
      hasPushSubscription: true,
    }),
    ['inbox', 'push'],
  )
  assert.deepEqual(
    filterGrowthNotificationChannels({
      eventType: 'campaign_started',
      preferences: { campaigns: false, push_enabled: true },
      hasPushSubscription: true,
    }),
    [],
  )
  assert.deepEqual(
    filterGrowthNotificationChannels({
      eventType: 'vip_tier_changed',
      preferences: { vip: true, push_enabled: false },
      hasPushSubscription: true,
    }),
    ['inbox'],
  )
})

test('renderGrowthNotification returns inbox and push copy for known events', () => {
  const rendered = renderGrowthNotification({
    eventType: 'wishlist_stock_back',
    payload: { product_name: 'Nitro Pack', product_id: 77 },
  })
  assert.equal(rendered.title, 'สินค้าใน Wishlist กลับมาแล้ว')
  assert.match(rendered.body, /Nitro Pack/)
  assert.equal(rendered.link, '/product/77')
  assert.ok(rendered.push_body.length <= rendered.body.length)
})
```

- [ ] **Step 2: Run the notification tests and verify they fail**

Run:

```powershell
Set-Location server
npm test -- tests/growth/notifications.test.js
```

Expected: FAIL with `Cannot find module` for `server/lib/growthNotifications.js`.

- [ ] **Step 3: Implement pure notification helpers**

Create `server/lib/growthNotifications.js`:

```js
const EVENT_PREF_KEY = {
  wishlist_stock_back: 'wishlist_stock',
  wishlist_promo_started: 'wishlist_promo',
  campaign_started: 'campaigns',
  campaign_ending: 'campaigns',
  vip_tier_changed: 'vip',
  review_moderated: 'reviews',
}

export function normalizeNotificationPreferences(input) {
  const data = input && typeof input === 'object' ? input : {}
  return {
    wishlist_stock: data.wishlist_stock !== false,
    wishlist_promo: data.wishlist_promo !== false,
    campaigns: data.campaigns !== false,
    vip: data.vip !== false,
    reviews: data.reviews !== false,
    push_enabled: data.push_enabled === true,
  }
}

function cleanPart(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/:+/g, '_')
}

export function buildGrowthEventKey({ eventType, targetType, targetId, version } = {}) {
  const parts = [eventType, targetType, targetId, version].map(cleanPart).filter(Boolean)
  if (parts.length < 3) throw new Error('invalid_event_key')
  return parts.join(':')
}

export function filterGrowthNotificationChannels({
  eventType,
  preferences,
  hasPushSubscription = false,
} = {}) {
  const prefs = normalizeNotificationPreferences(preferences)
  const prefKey = EVENT_PREF_KEY[String(eventType || '')]
  if (prefKey && prefs[prefKey] === false) return []
  const channels = ['inbox']
  if (prefs.push_enabled && hasPushSubscription) channels.push('push')
  return channels
}

export function renderGrowthNotification({ eventType, payload } = {}) {
  const data = payload && typeof payload === 'object' ? payload : {}
  const productName = String(data.product_name || 'สินค้า').trim()
  const campaignTitle = String(data.campaign_title || 'แคมเปญ').trim()
  const tierName = String(data.tier_name || 'VIP').trim()
  const productId = Number(data.product_id)
  const campaignId = Number(data.campaign_id)
  const reviewId = Number(data.review_id)

  if (eventType === 'wishlist_stock_back') {
    return {
      title: 'สินค้าใน Wishlist กลับมาแล้ว',
      body: `${productName} กลับมาพร้อมให้สั่งซื้อแล้ว`,
      push_body: `${productName} กลับมาแล้ว`,
      link: Number.isFinite(productId) ? `/product/${productId}` : '/profile#wishlist',
    }
  }
  if (eventType === 'wishlist_promo_started') {
    return {
      title: 'สินค้าใน Wishlist มีโปรโมชัน',
      body: `${productName} มีโปรโมชันใหม่ ตรวจสอบราคาก่อนหมดเวลา`,
      push_body: `${productName} มีโปรใหม่`,
      link: Number.isFinite(productId) ? `/product/${productId}` : '/profile#wishlist',
    }
  }
  if (eventType === 'campaign_started') {
    return {
      title: 'Flash Deal เริ่มแล้ว',
      body: `${campaignTitle} เริ่มแล้ว ตรวจสอบสินค้าที่ร่วมรายการ`,
      push_body: `${campaignTitle} เริ่มแล้ว`,
      link: Number.isFinite(campaignId) ? `/?campaign=${campaignId}` : '/',
    }
  }
  if (eventType === 'campaign_ending') {
    return {
      title: 'Flash Deal ใกล้หมดเวลา',
      body: `${campaignTitle} ใกล้หมดเวลาแล้ว`,
      push_body: `${campaignTitle} ใกล้หมดเวลา`,
      link: Number.isFinite(campaignId) ? `/?campaign=${campaignId}` : '/',
    }
  }
  if (eventType === 'vip_tier_changed') {
    return {
      title: 'อัปเดตระดับ VIP',
      body: `ระดับของคุณเปลี่ยนเป็น ${tierName}`,
      push_body: `คุณเป็น ${tierName}`,
      link: '/profile#vip',
    }
  }
  if (eventType === 'review_moderated') {
    return {
      title: 'อัปเดตรีวิวสินค้า',
      body: 'รีวิวของคุณได้รับการตรวจสอบแล้ว',
      push_body: 'รีวิวได้รับการตรวจสอบแล้ว',
      link: Number.isFinite(reviewId) ? `/profile#review-${reviewId}` : '/profile#reviews',
    }
  }
  return {
    title: 'แจ้งเตือนจากร้าน',
    body: 'มีรายการแจ้งเตือนใหม่',
    push_body: 'มีแจ้งเตือนใหม่',
    link: '/inbox',
  }
}
```

- [ ] **Step 4: Run the notification tests and verify they pass**

Run:

```powershell
Set-Location server
npm test -- tests/growth/notifications.test.js
```

Expected: PASS for all four tests.

- [ ] **Step 5: Commit notification helpers**

```powershell
git add server/lib/growthNotifications.js server/tests/growth/notifications.test.js
git commit -m "feat: add growth notification helpers"
```

---

### Task 3: Request Schemas And Route Factory

**Files:**
- Modify: `server/lib/requestSchemas.js`
- Create: `server/routes/growth.js`
- Test: `server/tests/growth/routes.test.js`
- Modify: `server/tests/security/admin-routes.test.js`

- [ ] **Step 1: Write route tests with an injectable fake store**

Create `server/tests/growth/routes.test.js`:

```js
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
    listMyWishlist: async (userId) => ({ items: [...wishlist].map((product_id) => ({ product_id, name: `Product ${product_id}` })) }),
    upsertWishlistItem: async ({ userId, productId }) => {
      wishlist.add(Number(productId))
      return { user_id: userId, product_id: Number(productId) }
    },
    deleteWishlistItem: async ({ userId, productId }) => {
      wishlist.delete(Number(productId))
      return { ok: true }
    },
    getNotificationPreferences: async () => ({ wishlist_stock: true, wishlist_promo: true, campaigns: true, vip: true, reviews: true, push_enabled: false }),
    updateNotificationPreferences: async ({ preferences }) => preferences,
    listProductReviewsPublic: async () => ({ summary: { average_rating: 5, review_count: 1 }, reviews: [{ id: 1, rating: 5, comment: 'good' }] }),
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
```

- [ ] **Step 2: Update admin route guard test input**

Modify `server/tests/security/admin-routes.test.js` so `adminRouteFiles` includes the new route file:

```js
const adminRouteFiles = [
  'server/routes/admin-core.js',
  'server/routes/admin-catalog.js',
  'server/routes/admin-ops.js',
  'server/routes/growth.js',
]
```

- [ ] **Step 3: Run tests and verify route test fails**

Run:

```powershell
Set-Location server
npm test -- tests/growth/routes.test.js tests/security/admin-routes.test.js
```

Expected: FAIL with `Cannot find module` for `server/routes/growth.js`.

- [ ] **Step 4: Add request schemas**

Modify `server/lib/requestSchemas.js` by adding these exports near the other body schemas:

```js
export const WishlistBodySchema = z.object({
  product_id: z.coerce.number({ message: 'invalid_product_id' }).int('invalid_product_id').positive('invalid_product_id'),
  notify_stock: z.boolean().optional().default(true),
  notify_promo: z.boolean().optional().default(true),
  notify_campaign: z.boolean().optional().default(true),
})

export const ReviewBodySchema = z.object({
  order_item_id: z.coerce.number({ message: 'invalid_order_item_id' }).int('invalid_order_item_id').positive('invalid_order_item_id'),
  rating: z.coerce.number({ message: 'invalid_rating' }).int('invalid_rating').min(1, 'invalid_rating').max(5, 'invalid_rating'),
  comment: requiredString('invalid_comment').transform((value) => value.trim()).refine((value) => value.length >= 2, 'invalid_comment').refine((value) => value.length <= 1200, 'invalid_comment_too_long'),
})

export const NotificationPreferencesBodySchema = z.object({
  wishlist_stock: z.boolean().optional(),
  wishlist_promo: z.boolean().optional(),
  campaigns: z.boolean().optional(),
  vip: z.boolean().optional(),
  reviews: z.boolean().optional(),
  push_enabled: z.boolean().optional(),
})

export const GrowthCampaignBodySchema = z.object({
  kind: z.enum(['flash_deal', 'limited_drop'], { message: 'invalid_kind' }),
  title: requiredString('invalid_title').transform((value) => value.trim()).refine((value) => value.length >= 2, 'invalid_title').refine((value) => value.length <= 120, 'invalid_title_too_long'),
  description: z.string().optional().default('').transform((value) => value.trim()),
  badge_text: z.string().optional().default('').transform((value) => value.trim()),
  is_active: z.boolean().optional().default(true),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  discount_type: z.enum(['none', 'percent', 'amount_points'], { message: 'invalid_discount_type' }).optional().default('none'),
  discount_value: z.coerce.number().optional().nullable(),
  quantity_limit: z.coerce.number().int('invalid_quantity_limit').positive('invalid_quantity_limit').optional().nullable(),
  vip_early_access_tier: z.string().optional().nullable(),
  targets: z.array(z.object({
    target_type: z.enum(['product', 'bundle'], { message: 'invalid_target_type' }),
    target_id: z.coerce.number({ message: 'invalid_target_id' }).int('invalid_target_id').positive('invalid_target_id'),
    sort_order: z.coerce.number().int().optional().default(0),
  })).min(1, 'invalid_targets'),
})

export const VipTierBodySchema = z.object({
  code: requiredString('invalid_code').transform((value) => value.trim().toLowerCase()).refine((value) => /^[a-z0-9_-]{2,40}$/.test(value), 'invalid_code'),
  name: requiredString('invalid_name').transform((value) => value.trim()).refine((value) => value.length >= 2, 'invalid_name').refine((value) => value.length <= 80, 'invalid_name_too_long'),
  sort_order: z.coerce.number().int().optional().default(0),
  threshold_points_spent: z.coerce.number({ message: 'invalid_threshold' }).int('invalid_threshold').min(0, 'invalid_threshold'),
  discount_percent: z.coerce.number().min(0, 'invalid_discount').max(95, 'invalid_discount').optional().default(0),
  priority_support: z.boolean().optional().default(false),
  early_access_minutes: z.coerce.number().int('invalid_early_access').min(0, 'invalid_early_access').optional().default(0),
  badge_label: z.string().optional().default('').transform((value) => value.trim()),
  is_active: z.boolean().optional().default(true),
})

export const DiscountPreviewBodySchema = z.object({
  target_type: z.enum(['product', 'bundle'], { message: 'invalid_target_type' }),
  target_id: z.coerce.number({ message: 'invalid_target_id' }).int('invalid_target_id').positive('invalid_target_id'),
  qty: z.coerce.number().int('invalid_qty').positive('invalid_qty').max(999, 'invalid_qty').optional().default(1),
  product_option_id: z.union([z.string(), z.number()]).optional(),
  coupon_code: z.string().optional().default('').transform((value) => value.trim().toUpperCase()),
  user_id: z.coerce.number().int('invalid_user_id').positive('invalid_user_id').optional(),
})

export const GrowthNotificationTestBodySchema = z.object({
  event_type: z.enum(['wishlist_stock_back', 'wishlist_promo_started', 'campaign_started', 'campaign_ending', 'vip_tier_changed', 'review_moderated'], { message: 'invalid_event_type' }),
  product_id: z.coerce.number().int('invalid_product_id').positive('invalid_product_id').optional(),
  campaign_id: z.coerce.number().int('invalid_campaign_id').positive('invalid_campaign_id').optional(),
})
```

- [ ] **Step 5: Create the injectable growth router**

Create `server/routes/growth.js`:

```js
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
  if (msg === 'review_not_allowed') return res.status(403).json({ error: 'review_not_allowed' })
  if (msg === 'review_exists') return res.status(409).json({ error: 'review_exists' })
  return res.status(500).json({ error: 'db_error' })
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
      const item = await store.upsertWishlistItem({ userId: req.user.id, ...parsed.data })
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

  router.get('/api/products/:id(\\d+)/reviews', async (req, res) => {
    try {
      const data = await store.listProductReviewsPublic({ productId: Number(req.params.id), limit: req.query.limit, offset: req.query.offset })
      res.json({ ok: true, ...data })
    } catch (error) {
      mapError(res, error)
    }
  })

  router.post('/api/products/:id(\\d+)/reviews', auth.requireAuth, async (req, res) => {
    const parsed = validateBody(ReviewBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try {
      const review = await store.createProductReview({ userId: req.user.id, productId: Number(req.params.id), ...parsed.data })
      res.status(201).json({ ok: true, review })
    } catch (error) {
      mapError(res, error)
    }
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
    try { res.json({ ok: true, ...(await store.adminListGrowthCampaigns({ limit: req.query.limit, offset: req.query.offset })) }) } catch (error) { mapError(res, error) }
  })

  router.post('/api/admin/growth-campaigns', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(GrowthCampaignBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try { res.status(201).json({ ok: true, campaign: await store.adminCreateGrowthCampaign(parsed.data) }) } catch (error) { mapError(res, error) }
  })

  router.put('/api/admin/growth-campaigns/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(GrowthCampaignBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try { res.json({ ok: true, campaign: await store.adminUpdateGrowthCampaign({ id: Number(req.params.id), ...parsed.data }) }) } catch (error) { mapError(res, error) }
  })

  router.delete('/api/admin/growth-campaigns/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try { await store.adminDeleteGrowthCampaign(Number(req.params.id)); res.json({ ok: true }) } catch (error) { mapError(res, error) }
  })

  router.get('/api/admin/reviews', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try { res.json({ ok: true, ...(await store.adminListReviews({ status: req.query.status, limit: req.query.limit, offset: req.query.offset })) }) } catch (error) { mapError(res, error) }
  })

  router.patch('/api/admin/reviews/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try { res.json({ ok: true, review: await store.adminModerateReview({ id: Number(req.params.id), status: req.body?.status, adminNote: req.body?.admin_note, moderatorId: req.user.id }) }) } catch (error) { mapError(res, error) }
  })

  router.get('/api/admin/vip-tiers', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try { res.json({ ok: true, ...(await store.adminListVipTiers()) }) } catch (error) { mapError(res, error) }
  })

  router.post('/api/admin/vip-tiers', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(VipTierBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try { res.status(201).json({ ok: true, tier: await store.adminCreateVipTier(parsed.data) }) } catch (error) { mapError(res, error) }
  })

  router.put('/api/admin/vip-tiers/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(VipTierBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try { res.json({ ok: true, tier: await store.adminUpdateVipTier({ id: Number(req.params.id), ...parsed.data }) }) } catch (error) { mapError(res, error) }
  })

  router.delete('/api/admin/vip-tiers/:id(\\d+)', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try { await store.adminDeleteVipTier(Number(req.params.id)); res.json({ ok: true }) } catch (error) { mapError(res, error) }
  })

  router.get('/api/admin/wishlist-signals', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try { res.json({ ok: true, ...(await store.adminListWishlistSignals({ limit: req.query.limit })) }) } catch (error) { mapError(res, error) }
  })

  router.get('/api/admin/growth-notifications', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try { res.json({ ok: true, ...(await store.adminListGrowthNotifications({ limit: req.query.limit, offset: req.query.offset })) }) } catch (error) { mapError(res, error) }
  })

  router.post('/api/admin/discount-preview', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(DiscountPreviewBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try { res.json({ ok: true, quote: await store.adminPreviewDiscounts(parsed.data) }) } catch (error) { mapError(res, error) }
  })

  router.post('/api/admin/growth-notifications/test', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    const parsed = validateBody(GrowthNotificationTestBodySchema, req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    try { res.json({ ok: true, result: await store.adminSendGrowthNotificationTest({ userId: req.user.id, ...parsed.data }) }) } catch (error) { mapError(res, error) }
  })

  return router
}

export default createGrowthRouter()
```

- [ ] **Step 6: Run route and security tests**

Run:

```powershell
Set-Location server
npm test -- tests/growth/routes.test.js tests/security/admin-routes.test.js tests/security/validation.test.js
```

Expected: route tests pass. If validation tests fail due to schema export syntax placement, move the new schema exports below `requiredString` and rerun.

- [ ] **Step 7: Commit route factory and schemas**

```powershell
git add server/lib/requestSchemas.js server/routes/growth.js server/tests/growth/routes.test.js server/tests/security/admin-routes.test.js
git commit -m "feat: add growth API route shell"
```

---

### Task 4: Database Schema And Store Helpers

**Files:**
- Modify: `server/db.js`
- Modify: `server/index.js`

- [ ] **Step 1: Add schema initialization**

In `server/db.js`, inside `initDbPg()` after `product_bundles` and `bundle_items` initialization, add SQL blocks for:

```js
  await query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      notify_stock BOOLEAN NOT NULL DEFAULT true,
      notify_promo BOOLEAN NOT NULL DEFAULT true,
      notify_campaign BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, product_id)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS wishlist_items_product_idx ON wishlist_items (product_id, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      moderated_by BIGINT REFERENCES users(id),
      moderated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (order_item_id)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS product_reviews_product_status_idx ON product_reviews (product_id, status, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_campaigns (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      badge_text TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value INTEGER,
      quantity_limit INTEGER,
      quantity_used INTEGER NOT NULL DEFAULT 0,
      vip_early_access_tier TEXT,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_campaigns_active_idx ON growth_campaigns (is_active, starts_at, ends_at)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_campaign_targets (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES growth_campaigns(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id BIGINT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_campaign_targets_lookup_idx ON growth_campaign_targets (target_type, target_id, campaign_id)`)

  await query(`
    CREATE TABLE IF NOT EXISTS vip_tiers (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      threshold_points_spent INTEGER NOT NULL DEFAULT 0,
      discount_percent INTEGER NOT NULL DEFAULT 0,
      priority_support BOOLEAN NOT NULL DEFAULT false,
      early_access_minutes INTEGER NOT NULL DEFAULT 0,
      badge_label TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      benefits_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS vip_user_snapshots (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tier_id BIGINT REFERENCES vip_tiers(id),
      points_spent INTEGER NOT NULL DEFAULT 0,
      next_tier_id BIGINT REFERENCES vip_tiers(id),
      next_threshold_points INTEGER,
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS order_discount_applications (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id BIGINT,
      source_code TEXT,
      label TEXT NOT NULL,
      amount_points INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS order_discount_applications_order_idx ON order_discount_applications (order_id, sort_order, id)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_notification_events (
      id BIGSERIAL PRIMARY KEY,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      target_type TEXT,
      target_id BIGINT,
      audience_type TEXT NOT NULL DEFAULT 'direct',
      payload_json JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_notification_events_created_idx ON growth_notification_events (created_at DESC, id DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES growth_notification_events(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      site_message_id BIGINT REFERENCES site_messages(id) ON DELETE SET NULL,
      error_text TEXT,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (event_id, user_id, channel)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_notification_deliveries_user_idx ON growth_notification_deliveries (user_id, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wishlist_stock BOOLEAN NOT NULL DEFAULT true,
      wishlist_promo BOOLEAN NOT NULL DEFAULT true,
      campaigns BOOLEAN NOT NULL DEFAULT true,
      vip BOOLEAN NOT NULL DEFAULT true,
      reviews BOOLEAN NOT NULL DEFAULT true,
      push_enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
```

- [ ] **Step 2: Add DB helper exports**

In `server/db.js`, add exported helpers for every route method used by `server/routes/growth.js`. Keep helpers close to existing catalog/promotion helpers so related pricing code remains discoverable.

Add this import near the top of `server/db.js`:

```js
import { normalizeNotificationPreferences } from './lib/growthNotifications.js'
```

Add the customer wishlist and preference helpers with this shape:

```js
export async function listMyWishlist(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const items = await all(
    `SELECT wi.product_id, wi.notify_stock, wi.notify_promo, wi.notify_campaign, wi.created_at,
            p.name, p.slug, p.image_url, p.stock, p.is_unlimited_stock, p.is_hidden,
            CASE
              WHEN p.is_hidden THEN 'hidden'
              WHEN p.is_unlimited_stock THEN 'available'
              WHEN COALESCE(p.stock, 0) > 0 THEN 'available'
              ELSE 'out_of_stock'
            END AS stock_status
     FROM wishlist_items wi
     JOIN products p ON p.id = wi.product_id
     WHERE wi.user_id = $1
       AND p.is_hidden = false
     ORDER BY wi.created_at DESC`,
    [uid],
  )
  return { items }
}

export async function upsertWishlistItem({ userId, product_id, productId, notify_stock = true, notify_promo = true, notify_campaign = true }) {
  const uid = Number(userId)
  const pid = Number(product_id ?? productId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  const product = await get('SELECT id FROM products WHERE id = $1 AND is_hidden = false', [pid])
  if (!product) throw new Error('not_found')
  return get(
    `INSERT INTO wishlist_items (user_id, product_id, notify_stock, notify_promo, notify_campaign, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET notify_stock = EXCLUDED.notify_stock,
                   notify_promo = EXCLUDED.notify_promo,
                   notify_campaign = EXCLUDED.notify_campaign,
                   updated_at = now()
     RETURNING user_id, product_id, notify_stock, notify_promo, notify_campaign, created_at, updated_at`,
    [uid, pid, Boolean(notify_stock), Boolean(notify_promo), Boolean(notify_campaign)],
  )
}

export async function deleteWishlistItem({ userId, productId }) {
  const uid = Number(userId)
  const pid = Number(productId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  await query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [uid, pid])
  return { ok: true }
}

export async function getNotificationPreferences(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const row = await get('SELECT wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled FROM user_notification_preferences WHERE user_id = $1', [uid])
  return normalizeNotificationPreferences(row)
}

export async function updateNotificationPreferences({ userId, preferences }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const next = normalizeNotificationPreferences(preferences)
  return get(
    `INSERT INTO user_notification_preferences (user_id, wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (user_id)
     DO UPDATE SET wishlist_stock = EXCLUDED.wishlist_stock,
                   wishlist_promo = EXCLUDED.wishlist_promo,
                   campaigns = EXCLUDED.campaigns,
                   vip = EXCLUDED.vip,
                   reviews = EXCLUDED.reviews,
                   push_enabled = EXCLUDED.push_enabled,
                   updated_at = now()
     RETURNING wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled`,
    [uid, next.wishlist_stock, next.wishlist_promo, next.campaigns, next.vip, next.reviews, next.push_enabled],
  )
}
```

Add review helpers:

```js
export async function listProductReviewsPublic({ productId, limit = 20, offset = 0 }) {
  const pid = Number(productId)
  const lim = Math.min(100, Math.max(1, Number(limit) || 20))
  const off = Math.max(0, Number(offset) || 0)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  const reviews = await all(
    `SELECT pr.id, pr.rating, pr.comment, pr.created_at,
            COALESCE(u.display_name, u.username, 'user') AS reviewer_name
     FROM product_reviews pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.product_id = $1 AND pr.status = 'approved'
     ORDER BY pr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [pid, lim, off],
  )
  const summary = await get(
    `SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::float AS average_rating,
            COUNT(*)::int AS review_count
     FROM product_reviews
     WHERE product_id = $1 AND status = 'approved'`,
    [pid],
  )
  return { summary, reviews }
}

export async function createProductReview({ userId, productId, order_item_id, rating, comment }) {
  const uid = Number(userId)
  const pid = Number(productId)
  const orderItemId = Number(order_item_id)
  const rate = Number(rating)
  const text = String(comment || '').trim()
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  if (!Number.isFinite(orderItemId) || orderItemId <= 0) throw new Error('invalid_order_item_id')
  if (!Number.isFinite(rate) || rate < 1 || rate > 5) throw new Error('invalid_rating')
  const eligible = await get(
    `SELECT oi.id, oi.order_id
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = $1
       AND oi.product_id = $2
       AND o.user_id = $3
       AND o.status IN ('paid', 'completed')`,
    [orderItemId, pid, uid],
  )
  if (!eligible) throw new Error('review_not_allowed')
  try {
    return await get(
      `INSERT INTO product_reviews (user_id, product_id, order_id, order_item_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, status, created_at`,
      [uid, pid, eligible.order_id, orderItemId, Math.trunc(rate), text],
    )
  } catch (error) {
    if (error?.code === '23505') throw new Error('review_exists')
    throw error
  }
}
```

For campaign, VIP, admin review, signal, notification, and discount preview helpers, use these concrete SQL responsibilities:

- `listActiveGrowthCampaigns`: select active campaigns joined to `growth_campaign_targets`, filter by `target_type` and `target_id` when provided, and return `{ campaigns }` where each campaign has `targets` and `primary_link`.
- `recalculateVipForUser`: sum successful order `total_points` for the user, select the highest active tier where `threshold_points_spent <= points_spent`, select the next higher active tier, and upsert `vip_user_snapshots`.
- `getMyVip`: select `vip_user_snapshots` left joined to `vip_tiers`, recalculate with `recalculateVipForUser(userId)` when no snapshot exists, and return `{ tier, points_spent, next_tier, next_threshold_points }`.
- `adminListGrowthCampaigns`: select campaigns ordered by `created_at DESC`, then load targets with `WHERE campaign_id = ANY($1::bigint[])`.
- `adminCreateGrowthCampaign` and `adminUpdateGrowthCampaign`: wrap campaign row and target replacement in one transaction.
- `adminDeleteGrowthCampaign`: delete from `growth_campaigns` by ID and throw `not_found` when `rowCount` is zero.
- `adminListReviews`: select reviews joined to users, products, and orders; support optional status filter.
- `adminModerateReview`: update `status`, `admin_note`, `moderated_by`, `moderated_at`; allowed statuses are `pending`, `approved`, `hidden`, `rejected`.
- `adminListVipTiers`, `adminCreateVipTier`, `adminUpdateVipTier`, `adminDeleteVipTier`: read and mutate `vip_tiers` ordered by `threshold_points_spent ASC, sort_order ASC`.
- `adminListWishlistSignals`: group `wishlist_items` by product and return follower count plus product stock metadata.
- `adminListGrowthNotifications`: select events plus delivery counts using grouped `growth_notification_deliveries`.
- `adminPreviewDiscounts`: call the same resolver path used by quote without mutating coupon or campaign usage.
- `adminSendGrowthNotificationTest`: enqueue a direct event for the current admin, create a `site_messages` row, and create a delivered `growth_notification_deliveries` row.

- [ ] **Step 3: Mount the route**

Modify `server/index.js`:

```js
import growthRoutes from './routes/growth.js'
```

Then mount it after `discordRoutes` and before admin routes:

```js
app.use(growthRoutes)
```

- [ ] **Step 4: Run backend tests**

Run:

```powershell
Set-Location server
npm test -- tests/growth/routes.test.js tests/security/admin-routes.test.js
```

Expected: PASS. The route tests use the fake store, so failures here are wiring or syntax issues.

- [ ] **Step 5: Commit schema and store helpers**

```powershell
git add server/db.js server/index.js
git commit -m "feat: add growth database helpers"
```

---

### Task 5: Resolver-Backed Quote And Purchase

**Files:**
- Modify: `server/db.js`
- Test: `server/tests/growth/discounts.test.js`

- [ ] **Step 1: Add resolver compatibility tests**

Extend `server/tests/growth/discounts.test.js`:

```js
test('resolveDiscountQuote keeps legacy promo and coupon fields derivable', () => {
  const quote = resolveDiscountQuote({
    targetType: 'product',
    targetId: 88,
    originalUnitPricePoints: 1000,
    quantity: 3,
    candidates: [
      { source_type: 'product_promotion', source_id: 1, label: 'Promo', discount_percent: 20 },
      { source_type: 'coupon', source_id: 2, source_code: 'SAVE50', label: 'Coupon', discount_amount_points: 50 },
    ],
  })
  const promo = quote.discounts_applied.find((item) => item.source_type === 'product_promotion')
  const coupon = quote.discounts_applied.find((item) => item.source_type === 'coupon')
  assert.equal(promo.amount_points, 200)
  assert.equal(coupon.amount_points, 50)
  assert.equal(quote.final_unit_price_points, 750)
  assert.equal(quote.final_total_points, 2250)
})
```

- [ ] **Step 2: Run resolver tests**

Run:

```powershell
Set-Location server
npm test -- tests/growth/discounts.test.js
```

Expected: PASS before integration; this locks legacy derivation behavior.

- [ ] **Step 3: Import resolver in `server/db.js`**

Add near other imports:

```js
import { resolveDiscountQuote } from './lib/growthDiscounts.js'
```

- [ ] **Step 4: Add candidate builders in `server/db.js`**

Add helpers near `getActivePromotionForProduct`:

```js
function promotionToDiscountCandidate(promo) {
  if (!promo) return null
  return {
    source_type: 'product_promotion',
    source_id: promo.id,
    source_code: 'product_promotion',
    label: promo.title || 'Product promotion',
    discount_percent: promo.discount_percent,
    discount_amount_points: promo.discount_amount_points,
  }
}

function couponToDiscountCandidate(coupon) {
  if (!coupon) return null
  return {
    source_type: 'coupon',
    source_id: coupon.id,
    source_code: coupon.code,
    label: coupon.title || coupon.code || 'Coupon',
    discount_percent: coupon.discount_percent,
    discount_amount_points: coupon.discount_amount_points,
  }
}

function vipToDiscountCandidate(vip) {
  if (!vip?.tier || Number(vip.tier.discount_percent || 0) <= 0) return null
  return {
    source_type: 'vip',
    source_id: vip.tier.id,
    source_code: vip.tier.code,
    label: vip.tier.name || vip.tier.code || 'VIP',
    discount_percent: vip.tier.discount_percent,
  }
}

function campaignToDiscountCandidate(campaign) {
  if (!campaign || campaign.discount_type === 'none') return null
  return {
    source_type: 'growth_campaign',
    source_id: campaign.id,
    source_code: campaign.kind,
    label: campaign.title || 'Growth campaign',
    discount_percent: campaign.discount_type === 'percent' ? campaign.discount_value : null,
    discount_amount_points: campaign.discount_type === 'amount_points' ? campaign.discount_value : null,
  }
}

async function insertOrderDiscountApplications(client, { orderId, orderItemId = null, quote }) {
  const applied = Array.isArray(quote?.discounts_applied) ? quote.discounts_applied : []
  for (let index = 0; index < applied.length; index += 1) {
    const item = applied[index]
    await client.query(
      `INSERT INTO order_discount_applications (
         order_id, order_item_id, source_type, source_id, source_code, label,
         amount_points, sort_order, metadata_json
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        orderId,
        orderItemId,
        item.source_type,
        item.source_id,
        item.source_code,
        item.label,
        item.amount_points,
        index,
        JSON.stringify(item.metadata || {}),
      ],
    )
  }
}
```

- [ ] **Step 5: Replace product quote calculation with resolver output**

In `quoteProductPurchase`, build candidates from promotion, active campaign, VIP if `userId` is available, and coupon. Return existing fields plus resolver fields:

```js
const candidates = [promotionToDiscountCandidate(promo), couponToDiscountCandidate(coupon)].filter(Boolean)
const resolved = resolveDiscountQuote({
  targetType: 'product',
  targetId: pid,
  originalUnitPricePoints: originalUnitPrice,
  quantity: q,
  candidates,
})
const promoDiscount = resolved.discounts_applied.find((d) => d.source_type === 'product_promotion')?.amount_points || 0
const couponDiscount = resolved.discounts_applied.find((d) => d.source_type === 'coupon')?.amount_points || 0
```

Keep current response fields populated from `resolved`. Add `discounts_applied`, `discounts_rejected`, `discounts_considered`, and `final_unit_price_points`.

- [ ] **Step 6: Replace product purchase calculation with resolver output**

In `purchaseDigitalProduct`, use the same candidate-building path after locking coupon and campaign rows. Use `resolved.final_total_points` for wallet checks, order total, transaction debit, and response. After `orderItemId` exists, call:

```js
await insertOrderDiscountApplications(client, { orderId, orderItemId, quote: resolved })
```

- [ ] **Step 7: Replace bundle quote and purchase calculation with resolver output**

In `buildBundleQuote` and `purchaseBundle`, use `resolveDiscountQuote` with `targetType: 'bundle'`, `originalUnitPricePoints: bundlePrice`, and candidates for campaign, VIP, and coupon. Keep `bundle_discount_points` as the existing bundle price saving and put campaign/VIP/coupon in resolver fields.

- [ ] **Step 8: Run backend tests**

Run:

```powershell
Set-Location server
npm test -- tests/growth/discounts.test.js tests/security/omise-removal.test.js tests/security/error-redaction.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit quote and purchase integration**

```powershell
git add server/db.js server/tests/growth/discounts.test.js
git commit -m "feat: route purchases through growth discount resolver"
```

---

### Task 6: Notification Event Delivery Integration

**Files:**
- Modify: `server/db.js`
- Modify: `server/lib/growthNotifications.js`
- Test: `server/tests/growth/notifications.test.js`

- [ ] **Step 1: Add notification event state tests**

Extend `server/tests/growth/notifications.test.js`:

```js
test('filterGrowthNotificationChannels omits push without subscription', () => {
  assert.deepEqual(
    filterGrowthNotificationChannels({
      eventType: 'wishlist_stock_back',
      preferences: { wishlist_stock: true, push_enabled: true },
      hasPushSubscription: false,
    }),
    ['inbox'],
  )
})
```

- [ ] **Step 2: Run notification tests**

Run:

```powershell
Set-Location server
npm test -- tests/growth/notifications.test.js
```

Expected: PASS.

- [ ] **Step 3: Add DB delivery helpers**

In `server/db.js`, add:

```js
export async function enqueueGrowthNotification({ eventKey, eventType, targetType, targetId, audienceType = 'direct', payload }) {
  return get(
    `INSERT INTO growth_notification_events (event_key, event_type, target_type, target_id, audience_type, payload_json)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
     RETURNING id, event_key, event_type, payload_json`,
    [eventKey, eventType, targetType || null, targetId || null, audienceType, JSON.stringify(payload || {})],
  )
}

export async function createGrowthNotificationDelivery({ eventId, userId, channel, siteMessageId = null, status = 'pending', errorText = null }) {
  return get(
    `INSERT INTO growth_notification_deliveries (event_id, user_id, channel, site_message_id, status, error_text, delivered_at)
     VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $5 = 'delivered' THEN now() ELSE NULL END)
     ON CONFLICT (event_id, user_id, channel) DO UPDATE SET status = growth_notification_deliveries.status
     RETURNING id, status`,
    [eventId, userId, channel, siteMessageId, status, errorText],
  )
}
```

- [ ] **Step 4: Route admin test notification through inbox**

Implement `adminSendGrowthNotificationTest` so it builds an event key, renders copy, creates one site message for the current admin, and writes delivery status. Use `sendPushToUser` only when the admin has preference and subscription; inbox is enough for first pass.

- [ ] **Step 5: Run route tests**

Run:

```powershell
Set-Location server
npm test -- tests/growth/routes.test.js tests/growth/notifications.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit notification DB integration**

```powershell
git add server/db.js server/lib/growthNotifications.js server/tests/growth/notifications.test.js
git commit -m "feat: add growth notification delivery records"
```

---

### Task 7: Customer Product, Wishlist, Reviews, And Discount UI

**Files:**
- Create: `client/src/components/growth/DiscountBreakdown.jsx`
- Create: `client/src/components/growth/WishlistButton.jsx`
- Create: `client/src/components/growth/ReviewSummary.jsx`
- Modify: `client/src/pages/ProductDetail.jsx`
- Modify: `client/src/pages/BundleDetail.jsx`

- [ ] **Step 1: Create reusable customer growth components**

Create `client/src/components/growth/DiscountBreakdown.jsx`:

```jsx
function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString('th-TH')
}

export default function DiscountBreakdown({ quote }) {
  const applied = Array.isArray(quote?.discounts_applied) ? quote.discounts_applied : []
  const rejected = Array.isArray(quote?.discounts_rejected) ? quote.discounts_rejected : []
  if (applied.length === 0 && rejected.length === 0) return null
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-white/40">ส่วนลด</div>
      <div className="mt-2 space-y-1">
        {applied.map((item, index) => (
          <div key={`${item.source_type}-${item.source_id || index}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="font-bold text-white/70">{item.label || item.source_code || item.source_type}</span>
            <span className="font-black text-emerald-200">-{fmt(item.amount_points)} พ้อยท์</span>
          </div>
        ))}
        {rejected.map((item, index) => (
          <div key={`rejected-${item.source_type}-${item.source_id || index}`} className="text-[11px] font-semibold text-white/35">
            {item.label || item.source_code || item.source_type}: {item.reason}
          </div>
        ))}
      </div>
    </div>
  )
}
```

Create `client/src/components/growth/WishlistButton.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchJson } from '../../api.js'

export default function WishlistButton({ productId, initialFollowed = false, isAuthed, onChange, className = '' }) {
  const nav = useNavigate()
  const [followed, setFollowed] = useState(Boolean(initialFollowed))
  const [status, setStatus] = useState('idle')

  async function toggle() {
    if (isAuthed === false) {
      nav('/login')
      return
    }
    if (status === 'working') return
    setStatus('working')
    try {
      if (followed) {
        await fetchJson(`/api/me/wishlist/${productId}`, { method: 'DELETE' })
        setFollowed(false)
        onChange?.(false)
      } else {
        await fetchJson('/api/me/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: Number(productId) }),
        })
        setFollowed(true)
        onChange?.(true)
      }
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={status === 'working'} className={className || 'ui-btn h-10 px-4 text-xs font-black'}>
      {followed ? 'ติดตามแล้ว' : 'ติดตาม'}
    </button>
  )
}
```

Create `client/src/components/growth/ReviewSummary.jsx`:

```jsx
export default function ReviewSummary({ summary, compact = false }) {
  const count = Number(summary?.review_count || 0)
  const avg = Number(summary?.average_rating || 0)
  if (count <= 0) return compact ? null : <div className="text-xs font-semibold text-white/40">ยังไม่มีรีวิว</div>
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/20 bg-yellow-400/10 px-3 py-1 text-xs font-black text-yellow-100">
      <span>★ {avg.toFixed(1)}</span>
      <span className="text-yellow-100/60">({count})</span>
    </div>
  )
}
```

- [ ] **Step 2: Wire product detail data**

Modify `client/src/pages/ProductDetail.jsx`:

```jsx
import DiscountBreakdown from '../components/growth/DiscountBreakdown.jsx'
import ReviewSummary from '../components/growth/ReviewSummary.jsx'
import WishlistButton from '../components/growth/WishlistButton.jsx'
```

Add state:

```jsx
const [wishlist, setWishlist] = useState({ followed: false })
const [reviews, setReviews] = useState({ summary: null, items: [] })
const [reviewForm, setReviewForm] = useState({ order_item_id: '', rating: 5, comment: '' })
const [reviewStatus, setReviewStatus] = useState('idle')
```

After product load, fetch reviews and, when signed in, wishlist:

```jsx
const reviewRes = await fetchJson(`/api/products/${id}/reviews`).catch(() => null)
if (!cancelled && reviewRes) setReviews({ summary: reviewRes.summary || null, items: Array.isArray(reviewRes.reviews) ? reviewRes.reviews : [] })
const wishlistRes = await fetchJson('/api/me/wishlist').catch(() => null)
if (!cancelled && wishlistRes?.wishlist?.items) {
  setWishlist({ followed: wishlistRes.wishlist.items.some((item) => Number(item.product_id) === Number(id)) })
}
```

Render near the product title:

```jsx
<div className="mt-3 flex flex-wrap items-center gap-2">
  <ReviewSummary summary={reviews.summary} compact />
  <WishlistButton productId={product.id} initialFollowed={wishlist.followed} isAuthed={isAuthed} onChange={(next) => setWishlist({ followed: next })} />
</div>
```

Render under the quote/price panel:

```jsx
<DiscountBreakdown quote={quote} />
```

- [ ] **Step 3: Add review list and submission panel**

In `ProductDetail.jsx`, render after product details:

```jsx
<section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
  <div className="mb-4 flex items-center justify-between gap-4">
    <div>
      <h2 className="text-lg font-black text-white">รีวิวจากผู้ซื้อจริง</h2>
      <div className="mt-1 text-xs font-semibold text-white/42">แสดงเฉพาะรีวิวที่ผ่านการตรวจสอบ</div>
    </div>
    <ReviewSummary summary={reviews.summary} />
  </div>
  <div className="space-y-3">
    {reviews.items.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.08] p-5 text-center text-sm text-white/45">ยังไม่มีรีวิว</div> : null}
    {reviews.items.map((review) => (
      <div key={review.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
        <div className="text-sm font-black text-yellow-100">★ {Number(review.rating || 0).toFixed(0)}</div>
        <div className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-white/65">{review.comment}</div>
      </div>
    ))}
  </div>
</section>
```

Add the submission handler:

```jsx
async function submitReview(event) {
  event.preventDefault()
  if (!(await ensureAuthed())) {
    nav('/login')
    return
  }
  setReviewStatus('submitting')
  try {
    await fetchJson(`/api/products/${product.id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_item_id: Number(reviewForm.order_item_id),
        rating: Number(reviewForm.rating),
        comment: reviewForm.comment,
      }),
    })
    setReviewStatus('success')
    setReviewForm({ order_item_id: '', rating: 5, comment: '' })
    const reviewRes = await fetchJson(`/api/products/${id}/reviews`).catch(() => null)
    if (reviewRes) setReviews({ summary: reviewRes.summary || null, items: Array.isArray(reviewRes.reviews) ? reviewRes.reviews : [] })
  } catch {
    setReviewStatus('error')
  }
}
```

Render a compact review form only when the user enters an order item ID from purchase history:

```jsx
{isAuthed ? (
  <form onSubmit={submitReview} className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
    <div className="grid gap-3 sm:grid-cols-[140px_120px_minmax(0,1fr)_auto]">
      <input className="ui-field h-11" value={reviewForm.order_item_id} onChange={(event) => setReviewForm((prev) => ({ ...prev, order_item_id: event.target.value }))} aria-label="Order item ID" />
      <select className="ui-field h-11" value={reviewForm.rating} onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}>
        {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} ดาว</option>)}
      </select>
      <input className="ui-field h-11" value={reviewForm.comment} onChange={(event) => setReviewForm((prev) => ({ ...prev, comment: event.target.value }))} aria-label="Review comment" />
      <button className="ui-btn-primary h-11 px-4 text-sm font-black" disabled={reviewStatus === 'submitting'} type="submit">ส่งรีวิว</button>
    </div>
    {reviewStatus === 'success' ? <div className="mt-2 text-xs font-bold text-emerald-300">ส่งรีวิวแล้ว รอตรวจสอบ</div> : null}
    {reviewStatus === 'error' ? <div className="mt-2 text-xs font-bold text-cyan-200">ส่งรีวิวไม่สำเร็จ ตรวจสอบเลข order item</div> : null}
  </form>
) : null}
```

- [ ] **Step 4: Wire bundle discount breakdown**

Modify `client/src/pages/BundleDetail.jsx`:

```jsx
import DiscountBreakdown from '../components/growth/DiscountBreakdown.jsx'
```

Render below the existing coupon status:

```jsx
<DiscountBreakdown quote={quote} />
```

Add API error copy for campaign errors:

```jsx
if (code === 'campaign_expired') return 'ดีลนี้หมดเวลาแล้ว'
if (code === 'campaign_sold_out') return 'ดีลนี้ถูกใช้ครบจำนวนแล้ว'
if (code === 'quote_stale') return 'ราคามีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง'
```

- [ ] **Step 5: Build frontend**

Run:

```powershell
Set-Location client
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 6: Commit customer product UI**

```powershell
git add client/src/components/growth client/src/pages/ProductDetail.jsx client/src/pages/BundleDetail.jsx
git commit -m "feat: add customer growth product UI"
```

---

### Task 8: Profile, Home, And Category Growth Surfaces

**Files:**
- Modify: `client/src/pages/Profile.jsx`
- Modify: `client/src/pages/Home.jsx`
- Modify: `client/src/pages/Category.jsx`

- [ ] **Step 1: Add profile data loads**

Modify the `Promise.all` in `Profile.jsx` to fetch:

```jsx
fetchJson('/api/me/wishlist'),
fetchJson('/api/me/vip'),
fetchJson('/api/me/notification-preferences'),
```

Add state:

```jsx
const [wishlist, setWishlist] = useState([])
const [vip, setVip] = useState(null)
const [notificationPreferences, setNotificationPreferences] = useState(null)
const [preferencesStatus, setPreferencesStatus] = useState('idle')
```

Map responses:

```jsx
setWishlist(Array.isArray(wishlistRes?.wishlist?.items) ? wishlistRes.wishlist.items : [])
setVip(vipRes?.vip || null)
setNotificationPreferences(prefRes?.preferences || null)
```

- [ ] **Step 2: Add profile sections**

Add three sections below the quick action cards:

```jsx
<section id="wishlist" className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
  <SectionTitle title="Wishlist" subtitle="สินค้าที่ติดตามและสถานะล่าสุด" />
  <div className="space-y-2">
    {wishlist.length === 0 ? <div className="rounded-2xl border border-dashed border-white/[0.08] p-5 text-center text-sm text-white/45">ยังไม่ได้ติดตามสินค้า</div> : null}
    {wishlist.map((item) => (
      <Link key={item.product_id} to={`/product/${item.product_id}`} className="block rounded-2xl border border-white/[0.06] bg-white/[0.035] px-4 py-3">
        <div className="text-sm font-black text-white">{item.name}</div>
        <div className="mt-1 text-xs text-white/42">{item.stock_status || 'ติดตามอยู่'}</div>
      </Link>
    ))}
  </div>
</section>

<section id="vip" className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
  <SectionTitle title="VIP" subtitle="ระดับสมาชิกและสิทธิประโยชน์" />
  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4">
    <div className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/70">Current tier</div>
    <div className="mt-2 text-2xl font-black text-white">{vip?.tier?.name || 'ยังไม่มีระดับ'}</div>
    <div className="mt-1 text-xs font-semibold text-white/50">ยอดซื้อสะสม {fmt(vip?.points_spent || 0)} พ้อยท์</div>
  </div>
</section>
```

Add notification preferences form:

```jsx
async function saveNotificationPreferences(nextPreferences) {
  setPreferencesStatus('submitting')
  try {
    const res = await fetchJson('/api/me/notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextPreferences),
    })
    setNotificationPreferences(res.preferences)
    setPreferencesStatus('success')
    setTimeout(() => setPreferencesStatus('idle'), 1200)
  } catch {
    setPreferencesStatus('error')
  }
}
```

Render preference toggles:

```jsx
<section id="notifications" className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
  <SectionTitle title="การแจ้งเตือน" subtitle="เลือกการแจ้งเตือนจาก Wishlist, โปรโมชัน, VIP และรีวิว" />
  <div className="grid gap-3 sm:grid-cols-2">
    {[
      ['wishlist_stock', 'สินค้าใน Wishlist กลับมา'],
      ['wishlist_promo', 'สินค้าใน Wishlist มีโปร'],
      ['campaigns', 'Flash Deal และ Campaign'],
      ['vip', 'อัปเดต VIP'],
      ['reviews', 'อัปเดตรีวิว'],
      ['push_enabled', 'Push notification'],
    ].map(([key, label]) => (
      <label key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-sm font-bold text-white/75">
        <span>{label}</span>
        <input
          type="checkbox"
          checked={notificationPreferences?.[key] !== false}
          onChange={(event) => {
            const next = { ...(notificationPreferences || {}), [key]: event.target.checked }
            setNotificationPreferences(next)
            saveNotificationPreferences(next)
          }}
        />
      </label>
    ))}
  </div>
  {preferencesStatus === 'success' ? <div className="mt-2 text-xs font-bold text-emerald-300">บันทึกการแจ้งเตือนแล้ว</div> : null}
  {preferencesStatus === 'error' ? <div className="mt-2 text-xs font-bold text-cyan-200">บันทึกการแจ้งเตือนไม่สำเร็จ</div> : null}
</section>
```

- [ ] **Step 3: Add Flash Deal shelf to Home and Category**

In both `Home.jsx` and `Category.jsx`, add state:

```jsx
const [growthCampaigns, setGrowthCampaigns] = useState([])
```

Fetch:

```jsx
const campaignRes = await fetchJson('/api/growth-campaigns/active').catch(() => null)
setGrowthCampaigns(Array.isArray(campaignRes?.campaigns) ? campaignRes.campaigns : [])
```

Render shelf:

```jsx
{growthCampaigns.length > 0 ? (
  <section className="rounded-3xl border border-cyan-300/15 bg-cyan-500/10 p-5">
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-black text-white">Flash Deal</h2>
        <div className="mt-1 text-xs font-semibold text-cyan-100/55">ดีลเวลาจำกัดและสินค้าจำนวนจำกัด</div>
      </div>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {growthCampaigns.slice(0, 6).map((campaign) => (
        <Link key={campaign.id} to={campaign.primary_link || '/categories'} className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">{campaign.badge_text || campaign.kind}</div>
          <div className="mt-2 text-base font-black text-white">{campaign.title}</div>
          <div className="mt-1 line-clamp-2 text-xs text-white/50">{campaign.description}</div>
        </Link>
      ))}
    </div>
  </section>
) : null}
```

- [ ] **Step 4: Build frontend**

Run:

```powershell
Set-Location client
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 5: Commit profile and discovery surfaces**

```powershell
git add client/src/pages/Profile.jsx client/src/pages/Home.jsx client/src/pages/Category.jsx
git commit -m "feat: add growth surfaces to profile and discovery"
```

---

### Task 9: Admin Growth Module

**Files:**
- Create: `client/src/pages/AdminV3/modules/GrowthModule.jsx`
- Modify: `client/src/pages/AdminV3/helpers.js`
- Modify: `client/src/pages/AdminV3/loaders.js`
- Modify: `client/src/pages/AdminV3/index.jsx`
- Modify: `server/lib/auth.js`

- [ ] **Step 1: Add RBAC and module metadata**

Modify `server/lib/auth.js`:

```js
export const ADMIN_ROLE_MODULE_ACCESS = {
  owner: ['dashboard', 'users', 'support', 'catalog', 'stock', 'fulfillment', 'orders', 'timesheet', 'automation', 'bundles', 'promotions', 'growth', 'announcements', 'messages', 'logs', 'settings', 'owner'],
  admin: ['dashboard', 'users', 'support', 'catalog', 'stock', 'fulfillment', 'orders', 'timesheet', 'automation', 'bundles', 'promotions', 'growth', 'announcements', 'messages', 'settings'],
  finance: ['dashboard', 'users', 'orders', 'bundles', 'promotions'],
  support: ['dashboard', 'support', 'timesheet', 'orders'],
  booster: ['dashboard', 'fulfillment', 'timesheet'],
}
```

Add:

```js
'growth.manage': ['admin', 'owner'],
```

Modify `client/src/pages/AdminV3/helpers.js` by adding module metadata:

```js
{ id: 'growth', label: 'Growth', icon: 'bi-graph-up-arrow', section: 'business' },
```

Add `growth` to owner/admin local module access and add:

```js
'growth.manage': ['admin', 'owner'],
```

- [ ] **Step 2: Add Growth loader**

Modify `client/src/pages/AdminV3/loaders.js`:

```js
export async function loadGrowthModule() {
  const [campaignsRes, reviewsRes, tiersRes, signalsRes, notificationsRes] = await Promise.all([
    fetchJson('/api/admin/growth-campaigns'),
    fetchJson('/api/admin/reviews?limit=100'),
    fetchJson('/api/admin/vip-tiers'),
    fetchJson('/api/admin/wishlist-signals?limit=50'),
    fetchJson('/api/admin/growth-notifications?limit=100'),
  ])
  return {
    campaigns: Array.isArray(campaignsRes?.campaigns) ? campaignsRes.campaigns : [],
    reviews: Array.isArray(reviewsRes?.reviews) ? reviewsRes.reviews : [],
    tiers: Array.isArray(tiersRes?.tiers) ? tiersRes.tiers : [],
    signals: Array.isArray(signalsRes?.signals) ? signalsRes.signals : [],
    notifications: Array.isArray(notificationsRes?.events) ? notificationsRes.events : [],
  }
}
```

- [ ] **Step 3: Create Growth module component**

Create `client/src/pages/AdminV3/modules/GrowthModule.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { formatNumber } from '../helpers.js'

const TABS = [
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'vip', label: 'VIP' },
  { id: 'signals', label: 'Wishlist Signals' },
  { id: 'discounts', label: 'Discounts' },
  { id: 'notifications', label: 'Notifications' },
]

export default function GrowthModule({ data, ctx }) {
  const { canAction, fetchJson, loadModuleData } = ctx
  const [tab, setTab] = useState('campaigns')
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const canManage = canAction('growth.manage')

  const counts = useMemo(() => ({
    campaigns: data.campaigns?.length || 0,
    reviews: data.reviews?.length || 0,
    vip: data.tiers?.length || 0,
    signals: data.signals?.length || 0,
    notifications: data.notifications?.length || 0,
  }), [data])

  async function sendTestNotification() {
    setStatus({ type: 'working', message: 'Sending test notification...' })
    try {
      await fetchJson('/api/admin/growth-notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'campaign_started' }),
      })
      setStatus({ type: 'success', message: 'Test notification sent to your inbox.' })
      await loadModuleData('growth')
    } catch {
      setStatus({ type: 'error', message: 'Test notification failed.' })
    }
  }

  return (
    <div className="admin-module admin-growth-module">
      <div className="content-header">
        <div className="container-fluid">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <h1 className="m-0 fw-bold">Growth</h1>
              <div className="text-muted small">Wishlist, reviews, campaigns, VIP, discounts, and notifications</div>
            </div>
            <button className="btn btn-outline-primary btn-sm" type="button" disabled={!canManage} onClick={sendTestNotification}>
              <i className="bi bi-send me-1" /> Send test notification
            </button>
          </div>
        </div>
      </div>

      <div className="content px-3 pb-4">
        {status.type !== 'idle' ? <div className={`alert alert-${status.type === 'error' ? 'danger' : status.type === 'success' ? 'success' : 'info'}`}>{status.message}</div> : null}
        <div className="card mb-3">
          <div className="card-body py-2">
            <div className="d-flex flex-wrap gap-2">
              {TABS.map((item) => (
                <button key={item.id} type="button" className={`btn btn-sm ${tab === item.id ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setTab(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab === 'campaigns' ? <SimpleTable title="Campaigns" rows={data.campaigns} columns={['id', 'kind', 'title', 'is_active']} /> : null}
        {tab === 'reviews' ? <SimpleTable title="Reviews" rows={data.reviews} columns={['id', 'product_name', 'rating', 'status']} /> : null}
        {tab === 'vip' ? <SimpleTable title="VIP Tiers" rows={data.tiers} columns={['id', 'code', 'name', 'threshold_points_spent', 'discount_percent']} /> : null}
        {tab === 'signals' ? <SimpleTable title="Wishlist Signals" rows={data.signals} columns={['product_id', 'product_name', 'followers', 'available_stock']} /> : null}
        {tab === 'discounts' ? <DiscountPreview fetchJson={fetchJson} canManage={canManage} /> : null}
        {tab === 'notifications' ? <SimpleTable title="Notifications" rows={data.notifications} columns={['id', 'event_type', 'status', 'created_at']} /> : null}

        <div className="row g-3 mt-1">
          {Object.entries(counts).map(([key, value]) => (
            <div className="col-6 col-lg-2" key={key}>
              <div className="card"><div className="card-body py-3"><div className="small text-muted">{key}</div><div className="h4 mb-0 fw-bold">{formatNumber(value)}</div></div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SimpleTable({ title, rows = [], columns = [] }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">{title}</h3></div>
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0">
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={columns.length} className="text-muted text-center py-4">No data</td></tr> : null}
            {rows.map((row, index) => (
              <tr key={row.id || index}>{columns.map((column) => <td key={column}>{String(row?.[column] ?? '-')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DiscountPreview({ fetchJson, canManage }) {
  const [form, setForm] = useState({ target_type: 'product', target_id: '', qty: 1, coupon_code: '' })
  const [quote, setQuote] = useState(null)
  async function preview() {
    const res = await fetchJson('/api/admin/discount-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, target_id: Number(form.target_id), qty: Number(form.qty) }),
    })
    setQuote(res.quote)
  }
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Discount Preview</h3></div>
      <div className="card-body">
        <div className="row g-2">
          <div className="col-md-3"><select className="form-select" value={form.target_type} onChange={(event) => setForm((prev) => ({ ...prev, target_type: event.target.value }))}><option value="product">Product</option><option value="bundle">Bundle</option></select></div>
          <div className="col-md-3"><input className="form-control" aria-label="Target ID" value={form.target_id} onChange={(event) => setForm((prev) => ({ ...prev, target_id: event.target.value }))} /></div>
          <div className="col-md-2"><input className="form-control" type="number" min="1" value={form.qty} onChange={(event) => setForm((prev) => ({ ...prev, qty: event.target.value }))} /></div>
          <div className="col-md-3"><input className="form-control" aria-label="Coupon" value={form.coupon_code} onChange={(event) => setForm((prev) => ({ ...prev, coupon_code: event.target.value }))} /></div>
          <div className="col-md-1"><button className="btn btn-primary w-100" type="button" disabled={!canManage} onClick={preview}>Run</button></div>
        </div>
        {quote ? <pre className="mt-3 rounded bg-dark p-3 text-light small">{JSON.stringify(quote, null, 2)}</pre> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add admin mutation controls to GrowthModule**

Inside `GrowthModule`, add handlers for campaign enable toggle, review moderation, and VIP tier quick create:

```jsx
async function setReviewStatus(reviewId, nextStatus) {
  setStatus({ type: 'working', message: 'Updating review...' })
  try {
    await fetchJson(`/api/admin/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    setStatus({ type: 'success', message: 'Review updated.' })
    await loadModuleData('growth')
  } catch {
    setStatus({ type: 'error', message: 'Review update failed.' })
  }
}

async function toggleCampaign(campaign) {
  setStatus({ type: 'working', message: 'Updating campaign...' })
  try {
    await fetchJson(`/api/admin/growth-campaigns/${campaign.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...campaign, is_active: !campaign.is_active, targets: campaign.targets || [] }),
    })
    setStatus({ type: 'success', message: 'Campaign updated.' })
    await loadModuleData('growth')
  } catch {
    setStatus({ type: 'error', message: 'Campaign update failed.' })
  }
}

async function createStarterVipTier() {
  setStatus({ type: 'working', message: 'Creating VIP tier...' })
  try {
    await fetchJson('/api/admin/vip-tiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `tier-${Date.now()}`,
        name: 'New VIP Tier',
        threshold_points_spent: 0,
        discount_percent: 0,
        priority_support: false,
        early_access_minutes: 0,
        badge_label: 'VIP',
        is_active: true,
      }),
    })
    setStatus({ type: 'success', message: 'VIP tier created.' })
    await loadModuleData('growth')
  } catch {
    setStatus({ type: 'error', message: 'VIP tier create failed.' })
  }
}
```

Add action buttons to the matching tab renders:

```jsx
{tab === 'reviews' ? (
  <div className="card">
    <div className="card-header"><h3 className="card-title">Reviews</h3></div>
    <div className="table-responsive">
      <table className="table table-sm mb-0">
        <tbody>
          {(data.reviews || []).map((review) => (
            <tr key={review.id}>
              <td>{review.product_name || review.product_id}</td>
              <td>{review.rating}</td>
              <td>{review.status}</td>
              <td className="text-end">
                <button className="btn btn-success btn-sm me-1" disabled={!canManage} onClick={() => setReviewStatus(review.id, 'approved')}>Approve</button>
                <button className="btn btn-outline-secondary btn-sm me-1" disabled={!canManage} onClick={() => setReviewStatus(review.id, 'hidden')}>Hide</button>
                <button className="btn btn-outline-danger btn-sm" disabled={!canManage} onClick={() => setReviewStatus(review.id, 'rejected')}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
) : null}
```

For `Campaigns`, use this render so each row can enable or disable the campaign:

```jsx
{tab === 'campaigns' ? (
  <div className="card">
    <div className="card-header"><h3 className="card-title">Campaigns</h3></div>
    <div className="table-responsive">
      <table className="table table-sm mb-0">
        <tbody>
          {(data.campaigns || []).map((campaign) => (
            <tr key={campaign.id}>
              <td>{campaign.kind}</td>
              <td>{campaign.title}</td>
              <td>{campaign.is_active ? 'active' : 'off'}</td>
              <td className="text-end">
                <button className="btn btn-outline-primary btn-sm" disabled={!canManage} onClick={() => toggleCampaign(campaign)}>
                  {campaign.is_active ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
) : null}
```

For `VIP`, use this render so admin can create a starter tier and inspect existing tiers:

```jsx
{tab === 'vip' ? (
  <div className="card">
    <div className="card-header d-flex align-items-center justify-content-between">
      <h3 className="card-title mb-0">VIP Tiers</h3>
      <button className="btn btn-primary btn-sm" type="button" disabled={!canManage} onClick={createStarterVipTier}>Create starter tier</button>
    </div>
    <div className="table-responsive">
      <table className="table table-sm mb-0">
        <thead><tr><th>Code</th><th>Name</th><th>Threshold</th><th>Discount</th><th>Status</th></tr></thead>
        <tbody>
          {(data.tiers || []).map((tier) => (
            <tr key={tier.id}>
              <td>{tier.code}</td>
              <td>{tier.name}</td>
              <td>{formatNumber(tier.threshold_points_spent)}</td>
              <td>{formatNumber(tier.discount_percent)}%</td>
              <td>{tier.is_active ? 'active' : 'off'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
) : null}
```

- [ ] **Step 5: Wire AdminV3**

Modify imports in `client/src/pages/AdminV3/index.jsx`:

```jsx
import GrowthModule from './modules/GrowthModule.jsx'
```

Add loader import:

```jsx
loadOrdersModule, loadBundlesModule, loadGrowthModule,
```

In `loadModuleData`, add:

```jsx
else if (current === 'growth') data = await loadGrowthModule()
```

In `renderModule`, add:

```jsx
case 'growth': return <GrowthModule data={data} ctx={ctx} />
```

- [ ] **Step 6: Run backend auth route test and frontend build**

Run:

```powershell
Set-Location server
npm test -- tests/security/admin-routes.test.js
Set-Location ..\client
npm run build
```

Expected: backend security test passes and Vite build succeeds.

- [ ] **Step 7: Commit Admin Growth module**

```powershell
git add server/lib/auth.js client/src/pages/AdminV3/helpers.js client/src/pages/AdminV3/loaders.js client/src/pages/AdminV3/index.jsx client/src/pages/AdminV3/modules/GrowthModule.jsx
git commit -m "feat: add admin growth module"
```

---

### Task 10: Final Verification

**Files:**
- Verify only; commit fixes if any verification failure requires code changes.

- [ ] **Step 1: Run backend tests**

Run:

```powershell
Set-Location server
npm test
```

Expected: all Node tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
Set-Location client
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Start local app**

Run:

```powershell
Set-Location C:\Users\Administrator\.codex\worktrees\deb7\splitwise
.\start-dev.ps1
```

Expected: server starts on `http://localhost:3001` and client starts on `http://localhost:5173`, or the script reports the active ports.

- [ ] **Step 4: Browser verification**

Verify these routes:

- `/product/<existing-product-id>`: wishlist button appears, review summary loads, discount breakdown appears when quote has discounts.
- `/bundle/<existing-bundle-id>`: discount breakdown appears when quote has discounts.
- `/profile#wishlist`: Wishlist and VIP surfaces render for signed-in users.
- `/`: Flash Deal shelf renders when active campaigns exist and stays hidden when none exist.
- `/category/<existing-category-slug>`: Flash Deal shelf renders without breaking product grid.
- `/admin-v3?module=growth`: Growth module loads for admin/owner and is hidden or forbidden for roles without access.

- [ ] **Step 5: Commit verification fixes**

If any verification changes were needed:

```powershell
git add <changed-files>
git commit -m "fix: stabilize growth foundation verification"
```

If no code changes were needed, do not create an empty commit.
