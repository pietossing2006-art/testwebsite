import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jsQR from 'jsqr'
import generatePromptpayPayload from 'promptpay-qr'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'
import {
  cancelPendingTopupsByMethod,
  attachTopupSlipEvidence,
  createTopup,
  creditPointsForTopup,
  getTopupById,
  getTopupByProviderRef,
  listMyTopups,
  updateTopupProviderRef,
  updateTopupStatus,
} from '../db.js'
import { assertTopupMethodEnabledForRequest, getEffectiveTopupConfig } from './topupSettings.js'
import { isSlipAutoVerifyConfigured, verifySlipWithProvider } from './slipVerification.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SLIP_UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'slips')

// Staff reviewing a slip by hand need to see the slip. Re-encode it through sharp so nothing
// but pixels reaches the disk, and keep it readable enough to compare against a banking app.
async function storeSlipImage(topupId, imageData) {
  try {
    const buffer = dataUrlToBuffer(imageData)
    const sanitized = await sharp(buffer, { limitInputPixels: 24_000_000, failOn: 'none' })
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
    await fs.promises.mkdir(SLIP_UPLOADS_ROOT, { recursive: true })
    const filename = `${Date.now()}-${Number(topupId)}-${crypto.randomBytes(6).toString('hex')}.webp`
    await fs.promises.writeFile(path.join(SLIP_UPLOADS_ROOT, filename), sanitized)
    return `/uploads/slips/${filename}`
  } catch (e) {
    console.warn('[Slip review] could not store slip image', { topupId, message: String(e?.message || '') })
    return ''
  }
}

const PROMPTPAY_PROVIDER = 'promptpay_manual'
const PROMPTPAY_METHOD = 'promptpay'
const PROMPTPAY_PENDING_STATUS = 'pending_slip'
export const PROMPTPAY_REVIEW_STATUS = 'pending_review'
const PROMPTPAY_QR_TTL_MS = 10 * 60 * 1000

function promptpayTarget(fallbackConfig = null) {
  if (fallbackConfig?.promptpayTarget) return fallbackConfig.promptpayTarget
  return String(process.env.PROMPTPAY_ID || process.env.PROMPTPAY_PHONE || process.env.PROMPTPAY_TARGET || process.env.TW_VOUCHER_PHONE || '')
    .replace(/[\s-]/g, '')
    .trim()
}

function normalizeTopupPoints(points) {
  const amountPoints = Number(points)
  if (!Number.isFinite(amountPoints) || amountPoints <= 0 || !Number.isInteger(amountPoints)) {
    throw new Error('invalid_points')
  }
  return amountPoints
}

function createPromptpayReference() {
  return `pp_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`
}

function promptpayExpiresAt(topup) {
  const createdAt = new Date(topup?.created_at ?? Date.now()).getTime()
  const base = Number.isFinite(createdAt) ? createdAt : Date.now()
  return new Date(base + PROMPTPAY_QR_TTL_MS)
}

function isPromptpayExpired(topup) {
  return promptpayExpiresAt(topup).getTime() <= Date.now()
}

async function expirePromptpayTopup(topup) {
  if (!topup?.id) return
  await updateTopupStatus({
    topupId: Number(topup.id),
    status: 'expired',
    onlyFromStatus: PROMPTPAY_PENDING_STATUS,
  })
}

async function buildPromptpayTopupResponse(topup) {
  const config = await getEffectiveTopupConfig()
  const target = promptpayTarget(config)
  if (!target) throw new Error('missing_promptpay_config')

  const amountPoints = normalizeTopupPoints(Number(topup.amount_points ?? topup.amount))
  const payload = generatePromptpayPayload(target, { amount: amountPoints })
  const imageDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 520,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })

  return {
    ok: true,
    mode: 'manual',
    provider: PROMPTPAY_PROVIDER,
    method: PROMPTPAY_METHOD,
    status: PROMPTPAY_PENDING_STATUS,
    topupId: Number(topup.id),
    reference: String(topup.reference || topup.provider_ref || ''),
    points: amountPoints,
    payableAmount: amountPoints,
    promptpayTarget: target,
    promptpayName: config.promptpayName || process.env.PROMPTPAY_NAME || process.env.PROMPTPAY_ACCOUNT_NAME || 'พร้อมเพย์ (PromptPay)',
    expiresAt: promptpayExpiresAt(topup).toISOString(),
    ttlSeconds: Math.max(0, Math.ceil((promptpayExpiresAt(topup).getTime() - Date.now()) / 1000)),
    qr: {
      payload,
      imageDataUrl,
    },
  }
}

function dataUrlToBuffer(value) {
  const input = typeof value === 'string' ? value.trim() : ''
  if (!input) throw new Error('invalid_slip_image')

  const match = input.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/)
  const base64 = match ? match[1] : input
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) throw new Error('invalid_slip_image')

  const buffer = Buffer.from(base64.replace(/\s+/g, ''), 'base64')
  if (!buffer.length) throw new Error('invalid_slip_image')
  return buffer
}

async function tryScanQr(sharpInstance) {
  try {
    const { data, info } = await sharpInstance
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
      inversionAttempts: 'attemptBoth',
    })

    const raw = typeof code?.data === 'string' ? code.data.trim() : ''
    return raw || null
  } catch {
    return null
  }
}

async function readQrFromSlipImage(imageData) {
  const buffer = dataUrlToBuffer(imageData)
  const baseSharp = sharp(buffer, { limitInputPixels: 24_000_000 }).rotate()

  // Pass 1: Raw original image
  let raw = await tryScanQr(baseSharp.clone())
  if (raw) return raw

  // Pass 2: Grayscale + normalized contrast + sharpened
  raw = await tryScanQr(
    baseSharp.clone()
      .greyscale()
      .normalize()
      .sharpen()
  )
  if (raw) return raw

  // Pass 3: Thresholding / Binarization (handles lighting & shadows)
  raw = await tryScanQr(
    baseSharp.clone()
      .greyscale()
      .threshold(135)
  )
  if (raw) return raw

  // Pass 4: Normalized downscale / standard width
  raw = await tryScanQr(
    baseSharp.clone()
      .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: false })
      .greyscale()
      .normalize()
  )
  if (raw) return raw

  // Pass 5: Crop bottom 65% (where Thai bank QR stamps usually reside)
  try {
    const meta = await baseSharp.metadata()
    if (meta.width && meta.height && meta.height > 200) {
      const cropHeight = Math.floor(meta.height * 0.65)
      const topOffset = meta.height - cropHeight
      raw = await tryScanQr(
        baseSharp.clone()
          .extract({ left: 0, top: topOffset, width: meta.width, height: cropHeight })
          .greyscale()
          .normalize()
          .sharpen()
      )
      if (raw) return raw
    }
  } catch {
    // ignore crop error
  }

  throw new Error('slip_qr_not_found')
}

function parseEmvTags(payload) {
  const text = String(payload || '')
  const tags = new Map()
  let index = 0

  while (index + 4 <= text.length) {
    const id = text.slice(index, index + 2)
    const lenText = text.slice(index + 2, index + 4)
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenText)) break

    const len = Number(lenText)
    const start = index + 4
    const end = start + len
    if (end > text.length) break

    tags.set(id, text.slice(start, end))
    index = end
  }

  return tags
}

function findDeepValue(value, names) {
  const queue = [value]
  const keys = new Set(names.map((name) => String(name).toLowerCase()))

  while (queue.length) {
    const item = queue.shift()
    if (!item || typeof item !== 'object') continue

    if (Array.isArray(item)) {
      queue.push(...item)
      continue
    }

    for (const [key, val] of Object.entries(item)) {
      if (keys.has(String(key).toLowerCase()) && val != null && String(val).trim()) return val
      if (val && typeof val === 'object') queue.push(val)
    }
  }

  return null
}

function toMoneyNumber(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').trim()
  if (!cleaned) return null
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return amount
}

function parseSlipQrData(raw) {
  const text = String(raw || '').trim()
  let transactionRef = ''
  let referenceSource = ''
  let amount = null

  try {
    const json = JSON.parse(text)
    const refValue = findDeepValue(json, [
      'transRef',
      'transactionRef',
      'transactionReference',
      'transactionId',
      'txid',
      'txnId',
      'ref',
      'reference',
      'slipId',
      'traceNo',
    ])
    if (refValue) {
      transactionRef = String(refValue).trim()
      referenceSource = 'json'
    }

    const amountValue = findDeepValue(json, [
      'amount',
      'paidAmount',
      'transactionAmount',
      'transAmount',
      'payableAmount',
      'totalAmount',
    ])
    amount = toMoneyNumber(amountValue)
  } catch {
    // Some bank QR payloads are plain text or EMV-style TLV, not JSON.
  }

  // Check EMV Tags including Thai National Mini-QR Standard (0046 / Sending Bank / TransRef)
  const emvTags = parseEmvTags(text)
  if (emvTags.size > 0) {
    // 1. Thai Interbank Mini-QR tag '00'
    const tag00 = emvTags.get('00')
    if (tag00) {
      const subTags00 = parseEmvTags(tag00)
      const sendingBank = subTags00.get('01') || ''
      const bankTransRef = subTags00.get('02') || ''
      if (bankTransRef) {
        transactionRef = sendingBank ? `${sendingBank}_${bankTransRef}` : bankTransRef
        referenceSource = 'thai_mini_qr'
      }
    }

    // 2. Tag 62 (Additional Data)
    if (!transactionRef) {
      const additionalData = parseEmvTags(emvTags.get('62') || '')
      const emvRef = additionalData.get('05') || additionalData.get('07') || additionalData.get('08') || additionalData.get('01')
      if (emvRef && /^[A-Za-z0-9._:\-]{6,96}$/.test(emvRef)) {
        transactionRef = emvRef.trim()
        referenceSource = 'emv'
      }
    }

    // 3. Amount from Tag 54
    if (amount == null) {
      amount = toMoneyNumber(emvTags.get('54'))
    }
  }

  if (!transactionRef) {
    const refMatch = text.match(/(?:trans(?:action)?[_\-\s]?ref(?:erence)?|trace[_\-\s]?no|slip[_\-\s]?id|txid|txn(?:id)?|ref(?:erence)?)\s*[:=]\s*([A-Za-z0-9._:\-]{6,96})/i)
    if (refMatch?.[1]) {
      transactionRef = refMatch[1].trim()
      referenceSource = 'text'
    }
  }

  if (amount == null) {
    const amountMatch = text.match(/(?:amount|amt|paid[_\-\s]?amount|total|thb)\s*[:=]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)
    amount = toMoneyNumber(amountMatch?.[1])
  }

  if (!transactionRef) {
    transactionRef = `qr_${crypto.createHash('sha256').update(text).digest('hex').slice(0, 48)}`
    referenceSource = 'qr_hash'
  }

  return { transactionRef, referenceSource, amount, raw: text }
}

function amountToSatang(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return Math.round(amount * 100)
}

function findExpectedAmountInOcrText(text, expectedAmount) {
  const expectedSatang = amountToSatang(expectedAmount)
  if (expectedSatang == null) return null

  const candidates = []
  const source = String(text || '').replace(/[Oo]/g, '0')
  const pattern = /(?:^|[^\d])(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)(?:\s*(?:THB|Baht|บาท))?/gi
  let match = pattern.exec(source)
  while (match) {
    const amount = toMoneyNumber(match[1])
    if (amount != null) candidates.push(amount)
    match = pattern.exec(source)
  }

  return candidates.find((amount) => amountToSatang(amount) === expectedSatang) ?? null
}

async function readExpectedAmountFromSlipImage(imageData, expectedAmount) {
  const buffer = dataUrlToBuffer(imageData)
  const ocrImage = await sharp(buffer, { limitInputPixels: 24_000_000 })
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .greyscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer()

  const worker = await createWorker('eng')
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.,ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz บาท',
    })
    const result = await worker.recognize(ocrImage)
    return findExpectedAmountInOcrText(result?.data?.text, expectedAmount)
  } finally {
    await worker.terminate()
  }
}

function parseAngpaoReference(reference) {
  const ref = typeof reference === 'string' ? reference.trim() : ''
  if (ref.length < 10) throw new Error('invalid_reference')
  if (!ref.startsWith('https://gift.truemoney.com/campaign/?v=')) throw new Error('invalid_reference')

  let voucherCode = ''
  try {
    const url = new URL(ref)
    voucherCode = String(url.searchParams.get('v') || '').trim()
  } catch {
    throw new Error('invalid_reference')
  }

  if (!voucherCode) throw new Error('invalid_reference')
  return { ref, voucherCode }
}

export async function redeemAngpaoVoucher({ userId, reference }) {
  await assertTopupMethodEnabledForRequest('angpao')
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')

  const config = await getEffectiveTopupConfig()
  const phone = config.truemoneyPhone || (typeof process.env.TW_VOUCHER_PHONE === 'string' ? process.env.TW_VOUCHER_PHONE.trim() : '')
  if (!phone) throw new Error('missing_config')

  const { ref, voucherCode } = parseAngpaoReference(reference)
  const existing = await getTopupByProviderRef({ provider: 'twvoucher', providerRef: voucherCode })
  if (existing) throw new Error('duplicate_reference')

  const twvoucherPkg = await import('@fortune-inc/tw-voucher')
  const twvoucher = twvoucherPkg.default?.default || twvoucherPkg.default || twvoucherPkg

  let redeemed = null
  try {
    try {
      redeemed = await twvoucher(phone, ref)
    } catch {
      redeemed = await twvoucher(phone, voucherCode)
    }
  } catch {
    throw new Error('invalid_voucher')
  }

  const baht = Number(redeemed?.amount)
  if (!Number.isFinite(baht) || baht <= 0) throw new Error('invalid_voucher')

  const rate = Number(process.env.ANGPAO_POINTS_PER_BAHT ?? 1)
  const points = Math.floor(baht * (Number.isFinite(rate) && rate > 0 ? rate : 1))
  if (!Number.isFinite(points) || points <= 0) throw new Error('invalid_voucher')

  const topupId = await createTopup({
    userId: uid,
    amountPoints: points,
    method: 'angpao',
    provider: 'twvoucher',
    providerRef: voucherCode,
    reference: ref,
    status: 'pending_payment',
  })

  const result = await creditPointsForTopup({
    topupId,
    approvedBy: null,
    refType: 'angpao_voucher',
    refId: voucherCode,
  })

  if (!result?.credited) throw new Error('duplicate_reference')

  return {
    ok: true,
    topupId,
    creditedPoints: points,
    voucherCode,
  }
}

export async function createPromptpayTopup({ userId, points }) {
  await assertTopupMethodEnabledForRequest('promptpay')
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const amountPoints = normalizeTopupPoints(points)

  await cancelPendingTopupsByMethod({
    userId: uid,
    method: PROMPTPAY_METHOD,
    provider: PROMPTPAY_PROVIDER,
    fromStatus: PROMPTPAY_PENDING_STATUS,
    toStatus: 'replaced',
  })

  const reference = createPromptpayReference()
  const topupId = await createTopup({
    userId: uid,
    amountPoints,
    method: PROMPTPAY_METHOD,
    provider: PROMPTPAY_PROVIDER,
    providerRef: reference,
    reference,
    status: PROMPTPAY_PENDING_STATUS,
  })

  return buildPromptpayTopupResponse({
    id: topupId,
    amount: amountPoints,
    amount_points: amountPoints,
    provider_ref: reference,
    reference,
    created_at: new Date().toISOString(),
  })
}

export async function getPendingPromptpayTopup({ userId }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')

  const topups = await listMyTopups(uid, { limit: 50, offset: 0 })
  const pending = topups.find((topup) => (
    topup?.provider === PROMPTPAY_PROVIDER
    && topup?.method === PROMPTPAY_METHOD
    && topup?.status === PROMPTPAY_PENDING_STATUS
  ))

  if (!pending) return null
  if (isPromptpayExpired(pending)) {
    await expirePromptpayTopup(pending)
    return null
  }

  return buildPromptpayTopupResponse(pending)
}

export async function verifyPromptpaySlip({ userId, topupId, slipImage }) {
  await assertTopupMethodEnabledForRequest('promptpay')
  const uid = Number(userId)
  const tid = Number(topupId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(tid) || tid <= 0) throw new Error('invalid_topup_id')

  const topup = await getTopupById(tid)
  if (!topup || Number(topup.user_id) !== uid) throw new Error('topup_not_found')
  if (topup.method !== PROMPTPAY_METHOD || topup.provider !== PROMPTPAY_PROVIDER) throw new Error('invalid_topup')
  if (topup.status === 'paid') throw new Error('already_paid')
  if (topup.status !== PROMPTPAY_PENDING_STATUS) throw new Error('invalid_topup_status')
  if (isPromptpayExpired(topup)) {
    await expirePromptpayTopup(topup)
    throw new Error('topup_expired')
  }

  const qrRaw = await readQrFromSlipImage(slipImage)
  const parsed = parseSlipQrData(qrRaw)
  const expectedAmount = Number(topup.amount_points ?? topup.amount)
  if (parsed.amount == null) {
    parsed.amount = await readExpectedAmountFromSlipImage(slipImage, expectedAmount)
  }
  if (parsed.amount == null) throw new Error('slip_amount_not_found')

  const expectedSatang = amountToSatang(expectedAmount)
  const actualSatang = amountToSatang(parsed.amount)
  if (expectedSatang == null || actualSatang == null) throw new Error('invalid_slip_amount')
  if (expectedSatang !== actualSatang) throw new Error('slip_amount_mismatch')

  if (!parsed.transactionRef) throw new Error('slip_ref_not_found')
  if (parsed.referenceSource === 'qr_hash') {
    const config = await getEffectiveTopupConfig()
    const target = promptpayTarget(config)
    const orderPayload = target ? generatePromptpayPayload(target, { amount: expectedAmount }) : ''
    if (qrRaw === orderPayload) throw new Error('payment_qr_uploaded')
  }

  // The image itself proves nothing - only an external verifier can confirm the transfer really
  // happened and really landed on our account. Without one, park the topup for staff approval.
  if (!isSlipAutoVerifyConfigured()) {
    await updateTopupProviderRef({ topupId: tid, providerRef: parsed.transactionRef })
    const slipImageUrl = await storeSlipImage(tid, slipImage)
    await attachTopupSlipEvidence({ topupId: tid, slipImageUrl, slipAmount: parsed.amount })
    await updateTopupStatus({
      topupId: tid,
      status: PROMPTPAY_REVIEW_STATUS,
      onlyFromStatus: PROMPTPAY_PENDING_STATUS,
    })
    return {
      ok: true,
      topupId: tid,
      status: PROMPTPAY_REVIEW_STATUS,
      creditedPoints: 0,
      transactionRef: parsed.transactionRef,
      slipAmount: parsed.amount,
      referenceSource: parsed.referenceSource,
    }
  }

  const verified = await verifySlipWithProvider({ qrPayload: qrRaw, expectedAmount })

  const credit = await creditPointsForTopup({
    topupId: tid,
    approvedBy: null,
    refType: 'promptpay_slip',
    refId: verified.transactionRef,
  })

  if (!credit?.credited) {
    if (credit?.reason === 'already_paid') throw new Error('already_paid')
    throw new Error('duplicate_slip')
  }

  return {
    ok: true,
    status: 'paid',
    topupId: tid,
    creditedPoints: expectedAmount,
    transactionRef: verified.transactionRef,
    referenceSource: parsed.referenceSource,
    slipAmount: parsed.amount,
  }
}
