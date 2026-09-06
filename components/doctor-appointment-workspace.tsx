'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, Clock3, IdCard, RefreshCw, Search, Stethoscope, X } from 'lucide-react'
import { clientApi } from '@/lib/client'
import { stationMap } from '@/lib/stations'
import type { Appointment } from '@/lib/types'

const PC_CODES = ['PC', 'PC2', 'PC3', 'PC4'] as const

function toDateTimeLocal(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 60_000)
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

function ConfirmCard({ row, onDone }: { row: Appointment; onDone: () => Promise<void> }) {
  const [appointmentAt, setAppointmentAt] = useState(toDateTimeLocal(row.appointment_at))
  const [assignedPc, setAssignedPc] = useState(row.assigned_pc || 'PC')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!appointmentAt) return
    setBusy(true)
    setError('')
    try {
      await clientApi.confirmAppointment(row.id, {
        appointment_at: new Date(appointmentAt).toISOString(),
        assigned_pc: assignedPc,
        note,
      })
      await onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ยืนยันนัดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="workspace-card" style={{ padding: 20, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="avatar small">{(row.patient?.display_name || 'ผ').slice(0, 1)}</span>
            <div>
              <h3 style={{ margin: 0 }}>{row.patient?.display_name || 'ผู้ป่วย'}</h3>
              <small>HN {row.patient?.hn || '—'}{row.patient?.phone ? ` · ${row.patient.phone}` : ''}</small>
            </div>
          </div>
        </div>
        <span className="status-pill called">รอแพทย์ยืนยัน</span>
      </div>

      <div className="inline-alert">
        <strong>อาการสำคัญ</strong><br />
        {row.chief_complaint || 'ไม่ระบุอาการสำคัญ'}
        {row.nurse_note ? <><br /><small>หมายเหตุพยาบาล: {row.nurse_note}</small></> : null}
      </div>

      <div className="form-two">
        <label>
          <span>วันและเวลาที่พยาบาลเสนอ</span>
          <div className="input-with-icon"><Clock3 size={16} /><span>{thaiDate(row.appointment_at)}</span></div>
        </label>
        <label>
          <span>วันและเวลานัดที่ยืนยัน</span>
          <input type="datetime-local" value={appointmentAt} onChange={(event) => setAppointmentAt(event.target.value)} />
        </label>
      </div>

      <div className="form-two">
        <label>
          <span>ห้องตรวจแพทย์</span>
          <select value={assignedPc} onChange={(event) => setAssignedPc(event.target.value)}>
            {PC_CODES.map((code) => <option key={code} value={code}>{code} · {stationMap.get(code)?.name || code}</option>)}
          </select>
        </label>
        <label>
          <span>หมายเหตุแพทย์</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ข้อมูลเพิ่มเติมสำหรับนัดนี้ (ถ้ามี)" />
        </label>
      </div>

      {error && <div className="inline-alert danger">{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="button primary" disabled={busy || !appointmentAt} onClick={() => void confirm()}>
          <CalendarCheck2 size={16} /> {busy ? 'กำลังยืนยัน…' : 'ยืนยันนัดผู้ป่วย'}
        </button>
      </div>
    </article>
  )
}

export function DoctorAppointmentWorkspace() {
  const [rows, setRows] = useState<Appointment[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const data = await clientApi.getDoctorRequests('nurse_proposed')
      setRows(data)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดรายการนัดไม่สำเร็จ')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 10_000)
    const source = new EventSource('/api/realtime/stream?scope=staff')
    const refresh = () => void load(true)
    for (const eventName of ['appointment_created', 'appointment_proposed', 'appointment_confirmed', 'appointment_cancelled']) {
      source.addEventListener(eventName, refresh)
    }
    return () => {
      window.clearInterval(timer)
      source.close()
    }
  }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => [
      row.patient?.display_name,
      row.patient?.hn,
      row.patient?.phone,
      row.chief_complaint,
      row.nurse_note,
    ].some((value) => String(value || '').toLowerCase().includes(q)))
  }, [rows, search])

  async function manualRefresh() {
    setRefreshing(true)
    await load(true)
    setRefreshing(false)
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">PHYSICIAN APPOINTMENT CONFIRMATION</span>
          <h2>ยืนยันนัดผู้ป่วย</h2>
          <p>แสดงเฉพาะนัดที่พยาบาลเสนอแล้ว แพทย์ตรวจข้อมูล กำหนด PC และยืนยันวันนัดจาก workspace ของแพทย์โดยตรง</p>
        </div>
        <button className="button secondary" onClick={() => void manualRefresh()} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'spin' : undefined} size={16} /> รีเฟรช
        </button>
      </div>

      <div className="workspace-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', position: 'relative' }}>
            <Search size={17} style={{ position: 'absolute', left: 14, top: 13 }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อผู้ป่วย HN เบอร์โทร หรืออาการ…"
              style={{ width: '100%', paddingLeft: 42 }}
              aria-label="ค้นหานัดรอแพทย์ยืนยัน"
            />
            {search && <button className="icon-button" onClick={() => setSearch('')} aria-label="ล้างการค้นหา" style={{ position: 'absolute', right: 8, top: 7 }}><X size={15} /></button>}
          </div>
          <span className="count-badge"><IdCard size={14} /> {visible.length} รายการ</span>
        </div>
      </div>

      {error && <div className="inline-alert danger">{error}</div>}

      {loading ? (
        <div className="workspace-card" style={{ padding: 28, textAlign: 'center' }}>กำลังโหลดนัดที่รอยืนยัน…</div>
      ) : visible.length === 0 ? (
        <div className="workspace-card" style={{ padding: 36, textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
          <Stethoscope size={30} />
          <strong>{search ? 'ไม่พบนัดที่ค้นหา' : 'ไม่มีนัดรอแพทย์ยืนยัน'}</strong>
          <span>{search ? 'ลองเปลี่ยนคำค้นหา' : 'เมื่อนางพยาบาลเสนอวันนัด รายการจะปรากฏที่หน้านี้'}</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {visible.map((row) => <ConfirmCard key={row.id} row={row} onDone={() => load(true)} />)}
        </div>
      )}
    </div>
  )
}
