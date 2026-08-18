import React, { useState, useEffect, useContext } from 'react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import QueueHeader from '../components/ui/QueueHeader'
import NowServingCard from '../components/ui/NowServingCard'

const STATION = 'PD_VERIFY'

export default function PharmacyPage() {
  const [queue, setQueue] = useState([])
  const [stationData, setStationData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)
  const wsEvents = useContext(WSContext)
  const toast = useToast()
  const confirm = useConfirm()

  const fetchQueue = async () => {
    try {
      const [pdRes, stRes] = await Promise.all([api.getPharmacyQueue(), api.getStationQueue(STATION)])
      setQueue(pdRes.data || [])
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
    fetchQueue()
    const interval = setInterval(fetchQueue, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wsEvents.length > 0 && ['PHARMACY_READY', 'QUEUE_UPDATED', 'QUEUE_CALLED'].includes(wsEvents[0].type)) fetchQueue()
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

  const handleStartPrepare = async (rxId) => {
    try {
      await api.startPrepare(rxId)
      toast.success('เริ่มจัดยาสำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleReview = async (rxId) => {
    try {
      await api.reviewPharmacy(rxId)
      toast.success('ตรวจยาสำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleReady = async (rxId) => {
    try {
      await api.readyPharmacy(rxId)
      toast.success('พร้อมจ่ายยาสำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleDispense = async (rxId, rxNo) => {
    const ok = await confirm({
      title: `จ่ายยา ${rxNo || ''}?`,
      body: 'การจ่ายยาจะปิดรายการนี้และส่งผู้ป่วยกลับบ้าน',
    })
    if (!ok) return
    try {
      await api.dispensePharmacy(rxId)
      toast.success('จ่ายยาสำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (errored && queue.length === 0) return <div className="p-4"><ErrorState onRetry={fetchQueue} /></div>

  const statusLabels = {
    waiting: { label: 'รอจัด', color: 'bg-secondary' },
    preparing: { label: 'กำลังจัด', color: 'bg-warning' },
    pharmacist_review: { label: 'เภสัชตรวจ', color: 'bg-info' },
    ready_to_dispense: { label: 'พร้อมจ่าย', color: 'bg-success' },
    dispensed: { label: 'จ่ายแล้ว', color: 'bg-primary' },
    blocked: { label: 'บล็อก', color: 'bg-danger' },
  }

  return (
    <div className="p-4">
      <h4 className="fw-bold mb-1">Pharmacy</h4>
      <small className="text-muted">PD - ห้องยา</small>

      {stationData && (
        <div className="card border-0 shadow-sm mt-4">
          <div className="card-body">
            <QueueHeader title="คิวรอตรวจสอบยา (PD_VERIFY)" counts={stationData.counts} onCallNext={handleCallNext} />
            <NowServingCard items={stationData.now_serving} onRecall={handleRecall} onSkip={handleSkip} />
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm mt-3">
        <div className="card-header bg-white fw-bold d-flex justify-content-between">
          <span>ใบสั่งยา</span>
          <span className="badge bg-primary">{queue.length}</span>
        </div>
        <div className="card-body p-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Rx No</th>
                <th>Encounter</th>
                <th>รายการยา</th>
                <th>ความปลอดภัย</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item, i) => (
                <tr key={item._id || i}>
                  <td><code>{item.rx_no}</code></td>
                  <td>
                    <strong>{item.patient?.display_name || item.patient_id}</strong>
                    {item.patient?.hn && <div className="text-muted small">HN: {item.patient.hn}</div>}
                    <small className="text-muted">Encounter: {item.encounter_id}</small>
                  </td>
                  <td>
                    {item.items?.map((drug, j) => (
                      <div key={j} className="small">{drug.drug_name} {drug.strength} x{drug.qty}</div>
                    ))}
                  </td>
                  <td>
                    {item.safety?.allergy_check === 'warning' && (
                      <span className="badge bg-danger me-1">⚠ Allergy</span>
                    )}
                    {item.safety?.interaction_check === 'warning' && (
                      <span className="badge bg-warning text-dark">⚠ Interaction</span>
                    )}
                    {item.safety?.allergy_check === 'pass' && item.safety?.interaction_check === 'pass' && (
                      <span className="badge bg-success">Pass</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${statusLabels[item.status]?.color || 'bg-secondary'}`}>
                      {statusLabels[item.status]?.label || item.status}
                    </span>
                  </td>
                  <td>
                    <div className="d-flex gap-1">
                      {item.status === 'waiting' && (
                        <button className="btn btn-outline-warning btn-sm" onClick={() => handleStartPrepare(item._id)}>จัดยา</button>
                      )}
                      {item.status === 'preparing' && (
                        <button className="btn btn-outline-info btn-sm" onClick={() => handleReview(item._id)}>ตรวจ</button>
                      )}
                      {item.status === 'pharmacist_review' && (
                        <button className="btn btn-outline-success btn-sm" onClick={() => handleReady(item._id)}>พร้อม</button>
                      )}
                      {item.status === 'ready_to_dispense' && (
                        <button className="btn btn-success btn-sm" onClick={() => handleDispense(item._id, item.rx_no)}>จ่ายยา</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
