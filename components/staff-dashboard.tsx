'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { clientApi } from '@/lib/client'
import { buildDoctorRoute, OPTIONAL_ROUTE_CODES, stationMap } from '@/lib/stations'
import type { Appointment } from '@/lib/types'
import { QueueWorkspace } from '@/components/queue-workspace'

type Props = { role: 'nurse' | 'doctor'; displayName: string }
type NurseTab = 'requests' | 'arrivals' | 'queues'
type DoctorTab = 'appointments' | 'queues'

function dateTimeLocalDefault(date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function thaiDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

function Measurements({ row }: { row: Appointment }) {
  const values = [
    ['ส่วนสูง', row.measurements?.height_cm, 'ซม.'], ['น้ำหนัก', row.measurements?.weight_kg, 'กก.'],
    ['ความดัน', row.measurements?.sbp !== undefined && row.measurements?.dbp !== undefined ? `${row.measurements.sbp}/${row.measurements.dbp}` : undefined, 'mmHg'],
    ['SpO₂', row.measurements?.spo2, '%'],
  ] as const
  return <div className="measurement-grid">{values.map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{value ?? '—'} {value !== undefined ? unit : ''}</strong></div>)}</div>
}

function NurseRequestCard({ row, onDone }: { row: Appointment; onDone: () => Promise<void> }) {
  const [appointmentAt, setAppointmentAt] = useState(dateTimeLocalDefault())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function propose() {
    setBusy(true); setError('')
    try {
      await clientApi.proposeAppointment(row.id, { appointment_at: new Date(appointmentAt).toISOString(), note })
      await onDone()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ทำรายการไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <article className="request-card">
    <div className="request-card-main">
      <div className="patient-heading"><div className="avatar">{(row.patient?.display_name || 'ผ').slice(0, 1)}</div><div><h3>{row.patient?.display_name || 'ผู้ป่วย'}</h3><p>HN {row.patient?.hn || '-'} · {row.patient?.phone || '-'}</p></div></div>
      <div className="complaint-box"><span>อาการสำคัญ</span><strong>{row.chief_complaint}</strong></div>
      <Measurements row={row} />
    </div>
    <div className="request-card-action">
      <label><span>วันและเวลาที่เสนอ</span><input type="datetime-local" value={appointmentAt} onChange={(e) => setAppointmentAt(e.target.value)} /></label>
      <label><span>หมายเหตุพยาบาล</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ถ้ามี" /></label>
      {error && <div className="inline-alert danger">{error}</div>}
      <button className="button primary" onClick={() => void propose()} disabled={busy || !appointmentAt}>{busy ? 'กำลังบันทึก…' : 'เสนอวันนัด'}</button>
    </div>
  </article>
}

function DoctorRequestCard({ row, onDone }: { row: Appointment; onDone: () => Promise<void> }) {
  const [appointmentAt, setAppointmentAt] = useState(row.appointment_at ? dateTimeLocalDefault(new Date(row.appointment_at)) : dateTimeLocalDefault())
  const [pc, setPc] = useState(row.assigned_pc || 'PC')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true); setError('')
    try {
      await clientApi.confirmAppointment(row.id, { appointment_at: new Date(appointmentAt).toISOString(), assigned_pc: pc, note })
      await onDone()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ทำรายการไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <article className="request-card">
    <div className="request-card-main">
      <div className="patient-heading"><div className="avatar doctor">{(row.patient?.display_name || 'ผ').slice(0, 1)}</div><div><h3>{row.patient?.display_name || 'ผู้ป่วย'}</h3><p>HN {row.patient?.hn || '-'}</p></div></div>
      <div className="complaint-box"><span>อาการสำคัญ</span><strong>{row.chief_complaint}</strong></div>
      <Measurements row={row} />
      {row.nurse_note && <p className="note-line"><strong>หมายเหตุพยาบาล:</strong> {row.nurse_note}</p>}
    </div>
    <div className="request-card-action">
      <label><span>วันและเวลานัด</span><input type="datetime-local" value={appointmentAt} onChange={(e) => setAppointmentAt(e.target.value)} /></label>
      <label><span>ห้องตรวจ</span><select value={pc} onChange={(e) => setPc(e.target.value)}>{['PC','PC2','PC3','PC4'].map((code) => <option key={code} value={code}>{code} · {stationMap.get(code)?.name}</option>)}</select></label>
      <label><span>หมายเหตุแพทย์</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ถ้ามี" /></label>
      {error && <div className="inline-alert danger">{error}</div>}
      <button className="button primary" onClick={() => void confirm()} disabled={busy || !appointmentAt}>{busy ? 'กำลังยืนยัน…' : 'ยืนยันนัด'}</button>
    </div>
  </article>
}

function RouteBuilder({ encounterId, onClose }: { encounterId: string; onClose: () => void }) {
  const options = useMemo(() => Array.from(OPTIONAL_ROUTE_CODES), [])
  const [selected, setSelected] = useState<string[]>([])
  const [candidate, setCandidate] = useState(options[0] || 'LAB')
  const [terminal, setTerminal] = useState<'DH' | 'IPW'>('DH')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function add() { if (!selected.includes(candidate)) setSelected((items) => [...items, candidate]) }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= selected.length) return
    const copy = [...selected]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    setSelected(copy)
  }
  async function save() {
    setBusy(true); setMessage('')
    try {
      const route = buildDoctorRoute(selected, terminal)
      await clientApi.setDoctorRoute(encounterId, route)
      setMessage('บันทึกเส้นทางแล้ว สามารถกดเสร็จที่ห้องตรวจได้')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'บันทึกเส้นทางไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <section className="route-builder">
    <div className="route-builder-head"><div><span className="eyebrow">POST-CONSULT ROUTE</span><h2>กำหนดเส้นทางหลังตรวจ</h2></div><button className="icon-button" onClick={onClose} aria-label="ปิด">×</button></div>
    <p>เลือกเฉพาะ Station ที่จำเป็นหลังออกจากห้องแพทย์ ระบบจะส่งผู้ป่วยตามลำดับนี้อัตโนมัติ</p>
    <div className="route-add"><select value={candidate} onChange={(e) => setCandidate(e.target.value)}>{options.map((code) => <option key={code} value={code}>{code} · {stationMap.get(code)?.name}</option>)}</select><button className="button secondary" onClick={add}>เพิ่ม Station</button></div>
    <div className="route-list">{selected.length === 0 ? <div className="route-empty">ยังไม่มี Station เพิ่มเติม</div> : selected.map((code, index) => <div className="route-item" key={code}><span className="route-index">{index + 1}</span><strong>{code} · {stationMap.get(code)?.name}</strong><div><button onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button onClick={() => move(index, 1)} disabled={index === selected.length - 1}>↓</button><button className="remove" onClick={() => setSelected((items) => items.filter((item) => item !== code))}>ลบ</button></div></div>)}</div>
    <label className="terminal-select"><span>ปลายทางของ Visit</span><select value={terminal} onChange={(e) => setTerminal(e.target.value as 'DH' | 'IPW')}><option value="DH">DH · กลับบ้าน</option><option value="IPW">HA → IPW · รับไว้รักษา</option></select></label>
    {message && <div className={`inline-alert ${message.startsWith('บันทึก') ? 'success' : 'danger'}`}>{message}</div>}
    <button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกเส้นทาง'}</button>
  </section>
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

  const load = useCallback(async () => {
    try {
      if (role === 'nurse') {
        const [nextRequests, nextArrivals] = await Promise.all([clientApi.getNurseRequests(), clientApi.getTodayArrivals()])
        setRequests(nextRequests as Appointment[]); setArrivals(nextArrivals as Appointment[])
      } else {
        setRequests(await clientApi.getDoctorRequests() as Appointment[])
      }
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลไม่สำเร็จ') }
  }, [role])

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => void load(), 10_000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [load])

  async function logout() { await clientApi.logout().catch(() => null); router.replace('/login/nurse'); router.refresh() }
  async function checkIn(id: string) {
    setBusyId(id)
    try { await clientApi.confirmCheckIn(id); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'เช็กอินไม่สำเร็จ') } finally { setBusyId('') }
  }

  const activeTab = role === 'nurse' ? nurseTab : doctorTab

  return <div className="staff-shell">
    <aside className="staff-sidebar">
      <div className="sidebar-brand"><Image src="/logo-mark.svg" alt="" width={38} height={38} /><div><strong>CareLink</strong><span>Clinical Flow</span></div></div>
      <nav>
        {role === 'nurse' ? <>
          <button className={activeTab === 'requests' ? 'active' : ''} onClick={() => setNurseTab('requests')}><span>01</span>คำขอนัดใหม่<em>{requests.length}</em></button>
          <button className={activeTab === 'arrivals' ? 'active' : ''} onClick={() => setNurseTab('arrivals')}><span>02</span>ผู้ป่วยมาถึง<em>{arrivals.length}</em></button>
          <button className={activeTab === 'queues' ? 'active' : ''} onClick={() => setNurseTab('queues')}><span>03</span>จัดการคิว</button>
        </> : <>
          <button className={activeTab === 'appointments' ? 'active' : ''} onClick={() => setDoctorTab('appointments')}><span>01</span>รอยืนยันนัด<em>{requests.length}</em></button>
          <button className={activeTab === 'queues' ? 'active' : ''} onClick={() => setDoctorTab('queues')}><span>02</span>ห้องตรวจ PC</button>
        </>}
      </nav>
      <div className="sidebar-user"><div className="avatar small">{displayName.slice(0,1)}</div><div><strong>{displayName}</strong><span>{role === 'nurse' ? 'พยาบาล' : 'แพทย์'}</span></div><button onClick={() => void logout()} title="ออกจากระบบ">↗</button></div>
    </aside>
    <main className="staff-main">
      <header className="staff-topbar"><div><span className="eyebrow">{role === 'nurse' ? 'NURSE WORKSPACE' : 'DOCTOR WORKSPACE'}</span><h1>{role === 'nurse' ? 'พื้นที่ทำงานพยาบาล' : 'พื้นที่ทำงานแพทย์'}</h1></div><div className="live-indicator"><span />ข้อมูลอัปเดตอัตโนมัติทุก 10 วินาที</div></header>
      {error && <div className="inline-alert danger">{error}</div>}
      {role === 'nurse' && nurseTab === 'requests' && <section><div className="section-heading"><div><h2>คำขอนัดใหม่</h2><p>ตรวจข้อมูลเบื้องต้นและเสนอวันนัดให้ผู้ป่วย</p></div><span className="count-badge">{requests.length} รายการ</span></div><div className="request-stack">{requests.length === 0 ? <div className="empty-state large">ไม่มีคำขอใหม่</div> : requests.map((row) => <NurseRequestCard key={row.id} row={row} onDone={load} />)}</div></section>}
      {role === 'nurse' && nurseTab === 'arrivals' && <section><div className="section-heading"><div><h2>ผู้ป่วยแจ้งมาถึงแล้ว</h2><p>ยืนยันเช็กอินเพื่อสร้าง Visit และคิว NPR</p></div><span className="count-badge">{arrivals.length} รายการ</span></div><div className="arrival-grid">{arrivals.length === 0 ? <div className="empty-state large">ยังไม่มีผู้ป่วยแจ้งมาถึง</div> : arrivals.map((row) => <article className="arrival-card" key={row.id}><div className="patient-heading"><div className="avatar">{(row.patient?.display_name || 'ผ').slice(0,1)}</div><div><h3>{row.patient?.display_name}</h3><p>HN {row.patient?.hn}</p></div></div><div className="arrival-meta"><span>เวลานัด<strong>{thaiDate(row.appointment_at)}</strong></span><span>ห้องตรวจ<strong>{row.assigned_pc}</strong></span></div><button className="button success large" disabled={busyId === row.id} onClick={() => void checkIn(row.id)}>{busyId === row.id ? 'กำลังเช็กอิน…' : 'ยืนยันเช็กอินและออกคิว'}</button></article>)}</div></section>}
      {role === 'nurse' && nurseTab === 'queues' && <QueueWorkspace role="nurse" />}
      {role === 'doctor' && doctorTab === 'appointments' && <section><div className="section-heading"><div><h2>นัดหมายรอแพทย์ยืนยัน</h2><p>กำหนดวันเวลา ห้องตรวจ และยืนยันนัดหมาย</p></div><span className="count-badge">{requests.length} รายการ</span></div><div className="request-stack">{requests.length === 0 ? <div className="empty-state large">ไม่มีนัดรอยืนยัน</div> : requests.map((row) => <DoctorRequestCard key={row.id} row={row} onDone={load} />)}</div></section>}
      {role === 'doctor' && doctorTab === 'queues' && <>{routeEncounter && <RouteBuilder encounterId={routeEncounter} onClose={() => setRouteEncounter('')} />}<QueueWorkspace role="doctor" onSelectEncounter={setRouteEncounter} /></>}
    </main>
  </div>
}
