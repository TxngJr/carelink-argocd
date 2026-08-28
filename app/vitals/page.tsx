'use client'

import React, { useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, HeartPulse, Scale, Send, Thermometer } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { clientApi } from '@/lib/client'

export default function VitalsPage() {
  const [encounterId, setEncounterId] = useState('')
  const [sbp, setSbp] = useState('120')
  const [dbp, setDbp] = useState('80')
  const [pulse, setPulse] = useState('78')
  const [temp, setTemp] = useState('36.6')
  const [respRate, setRespRate] = useState('18')
  const [spo2, setSpo2] = useState('98')
  const [weight, setWeight] = useState('65')
  const [height, setHeight] = useState('170')
  const [painScore, setPainScore] = useState('0')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const bmi = (Number(weight) > 0 && Number(height) > 0)
    ? (Number(weight) / ((Number(height) / 100) * (Number(height) / 100))).toFixed(1)
    : '-'

  const isHypertension = Number(sbp) >= 140 || Number(dbp) >= 90
  const isHypoxia = Number(spo2) < 95
  const isFever = Number(temp) >= 37.8

  async function handleSaveVitals(e: React.FormEvent) {
    e.preventDefault()
    if (!encounterId) {
      setMessage('กรุณาระบุ Encounter ID หรือเลือกคิวผู้ป่วยจากตารางคิวด้านล่าง')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await clientApi.saveVitals(encounterId, {
        sbp: Number(sbp),
        dbp: Number(dbp),
        pulse: Number(pulse),
        temperature: Number(temp),
        respiratory_rate: Number(respRate),
        spo2: Number(spo2),
        weight_kg: Number(weight),
        height_cm: Number(height),
        pain_score: Number(painScore),
        notes,
      })
      setMessage('บันทึกสัญญาณชีพสำเร็จ พร้อมส่งต่อซักประวัติพยาบาล (MHT)')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell role="vitals_staff" displayName="พยาบาลจุดวัดสัญญาณชีพ">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">VITAL SIGNS INTAKE WORKSPACE</span>
            <h2>จุดวัดสัญญาณชีพและคัดกรองเบื้องต้น (VM)</h2>
            <p>บันทึกความดันโลหิต ชีพจร อุณหภูมิ ออกซิเจน SpO2 คำนวณ BMI อัตโนมัติและตรวจจับค่าวิกฤต</p>
          </div>
        </div>

        <div className="clinical-grid">
          {/* Vitals Form */}
          <div className="workspace-card">
            <div className="workspace-card-head">
              <h3>บันทึกค่าสัญญาณชีพ (Vital Signs Entry)</h3>
              {bmi !== '-' && (
                <span className="status-pill flowing">
                  BMI: {bmi} kg/m²
                </span>
              )}
            </div>

            <form style={{ padding: '0 20px 24px', display: 'grid', gap: 14 }} onSubmit={handleSaveVitals}>
              <label>
                <span>Encounter ID ผู้ป่วย <em>*</em></span>
                <input
                  required
                  value={encounterId}
                  onChange={(e) => setEncounterId(e.target.value)}
                  placeholder="กรอก Encounter ID หรือกดคัดลอกจากคิว"
                />
              </label>

              <div className="form-two">
                <label>
                  <span>ความดันตัวบน (SBP mmHg) <em>*</em></span>
                  <input type="number" value={sbp} onChange={(e) => setSbp(e.target.value)} />
                </label>
                <label>
                  <span>ความดันตัวล่าง (DBP mmHg) <em>*</em></span>
                  <input type="number" value={dbp} onChange={(e) => setDbp(e.target.value)} />
                </label>
              </div>

              <div className="form-two">
                <label>
                  <span>ชีพจร (Pulse bpm)</span>
                  <input type="number" value={pulse} onChange={(e) => setPulse(e.target.value)} />
                </label>
                <label>
                  <span>อุณหภูมิร่างกาย (°C)</span>
                  <input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} />
                </label>
              </div>

              <div className="form-two">
                <label>
                  <span>ออกซิเจนในเลือด SpO₂ (%)</span>
                  <input type="number" value={spo2} onChange={(e) => setSpo2(e.target.value)} />
                </label>
                <label>
                  <span>อัตราการหายใจ (RR /min)</span>
                  <input type="number" value={respRate} onChange={(e) => setRespRate(e.target.value)} />
                </label>
              </div>

              <div className="form-two">
                <label>
                  <span>น้ำหนักตัว (กก.)</span>
                  <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </label>
                <label>
                  <span>ส่วนสูง (ซม.)</span>
                  <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
                </label>
              </div>

              <label>
                <span>ระดับความปวด Pain Score (0–10)</span>
                <input type="number" min="0" max="10" value={painScore} onChange={(e) => setPainScore(e.target.value)} />
              </label>

              {/* Warning flags */}
              {(isHypertension || isHypoxia || isFever) && (
                <div className="inline-alert warning" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AlertCircle size={18} />
                  <div>
                    {isHypertension && <div>• ความดันโลหิตสูงกว่าเกณฑ์ปกติ (SBP ≥ 140 หรือ DBP ≥ 90)</div>}
                    {isHypoxia && <div>• ค่าความอิ่มตัวออกซิเจนต่ำ (SpO₂ &lt; 95%)</div>}
                    {isFever && <div>• มีไข้ (Temp ≥ 37.8°C)</div>}
                  </div>
                </div>
              )}

              {message && (
                <div className={`inline-alert ${message.includes('สำเร็จ') ? 'success' : 'danger'}`}>
                  {message}
                </div>
              )}

              <button className="button primary large" disabled={busy}>
                {busy ? 'กำลังบันทึก…' : 'บันทึกสัญญาณชีพและส่งต่อ'}
              </button>
            </form>
          </div>

          {/* Quick Guide Card */}
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="workspace-card" style={{ padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>เกณฑ์คัดกรองค่าวิกฤต (Critical Ranges)</h3>
              <div style={{ display: 'grid', gap: 8, fontSize: '.82rem', color: 'var(--muted)' }}>
                <div style={{ padding: 8, background: '#f8faf9', borderRadius: 8 }}>
                  <strong>BP ปกติ:</strong> 90–120 / 60–80 mmHg
                </div>
                <div style={{ padding: 8, background: '#f8faf9', borderRadius: 8 }}>
                  <strong>Pulse ปกติ:</strong> 60–100 ครั้ง/นาที
                </div>
                <div style={{ padding: 8, background: '#f8faf9', borderRadius: 8 }}>
                  <strong>Temp ปกติ:</strong> 36.5–37.5 °C
                </div>
                <div style={{ padding: 8, background: '#f8faf9', borderRadius: 8 }}>
                  <strong>SpO₂ ปกติ:</strong> 96–100 %
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Station VM Queue Control */}
        <QueueWorkspace role="nurse" />
      </div>
    </StaffShell>
  )
}
