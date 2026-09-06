'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BedDouble,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  DoorOpen,
  HeartPulse,
  Home,
  IdCard,
  ListChecks,
  LogOut,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  Route,
  Search,
  Stethoscope,
  Trash2,
  UserCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { clientApi } from '@/lib/client'
import { buildDoctorRoute, OPTIONAL_ROUTE_CODES, stationMap } from '@/lib/stations'
import type { Appointment } from '@/lib/types'
import { QueueWorkspace } from '@/components/queue-workspace'
import styles from './staff-dashboard.module.css'

type Props = { role: 'nurse' | 'doctor'; displayName: string }
type NurseTab = 'requests' | 'arrivals' | 'queues'
type DoctorTab = 'appointments' | 'queues'

function dateTimeLocalDefault(date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function quickDateTime(minutesFromNow: number) {
  return dateTimeLocalDefault(new Date(Date.now() + minutesFromNow * 60_000))
}

function thaiDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function thaiShortDate(value?: string) {
  if (!value) return 'ยังไม่ระบุเวลา'
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function Measurements({ row }: { row: Appointment }) {
  const values = [
    { label: 'ส่วนสูง', value: row.measurements?.height_cm, unit: 'ซม.', icon: Activity },
    { label: 'น้ำหนัก', value: row.measurements?.weight_kg, unit: 'กก.', icon: UsersRound },
    {
      label: 'ความดัน',
      value:
        row.measurements?.sbp !== undefined && row.measurements?.dbp !== undefined
          ? `${row.measurements.sbp}/${row.measurements.dbp}`
          : undefined,
      unit: 'mmHg',
      icon: HeartPulse,
    },
    { label: 'SpO₂', value: row.measurements?.spo2, unit: '%', icon: Activity },
  ] as const

  return (
    <div className={styles.measurementGrid}>
      {values.map(({ label, value, unit, icon: Icon }) => (
        <div className={styles.measurementItem} key={label}>
          <span className={styles.measurementIcon}><Icon size={15} /></span>
          <div>
            <span>{label}</span>
            <strong>{value ?? '—'} {value !== undefined ? unit : ''}</strong>
          </div>
        </div>
      ))}
    </div>
  )
}

function PatientIdentity({ row, doctor = false }: { row: Appointment; doctor?: boolean }) {
  return (
    <div className={styles.patientIdentity}>
      <div className={`${styles.patientAvatar} ${doctor ? styles.doctorAvatar : ''}`}>
        {(row.patient?.display_name || 'ผ').slice(0, 1)}
      </div>
      <div className={styles.patientNameBlock}>
        <div className={styles.patientNameLine}>
          <h3>{row.patient?.display_name || 'ผู้ป่วย'}</h3>
          <span className={styles.statusChip}>{doctor ? 'รอยืนยันจากแพทย์' : 'คำขอใหม่'}</span>
        </div>
        <div className={styles.patientMetaLine}>
          <span><IdCard size={14} /> HN {row.patient?.hn || '-'}</span>
          {row.patient?.phone && <span><Phone size={14} /> {row.patient.phone}</span>}
          {row.created_at && <span><Clock3 size={14} /> ส่งคำขอ {thaiShortDate(row.created_at)}</span>}
        </div>
      </div>
    </div>
  )
}

function NurseRequestCard({ row, onDone }: { row: Appointment; onDone: () => Promise<void> }) {
  const [appointmentAt, setAppointmentAt] = useState(dateTimeLocalDefault())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function propose() {
    setBusy(true)
    setError('')
    try {
      await clientApi.proposeAppointment(row.id, {
        appointment_at: new Date(appointmentAt).toISOString(),
        note,
      })
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={styles.requestCard}>
      <div className={styles.requestMain}>
        <PatientIdentity row={row} />
        <div className={styles.complaintBox}>
          <div className={styles.complaintIcon}><MessageSquareText size={18} /></div>
          <div><span>อาการสำคัญ</span><strong>{row.chief_complaint}</strong></div>
        </div>
        <Measurements row={row} />
      </div>

      <div className={styles.requestAction}>
        <div className={styles.actionHeading}>
          <span className={styles.actionIcon}><CalendarClock size={19} /></span>
          <div><strong>เสนอวันนัด</strong><small>เลือกเวลาที่เหมาะสมแล้วส่งต่อให้แพทย์ยืนยัน</small></div>
        </div>
        <label>
          <span>วันและเวลาที่เสนอ</span>
          <input type="datetime-local" value={appointmentAt} onChange={(e) => setAppointmentAt(e.target.value)} />
        </label>
        <div className={styles.quickTimes}>
          <button type="button" onClick={() => setAppointmentAt(quickDateTime(15))}>+15 นาที</button>
          <button type="button" onClick={() => setAppointmentAt(quickDateTime(30))}>+30 นาที</button>
          <button type="button" onClick={() => setAppointmentAt(quickDateTime(60))}>+1 ชม.</button>
        </div>
        <label>
          <span>หมายเหตุพยาบาล</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ข้อมูลที่แพทย์ควรทราบ (ถ้ามี)" />
        </label>
        {error && <div className="inline-alert danger">{error}</div>}
        <button className={`button primary ${styles.primaryAction}`} onClick={() => void propose()} disabled={busy || !appointmentAt}>
          {busy ? <><RefreshCw size={17} className={styles.spin} /> กำลังบันทึก…</> : <><CalendarCheck2 size={17} /> เสนอวันนัด <ArrowRight size={17} /></>}
        </button>
      </div>
    </article>
  )
}

function DoctorRequestCard({ row, onDone }: { row: Appointment; onDone: () => Promise<void> }) {
  const [appointmentAt, setAppointmentAt] = useState(
    row.appointment_at ? dateTimeLocalDefault(new Date(row.appointment_at)) : dateTimeLocalDefault(),
  )
  const [pc, setPc] = useState(row.assigned_pc || 'PC')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await clientApi.confirmAppointment(row.id, {
        appointment_at: new Date(appointmentAt).toISOString(),
        assigned_pc: pc,
        note,
      })
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`${styles.requestCard} ${styles.doctorRequestCard}`}>
      <div className={styles.requestMain}>
        <PatientIdentity row={row} doctor />
        <div className={styles.complaintBox}>
          <div className={`${styles.complaintIcon} ${styles.doctorComplaintIcon}`}><Stethoscope size={18} /></div>
          <div><span>อาการสำคัญ</span><strong>{row.chief_complaint}</strong></div>
        </div>
        <Measurements row={row} />
        {row.nurse_note && (
          <div className={styles.nurseNote}>
            <UserRound size={16} />
            <div><span>หมายเหตุจากพยาบาล</span><p>{row.nurse_note}</p></div>
          </div>
        )}
      </div>

      <div className={`${styles.requestAction} ${styles.doctorAction}`}>
        <div className={styles.actionHeading}>
          <span className={`${styles.actionIcon} ${styles.doctorActionIcon}`}><CheckCircle2 size={19} /></span>
          <div><strong>ยืนยันนัดหมาย</strong><small>ตรวจวันเวลาและกำหนดห้องตรวจก่อนยืนยัน</small></div>
        </div>
        <label>
          <span>วันและเวลานัด</span>
          <input type="datetime-local" value={appointmentAt} onChange={(e) => setAppointmentAt(e.target.value)} />
        </label>
        <label>
          <span>ห้องตรวจ</span>
          <select value={pc} onChange={(e) => setPc(e.target.value)}>
            {['PC', 'PC2', 'PC3', 'PC4'].map((code) => (
              <option key={code} value={code}>{code} · {stationMap.get(code)?.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>หมายเหตุแพทย์</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="คำแนะนำหรือข้อมูลเพิ่มเติม (ถ้ามี)" />
        </label>
        {error && <div className="inline-alert danger">{error}</div>}
        <button className={`button primary ${styles.primaryAction}`} onClick={() => void confirm()} disabled={busy || !appointmentAt}>
          {busy ? <><RefreshCw size={17} className={styles.spin} /> กำลังยืนยัน…</> : <><CheckCircle2 size={17} /> ยืนยันนัด <ArrowRight size={17} /></>}
        </button>
      </div>
    </article>
  )
}

function RouteBuilder({ encounterId, onClose }: { encounterId: string; onClose: () => void }) {
  const options = useMemo(() => Array.from(OPTIONAL_ROUTE_CODES), [])
  const [selected, setSelected] = useState<string[]>([])
  const [candidate, setCandidate] = useState(options[0] || 'LAB')
  const [terminal, setTerminal] = useState<'DH' | 'IPW'>('DH')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function add() {
    if (!selected.includes(candidate)) setSelected((items) => [...items, candidate])
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= selected.length) return
    const copy = [...selected]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    setSelected(copy)
  }

  async function save() {
    setBusy(true)
    setMessage('')
    try {
      const route = buildDoctorRoute(selected, terminal)
      await clientApi.setDoctorRoute(encounterId, route)
      setMessage('บันทึกเส้นทางแล้ว สามารถกดเสร็จที่ห้องตรวจได้')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'บันทึกเส้นทางไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.routeBuilder}>
      <div className={styles.routeBuilderHead}>
        <div className={styles.sectionTitleWithIcon}>
          <span className={styles.sectionIcon}><Route size={20} /></span>
          <div><span className="eyebrow">POST-CONSULT ROUTE</span><h2>กำหนดเส้นทางหลังตรวจ</h2></div>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="ปิด"><X size={18} /></button>
      </div>
      <p className={styles.routeHelp}>เลือกเฉพาะ Station ที่จำเป็นหลังออกจากห้องแพทย์ ระบบจะส่งผู้ป่วยตามลำดับนี้อัตโนมัติ</p>
      <div className={styles.routeAdd}>
        <select value={candidate} onChange={(e) => setCandidate(e.target.value)}>
          {options.map((code) => <option key={code} value={code}>{code} · {stationMap.get(code)?.name}</option>)}
        </select>
        <button className="button secondary" onClick={add}><Plus size={16} /> เพิ่ม Station</button>
      </div>
      <div className={styles.routeList}>
        {selected.length === 0 ? (
          <div className={styles.routeEmpty}><Route size={22} /><span>ยังไม่มี Station เพิ่มเติม</span></div>
        ) : selected.map((code, index) => (
          <div className={styles.routeItem} key={code}>
            <span className={styles.routeIndex}>{index + 1}</span>
            <div><strong>{code}</strong><small>{stationMap.get(code)?.name}</small></div>
            <div className={styles.routeActions}>
              <button onClick={() => move(index, -1)} disabled={index === 0} aria-label="เลื่อนขึ้น"><ArrowUp size={15} /></button>
              <button onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label="เลื่อนลง"><ArrowDown size={15} /></button>
              <button className={styles.removeRoute} onClick={() => setSelected((items) => items.filter((item) => item !== code))} aria-label="ลบ"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.terminalChoices}>
        <button type="button" className={terminal === 'DH' ? styles.terminalActive : ''} onClick={() => setTerminal('DH')}>
          <Home size={18} /><span><strong>กลับบ้าน</strong><small>DH · Discharge</small></span>
        </button>
        <button type="button" className={terminal === 'IPW' ? styles.terminalActive : ''} onClick={() => setTerminal('IPW')}>
          <BedDouble size={18} /><span><strong>รับไว้รักษา</strong><small>HA → IPW</small></span>
        </button>
      </div>
      {message && <div className={`inline-alert ${message.startsWith('บันทึก') ? 'success' : 'danger'}`}>{message}</div>}
      <button className={`button primary ${styles.routeSave}`} disabled={busy} onClick={() => void save()}>
        {busy ? 'กำลังบันทึก…' : <><CheckCircle2 size={17} /> บันทึกเส้นทาง</>}
      </button>
    </section>
  )
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof CalendarCheck2; title: string; description: string }) {
  return (
    <div className={styles.emptyState}>
      <span><Icon size={26} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

export function StaffDashboard({ role, displayName }: Props) {
  const router = useRouter()
  const [nurseTab, setNurseTab] = useState<NurseTab>('requests')
  const [doctorTab, setDoctorTab] = useState<DoctorTab>('appointments')
  const [requests, setRequests] = useState<Appointment[]>([])
  const [arrivals, setArrivals] = useState<Appointment[]>([])
  const [routeEncounter, setRouteEncounter] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      if (role === 'nurse') {
        const [nextRequests, nextArrivals] = await Promise.all([
          clientApi.getNurseRequests('submitted'),
          clientApi.getTodayArrivals(),
        ])
        setRequests(nextRequests as Appointment[])
        setArrivals(nextArrivals as Appointment[])
      } else {
        setRequests(await clientApi.getDoctorRequests('nurse_proposed') as Appointment[])
      }
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลไม่สำเร็จ')
    }
  }, [role])

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => void load(), 10_000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [load])

  async function manualRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function logout() {
    await clientApi.logout().catch(() => null)
    router.replace('/login/nurse')
    router.refresh()
  }

  async function checkIn(id: string) {
    setBusyId(id)
    try {
      await clientApi.confirmCheckIn(id)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เช็กอินไม่สำเร็จ')
    } finally {
      setBusyId('')
    }
  }

  const activeTab = role === 'nurse' ? nurseTab : doctorTab
  const normalizedSearch = search.trim().toLowerCase()
  const matchesSearch = useCallback((row: Appointment) => {
    if (!normalizedSearch) return true
    return [row.patient?.display_name, row.patient?.hn, row.patient?.phone, row.chief_complaint]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch))
  }, [normalizedSearch])
  const visibleRequests = useMemo(() => requests.filter(matchesSearch), [requests, matchesSearch])
  const visibleArrivals = useMemo(() => arrivals.filter(matchesSearch), [arrivals, matchesSearch])

  const navItems = role === 'nurse'
    ? [
        { key: 'requests' as const, label: 'คำขอนัดใหม่', description: 'เสนอวันนัด', icon: CalendarClock, count: requests.length },
        { key: 'arrivals' as const, label: 'ผู้ป่วยมาถึง', description: 'เช็กอินเข้าระบบ', icon: UserCheck, count: arrivals.length },
        { key: 'queues' as const, label: 'จัดการคิว', description: 'ติดตามสถานีบริการ', icon: ListChecks },
      ]
    : [
        { key: 'appointments' as const, label: 'รอยืนยันนัด', description: 'กำหนดห้องตรวจ', icon: CalendarCheck2, count: requests.length },
        { key: 'queues' as const, label: 'ห้องตรวจ PC', description: 'ตรวจและส่งต่อ', icon: Stethoscope },
      ]

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Image src="/logo-mark.svg" alt="" width={40} height={40} />
          <div><strong>CareLink</strong><span>Clinical Flow</span></div>
        </div>

        <div className={styles.navLabel}>WORKSPACE</div>
        <nav className={styles.nav} aria-label="เมนูนัดหมาย">
          {navItems.map(({ key, label, description, icon: Icon, count }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                className={`${styles.navButton} ${isActive ? styles.navButtonActive : ''}`}
                onClick={() => role === 'nurse' ? setNurseTab(key as NurseTab) : setDoctorTab(key as DoctorTab)}
              >
                <span className={styles.navIcon}><Icon size={19} /></span>
                <span className={styles.navCopy}><strong>{label}</strong><small>{description}</small></span>
                {typeof count === 'number' && <em>{count}</em>}
              </button>
            )
          })}
        </nav>

        <div className={styles.sidebarGuide}>
          <Activity size={17} />
          <div><strong>Live workflow</strong><span>ข้อมูลรีเฟรชอัตโนมัติทุก 10 วินาที</span></div>
        </div>

        <div className={styles.sidebarUser}>
          <div className={styles.smallAvatar}>{displayName.slice(0, 1)}</div>
          <div><strong>{displayName}</strong><span>{role === 'nurse' ? 'พยาบาล' : 'แพทย์'}</span></div>
          <button onClick={() => void logout()} title="ออกจากระบบ" aria-label="ออกจากระบบ"><LogOut size={17} /></button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.welcomeBlock}>
            <span className="eyebrow">{role === 'nurse' ? 'APPOINTMENT & ARRIVAL' : 'DOCTOR APPOINTMENT'}</span>
            <h1>{role === 'nurse' ? 'นัดหมายและเช็กอินผู้ป่วย' : 'ยืนยันนัดหมายแพทย์'}</h1>
            <p>{role === 'nurse' ? 'จัดการคำขอนัด ผู้ป่วยที่มาถึง และส่งเข้าสู่คิวบริการจากจุดเดียว' : 'ตรวจข้อมูลที่พยาบาลเสนอ กำหนดห้องตรวจ และยืนยันนัดให้ผู้ป่วย'}</p>
          </div>
          <div className={styles.topActions}>
            <span className={styles.livePill}><span /> LIVE</span>
            <button className={styles.refreshButton} onClick={() => void manualRefresh()} disabled={refreshing}>
              <RefreshCw size={17} className={refreshing ? styles.spin : ''} /> รีเฟรช
            </button>
          </div>
        </header>

        <section className={styles.overviewGrid} aria-label="ภาพรวมงานนัดหมาย">
          <button className={styles.overviewCard} onClick={() => role === 'nurse' ? setNurseTab('requests') : setDoctorTab('appointments')}>
            <span className={`${styles.overviewIcon} ${styles.blueIcon}`}><CalendarClock size={21} /></span>
            <div><span>{role === 'nurse' ? 'คำขอใหม่' : 'รอยืนยันนัด'}</span><strong>{requests.length}</strong><small>รายการที่ต้องดำเนินการ</small></div>
          </button>
          {role === 'nurse' ? (
            <button className={styles.overviewCard} onClick={() => setNurseTab('arrivals')}>
              <span className={`${styles.overviewIcon} ${styles.greenIcon}`}><DoorOpen size={21} /></span>
              <div><span>มาถึงแล้ว</span><strong>{arrivals.length}</strong><small>รอยืนยันเช็กอิน</small></div>
            </button>
          ) : (
            <button className={styles.overviewCard} onClick={() => setDoctorTab('queues')}>
              <span className={`${styles.overviewIcon} ${styles.greenIcon}`}><Stethoscope size={21} /></span>
              <div><span>ห้องตรวจ</span><strong>4</strong><small>PC · PC2 · PC3 · PC4</small></div>
            </button>
          )}
          <div className={styles.overviewCard}>
            <span className={`${styles.overviewIcon} ${styles.amberIcon}`}><Activity size={21} /></span>
            <div><span>สถานะระบบ</span><strong className={styles.onlineText}>Online</strong><small>อัปเดตอัตโนมัติทุก 10 วินาที</small></div>
          </div>
        </section>

        {error && <div className={`inline-alert danger ${styles.pageAlert}`}>{error}</div>}

        {activeTab !== 'queues' && (
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อผู้ป่วย, HN, เบอร์โทร หรืออาการ..."
                aria-label="ค้นหาผู้ป่วย"
              />
              {search && <button onClick={() => setSearch('')} aria-label="ล้างการค้นหา"><X size={16} /></button>}
            </div>
            <div className={styles.toolbarHint}><Clock3 size={15} /> Asia/Bangkok</div>
          </div>
        )}

        {role === 'nurse' && nurseTab === 'requests' && (
          <section>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionTitleWithIcon}>
                <span className={styles.sectionIcon}><CalendarClock size={20} /></span>
                <div><h2>คำขอนัดใหม่</h2><p>ตรวจข้อมูลเบื้องต้น เลือกเวลา แล้วส่งให้แพทย์ยืนยัน</p></div>
              </div>
              <span className="count-badge">{visibleRequests.length} รายการ</span>
            </div>
            <div className={styles.requestStack}>
              {visibleRequests.length === 0 ? (
                <EmptyState icon={CalendarCheck2} title={search ? 'ไม่พบผู้ป่วยที่ค้นหา' : 'ไม่มีคำขอใหม่'} description={search ? 'ลองค้นหาด้วยชื่อ HN หรือเบอร์โทรอื่น' : 'เมื่อผู้ป่วยส่งคำขอนัด รายการจะแสดงที่นี่ทันที'} />
              ) : visibleRequests.map((row) => <NurseRequestCard key={row.id} row={row} onDone={load} />)}
            </div>
          </section>
        )}

        {role === 'nurse' && nurseTab === 'arrivals' && (
          <section>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionTitleWithIcon}>
                <span className={`${styles.sectionIcon} ${styles.arrivalSectionIcon}`}><DoorOpen size={20} /></span>
                <div><h2>ผู้ป่วยแจ้งมาถึงแล้ว</h2><p>ยืนยันเช็กอินเพื่อสร้าง Visit และส่งผู้ป่วยเข้าสู่คิว NPR</p></div>
              </div>
              <span className="count-badge">{visibleArrivals.length} รายการ</span>
            </div>
            <div className={styles.arrivalGrid}>
              {visibleArrivals.length === 0 ? (
                <EmptyState icon={UserCheck} title={search ? 'ไม่พบผู้ป่วยที่ค้นหา' : 'ยังไม่มีผู้ป่วยแจ้งมาถึง'} description={search ? 'ลองเปลี่ยนคำค้นหา' : 'ผู้ป่วยที่กด “มาถึงโรงพยาบาลแล้ว” จะปรากฏในส่วนนี้'} />
              ) : visibleArrivals.map((row) => (
                <article className={styles.arrivalCard} key={row.id}>
                  <div className={styles.arrivalCardTop}>
                    <div className={styles.arrivalAvatar}>{(row.patient?.display_name || 'ผ').slice(0, 1)}</div>
                    <div><h3>{row.patient?.display_name || 'ผู้ป่วย'}</h3><p><IdCard size={13} /> HN {row.patient?.hn || '-'}</p></div>
                    <span className={styles.arrivedBadge}><span /> มาถึงแล้ว</span>
                  </div>
                  <div className={styles.arrivalComplaint}><MessageSquareText size={16} /><span>{row.chief_complaint || 'ไม่ระบุอาการสำคัญ'}</span></div>
                  <div className={styles.arrivalMeta}>
                    <div><span><CalendarClock size={15} /> เวลานัด</span><strong>{thaiDate(row.appointment_at)}</strong></div>
                    <div><span><MapPin size={15} /> ห้องตรวจ</span><strong>{row.assigned_pc || '—'}</strong></div>
                  </div>
                  <button className={`button success large ${styles.checkInButton}`} disabled={busyId === row.id} onClick={() => void checkIn(row.id)}>
                    {busyId === row.id ? <><RefreshCw size={17} className={styles.spin} /> กำลังเช็กอิน…</> : <><UserCheck size={18} /> ยืนยันเช็กอินและออกคิว <ArrowRight size={18} /></>}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {role === 'nurse' && nurseTab === 'queues' && <QueueWorkspace role="nurse" />}

        {role === 'doctor' && doctorTab === 'appointments' && (
          <section>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionTitleWithIcon}>
                <span className={`${styles.sectionIcon} ${styles.doctorSectionIcon}`}><Stethoscope size={20} /></span>
                <div><h2>นัดหมายรอแพทย์ยืนยัน</h2><p>ตรวจข้อมูลจากพยาบาล กำหนดวันเวลาและห้องตรวจ ก่อนยืนยันให้ผู้ป่วย</p></div>
              </div>
              <span className="count-badge">{visibleRequests.length} รายการ</span>
            </div>
            <div className={styles.requestStack}>
              {visibleRequests.length === 0 ? (
                <EmptyState icon={CheckCircle2} title={search ? 'ไม่พบนัดที่ค้นหา' : 'ไม่มีนัดรอยืนยัน'} description={search ? 'ลองเปลี่ยนชื่อ HN หรือคำค้นหา' : 'นัดที่พยาบาลเสนอวันแล้วจะปรากฏในรายการนี้'} />
              ) : visibleRequests.map((row) => <DoctorRequestCard key={row.id} row={row} onDone={load} />)}
            </div>
          </section>
        )}

        {role === 'doctor' && doctorTab === 'queues' && (
          <>
            {routeEncounter && <RouteBuilder encounterId={routeEncounter} onClose={() => setRouteEncounter('')} />}
            <QueueWorkspace role="doctor" onSelectEncounter={setRouteEncounter} />
          </>
        )}
      </main>
    </div>
  )
}
