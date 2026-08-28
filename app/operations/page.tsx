'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  PlusCircle,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { clientApi } from '@/lib/client'
import type { FlowEngineRecommendation, OperationsSnapshot, StationFlowStatus } from '@/lib/types'

export default function OperationsPage() {
  const [data, setData] = useState<OperationsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStation, setSelectedStation] = useState<StationFlowStatus | null>(null)
  const [bottleneckNote, setBottleneckNote] = useState('')
  const [reporting, setReporting] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const snap = await clientApi.getOperationsSnapshot()
      setData(snap)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลศูนย์ปฏิบัติการไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    clientApi.getOperationsSnapshot().then((snap) => {
      if (active) {
        setData(snap)
        setLoading(false)
      }
    }).catch((err) => {
      if (active) {
        setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ')
        setLoading(false)
      }
    })
    const timer = setInterval(() => {
      clientApi.getOperationsSnapshot().then((snap) => {
        if (active) setData(snap)
      }).catch(() => null)
    }, 8000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  async function handleAccept(rec: FlowEngineRecommendation) {
    await clientApi.acceptRecommendation(rec.id).catch(() => null)
    await loadData()
  }

  async function handleReject(rec: FlowEngineRecommendation) {
    await clientApi.rejectRecommendation(rec.id).catch(() => null)
    await loadData()
  }

  async function handleReportBottleneck() {
    if (!selectedStation) return
    setReporting(true)
    try {
      await clientApi.reportBottleneck(selectedStation.code, bottleneckNote)
      setBottleneckNote('')
      setSelectedStation(null)
      await loadData()
    } finally {
      setReporting(false)
    }
  }

  return (
    <StaffShell role="manager" displayName="ผู้จัดการระบบการไหลเวียน">
      <div className="flowboard-container">
        {/* KPI Header Grid */}
        <div className="queue-summary-grid">
          <div className="metric-card highlight">
            <span>ผู้ป่วยรับบริการสะสมวันนี้</span>
            <strong>{data?.kpis.total_patients_today || 0}</strong>
            <small>Active ในระบบ: {data?.kpis.active_now || 0} คน</small>
          </div>
          <div className="metric-card">
            <span>เสร็จสิ้นการรักษา (Discharged)</span>
            <strong>{data?.kpis.completed_today || 0}</strong>
            <small>คน</small>
          </div>
          <div className="metric-card">
            <span>เวลารอคอยเฉลี่ย (Avg Wait)</span>
            <strong>{data?.kpis.avg_wait_min || 0}</strong>
            <small>นาทีต่อสถานี</small>
          </div>
          <div className="metric-card">
            <span>จุดที่มีภาวะคอขวด (Bottlenecks)</span>
            <strong style={{ color: (data?.kpis.bottleneck_station_count || 0) > 0 ? 'var(--crit)' : 'inherit' }}>
              {data?.kpis.bottleneck_station_count || 0}
            </strong>
            <small>สถานีที่ผู้ป่วยเกินความจุ</small>
          </div>
        </div>

        {/* AI Recommendations Drawer / Banner */}
        {data?.recommendations && data.recommendations.length > 0 && (
          <section className="workspace-card" style={{ borderLeft: '5px solid #c8851a' }}>
            <div className="workspace-card-head" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Sparkles color="#c8851a" size={22} />
                <div>
                  <span className="eyebrow" style={{ color: '#c8851a' }}>AMIS FLOW ENGINE RECOMMENDATIONS</span>
                  <h3 style={{ margin: '2px 0 0' }}>คำแนะนำปรับสมดุลการไหลเวียน ({data.recommendations.length} รายการ)</h3>
                </div>
              </div>
            </div>
            <div style={{ padding: '0 20px 18px', display: 'grid', gap: 10 }}>
              {data.recommendations.map((rec) => (
                <div
                  key={rec.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 14,
                    borderRadius: 12,
                    background: '#fffcf5',
                    border: '1px solid #f2dfb8',
                  }}
                >
                  <div>
                    <strong style={{ color: '#684507' }}>{rec.title}</strong>
                    <p style={{ margin: '3px 0 0', fontSize: '.82rem', color: '#825c1b' }}>{rec.reason}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="button success" onClick={() => void handleAccept(rec)}>
                      {rec.action_label || 'ดำเนินการตามคำแนะนำ'}
                    </button>
                    <button className="button danger-outline" onClick={() => void handleReject(rec)}>
                      ปฏิเสธ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 24 Stations Spatial / Grid Overview */}
        <section className="workspace-card">
          <div className="workspace-card-head">
            <div>
              <span className="eyebrow">LIVE SPATIAL HOSPITAL BOARD</span>
              <h2>ผังสถานะความหนาแน่น 24 สถานีบริการ</h2>
              <p>ตรวจจับและแสดงสถานะ Flow อัตโนมัติ: Flowing (เขียว) / Building (ส้ม) / Bottleneck (แดง)</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button secondary" onClick={() => void loadData()} disabled={loading}>
                <RefreshCw size={16} /> รีเฟรชข้อมูล
              </button>
            </div>
          </div>

          <div style={{ padding: '0 20px 24px' }}>
            <div className="flowboard-grid">
              {(data?.stations || []).map((station) => (
                <article
                  key={station.code}
                  className={`station-flow-tile ${station.state}`}
                  onClick={() => setSelectedStation(station)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="station-tile-head">
                    <div>
                      <strong>{station.code}</strong>
                      <p style={{ margin: '2px 0 0', fontSize: '.82rem', fontWeight: 600 }}>{station.name}</p>
                      <span>{station.floor}</span>
                    </div>
                    <span className={`status-pill ${station.state}`}>
                      {station.state === 'bottleneck' ? 'คอขวด' : station.state === 'building' ? 'สะสม' : station.state === 'flowing' ? 'คล่องตัว' : 'ว่าง'}
                    </span>
                  </div>

                  <div className="station-tile-metrics">
                    <div>
                      <span>กำลังรอคิว</span>
                      <strong>{station.waiting_count} คน</strong>
                    </div>
                    <div>
                      <span>กำลังบริการ</span>
                      <strong>{station.in_progress_count}/{station.capacity}</strong>
                    </div>
                    <div>
                      <span>เวลารอประมาณ</span>
                      <strong>{station.est_wait_min} นาที</strong>
                    </div>
                    <div>
                      <span>Throughput</span>
                      <strong>{station.throughput_per_hour}/ชม.</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Bottleneck Report Modal */}
        {selectedStation && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.45)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 100,
              backdropFilter: 'blur(4px)',
            }}
          >
            <div className="workspace-card" style={{ width: 'min(500px, 90%)', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3>รายงานสถานะ / ขอความช่วยเหลือ: {selectedStation.name} ({selectedStation.code})</h3>
                <button className="icon-button" onClick={() => setSelectedStation(null)}><X size={18} /></button>
              </div>
              <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
                ผู้ป่วยรอ: {selectedStation.waiting_count} คน · ความจุ: {selectedStation.capacity} คน · เวลารอ: {selectedStation.est_wait_min} นาที
              </p>
              <label style={{ margin: '14px 0' }}>
                <span>ข้อความแจ้งทีมศูนย์ปฏิบัติการ</span>
                <textarea
                  rows={3}
                  value={bottleneckNote}
                  onChange={(e) => setBottleneckNote(e.target.value)}
                  placeholder="เช่น ผู้ป่วยเริ่มสะสมเกินเกณฑ์ ขอพยาบาลช่วยเปิดโต๊ะคัดกรองเพิ่ม"
                />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="button ghost" onClick={() => setSelectedStation(null)}>ยกเลิก</button>
                <button className="button warning" onClick={() => void handleReportBottleneck()} disabled={reporting}>
                  {reporting ? 'กำลังส่งรายงาน…' : 'ส่งรายงานคอขวด'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </StaffShell>
  )
}
