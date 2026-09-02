import { Router } from 'express'
import { requireAuth, rateLimitMiddleware } from '../lib/auth.js'
import { PromptpaySlipBodySchema, TopupAngpaoBodySchema, TopupPromptpayBodySchema } from '../lib/requestSchemas.js'
import { createPromptpayTopup, getPendingPromptpayTopup, redeemAngpaoVoucher, verifyPromptpaySlip } from '../lib/topup.js'
import { validateBody } from '../lib/validation.js'

const router = Router()

router.post('/api/topups/angpao', requireAuth, rateLimitMiddleware({ windowMs: 60_000, max: 10, keyPrefix: 'angpao_topup' }), async (req, res) => {
  const parsed = validateBody(TopupAngpaoBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { reference } = parsed.data
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
    if (msg === 'topup_method_disabled') return res.status(403).json({ error: 'topup_method_disabled' })
    if (e?.code === '23505') return res.status(409).json({ error: 'duplicate_reference' })
    res.status(500).json({ error: 'db_error' })
  }
})

router.post('/api/topups/promptpay', requireAuth, rateLimitMiddleware({ windowMs: 60_000, max: 20, keyPrefix: 'create_promptpay' }), async (req, res) => {
  const parsed = validateBody(TopupPromptpayBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { points } = parsed.data

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
      promptpay_target: result.promptpayTarget,
      promptpay_name: result.promptpayName,
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
    if (msg === 'topup_method_disabled') return res.status(403).json({ error: 'topup_method_disabled' })
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
        promptpay_target: result.promptpayTarget,
        promptpay_name: result.promptpayName,
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

router.post('/api/topups/promptpay/verify-slip', requireAuth, rateLimitMiddleware({ windowMs: 60_000, max: 15, keyPrefix: 'slip_verify' }), async (req, res) => {
  const parsed = validateBody(PromptpaySlipBodySchema, req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const { topup_id: topupId, slip_image: slipImage } = parsed.data

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
    if (msg === 'topup_method_disabled') return res.status(403).json({ error: 'topup_method_disabled' })
    if (msg === 'invalid_topup' || msg === 'invalid_topup_status') return res.status(400).json({ error: msg })
    res.status(500).json({ error: 'promptpay_verify_error' })
  }
})

export default router
