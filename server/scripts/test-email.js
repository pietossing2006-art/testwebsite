import 'dotenv/config'
import { sendEmail, buildHtmlEmailTemplate } from '../lib/email.js'

async function run() {
  console.log('Sending modern redesigned test email...')
  const html = buildHtmlEmailTemplate({
    title: 'ยืนยันรหัสความปลอดภัย 2FA',
    badge: 'รหัสยืนยันความปลอดภัย (2FA OTP)',
    greeting: 'สวัสดีคุณ pastlivesz,',
    intro: 'คุณได้ทำการส่งคำขอยืนยันตัวตนสำหรับเข้าสู่ระบบหรือเปิดใช้งานระบบ 2FA บนเว็บไซต์ VxperS Store กรุณานำรหัส 6 หลักด้านล่างไปกรอกในระบบ:',
    otpCode: '852963',
    notice: 'ความปลอดภัย: รหัสนี้มีอายุการใช้งาน 10 นาที ห้ามส่งต่อรหัสนี้ให้ผู้อื่นเด็ดขาด ทางเจ้าหน้าที่จะไม่มีการขอรหัสผ่านหรือรหัส OTP ของคุณ',
  })

  const res = await sendEmail({
    to: 'pastlivesz.2006@gmail.com',
    subject: '[VxperS] 852963 คือรหัสยืนยันความปลอดภัย 2FA ของคุณ',
    text: 'สวัสดีคุณ pastlivesz,\n\nรหัสยืนยัน 2FA ของคุณคือ: 852963 (มีอายุ 10 นาที)\n\nทีมงาน VxperS Store',
    html,
  })

  console.log('Dispatch result:', res)
}

run().catch(console.error)
