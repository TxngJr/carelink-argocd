import React, { useState, useEffect, useContext } from 'react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import ErrorState from '../components/ui/ErrorState'

export default function DashboardPage() {
  const [kpis, setKpis] = useState(null)
  const [stations, setStations] = useState([])
  const [patients, setPatients] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const wsEvents = useContext(WSContext)
  const toast = useToast()

  const fetchData = async () => {
    try {
      const [kRes, sRes, pRes, rRes] = await Promise.all([
        api.getDashboardKPIs(),
        api.getDashboardStations(),
        api.getDashboardPatients(),
        api.getRecommendations(),
      ])
      setKpis(kRes.data)
      setStations(sRes.data || [])
      setPatients(pRes.data || [])
      setRecommendations(rRes.data || [])
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wsEvents.length > 0) {
      const latest = wsEvents[0]
      if (['QUEUE_UPDATED', 'DASHBOARD_KPI_UPDATED', 'PATIENT_MOVED', 'STATION_STATUS_UPDATED'].includes(latest.type)) {
        fetchData()
      }
    }
  }, [wsEvents])

  const acceptRec = async (id) => {
    try {
      await api.acceptRecommendation(id)
      toast.success('รับคำแนะนำแล้ว')
      fetchData()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const rejectRec = async (id) => {
    try {
      await api.rejectRecommendation(id)
      toast.info('ปฏิเสธคำแนะนำแล้ว')
      fetchData()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (!kpis) return <div className="p-4"><ErrorState onRetry={fetchData} /></div>

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Dashboard Operations</h4>
          <small className="text-muted">ภาพรวมระบบวันนี้</small>
        </div>
        <button className="btn btn-outline-primary btn-sm" onClick={fetchData}>รีเฟรช</button>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card kpi-card p-3">
            <div className="text-muted small">ผู้ป่วยในระบบ</div>
            <div className="fs-2 fw-bold text-primary">{kpis?.total_patients_in_system || 0}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card kpi-card p-3">
            <div className="text-muted small">เวลารอเฉลี่ย</div>
            <div className="fs-2 fw-bold text-warning">{Math.round(kpis?.average_wait_min || 0)} นาที</div>
            {kpis?.kpi_source === 'measured' && (
              <div className="text-muted" style={{ fontSize: 11 }}>จากข้อมูลจริงวันนี้</div>
            )}
          </div>
        </div>
        <div className="col-md-3">
          <div className="card kpi-card p-3">
            <div className="text-muted small">คอขวด</div>
            <div className="fs-2 fw-bold text-danger">{kpis?.bottleneck_count || 0}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card kpi-card p-3">
            <div className="text-muted small">Station Utilization</div>
            <div className="fs-2 fw-bold text-success">{Math.round(kpis?.station_utilization || 0)}%</div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-8">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-bold">สถานีบริการ ({stations.length} สถานี)</div>
            <div className="card-body">
              <div className="row g-2">
                {stations.map(s => (
                  <div key={s.code} className={`col-md-3 col-sm-4`}>
                    <div className={`station-card p-2 ${s.utilization_pct > 100 ? 'bottleneck' : ''}`}>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="fw-bold small">{s.code}</span>
                        <span className={`badge ${s.utilization_pct > 100 ? 'bg-danger' : s.utilization_pct > 75 ? 'bg-warning' : 'bg-success'}`}>
                          {s.waiting_count}
                        </span>
                      </div>
                      <div className="text-muted" style={{ fontSize: '11px' }}>{s.name}</div>
                      <div className="progress mt-1" style={{ height: '4px' }}>
                        <div
                          className={`progress-bar ${s.utilization_pct > 100 ? 'bg-danger' : s.utilization_pct > 75 ? 'bg-warning' : 'bg-success'}`}
                          style={{ width: `${Math.min(s.utilization_pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-bold">AMIS Recommendation</div>
            <div className="card-body">
              {recommendations.length === 0 ? (
                <div className="text-center text-muted py-3">ไม่มี recommendation ขณะนี้</div>
              ) : (
                recommendations.map(rec => (
                  <div key={rec._id} className="alert alert-info py-2 mb-2">
                    <div className="fw-bold small">{rec.title}</div>
                    <div className="text-muted" style={{ fontSize: '11px' }}>{rec.description}</div>
                    {rec.expected_impact && (
                      <div className="text-muted" style={{ fontSize: '11px' }}>
                        ลดเวลารอ ~{rec.expected_impact.wait_reduction_min} นาที
                      </div>
                    )}
                    <div className="mt-2 d-flex gap-1">
                      <button className="btn btn-success btn-sm" onClick={() => acceptRec(rec._id)}>Accept</button>
                      <button className="btn btn-outline-secondary btn-sm" onClick={() => rejectRec(rec._id)}>Reject</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-bold">ผู้ป่วยในระบบ ({patients.length} ราย)</div>
        <div className="card-body p-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>HN</th>
                <th>ชื่อ</th>
                <th>สถานีปัจจุบัน</th>
                <th>Priority</th>
                <th>เวลาในระบบ</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p, i) => (
                <tr key={i}>
                  <td><code>{p.patient?.hn}</code></td>
                  <td>{p.patient?.display_name}</td>
                  <td>
                    <span className="badge bg-primary">{p.current_station}</span>
                  </td>
                  <td>
                    <span className={`badge ${p.encounter?.priority === 'urgent' ? 'bg-danger' : 'bg-secondary'}`}>
                      {p.encounter?.priority}
                    </span>
                  </td>
                  <td>{p.encounter?.total_visit_min || 0} นาที</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
