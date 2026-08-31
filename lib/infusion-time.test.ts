import { describe, expect, it } from 'vitest'
import { buildEffectivePhases, formatCountdown, materializeInfusionSession, phaseRemainingSeconds } from './infusion-time'
import type { InfusionPhase, InfusionPhaseTemplate, InfusionSession } from './types'

const template: InfusionPhaseTemplate[] = [
  { key: 'prep', label: 'เตรียม', kind: 'preparation', duration_min: 5 },
  { key: 'infusion', label: 'ให้สารน้ำ', kind: 'infusion', duration_min: 60 },
  { key: 'observe', label: 'สังเกต', kind: 'observation', duration_min: 10 },
]

describe('effective infusion plan', () => {
  it('uses case override before chair default before template', () => {
    const casePlan = buildEffectivePhases(template, 90, 120)
    expect(casePlan.map((phase) => phase.effective_duration_sec / 60)).toEqual([5, 105, 10])

    const chairPlan = buildEffectivePhases(template, 90)
    expect(chairPlan.map((phase) => phase.effective_duration_sec / 60)).toEqual([5, 75, 10])

    const templatePlan = buildEffectivePhases(template)
    expect(templatePlan.map((phase) => phase.effective_duration_sec / 60)).toEqual([5, 60, 10])
  })

  it('creates an immutable runtime snapshot', () => {
    const plan = buildEffectivePhases(template)
    plan[0].label = 'แก้ใน session'
    expect(template[0].label).toBe('เตรียม')
    expect(plan.every((phase) => phase.status === 'pending')).toBe(true)
  })
})

describe('server-time countdown', () => {
  const startedAt = '2026-08-30T03:00:00.000Z'
  const active: InfusionPhase = {
    ...template[1], status: 'active', effective_duration_sec: 3600, remaining_sec: 3600, started_at: startedAt,
  }

  it('continues from server timestamps after reconnect and clamps overdue at zero', () => {
    expect(phaseRemainingSeconds(active, Date.parse('2026-08-30T03:15:30.000Z'))).toBe(2670)
    expect(phaseRemainingSeconds(active, Date.parse('2026-08-30T04:30:00.000Z'))).toBe(0)
  })

  it('preserves stored remaining time while paused', () => {
    const paused = { ...active, status: 'paused' as const, remaining_sec: 1420, started_at: undefined }
    expect(phaseRemainingSeconds(paused, Date.parse('2030-01-01T00:00:00.000Z'))).toBe(1420)
  })

  it('marks an overdue current phase as due without completing the session', () => {
    const phases = buildEffectivePhases(template)
    phases[0] = { ...phases[0], status: 'active', started_at: startedAt, remaining_sec: 300 }
    const session: InfusionSession = {
      id: 'session-1', chair_id: 'chair-1', patient_id: 'patient-1', template_name: 'น้ำเกลือทั่วไป',
      service_kind: 'hydration', status: 'active', phases, current_phase_index: 0,
      planned_duration_sec: 4500, remaining_sec: 4500, progress_percent: 0, version: 1, created_at: startedAt,
    }
    const result = materializeInfusionSession(session, Date.parse('2026-08-30T03:06:00.000Z'))
    expect(result.status).toBe('due')
    expect(result.phases[0].status).toBe('due')
    expect(result.phases[1].status).toBe('pending')
    expect(result.remaining_sec).toBe(4200)
  })

  it('formats hours, minutes and seconds', () => {
    expect(formatCountdown(3723)).toBe('01:02:03')
    expect(formatCountdown(-20)).toBe('00:00:00')
  })
})
