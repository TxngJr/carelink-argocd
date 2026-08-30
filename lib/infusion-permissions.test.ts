import { describe, expect, it } from 'vitest'
import { canConfigureInfusion, canCreateInfusionOrder, canOperateInfusion } from './infusion-permissions'

describe('Infusion Lounge permissions', () => {
  it.each(['doctor', 'physician', 'admin'] as const)('allows %s to create an infusion order', (role) => {
    expect(canCreateInfusionOrder(role)).toBe(true)
  })

  it.each(['infusion_staff', 'manager', 'admin', 'chemo_staff'] as const)('allows %s to operate sessions', (role) => {
    expect(canOperateInfusion(role)).toBe(true)
  })

  it('limits chair and template settings to manager and admin', () => {
    expect(canConfigureInfusion('manager')).toBe(true)
    expect(canConfigureInfusion('admin')).toBe(true)
    expect(canConfigureInfusion('infusion_staff')).toBe(false)
    expect(canConfigureInfusion('doctor')).toBe(false)
  })

  it.each(['nurse', 'registration', 'vitals_staff', 'lab_staff', 'pharmacy_staff', 'patient'] as const)('denies unrelated role %s', (role) => {
    expect(canOperateInfusion(role)).toBe(false)
    expect(canConfigureInfusion(role)).toBe(false)
    expect(canCreateInfusionOrder(role)).toBe(false)
  })
})
