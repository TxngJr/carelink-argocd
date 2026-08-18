import React, { useState, useEffect, useContext } from 'react'
import { api } from '../services/api'
import { WSContext } from '../App'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import QueueHeader from '../components/ui/QueueHeader'
import NowServingCard from '../components/ui/NowServingCard'
import WaitChip from '../components/ui/WaitChip'

const STATION = 'VM'

export default function VitalsPage() {
  const [data, setData] = useState(null)
  const [selectedEnc, setSelectedEnc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ sbp: '', dbp: '', pulse: '', temperature: '', spo2: '', respiratory_rate: '', weight: '', height: '' })
  const [saving, setSaving] = useState(false)
  const wsEvents = useContext(WSContext)
  const toast = useToast()
  const confirm = useConfirm()

  const fetchQueue = async () => {
    try {
      const res = await api.getStationQueue(STATION)
      setData(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wsEvents.length > 0 && ['QUEUE_UPDATED', 'QUEUE_CALLED'].includes(wsEvents[0].type)) {
      fetchQueue()
    }
  }, [wsEvents])

  const handleCallNext = async () => {
    try {
      await api.callNext(STATION)
      toast.success('เรียกคิวถัดไปแล้ว')
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleRecall = async (item) => {
    try {
      await api.recallQueue(STATION, item.id)
      toast.info(`เรียกซ้ำคิว ${item.queue_no}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleSkip = async (item) => {
    const ok = await confirm({
      title: `ข้ามคิว ${item.queue_no}?`,
      body: 'ผู้ป่วยจะถูกทำเครื่องหมายว่าไม่มา และสามารถนำกลับเข้าคิวได้ภายหลัง',
      confirmLabel: 'ข้ามคิว',
      danger: true,
    })
    if (!ok) return
    try {
      await api.skipQueue(STATION, item.id)
      toast.info(`ข้ามคิว ${item.queue_no} แล้ว`)
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSave = async () => {
    if (!selectedEnc) return
    setSaving(true)
    try {
      const payload = {
        sbp: parseInt(form.sbp) || 0,
        dbp: parseInt(form.dbp) || 0,
        pulse: parseInt(form.pulse) || 0,
        temperature: parseFloat(form.temperature) || 0,
        spo2: parseInt(form.spo2) || 0,
        respiratory_rate: parseInt(form.respiratory_rate) || 0,
        weight: parseFloat(form.weight) || 0,
        height: parseFloat(form.height) || 0,
      }
      await api.saveVitals(selectedEnc.encounter_id, payload)
      toast.success('บันทึก vital signs สำเร็จ')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSendToNurse = async () => {
    if (!selectedEnc) return
    const ok = await confirm({
      title: `ส่งต่อ ${selectedEnc.queue_no} ไปซักประวัติ (MHT)?`,
      body: 'การส่งต่อจะย้ายผู้ป่วยออกจากคิว VM ทันที',
    })
    if (!ok) return
    try {
      await api.sendToNurse(selectedEnc.encounter_id)
      toast.success('ส่งต่อซักประวัติสำเร็จ')
      setSelectedEnc(null)
      fetchQueue()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>
  if (!data) return <div className="p-4"><ErrorState onRetry={fetchQueue} /></div>

  const waitingItems = data.items.filter(i => i.status === 'waiting')

  return (
    <div className="p-4">
      <h4 className="fw-bold mb-1">Vitals Monitoring</h4>
      <small className="text-muted">VM - จุดวัดสัญญาณชีพ</small>

      <div className="row mt-4">
        <div className="col-md-5">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <QueueHeader title="คิวรอวัดสัญญาณชีพ" counts={data.counts} onCallNext={handleCallNext} />
              <NowServingCard items={data.now_serving} onRecall={handleRecall} onSkip={handleSkip} />
              {waitingItems.length === 0 ? (
                <div className="text-center text-muted py-4">ไม่มีคิวรอ</div>
              ) : (
                waitingItems.map((item, i) => (
                  <div
                    key={item.id || i}
                    className={`queue-item ${selectedEnc?.id === item.id ? 'border-primary bg-primary bg-opacity-10' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedEnc(item)}
                  >
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <span className="badge bg-secondary me-2">{item.queue_no}</span>
                        <strong>{item.patient?.display_name || item.patient_id} {item.patient?.hn && `(HN: ${item.patient.hn})`}</strong>
                        <span className={`badge ms-2 ${item.priority === 'urgent' ? 'bg-danger' : 'bg-info'}`}>{item.priority}</span>
                      </div>
                      <WaitChip since={item.created_at} avgWaitMin={null} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="col-md-7">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-bold">กรอก Vital Signs</div>
            <div className="card-body">
              {!selectedEnc ? (
                <div className="text-center text-muted py-4">เลือกผู้ป่วยจากรายการด้านซ้าย</div>
              ) : (
                <>
                  <div className="alert alert-info py-2 mb-3">
                    <strong>{selectedEnc.queue_no}</strong> - {selectedEnc.patient?.display_name || selectedEnc.patient_id} (Encounter: {selectedEnc.encounter?.encounter_no || selectedEnc.encounter_id})
                  </div>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label small">SBP (mmHg)</label>
                      <input type="number" className="form-control" name="sbp" value={form.sbp} onChange={handleChange} placeholder="120" />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small">DBP (mmHg)</label>
                      <input type="number" className="form-control" name="dbp" value={form.dbp} onChange={handleChange} placeholder="80" />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small">Pulse (bpm)</label>
                      <input type="number" className="form-control" name="pulse" value={form.pulse} onChange={handleChange} placeholder="72" />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small">Temperature (°C)</label>
                      <input type="number" step="0.1" className="form-control" name="temperature" value={form.temperature} onChange={handleChange} placeholder="36.5" />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small">SpO2 (%)</label>
                      <input type="number" className="form-control" name="spo2" value={form.spo2} onChange={handleChange} placeholder="98" />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small">Respiratory Rate</label>
                      <input type="number" className="form-control" name="respiratory_rate" value={form.respiratory_rate} onChange={handleChange} placeholder="16" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small">Weight (kg)</label>
                      <input type="number" step="0.1" className="form-control" name="weight" value={form.weight} onChange={handleChange} placeholder="60" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small">Height (cm)</label>
                      <input type="number" step="0.1" className="form-control" name="height" value={form.height} onChange={handleChange} placeholder="165" />
                    </div>
                  </div>
                  <div className="mt-3 d-flex gap-2">
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                      {saving ? 'กำลังบันทึก...' : 'บันทึก Vital Signs'}
                    </button>
                    <button className="btn btn-success" onClick={handleSendToNurse}>
                      บันทึกและส่งต่อ MHT
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
