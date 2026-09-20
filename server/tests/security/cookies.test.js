import test from 'node:test'
import assert from 'node:assert/strict'

import { cookieSameSite } from '../../lib/cookies.js'

function withEnv(overrides, fn) {
  const previous = {}
  for (const key of Object.keys(overrides)) previous[key] = process.env[key]
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
    fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('cookieSameSite defaults auth cookies to Lax even with secure shared-domain cookies', () => {
  withEnv({ COOKIE_DOMAIN: '.vxpers.com', COOKIE_SAMESITE_NONE: null, COOKIE_SAME_SITE: null }, () => {
    assert.equal(cookieSameSite({ headers: { host: 'api.vxpers.com' } }, true), 'lax')
  })
})

test('cookieSameSite only uses None when explicitly enabled for cross-site cookie deployments', () => {
  withEnv({ COOKIE_DOMAIN: '.vxpers.com', COOKIE_SAMESITE_NONE: '1', COOKIE_SAME_SITE: null }, () => {
    assert.equal(cookieSameSite({ headers: { host: 'api.vxpers.com' } }, true), 'none')
  })
})

test('normalizeConsentInput normalizes boolean preferences while keeping essential true', async () => {
  const { normalizeConsentInput } = await import('../../lib/cookies.js')
  assert.deepEqual(normalizeConsentInput(null), {
    essential: true,
    analytics: false,
    marketing: false,
    personalization: false,
  })
  assert.deepEqual(normalizeConsentInput({ analytics: true, marketing: false, personalization: true }), {
    essential: true,
    analytics: true,
    marketing: false,
    personalization: true,
  })
})

test('trusted device cookie helpers set, clear, and extract token properly', async () => {
  const { setTrustedDeviceCookie, clearTrustedDeviceCookie, getTrustedDeviceToken, COOKIE_TRUSTED_DEVICE } = await import('../../lib/cookies.js')

  // Test set
  const cookiesSet = []
  const mockRes = {
    req: { headers: { host: 'localhost:3001' } },
    cookie: (name, val, opts) => cookiesSet.push({ name, val, opts }),
    clearCookie: (name, opts) => cookiesSet.push({ cleared: true, name, opts }),
  }
  setTrustedDeviceCookie(mockRes, 'token123', { secure: false })
  assert.equal(cookiesSet.length, 1)
  assert.equal(cookiesSet[0].name, COOKIE_TRUSTED_DEVICE)
  assert.equal(cookiesSet[0].val, 'token123')
  assert.equal(cookiesSet[0].opts.httpOnly, true)

  // Test clear
  clearTrustedDeviceCookie(mockRes, { secure: false })
  assert.equal(cookiesSet.length, 2)
  assert.equal(cookiesSet[1].cleared, true)
  assert.equal(cookiesSet[1].name, COOKIE_TRUSTED_DEVICE)

  // Test getTrustedDeviceToken extraction from cookie, header, or body
  assert.equal(getTrustedDeviceToken({ cookies: { [COOKIE_TRUSTED_DEVICE]: 'from-cookie' } }), 'from-cookie')
  assert.equal(getTrustedDeviceToken({ headers: { 'x-trusted-device': 'from-header' } }), 'from-header')
  assert.equal(getTrustedDeviceToken({ body: { trusted_device_token: 'from-body' } }), 'from-body')
  assert.equal(getTrustedDeviceToken({}), null)
})
