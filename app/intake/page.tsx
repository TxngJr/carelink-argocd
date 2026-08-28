'use client'

import React, { useState } from 'react'
import { AlertOctagon, CheckCircle2, Flame, HeartPulse, Send, Sparkles, Stethoscope, User } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { clientApi } from '@/lib/client'

export default function IntakePage() {
  const [encounterId, setEncounterId] = useState('')
  const [complaint, setComplaint] = useState('')
  const [history, setHistory] = useState('')
  const [triageLevel, setTriageLevel] = useState('normal')
  const [isUrgent, setIsUrgent] = useState(false)
  const [isFastTrack, setIsFastTrack] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSaveAssessment(e: React.FormEvent) {
    e.preventDefault()
    if (!encounterId) {
      setMessage('กรุณากรอก Encounter ID ของผู้ป่วย')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await clientApi.saveAssessment(encounterId, {
        chief_complaint: complaint,
        history_of_illness: history,
        triage_level: triageLevel,
        is_urgent: isUrgent,
        is_fast_track: isFastTrack,
        nurse_notes: notes,
      })
      if (isUrgent || isFastTrack) {
        await clientApi.markUrgent(encounterId)
      }
      setMessage('บันทึกการซักประวัติและระดับความเร่งด่วนสำเร็จ พร้อมส่งต่อแพทย์')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell role="nurse" displayName="พยาบาลวิชาชีพ จุดซักประวัติ">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">NURSE INTAKE & TRIAGE WORKSPACE</span>
            <h2>จุดซักประวัติพยาบาลและการคัดกรองความเร่งด่วน (MHT)</h2>
            <p>ประเมินอาการสำคัญ ประวัติความเจ็บป่วย คัดแยก Acuity ESI และยกระดับเคสด่วน Fast-track เข้าห้องตรวจแพทย์</p>
          </div>
        </div>

        <div className="clinical-grid">
          {/* Intake Assessment Form */}
          <div className="workspace-card">
            <div className="workspace-card-head">
              <h3>บันทึกประวัติการคัดกรอง (Clinical Nursing Workup)</h3>
              {isUrgent && <span className="status-pill bottleneck">เคสด่วน (Urgent)</span>}
              {isFastTrack && <span className="status-pill flowing">Fast-track</span>}
            </div>

            <form style={{ padding: '0 20px 24px', display: 'grid', gap: 14 }} onSubmit={handleSaveAssessment}>
              <label>
                <span>Encounter ID ผู้ป่วย <em>*</em></span>
                <input required value={encounterId} onChange={(e) => setEncounterId(e.target.value)} placeholder="เช่น 66a..." />
              </label>

              <label>
                <span>อาการสำคัญที่มาโรงพยาบาล (Chief Complaint) <em>*</em></span>
                <textarea required rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="ระบุอาการสำคัญและระยะเวลาที่มีอาการ" />
              </label>

              <label>
                <span>ประวัติความเจ็บป่วยปัจจุบัน (History of Present Illness)</span>
                <textarea rows={3} value={history} onChange={(e) => setHistory(e.target.value)} placeholder="รายละเอียดอาการ สิ่งที่ทำให้อาการดีขึ้น/แย่ลง ยาที่รับประทาน" />
              </label>

              <div className="form-two">
                <label>
                  <span>ระดับความเร่งด่วน (Triage Acuity Level)</span>
                  <select value={triageLevel} onChange={(e) => setTriageLevel(e.target.value)}>
                    <option value="normal">Normal (ระดับ 4-5 ผู้ป่วยทั่วไป)</option>
                    <option value="urgent">Urgent (ระดับ 3 ผู้ป่วยเร่งด่วน)</option>
                    <option value="emergency">Emergency (ระดับ 1-2 ผู้ป่วยวิกฤต)</option>
                    <option value="fast_track">Fast-track (ช่องทางด่วนพิเศษ)</option>
                  </select>
                </label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: '.85rem' }}>ยกระดับเป็นเคสด่วน</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isFastTrack} onChange={(e) => setIsFastTrack(e.target.checked)} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: '.85rem' }}>Fast-track</span>
                  </label>
                </div>
              </div>

              <label>
                <span>บันทึกเพิ่มเติมของพยาบาล (Nurse Clinical Notes)</span>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ข้อสังเกตเพิ่มเติม เช่น ผู้ป่วยมีอาการอ่อนแรง เดินเซ" />
              </label>

              {message && (
                <div className={`inline-alert ${message.includes('สำเร็จ') ? 'success' : 'danger'}`}>
                  {message}
                </div>
              )}

              <button className="button primary large" disabled={busy}>
                {busy ? 'กำลังบันทึก…' : 'บันทึกประวัติและส่งเข้าห้องตรวจแพทย์'}
              </button>
            </form>
          </div>

          {/* Guidelines */}
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="workspace-card" style={{ padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>เกณฑ์การคัดแยกผู้ป่วย (Triage Categories)</h3>
              <div style={{ display: 'grid', gap: 10, fontSize: '.82rem' }}>
                <div style={{ padding: 10, borderRadius: 10, background: '#fdf3f3', border: '1px solid #fad3d3' }}>
                  <strong style={{ color: 'var(--crit)' }}>🔴 Level 1-2 (Resuscitation / Emergency):</strong>
                  <p style={{ margin: '3px 0 0', color: '#681c1c' }}>หมดสติ, หายใจลำบากวิกฤต, เจ็บหน้าอกรุนแรง ส่งพบแพทย์ทันที</p>
                </div>
                <div style={{ padding: 10, borderRadius: 10, background: '#fdf8ea', border: '1px solid #fae7ba' }}>
                  <strong style={{ color: 'var(--warn)' }}>🟡 Level 3 (Urgent):</strong>
                  <p style={{ margin: '3px 0 0', color: '#684507' }}>ไข้สูงในผู้ป่วยมะเร็ง, ปวดรุนแรง Pain Score ≥ 7, อาเจียนต่อเนื่อง</p>
                </div>
                <div style={{ padding: 10, borderRadius: 10, background: '#f2f8f6', border: '1px solid #d1e8e2' }}>
                  <strong style={{ color: 'var(--ok)' }}>🟢 Level 4-5 (Non-urgent / Routine):</strong>
                  <p style={{ margin: '3px 0 0', color: '#164c3e' }}>มาตามนัดตรวจติดตามทั่วไป, รับยาเดิม, สัญญาณชีพปกติ</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Station Queue Workspace for Nurse */}
        <QueueWorkspace role="nurse" />
      </div>
    </StaffShell>
  )
}
