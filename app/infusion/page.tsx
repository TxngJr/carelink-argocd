'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlarmClock, Armchair, BellRing, Check, CheckCircle2, ChevronRight, CirclePause, CirclePlay,
  Clock3, Droplets, History, ListChecks, Plus, RefreshCw, Search, Settings2, SlidersHorizontal,
  TimerReset, UserRoundCheck, Users, Volume2, VolumeX, X,
} from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { Countdown, EmptyState, PageHeader, StatusBadge, Tabs, ToastViewport, type ToastMessage } from '@/components/ui'
import { clientApi } from '@/lib/client'
import type {
  InfusionBoard, InfusionChair, InfusionPhaseTemplate, InfusionQueueEntry, InfusionSession,
  InfusionTemplate, PublicUser,
} from '@/lib/types'

type Tab = 'overview' | 'queue' | 'history' | 'settings'
type ChairBoard = InfusionChair & { session?: InfusionSession }
type HistoryRow = InfusionSession & { events: Array<{ id: string; action: string; reason?: string; created_at: string; performer?: { display_name?: string } }> }

const statusMeta: Record<InfusionSession['status'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  reserved: { label: 'กำลังเรียก', tone: 'info' }, active: { label: 'กำลังให้บริการ', tone: 'success' },
  paused: { label: 'พักเวลา', tone: 'warning' }, due: { label: 'ครบเวลา', tone: 'danger' },
  completed: { label: 'เสร็จแล้ว', tone: 'success' }, no_show: { label: 'ไม่พบผู้ป่วย', tone: 'warning' }, cancelled: { label: 'ยกเลิก', tone: 'neutral' },
}

const actionLabel: Record<string, string> = {
  patient_called: 'เรียกผู้ป่วยและจองเก้าอี้', patient_recalled: 'เรียกผู้ป่วยซ้ำ', patient_no_show: 'บันทึกไม่พบผู้ป่วย',
  phase_started: 'เริ่มขั้นตอน', session_paused: 'พักเวลา', time_adjusted: 'ปรับเวลา', phase_completed: 'จบขั้นตอน', session_completed: 'จบ Session',
}

function ChairCard({ chair, serverNow, onOpen, onDue, onWarning }: { chair: ChairBoard; serverNow: string; onOpen: () => void; onDue: (session: InfusionSession) => void; onWarning: (session: InfusionSession) => void }) {
  const session = chair.session
  const current = session?.phases[session.current_phase_index]
  const state = session?.status || 'free'
  const statusLabel = session?.status === 'reserved' && session.started_at ? 'รอเริ่มขั้นถัดไป' : session ? statusMeta[session.status].label : ''
  return <button className={`infusion-chair-card ${state}`} onClick={onOpen}>
    <div className="infusion-chair-head">
      <span className="chair-label"><Armchair size={17} /> {chair.label}</span>
      {session ? <StatusBadge tone={statusMeta[session.status].tone}>{statusLabel}</StatusBadge> : <StatusBadge>ว่าง</StatusBadge>}
    </div>
    {!session ? <div className="chair-free"><Plus size={23} /><strong>พร้อมรับผู้ป่วย</strong><span>กดเพื่อดูคิวที่พร้อม</span></div> : <>
      <div className="chair-patient"><strong>{session.patient?.display_name || 'ผู้ป่วย'}</strong><span className="mono">HN {session.patient?.hn || '—'}</span></div>
      <div className="chair-service"><span>{session.template_name}</span><small>{current?.label || 'รอเริ่มขั้นตอน'}</small></div>
      <div className="progress-track"><i style={{ width: `${session.progress_percent}%` }} /></div>
      <div className="chair-timer-row"><span>{session.progress_percent}%</span>{current ? <Countdown key={`${current.key}:${current.status}:${current.remaining_sec}:${current.started_at || ''}`} phase={current} serverNow={serverNow} onWarning={() => onWarning(session)} onDue={() => onDue(session)} /> : <span className="mono">00:00:00</span>}</div>
    </>}
  </button>
}

function Readiness({ item }: { item: InfusionQueueEntry }) {
  return <div className="readiness-list">
    {item.readiness.overridden && <StatusBadge tone="warning">Override</StatusBadge>}
    {item.readiness.requirements.map((check) => <span className={check.ready ? 'ready' : 'blocked'} key={check.key}>{check.ready ? <Check size={12} /> : <X size={12} />}{check.label}</span>)}
  </div>
}

function ChairSettingRow({ chair, onSaved }: { chair: InfusionChair; onSaved: () => Promise<void> }) {
  const [label, setLabel] = useState(chair.label)
  const [duration, setDuration] = useState(chair.default_duration_min?.toString() || '')
  const [active, setActive] = useState(chair.is_active)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await clientApi.updateInfusionChair(chair.id, { label, default_duration_min: Number(duration || 0), is_active: active })
      await onSaved()
    } finally { setBusy(false) }
  }
  return <div className="resource-row chair-setting-row">
    <span className="resource-code mono">{chair.code}</span>
    <input value={label} onChange={(event) => setLabel(event.target.value)} aria-label={`ชื่อ ${chair.code}`} />
    <label className="compact-field"><span>เวลารวม Override</span><input type="number" min="0" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="ตาม Template" /></label>
    <label className="switch-control"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><i /><span>{active ? 'เปิดใช้' : 'ปิดใช้'}</span></label>
    <button className="button secondary" disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
  </div>
}

function TemplateEditor({ template, onClose, onSaved }: { template?: InfusionTemplate; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(template?.name || '')
  const [code, setCode] = useState(template?.code || '')
  const [kind, setKind] = useState<InfusionTemplate['service_kind']>(template?.service_kind || 'hydration')
  const [phases, setPhases] = useState<InfusionPhaseTemplate[]>(template?.phases || [{ key: 'infusion', label: 'ให้สารน้ำ', kind: 'infusion', duration_min: 60 }])
  const [requirements, setRequirements] = useState<InfusionTemplate['readiness_requirements']>(template?.readiness_requirements || ['active_order'])
  const [busy, setBusy] = useState(false)

  function updatePhase(index: number, patch: Partial<InfusionPhaseTemplate>) {
    setPhases((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  }
  function toggleRequirement(key: InfusionTemplate['readiness_requirements'][number]) {
    setRequirements((rows) => rows.includes(key) ? rows.filter((row) => row !== key) : [...rows, key])
  }
  async function save() {
    if (!name.trim() || !code.trim() || phases.length === 0 || requirements.length === 0) return
    setBusy(true)
    try {
      const payload = { code, name, service_kind: kind, phases, readiness_requirements: requirements }
      if (template) await clientApi.updateInfusionTemplate(template.id, payload)
      else await clientApi.createInfusionTemplate(payload)
      await onSaved()
      onClose()
    } finally { setBusy(false) }
  }
  return <div className="drawer-scrim" onMouseDown={onClose}><aside className="app-drawer template-drawer" onMouseDown={(event) => event.stopPropagation()}>
    <div className="drawer-head"><div><span className="eyebrow">Service template</span><h3>{template ? 'แก้ไข Template' : 'สร้าง Template ใหม่'}</h3></div><button className="icon-button" onClick={onClose} aria-label="ปิด"><X size={19} /></button></div>
    <div className="drawer-content form-stack">
      {template?.is_demo && <div className="inline-alert info">Template นี้เป็นข้อมูลสาธิต ไม่ใช่ Clinical protocol กรุณาตรวจสอบก่อนนำไปใช้จริง</div>}
      <div className="form-two"><label><span>รหัส</span><input value={code} disabled={Boolean(template)} onChange={(event) => setCode(event.target.value.toUpperCase())} /></label><label><span>ชื่อบริการ</span><input value={name} onChange={(event) => setName(event.target.value)} /></label></div>
      <label><span>ประเภทบริการ</span><select value={kind} onChange={(event) => setKind(event.target.value as InfusionTemplate['service_kind'])}><option value="hydration">น้ำเกลือทั่วไป</option><option value="iv_medication">ยาทางหลอดเลือด</option><option value="chemotherapy">เคมีบำบัด</option></select></label>
      <div><div className="form-section-title"><span>ขั้นตอนและเวลา</span><button className="button ghost" onClick={() => setPhases((rows) => [...rows, { key: `phase_${rows.length + 1}`, label: 'ขั้นตอนใหม่', kind: 'preparation', duration_min: 10 }])}><Plus size={15} /> เพิ่มขั้นตอน</button></div>
        <div className="phase-editor-list">{phases.map((phase, index) => <div className="phase-editor-row" key={`${phase.key}-${index}`}><span className="phase-order mono">{index + 1}</span><input value={phase.label} onChange={(event) => updatePhase(index, { label: event.target.value, key: event.target.value.toLowerCase().replaceAll(' ', '_') || `phase_${index}` })} /><select value={phase.kind} onChange={(event) => updatePhase(index, { kind: event.target.value as InfusionPhaseTemplate['kind'] })}><option value="preparation">เตรียม</option><option value="premed">Pre-med</option><option value="infusion">ให้สารน้ำ/ยา</option><option value="observation">สังเกตอาการ</option></select><input type="number" min="1" value={phase.duration_min} onChange={(event) => updatePhase(index, { duration_min: Number(event.target.value) })} /><button className="icon-button" onClick={() => setPhases((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} aria-label="ลบขั้นตอน"><X size={16} /></button></div>)}</div>
      </div>
      <div><span className="field-label">เงื่อนไขความพร้อม</span><div className="check-grid">{([['active_order', 'มีคำสั่งแพทย์'], ['lab_verified', 'ผลแล็บผ่าน'], ['medication_ready', 'ยา/สารน้ำพร้อม']] as const).map(([key, label]) => <label className="check-card" key={key}><input type="checkbox" checked={requirements.includes(key)} onChange={() => toggleRequirement(key)} /><span>{label}</span></label>)}</div></div>
    </div>
    <div className="drawer-actions"><button className="button ghost" onClick={onClose}>ยกเลิก</button><button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก Template'}</button></div>
  </aside></div>
}

export default function InfusionPage() {
  const [board, setBoard] = useState<InfusionBoard | null>(null)
  const [user, setUser] = useState<PublicUser | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [selectedChairId, setSelectedChairId] = useState('')
  const [queueId, setQueueId] = useState('')
  const [durationOverride, setDurationOverride] = useState('')
  const [reason, setReason] = useState('')
  const [deltaMinutes, setDeltaMinutes] = useState('10')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('carelink-infusion-sound') === 'on')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([])
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyStatus, setHistoryStatus] = useState('')
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')
  const [historyOpen, setHistoryOpen] = useState('')
  const [resources, setResources] = useState<{ chairs: InfusionChair[]; templates: InfusionTemplate[] }>({ chairs: [], templates: [] })
  const [addCount, setAddCount] = useState('1')
  const [addDuration, setAddDuration] = useState('')
  const [templateEditor, setTemplateEditor] = useState<InfusionTemplate | 'new' | null>(null)
  const alerted = useRef(new Set<string>())
  const audioContext = useRef<AudioContext | null>(null)

  const canConfigure = user?.role === 'admin' || user?.role === 'manager'
  const selectedChair = board?.chairs.find((chair) => chair.id === selectedChairId) as ChairBoard | undefined
  const waitingQueue = board?.queue.filter((item) => item.status === 'waiting') || []

  const pushToast = useCallback((message: string, tone: ToastMessage['tone'] = 'success', persistent = false) => {
    const id = Date.now()
    setToasts((rows) => [...rows, { id, message, tone, persistent }])
    if (!persistent) window.setTimeout(() => setToasts((rows) => rows.filter((row) => row.id !== id)), 5000)
  }, [])

  const loadBoard = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try { setBoard(await clientApi.getInfusionBoard()) }
    catch (error) { pushToast(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ', 'danger') }
    finally { if (!quiet) setLoading(false) }
  }, [pushToast])

  const loadResources = useCallback(async () => {
    if (!canConfigure) return
    try { setResources(await clientApi.getInfusionResources()) }
    catch (error) { pushToast(error instanceof Error ? error.message : 'โหลดการตั้งค่าไม่สำเร็จ', 'danger') }
  }, [canConfigure, pushToast])

  const loadHistory = useCallback(async () => {
    try { setHistoryRows(await clientApi.getInfusionHistory({ q: historyQuery || undefined, status: historyStatus || undefined, from: historyFrom || undefined, to: historyTo || undefined }) as HistoryRow[]) }
    catch (error) { pushToast(error instanceof Error ? error.message : 'โหลดประวัติไม่สำเร็จ', 'danger') }
  }, [historyFrom, historyQuery, historyStatus, historyTo, pushToast])

  useEffect(() => {
    clientApi.getStaffMe().then(setUser).catch(() => null)
    const initialLoad = window.setTimeout(() => void loadBoard(), 0)
    const refresh = window.setInterval(() => void loadBoard(true), 15_000)
    const es = new EventSource('/api/realtime/stream?scope=staff')
    for (const eventName of ['chair_reserved', 'session_updated', 'chair_released', 'chairs_changed', 'templates_changed']) {
      es.addEventListener(eventName, () => void loadBoard(true))
    }
    return () => { window.clearTimeout(initialLoad); window.clearInterval(refresh); es.close() }
  }, [loadBoard])

  function changeTab(next: Tab) {
    setTab(next)
    if (next === 'history') void loadHistory()
    if (next === 'settings' && canConfigure) void loadResources()
  }

  const playAlert = useCallback(() => {
    if (!soundEnabled) return
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = audioContext.current || new AudioContextClass()
    audioContext.current = context
    void context.resume()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 720
    gain.gain.setValueAtTime(0.08, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45)
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.45)
  }, [soundEnabled])

  function toggleSound() {
    const next = !soundEnabled
    setSoundEnabled(next)
    window.localStorage.setItem('carelink-infusion-sound', next ? 'on' : 'off')
    if (next) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioContextClass) {
        audioContext.current ||= new AudioContextClass()
        void audioContext.current.resume()
      }
      pushToast('เปิดเสียงเตือนบนอุปกรณ์นี้แล้ว', 'info')
    }
  }

  const handleWarning = useCallback((session: InfusionSession) => {
    const phase = session.phases[session.current_phase_index]
    const key = `warning:${session.id}:${phase?.key || session.current_phase_index}`
    if (alerted.current.has(key)) return
    alerted.current.add(key)
    pushToast(`${session.patient?.display_name || 'ผู้ป่วย'} เหลือเวลาไม่เกิน 10 นาที`, 'warning', true)
  }, [pushToast])

  const handleDue = useCallback((session: InfusionSession) => {
    const phase = session.phases[session.current_phase_index]
    const key = `due:${session.id}:${phase?.key || session.current_phase_index}`
    if (alerted.current.has(key)) return
    alerted.current.add(key)
    pushToast(`${session.patient?.display_name || 'ผู้ป่วย'} ครบเวลาขั้นตอนปัจจุบัน`, 'warning', true)
    playAlert()
    void loadBoard(true)
  }, [loadBoard, playAlert, pushToast])

  async function run(action: () => Promise<unknown>, success: string, close = false) {
    setBusy(true)
    try {
      await action(); pushToast(success); setReason(''); await loadBoard(true)
      if (close) setSelectedChairId('')
    } catch (error) { pushToast(error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ', 'danger') }
    finally { setBusy(false) }
  }

  async function assignPatient() {
    if (!selectedChair || !queueId) return
    const selectedQueue = waitingQueue.find((item) => item.id === queueId)
    const bypassing = board?.suggested_next && board.suggested_next.id !== queueId
    if ((!selectedQueue?.readiness.ready || bypassing) && !reason.trim()) {
      pushToast('กรุณาระบุเหตุผลเมื่อ Override readiness หรือข้ามลำดับคิว', 'warning'); return
    }
    await run(() => clientApi.callInfusionPatient(selectedChair.id, queueId, {
      duration_override_min: durationOverride ? Number(durationOverride) : undefined,
      override_reason: reason.trim() || undefined,
    }), 'เรียกผู้ป่วยและจองเก้าอี้แล้ว')
  }

  async function addChairs() {
    await run(async () => { await clientApi.addInfusionChairs(Number(addCount), addDuration ? Number(addDuration) : undefined); await loadResources() }, 'เพิ่มเก้าอี้แล้ว')
  }

  const tabs = useMemo(() => [
    { id: 'overview' as const, label: 'ภาพรวม', icon: <Droplets size={17} aria-hidden="true" /> },
    { id: 'queue' as const, label: 'คิว', icon: <ListChecks size={17} aria-hidden="true" /> },
    { id: 'history' as const, label: 'ประวัติ', icon: <History size={17} aria-hidden="true" /> },
    ...(canConfigure ? [{ id: 'settings' as const, label: 'ตั้งค่า', icon: <Settings2 size={17} aria-hidden="true" /> }] : []),
  ], [canConfigure])

  return <StaffShell role="infusion_staff" displayName="พยาบาลห้องให้สารน้ำ">
    <div className="staff-page-stack infusion-page">
      <PageHeader eyebrow="Infusion lounge" title="ห้องให้สารน้ำและยาทางหลอดเลือด" description="ติดตามเก้าอี้ คิว ความพร้อม และเวลาแต่ละขั้นตอนจากหน้าจอเดียว" actions={<>
        <button className={`button ${soundEnabled ? 'secondary' : 'ghost'}`} onClick={toggleSound}>{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}{soundEnabled ? 'เสียงเตือนเปิด' : 'เสียงเตือนปิด'}</button>
        <button className="button ghost" onClick={() => void loadBoard()} disabled={loading}><RefreshCw size={16} /> รีเฟรช</button>
      </>} />

      <Tabs value={tab} items={tabs} onChange={changeTab} />

      {tab === 'overview' && <>
        <div className="infusion-kpi-grid">
          <div className="infusion-kpi primary"><span><Armchair size={17} /> เก้าอี้ใช้งาน</span><strong className="mono">{board?.kpis.active_chairs || 0}/{board?.kpis.total_chairs || 0}</strong><small>อัตราครองเก้าอี้</small></div>
          <div className="infusion-kpi"><span><Droplets size={17} /> กำลังให้บริการ</span><strong className="mono">{board?.kpis.infusing || 0}</strong><small>Session ที่กำลังนับเวลา</small></div>
          <div className={`infusion-kpi ${(board?.kpis.due || 0) > 0 ? 'danger' : ''}`}><span><AlarmClock size={17} /> ครบเวลา</span><strong className="mono">{board?.kpis.due || 0}</strong><small>รอเจ้าหน้าที่ยืนยัน</small></div>
          <div className="infusion-kpi"><span><Users size={17} /> คิวรอ</span><strong className="mono">{board?.kpis.waiting || 0}</strong><small>{board?.suggested_next ? `ถัดไป ${board.suggested_next.queue_no}` : 'ยังไม่มีคิวพร้อม'}</small></div>
        </div>
        <section className="workspace-card infusion-board-section">
          <div className="workspace-card-head"><div><span className="card-kicker"><Droplets size={15} /> สถานะปัจจุบัน</span><h3>ผังเก้าอี้ Infusion</h3></div><span className="updated-note"><i /> ข้อมูลสด · {board?.server_now ? new Date(board.server_now).toLocaleTimeString('th-TH') : '—'}</span></div>
          {loading ? <div className="modern-empty">กำลังโหลดผังเก้าอี้…</div> : !board?.chairs.length ? <EmptyState icon={<Armchair size={28} />} title="ยังไม่มีเก้าอี้เปิดใช้งาน" description="ให้ผู้จัดการเพิ่มเก้าอี้จากแท็บตั้งค่า" /> : <div className="infusion-chair-grid">{board.chairs.map((chair) => <ChairCard key={chair.id} chair={chair} serverNow={board.server_now} onOpen={() => { setSelectedChairId(chair.id); setQueueId(board.suggested_next?.id || ''); setReason(''); setDurationOverride('') }} onWarning={handleWarning} onDue={handleDue} />)}</div>}
        </section>
      </>}

      {tab === 'queue' && <div className="queue-layout">
        <section className="workspace-card"><div className="workspace-card-head"><div><span className="card-kicker"><ListChecks size={15} /> คิวหน้างาน</span><h3>รอเข้าเก้าอี้ {waitingQueue.length} ราย</h3></div></div>
          {waitingQueue.length === 0 ? <EmptyState icon={<UserRoundCheck size={27} />} title="ไม่มีผู้ป่วยรอเก้าอี้" description="คิวจะเข้ามาเมื่อ route ของผู้ป่วยมาถึง INFUSION" /> : <div className="infusion-queue-list">{waitingQueue.map((item, index) => <article className={`infusion-queue-row ${item.readiness.ready ? '' : 'not-ready'}`} key={item.id}>
            <div className="queue-rank mono">{String(index + 1).padStart(2, '0')}</div><div className="queue-main"><div><strong>{item.queue_no}</strong><span>{item.patient?.display_name || 'ผู้ป่วย'} · HN {item.patient?.hn || '—'}</span></div><small>{item.template_name}</small><Readiness item={item} /></div>
            <div className="queue-row-actions"><StatusBadge tone={item.readiness.ready ? 'success' : 'warning'}>{item.readiness.ready ? 'พร้อม' : 'ติดเงื่อนไข'}</StatusBadge><button className="button secondary" onClick={() => { const chair = board?.chairs.find((row) => !row.session); if (!chair) return pushToast('ยังไม่มีเก้าอี้ว่าง', 'warning'); setSelectedChairId(chair.id); setQueueId(item.id); setReason('') }}>จัดลงเก้าอี้ <ChevronRight size={15} /></button></div>
          </article>)}</div>}
        </section>
        <section className="workspace-card"><div className="workspace-card-head"><div><span className="card-kicker"><Clock3 size={15} /> Planned</span><h3>Order ที่ยังมาไม่ถึงสถานี</h3></div></div>
          {!board?.planned.length ? <EmptyState title="ไม่มี Planned order" /> : <div className="planned-list">{board.planned.map((item) => <div key={item.id}><Droplets size={17} /><span><strong>{item.patient?.display_name || 'ผู้ป่วย'}</strong><small>HN {item.patient?.hn || '—'} · {item.template_name}</small></span><StatusBadge tone="info">รอ route</StatusBadge></div>)}</div>}
        </section>
      </div>}

      {tab === 'history' && <section className="workspace-card">
        <div className="workspace-card-head history-head"><div><span className="card-kicker"><History size={15} /> ประวัติ Session</span><h3>ค้นย้อนหลังและตรวจสอบ Timeline</h3></div><div className="history-filters"><label className="search-field"><Search size={16} /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="ชื่อ, HN, เก้าอี้, ผู้ดำเนินการ" /></label><input aria-label="ตั้งแต่วันที่" type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} /><input aria-label="ถึงวันที่" type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} /><select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="">ทุกสถานะ</option><option value="completed">เสร็จแล้ว</option><option value="no_show">ไม่พบผู้ป่วย</option><option value="cancelled">ยกเลิก</option></select><button className="button secondary" onClick={() => void loadHistory()}>ค้นหา</button></div></div>
        {!historyRows.length ? <EmptyState icon={<History size={28} />} title="ไม่พบประวัติ" /> : <div className="history-list">{historyRows.map((row) => <article key={row.id} className="history-row"><button className="history-summary" onClick={() => setHistoryOpen((value) => value === row.id ? '' : row.id)}><span><strong>{row.patient?.display_name || 'ผู้ป่วย'}</strong><small className="mono">HN {row.patient?.hn || '—'}</small></span><span>{row.template_name}</span><span>{row.chair?.label || '—'}</span><span className="mono">{new Date(row.created_at).toLocaleString('th-TH')}</span><StatusBadge tone={statusMeta[row.status].tone}>{statusMeta[row.status].label}</StatusBadge><ChevronRight size={17} className={historyOpen === row.id ? 'rotated' : ''} /></button>{historyOpen === row.id && <div className="history-timeline">{row.events.length ? row.events.map((event) => <div key={event.id}><i /><span><strong>{actionLabel[event.action] || event.action}</strong><small>{new Date(event.created_at).toLocaleString('th-TH')}{event.performer?.display_name ? ` · ${event.performer.display_name}` : ''}{event.reason ? ` · ${event.reason}` : ''}</small></span></div>) : <small>ไม่มี Audit event สำหรับข้อมูลที่ migrate จากระบบเดิม</small>}</div>}</article>)}</div>}
      </section>}

      {tab === 'settings' && canConfigure && <div className="settings-stack">
        <section className="workspace-card"><div className="workspace-card-head"><div><span className="card-kicker"><Armchair size={15} /> ทรัพยากร</span><h3>เก้าอี้และค่าเวลาเริ่มต้น</h3><p>ปล่อยช่องเวลาเป็นค่าว่างเพื่อใช้เวลาจาก Template</p></div><div className="add-chair-form"><input type="number" min="1" max="50" value={addCount} onChange={(event) => setAddCount(event.target.value)} aria-label="จำนวนเก้าอี้" /><input type="number" min="1" value={addDuration} onChange={(event) => setAddDuration(event.target.value)} placeholder="เวลา Override (ถ้ามี)" /><button className="button primary" onClick={() => void addChairs()} disabled={busy}><Plus size={16} /> เพิ่มเก้าอี้</button></div></div><div className="resource-list">{resources.chairs.map((chair) => <ChairSettingRow key={chair.id} chair={chair} onSaved={loadResources} />)}</div></section>
        <section className="workspace-card"><div className="workspace-card-head"><div><span className="card-kicker"><SlidersHorizontal size={15} /> Service template</span><h3>ขั้นตอน เวลา และความพร้อม</h3><p>ค่าตัวอย่างต้องผ่านการทบทวน Clinical protocol ก่อนใช้งานจริง</p></div><button className="button primary" onClick={() => setTemplateEditor('new')}><Plus size={16} /> สร้าง Template</button></div><div className="template-grid">{resources.templates.map((template) => <button className="template-card" key={template.id} onClick={() => setTemplateEditor(template)}><div><Droplets size={18} /><span><strong>{template.name}</strong><small className="mono">{template.code}</small></span>{template.is_demo && <StatusBadge tone="warning">Demo</StatusBadge>}</div><div className="template-phases">{template.phases.map((phase) => <span key={phase.key}>{phase.label}<b className="mono">{phase.duration_min} นาที</b></span>)}</div><small>รวม {template.phases.reduce((sum, phase) => sum + phase.duration_min, 0)} นาที · {template.readiness_requirements.length} เงื่อนไข</small></button>)}</div></section>
      </div>}
    </div>

    {selectedChair && <div className="drawer-scrim" onMouseDown={() => setSelectedChairId('')}><aside className="app-drawer chair-drawer" onMouseDown={(event) => event.stopPropagation()}>
      <div className="drawer-head"><div><span className="eyebrow">{selectedChair.code}</span><h3>{selectedChair.label}</h3></div><button className="icon-button" onClick={() => setSelectedChairId('')} aria-label="ปิด"><X size={19} /></button></div>
      {!selectedChair.session ? <div className="drawer-content form-stack"><div className="drawer-section-title"><Users size={17} /><span><strong>เลือกผู้ป่วยจากคิว</strong><small>ระบบแนะนำคิวแรกที่ผ่าน readiness</small></span></div>{!waitingQueue.length ? <EmptyState title="ยังไม่มีคิวรอ" /> : <>
        <label><span>ผู้ป่วย</span><select value={queueId} onChange={(event) => setQueueId(event.target.value)}><option value="">เลือกคิว</option>{waitingQueue.map((item) => <option key={item.id} value={item.id}>{item.queue_no} · {item.patient?.display_name} · {item.template_name}{item.readiness.ready ? '' : ' (ติดเงื่อนไข)'}</option>)}</select></label>
        {queueId && <Readiness item={waitingQueue.find((item) => item.id === queueId)!} />}
        <label><span>เวลารวมเฉพาะเคส (นาที) — ไม่ระบุเพื่อใช้ค่าเก้าอี้/Template</span><input type="number" min="1" value={durationOverride} onChange={(event) => setDurationOverride(event.target.value)} placeholder="เช่น 90" /></label>
        <label><span>เหตุผล Override/ข้ามคิว</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="บังคับเมื่อผู้ป่วยยังไม่พร้อมหรือไม่ได้เลือกคิวที่ระบบแนะนำ" /></label>
      </>}</div> : <div className="drawer-content session-detail">
        <div className="session-patient-card"><div className="patient-avatar">{selectedChair.session.patient?.display_name?.slice(0, 1) || 'ผ'}</div><span><strong>{selectedChair.session.patient?.display_name || 'ผู้ป่วย'}</strong><small className="mono">HN {selectedChair.session.patient?.hn || '—'}</small></span><StatusBadge tone={statusMeta[selectedChair.session.status].tone}>{statusMeta[selectedChair.session.status].label}</StatusBadge></div>
        <div className="session-service"><span>บริการ</span><strong>{selectedChair.session.template_name}</strong></div>
        <div className="session-phase-list">{selectedChair.session.phases.map((phase, index) => <div className={`${phase.status} ${index === selectedChair.session!.current_phase_index ? 'current' : ''}`} key={phase.key}><span>{phase.status === 'completed' ? <CheckCircle2 size={16} /> : index === selectedChair.session!.current_phase_index ? <TimerReset size={16} /> : <i />}</span><div><strong>{phase.label}</strong><small>{Math.round(phase.effective_duration_sec / 60)} นาที</small></div>{index === selectedChair.session!.current_phase_index && board && <Countdown key={`${phase.key}:${phase.status}:${phase.remaining_sec}:${phase.started_at || ''}`} phase={phase} serverNow={board.server_now} onWarning={() => handleWarning(selectedChair.session!)} onDue={() => handleDue(selectedChair.session!)} />}</div>)}</div>
        <label><span>เหตุผลสำหรับพักเวลา ปรับเวลา หรือจบก่อนเวลา</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="ระบุเหตุผลเพื่อบันทึก Audit" /></label>
        {['active', 'paused', 'due'].includes(selectedChair.session.status) && <div className="time-adjust-row"><input type="number" value={deltaMinutes} onChange={(event) => setDeltaMinutes(event.target.value)} aria-label="จำนวนนาทีที่ปรับ" /><button className="button ghost" disabled={busy || !reason.trim()} onClick={() => void run(() => clientApi.adjustInfusionTime(selectedChair.session!.id, selectedChair.session!.version, Math.abs(Number(deltaMinutes)), reason), 'เพิ่มเวลาแล้ว')}><Plus size={15} /> เพิ่มนาที</button><button className="button ghost" disabled={busy || !reason.trim()} onClick={() => void run(() => clientApi.adjustInfusionTime(selectedChair.session!.id, selectedChair.session!.version, -Math.abs(Number(deltaMinutes)), reason), 'ลดเวลาแล้ว')}>ลดนาที</button></div>}
      </div>}
      <div className="drawer-actions">
        {!selectedChair.session && <button className="button primary full" disabled={busy || !queueId} onClick={() => void assignPatient()}><BellRing size={17} /> เรียกผู้ป่วยและจองเก้าอี้</button>}
        {selectedChair.session?.status === 'reserved' && !selectedChair.session.started_at && <><button className="button ghost" disabled={busy} onClick={() => void run(() => clientApi.recallInfusionPatient(selectedChair.session!.id), 'เรียกผู้ป่วยซ้ำแล้ว')}><BellRing size={16} /> เรียกซ้ำ</button><button className="button danger-outline" disabled={busy || !reason.trim()} onClick={() => void run(() => clientApi.noShowInfusionPatient(selectedChair.session!.id, reason), 'บันทึก No-show และปล่อยเก้าอี้แล้ว', true)}>ไม่พบผู้ป่วย</button><button className="button primary" disabled={busy} onClick={() => void run(() => clientApi.startInfusionPhase(selectedChair.session!.id, selectedChair.session!.version), 'เริ่มขั้นตอนแรกแล้ว')}><CirclePlay size={17} /> รับตัวและเริ่มเวลา</button></>}
        {selectedChair.session?.status === 'reserved' && selectedChair.session.started_at && <button className="button primary full" disabled={busy} onClick={() => void run(() => clientApi.startInfusionPhase(selectedChair.session!.id, selectedChair.session!.version), 'เริ่มขั้นตอนถัดไปแล้ว')}><CirclePlay size={17} /> เริ่มขั้นตอนถัดไป</button>}
        {selectedChair.session?.status === 'paused' && <button className="button primary" disabled={busy} onClick={() => void run(() => clientApi.startInfusionPhase(selectedChair.session!.id, selectedChair.session!.version), 'นับเวลาต่อแล้ว')}><CirclePlay size={17} /> นับเวลาต่อ</button>}
        {selectedChair.session?.status === 'active' && <><button className="button warning" disabled={busy || !reason.trim()} onClick={() => void run(() => clientApi.pauseInfusion(selectedChair.session!.id, selectedChair.session!.version, reason), 'พักเวลาแล้ว')}><CirclePause size={17} /> พักเวลา</button><button className="button secondary" disabled={busy || (selectedChair.session!.phases[selectedChair.session!.current_phase_index].remaining_sec > 0 && !reason.trim())} onClick={() => void run(() => clientApi.completeInfusionPhase(selectedChair.session!.id, selectedChair.session!.version, reason), 'จบขั้นตอนแล้ว')}>จบขั้นตอนก่อนเวลา</button></>}
        {selectedChair.session?.status === 'due' && selectedChair.session.current_phase_index < selectedChair.session.phases.length - 1 && <button className="button primary full" disabled={busy} onClick={() => void run(() => clientApi.completeInfusionPhase(selectedChair.session!.id, selectedChair.session!.version), 'ยืนยันจบขั้นตอนแล้ว')}><Check size={17} /> ยืนยันจบขั้นตอน</button>}
        {selectedChair.session?.status === 'due' && selectedChair.session.current_phase_index === selectedChair.session.phases.length - 1 && <button className="button primary full" disabled={busy} onClick={() => void run(() => clientApi.completeInfusionSession(selectedChair.session!.id, selectedChair.session!.version, reason), 'จบ Session และปล่อยเก้าอี้แล้ว', true)}><UserRoundCheck size={17} /> จบและปล่อยเก้าอี้</button>}
      </div>
    </aside></div>}

    {templateEditor && <TemplateEditor template={templateEditor === 'new' ? undefined : templateEditor} onClose={() => setTemplateEditor(null)} onSaved={loadResources} />}
    <ToastViewport messages={toasts} onDismiss={(id) => setToasts((rows) => rows.filter((row) => row.id !== id))} />
  </StaffShell>
}
