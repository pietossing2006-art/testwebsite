import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'

import { sanitizeAvatarImage } from '../../lib/image.js'

test('sanitizeAvatarImage re-encodes image data and strips trailing payload bytes', async () => {
  const image = await sharp({
    create: {
      width: 24,
      height: 18,
      channels: 3,
      background: { r: 90, g: 120, b: 240 },
    },
  })
    .png()
    .toBuffer()

  const payload = Buffer.from('POLYGLOT_PAYLOAD:<?php echo "owned"; ?>')
  const polyglot = Buffer.concat([image, payload])

  const sanitized = await sanitizeAvatarImage({ buffer: polyglot, ext: 'png' })

  assert.equal(sanitized.ext, 'png')
  assert.equal(sanitized.buffer.includes(payload), false)

  const metadata = await sharp(sanitized.buffer).metadata()
  assert.equal(metadata.format, 'png')
  assert.ok(metadata.width <= 512)
  assert.ok(metadata.height <= 512)
})
