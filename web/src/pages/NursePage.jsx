import React, { useState, useEffect, useContext } from 'react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import QueueHeader from '../components/ui/QueueHeader'
import NowServingCard from '../components/ui/NowServingCard'
import WaitChip from '../components/ui/WaitChip'

const STATION = 'MHT'

export default function NursePage() {
  const [data, setData] = useState(null)
  const [selectedEnc, setSelectedEnc] = useState(null)
  const [workup, setWorkup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    chief_complaint: '', pain_score: 0, symptoms_review: [], hpi: '',
    current_chemo_regimen: '', smoking_status: 'never', alcohol_status: 'never', nurse_note: '', is_urgent: false,
  })
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
      const res = await api.getNurseWorkup(item.encounter_id)
      setWorkup(res.data)
      if (res.data?.pre_screening) {
        setForm(prev => ({
          ...prev,
          chief_complaint: res.data.pre_screening.chief_complaint || '',
          symptoms_review: res.data.pre_screening.symptoms || [],
        }))
      }
    } catch (err) {
      toast.error('โหลดข้อมูลผู้ป่วยไม่สำเร็จ')
    }
  }

  const handleSave = async () => {
    if (!selectedEnc) return
    try {
      await api.saveAssessment(selectedEnc.encounter_id, {
        ...form,
        pain_score: parseInt(form.pain_score) || 0,
      })
      toast.success('บันทึกฉบับร่างสำเร็จ')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleSendToDoctor = async () => {
    if (!selectedEnc) return
    const ok = await confirm({
      title: `ส่งต่อ ${selectedEnc.queue_no} ไปพบแพทย์ (PC)?`,
      body: 'การส่งต่อจะย้ายผู้ป่วยออกจากคิว MHT ทันที',
    })
    if (!ok) return
    try {
      await api.sendToDoctor(selectedEnc.encounter_id)
      toast.success('ส่งต่อแพทย์สำเร็จ')
      setSelectedEnc(null)
      setWorkup(null)
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
      <h4 className="fw-bold mb-1">Nurse Medical History</h4>
      <small className="text-muted">MHT - ซักประวัติ</small>

      <div className="row mt-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <QueueHeader title="คิวรอซักประวัติ" counts={data.counts} onCallNext={handleCallNext} />
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
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <span className="badge bg-secondary me-2">{item.queue_no}</span>
                        <strong>{item.patient?.display_name || item.patient_id} {item.patient?.hn && `(HN: ${item.patient.hn})`}</strong>
                      </div>
                      <WaitChip since={item.created_at} avgWaitMin={null} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="col-md-8">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-bold">แบบฟอร์มซักประวัติ</div>
            <div className="card-body">
              {!selectedEnc ? (
                <div className="text-center text-muted py-4">เลือกผู้ป่วยจากรายการด้านซ้าย</div>
              ) : (
                <>
                  {workup?.pre_screening && (
                    <div className="alert alert-light mb-3">
                      <strong>ข้อมูลจากบ้าน:</strong> {workup.pre_screening.chief_complaint}
                      {workup.pre_screening.allergies?.length > 0 && (
                        <div><small className="text-danger">แพ้: {workup.pre_screening.allergies.join(', ')}</small></div>
                      )}
                    </div>
                  )}
                  {workup?.vitals && (
                    <div className="alert alert-light mb-3">
                      <strong>Vitals:</strong> BP {workup.vitals.sbp}/{workup.vitals.dbp} | Pulse {workup.vitals.pulse} | Temp {workup.vitals.temperature} | SpO2 {workup.vitals.spo2}%
                      {workup.vitals.warnings?.length > 0 && (
                        <div><small className="text-warning">⚠ {workup.vitals.warnings.join(', ')}</small></div>
                      )}
                    </div>
                  )}
                  <div className="row g-3">
                    <div className="col-md-8">
                      <label className="form-label small">Chief Complaint</label>
                      <input className="form-control" value={form.chief_complaint} onChange={e => setForm({...form, chief_complaint: e.target.value})} />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small">Pain Score (0-10)</label>
                      <input type="number" className="form-control" min="0" max="10" value={form.pain_score} onChange={e => setForm({...form, pain_score: e.target.value})} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small">HPI</label>
                      <textarea className="form-control" rows="2" value={form.hpi} onChange={e => setForm({...form, hpi: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small">Current Chemo Regimen</label>
                      <input className="form-control" value={form.current_chemo_regimen} onChange={e => setForm({...form, current_chemo_regimen: e.target.value})} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small">Smoking</label>
                      <select className="form-select" value={form.smoking_status} onChange={e => setForm({...form, smoking_status: e.target.value})}>
                        <option value="never">Never</option>
                        <option value="former">Former</option>
                        <option value="current">Current</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small">Alcohol</label>
                      <select className="form-select" value={form.alcohol_status} onChange={e => setForm({...form, alcohol_status: e.target.value})}>
                        <option value="never">Never</option>
                        <option value="occasional">Occasional</option>
                        <option value="regular">Regular</option>
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="form-label small">Nurse Note</label>
                      <textarea className="form-control" rows="2" value={form.nurse_note} onChange={e => setForm({...form, nurse_note: e.target.value})} />
                    </div>
                    <div className="col-12">
                      <div className="form-check">
                        <input className="form-check-input" type="checkbox" checked={form.is_urgent} onChange={e => setForm({...form, is_urgent: e.target.checked})} id="urgentCheck" />
                        <label className="form-check-label text-danger fw-bold" htmlFor="urgentCheck">แจ้งเร่งด่วน</label>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 d-flex gap-2">
                    <button className="btn btn-primary" onClick={handleSave}>บันทึกฉบับร่าง</button>
                    <button className="btn btn-success" onClick={handleSendToDoctor}>บันทึกและส่งต่อแพทย์</button>
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
