import React, { useState, useEffect, useContext } from 'react'
import { X } from 'lucide-react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import QueueHeader from '../components/ui/QueueHeader'
import NowServingCard from '../components/ui/NowServingCard'

const STATION = 'LABC'

const TEST_FIELDS = {
  CBC: [
    { name: 'WBC', unit: '10^3/uL', low: 4, high: 10 },
    { name: 'Hb', unit: 'g/dL', low: 12, high: 16 },
    { name: 'PLT', unit: '10^3/uL', low: 150, high: 400 },
  ],
  Chemistry: [
    { name: 'Creatinine', unit: 'mg/dL', low: 0.6, high: 1.3 },
    { name: 'BUN', unit: 'mg/dL', low: 7, high: 20 },
    { name: 'Na', unit: 'mmol/L', low: 135, high: 145 },
  ],
  'Tumor Marker': [
    { name: 'CEA', unit: 'ng/mL', low: 0, high: 5 },
  ],
}
const DEFAULT_FIELDS = [{ name: 'Result', unit: '', low: null, high: null }]

function computeFlag(value, low, high) {
  if (low == null || high == null) return 'normal'
  if (value < low) return 'low'
  if (value > high) return 'high'
  return 'normal'
}

export default function LabPage() {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)
  const [collectData, setCollectData] = useState(null)
  const [resultModal, setResultModal] = useState(null)
  const wsEvents = useContext(WSContext)
  const toast = useToast()
  const confirm = useConfirm()

  const fetchQueue = async () => {
    try {
      const [labRes, stationRes] = await Promise.all([api.getLabQueue(), api.getStationQueue(STATION)])
      setQueue(labRes.data || [])
      setCollectData(stationRes.data)
      setErrored(false)
    } catch (err) {
      setErrored(true)
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
    if (wsEvents.length > 0 && ['QUEUE_UPDATED', 'QUEUE_CALLED', 'LAB_RESULT_READY'].includes(wsEvents[0].type)) fetchQueue()
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
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleCollect = async (orderId) => {
    try {
      await api.collectSample(orderId)
      toast.success('เก็บตัวอย่างสำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleStartAnalyze = async (orderId) => {
    try {
      await api.startAnalyze(orderId)
      toast.success('เริ่มวิเคราะห์สำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const openResultForm = (item) => {
    const fields = TEST_FIELDS[item.test_name] || DEFAULT_FIELDS
    const values = {}
    fields.forEach(f => { values[f.name] = '' })
    setResultModal({ item, fields, values })
  }

  const submitResults = async () => {
    const { item, fields, values } = resultModal
    const results = fields.map(f => {
      const value = parseFloat(values[f.name]) || 0
      return { name: f.name, value, unit: f.unit, flag: computeFlag(value, f.low, f.high), critical: false }
    })
    try {
      await api.saveLabResults(item._id, { results })
      toast.success('บันทึกผลสำเร็จ')
      setResultModal(null)
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleSendBack = async (orderId) => {
    try {
      await api.sendLabBack(orderId)
      toast.success('ส่งผลกลับแพทย์สำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (errored && queue.length === 0) return <div className="p-4"><ErrorState onRetry={fetchQueue} /></div>

  const statusLabels = {
    pending: { label: 'รอเก็บตัวอย่าง', color: 'bg-secondary' },
    collecting: { label: 'เก็บแล้ว', color: 'bg-info' },
    analyzing: { label: 'กำลังวิเคราะห์', color: 'bg-warning' },
    completed: { label: 'มีผลแล้ว', color: 'bg-success' },
    reported: { label: 'ส่งกลับแพทย์', color: 'bg-primary' },
  }

  return (
    <div className="p-4">
      <h4 className="fw-bold mb-1">Laboratory</h4>
      <small className="text-muted">LAB - ห้องปฏิบัติการ</small>

      {collectData && (
        <div className="card border-0 shadow-sm mt-4">
          <div className="card-body">
            <QueueHeader title="คิวรอเก็บตัวอย่าง (LABC)" counts={collectData.counts} onCallNext={handleCallNext} />
            <NowServingCard items={collectData.now_serving} onRecall={handleRecall} onSkip={handleSkip} />
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm mt-3">
        <div className="card-header bg-white fw-bold d-flex justify-content-between">
          <span>รายการตัวอย่าง</span>
          <span className="badge bg-primary">{queue.length}</span>
        </div>
        <div className="card-body p-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Sample No</th>
                <th>Test</th>
                <th>Encounter</th>
                <th>Status</th>
                <th>TAT</th>
                <th>Critical</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item, i) => (
                <tr key={item._id || i}>
                  <td><code>{item.sample_no}</code></td>
                  <td>{item.test_name}</td>
                  <td>
                    <strong>{item.patient?.display_name || item.patient_id}</strong>
                    {item.patient?.hn && <div className="text-muted small">HN: {item.patient.hn}</div>}
                    <small className="text-muted">Encounter: {item.encounter_id}</small>
                  </td>
                  <td>
                    <span className={`badge ${statusLabels[item.status]?.color || 'bg-secondary'}`}>
                      {statusLabels[item.status]?.label || item.status}
                    </span>
                  </td>
                  <td>{item.tat_min} นาที</td>
                  <td>{item.critical_alert && <span className="badge bg-danger">CRITICAL</span>}</td>
                  <td>
                    <div className="d-flex gap-1">
                      {item.status === 'pending' && (
                        <button className="btn btn-outline-primary btn-sm" onClick={() => handleCollect(item._id)}>เก็บ</button>
                      )}
                      {item.status === 'collecting' && (
                        <button className="btn btn-outline-warning btn-sm" onClick={() => handleStartAnalyze(item._id)}>วิเคราะห์</button>
                      )}
                      {item.status === 'analyzing' && (
                        <button className="btn btn-outline-success btn-sm" onClick={() => openResultForm(item)}>กรอกผล</button>
                      )}
                      {item.status === 'completed' && (
                        <button className="btn btn-outline-primary btn-sm" onClick={() => handleSendBack(item._id)}>ส่งกลับ</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {resultModal && (
        <>
          <div className="modal-backdrop show" onClick={() => setResultModal(null)} />
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content" style={{ borderRadius: 12 }}>
                <div className="modal-header">
                  <h6 className="modal-title fw-bold">กรอกผล — {resultModal.item.test_name} ({resultModal.item.sample_no})</h6>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setResultModal(null)}><X size={14} /></button>
                </div>
                <div className="modal-body">
                  {resultModal.fields.map(f => (
                    <div className="mb-3" key={f.name}>
                      <label className="form-label small">{f.name} {f.unit && `(${f.unit})`}{f.low != null && ` — ปกติ ${f.low}-${f.high}`}</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={resultModal.values[f.name]}
                        onChange={e => setResultModal(prev => ({ ...prev, values: { ...prev.values, [f.name]: e.target.value } }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setResultModal(null)}>ยกเลิก</button>
                  <button className="btn btn-primary btn-sm" onClick={submitResults}>บันทึกผล</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
