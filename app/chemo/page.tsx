'use client'

import React, { useEffect, useState } from 'react'
import { Bell, CheckCircle2, Clock, Flame, Play, Plus, RefreshCw, Syringe } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { QueueWorkspace } from '@/components/queue-workspace'
import { clientApi } from '@/lib/client'
import type { ChemoSession } from '@/lib/types'

export default function ChemoPage() {
  const [sessions, setSessions] = useState<ChemoSession[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function loadChairs() {
    setLoading(true)
    try {
      const data = await clientApi.getChemoChairs()
      setSessions(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    clientApi.getChemoChairs().then((data) => {
      if (active) {
        setSessions(data)
        setLoading(false)
      }
    }).catch(() => {
      if (active) setLoading(false)
    })

    const timer = setInterval(() => {
      clientApi.getChemoChairs().then((data) => {
        if (active) setSessions(data)
      }).catch(() => null)
    }, 8000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  async function handlePremed(id: string) {
    setBusy(true)
    await clientApi.startChemoPremed(id).catch(() => null)
    setBusy(false)
    await loadChairs()
  }

  async function handleStart(id: string) {
    setBusy(true)
    await clientApi.startChemo(id).catch(() => null)
    setBusy(false)
    await loadChairs()
  }

  async function handleComplete(id: string) {
    setBusy(true)
    await clientApi.completeChemo(id).catch(() => null)
    setBusy(false)
    await loadChairs()
  }

  return (
    <StaffShell role="chemo_staff" displayName="พว. ภัทรวดี (พยาบาลเคมีบำบัด)">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">CHEMOTHERAPY DAY CARE LOUNGE</span>
            <h2>ศูนย์เคมีบำบัดและการบริหารยา (CHEMO)</h2>
            <p>ติดตามสถานะเตียง/เก้าอี้ให้ยาเคมีบำบัด ตรวจสอบ Pre-medication และระบบจับเวลาการหยดยา</p>
          </div>
          <button className="button secondary" onClick={() => void loadChairs()} disabled={loading}>
            <RefreshCw size={16} /> รีเฟรชผังเตียง
          </button>
        </div>

        <div className="workspace-card">
          <div className="workspace-card-head">
            <h3>ผังเตียงและเก้าอี้ให้ยาเคมีบำบัด (Chemo Lounge)</h3>
            <span className="count-badge">{sessions.length} เตียงกำลังใช้งาน</span>
          </div>

          <div style={{ padding: '0 20px 24px' }}>
            <div className="chair-grid">
              {[1, 2, 3, 4, 5, 6].map((chairNo) => {
                const session = sessions.find((s) => s.chair_no === chairNo)
                return (
                  <div
                    key={chairNo}
                    className={`chair-card ${session?.status || 'idle'} ${session?.nurse_call ? 'nurse-call' : ''}`}
                    style={{ border: session ? '2px solid var(--brand)' : '1px dashed var(--line)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '1.1rem' }}>เก้าอี้ #{chairNo}</strong>
                      <span className={`status-pill ${session?.status === 'infusing' ? 'flowing' : 'building'}`}>
                        {session ? session.status : 'เตียงว่าง'}
                      </span>
                    </div>

                    {session ? (
                      <div style={{ display: 'grid', gap: 6, fontSize: '.8rem' }}>
                        <div><strong>ผู้ป่วย:</strong> {session.patient?.display_name || 'ผู้ป่วย'}</div>
                        <div><strong>สูตรยา:</strong> {session.protocol_name}</div>
                        <div><strong>ความคืบหน้า:</strong> {session.progress_percent}%</div>

                        <div style={{ height: 6, background: '#e0ece9', borderRadius: 99, overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${session.progress_percent}%`, background: 'var(--brand)' }} />
                        </div>

                        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                          {!session.premed_completed && (
                            <button className="button secondary" style={{ minHeight: 30, fontSize: '.75rem' }} onClick={() => void handlePremed(session.id)} disabled={busy}>
                              Pre-med
                            </button>
                          )}
                          {session.status !== 'infusing' && (
                            <button className="button success" style={{ minHeight: 30, fontSize: '.75rem' }} onClick={() => void handleStart(session.id)} disabled={busy}>
                              เริ่มให้ยา
                            </button>
                          )}
                          <button className="button primary" style={{ minHeight: 30, fontSize: '.75rem' }} onClick={() => void handleComplete(session.id)} disabled={busy}>
                            เสร็จสิ้น
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '.8rem' }}>
                        พร้อมรับผู้ป่วยใหม่
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <QueueWorkspace role="nurse" />
      </div>
    </StaffShell>
  )
}
