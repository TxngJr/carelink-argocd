import Link from 'next/link'
import {
  Activity,
  Calendar,
  ClipboardCheck,
  FlaskConical,
  Heart,
  Layers,
  MapPin,
  Monitor,
  Palette,
  Pill,
  Radio,
  Sparkles,
  Stethoscope,
  Syringe,
  Tv,
  Users,
} from 'lucide-react'
import { pageSession } from '@/lib/server/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await pageSession()
  if (session?.role === 'admin' || session?.role === 'manager') redirect('/operations')
  if (session?.role === 'nurse') redirect('/intake')
  if (session?.role === 'doctor') redirect('/physician')
  if (session?.role === 'patient') redirect('/patient')

  return (
    <main className="landing-page">
      <div className="landing-glow one" />
      <div className="landing-glow two" />
      <section className="landing-card">
        <div className="brand-row">
          <img src="/logo-mark.svg" alt="CareLink Logo" width={52} height={52} />
          <div>
            <strong style={{ fontSize: '1.25rem' }}>CareLink</strong>
            <span style={{ fontSize: '.8rem' }}>AMIS DynaFlow 2.0 Unified Platform</span>
          </div>
        </div>

        <div className="landing-copy">
          <span className="eyebrow">UNIFIED NEXT.JS HEALTHCARE FLOW PLATFORM</span>
          <h1>หนึ่งระบบรวมทุกขั้นตอนการรักษาและการไหลเวียน</h1>
          <p>
            รวมศูนย์ปฏิบัติการ (Operations), เวิร์กสเปซคลินิก 24 สถานี, พอร์ทัลผู้ป่วยบนมือถือ (PWA), จอแสดงผลคิวสาธารณะ (TV) และตู้บริการตนเอง (Kiosk) ไว้ในระบบ Next.js เดียว
          </p>
        </div>

        <div className="portal-grid">
          {/* Staff Login */}
          <Link className="portal-card staff" href="/login/nurse">
            <span className="portal-icon" style={{ background: 'var(--brand)' }}>
              <Stethoscope size={24} />
            </span>
            <div>
              <small>สำหรับบุคลากรการแพทย์</small>
              <strong>เข้าสู่ระบบเจ้าหน้าที่ (Staff Portal)</strong>
              <p>Operations, Nurse, Doctor, Lab, Pharmacy, Chemo, Radiation</p>
            </div>
            <b>→</b>
          </Link>

          {/* Patient Portal */}
          <Link className="portal-card patient" href="/login/patient">
            <span className="portal-icon" style={{ background: 'var(--brand2)' }}>
              <Heart size={24} />
            </span>
            <div>
              <small>สำหรับผู้รับบริการ</small>
              <strong>เข้าสู่ระบบผู้ป่วย (Patient Portal)</strong>
              <p>ติดตามคิวสด, กรอกข้อมูลก่อนมา, คัดกรอง AI, นัดหมาย</p>
            </div>
            <b>→</b>
          </Link>

          {/* Public TV Queue Screen */}
          <Link className="portal-card" href="/tv">
            <span className="portal-icon" style={{ background: '#0b1e1b' }}>
              <Tv size={24} />
            </span>
            <div>
              <small>จอแสดงผลห้องพักคอย</small>
              <strong>Public TV Queue Display</strong>
              <p>จอเรียกคิวขนาดใหญ่พร้อมเสียงกระดิ่ง Chime และเสียงอ่านภาษาไทย (TTS)</p>
            </div>
            <b>→</b>
          </Link>

          {/* Self-Service Kiosk */}
          <Link className="portal-card" href="/kiosk">
            <span className="portal-icon" style={{ background: 'var(--info)' }}>
              <Monitor size={24} />
            </span>
            <div>
              <small>ตู้บริการตนเองหน้าแผนก</small>
              <strong>Self-Service Patient Kiosk</strong>
              <p>ตรวจเช็กสถานะคิว ค้นหาด้วยเบอร์โทร/HN พร้อมระบบตัดสิทธิ์อัตโนมัติ</p>
            </div>
            <b>→</b>
          </Link>
        </div>

        {/* Quick Links Section */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.85rem' }}>
            <Link href="/operations" style={{ color: 'var(--brand)', fontWeight: 600 }}>ศูนย์ปฏิบัติการ (Operations)</Link>
            <span>·</span>
            <Link href="/map" style={{ color: 'var(--brand)', fontWeight: 600 }}>แผนที่ 4 ชั้น (Map)</Link>
            <span>·</span>
            <Link href="/registration" style={{ color: 'var(--brand)', fontWeight: 600 }}>จุดลงทะเบียน (NPR)</Link>
            <span>·</span>
            <Link href="/vitals" style={{ color: 'var(--brand)', fontWeight: 600 }}>วัดสัญญาณชีพ (VM)</Link>
            <span>·</span>
            <Link href="/intake" style={{ color: 'var(--brand)', fontWeight: 600 }}>ซักประวัติ (MHT)</Link>
            <span>·</span>
            <Link href="/physician" style={{ color: 'var(--brand)', fontWeight: 600 }}>ห้องตรวจแพทย์ (PC)</Link>
            <span>·</span>
            <Link href="/lab" style={{ color: 'var(--brand)', fontWeight: 600 }}>ห้องแล็บ (LAB)</Link>
            <span>·</span>
            <Link href="/pharmacy" style={{ color: 'var(--brand)', fontWeight: 600 }}>ห้องยา (PD)</Link>
            <span>·</span>
            <Link href="/chemo" style={{ color: 'var(--brand)', fontWeight: 600 }}>เคมีบำบัด (CHEMO)</Link>
            <span>·</span>
            <Link href="/radiation" style={{ color: 'var(--brand)', fontWeight: 600 }}>รังสีรักษา (RT)</Link>
            <span>·</span>
            <Link href="/__design-system" style={{ color: 'var(--brand)', fontWeight: 600 }}>Design System</Link>
          </div>

          <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
            Prototype Staff Logins: <code>nurse</code> / <code>doctor</code> / <code>admin</code> (PW: <code>password123</code>)
          </div>
        </div>
      </section>
    </main>
  )
}
