import { describe, expect, it } from 'vitest'
import { evaluateInfusionReadiness, suggestInfusionQueue } from './infusion-domain'

describe('infusion readiness', () => {
  it('requires every configured condition', () => {
    const result = evaluateInfusionReadiness(
      ['active_order', 'lab_verified', 'medication_ready'],
      { active_order: true, lab_verified: false, medication_ready: true },
    )
    expect(result.ready).toBe(false)
    expect(result.requirements.find((item) => item.key === 'lab_verified')?.ready).toBe(false)
  })

  it('allows an explicit readiness override and retains its reason', () => {
    const result = evaluateInfusionReadiness(
      ['active_order', 'lab_verified'],
      { active_order: true, lab_verified: false, medication_ready: false },
      { enabled: true, reason: 'แพทย์ยืนยันให้ดำเนินการ' },
    )
    expect(result).toMatchObject({ ready: true, overridden: true, override_reason: 'แพทย์ยืนยันให้ดำเนินการ' })
  })
})

describe('FIFO suggestion', () => {
  it('keeps blocked patients in place and suggests the first later ready queue', () => {
    const rows = [
      { id: 'Q1', readiness: { ready: false, requirements: [] } },
      { id: 'Q2', readiness: { ready: false, requirements: [] } },
      { id: 'Q3', readiness: { ready: true, requirements: [] } },
      { id: 'Q4', readiness: { ready: true, requirements: [] } },
    ]
    const result = suggestInfusionQueue(rows)
    expect(result.suggested?.id).toBe('Q3')
    expect(result.bypassed.map((item) => item.id)).toEqual(['Q1', 'Q2'])
    expect(rows.map((item) => item.id)).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
  })

  it('returns no suggestion when nobody is ready', () => {
    expect(suggestInfusionQueue([{ id: 'Q1', readiness: { ready: false, requirements: [] } }]).suggested).toBeUndefined()
  })
})
