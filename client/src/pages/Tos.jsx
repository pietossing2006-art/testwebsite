import { useEffect, useState } from 'react'
import { fetchJson } from '../api.js'

const DEFAULT_TOS = `<section>
<div class="text-sm font-extrabold text-white">1) การยอมรับเงื่อนไข</div>
<div class="mt-2">การใช้งานเว็บไซต์นี้ถือว่าคุณยอมรับและตกลงปฏิบัติตามเงื่อนไขการใช้งานฉบับนี้ทั้งหมด</div>
</section>
<section>
<div class="text-sm font-extrabold text-white">2) บัญชีผู้ใช้</div>
<div class="mt-2">คุณมีหน้าที่รับผิดชอบในการรักษาความปลอดภัยของบัญชี รหัสผ่าน และกิจกรรมทั้งหมดที่เกิดขึ้นภายใต้บัญชีของคุณ</div>
</section>
<section>
<div class="text-sm font-extrabold text-white">3) การเติมพ้อย / การชำระเงิน</div>
<div class="mt-2">การเติมพ้อยอาจใช้เวลาตรวจสอบตามช่องทางการชำระเงิน เมื่อทำรายการแล้วกรุณาตรวจสอบสถานะในหน้า "ประวัติการเติมเงิน"</div>
</section>
<section>
<div class="text-sm font-extrabold text-white">4) การคืนเงิน</div>
<div class="mt-2">นโยบายการคืนเงินอาจแตกต่างกันตามประเภทสินค้าและช่องทางการชำระเงิน โปรดติดต่อทีมงานเพื่อขอข้อมูลเพิ่มเติม</div>
</section>
<section>
<div class="text-sm font-extrabold text-white">5) ข้อจำกัดความรับผิด</div>
<div class="mt-2">เว็บไซต์จะไม่รับผิดชอบต่อความเสียหายทางอ้อม ความเสียหายที่เกิดจากการใช้งาน หรือการหยุดให้บริการชั่วคราว</div>
</section>
<section>
<div class="text-sm font-extrabold text-white">6) การเปลี่ยนแปลงเงื่อนไข</div>
<div class="mt-2">เราอาจปรับปรุงเงื่อนไขการใช้งานได้เป็นครั้งคราว โดยจะมีผลเมื่อประกาศบนหน้านี้</div>
</section>
<section>
<div class="text-sm font-extrabold text-white">ติดต่อเรา</div>
<div class="mt-2">หากมีคำถามเกี่ยวกับเงื่อนไขการใช้งาน กรุณาติดต่อทีมงานผ่านช่องทางที่ระบุบนเว็บไซต์</div>
</section>`

export default function Tos() {
  const [content, setContent] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchJson('/api/ui-settings')
        const tos = String(data?.site_settings?.tos_content ?? '').trim()
        if (!cancelled) setContent(tos || null)
      } catch {
        if (!cancelled) setContent(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const html = content || DEFAULT_TOS

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-white/10 surface p-6">
        <div className="text-2xl font-black text-white">เงื่อนไขการใช้งาน (Terms of Service)</div>
        <div className="mt-2 text-sm text-white/60">อัปเดตล่าสุด: {new Date().toLocaleDateString()}</div>
        <div className="mt-6 space-y-5 text-sm leading-7 text-white/75" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
