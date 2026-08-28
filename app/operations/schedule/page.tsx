'use client'

import React, { useEffect, useState } from 'react'
import { Calendar, Clock, Plus, Search, User } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { clientApi } from '@/lib/client'
import type { Appointment, RadiationSession } from '@/lib/types'

export default function SchedulePage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [radiationSessions, setRadiationSessions] = useState<RadiationSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'opd' | 'radiation'>('all')

  useEffect(() => {
    Promise.all([
      clientApi.getDoctorRequests().catch(() => []),
      clientApi.getRadiationSchedule().catch(() => []),
    ]).then(([apps, rads]) => {
      setAppointments(apps)
      setRadiationSessions(rads)
      setLoading(false)
    })
  }, [])

  return (
    <StaffShell role="manager">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">MASTER CLINICAL SCHEDULE</span>
            <h2>ตารางนัดหมายรวมทุกแผนก</h2>
            <p>ภาพรวมการนัดหมายผู้ป่วยนอก (OPD), ศูนย์รังสีรักษา, และเคมีบำบัด</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`button ${filter === 'all' ? 'primary' : 'ghost'}`} onClick={() => setFilter('all')}>ทั้งหมด</button>
            <button className={`button ${filter === 'opd' ? 'primary' : 'ghost'}`} onClick={() => setFilter('opd')}>OPD พบแพทย์</button>
            <button className={`button ${filter === 'radiation' ? 'primary' : 'ghost'}`} onClick={() => setFilter('radiation')}>รังสีรักษา (RT)</button>
          </div>
        </div>

        <div className="workspace-card">
          <div className="workspace-card-head">
            <h3>รายการนัดหมายวันนี้และล่วงหน้า</h3>
            <span className="count-badge">
              {(filter !== 'radiation' ? appointments.length : 0) + (filter !== 'opd' ? radiationSessions.length : 0)} รายการ
            </span>
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>เวลานัด</th>
                  <th>ผู้ป่วย (HN)</th>
                  <th>แผนก / บริการ</th>
                  <th>แพทย์ / ผู้รับผิดชอบ</th>
                  <th>อาการ / การรักษา</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filter !== 'radiation' && appointments.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={14} color="var(--brand)" />
                        <strong>{app.appointment_at ? new Date(app.appointment_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'รอยืนยัน'}</strong>
                      </div>
                    </td>
                    <td>
                      <strong>{app.patient?.display_name || 'ผู้ป่วย'}</strong>
                      <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>HN: {app.patient?.hn || '-'} · {app.patient?.phone || '-'}</div>
                    </td>
                    <td>
                      <span className="status-pill flowing">{app.assigned_pc || 'ห้องตรวจแพทย์'}</span>
                    </td>
                    <td>นพ. วรเมธ สถิตย์ธรรม</td>
                    <td>{app.chief_complaint}</td>
                    <td>
                      <span className={`status-pill ${app.status === 'confirmed' ? 'flowing' : 'building'}`}>
                        {app.status === 'confirmed' ? 'ยืนยันแล้ว' : 'รอยืนยัน'}
                      </span>
                    </td>
                  </tr>
                ))}

                {filter !== 'opd' && radiationSessions.map((rad) => (
                  <tr key={rad.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={14} color="var(--info)" />
                        <strong>{new Date(rad.scheduled_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</strong>
                      </div>
                    </td>
                    <td>
                      <strong>{rad.patient?.display_name || 'ผู้ป่วย'}</strong>
                      <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>HN: {rad.patient?.hn || '-'}</div>
                    </td>
                    <td>
                      <span className="status-pill" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
                        {rad.machine_code} ({rad.machine_name})
                      </span>
                    </td>
                    <td>นักรังสี. อลงกรณ์</td>
                    <td>ฉายรังสี Fraction {rad.fraction_no}/{rad.total_fractions} (Dose: {rad.dose_gy} Gy)</td>
                    <td>
                      <span className={`status-pill ${rad.status === 'arrived' ? 'flowing' : 'building'}`}>
                        {rad.status === 'arrived' ? 'มาถึงแล้ว' : rad.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </StaffShell>
  )
}
