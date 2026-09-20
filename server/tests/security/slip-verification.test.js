import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  amountsMatch,
  isSlipAutoVerifyConfigured,
  normalizeSlipVerifyResponse,
  receiverMatches,
  slipVerifyProvider,
} from '../../lib/slipVerification.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const topupSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'lib', 'topup.js'), 'utf8')

function withEnv(vars, fn) {
  const previous = {}
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key]
    if (value == null) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('auto-credit stays off until a verification provider is fully configured', () => {
  withEnv(
    { SLIP_VERIFY_PROVIDER: undefined, SLIPOK_API_KEY: undefined, SLIPOK_BRANCH_ID: undefined, SLIP_VERIFY_URL: undefined },
    () => {
      assert.equal(slipVerifyProvider(), '')
      assert.equal(isSlipAutoVerifyConfigured(), false)
    },
  )

  // API key without a branch id is an incomplete SlipOK setup and must not enable auto-credit.
  withEnv({ SLIPOK_API_KEY: 'key', SLIPOK_BRANCH_ID: undefined, SLIP_VERIFY_URL: undefined, SLIP_VERIFY_PROVIDER: undefined }, () => {
    assert.equal(slipVerifyProvider(), 'slipok')
    assert.equal(isSlipAutoVerifyConfigured(), false)
  })

  withEnv({ SLIPOK_API_KEY: 'key', SLIPOK_BRANCH_ID: '123', SLIP_VERIFY_PROVIDER: undefined, SLIP_VERIFY_URL: undefined }, () => {
    assert.equal(isSlipAutoVerifyConfigured(), true)
  })

  withEnv({ SLIP_VERIFY_URL: 'https://verify.example/api', SLIP_VERIFY_PROVIDER: undefined, SLIPOK_API_KEY: undefined }, () => {
    assert.equal(slipVerifyProvider(), 'custom')
    assert.equal(isSlipAutoVerifyConfigured(), true)
  })
})

test('an unverified slip is routed to staff review instead of crediting points', () => {
  assert.match(topupSource, /if \(!isSlipAutoVerifyConfigured\(\)\) \{/)
  assert.match(topupSource, /status: PROMPTPAY_REVIEW_STATUS/)
  // The credit call must be reachable only after the provider confirmed the transfer.
  const creditIndex = topupSource.indexOf("refType: 'promptpay_slip'")
  const verifyIndex = topupSource.indexOf('await verifySlipWithProvider(')
  assert.ok(verifyIndex > 0 && creditIndex > verifyIndex)
  // Points must be keyed on the verifier's reference, never on one parsed out of the image.
  assert.match(topupSource, /refId: verified\.transactionRef/)
})

test('provider responses are only accepted when they carry a success flag and a reference', () => {
  assert.deepEqual(
    normalizeSlipVerifyResponse({ success: true, data: { transRef: 'ABC123', amount: 250 } }).ok,
    true,
  )
  assert.equal(normalizeSlipVerifyResponse({ success: true, data: { amount: 250 } }).ok, false)
  assert.equal(normalizeSlipVerifyResponse({ success: false, data: { transRef: 'ABC123' } }).ok, false)
  assert.equal(normalizeSlipVerifyResponse(null).ok, false)

  const parsed = normalizeSlipVerifyResponse({
    success: true,
    data: { transRef: 'X1', amount: { amount: 99.5 }, receiver: { account: { value: 'xxx-x-x1234-x' } } },
  })
  assert.equal(parsed.amount, 99.5)
  assert.ok(parsed.receivers.includes('xxx-x-x1234-x'))
})

test('amounts must match to the satang', () => {
  assert.equal(amountsMatch(100, 100.0), true)
  assert.equal(amountsMatch(100.5, 100.5), true)
  assert.equal(amountsMatch(100, 100.01), false)
  assert.equal(amountsMatch(100, null), false)
})

test('receiver matching tolerates masked accounts but rejects other people', () => {
  assert.equal(receiverMatches('0812345678', ['xxx-xxx-5678']), true)
  assert.equal(receiverMatches('123-4-56789-0', ['xxxxx7890']), true)
  assert.equal(receiverMatches('0812345678', ['xxx-xxx-1111']), false)
  assert.equal(receiverMatches('0812345678', []), false)
  assert.equal(receiverMatches('', ['xxx-xxx-5678']), false)
})

// Response sample taken from SlipOK's published Check Slip documentation.
const SLIPOK_SAMPLE = {
  success: true,
  data: {
    success: true,
    receivingBank: '006',
    sendingBank: '004',
    transRef: '010092101507665143',
    transDate: '20200401',
    sender: {
      displayName: 'นาย กสิกร ร',
      proxy: { type: 'MSISDN', value: '086xxx7894' },
      account: { type: 'BANKAC', value: 'xxx-x-x0209-x' },
    },
    receiver: {
      displayName: 'ธนาทร ร',
      proxy: { type: 'MSISDN', value: '086xxx0000' },
      account: { type: 'BANKAC', value: 'xxx-x-x3109-x' },
    },
    amount: 50,
  },
}

test('a real SlipOK payload parses into ref, amount and receiver', () => {
  const parsed = normalizeSlipVerifyResponse(SLIPOK_SAMPLE)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.transRef, '010092101507665143')
  assert.equal(parsed.amount, 50)
  assert.ok(parsed.receivers.includes('xxx-x-x3109-x'))
})

test('the sender side of a slip never satisfies the receiver check', () => {
  const parsed = normalizeSlipVerifyResponse(SLIPOK_SAMPLE)
  // Money leaving the shop (a refund slip) must not be reusable as a topup.
  assert.equal(parsed.receivers.includes('xxx-x-x0209-x'), false)
  assert.equal(parsed.receivers.includes('086xxx7894'), false)
  assert.equal(receiverMatches('123-4-50209-1', parsed.receivers), false)
  assert.equal(receiverMatches('123-4-53109-1', parsed.receivers), true)
})

test('the manual review queue is staff-only and the slip evidence is stored for it', () => {
  const adminOps = fs.readFileSync(path.resolve(__dirname, '..', '..', 'routes', 'admin-ops.js'), 'utf8')
  for (const route of ['/api/admin/topups/review-queue', "/api/admin/topups/:id/reject", "/api/admin/topups/:id/approve"]) {
    const line = adminOps.split('\n').find((l) => l.includes(route) && l.includes('router.'))
    assert.ok(line, `route not found: ${route}`)
    assert.match(line, /requireAuth/)
    assert.match(line, /requireFinance/)
  }
  // Reviewers can only judge a slip they can actually see.
  assert.match(topupSource, /await storeSlipImage\(tid, slipImage\)/)
  assert.match(topupSource, /attachTopupSlipEvidence/)
})
