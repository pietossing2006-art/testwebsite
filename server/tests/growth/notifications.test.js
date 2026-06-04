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
    'wishlist_stock_back:product:42:stock_7',
  )
})

test('buildGrowthEventKey cleans whitespace and colon characters in every part', () => {
  assert.equal(
    buildGrowthEventKey({
      eventType: ' wishlist stock:back ',
      targetType: ' product:item ',
      targetId: ' sku: 42 ',
      version: ' batch : 9 ',
    }),
    'wishlist_stock_back:product_item:sku_42:batch_9',
  )
})

test('buildGrowthEventKey rejects incomplete required identity parts', () => {
  const incompleteKeys = [
    { eventType: 'campaign_started', targetType: 'campaign' },
    { targetType: 'product', targetId: 42, version: 'stock' },
    { eventType: 'campaign_started', targetId: 42, version: 'stock' },
    { eventType: 'campaign_started', targetType: 'product', version: 'stock' },
  ]

  for (const input of incompleteKeys) {
    assert.throws(() => buildGrowthEventKey(input), /invalid_event_key/)
  }
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

test('filterGrowthNotificationChannels respects opt-outs for each mapped event category', () => {
  const cases = [
    ['wishlist_stock_back', { wishlist_stock: false }],
    ['wishlist_promo_started', { wishlist_promo: false }],
    ['campaign_started', { campaigns: false }],
    ['campaign_ending', { campaigns: false }],
    ['vip_tier_changed', { vip: false }],
    ['review_moderated', { reviews: false }],
  ]

  for (const [eventType, preferences] of cases) {
    assert.deepEqual(
      filterGrowthNotificationChannels({ eventType, preferences, hasPushSubscription: true }),
      [],
      eventType,
    )
  }
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

test('filterGrowthNotificationChannels gates push on subscription', () => {
  assert.deepEqual(
    filterGrowthNotificationChannels({
      eventType: 'campaign_started',
      preferences: { campaigns: true, push_enabled: true },
      hasPushSubscription: false,
    }),
    ['inbox'],
  )
})

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

test('filterGrowthNotificationChannels keeps inbox baseline for unknown events', () => {
  assert.deepEqual(
    filterGrowthNotificationChannels({
      eventType: 'new_growth_event',
      preferences: { push_enabled: false },
      hasPushSubscription: true,
    }),
    ['inbox'],
  )
  assert.deepEqual(
    filterGrowthNotificationChannels({
      eventType: 'new_growth_event',
      preferences: { push_enabled: true },
      hasPushSubscription: true,
    }),
    ['inbox', 'push'],
  )
})

test('renderGrowthNotification returns readable inbox and push copy for wishlist stock events', () => {
  const rendered = renderGrowthNotification({
    eventType: 'wishlist_stock_back',
    payload: { product_name: 'Nitro Pack', product_id: 77 },
  })

  assert.equal(rendered.title, 'สินค้าใน Wishlist กลับมาแล้ว')
  assert.match(rendered.body, /Nitro Pack/)
  assert.equal(rendered.link, '/product/77')
  assert.ok(rendered.push_body.length <= rendered.body.length)
})

test('renderGrowthNotification builds links for all known events', () => {
  const cases = [
    ['wishlist_stock_back', { product_id: 77 }, '/product/77'],
    ['wishlist_promo_started', { product_id: 78 }, '/product/78'],
    ['campaign_started', { campaign_id: 9 }, '/?campaign=9'],
    ['campaign_ending', { campaign_id: 10 }, '/?campaign=10'],
    ['vip_tier_changed', {}, '/profile#vip'],
    ['review_moderated', { review_id: 11 }, '/profile#review-11'],
  ]

  for (const [eventType, payload, link] of cases) {
    assert.equal(renderGrowthNotification({ eventType, payload }).link, link, eventType)
  }
})

test('renderGrowthNotification falls back for invalid IDs', () => {
  const invalidIds = ['', '   ', 0, -2, 1.5, Number.NaN, true, false, {}, [], null, undefined]

  for (const product_id of invalidIds) {
    assert.equal(
      renderGrowthNotification({ eventType: 'wishlist_stock_back', payload: { product_id } }).link,
      '/profile#wishlist',
      `wishlist_stock_back ${String(product_id)}`,
    )
    assert.equal(
      renderGrowthNotification({ eventType: 'wishlist_promo_started', payload: { product_id } }).link,
      '/profile#wishlist',
      `wishlist_promo_started ${String(product_id)}`,
    )
  }

  for (const campaign_id of invalidIds) {
    assert.equal(
      renderGrowthNotification({ eventType: 'campaign_started', payload: { campaign_id } }).link,
      '/',
      `campaign_started ${String(campaign_id)}`,
    )
    assert.equal(
      renderGrowthNotification({ eventType: 'campaign_ending', payload: { campaign_id } }).link,
      '/',
      `campaign_ending ${String(campaign_id)}`,
    )
  }

  for (const review_id of invalidIds) {
    assert.equal(
      renderGrowthNotification({ eventType: 'review_moderated', payload: { review_id } }).link,
      '/profile#reviews',
      `review_moderated ${String(review_id)}`,
    )
  }
})

test('renderGrowthNotification returns inbox fallback for unknown events', () => {
  const rendered = renderGrowthNotification({ eventType: 'new_growth_event' })
  assert.equal(rendered.link, '/inbox')
  assert.ok(rendered.title.length > 0)
  assert.ok(rendered.body.length > 0)
  assert.ok(rendered.push_body.length > 0)
})
