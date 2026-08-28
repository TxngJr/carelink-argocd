'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  CalendarDays,
  Users,
  BarChart3,
  MapPin,
  ClipboardCheck,
  Stethoscope,
  FlaskConical,
  Pill,
  Syringe,
  Radio,
  Tv,
  Monitor,
  Palette,
  LogOut,
  Wifi,
  Sparkles,
} from 'lucide-react'
import { clientApi } from '@/lib/client'
import type { PublicUser, Role } from '@/lib/types'

const NAV_ITEMS = [
  {
    section: 'ศูนย์ปฏิบัติการและวิเคราะห์ (Operations)',
    roles: ['admin', 'manager', 'operations', 'doctor', 'nurse'],
    items: [
      { href: '/operations', label: 'Live Flow Board', icon: Activity },
      { href: '/operations/schedule', label: 'Master Schedule', icon: CalendarDays },
      { href: '/operations/patients', label: 'Patients Directory', icon: Users },
      { href: '/operations/insights', label: 'Flow Insights & KPIs', icon: BarChart3 },
      { href: '/map', label: 'Hospital Floor Map', icon: MapPin },
    ],
  },
  {
    section: 'จุดบริการทางคลินิก (Clinical Workflow)',
    roles: ['admin', 'manager', 'nurse', 'doctor', 'registration', 'vitals_staff', 'lab_staff', 'pharmacy_staff', 'chemo_staff', 'rt_staff'],
    items: [
      { href: '/registration', label: 'Registration & Eligibility', icon: ClipboardCheck },
      { href: '/vitals', label: 'Vital Signs Intake', icon: Activity },
      { href: '/intake', label: 'Nurse Intake & Triage', icon: Sparkles },
      { href: '/physician', label: 'Physician Consultation', icon: Stethoscope },
      { href: '/lab', label: 'Laboratory Worklist', icon: FlaskConical },
      { href: '/pharmacy', label: 'Pharmacy Dispensing', icon: Pill },
      { href: '/chemo', label: 'Chemotherapy Day Care', icon: Syringe },
      { href: '/radiation', label: 'Radiation Oncology', icon: Radio },
    ],
  },
  {
    section: 'จอแสดงผลและตู้บริการ (Public & Kiosk)',
    roles: ['*'],
    items: [
      { href: '/tv', label: 'Public TV Queue Display', icon: Tv },
      { href: '/kiosk', label: 'Self-Service Kiosk', icon: Monitor },
      { href: '/__design-system', label: 'DynaFlow Design System', icon: Palette },
    ],
  },
]

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
  const [liveEvents, setLiveEvents] = useState<number>(0)

  useEffect(() => {
    clientApi.getStaffMe().then(setUser).catch(() => null)

    // Connect to Server-Sent Events stream
    const es = new EventSource('/api/realtime/stream')
    es.onmessage = () => {
      setLiveEvents((prev) => prev + 1)
    }
    es.addEventListener('queue_updated', () => setLiveEvents((p) => p + 1))
    es.addEventListener('queue_called', () => setLiveEvents((p) => p + 1))
    es.addEventListener('encounter_moved', () => setLiveEvents((p) => p + 1))

    return () => es.close()
  }, [])

  async function logout() {
    await clientApi.logout().catch(() => null)
    router.replace('/login/nurse')
    router.refresh()
  }

  const currentRole = user?.role || role
  const currentName = user?.display_name || displayName

  return (
    <div className="staff-shell">
      <aside className="staff-sidebar">
        <Link href="/operations" className="sidebar-brand">
          <img src="/logo-mark.svg" alt="CareLink" width={38} height={38} />
          <div>
            <strong>CareLink</strong>
            <span>AMIS DynaFlow 2.0</span>
          </div>
        </Link>

        <nav>
          {NAV_ITEMS.map((sec) => (
            <React.Fragment key={sec.section}>
              <div className="sidebar-section-title">{sec.section}</div>
              {sec.items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || (item.href !== '/operations' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isActive ? 'active' : ''}
                  >
                    <span><Icon size={18} /></span>
                    <strong>{item.label}</strong>
                  </Link>
                )
              })}
            </React.Fragment>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className={`avatar small ${currentRole === 'doctor' ? 'doctor' : ''}`}>
            {currentName.slice(0, 1)}
          </div>
          <div>
            <strong>{currentName}</strong>
            <span>{currentRole}</span>
          </div>
          <button onClick={() => void logout()} title="ออกจากระบบ" aria-label="ออกจากระบบ">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="staff-main">
        <header className="staff-topbar">
          <div>
            <span className="eyebrow">CLINICAL & OPERATIONS SUITE</span>
            <h1>ระบบบริหารจัดการการไหลเวียนผู้ป่วย</h1>
          </div>
          <div className="live-indicator">
            <span />
            <span>SSE Realtime Live ({liveEvents} events)</span>
          </div>
        </header>

        {children}
      </main>
    </div>
  )
}
