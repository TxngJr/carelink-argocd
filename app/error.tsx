'use client'

import { RefreshCw, TriangleAlert } from 'lucide-react'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="global-error">
    <section className="global-state-card" role="alert">
      <span className="global-state-icon"><TriangleAlert size={28} aria-hidden="true" /></span>
      <h1>หน้าจอนี้ทำงานไม่สำเร็จ</h1>
      <p>ข้อมูลของคุณยังอยู่ในระบบ ลองโหลดส่วนนี้ใหม่อีกครั้ง หากยังเกิดปัญหาให้กลับไปหน้าหลักของบทบาทแล้วลองใหม่</p>
      <button className="button primary large" onClick={reset}><RefreshCw size={17} aria-hidden="true" />ลองอีกครั้ง</button>
    </section>
  </main>
}
