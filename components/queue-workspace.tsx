'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { clientApi } from '@/lib/client'
import { PC_CODES, STATIONS } from '@/lib/stations'
import type { QueueData, QueueItem } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  waiting: 'รอเรียก', called: 'เรียกแล้ว', in_progress: 'กำลังรับบริการ', no_show: 'ไม่พบผู้ป่วย', completed: 'เสร็จแล้ว',
}

type Props = {
  role: 'nurse' | 'doctor'
  onSelectEncounter?: (id: string) => void
}

export function QueueWorkspace({ role, onSelectEncounter }: Props) {
  const allowed = useMemo(() => STATIONS.filter((station) => role === 'doctor' ? PC_CODES.has(station.code) : !PC_CODES.has(station.code)), [role])
  const [station, setStation] = useState(allowed[0]?.code || 'NPR')
  const [data, setData] = useState<QueueData>({ items: [], now_serving: [], counts: { waiting: 0, called: 0, in_progress: 0 } })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (quiet = false) => {
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
    const initial = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => void load(true), 10_000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [load])

  async function action(name: 'call' | 'start' | 'complete' | 'recall' | 'skip' | 'requeue', item?: QueueItem) {
    if (name === 'complete' && item && !window.confirm(`ยืนยันว่า ${item.queue_no} เสร็จที่ ${station} และส่งไป Station ถัดไป?`)) return
    const key = item?.id || name
    setBusy(key)
    setError('')
    try {
      if (name === 'call') await clientApi.callNext(station)
      else if (item) await clientApi.queueAction(station, item.id, name)
      await load(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy('')
    }
  }

  const selected = allowed.find((item) => item.code === station)
  const serving = data.now_serving?.[0]

  return (
    <section className="workspace-card queue-workspace">
      <div className="workspace-card-head queue-head">
        <div>
          <span className="eyebrow">QUEUE CONTROL</span>
          <h2>จัดการคิว Station</h2>
          <p>{role === 'doctor' ? 'เฉพาะห้องตรวจ PC–PC4' : 'Station การบริการทั้งหมด ยกเว้นห้องแพทย์'}</p>
        </div>
        <div className="queue-controls">
          <select value={station} onChange={(e) => setStation(e.target.value)} aria-label="เลือก Station">
            {allowed.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
          </select>
          <button className="button secondary" onClick={() => void load()} disabled={loading}>รีเฟรช</button>
          <button className="button primary" onClick={() => void action('call')} disabled={Boolean(busy) || !data.items.some((item) => item.status === 'waiting')}>เรียกคิวถัดไป</button>
        </div>
      </div>

      <div className="queue-summary-grid">
        <div className="metric-card highlight"><span>กำลังเรียก / บริการ</span><strong>{serving?.queue_no || '—'}</strong><small>{selected?.name}</small></div>
        <div className="metric-card"><span>รอเรียก</span><strong>{data.counts.waiting}</strong><small>คิว</small></div>
        <div className="metric-card"><span>เรียกแล้ว</span><strong>{data.counts.called}</strong><small>คิว</small></div>
        <div className="metric-card"><span>กำลังรับบริการ</span><strong>{data.counts.in_progress}</strong><small>คิว</small></div>
      </div>

      {error && <div className="inline-alert danger">{error}</div>}
      {loading ? <div className="empty-state">กำลังโหลดคิว…</div> : data.items.length === 0 ? <div className="empty-state">ไม่มีคิวใน Station นี้</div> : (
        <div className="queue-list">
          {data.items.map((item) => (
            <article className="queue-row" key={item.id}>
              <div className="queue-number-block"><strong>{item.queue_no}</strong><span className={`status-pill ${item.status}`}>{STATUS_LABEL[item.status] || item.status}</span></div>
              <div className="queue-patient"><strong>{item.patient?.display_name || 'ผู้ป่วย'}</strong><span>HN {item.patient?.hn || '-'}</span></div>
              <div className="queue-actions">
                {role === 'doctor' && onSelectEncounter && <button className="button ghost" onClick={() => onSelectEncounter(item.encounter_id)}>กำหนดเส้นทาง</button>}
                {item.status === 'called' && <button className="button success" disabled={busy === item.id} onClick={() => void action('start', item)}>เริ่ม</button>}
                {item.status === 'called' && <button className="button secondary" disabled={busy === item.id} onClick={() => void action('recall', item)}>เรียกซ้ำ</button>}
                {(item.status === 'waiting' || item.status === 'called') && <button className="button danger-outline" disabled={busy === item.id} onClick={() => void action('skip', item)}>ข้าม</button>}
                {item.status === 'in_progress' && <button className="button success" disabled={busy === item.id} onClick={() => void action('complete', item)}>เสร็จและส่งต่อ</button>}
                {item.status === 'no_show' && <button className="button warning" disabled={busy === item.id} onClick={() => void action('requeue', item)}>นำกลับเข้าคิว</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}