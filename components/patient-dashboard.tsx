'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clientApi } from '@/lib/client'
import { stationMap } from '@/lib/stations'
import type { Appointment, AppointmentMeasurements, Journey, Notice, PublicUser } from '@/lib/types'

type Section = 'home' | 'appointment' | 'notifications' | 'profile'

const STATUS_LABELS: Record<string, string> = {
  submitted: 'ส่งคำขอแล้ว', nurse_proposed: 'พยาบาลเสนอวันนัดแล้ว', confirmed: 'ยืนยันนัดแล้ว',
  arrival_reported: 'แจ้งมาถึงแล้ว', checked_in: 'เช็กอินแล้ว', in_service: 'กำลังรับบริการ',
  completed: 'การรับบริการเสร็จสมบูรณ์', cancelled: 'ยกเลิกแล้ว',
}
const QUEUE_LABELS: Record<string, string> = { waiting: 'กำลังรอ', called: 'ถูกเรียกแล้ว', in_progress: 'กำลังรับบริการ', no_show: 'พลาดการเรียกคิว' }

function thaiDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

function sameBangkokDay(value?: string) {
  if (!value) return false
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
  return formatter.format(new Date(value)) === formatter.format(new Date())
}

function AppointmentForm({ appointment, onSaved }: { appointment: Appointment | null; onSaved: () => Promise<void> }) {
  const [complaint, setComplaint] = useState(appointment?.chief_complaint || '')
  const [height, setHeight] = useState(appointment?.measurements?.height_cm?.toString() || '')
  const [weight, setWeight] = useState(appointment?.measurements?.weight_kg?.toString() || '')
  const [sbp, setSbp] = useState(appointment?.measurements?.sbp?.toString() || '')
  const [dbp, setDbp] = useState(appointment?.measurements?.dbp?.toString() || '')
  const [spo2, setSpo2] = useState(appointment?.measurements?.spo2?.toString() || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function optional(value: string) { return value.trim() ? Number(value) : undefined }
  function validate(measurements: AppointmentMeasurements) {
    if (!complaint.trim()) return 'กรุณาระบุอาการสำคัญ'
    if ((measurements.sbp === undefined) !== (measurements.dbp === undefined)) return 'กรุณากรอกความดันตัวบนและตัวล่างให้ครบทั้งคู่'
    if (measurements.height_cm !== undefined && (measurements.height_cm < 50 || measurements.height_cm > 250)) return 'ส่วนสูงต้องอยู่ระหว่าง 50–250 ซม.'
    if (measurements.weight_kg !== undefined && (measurements.weight_kg < 2 || measurements.weight_kg > 500)) return 'น้ำหนักต้องอยู่ระหว่าง 2–500 กก.'
    if (measurements.spo2 !== undefined && (measurements.spo2 < 50 || measurements.spo2 > 100)) return 'SpO₂ ต้องอยู่ระหว่าง 50–100%'
    return ''
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const measurements = { height_cm: optional(height), weight_kg: optional(weight), sbp: optional(sbp), dbp: optional(dbp), spo2: optional(spo2) }
    const invalid = validate(measurements)
    if (invalid) { setError(invalid); return }
    setBusy(true); setError('')
    try {
      if (appointment?.status === 'submitted') await clientApi.updateAppointment(appointment.id, complaint.trim(), measurements)
      else await clientApi.createAppointment(complaint.trim(), measurements)
      await onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <form className="patient-card form-card" onSubmit={submit}>
    <div className="patient-card-head"><div><span className="eyebrow">APPOINTMENT REQUEST</span><h2>{appointment?.status === 'submitted' ? 'แก้ไขคำขอของคุณ' : 'ส่งอาการเพื่อขอนัด'}</h2></div><span className="soft-icon">＋</span></div>
    <label><span>อาการสำคัญ <em>*</em></span><textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="อธิบายอาการที่ต้องการพบแพทย์" rows={4} /></label>
    <div className="form-two"><label><span>ส่วนสูง (ซม.)</span><input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></label><label><span>น้ำหนัก (กก.)</span><input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></label></div>
    <div className="form-two"><label><span>ความดันตัวบน</span><input inputMode="numeric" value={sbp} onChange={(e) => setSbp(e.target.value)} /></label><label><span>ความดันตัวล่าง</span><input inputMode="numeric" value={dbp} onChange={(e) => setDbp(e.target.value)} /></label></div>
    <label><span>ออกซิเจน SpO₂ (%)</span><input inputMode="numeric" value={spo2} onChange={(e) => setSpo2(e.target.value)} /></label>
    <p className="form-help">ค่าการวัดเป็นข้อมูลเสริม สามารถเว้นช่องที่ยังไม่ได้วัดได้</p>
    {error && <div className="inline-alert danger">{error}</div>}
    <button className="button primary large full" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกคำขอ'}</button>
  </form>
}

function JourneyCard({ journey }: { journey: Journey }) {
  const progress = journey.step_total ? Math.round(((journey.step_current || 0) / journey.step_total) * 100) : 0
  return <section className="journey-card">
    <div className="journey-top"><div><span className="eyebrow light">CURRENT JOURNEY</span><p>คิวของคุณตอนนี้</p><strong>{journey.queue_no || '—'}</strong></div><div className="queue-live"><span>กำลังให้บริการ</span><strong>{journey.now_serving_queue_no || '—'}</strong></div></div>
    <div className="journey-station"><span className="station-code">{journey.current_station || '—'}</span><div><strong>{journey.station_name || journey.current_station || 'กำลังเตรียมข้อมูล'}</strong><span>{journey.station_floor || ''}</span></div><span className={`status-pill ${journey.queue_status || 'waiting'}`}>{QUEUE_LABELS[journey.queue_status || ''] || 'กำลังดำเนินการ'}</span></div>
    <div className="journey-metrics"><div><span>คิวข้างหน้า</span><strong>{journey.queue_ahead ?? 0}</strong><small>คิว</small></div><div><span>เวลารอโดยประมาณ</span><strong>{journey.est_wait_min ?? 0}</strong><small>นาที</small></div><div><span>จุดถัดไป</span><strong className="station-short">{journey.next_station || 'END'}</strong><small>{journey.next_station_name || 'ปลายทาง'}</small></div></div>
    <div className="journey-progress"><div className="progress-label"><span>ความคืบหน้าวันนี้</span><strong>{journey.step_current || 0}/{journey.step_total || 0}</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>
    <div className="route-timeline">{(journey.route || []).map((step, index) => <div className={`route-step ${step.status}`} key={`${step.station_code}-${index}`}><span className="route-dot"/><div><strong>{step.station_code}</strong><span>{stationMap.get(step.station_code)?.name || step.station_code}</span></div><em>{step.status === 'completed' ? 'เสร็จแล้ว' : step.status === 'in_progress' ? 'กำลังดำเนินการ' : 'รอ'}</em></div>)}</div>
    <div className="updated-line">อัปเดตล่าสุด {thaiDate(journey.updated_at)}</div>
  </section>
}

function AppointmentStatusCard({ appointment, onRefresh }: { appointment: Appointment; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canCancel = ['submitted', 'nurse_proposed', 'confirmed'].includes(appointment.status)
  const canArrive = appointment.status === 'confirmed' && sameBangkokDay(appointment.appointment_at)

  async function arrive() {
    setBusy(true); setError('')
    try { await clientApi.reportArrival(appointment.id); await onRefresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'แจ้งมาถึงไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  async function cancel() {
    if (!window.confirm('ยืนยันยกเลิกคำขอนัดนี้?')) return
    setBusy(true); setError('')
    try { await clientApi.cancelAppointment(appointment.id); await onRefresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ยกเลิกไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <section className="patient-card appointment-status-card">
    <div className="patient-card-head"><div><span className="eyebrow">CURRENT APPOINTMENT</span><h2>สถานะคำขอนัด</h2></div><span className={`appointment-pill ${appointment.status}`}>{STATUS_LABELS[appointment.status] || appointment.status}</span></div>
    <div className="appointment-details"><div><span>อาการสำคัญ</span><strong>{appointment.chief_complaint}</strong></div><div><span>วันและเวลานัด</span><strong>{thaiDate(appointment.appointment_at)}</strong></div><div><span>ห้องตรวจ</span><strong>{appointment.assigned_pc || 'รอยืนยัน'}</strong></div></div>
    {appointment.nurse_note && <div className="care-note"><span>ข้อความจากพยาบาล</span><p>{appointment.nurse_note}</p></div>}
    {appointment.doctor_note && <div className="care-note"><span>ข้อความจากแพทย์</span><p>{appointment.doctor_note}</p></div>}
    {error && <div className="inline-alert danger">{error}</div>}
    <div className="patient-actions">{canArrive && <button className="button success large" disabled={busy} onClick={() => void arrive()}>ฉันมาถึงโรงพยาบาลแล้ว</button>}{canCancel && <button className="button danger-outline" disabled={busy} onClick={() => void cancel()}>ยกเลิกคำขอ</button>}</div>
    {appointment.status === 'confirmed' && !canArrive && <p className="form-help">ปุ่มแจ้งมาถึงจะเปิดในวันนัดตามเวลาไทย</p>}
  </section>
}

export function PatientDashboard({ displayName }: { displayName: string }) {
  const router = useRouter()
  const [section, setSection] = useState<Section>('home')
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [journey, setJourney] = useState<Journey | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const [nextAppointment, nextJourney, nextNotices, nextUser] = await Promise.all([
        clientApi.getCurrentAppointment(), clientApi.getJourney(), clientApi.getNotifications(), clientApi.getPatientMe(),
      ])
      setAppointment(nextAppointment as Appointment | null)
      setJourney(nextJourney as Journey | null)
      setNotices(nextNotices as Notice[])
      setUser(nextUser as PublicUser)
      setOffline(false)
    } catch { setOffline(true) }
    finally { if (showLoading) setLoading(false) }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(true), 0)
    const timer = window.setInterval(() => void refresh(false), 10_000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [refresh])

  const unread = useMemo(() => notices.filter((notice) => !notice.is_read).length, [notices])
  async function logout() { await clientApi.logout().catch(() => null); router.replace('/login/patient'); router.refresh() }
  async function readNotice(id: string) { await clientApi.markNotificationRead(id).catch(() => null); setNotices((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item)) }

  const editableAppointment = appointment?.status === 'submitted' ? appointment : null

  return <div className="patient-shell">
    <header className="patient-header"><div className="patient-brand"><img src="/logo-mark.svg" width={38} height={38} alt=""/><div><strong>CareLink</strong><span>Patient Journey</span></div></div><div className="patient-header-actions"><button className="notification-button" onClick={() => setSection('notifications')} aria-label="การแจ้งเตือน">◌{unread > 0 && <em>{unread}</em>}</button><div className="avatar small patient-avatar">{displayName.slice(0,1)}</div></div></header>
    <main className="patient-main">
      {offline && <div className="inline-alert warning">การเชื่อมต่อขัดข้อง กำลังแสดงข้อมูลล่าสุดที่โหลดได้</div>}
      {loading ? <div className="patient-loading"><img src="/logo-mark.svg" width={54} height={54} alt=""/><span>กำลังโหลดข้อมูลของคุณ…</span></div> : <>
        {section === 'home' && <>
          <div className="patient-greeting"><span>{new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Bangkok' }).format(new Date())}</span><h1>สวัสดี, {user?.display_name || displayName}</h1><p>ติดตามทุกขั้นตอนการรับบริการของคุณได้จากหน้านี้</p></div>
          {journey ? <JourneyCard journey={journey}/> : <section className="no-journey"><span className="soft-icon large">✓</span><h2>ยังไม่มี Visit ที่กำลังดำเนินการ</h2><p>{appointment?.status === 'confirmed' ? 'เมื่อถึงวันนัด ให้กดแจ้งมาถึงเพื่อเริ่มขั้นตอนเช็กอิน' : 'ส่งคำขอนัดเพื่อเริ่มต้นการรับบริการกับ CareLink'}</p></section>}
          {appointment && <AppointmentStatusCard appointment={appointment} onRefresh={refresh} />}
          {!appointment && <button className="cta-card" onClick={() => setSection('appointment')}><div><span>ยังไม่มีคำขอนัด</span><strong>ส่งอาการเพื่อขอนัดแพทย์</strong></div><b>→</b></button>}
        </>}
        {section === 'appointment' && <div className="patient-section"><div className="patient-section-title"><span className="eyebrow">APPOINTMENT</span><h1>นัดหมายของฉัน</h1><p>ส่งข้อมูลอาการเบื้องต้นให้ทีมดูแลก่อนถึงโรงพยาบาล</p></div>{appointment && !['cancelled','completed'].includes(appointment.status) && appointment.status !== 'submitted' ? <AppointmentStatusCard appointment={appointment} onRefresh={refresh}/> : <AppointmentForm key={editableAppointment?.id || 'new'} appointment={editableAppointment} onSaved={refresh}/>}</div>}
        {section === 'notifications' && <div className="patient-section"><div className="patient-section-title"><span className="eyebrow">NOTIFICATIONS</span><h1>การแจ้งเตือน</h1><p>ข้อมูลคิว การเปลี่ยน Station และสถานะนัดหมาย</p></div><div className="notice-list">{notices.length === 0 ? <div className="empty-state large">ยังไม่มีการแจ้งเตือน</div> : notices.map((notice) => <button className={`notice-card ${notice.is_read ? 'read' : ''}`} key={notice.id} onClick={() => void readNotice(notice.id)}><span className="notice-dot"/><div><strong>{notice.title}</strong><p>{notice.message}</p><time>{thaiDate(notice.created_at)}</time></div>{!notice.is_read && <em>ใหม่</em>}</button>)}</div></div>}
        {section === 'profile' && <div className="patient-section"><div className="profile-hero"><div className="avatar profile-avatar">{(user?.display_name || displayName).slice(0,1)}</div><h1>{user?.display_name || displayName}</h1><span>บัญชีผู้ป่วย CareLink</span></div><section className="patient-card profile-card"><div><span>เบอร์โทร / ชื่อผู้ใช้</span><strong>{user?.username || '-'}</strong></div><div><span>ประเภทบัญชี</span><strong>ผู้ป่วย</strong></div><div><span>สถานะ</span><strong className="online-text">พร้อมใช้งาน</strong></div></section><button className="button danger-outline large full" onClick={() => void logout()}>ออกจากระบบ</button><p className="prototype-note">CareLink เป็น Prototype สำหรับโครงงานการศึกษา ข้อมูลในระบบไม่ใช้แทนคำแนะนำทางการแพทย์</p></div>}
      </>}
    </main>
    <nav className="patient-bottom-nav"><button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}><span>⌂</span>หน้าหลัก</button><button className={section === 'appointment' ? 'active' : ''} onClick={() => setSection('appointment')}><span>＋</span>นัดหมาย</button><button className={section === 'notifications' ? 'active' : ''} onClick={() => setSection('notifications')}><span>◌</span>แจ้งเตือน{unread > 0 && <em>{unread}</em>}</button><button className={section === 'profile' ? 'active' : ''} onClick={() => setSection('profile')}><span>○</span>โปรไฟล์</button></nav>
  </div>
}