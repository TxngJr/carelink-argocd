'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, Radio, RefreshCw, Route, Users, Wifi, WifiOff } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { Tabs } from '@/components/ui'
import { clientApi } from '@/lib/client'
import { buildLiveFlowEdges, countPatientsByStation, nextStationForPatient } from '@/lib/live-flow-map'
import { stationMap } from '@/lib/stations'
import type { ActivePatientFlow, MapOverview, RealtimeEnvelope, StationFlowStatus } from '@/lib/types'

const STATE_LABEL: Record<StationFlowStatus['state'], string> = {
  flowing: 'ไหลลื่น',
  building: 'เริ่มหนาแน่น',
  bottleneck: 'จุดติดขัด',
  idle: 'ว่างตามแผน',
}
const STATE_COLOR: Record<StationFlowStatus['state'], string> = {
  flowing: '#16836f',
  building: '#c8851a',
  bottleneck: '#c0392b',
  idle: '#64748b',
}

type ConnectionState = 'connecting' | 'live' | 'reconnecting'
type MovementPulse = { from: string; to: string; encounterId: string }
type MovementLog = {
  id: string
  encounterId: string
  patientName: string
  hn: string
  from: string
  to: string
  timestamp: string
}

function clock(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function buildVisualPositions(stations: StationFlowStatus[]) {
  const groups = new Map<string, StationFlowStatus[]>()
  for (const station of stations) {
    const base = stationMap.get(station.code)?.pos || [500, 300]
    const key = `${base[0]}:${base[1]}`
    const group = groups.get(key) || []
    group.push(station)
    groups.set(key, group)
  }

  const positions = new Map<string, [number, number]>()
  for (const group of groups.values()) {
    group.forEach((station, index) => {
      const base = stationMap.get(station.code)?.pos || [500, 300]
      const offset = (index - (group.length - 1) / 2) * 86
      positions.set(station.code, [base[0], Math.max(52, Math.min(488, base[1] + offset))])
    })
  }
  return positions
}

export default function HospitalMapPage() {
  const [data, setData] = useState<MapOverview | null>(null)
  const [active, setActive] = useState<ActivePatientFlow[]>([])
  const [floor, setFloor] = useState('ชั้น 1')
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [movementPulse, setMovementPulse] = useState<MovementPulse | null>(null)
  const [movementLog, setMovementLog] = useState<MovementLog[]>([])

  const activeRef = useRef<ActivePatientFlow[]>([])
  const refreshTimerRef = useRef<number | null>(null)
  const pulseTimerRef = useRef<number | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [overview, patients] = await Promise.all([
        clientApi.getMapOverview(),
        clientApi.getActivePatientFlow(),
      ])
      setData(overview)
      setActive(patients)
      activeRef.current = patients
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลแผนที่การไหลเวียนไม่สำเร็จ')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0)
    const polling = window.setInterval(() => void load(true), 10_000)
    const source = new EventSource('/api/realtime/stream?scope=staff')

    source.onopen = () => setConnection('live')
    source.onerror = () => setConnection('reconnecting')
    source.addEventListener('connected', () => setConnection('live'))
    source.addEventListener('degraded', () => setConnection('reconnecting'))

    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => void load(true), 120)
    }

    const onMoved = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as RealtimeEnvelope
        const payload = envelope.payload as { encounter_id?: string; next_station?: string }
        const encounterId = String(payload?.encounter_id || '')
        const next = String(payload?.next_station || '')
        const previous = activeRef.current.find((row) => row.id === encounterId)
        if (previous && next && previous.current_station && previous.current_station !== next) {
          setMovementPulse({ from: previous.current_station, to: next, encounterId })
          setMovementLog((current) => [{
            id: `${envelope.id}-${previous.current_station}-${next}`,
            encounterId,
            patientName: previous.patient.display_name || 'ผู้ป่วย',
            hn: previous.patient.hn || '—',
            from: previous.current_station,
            to: next,
            timestamp: envelope.timestamp || new Date().toISOString(),
          }, ...current].slice(0, 12))

          if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current)
          pulseTimerRef.current = window.setTimeout(() => setMovementPulse(null), 2600)
        }
      } catch {
        // Event payload may come from an older server version; polling remains the fallback.
      }
      scheduleRefresh()
    }

    source.addEventListener('encounter_moved', onMoved as EventListener)
    for (const eventName of ['queue_updated', 'queue_called', 'queue_started', 'queue_recalled', 'queue_skipped', 'queue_requeued', 'priority_changed', 'demo_reset']) {
      source.addEventListener(eventName, scheduleRefresh)
    }

    return () => {
      window.clearTimeout(initial)
      window.clearInterval(polling)
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current)
      source.close()
    }
  }, [load])

  const stations = useMemo(() => data?.floors.find((row) => row.floor === floor)?.stations || [], [data, floor])
  const stationCodes = useMemo(() => new Set(stations.map((row) => row.code)), [stations])
  const visualPositions = useMemo(() => buildVisualPositions(stations), [stations])
  const patientCounts = useMemo(() => countPatientsByStation(active), [active])
  const liveEdges = useMemo(() => buildLiveFlowEdges(active), [active])
  const floorEdges = useMemo(() => liveEdges.filter((edge) => stationCodes.has(edge.from_station) && stationCodes.has(edge.to_station)), [liveEdges, stationCodes])
  const handoffs = useMemo(() => liveEdges.filter((edge) => stationCodes.has(edge.from_station) !== stationCodes.has(edge.to_station)), [liveEdges, stationCodes])
  const selected = useMemo(() => stations.find((station) => station.code === selectedCode) || null, [selectedCode, stations])
  const selectedPatients = useMemo(() => active.filter((row) => row.current_station === selectedCode), [active, selectedCode])
  const floorPatientCount = useMemo(() => stations.reduce((sum, station) => sum + (patientCounts.get(station.code) || 0), 0), [patientCounts, stations])
  const floorCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of active) {
      const patientFloor = stationMap.get(row.current_station)?.floor
      if (patientFloor) counts.set(patientFloor, (counts.get(patientFloor) || 0) + 1)
    }
    return counts
  }, [active])

  async function manualRefresh() {
    setRefreshing(true)
    await load(true)
    setRefreshing(false)
  }

  const connectionLabel = connection === 'live' ? 'LIVE' : connection === 'connecting' ? 'กำลังเชื่อมต่อ' : 'กำลังเชื่อมต่อใหม่'
  const ConnectionIcon = connection === 'live' ? Wifi : WifiOff

  return <StaffShell role="manager">
    <style>{`
      @keyframes carelink-flow-dash { to { stroke-dashoffset: -28; } }
      @keyframes carelink-move-pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
      .carelink-live-edge { animation: carelink-flow-dash 1.15s linear infinite; }
      .carelink-move-pulse { animation: carelink-move-pulse .55s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .carelink-live-edge, .carelink-move-pulse { animation: none !important; }
      }
    `}</style>
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">REAL-TIME PATIENT FLOW NETWORK</span>
          <h2>แผนที่ผู้ป่วยแบบ Real-time</h2>
          <p>แสดงจำนวนผู้ป่วยที่อยู่ในแต่ละ Station และโยงสายไปยัง Station ถัดไป เมื่อเจ้าหน้าที่จบขั้นตอน ระบบจะย้ายผู้ป่วยไปจุดถัดไปจาก event จริงทันที</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className={`live-indicator ${connection === 'live' ? 'connected' : 'connecting'}`} role="status" aria-live="polite">
            <ConnectionIcon size={15} aria-hidden="true" /> {connectionLabel}
          </span>
          <button className="button secondary" onClick={() => void manualRefresh()} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'spin' : undefined} size={16} aria-hidden="true" /> รีเฟรช
          </button>
        </div>
      </div>

      {error && <div className="inline-alert danger">{error}</div>}

      <section className="queue-summary-grid" aria-label="สรุปการไหลเวียนผู้ป่วยแบบสด">
        <div className="metric-card highlight"><span>ผู้ป่วยอยู่ในระบบ</span><strong>{active.length}</strong><small>คน ณ ขณะนี้</small></div>
        <div className="metric-card"><span>อยู่ที่ {floor}</span><strong>{floorPatientCount}</strong><small>คนใน Station ของชั้นนี้</small></div>
        <div className="metric-card"><span>เส้นทางกำลังไปต่อ</span><strong>{liveEdges.length}</strong><small>คู่ Station ที่มีผู้ป่วย</small></div>
        <div className="metric-card"><span>อัปเดตล่าสุด</span><strong style={{ fontSize: '1.25rem' }}>{clock(data?.generated_at)}</strong><small>{connection === 'live' ? 'SSE + polling สำรอง' : 'polling สำรองทุก 10 วินาที'}</small></div>
      </section>

      <Tabs
        value={floor}
        items={(data?.floors || []).map((row) => ({ id: row.floor, label: `${row.floor} · ${floorCounts.get(row.floor) || 0} คน` }))}
        onChange={(nextFloor) => { setFloor(nextFloor); setSelectedCode('') }}
      />

      <section className="workspace-card">
        <div className="workspace-card-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ marginBottom: 3 }}>{floor} · Live Station Network</h3>
            <small>เส้นประเคลื่อนไหว = เส้นทางถัดไปของผู้ป่วยที่อยู่ในระบบตอนนี้ ไม่ใช่สถิติย้อนหลัง</small>
          </div>
          <span className="count-badge"><Radio size={14} aria-hidden="true" /> {floorPatientCount} คน · {floorEdges.length} สายภายในชั้น</span>
        </div>

        <div style={{ padding: 20 }}>
          {loading && !data ? <div className="empty-state">กำลังโหลดตำแหน่งผู้ป่วย…</div> : <>
            <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid var(--line)' }}>
              <svg viewBox="0 0 1440 540" role="img" aria-label={`ผังผู้ป่วยแบบ Real-time ${floor}`} style={{ width: '100%', minWidth: 920, minHeight: 360, display: 'block', background: '#f8faf9' }}>
                <defs>
                  <marker id="live-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="#4f7d75" />
                  </marker>
                  <marker id="pulse-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="#2563eb" />
                  </marker>
                </defs>

                {floorEdges.map((edge) => {
                  const from = visualPositions.get(edge.from_station)
                  const to = visualPositions.get(edge.to_station)
                  if (!from || !to) return null
                  const dx = to[0] - from[0]
                  const dy = to[1] - from[1]
                  const length = Math.max(1, Math.hypot(dx, dy))
                  const inset = 78
                  const x1 = from[0] + dx / length * inset
                  const y1 = from[1] + dy / length * inset
                  const x2 = to[0] - dx / length * inset
                  const y2 = to[1] - dy / length * inset
                  const midX = (x1 + x2) / 2
                  const midY = (y1 + y2) / 2
                  const pulsing = movementPulse?.from === edge.from_station && movementPulse?.to === edge.to_station
                  return <g key={`${edge.from_station}-${edge.to_station}`}>
                    <line
                      className={pulsing ? 'carelink-live-edge carelink-move-pulse' : 'carelink-live-edge'}
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={pulsing ? '#2563eb' : '#4f7d75'}
                      strokeWidth={Math.min(10, 2.5 + edge.patient_count * 1.4)}
                      strokeDasharray="10 8"
                      markerEnd={`url(#${pulsing ? 'pulse-arrow' : 'live-arrow'})`}
                      opacity={0.88}
                    />
                    <rect x={midX - 31} y={midY - 15} width="62" height="26" rx="13" fill="white" stroke={pulsing ? '#2563eb' : '#a7c4bd'} />
                    <text x={midX} y={midY + 3} textAnchor="middle" fontSize="13" fontWeight="700" fill={pulsing ? '#1d4ed8' : '#315d55'}>{edge.patient_count} คน</text>
                  </g>
                })}

                {stations.map((station) => {
                  const pos = visualPositions.get(station.code) || [500, 300]
                  const population = patientCounts.get(station.code) || 0
                  const isSelected = selectedCode === station.code
                  const isMoveDestination = movementPulse?.to === station.code
                  const fill = station.state === 'bottleneck' ? '#fff7f7' : population > 0 ? '#f1faf7' : 'white'
                  return <g
                    key={station.code}
                    role="button"
                    tabIndex={0}
                    aria-label={`${station.code} ${station.name} มีผู้ป่วย ${population} คน รอ ${station.waiting_count} คน กำลังบริการ ${station.in_progress_count} คน`}
                    onClick={() => setSelectedCode(station.code)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCode(station.code) } }}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  >
                    {isMoveDestination && <rect className="carelink-move-pulse" x={pos[0] - 82} y={pos[1] - 48} width="164" height="96" rx="20" fill="none" stroke="#2563eb" strokeWidth="4" />}
                    <rect x={pos[0] - 74} y={pos[1] - 40} width="148" height="80" rx="16" fill={fill} stroke={STATE_COLOR[station.state]} strokeWidth={isSelected ? 5 : 3} />
                    <text x={pos[0]} y={pos[1] - 16} textAnchor="middle" fontWeight="800" fontSize="15" fill="#173c35">{station.code}</text>
                    <text x={pos[0]} y={pos[1] + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#315d55">ผู้ป่วย {population} คน</text>
                    <text x={pos[0]} y={pos[1] + 25} textAnchor="middle" fontSize="11.5" fill="#64748b">รอ {station.waiting_count} · บริการ {station.in_progress_count}</text>
                    <circle cx={pos[0] + 65} cy={pos[1] - 32} r="16" fill={STATE_COLOR[station.state]} />
                    <text x={pos[0] + 65} y={pos[1] - 27} textAnchor="middle" fontSize="12" fontWeight="800" fill="white">{population}</text>
                  </g>
                })}
              </svg>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
              <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>สถานะ Station:</span>
              {(Object.keys(STATE_LABEL) as Array<StationFlowStatus['state']>).map((state) => <span key={state} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '.82rem' }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 99, background: STATE_COLOR[state] }} />{STATE_LABEL[state]}</span>)}
            </div>
          </>}
        </div>
      </section>

      {handoffs.length > 0 && <section className="workspace-card">
        <div className="workspace-card-head"><h3>การส่งต่อข้ามชั้นที่กำลังเกิดขึ้น</h3><span className="count-badge">{handoffs.reduce((sum, edge) => sum + edge.patient_count, 0)} คน</span></div>
        <div style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {handoffs.map((edge) => {
            const fromFloor = stationMap.get(edge.from_station)?.floor || 'ไม่ทราบชั้น'
            const toFloor = stationMap.get(edge.to_station)?.floor || 'ไม่ทราบชั้น'
            const direction = stationCodes.has(edge.from_station) ? 'ออกจากชั้นนี้' : 'เข้าชั้นนี้'
            return <div key={`${edge.from_station}-${edge.to_station}`} className="inline-alert" style={{ margin: 0, minWidth: 250, flex: '1 1 280px' }}>
              <strong>{edge.from_station} <ArrowRight size={14} style={{ verticalAlign: 'middle' }} /> {edge.to_station}</strong>
              <br /><span>{fromFloor} → {toFloor} · {edge.patient_count} คน · {direction}</span>
            </div>
          })}
        </div>
      </section>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <section className="workspace-card">
          <div className="workspace-card-head"><h3>{selected ? `${selected.code} · ${selected.name}` : 'ผู้ป่วยใน Station'}</h3><span className="count-badge"><Users size={14} /> {selectedPatients.length} คน</span></div>
          <div style={{ padding: 18 }}>
            {!selected ? <div className="empty-state">เลือก Station บนแผนที่เพื่อดูว่ามีผู้ป่วยคนใดอยู่ที่จุดนั้น</div> : selectedPatients.length === 0 ? <div className="empty-state">ขณะนี้ไม่มีผู้ป่วยอยู่ที่ {selected.code}</div> : <div style={{ display: 'grid', gap: 10 }}>
              {selectedPatients.map((row) => {
                const next = nextStationForPatient(row)
                return <div key={row.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 13, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                  <div><strong>{row.patient.display_name || 'ผู้ป่วย'}</strong><small style={{ display: 'block' }}>HN {row.patient.hn || '—'} · คิว {row.queue_no || '—'}</small></div>
                  <div style={{ textAlign: 'right' }}><small>จุดถัดไป</small><strong style={{ display: 'block' }}>{next || 'ปลายทาง'}</strong></div>
                </div>
              })}
            </div>}
          </div>
        </section>

        <section className="workspace-card">
          <div className="workspace-card-head"><h3>การย้าย Station ล่าสุด</h3><span className="count-badge"><Activity size={14} /> Real-time</span></div>
          <div style={{ padding: 18 }}>
            {movementLog.length === 0 ? <div className="empty-state">เมื่อมีผู้ป่วยย้าย Station รายการจะปรากฏที่นี่ทันที</div> : <div style={{ display: 'grid', gap: 10 }}>
              {movementLog.slice(0, 8).map((move) => <div key={move.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                <div><strong>{move.patientName}</strong><small style={{ display: 'block' }}>HN {move.hn} · {move.from} → {move.to}</small></div>
                <small>{clock(move.timestamp)}</small>
              </div>)}
            </div>}
          </div>
        </section>
      </div>

      <section className="workspace-card">
        <div className="workspace-card-head"><h3>ตารางสถานะ Real-time</h3><span className="count-badge"><Route size={14} /> {stations.length} Station</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Station</th><th>ผู้ป่วยอยู่ที่จุดนี้</th><th>สถานะ</th><th>รอ / กำลังบริการ</th><th>กำลังไป Station ถัดไป</th><th>P50 / P80</th></tr></thead><tbody>{stations.map((station) => {
          const outgoing = liveEdges.filter((edge) => edge.from_station === station.code)
          return <tr key={station.code} onClick={() => setSelectedCode(station.code)} style={{ cursor: 'pointer' }}><td><strong>{station.code}</strong><small style={{ display: 'block' }}>{station.name}</small></td><td><strong>{patientCounts.get(station.code) || 0} คน</strong></td><td>{STATE_LABEL[station.state]}</td><td>{station.waiting_count} / {station.in_progress_count}</td><td>{outgoing.length ? outgoing.map((edge) => `${edge.to_station} (${edge.patient_count})`).join(', ') : '—'}</td><td>{station.est_wait_min} / {station.est_wait_p80_min} นาที</td></tr>
        })}</tbody></table></div>
      </section>
    </div>
  </StaffShell>
}
