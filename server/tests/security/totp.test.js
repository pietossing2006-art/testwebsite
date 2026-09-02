import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSync } from 'otplib'
import {
  generateTotpSecret,
  generateTotpUri,
  generateTotpQrDataUrl,
  verifyTotpToken,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
} from '../../lib/totp.js'

test('generateTotpSecret generates valid base32 string', () => {
  const secret = generateTotpSecret()
  assert.ok(typeof secret === 'string')
  assert.ok(secret.length >= 16)
})

test('generateTotpUri creates valid otpauth uri', () => {
  const secret = generateTotpSecret()
  const uri = generateTotpUri({ email: 'user@example.com', secret, issuer: 'VxperS Store' })
  assert.ok(uri.startsWith('otpauth://totp/'))
  assert.ok(uri.includes('VxperS%20Store'))
  assert.ok(uri.includes('user%40example.com'))
  assert.ok(uri.includes(secret))
})

test('generateTotpQrDataUrl generates base64 data url image', async () => {
  const secret = generateTotpSecret()
  const uri = generateTotpUri({ email: 'user@example.com', secret })
  const qr = await generateTotpQrDataUrl(uri)
  assert.ok(typeof qr === 'string')
  assert.ok(qr.startsWith('data:image/png;base64,'))
})

test('verifyTotpToken verifies correct token and rejects incorrect token', () => {
  const secret = generateTotpSecret()
  const currentCode = generateSync({ secret })

  assert.equal(verifyTotpToken({ token: currentCode, secret }), true)
  assert.equal(verifyTotpToken({ token: '000000', secret }), false)
  assert.equal(verifyTotpToken({ token: '', secret }), false)
})

test('generateBackupCodes and verifyAndConsumeBackupCode work accurately', () => {
  const { plainCodes, hashedCodes } = generateBackupCodes(8)
  assert.equal(plainCodes.length, 8)
  assert.equal(hashedCodes.length, 8)

  const firstCode = plainCodes[0]
  const verification = verifyAndConsumeBackupCode(firstCode, hashedCodes)
  assert.equal(verification.valid, true)
  assert.equal(verification.remainingCount, 7)
  assert.equal(verification.remainingHashedCodes.length, 7)

  // Cannot reuse consumed code
  const reVerification = verifyAndConsumeBackupCode(firstCode, verification.remainingHashedCodes)
  assert.equal(reVerification.valid, false)

  // Rejects invalid code
  const invalidVerification = verifyAndConsumeBackupCode('INVALID-CODE', hashedCodes)
  assert.equal(invalidVerification.valid, false)
})
