import Image from 'next/image'
import { LoaderCircle } from 'lucide-react'

export default function Loading() {
  return <main className="global-loading" role="status" aria-live="polite">
    <section className="global-state-card">
      <Image src="/logo-mark.svg" alt="" width={48} height={48} priority />
      <span className="global-state-icon"><LoaderCircle className="spin" size={28} aria-hidden="true" /></span>
      <h2>กำลังเตรียม CareLink</h2>
      <p>ระบบกำลังโหลดข้อมูลล่าสุดและเตรียมพื้นที่ทำงานของคุณ</p>
    </section>
  </main>
}
