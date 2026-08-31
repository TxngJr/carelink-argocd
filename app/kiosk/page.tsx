'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LogOut, Search, ShieldCheck } from 'lucide-react'
import { clientApi } from '@/lib/client'
import type { Journey, Patient } from '@/lib/types'

const INACTIVITY_TIMEOUT_SEC = 90

export default function KioskPage() {
  const [identifier, setIdentifier] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [patient, setPatient] = useState<Pick<Patient, 'display_name' | 'hn'> | null>(null)
  const [journey, setJourney] = useState<Journey | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(INACTIVITY_TIMEOUT_SEC)

  const resetSession = useCallback(() => {
    setIdentifier('')
    setBirthDate('')
    setPatient(null)
    setJourney(null)
    setError('')
    setCountdown(INACTIVITY_TIMEOUT_SEC)
  }, [])

  const lookup = useCallback(async () => {
    if (!identifier.trim() || !birthDate) return
    const result = await clientApi.getKioskJourney(identifier.trim(), birthDate)
    setPatient(result.patient)
    setJourney(result.journey)
    setCountdown(INACTIVITY_TIMEOUT_SEC)
  }, [birthDate, identifier])

  useEffect(() => {
    if (!patient) return
    const interval = window.setInterval(() => setCountdown((previous) => {
      if (previous <= 1) { resetSession(); return INACTIVITY_TIMEOUT_SEC }
      return previous - 1
    }), 1000)
    return () => window.clearInterval(interval)
  }, [patient, resetSession])

  useEffect(() => {
    if (!patient) return
    const source = new EventSource('/api/realtime/stream?scope=public')
    const refresh = () => void lookup().catch(() => undefined)
    source.addEventListener('queue_updated', refresh)
    source.addEventListener('queue_called', refresh)
    return () => source.close()
  }, [lookup, patient])

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try { await lookup() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ค้นหาข้อมูลไม่สำเร็จ กรุณาลองใหม่') }
    finally { setLoading(false) }
  }

  return <div className="kiosk-shell"><div className="kiosk-card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Image src="/logo-mark.svg" alt="CareLink" width={46} height={46} priority /><div><h2 style={{ margin: 0 }}>ตู้บริการตนเอง CareLink</h2><span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>ตรวจสอบสถานะคิวด้วยข้อมูลที่ตรงกันเท่านั้น</span></div></div>{patient && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span>ปิดอัตโนมัติใน {countdown} วินาที</span><button className="button danger-outline" onClick={resetSession}><LogOut size={16} aria-hidden="true" /> เสร็จสิ้น</button></div>}</div>

    {!patient ? <form onSubmit={handleSearch} style={{ display: 'grid', gap: 18 }}><div style={{ padding: 24, background: '#f5f9f8', borderRadius: 20, textAlign: 'center' }}><ShieldCheck size={30} aria-hidden="true" /><h3>กรอก HN หรือเบอร์โทร และวันเกิด</h3><p>ระบบค้นหาแบบตรงกันทุกตัวอักษร ไม่มีการค้นหาชื่อหรือข้อมูลใกล้เคียง</p></div><label><span>HN หรือเบอร์โทร <em>*</em></span><div style={{ position: 'relative' }}><Search size={20} aria-hidden="true" style={{ position: 'absolute', left: 16, top: 17 }} /><input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} style={{ height: 56, paddingLeft: 50 }} placeholder="HN000101 หรือ 0812345678" autoFocus /></div></label><label><span>วันเกิด <em>*</em></span><input required type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>{error && <div className="inline-alert danger" role="alert">{error}</div>}<button className="button primary large" disabled={loading}>{loading ? 'กำลังตรวจสอบ…' : 'ตรวจสอบบัตรคิว'}</button></form> : <div style={{ display: 'grid', gap: 20 }}><div className="kiosk-ticket"><span className="eyebrow">บัตรคิวปัจจุบัน</span><p>ผู้ป่วย: <strong>{patient.display_name}</strong> · HN {patient.hn}</p>{journey ? <><h2>{journey.queue_no || '—'}</h2><p>สถานีปัจจุบัน: <strong>{journey.current_station} · {journey.station_name}</strong> · {journey.station_floor}</p></> : <div className="empty-state">ยังไม่มี visit ที่กำลังดำเนินการ</div>}</div>{journey && <div className="queue-summary-grid"><div className="metric-card"><span>คิวข้างหน้า</span><strong>{journey.queue_ahead || 0}</strong><small>ประมาณ {journey.est_wait_min || 0} นาที</small></div><div className="metric-card"><span>สถานีถัดไป</span><strong>{journey.next_station || 'ปลายทาง'}</strong><small>{journey.next_station_name || 'ไม่มีสถานีถัดไป'}</small></div></div>}<button className="button primary large full" onClick={resetSession}>เสร็จสิ้นและล้างข้อมูลหน้าจอ</button></div>}
    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 14 }}><Link href="/">กลับหน้าหลัก CareLink</Link><span>ข้อมูลทั้งหมดเป็นข้อมูลสังเคราะห์สำหรับระบบสาธิต</span></div>
  </div></div>
}
