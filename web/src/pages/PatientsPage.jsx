import React, { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { api } from '../services/api'
import ErrorState from '../components/ui/ErrorState'
import { useToast } from '../components/ui/Toast'

const stationLabels = {
  NPR: 'ลงทะเบียน', EV: 'ตรวจสอบสิทธิ', VM: 'วัดสัญญาณชีพ', MHT: 'ซักประวัติ',
  PC: 'ตรวจโดยแพทย์', LABC: 'เก็บตัวอย่าง Lab', LABA: 'วิเคราะห์ Lab',
  RC: 'ฟังผล', TD: 'ตัดสินใจแผนการรักษา', CHEMO_PRE: 'เตรียมเคมี',
  CHEMO_INF: 'ให้เคมีบำบัด', PD_VERIFY: 'เภสัชตรวจสอบยา', PD_DISP: 'จ่ายยา',
  RT_SIM: 'จำลองตำแหน่งฉายแสง', RT_L1: 'LINAC 1', RT_L2: 'LINAC 2', DH: 'กลับบ้าน',
}

export default function PatientsPage() {
  const [patients, setPatients] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState(null)
  const [journey, setJourney] = useState(null)
  const [journeyLoading, setJourneyLoading] = useState(false)
  const toast = useToast()

  const fetchPatients = async () => {
    setError(false)
    try {
      const res = await api.getPatients()
      setPatients(res.data || [])
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPatients() }, [])

  const openPatient = async (patient) => {
    setSelected(patient)
    setJourney(null)
    setJourneyLoading(true)
    try {
      const encRes = await api.getEncounters()
      const encounters = (encRes.data || [])
        .filter(e => e.patient_id === patient.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      if (encounters.length === 0) {
        setJourney(null)
        return
      }
      const jRes = await api.getJourney(encounters[0].id)
      setJourney(jRes.data)
    } catch (err) {
      toast.error('โหลดเส้นทางผู้ป่วยไม่สำเร็จ')
    } finally {
      setJourneyLoading(false)
    }
  }

  const filtered = patients.filter(p => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (p.display_name || '').toLowerCase().includes(q) || (p.hn || '').toLowerCase().includes(q)
  })

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>

  return (
    <div className="p-4">
      <h4 className="fw-bold mb-1">ค้นหาผู้ป่วย</h4>
      <small className="text-muted">ค้นหาด้วยชื่อหรือ HN เพื่อดูเส้นทางการรักษา</small>

      <div className="mt-4">
        <div className="input-group mb-3" style={{ maxWidth: 420 }}>
          <span className="input-group-text bg-white"><Search size={16} /></span>
          <input
            className="form-control"
            placeholder="ค้นหาชื่อหรือ HN..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {error ? (
          <ErrorState onRetry={fetchPatients} />
        ) : (
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-bold d-flex justify-content-between">
              <span>รายชื่อผู้ป่วย</span>
              <span className="badge bg-primary">{filtered.length}</span>
            </div>
            <div className="card-body p-0">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>HN</th>
                    <th>ชื่อ</th>
                    <th>อายุ</th>
                    <th>สิทธิการรักษา</th>
                    <th>การวินิจฉัย</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openPatient(p)}>
                      <td><code>{p.hn}</code></td>
                      <td><strong>{p.display_name}</strong></td>
                      <td>{p.age}</td>
                      <td>{p.insurance_type}</td>
                      <td>{p.cancer?.diagnosis} {p.cancer?.stage && `(ระยะ ${p.cancer.stage})`}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-muted py-4">ไม่พบผู้ป่วย</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="offcanvas-backdrop show" onClick={() => setSelected(null)} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: 'visible', width: 420 }} tabIndex="-1">
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title">
                {selected.display_name}
                <div className="text-muted small font-mono">HN: {selected.hn}</div>
              </h5>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelected(null)}><X size={16} /></button>
            </div>
            <div className="offcanvas-body">
              {selected.allergies?.length > 0 && (
                <div className="alert alert-danger py-2 mb-3">แพ้: {selected.allergies.join(', ')}</div>
              )}
              {selected.cancer && (
                <div className="alert alert-light mb-3">
                  <strong>{selected.cancer.diagnosis}</strong> ระยะ {selected.cancer.stage}
                  {selected.cancer.doctor_name && <div className="small text-muted">แพทย์เจ้าของไข้: {selected.cancer.doctor_name}</div>}
                </div>
              )}

              <div className="df-label mb-2">เส้นทางการรักษาล่าสุด</div>
              {journeyLoading ? (
                <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-primary" /></div>
              ) : !journey ? (
                <div className="text-muted small py-2">ไม่มีข้อมูลการมาตรวจ</div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  <div className="small text-muted mb-1">
                    Encounter: {journey.encounter_no} · สถานะ: {journey.status === 'completed' ? 'เสร็จสิ้น' : 'กำลังดำเนินการ'}
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {(journey.route || []).map((step, i) => (
                      <span key={i} className={`route-step ${step.status}`}>
                        {stationLabels[step.station_code] || step.station_code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
