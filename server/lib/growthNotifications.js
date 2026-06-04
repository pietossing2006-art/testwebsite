const EVENT_PREF_KEY = {
  wishlist_stock_back: 'wishlist_stock',
  wishlist_promo_started: 'wishlist_promo',
  campaign_started: 'campaigns',
  campaign_ending: 'campaigns',
  vip_tier_changed: 'vip',
  review_moderated: 'reviews',
}

export function normalizeNotificationPreferences(input) {
  const preferences = input && typeof input === 'object' ? input : {}
  return {
    wishlist_stock: preferences.wishlist_stock !== false,
    wishlist_promo: preferences.wishlist_promo !== false,
    campaigns: preferences.campaigns !== false,
    vip: preferences.vip !== false,
    reviews: preferences.reviews !== false,
    push_enabled: preferences.push_enabled === true,
  }
}

function cleanPart(value) {
  if (value == null) return ''
  return String(value).trim().replace(/[\s:]+/g, '_')
}

function positiveIntegerId(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return /^[1-9]\d*$/.test(trimmed) ? trimmed : null
  }

  return null
}

function textOr(value, fallback) {
  const text = String(value ?? '').trim()
  return text || fallback
}

function productLink(payload) {
  const productId = positiveIntegerId(payload.product_id)
  return productId == null ? '/profile#wishlist' : `/product/${productId}`
}

function campaignLink(payload) {
  const campaignId = positiveIntegerId(payload.campaign_id)
  return campaignId == null ? '/' : `/?campaign=${campaignId}`
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
  const normalized = normalizeNotificationPreferences(preferences)
  const prefKey = EVENT_PREF_KEY[eventType]
  if (prefKey && normalized[prefKey] === false) return []

  const channels = ['inbox']
  if (normalized.push_enabled && hasPushSubscription) channels.push('push')
  return channels
}

export function renderGrowthNotification({ eventType, payload } = {}) {
  const data = payload && typeof payload === 'object' ? payload : {}
  const productName = textOr(data.product_name, 'สินค้าใน Wishlist')
  const campaignName = textOr(data.campaign_name, 'แคมเปญใหม่')
  const vipTier = textOr(data.vip_tier, 'VIP')

  if (eventType === 'wishlist_stock_back') {
    return {
      title: 'สินค้าใน Wishlist กลับมาแล้ว',
      body: `${productName} กลับมาเติมสินค้าแล้ว เปิดดูใน Wishlist ก่อนสินค้าหมดอีกครั้ง`,
      push_body: `${productName} กลับมาแล้ว`,
      link: productLink(data),
    }
  }

  if (eventType === 'wishlist_promo_started') {
    return {
      title: 'สินค้าใน Wishlist มีโปรโมชัน',
      body: `${productName} ใน Wishlist ของคุณมีโปรโมชันใหม่ ตรวจสอบข้อเสนอก่อนหมดเวลา`,
      push_body: `${productName} มีโปรโมชันใหม่`,
      link: productLink(data),
    }
  }

  if (eventType === 'campaign_started') {
    return {
      title: `Flash Deal ${campaignName} เริ่มแล้ว`,
      body: `${campaignName} เริ่มแล้ว เข้าดูดีลพิเศษที่คัดมาให้คุณ`,
      push_body: `${campaignName} เริ่มแล้ว`,
      link: campaignLink(data),
    }
  }

  if (eventType === 'campaign_ending') {
    return {
      title: `Flash Deal ${campaignName} ใกล้หมดเวลา`,
      body: `${campaignName} ใกล้หมดเวลาแล้ว กลับไปดูดีลที่คุณสนใจก่อนสิ้นสุดแคมเปญ`,
      push_body: `${campaignName} ใกล้หมดเวลา`,
      link: campaignLink(data),
    }
  }

  if (eventType === 'vip_tier_changed') {
    return {
      title: 'สถานะ VIP ของคุณอัปเดตแล้ว',
      body: `สถานะของคุณเปลี่ยนเป็น ${vipTier} ตรวจสอบสิทธิประโยชน์ล่าสุดได้ในโปรไฟล์`,
      push_body: `สถานะ VIP: ${vipTier}`,
      link: '/profile#vip',
    }
  }

  if (eventType === 'review_moderated') {
    const reviewId = positiveIntegerId(data.review_id)
    return {
      title: 'รีวิวของคุณได้รับการตรวจสอบแล้ว',
      body: 'รีวิวของคุณได้รับการตรวจสอบแล้ว เปิดดูสถานะและรายละเอียดได้ในโปรไฟล์',
      push_body: 'รีวิวของคุณอัปเดตแล้ว',
      link: reviewId == null ? '/profile#reviews' : `/profile#review-${reviewId}`,
    }
  }

  return {
    title: 'มีการแจ้งเตือนใหม่',
    body: 'เปิดกล่องข้อความเพื่อดูรายละเอียดล่าสุด',
    push_body: 'มีการแจ้งเตือนใหม่',
    link: '/inbox',
  }
}
