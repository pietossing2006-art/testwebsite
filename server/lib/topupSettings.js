export const DEFAULT_TOPUP_SETTINGS = {
  angpao: true,
  coupon: true,
  promptpay: true,
}

export const TOPUP_METHOD_KEYS = ['angpao', 'coupon', 'promptpay']

export function normalizeTopupSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    angpao: source.angpao !== false,
    coupon: source.coupon !== false,
    promptpay: source.promptpay !== false,
  }
}

export function normalizeTopupMethod(method) {
  const value = String(method || '').trim().toLowerCase()
  if (value === 'truemoney') return 'angpao'
  return TOPUP_METHOD_KEYS.includes(value) ? value : null
}

export function isTopupMethodEnabled(settings, method) {
  const key = normalizeTopupMethod(method)
  if (!key) return false
  const normalized = normalizeTopupSettings(settings)
  return normalized[key] === true
}

export function assertTopupMethodEnabled(settings, method) {
  if (!isTopupMethodEnabled(settings, method)) {
    throw new Error('topup_method_disabled')
  }
}

export async function getTopupSettings() {
  const { getUiSettings } = await import('../db.js')
  const settings = await getUiSettings()
  return normalizeTopupSettings(settings?.topup_settings)
}

export async function assertTopupMethodEnabledForRequest(method) {
  const settings = await getTopupSettings()
  assertTopupMethodEnabled(settings, method)
}

export function topupMethodDisabledMessage(method) {
  const key = normalizeTopupMethod(method)
  if (key === 'promptpay') {
    return 'ช่องทาง PromptPay ถูกปิดชั่วคราว / PromptPay top-up is currently disabled.'
  }
  if (key === 'angpao') {
    return 'ช่องทางซองอั่งเปา ถูกปิดชั่วคราว / TrueMoney Angpao top-up is currently disabled.'
  }
  if (key === 'coupon') {
    return 'ช่องทางคูปองถูกปิดชั่วคราว / Coupon top-up is currently disabled.'
  }
  return 'ช่องทางเติมเงินนี้ถูกปิดชั่วคราว / This top-up method is currently disabled.'
}
