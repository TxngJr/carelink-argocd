import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  BadgeCheck,
  Heart,
  Monitor,
  ShieldCheck,
  Stethoscope,
  Tv,
  Wifi,
  Workflow,
} from 'lucide-react'
import { roleHomePath } from '@/lib/access-control'
import { pageSession } from '@/lib/server/auth'
import { redirect } from 'next/navigation'

const portals = [
  {
    href: '/login/nurse',
    className: 'portal-card staff',
    icon: Stethoscope,
    iconStyle: { background: 'var(--brand)' },
    audience: 'สำหรับบุคลากรการแพทย์',
    title: 'เข้าสู่ระบบเจ้าหน้าที่',
    description: 'เลือกบัญชีทดสอบตามบทบาท แล้วจัดการนัดหมาย คิว และจุดบริการได้ทันที',
  },
  {
    href: '/login/patient',
    className: 'portal-card patient',
    icon: Heart,
    iconStyle: { background: 'var(--brand2)' },
    audience: 'สำหรับผู้รับบริการ',
    title: 'เข้าสู่ระบบผู้ป่วย',
    description: 'ติดตามคิวสด กรอกข้อมูลก่อนมา รับการแจ้งเตือน และดูเส้นทางการรับบริการ',
  },
  {
    href: '/tv',
    className: 'portal-card',
    icon: Tv,
    iconStyle: { background: '#0b1e1b' },
    audience: 'จอแสดงผลห้องพักคอย',
    title: 'จอแสดงผลและเรียกคิว',
    description: 'แสดงคิวที่กำลังเรียกและกำลังให้บริการแบบ realtime สำหรับพื้นที่รอ',
  },
  {
    href: '/kiosk',
    className: 'portal-card',
    icon: Monitor,
    iconStyle: { background: 'var(--info)' },
    audience: 'ตู้บริการตนเองหน้าแผนก',
    title: 'ตรวจสอบคิวด้วยตนเอง',
    description: 'ค้นหาสถานะด้วย HN หรือเบอร์โทรร่วมกับวันเกิด โดยไม่เปิดเผยรายการผู้ป่วยทั้งหมด',
  },
] as const

export default async function HomePage() {
  const session = await pageSession()
  if (session) redirect(roleHomePath(session.role))

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
          <span className="eyebrow">CARE JOURNEY & PATIENT FLOW</span>
          <h1>หนึ่งระบบสำหรับทุกขั้นตอนของการรับบริการ</h1>
          <p>
            เชื่อมงานนัดหมาย เช็กอิน ลงทะเบียน สัญญาณชีพ คัดกรอง ห้องแพทย์ แล็บ ห้องยา Infusion และการติดตามคิวของผู้ป่วยไว้ใน workflow เดียว
          </p>
          <div className="landing-feature-row" aria-label="จุดเด่นของระบบ">
            <span className="landing-feature-chip"><Workflow size={14} aria-hidden="true" />Workflow ต่อเนื่อง</span>
            <span className="landing-feature-chip"><Wifi size={14} aria-hidden="true" />อัปเดตแบบ realtime</span>
            <span className="landing-feature-chip"><ShieldCheck size={14} aria-hidden="true" />แยกสิทธิ์ตามบทบาท</span>
            <span className="landing-feature-chip"><BadgeCheck size={14} aria-hidden="true" />ข้อมูลสังเคราะห์สำหรับทดสอบ</span>
          </div>
          <div className="inline-alert warning feedback-row" role="note">
            <ShieldCheck size={18} aria-hidden="true" />
            <div><strong>Public Sandbox</strong><br />ข้อมูลในระบบเป็นข้อมูลสังเคราะห์และใช้ร่วมกันระหว่างผู้ทดสอบ ไม่ใช่ข้อมูลผู้ป่วยจริง</div>
          </div>
        </div>

        <div className="portal-grid">
          {portals.map(({ href, className, icon: Icon, iconStyle, audience, title, description }) => (
            <Link className={className} href={href} key={href}>
              <span className="portal-icon" style={iconStyle}><Icon size={24} aria-hidden="true" /></span>
              <div>
                <small>{audience}</small>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <span className="portal-arrow"><ArrowRight size={18} aria-hidden="true" /></span>
            </Link>
          ))}
        </div>

        <div className="public-demo-footer">
          <div>
            <strong style={{ display: 'block', fontSize: '.82rem' }}>เริ่มทดสอบระบบ</strong>
            <span style={{ color: 'var(--muted)', fontSize: '.74rem' }}>เจ้าหน้าที่สามารถเลือกบัญชี sandbox ตามบทบาทได้จากหน้าเข้าสู่ระบบ</span>
          </div>
          <div className="public-demo-footer-links">
            <Link href="/login/nurse"><Stethoscope size={14} aria-hidden="true" />บัญชีเจ้าหน้าที่</Link>
            <Link href="/login/patient"><Heart size={14} aria-hidden="true" />พอร์ทัลผู้ป่วย</Link>
            <Link href="/tv"><Tv size={14} aria-hidden="true" />จอคิว</Link>
            <Link href="/kiosk"><Monitor size={14} aria-hidden="true" />Kiosk</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
