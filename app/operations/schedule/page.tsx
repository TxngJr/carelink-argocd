'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { clientApi } from '@/lib/client'
import type { FlowScheduleSlot } from '@/lib/types'

function time(value: string) {
  return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

export default function SchedulePage() {
  const [rows, setRows] = useState<FlowScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [station, setStation] = useState('all')
  const [error, setError] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setRows(await clientApi.getFlowSchedule())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดแผนเวลาไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => void load(), 15_000)
    const clock = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.clearInterval(clock) }
  }, [load])

  const stations = useMemo(() => [...new Set(rows.map((row) => row.station_code))].sort(), [rows])
  const filtered = station === 'all' ? rows : rows.filter((row) => row.station_code === station)
  const bounds = useMemo(() => {
    const values = filtered.flatMap((row) => [new Date(row.baseline_start_at).getTime(), new Date(row.adapted_end_at).getTime()]).filter(Number.isFinite)
    const min = values.length ? Math.min(...values) : nowMs
    const max = values.length ? Math.max(...values) : min + 60 * 60_000
    return { min, span: Math.max(30 * 60_000, max - min) }
  }, [filtered, nowMs])
  const position = (value: string) => `${Math.max(0, Math.min(100, (new Date(value).getTime() - bounds.min) / bounds.span * 100))}%`
  const width = (start: string, end: string) => `${Math.max(1.5, (new Date(end).getTime() - new Date(start).getTime()) / bounds.span * 100)}%`
  const nowPosition = (nowMs - bounds.min) / bounds.span * 100

  return <StaffShell role="manager">
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="section-heading">
        <div><span className="eyebrow">แผนตั้งต้นเทียบแผนปรับตามคิว</span><h2>ตารางเวลาแยกตามสถานี</h2><p>เส้นสีเทาคือแผนตั้งต้น แถบสีเขียวคือแผนที่ปรับจากเวลารอ P80 ปัจจุบัน</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select aria-label="กรองสถานี" value={station} onChange={(event) => setStation(event.target.value)}><option value="all">ทุกสถานี</option>{stations.map((code) => <option value={code} key={code}>{code}</option>)}</select>
          <button className="button secondary" onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" /> รีเฟรช</button>
        </div>
      </div>

      {error && <div className="inline-alert danger" role="alert">{error}</div>}
      <section className="workspace-card">
        <div className="workspace-card-head"><div><span className="card-kicker"><CalendarDays size={15} aria-hidden="true" /> เส้นเวลาของผู้ป่วยที่อยู่ในระบบ</span><h3>{filtered.length} ช่วงบริการ</h3></div></div>
        {loading ? <div className="empty-state">กำลังคำนวณแผน…</div> : filtered.length === 0 ? <div className="empty-state">ยังไม่มีผู้ป่วยในระบบสำหรับสร้างแผน</div> : <>
          <div style={{ padding: '0 20px 20px', display: 'grid', gap: 10 }} aria-label="แผนเวลาแบบแผนภูมิแกนต์">
            {filtered.map((row) => <article key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 260px) 1fr', gap: 12, alignItems: 'center' }}>
              <div><strong>{row.station_code} · {row.station_name}</strong><small style={{ display: 'block' }}>{row.patient?.display_name || 'ผู้ป่วย'} · HN {row.patient?.hn || '—'}</small></div>
              <div style={{ height: 48, position: 'relative', borderRadius: 8, background: '#f1f5f4', overflow: 'hidden' }}>
                <span title={`แผนตั้งต้น ${time(row.baseline_start_at)}–${time(row.baseline_end_at)}`} style={{ position: 'absolute', left: position(row.baseline_start_at), width: width(row.baseline_start_at, row.baseline_end_at), top: 8, height: 10, borderRadius: 6, background: '#94a3b8' }} />
                <span title={`แผนปรับ ${time(row.adapted_start_at)}–${time(row.adapted_end_at)}`} style={{ position: 'absolute', left: position(row.adapted_start_at), width: width(row.adapted_start_at, row.adapted_end_at), top: 26, height: 14, borderRadius: 6, background: row.shift_min > 0 ? '#c8851a' : '#16836f' }} />
                {nowPosition >= 0 && nowPosition <= 100 && <span aria-label="เวลาปัจจุบัน" style={{ position: 'absolute', left: `${nowPosition}%`, top: 0, bottom: 0, width: 2, background: '#dc2626' }} />}
              </div>
              <small style={{ gridColumn: '2', color: 'var(--muted)' }}>{time(row.baseline_start_at)} → {time(row.adapted_start_at)} · {row.shift_min > 0 ? `เลื่อน ${row.shift_min} นาที` : 'ตรงตามแผน'} · {row.reason}</small>
            </article>)}
          </div>
          <div className="table-scroll"><table className="data-table" aria-label="ข้อมูลแผนเวลาในรูปแบบตาราง"><thead><tr><th>สถานี</th><th>ผู้ป่วย</th><th>แผนตั้งต้น</th><th>แผนปรับ</th><th>เหตุผล</th></tr></thead><tbody>{filtered.map((row) => <tr key={`table-${row.id}`}><td>{row.station_code}</td><td>{row.patient?.display_name}</td><td>{time(row.baseline_start_at)}–{time(row.baseline_end_at)}</td><td>{time(row.adapted_start_at)}–{time(row.adapted_end_at)}</td><td>{row.reason}</td></tr>)}</tbody></table></div>
        </>}
      </section>
    </div>
  </StaffShell>
}
