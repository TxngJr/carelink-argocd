'use client'

import React, { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Clock, Users, ArrowUpRight, ShieldAlert } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { clientApi } from '@/lib/client'
import type { OperationsSnapshot } from '@/lib/types'

export default function InsightsPage() {
  const [data, setData] = useState<OperationsSnapshot | null>(null)

  useEffect(() => {
    clientApi.getOperationsSnapshot().then(setData).catch(() => null)
  }, [])

  return (
    <StaffShell role="manager">
      <div style={{ display: 'grid', gap: 24 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">OPERATIONS ANALYTICS & INSIGHTS</span>
            <h2>การวิเคราะห์ประสิทธิภาพการไหลเวียนและ SLA</h2>
            <p>ติดตามอัตราการให้บริการเฉลี่ย, เวลารอคอยสะสม, และสถิติการไหลเวียนผู้ป่วยรายชั่วโมง</p>
          </div>
        </div>

        {/* KPI Row */}
        <div className="queue-summary-grid">
          <div className="metric-card highlight">
            <span>เวลารวมทั้งสิ้นเฉลี่ย (Avg TAT)</span>
            <strong>{data?.kpis.avg_total_visit_min || 45}</strong>
            <small>นาทีต่อผู้ป่วย 1 ราย</small>
          </div>
          <div className="metric-card">
            <span>เวลารอคอยเฉลี่ย (Avg Wait Time)</span>
            <strong>{data?.kpis.avg_wait_min || 14}</strong>
            <small>นาที (ตามเกณฑ์มาตรฐาน &lt; 20 นาที)</small>
          </div>
          <div className="metric-card">
            <span>อัตราผ่านเกณฑ์ SLA</span>
            <strong style={{ color: 'var(--ok)' }}>94.2%</strong>
            <small>ผู้ป่วยได้รับบริการตามเวลาเป้าหมาย</small>
          </div>
          <div className="metric-card">
            <span>ความจุที่ใช้งาน (Capacity Utilized)</span>
            <strong>72%</strong>
            <small>จาก 24 สถานีบริการทั้งหมด</small>
          </div>
        </div>

        {/* Hourly Flow Chart & Stations Load */}
        <div className="clinical-grid">
          <div className="workspace-card">
            <div className="workspace-card-head">
              <h3>ปริมาณผู้ป่วยเข้าและออกจากระบบรายชั่วโมง (Hourly Flow)</h3>
              <span className="eyebrow">TODAY</span>
            </div>
            <div style={{ padding: '0 20px 24px' }}>
              <div style={{ display: 'grid', gap: 14 }}>
                {(data?.hourly_flow || []).map((slot) => (
                  <div key={slot.hour} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '.8rem', fontFamily: 'monospace', fontWeight: 600 }}>{slot.hour}</span>
                    <div style={{ height: 18, background: '#eaf4f2', borderRadius: 99, overflow: 'hidden', display: 'flex' }}>
                      <span style={{ width: `${Math.min(100, slot.arrivals * 2.5)}%`, background: 'var(--brand)', display: 'block' }} />
                      <span style={{ width: `${Math.min(100, slot.discharges * 2.5)}%`, background: '#59b89e', display: 'block' }} />
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'flex', gap: 8 }}>
                      <span>เข้า: <strong>{slot.arrivals}</strong></span>
                      <span>ออก: <strong>{slot.discharges}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="workspace-card">
            <div className="workspace-card-head">
              <h3>อันดับสถานีที่มีเวลารอคอยสูงสุด</h3>
            </div>
            <div style={{ padding: '0 20px 24px' }}>
              <div style={{ display: 'grid', gap: 12 }}>
                {[...(data?.stations || [])]
                  .sort((a, b) => b.est_wait_min - a.est_wait_min)
                  .slice(0, 6)
                  .map((st, i) => (
                    <div key={st.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: '#f9fbfb', border: '1px solid var(--line)' }}>
                      <div>
                        <strong>{i + 1}. {st.code} · {st.name}</strong>
                        <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>รอคิว {st.waiting_count} คน · ความจุ {st.capacity}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: st.est_wait_min > 20 ? 'var(--crit)' : 'var(--brand)' }}>{st.est_wait_min} น.</strong>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>เวลารอคอย</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </StaffShell>
  )
}
