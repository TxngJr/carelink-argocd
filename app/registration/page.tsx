'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, CalendarDays, ClipboardList, FileCheck2, MapPin, Phone, Search, ShieldCheck, UserPlus, UserRound,
} from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { EmptyState, Feedback, FormField, PageHeader, StatusBadge, Tabs } from '@/components/ui'
import { extendedClient, type PatientSummary, type RichPatientInput } from '@/lib/extended-client'

const initial: RichPatientInput = {
  display_name: '', phone: '', birth_date: '1990-01-01', insurance_type: 'UC (บัตรทอง)',
  province: 'กรุงเทพมหานคร', referral_status: 'not_required',
}

type RegistrationTab = 'queue' | 'register' | 'eligibility'
type EligibilityStatus = 'pending' | 'verified' | 'rejected' | 'expired'
type FeedbackState = { tone: 'success' | 'danger' | 'warning' | 'info'; message: string } | null

function normalizedEligibility(value?: string): EligibilityStatus {
  return ['pending', 'verified', 'rejected', 'expired'].includes(value || '') ? value as EligibilityStatus : 'verified'
}

export default function RegistrationPage() {
  const [tab, setTab] = useState<RegistrationTab>('queue')
  const [form, setForm] = useState<RichPatientInput>(initial)
  const [duplicates, setDuplicates] = useState<PatientSummary[]>([])
  const [selected, setSelected] = useState<PatientSummary | null>(null)
  const [eligibilityStatus, setEligibilityStatus] = useState<EligibilityStatus>('verified')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)

  useEffect(() => {
    const q = form.national_id_masked?.trim() || form.phone.trim() || form.display_name.trim()
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (q.length < 2) {
        setDuplicates([])
        return
      }
      void extendedClient.findPatientDuplicates(q, form.birth_date)
        .then((rows) => { if (!cancelled) setDuplicates(rows) })
        .catch(() => {
          if (!cancelled) {
            setDuplicates([])
            setFeedback({ tone: 'warning', message: 'ตรวจสอบข้อมูลซ้ำอัตโนมัติไม่สำเร็จ กรุณาตรวจชื่อ เบอร์โทร และวันเกิดก่อนสร้างเวชระเบียน' })
          }
        })
    }, q.length < 2 ? 0 : 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [form.national_id_masked, form.phone, form.display_name, form.birth_date])

  const outProvince = useMemo(() => Boolean(form.province && form.province !== 'กรุงเทพมหานคร'), [form.province])

  function set<K extends keyof RichPatientInput>(key: K, value: RichPatientInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (feedback?.tone === 'danger') setFeedback(null)
  }

  function selectPatient(patient: PatientSummary) {
    setSelected(patient)
    setEligibilityStatus(normalizedEligibility(patient.eligibility_status))
    setNote('')
    setFeedback(null)
    setTab('eligibility')
  }

  async function register(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFeedback(null)
    try {
      const patient = await extendedClient.registerRichPatient({
        ...form,
        referral_status: outProvince ? (form.referral_status || 'pending') : 'not_required',
      })
      setSelected(patient)
      setEligibilityStatus(normalizedEligibility(patient.eligibility_status))
      setTab('eligibility')
      setFeedback({ tone: 'success', message: `สร้างเวชระเบียน ${String(patient.hn || '')} สำเร็จ ขั้นตอนถัดไปคือตรวจสอบสิทธิ` })
      setForm(initial)
      setDuplicates([])
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'ลงทะเบียนไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function saveEligibility() {
    if (!selected?.id) return
    setBusy(true)
    setFeedback(null)
    try {
      const patient = await extendedClient.updateEligibility(selected.id, {
        status: eligibilityStatus,
        insurance_type: selected.insurance_type || 'UC (บัตรทอง)',
        insurance_no: selected.insurance_no || '',
        referral_hospital: selected.referral_hospital || '',
        referral_status: selected.referral_status || 'not_required',
        note,
      })
      setSelected(patient)
      setFeedback({ tone: 'success', message: 'บันทึกผลตรวจสอบสิทธิแล้ว หากผู้ป่วยมี Visit วันนี้ให้ดำเนินการต่อจากคิว EV' })
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'บันทึกสิทธิไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return <StaffShell role="registration" displayName="เจ้าหน้าที่เวชระเบียนและตรวจสิทธิ">
    <div className="staff-page-stack">
      <PageHeader
        eyebrow="REGISTRATION & ELIGIBILITY"
        title="ลงทะเบียนผู้ป่วยและตรวจสอบสิทธิ (NPR / EV)"
        description="ค้นประวัติซ้ำก่อนสร้าง HN เก็บข้อมูลติดต่อ จังหวัด สิทธิ และใบส่งตัว แล้วดำเนินการตามคิว NPR → EV → VM"
        icon={<UserRound size={22} />}
        actions={<Tabs value={tab} onChange={setTab} items={[
          { id: 'queue', label: 'คิว NPR/EV', icon: <ClipboardList size={15} aria-hidden="true" /> },
          { id: 'register', label: 'ผู้ป่วยใหม่', icon: <UserPlus size={15} aria-hidden="true" /> },
          { id: 'eligibility', label: 'ตรวจสิทธิ', icon: <ShieldCheck size={15} aria-hidden="true" /> },
        ]} />}
      />

      {feedback && <Feedback tone={feedback.tone}>{feedback.message}</Feedback>}

      {tab === 'queue' && <QueueWorkspace role="nurse" stationCodes={['NPR', 'EV']} />}

      {tab === 'register' && <div className="clinical-grid">
        <form className="workspace-card" style={{ padding: 22, display: 'grid', gap: 14 }} onSubmit={register}>
          <div className="form-section-title"><span><UserPlus size={17} aria-hidden="true" /></span><div><strong>สร้างเวชระเบียนผู้ป่วยใหม่</strong><small>กรอกข้อมูลที่จำเป็นและตรวจประวัติซ้ำก่อนบันทึก</small></div></div>
          <FormField label="ชื่อ-นามสกุล" required><input required value={form.display_name} onChange={(e) => set('display_name', e.target.value)} autoComplete="name" /></FormField>
          <div className="form-two">
            <FormField label="โทรศัพท์" required><input required value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" autoComplete="tel" /></FormField>
            <FormField label="วันเกิด" required><input type="date" required value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} /></FormField>
          </div>
          <div className="form-two">
            <FormField label="เลขประชาชน (masked/demo)" hint="ใช้เฉพาะข้อมูลสังเคราะห์"><input value={form.national_id_masked || ''} onChange={(e) => set('national_id_masked', e.target.value)} placeholder="1-xxxx-xxxxx-xx-x" /></FormField>
            <FormField label="เพศ"><select value={form.gender || ''} onChange={(e) => set('gender', e.target.value)}><option value="">ไม่ระบุ</option><option>ชาย</option><option>หญิง</option><option>อื่น ๆ</option></select></FormField>
          </div>
          <div className="form-two">
            <FormField label="จังหวัด"><input value={form.province || ''} onChange={(e) => set('province', e.target.value)} /></FormField>
            <FormField label="อำเภอ/เขต"><input value={form.district || ''} onChange={(e) => set('district', e.target.value)} /></FormField>
          </div>
          <div className="form-two">
            <FormField label="ตำบล/แขวง"><input value={form.sub_district || ''} onChange={(e) => set('sub_district', e.target.value)} /></FormField>
            <FormField label="ที่อยู่"><input value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></FormField>
          </div>
          <div className="form-section-title"><span><BadgeCheck size={17} aria-hidden="true" /></span><div><strong>สิทธิและการส่งต่อ</strong><small>ข้อมูลนี้ใช้ในขั้นตอน EV และการตรวจเอกสาร</small></div></div>
          <div className="form-two">
            <FormField label="สิทธิการรักษา"><select value={form.insurance_type} onChange={(e) => set('insurance_type', e.target.value)}><option>UC (บัตรทอง)</option><option>SSS (ประกันสังคม)</option><option>CSMBS (ข้าราชการ)</option><option>Self-Pay (ชำระเงินเอง)</option></select></FormField>
            <FormField label="เลขที่สิทธิ"><input value={form.insurance_no || ''} onChange={(e) => set('insurance_no', e.target.value)} /></FormField>
          </div>
          {outProvince && <Feedback tone="warning"><strong>ผู้ป่วยต่างจังหวัด</strong><br />กรุณาตรวจข้อมูลใบส่งตัวก่อนยืนยันสิทธิ</Feedback>}
          <div className="form-two">
            <FormField label="โรงพยาบาลต้นสังกัด"><input value={form.referral_hospital || ''} onChange={(e) => set('referral_hospital', e.target.value)} /></FormField>
            <FormField label="สถานะใบส่งตัว"><select value={form.referral_status || 'not_required'} onChange={(e) => set('referral_status', e.target.value as RichPatientInput['referral_status'])}><option value="not_required">ไม่จำเป็น</option><option value="pending">รอตรวจ</option><option value="valid">มีใบส่งตัว</option><option value="missing">ไม่มีใบส่งตัว</option></select></FormField>
          </div>
          <div className="form-two">
            <FormField label="ผู้ติดต่อฉุกเฉิน"><input value={form.emergency_contact || ''} onChange={(e) => set('emergency_contact', e.target.value)} /></FormField>
            <FormField label="ผู้ดูแล/ญาติ"><input value={form.caregiver_name || ''} onChange={(e) => set('caregiver_name', e.target.value)} /></FormField>
          </div>
          <button className="button primary large" disabled={busy || duplicates.length > 0}><UserPlus size={17} aria-hidden="true" />{busy ? 'กำลังบันทึก…' : 'สร้างเวชระเบียน'}</button>
          {duplicates.length > 0 && <Feedback tone="warning">พบประวัติที่อาจซ้ำ {duplicates.length} รายการ กรุณาตรวจสอบรายการด้านขวาก่อนสร้างใหม่</Feedback>}
        </form>

        <section className="workspace-card" style={{ padding: 20 }}>
          <div className="form-section-title"><span><Search size={17} aria-hidden="true" /></span><div><strong>ตรวจประวัติที่อาจซ้ำ</strong><small>ค้นจากชื่อ เบอร์โทร หรือเลขประชาชนที่กรอก</small></div></div>
          {duplicates.length === 0 ? <EmptyState icon={<Search size={27} aria-hidden="true" />} title="ยังไม่พบข้อมูลที่อาจซ้ำ" description="เมื่อกรอกข้อมูลอย่างน้อย 2 ตัวอักษร ระบบจะตรวจสอบให้อัตโนมัติ" /> : <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {duplicates.map((row) => <button type="button" className="button ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 58 }} key={row.id} onClick={() => selectPatient(row)}>
              <UserRound size={17} aria-hidden="true" /><span><strong>{row.display_name}</strong><br /><small>HN {row.hn} · {row.phone} · {row.birth_date ? new Date(row.birth_date).toLocaleDateString('th-TH') : '—'}</small></span>
            </button>)}
          </div>}
        </section>
      </div>}

      {tab === 'eligibility' && <section className="workspace-card" style={{ padding: 22, maxWidth: 960 }}>
        <div className="form-section-title"><span><ShieldCheck size={17} aria-hidden="true" /></span><div><strong>ตรวจสอบสิทธิและใบส่งตัว</strong><small>ยืนยันสถานะก่อนดำเนินการต่อในจุด EV</small></div></div>
        {!selected ? <EmptyState icon={<FileCheck2 size={28} aria-hidden="true" />} title="ยังไม่ได้เลือกผู้ป่วย" description="เลือกจากรายการ Duplicate check หรือสร้างผู้ป่วยใหม่ก่อน" /> : <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <div className="patient-context-card">
            <span className="patient-context-icon"><UserRound size={19} aria-hidden="true" /></span>
            <div><strong>{selected.display_name} · HN {selected.hn || '—'}</strong><small>{selected.insurance_type || 'ไม่ระบุสิทธิ'} · {selected.province || 'ไม่ระบุจังหวัด'}</small></div>
            <StatusBadge tone={selected.referral_status === 'missing' ? 'warning' : 'info'}>{selected.referral_status || 'not_required'}</StatusBadge>
          </div>
          <div className="form-two">
            <FormField label="ผลตรวจสอบสิทธิ"><select value={eligibilityStatus} onChange={(e) => setEligibilityStatus(e.target.value as EligibilityStatus)}><option value="verified">Verified · ผ่าน</option><option value="pending">Pending · รอตรวจ</option><option value="rejected">Rejected · ไม่ผ่าน</option><option value="expired">Expired · หมดอายุ</option></select></FormField>
            <FormField label="หมายเหตุ"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ตรวจสอบเอกสารครบถ้วน" /></FormField>
          </div>
          <div className="landing-feature-row">
            <span className="landing-feature-chip"><Phone size={14} aria-hidden="true" />{selected.phone || 'ไม่มีเบอร์โทร'}</span>
            <span className="landing-feature-chip"><CalendarDays size={14} aria-hidden="true" />{selected.birth_date ? new Date(selected.birth_date).toLocaleDateString('th-TH') : 'ไม่ระบุวันเกิด'}</span>
            <span className="landing-feature-chip"><MapPin size={14} aria-hidden="true" />{selected.province || 'ไม่ระบุจังหวัด'}</span>
          </div>
          <button className="button success large" disabled={busy} onClick={() => void saveEligibility()}><BadgeCheck size={17} aria-hidden="true" />{busy ? 'กำลังบันทึก…' : 'ยืนยันผลตรวจสอบสิทธิ'}</button>
        </div>}
      </section>}
    </div>
  </StaffShell>
}
