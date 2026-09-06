'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle2, FileCheck2, FlaskConical, LoaderCircle, RefreshCw, Save, TestTube2, UserRound } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { EmptyState, Feedback, LoadingState, Modal, PageHeader, StatusBadge, Table } from '@/components/ui'
import { clientApi } from '@/lib/client'
import type { ClinicalOrder } from '@/lib/types'

const DEFAULT_LAB_RESULT = 'WBC 6.8, Hb 13.2, Plt 240,000 (Normal)'
const DEFAULT_VERIFY_REASON = 'ตรวจทานผลและข้อมูลอ้างอิงครบถ้วน'
type FeedbackState = { tone: 'success' | 'danger' | 'warning' | 'info'; message: string } | null

export default function LabPage() {
  const [labOrders, setLabOrders] = useState<ClinicalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<ClinicalOrder | null>(null)
  const [resultValues, setResultValues] = useState(DEFAULT_LAB_RESULT)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [verifyOrder, setVerifyOrder] = useState<ClinicalOrder | null>(null)
  const [verifyReason, setVerifyReason] = useState(DEFAULT_VERIFY_REASON)

  async function loadLabQueue(showLoading = true) {
    if (showLoading) setLoading(true)
    try {
      const orders = await clientApi.getLabQueue()
      setLabOrders(orders)
      if (feedback?.tone === 'danger') setFeedback(null)
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'โหลดรายการตรวจแล็บไม่สำเร็จ' })
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    clientApi.getLabQueue().then((orders) => {
      if (active) setLabOrders(orders)
    }).catch((cause) => {
      if (active) setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'โหลดรายการตรวจแล็บไม่สำเร็จ' })
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function handleCollect(order: ClinicalOrder) {
    setBusy(true)
    setFeedback(null)
    try {
      await clientApi.collectLabSample(order.id, order.version || 1)
      setFeedback({ tone: 'success', message: 'บันทึกการเก็บสิ่งส่งตรวจแล้ว สามารถบันทึกผลเมื่อการวิเคราะห์เสร็จ' })
      await loadLabQueue(false)
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'เก็บสิ่งส่งตรวจไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  function openResult(order: ClinicalOrder) {
    setResultValues(DEFAULT_LAB_RESULT)
    setFeedback(null)
    setSelectedOrder(order)
  }

  async function handleSaveResults(order: ClinicalOrder) {
    if (!resultValues.trim()) {
      setFeedback({ tone: 'warning', message: 'กรุณากรอกผลการตรวจหรือสรุปผลก่อนบันทึก' })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      await clientApi.saveLabResults(order.id, order.version || 1, { summary: resultValues.trim() })
      setSelectedOrder(null)
      setFeedback({ tone: 'success', message: 'บันทึกผลแล้ว กรุณาให้เจ้าหน้าที่อีกคนตรวจยืนยันผลตาม separation of duties' })
      await loadLabQueue(false)
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'บันทึกผลตรวจไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  function openVerify(order: ClinicalOrder) {
    setVerifyReason(DEFAULT_VERIFY_REASON)
    setFeedback(null)
    setVerifyOrder(order)
  }

  async function handleVerify() {
    if (!verifyOrder) return
    if (verifyReason.trim().length < 3) {
      setFeedback({ tone: 'warning', message: 'กรุณาระบุบันทึกการตรวจทานอย่างน้อย 3 ตัวอักษร' })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      await clientApi.verifyLabResults(verifyOrder.id, verifyOrder.version || 1, verifyReason.trim())
      setVerifyOrder(null)
      setFeedback({ tone: 'success', message: 'ตรวจยืนยันผลแล็บสำเร็จ จากนั้นกด “เสร็จและส่งต่อ” ในคิว LAB/LABC เพื่อดำเนิน journey ต่อ' })
      await loadLabQueue(false)
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'ตรวจยืนยันผลแล็บไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell role="lab_staff" displayName="ทนพ. ธนกฤต (นักเทคนิคการแพทย์)">
      <div className="staff-page-stack">
        <PageHeader
          eyebrow="LABORATORY WORKSTATION"
          title="ห้องปฏิบัติการชันสูตร (LAB / LABC)"
          description="ทำงานตามลำดับ เก็บสิ่งส่งตรวจ → บันทึกผล → เจ้าหน้าที่อีกคนตรวจยืนยัน → ปิดงานในคิว Station"
          icon={<FlaskConical size={22} />}
          badge={<StatusBadge tone="info">{labOrders.length} รายการ</StatusBadge>}
          actions={<button className="button secondary" onClick={() => void loadLabQueue()} disabled={loading}><RefreshCw className={loading ? 'spin' : undefined} size={16} aria-hidden="true" />รีเฟรช Worklist</button>}
        />

        {feedback && <Feedback tone={feedback.tone}>{feedback.message}</Feedback>}

        <section className="workspace-card">
          <div className="workspace-card-head">
            <div><span className="card-kicker"><TestTube2 size={14} aria-hidden="true" />Lab Orders</span><h3>รายการส่งตรวจที่รอดำเนินการ</h3></div>
            <span className="count-badge">{labOrders.length} รายการ</span>
          </div>

          {loading ? <LoadingState label="กำลังโหลด Lab worklist…" /> : labOrders.length === 0 ? <EmptyState icon={<CheckCircle2 size={28} aria-hidden="true" />} title="ไม่มีรายการส่งตรวจค้าง" description="รายการใหม่จากแพทย์จะปรากฏที่นี่อัตโนมัติ" /> : <Table label="รายการส่งตรวจทางห้องปฏิบัติการ">
            <thead><tr><th>Order ID</th><th>ผู้ป่วย (HN)</th><th>รายการตรวจ</th><th>สถานะ</th><th>การจัดการ</th></tr></thead>
            <tbody>{labOrders.map((order) => {
              const status = order.lab_status === 'results_recorded' ? 'รอตรวจยืนยัน' : order.lab_status === 'sample_collected' ? 'เก็บตัวอย่างแล้ว' : 'รอเก็บตัวอย่าง'
              const tone = order.lab_status === 'results_recorded' ? 'warning' : order.lab_status === 'sample_collected' ? 'info' : 'neutral'
              return <tr key={order.id}>
                <td className="mono"><FlaskConical size={14} aria-hidden="true" /><strong>{order.id.slice(-6).toUpperCase()}</strong></td>
                <td><span className="service-label"><UserRound size={15} aria-hidden="true" />{order.patient?.display_name || 'ผู้ป่วย'}</span><small>HN {order.patient?.hn || '-'}</small></td>
                <td>{order.items.filter((item) => item.type === 'lab').map((item) => item.name).join(', ') || '—'}</td>
                <td><StatusBadge tone={tone}>{status}</StatusBadge></td>
                <td><div className="queue-row-actions">
                  {(!order.lab_status || order.lab_status === 'ordered') && <button className="button secondary" onClick={() => void handleCollect(order)} disabled={busy}><TestTube2 size={14} aria-hidden="true" />เก็บสิ่งส่งตรวจ</button>}
                  {order.lab_status === 'sample_collected' && <button className="button primary" onClick={() => openResult(order)} disabled={busy}><Save size={14} aria-hidden="true" />บันทึกผล</button>}
                  {order.lab_status === 'results_recorded' && <button className="button success" onClick={() => openVerify(order)} disabled={busy}><FileCheck2 size={14} aria-hidden="true" />ตรวจยืนยัน</button>}
                </div></td>
              </tr>
            })}</tbody>
          </Table>}
        </section>

        <Modal
          open={Boolean(selectedOrder)}
          title={selectedOrder ? `บันทึกผลตรวจ #${selectedOrder.id.slice(-6).toUpperCase()}` : 'บันทึกผลตรวจ'}
          onClose={() => { if (!busy) setSelectedOrder(null) }}
          actions={<><button className="button ghost" disabled={busy} onClick={() => setSelectedOrder(null)}>ยกเลิก</button><button className="button success" onClick={() => selectedOrder && void handleSaveResults(selectedOrder)} disabled={busy || !resultValues.trim()}>{busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}บันทึกผล</button></>}
        >
          {selectedOrder && <div style={{ display: 'grid', gap: 12 }}>
            <div className="patient-context-card"><span className="patient-context-icon"><UserRound size={19} aria-hidden="true" /></span><div><strong>{selectedOrder.patient?.display_name || 'ผู้ป่วย'}</strong><small>HN {selectedOrder.patient?.hn || '-'} · {selectedOrder.items.filter((item) => item.type === 'lab').map((item) => item.name).join(', ')}</small></div></div>
            <label><span>ผลการตรวจและค่าอ้างอิง</span><textarea rows={5} value={resultValues} onChange={(event) => setResultValues(event.target.value)} /></label>
          </div>}
        </Modal>

        <Modal
          open={Boolean(verifyOrder)}
          title="ตรวจยืนยันผลแล็บ"
          onClose={() => { if (!busy) setVerifyOrder(null) }}
          actions={<><button className="button ghost" disabled={busy} onClick={() => setVerifyOrder(null)}>ยกเลิก</button><button className="button success" onClick={() => void handleVerify()} disabled={busy || verifyReason.trim().length < 3}>{busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <FileCheck2 size={15} aria-hidden="true" />}ยืนยันผล</button></>}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <Feedback tone="info">ผู้ตรวจยืนยันต้องเป็นคนละคนกับผู้บันทึกผล ระบบตรวจสิทธิ์และ version ที่ backend อีกครั้ง</Feedback>
            <label><span>เหตุผล/บันทึกการตรวจทาน</span><textarea rows={3} value={verifyReason} onChange={(event) => setVerifyReason(event.target.value)} /></label>
          </div>
        </Modal>

        <QueueWorkspace role="nurse" stationCodes={['LAB', 'LABC']} />
      </div>
    </StaffShell>
  )
}
