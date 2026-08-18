import React, { useState, useEffect, useContext } from 'react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import QueueHeader from '../components/ui/QueueHeader'
import NowServingCard from '../components/ui/NowServingCard'
import WaitChip from '../components/ui/WaitChip'

const STATION = 'PC'

export default function DoctorPage() {
  const [data, setData] = useState(null)
  const [selectedEnc, setSelectedEnc] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [assessment, setAssessment] = useState('')
  const [plan, setPlan] = useState('')
  const wsEvents = useContext(WSContext)
  const toast = useToast()
  const confirm = useConfirm()

  const fetchQueue = async () => {
    try {
      const res = await api.getStationQueue(STATION)
      setData(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wsEvents.length > 0 && ['QUEUE_UPDATED', 'QUEUE_CALLED'].includes(wsEvents[0].type)) fetchQueue()
  }, [wsEvents])

  const handleCallNext = async () => {
    try {
      await api.callNext(STATION)
      toast.success('เรียกคิวถัดไปแล้ว')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleRecall = async (item) => {
    try {
      await api.recallQueue(STATION, item.id)
      toast.info(`เรียกซ้ำคิว ${item.queue_no}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleSkip = async (item) => {
    const ok = await confirm({ title: `ข้ามคิว ${item.queue_no}?`, confirmLabel: 'ข้ามคิว', danger: true })
    if (!ok) return
    try {
      await api.skipQueue(STATION, item.id)
      toast.info(`ข้ามคิว ${item.queue_no} แล้ว`)
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const selectPatient = async (item) => {
    setSelectedEnc(item)
    try {
      const res = await api.getDoctorSummary(item.encounter_id)
      setSummary(res.data)
    } catch (err) {
      toast.error('โหลดข้อมูลผู้ป่วยไม่สำเร็จ')
    }
  }

  const addOrder = (type, code, name, station, priority) => {
    setOrders(prev => [...prev, { order_type: type, order_code: code, order_name: name, target_station: station, priority: priority || 'routine', clinical_reason: 'Doctor order' }])
  }

  const handleCreateOrders = async () => {
    if (!selectedEnc || orders.length === 0) return
    try {
      await api.createOrders(selectedEnc.encounter_id, { orders })
      setOrders([])
      toast.success('สร้างคำสั่งสำเร็จ')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleConfirmRoute = async () => {
    if (!selectedEnc) return
    try {
      const route = ['PC', 'LABC', 'LABA', 'RC', 'TD']
      if (orders.some(o => o.order_type === 'lab')) {
        route.splice(1, 0, 'LABC', 'LABA')
      }
      if (orders.some(o => o.target_station === 'CHEMO_PRE' || o.target_station === 'CHEMO_INF')) {
        route.push('CHEMO_PRE', 'CHEMO_INF', 'PD_VERIFY', 'PD_DISP')
      }
      route.push('DH')

      await api.confirmRoute(selectedEnc.encounter_id, {
        route,
        assessment,
        plan,
        treatment_choices: orders.filter(o => o.order_type === 'treatment').map(o => o.order_code),
        destination_today: 'DH',
      })
      toast.success('ยืนยันเส้นทางสำเร็จ')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleComplete = async () => {
    if (!selectedEnc) return
    const ok = await confirm({
      title: `เสร็จสิ้นการตรวจ ${selectedEnc.queue_no}?`,
      body: 'ผู้ป่วยจะถูกส่งต่อไปสถานีถัดไปตามเส้นทางที่กำหนด',
    })
    if (!ok) return
    try {
      await api.completeDoctor(selectedEnc.encounter_id)
      toast.success('เสร็จสิ้นสำเร็จ')
      setSelectedEnc(null)
      setSummary(null)
      setOrders([])
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (!data) return <div className="p-4"><ErrorState onRetry={fetchQueue} /></div>

  const waitingItems = data.items.filter(i => i.status === 'waiting')

  return (
    <div className="p-4">
      <h4 className="fw-bold mb-1">Doctor Consultation</h4>
      <small className="text-muted">PC - ตรวจโดยแพทย์</small>

      <div className="row mt-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <QueueHeader title="คิวรอตรวจ" counts={data.counts} onCallNext={handleCallNext} />
              <NowServingCard items={data.now_serving} onRecall={handleRecall} onSkip={handleSkip} />
              {waitingItems.length === 0 ? (
                <div className="text-center text-muted py-4">ไม่มีคิวรอ</div>
              ) : (
                waitingItems.map((item, i) => (
                  <div
                    key={item.id || i}
                    className={`queue-item ${selectedEnc?.id === item.id ? 'border-primary bg-primary bg-opacity-10' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => selectPatient(item)}
                  >
                    <div className="d-flex flex-column gap-1">
                      <div>
                        <span className="badge bg-secondary me-2">{item.queue_no}</span>
                        <strong>{item.patient?.display_name || item.patient_id} {item.patient?.hn && `(HN: ${item.patient.hn})`}</strong>
                        {item.priority === 'urgent' && <span className="badge bg-danger ms-1">ด่วน</span>}
                      </div>
                      <WaitChip since={item.created_at} avgWaitMin={null} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="col-md-9">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-bold">สรุปข้อมูลผู้ป่วย</div>
            <div className="card-body">
              {!selectedEnc ? (
                <div className="text-center text-muted py-4">เลือกผู้ป่วยจากรายการด้านซ้าย</div>
              ) : (
                <>
                  {summary?.patient && (
                    <div className="alert alert-light mb-3">
                      <strong>{summary.patient.display_name}</strong> | HN: {summary.patient.hn} | อายุ {summary.patient.age} ปี
                      {summary.patient.allergies?.length > 0 && (
                        <span className="text-danger ms-2">แพ้: {summary.patient.allergies.join(', ')}</span>
                      )}
                    </div>
                  )}
                  {summary?.vitals && (
                    <div className="alert alert-light mb-3">
                      <strong>Vitals:</strong> BP {summary.vitals.sbp}/{summary.vitals.dbp} | Pulse {summary.vitals.pulse} | Temp {summary.vitals.temperature} | SpO2 {summary.vitals.spo2}%
                    </div>
                  )}
                  {summary?.nursing_assessment && (
                    <div className="alert alert-light mb-3">
                      <strong>Chief Complaint:</strong> {summary.nursing_assessment.chief_complaint} |
                      Pain Score: {summary.nursing_assessment.pain_score}/10
                    </div>
                  )}

                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold">สั่งตรวจ</label>
                      <div className="d-flex flex-wrap gap-1">
                        <button className="btn btn-outline-primary btn-sm" onClick={() => addOrder('lab', 'CBC', 'CBC', 'LABC')}>CBC</button>
                        <button className="btn btn-outline-primary btn-sm" onClick={() => addOrder('lab', 'CHEM', 'Chemistry', 'LABC')}>Chemistry</button>
                        <button className="btn btn-outline-primary btn-sm" onClick={() => addOrder('lab', 'TM', 'Tumor Marker', 'LABC')}>Tumor Marker</button>
                        <button className="btn btn-outline-primary btn-sm" onClick={() => addOrder('imaging', 'XR', 'X-ray', 'XR')}>X-ray</button>
                        <button className="btn btn-outline-primary btn-sm" onClick={() => addOrder('imaging', 'CT', 'CT Scan', 'CT')}>CT</button>
                        <button className="btn btn-outline-warning btn-sm" onClick={() => addOrder('treatment', 'CHEMO', 'Chemotherapy', 'CHEMO_PRE')}>CHEMO</button>
                        <button className="btn btn-outline-warning btn-sm" onClick={() => addOrder('treatment', 'RT', 'Radiation', 'RT_L1')}>RT</button>
                      </div>
                      {orders.length > 0 && (
                        <div className="mt-2">
                          {orders.map((o, i) => (
                            <span key={i} className="badge bg-primary me-1 mb-1">
                              {o.order_code}
                              <button className="btn-close btn-close-white ms-1" style={{ fontSize: '8px' }} onClick={() => setOrders(prev => prev.filter((_, j) => j !== i))} />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold">Assessment</label>
                      <textarea className="form-control" rows="2" value={assessment} onChange={e => setAssessment(e.target.value)} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold">Plan</label>
                      <textarea className="form-control" rows="2" value={plan} onChange={e => setPlan(e.target.value)} />
                    </div>
                  </div>

                  <div className="mt-3 d-flex gap-2">
                    <button className="btn btn-primary" onClick={handleCreateOrders} disabled={orders.length === 0}>
                      สั่งตรวจ ({orders.length})
                    </button>
                    <button className="btn btn-info text-white" onClick={handleConfirmRoute}>ยืนยันเส้นทาง</button>
                    <button className="btn btn-success" onClick={handleComplete}>เสร็จสิ้น</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
