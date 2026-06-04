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
  assert.equal(rendered.title, 'เธชเธดเธเธเนเธฒเนเธ Wishlist เธเธฅเธฑเธเธกเธฒเนเธฅเนเธง')
  assert.match(rendered.body, /Nitro Pack/)
  assert.equal(rendered.link, '/product/77')
  assert.ok(rendered.push_body.length <= rendered.body.length)
})
