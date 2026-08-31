'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity, BarChart3, CalendarDays, ChevronLeft, ClipboardCheck, Droplets, FlaskConical,
  LayoutDashboard, LogOut, MapPin, Menu, Monitor, PanelLeftClose, PanelLeftOpen, Pill,
  Stethoscope, Tv, Users, X,
} from 'lucide-react'
import { clientApi } from '@/lib/client'
import type { PublicUser, Role } from '@/lib/types'

type NavItem = { href: string; label: string; icon: typeof Activity; roles: Array<Role | '*'> }
type NavSection = { section: string; items: NavItem[] }

const NAV_ITEMS: NavSection[] = [
  {
    section: 'บริหารการให้บริการ',
    items: [
      { href: '/operations', label: 'ภาพรวมการให้บริการ', icon: LayoutDashboard, roles: ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse'] },
      { href: '/operations/schedule', label: 'ตารางเวลา', icon: CalendarDays, roles: ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse'] },
      { href: '/operations/patients', label: 'ผู้ป่วยในระบบ', icon: Users, roles: ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse'] },
      { href: '/operations/insights', label: 'สถิติและประสิทธิภาพ', icon: BarChart3, roles: ['admin', 'manager', 'operations'] },
      { href: '/map', label: 'แผนผังจุดบริการ', icon: MapPin, roles: ['admin', 'manager', 'operations', 'doctor', 'nurse'] },
    ],
  },
  {
    section: 'งานบริการทางคลินิก',
    items: [
      { href: '/registration', label: 'ลงทะเบียนและตรวจสิทธิ', icon: ClipboardCheck, roles: ['admin', 'manager', 'nurse', 'registration'] },
      { href: '/vitals', label: 'วัดสัญญาณชีพ', icon: Activity, roles: ['admin', 'manager', 'nurse', 'vitals_staff'] },
      { href: '/intake', label: 'ซักประวัติและคัดกรอง', icon: ClipboardCheck, roles: ['admin', 'manager', 'nurse'] },
      { href: '/physician', label: 'ห้องตรวจแพทย์', icon: Stethoscope, roles: ['admin', 'manager', 'doctor', 'physician'] },
      { href: '/lab', label: 'ห้องปฏิบัติการ', icon: FlaskConical, roles: ['admin', 'manager', 'doctor', 'lab_staff'] },
      { href: '/pharmacy', label: 'ห้องยา', icon: Pill, roles: ['admin', 'manager', 'pharmacy_staff'] },
      { href: '/infusion', label: 'ห้องให้สารน้ำและยา', icon: Droplets, roles: ['admin', 'manager', 'infusion_staff', 'chemo_staff'] },
    ],
  },
  {
    section: 'จอสำหรับผู้รับบริการ',
    items: [
      { href: '/tv', label: 'จอเรียกคิว', icon: Tv, roles: ['*'] },
      { href: '/kiosk', label: 'ตู้บริการตนเอง', icon: Monitor, roles: ['*'] },
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
    for (const eventName of ['queue_updated', 'queue_called', 'encounter_moved', 'session_updated', 'chair_released']) {
      es.addEventListener(eventName, () => setLiveEvents((value) => value + 1))
    }
    return () => es.close()
  }, [])

  const currentRole = user?.role || role
  const currentName = user?.display_name || displayName
  const sections = useMemo(() => NAV_ITEMS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes('*') || item.roles.includes(currentRole)),
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
          <Link href="/operations" className="sidebar-brand">
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
