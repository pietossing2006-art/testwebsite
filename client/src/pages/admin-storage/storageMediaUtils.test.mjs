import test from 'node:test'
import assert from 'node:assert/strict'

import { canPreviewInBrowser } from './storageMediaUtils.js'

test('canPreviewInBrowser allows storage host videos beyond the old mp4/webm list', () => {
  assert.equal(canPreviewInBrowser({ name: 'clip.mov', media_kind: 'video' }), true)
  assert.equal(canPreviewInBrowser({ name: 'archive/sample.MKV', media_kind: 'video' }), true)
})

test('canPreviewInBrowser allows storage host images beyond the common web image list', () => {
  assert.equal(canPreviewInBrowser({ name: 'camera.heic', media_kind: 'image' }), true)
  assert.equal(canPreviewInBrowser({ name: 'scan.TIFF', media_kind: 'image' }), true)
})
