import type { InfusionPhase, InfusionPhaseTemplate, InfusionSession } from '@/lib/types'

export function buildEffectivePhases(
  phases: InfusionPhaseTemplate[],
  chairDefaultMin?: number,
  caseOverrideMin?: number,
): InfusionPhase[] {
  const requestedTotal = Number(caseOverrideMin || chairDefaultMin || 0)
  const primaryIndex = Math.max(0, phases.findIndex((phase) => phase.kind === 'infusion'))
  const fixedMinutes = phases.reduce((sum, phase, index) => index === primaryIndex ? sum : sum + phase.duration_min, 0)
  const primaryMinutes = requestedTotal > 0
    ? Math.max(1, requestedTotal - fixedMinutes)
    : Math.max(1, phases[primaryIndex]?.duration_min || 1)

  return phases.map((phase, index) => {
    const durationSec = (index === primaryIndex ? primaryMinutes : phase.duration_min) * 60
    return {
      ...phase,
      status: 'pending',
      effective_duration_sec: durationSec,
      remaining_sec: durationSec,
    }
  })
}

export function phaseRemainingSeconds(phase: InfusionPhase, nowMs = Date.now()) {
  if (phase.status !== 'active' || !phase.started_at) return Math.max(0, phase.remaining_sec)
  const elapsed = Math.max(0, Math.floor((nowMs - new Date(phase.started_at).getTime()) / 1000))
  return Math.max(0, phase.remaining_sec - elapsed)
}

export function materializeInfusionSession<T extends InfusionSession>(session: T, nowMs = Date.now()): T {
  const phases = session.phases.map((phase, index) => {
    if (index !== session.current_phase_index || phase.status !== 'active') return phase
    const remaining = phaseRemainingSeconds(phase, nowMs)
    return { ...phase, remaining_sec: remaining, status: remaining === 0 ? 'due' as const : phase.status }
  })
  const remainingSec = phases.reduce((sum, phase, index) => {
    if (phase.status === 'completed' || index < session.current_phase_index) return sum
    return sum + (index === session.current_phase_index ? phase.remaining_sec : phase.effective_duration_sec)
  }, 0)
  const planned = Math.max(1, phases.reduce((sum, phase) => sum + phase.effective_duration_sec, 0))
  const progress = Math.min(100, Math.max(0, Math.round((1 - remainingSec / planned) * 100)))
  const current = phases[session.current_phase_index]
  return {
    ...session,
    phases,
    remaining_sec: remainingSec,
    planned_duration_sec: planned,
    progress_percent: progress,
    status: current?.status === 'due' ? 'due' : session.status,
  }
}

export function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}
