import { generateSecret, generateURI, verifySync } from 'otplib'
import QRCode from 'qrcode'
import crypto from 'node:crypto'

const ISSUER_NAME = 'VxperS Store'

/**
 * Generate a new random Base32 secret for TOTP
 */
export function generateTotpSecret() {
  return generateSecret()
}

/**
 * Generate OTPAuth URI (otpauth://totp/...)
 */
export function generateTotpUri({ email, secret, issuer = ISSUER_NAME }) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  return generateURI({
    issuer,
    label: cleanEmail,
    secret,
  })
}

/**
 * Generate Data URL for QR Code image
 */
export async function generateTotpQrDataUrl(otpAuthUri) {
  return QRCode.toDataURL(otpAuthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  })
}

/**
 * Verify a 6-digit TOTP token against a secret
 */
export function verifyTotpToken({ token, secret }) {
  const cleanToken = String(token || '').trim().replace(/\s+/g, '')
  const cleanSecret = String(secret || '').trim()

  if (!cleanToken || !cleanSecret) return false

  try {
    const result = verifySync({
      token: cleanToken,
      secret: cleanSecret,
      window: 1, // +- 30s drift tolerance
    })
    return Boolean(result?.valid)
  } catch (err) {
    console.error('[TOTP VERIFY ERROR]', err?.message || err)
    return false
  }
}

/**
 * Generate 8 human-readable backup recovery codes (e.g. "A1B2-C3D4")
 */
export function generateBackupCodes(count = 8) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const plainCodes = []
  const hashedCodes = []

  for (let i = 0; i < count; i++) {
    let part1 = ''
    let part2 = ''
    for (let j = 0; j < 4; j++) {
      part1 += chars.charAt(crypto.randomInt(0, chars.length))
      part2 += chars.charAt(crypto.randomInt(0, chars.length))
    }
    const code = `${part1}-${part2}`
    plainCodes.push(code)

    const hash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex')
    hashedCodes.push(hash)
  }

  return { plainCodes, hashedCodes }
}

/**
 * Verify and consume a single-use backup code
 */
export function verifyAndConsumeBackupCode(inputCode, hashedCodesArray = []) {
  if (!inputCode || !Array.isArray(hashedCodesArray) || hashedCodesArray.length === 0) {
    return { valid: false }
  }

  const cleanInput = String(inputCode).trim().toUpperCase().replace(/\s+/g, '')
  const normalizedWithDash = cleanInput.length === 8 && !cleanInput.includes('-')
    ? `${cleanInput.slice(0, 4)}-${cleanInput.slice(4)}`
    : cleanInput

  const inputHash = crypto.createHash('sha256').update(normalizedWithDash).digest('hex')
  const index = hashedCodesArray.findIndex((h) => h === inputHash)

  if (index === -1) {
    return { valid: false }
  }

  const remainingHashedCodes = [...hashedCodesArray]
  remainingHashedCodes.splice(index, 1)

  return {
    valid: true,
    remainingCount: remainingHashedCodes.length,
    remainingHashedCodes,
  }
}
