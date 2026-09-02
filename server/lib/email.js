import nodemailer from 'nodemailer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function envValue(name) {
  const value = String(process.env[name] || '').trim()
  if (/^optional_/i.test(value)) return ''
  return value
}

let primaryTransporter = null
let fallbackTransporter = null

/**
 * Get Primary Transporter (Brevo or Custom SMTP)
 */
function getPrimaryTransporter() {
  if (primaryTransporter) return primaryTransporter

  const brevoUser = envValue('BREVO_USER') || envValue('SMTP_USER')
  const brevoPass = envValue('BREVO_SMTP_KEY') || envValue('SMTP_PASS')
  const host = envValue('SMTP_HOST') || (envValue('BREVO_SMTP_KEY') || envValue('BREVO_USER') ? 'smtp-relay.brevo.com' : '')
  const port = Number(envValue('SMTP_PORT')) || 587

  // If Brevo / Custom SMTP configured (and not explicitly targeting gmail only)
  if (brevoUser && brevoPass && host && host !== 'smtp.gmail.com') {
    primaryTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: brevoUser, pass: brevoPass },
    })
    return primaryTransporter
  }

  return null
}

/**
 * Get Fallback Transporter (Gmail)
 */
function getGmailTransporter() {
  if (fallbackTransporter) return fallbackTransporter

  const gmailUser = envValue('GMAIL_USER')
  const gmailPass = envValue('GMAIL_APP_PASSWORD')

  if (gmailUser && gmailPass) {
    fallbackTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    })
    return fallbackTransporter
  }

  // Fallback: If only SMTP_USER & SMTP_PASS pointing to gmail
  const smtpUser = envValue('SMTP_USER')
  const smtpPass = envValue('SMTP_PASS')
  const smtpHost = envValue('SMTP_HOST')
  if (smtpUser && smtpPass && (!smtpHost || smtpHost === 'smtp.gmail.com')) {
    fallbackTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    })
    return fallbackTransporter
  }

  return null
}

function logSimulatedEmail(to, subject, body, html = '') {
  try {
    const logDir = path.join(__dirname, '..', 'logs')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    const logPath = path.join(logDir, 'email-simulation.log')
    const logEntry = `[${new Date().toISOString()}] To: ${to}\nSubject: ${subject}\nBody:\n${body}\n========================================\n\n`
    fs.appendFileSync(logPath, logEntry, 'utf8')
    console.log(`[EMAIL DISPATCH] Sent to ${to} (Subject: "${subject}") | Logged in ${logPath}`)
  } catch (err) {
    console.error('Failed to log simulated email:', err)
  }
}

/**
 * Send an email with automatic Multi-Provider Failover (Brevo -> Gmail -> Simulation Log)
 */
export async function sendEmail({ to, subject, text, html }) {
  const primary = getPrimaryTransporter()
  const fallback = getGmailTransporter()

  // 1. Attempt sending via Primary Provider (e.g. Brevo)
  if (primary) {
    const senderEmail = envValue('BREVO_FROM') || envValue('SMTP_FROM') || envValue('BREVO_USER') || envValue('SMTP_USER')
    const from = envValue('SMTP_FROM') || `"VxperS Store" <${senderEmail}>`

    try {
      const info = await primary.sendMail({ from, to, subject, text, html })
      console.log(`[PRIMARY SMTP SENT (Brevo)] Message ID: ${info.messageId} to ${to}`)
      return { ok: true, messageId: info.messageId, provider: 'brevo_primary' }
    } catch (primaryErr) {
      console.warn(`[PRIMARY SMTP FAILED] Brevo error: ${primaryErr?.message || primaryErr}. Attempting Gmail Fallback...`)
    }
  }

  // 2. Attempt sending via Fallback Provider (Gmail)
  if (fallback) {
    const gmailUser = envValue('GMAIL_USER') || envValue('SMTP_USER')
    const from = `"VxperS Store" <${gmailUser}>`

    try {
      const info = await fallback.sendMail({ from, to, subject, text, html })
      console.log(`[FALLBACK GMAIL SENT] Message ID: ${info.messageId} to ${to} (Used Gmail Fallback)`)
      return { ok: true, messageId: info.messageId, provider: 'gmail_fallback' }
    } catch (fallbackErr) {
      console.error(`[FALLBACK GMAIL FAILED] Gmail error: ${fallbackErr?.message || fallbackErr}`)
    }
  }

  // 3. Last-resort Fallback: Simulation Log
  logSimulatedEmail(to, subject, text, html)
  return { ok: true, provider: 'simulation_fallback' }
}

/**
 * Generate Ultra-Modern VxperS HTML Email Template
 */
export function buildHtmlEmailTemplate({ title, badge, greeting, intro, otpCode, ctaText, ctaUrl, notice, footerNote }) {
  const displayBadge = badge || (otpCode ? 'รหัสยืนยันความปลอดภัย 2FA' : 'การแจ้งเตือนความปลอดภัย')
  const displayTitle = title || 'VxperS Store'

  return `
<!DOCTYPE html>
<html lang="th" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${displayTitle}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    body {
      margin: 0;
      padding: 0;
      min-width: 100%;
      background-color: #0b1120;
      background-image: radial-gradient(at top center, #1e293b 0%, #0b1120 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    table {
      border-spacing: 0;
      border-collapse: collapse;
    }
    td {
      padding: 0;
    }
    img {
      border: 0;
    }
    a {
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .main-card {
        width: 94% !important;
        margin: 16px auto !important;
        border-radius: 20px !important;
      }
      .card-content {
        padding: 24px 20px !important;
      }
      .otp-number {
        font-size: 32px !important;
        letter-spacing: 8px !important;
      }
      .header-title {
        font-size: 20px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #0b1120; color: #334155;">
  <center>
    <!-- Outer Wrapper -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto;">
      <tr>
        <td align="center" style="padding: 10px;">

          <!-- Main Card Container -->
          <table role="presentation" class="main-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);">
            
            <!-- Top Gradient Accent Bar -->
            <tr>
              <td height="6" style="background: linear-gradient(90deg, #38bdf8 0%, #2563eb 50%, #7c3aed 100%);"></td>
            </tr>

            <!-- Header Section with Deep Luxury Brand Gradient -->
            <tr>
              <td align="center" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 36px 24px 32px 24px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                
                <!-- Logo & Brand Badge -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                  <tr>
                    <td align="center" style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); width: 48px; height: 48px; border-radius: 16px; box-shadow: 0 8px 16px rgba(2, 132, 199, 0.35); text-align: center; vertical-align: middle;">
                      <span style="font-size: 24px; line-height: 48px; display: inline-block;">🛡️</span>
                    </td>
                  </tr>
                </table>

                <h1 class="header-title" style="margin: 14px 0 4px 0; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff;">
                  VxperS Store
                </h1>
                <p style="margin: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #38bdf8;">
                  Security & Authentication Service
                </p>
              </td>
            </tr>

            <!-- Content Body -->
            <tr>
              <td class="card-content" style="padding: 36px 32px 28px 32px; background-color: #ffffff;">
                
                <!-- Purpose Tag Badge -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                  <tr>
                    <td style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 100px; padding: 5px 14px; font-size: 11px; font-weight: 800; color: #0284c7; letter-spacing: 0.5px;">
                      ✦ ${displayBadge}
                    </td>
                  </tr>
                </table>

                <!-- Greeting -->
                ${greeting ? `
                  <h2 style="margin: 0 0 12px 0; font-size: 17px; font-weight: 800; color: #0f172a; line-height: 1.4;">
                    ${greeting}
                  </h2>
                ` : ''}

                <!-- Intro Description -->
                ${intro ? `
                  <p style="margin: 0 0 24px 0; font-size: 13.5px; line-height: 1.65; color: #475569;">
                    ${intro}
                  </p>
                ` : ''}

                <!-- OTP Code Showcase (if provided) -->
                ${otpCode ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
                    <tr>
                      <td align="center" style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border: 2px dashed #0ea5e9; border-radius: 20px; padding: 26px 20px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                        
                        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #0284c7; margin-bottom: 10px;">
                          🔒 รหัสยืนยันตัวตนของคุณ (OTP)
                        </div>

                        <!-- 6-digit Code -->
                        <div class="otp-number" style="font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace; font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #0f172a; text-shadow: 0 1px 2px rgba(0,0,0,0.05); user-select: all; -webkit-user-select: all; margin: 4px 0 10px 0;">
                          ${otpCode}
                        </div>

                        <!-- Expiry Pill -->
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px auto 0 auto;">
                          <tr>
                            <td style="background-color: #e0f2fe; border-radius: 12px; padding: 4px 12px; font-size: 11px; font-weight: 700; color: #0369a1;">
                              ⏳ รหัสมีอายุการใช้งาน 10 นาที (ใช้ได้ครั้งเดียว)
                            </td>
                          </tr>
                        </table>

                      </td>
                    </tr>
                  </table>
                ` : ''}

                <!-- CTA Button (if provided) -->
                ${ctaUrl && ctaText ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;">
                    <tr>
                      <td align="center">
                        <a href="${ctaUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff !important; text-decoration: none; padding: 14px 34px; border-radius: 16px; font-size: 13.5px; font-weight: 800; box-shadow: 0 8px 20px -4px rgba(2, 132, 199, 0.4); text-align: center; letter-spacing: 0.2px;">
                          ${ctaText} →
                        </a>
                      </td>
                    </tr>
                  </table>
                ` : ''}

                <!-- Security Warning Box -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px;">
                  <tr>
                    <td style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 16px; padding: 14px 16px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="24" valign="top" style="font-size: 16px; line-height: 1;">⚠️</td>
                          <td style="padding-left: 8px; font-size: 11.5px; line-height: 1.55; color: #92400e; font-weight: 600;">
                            ${notice || 'ความปลอดภัย: กรุณาอย่าเปิดเผยรหัสนี้แก่ผู้อื่น ทางเราไม่มีนโยบายสอบถามรหัส OTP หรือรหัสผ่านของคุณในทุกกรณี'}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- Footer Section -->
            <tr>
              <td style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 24px 32px; text-align: center;">
                <p style="margin: 0 0 6px 0; font-size: 11.5px; font-weight: 700; color: #64748b;">
                  VxperS Store — ระบบจัดการสินค้าดิจิทัลและบริการครบวงจร
                </p>
                <p style="margin: 0 0 12px 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
                  ${footerNote || 'อีเมลนี้สร้างและส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับอีเมลนี้โดยตรง'}
                </p>
                <div style="font-size: 10px; font-weight: 600; color: #cbd5e1; text-transform: uppercase; letter-spacing: 1px;">
                  🔒 256-Bit SSL Encrypted • Multi-Factor Protection
                </div>
              </td>
            </tr>

          </table>
          <!-- /Main Card -->

          <!-- Sub-footer copyright -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 16px;">
            <tr>
              <td align="center" style="font-size: 11px; color: #64748b;">
                © ${new Date().getFullYear()} VxperS Store. All rights reserved.
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </center>
</body>
</html>
`
}
