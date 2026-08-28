'use client'

import React, { useEffect, useState } from 'react'
import { Check, CheckCircle2, PackageCheck, Pill, RefreshCw, ShieldCheck } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { clientApi } from '@/lib/client'
import type { ClinicalOrder } from '@/lib/types'

export default function PharmacyPage() {
  const [rxOrders, setRxOrders] = useState<ClinicalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function loadPharmacyQueue() {
    setLoading(true)
    try {
      const orders = await clientApi.getPharmacyQueue()
      setRxOrders(orders)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    clientApi.getPharmacyQueue().then((orders) => {
      if (active) {
        setRxOrders(orders)
        setLoading(false)
      }
    }).catch(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function handleAction(orderId: string, action: 'prepare' | 'ready' | 'dispense') {
    setBusy(true)
    try {
      if (action === 'prepare') await clientApi.startPreparePharmacy(orderId)
      if (action === 'ready') await clientApi.readyPharmacy(orderId)
      if (action === 'dispense') await clientApi.dispensePharmacy(orderId)
      setMessage(`ทำรายการ ${action} ใบสั่งยาสำเร็จ`)
      await loadPharmacyQueue()
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell role="pharmacy_staff" displayName="ภก. เกริกเกียรติ (เภสัชกรคลินิก)">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">PHARMACY DISPENSING WORKSPACE</span>
            <h2>ห้องจ่ายยาและบริบาลเภสัชกรรม (PD)</h2>
            <p>ตรวจสอบความปลอดภัยของใบสั่งยา จัดเตรียมยา ตรวจสอบความถูกต้อง และจ่ายยาพร้อมให้คำแนะนำ</p>
          </div>
          <button className="button secondary" onClick={() => void loadPharmacyQueue()} disabled={loading}>
            <RefreshCw size={16} /> รีเฟรชรายการ
          </button>
        </div>

        {message && <div className="inline-alert success">{message}</div>}

        <div className="workspace-card">
          <div className="workspace-card-head">
            <h3>รายการใบสั่งยาที่รอจัดและจ่าย (Prescriptions Worklist)</h3>
            <span className="count-badge">{rxOrders.length} รายการ</span>
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            {rxOrders.length === 0 ? (
              <div className="empty-state">ไม่มีใบสั่งยาค้างจ่ายในระบบ</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rx No.</th>
                    <th>ผู้ป่วย (HN)</th>
                    <th>รายการยาและขนาด</th>
                    <th>สถานะ</th>
                    <th>ขั้นตอนการทำงาน</th>
                  </tr>
                </thead>
                <tbody>
                  {rxOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td><strong style={{ fontFamily: 'monospace' }}>RX-{ord.id.slice(-5).toUpperCase()}</strong></td>
                      <td>
                        <strong>{ord.patient?.display_name || 'ผู้ป่วย'}</strong>
                        <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>HN: {ord.patient?.hn || '-'}</div>
                      </td>
                      <td>
                        {ord.items.filter((i) => i.type === 'medication').map((i) => `${i.name} (${i.quantity} เม็ด)`).join(', ')}
                      </td>
                      <td>
                        <span className="status-pill flowing">
                          {ord.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="button secondary" style={{ minHeight: 32 }} onClick={() => void handleAction(ord.id, 'prepare')} disabled={busy}>
                            จัดยา
                          </button>
                          <button className="button warning" style={{ minHeight: 32 }} onClick={() => void handleAction(ord.id, 'ready')} disabled={busy}>
                            ยาพร้อมจ่าย
                          </button>
                          <button className="button success" style={{ minHeight: 32 }} onClick={() => void handleAction(ord.id, 'dispense')} disabled={busy}>
                            จ่ายยาและให้คำแนะนำ
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

        <QueueWorkspace role="nurse" />
      </div>
    </StaffShell>
  )
}
