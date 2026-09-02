import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INITIAL_MEDIA_RENDER_LIMIT,
  MEDIA_RENDER_STEP,
  VIDEO_THUMB_QUALITY,
  VIDEO_THUMB_WIDTH,
  buildStorageMediaUrl,
  canPreviewInBrowser,
  encodeStoragePathForRoute,
  getStorageFullscreenPreviewUrl,
} from './storageMediaUtils.js'

test('canPreviewInBrowser allows storage host videos beyond the old mp4/webm list', () => {
  assert.equal(canPreviewInBrowser({ name: 'clip.mov', media_kind: 'video' }), true)
  assert.equal(canPreviewInBrowser({ name: 'archive/sample.MKV', media_kind: 'video' }), true)
})

test('canPreviewInBrowser allows storage host images beyond the common web image list', () => {
  assert.equal(canPreviewInBrowser({ name: 'camera.heic', media_kind: 'image' }), true)
  assert.equal(canPreviewInBrowser({ name: 'scan.TIFF', media_kind: 'image' }), true)
})

test('canPreviewInBrowser allows storage host audio and document previews', () => {
  assert.equal(canPreviewInBrowser({ name: 'track.mp3', media_kind: 'audio' }), true)
  assert.equal(canPreviewInBrowser({ name: 'audio.wav', media_kind: 'audio' }), true)
  assert.equal(canPreviewInBrowser({ name: 'manual.pdf', media_kind: 'document' }), true)
  assert.equal(canPreviewInBrowser({ name: 'config.json', media_kind: 'document' }), true)
  assert.equal(canPreviewInBrowser({ name: 'program.bin', media_kind: null }), false)
})

test('encodeStoragePathForRoute keeps slash-separated exact storage paths readable', () => {
  assert.equal(encodeStoragePathForRoute('folder/sub folder/clip.mov'), 'folder/sub%20folder/clip.mov')
})

test('buildStorageMediaUrl uses exact path routes and attaches st token when provided', () => {
  const url = buildStorageMediaUrl('file', {
    path: 'folder/sub folder/clip.mov',
    access_token: 'secret-token',
  })

  assert.equal(url, '/api/admin/storage/file/raw/folder/sub%20folder/clip.mov?st=secret-token')
  assert.equal(url.includes('path='), false)
  assert.equal(url.includes('st=secret-token'), true)
})

test('media grid opens folders with a small first thumbnail batch', () => {
  assert.ok(INITIAL_MEDIA_RENDER_LIMIT <= 60)
  assert.ok(MEDIA_RENDER_STEP <= 60)
  assert.ok(VIDEO_THUMB_WIDTH <= 480)
  assert.ok(VIDEO_THUMB_QUALITY <= 80)
})

test('fullscreen video preview avoids generating an extra video thumbnail before playback', () => {
  assert.equal(getStorageFullscreenPreviewUrl({ path: 'folder/clip.mov', media_kind: 'video' }), '')

  const imageUrl = getStorageFullscreenPreviewUrl({ path: 'folder/photo.jpg', media_kind: 'image' })
  assert.equal(imageUrl, '/api/admin/storage/thumb/raw/folder/photo.jpg?w=1920&q=85')
})
