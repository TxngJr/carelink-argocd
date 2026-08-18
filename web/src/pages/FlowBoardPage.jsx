import React, { useState, useEffect, useContext } from 'react'
import {
  Sparkles, Activity, TrendingDown, TrendingUp, MinusCircle, Megaphone, X, Clock,
} from 'lucide-react'
import { api } from '../services/api'
import { WSContext, useAuth } from '../App'
import { useToast } from '../components/ui/Toast'
import ErrorState from '../components/ui/ErrorState'

// fixed layout of the 24 stations on the flow canvas
const POS = {
  NPR: [70, 320], EV: [185, 320], VM: [300, 320], MHT: [415, 320],
  PC: [530, 265],
  XR: [650, 70], CT: [770, 70], MRI: [890, 70], IR: [1010, 70],
  LABC: [650, 165], LABA: [770, 165],
  RC: [1020, 320], TD: [1130, 320],
  PD_VERIFY: [1240, 255], PD_DISP: [1240, 385],
  DH: [1360, 320],
  SUR: [650, 470], OST: [1010, 470],
  CHEMO_PRE: [770, 420], CHEMO_INF: [890, 420],
  RT_SIM: [650, 560], RT_L1: [770, 560], RT_L2: [890, 560], BRA: [1010, 560],
}

const statusColor = {
  flowing: 'var(--ok)',
  building: 'var(--warn)',
  bottleneck: 'var(--crit)',
  idle: 'var(--slate-300)',
}

const impactMeta = {
  high: { label: 'HIGH IMPACT', bg: 'var(--crit-tint)', fg: 'var(--crit)' },
  medium: { label: 'MEDIUM', bg: 'var(--warn-tint)', fg: '#6b4406' },
  low: { label: 'LOW', bg: 'var(--info-tint)', fg: 'var(--info)' },
}

function KpiCard({ label, value, unit, deltaPct, deltaGoodWhenDown = true, sub }) {
  const hasDelta = deltaPct !== null && deltaPct !== undefined && isFinite(deltaPct) && deltaPct !== 0
  const down = deltaPct < 0
  const good = deltaGoodWhenDown ? down : !down
  return (
    <div className="card kpi-card p-3 h-100">
      <div className="df-label mb-2">{label}</div>
      <div className="d-flex align-items-baseline gap-2">
        <span className="font-mono fw-bold" style={{ fontSize: 34, lineHeight: 1, color: 'var(--teal-800)' }}>{value}</span>
        <span className="text-muted small">{unit}</span>
      </div>
      {hasDelta ? (
        <div className="small mt-2 d-flex align-items-center" style={{ color: good ? 'var(--ok)' : 'var(--crit)' }}>
          {down ? <TrendingDown size={14} style={{ marginRight: 4 }} /> : <TrendingUp size={14} style={{ marginRight: 4 }} />}
          {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}% เทียบช่วงก่อนหน้าวันนี้
        </div>
      ) : (
        <div className="small mt-2 text-muted">{sub || 'วัดสดจากระบบ'}</div>
      )}
    </div>
  )
}

function PersonGlyph({ x, y, color }) {
  return (
    <g transform={`translate(${x - 5}, ${y - 7})`}>
      <circle cx="5" cy="2.4" r="2.4" fill={color} />
      <path d="M5 5 L5 9 M5 6 L1.6 8 M5 6 L8.4 8 M5 9 L2.4 13.4 M5 9 L7.6 13.4"
        stroke={color} strokeWidth="1.7" strokeLinecap="round" fill="none" />
    </g>
  )
}

// Small hand-drawn arrow glyph for trend — avoids foreignObject/lucide
// inside the SVG canvas, which doesn't render reliably cross-browser.
function TrendGlyph({ x, y, trend }) {
  if (trend === 'up') {
    return <path d={`M${x - 5} ${y + 3} L${x} ${y - 4} L${x + 5} ${y + 3} Z`} fill="var(--crit)" />
  }
  if (trend === 'down') {
    return <path d={`M${x - 5} ${y - 3} L${x} ${y + 4} L${x + 5} ${y - 3} Z`} fill="var(--ok)" />
  }
  return <rect x={x - 4} y={y - 1} width="8" height="2" rx="1" fill="var(--slate-400)" />
}

export default function FlowBoardPage() {
  const { user } = useAuth()
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [report, setReport] = useState({ station_code: '', severity: 'medium', estimated_wait_min: 20, note: '' })
  const [reporting, setReporting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const wsEvents = useContext(WSContext)
  const toast = useToast()

  const canReport = user?.role === 'manager' || user?.role === 'admin'

  const fetchData = async () => {
    try {
      const res = await api.getFlowBoard()
      setBoard(res.data)
    } catch (err) {
      console.error('Flow board fetch error:', err)
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
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (wsEvents.length > 0) {
      const latest = wsEvents[0]
      if (['QUEUE_UPDATED', 'PATIENT_MOVED', 'STATION_STATUS_UPDATED', 'DASHBOARD_KPI_UPDATED', 'AMIS_RECOMMENDATION_CREATED'].includes(latest.type)) {
        fetchData()
      }
    }
  }, [wsEvents])

  const submitReport = async (e) => {
    e.preventDefault()
    if (!report.station_code) return
    setReporting(true)
    try {
      await api.reportBottleneck({
        station_code: report.station_code,
        severity: report.severity,
        estimated_wait_min: Number(report.estimated_wait_min) || 0,
        note: report.note,
      })
      setShowReport(false)
      setReport({ station_code: '', severity: 'medium', estimated_wait_min: 20, note: '' })
      fetchData()
      toast.success('แจ้งคอขวดสำเร็จ')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setReporting(false)
    }
  }

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (!board) return <div className="p-4"><ErrorState onRetry={fetchData} /></div>

  const stationMap = {}
  board.stations.forEach(s => { stationMap[s.code] = s })
  const edges = board.edges.filter(e => POS[e.from] && POS[e.to])
  const transits = board.transits.filter(t => POS[t.from_station] && POS[t.to_station])
  const k = board.kpis

  const generatedAt = new Date(board.generated_at)
  const staleSec = Math.max(0, Math.round((now - generatedAt.getTime()) / 1000))
  const isStale = staleSec > 30
  const updatedLabel = generatedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="p-4">
      <div className="d-flex justify-content-end mb-2">
        <div className="small d-flex align-items-center" style={{ color: isStale ? 'var(--warn)' : 'var(--slate-400)' }}>
          <Clock size={12} style={{ marginRight: 5 }} />
          อัปเดตเมื่อ {updatedLabel}{isStale && ' · การเชื่อมต่ออาจขัดข้อง'}
        </div>
      </div>

      {/* KPI row */}
      <div className="row g-3 mb-3">
        <div className="col-md-3"><KpiCard label="รอเฉลี่ย · ทุกสถานี" value={k.avg_wait_min} unit="min" deltaPct={k.avg_wait_delta_pct} /></div>
        <div className="col-md-3"><KpiCard label="ในระบบตอนนี้" value={k.patients_in_system} unit="pts" deltaPct={null} /></div>
        <div className="col-md-3"><KpiCard label="เวลารวมในระบบ" value={k.avg_total_min} unit="min" deltaPct={k.avg_total_delta_pct} /></div>
        <div className="col-md-3"><KpiCard label="ภาระงานเจ้าหน้าที่ (GINI)" value={k.gini.toFixed(2)} unit="" deltaPct={k.gini_delta_pct} /></div>
      </div>

      <div className="row g-3">
        {/* Flow canvas */}
        <div className="col-lg-9">
          <div className="card p-3">
            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
              <div className="df-label d-flex align-items-center">
                <Activity size={13} style={{ marginRight: 6, color: 'var(--teal-700)' }} />
                Patient Flow · Live
              </div>
              <div className="d-flex gap-3 small">
                <span className="d-flex align-items-center"><span className="status-dot ok" /> Flowing</span>
                <span className="d-flex align-items-center"><span className="status-dot warn" /> Building</span>
                <span className="d-flex align-items-center"><span className="status-dot crit" /> Bottleneck</span>
                <span className="d-flex align-items-center"><span className="status-dot idle" /> ว่าง</span>
              </div>
            </div>

            <svg viewBox="0 0 1450 640" style={{ width: '100%', height: 'auto', background: 'var(--canvas)', borderRadius: 8 }}>
              {/* grid */}
              {Array.from({ length: 29 }, (_, i) => (
                <line key={`gv${i}`} x1={i * 50} y1={0} x2={i * 50} y2={640} stroke="var(--slate-150)" strokeWidth="1" />
              ))}
              {Array.from({ length: 13 }, (_, i) => (
                <line key={`gh${i}`} x1={0} y1={i * 50} x2={1450} y2={i * 50} stroke="var(--slate-150)" strokeWidth="1" />
              ))}

              {/* edges */}
              {edges.map((e, i) => {
                const [x1, y1] = POS[e.from]
                const [x2, y2] = POS[e.to]
                const toBottleneck = stationMap[e.to]?.status === 'bottleneck'
                return (
                  <line
                    key={`e${i}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={toBottleneck ? 'var(--crit)' : 'var(--slate-300)'}
                    strokeWidth={Math.min(1 + e.count * 0.4, 3)}
                    strokeOpacity={toBottleneck ? 0.55 : 0.6}
                  />
                )
              })}

              {/* walking patients */}
              {transits.map((t, i) => {
                const [x1, y1] = POS[t.from_station]
                const [x2, y2] = POS[t.to_station]
                const frac = 0.5 + (i % 3) * 0.12
                const x = x1 + (x2 - x1) * frac
                const y = y1 + (y2 - y1) * frac
                const c = statusColor[stationMap[t.to_station]?.status] || 'var(--ok)'
                return (
                  <g key={`t${i}`}>
                    <title>{t.display_name} · {t.from_station} → {t.to_station}</title>
                    <PersonGlyph x={x} y={y} color={c === 'var(--slate-300)' ? 'var(--ok)' : c} />
                  </g>
                )
              })}

              {/* station nodes */}
              {board.stations.filter(s => POS[s.code]).map(s => {
                const [x, y] = POS[s.code]
                const c = statusColor[s.status]
                const busy = s.status !== 'idle'
                const measured = s.sample_count > 0
                const waitLabel = measured
                  ? `รอ ${s.waiting} · ~${s.avg_wait_min}น ±${s.wait_band_min}`
                  : `รอ ${s.waiting} · ~${s.estimated_wait_min}น (ประมาณ)`
                return (
                  <g key={s.code} style={{ cursor: 'pointer' }} onClick={() => setSelected(s)}>
                    <title>
                      {s.name} · รอ {s.waiting} · กำลังรับ {s.in_progress}/{s.capacity}
                      {measured ? ` · เฉลี่ยจริง ~${s.avg_wait_min}±${s.wait_band_min} นาที` : ' · ค่าประมาณจากการตั้งค่าสถานี (ยังไม่มีข้อมูลจริงพอ)'}
                      {s.stuck ? ` · ค้างมา ${s.oldest_waiting_min} นาที` : ''}
                    </title>
                    {busy && <circle cx={x} cy={y} r={16} fill="none" stroke={c} strokeOpacity="0.3" strokeWidth="3" />}
                    {s.stuck && <circle cx={x} cy={y} r={16} fill="none" stroke="var(--crit)" strokeWidth="2.5" className="node-stuck" />}
                    <circle cx={x} cy={y} r={9} fill={c} />
                    {s.manual_report && <circle cx={x} cy={y} r={21} fill="none" stroke="var(--crit)" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="4 3" />}
                    {s.trend && s.trend !== 'flat' && <TrendGlyph x={x + 16} y={y - 12} trend={s.trend} />}
                    <text x={x} y={y - 24} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="14" fontWeight="700" fill="var(--ink)">{s.code}</text>
                    <text x={x} y={y + 28} textAnchor="middle" fontSize="11" fill="var(--slate-500)">
                      {s.name.length > 16 ? s.name.slice(0, 15) + '…' : s.name}
                    </text>
                    <text x={x} y={y + 43} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill={s.stuck ? 'var(--crit)' : s.status === 'bottleneck' ? 'var(--crit)' : measured ? 'var(--slate-500)' : 'var(--slate-400)'}>
                      {waitLabel}
                    </text>
                    {s.stuck && (
                      <text x={x} y={y + 56} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="700" fill="var(--crit)">
                        ค้าง {s.oldest_waiting_min} นาที
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>

          {/* legend */}
          <div className="card p-3 mt-3">
            <div className="df-label mb-2 d-flex align-items-center">
              <MinusCircle size={13} style={{ marginRight: 6 }} /> คำอธิบายสัญลักษณ์และสีบนแผนผัง
            </div>
            <div className="row small">
              <div className="col-md-6">
                <div className="text-muted fw-bold mb-1">สถานะสถานี (สีของจุด)</div>
                <div className="d-flex align-items-center mb-1"><span className="status-dot ok" /><b className="me-1">เขียว — ไหลปกติ</b> คิวสั้น รอไม่นาน</div>
                <div className="d-flex align-items-center mb-1"><span className="status-dot warn" /><b className="me-1">เหลือง — เริ่มแน่น</b> คิวเริ่มสะสม ควรเฝ้าดู</div>
                <div className="d-flex align-items-center mb-1"><span className="status-dot crit" /><b className="me-1">แดง — คอขวด</b> คิวยาว รอนาน ต้องแก้ไข</div>
                <div className="d-flex align-items-center"><span className="status-dot idle" /><b className="me-1">เทา — ว่าง</b> ไม่มีคิวในขณะนี้</div>
              </div>
              <div className="col-md-6">
                <div className="text-muted fw-bold mb-1">สัญลักษณ์อื่น</div>
                <div className="mb-1"><b>วงกระเพื่อม</b> — สถานีที่มีคนรอจริงตอนนี้ (สด)</div>
                <div className="mb-1"><b>วงแดงกะพริบ</b> — มีคนค้างรอนานผิดปกติ (Stuck)</div>
                <div className="mb-1"><span style={{ color: 'var(--crit)' }}>▲</span> เวลารอเพิ่มขึ้น &nbsp; <span style={{ color: 'var(--ok)' }}>▼</span> ลดลง &nbsp; เทียบชั่วโมงที่แล้ว</div>
                <div className="mb-1"><b>คนเดิน</b> — ผู้ป่วยกำลังเคลื่อนระหว่างสถานี</div>
                <div className="mb-1"><b>เส้นเชื่อม</b> — เส้นทางที่ผู้ป่วยเดินทางจริงวันนี้ (เส้นแดง = มุ่งสู่คอขวด)</div>
                <div><b>วงประ (แดง)</b> — คอขวดที่ผู้จัดการแจ้งเอง · คลิกจุดเพื่อดูรายละเอียด</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations rail */}
        <div className="col-lg-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="df-label d-flex align-items-center">
              Recommendations
              <span className="badge bg-primary ms-2">{board.recommendations.length}</span>
            </div>
            {canReport && (
              <button className="btn btn-outline-primary btn-sm d-flex align-items-center" onClick={() => setShowReport(true)}>
                <Megaphone size={13} style={{ marginRight: 5 }} /> แจ้งคอขวด
              </button>
            )}
          </div>

          {board.recommendations.length === 0 && (
            <div className="card p-3 text-muted small">ยังไม่มีคำแนะนำในขณะนี้</div>
          )}

          {board.recommendations.map(rec => {
            const meta = impactMeta[rec.impact] || impactMeta.low
            return (
              <div key={rec.id} className="card p-3 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="d-flex align-items-center" style={{ color: 'var(--teal-700)' }}>
                    <span className="d-inline-flex align-items-center justify-content-center me-2" style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--teal-700)' }}>
                      <Sparkles size={14} color="var(--fg-on-brand)" />
                    </span>
                    <span className="df-label" style={{ color: 'var(--teal-700)' }}>DynaFlow Suggests</span>
                  </div>
                  <span className="badge" style={{ background: meta.bg, color: meta.fg, fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '0.06em' }}>
                    {meta.label}
                  </span>
                </div>
                <div className="fw-bold small mb-1" style={{ lineHeight: 1.45 }}>{rec.title}</div>
                <div className="small text-muted" style={{ lineHeight: 1.5 }}>{rec.description}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* station detail drawer */}
      {selected && (
        <>
          <div className="offcanvas offcanvas-end show" style={{ visibility: 'visible' }} tabIndex="-1">
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title d-flex align-items-center">
                <span className="status-dot me-1" style={{ background: statusColor[selected.status] }} />
                {selected.name} <span className="font-mono ms-2 text-muted">({selected.code})</span>
              </h5>
              <button type="button" className="btn-close" onClick={() => setSelected(null)} />
            </div>
            <div className="offcanvas-body small">
              <div className="mb-2 text-muted">{selected.floor} · ความจุ {selected.capacity}</div>
              <div className="mb-1">สถานะ: <b style={{ color: statusColor[selected.status] }}>
                {selected.status === 'bottleneck' ? 'คอขวด' : selected.status === 'building' ? 'เริ่มแน่น' : selected.status === 'flowing' ? 'ไหลปกติ' : 'ว่าง'}
              </b>{selected.manual_report && <span className="badge bg-danger ms-2">แจ้งโดยผู้จัดการ</span>}</div>
              <div className="mb-1">รอในคิว: <b className="font-mono">{selected.waiting}</b> คน</div>
              <div className="mb-1">กำลังรับบริการ: <b className="font-mono">{selected.in_progress}/{selected.capacity}</b></div>
              <div className="mb-1">เวลารอโดยประมาณ (สำหรับคิวถัดไป): <b className="font-mono">{selected.estimated_wait_min}</b> นาที</div>
              <hr />
              {selected.sample_count > 0 ? (
                <>
                  <div className="mb-1">
                    เวลารอเฉลี่ยจริง: <b className="font-mono">{selected.avg_wait_min} ± {selected.wait_band_min}</b> นาที
                    <span className="text-muted"> ({selected.wait_source === 'measured_2h' ? 'ข้อมูล 2 ชม.ล่าสุด' : 'ข้อมูลวันนี้'})</span>
                  </div>
                  <div className="mb-1">เวลาให้บริการเฉลี่ย: <b className="font-mono">{Math.round(selected.avg_service_min || 0)}</b> นาที</div>
                  <div className="mb-1">จำนวนตัวอย่าง: <b className="font-mono">{selected.sample_count}</b> ราย</div>
                </>
              ) : (
                <div className="mb-1 text-muted">ยังไม่มีข้อมูลจริงพอในช่วงนี้ — ใช้ค่าประมาณจากการตั้งค่าสถานี</div>
              )}
              {selected.oldest_waiting_min > 0 && (
                <div className="mb-1">
                  รอมานานที่สุด: <b className="font-mono" style={{ color: selected.stuck ? 'var(--crit)' : 'inherit' }}>{selected.oldest_waiting_min}</b> นาที
                  {selected.stuck && <span className="badge bg-danger ms-2">ค้างผิดปกติ</span>}
                </div>
              )}
              {selected.trend && selected.trend !== 'flat' && (
                <div>แนวโน้ม: <b style={{ color: selected.trend === 'up' ? 'var(--crit)' : 'var(--ok)' }}>
                  {selected.trend === 'up' ? 'เวลารอเพิ่มขึ้น ▲' : 'เวลารอลดลง ▼'}
                </b> เทียบชั่วโมงที่แล้ว</div>
              )}
            </div>
          </div>
          <div className="offcanvas-backdrop show" onClick={() => setSelected(null)} />
        </>
      )}

      {/* manager bottleneck report modal */}
      {showReport && (
        <>
          <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(14,31,30,0.4)' }}>
            <div className="modal-dialog modal-dialog-centered">
              <form className="modal-content" onSubmit={submitReport}>
                <div className="modal-header">
                  <h6 className="modal-title d-flex align-items-center">
                    <Megaphone size={16} style={{ marginRight: 8, color: 'var(--crit)' }} /> แจ้งคอขวด
                  </h6>
                  <button type="button" className="btn-close" onClick={() => setShowReport(false)} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">สถานีที่เป็นคอขวด</label>
                    <select className="form-select" value={report.station_code} required
                      onChange={e => setReport({ ...report, station_code: e.target.value })}>
                      <option value="">— เลือกสถานี —</option>
                      {board.stations.map(s => (
                        <option key={s.code} value={s.code}>{s.code} · {s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="row">
                    <div className="col-6 mb-3">
                      <label className="form-label">ระดับความรุนแรง</label>
                      <select className="form-select" value={report.severity}
                        onChange={e => setReport({ ...report, severity: e.target.value })}>
                        <option value="high">สูง — ต้องแก้ทันที</option>
                        <option value="medium">กลาง — ควรเฝ้าดู</option>
                        <option value="low">ต่ำ — บันทึกไว้</option>
                      </select>
                    </div>
                    <div className="col-6 mb-3">
                      <label className="form-label">รอโดยประมาณ (นาที)</label>
                      <input type="number" min="0" className="form-control" value={report.estimated_wait_min}
                        onChange={e => setReport({ ...report, estimated_wait_min: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">หมายเหตุ (ถ้ามี)</label>
                    <input type="text" className="form-control" placeholder="เช่น เจ้าหน้าที่ไม่พอช่วงเช้า"
                      value={report.note} onChange={e => setReport({ ...report, note: e.target.value })} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setShowReport(false)}>
                    <X size={13} style={{ marginRight: 4 }} /> ยกเลิก
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={reporting}>
                    {reporting ? 'กำลังส่ง...' : 'แจ้งคอขวด'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
