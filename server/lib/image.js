import sharp from 'sharp'

const AVATAR_MAX_DIMENSION = 512
const AVATAR_INPUT_PIXEL_LIMIT = 24_000_000

export function getAvatarExtensionByMime(mime) {
  const m = String(mime || '').trim().toLowerCase()
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/png') return 'png'
  if (m === 'image/webp') return 'webp'
  if (m === 'image/gif') return 'gif'
  if (m === 'image/avif') return 'avif'
  return null
}

export function decodeDataUrlImage(input) {
  const raw = typeof input === 'string' ? input.trim() : ''
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i.exec(raw)
  if (!m) {
    // If raw base64 without prefix
    const base64 = raw.replace(/[\n\r\s]/g, '')
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer || buffer.length < 1) throw new Error('invalid_image_data')
    return { buffer, ext: 'webp' }
  }

  const mime = String(m[1] || '').toLowerCase()
  const ext = getAvatarExtensionByMime(mime) || 'webp'
  const base64 = String(m[2] || '').replace(/[\n\r\s]/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer || buffer.length < 1) throw new Error('invalid_image_data')
  return { buffer, ext }
}

export async function sanitizeAvatarImage({ buffer, ext }) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) throw new Error('invalid_image_data')

  try {
    const targetExt = ext === 'png' ? 'png' : 'webp'
    const pipeline = sharp(buffer, { limitInputPixels: AVATAR_INPUT_PIXEL_LIMIT, failOn: 'none' })
      .rotate()
      .resize({
        width: AVATAR_MAX_DIMENSION,
        height: AVATAR_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })

    const sanitized =
      targetExt === 'png'
        ? await pipeline.png({ compressionLevel: 8 }).toBuffer()
        : await pipeline.webp({ quality: 85 }).toBuffer()
    if (!sanitized.length) throw new Error('invalid_image_data')
    return { buffer: sanitized, ext: targetExt }
  } catch {
    throw new Error('invalid_image_data')
  }
}

export async function sanitizeProductImage({ buffer }) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) throw new Error('invalid_image_data')

  try {
    const pipeline = sharp(buffer, { limitInputPixels: 48_000_000, failOn: 'none' })
      .rotate()
      .resize({
        width: 2560,
        height: 2560,
        fit: 'inside',
        withoutEnlargement: true,
      })

    const sanitized = await pipeline.webp({ quality: 90 }).toBuffer()
    if (!sanitized.length) throw new Error('invalid_image_data')
    return { buffer: sanitized, ext: 'webp' }
  } catch {
    throw new Error('invalid_image_data')
  }
}
