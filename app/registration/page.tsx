'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, ShieldCheck, UserPlus } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { extendedClient, type PatientSummary, type RichPatientInput } from '@/lib/extended-client'

const initial: RichPatientInput = {
  display_name: '', phone: '', birth_date: '1990-01-01', insurance_type: 'UC (บัตรทอง)',
  province: 'กรุงเทพมหานคร', referral_status: 'not_required',
}

export default function RegistrationPage() {
  const [tab, setTab] = useState<'queue' | 'register' | 'eligibility'>('queue')
  const [form, setForm] = useState<RichPatientInput>(initial)
  const [duplicates, setDuplicates] = useState<PatientSummary[]>([])
  const [selected, setSelected] = useState<PatientSummary | null>(null)
  const [eligibilityStatus, setEligibilityStatus] = useState<'pending' | 'verified' | 'rejected' | 'expired'>('verified')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

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
        .catch(() => { if (!cancelled) setDuplicates([]) })
    }, q.length < 2 ? 0 : 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [form.national_id_masked, form.phone, form.display_name, form.birth_date])

  const outProvince = useMemo(() => Boolean(form.province && form.province !== 'กรุงเทพมหานคร'), [form.province])

  function set<K extends keyof RichPatientInput>(key: K, value: RichPatientInput[K]) { setForm((prev) => ({ ...prev, [key]: value })) }

  async function register(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const patient = await extendedClient.registerRichPatient({ ...form, referral_status: outProvince ? (form.referral_status || 'pending') : 'not_required' })
      setSelected(patient); setTab('eligibility')
      setMessage(`สร้างเวชระเบียน ${String(patient.hn || '')} สำเร็จ กรุณาตรวจสอบสิทธิต่อ`)
      setForm(initial)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'ลงทะเบียนไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  async function saveEligibility() {
    if (!selected?.id) return
    setBusy(true); setMessage('')
    try {
      const patient = await extendedClient.updateEligibility(selected.id, {
        status: eligibilityStatus,
        insurance_type: selected.insurance_type || 'UC (บัตรทอง)',
        insurance_no: selected.insurance_no || '',
        referral_hospital: selected.referral_hospital || '',
        referral_status: selected.referral_status || 'not_required',
        note,
      })
      setSelected(patient); setMessage('บันทึกผลตรวจสอบสิทธิแล้ว')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'บันทึกสิทธิไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <StaffShell role="registration" displayName="เจ้าหน้าที่เวชระเบียนและตรวจสิทธิ">
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="section-heading"><div><span className="eyebrow">REGISTRATION & ELIGIBILITY</span><h2>ลงทะเบียนผู้ป่วยและตรวจสอบสิทธิ (NPR / EV)</h2><p>ค้นประวัติซ้ำก่อนสร้าง HN เก็บข้อมูลติดต่อ จังหวัด สิทธิ และใบส่งตัว แล้วส่งต่อ VM</p></div><div style={{ display: 'flex', gap: 8 }}>
        <button className={`button ${tab === 'queue' ? 'primary' : 'ghost'}`} onClick={() => setTab('queue')}>คิว NPR/EV</button>
        <button className={`button ${tab === 'register' ? 'primary' : 'ghost'}`} onClick={() => setTab('register')}><UserPlus size={16} /> ผู้ป่วยใหม่</button>
        <button className={`button ${tab === 'eligibility' ? 'primary' : 'ghost'}`} onClick={() => setTab('eligibility')}><ShieldCheck size={16} /> ตรวจสิทธิ</button>
      </div></div>
      {message && <div className={`inline-alert ${message.includes('ไม่') || message.includes('พบผู้ป่วย') ? 'danger' : 'success'}`}>{message}</div>}

      {tab === 'queue' && <QueueWorkspace role="nurse" stationCodes={['NPR', 'EV']} />}

      {tab === 'register' && <div className="clinical-grid">
        <form className="workspace-card" style={{ padding: 22, display: 'grid', gap: 14 }} onSubmit={register}>
          <div className="workspace-card-head" style={{ padding: 0 }}><h3>New Patient Registration</h3></div>
          <label><span>ชื่อ-นามสกุล <em>*</em></span><input required value={form.display_name} onChange={(e) => set('display_name', e.target.value)} /></label>
          <div className="form-two"><label><span>โทรศัพท์ <em>*</em></span><input required value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label><label><span>วันเกิด <em>*</em></span><input type="date" required value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} /></label></div>
          <div className="form-two"><label><span>เลขประชาชน (masked/demo)</span><input value={form.national_id_masked || ''} onChange={(e) => set('national_id_masked', e.target.value)} placeholder="1-xxxx-xxxxx-xx-x" /></label><label><span>เพศ</span><select value={form.gender || ''} onChange={(e) => set('gender', e.target.value)}><option value="">ไม่ระบุ</option><option>ชาย</option><option>หญิง</option><option>อื่น ๆ</option></select></label></div>
          <div className="form-two"><label><span>จังหวัด</span><input value={form.province || ''} onChange={(e) => set('province', e.target.value)} /></label><label><span>อำเภอ/เขต</span><input value={form.district || ''} onChange={(e) => set('district', e.target.value)} /></label></div>
          <div className="form-two"><label><span>ตำบล/แขวง</span><input value={form.sub_district || ''} onChange={(e) => set('sub_district', e.target.value)} /></label><label><span>ที่อยู่</span><input value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></label></div>
          <div className="form-two"><label><span>สิทธิการรักษา</span><select value={form.insurance_type} onChange={(e) => set('insurance_type', e.target.value)}><option>UC (บัตรทอง)</option><option>SSS (ประกันสังคม)</option><option>CSMBS (ข้าราชการ)</option><option>Self-Pay (ชำระเงินเอง)</option></select></label><label><span>เลขที่สิทธิ</span><input value={form.insurance_no || ''} onChange={(e) => set('insurance_no', e.target.value)} /></label></div>
          {outProvince && <div className="inline-alert warning">ผู้ป่วยต่างจังหวัด: กรุณาตรวจข้อมูลใบส่งตัวก่อนยืนยันสิทธิ</div>}
          <div className="form-two"><label><span>โรงพยาบาลต้นสังกัด</span><input value={form.referral_hospital || ''} onChange={(e) => set('referral_hospital', e.target.value)} /></label><label><span>สถานะใบส่งตัว</span><select value={form.referral_status || 'not_required'} onChange={(e) => set('referral_status', e.target.value as RichPatientInput['referral_status'])}><option value="not_required">ไม่จำเป็น</option><option value="pending">รอตรวจ</option><option value="valid">มีใบส่งตัว</option><option value="missing">ไม่มีใบส่งตัว</option></select></label></div>
          <div className="form-two"><label><span>ผู้ติดต่อฉุกเฉิน</span><input value={form.emergency_contact || ''} onChange={(e) => set('emergency_contact', e.target.value)} /></label><label><span>ผู้ดูแล/ญาติ</span><input value={form.caregiver_name || ''} onChange={(e) => set('caregiver_name', e.target.value)} /></label></div>
          <button className="button primary large" disabled={busy || duplicates.length > 0}>{busy ? 'กำลังบันทึก…' : 'สร้างเวชระเบียนและไปตรวจสิทธิ'}</button>
          {duplicates.length > 0 && <div className="inline-alert warning">พบประวัติที่อาจซ้ำ {duplicates.length} รายการ กรุณาตรวจสอบด้านขวาก่อนสร้างใหม่</div>}
        </form>
        <section className="workspace-card" style={{ padding: 20 }}><h3 style={{ marginTop: 0 }}><Search size={18} /> Duplicate patient check</h3>{duplicates.length === 0 ? <div className="empty-state">ยังไม่พบข้อมูลที่อาจซ้ำ</div> : <div style={{ display: 'grid', gap: 8 }}>{duplicates.map((row) => <button type="button" className="button ghost" style={{ justifyContent: 'flex-start', textAlign: 'left' }} key={row.id} onClick={() => { setSelected(row); setTab('eligibility') }}><span><strong>{row.display_name}</strong><br /><small>HN {row.hn} · {row.phone} · {row.birth_date ? new Date(row.birth_date).toLocaleDateString('th-TH') : '—'}</small></span></button>)}</div>}</section>
      </div>}

      {tab === 'eligibility' && <section className="workspace-card" style={{ padding: 22, maxWidth: 900 }}>
        <div className="workspace-card-head" style={{ padding: 0 }}><div><span className="eyebrow">ELIGIBILITY VERIFICATION</span><h3>ตรวจสอบสิทธิและใบส่งตัว</h3></div></div>
        {!selected ? <div className="empty-state">เลือกผู้ป่วยจาก Duplicate check หรือสร้างผู้ป่วยใหม่ก่อน</div> : <div style={{ display: 'grid', gap: 14 }}>
          <div className="inline-alert"><strong>{selected.display_name}</strong> · HN {selected.hn || '—'} · {selected.insurance_type || 'ไม่ระบุสิทธิ'}<br />จังหวัด {selected.province || '—'} · Referral {selected.referral_status || '—'}</div>
          <div className="form-two"><label><span>ผลตรวจสอบสิทธิ</span><select value={eligibilityStatus} onChange={(e) => setEligibilityStatus(e.target.value as typeof eligibilityStatus)}><option value="verified">Verified</option><option value="pending">Pending</option><option value="rejected">Rejected</option><option value="expired">Expired</option></select></label><label><span>หมายเหตุ</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ตรวจสอบเอกสารครบถ้วน" /></label></div>
          <button className="button success large" disabled={busy} onClick={() => void saveEligibility()}>ยืนยันผลตรวจสอบสิทธิ</button>
        </div>}
      </section>}
    </div>
  </StaffShell>
}
