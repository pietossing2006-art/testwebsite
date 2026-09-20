import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { getTrustedDeviceToken, setTrustedDeviceCookie, clearTrustedDeviceCookie, COOKIE_TRUSTED_DEVICE } from '../../lib/cookies.js'

test('getTrustedDeviceToken resolves token from cookie, header, or body', () => {
  assert.equal(getTrustedDeviceToken({ cookies: { [COOKIE_TRUSTED_DEVICE]: 'tok-cookie' } }), 'tok-cookie')
  assert.equal(getTrustedDeviceToken({ headers: { 'x-trusted-device': 'tok-header' } }), 'tok-header')
  assert.equal(getTrustedDeviceToken({ body: { trusted_device_token: 'tok-body' } }), 'tok-body')
  assert.equal(getTrustedDeviceToken(null), null)
  assert.equal(getTrustedDeviceToken({}), null)
})

test('setTrustedDeviceCookie sets 30-day HttpOnly cookie', () => {
  let cookieName, cookieVal, cookieOpts
  const res = {
    req: { headers: { host: 'localhost:3001' } },
    cookie: (n, v, o) => {
      cookieName = n
      cookieVal = v
      cookieOpts = o
    },
  }
  setTrustedDeviceCookie(res, 'my-test-token', { secure: false })
  assert.equal(cookieName, COOKIE_TRUSTED_DEVICE)
  assert.equal(cookieVal, 'my-test-token')
  assert.equal(cookieOpts.httpOnly, true)
  assert.equal(cookieOpts.maxAge, 30 * 24 * 60 * 60 * 1000)
  assert.equal(cookieOpts.path, '/')
})

test('clearTrustedDeviceCookie clears cookie properly', () => {
  let clearedName, clearedOpts
  const res = {
    req: { headers: { host: 'localhost:3001' } },
    clearCookie: (n, o) => {
      clearedName = n
      clearedOpts = o
    },
  }
  clearTrustedDeviceCookie(res, { secure: false })
  assert.equal(clearedName, COOKIE_TRUSTED_DEVICE)
  assert.equal(clearedOpts.httpOnly, true)
  assert.equal(clearedOpts.path, '/')
})
