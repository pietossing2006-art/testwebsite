export function getAvatarExtensionByMime(mime) {
  const m = String(mime || '').trim().toLowerCase()
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/png') return 'png'
  if (m === 'image/webp') return 'webp'
  return null
}

export function decodeDataUrlImage(input) {
  const raw = typeof input === 'string' ? input.trim() : ''
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\n\r]+)$/.exec(raw)
  if (!m) throw new Error('invalid_image_data')
  const mime = String(m[1] || '').toLowerCase()
  const ext = getAvatarExtensionByMime(mime)
  if (!ext) throw new Error('unsupported_image_type')
  const base64 = String(m[2] || '').replace(/[\n\r\s]/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer || buffer.length < 1) throw new Error('invalid_image_data')
  if (ext === 'jpg' && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) {
    throw new Error('invalid_image_data')
  }
  if (ext === 'png' && !(buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)) {
    throw new Error('invalid_image_data')
  }
  if (ext === 'webp' && !(buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP')) {
    throw new Error('invalid_image_data')
  }
  return { buffer, ext }
}
