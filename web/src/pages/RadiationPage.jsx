import React, { useState, useEffect, useContext } from 'react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import QueueHeader from '../components/ui/QueueHeader'
import NowServingCard from '../components/ui/NowServingCard'

const MACHINES = [
  { code: 'RT_L1', title: 'LINAC 1 - TrueBeam', headerClass: 'bg-primary text-white' },
  { code: 'RT_L2', title: 'LINAC 2', headerClass: 'bg-info text-white' },
]

export default function RadiationPage() {
  const [schedule, setSchedule] = useState([])
  const [stationData, setStationData] = useState({})
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)
  const wsEvents = useContext(WSContext)
  const toast = useToast()
  const confirm = useConfirm()

  const fetchSchedule = async () => {
    try {
      const [schedRes, l1Res, l2Res] = await Promise.all([
        api.getRadiationSchedule(),
        api.getStationQueue('RT_L1'),
        api.getStationQueue('RT_L2'),
      ])
      setSchedule(schedRes.data || [])
      setStationData({ RT_L1: l1Res.data, RT_L2: l2Res.data })
      setErrored(false)
    } catch (err) {
      setErrored(true)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSchedule()
    const interval = setInterval(fetchSchedule, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wsEvents.length > 0 && ['STATION_STATUS_UPDATED', 'QUEUE_UPDATED', 'QUEUE_CALLED'].includes(wsEvents[0].type)) fetchSchedule()
  }, [wsEvents])

  const handleCallNext = async (code) => {
    try {
      await api.callNext(code)
      toast.success('เรียกคิวถัดไปแล้ว')
      fetchSchedule()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleRecall = async (code, item) => {
    try {
      await api.recallQueue(code, item.id)
      toast.info(`เรียกซ้ำคิว ${item.queue_no}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleSkip = async (code, item) => {
    const ok = await confirm({ title: `ข้ามคิว ${item.queue_no}?`, confirmLabel: 'ข้ามคิว', danger: true })
    if (!ok) return
    try {
      await api.skipQueue(code, item.id)
      fetchSchedule()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleStart = async (sessionId) => {
    try {
      await api.startRadiation(sessionId)
      toast.success('เริ่มฉายแสงสำเร็จ')
      fetchSchedule()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleComplete = async (sessionId) => {
    try {
      await api.completeRadiation(sessionId)
      toast.success('ฉายแสงเสร็จสิ้น')
      fetchSchedule()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleNoShow = async (sessionId, patientLabel) => {
    const ok = await confirm({
      title: `ทำเครื่องหมายไม่มา${patientLabel ? ` — ${patientLabel}` : ''}?`,
      body: 'ผู้ป่วยจะถูกทำเครื่องหมายว่าไม่มาตามนัดวันนี้',
      confirmLabel: 'ไม่มา',
      danger: true,
    })
    if (!ok) return
    try {
      await api.noShowRadiation(sessionId)
      toast.info('บันทึกไม่มาสำเร็จ')
      fetchSchedule()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (errored && schedule.length === 0) return <div className="p-4"><ErrorState onRetry={fetchSchedule} /></div>

  const statusLabels = {
    scheduled: { label: 'นัดไว้', color: 'bg-info' },
    waiting: { label: 'รอเข้าเครื่อง', color: 'bg-warning' },
    in_progress: { label: 'กำลังฉาย', color: 'bg-primary' },
    completed: { label: 'ฉายแล้ว', color: 'bg-success' },
    no_show: { label: 'ไม่มา', color: 'bg-danger' },
  }

  return (
    <div className="p-4">
      <h4 className="fw-bold mb-1">Radiation Therapy</h4>
      <small className="text-muted">RT / LINAC - ฉายแสง (2 เครื่อง)</small>

      <div className="row mt-4">
        {MACHINES.map(m => (
          <div className="col-md-6" key={m.code}>
            <div className="card border-0 shadow-sm mb-3">
              <div className={`card-header fw-bold ${m.headerClass}`}>{m.title}</div>
              <div className="card-body">
                {stationData[m.code] && (
                  <>
                    <QueueHeader
                      title={`คิวรอ (${m.code})`}
                      counts={stationData[m.code].counts}
                      onCallNext={() => handleCallNext(m.code)}
                    />
                    <NowServingCard
                      items={stationData[m.code].now_serving}
                      onRecall={(item) => handleRecall(m.code, item)}
                      onSkip={(item) => handleSkip(m.code, item)}
                    />
                  </>
                )}
                {schedule.filter(s => s.machine_code === m.code).length === 0 ? (
                  <div className="text-center text-muted py-3">ไม่มีนัดวันนี้</div>
                ) : (
                  schedule.filter(s => s.machine_code === m.code).map((item, i) => (
                    <div key={item._id || i} className="queue-item d-flex justify-content-between align-items-center">
                      <div>
                        <span className={`badge ${statusLabels[item.status]?.color || 'bg-secondary'} me-2`}>
                          {statusLabels[item.status]?.label || item.status}
                        </span>
                        <strong>{item.patient?.display_name || item.patient_id} {item.patient?.hn && `(HN: ${item.patient.hn})`}</strong>
                        <span className="ms-2 text-muted">
                          {item.fraction_current}/{item.fraction_total} ครั้ง
                        </span>
                      </div>
                      <div className="d-flex gap-1">
                        {item.status === 'scheduled' && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleStart(item._id)}>เริ่มฉาย</button>
                        )}
                        {item.status === 'in_progress' && (
                          <button className="btn btn-success btn-sm" onClick={() => handleComplete(item._id)}>เสร็จ</button>
                        )}
                        {item.status === 'scheduled' && (
                          <button className="btn btn-outline-danger btn-sm" onClick={() => handleNoShow(item._id, item.patient?.display_name)}>ไม่มา</button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
