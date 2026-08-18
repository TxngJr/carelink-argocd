import React, { useState, useEffect, useContext } from 'react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import QueueHeader from '../components/ui/QueueHeader'
import NowServingCard from '../components/ui/NowServingCard'
import WaitChip from '../components/ui/WaitChip'

const STATION = 'NPR'

export default function RegistrationPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
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
    if (wsEvents.length > 0 && ['QUEUE_UPDATED', 'QUEUE_CALLED'].includes(wsEvents[0].type)) {
      fetchQueue()
    }
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
    try {
      await api.skipQueue(STATION, item.id)
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleRegister = async (encId) => {
    try {
      await api.registerPatient(encId)
      toast.success('ลงทะเบียนสำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleVerifyEligibility = async (encId) => {
    try {
      await api.verifyEligibility(encId)
      toast.success('ตรวจสอบสิทธิสำเร็จ')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleSendToVitals = async (encId) => {
    const ok = await confirm({ title: 'ส่งต่อจุดวัดสัญญาณชีพ (VM)?', body: 'ผู้ป่วยจะถูกย้ายออกจากคิว NPR/EV ทันที' })
    if (!ok) return
    try {
      await api.sendToVitals(encId)
      toast.success('ส่งต่อจุดวัดสัญญาณชีพสำเร็จ')
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
      <h4 className="fw-bold mb-1">Registration & Eligibility</h4>
      <small className="text-muted">NPR / EV</small>

      <div className="mt-4">
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <QueueHeader title="คิวรอลงทะเบียน" counts={data.counts} onCallNext={handleCallNext} />
            <NowServingCard items={data.now_serving} onRecall={handleRecall} onSkip={handleSkip} />
            {waitingItems.length === 0 ? (
              <div className="text-center text-muted py-4">ไม่มีคิวรอลงทะเบียน</div>
            ) : (
              waitingItems.map((item, i) => (
                <div key={item.id || i} className="queue-item d-flex justify-content-between align-items-center">
                  <div>
                    <span className="badge bg-secondary me-2">{item.queue_no}</span>
                    <strong>{item.patient?.display_name || item.patient_id} {item.patient?.hn && `(HN: ${item.patient.hn})`}</strong>
                    <span className="text-muted ms-2">Encounter: {item.encounter?.encounter_no || item.encounter_id}</span>
                    <span className="ms-2"><WaitChip since={item.created_at} avgWaitMin={null} /></span>
                  </div>
                  <div className="d-flex gap-1">
                    <button className="btn btn-primary btn-sm" onClick={() => handleRegister(item.encounter_id)}>
                      ลงทะเบียน
                    </button>
                    <button className="btn btn-outline-warning btn-sm" onClick={() => handleVerifyEligibility(item.encounter_id)}>
                      ตรวจสิทธิ
                    </button>
                    <button className="btn btn-success btn-sm" onClick={() => handleSendToVitals(item.encounter_id)}>
                      ส่ง VM
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
