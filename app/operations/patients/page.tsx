'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, Search, Users } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { Drawer, Tabs } from '@/components/ui'
import { clientApi } from '@/lib/client'
import { stationMap } from '@/lib/stations'
import type { ActivePatientFlow, Patient } from '@/lib/types'

export default function PatientsPage() {
  const [tab, setTab] = useState<'active' | 'directory'>('active')
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [active, setActive] = useState<ActivePatientFlow[]>([])
  const [selectedActive, setSelectedActive] = useState<ActivePatientFlow | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)

  const loadActive = useCallback(async () => {
    try { setActive(await clientApi.getActivePatientFlow()) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (tab === 'active') {
      void loadActive()
      const timer = window.setInterval(() => void loadActive(), 15_000)
      return () => window.clearInterval(timer)
    }
    const timer = window.setTimeout(() => {
      clientApi.searchPatients(query).then(setPatients).finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [loadActive, query, tab])

  return <StaffShell role="manager">
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="section-heading"><div><span className="eyebrow">ผู้ป่วยและเส้นทางบริการ</span><h2>ผู้ป่วยที่อยู่ในระบบวันนี้และทะเบียนค้นหา</h2><p>ดูสถานีปัจจุบัน เวลารอ P50/P80 ความเร่งด่วน และเส้นทางที่เหลือ</p></div></div>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'active', label: `อยู่ในระบบ (${active.length})`, icon: <Activity size={16} aria-hidden="true" /> },
        { id: 'directory', label: 'ทะเบียนผู้ป่วย', icon: <Users size={16} aria-hidden="true" /> },
      ]} />

      {tab === 'directory' && <div className="workspace-card-head workspace-card"><label style={{ width: 'min(460px, 100%)' }}><span>ค้นหาทะเบียน</span><div style={{ position: 'relative' }}><Search size={17} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 13 }} /><input value={query} onChange={(event) => setQuery(event.target.value)} style={{ paddingLeft: 38 }} placeholder="ชื่อ เบอร์โทร หรือ HN" /></div></label></div>}

      <section className="workspace-card">
        {loading ? <div className="empty-state">กำลังโหลดข้อมูล…</div> : tab === 'active' ? active.length === 0 ? <div className="empty-state">ขณะนี้ยังไม่มีผู้ป่วยอยู่ในระบบ</div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>ผู้ป่วย</th><th>คิว / สถานีปัจจุบัน</th><th>ความเร่งด่วน</th><th>เวลารอ P50 / P80</th><th>เส้นทางที่เหลือ</th><th>รายละเอียด</th></tr></thead><tbody>{active.map((row) => {
          const remaining = row.route.filter((step) => step.status !== 'completed')
          return <tr key={row.id}><td><strong>{row.patient.display_name}</strong><small style={{ display: 'block' }}>HN {row.patient.hn}</small></td><td><strong>{row.queue_no}</strong><small style={{ display: 'block' }}>{row.current_station} · {row.station_name}</small></td><td><span className={`status-pill ${row.priority === 'urgent' ? 'bottleneck' : 'flowing'}`}>{row.priority === 'urgent' ? 'เร่งด่วน' : row.priority === 'fast_track' ? 'ช่องทางด่วน' : 'ปกติ'}</span></td><td>{row.est_wait_min} / {row.est_wait_p80_min} นาที</td><td>{remaining.map((step) => step.station_code).join(' → ') || 'ปลายทาง'}</td><td><button className="button secondary" onClick={() => setSelectedActive(row)}>เปิดรายละเอียด</button></td></tr>
        })}</tbody></table></div> : patients.length === 0 ? <div className="empty-state">ไม่พบทะเบียนที่ตรงกับคำค้น</div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>HN</th><th>ชื่อ-นามสกุล</th><th>โทรศัพท์</th><th>ข้อมูลสิทธิจำลอง</th><th>รายละเอียด</th></tr></thead><tbody>{patients.map((patient) => <tr key={patient.id}><td>{patient.hn}</td><td>{patient.display_name}</td><td>{patient.phone}</td><td>{patient.insurance_type || 'ไม่ระบุ'}</td><td><button className="button secondary" onClick={() => setSelectedPatient(patient)}>เปิดรายละเอียด</button></td></tr>)}</tbody></table></div>}
      </section>

      <Drawer open={Boolean(selectedActive)} title={selectedActive?.patient.display_name || 'รายละเอียดผู้ป่วย'} eyebrow={selectedActive?.encounter_no} onClose={() => setSelectedActive(null)}>
        {selectedActive && <div style={{ display: 'grid', gap: 14 }}><div className="inline-alert"><strong>{selectedActive.queue_no} · {selectedActive.current_station}</strong><br />เวลารอ P50 {selectedActive.est_wait_min} นาที · P80 {selectedActive.est_wait_p80_min} นาที</div><ol>{selectedActive.route.map((step) => <li key={step.id || step.station_code}><strong>{step.station_code} · {stationMap.get(step.station_code)?.name}</strong> — {step.status === 'completed' ? 'เสร็จแล้ว' : step.status === 'in_progress' ? 'กำลังดำเนินการ' : 'รอตามแผน'}</li>)}</ol></div>}
      </Drawer>
      <Drawer open={Boolean(selectedPatient)} title={selectedPatient?.display_name || 'รายละเอียดทะเบียน'} eyebrow={selectedPatient ? `HN ${selectedPatient.hn}` : ''} onClose={() => setSelectedPatient(null)}>
        {selectedPatient && <dl><dt>โทรศัพท์</dt><dd>{selectedPatient.phone}</dd><dt>ข้อมูลสิทธิจำลอง/บันทึกโดยเจ้าหน้าที่</dt><dd>{selectedPatient.insurance_type || 'ไม่ระบุ'}</dd><dt>ประวัติแพ้</dt><dd>{selectedPatient.allergies?.join(', ') || 'ไม่มีข้อมูล'}</dd><dt>โรคประจำตัว</dt><dd>{selectedPatient.chronic_conditions?.join(', ') || 'ไม่มีข้อมูล'}</dd></dl>}
      </Drawer>
    </div>
  </StaffShell>
}
