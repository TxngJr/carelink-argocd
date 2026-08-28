'use client'

import React, { useEffect, useState } from 'react'
import { Search, User, FileText, Phone, MapPin, Activity, ShieldCheck, X } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { clientApi } from '@/lib/client'
import type { Patient } from '@/lib/types'

export default function PatientsPage() {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Patient | null>(null)

  useEffect(() => {
    clientApi.searchPatients(query).then((res) => {
      setPatients(res)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [query])

  return (
    <StaffShell role="manager">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">PATIENTS DIRECTORY</span>
            <h2>ทะเบียนประวัติผู้ป่วย</h2>
            <p>ค้นหาและตรวจสอบเวชระเบียน สิทธิการรักษา และประวัติการรับบริการ</p>
          </div>
        </div>

        <div className="workspace-card">
          <div className="workspace-card-head" style={{ gap: 14 }}>
            <div style={{ position: 'relative', width: 'min(420px, 100%)' }}>
              <Search size={18} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--muted)' }} />
              <input
                style={{ paddingLeft: 38 }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาด้วยชื่อ, นามสกุล, เบอร์โทร หรือ HN..."
              />
            </div>
            <span className="count-badge">{patients.length} รายการ</span>
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>HN</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>เพศ / อายุ</th>
                  <th>เบอร์โทรศัพท์</th>
                  <th>สิทธิการรักษา</th>
                  <th>ประวัติแพ้ยา</th>
                  <th>การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id || p.hn}>
                    <td><strong style={{ fontFamily: 'monospace' }}>{p.hn}</strong></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="avatar small">{p.display_name.slice(0, 1)}</div>
                        <div>
                          <strong>{p.display_name}</strong>
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{p.province || 'กรุงเทพมหานคร'}</div>
                        </div>
                      </div>
                    </td>
                    <td>{p.gender || '-'} / {p.age || '-'} ปี</td>
                    <td>{p.phone}</td>
                    <td>
                      <span className="status-pill flowing">{p.insurance_type || 'UC (บัตรทอง)'}</span>
                    </td>
                    <td>
                      {p.allergies && p.allergies.length > 0 ? (
                        <span className="status-pill bottleneck">{p.allergies.join(', ')}</span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '.78rem' }}>ไม่มีประวัติแพ้</span>
                      )}
                    </td>
                    <td>
                      <button className="button secondary" style={{ minHeight: 34, padding: '0 12px', fontSize: '.8rem' }} onClick={() => setSelected(p)}>
                        ดูประวัติ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Patient Detail Drawer */}
        {selected && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
            <div className="workspace-card" style={{ width: 'min(600px, 92%)', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="avatar">{selected.display_name.slice(0, 1)}</div>
                  <div>
                    <h3 style={{ margin: 0 }}>{selected.display_name}</h3>
                    <p style={{ margin: 0, fontSize: '.8rem', color: 'var(--muted)' }}>HN: {selected.hn} · โทร {selected.phone}</p>
                  </div>
                </div>
                <button className="icon-button" onClick={() => setSelected(null)}><X size={18} /></button>
              </div>

              <div style={{ display: 'grid', gap: 12, fontSize: '.85rem' }}>
                <div style={{ padding: 12, background: '#f8faf9', borderRadius: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><span>วันเกิด:</span> <strong>{selected.birth_date ? new Date(selected.birth_date).toLocaleDateString('th-TH') : '-'}</strong></div>
                  <div><span>อายุ:</span> <strong>{selected.age || '-'} ปี</strong></div>
                  <div><span>สิทธิการรักษา:</span> <strong>{selected.insurance_type || '-'}</strong></div>
                  <div><span>สถานะสิทธิ:</span> <strong style={{ color: 'var(--ok)' }}>{selected.eligibility_status || 'พร้อมใช้งาน'}</strong></div>
                </div>

                <div>
                  <strong>ประวัติแพ้ยา / อาหาร:</strong>
                  <p style={{ margin: '4px 0 0', color: selected.allergies?.length ? 'var(--danger)' : 'var(--muted)' }}>
                    {selected.allergies?.length ? selected.allergies.join(', ') : 'ไม่มีประวัติแพ้ยาหรืออาหาร'}
                  </p>
                </div>

                <div>
                  <strong>โรคประจำตัวเรื้อรัง:</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--ink)' }}>
                    {selected.chronic_conditions?.length ? selected.chronic_conditions.join(', ') : 'ไม่มีโรคประจำตัว'}
                  </p>
                </div>
              </div>

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="button primary" onClick={() => setSelected(null)}>ปิดหน้าต่าง</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </StaffShell>
  )
}
