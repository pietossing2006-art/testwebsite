export const DEFAULT_TOPUP_SETTINGS = {
  angpao: true,
  coupon: true,
  promptpay: true,
  truemoney_phone: '',
  promptpay_target: '',
  promptpay_name: '',
}

export const TOPUP_METHOD_KEYS = ['angpao', 'coupon', 'promptpay']

export function normalizeTopupSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    angpao: source.angpao !== false,
    coupon: source.coupon !== false,
    promptpay: source.promptpay !== false,
    truemoney_phone: source.truemoney_phone ? String(source.truemoney_phone).replace(/[\s-]/g, '').trim() : '',
    promptpay_target: source.promptpay_target ? String(source.promptpay_target).replace(/[\s-]/g, '').trim() : '',
    promptpay_name: source.promptpay_name ? String(source.promptpay_name).trim().slice(0, 100) : '',
  }
}

export function toPublicTopupSettings(settings) {
  const normalized = normalizeTopupSettings(settings)
  return {
    angpao: normalized.angpao,
    coupon: normalized.coupon,
    promptpay: normalized.promptpay,
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
  try {
    const { getUiSettings } = await import('../db.js')
    const settings = await getUiSettings()
    return normalizeTopupSettings(settings?.topup_settings)
  } catch {
    return normalizeTopupSettings(null)
  }
}

export async function getEffectiveTopupConfig() {
  const settings = await getTopupSettings()
  const truemoneyPhone = settings.truemoney_phone || (typeof process.env.TW_VOUCHER_PHONE === 'string' ? process.env.TW_VOUCHER_PHONE.trim() : '')
  const promptpayTarget = settings.promptpay_target || String(process.env.PROMPTPAY_ID || process.env.PROMPTPAY_PHONE || process.env.PROMPTPAY_TARGET || process.env.TW_VOUCHER_PHONE || '').replace(/[\s-]/g, '').trim()
  const promptpayName = settings.promptpay_name || process.env.PROMPTPAY_NAME || process.env.PROMPTPAY_ACCOUNT_NAME || 'พร้อมเพย์ (PromptPay)'
  return {
    settings,
    truemoneyPhone,
    promptpayTarget,
    promptpayName,
  }
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
