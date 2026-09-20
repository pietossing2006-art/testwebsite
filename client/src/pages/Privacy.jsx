import { useEffect, useState } from 'react'
import { fetchJson } from '../api.js'

const DEFAULT_PRIVACY = `<section>
<div class="text-sm font-extrabold text-slate-900">1) ข้อมูลที่เราเก็บรวบรวม</div>
<div class="mt-1 text-slate-600">เราเก็บข้อมูลที่จำเป็นต่อการให้บริการเท่านั้น ได้แก่ ชื่อผู้ใช้ อีเมล รูปโปรไฟล์ ประวัติการเติมพ้อยและการสั่งซื้อ รวมถึงข้อมูลทางเทคนิค เช่น หมายเลข IP และชนิดของเบราว์เซอร์ เพื่อความปลอดภัยของบัญชี</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">2) การเข้าสู่ระบบด้วยบัญชีภายนอก (Google / Discord)</div>
<div class="mt-1 text-slate-600">เมื่อคุณเลือกเข้าสู่ระบบด้วย Google เราจะได้รับเฉพาะ รหัสประจำตัวบัญชี (account ID) อีเมล ชื่อที่แสดง และรูปโปรไฟล์ จากบัญชีของคุณเท่านั้น เพื่อใช้สร้างและระบุตัวตนบัญชีบนเว็บไซต์ เราไม่ได้รับและไม่สามารถเข้าถึงรหัสผ่าน Gmail รายชื่อผู้ติดต่อ ไฟล์ หรือข้อมูลอื่นใดในบัญชี Google ของคุณ และหลักการเดียวกันนี้ใช้กับการเข้าสู่ระบบด้วย Discord</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">3) วัตถุประสงค์ในการใช้ข้อมูล</div>
<div class="mt-1 text-slate-600">เราใช้ข้อมูลของคุณเพื่อยืนยันตัวตนและรักษาสถานะการเข้าสู่ระบบ ดำเนินการสั่งซื้อและเติมพ้อย แจ้งเตือนสถานะคำสั่งซื้อ ให้บริการช่วยเหลือหลังการขาย และป้องกันการทุจริตหรือการใช้งานที่ผิดเงื่อนไข</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">4) คุกกี้</div>
<div class="mt-1 text-slate-600">เราใช้คุกกี้ที่จำเป็นต่อการทำงานของระบบ เช่น คุกกี้เก็บ session สำหรับคงสถานะการเข้าสู่ระบบ คุณสามารถจัดการความยินยอมเรื่องคุกกี้ได้จากแถบแจ้งเตือนบนเว็บไซต์ แต่การปิดคุกกี้ที่จำเป็นจะทำให้ไม่สามารถเข้าสู่ระบบได้</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">5) การเปิดเผยข้อมูลแก่บุคคลที่สาม</div>
<div class="mt-1 text-slate-600">เราไม่ขายและไม่ให้เช่าข้อมูลส่วนบุคคลของคุณ เราเปิดเผยข้อมูลเท่าที่จำเป็นให้แก่ผู้ให้บริการที่ช่วยเราดำเนินงานเท่านั้น เช่น ผู้ให้บริการชำระเงิน ผู้ให้บริการส่งอีเมล และผู้ให้บริการโครงสร้างพื้นฐาน หรือเมื่อมีหน้าที่ต้องปฏิบัติตามกฎหมาย</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">6) ระยะเวลาการเก็บรักษาข้อมูล</div>
<div class="mt-1 text-slate-600">เราเก็บข้อมูลบัญชีไว้ตลอดระยะเวลาที่บัญชีของคุณยังใช้งานอยู่ และเก็บข้อมูลธุรกรรมตามระยะเวลาที่กฎหมายกำหนด เมื่อพ้นกำหนดเราจะลบหรือทำให้ข้อมูลไม่สามารถระบุตัวบุคคลได้</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">7) ความปลอดภัยของข้อมูล</div>
<div class="mt-1 text-slate-600">รหัสผ่านถูกจัดเก็บในรูปแบบที่เข้ารหัสทางเดียว การเชื่อมต่อทั้งหมดใช้ HTTPS และเรามีระบบยืนยันตัวตนสองชั้น (2FA) รวมถึงการจำกัดจำนวนครั้งการเข้าสู่ระบบที่ผิดพลาด เพื่อป้องกันการเข้าถึงบัญชีโดยไม่ได้รับอนุญาต</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">8) สิทธิของเจ้าของข้อมูล</div>
<div class="mt-1 text-slate-600">คุณมีสิทธิขอเข้าถึง ขอแก้ไข ขอลบข้อมูลส่วนบุคคล ขอถอนความยินยอม หรือขอยกเลิกการเชื่อมต่อบัญชี Google / Discord ได้ตลอดเวลา โดยติดต่อทีมงานผ่านช่องทางที่ระบุบนเว็บไซต์ หรือจัดการได้เองจากหน้าโปรไฟล์</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">9) การเปลี่ยนแปลงนโยบาย</div>
<div class="mt-1 text-slate-600">เราอาจปรับปรุงนโยบายความเป็นส่วนตัวฉบับนี้เป็นครั้งคราว โดยจะมีผลทันทีเมื่อประกาศบนหน้านี้</div>
</section>
<section>
<div class="text-sm font-extrabold text-slate-900">ติดต่อเรา</div>
<div class="mt-1 text-slate-600">หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัว หรือต้องการใช้สิทธิของเจ้าของข้อมูล กรุณาติดต่อทีมงานผ่านช่องทางที่ระบุบนเว็บไซต์</div>
</section>`

export default function Privacy() {
  const [content, setContent] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchJson('/api/ui-settings')
        const privacy = String(data?.site_settings?.privacy_content ?? '').trim()
        if (!cancelled) setContent(privacy || null)
      } catch {
        if (!cancelled) setContent(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const html = content || DEFAULT_PRIVACY

  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="rounded-3xl border border-sky-200 bg-white p-7 shadow-sm">
        <div className="text-2xl font-black text-slate-900">นโยบายความเป็นส่วนตัว (Privacy Policy)</div>
        <div className="mt-1 text-xs text-slate-400">อัปเดตล่าสุด: {new Date().toLocaleDateString('th-TH')}</div>
        <div className="mt-6 space-y-4 text-xs leading-relaxed text-slate-600" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
