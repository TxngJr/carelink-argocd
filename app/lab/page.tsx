'use client'

import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { Modal } from '@/components/ui'
import { clientApi } from '@/lib/client'
import type { ClinicalOrder } from '@/lib/types'

export default function LabPage() {
  const [labOrders, setLabOrders] = useState<ClinicalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<ClinicalOrder | null>(null)
  const [resultValues, setResultValues] = useState('WBC 6.8, Hb 13.2, Plt 240,000 (Normal)')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [verifyOrder, setVerifyOrder] = useState<ClinicalOrder | null>(null)
  const [verifyReason, setVerifyReason] = useState('ตรวจทานผลและข้อมูลอ้างอิงครบถ้วน')

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

  async function handleCollect(order: ClinicalOrder) {
    setBusy(true)
    try {
      await clientApi.collectLabSample(order.id, order.version || 1)
      await loadLabQueue()
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveResults(order: ClinicalOrder) {
    setBusy(true)
    try {
      await clientApi.saveLabResults(order.id, order.version || 1, { summary: resultValues })
      setSelectedOrder(null)
      setMessage('บันทึกผลแล้ว กรุณาให้เจ้าหน้าที่อีกคนตรวจยืนยัน')
      await loadLabQueue()
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify() {
    if (!verifyOrder) return
    setBusy(true)
    try {
      await clientApi.verifyLabResults(verifyOrder.id, verifyOrder.version || 1, verifyReason)
      setVerifyOrder(null)
      setMessage('ตรวจยืนยันผลการตรวจทางห้องปฏิบัติการสำเร็จ')
      await loadLabQueue()
    } finally { setBusy(false) }
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
                        <span className={`status-pill ${ord.lab_status === 'results_recorded' ? 'flowing' : 'building'}`}>
                          {ord.lab_status === 'results_recorded' ? 'รอตรวจยืนยัน' : ord.lab_status === 'sample_collected' ? 'เก็บตัวอย่างแล้ว' : 'รอเก็บตัวอย่าง'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(!ord.lab_status || ord.lab_status === 'ordered') && (
                            <button className="button secondary" onClick={() => void handleCollect(ord)} disabled={busy}>
                              เก็บสิ่งส่งตรวจ
                            </button>
                          )}
                          {ord.lab_status === 'sample_collected' && <button className="button primary" onClick={() => setSelectedOrder(ord)}>บันทึกผล</button>}
                          {ord.lab_status === 'results_recorded' && <button className="button success" onClick={() => setVerifyOrder(ord)}>ตรวจยืนยัน</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <Modal open={Boolean(selectedOrder)} title={selectedOrder ? `บันทึกผลตรวจ #${selectedOrder.id.slice(-6).toUpperCase()}` : 'บันทึกผลตรวจ'} onClose={() => setSelectedOrder(null)} actions={<><button className="button ghost" onClick={() => setSelectedOrder(null)}>ยกเลิก</button><button className="button success" onClick={() => selectedOrder && void handleSaveResults(selectedOrder)} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกผลเพื่อรอตรวจยืนยัน'}</button></>}>
          {selectedOrder && <><p>รายการ: {selectedOrder.items.filter((item) => item.type === 'lab').map((item) => item.name).join(', ')}</p><label><span>ผลการตรวจและค่าอ้างอิง</span><textarea rows={4} value={resultValues} onChange={(event) => setResultValues(event.target.value)} /></label></>}
        </Modal>

        <Modal open={Boolean(verifyOrder)} title="ตรวจยืนยันผลแล็บ" onClose={() => setVerifyOrder(null)} actions={<><button className="button ghost" onClick={() => setVerifyOrder(null)}>ยกเลิก</button><button className="button success" onClick={() => void handleVerify()} disabled={busy || verifyReason.trim().length < 3}>ยืนยันผล</button></>}><p>ผู้ตรวจยืนยันต้องเป็นคนละคนกับผู้บันทึกผล ระบบจะบันทึกผู้ดำเนินการและ version</p><label><span>เหตุผล/บันทึกการตรวจทาน</span><textarea rows={3} value={verifyReason} onChange={(event) => setVerifyReason(event.target.value)} /></label></Modal>

        <QueueWorkspace role="nurse" stationCodes={['LAB', 'LABC']} />
      </div>
    </StaffShell>
  )
}
