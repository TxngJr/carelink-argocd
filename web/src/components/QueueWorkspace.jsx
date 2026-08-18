import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'

export const STATIONS = [
  ['NPR', 'ลงทะเบียนผู้ป่วย'], ['EV', 'ตรวจสอบสิทธิการรักษา'],
  ['VM', 'วัดสัญญาณชีพ'], ['MHT', 'ซักประวัติทางการแพทย์'],
  ['PC', 'ห้องตรวจแพทย์ 1'], ['PC2', 'ห้องตรวจแพทย์ 2'],
  ['PC3', 'ห้องตรวจแพทย์ 3'], ['PC4', 'ห้องตรวจแพทย์ 4'],
  ['XR', 'รังสีวินิจฉัย'], ['LAB', 'ห้องปฏิบัติการ'],
  ['HEM', 'คลินิกโลหิตวิทยา'], ['SUR', 'คลินิกศัลยกรรมทั่วไป'],
  ['GYN', 'คลินิกมะเร็งนรีเวช'], ['IR', 'งานรังสีร่วมรักษา'],
  ['CHEMO', 'คลินิกเคมีบำบัด'], ['ENT', 'คลินิกหู คอ จมูก'],
  ['BRA', 'รังสีรักษาระยะใกล้'], ['RT', 'งานรังสีรักษา/ฉายแสง'],
  ['OST', 'งานออสโตมีและดูแลแผล'], ['RC', 'พบแพทย์หลังผลตรวจ'],
  ['TD', 'วินิจฉัยและวางแผนการรักษา'], ['HA', 'รับไว้รักษา'],
  ['PD', 'รับยา'], ['DH', 'กลับบ้าน'], ['IPW', 'หอผู้ป่วยใน'],
]

const statusText = {
  waiting: 'รอเรียก',
  called: 'เรียกแล้ว',
  in_progress: 'กำลังรับบริการ',
  no_show: 'ไม่พบผู้ป่วย',
}

export default function QueueWorkspace({ doctor = false, onSelectEncounter }) {
  const allowed = STATIONS.filter(([code]) => doctor
    ? ['PC', 'PC2', 'PC3', 'PC4'].includes(code)
    : !['PC', 'PC2', 'PC3', 'PC4'].includes(code))
  const [station, setStation] = useState(allowed[0][0])
  const [data, setData] = useState({ items: [], counts: {} })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getStationQueue(station)
      setData(res.data || { items: [], counts: {} })
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => {
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [load])

  const action = async (key, item) => {
    if (key === 'complete' && !window.confirm(`ยืนยันว่า ${item.queue_no} เสร็จที่ ${station} และส่งไป Station ถัดไป?`)) {
      return
    }
    setBusyId(item?.id || key)
    try {
      if (key === 'call') await api.callNext(station)
      if (key === 'start') await api.startQueue(station, item.id)
      if (key === 'complete') await api.completeQueue(station, item.id)
      if (key === 'recall') await api.recallQueue(station, item.id)
      if (key === 'skip') await api.skipQueue(station, item.id)
      if (key === 'requeue') await api.requeueQueue(station, item.id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="card border-0 shadow-sm">
      <div className="card-body">
        <div className="d-flex flex-wrap gap-2 align-items-end justify-content-between mb-3">
          <div>
            <label className="form-label fw-semibold">เลือก Station</label>
            <select className="form-select" value={station} onChange={e => setStation(e.target.value)}>
              {allowed.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
            </select>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary" onClick={load} disabled={loading}>รีเฟรช</button>
            <button className="btn btn-primary" onClick={() => action('call')} disabled={!!busyId || !data.items.some(i => i.status === 'waiting')}>
              เรียกคิวถัดไป
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        <div className="small text-secondary mb-3">
          รอ {data.counts?.waiting || 0} · เรียกแล้ว {data.counts?.called || 0} · กำลังรับบริการ {data.counts?.in_progress || 0}
        </div>
        {data.items.length === 0 ? (
          <div className="text-center text-secondary py-5">ไม่มีคิวใน Station นี้</div>
        ) : (
          <div className="d-grid gap-2">
            {data.items.map(item => (
              <article key={item.id} className="border rounded-3 p-3 d-flex flex-wrap gap-3 justify-content-between align-items-center">
                <div>
                  <div className="fw-bold fs-5">{item.queue_no}</div>
                  <div>{item.patient?.display_name || 'ผู้ป่วย'} · HN {item.patient?.hn || '-'}</div>
                  <span className="badge text-bg-light mt-1">{statusText[item.status] || item.status}</span>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {doctor && onSelectEncounter && (
                    <button className="btn btn-outline-primary" onClick={() => onSelectEncounter(item.encounter_id)}>
                      กำหนดเส้นทาง
                    </button>
                  )}
                  {item.status === 'called' && <button className="btn btn-success" disabled={busyId === item.id} onClick={() => action('start', item)}>เริ่ม</button>}
                  {item.status === 'called' && <button className="btn btn-outline-secondary" disabled={busyId === item.id} onClick={() => action('recall', item)}>เรียกซ้ำ</button>}
                  {(item.status === 'waiting' || item.status === 'called') && <button className="btn btn-outline-danger" disabled={busyId === item.id} onClick={() => action('skip', item)}>ข้าม</button>}
                  {item.status === 'in_progress' && <button className="btn btn-success" disabled={busyId === item.id} onClick={() => action('complete', item)}>เสร็จและส่งต่อ</button>}
                  {item.status === 'no_show' && <button className="btn btn-warning" disabled={busyId === item.id} onClick={() => action('requeue', item)}>นำกลับเข้าคิว</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
