import Link from 'next/link'
import { ArrowLeft, SearchX } from 'lucide-react'

export default function NotFound() {
  return <main className="global-not-found">
    <section className="global-state-card">
      <span className="global-state-icon"><SearchX size={28} aria-hidden="true" /></span>
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>ไม่พบหน้าที่ต้องการ</h1>
      <p>ลิงก์นี้อาจเป็น bookmark เก่าหรือหน้าที่ไม่มีใน CareLink เวอร์ชันปัจจุบัน</p>
      <Link className="button primary large" href="/"><ArrowLeft size={17} aria-hidden="true" />กลับหน้าเริ่มต้น</Link>
    </section>
  </main>
}
