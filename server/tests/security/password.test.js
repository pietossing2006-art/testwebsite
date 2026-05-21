import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { checkPassword, hashPassword, verifyPassword } from '../../db.js'

function legacyPbkdf2Hash(password, salt = '0123456789abcdef0123456789abcdef') {
  const derived = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex')
  return `${salt}:${derived}`
}

test('hashPassword creates Argon2id hashes and verifyPassword validates them', async () => {
  const hash = await hashPassword('correct horse battery staple')

  assert.match(hash, /^\$argon2id\$/)
  assert.equal(await verifyPassword('correct horse battery staple', hash), true)
  assert.equal(await verifyPassword('wrong password', hash), false)
})

test('verifyPassword keeps existing PBKDF2 password hashes valid', async () => {
  const legacyHash = legacyPbkdf2Hash('legacy password')

  assert.equal(await verifyPassword('legacy password', legacyHash), true)
  assert.equal(await checkPassword('legacy password', legacyHash), true)
  assert.equal(await verifyPassword('wrong password', legacyHash), false)
})
