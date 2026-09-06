'use client'

import React, { useState } from 'react'
import {
  Activity, Gauge, HeartPulse, Ruler, Save, Scale, Thermometer, TriangleAlert, UserRound, Wind,
} from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { Feedback, FormField, PageHeader, StatusBadge } from '@/components/ui'
import { clientApi } from '@/lib/client'
import type { Encounter } from '@/lib/types'

type FeedbackState = { tone: 'success' | 'danger' | 'warning' | 'info'; message: string } | null

type VitalsDraft = {
  sbp: string
  dbp: string
  pulse: string
  temp: string
  respRate: string
  spo2: string
  weight: string
  height: string
  painScore: string
  notes: string
}

const emptyDraft: VitalsDraft = {
  sbp: '', dbp: '', pulse: '', temp: '', respRate: '', spo2: '', weight: '', height: '', painScore: '0', notes: '',
}

export default function VitalsPage() {
  const [encounterId, setEncounterId] = useState('')
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [draft, setDraft] = useState<VitalsDraft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)

  function setField<K extends keyof VitalsDraft>(key: K, value: VitalsDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    if (feedback?.tone === 'danger') setFeedback(null)
  }

  const weightNumber = Number(draft.weight)
  const heightNumber = Number(draft.height)
  const bmi = draft.weight && draft.height && weightNumber > 0 && heightNumber > 0
    ? (weightNumber / ((heightNumber / 100) * (heightNumber / 100))).toFixed(1)
    : '-'

  const sbpNumber = Number(draft.sbp)
  const dbpNumber = Number(draft.dbp)
  const spo2Number = Number(draft.spo2)
  const tempNumber = Number(draft.temp)
  const isHypertension = Boolean(draft.sbp && draft.dbp) && (sbpNumber >= 140 || dbpNumber >= 90)
  const isHypoxia = Boolean(draft.spo2) && spo2Number < 95
  const isFever = Boolean(draft.temp) && tempNumber >= 37.8

  async function handleSaveVitals(event: React.FormEvent) {
    event.preventDefault()
    if (!encounterId) {
      setFeedback({ tone: 'warning', message: 'กรุณาเลือกผู้ป่วยจากคิว VM ด้านล่างก่อนบันทึก' })
      return
    }
    if (!draft.sbp || !draft.dbp) {
      setFeedback({ tone: 'warning', message: 'กรุณากรอกความดันตัวบนและตัวล่างให้ครบ' })
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      await clientApi.saveVitals(encounterId, {
        sbp: Number(draft.sbp),
        dbp: Number(draft.dbp),
        ...(draft.pulse ? { pulse: Number(draft.pulse) } : {}),
        ...(draft.temp ? { temperature: Number(draft.temp) } : {}),
        ...(draft.respRate ? { respiratory_rate: Number(draft.respRate) } : {}),
        ...(draft.spo2 ? { spo2: Number(draft.spo2) } : {}),
        ...(draft.weight ? { weight_kg: Number(draft.weight) } : {}),
        ...(draft.height ? { height_cm: Number(draft.height) } : {}),
        ...(draft.painScore ? { pain_score: Number(draft.painScore) } : {}),
        notes: draft.notes,
      })
      setFeedback({ tone: 'success', message: 'บันทึกสัญญาณชีพสำเร็จ จากนั้นกด “เสร็จและส่งต่อ” ที่คิว VM เพื่อส่งผู้ป่วยไป MHT' })
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'บันทึกสัญญาณชีพไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function selectEncounter(id: string) {
    try {
      setFeedback(null)
      const detail = await clientApi.getEncounterDetail(id)
      setEncounterId(id)
      setEncounter(detail)
      setDraft(emptyDraft)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'โหลดข้อมูลผู้ป่วยไม่สำเร็จ' })
    }
  }

  return (
    <StaffShell role="vitals_staff" displayName="พยาบาลจุดวัดสัญญาณชีพ">
      <div className="staff-page-stack">
        <PageHeader
          eyebrow="VITAL SIGNS INTAKE"
          title="จุดวัดสัญญาณชีพและคัดกรองเบื้องต้น (VM)"
          description="เลือกผู้ป่วยจากคิวก่อนทุกครั้ง บันทึกสัญญาณชีพ แล้วปิดงานที่คิว VM เพื่อส่งต่อไปซักประวัติ MHT"
          icon={<Activity size={22} />}
          badge={encounter ? <StatusBadge tone="info">คิว {encounter.current_queue_no}</StatusBadge> : undefined}
        />

        {feedback && <Feedback tone={feedback.tone}>{feedback.message}</Feedback>}

        <div className="clinical-grid">
          <div className="workspace-card">
            <div className="workspace-card-head">
              <div><span className="card-kicker"><HeartPulse size={14} aria-hidden="true" />Vital Signs Entry</span><h3>บันทึกค่าสัญญาณชีพ</h3></div>
              {bmi !== '-' && <StatusBadge tone="info">BMI {bmi} kg/m²</StatusBadge>}
            </div>

            <form style={{ padding: '18px 20px 24px', display: 'grid', gap: 14 }} onSubmit={handleSaveVitals}>
              {encounter ? <div className="patient-context-card">
                <span className="patient-context-icon"><UserRound size={19} aria-hidden="true" /></span>
                <div><strong>{encounter.patient?.display_name || 'ผู้ป่วย'} · HN {encounter.patient?.hn || '—'}</strong><small>{encounter.current_queue_no} · {encounter.current_station}</small></div>
              </div> : <Feedback tone="info">เลือกผู้ป่วยจากคิว VM ด้านล่างก่อนเริ่มกรอกค่า เพื่อป้องกันข้อมูลข้ามผู้ป่วย</Feedback>}

              <div className="vitals-summary-grid" aria-label="สรุปค่าที่กำลังกรอก">
                <div className={`vital-summary ${isHypertension ? 'warning' : ''}`}><HeartPulse size={23} aria-hidden="true" /><span>ความดัน</span><strong>{draft.sbp || '—'}/{draft.dbp || '—'}</strong></div>
                <div className="vital-summary"><Gauge size={23} aria-hidden="true" /><span>ชีพจร</span><strong>{draft.pulse || '—'} bpm</strong></div>
                <div className={`vital-summary ${isFever ? 'warning' : ''}`}><Thermometer size={23} aria-hidden="true" /><span>อุณหภูมิ</span><strong>{draft.temp || '—'} °C</strong></div>
                <div className={`vital-summary ${isHypoxia ? 'danger' : ''}`}><Wind size={23} aria-hidden="true" /><span>SpO₂</span><strong>{draft.spo2 || '—'} %</strong></div>
              </div>

              <div className="form-two">
                <FormField label="ความดันตัวบน (SBP mmHg)" required><input required type="number" min="40" max="300" value={draft.sbp} onChange={(e) => setField('sbp', e.target.value)} placeholder="เช่น 120" /></FormField>
                <FormField label="ความดันตัวล่าง (DBP mmHg)" required><input required type="number" min="20" max="200" value={draft.dbp} onChange={(e) => setField('dbp', e.target.value)} placeholder="เช่น 80" /></FormField>
              </div>

              <div className="form-two">
                <FormField label="ชีพจร (Pulse bpm)"><input type="number" min="20" max="250" value={draft.pulse} onChange={(e) => setField('pulse', e.target.value)} placeholder="เช่น 78" /></FormField>
                <FormField label="อุณหภูมิร่างกาย (°C)"><input type="number" min="30" max="45" step="0.1" value={draft.temp} onChange={(e) => setField('temp', e.target.value)} placeholder="เช่น 36.6" /></FormField>
              </div>

              <div className="form-two">
                <FormField label="ออกซิเจนในเลือด SpO₂ (%)"><input type="number" min="50" max="100" value={draft.spo2} onChange={(e) => setField('spo2', e.target.value)} placeholder="เช่น 98" /></FormField>
                <FormField label="อัตราการหายใจ (RR /min)"><input type="number" min="4" max="80" value={draft.respRate} onChange={(e) => setField('respRate', e.target.value)} placeholder="เช่น 18" /></FormField>
              </div>

              <div className="form-two">
                <FormField label="น้ำหนักตัว (กก.)"><input type="number" min="2" max="500" step="0.1" value={draft.weight} onChange={(e) => setField('weight', e.target.value)} placeholder="เช่น 65" /></FormField>
                <FormField label="ส่วนสูง (ซม.)"><input type="number" min="50" max="250" value={draft.height} onChange={(e) => setField('height', e.target.value)} placeholder="เช่น 170" /></FormField>
              </div>

              <FormField label="ระดับความปวด Pain Score (0–10)"><input type="number" min="0" max="10" value={draft.painScore} onChange={(e) => setField('painScore', e.target.value)} /></FormField>
              <FormField label="บันทึกเพิ่มเติม"><textarea rows={2} value={draft.notes} onChange={(event) => setField('notes', event.target.value)} placeholder="ข้อมูลประกอบการคัดกรอง (ถ้ามี)" /></FormField>

              {(isHypertension || isHypoxia || isFever) && <Feedback tone="warning">
                <strong>พบค่าที่ควรตรวจทานก่อนบันทึก</strong>
                {isHypertension && <div>• ความดันสูงกว่าช่วงตัวอย่างที่ระบบใช้เตือน</div>}
                {isHypoxia && <div>• SpO₂ ต่ำกว่า 95%</div>}
                {isFever && <div>• อุณหภูมิ 37.8°C ขึ้นไป</div>}
              </Feedback>}

              <button className="button primary large" disabled={busy || !encounterId}>
                <Save size={17} aria-hidden="true" />{busy ? 'กำลังบันทึก…' : 'บันทึกสัญญาณชีพ'}
              </button>
            </form>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div className="workspace-card" style={{ padding: 20 }}>
              <div className="form-section-title"><span><TriangleAlert size={17} aria-hidden="true" /></span><div><strong>ช่วงตัวอย่างสำหรับการศึกษา</strong><small>ใช้เพื่อช่วยทดสอบ UI เท่านั้น</small></div></div>
              <Feedback tone="warning">ไม่ใช่เกณฑ์หรือ protocol ทางคลินิกจริง บุคลากรต้องประเมินตามมาตรฐานของหน่วยงาน</Feedback>
              <div className="guide-list" style={{ marginTop: 12 }}>
                <div className="guide-item"><HeartPulse size={16} aria-hidden="true" /><span><strong>BP:</strong> ตัวอย่าง 90–120 / 60–80 mmHg</span></div>
                <div className="guide-item"><Gauge size={16} aria-hidden="true" /><span><strong>Pulse:</strong> ตัวอย่าง 60–100 ครั้ง/นาที</span></div>
                <div className="guide-item"><Thermometer size={16} aria-hidden="true" /><span><strong>Temp:</strong> ตัวอย่าง 36.5–37.5 °C</span></div>
                <div className="guide-item"><Wind size={16} aria-hidden="true" /><span><strong>SpO₂:</strong> ตัวอย่าง 96–100%</span></div>
                <div className="guide-item"><Scale size={16} aria-hidden="true" /><span><strong>BMI:</strong> คำนวณอัตโนมัติเมื่อกรอกน้ำหนักและส่วนสูง</span></div>
                <div className="guide-item"><Ruler size={16} aria-hidden="true" /><span>ช่อง optional ที่ไม่กรอกจะไม่ถูกส่งเป็นค่า 0</span></div>
              </div>
            </div>
          </div>
        </div>

        <QueueWorkspace role="nurse" stationCodes={['VM']} onSelectEncounter={(id) => void selectEncounter(id)} />
      </div>
    </StaffShell>
  )
}
