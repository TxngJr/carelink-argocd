import Link from 'next/link'
import Image from 'next/image'
import {
  Heart,
  Monitor,
  Stethoscope,
  Tv,
} from 'lucide-react'
import { pageSession } from '@/lib/server/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await pageSession()
  if (session?.role === 'admin' || session?.role === 'manager') redirect('/operations')
  if (session?.role === 'nurse') redirect('/intake')
  if (session?.role === 'doctor' || session?.role === 'physician') redirect('/physician')
  if (session?.role === 'registration') redirect('/registration')
  if (session?.role === 'vitals_staff') redirect('/vitals')
  if (session?.role === 'lab_staff') redirect('/lab')
  if (session?.role === 'pharmacy_staff') redirect('/pharmacy')
  if (session?.role === 'infusion_staff' || session?.role === 'chemo_staff') redirect('/infusion')
  if (session?.role === 'patient') redirect('/patient')

  return (
    <main className="landing-page">
      <div className="landing-glow one" />
      <div className="landing-glow two" />
      <section className="landing-card">
        <div className="brand-row">
          <Image src="/logo-mark.svg" alt="ตราสัญลักษณ์ CareLink" width={52} height={52} priority />
          <div>
            <strong style={{ fontSize: '1.25rem' }}>CareLink</strong>
            <span style={{ fontSize: '.8rem' }}>ระบบบริหารการรักษาและคิวผู้ป่วยแบบครบวงจร</span>
          </div>
        </div>

        <div className="landing-copy">
          <span className="eyebrow">แพลตฟอร์มบริหารเส้นทางการรักษาแบบครบวงจร</span>
          <h1>หนึ่งระบบรวมทุกขั้นตอนการรักษาและการไหลเวียน</h1>
          <p>
            รวมศูนย์ปฏิบัติการ พื้นที่ทำงานของทีมคลินิก ศูนย์ให้สารน้ำ พอร์ทัลผู้ป่วยบนมือถือ จอแสดงผลคิว และตู้บริการตนเองไว้ในระบบเดียว
          </p>
          <div className="inline-alert warning" role="note"><strong>Public Sandbox:</strong> ข้อมูลทั้งหมดเป็นข้อมูลสังเคราะห์ ผู้ทดสอบใช้บัญชีและข้อมูลร่วมกัน และข้อมูลสาธิตจะคงอยู่จนกว่าผู้ดูแลระบบจะรีเซ็ต</div>
        </div>

        <div className="portal-grid">
          {/* Staff Login */}
          <Link className="portal-card staff" href="/login/nurse">
            <span className="portal-icon" style={{ background: 'var(--brand)' }}>
              <Stethoscope size={24} />
            </span>
            <div>
              <small>สำหรับบุคลากรการแพทย์</small>
              <strong>เข้าสู่ระบบเจ้าหน้าที่</strong>
              <p>ศูนย์ปฏิบัติการ พยาบาล แพทย์ ห้องปฏิบัติการ ห้องยา และศูนย์ให้สารน้ำ</p>
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
              <strong>เข้าสู่ระบบผู้ป่วย</strong>
              <p>ติดตามคิวสด กรอกข้อมูลก่อนมา ใช้ระบบตอบกลับตามกฎจำลอง และจัดการนัดหมาย</p>
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
              <strong>จอแสดงผลและเรียกคิว</strong>
              <p>จอเรียกคิวขนาดใหญ่พร้อมเสียงกระดิ่งและเสียงอ่านภาษาไทย</p>
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
              <strong>ตู้บริการตนเองสำหรับผู้ป่วย</strong>
              <p>ตรวจสอบสถานะคิวด้วย HN/เบอร์โทรและวันเกิดที่ตรงกันทุกตัวอักษร</p>
            </div>
            <b>→</b>
          </Link>
        </div>

        {/* Quick Links Section */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.85rem' }}>
            <Link href="/operations" style={{ color: 'var(--brand)', fontWeight: 600 }}>ศูนย์ปฏิบัติการ</Link>
            <span>·</span>
            <Link href="/map" style={{ color: 'var(--brand)', fontWeight: 600 }}>แผนที่ 4 ชั้น</Link>
            <span>·</span>
            <Link href="/registration" style={{ color: 'var(--brand)', fontWeight: 600 }}>จุดลงทะเบียน</Link>
            <span>·</span>
            <Link href="/vitals" style={{ color: 'var(--brand)', fontWeight: 600 }}>วัดสัญญาณชีพ</Link>
            <span>·</span>
            <Link href="/intake" style={{ color: 'var(--brand)', fontWeight: 600 }}>ซักประวัติ</Link>
            <span>·</span>
            <Link href="/physician" style={{ color: 'var(--brand)', fontWeight: 600 }}>ห้องตรวจแพทย์</Link>
            <span>·</span>
            <Link href="/lab" style={{ color: 'var(--brand)', fontWeight: 600 }}>ห้องปฏิบัติการ</Link>
            <span>·</span>
            <Link href="/pharmacy" style={{ color: 'var(--brand)', fontWeight: 600 }}>ห้องยา</Link>
            <span>·</span>
            <Link href="/infusion" style={{ color: 'var(--brand)', fontWeight: 600 }}>ศูนย์ให้สารน้ำและยาทางหลอดเลือด</Link>
          </div>

          <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
            ระบบสาธิตสาธารณะ: เลือกบัญชีทดสอบเพื่อเข้าใช้งานได้ทันที
          </div>
        </div>
      </section>
    </main>
  )
}
