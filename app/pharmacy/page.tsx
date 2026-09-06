'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle2, ClipboardCheck, LoaderCircle, PackageCheck, Pill, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { EmptyState, Feedback, LoadingState, Modal, PageHeader, StatusBadge, Table } from '@/components/ui'
import { clientApi } from '@/lib/client'
import type { ClinicalOrder } from '@/lib/types'

const DEFAULT_DISPENSE_REASON = 'ตรวจสอบผู้ป่วยและให้คำแนะนำการใช้ยาแล้ว'
type FeedbackState = { tone: 'success' | 'danger' | 'warning' | 'info'; message: string } | null

export default function PharmacyPage() {
  const [rxOrders, setRxOrders] = useState<ClinicalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [dispensing, setDispensing] = useState<ClinicalOrder | null>(null)
  const [dispenseReason, setDispenseReason] = useState(DEFAULT_DISPENSE_REASON)

  async function loadPharmacyQueue(showLoading = true) {
    if (showLoading) setLoading(true)
    try {
      const orders = await clientApi.getPharmacyQueue()
      setRxOrders(orders)
      if (feedback?.tone === 'danger') setFeedback(null)
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'โหลดรายการใบสั่งยาไม่สำเร็จ' })
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    clientApi.getPharmacyQueue().then((orders) => {
      if (active) setRxOrders(orders)
    }).catch((cause) => {
      if (active) setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'โหลดรายการใบสั่งยาไม่สำเร็จ' })
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  function openDispense(order: ClinicalOrder) {
    setDispenseReason(DEFAULT_DISPENSE_REASON)
    setFeedback(null)
    setDispensing(order)
  }

  async function handleAction(order: ClinicalOrder, action: 'prepare' | 'ready' | 'dispense') {
    setBusy(true)
    setFeedback(null)
    try {
      if (action === 'prepare') await clientApi.startPreparePharmacy(order.id, order.version || 1)
      if (action === 'ready') await clientApi.readyPharmacy(order.id, order.version || 1)
      if (action === 'dispense') await clientApi.dispensePharmacy(order.id, order.version || 1, dispenseReason.trim())
      setFeedback({
        tone: 'success',
        message: action === 'prepare' ? 'เริ่มจัดยาแล้ว' : action === 'ready' ? 'บันทึกว่ายาพร้อมจ่ายแล้ว' : 'จ่ายยาและบันทึกการให้คำแนะนำแล้ว จากนั้นกด “เสร็จและส่งต่อ” ในคิว PD เพื่อจบขั้นตอน Station',
      })
      setDispensing(null)
      await loadPharmacyQueue(false)
    } catch (cause) {
      setFeedback({ tone: 'danger', message: cause instanceof Error ? cause.message : 'ทำรายการห้องยาไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell role="pharmacy_staff" displayName="ภก. เกริกเกียรติ (เภสัชกรคลินิก)">
      <div className="staff-page-stack">
        <PageHeader
          eyebrow="PHARMACY DISPENSING"
          title="ห้องจ่ายยาและบริบาลเภสัชกรรม (PD)"
          description="ทำงานตามลำดับ รอจัดยา → กำลังจัดยา → พร้อมจ่าย → จ่ายยาและให้คำแนะนำ → ปิดงานในคิว PD"
          icon={<Pill size={22} />}
          badge={<StatusBadge tone="info">{rxOrders.length} ใบสั่งยา</StatusBadge>}
          actions={<button className="button secondary" onClick={() => void loadPharmacyQueue()} disabled={loading}><RefreshCw className={loading ? 'spin' : undefined} size={16} aria-hidden="true" />รีเฟรชรายการ</button>}
        />

        {feedback && <Feedback tone={feedback.tone}>{feedback.message}</Feedback>}

        <section className="workspace-card">
          <div className="workspace-card-head">
            <div><span className="card-kicker"><ClipboardCheck size={14} aria-hidden="true" />Prescription Worklist</span><h3>รายการใบสั่งยาที่รอดำเนินการ</h3></div>
            <span className="count-badge">{rxOrders.length} รายการ</span>
          </div>

          {loading ? <LoadingState label="กำลังโหลด Pharmacy worklist…" /> : rxOrders.length === 0 ? <EmptyState icon={<CheckCircle2 size={28} aria-hidden="true" />} title="ไม่มีใบสั่งยาค้างจ่าย" description="เมื่อแพทย์สร้าง medication order รายการจะปรากฏที่นี่" /> : <Table label="รายการใบสั่งยาที่รอจัดและจ่าย">
            <thead><tr><th>Rx No.</th><th>ผู้ป่วย (HN)</th><th>รายการยา</th><th>สถานะ</th><th>ขั้นตอนการทำงาน</th></tr></thead>
            <tbody>{rxOrders.map((order) => {
              const status = order.pharmacy_status === 'preparing' ? 'กำลังจัดยา' : order.pharmacy_status === 'ready' ? 'พร้อมจ่าย' : 'รอจัดยา'
              const tone = order.pharmacy_status === 'ready' ? 'success' : order.pharmacy_status === 'preparing' ? 'warning' : 'neutral'
              return <tr key={order.id}>
                <td className="mono"><Pill size={14} aria-hidden="true" /><strong>RX-{order.id.slice(-5).toUpperCase()}</strong></td>
                <td><span className="service-label"><UserRound size={15} aria-hidden="true" />{order.patient?.display_name || 'ผู้ป่วย'}</span><small>HN {order.patient?.hn || '-'}</small></td>
                <td>{order.items.filter((item) => item.type === 'medication').map((item) => `${item.name}${item.quantity ? ` × ${item.quantity}` : ''}`).join(', ') || '—'}</td>
                <td><StatusBadge tone={tone}>{status}</StatusBadge></td>
                <td><div className="queue-row-actions">
                  {(!order.pharmacy_status || order.pharmacy_status === 'waiting') && <button className="button secondary" onClick={() => void handleAction(order, 'prepare')} disabled={busy}><Pill size={14} aria-hidden="true" />เริ่มจัดยา</button>}
                  {order.pharmacy_status === 'preparing' && <button className="button warning" onClick={() => void handleAction(order, 'ready')} disabled={busy}><PackageCheck size={14} aria-hidden="true" />ยาพร้อมจ่าย</button>}
                  {order.pharmacy_status === 'ready' && <button className="button success" onClick={() => openDispense(order)} disabled={busy}><ShieldCheck size={14} aria-hidden="true" />จ่ายยา</button>}
                </div></td>
              </tr>
            })}</tbody>
          </Table>}
        </section>

        <Modal
          open={Boolean(dispensing)}
          title="ยืนยันจ่ายยาและให้คำแนะนำ"
          onClose={() => { if (!busy) setDispensing(null) }}
          actions={<><button className="button ghost" disabled={busy} onClick={() => setDispensing(null)}>ยกเลิก</button><button className="button success" disabled={busy || dispenseReason.trim().length < 3} onClick={() => dispensing && void handleAction(dispensing, 'dispense')}>{busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <PackageCheck size={15} aria-hidden="true" />}ยืนยันจ่ายยา</button></>}
        >
          {dispensing && <div style={{ display: 'grid', gap: 12 }}>
            <div className="patient-context-card"><span className="patient-context-icon"><UserRound size={19} aria-hidden="true" /></span><div><strong>{dispensing.patient?.display_name || 'ผู้ป่วย'}</strong><small>HN {dispensing.patient?.hn || '-'} · RX-{dispensing.id.slice(-5).toUpperCase()}</small></div></div>
            <Feedback tone="info">ตรวจชื่อผู้ป่วย รายการยา และคำแนะนำก่อนยืนยัน ระบบจะบันทึกผู้ดำเนินการและ version ของใบสั่งยา</Feedback>
            <label><span>เหตุผล/การตรวจสอบก่อนจ่าย</span><textarea rows={3} value={dispenseReason} onChange={(event) => setDispenseReason(event.target.value)} /></label>
          </div>}
        </Modal>

        <QueueWorkspace role="nurse" stationCodes={['PD']} />
      </div>
    </StaffShell>
  )
}
