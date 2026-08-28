'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle2, FlaskConical, Play, RefreshCw, Send, TestTube } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { clientApi } from '@/lib/client'
import type { ClinicalOrder } from '@/lib/types'

export default function LabPage() {
  const [labOrders, setLabOrders] = useState<ClinicalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<ClinicalOrder | null>(null)
  const [resultValues, setResultValues] = useState('WBC 6.8, Hb 13.2, Plt 240,000 (Normal)')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function loadLabQueue() {
    setLoading(true)
    try {
      const orders = await clientApi.getLabQueue()
      setLabOrders(orders)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    clientApi.getLabQueue().then((orders) => {
      if (active) {
        setLabOrders(orders)
        setLoading(false)
      }
    }).catch(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function handleCollect(orderId: string) {
    setBusy(true)
    try {
      await clientApi.collectLabSample(orderId)
      await loadLabQueue()
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveResults(orderId: string) {
    setBusy(true)
    try {
      await clientApi.saveLabResults(orderId, { summary: resultValues, verified_at: new Date() })
      await clientApi.verifyLabResults(orderId)
      setSelectedOrder(null)
      setMessage('บันทึกและยืนยันผลการตรวจทางห้องปฏิบัติการสำเร็จ')
      await loadLabQueue()
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell role="lab_staff" displayName="ทนพ. ธนกฤต (นักเทคนิคการแพทย์)">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">LABORATORY WORKSTATION</span>
            <h2>ห้องปฏิบัติการชันสูตร (LAB / LABC)</h2>
            <p>เก็บสิ่งส่งตรวจ เจาะเลือด ตรวจวิเคราะห์สารคัดหลั่ง และบันทึกผลแล็บส่งคืนห้องตรวจแพทย์</p>
          </div>
          <button className="button secondary" onClick={() => void loadLabQueue()} disabled={loading}>
            <RefreshCw size={16} /> รีเฟรช Worklist
          </button>
        </div>

        {message && <div className="inline-alert success">{message}</div>}

        <div className="workspace-card">
          <div className="workspace-card-head">
            <h3>รายการส่งตรวจทางห้องปฏิบัติการ (Lab Orders Worklist)</h3>
            <span className="count-badge">{labOrders.length} รายการ</span>
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            {labOrders.length === 0 ? (
              <div className="empty-state">ไม่มีรายการส่งตรวจที่รอรับบริการ</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>ผู้ป่วย (HN)</th>
                    <th>รายการตรวจ</th>
                    <th>สถานะ</th>
                    <th>การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {labOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td><strong style={{ fontFamily: 'monospace' }}>{ord.id.slice(-6).toUpperCase()}</strong></td>
                      <td>
                        <strong>{ord.patient?.display_name || 'ผู้ป่วย'}</strong>
                        <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>HN: {ord.patient?.hn || '-'}</div>
                      </td>
                      <td>
                        {ord.items.filter((i) => i.type === 'lab').map((i) => i.name).join(', ')}
                      </td>
                      <td>
                        <span className={`status-pill ${ord.status === 'in_progress' ? 'flowing' : 'building'}`}>
                          {ord.status === 'in_progress' ? 'เก็บตัวอย่างแล้ว' : 'รอเก็บสิ่งส่งตรวจ'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {ord.status !== 'in_progress' && (
                            <button className="button secondary" style={{ minHeight: 32 }} onClick={() => void handleCollect(ord.id)} disabled={busy}>
                              เก็บสิ่งส่งตรวจ
                            </button>
                          )}
                          <button className="button primary" style={{ minHeight: 32 }} onClick={() => setSelectedOrder(ord)}>
                            กรอกผลแล็บ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Enter Results Modal */}
        {selectedOrder && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
            <div className="workspace-card" style={{ width: 'min(540px, 92%)', padding: 24 }}>
              <h3>กรอกผลการตรวจชันสูตร: Order #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
              <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
                รายการ: {selectedOrder.items.filter((i) => i.type === 'lab').map((i) => i.name).join(', ')}
              </p>
              <label style={{ margin: '14px 0' }}>
                <span>ผลการตรวจและค่าอ้างอิงปกติ (Results Summary)</span>
                <textarea rows={4} value={resultValues} onChange={(e) => setResultValues(e.target.value)} />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="button ghost" onClick={() => setSelectedOrder(null)}>ยกเลิก</button>
                <button className="button success" onClick={() => void handleSaveResults(selectedOrder.id)} disabled={busy}>
                  {busy ? 'กำลังบันทึก…' : 'ยืนยันผลแล็บ (Sign-off)'}
                </button>
              </div>
            </div>
          </div>
        )}

        <QueueWorkspace role="nurse" />
      </div>
    </StaffShell>
  )
}
