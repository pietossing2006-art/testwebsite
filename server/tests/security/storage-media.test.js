import test from 'node:test'
import assert from 'node:assert/strict'

import * as storage from '../../lib/storage.js'

test('buildStorageVideoThumbFfmpegArgs restricts ffmpeg input protocols to local file and pipe', () => {
  const args = storage.buildStorageVideoThumbFfmpegArgs({
    inputPath: 'C:\\uploads\\clip.mp4',
    width: 240,
    ffmpegQ: 8,
  })

  const whitelistIndex = args.indexOf('-protocol_whitelist')
  const inputIndex = args.indexOf('-i')

  assert.ok(whitelistIndex >= 0)
  assert.ok(inputIndex > whitelistIndex)
  assert.equal(args[whitelistIndex + 1], 'file,pipe')
  assert.equal(args[inputIndex + 1], 'C:\\uploads\\clip.mp4')
  assert.equal(args.join(',').includes('http'), false)
  assert.equal(args.join(',').includes('concat'), false)
  assert.equal(args.join(',').includes('subfile'), false)
})
