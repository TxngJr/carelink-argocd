'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Info, LoaderCircle, TriangleAlert, X, XCircle } from 'lucide-react'
import { formatCountdown, phaseRemainingSeconds } from '@/lib/infusion-time'
import type { InfusionPhase } from '@/lib/types'

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return <div className="section-heading page-header">
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </div>
}

export function StatusBadge({ tone = 'neutral', children }: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  children: React.ReactNode
}) {
  return <span className={`status-badge ${tone}`}>{children}</span>
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`workspace-card ${className}`.trim()}>{children}</section>
}

export function Button({ variant = 'primary', className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'warning'
}) {
  return <button className={`button ${variant} ${className}`.trim()} {...props}>{children}</button>
}

export function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return <label><span>{label}{required && <em> *</em>}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>
}

export function Table({ children, label }: { children: React.ReactNode; label?: string }) {
  return <div className="table-scroll"><table className="data-table modern-table" aria-label={label}>{children}</table></div>
}

export function Tabs<T extends string>({ value, items, onChange }: {
  value: T
  items: Array<{ id: T; label: string; icon?: React.ReactNode }>
  onChange: (value: T) => void
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    onChange(items[nextIndex].id)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[nextIndex]?.focus()
  }
  return <div className="page-tabs" role="tablist">{items.map((item, index) => <button key={item.id} role="tab" aria-selected={value === item.id} tabIndex={value === item.id ? 0 : -1} className={value === item.id ? 'active' : ''} onKeyDown={(event) => onKeyDown(event, index)} onClick={() => onChange(item.id)}>{item.icon}{item.label}</button>)}</div>
}

function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    const focusable = () => [...(node?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])]
    window.setTimeout(() => (focusable()[0] || node)?.focus(), 0)
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) {
        event.preventDefault()
        node?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previous?.focus()
    }
  }, [open])
  return ref
}

export function Drawer({ open, title, eyebrow, onClose, children, actions }: {
  open: boolean; title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode
}) {
  const dialogRef = useDialogFocus(open, onClose)
  if (!open) return null
  return <div className="drawer-scrim" role="presentation" onMouseDown={onClose}><aside ref={dialogRef} tabIndex={-1} className="app-drawer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="drawer-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h3>{title}</h3></div><button className="icon-button" onClick={onClose} aria-label="ปิด"><X size={19} /></button></div><div className="drawer-content">{children}</div>{actions && <div className="drawer-actions">{actions}</div>}</aside></div>
}

export function Modal({ open, title, onClose, children, actions }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode
}) {
  const dialogRef = useDialogFocus(open, onClose)
  if (!open) return null
  return <div className="modal-scrim" role="presentation" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="app-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={onClose} aria-label="ปิด"><X size={19} /></button></div><div className="modal-content">{children}</div>{actions && <div className="modal-actions">{actions}</div>}</section></div>
}

export function Countdown({ phase, serverNow, onDue, onWarning }: {
  phase: InfusionPhase
  serverNow: string
  onDue?: () => void
  onWarning?: () => void
}) {
  const [remaining, setRemaining] = useState(() => phaseRemainingSeconds(phase, new Date(serverNow).getTime()))

  useEffect(() => {
    if (phase.status !== 'active') return
    const localStart = Date.now()
    const serverStart = new Date(serverNow).getTime()
    const update = () => setRemaining(phaseRemainingSeconds(phase, serverStart + (Date.now() - localStart)))
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [phase, serverNow])

  useEffect(() => {
    if (remaining > 0 && remaining <= 600) onWarning?.()
    if (remaining === 0) onDue?.()
  }, [remaining, onDue, onWarning])

  const tone = remaining === 0 ? 'due' : remaining <= 600 ? 'warning' : 'normal'
  return <span className={`countdown mono ${tone}`} aria-label={`เวลาเหลือ ${formatCountdown(remaining)}`}>{formatCountdown(remaining)}</span>
}

export type ToastMessage = { id: number; tone: 'success' | 'danger' | 'warning' | 'info'; message: string; persistent?: boolean }

const toastIcon = {
  success: CheckCircle2,
  danger: XCircle,
  warning: TriangleAlert,
  info: Info,
}

export function ToastViewport({ messages, onDismiss }: { messages: ToastMessage[]; onDismiss: (id: number) => void }) {
  return <div className="toast-viewport" aria-live="polite">
    {messages.map((message) => {
      const Icon = toastIcon[message.tone]
      return <div className={`app-toast ${message.tone}`} key={message.id}>
        <Icon size={18} /><span>{message.message}</span><button onClick={() => onDismiss(message.id)} aria-label="ปิด"><X size={16} /></button>
      </div>
    })}
  </div>
}

export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return <div className="modern-empty">{icon}<strong>{title}</strong>{description && <p>{description}</p>}</div>
}

export function LoadingState({ label = 'กำลังโหลดข้อมูล…' }: { label?: string }) {
  return <div className="modern-empty" role="status"><LoaderCircle className="spin" size={24} aria-hidden="true" /><strong>{label}</strong></div>
}

export function ErrorState({ title = 'ไม่สามารถโหลดข้อมูลได้', description }: { title?: string; description?: string }) {
  return <EmptyState icon={<XCircle size={26} />} title={title} description={description} />
}
