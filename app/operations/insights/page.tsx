'use client'

import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { clientApi } from '@/lib/client'
import type { OperationsInsights } from '@/lib/types'

export default function InsightsPage() {
  const [data, setData] = useState<OperationsInsights | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    clientApi.getOperationsInsights().then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลไม่สำเร็จ'))
  }, [])

  const totalCapacity = data?.station_performance.reduce((sum, row) => sum + row.capacity, 0) || 0
  const usedCapacity = data?.station_performance.reduce((sum, row) => sum + row.in_progress_count, 0) || 0
  const utilization = totalCapacity ? Math.round(usedCapacity / totalCapacity * 1000) / 10 : 0

  return <StaffShell role="manager">
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="section-heading"><div><span className="eyebrow">ข้อมูลเชิงปฏิบัติการจากเหตุการณ์จริง</span><h2>ประสิทธิภาพการไหลเวียน</h2><p>ข้อมูลไม่พอจะแสดงเป็นศูนย์หรือสถานะว่าง ไม่มีการเติมค่าตัวอย่างใน KPI</p></div></div>
      {error && <div className="inline-alert danger" role="alert">{error}</div>}
      <div className="queue-summary-grid">
        <div className="metric-card highlight"><span>เวลารวมเฉลี่ย</span><strong>{data?.totals.avg_visit_min ?? '—'}</strong><small>นาทีต่อผู้ป่วยที่เสร็จสิ้น</small></div>
        <div className="metric-card"><span>เวลารอเฉลี่ย</span><strong>{data?.totals.avg_wait_min ?? '—'}</strong><small>นาทีจากคิวที่เริ่มบริการแล้ว</small></div>
        <div className="metric-card"><span>อัตราเสร็จสิ้น</span><strong>{data ? `${data.totals.completion_rate_percent}%` : '—'}</strong><small>{data?.totals.completed || 0} จาก {data?.totals.arrivals || 0} คน</small></div>
        <div className="metric-card"><span>ความจุที่ใช้งานขณะนี้</span><strong>{data ? `${utilization}%` : '—'}</strong><small>{usedCapacity} จาก {totalCapacity} ช่องบริการ</small></div>
      </div>

      <div className="clinical-grid">
        <section className="workspace-card"><div className="workspace-card-head"><h3><BarChart3 size={18} aria-hidden="true" /> ผู้ป่วยเข้าและออกตามชั่วโมง</h3></div><div style={{ padding: '0 20px 24px' }}>
          {!data?.hourly_flow.length ? <div className="empty-state">ยังไม่มีเหตุการณ์เพียงพอในช่วงเวลานี้</div> : <div style={{ display: 'grid', gap: 14 }}>{data.hourly_flow.map((slot) => {
            const scale = Math.max(1, ...data.hourly_flow.flatMap((row) => [row.arrivals, row.discharges]))
            return <div key={slot.hour} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 12, alignItems: 'center' }}><span>{slot.hour}</span><div style={{ display: 'grid', gap: 3 }}><span style={{ height: 8, width: `${slot.arrivals / scale * 100}%`, background: 'var(--brand)', borderRadius: 8 }} /><span style={{ height: 8, width: `${slot.discharges / scale * 100}%`, background: '#59b89e', borderRadius: 8 }} /></div><small>เข้า {slot.arrivals} · ออก {slot.discharges}</small></div>
          })}</div>}
        </div></section>
        <section className="workspace-card"><div className="workspace-card-head"><h3>สถานีที่เวลารอ P80 สูงสุด</h3></div><div style={{ padding: '0 20px 24px', display: 'grid', gap: 10 }}>{[...(data?.station_performance || [])].sort((a, b) => b.est_wait_p80_min - a.est_wait_p80_min).slice(0, 8).map((row) => <div key={row.code} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, borderBottom: '1px solid var(--line)' }}><div><strong>{row.code} · {row.name}</strong><small style={{ display: 'block' }}>{row.estimate.source === 'history' ? `ประวัติจริง ${row.estimate.sample_count} ตัวอย่าง` : `ค่าตั้งต้น · มี ${row.estimate.sample_count}/20 ตัวอย่าง`}</small></div><strong>{row.est_wait_p80_min} นาที</strong></div>)}</div></section>
      </div>
      {data && <small>คำนวณล่าสุด {new Date(data.generated_at).toLocaleString('th-TH')} · ช่วงข้อมูล {new Date(data.from).toLocaleString('th-TH')} ถึง {new Date(data.to).toLocaleString('th-TH')}</small>}
    </div>
  </StaffShell>
}
