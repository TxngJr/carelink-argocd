import { describe, expect, it } from 'vitest'
import { OPERATIONS_MUTATION_ROLES, routeAllowed, staffRealtimeChannelAllowed, stationAllowed } from '@/lib/access-control'
import type { Role } from '@/lib/types'

describe('ตารางสิทธิ์ CareLink', () => {
  it.each([
    ['registration', 'NPR', true], ['registration', 'VM', false],
    ['vitals_staff', 'VM', true], ['vitals_staff', 'MHT', false],
    ['nurse', 'MHT', true], ['nurse', 'PC', false],
    ['doctor', 'PC2', true], ['doctor', 'LAB', false],
    ['lab_staff', 'LABC', true], ['lab_staff', 'PD', false],
    ['pharmacy_staff', 'PD', true], ['pharmacy_staff', 'INFUSION', false],
    ['infusion_staff', 'INFUSION', true], ['patient', 'NPR', false],
  ] as Array<[Role, string, boolean]>)('%s ที่สถานี %s = %s', (role, station, allowed) => {
    expect(stationAllowed(role, station)).toBe(allowed)
  })

  it('ไม่ให้ผู้ป่วยเปิดหน้าเจ้าหน้าที่ และจำกัด Insights', () => {
    expect(routeAllowed('patient', '/operations')).toBe(false)
    expect(routeAllowed('doctor', '/operations')).toBe(true)
    expect(routeAllowed('doctor', '/operations/insights')).toBe(false)
    expect(routeAllowed('operations', '/operations/insights')).toBe(true)
  })

  it('จำกัด mutation ฝ่ายปฏิบัติการไว้สามบทบาท', () => {
    expect(OPERATIONS_MUTATION_ROLES).toEqual(['admin', 'manager', 'operations'])
  })

  it('แยกช่อง realtime ของเจ้าหน้าที่ออกจากผู้ป่วยและจอสาธารณะ', () => {
    expect(staffRealtimeChannelAllowed('nurse', 'patient:abc')).toBe(false)
    expect(staffRealtimeChannelAllowed('admin', 'tv')).toBe(false)
    expect(staffRealtimeChannelAllowed('lab_staff', 'station:LAB')).toBe(true)
    expect(staffRealtimeChannelAllowed('lab_staff', 'station:PD')).toBe(false)
  })
})
