import crypto from 'node:crypto'

// Slips uploaded by customers are untrusted images: anyone can render a picture that contains
// the right number, or reuse a real slip from a transfer that went somewhere else entirely.
// A slip may only credit points once an external verifier confirms, against the bank, that the
// transaction exists, carries the expected amount, and landed on OUR receiving account.

const DEFAULT_TIMEOUT_MS = 12_000

function envValue(name) {
  const value = String(process.env[name] || '').trim()
  if (/^optional_/i.test(value)) return ''
  return value
}

export function slipVerifyProvider() {
  const explicit = envValue('SLIP_VERIFY_PROVIDER').toLowerCase()
  if (explicit) return explicit
  if (envValue('SLIPOK_API_KEY')) return 'slipok'
  if (envValue('SLIP_VERIFY_URL')) return 'custom'
  return ''
}

export function isSlipAutoVerifyConfigured() {
  const provider = slipVerifyProvider()
  if (provider === 'slipok') return Boolean(envValue('SLIPOK_API_KEY') && envValue('SLIPOK_BRANCH_ID'))
  if (provider === 'custom') return Boolean(envValue('SLIP_VERIFY_URL'))
  return false
}

// Banks mask accounts in the middle as well as the ends ("xxx-x-x3109-x" hides the final digit),
// so the visible digits cannot simply be compared as a suffix. When the mask has the same length
// as our account number, compare position by position; otherwise fall back to locating the
// visible run inside it.
function maskAligns(expectedDigits, rawCandidate) {
  const visible = String(rawCandidate || '')
    .toLowerCase()
    .replace(/[*•·_]/g, 'x')
    .replace(/[^0-9x]/g, '')
  if (!/\d/.test(visible)) return false

  if (visible.length === expectedDigits.length) {
    for (let i = 0; i < visible.length; i += 1) {
      if (visible[i] === 'x') continue
      if (visible[i] !== expectedDigits[i]) return false
    }
    return true
  }

  const digits = visible.replace(/\D/g, '')
  if (digits.length < 4) return false
  if (digits.length === expectedDigits.length) return digits === expectedDigits
  return expectedDigits.includes(digits)
}

export function receiverMatches(expected, candidates = []) {
  const expectedDigits = String(expected || '').replace(/\D/g, '')
  if (expectedDigits.length < 4) return false

  for (const candidate of candidates) {
    if (maskAligns(expectedDigits, candidate)) return true
  }
  return false
}

export function amountsMatch(expected, actual) {
  const a = Number(expected)
  const b = Number(actual)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.round(a * 100) === Math.round(b * 100)
}

const RECEIVER_KEY_RE = /^(receiver|receiving|recipient|destination|dest|credit|to)(_?(account|party|info|detail)s?)?$/i

// Only pulls account identifiers out of the RECEIVER side of the response. Walking the whole
// payload would also collect the sender's account, and then a slip for money leaving the shop
// (a refund, say) would satisfy the receiver check.
function collectReceiverCandidates(payload) {
  const out = []

  const collectIdentifiers = (node, depth = 0) => {
    if (!node || depth > 5) return
    if (Array.isArray(node)) {
      for (const item of node) collectIdentifiers(item, depth + 1)
      return
    }
    if (typeof node === 'string' || typeof node === 'number') {
      out.push(String(node))
      return
    }
    if (typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') {
        collectIdentifiers(value, depth + 1)
        continue
      }
      if (typeof value !== 'string' && typeof value !== 'number') continue
      if (/^(account|proxy|value|no|number|id)$/i.test(key)) out.push(String(value))
    }
  }

  const findReceiverNodes = (node, depth = 0) => {
    if (!node || depth > 5) return
    if (Array.isArray(node)) {
      for (const item of node) findReceiverNodes(item, depth + 1)
      return
    }
    if (typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (RECEIVER_KEY_RE.test(key)) {
        collectIdentifiers(value, depth + 1)
        continue
      }
      // Flat shapes such as { receiverAccount: "xxx-1234" } or { to_account_no: "..." }.
      if ((typeof value === 'string' || typeof value === 'number')
        && /(receiv|recipient|destination|credit)\w*(account|proxy|no|number|id|value)/i.test(key)) {
        out.push(String(value))
        continue
      }
      if (value && typeof value === 'object') findReceiverNodes(value, depth + 1)
    }
  }

  findReceiverNodes(payload)
  return out
}

// Normalizes a provider response into { ok, transRef, amount, receivers, raw }.
export function normalizeSlipVerifyResponse(payload) {
  const data = payload && typeof payload === 'object' ? (payload.data ?? payload) : {}
  const success = payload?.success === true || payload?.ok === true || payload?.status === 'success' || data?.success === true
  const transRef = String(data?.transRef ?? data?.transactionRef ?? data?.transactionId ?? data?.ref ?? '').trim()
  const amountRaw = data?.amount ?? data?.paidAmount ?? data?.transactionAmount ?? data?.totalAmount
  const amount = Number(typeof amountRaw === 'object' ? amountRaw?.amount : amountRaw)

  return {
    ok: Boolean(success) && Boolean(transRef),
    transRef,
    amount: Number.isFinite(amount) ? amount : null,
    receivers: collectReceiverCandidates(data),
    raw: payload,
  }
}

async function postJson(url, { headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, ok: res.ok, json, text }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Asks the configured provider whether this slip is a real, unused transfer into our account.
 * Throws 'slip_verify_unavailable' when the provider cannot be reached so the caller can fall
 * back to manual review instead of guessing.
 */
export async function verifySlipWithProvider({ qrPayload, expectedAmount }) {
  const provider = slipVerifyProvider()
  const payloadText = String(qrPayload || '').trim()
  if (!payloadText) throw new Error('slip_qr_not_found')

  let response = null
  if (provider === 'slipok') {
    const branch = envValue('SLIPOK_BRANCH_ID')
    const url = envValue('SLIPOK_API_URL') || `https://api.slipok.com/api/line/apikey/${encodeURIComponent(branch)}`
    response = await postJson(url, {
      headers: { 'x-authorization': envValue('SLIPOK_API_KEY') },
      body: { data: payloadText, amount: Number(expectedAmount) || undefined, log: true },
    })
  } else if (provider === 'custom') {
    const headers = {}
    const token = envValue('SLIP_VERIFY_TOKEN')
    if (token) headers.Authorization = `Bearer ${token}`
    response = await postJson(envValue('SLIP_VERIFY_URL'), {
      headers,
      body: { qr_payload: payloadText, expected_amount: Number(expectedAmount) || null },
    })
  } else {
    throw new Error('slip_verify_not_configured')
  }

  if (!response?.json) {
    console.warn('[Slip verify] provider returned no JSON', { provider, status: response?.status })
    throw new Error('slip_verify_unavailable')
  }

  const normalized = normalizeSlipVerifyResponse(response.json)
  if (!response.ok || !normalized.ok) {
    console.warn('[Slip verify] rejected', {
      provider,
      status: response.status,
      code: response.json?.code ?? response.json?.error ?? null,
    })
    throw new Error('slip_not_verified')
  }

  if (!amountsMatch(expectedAmount, normalized.amount)) throw new Error('slip_amount_mismatch')

  const expectedReceiver = envValue('SLIP_VERIFY_RECEIVER')
    || envValue('PROMPTPAY_ID')
    || envValue('PROMPTPAY_PHONE')
    || envValue('PROMPTPAY_TARGET')
  if (expectedReceiver && !receiverMatches(expectedReceiver, normalized.receivers)) {
    console.warn('[Slip verify] receiver mismatch', { provider, receivers: normalized.receivers })
    throw new Error('slip_receiver_mismatch')
  }

  return {
    transactionRef: normalized.transRef || `verified_${crypto.createHash('sha256').update(payloadText).digest('hex').slice(0, 48)}`,
    amount: normalized.amount,
    provider,
  }
}
