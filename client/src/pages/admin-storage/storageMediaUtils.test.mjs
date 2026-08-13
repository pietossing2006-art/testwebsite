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

test('encodeStoragePathForRoute keeps slash-separated exact storage paths readable', () => {
  assert.equal(encodeStoragePathForRoute('folder/sub folder/clip.mov'), 'folder/sub%20folder/clip.mov')
})

test('buildStorageMediaUrl uses exact path routes without exposing storage tokens', () => {
  const url = buildStorageMediaUrl('file', {
    path: 'folder/sub folder/clip.mov',
    access_token: 'secret-token',
  })

  assert.equal(url, '/api/admin/storage/file/raw/folder/sub%20folder/clip.mov')
  assert.equal(url.includes('path='), false)
  assert.equal(url.includes('st='), false)
  assert.equal(url.includes('secret-token'), false)
})

test('media grid opens folders with a small first thumbnail batch', () => {
  assert.ok(INITIAL_MEDIA_RENDER_LIMIT <= 60)
  assert.ok(MEDIA_RENDER_STEP <= 60)
  assert.ok(VIDEO_THUMB_WIDTH <= 180)
  assert.ok(VIDEO_THUMB_QUALITY <= 42)
})

test('fullscreen video preview avoids generating an extra video thumbnail before playback', () => {
  assert.equal(getStorageFullscreenPreviewUrl({ path: 'folder/clip.mov', media_kind: 'video' }), '')

  const imageUrl = getStorageFullscreenPreviewUrl({ path: 'folder/photo.jpg', media_kind: 'image' })
  assert.equal(imageUrl, '/api/admin/storage/thumb/raw/folder/photo.jpg?w=1280&q=80')
})
