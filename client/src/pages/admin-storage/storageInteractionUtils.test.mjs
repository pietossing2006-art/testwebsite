import test from 'node:test'
import assert from 'node:assert/strict'
import { clampMediaTime, getDoubleTapSeekDelta, getSwipeNavigationAction } from './storageInteractionUtils.js'

test('getSwipeNavigationAction maps left and right swipes to media navigation', () => {
  assert.equal(getSwipeNavigationAction({ startX: 220, startY: 80, endX: 80, endY: 92 }), 'next')
  assert.equal(getSwipeNavigationAction({ startX: 80, startY: 80, endX: 220, endY: 92 }), 'prev')
})

test('getSwipeNavigationAction ignores short or mostly vertical gestures', () => {
  assert.equal(getSwipeNavigationAction({ startX: 120, startY: 80, endX: 92, endY: 82 }), '')
  assert.equal(getSwipeNavigationAction({ startX: 120, startY: 80, endX: 40, endY: 220 }), '')
})

test('getDoubleTapSeekDelta uses tap side to choose rewind or skip', () => {
  assert.equal(getDoubleTapSeekDelta({ clientX: 25, rectLeft: 0, rectWidth: 100 }), -10)
  assert.equal(getDoubleTapSeekDelta({ clientX: 75, rectLeft: 0, rectWidth: 100 }), 10)
})

test('clampMediaTime keeps seeks inside media duration', () => {
  assert.equal(clampMediaTime({ currentTime: 6, deltaSeconds: -10, duration: 100 }), 0)
  assert.equal(clampMediaTime({ currentTime: 96, deltaSeconds: 10, duration: 100 }), 100)
  assert.equal(clampMediaTime({ currentTime: 20, deltaSeconds: 10, duration: 100 }), 30)
})
