import React, { useState } from 'react'
import { PhoneCall, Loader2 } from 'lucide-react'

export default function QueueHeader({ title, counts, onCallNext, disabled }) {
  const [calling, setCalling] = useState(false)

  const handleCall = async () => {
    setCalling(true)
    try {
      await onCallNext()
    } finally {
      setCalling(false)
    }
  }

  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <div className="fw-bold">{title}</div>
        <div className="text-muted small">
          รอ {counts?.waiting ?? 0} · กำลังเรียก {counts?.called ?? 0} · กำลังให้บริการ {counts?.in_progress ?? 0}
        </div>
      </div>
      <button
        className="btn btn-primary"
        onClick={handleCall}
        disabled={disabled || calling || (counts?.waiting ?? 0) === 0}
      >
        {calling ? (
          <Loader2 size={15} className="spin" style={{ marginRight: 6 }} />
        ) : (
          <PhoneCall size={15} style={{ marginRight: 6 }} />
        )}
        เรียกคิวถัดไป
      </button>
    </div>
  )
}
