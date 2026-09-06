'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Droplets,
  FlaskConical,
  Pill,
  Plus,
  Route,
  Trash2,
  X,
} from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { buildDoctorRoute, OPTIONAL_ROUTE_CODES, stationMap } from '@/lib/stations'
import { clientApi } from '@/lib/client'
import type { Encounter, InfusionTemplate, OrderItem } from '@/lib/types'

const SUPPORTED_ORDER_TYPES = ['medication', 'lab', 'infusion'] as const
type SupportedOrderType = (typeof SUPPORTED_ORDER_TYPES)[number]

function addStationForOrder(route: string[], station: 'LAB' | 'INFUSION' | 'PD') {
  if (station === 'LAB' && (route.includes('LAB') || route.includes('LABC'))) return route
  if (route.includes(station)) return route
  if (station === 'PD') return [...route, 'PD']
  const withoutPd = route.filter((code) => code !== 'PD')
  return [...withoutPd, station, ...(route.includes('PD') ? ['PD'] : [])]
}

function orderRouteProblem(orders: OrderItem[], route: string[]) {
  const hasLabOrder = orders.some((order) => order.type === 'lab')
  const hasMedicationOrder = orders.some((order) => order.type === 'medication')
  const hasInfusionOrder = orders.some((order) => order.type === 'infusion')
  const hasLabRoute = route.includes('LAB') || route.includes('LABC')

  if (hasLabOrder && !hasLabRoute) return 'มีคำสั่งตรวจแล็บ แต่เส้นทางไม่มี LAB/LABC'
  if (!hasLabOrder && hasLabRoute) return 'เส้นทางมี LAB/LABC แต่ยังไม่มีคำสั่งตรวจแล็บ'
  if (hasMedicationOrder && !route.includes('PD')) return 'มีคำสั่งยา แต่เส้นทางไม่มีห้องยา PD'
  if (!hasMedicationOrder && route.includes('PD')) return 'เส้นทางมีห้องยา PD แต่ยังไม่มีคำสั่งยา'
  if (hasInfusionOrder && !route.includes('INFUSION')) return 'มีคำสั่ง Infusion แต่เส้นทางไม่มี INFUSION'
  if (!hasInfusionOrder && route.includes('INFUSION')) return 'เส้นทางมี INFUSION แต่ยังไม่มีคำสั่ง Infusion'
  return ''
}

export default function PhysicianPage() {
  const [encounterId, setEncounterId] = useState('')
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [savedEncounterId, setSavedEncounterId] = useState('')
  const [subjective, setSubjective] = useState('')
  const [objective, setObjective] = useState('')
  const [assessment, setAssessment] = useState('')
  const [plan, setPlan] = useState('')
  const [icd10, setIcd10] = useState('C50.9')

  const [orders, setOrders] = useState<OrderItem[]>([])
  const [orderType, setOrderType] = useState<SupportedOrderType>(SUPPORTED_ORDER_TYPES[0])
  const [orderName, setOrderName] = useState('')
  const [orderDose, setOrderDose] = useState('')
  const [orderFreq, setOrderFreq] = useState('1x1 หลังอาหาร')
  const [orderQty, setOrderQty] = useState(1)
  const [infusionTemplates, setInfusionTemplates] = useState<InfusionTemplate[]>([])
  const [infusionTemplateId, setInfusionTemplateId] = useState('')
  const [infusionPlannedFor, setInfusionPlannedFor] = useState('')
  const [infusionDuration, setInfusionDuration] = useState('')

  const routeOptions = useMemo(() => Array.from(OPTIONAL_ROUTE_CODES), [])
  const [selectedRoute, setSelectedRoute] = useState<string[]>([])
  const [candidateStation, setCandidateStation] = useState(routeOptions[0] || 'LAB')

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

  function resetEncounterDraft() {
    setSavedEncounterId('')
    setSubjective('')
    setObjective('')
    setAssessment('')
    setPlan('')
    setIcd10('C50.9')
    setOrders([])
    setOrderType(SUPPORTED_ORDER_TYPES[0])
    setOrderName('')
    setOrderDose('')
    setOrderFreq('1x1 หลังอาหาร')
    setOrderQty(1)
    setInfusionPlannedFor('')
    setInfusionDuration('')
    setSelectedRoute([])
    setCandidateStation(routeOptions[0] || 'LAB')
  }

  function addOrder() {
    if (savedEncounterId === encounterId && encounterId) return
    const template = infusionTemplates.find((item) => item.id === infusionTemplateId)
    const resolvedName = orderType === 'infusion' ? template?.name : orderName.trim()
    if (!resolvedName || (orderType === 'infusion' && !template)) {
      setMessage(orderType === 'infusion' ? 'กรุณาเลือกรูปแบบบริการ Infusion' : 'กรุณากรอกชื่อรายการก่อนเพิ่มคำสั่ง')
      return
    }
    if (!Number.isInteger(orderQty) || orderQty < 1) {
      setMessage('จำนวนต้องเป็นเลขจำนวนเต็มตั้งแต่ 1 ขึ้นไป')
      return
    }

    const targetStation = orderType === 'lab' ? 'LAB' : orderType === 'medication' ? 'PD' : 'INFUSION'
    const newItem: OrderItem = {
      id: `${Date.now()}-${orders.length + 1}`,
      type: orderType,
      code: orderType === 'infusion' ? template!.code : resolvedName.toUpperCase().slice(0, 8),
      name: resolvedName,
      dosage: orderDose,
      frequency: orderFreq,
      quantity: Number(orderQty),
      status: 'ordered',
      target_station: targetStation,
      ...(orderType === 'infusion' ? {
        service_template_id: template!.id,
        ...(infusionPlannedFor ? { planned_for: new Date(infusionPlannedFor).toISOString() } : {}),
        ...(Number(infusionDuration) > 0 ? { duration_override_min: Number(infusionDuration) } : {}),
      } : {}),
    }

    setOrders((prev) => [...prev, newItem])
    setSelectedRoute((prev) => addStationForOrder(prev, targetStation))
    setOrderName('')
    setOrderDose('')
    setInfusionDuration('')
    setMessage('')
  }

  function removeOrder(id: string) {
    if (savedEncounterId === encounterId && encounterId) return
    const remaining = orders.filter((order) => order.id !== id)
    setOrders(remaining)
    setSelectedRoute((route) => {
      let next = [...route]
      if (!remaining.some((order) => order.type === 'lab')) next = next.filter((code) => code !== 'LAB' && code !== 'LABC')
      if (!remaining.some((order) => order.type === 'medication')) next = next.filter((code) => code !== 'PD')
      if (!remaining.some((order) => order.type === 'infusion')) next = next.filter((code) => code !== 'INFUSION')
      return next
    })
  }

  function addRouteStation() {
    if (savedEncounterId === encounterId && encounterId) return
    if (!selectedRoute.includes(candidateStation)) {
      setSelectedRoute((prev) => [...prev, candidateStation])
    }
  }

  function removeRouteStation(code: string) {
    if (savedEncounterId === encounterId && encounterId) return
    setSelectedRoute((prev) => prev.filter((item) => item !== code))
  }

  async function handleSaveConsultation(event: React.FormEvent) {
    event.preventDefault()
    if (!encounterId) {
      setMessage('กรุณาเลือกผู้ป่วยจากคิวห้องตรวจด้านล่าง')
      return
    }
    if (savedEncounterId === encounterId) {
      setMessage('เคสนี้บันทึกแล้ว กรุณากดเสร็จที่คิวห้องตรวจหรือเลือกผู้ป่วยคนถัดไป')
      return
    }

    const routeProblem = orderRouteProblem(orders, selectedRoute)
    if (routeProblem) {
      setMessage(routeProblem)
      return
    }

    let fullRoute: string[]
    try {
      fullRoute = buildDoctorRoute(selectedRoute, 'DH')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'เส้นทางหลังตรวจไม่ถูกต้อง')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      await clientApi.saveConsultation(encounterId, {
        subjective,
        objective,
        assessment,
        plan,
        icd10_codes: [{ code: icd10, name: getIcd10Name(icd10), is_primary: true }],
      })

      if (orders.length > 0) {
        await clientApi.createOrders(encounterId, { items: orders })
      }

      await clientApi.setDoctorRoute(encounterId, fullRoute)
      setSavedEncounterId(encounterId)
      setMessage('บันทึกผลการตรวจ สั่งการรักษา และกำหนดเส้นทางสำเร็จ กรุณากดเสร็จที่คิวห้องตรวจเพื่อส่งผู้ป่วยต่อ')
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
    try {
      setMessage('')
      const detail = await clientApi.getEncounterDetail(id)
      if (id !== encounterId) resetEncounterDraft()
      setEncounterId(id)
      setEncounter(detail)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'โหลดข้อมูลผู้ป่วยไม่สำเร็จ')
    }
  }

  const routeProblem = orderRouteProblem(orders, selectedRoute)
  const saved = Boolean(encounterId && savedEncounterId === encounterId)

  return (
    <StaffShell role="doctor" displayName="นพ. วรเมธ สถิตย์ธรรม (อายุรกรรมมะเร็ง)">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">PHYSICIAN CONSULTATION WORKSPACE</span>
            <h2>ห้องตรวจแพทย์ (PC1–PC4)</h2>
            <p>บันทึก SOAP, วินิจฉัยโรค, สั่งแล็บ/ยา/Infusion และกำหนดเส้นทางที่มีจุดบริการรองรับจริง</p>
          </div>
        </div>

        <div className="clinical-grid">
          <form className="workspace-card" onSubmit={handleSaveConsultation} style={{ display: 'grid', gap: 16, padding: 22 }}>
            <div className="workspace-card-head" style={{ padding: 0 }}>
              <h3>บันทึกการตรวจและวินิจฉัย (Clinical Consultation Note)</h3>
            </div>

            <div className="inline-alert" role="status">{encounter ? <><strong>{encounter.patient?.display_name || 'ผู้ป่วย'} · HN {encounter.patient?.hn || '—'}</strong><br />คิว {encounter.current_queue_no} · {encounter.current_station}{saved ? ' · บันทึกการตรวจแล้ว' : ''}</> : 'เลือกผู้ป่วยจากคิวห้องตรวจด้านล่างก่อนบันทึก'}</div>

            <div className="form-two">
              <label>
                <span>Subjective (อาการและประวัติจากผู้ป่วย)</span>
                <textarea rows={2} value={subjective} onChange={(e) => setSubjective(e.target.value)} placeholder="อาการสำคัญ ประวัติอาการปวด การรับประทานอาหาร" disabled={saved} />
              </label>
              <label>
                <span>Objective (ผลการตรวจร่างกายและสัญญาณชีพ)</span>
                <textarea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Physical Exam findings, BP, HR, Vitals" disabled={saved} />
              </label>
            </div>

            <div className="form-two">
              <label>
                <span>Assessment & วินิจฉัยโรค</span>
                <textarea rows={2} value={assessment} onChange={(e) => setAssessment(e.target.value)} placeholder="การวินิจฉัย การประเมินระยะโรค" disabled={saved} />
              </label>
              <label>
                <span>รหัสการวินิจฉัยโรค ICD-10</span>
                <select value={icd10} onChange={(e) => setIcd10(e.target.value)} disabled={saved}>
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
              <textarea rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="แผนการให้ยา การตรวจติดตาม หรือนัดหมายครั้งถัดไป" disabled={saved} />
            </label>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <span className="eyebrow">ORDER ENTRY</span>
              <h4 style={{ margin: '4px 0 10px' }}>สั่งแล็บ / สั่งยา / Infusion</h4>
              <p style={{ marginTop: 0, fontSize: '.82rem', color: 'var(--muted)' }}>เมื่อเพิ่มคำสั่ง ระบบจะเพิ่ม Station ที่เกี่ยวข้องในเส้นทางให้อัตโนมัติ</p>

              <div className="order-entry-grid">
                <select aria-label="ประเภทคำสั่งการรักษา" value={orderType} onChange={(e) => setOrderType(e.target.value as SupportedOrderType)} disabled={saved}>
                  <option value="medication">ยา (Medication) → PD</option>
                  <option value="lab">ตรวจแล็บ (Lab) → LAB</option>
                  <option value="infusion">สารน้ำ / ยาทางหลอดเลือด / เคมีบำบัด → INFUSION</option>
                </select>
                {orderType === 'infusion' ? (
                  <select aria-label="รูปแบบบริการ Infusion" value={infusionTemplateId} onChange={(e) => setInfusionTemplateId(e.target.value)} disabled={saved}>
                    {infusionTemplates.length === 0 && <option value="">ยังไม่มี Template ที่พร้อมใช้งาน</option>}
                    {infusionTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_demo ? ' · ตัวอย่าง' : ''}</option>)}
                  </select>
                ) : (
                  <input aria-label="ชื่อรายการ" value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder="เช่น Paracetamol 500mg หรือ CBC" disabled={saved} />
                )}
                <input aria-label="จำนวน" type="number" min="1" step="1" value={orderQty} onChange={(e) => setOrderQty(Number(e.target.value))} placeholder="จำนวน" disabled={saved} />
                <button type="button" className="button secondary" onClick={addOrder} disabled={saved}><Plus size={16} aria-hidden="true" /> เพิ่ม</button>
              </div>

              {orderType === 'infusion' && (
                <div className="form-two infusion-order-options">
                  <label><span>วันที่วางแผน (ไม่ใช่การจองเก้าอี้)</span><input type="datetime-local" value={infusionPlannedFor} onChange={(e) => setInfusionPlannedFor(e.target.value)} disabled={saved} /></label>
                  <label><span>เวลารวมเฉพาะราย (นาที) · ไม่บังคับ</span><input type="number" min="1" max="1440" value={infusionDuration} onChange={(e) => setInfusionDuration(e.target.value)} placeholder="ใช้เวลาจาก Template หากไม่ระบุ" disabled={saved} /></label>
                </div>
              )}
              {orderType === 'medication' && (
                <div className="form-two infusion-order-options">
                  <label><span>ขนาดยา</span><input value={orderDose} onChange={(event) => setOrderDose(event.target.value)} placeholder="เช่น 500 mg" disabled={saved} /></label>
                  <label><span>ความถี่ / วิธีใช้</span><input value={orderFreq} onChange={(event) => setOrderFreq(event.target.value)} placeholder="เช่น วันละ 1 ครั้ง หลังอาหาร" disabled={saved} /></label>
                </div>
              )}

              {orders.length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  {orders.map((order) => (
                    <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8faf9', borderRadius: 8, fontSize: '.82rem' }}>
                      <div><strong>[{order.type}] {order.name}</strong> (จำนวน: {order.quantity}) · ไป {order.target_station}</div>
                      <button type="button" aria-label={`ลบคำสั่ง ${order.name}`} onClick={() => removeOrder(order.id)} disabled={saved} style={{ border: 0, background: 'transparent', color: 'var(--danger)' }}><Trash2 size={15} aria-hidden="true" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <span className="eyebrow">POST-CONSULT ROUTE</span>
              <h4 style={{ margin: '4px 0 8px' }}>เส้นทางหลังออกจากห้องแพทย์</h4>
              <p style={{ marginTop: 0, fontSize: '.82rem', color: 'var(--muted)' }}>รุ่นสาธิตเปิดใช้งานเฉพาะ Station ที่มีเจ้าหน้าที่รับงานครบวงจร และ Visit จะจบที่ DH · กลับบ้าน</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={candidateStation} onChange={(e) => setCandidateStation(e.target.value)} style={{ maxWidth: 300 }} disabled={saved}>
                  {routeOptions.map((code) => <option key={code} value={code}>{code} · {stationMap.get(code)?.name}</option>)}
                </select>
                <button type="button" className="button secondary" onClick={addRouteStation} disabled={saved}>เพิ่ม Station</button>
                <button type="button" className="button ghost" onClick={() => setSelectedRoute([])} disabled={saved}>ล้าง Station เพิ่มเติม</button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {selectedRoute.length === 0 && <span className="status-pill">ไม่มี Station เพิ่มเติม → DH</span>}
                {selectedRoute.map((code, index) => (
                  <span key={code} className="status-pill flowing" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}>
                    {index + 1}. {code} ({stationMap.get(code)?.name})
                    <button type="button" aria-label={`นำ ${code} ออกจากเส้นทาง`} onClick={() => removeRouteStation(code)} disabled={saved} style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}><X size={12} aria-hidden="true" /></button>
                  </span>
                ))}
                <span className="status-pill">→ DH · กลับบ้าน</span>
              </div>
              {routeProblem && !saved && <div className="inline-alert warning" role="status">{routeProblem}</div>}
            </div>

            {message && <div className={`inline-alert ${message.includes('สำเร็จ') || message.includes('บันทึกแล้ว') ? 'success' : 'danger'}`}>{message}</div>}

            <button className="button primary large" disabled={busy || Boolean(routeProblem) || saved}>
              {busy ? 'กำลังบันทึก…' : saved ? 'บันทึกเคสนี้แล้ว · กรุณากดเสร็จที่คิวห้องตรวจ' : 'บันทึกประวัติการตรวจและยืนยันเส้นทาง'}
            </button>
          </form>

          <div style={{ display: 'grid', gap: 14 }}>
            <div className="workspace-card" style={{ padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>การส่งต่อที่ระบบรองรับ</h3>
              <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>คำสั่งและ Station จะต้องตรงกัน เพื่อไม่ให้ผู้ป่วยค้างระหว่างทาง</p>
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="inline-alert"><FlaskConical size={17} aria-hidden="true" /> <strong>Lab order</strong> → LAB/LABC</div>
                <div className="inline-alert"><Droplets size={17} aria-hidden="true" /> <strong>Infusion order</strong> → INFUSION</div>
                <div className="inline-alert"><Pill size={17} aria-hidden="true" /> <strong>Medication order</strong> → PD</div>
                <div className="inline-alert"><Route size={17} aria-hidden="true" /> ไม่มีคำสั่งเพิ่มเติม → DH</div>
              </div>
            </div>
          </div>
        </div>

        <QueueWorkspace role="doctor" stationCodes={['PC', 'PC2', 'PC3', 'PC4']} onSelectEncounter={(id) => void selectEncounter(id)} />
      </div>
    </StaffShell>
  )
}
