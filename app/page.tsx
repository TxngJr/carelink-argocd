import Link from 'next/link'
import { pageSession } from '@/lib/server/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await pageSession()
  if (session?.role === 'nurse') redirect('/nurse')
  if (session?.role === 'doctor') redirect('/doctor')
  if (session?.role === 'patient') redirect('/patient')

  return <main className="landing-page">
    <div className="landing-glow one"/><div className="landing-glow two"/>
    <section className="landing-card">
      <div className="brand-row"><img src="/logo-mark.svg" alt="" width={50} height={50}/><div><strong>CareLink</strong><span>Connected Patient Journey</span></div></div>
      <div className="landing-copy"><span className="eyebrow">GRADUATION PROJECT PROTOTYPE</span><h1>หนึ่งระบบสำหรับ<br/>ทุกขั้นตอนการรักษา</h1><p>รวมการนัดหมาย การเช็กอิน การจัดการคิว และการติดตามเส้นทางผู้ป่วยไว้ใน Next.js Web App เดียว</p></div>
      <div className="portal-grid">
        <Link className="portal-card staff" href="/login/nurse"><span className="portal-icon">✚</span><div><small>สำหรับบุคลากร</small><strong>พยาบาล / แพทย์</strong><p>จัดการนัดหมาย คิว และเส้นทางการรักษา</p></div><b>→</b></Link>
        <Link className="portal-card patient" href="/login/patient"><span className="portal-icon">♥</span><div><small>สำหรับผู้รับบริการ</small><strong>ผู้ป่วย</strong><p>ขอนัด ติดตามคิว และรับการแจ้งเตือน</p></div><b>→</b></Link>
      </div>
    </section>
  </main>
}
