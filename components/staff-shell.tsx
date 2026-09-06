'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity, BarChart3, CalendarCheck, CalendarDays, ChevronLeft, ClipboardCheck, Droplets, FlaskConical,
  LayoutDashboard, LogOut, MapPin, Menu, Monitor, PanelLeftClose, PanelLeftOpen, Pill,
  Stethoscope, Tv, Users, X,
} from 'lucide-react'
import { clientApi } from '@/lib/client'
import { roleHomePath, routeAllowed } from '@/lib/access-control'
import type { PublicUser, Role } from '@/lib/types'

type NavItem = { href: string; label: string; icon: typeof Activity }
type NavSection = { section: string; items: NavItem[] }

// แสดงเฉพาะ route ที่มีหน้าจอจริงใน app/ เท่านั้น
// สิทธิ์ของแต่ละ role ใช้ routeAllowed() จาก access-control เป็น source of truth เดียว
// เพื่อป้องกัน Navbar กับ route guard ให้สิทธิ์ไม่ตรงกัน
const NAV_ITEMS: NavSection[] = [
  {
    section: 'บริหารการให้บริการ',
    items: [
      { href: '/operations', label: 'ภาพรวมการให้บริการ', icon: LayoutDashboard },
      { href: '/operations/schedule', label: 'ตารางเวลา', icon: CalendarDays },
      { href: '/operations/patients', label: 'ผู้ป่วยในระบบ', icon: Users },
      { href: '/operations/insights', label: 'สถิติจากระบบจริง', icon: BarChart3 },
      { href: '/map', label: 'แผนผังจุดบริการ', icon: MapPin },
    ],
  },
  {
    section: 'งานบริการทางคลินิก',
    items: [
      { href: '/appointments', label: 'นัดหมายและเช็กอิน', icon: CalendarCheck },
      { href: '/registration', label: 'ลงทะเบียนและตรวจสิทธิ', icon: ClipboardCheck },
      { href: '/vitals', label: 'วัดสัญญาณชีพ', icon: Activity },
      { href: '/intake', label: 'ซักประวัติและคัดกรอง', icon: ClipboardCheck },
      { href: '/physician', label: 'ห้องตรวจแพทย์', icon: Stethoscope },
      { href: '/lab', label: 'ห้องปฏิบัติการ', icon: FlaskConical },
      { href: '/pharmacy', label: 'ห้องยา', icon: Pill },
      { href: '/infusion', label: 'Chemotherapy / Infusion', icon: Droplets },
    ],
  },
  {
    section: 'จอสำหรับผู้รับบริการ',
    items: [
      { href: '/tv', label: 'จอเรียกคิว', icon: Tv },
      { href: '/kiosk', label: 'ตู้บริการตนเอง', icon: Monitor },
    ],
  },
]

const ROLE_LABEL: Partial<Record<Role, string>> = {
  admin: 'ผู้ดูแลระบบ', manager: 'ผู้จัดการ', operations: 'ศูนย์ปฏิบัติการ', nurse: 'พยาบาล',
  doctor: 'แพทย์', physician: 'แพทย์', registration: 'เจ้าหน้าที่ลงทะเบียน', vitals_staff: 'เจ้าหน้าที่สัญญาณชีพ',
  lab_staff: 'เจ้าหน้าที่ห้องแล็บ', pharmacy_staff: 'เภสัชกร', infusion_staff: 'พยาบาล Infusion', chemo_staff: 'พยาบาล Infusion',
}

export function StaffShell({
  children,
  role = 'nurse',
  displayName = 'เจ้าหน้าที่',
}: {
  children: React.ReactNode
  role?: Role
  displayName?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<PublicUser | null>(null)
  const [liveEvents, setLiveEvents] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    clientApi.getStaffMe().then(setUser).catch(() => null)
    const es = new EventSource('/api/realtime/stream?scope=staff')
    es.onmessage = () => setLiveEvents((value) => value + 1)
    for (const eventName of ['queue_updated', 'queue_called', 'encounter_moved', 'session_updated', 'chair_released', 'imaging_started', 'imaging_completed', 'safety_review_updated']) {
      es.addEventListener(eventName, () => setLiveEvents((value) => value + 1))
    }
    return () => es.close()
  }, [])

  const currentRole = user?.role || role
  const currentName = user?.display_name || displayName
  const homeHref = roleHomePath(currentRole)
  const sections = useMemo(() => NAV_ITEMS.map((section) => ({
    ...section,
    items: section.items.filter((item) => routeAllowed(currentRole, item.href)),
  })).filter((section) => section.items.length > 0), [currentRole])

  async function logout() {
    await clientApi.logout().catch(() => null)
    router.replace('/login/nurse')
    router.refresh()
  }

  return (
    <div className={`staff-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-open' : ''}`}>
      {mobileOpen && <button className="sidebar-scrim" aria-label="ปิดเมนู" onClick={() => setMobileOpen(false)} />}
      <aside className="staff-sidebar">
        <div className="sidebar-brand-row">
          <Link href={homeHref} className="sidebar-brand" title="กลับหน้าหลักของบทบาทนี้">
            <Image src="/logo-mark.svg" alt="CareLink" width={36} height={36} priority />
            <div><strong>CareLink</strong><span>การไหลเวียนผู้ป่วย</span></div>
          </Link>
          <button className="sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="ปิดเมนู"><X size={20} /></button>
        </div>

        <nav aria-label="เมนูหลัก">
          {sections.map((section) => (
            <div className="sidebar-section" key={section.section}>
              <div className="sidebar-section-title">{section.section}</div>
              {section.items.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href || (item.href !== '/operations' && pathname.startsWith(item.href))
                return <Link key={item.href} href={item.href} className={active ? 'active' : ''} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}>
                  <Icon size={19} aria-hidden="true" /><strong>{item.label}</strong>{active && <ChevronLeft size={14} className="nav-current" />}
                </Link>
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>{collapsed ? '' : 'ย่อเมนู'}</span>
          </button>
          <div className="sidebar-user">
            <div className="avatar small">{currentName.slice(0, 1)}</div>
            <div><strong>{currentName}</strong><span>{ROLE_LABEL[currentRole] || currentRole}</span></div>
            <button onClick={() => void logout()} title="ออกจากระบบ" aria-label="ออกจากระบบ"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="staff-main">
        <header className="staff-topbar">
          <button className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="เปิดเมนู"><Menu size={21} /></button>
          <div className="topbar-title"><span>CareLink สำหรับเจ้าหน้าที่</span><strong>ระบบบริหารการไหลเวียนผู้ป่วย</strong></div>
          <div className="live-indicator" title={`${liveEvents} เหตุการณ์ในหน้าจอนี้`}><i /><span>เชื่อมต่อข้อมูลสด</span></div>
        </header>
        {children}
      </main>
    </div>
  )
}
