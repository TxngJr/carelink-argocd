'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, CalendarClock, DoorOpen, IdCard, RefreshCw, Search, UserCheck, X } from 'lucide-react'
import { clientApi } from '@/lib/client'
import type { Appointment } from '@/lib/types'

type Tab = 'requests' | 'arrivals'

function toDateTimeLocal(date = new Date(Date.now() + 30 * 60_000)) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function thaiDate(value?: string) {
  if (!value) return 'ยังไม่กำหนด'
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function matches(row: Appointment, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.patient?.display_name, row.patient?.hn, row.patient?.phone, row.chief_complaint]
    .some((value) => String(value || '').toLowerCase().includes(q))
}

function RequestCard({ row, onDone }: { row: Appointment; onDone: () => Promise<void> }) {
  const [appointmentAt, setAppointmentAt] = useState(toDateTimeLocal())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function propose() {
    if (!appointmentAt) return
    setBusy(true)
    setError('')
    try {
      await clientApi.proposeAppointment(row.id, {
        appointment_at: new Date(appointmentAt).toISOString(),
        note,
      })
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เสนอวันนัดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="workspace-card" style={{ padding: 20, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="avatar small">{(row.patient?.display_name || 'ผ').slice(0, 1)}</span>
          <div><h3 style={{ margin: 0 }}>{row.patient?.display_name || 'ผู้ป่วย'}</h3><small>HN {row.patient?.hn || '—'}{row.patient?.phone ? ` · ${row.patient.phone}` : ''}</small></div>
        </div>
        <span className="status-pill waiting">คำขอใหม่</span>
      </div>

      <div className="inline-alert"><strong>อาการสำคัญ</strong><br />{row.chief_complaint || 'ไม่ระบุอาการสำคัญ'}</div>

      <div className="form-two">
        <label>
          <span>วันและเวลาที่เสนอ</span>
          <input type="datetime-local" value={appointmentAt} onChange={(event) => setAppointmentAt(event.target.value)} />
        </label>
        <label>
          <span>หมายเหตุพยาบาล</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ข้อมูลที่แพทย์ควรทราบ (ถ้ามี)" />
        </label>
      </div>

      {error && <div className="inline-alert danger">{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="button primary" disabled={busy || !appointmentAt} onClick={() => void propose()}>
          <CalendarCheck2 size={16} /> {busy ? 'กำลังบันทึก…' : 'เสนอวันนัดให้แพทย์'}
        </button>
      </div>
    </article>
  )
}

function ArrivalCard({ row, onDone }: { row: Appointment; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function checkIn() {
    setBusy(true)
    setError('')
    try {
      await clientApi.confirmCheckIn(row.id)
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เช็กอินไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="workspace-card" style={{ padding: 20, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="avatar small">{(row.patient?.display_name || 'ผ').slice(0, 1)}</span>
          <div><h3 style={{ margin: 0 }}>{row.patient?.display_name || 'ผู้ป่วย'}</h3><small>HN {row.patient?.hn || '—'}</small></div>
        </div>
        <span className="status-pill called">มาถึงแล้ว</span>
      </div>

      <div className="form-two">
        <div className="inline-alert"><strong>เวลานัด</strong><br />{thaiDate(row.appointment_at)}</div>
        <div className="inline-alert"><strong>ห้องตรวจ</strong><br />{row.assigned_pc || 'ยังไม่กำหนด'}</div>
      </div>
      <div className="inline-alert"><strong>อาการสำคัญ</strong><br />{row.chief_complaint || 'ไม่ระบุอาการสำคัญ'}</div>

      {error && <div className="inline-alert danger">{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="button success" disabled={busy} onClick={() => void checkIn()}>
          <UserCheck size={16} /> {busy ? 'กำลังเช็กอิน…' : 'ยืนยันเช็กอินและออกคิว NPR'}
        </button>
      </div>
    </article>
  )
}

export function NurseAppointmentWorkspace() {
  const [tab, setTab] = useState<Tab>('requests')
  const [requests, setRequests] = useState<Appointment[]>([])
  const [arrivals, setArrivals] = useState<Appointment[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [nextRequests, nextArrivals] = await Promise.all([
        clientApi.getNurseRequests('submitted'),
        clientApi.getTodayArrivals(),
      ])
      setRequests(nextRequests)
      setArrivals(nextArrivals)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลงานนัดหมายไม่สำเร็จ')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 10_000)
    const source = new EventSource('/api/realtime/stream?scope=staff')
    const refresh = () => void load(true)
    for (const eventName of ['appointment_created', 'appointment_proposed', 'appointment_confirmed', 'appointment_cancelled', 'encounter_moved']) {
      source.addEventListener(eventName, refresh)
    }
    return () => {
      window.clearInterval(timer)
      source.close()
    }
  }, [load])

  const visibleRequests = useMemo(() => requests.filter((row) => matches(row, search)), [requests, search])
  const visibleArrivals = useMemo(() => arrivals.filter((row) => matches(row, search)), [arrivals, search])

  async function manualRefresh() {
    setRefreshing(true)
    await load(true)
    setRefreshing(false)
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">NURSE APPOINTMENT & CHECK-IN</span>
          <h2>นัดหมายและเช็กอิน</h2>
          <p>พยาบาลทำเฉพาะการรับคำขอนัด เสนอวันนัด และยืนยันผู้ป่วยที่มาถึงแล้ว งานลงทะเบียน วัดสัญญาณชีพ และห้องตรวจแยกไปตามเจ้าหน้าที่ประจำบทบาท</p>
        </div>
        <button className="button secondary" onClick={() => void manualRefresh()} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'spin' : undefined} size={16} /> รีเฟรช
        </button>
      </div>

      <div className="workspace-card" style={{ padding: 16, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className={`button ${tab === 'requests' ? 'primary' : 'secondary'}`} onClick={() => setTab('requests')}>
            <CalendarClock size={16} /> คำขอนัดใหม่ <span className="count-badge">{requests.length}</span>
          </button>
          <button className={`button ${tab === 'arrivals' ? 'primary' : 'secondary'}`} onClick={() => setTab('arrivals')}>
            <DoorOpen size={16} /> รอเช็กอิน <span className="count-badge">{arrivals.length}</span>
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={17} style={{ position: 'absolute', left: 14, top: 13 }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาชื่อผู้ป่วย HN เบอร์โทร หรืออาการ…"
            style={{ width: '100%', paddingLeft: 42 }}
            aria-label="ค้นหาผู้ป่วยในงานนัดหมาย"
          />
          {search && <button className="icon-button" onClick={() => setSearch('')} aria-label="ล้างการค้นหา" style={{ position: 'absolute', right: 8, top: 7 }}><X size={15} /></button>}
        </div>
      </div>

      {error && <div className="inline-alert danger">{error}</div>}

      {loading ? (
        <div className="workspace-card" style={{ padding: 30, textAlign: 'center' }}>กำลังโหลดข้อมูลงานนัดหมาย…</div>
      ) : tab === 'requests' ? (
        visibleRequests.length === 0 ? (
          <div className="workspace-card" style={{ padding: 36, textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
            <CalendarCheck2 size={30} /><strong>{search ? 'ไม่พบผู้ป่วยที่ค้นหา' : 'ไม่มีคำขอนัดใหม่'}</strong><span>คำขอจากผู้ป่วยจะปรากฏที่นี่อัตโนมัติ</span>
          </div>
        ) : <div style={{ display: 'grid', gap: 16 }}>{visibleRequests.map((row) => <RequestCard key={row.id} row={row} onDone={() => load(true)} />)}</div>
      ) : (
        visibleArrivals.length === 0 ? (
          <div className="workspace-card" style={{ padding: 36, textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
            <IdCard size={30} /><strong>{search ? 'ไม่พบผู้ป่วยที่ค้นหา' : 'ยังไม่มีผู้ป่วยรอเช็กอิน'}</strong><span>ผู้ป่วยที่แจ้งมาถึงแล้วจะปรากฏที่นี่</span>
          </div>
        ) : <div style={{ display: 'grid', gap: 16 }}>{visibleArrivals.map((row) => <ArrivalCard key={row.id} row={row} onDone={() => load(true)} />)}</div>
      )}
    </div>
  )
}
