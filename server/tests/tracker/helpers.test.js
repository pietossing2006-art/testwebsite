import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatUnitLabel,
  normalizeUnitForSession,
  parseUnitNumber,
} from '../../lib/trackerHelpers.js'

test('formatUnitLabel pads room numbers', () => {
  assert.equal(formatUnitLabel(5, '42/', 755), '42/005')
  assert.equal(formatUnitLabel(150, '42/', 755), '42/150')
})

test('parseUnitNumber accepts prefix or bare number', () => {
  assert.equal(parseUnitNumber('005', '42/'), 5)
  assert.equal(parseUnitNumber('42/005', '42/'), 5)
})

test('normalizeUnitForSession rejects out-of-range rooms', () => {
  const session = { prefix: '42/', total_rooms: 755 }
  assert.equal(normalizeUnitForSession('10', session), 10)
  assert.throws(() => normalizeUnitForSession('999', session), /between 1 and 755/)
})
