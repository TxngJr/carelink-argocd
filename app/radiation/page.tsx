'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Play, Radio, RefreshCw, XCircle } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { clientApi } from '@/lib/client'
import type { RadiationSession } from '@/lib/types'

export default function RadiationPage() {
  const [sessions, setSessions] = useState<RadiationSession[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function loadSchedule() {
    setLoading(true)
    try {
      const data = await clientApi.getRadiationSchedule()
      setSessions(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    clientApi.getRadiationSchedule().then((data) => {
      if (active) {
        setSessions(data)
        setLoading(false)
      }
    }).catch(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function handleArrive(id: string) {
    setBusy(true)
    await clientApi.arriveRadiation(id).catch(() => null)
    setBusy(false)
    await loadSchedule()
  }

  async function handleStart(id: string) {
    setBusy(true)
    await clientApi.startRadiation(id).catch(() => null)
    setBusy(false)
    await loadSchedule()
  }

  async function handleComplete(id: string) {
    setBusy(true)
    await clientApi.completeRadiation(id).catch(() => null)
    setBusy(false)
    await loadSchedule()
  }

  return (
    <StaffShell role="rt_staff" displayName="นักรังสีการแพทย์ อลงกรณ์ (รังสีรักษา)">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">RADIATION ONCOLOGY WORKSPACE</span>
            <h2>ศูนย์รังสีรักษาและเครื่องเร่งอนุภาค (RT_SIM / RT_L1 / RT_L2 / BRA)</h2>
            <p>จัดการคิวฉายรังสี ควบคุมห้องเครื่อง Linac บันทึกปริมาณรังสี (Dose Gy) และติดตามประวัติการรักษา</p>
          </div>
          <button className="button secondary" onClick={() => void loadSchedule()} disabled={loading}>
            <RefreshCw size={16} /> รีเฟรชตารางฉาย
          </button>
        </div>

        <div className="workspace-card">
          <div className="workspace-card-head">
            <h3>ตารางการฉายรังสีประจำวัน (Radiation Treatment Sessions)</h3>
            <span className="count-badge">{sessions.length} รายการ</span>
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            {sessions.length === 0 ? (
              <div className="empty-state">ไม่มีคิวนัดหมายฉายรังสีในขณะนี้</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>เวลานัด</th>
                    <th>ผู้ป่วย (HN)</th>
                    <th>ห้องเครื่อง / เครื่องมือ</th>
                    <th>Fraction / Dose</th>
                    <th>สถานะ</th>
                    <th>การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Clock size={14} color="var(--brand)" />
                          <strong>{new Date(s.scheduled_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</strong>
                        </div>
                      </td>
                      <td>
                        <strong>{s.patient?.display_name || 'ผู้ป่วย'}</strong>
                        <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>HN: {s.patient?.hn || '-'}</div>
                      </td>
                      <td>
                        <span className="status-pill flowing">{s.machine_code} · {s.machine_name}</span>
                      </td>
                      <td>
                        <strong>Fraction {s.fraction_no}/{s.total_fractions}</strong> ({s.dose_gy} Gy)
                      </td>
                      <td>
                        <span className={`status-pill ${s.status === 'arrived' ? 'flowing' : 'building'}`}>
                          {s.status === 'arrived' ? 'ผู้ป่วยมาถึงแล้ว' : s.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {s.status === 'scheduled' && (
                            <button className="button secondary" style={{ minHeight: 32 }} onClick={() => void handleArrive(s.id)} disabled={busy}>
                              ผู้ป่วยมาถึง
                            </button>
                          )}
                          {s.status !== 'in_progress' && (
                            <button className="button warning" style={{ minHeight: 32 }} onClick={() => void handleStart(s.id)} disabled={busy}>
                              เริ่มฉายรังสี
                            </button>
                          )}
                          <button className="button success" style={{ minHeight: 32 }} onClick={() => void handleComplete(s.id)} disabled={busy}>
                            เสร็จสิ้น
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <QueueWorkspace role="nurse" />
      </div>
    </StaffShell>
  )
}
