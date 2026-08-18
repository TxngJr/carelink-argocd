import { describe, expect, it } from 'vitest'
import { buildDoctorRoute } from './route'

describe('buildDoctorRoute', () => {
  it('builds outpatient route', () => {
    expect(buildDoctorRoute(['LAB', 'RC', 'PD'], 'DH')).toEqual(['LAB', 'RC', 'PD', 'DH'])
  })

  it('builds admission route', () => {
    expect(buildDoctorRoute([], 'IPW')).toEqual(['HA', 'IPW'])
  })

  it('rejects duplicate and prefix stations', () => {
    expect(() => buildDoctorRoute(['LAB', 'LAB'], 'DH')).toThrow()
    expect(() => buildDoctorRoute(['NPR'], 'DH')).toThrow()
  })
})
