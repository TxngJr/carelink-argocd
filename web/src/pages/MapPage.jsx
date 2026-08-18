import React, { useState, useEffect, useContext } from 'react'
import {
  ClipboardList, Stethoscope, FlaskConical, Scan, Syringe, Pill, Home,
  Map as MapIcon, RefreshCw, Footprints, Building2, Clock,
} from 'lucide-react'
import { api } from '../services/api'
import { WSContext } from '../App'

const floorOrder = ['ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'ชั้น B1']

const typeIcons = {
  admin: ClipboardList,
  clinical: Stethoscope,
  lab: FlaskConical,
  imaging: Scan,
  treatment: Syringe,
  pharmacy: Pill,
  exit: Home,
}

function loadColor(station) {
  const total = station.waiting + station.in_progress
  if (total === 0) return { border: 'var(--slate-300)', bg: 'var(--surface)', badge: 'secondary' }
  if (station.waiting >= station.capacity) return { border: 'var(--crit)', bg: 'var(--crit-tint)', badge: 'danger' }
  if (station.waiting > 0) return { border: 'var(--warn)', bg: 'var(--warn-tint)', badge: 'warning' }
  return { border: 'var(--ok)', bg: 'var(--ok-tint)', badge: 'success' }
}

function StationTile({ station, onClick }) {
  const c = loadColor(station)
  const total = station.waiting + station.in_progress
  return (
    <div
      className="card h-100"
      style={{ borderLeft: `4px solid ${c.border}`, background: c.bg, cursor: total > 0 ? 'pointer' : 'default' }}
      onClick={() => total > 0 && onClick(station)}
    >
      <div className="card-body p-2">
        <div className="d-flex justify-content-between align-items-start">
          <div className="small fw-bold text-truncate d-flex align-items-center" title={station.name}>
            {React.createElement(typeIcons[station.type] || Stethoscope, { size: 13, strokeWidth: 2, style: { marginRight: 5, flexShrink: 0, color: 'var(--teal-700)' } })}
            {station.name}
          </div>
          <span className={`badge bg-${c.badge}`}>{total}</span>
        </div>
        <div className="d-flex justify-content-between align-items-center mt-1">
          <small className="text-muted font-mono">{station.code}</small>
          <small className="text-muted">
            รอ {station.waiting} · กำลังรับ {station.in_progress}/{station.capacity}
          </small>
        </div>
        {station.estimated_wait_min > 0 && (
          <small className="text-danger d-flex align-items-center"><Clock size={11} style={{ marginRight: 4 }} /> รอ ~{station.estimated_wait_min} นาที</small>
        )}
        {station.patients.length > 0 && (
          <div className="mt-1 d-flex flex-wrap gap-1">
            {station.patients.slice(0, 4).map(p => (
              <span
                key={`${p.encounter_id}-${p.queue_no}`}
                className={`badge ${p.status === 'in_progress' ? 'bg-primary' : p.priority === 'urgent' || p.priority === 'stat' ? 'bg-danger' : 'bg-light text-dark border'}`}
                title={`${p.display_name} (${p.hn})`}
              >
                {p.queue_no}
              </span>
            ))}
            {station.patients.length > 4 && (
              <span className="badge bg-light text-muted border">+{station.patients.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MapPage() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const wsEvents = useContext(WSContext)

  const fetchData = async () => {
    try {
      const res = await api.getMapOverview()
      setOverview(res.data)
    } catch (err) {
      console.error('Map fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 8000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wsEvents.length > 0) {
      const latest = wsEvents[0]
      if (['QUEUE_UPDATED', 'PATIENT_MOVED', 'STATION_STATUS_UPDATED', 'DASHBOARD_KPI_UPDATED'].includes(latest.type)) {
        fetchData()
      }
    }
  }, [wsEvents])

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (!overview) return <div className="p-5 text-center text-muted">ไม่สามารถโหลดข้อมูลแผนที่ได้</div>

  const stationName = code => overview.stations.find(s => s.code === code)?.name || code
  const byFloor = {}
  overview.stations.forEach(s => {
    byFloor[s.floor] = byFloor[s.floor] || []
    byFloor[s.floor].push(s)
  })
  const floors = floorOrder.filter(f => byFloor[f])
  Object.keys(byFloor).forEach(f => { if (!floors.includes(f)) floors.push(f) })

  const totalPatients = overview.stations.reduce((sum, s) => sum + s.waiting + s.in_progress, 0)

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <div className="df-label mb-1">Live Station Map</div>
          <h4 className="fw-bold mb-1 d-flex align-items-center"><MapIcon size={22} style={{ marginRight: 8, color: 'var(--teal-700)' }} /> แผนที่สถานีบริการสด</h4>
          <small className="text-muted">
            ผู้ป่วยในระบบ {totalPatients} คน · กำลังเดินระหว่างสถานี {overview.transits.length} คน · อัปเดตอัตโนมัติ
          </small>
        </div>
        <button className="btn btn-outline-primary btn-sm d-flex align-items-center" onClick={fetchData}><RefreshCw size={14} style={{ marginRight: 6 }} /> รีเฟรช</button>
      </div>

      {overview.transits.length > 0 && (
        <div className="card mb-3 border-info">
          <div className="card-body p-3">
            <div className="fw-bold small mb-2 d-flex align-items-center" style={{ color: 'var(--info)' }}><Footprints size={15} style={{ marginRight: 6 }} /> กำลังเดินระหว่างสถานี</div>
            <div className="d-flex flex-wrap gap-2">
              {overview.transits.map(t => (
                <div key={`${t.encounter_id}-${t.queue_no}`} className="border rounded px-3 py-2 bg-light d-flex align-items-center gap-2">
                  <span className="badge bg-info font-mono">{t.queue_no}</span>
                  <span className="small fw-bold">{t.display_name}</span>
                  <span className="small text-muted">
                    {stationName(t.from_station)} <span className="text-info fw-bold">→</span> {stationName(t.to_station)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="d-flex gap-3 mb-3 small text-muted flex-wrap">
        <span><span className="badge bg-secondary">&nbsp;</span> ว่าง</span>
        <span><span className="badge bg-success">&nbsp;</span> กำลังให้บริการ</span>
        <span><span className="badge bg-warning">&nbsp;</span> มีคิวรอ</span>
        <span><span className="badge bg-danger">&nbsp;</span> คิวเต็ม/แน่น</span>
        <span><span className="badge bg-primary">&nbsp;</span> คิวกำลังรับบริการ</span>
      </div>

      {floors.map(floor => (
        <div key={floor} className="mb-4">
          <h6 className="fw-bold text-muted border-bottom pb-2 d-flex align-items-center"><Building2 size={15} style={{ marginRight: 6 }} /> {floor}</h6>
          <div className="row g-2">
            {byFloor[floor].map(st => (
              <div key={st.code} className="col-6 col-md-4 col-lg-3 col-xl-2">
                <StationTile station={st} onClick={setSelected} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {selected && (
        <>
          <div className="offcanvas offcanvas-end show" style={{ visibility: 'visible' }} tabIndex="-1">
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title d-flex align-items-center">
                {React.createElement(typeIcons[selected.type] || Stethoscope, { size: 18, strokeWidth: 2, style: { marginRight: 8, color: 'var(--teal-700)' } })}
                {selected.name} ({selected.code})
              </h5>
              <button type="button" className="btn-close" onClick={() => setSelected(null)} />
            </div>
            <div className="offcanvas-body">
              <div className="mb-3 small text-muted">
                {selected.floor} · ความจุ {selected.capacity} · รอ {selected.waiting} คน · กำลังรับบริการ {selected.in_progress} คน
              </div>
              {selected.patients.length === 0 && <div className="text-muted">ไม่มีผู้ป่วยในคิว</div>}
              {selected.patients.map(p => (
                <div key={`${p.encounter_id}-${p.queue_no}`} className="d-flex justify-content-between align-items-center border rounded p-2 mb-2">
                  <div>
                    <div className="fw-bold small">{p.display_name}</div>
                    <small className="text-muted">{p.hn}</small>
                  </div>
                  <div className="text-end">
                    <span className={`badge ${p.status === 'in_progress' ? 'bg-primary' : 'bg-light text-dark border'} d-block mb-1`}>{p.queue_no}</span>
                    {(p.priority === 'urgent' || p.priority === 'stat') && <span className="badge bg-danger">{p.priority}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="offcanvas-backdrop show" onClick={() => setSelected(null)} />
        </>
      )}
    </div>
  )
}
