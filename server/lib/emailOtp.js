import crypto from 'node:crypto'
import { redis } from './redis.js'
import { sendEmail, buildHtmlEmailTemplate } from './email.js'

const memoryOtpStore = new Map()
const memoryOtpAttempts = new Map()

const OTP_TTL_SECONDS = 10 * 60 // 10 minutes
const MAX_OTP_ATTEMPTS = 5
const OTP_PURPOSE_TITLES = {
  verify_email: 'ยืนยันที่อยู่อีเมลของคุณ',
  change_password_2fa: 'ยืนยันการเปลี่ยนรหัสผ่าน',
  delete_account_2fa: 'ยืนยันการลบบัญชีผู้ใช้',
  password_reset: 'กู้คืนรหัสผ่าน',
  enable_2fa_email: 'เปิดใช้งานการยืนยัน 2 ขั้นตอน (2FA)',
  login_2fa: 'เข้าสู่ระบบด้วยความปลอดภัย 2 ชั้น (2FA)',
  disable_2fa_email: 'ปิดการใช้งานการยืนยัน 2 ขั้นตอน (2FA)',
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function incrementOtpAttempts(key) {
  if (redis) {
    try {
      const attemptsKey = `${key}:attempts`
      const count = await redis.incr(attemptsKey)
      if (count === 1) await redis.expire(attemptsKey, OTP_TTL_SECONDS)
      return count
    } catch {
      // fall through to memory store
    }
  }
  const now = Date.now()
  const entry = memoryOtpAttempts.get(key)
  const windowValid = entry && entry.expiresAt > now
  const count = (windowValid ? entry.count : 0) + 1
  memoryOtpAttempts.set(key, { count, expiresAt: windowValid ? entry.expiresAt : now + OTP_TTL_SECONDS * 1000 })
  return count
}

async function clearOtpAttempts(key) {
  if (redis) {
    try {
      await redis.del(`${key}:attempts`)
      return
    } catch {
      // ignore
    }
  }
  memoryOtpAttempts.delete(key)
}

async function consumeOtp(key) {
  if (redis) {
    try {
      await redis.del(key)
      return
    } catch {
      // ignore
    }
  }
  memoryOtpStore.delete(key)
}

/**
 * Request and send an OTP code to a user's email
 */
export async function requestEmailOtp({ email, purpose = 'verify_email', accountLabel = 'คุณลูกค้า' }) {
  const normEmail = String(email || '').trim().toLowerCase()
  if (!normEmail || !normEmail.includes('@')) {
    throw new Error('invalid_email')
  }

  const code = generateOtpCode()
  const key = `otp:${purpose}:${normEmail}`

  if (redis) {
    try {
      await redis.set(key, code, 'EX', OTP_TTL_SECONDS)
    } catch {
      memoryOtpStore.set(key, { code, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 })
    }
  } else {
    memoryOtpStore.set(key, { code, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 })
  }

  const title = OTP_PURPOSE_TITLES[purpose] || 'รหัสยืนยันความปลอดภัย OTP'
  const html = buildHtmlEmailTemplate({
    title,
    greeting: `สวัสดีคุณ ${accountLabel},`,
    intro: `คุณได้ส่งคำขอทำรายการ <strong>${title}</strong> บนเว็บไซต์ VxperS Store กรุณานำรหัสยืนยัน 6 หลักด้านล่างนี้ไปกรอกในระบบ:`,
    otpCode: code,
    notice: `รหัสนี้จะหมดอายุภายใน 10 นาที หากคุณไม่ได้เป็นผู้ทำรายการนี้ กรุณาเปลี่ยนรหัสผ่านหรือติดต่อทีมงาน Support ทันที`,
  })

  const text = `สวัสดีคุณ ${accountLabel},\n\nรหัส OTP ของคุณคือ: ${code}\n(รหัสมีอายุ 10 นาที)\n\nทีมงาน VxperS Store`

  await sendEmail({
    to: normEmail,
    subject: `[VxperS] ${code} คือรหัสยืนยันของคุณ (${title})`,
    text,
    html,
  })

  return {
    ok: true,
    email: normEmail,
    expiresInSeconds: OTP_TTL_SECONDS,
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
  }
}

/**
 * Verify an OTP code
 */
export async function verifyEmailOtp({ email, purpose = 'verify_email', code }) {
  const normEmail = String(email || '').trim().toLowerCase()
  const inputCode = String(code || '').trim()

  if (!normEmail || !inputCode) {
    throw new Error('invalid_code')
  }

  const key = `otp:${purpose}:${normEmail}`
  let storedCode = null

  if (redis) {
    try {
      storedCode = await redis.get(key)
    } catch {
      const entry = memoryOtpStore.get(key)
      if (entry && entry.expiresAt > Date.now()) {
        storedCode = entry.code
      }
    }
  } else {
    const entry = memoryOtpStore.get(key)
    if (entry && entry.expiresAt > Date.now()) {
      storedCode = entry.code
    }
  }

  if (!storedCode) {
    throw new Error('otp_expired_or_not_found')
  }

  // Cap guesses against this specific OTP so it can't be brute-forced across
  // its full TTL window, even by rotating source IPs to dodge the route-level
  // rate limit.
  const attempts = await incrementOtpAttempts(key)
  if (attempts > MAX_OTP_ATTEMPTS) {
    await consumeOtp(key)
    throw new Error('otp_too_many_attempts')
  }

  if (storedCode !== inputCode) {
    throw new Error('otp_invalid')
  }

  // Consume OTP (single use)
  await clearOtpAttempts(key)
  await consumeOtp(key)

  return { ok: true, email: normEmail }
}
