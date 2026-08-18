import React from 'react'
import { Clock } from 'lucide-react'

export default function WaitChip({ since, avgWaitMin }) {
  if (!since) return null
  const elapsedMin = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000))
  const ratio = avgWaitMin > 0 ? elapsedMin / avgWaitMin : 0

  let color = 'var(--ok)', bg = 'var(--ok-tint)'
  if (ratio >= 1.5) {
    color = 'var(--crit)'; bg = 'var(--crit-tint)'
  } else if (ratio >= 1) {
    color = 'var(--warn)'; bg = 'var(--warn-tint)'
  }

  return (
    <span
      className="d-inline-flex align-items-center font-mono"
      style={{ background: bg, color, borderRadius: 999, padding: '2px 8px', fontSize: 11.5, fontWeight: 600 }}
      title={avgWaitMin > 0 ? `เฉลี่ยที่สถานีนี้ ~${avgWaitMin} นาที` : 'ยังไม่มีข้อมูลเฉลี่ย'}
    >
      <Clock size={11} style={{ marginRight: 4 }} />
      รอ {elapsedMin} นาที
    </span>
  )
}
