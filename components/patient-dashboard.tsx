'use client'

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  User,
} from 'lucide-react'
import { clientApi } from '@/lib/client'
import { stationMap } from '@/lib/stations'
import type {
  Appointment,
  AppointmentMeasurements,
  HelpRequestSubmission,
  Journey,
  Notice,
  Previsit,
  PrevisitSubmission,
  PublicUser,
  TriageSession,
} from '@/lib/types'

type Section = 'home' | 'previsit' | 'triage' | 'appointment' | 'notifications' | 'profile'

const STATUS_LABELS: Record<string, string> = {
  submitted: 'ส่งคำขอแล้ว',
  nurse_proposed: 'พยาบาลเสนอวันนัดแล้ว',
  confirmed: 'ยืนยันนัดแล้ว',
  arrival_reported: 'แจ้งมาถึงแล้ว',
  checked_in: 'เช็กอินแล้ว',
  in_service: 'กำลังรับบริการ',
  completed: 'การรับบริการเสร็จสมบูรณ์',
  cancelled: 'ยกเลิกแล้ว',
}

const QUEUE_LABELS: Record<string, string> = {
  waiting: 'กำลังรอ',
  called: 'ถูกเรียกแล้ว',
  in_progress: 'กำลังรับบริการ',
  no_show: 'พลาดการเรียกคิว',
}

function thaiDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

function sameBangkokDay(value?: string) {
  if (!value) return false
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' })
  return formatter.format(new Date(value)) === formatter.format(new Date())
}

// --------------------------------------------------------------------
// 1. Home / Journey Component
// --------------------------------------------------------------------
function JourneyCard({ journey }: { journey: Journey }) {
  const progress = journey.step_total ? Math.round(((journey.step_current || 0) / journey.step_total) * 100) : 0
  return (
    <section className="journey-card">
      <div className="journey-top">
        <div>
          <span className="eyebrow light">LIVE PATIENT JOURNEY</span>
          <p>คิวของคุณตอนนี้</p>
          <strong>{journey.queue_no || '—'}</strong>
        </div>
        <div className="queue-live">
          <span>กำลังให้บริการอยู่ที่จุด</span>
          <strong>{journey.now_serving_queue_no || '—'}</strong>
        </div>
      </div>

      <div className="journey-station">
        <span className="station-code">{journey.current_station || '—'}</span>
        <div>
          <strong>{journey.station_name || journey.current_station || 'กำลังเตรียมข้อมูล'}</strong>
          <span>{journey.station_floor || 'กรุณารอฟังเสียงประกาศ'}</span>
        </div>
        <span className={`status-pill ${journey.queue_status || 'waiting'}`}>
          {QUEUE_LABELS[journey.queue_status || ''] || 'กำลังดำเนินการ'}
        </span>
      </div>

      <div className="journey-metrics">
        <div>
          <span>คิวข้างหน้า</span>
          <strong>{journey.queue_ahead ?? 0}</strong>
          <small>คิว</small>
        </div>
        <div>
          <span>เวลารอโดยประมาณ</span>
          <strong>
            {journey.est_wait_min ?? 0}
            {journey.est_wait_band ? `–${(journey.est_wait_min || 0) + journey.est_wait_band}` : ''}
          </strong>
          <small>นาที</small>
        </div>
        <div>
          <span>จุดถัดไป</span>
          <strong className="station-short">{journey.next_station || 'END'}</strong>
          <small>{journey.next_station_name || 'สิ้นสุดการรักษา'}</small>
        </div>
      </div>

      <div className="journey-progress">
        <div className="progress-label">
          <span>ความคืบหน้าการรับบริการวันนี้</span>
          <strong>{journey.step_current || 0}/{journey.step_total || 0} ขั้นตอน</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="route-timeline">
        {(journey.route || []).map((step, index) => (
          <div className={`route-step ${step.status}`} key={`${step.station_code}-${index}`}>
            <span className="route-dot" />
            <div>
              <strong>{step.station_code}</strong>
              <span>{stationMap.get(step.station_code)?.name || step.station_code}</span>
            </div>
            <em>{step.status === 'completed' ? 'เสร็จแล้ว' : step.status === 'in_progress' ? 'กำลังดำเนินการ' : 'รอ'}</em>
          </div>
        ))}
      </div>
      <div className="updated-line">อัปเดตล่าสุด {thaiDate(journey.updated_at)}</div>
    </section>
  )
}

// --------------------------------------------------------------------
// 2. Pre-visit Questionnaire Component
// --------------------------------------------------------------------
function PrevisitTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const [complaint, setComplaint] = useState('')
  const [food, setFood] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [allergies, setAllergies] = useState('')
  const [meds, setMeds] = useState('')
  const [herbals, setHerbals] = useState('')
  const [payer, setPayer] = useState('UC (บัตรทอง)')
  const [contact, setContact] = useState('')
  const [sbp, setSbp] = useState('')
  const [dbp, setDbp] = useState('')
  const [pulse, setPulse] = useState('')
  const [spo2, setSpo2] = useState('')
  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    clientApi.getPrevisit().then((res) => {
      if (res) {
        setComplaint(res.chief_complaint || '')
        setFood(res.food_intake || '')
        setSymptoms((res.symptoms || []).join(', '))
        setAllergies((res.allergies || []).join(', '))
        setMeds((res.current_medications || []).join(', '))
        setHerbals((res.herbal_medications || []).join(', '))
        setPayer(res.payer || 'UC (บัตรทอง)')
        setContact(res.contact_phone || '')
        if (res.home_vitals) {
          setSbp(res.home_vitals.sbp?.toString() || '')
          setDbp(res.home_vitals.dbp?.toString() || '')
          setPulse(res.home_vitals.pulse?.toString() || '')
          setSpo2(res.home_vitals.spo2?.toString() || '')
          setWeight(res.home_vitals.weight?.toString() || '')
        }
      }
    }).catch(() => null)
  }, [])

  async function handleSavePrevisit(e: FormEvent) {
    e.preventDefault()
    if (!complaint.trim()) {
      setMessage('กรุณากรอกอาการสำคัญ')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await clientApi.savePrevisit({
        chief_complaint: complaint.trim(),
        food_intake: food.trim(),
        symptoms: symptoms.split(',').map((s) => s.trim()).filter(Boolean),
        allergies: allergies.split(',').map((s) => s.trim()).filter(Boolean),
        current_medications: meds.split(',').map((s) => s.trim()).filter(Boolean),
        herbal_medications: herbals.split(',').map((s) => s.trim()).filter(Boolean),
        payer,
        contact_phone: contact.trim(),
        home_vitals: {
          sbp: sbp ? Number(sbp) : undefined,
          dbp: dbp ? Number(dbp) : undefined,
          pulse: pulse ? Number(pulse) : undefined,
          spo2: spo2 ? Number(spo2) : undefined,
          weight: weight ? Number(weight) : undefined,
        },
      })
      setMessage('บันทึกข้อมูลก่อนมารับบริการแล้ว ทีมพยาบาลจะเห็นข้อมูลทันทีที่ท่านเช็กอิน')
      await onSaved()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="patient-section">
      <div className="patient-section-title">
        <span className="eyebrow">PRE-VISIT HEALTH FORM</span>
        <h1>ข้อมูลก่อนมารับบริการ</h1>
        <p>กรอกข้อมูลสุขภาพล่วงหน้าเพื่อลดเวลารอคอยและการซักประวัติซ้ำซ้อน</p>
      </div>

      <form className="patient-card form-card" onSubmit={handleSavePrevisit}>
        <label>
          <span>อาการสำคัญที่ต้องการปรึกษาแพทย์ <em>*</em></span>
          <textarea rows={3} value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="อธิบายอาการที่เกิดขึ้น เช่น ปวดท้องหลังทานอาหาร มีก้อนที่ลำคอ" />
        </label>

        <label>
          <span>การรับประทานอาหารช่วงนี้</span>
          <input value={food} onChange={(e) => setFood(e.target.value)} placeholder="เช่น รับประทานได้น้อย เบื่ออาหาร คลื่นไส้" />
        </label>

        <label>
          <span>อาการร่วมอื่น ๆ (คั่นด้วยจุลภาค)</span>
          <input value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="เช่น มีไข้, อ่อนเพลีย, น้ำหนักลด" />
        </label>

        <label>
          <span>ประวัติแพ้ยา / แพ้อาหาร (ถ้ามี)</span>
          <input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="เช่น Penicillin, อาหารทะเล หรือ ไม่มี" />
        </label>

        <div className="form-two">
          <label>
            <span>ยาที่รับประทานประจำ</span>
            <input value={meds} onChange={(e) => setMeds(e.target.value)} placeholder="ชื่อยาและความถี่" />
          </label>
          <label>
            <span>ยาสมุนไพร / อาหารเสริม</span>
            <input value={herbals} onChange={(e) => setHerbals(e.target.value)} placeholder="ชื่อสมุนไพร หรือ วิตามิน" />
          </label>
        </div>

        <div className="form-two">
          <label>
            <span>สิทธิการรักษา</span>
            <select value={payer} onChange={(e) => setPayer(e.target.value)}>
              <option value="UC (บัตรทอง)">UC (บัตรทอง / 30 บาท)</option>
              <option value="SSS (ประกันสังคม)">SSS (ประกันสังคม)</option>
              <option value="CSMBS (ข้าราชการ)">CSMBS (สวัสดิการข้าราชการ)</option>
              <option value="Self-Pay (ชำระเงินเอง)">ชำระเงินเอง</option>
            </select>
          </label>
          <label>
            <span>เบอร์ติดต่อฉุกเฉิน</span>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="0812345678" />
          </label>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span className="eyebrow">HOME VITALS (OPTIONAL)</span>
          <h4 style={{ margin: '4px 0 10px' }}>สัญญาณชีพที่วัดเองจากที่บ้าน</h4>
          <div className="form-two">
            <label><span>ความดันตัวบน (mmHg)</span><input type="number" value={sbp} onChange={(e) => setSbp(e.target.value)} placeholder="120" /></label>
            <label><span>ความดันตัวล่าง (mmHg)</span><input type="number" value={dbp} onChange={(e) => setDbp(e.target.value)} placeholder="80" /></label>
          </div>
          <div className="form-two" style={{ marginTop: 10 }}>
            <label><span>ชีพจร (bpm)</span><input type="number" value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="75" /></label>
            <label><span>ออกซิเจน SpO₂ (%)</span><input type="number" value={spo2} onChange={(e) => setSpo2(e.target.value)} placeholder="98" /></label>
          </div>
        </div>

        {message && (
          <div className={`inline-alert ${message.includes('แล้ว') ? 'success' : 'danger'}`}>
            {message}
          </div>
        )}

        <button className="button primary large full" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกข้อมูลก่อนมารับบริการ'}
        </button>
      </form>
    </div>
  )
}

// --------------------------------------------------------------------
// 3. AI Triage Tab Component
// --------------------------------------------------------------------
function TriageTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const [session, setSession] = useState<TriageSession | null>(null)
  const [inputMsg, setInputMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    clientApi.getCurrentTriageSession().then(async (res) => {
      if (!active) return
      if (res) {
        setSession(res)
      } else {
        const created = await clientApi.createTriageSession()
        if (active) setSession(created)
      }
    }).catch(() => null)
    return () => { active = false }
  }, [])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!inputMsg.trim() || !session) return
    setBusy(true)
    try {
      const updated = await clientApi.sendTriageMessage(session.id, inputMsg.trim())
      setSession(updated)
      setInputMsg('')
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmitToNurse() {
    if (!session) return
    setBusy(true)
    try {
      await clientApi.submitTriageSession(session.id)
      setMessage('ส่งบทสนทนาคัดกรองให้พยาบาลเรียบร้อยแล้ว')
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="patient-section">
      <div className="patient-section-title">
        <span className="eyebrow">AI SYMPTOM TRIAGE</span>
        <h1>คัดกรองอาการด้วย AI</h1>
        <p>สนทนากับระบบคัดกรองอัจฉริยะเพื่อประเมินระดับความเร่งด่วนเบื้องต้น</p>
      </div>

      <div className="patient-card">
        {/* Emergency Safety Alert */}
        <div className="inline-alert warning" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16 }}>
          <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '.8rem', lineHeight: 1.5 }}>
            <strong>ข้อควรระวัง:</strong> หากท่านมีอาการฉุกเฉินวิกฤต เช่น เจ็บแน่นหน้าอกรุนแรง หายใจไม่ออก แขนขาอ่อนแรงเฉียบพลัน หรือเลือดออกไม่หยุด กรุณาโทร <strong>1669</strong> หรือไปห้องฉุกเฉินทันที
          </div>
        </div>

        {/* Chat Stream */}
        <div className="chat-container">
          {(session?.messages || []).map((msg, index) => (
            <div key={msg.id || index} className={`chat-bubble ${msg.role}`}>
              <div style={{ fontSize: '.7rem', opacity: 0.7, marginBottom: 2 }}>
                {msg.role === 'patient' ? 'คุณ' : 'CareLink AI Assistant'}
              </div>
              <div>{msg.content}</div>
            </div>
          ))}
        </div>

        {session?.status === 'submitted' ? (
          <div className="inline-alert success">
            ✓ ข้อมูลคัดกรองนี้ถูกส่งให้พยาบาลที่จุดซักประวัติแล้ว
          </div>
        ) : (
          <form onSubmit={handleSend} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="พิมพ์อธิบายอาการของคุณที่นี่..."
                disabled={busy}
              />
              <button className="button primary" disabled={busy || !inputMsg.trim()}>
                <Send size={16} /> ส่ง
              </button>
            </div>

            {session?.messages && session.messages.length >= 3 && (
              <button
                type="button"
                className="button success full"
                style={{ marginTop: 8 }}
                onClick={() => void handleSubmitToNurse()}
                disabled={busy}
              >
                <Sparkles size={16} /> ส่งบทสรุปคัดกรองให้พยาบาล
              </button>
            )}
          </form>
        )}

        {message && <div className="inline-alert success" style={{ marginTop: 10 }}>{message}</div>}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------
// 4. Appointment Status & Form Component
// --------------------------------------------------------------------
function AppointmentTab({
  appointment,
  onRefresh,
}: {
  appointment: Appointment | null
  onRefresh: () => Promise<void>
}) {
  const [complaint, setComplaint] = useState(appointment?.chief_complaint || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canArrive = appointment?.status === 'confirmed' && sameBangkokDay(appointment.appointment_at)
  const canCancel = appointment && ['submitted', 'nurse_proposed', 'confirmed'].includes(appointment.status)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!complaint.trim()) {
      setError('กรุณาระบุอาการสำคัญ')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (appointment?.status === 'submitted') {
        await clientApi.updateAppointment(appointment.id, complaint.trim())
      } else {
        await clientApi.createAppointment(complaint.trim())
      }
      setSuccess('ส่งคำขอนัดหมายแพทย์เรียบร้อยแล้ว')
      await onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function handleArrive() {
    if (!appointment) return
    setBusy(true)
    try {
      await clientApi.reportArrival(appointment.id)
      await onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'แจ้งมาถึงไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!appointment || !window.confirm('ยืนยันยกเลิกคำขอนัดหมายนี้?')) return
    setBusy(true)
    try {
      await clientApi.cancelAppointment(appointment.id)
      await onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ยกเลิกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="patient-section">
      <div className="patient-section-title">
        <span className="eyebrow">APPOINTMENT MANAGEMENT</span>
        <h1>นัดหมายของฉัน</h1>
        <p>ส่งคำขอนัดหมายแพทย์และแจ้งการมาถึงโรงพยาบาลในวันนัด</p>
      </div>

      {appointment && !['cancelled', 'completed'].includes(appointment.status) ? (
        <section className="patient-card">
          <div className="patient-card-head">
            <div>
              <span className="eyebrow">ACTIVE APPOINTMENT</span>
              <h2>สถานะคำขอนัดหมาย</h2>
            </div>
            <span className={`appointment-pill ${appointment.status}`}>
              {STATUS_LABELS[appointment.status] || appointment.status}
            </span>
          </div>

          <div className="appointment-details">
            <div><span>อาการสำคัญ</span><strong>{appointment.chief_complaint}</strong></div>
            <div><span>วันและเวลานัด</span><strong>{thaiDate(appointment.appointment_at)}</strong></div>
            <div><span>ห้องตรวจ</span><strong>{appointment.assigned_pc || 'รอยืนยัน'}</strong></div>
          </div>

          {appointment.nurse_note && (
            <div className="care-note">
              <span>ข้อความจากพยาบาล:</span>
              <p>{appointment.nurse_note}</p>
            </div>
          )}
          {appointment.doctor_note && (
            <div className="care-note">
              <span>ข้อความจากแพทย์:</span>
              <p>{appointment.doctor_note}</p>
            </div>
          )}

          {error && <div className="inline-alert danger" style={{ marginTop: 12 }}>{error}</div>}

          <div className="patient-actions" style={{ marginTop: 16 }}>
            {canArrive && (
              <button className="button success large" disabled={busy} onClick={() => void handleArrive()}>
                ฉันมาถึงโรงพยาบาลแล้ว
              </button>
            )}
            {canCancel && (
              <button className="button danger-outline" disabled={busy} onClick={() => void handleCancel()}>
                ยกเลิกคำขอ
              </button>
            )}
          </div>
        </section>
      ) : (
        <form className="patient-card form-card" onSubmit={handleCreate}>
          <div className="patient-card-head">
            <div>
              <span className="eyebrow">NEW APPOINTMENT</span>
              <h2>ส่งอาการเพื่อขอนัดหมายแพทย์</h2>
            </div>
          </div>

          <label>
            <span>อาการสำคัญที่ต้องการพบแพทย์ <em>*</em></span>
            <textarea
              required
              rows={4}
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              placeholder="อธิบายอาการที่ต้องการให้ทีมแพทย์และพยาบาลนัดหมาย"
            />
          </label>

          {error && <div className="inline-alert danger">{error}</div>}
          {success && <div className="inline-alert success">{success}</div>}

          <button className="button primary large full" disabled={busy}>
            {busy ? 'กำลังส่งคำขอ…' : 'ส่งคำขอนัดหมายแพทย์'}
          </button>
        </form>
      )}
    </div>
  )
}

// --------------------------------------------------------------------
// 5. Help Request & Profile Tab Component
// --------------------------------------------------------------------
function HelpAndProfileTab({
  user,
  displayName,
  onLogout,
}: {
  user: PublicUser | null
  displayName: string
  onLogout: () => Promise<void>
}) {
  const [category, setCategory] = useState<HelpRequestSubmission['category']>('queue')
  const [helpMsg, setHelpMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [helpSuccess, setHelpSuccess] = useState('')

  async function handleSendHelp(e: FormEvent) {
    e.preventDefault()
    if (!helpMsg.trim()) return
    setBusy(true)
    setHelpSuccess('')
    try {
      await clientApi.createHelpRequest(category, helpMsg.trim())
      setHelpSuccess('ส่งคำขอความช่วยเหลือแล้ว ทีมพยาบาลจะติดต่อหรือให้การช่วยเหลือโดยเร็ว')
      setHelpMsg('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="patient-section">
      <div className="profile-hero">
        <div className="avatar profile-avatar">{(user?.display_name || displayName).slice(0, 1)}</div>
        <h1>{user?.display_name || displayName}</h1>
        <span>บัญชีผู้ป่วย CareLink DynaFlow</span>
      </div>

      {/* Help Request Section */}
      <section className="patient-card">
        <div className="patient-card-head">
          <div>
            <span className="eyebrow">HELP & ASSISTANCE</span>
            <h2>ขอความช่วยเหลือระหว่างรับบริการ</h2>
          </div>
          <HelpCircle size={22} color="var(--brand)" />
        </div>

        <form onSubmit={handleSendHelp} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'directions', label: 'ถามเส้นทาง' },
              { id: 'queue', label: 'สอบถามคิว' },
              { id: 'clinical', label: 'อาการเปลี่ยนแปลง' },
              { id: 'other', label: 'อื่น ๆ' },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                className={`button ${category === c.id ? 'primary' : 'ghost'}`}
                style={{ minHeight: 34, padding: '0 12px', fontSize: '.8rem' }}
                onClick={() => setCategory(c.id as HelpRequestSubmission['category'])}
              >
                {c.label}
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            value={helpMsg}
            onChange={(e) => setHelpMsg(e.target.value)}
            placeholder="บอกจุดที่คุณอยู่ หรือสิ่งที่ต้องการความช่วยเหลือ..."
          />

          {helpSuccess && <div className="inline-alert success">{helpSuccess}</div>}

          <button className="button warning large full" disabled={busy || !helpMsg.trim()}>
            {busy ? 'กำลังส่งคำขอ…' : 'ส่งคำขอความช่วยเหลือฉุกเฉิน'}
          </button>
        </form>
      </section>

      {/* Profile Details */}
      <section className="patient-card profile-card">
        <div><span>เบอร์โทร / ชื่อผู้ใช้</span><strong>{user?.username || '-'}</strong></div>
        <div><span>ประเภทบัญชี</span><strong>ผู้ป่วย</strong></div>
        <div><span>สิทธิการรักษา</span><strong>UC (บัตรทอง)</strong></div>
        <div><span>สถานะการเชื่อมต่อ</span><strong className="online-text">พร้อมใช้งาน</strong></div>
      </section>

      <button className="button danger-outline large full" onClick={() => void onLogout()}>
        <LogOut size={16} /> ออกจากระบบ
      </button>
      <p className="prototype-note">CareLink เป็นระบบสนับสนุนการไหลเวียนผู้ป่วย AMIS DynaFlow 2.0</p>
    </div>
  )
}

// --------------------------------------------------------------------
// Main Patient Dashboard Container
// --------------------------------------------------------------------
export function PatientDashboard({ displayName }: { displayName: string }) {
  const router = useRouter()
  const [section, setSection] = useState<Section>('home')
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [journey, setJourney] = useState<Journey | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const [nextAppointment, nextJourney, nextNotices, nextUser] = await Promise.all([
        clientApi.getCurrentAppointment(),
        clientApi.getJourney(),
        clientApi.getNotifications(),
        clientApi.getPatientMe(),
      ])
      setAppointment(nextAppointment)
      setJourney(nextJourney)
      setNotices(nextNotices || [])
      setUser(nextUser)
    } catch {
      // Ignore
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    function fetchPatientData() {
      Promise.all([
        clientApi.getCurrentAppointment(),
        clientApi.getJourney(),
        clientApi.getNotifications(),
        clientApi.getPatientMe(),
      ]).then(([nextAppointment, nextJourney, nextNotices, nextUser]) => {
        if (!active) return
        setAppointment(nextAppointment)
        setJourney(nextJourney)
        setNotices(nextNotices || [])
        setUser(nextUser)
        setLoading(false)
      }).catch(() => {
        if (active) setLoading(false)
      })
    }

    fetchPatientData()
    const timer = setInterval(fetchPatientData, 8000)

    const es = new EventSource('/api/realtime/stream')
    es.addEventListener('notification_created', fetchPatientData)
    es.addEventListener('queue_called', fetchPatientData)
    es.addEventListener('encounter_moved', fetchPatientData)

    return () => {
      active = false
      clearInterval(timer)
      es.close()
    }
  }, [])

  const unread = useMemo(() => notices.filter((n) => !n.is_read).length, [notices])

  async function logout() {
    await clientApi.logout().catch(() => null)
    router.replace('/login/patient')
    router.refresh()
  }

  async function handleReadNotice(id: string) {
    await clientApi.markNotificationRead(id).catch(() => null)
    setNotices((items) => items.map((i) => (i.id === id ? { ...i, is_read: true } : i)))
  }

  async function handleMarkAllRead() {
    await clientApi.markAllNotificationsRead().catch(() => null)
    setNotices((items) => items.map((i) => ({ ...i, is_read: true })))
  }

  return (
    <div className="patient-shell">
      <header className="patient-header">
        <div className="patient-brand">
          <img src="/logo-mark.svg" width={38} height={38} alt="" />
          <div>
            <strong>CareLink</strong>
            <span>Patient Journey 2.0</span>
          </div>
        </div>
        <div className="patient-header-actions">
          <button className="notification-button" onClick={() => setSection('notifications')} aria-label="การแจ้งเตือน">
            <Bell size={18} />
            {unread > 0 && <em>{unread}</em>}
          </button>
          <div className="avatar small patient-avatar">
            {(user?.display_name || displayName).slice(0, 1)}
          </div>
        </div>
      </header>

      <main className="patient-main">
        {loading ? (
          <div className="patient-loading">
            <img src="/logo-mark.svg" width={54} height={54} alt="" />
            <span>กำลังโหลดข้อมูลการรับบริการของคุณ…</span>
          </div>
        ) : (
          <>
            {section === 'home' && (
              <>
                <div className="patient-greeting">
                  <span>{new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Bangkok' }).format(new Date())}</span>
                  <h1>สวัสดี, {user?.display_name || displayName}</h1>
                  <p>ติดตามทุกขั้นตอนการรับบริการและการนัดหมายของคุณได้จากหน้านี้</p>
                </div>

                {journey ? (
                  <JourneyCard journey={journey} />
                ) : (
                  <section className="no-journey">
                    <span className="soft-icon large">✓</span>
                    <h2>ยังไม่มี Visit ที่กำลังดำเนินการ</h2>
                    <p>
                      {appointment?.status === 'confirmed'
                        ? 'เมื่อถึงวันนัด ให้กดแจ้งมาถึงเพื่อเริ่มต้นขั้นตอนการรับบริการ'
                        : 'ส่งคำขอนัดหมายหรือกรอกข้อมูลก่อนมาเพื่อเริ่มต้น'}
                    </p>
                  </section>
                )}

                {appointment && (
                  <AppointmentTab appointment={appointment} onRefresh={refresh} />
                )}
              </>
            )}

            {section === 'previsit' && <PrevisitTab onSaved={refresh} />}
            {section === 'triage' && <TriageTab onSaved={refresh} />}
            {section === 'appointment' && <AppointmentTab appointment={appointment} onRefresh={refresh} />}

            {section === 'notifications' && (
              <div className="patient-section">
                <div className="patient-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <span className="eyebrow">NOTIFICATIONS</span>
                    <h1>การแจ้งเตือน</h1>
                  </div>
                  {unread > 0 && (
                    <button className="button ghost" style={{ minHeight: 32, fontSize: '.78rem' }} onClick={() => void handleMarkAllRead()}>
                      อ่านทั้งหมด
                    </button>
                  )}
                </div>

                <div className="notice-list">
                  {notices.length === 0 ? (
                    <div className="empty-state large">ยังไม่มีการแจ้งเตือน</div>
                  ) : (
                    notices.map((notice) => (
                      <button
                        className={`notice-card ${notice.is_read ? 'read' : ''}`}
                        key={notice.id}
                        onClick={() => void handleReadNotice(notice.id)}
                      >
                        <span className="notice-dot" />
                        <div>
                          <strong>{notice.title}</strong>
                          <p>{notice.message}</p>
                          <time>{thaiDate(notice.created_at)}</time>
                        </div>
                        {!notice.is_read && <em>ใหม่</em>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {section === 'profile' && (
              <HelpAndProfileTab user={user} displayName={displayName} onLogout={logout} />
            )}
          </>
        )}
      </main>

      {/* Enhanced Bottom Navigation Bar */}
      <nav className="patient-bottom-nav">
        <button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}>
          <span><Home size={18} /></span>หน้าหลัก
        </button>
        <button className={section === 'previsit' ? 'active' : ''} onClick={() => setSection('previsit')}>
          <span><Calendar size={18} /></span>ก่อนมา
        </button>
        <button className={section === 'triage' ? 'active' : ''} onClick={() => setSection('triage')}>
          <span><Sparkles size={18} /></span>คัดกรอง
        </button>
        <button className={section === 'appointment' ? 'active' : ''} onClick={() => setSection('appointment')}>
          <span><Clock size={18} /></span>นัดหมาย
        </button>
        <button className={section === 'notifications' ? 'active' : ''} onClick={() => setSection('notifications')}>
          <span><Bell size={18} /></span>แจ้งเตือน{unread > 0 && <em>{unread}</em>}
        </button>
        <button className={section === 'profile' ? 'active' : ''} onClick={() => setSection('profile')}>
          <span><User size={18} /></span>บัญชี
        </button>
      </nav>
    </div>
  )
}