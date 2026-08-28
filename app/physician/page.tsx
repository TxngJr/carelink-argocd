'use client'

import React, { useMemo, useState } from 'react'
import {
  FileText,
  FlaskConical,
  Pill,
  Plus,
  Radio,
  Scan,
  Send,
  Stethoscope,
  Syringe,
  Trash2,
  X,
} from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { buildDoctorRoute, OPTIONAL_ROUTE_CODES, stationMap } from '@/lib/stations'
import { clientApi } from '@/lib/client'
import type { OrderItem } from '@/lib/types'

export default function PhysicianPage() {
  const [encounterId, setEncounterId] = useState('')
  const [subjective, setSubjective] = useState('')
  const [objective, setObjective] = useState('')
  const [assessment, setAssessment] = useState('')
  const [plan, setPlan] = useState('')
  const [icd10, setIcd10] = useState('C50.9')

  // Orders
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [orderType, setOrderType] = useState<OrderItem['type']>('medication')
  const [orderName, setOrderName] = useState('')
  const [orderDose, setOrderDose] = useState('')
  const [orderFreq, setOrderFreq] = useState('1x1 หลังอาหาร')
  const [orderQty, setOrderQty] = useState(1)

  // Route Builder
  const routeOptions = useMemo(() => Array.from(OPTIONAL_ROUTE_CODES), [])
  const [selectedRoute, setSelectedRoute] = useState<string[]>(['LAB', 'PD'])
  const [candidateStation, setCandidateStation] = useState('LAB')
  const [terminal, setTerminal] = useState<'DH' | 'IPW'>('DH')

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function addOrder() {
    if (!orderName.trim()) return
    const newItem: OrderItem = {
      id: Date.now().toString(),
      type: orderType,
      code: orderName.toUpperCase().slice(0, 8),
      name: orderName.trim(),
      dosage: orderDose,
      frequency: orderFreq,
      quantity: Number(orderQty),
      status: 'ordered',
    }
    setOrders((prev) => [...prev, newItem])
    setOrderName('')
    setOrderDose('')
  }

  function removeOrder(id: string) {
    setOrders((prev) => prev.filter((o) => o.id !== id))
  }

  function addRouteStation() {
    if (!selectedRoute.includes(candidateStation)) {
      setSelectedRoute((prev) => [...prev, candidateStation])
    }
  }

  function removeRouteStation(code: string) {
    setSelectedRoute((prev) => prev.filter((c) => c !== code))
  }

  async function handleSaveConsultation(e: React.FormEvent) {
    e.preventDefault()
    if (!encounterId) {
      setMessage('กรุณาระบุ Encounter ID ของผู้ป่วย')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      // 1. Save SOAP Note
      await clientApi.saveConsultation(encounterId, {
        subjective,
        objective,
        assessment,
        plan,
        icd10_codes: [{ code: icd10, name: getIcd10Name(icd10), is_primary: true }],
      })

      // 2. Save Orders if any
      if (orders.length > 0) {
        await clientApi.createOrders(encounterId, { items: orders })
      }

      // 3. Set Doctor Route
      const fullRoute = buildDoctorRoute(selectedRoute, terminal)
      await clientApi.setDoctorRoute(encounterId, fullRoute)

      setMessage('บันทึกผลการตรวจ สั่งการรักษา และกำหนดเส้นทางสำเร็จ')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  function getIcd10Name(code: string) {
    const map: Record<string, string> = {
      'C50.9': 'Malignant neoplasm of breast, unspecified',
      'C34.9': 'Malignant neoplasm of bronchus or lung, unspecified',
      'C18.9': 'Malignant neoplasm of colon, unspecified',
      'I10': 'Essential (primary) hypertension',
      'E11.9': 'Type 2 diabetes mellitus without complications',
    }
    return map[code] || code
  }

  return (
    <StaffShell role="doctor" displayName="นพ. วรเมธ สถิตย์ธรรม (อายุรกรรมมะเร็ง)">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">PHYSICIAN CONSULTATION WORKSPACE</span>
            <h2>ห้องตรวจแพทย์ (PC1–PC4)</h2>
            <p>บันทึกประวัติการตรวจ (SOAP), รหัสโรค ICD-10, สั่งตรวจแล็บ/รังสี/สั่งยา และกำหนดเส้นทางบริการหลังตรวจ</p>
          </div>
        </div>

        <div className="clinical-grid">
          {/* Main Consultation Workspace */}
          <form className="workspace-card" onSubmit={handleSaveConsultation} style={{ display: 'grid', gap: 16, padding: 22 }}>
            <div className="workspace-card-head" style={{ padding: 0 }}>
              <h3>บันทึกการตรวจและวินิจฉัย (Clinical Consultation Note)</h3>
            </div>

            <label>
              <span>Encounter ID ผู้ป่วย <em>*</em></span>
              <input required value={encounterId} onChange={(e) => setEncounterId(e.target.value)} placeholder="กรอก Encounter ID หรือเลือกจากคิว" />
            </label>

            <div className="form-two">
              <label>
                <span>Subjective (อาการและประวัติจากผู้ป่วย)</span>
                <textarea rows={2} value={subjective} onChange={(e) => setSubjective(e.target.value)} placeholder="อาการสำคัญ ประวัติอาการปวด การรับประทานอาหาร" />
              </label>
              <label>
                <span>Objective (ผลการตรวจร่างกายและสัญญาณชีพ)</span>
                <textarea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Physical Exam findings, BP, HR, Vitals" />
              </label>
            </div>

            <div className="form-two">
              <label>
                <span>Assessment & วินิจฉัยโรค</span>
                <textarea rows={2} value={assessment} onChange={(e) => setAssessment(e.target.value)} placeholder="การวินิจฉัย การประเมินระยะโรค" />
              </label>
              <label>
                <span>รหัสการวินิจฉัยโรค ICD-10</span>
                <select value={icd10} onChange={(e) => setIcd10(e.target.value)}>
                  <option value="C50.9">C50.9 · มะเร็งเต้านม (Malignant neoplasm of breast)</option>
                  <option value="C34.9">C34.9 · มะเร็งปอด (Malignant neoplasm of bronchus/lung)</option>
                  <option value="C18.9">C18.9 · มะเร็งลำไส้ใหญ่ (Malignant neoplasm of colon)</option>
                  <option value="I10">I10 · ความดันโลหิตสูง (Essential hypertension)</option>
                  <option value="E11.9">E11.9 · เบาหวานชนิดที่ 2 (Type 2 diabetes)</option>
                </select>
              </label>
            </div>

            <label>
              <span>Plan (แผนการรักษาและคำแนะนำ)</span>
              <textarea rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="แผนการให้ยา การตรวจติดตาม หรือนัดหมายครั้งถัดไป" />
            </label>

            {/* Order Entry Section */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <span className="eyebrow">ORDER ENTRY</span>
              <h4 style={{ margin: '4px 0 10px' }}>สั่งตรวจ / สั่งยา / ส่งรักษาต่อ</h4>

              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px auto', gap: 8, alignItems: 'center' }}>
                <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderItem['type'])}>
                  <option value="medication">ยา (Medication)</option>
                  <option value="lab">ตรวจแล็บ (Lab)</option>
                  <option value="imaging">รังสี/เอกซเรย์ (Imaging)</option>
                  <option value="chemo">เคมีบำบัด (Chemo)</option>
                  <option value="radiation">รังสีรักษา (RT)</option>
                </select>
                <input value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder="ชื่อยา / รายการตรวจ เช่น Paracetamol 500mg, CBC" />
                <input type="number" min="1" value={orderQty} onChange={(e) => setOrderQty(Number(e.target.value))} placeholder="จำนวน" />
                <button type="button" className="button secondary" onClick={addOrder}><Plus size={16} /> เพิ่ม</button>
              </div>

              {orders.length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  {orders.map((ord) => (
                    <div key={ord.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: '.82rem' }}>
                      <div>
                        <strong>[{ord.type}] {ord.name}</strong> (จำนวน: {ord.quantity})
                      </div>
                      <button type="button" onClick={() => removeOrder(ord.id)} style={{ border: 0, background: 'transparent', color: 'var(--danger)' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Route Builder Section */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <span className="eyebrow">POST-CONSULT ROUTE</span>
              <h4 style={{ margin: '4px 0 8px' }}>กำหนดเส้นทางสถานีบริการหลังออกจากห้องแพทย์</h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select value={candidateStation} onChange={(e) => setCandidateStation(e.target.value)} style={{ maxWidth: 300 }}>
                  {routeOptions.map((code) => (
                    <option key={code} value={code}>{code} · {stationMap.get(code)?.name}</option>
                  ))}
                </select>
                <button type="button" className="button secondary" onClick={addRouteStation}>เพิ่ม Station</button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {selectedRoute.map((code, index) => (
                  <span key={code} className="status-pill flowing" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}>
                    {index + 1}. {code} ({stationMap.get(code)?.name})
                    <button type="button" onClick={() => removeRouteStation(code)} style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}><X size={12} /></button>
                  </span>
                ))}
              </div>

              <label style={{ maxWidth: 300 }}>
                <span>ปลายทางของ Visit</span>
                <select value={terminal} onChange={(e) => setTerminal(e.target.value as 'DH' | 'IPW')}>
                  <option value="DH">DH · กลับบ้าน (Discharge Home)</option>
                  <option value="IPW">HA → IPW · รับไว้รักษา (Admit Inpatient)</option>
                </select>
              </label>
            </div>

            {message && (
              <div className={`inline-alert ${message.includes('สำเร็จ') ? 'success' : 'danger'}`}>
                {message}
              </div>
            )}

            <button className="button primary large" disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'บันทึกประวัติการตรวจและยืนยันเส้นทาง'}
            </button>
          </form>

          {/* Quick Doctor Tools */}
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="workspace-card" style={{ padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>Clinical Protocols & Presets</h3>
              <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                เลือก Preset เส้นทางด่วนสำหรับการรักษายอดนิยม:
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <button type="button" className="button secondary" style={{ justifyContent: 'flex-start' }} onClick={() => setSelectedRoute(['LAB', 'PD'])}>
                  🧬 ตรวจแล็บ + รับยา (LAB → PD → DH)
                </button>
                <button type="button" className="button secondary" style={{ justifyContent: 'flex-start' }} onClick={() => setSelectedRoute(['CHEMO', 'PD'])}>
                  💉 รับยาเคมีบำบัด + รับยากลับบ้าน (CHEMO → PD → DH)
                </button>
                <button type="button" className="button secondary" style={{ justifyContent: 'flex-start' }} onClick={() => setSelectedRoute(['XR', 'RC', 'PD'])}>
                  📷 เอกซเรย์ + พบแพทย์ฟังผล + รับยา (XR → RC → PD → DH)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Doctor Queue Workspace */}
        <QueueWorkspace role="doctor" onSelectEncounter={setEncounterId} />
      </div>
    </StaffShell>
  )
}
