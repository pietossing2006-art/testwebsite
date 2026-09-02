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
