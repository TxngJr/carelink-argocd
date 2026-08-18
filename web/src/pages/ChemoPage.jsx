import React, { useState, useEffect, useContext } from 'react'
import { X } from 'lucide-react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import QueueHeader from '../components/ui/QueueHeader'
import NowServingCard from '../components/ui/NowServingCard'

const STATION = 'CHEMO_PRE'
const PROGRESS_PRESETS = [25, 50, 75, 100]

export default function ChemoPage() {
  const [chairs, setChairs] = useState([])
  const [stationData, setStationData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)
  const [assignModal, setAssignModal] = useState(null)
  const wsEvents = useContext(WSContext)
  const toast = useToast()
  const confirm = useConfirm()

  const fetchChairs = async () => {
    try {
      const [chairRes, stRes] = await Promise.all([api.getChemoChairs(), api.getStationQueue(STATION)])
      setChairs(chairRes.data || [])
      setStationData(stRes.data)
      setErrored(false)
    } catch (err) {
      setErrored(true)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChairs()
    const interval = setInterval(fetchChairs, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wsEvents.length > 0 && ['STATION_STATUS_UPDATED', 'QUEUE_UPDATED', 'QUEUE_CALLED'].includes(wsEvents[0].type)) fetchChairs()
  }, [wsEvents])

  const handleCallNext = async () => {
    try {
      await api.callNext(STATION)
      toast.success('เรียกคิวถัดไปแล้ว')
      fetchChairs()
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
      fetchChairs()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleStart = async (sessionId) => {
    try {
      await api.startChemo(sessionId)
      toast.success('เริ่มให้ยาสำเร็จ')
      fetchChairs()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleProgress = async (sessionId, progress) => {
    try {
      await api.updateChemoProgress(sessionId, progress)
      fetchChairs()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleComplete = async (sessionId, patientLabel) => {
    const ok = await confirm({
      title: `เสร็จสิ้นการให้ยา${patientLabel ? ` — ${patientLabel}` : ''}?`,
      body: 'ผู้ป่วยจะถูกส่งต่อไปเภสัชกรรมเพื่อรับยากลับบ้าน',
    })
    if (!ok) return
    try {
      await api.completeChemo(sessionId)
      toast.success('เสร็จสิ้นการให้ยา')
      fetchChairs()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const emptyChairNos = () => {
    const used = new Set(chairs.map(c => c.chair_no))
    const free = []
    for (let n = 1; n <= 8; n++) if (!used.has(n)) free.push(n)
    return free
  }

  const openAssignModal = (item) => {
    const free = emptyChairNos()
    if (free.length === 0) {
      toast.error('ไม่มีเก้าอี้ว่าง')
      return
    }
    setAssignModal({ item, chairNo: free[0], regimen: '', cycleText: '' })
  }

  const submitAssign = async () => {
    const { item, chairNo, regimen, cycleText } = assignModal
    if (!regimen.trim()) {
      toast.error('กรุณาระบุ regimen')
      return
    }
    try {
      await api.assignChair(item.encounter_id, { chair_no: chairNo, regimen, cycle_text: cycleText })
      toast.success(`จัดเก้าอี้ ${chairNo} สำเร็จ`)
      setAssignModal(null)
      fetchChairs()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (errored && chairs.length === 0 && !stationData) return <div className="p-4"><ErrorState onRetry={fetchChairs} /></div>

  const allChairs = Array.from({ length: 8 }, (_, i) => {
    const session = chairs.find(c => c.chair_no === i + 1)
    return { chair_no: i + 1, session }
  })

  const statusColors = {
    preparing: 'bg-warning',
    pre_medication: 'bg-info',
    infusing: 'bg-primary',
    completed: 'bg-success',
  }

  const waitingForChair = (stationData?.items || []).filter(i => i.status === 'waiting')

  return (
    <div className="p-4">
      <h4 className="fw-bold mb-1">Chemotherapy Room</h4>
      <small className="text-muted">CHEMO - ห้องเคมีบำบัด (8 เก้าอี้)</small>

      {stationData && (
        <div className="card border-0 shadow-sm mt-4">
          <div className="card-body">
            <QueueHeader title="คิวรอเข้ารับเคมีบำบัด (CHEMO_PRE)" counts={stationData.counts} onCallNext={handleCallNext} />
            <NowServingCard items={stationData.now_serving} onRecall={handleRecall} onSkip={handleSkip} />
            {waitingForChair.length > 0 && (
              <div className="d-flex flex-column gap-2">
                {waitingForChair.map(item => (
                  <div key={item.id} className="queue-item d-flex justify-content-between align-items-center">
                    <div>
                      <span className="badge bg-secondary me-2">{item.queue_no}</span>
                      <strong>{item.patient?.display_name || item.patient_id}</strong>
                    </div>
                    <button className="btn btn-outline-primary btn-sm" onClick={() => openAssignModal(item)}>จัดเก้าอี้</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="row mt-3 g-3">
        {allChairs.map(chair => (
          <div key={chair.chair_no} className="col-md-3">
            <div className={`card border-0 shadow-sm h-100 ${chair.session ? 'border-start border-4 border-primary' : ''}`}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="mb-0">เก้าอี้ {chair.chair_no}</h6>
                  <span className={`badge ${chair.session ? statusColors[chair.session.status] || 'bg-secondary' : 'bg-light text-dark'}`}>
                    {chair.session ? chair.session.status : 'ว่าง'}
                  </span>
                </div>

                {chair.session ? (
                  <>
                    <strong className="d-block text-truncate small mb-1" title={chair.session.patient?.display_name || chair.session.patient_id}>
                      {chair.session.patient?.display_name || chair.session.patient_id} {chair.session.patient?.hn && `(HN: ${chair.session.patient.hn})`}
                    </strong>
                    <div className="small text-muted mb-1">{chair.session.regimen} {chair.session.cycle_text}</div>
                    {chair.session.status === 'infusing' && (
                      <>
                        <div className="progress mb-2" style={{ height: '8px' }}>
                          <div className="progress-bar bg-primary" style={{ width: `${chair.session.progress_percent}%` }} />
                        </div>
                        <div className="small text-muted mb-2">
                          {chair.session.progress_percent}% | เหลือ ~{chair.session.estimated_remaining_min} นาที
                        </div>
                        <input
                          type="range"
                          className="form-range mb-2"
                          min="0"
                          max="100"
                          step="5"
                          value={chair.session.progress_percent}
                          onChange={e => handleProgress(chair.session._id, parseInt(e.target.value))}
                        />
                        <div className="d-flex gap-1 flex-wrap">
                          {PROGRESS_PRESETS.map(p => (
                            <button key={p} className="btn btn-outline-primary btn-sm" onClick={() => handleProgress(chair.session._id, p)}>
                              {p}%
                            </button>
                          ))}
                          <button className="btn btn-success btn-sm" onClick={() => handleComplete(chair.session._id, chair.session.patient?.display_name)}>
                            เสร็จ
                          </button>
                        </div>
                      </>
                    )}
                    {chair.session.status === 'preparing' && (
                      <button className="btn btn-primary btn-sm mt-2" onClick={() => handleStart(chair.session._id)}>
                        เริ่มให้ยา
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center text-muted py-2">ว่าง</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {assignModal && (
        <>
          <div className="modal-backdrop show" onClick={() => setAssignModal(null)} />
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content" style={{ borderRadius: 12 }}>
                <div className="modal-header">
                  <h6 className="modal-title fw-bold">จัดเก้าอี้ — {assignModal.item.patient?.display_name || assignModal.item.patient_id}</h6>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setAssignModal(null)}><X size={14} /></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small">เก้าอี้</label>
                    <select
                      className="form-select"
                      value={assignModal.chairNo}
                      onChange={e => setAssignModal(prev => ({ ...prev, chairNo: parseInt(e.target.value) }))}
                    >
                      {emptyChairNos().map(n => <option key={n} value={n}>เก้าอี้ {n}</option>)}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label small">Regimen</label>
                    <input
                      className="form-control"
                      value={assignModal.regimen}
                      onChange={e => setAssignModal(prev => ({ ...prev, regimen: e.target.value }))}
                      placeholder="เช่น FOLFOX"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small">Cycle</label>
                    <input
                      className="form-control"
                      value={assignModal.cycleText}
                      onChange={e => setAssignModal(prev => ({ ...prev, cycleText: e.target.value }))}
                      placeholder="เช่น รอบที่ 3 จาก 6"
                    />
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setAssignModal(null)}>ยกเลิก</button>
                  <button className="btn btn-primary btn-sm" onClick={submitAssign}>จัดเก้าอี้</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
