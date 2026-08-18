import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback(({ title, body, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', danger = false }) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setDialog({ title, body, confirmLabel, cancelLabel, danger })
    })
  }, [])

  const close = (result) => {
    setDialog(null)
    if (resolverRef.current) {
      resolverRef.current(result)
      resolverRef.current = null
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <>
          <div className="modal-backdrop show" style={{ zIndex: 1050 }} onClick={() => close(false)} />
          <div className="modal d-block" style={{ zIndex: 1055 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content" style={{ borderRadius: 12 }}>
                <div className="modal-body p-4">
                  <div className="d-flex align-items-start gap-3 mb-2">
                    {dialog.danger && (
                      <AlertTriangle size={22} color="var(--crit)" style={{ flexShrink: 0, marginTop: 2 }} />
                    )}
                    <div>
                      <div className="fw-bold mb-1" style={{ fontSize: 16 }}>{dialog.title}</div>
                      {dialog.body && <div className="text-muted" style={{ fontSize: 13.5 }}>{dialog.body}</div>}
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => close(false)}>
                    {dialog.cancelLabel}
                  </button>
                  <button
                    className={`btn btn-sm ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => close(true)}
                    autoFocus
                  >
                    {dialog.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
