import { Router } from 'express'
import {
  createTopup,
  creditPointsForTopup,
  getTopupById,
  getTopupByProviderRef,
  logWebhookEvent,
  markWebhookProcessed,
  updateTopupProviderRef,
} from '../db.js'
import { requireAuth } from '../lib/auth.js'
import { omiseRequest } from '../lib/omise.js'
import { createPromptpayTopup, getPendingPromptpayTopup, redeemAngpaoVoucher, verifyPromptpaySlip } from '../lib/topup.js'

const router = Router()

router.post('/api/topups/angpao', requireAuth, async (req, res) => {
  const { reference } = req.body ?? {}
  try {
    const result = await redeemAngpaoVoucher({ userId: req.user.id, reference })
    res.status(201).json({
      ok: true,
      topup_id: result.topupId,
      credited_points: result.creditedPoints,
      voucher_code: result.voucherCode,
    })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_reference') return res.status(400).json({ error: 'invalid_reference' })
    if (msg === 'invalid_voucher') return res.status(400).json({ error: 'invalid_voucher' })
    if (msg === 'duplicate_reference') return res.status(409).json({ error: 'duplicate_reference' })
    if (msg === 'missing_config') return res.status(500).json({ error: 'missing_config' })
    if (e?.code === '23505') return res.status(409).json({ error: 'duplicate_reference' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/topups/promptpay', requireAuth, async (req, res) => {
  const { points } = req.body ?? {}

  try {
    const result = await createPromptpayTopup({ userId: req.user.id, points })
    res.status(201).json({
      ok: true,
      provider: result.provider,
      method: result.method,
      status: result.status,
      topup_id: result.topupId,
      reference: result.reference,
      points: result.points,
      payable_amount: result.payableAmount,
      expires_at: result.expiresAt,
      ttl_seconds: result.ttlSeconds,
      qr: {
        payload: result.qr?.payload ?? null,
        image_data_url: result.qr?.imageDataUrl ?? null,
      },
    })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_points') return res.status(400).json({ error: 'invalid_points' })
    if (msg === 'missing_promptpay_config') return res.status(500).json({ error: 'missing_promptpay_config' })
    if (msg === 'invalid_user_id') return res.status(400).json({ error: 'invalid_user_id' })
    res.status(500).json({ error: 'promptpay_error' })
  }
})

router.get('/api/topups/promptpay/pending', requireAuth, async (req, res) => {
  try {
    const result = await getPendingPromptpayTopup({ userId: req.user.id })
    if (!result) return res.json({ ok: true, topup: null })
    res.json({
      ok: true,
      topup: {
        provider: result.provider,
        method: result.method,
        status: result.status,
        topup_id: result.topupId,
        reference: result.reference,
        points: result.points,
        payable_amount: result.payableAmount,
        expires_at: result.expiresAt,
        ttl_seconds: result.ttlSeconds,
        qr: {
          payload: result.qr?.payload ?? null,
          image_data_url: result.qr?.imageDataUrl ?? null,
        },
      },
    })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'missing_promptpay_config') return res.status(500).json({ error: 'missing_promptpay_config' })
    if (msg === 'invalid_user_id') return res.status(400).json({ error: 'invalid_user_id' })
    res.status(500).json({ error: 'promptpay_pending_error' })
  }
})

router.post('/api/topups/promptpay/verify-slip', requireAuth, async (req, res) => {
  const body = req.body ?? {}
  const topupId = body.topup_id ?? body.topupId
  const slipImage = body.slip_image ?? body.slipImage ?? body.image_data ?? body.imageData

  try {
    const result = await verifyPromptpaySlip({ userId: req.user.id, topupId, slipImage })
    res.json({
      ok: true,
      topup_id: result.topupId,
      credited_points: result.creditedPoints,
      transaction_ref: result.transactionRef,
      slip_amount: result.slipAmount,
      reference_source: result.referenceSource,
    })
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (msg === 'invalid_topup_id') return res.status(400).json({ error: 'invalid_topup_id' })
    if (msg === 'invalid_slip_image') return res.status(400).json({ error: 'invalid_slip_image' })
    if (msg === 'slip_qr_not_found') return res.status(400).json({ error: 'slip_qr_not_found' })
    if (msg === 'slip_ref_not_found') return res.status(400).json({ error: 'slip_ref_not_found' })
    if (msg === 'payment_qr_uploaded') return res.status(400).json({ error: 'payment_qr_uploaded' })
    if (msg === 'slip_amount_not_found') return res.status(400).json({ error: 'slip_amount_not_found' })
    if (msg === 'invalid_slip_amount') return res.status(400).json({ error: 'invalid_slip_amount' })
    if (msg === 'slip_amount_mismatch') return res.status(409).json({ error: 'slip_amount_mismatch' })
    if (msg === 'duplicate_slip') return res.status(409).json({ error: 'duplicate_slip' })
    if (msg === 'already_paid') return res.status(409).json({ error: 'already_paid' })
    if (msg === 'topup_expired') return res.status(409).json({ error: 'topup_expired' })
    if (msg === 'topup_not_found') return res.status(404).json({ error: 'topup_not_found' })
    if (msg === 'invalid_topup' || msg === 'invalid_topup_status') return res.status(400).json({ error: msg })
    res.status(500).json({ error: 'promptpay_verify_error' })
  }
})

router.post('/api/topups/omise', requireAuth, async (req, res) => {
  const { points, channel, bank, card_token } = req.body ?? {}
  const amountPoints = Number(points)
  if (!Number.isFinite(amountPoints) || amountPoints <= 0) return res.status(400).json({ error: 'invalid_points' })
  const ch = typeof channel === 'string' ? channel : 'card'
  if (!['card', 'transfer', 'promptpay'].includes(ch)) return res.status(400).json({ error: 'invalid_channel' })

  const hasKeys = Boolean(process.env.OMISE_SECRET_KEY)
  if (!hasKeys) {
    try {
      const id = await createTopup({
        userId: req.user.id,
        amountPoints,
        method: ch,
        provider: 'omise',
        providerRef: `mock_${Date.now()}`,
        status: 'pending_payment',
      })
      return res.status(201).json({ ok: true, topup_id: id, provider: 'omise', mode: 'mock' })
    } catch {
      return res.status(500).json({ error: 'db_error' })
    }
  }

  try {
    const topupId = await createTopup({
      userId: req.user.id,
      amountPoints,
      method: ch,
      provider: 'omise',
      providerRef: null,
      status: 'pending_payment',
    })

    const amountSatang = Math.round(amountPoints * 100)

    const metadata = {
      topup_id: String(topupId),
      user_id: String(req.user.id),
      points: String(amountPoints),
    }

    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null
    const returnUri = origin ? `${origin}/topup` : undefined

    let source = null
    let charge = null

    if (ch === 'promptpay') {
      source = await omiseRequest('/sources', {
        method: 'POST',
        body: {
          type: 'promptpay',
          amount: amountSatang,
          currency: 'thb',
        },
      })

      charge = await omiseRequest('/charges', {
        method: 'POST',
        body: {
          amount: amountSatang,
          currency: 'thb',
          source: source.id,
          description: `Topup ${amountPoints} points`,
          metadata,
        },
      })
    } else if (ch === 'transfer') {
      const b = typeof bank === 'string' ? bank.trim().toLowerCase() : ''
      const type = b === 'bbl' ? 'internet_banking_bbl' : b === 'bay' ? 'internet_banking_bay' : ''
      if (!type) return res.status(400).json({ error: 'invalid_bank' })

      source = await omiseRequest('/sources', {
        method: 'POST',
        body: {
          type,
          amount: amountSatang,
          currency: 'thb',
        },
      })

      charge = await omiseRequest('/charges', {
        method: 'POST',
        body: {
          amount: amountSatang,
          currency: 'thb',
          source: source.id,
          description: `Topup ${amountPoints} points`,
          metadata,
          return_uri: returnUri,
        },
      })
    } else if (ch === 'card') {
      const token = typeof card_token === 'string' ? card_token.trim() : ''
      if (!token) return res.status(400).json({ error: 'missing_card_token' })

      charge = await omiseRequest('/charges', {
        method: 'POST',
        body: {
          amount: amountSatang,
          currency: 'thb',
          card: token,
          description: `Topup ${amountPoints} points`,
          metadata,
          return_uri: returnUri,
        },
      })
    }

    await updateTopupProviderRef({ topupId, providerRef: charge.id })

    const sc = charge?.source?.scannable_code ?? null
    const qr = {
      image_download_uri: sc?.image?.download_uri ?? null,
      image_uri: sc?.image?.uri ?? null,
      raw: sc?.raw ?? null,
    }

    const authorize_uri = charge?.authorize_uri ?? null

    res.status(201).json({
      ok: true,
      provider: 'omise',
      mode: 'real',
      topup_id: topupId,
      charge_id: charge.id,
      amount_satang: amountSatang,
      authorize_uri,
      qr,
      charge,
    })
  } catch (e) {
    const code = e?.data?.code
    if (e?.message === 'omise_not_configured') return res.status(500).json({ error: 'omise_not_configured' })
    if (code) return res.status(400).json({ error: 'omise_error', code, message: e?.data?.message })
    res.status(500).json({ error: 'omise_error' })
  }
})

router.post('/api/webhooks/omise', async (req, res) => {
  const eventId = String(req.body?.id ?? '')
  const provider = 'omise'
  if (!eventId) return res.status(400).json({ error: 'invalid_event' })

  try {
    const log = await logWebhookEvent({ provider, eventId, payload: JSON.stringify(req.body ?? {}) })
    if (!log.inserted) return res.json({ ok: true, duplicated: true })

    const data = req.body?.data
    if (!data || typeof data !== 'object') return res.json({ ok: true })
    if (data.object !== 'charge') return res.json({ ok: true })

    const chargeId = String(data.id ?? '')
    const status = String(data.status ?? '')
    const paid = Boolean(data.paid)
    if (!chargeId) return res.json({ ok: true })
    if (!(paid || status === 'successful')) return res.json({ ok: true })

    let topup = await getTopupByProviderRef({ provider: 'omise', providerRef: chargeId })
    if (!topup) {
      const topupIdMeta = Number(data?.metadata?.topup_id)
      if (Number.isFinite(topupIdMeta)) topup = await getTopupById(topupIdMeta)
    }
    if (!topup) return res.json({ ok: true })

    await creditPointsForTopup({ topupId: Number(topup.id), approvedBy: null, refType: 'webhook', refId: eventId })
    await markWebhookProcessed({ provider, eventId })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/webhooks/omise/mock-paid', async (req, res) => {
  const { topup_id } = req.body ?? {}
  const topupId = Number(topup_id)
  if (!Number.isFinite(topupId)) return res.status(400).json({ error: 'invalid_topup_id' })

  try {
    const topup = await getTopupById(topupId)
    if (!topup) return res.status(404).json({ error: 'not_found' })

    const eventId = `mock_paid_${topupId}`
    const log = await logWebhookEvent({ provider: 'omise', eventId, payload: JSON.stringify(req.body ?? {}) })
    if (!log.inserted) return res.json({ ok: true, duplicated: true })

    await creditPointsForTopup({ topupId, approvedBy: null, refType: 'webhook', refId: eventId })
    await markWebhookProcessed({ provider: 'omise', eventId })

    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'db_error' })
  }
})

export default router
