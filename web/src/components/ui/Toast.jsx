import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

const ToastContext = createContext(null)

const VARIANTS = {
  success: { Icon: CheckCircle2, color: 'var(--ok)', bg: 'var(--ok-tint)' },
  error: { Icon: XCircle, color: 'var(--crit)', bg: 'var(--crit-tint)' },
  info: { Icon: Info, color: 'var(--info)', bg: 'var(--info-tint)' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((variant, message) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, variant, message }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  const api = {
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-container">
        {toasts.map(t => {
          const v = VARIANTS[t.variant] || VARIANTS.info
          return (
            <div
              key={t.id}
              className="d-flex align-items-start gap-2 mb-2"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${v.color}33`,
                borderLeft: `4px solid ${v.color}`,
                borderRadius: 8,
                boxShadow: 'var(--shadow-md)',
                padding: '10px 14px',
                minWidth: 260,
                maxWidth: 360,
                cursor: 'pointer',
              }}
              onClick={() => dismiss(t.id)}
              role="alert"
            >
              <v.Icon size={18} color={v.color} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{t.message}</div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
