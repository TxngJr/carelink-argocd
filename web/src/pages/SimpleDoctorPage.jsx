import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import QueueWorkspace, { STATIONS } from '../components/QueueWorkspace'
import { buildDoctorRoute } from '../utils/route'

const optionalStations = STATIONS.filter(([code]) => !['NPR', 'EV', 'VM', 'MHT', 'PC', 'PC2', 'PC3', 'PC4', 'DH', 'HA', 'IPW'].includes(code))

function ConfirmCard({ row, onDone }) {
  const [appointmentAt, setAppointmentAt] = useState(row.appointment_at ? new Date(row.appointment_at).toISOString().slice(0, 16) : '')
  const [pc, setPC] = useState('PC')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setBusy(true)
    try {
      await api.confirmAppointment(row.id, {
        appointment_at: new Date(appointmentAt).toISOString(),
        assigned_pc: pc,
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
        <h2 className="h5">{row.patient?.display_name}</h2>
        <div className="text-secondary mb-2">HN {row.patient?.hn}</div>
        <div className="p-3 bg-light rounded-3 mb-3">{row.chief_complaint}</div>
        <div className="row g-2">
          <div className="col-md-4">
            <label className="form-label">วันและเวลา</label>
            <input type="datetime-local" className="form-control" value={appointmentAt} onChange={e => setAppointmentAt(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">ห้องตรวจ</label>
            <select className="form-select" value={pc} onChange={e => setPC(e.target.value)}>
              {['PC', 'PC2', 'PC3', 'PC4'].map(code => <option key={code}>{code}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">หมายเหตุแพทย์</label>
            <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="ถ้ามี" />
          </div>
          <div className="col-md-2 d-flex align-items-end">
            <button className="btn btn-primary w-100" onClick={confirm} disabled={busy || !appointmentAt}>ยืนยันนัด</button>
          </div>
        </div>
        {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
      </div>
    </article>
  )
}

function RouteBuilder({ encounterId, onClose }) {
  const [selected, setSelected] = useState([])
  const [candidate, setCandidate] = useState(optionalStations[0][0])
  const [terminal, setTerminal] = useState('DH')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const names = useMemo(() => Object.fromEntries(STATIONS), [])

  const add = () => {
    if (!selected.includes(candidate)) setSelected([...selected, candidate])
  }
  const move = (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= selected.length) return
    const copy = [...selected]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    setSelected(copy)
  }
  const save = async () => {
    setBusy(true)
    try {
      await api.setDoctorRoute(encounterId, buildDoctorRoute(selected, terminal))
      setMessage('บันทึกเส้นทางแล้ว สามารถกดเสร็จที่ห้องตรวจได้')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card border-primary shadow-sm mb-4">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="h5 mb-0">กำหนดเส้นทางหลังตรวจ</h2>
          <button className="btn-close" aria-label="ปิด" onClick={onClose} />
        </div>
        <div className="d-flex flex-wrap gap-2 mb-3">
          <select className="form-select" style={{ maxWidth: 360 }} value={candidate} onChange={e => setCandidate(e.target.value)}>
            {optionalStations.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
          </select>
          <button className="btn btn-outline-primary" onClick={add}>เพิ่ม Station</button>
        </div>
        <div className="d-grid gap-2 mb-3">
          {selected.length === 0 && <div className="text-secondary">ยังไม่มี Station เพิ่มเติม</div>}
          {selected.map((code, index) => (
            <div key={code} className="border rounded-3 p-2 d-flex gap-2 align-items-center">
              <strong className="me-auto">{index + 1}. {code} · {names[code]}</strong>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => move(index, -1)} disabled={index === 0}>ขึ้น</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => move(index, 1)} disabled={index === selected.length - 1}>ลง</button>
              <button className="btn btn-sm btn-outline-danger" onClick={() => setSelected(selected.filter(item => item !== code))}>ลบ</button>
            </div>
          ))}
        </div>
        <label className="form-label fw-semibold">ปลายทาง</label>
        <select className="form-select mb-3" style={{ maxWidth: 360 }} value={terminal} onChange={e => setTerminal(e.target.value)}>
          <option value="DH">DH · กลับบ้าน</option>
          <option value="IPW">HA → IPW · รับไว้รักษา</option>
        </select>
        <button className="btn btn-primary" onClick={save} disabled={busy}>บันทึกเส้นทาง</button>
        {message && <div className="alert alert-info mt-3 mb-0">{message}</div>}
      </div>
    </section>
  )
}

export default function SimpleDoctorPage() {
  const [tab, setTab] = useState('appointments')
  const [requests, setRequests] = useState([])
  const [routeEncounter, setRouteEncounter] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const res = await api.getDoctorAppointmentRequests()
      setRequests(res.data || [])
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

  return (
    <main className="container-fluid p-3 p-lg-4">
      <div className="mb-4">
        <h1 className="h3 mb-1">พื้นที่ทำงานแพทย์</h1>
        <div className="text-secondary">ยืนยันนัด ตรวจผู้ป่วย และกำหนดเส้นทางหลังตรวจ</div>
      </div>
      <div className="nav nav-pills gap-2 mb-4">
        <button className={`nav-link ${tab === 'appointments' ? 'active' : ''}`} onClick={() => setTab('appointments')}>รอยืนยันนัด ({requests.length})</button>
        <button className={`nav-link ${tab === 'queues' ? 'active' : ''}`} onClick={() => setTab('queues')}>ห้องตรวจ PC</button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {tab === 'appointments' && (
        <div className="d-grid gap-3">
          {requests.length === 0 && <div className="card card-body text-center text-secondary py-5">ไม่มีนัดรอยืนยัน</div>}
          {requests.map(row => <ConfirmCard key={row.id} row={row} onDone={load} />)}
        </div>
      )}
      {tab === 'queues' && (
        <>
          {routeEncounter && <RouteBuilder encounterId={routeEncounter} onClose={() => setRouteEncounter('')} />}
          <QueueWorkspace doctor onSelectEncounter={setRouteEncounter} />
        </>
      )}
    </main>
  )
}
