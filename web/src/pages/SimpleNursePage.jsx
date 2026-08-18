import React, { useEffect, useState } from 'react'
import { api } from '../services/api'
import QueueWorkspace from '../components/QueueWorkspace'

const measurementRows = [
  ['height_cm', 'ส่วนสูง', 'ซม.'],
  ['weight_kg', 'น้ำหนัก', 'กก.'],
  ['sbp', 'ความดันตัวบน', 'mmHg'],
  ['dbp', 'ความดันตัวล่าง', 'mmHg'],
  ['spo2', 'SpO2', '%'],
]

function RequestCard({ row, onDone }) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  tomorrow.setMinutes(0, 0, 0)
  const [appointmentAt, setAppointmentAt] = useState(tomorrow.toISOString().slice(0, 16))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const propose = async () => {
    setBusy(true)
    try {
      await api.proposeAppointment(row.id, {
        appointment_at: new Date(appointmentAt).toISOString(),
        note,
      })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="card border-0 shadow-sm">
      <div className="card-body">
        <h2 className="h5">{row.patient?.display_name || 'ผู้ป่วย'}</h2>
        <div className="text-secondary mb-2">HN {row.patient?.hn || '-'} · {row.patient?.phone || '-'}</div>
        <div className="p-3 bg-light rounded-3 mb-3">
          <div className="small text-secondary">อาการสำคัญ</div>
          <div className="fs-5">{row.chief_complaint}</div>
        </div>
        <div className="row g-2 mb-3">
          {measurementRows.map(([key, label, unit]) => (
            <div className="col-6 col-lg" key={key}>
              <div className="border rounded-3 p-2 h-100">
                <div className="small text-secondary">{label}</div>
                <strong>{row.measurements?.[key] ?? '-'} {row.measurements?.[key] != null ? unit : ''}</strong>
              </div>
            </div>
          ))}
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-2">
          <div className="col-md-5">
            <label className="form-label">วันและเวลาที่เสนอ</label>
            <input className="form-control" type="datetime-local" value={appointmentAt} onChange={e => setAppointmentAt(e.target.value)} />
          </div>
          <div className="col-md-5">
            <label className="form-label">หมายเหตุพยาบาล</label>
            <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="ถ้ามี" />
          </div>
          <div className="col-md-2 d-flex align-items-end">
            <button className="btn btn-primary w-100" disabled={busy || !appointmentAt} onClick={propose}>เสนอวันนัด</button>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function SimpleNursePage() {
  const [tab, setTab] = useState('requests')
  const [requests, setRequests] = useState([])
  const [arrivals, setArrivals] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = async () => {
    try {
      const [req, arr] = await Promise.all([api.getNurseRequests('submitted'), api.getTodayArrivals()])
      setRequests(req.data || [])
      setArrivals(arr.data || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [])

  const checkIn = async id => {
    setBusyId(id)
    try {
      await api.confirmCheckIn(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  return (
    <main className="container-fluid p-3 p-lg-4">
      <div className="mb-4">
        <h1 className="h3 mb-1">พื้นที่ทำงานพยาบาล</h1>
        <div className="text-secondary">อ่านคำขอ นัดหมาย เช็กอิน และดูแลคิวทุก Station ที่ไม่ใช่ห้องแพทย์</div>
      </div>
      <div className="nav nav-pills gap-2 mb-4">
        <button className={`nav-link ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>คำขอใหม่ ({requests.length})</button>
        <button className={`nav-link ${tab === 'arrivals' ? 'active' : ''}`} onClick={() => setTab('arrivals')}>ผู้ป่วยมาถึงแล้ว ({arrivals.length})</button>
        <button className={`nav-link ${tab === 'queues' ? 'active' : ''}`} onClick={() => setTab('queues')}>คิว Station</button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      {tab === 'requests' && (
        <div className="d-grid gap-3">
          {requests.length === 0 && <div className="card card-body text-center text-secondary py-5">ไม่มีคำขอใหม่</div>}
          {requests.map(row => <RequestCard key={row.id} row={row} onDone={load} />)}
        </div>
      )}
      {tab === 'arrivals' && (
        <div className="d-grid gap-3">
          {arrivals.length === 0 && <div className="card card-body text-center text-secondary py-5">ยังไม่มีผู้ป่วยแจ้งมาถึง</div>}
          {arrivals.map(row => (
            <article key={row.id} className="card border-0 shadow-sm">
              <div className="card-body d-flex flex-wrap gap-3 justify-content-between align-items-center">
                <div>
                  <h2 className="h5 mb-1">{row.patient?.display_name}</h2>
                  <div>HN {row.patient?.hn} · ห้อง {row.assigned_pc}</div>
                  <div className="text-secondary">นัด {row.appointment_at ? new Date(row.appointment_at).toLocaleString('th-TH') : '-'}</div>
                </div>
                <button className="btn btn-success btn-lg" disabled={busyId === row.id} onClick={() => checkIn(row.id)}>
                  ยืนยันเช็กอินและออกคิว
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {tab === 'queues' && <QueueWorkspace />}
    </main>
  )
}
