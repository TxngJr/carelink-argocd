'use client'

import React, { useState } from 'react'
import { CheckCircle2, ClipboardCheck, Search, ShieldCheck, UserCheck, UserPlus } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { clientApi } from '@/lib/client'
import type { Patient } from '@/lib/types'

export default function RegistrationPage() {
  const [activeTab, setActiveTab] = useState<'queue' | 'register' | 'search'>('queue')
  const [hn, setHn] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('1990-01-01')
  const [insurance, setInsurance] = useState('UC (บัตรทอง)')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await clientApi.patientRegister(name, phone, birthDate, 'password123')
      setSuccess(`ลงทะเบียนผู้ป่วยใหม่ ${name} สำเร็จ (รหัสผ่านเริ่มต้น: password123)`)
      setName('')
      setPhone('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ลงทะเบียนไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell role="registration" displayName="เจ้าหน้าที่เวชระเบียนและตรวจสิทธิ">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">REGISTRATION & ELIGIBILITY WORKSPACE</span>
            <h2>จุดลงทะเบียนและตรวจสอบสิทธิการรักษา (NPR / EV)</h2>
            <p>ออกบัตรคิว ตรวจสอบสิทธิ สปสช./ประกันสังคม/กรมบัญชีกลาง และส่งผู้ป่วยไปวัดสัญญาณชีพ (VM)</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`button ${activeTab === 'queue' ? 'primary' : 'ghost'}`} onClick={() => setActiveTab('queue')}>
              จัดการคิวสถานี
            </button>
            <button className={`button ${activeTab === 'register' ? 'primary' : 'ghost'}`} onClick={() => setActiveTab('register')}>
              <UserPlus size={16} /> ลงทะเบียนผู้ป่วยใหม่
            </button>
          </div>
        </div>

        {activeTab === 'queue' ? (
          <QueueWorkspace role="nurse" />
        ) : (
          <div className="workspace-card" style={{ maxWidth: 640 }}>
            <div className="workspace-card-head">
              <h3>ลงทะเบียนประวัติผู้ป่วยใหม่ (New Patient Intake)</h3>
            </div>
            <form style={{ padding: '0 20px 24px', display: 'grid', gap: 14 }} onSubmit={handleRegister}>
              <label>
                <span>ชื่อ-นามสกุล <em>*</em></span>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น นายสมบูรณ์ มั่นคง" />
              </label>

              <div className="form-two">
                <label>
                  <span>เบอร์โทรศัพท์ <em>*</em></span>
                  <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812345678" />
                </label>
                <label>
                  <span>วันเกิด <em>*</em></span>
                  <input type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </label>
              </div>

              <label>
                <span>สิทธิการรักษาพยาบาล</span>
                <select value={insurance} onChange={(e) => setInsurance(e.target.value)}>
                  <option value="UC (บัตรทอง)">UC (หลักประกันสุขภาพแห่งชาติ / บัตรทอง)</option>
                  <option value="SSS (ประกันสังคม)">SSS (กองทุนประกันสังคม)</option>
                  <option value="CSMBS (ข้าราชการ)">CSMBS (สิทธิสวัสดิการข้าราชการ)</option>
                  <option value="Self-Pay (ชำระเงินเอง)">Self-Pay (ชำระเงินเอง)</option>
                </select>
              </label>

              {error && <div className="inline-alert danger">{error}</div>}
              {success && <div className="inline-alert success">{success}</div>}

              <button className="button primary large" disabled={busy}>
                {busy ? 'กำลังบันทึก…' : 'บันทึกและสร้างเวชระเบียน'}
              </button>
            </form>
          </div>
        )}
      </div>
    </StaffShell>
  )
}
