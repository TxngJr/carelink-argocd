'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Scale } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { Modal } from '@/components/ui'
import { clientApi } from '@/lib/client'
import type { FlowEngineRecommendation, OperationsSnapshot, StationFlowStatus } from '@/lib/types'

export default function OperationsPage() {
  const [data, setData] = useState<OperationsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStation, setSelectedStation] = useState<StationFlowStatus | null>(null)
  const [bottleneckNote, setBottleneckNote] = useState('')
  const [reporting, setReporting] = useState(false)
  const [canMutate, setCanMutate] = useState(false)
  const [decision, setDecision] = useState<{ recommendation: FlowEngineRecommendation; action: 'accept' | 'reject' } | null>(null)
  const [decisionReason, setDecisionReason] = useState('')

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

  useEffect(() => {
    clientApi.getStaffMe().then((user) => setCanMutate(['admin', 'manager', 'operations'].includes(user.role))).catch(() => setCanMutate(false))
  }, [])

  async function handleDecision() {
    if (!decision || decisionReason.trim().length < 3) return
    const { recommendation, action } = decision
    if (action === 'accept') await clientApi.acceptRecommendation(recommendation.id, recommendation.version || 1, decisionReason)
    else await clientApi.rejectRecommendation(recommendation.id, recommendation.version || 1, decisionReason)
    setDecision(null)
    setDecisionReason('')
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
        {error && <div className="inline-alert danger" role="alert">{error}</div>}
        <div className="queue-summary-grid">
          <div className="metric-card highlight">
            <span>ผู้ป่วยรับบริการสะสมวันนี้</span>
            <strong>{data?.kpis.total_patients_today || 0}</strong>
            <small>กำลังอยู่ในระบบ: {data?.kpis.active_now || 0} คน</small>
          </div>
          <div className="metric-card">
            <span>เสร็จสิ้นการรับบริการ</span>
            <strong>{data?.kpis.completed_today || 0}</strong>
            <small>คน</small>
          </div>
          <div className="metric-card">
            <span>เวลารอคอยเฉลี่ย</span>
            <strong>{data?.kpis.avg_wait_min || 0}</strong>
            <small>นาทีต่อสถานี</small>
          </div>
          <div className="metric-card">
            <span>จุดติดขัด</span>
            <strong style={{ color: (data?.kpis.bottleneck_station_count || 0) > 0 ? 'var(--crit)' : 'inherit' }}>
              {data?.kpis.bottleneck_station_count || 0}
            </strong>
            <small>สถานีที่ผู้ป่วยเกินความจุ</small>
          </div>
        </div>

        {data?.recommendations && data.recommendations.length > 0 && (
          <section className="workspace-card" style={{ borderLeft: '5px solid #c8851a' }}>
            <div className="workspace-card-head" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Scale color="#c8851a" size={22} aria-hidden="true" />
                <div>
                  <span className="eyebrow" style={{ color: '#c8851a' }}>เครื่องมือช่วยตัดสินใจจากข้อมูลคิว</span>
                  <h3 style={{ margin: '2px 0 0' }}>ข้อเสนอปรับสมดุลการไหลเวียน ({data.recommendations.length} รายการ)</h3>
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
                  {canMutate && <div style={{ display: 'flex', gap: 8 }}>
                    <button className="button success" onClick={() => setDecision({ recommendation: rec, action: 'accept' })}>
                      {rec.action_label || 'ดำเนินการตามคำแนะนำ'}
                    </button>
                    <button className="button danger-outline" onClick={() => setDecision({ recommendation: rec, action: 'reject' })}>
                      ปฏิเสธ
                    </button>
                  </div>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="workspace-card">
          <div className="workspace-card-head">
            <div>
              <span className="eyebrow">สถานะจุดบริการล่าสุด</span>
              <h2>ผังสถานะความหนาแน่น {data?.stations.length || 0} สถานีบริการ</h2>
              <p>เกณฑ์เดียวกันทุกหน้า: ไหลลื่น / เริ่มหนาแน่น / จุดติดขัด / ว่างตามแผน</p>
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
                  onClick={() => canMutate && setSelectedStation(station)}
                  style={{ cursor: canMutate ? 'pointer' : 'default' }}
                >
                  <div className="station-tile-head">
                    <div>
                      <strong>{station.code}</strong>
                      <p style={{ margin: '2px 0 0', fontSize: '.82rem', fontWeight: 600 }}>{station.name}</p>
                      <span>{station.floor}</span>
                    </div>
                    <span className={`status-pill ${station.state}`}>
                      {station.state === 'bottleneck' ? 'จุดติดขัด' : station.state === 'building' ? 'เริ่มหนาแน่น' : station.state === 'flowing' ? 'ไหลลื่น' : 'ว่างตามแผน'}
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
                      <span>เวลารอ P50 / P80</span>
                      <strong>{station.est_wait_min} / {station.est_wait_p80_min} นาที</strong>
                    </div>
                    <div>
                      <span>บริการเสร็จใน 1 ชม.</span>
                      <strong>{station.throughput_per_hour}/ชม.</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <Modal open={Boolean(selectedStation)} title={selectedStation ? `รายงานสถานะ ${selectedStation.name} (${selectedStation.code})` : 'รายงานสถานะ'} onClose={() => setSelectedStation(null)} actions={<><button className="button ghost" onClick={() => setSelectedStation(null)}>ยกเลิก</button><button className="button warning" onClick={() => void handleReportBottleneck()} disabled={reporting}>{reporting ? 'กำลังส่งรายงาน…' : 'ส่งรายงานจุดติดขัด'}</button></>}>
          {selectedStation && <><p>ผู้ป่วยรอ {selectedStation.waiting_count} คน · ความจุ {selectedStation.capacity} คน · P80 {selectedStation.est_wait_p80_min} นาที</p><label><span>เหตุผล/ข้อความถึงทีมศูนย์ปฏิบัติการ</span><textarea rows={3} value={bottleneckNote} onChange={(event) => setBottleneckNote(event.target.value)} placeholder="เช่น ผู้ป่วยเริ่มสะสมเกินเกณฑ์ ขอเปิดจุดบริการเพิ่ม" /></label></>}
        </Modal>

        <p className="inline-alert" role="status">
          คำนวณล่าสุด {data?.generated_at ? new Date(data.generated_at).toLocaleString('th-TH') : '—'} · หน้าต่างข้อมูลย้อนหลัง {data?.data_window.days || 30} วัน ·
          แต่ละสถานีใช้ประวัติจริงเมื่อมีอย่างน้อย 20 ตัวอย่าง มิฉะนั้นใช้ค่าตั้งต้นที่กำหนดไว้
        </p>

        <Modal
          open={Boolean(decision)}
          title={decision?.action === 'accept' ? 'ยืนยันดำเนินการตามข้อเสนอ' : 'ยืนยันปฏิเสธข้อเสนอ'}
          onClose={() => { setDecision(null); setDecisionReason('') }}
          actions={<>
            <button className="button ghost" onClick={() => setDecision(null)}>ยกเลิก</button>
            <button className="button primary" disabled={decisionReason.trim().length < 3} onClick={() => void handleDecision()}>บันทึกการตัดสินใจ</button>
          </>}
        >
          <p>{decision?.recommendation.title}</p>
          <label><span>เหตุผลของผู้ดำเนินการ <em>*</em></span><textarea rows={3} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} /></label>
          <small>ระบบจะบันทึกผู้ดำเนินการ เวลา เหตุผล และ version เพื่อการตรวจสอบย้อนหลัง</small>
        </Modal>
      </div>
    </StaffShell>
  )
}
