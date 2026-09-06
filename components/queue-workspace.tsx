'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BellRing, CheckCircle2, Clock3, ListOrdered, LoaderCircle, Play, RefreshCw, RotateCcw,
  UserRound, UserX,
} from 'lucide-react'
import { clientApi } from '@/lib/client'
import { NURSE_QUEUE_CODES, PC_CODES, STATIONS } from '@/lib/stations'
import { EmptyState, Feedback, LoadingState, Modal } from '@/components/ui'
import type { QueueData, QueueItem } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  waiting: 'รอเรียก', called: 'เรียกแล้ว', in_progress: 'กำลังรับบริการ', no_show: 'ไม่พบผู้ป่วย', completed: 'เสร็จแล้ว',
}

const EMPTY_QUEUE: QueueData = { items: [], now_serving: [], counts: { waiting: 0, called: 0, in_progress: 0 } }

type Props = {
  role: 'nurse' | 'doctor'
  stationCodes?: string[]
  onSelectEncounter?: (id: string) => void
}

export function QueueWorkspace({ role, stationCodes, onSelectEncounter }: Props) {
  const allowed = useMemo(() => STATIONS.filter((station) => stationCodes
    ? stationCodes.includes(station.code)
    : role === 'doctor' ? PC_CODES.has(station.code) : NURSE_QUEUE_CODES.has(station.code)), [role, stationCodes])
  const [station, setStation] = useState(allowed[0]?.code || '')
  const [data, setData] = useState<QueueData>(EMPTY_QUEUE)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [completeTarget, setCompleteTarget] = useState<QueueItem | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!station) {
      setData(EMPTY_QUEUE)
      setLoading(false)
      return
    }
    if (!quiet) setLoading(true)
    try {
      const next = await clientApi.getStationQueue(station) as QueueData
      setData(next)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดคิวไม่สำเร็จ')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [station])

  useEffect(() => {
    if (!station) return
    const initial = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => void load(true), 10_000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [load, station])

  useEffect(() => {
    if (!station) return
    const source = new EventSource('/api/realtime/stream?scope=staff')
    const refresh = () => void load(true)
    const events = ['queue_updated', 'queue_called', 'queue_started', 'queue_recalled', 'queue_skipped', 'queue_requeued', 'encounter_moved']
    events.forEach((name) => source.addEventListener(name, refresh))
    return () => source.close()
  }, [load, station])

  async function action(name: 'call' | 'start' | 'complete' | 'recall' | 'skip' | 'requeue', item?: QueueItem) {
    if (!station) return
    const key = item?.id || name
    setBusy(key)
    setError('')
    setSuccess('')
    try {
      if (name === 'call') await clientApi.callNext(station)
      else if (item) await clientApi.queueAction(station, item.id, name, item.version || 1)
      const labels = {
        call: 'เรียกคิวถัดไปแล้ว', start: 'เริ่มให้บริการแล้ว', complete: 'ปิดงานและส่งต่อ Station ถัดไปแล้ว',
        recall: 'เรียกผู้ป่วยซ้ำแล้ว', skip: 'ย้ายผู้ป่วยเป็นไม่พบตัวแล้ว', requeue: 'นำผู้ป่วยกลับเข้าคิวแล้ว',
      }
      setSuccess(labels[name])
      await load(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy('')
      if (name === 'complete') setCompleteTarget(null)
    }
  }

  const selected = allowed.find((item) => item.code === station)
  const serving = data.now_serving?.[0]
  const scopeLabel = stationCodes?.length
    ? `เฉพาะ ${allowed.map((item) => item.code).join(' · ')}`
    : role === 'doctor' ? 'เฉพาะห้องตรวจ PC–PC4' : 'เฉพาะ NPR · EV · VM · MHT ตามสิทธิ์พยาบาล'

  return (
    <section className="workspace-card queue-workspace">
      <div className="workspace-card-head queue-head">
        <div className="queue-head-copy">
          <span className="queue-head-icon"><ListOrdered size={21} aria-hidden="true" /></span>
          <div>
            <span className="eyebrow">QUEUE CONTROL</span>
            <h2>จัดการคิว Station</h2>
            <p>{scopeLabel}</p>
          </div>
        </div>
        <div className="queue-controls">
          <select value={station} onChange={(e) => { setStation(e.target.value); setSuccess(''); setError('') }} aria-label="เลือก Station" disabled={allowed.length <= 1}>
            {allowed.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
          </select>
          <button className="button secondary" onClick={() => void load()} disabled={loading || !station}>
            <RefreshCw className={loading ? 'spin' : undefined} size={15} aria-hidden="true" /> รีเฟรช
          </button>
          <button className="button primary" onClick={() => void action('call')} disabled={Boolean(busy) || !station || !data.items.some((item) => item.status === 'waiting')}>
            {busy === 'call' ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <BellRing size={15} aria-hidden="true" />} เรียกคิวถัดไป
          </button>
        </div>
      </div>

      <div className="queue-summary-grid">
        <div className="metric-card highlight"><BellRing className="metric-icon" size={34} aria-hidden="true" /><span>กำลังเรียก / บริการ</span><strong>{serving?.queue_no || '—'}</strong><small>{selected?.name || 'ไม่มี Station ที่เปิดใช้งาน'}</small></div>
        <div className="metric-card"><Clock3 className="metric-icon" size={34} aria-hidden="true" /><span>รอเรียก</span><strong>{data.counts.waiting}</strong><small>คิว</small></div>
        <div className="metric-card"><BellRing className="metric-icon" size={34} aria-hidden="true" /><span>เรียกแล้ว</span><strong>{data.counts.called}</strong><small>คิว</small></div>
        <div className="metric-card"><Play className="metric-icon" size={34} aria-hidden="true" /><span>กำลังรับบริการ</span><strong>{data.counts.in_progress}</strong><small>คิว</small></div>
      </div>

      {error && <Feedback tone="danger" className="queue-feedback">{error}</Feedback>}
      {success && !error && <Feedback tone="success" className="queue-feedback">{success}</Feedback>}

      <div className="queue-empty-wrap">
        {!station ? <EmptyState title="ไม่มี Station ที่จัดการได้" description="บัญชีนี้ไม่มีสิทธิ์ควบคุมคิวใน workspace นี้" />
          : loading ? <LoadingState label={`กำลังโหลดคิว ${station}…`} />
            : data.items.length === 0 ? <EmptyState icon={<CheckCircle2 size={28} aria-hidden="true" />} title="ไม่มีคิวรอใน Station นี้" description="เมื่อมีผู้ป่วยใหม่ รายการจะอัปเดตอัตโนมัติแบบ realtime" /> : null}
      </div>

      {!loading && station && data.items.length > 0 && (
        <div className="queue-list">
          {data.items.map((item) => (
            <article className="queue-row" key={item.id}>
              <div className="queue-number-block"><strong>{item.queue_no}</strong><span className={`status-pill ${item.status}`}>{STATUS_LABEL[item.status] || item.status}</span></div>
              <div className="queue-patient">
                <span className="queue-patient-avatar"><UserRound size={18} aria-hidden="true" /></span>
                <span className="queue-patient-copy"><strong>{item.patient?.display_name || 'ผู้ป่วย'}</strong><span>HN {item.patient?.hn || '-'}</span></span>
              </div>
              <div className="queue-actions">
                {onSelectEncounter && <button className="button ghost" onClick={() => onSelectEncounter(item.encounter_id)}><UserRound size={14} aria-hidden="true" />{role === 'doctor' ? 'เปิดบริบท' : 'เลือกผู้ป่วย'}</button>}
                {item.status === 'called' && <button className="button success" disabled={busy === item.id} onClick={() => void action('start', item)}><Play size={14} aria-hidden="true" />เริ่ม</button>}
                {item.status === 'called' && <button className="button secondary" disabled={busy === item.id} onClick={() => void action('recall', item)}><BellRing size={14} aria-hidden="true" />เรียกซ้ำ</button>}
                {(item.status === 'waiting' || item.status === 'called') && <button className="button danger-outline" disabled={busy === item.id} onClick={() => void action('skip', item)}><UserX size={14} aria-hidden="true" />ข้าม</button>}
                {item.status === 'in_progress' && <button className="button success" disabled={busy === item.id} onClick={() => setCompleteTarget(item)}><CheckCircle2 size={14} aria-hidden="true" />เสร็จและส่งต่อ</button>}
                {item.status === 'no_show' && <button className="button warning" disabled={busy === item.id} onClick={() => void action('requeue', item)}><RotateCcw size={14} aria-hidden="true" />กลับเข้าคิว</button>}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(completeTarget)}
        title="ยืนยันเสร็จสิ้น Station"
        onClose={() => { if (!busy) setCompleteTarget(null) }}
        actions={<>
          <button className="button ghost" disabled={Boolean(busy)} onClick={() => setCompleteTarget(null)}>ยกเลิก</button>
          <button className="button success" disabled={Boolean(busy)} onClick={() => completeTarget && void action('complete', completeTarget)}>
            {busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />} ยืนยันและส่งต่อ
          </button>
        </>}
      >
        {completeTarget && <div className="action-modal-copy">
          <p>ระบบจะปิดงานที่ <strong>{station} · {selected?.name || station}</strong> และสร้างคิว Station ถัดไปตามเส้นทางของผู้ป่วยโดยอัตโนมัติ</p>
          <div className="action-modal-patient">
            <span><UserRound size={19} aria-hidden="true" /></span>
            <div><strong>{completeTarget.patient?.display_name || 'ผู้ป่วย'} · {completeTarget.queue_no}</strong><small>HN {completeTarget.patient?.hn || '-'}</small></div>
          </div>
        </div>}
      </Modal>
    </section>
  )
}
