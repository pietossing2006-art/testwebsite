export const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  FINANCE: 'finance',
  BOOSTER: 'booster',
  SUPPORT: 'support',
  USER: 'user',
})

export const ALLOWED_ROLES = Object.freeze([
  ROLES.OWNER,
  ROLES.ADMIN,
  ROLES.FINANCE,
  ROLES.BOOSTER,
  ROLES.SUPPORT,
  ROLES.USER,
])

export const SUPPORT_STATUSES = Object.freeze({
  OPEN: 'open',
  PENDING: 'pending',
  CLOSED: 'closed',
})

export const TOPUP_STATUSES = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
})

export const STOCK_POOL_KINDS = Object.freeze({
  QUANTITY: 'quantity',
  DIGITAL_CODE: 'digital_code',
})

export const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 200,
  DEFAULT_OFFSET: 0,
})
