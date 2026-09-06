'use client'

import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { clientApi } from '@/lib/client'
import { extendedClient, type ClinicalContext } from '@/lib/extended-client'

export default function IntakePage() {
  const [encounterId, setEncounterId] = useState('')
  const [context, setContext] = useState<ClinicalContext | null>(null)
  const [complaint, setComplaint] = useState('')
  const [history, setHistory] = useState('')
  const [triageLevel, setTriageLevel] = useState<'normal' | 'urgent' | 'emergency' | 'fast_track'>('normal')
  const [urgent, setUrgent] = useState(false)
  const [fastTrack, setFastTrack] = useState(false)
  const [notes, setNotes] = useState('')
  const [extra, setExtraState] = useState<Record<string, string | boolean>>({ allergies_confirmed: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function selectEncounter(id: string) {
    setEncounterId(id)
    const next = await extendedClient.getClinicalContext(id)
    setContext(next)
    const pre = next.previsit || {}
    setComplaint(String(pre.chief_complaint || ''))
    setExtraState((prev) => ({
      ...prev,
      current_medications: Array.isArray(pre.current_medications) ? pre.current_medications.map(String).join(', ') : '',
      herbal_medications: Array.isArray(pre.herbal_medications) ? pre.herbal_medications.map(String).join(', ') : '',
      food_intake: String(pre.food_intake || ''),
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateExtra(key: string, value: string | boolean) { setExtraState((prev) => ({ ...prev, [key]: value })) }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!encounterId) { setMessage('กรุณาเลือกผู้ป่วยจากคิว MHT'); return }
    setBusy(true); setMessage('')
    try {
      await Promise.all([
        clientApi.saveAssessment(encounterId, { chief_complaint: complaint, history_of_illness: history, triage_level: triageLevel, is_urgent: urgent, is_fast_track: fastTrack, nurse_notes: notes }),
        extendedClient.saveExtendedAssessment(encounterId, extra),
      ])
      if (urgent || fastTrack || triageLevel === 'emergency') await clientApi.markUrgent(encounterId)
      setMessage('บันทึกการซักประวัติแบบเต็มและส่งต่อแพทย์แล้ว')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const patient = context?.patient
  const vitals = context?.vitals
  const previsit = context?.previsit

  return <StaffShell role="nurse" displayName="พยาบาลจุดซักประวัติ">
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="section-heading"><div><span className="eyebrow">NURSE INTAKE & TRIAGE</span><h2>ซักประวัติและยืนยันข้อมูล Pre-visit (MHT)</h2><p>ดึงข้อมูลที่ผู้ป่วยกรอกล่วงหน้ามาให้พยาบาลตรวจทาน ลดการถามข้อมูลซ้ำ</p></div></div>
      {message && <div className={`inline-alert ${message.includes('ไม่') ? 'danger' : 'success'}`}>{message}</div>}

      {context && <div className="clinical-grid">
        <section className="workspace-card" style={{ padding: 18 }}><h3 style={{ marginTop: 0 }}>ข้อมูลก่อนซักประวัติ</h3><p><strong>{patient?.display_name}</strong> · HN {patient?.hn}</p><div className="inline-alert"><strong>Pre-visit complaint:</strong> {previsit?.chief_complaint || '—'}<br /><strong>Allergies:</strong> {Array.isArray(previsit?.allergies) ? previsit.allergies.map(String).join(', ') : Array.isArray(patient?.allergies) ? patient.allergies.map(String).join(', ') : '—'}<br /><strong>Current meds:</strong> {Array.isArray(previsit?.current_medications) ? previsit.current_medications.map(String).join(', ') : '—'}</div></section>
        <section className="workspace-card" style={{ padding: 18 }}><h3 style={{ marginTop: 0 }}>Vitals ล่าสุด</h3>{vitals ? <div className="queue-summary-grid"><div className="metric-card"><span>BP</span><strong>{vitals.sbp}/{vitals.dbp}</strong></div><div className="metric-card"><span>SpO₂</span><strong>{vitals.spo2 ?? '—'}%</strong></div><div className="metric-card"><span>Temp</span><strong>{vitals.temperature ?? '—'}°C</strong></div><div className="metric-card"><span>Pain</span><strong>{vitals.pain_score ?? '—'}/10</strong></div></div> : <div className="empty-state">ยังไม่มี Vital signs</div>}</section>
      </div>}

      <form className="workspace-card" style={{ padding: 22, display: 'grid', gap: 14 }} onSubmit={save}>
        <div className="workspace-card-head" style={{ padding: 0 }}><h3><ClipboardCheck size={18} /> Clinical nursing workup</h3></div>
        <label><span>Chief Complaint <em>*</em></span><textarea required rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} /></label>
        <label><span>History of Present Illness</span><textarea rows={3} value={history} onChange={(e) => setHistory(e.target.value)} /></label>
        <div className="form-two"><label><span>Current medications</span><input value={String(extra.current_medications || '')} onChange={(e) => updateExtra('current_medications', e.target.value)} /></label><label><span>Herbal / supplements</span><input value={String(extra.herbal_medications || '')} onChange={(e) => updateExtra('herbal_medications', e.target.value)} /></label></div>
        <div className="form-two"><label><span>Chronic conditions</span><input value={String(extra.chronic_conditions || '')} onChange={(e) => updateExtra('chronic_conditions', e.target.value)} /></label><label><span>Cancer history / diagnosis</span><input value={String(extra.cancer_history || '')} onChange={(e) => updateExtra('cancer_history', e.target.value)} /></label></div>
        <div className="form-two"><label><span>Previous treatment</span><input value={String(extra.previous_treatment || '')} onChange={(e) => updateExtra('previous_treatment', e.target.value)} /></label><label><span>Current regimen</span><input value={String(extra.current_regimen || '')} onChange={(e) => updateExtra('current_regimen', e.target.value)} placeholder="เช่น FOLFOX Cycle 3/6" /></label></div>
        <div className="form-two"><label><span>Last treatment date</span><input type="date" value={String(extra.last_treatment_date || '')} onChange={(e) => updateExtra('last_treatment_date', e.target.value)} /></label><label><span>Functional status (demo)</span><select value={String(extra.functional_status || '')} onChange={(e) => updateExtra('functional_status', e.target.value)}><option value="">ไม่ระบุ</option><option value="0">ECOG 0</option><option value="1">ECOG 1</option><option value="2">ECOG 2</option><option value="3">ECOG 3</option><option value="4">ECOG 4</option></select></label></div>
        <div className="form-two"><label><span>Food intake</span><input value={String(extra.food_intake || '')} onChange={(e) => updateExtra('food_intake', e.target.value)} /></label><label><span>Nausea / vomiting</span><input value={String(extra.nausea_vomiting || '')} onChange={(e) => updateExtra('nausea_vomiting', e.target.value)} /></label></div>
        <div className="form-two"><label><span>Fever history</span><input value={String(extra.fever_history || '')} onChange={(e) => updateExtra('fever_history', e.target.value)} /></label><label><span>Fatigue</span><input value={String(extra.fatigue || '')} onChange={(e) => updateExtra('fatigue', e.target.value)} /></label></div>
        <div className="form-two"><label><span>Smoking</span><input value={String(extra.smoking || '')} onChange={(e) => updateExtra('smoking', e.target.value)} /></label><label><span>Alcohol</span><input value={String(extra.alcohol || '')} onChange={(e) => updateExtra('alcohol', e.target.value)} /></label></div>
        <label><span>Referral information</span><input value={String(extra.referral_information || '')} onChange={(e) => updateExtra('referral_information', e.target.value)} /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={Boolean(extra.allergies_confirmed)} onChange={(e) => updateExtra('allergies_confirmed', e.target.checked)} style={{ width: 18, height: 18 }} /><span>พยาบาลตรวจทานข้อมูลแพ้ยากับผู้ป่วยแล้ว</span></label>
        <div className="form-two"><label><span>Triage</span><select value={triageLevel} onChange={(e) => setTriageLevel(e.target.value as typeof triageLevel)}><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option><option value="fast_track">Fast-track</option></select></label><label><span>Nurse notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label></div>
        <div style={{ display: 'flex', gap: 14 }}><label style={{ display: 'flex', gap: 7 }}><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent</label><label style={{ display: 'flex', gap: 7 }}><input type="checkbox" checked={fastTrack} onChange={(e) => setFastTrack(e.target.checked)} /> Fast-track</label></div>
        <div className="inline-alert warning">Triage/functional-status fields เป็นแบบจำลองเพื่อการศึกษา ไม่ใช่ clinical protocol จริง</div>
        <button className="button primary large" disabled={busy || !encounterId}>{busy ? 'กำลังบันทึก…' : 'บันทึกและส่งต่อแพทย์'}</button>
      </form>

      <QueueWorkspace role="nurse" stationCodes={['MHT']} onSelectEncounter={(id) => void selectEncounter(id)} />
    </div>
  </StaffShell>
}
