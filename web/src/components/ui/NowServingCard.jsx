import React from 'react'
import { Volume2, SkipForward } from 'lucide-react'

export default function NowServingCard({ items, onRecall, onSkip }) {
  if (!items || items.length === 0) return null

  return (
    <div className="mb-3">
      {items.map(item => (
        <div
          key={item.id || item._id}
          className="d-flex align-items-center justify-content-between mb-2"
          style={{ background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 8, padding: '10px 14px' }}
        >
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="badge bg-primary font-mono" style={{ fontSize: 13 }}>{item.queue_no}</span>
            <strong>{item.patient?.display_name || item.patient_id}</strong>
            {item.patient?.hn && <span className="text-muted small">HN: {item.patient.hn}</span>}
            <span className="df-label" style={{ color: 'var(--teal-700)' }}>
              {item.status === 'in_progress' ? 'กำลังให้บริการ' : 'กำลังเรียก'}
            </span>
          </div>
          <div className="d-flex gap-1">
            <button className="btn btn-outline-primary btn-sm" onClick={() => onRecall(item)} title="เรียกซ้ำ">
              <Volume2 size={14} />
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => onSkip(item)} title="ข้ามคิว (ไม่มา)">
              <SkipForward size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
