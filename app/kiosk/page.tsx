'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Clock,
  LogOut,
  MapPin,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react'
import { clientApi } from '@/lib/client'
import type { Journey, Patient } from '@/lib/types'

const INACTIVITY_TIMEOUT_SEC = 90

export default function KioskPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [journey, setJourney] = useState<Journey | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(INACTIVITY_TIMEOUT_SEC)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  function resetSession() {
    setSearchTerm('')
    setPatient(null)
    setJourney(null)
    setError('')
    setCountdown(INACTIVITY_TIMEOUT_SEC)
  }

  // Handle inactivity countdown
  useEffect(() => {
    if (!patient) return

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          resetSession()
          return INACTIVITY_TIMEOUT_SEC
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [patient])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!searchTerm.trim()) return
    setLoading(true)
    setError('')
    try {
      const results = await clientApi.searchPatients(searchTerm.trim())
      if (results && results.length > 0) {
        setPatient(results[0])
        setCountdown(INACTIVITY_TIMEOUT_SEC)
      } else {
        setError('ไม่พบข้อมูลผู้ป่วยด้วยหมายเลขที่ระบุ กรุณาติดต่อเคาน์เตอร์ลงทะเบียน')
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="kiosk-shell">
      <div className="kiosk-card">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/logo-mark.svg" alt="CareLink" width={46} height={46} />
            <div>
              <h2 style={{ margin: 0 }}>ตู้บริการตนเอง CareLink Kiosk</h2>
              <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>ตรวจสอบสถานะคิวและจุดรับบริการ</span>
            </div>
          </div>
          {patient && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>ปิดหน้าต่างอัตโนมัติใน {countdown} วิ</span>
              <button className="button danger-outline" onClick={resetSession} style={{ minHeight: 36, padding: '0 12px' }}>
                <LogOut size={16} /> เสร็จสิ้น
              </button>
            </div>
          )}
        </div>

        {!patient ? (
          /* Search Step */
          <form onSubmit={handleSearch} style={{ display: 'grid', gap: 18 }}>
            <div style={{ padding: '24px', background: '#f5f9f8', borderRadius: 20, textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 8px' }}>กรุณากรอกเบอร์โทรศัพท์ หรือหมายเลข HN</h3>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '.88rem' }}>
                ระบบจะค้นหาและแสดงบัตรคิว เส้นทางการรักษา และเวลารอคอยของคุณ
              </p>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={22} style={{ position: 'absolute', left: 16, top: 16, color: 'var(--muted)' }} />
              <input
                style={{ height: 56, paddingLeft: 50, fontSize: '1.2rem', borderRadius: 16 }}
                type="tel"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="เช่น 0812345678 หรือ HN000101"
                autoFocus
              />
            </div>

            {error && <div className="inline-alert danger">{error}</div>}

            <button className="button primary large" style={{ height: 56, fontSize: '1.15rem' }} disabled={loading}>
              {loading ? 'กำลังค้นหาข้อมูล…' : 'ค้นหาบัตรคิวของฉัน'}
            </button>
          </form>
        ) : (
          /* Ticket Result Step */
          <div style={{ display: 'grid', gap: 20 }}>
            <div className="kiosk-ticket">
              <span className="eyebrow" style={{ color: 'var(--brand)' }}>ACTIVE QUEUE TICKET</span>
              <p style={{ margin: 0, color: 'var(--muted)' }}>ผู้ป่วย: <strong>{patient.display_name}</strong> (HN: {patient.hn})</p>
              <h2>NPR-001</h2>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: '1rem', color: 'var(--ink)' }}>
                <span>สถานีปัจจุบัน: <strong>จุดลงทะเบียน (NPR)</strong></span>
                <span>·</span>
                <span>ชั้น: <strong>ชั้น 1</strong></span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="metric-card">
                <span>คิวข้างหน้าคุณ</span>
                <strong>2 คิว</strong>
                <small>ประมาณ 15 นาที</small>
              </div>
              <div className="metric-card">
                <span>สถานีถัดไป</span>
                <strong style={{ fontSize: '1.1rem' }}>VM · วัดสัญญาณชีพ</strong>
                <small>ชั้น 1 ห้อง 101</small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="button primary large full" onClick={resetSession}>
                พิมพ์บัตรคิว / เสร็จสิ้น
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: '.8rem', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <Link href="/">← กลับหน้าหลัก CareLink</Link>
          <span>ต้องการความช่วยเหลือ กรุณาติดต่อเคาน์เตอร์ประชาสัมพันธ์</span>
        </div>
      </div>
    </div>
  )
}
