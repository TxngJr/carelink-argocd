import React from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'

export default function ErrorState({ message = 'โหลดข้อมูลไม่สำเร็จ', onRetry, compact = false }) {
  return (
    <div className={`text-center ${compact ? 'py-3' : 'py-5'}`}>
      <WifiOff size={compact ? 22 : 30} color="var(--crit)" style={{ marginBottom: 8 }} />
      <div className="fw-bold mb-1" style={{ color: 'var(--crit)', fontSize: compact ? 13 : 15 }}>{message}</div>
      <div className="text-muted mb-3" style={{ fontSize: 12.5 }}>ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง</div>
      {onRetry && (
        <button className="btn btn-outline-primary btn-sm" onClick={onRetry}>
          <RefreshCw size={14} style={{ marginRight: 6 }} />
          ลองใหม่
        </button>
      )}
    </div>
  )
}
