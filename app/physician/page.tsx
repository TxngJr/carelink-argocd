'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Droplets,
  FlaskConical,
  Plus,
  Scan,
  Trash2,
  X,
} from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { buildDoctorRoute, OPTIONAL_ROUTE_CODES, stationMap } from '@/lib/stations'
import { clientApi } from '@/lib/client'
import type { Encounter, InfusionTemplate, OrderItem } from '@/lib/types'

export default function PhysicianPage() {
  const [encounterId, setEncounterId] = useState('')
  const [encounter, setEncounter] = useState<Encounter | null>(null)
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
  const [infusionTemplates, setInfusionTemplates] = useState<InfusionTemplate[]>([])
  const [infusionTemplateId, setInfusionTemplateId] = useState('')
  const [infusionPlannedFor, setInfusionPlannedFor] = useState('')
  const [infusionDuration, setInfusionDuration] = useState('')

  // Route Builder
  const routeOptions = useMemo(() => Array.from(OPTIONAL_ROUTE_CODES), [])
  const [selectedRoute, setSelectedRoute] = useState<string[]>(['LAB', 'PD'])
  const [candidateStation, setCandidateStation] = useState('LAB')
  const [terminal, setTerminal] = useState<'DH' | 'IPW'>('DH')

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    clientApi.getInfusionTemplates()
      .then((templates) => {
        setInfusionTemplates(templates)
        setInfusionTemplateId((current) => current || templates[0]?.id || '')
      })
      .catch(() => setMessage('ไม่สามารถโหลดรายการบริการ Infusion ได้ กรุณาลองใหม่'))
  }, [])

  function addOrder() {
    const template = infusionTemplates.find((item) => item.id === infusionTemplateId)
    const resolvedName = orderType === 'infusion' ? template?.name : orderName.trim()
    if (!resolvedName || (orderType === 'infusion' && !template)) return
    const newItem: OrderItem = {
      id: Date.now().toString(),
      type: orderType,
      code: orderType === 'infusion' ? template!.code : resolvedName.toUpperCase().slice(0, 8),
      name: resolvedName,
      dosage: orderDose,
      frequency: orderFreq,
      quantity: Number(orderQty),
      status: 'ordered',
      ...(orderType === 'infusion' ? {
        target_station: 'INFUSION',
        service_template_id: template!.id,
        ...(infusionPlannedFor ? { planned_for: new Date(infusionPlannedFor).toISOString() } : {}),
        ...(Number(infusionDuration) > 0 ? { duration_override_min: Number(infusionDuration) } : {}),
      } : {}),
    }
    setOrders((prev) => [...prev, newItem])
    if (orderType === 'infusion') {
      setSelectedRoute((prev) => prev.includes('INFUSION') ? prev : [...prev.filter((code) => code !== 'PD'), 'INFUSION', ...(prev.includes('PD') ? ['PD'] : [])])
    }
    setOrderName('')
    setOrderDose('')
    setInfusionDuration('')
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
      setMessage('กรุณาเลือกผู้ป่วยจากคิวห้องตรวจด้านล่าง')
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

  async function selectEncounter(id: string) {
    setEncounterId(id)
    setEncounter(await clientApi.getEncounterDetail(id))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <StaffShell role="doctor" displayName="นพ. วรเมธ สถิตย์ธรรม (อายุรกรรมมะเร็ง)">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">PHYSICIAN CONSULTATION WORKSPACE</span>
            <h2>ห้องตรวจแพทย์ (PC1–PC4)</h2>
            <p>บันทึก SOAP, วินิจฉัยโรค, สั่งตรวจ/สั่งยา/Infusion และกำหนดเส้นทางบริการหลังตรวจ</p>
          </div>
        </div>

        <div className="clinical-grid">
          {/* Main Consultation Workspace */}
          <form className="workspace-card" onSubmit={handleSaveConsultation} style={{ display: 'grid', gap: 16, padding: 22 }}>
            <div className="workspace-card-head" style={{ padding: 0 }}>
              <h3>บันทึกการตรวจและวินิจฉัย (Clinical Consultation Note)</h3>
            </div>

            <div className="inline-alert" role="status">{encounter ? <><strong>{encounter.patient?.display_name || 'ผู้ป่วย'} · HN {encounter.patient?.hn || '—'}</strong><br />คิว {encounter.current_queue_no} · {encounter.current_station}</> : 'เลือกผู้ป่วยจากคิวห้องตรวจด้านล่างก่อนบันทึก'}</div>

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

              <div className="order-entry-grid">
                <select aria-label="ประเภทคำสั่งการรักษา" value={orderType} onChange={(e) => setOrderType(e.target.value as OrderItem['type'])}>
                  <option value="medication">ยา (Medication)</option>
                  <option value="lab">ตรวจแล็บ (Lab)</option>
                  <option value="imaging">รังสี/เอกซเรย์ (Imaging)</option>
                  <option value="infusion">สารน้ำ / ยาทางหลอดเลือด / เคมีบำบัด</option>
                </select>
                {orderType === 'infusion' ? (
                  <select aria-label="รูปแบบบริการ Infusion" value={infusionTemplateId} onChange={(e) => setInfusionTemplateId(e.target.value)}>
                    {infusionTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}{template.is_demo ? ' · ตัวอย่าง' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input aria-label="ชื่อรายการ" value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder="ชื่อยา / รายการตรวจ เช่น Paracetamol 500mg, CBC" />
                )}
                <input aria-label="จำนวน" type="number" min="1" value={orderQty} onChange={(e) => setOrderQty(Number(e.target.value))} placeholder="จำนวน" />
                <button type="button" className="button secondary" onClick={addOrder}><Plus size={16} aria-hidden="true" /> เพิ่ม</button>
              </div>

              {orderType === 'infusion' && (
                <div className="form-two infusion-order-options">
                  <label>
                    <span>วันที่วางแผน (ไม่ใช่การจองเก้าอี้)</span>
                    <input type="datetime-local" value={infusionPlannedFor} onChange={(e) => setInfusionPlannedFor(e.target.value)} />
                  </label>
                  <label>
                    <span>เวลารวมเฉพาะราย (นาที) · ไม่บังคับ</span>
                    <input type="number" min="1" max="1440" value={infusionDuration} onChange={(e) => setInfusionDuration(e.target.value)} placeholder="ใช้เวลาจากเก้าอี้หรือ Template" />
                  </label>
                </div>
              )}
              {orderType === 'medication' && (
                <div className="form-two infusion-order-options">
                  <label><span>ขนาดยา</span><input value={orderDose} onChange={(event) => setOrderDose(event.target.value)} placeholder="เช่น 500 mg" /></label>
                  <label><span>ความถี่ / วิธีใช้</span><input value={orderFreq} onChange={(event) => setOrderFreq(event.target.value)} placeholder="เช่น วันละ 1 ครั้ง หลังอาหาร" /></label>
                </div>
              )}

              {orders.length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  {orders.map((ord) => (
                    <div key={ord.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: '.82rem' }}>
                      <div>
                        <strong>[{ord.type}] {ord.name}</strong> (จำนวน: {ord.quantity})
                      </div>
                      <button type="button" aria-label={`ลบคำสั่ง ${ord.name}`} onClick={() => removeOrder(ord.id)} style={{ border: 0, background: 'transparent', color: 'var(--danger)' }}>
                        <Trash2 size={15} aria-hidden="true" />
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
                    <button type="button" aria-label={`นำ ${code} ออกจากเส้นทาง`} onClick={() => removeRouteStation(code)} style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}><X size={12} aria-hidden="true" /></button>
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
              <h3 style={{ marginTop: 0 }}>เส้นทางใช้งานบ่อย</h3>
              <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                เลือก Preset เส้นทางด่วนสำหรับการรักษายอดนิยม:
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <button type="button" className="button secondary" style={{ justifyContent: 'flex-start' }} onClick={() => setSelectedRoute(['LAB', 'PD'])}>
                  <FlaskConical size={17} aria-hidden="true" /> ตรวจแล็บ + รับยา (LAB → PD → DH)
                </button>
                <button type="button" className="button secondary" style={{ justifyContent: 'flex-start' }} onClick={() => setSelectedRoute(['INFUSION', 'PD'])}>
                  <Droplets size={17} aria-hidden="true" /> Infusion Lounge + รับยากลับบ้าน (INFUSION → PD → DH)
                </button>
                <button type="button" className="button secondary" style={{ justifyContent: 'flex-start' }} onClick={() => setSelectedRoute(['XR', 'RC', 'PD'])}>
                  <Scan size={17} aria-hidden="true" /> เอกซเรย์ + พบแพทย์ฟังผล + รับยา (XR → RC → PD → DH)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Doctor Queue Workspace */}
        <QueueWorkspace role="doctor" stationCodes={['PC', 'PC2', 'PC3', 'PC4']} onSelectEncounter={(id) => void selectEncounter(id)} />
      </div>
    </StaffShell>
  )
}
