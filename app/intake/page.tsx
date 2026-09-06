'use client'

import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  History,
  LoaderCircle,
  MessageSquareText,
  Pill,
  Save,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  UserRound,
} from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { Feedback } from '@/components/ui'
import { clientApi } from '@/lib/client'
import { extendedClient, type ClinicalContext } from '@/lib/extended-client'
import styles from './intake.module.css'

type MessageTone = 'success' | 'danger'

const emptyExtra: Record<string, string | boolean> = {
  allergies_confirmed: false,
  current_medications: '',
  herbal_medications: '',
  chronic_conditions: '',
  cancer_history: '',
  previous_treatment: '',
  current_regimen: '',
  last_treatment_date: '',
  functional_status: '',
  food_intake: '',
  nausea_vomiting: '',
  fever_history: '',
  fatigue: '',
  smoking: '',
  alcohol: '',
  referral_information: '',
}

function textList(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return '—'
  return value.map(String).join(', ')
}

export default function IntakePage() {
  const [encounterId, setEncounterId] = useState('')
  const [context, setContext] = useState<ClinicalContext | null>(null)
  const [complaint, setComplaint] = useState('')
  const [history, setHistory] = useState('')
  const [triageLevel, setTriageLevel] = useState<'normal' | 'urgent' | 'emergency' | 'fast_track'>('normal')
  const [urgent, setUrgent] = useState(false)
  const [fastTrack, setFastTrack] = useState(false)
  const [notes, setNotes] = useState('')
  const [extra, setExtraState] = useState<Record<string, string | boolean>>(emptyExtra)
  const [busy, setBusy] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<MessageTone>('success')

  function resetDraft() {
    setComplaint('')
    setHistory('')
    setTriageLevel('normal')
    setUrgent(false)
    setFastTrack(false)
    setNotes('')
    setExtraState({ ...emptyExtra })
  }

  async function selectEncounter(id: string) {
    setLoadingContext(true)
    setMessage('')
    setEncounterId('')
    setContext(null)
    resetDraft()
    try {
      const next = await extendedClient.getClinicalContext(id)
      const pre = next.previsit || {}
      setContext(next)
      setEncounterId(id)
      setComplaint(String(pre.chief_complaint || ''))
      setExtraState({
        ...emptyExtra,
        current_medications: Array.isArray(pre.current_medications) ? pre.current_medications.map(String).join(', ') : '',
        herbal_medications: Array.isArray(pre.herbal_medications) ? pre.herbal_medications.map(String).join(', ') : '',
        chronic_conditions: Array.isArray(pre.chronic_conditions) ? pre.chronic_conditions.map(String).join(', ') : String(pre.chronic_conditions || ''),
        food_intake: String(pre.food_intake || ''),
        nausea_vomiting: String(pre.nausea_vomiting || ''),
        fever_history: String(pre.fever_history || ''),
        fatigue: String(pre.fatigue || ''),
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (cause) {
      setContext(null)
      setEncounterId('')
      setMessageTone('danger')
      setMessage(cause instanceof Error ? cause.message : 'โหลดข้อมูลผู้ป่วยไม่สำเร็จ')
    } finally {
      setLoadingContext(false)
    }
  }

  function updateExtra(key: string, value: string | boolean) {
    setExtraState((prev) => ({ ...prev, [key]: value }))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!encounterId) {
      setMessageTone('danger')
      setMessage('กรุณาเลือกผู้ป่วยจากคิว MHT ก่อนบันทึก')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await Promise.all([
        clientApi.saveAssessment(encounterId, {
          chief_complaint: complaint,
          history_of_illness: history,
          triage_level: triageLevel,
          is_urgent: urgent,
          is_fast_track: fastTrack,
          nurse_notes: notes,
        }),
        extendedClient.saveExtendedAssessment(encounterId, extra),
      ])
      if (urgent || fastTrack || triageLevel === 'emergency') await clientApi.markUrgent(encounterId)
      setMessageTone('success')
      setMessage('บันทึกการซักประวัติแล้ว จากนั้นกด “เสร็จและส่งต่อ” ในคิว MHT เพื่อส่งผู้ป่วยไปห้องแพทย์')
    } catch (cause) {
      setMessageTone('danger')
      setMessage(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const patient = context?.patient
  const vitals = context?.vitals
  const previsit = context?.previsit

  return (
    <StaffShell role="nurse" displayName="พยาบาลจุดซักประวัติ">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroIcon}><ClipboardCheck size={25} aria-hidden="true" /></div>
          <div className={styles.heroCopy}>
            <span className="eyebrow">NURSE INTAKE & TRIAGE · MHT</span>
            <h1>ซักประวัติผู้ป่วย</h1>
            <p>ตรวจข้อมูล Pre-visit, Vital signs และบันทึกข้อมูลสำคัญก่อนปิดงาน MHT เพื่อส่งต่อแพทย์</p>
          </div>
          <div className={`${styles.patientStatus} ${encounterId ? styles.patientSelected : ''}`}>
            {loadingContext ? <LoaderCircle size={17} className={styles.spin} aria-hidden="true" /> : encounterId ? <CheckCircle2 size={17} aria-hidden="true" /> : <UserRound size={17} aria-hidden="true" />}
            <div><span>{loadingContext ? 'กำลังโหลดข้อมูล' : encounterId ? 'กำลังซักประวัติ' : 'รอเลือกผู้ป่วย'}</span><strong>{patient?.display_name || 'เลือกจากคิว MHT ด้านล่าง'}</strong></div>
          </div>
        </header>

        {message && <Feedback tone={messageTone} className={styles.alert}>{message}</Feedback>}

        {!context && !loadingContext && (
          <section className={styles.startCard}>
            <span className={styles.startIcon}><Sparkles size={28} aria-hidden="true" /></span>
            <div><h2>เริ่มจากเลือกผู้ป่วยในคิว MHT</h2><p>ระบบจะล้าง draft คนก่อนหน้า แล้วดึงข้อมูลผู้ป่วย, Pre-visit และ Vital signs ของ encounter ที่เลือกขึ้นมาใหม่</p></div>
            <ArrowRight size={22} aria-hidden="true" />
          </section>
        )}

        {context && (
          <section className={styles.snapshotGrid}>
            <article className={styles.patientSnapshot}>
              <div className={styles.cardHeading}><span><UserRound size={19} aria-hidden="true" /></span><div><h2>Patient snapshot</h2><p>ข้อมูลที่ควรเห็นก่อนเริ่มซักประวัติ</p></div></div>
              <div className={styles.patientName}><div>{(patient?.display_name || 'ผ').slice(0, 1)}</div><span><strong>{patient?.display_name || 'ผู้ป่วย'}</strong><small>HN {patient?.hn || '—'}</small></span></div>
              <div className={styles.previsitGrid}>
                <div><span>อาการสำคัญ</span><strong>{previsit?.chief_complaint || '—'}</strong></div>
                <div><span>แพ้ยา / สิ่งที่แพ้</span><strong>{textList(previsit?.allergies || patient?.allergies)}</strong></div>
                <div><span>ยาที่ใช้อยู่</span><strong>{textList(previsit?.current_medications)}</strong></div>
              </div>
            </article>

            <article className={styles.vitalsCard}>
              <div className={styles.cardHeading}><span className={styles.vitalsIcon}><HeartPulse size={19} aria-hidden="true" /></span><div><h2>Vital signs ล่าสุด</h2><p>ใช้ประกอบการประเมินก่อนพบแพทย์</p></div></div>
              {vitals ? (
                <div className={styles.vitalsGrid}>
                  <div><span>BP</span><strong>{vitals.sbp}/{vitals.dbp}</strong><small>mmHg</small></div>
                  <div><span>SpO₂</span><strong>{vitals.spo2 ?? '—'}</strong><small>%</small></div>
                  <div><span>Temp</span><strong>{vitals.temperature ?? '—'}</strong><small>°C</small></div>
                  <div><span>Pain</span><strong>{vitals.pain_score ?? '—'}</strong><small>/10</small></div>
                </div>
              ) : <div className={styles.noVitals}>ยังไม่มี Vital signs</div>}
            </article>
          </section>
        )}

        <form className={styles.formCard} onSubmit={save}>
          <div className={styles.formHeader}>
            <div className={styles.cardHeading}><span><Stethoscope size={20} aria-hidden="true" /></span><div><h2>Clinical nursing workup</h2><p>แบ่งข้อมูลเป็นหมวดเพื่ออ่านและกรอกได้เร็วขึ้น</p></div></div>
            <span className={styles.requiredNote}>* จำเป็น</span>
          </div>

          <section className={styles.formSection}>
            <div className={styles.sectionLabel}><span><MessageSquareText size={18} aria-hidden="true" /></span><div><h3>1. อาการปัจจุบัน</h3><p>สรุปเหตุผลที่มารับบริการและลำดับอาการ</p></div></div>
            <div className={styles.fields}>
              <label><span>Chief Complaint <em>*</em></span><textarea required rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="อาการสำคัญที่ผู้ป่วยมาพบแพทย์" /></label>
              <label><span>History of Present Illness</span><textarea rows={4} value={history} onChange={(e) => setHistory(e.target.value)} placeholder="เริ่มมีอาการเมื่อไร เป็นอย่างไร มีอะไรทำให้อาการดีขึ้นหรือแย่ลง" /></label>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionLabel}><span className={styles.pillIcon}><Pill size={18} aria-hidden="true" /></span><div><h3>2. ยา โรคประจำตัว และประวัติสำคัญ</h3><p>ทบทวนข้อมูลที่มีผลต่อการรักษา</p></div></div>
            <div className={styles.twoCol}>
              <label><span>Current medications</span><input value={String(extra.current_medications || '')} onChange={(e) => updateExtra('current_medications', e.target.value)} placeholder="ชื่อยา / ขนาด / ความถี่" /></label>
              <label><span>Herbal / supplements</span><input value={String(extra.herbal_medications || '')} onChange={(e) => updateExtra('herbal_medications', e.target.value)} placeholder="สมุนไพรหรืออาหารเสริม" /></label>
              <label><span>Chronic conditions</span><input value={String(extra.chronic_conditions || '')} onChange={(e) => updateExtra('chronic_conditions', e.target.value)} placeholder="โรคประจำตัว" /></label>
              <label><span>Cancer history / diagnosis</span><input value={String(extra.cancer_history || '')} onChange={(e) => updateExtra('cancer_history', e.target.value)} placeholder="ประวัติโรค / การวินิจฉัย" /></label>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionLabel}><span className={styles.treatmentIcon}><History size={18} aria-hidden="true" /></span><div><h3>3. ประวัติการรักษา</h3><p>ช่วยให้แพทย์เห็น treatment timeline ได้เร็ว</p></div></div>
            <div className={styles.twoCol}>
              <label><span>Previous treatment</span><input value={String(extra.previous_treatment || '')} onChange={(e) => updateExtra('previous_treatment', e.target.value)} /></label>
              <label><span>Current regimen</span><input value={String(extra.current_regimen || '')} onChange={(e) => updateExtra('current_regimen', e.target.value)} placeholder="เช่น FOLFOX Cycle 3/6" /></label>
              <label><span>Last treatment date</span><input type="date" value={String(extra.last_treatment_date || '')} onChange={(e) => updateExtra('last_treatment_date', e.target.value)} /></label>
              <label><span>Functional status (demo)</span><select value={String(extra.functional_status || '')} onChange={(e) => updateExtra('functional_status', e.target.value)}><option value="">ไม่ระบุ</option><option value="0">ECOG 0</option><option value="1">ECOG 1</option><option value="2">ECOG 2</option><option value="3">ECOG 3</option><option value="4">ECOG 4</option></select></label>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionLabel}><span className={styles.activityIcon}><Activity size={18} aria-hidden="true" /></span><div><h3>4. อาการร่วมและพฤติกรรมสุขภาพ</h3><p>ข้อมูลประกอบการประเมินภาพรวม</p></div></div>
            <div className={styles.twoCol}>
              <label><span>Food intake</span><input value={String(extra.food_intake || '')} onChange={(e) => updateExtra('food_intake', e.target.value)} /></label>
              <label><span>Nausea / vomiting</span><input value={String(extra.nausea_vomiting || '')} onChange={(e) => updateExtra('nausea_vomiting', e.target.value)} /></label>
              <label><span>Fever history</span><input value={String(extra.fever_history || '')} onChange={(e) => updateExtra('fever_history', e.target.value)} /></label>
              <label><span>Fatigue</span><input value={String(extra.fatigue || '')} onChange={(e) => updateExtra('fatigue', e.target.value)} /></label>
              <label><span>Smoking</span><input value={String(extra.smoking || '')} onChange={(e) => updateExtra('smoking', e.target.value)} /></label>
              <label><span>Alcohol</span><input value={String(extra.alcohol || '')} onChange={(e) => updateExtra('alcohol', e.target.value)} /></label>
            </div>
            <label><span>Referral information</span><input value={String(extra.referral_information || '')} onChange={(e) => updateExtra('referral_information', e.target.value)} /></label>
          </section>

          <section className={`${styles.formSection} ${styles.safetySection}`}>
            <div className={styles.sectionLabel}><span className={styles.safetyIcon}><ShieldCheck size={18} aria-hidden="true" /></span><div><h3>5. Safety check & Triage</h3><p>ยืนยันข้อมูลสำคัญและกำหนดระดับเร่งด่วนก่อนบันทึก</p></div></div>
            <label className={styles.confirmCheck}><input type="checkbox" checked={Boolean(extra.allergies_confirmed)} onChange={(e) => updateExtra('allergies_confirmed', e.target.checked)} /><span><strong>ตรวจทานข้อมูลแพ้ยากับผู้ป่วยแล้ว</strong><small>ควรยืนยันกับผู้ป่วยทุกครั้งก่อนดำเนินการต่อ</small></span></label>
            <div className={styles.twoCol}>
              <label><span>Triage</span><select value={triageLevel} onChange={(e) => setTriageLevel(e.target.value as typeof triageLevel)}><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option><option value="fast_track">Fast-track</option></select></label>
              <label><span>Nurse notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="หมายเหตุสำหรับทีมถัดไป" /></label>
            </div>
            <div className={styles.priorityChoices}>
              <label className={urgent ? styles.priorityActive : ''}><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /><AlertTriangle size={17} aria-hidden="true" /><span>Urgent</span></label>
              <label className={fastTrack ? styles.fastTrackActive : ''}><input type="checkbox" checked={fastTrack} onChange={(e) => setFastTrack(e.target.checked)} /><Syringe size={17} aria-hidden="true" /><span>Fast-track</span></label>
            </div>
            <div className={styles.demoNotice}><AlertTriangle size={17} aria-hidden="true" /><span>Triage และ functional-status เป็นข้อมูลจำลองเพื่อการศึกษา ไม่ใช่ clinical protocol จริง</span></div>
          </section>

          <div className={styles.actionBar}>
            <div><ClipboardCheck size={18} aria-hidden="true" /><span><strong>{patient?.display_name || 'ยังไม่ได้เลือกผู้ป่วย'}</strong><small>{encounterId ? 'ตรวจข้อมูลให้ครบก่อนบันทึก' : 'เลือกผู้ป่วยจากคิว MHT ก่อน'}</small></span></div>
            <button className={`button primary large ${styles.submitButton}`} disabled={busy || !encounterId}>
              {busy ? <><LoaderCircle size={18} className={styles.spin} aria-hidden="true" /> กำลังบันทึก…</> : <><Save size={18} aria-hidden="true" /> บันทึกการซักประวัติ</>}
            </button>
          </div>
        </form>

        <section className={styles.queueSection}>
          <div className={styles.queueHeading}><span><UserRound size={20} aria-hidden="true" /></span><div><h2>คิวรอซักประวัติ MHT</h2><p>เลือกผู้ป่วยเพื่อเปิด Clinical nursing workup ด้านบน แล้วกด “เสร็จและส่งต่อ” หลังบันทึกครบ</p></div></div>
          <QueueWorkspace role="nurse" stationCodes={['MHT']} onSelectEncounter={(id) => void selectEncounter(id)} />
        </section>
      </div>
    </StaffShell>
  )
}
