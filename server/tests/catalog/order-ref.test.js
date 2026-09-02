import test from 'node:test'
import assert from 'node:assert/strict'
import { generateOrderRef } from '../../db.js'

test('generateOrderRef generates truly random and uniquely formatted refs', () => {
  const refPattern = /^ORD-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/

  const sampleRefs = new Set()
  const total = 500

  for (let i = 0; i < total; i++) {
    const ref = generateOrderRef()
    assert.match(ref, refPattern, `Ref ${ref} should match standard ORD-XXXX-XXXX-XXXX pattern`)
    sampleRefs.add(ref)
  }

  // Ensure 100% uniqueness among 500 samples (zero collisions)
  assert.equal(sampleRefs.size, total, 'All generated order refs must be strictly unique')

  // Ensure prefixes are not identical (no fixed timestamps or repeating prefix characters)
  const prefixes = new Set([...sampleRefs].map((r) => r.slice(4, 8)))
  assert.ok(prefixes.size > 400, 'First block of random characters should be highly diverse and not share a static prefix')
})
