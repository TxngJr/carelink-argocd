'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { Tabs } from '@/components/ui'
import { clientApi } from '@/lib/client'
import { stationMap } from '@/lib/stations'
import type { MapOverview, StationFlowStatus } from '@/lib/types'

const STATE_LABEL = { flowing: 'ไหลลื่น', building: 'เริ่มหนาแน่น', bottleneck: 'จุดติดขัด', idle: 'ว่างตามแผน' }
const STATE_COLOR = { flowing: '#16836f', building: '#c8851a', bottleneck: '#c0392b', idle: '#64748b' }

export default function HospitalMapPage() {
  const [data, setData] = useState<MapOverview | null>(null)
  const [floor, setFloor] = useState('ชั้น 1')
  const [selected, setSelected] = useState<StationFlowStatus | null>(null)

  const load = useCallback(() => clientApi.getMapOverview().then(setData), [])
  useEffect(() => { void load() }, [load])
  const stations = useMemo(() => data?.floors.find((row) => row.floor === floor)?.stations || [], [data, floor])
  const stationCodes = useMemo(() => new Set(stations.map((row) => row.code)), [stations])
  const movements = (data?.movements || []).filter((row) => stationCodes.has(row.from_station) && stationCodes.has(row.to_station))

  return <StaffShell role="manager">
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="section-heading"><div><span className="eyebrow">ผังจุดบริการและการเคลื่อนที่</span><h2>แผนที่การไหลเวียนผู้ป่วย</h2><p>เลือกสถานีด้วยเมาส์หรือแป้นพิมพ์ และใช้ตารางด้านล่างเป็นข้อมูลทดแทนผังภาพ</p></div><button className="button secondary" onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" /> รีเฟรช</button></div>
      <Tabs value={floor} items={(data?.floors || []).map((row) => ({ id: row.floor, label: row.floor }))} onChange={setFloor} />

      <section className="workspace-card"><div className="workspace-card-head"><h3>{floor} · {stations.length} สถานี</h3><span className="count-badge">การเคลื่อนที่ 30 นาทีล่าสุด {movements.reduce((sum, row) => sum + row.patient_count, 0)} คน</span></div><div style={{ padding: 20 }}>
        <svg viewBox="0 0 1440 540" role="img" aria-label={`ผังสถานี ${floor}`} style={{ width: '100%', minHeight: 360, background: '#f8faf9', borderRadius: 16 }}>
          {movements.map((movement) => {
            const from = stationMap.get(movement.from_station)?.pos
            const to = stationMap.get(movement.to_station)?.pos
            if (!from || !to) return null
            return <g key={`${movement.from_station}-${movement.to_station}`}><line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#5f8f86" strokeWidth={Math.min(12, 2 + movement.patient_count)} strokeDasharray="8 6" /><text x={(from[0] + to[0]) / 2} y={(from[1] + to[1]) / 2 - 8} textAnchor="middle" fill="#315d55">{movement.patient_count} คน</text></g>
          })}
          {stations.map((station) => {
            const pos = stationMap.get(station.code)?.pos || [500, 300]
            return <g key={station.code} role="button" tabIndex={0} aria-label={`${station.code} ${station.name} ${STATE_LABEL[station.state]} รอ ${station.waiting_count} คน`} onClick={() => setSelected(station)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(station) } }} style={{ cursor: 'pointer', outline: 'none' }}>
              <rect x={pos[0] - 62} y={pos[1] - 30} width="124" height="60" rx="14" fill="white" stroke={STATE_COLOR[station.state]} strokeWidth={selected?.code === station.code ? 5 : 3} />
              <text x={pos[0]} y={pos[1] - 4} textAnchor="middle" fontWeight="700" fill="#173c35">{station.code}</text><text x={pos[0]} y={pos[1] + 16} textAnchor="middle" fontSize="13" fill="#475569">รอ {station.waiting_count} · P80 {station.est_wait_p80_min} น.</text>
            </g>
          })}
        </svg>
        {selected && <div className="inline-alert" role="status"><strong>{selected.code} · {selected.name}</strong> — {STATE_LABEL[selected.state]} · รอ {selected.waiting_count} คน · กำลังบริการ {selected.in_progress_count}/{selected.capacity} · P50/P80 {selected.est_wait_min}/{selected.est_wait_p80_min} นาที</div>}
      </div></section>

      <section className="workspace-card"><div className="workspace-card-head"><h3>ตารางข้อมูลสถานี</h3></div><div className="table-scroll"><table className="data-table"><thead><tr><th>สถานี</th><th>สถานะ</th><th>รอ</th><th>กำลังบริการ / ความจุ</th><th>P50 / P80</th><th>แหล่งประมาณ</th></tr></thead><tbody>{stations.map((station) => <tr key={station.code}><td><strong>{station.code}</strong><small style={{ display: 'block' }}>{station.name}</small></td><td>{STATE_LABEL[station.state]}</td><td>{station.waiting_count}</td><td>{station.in_progress_count} / {station.capacity}</td><td>{station.est_wait_min} / {station.est_wait_p80_min} นาที</td><td>{station.estimate.source === 'history' ? `ประวัติ ${station.estimate.sample_count} ตัวอย่าง` : 'ค่าตั้งต้น'}</td></tr>)}</tbody></table></div></section>
    </div>
  </StaffShell>
}
