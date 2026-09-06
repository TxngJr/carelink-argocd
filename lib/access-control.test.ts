import { describe, expect, it } from 'vitest'
import { OPERATIONS_MUTATION_ROLES, roleHomePath, routeAllowed, staffRealtimeChannelAllowed, stationAllowed } from '@/lib/access-control'
import type { Role } from '@/lib/types'

describe('ตารางสิทธิ์ CareLink แบบแยกบทบาท', () => {
  it.each([
    ['registration', 'NPR', true], ['registration', 'EV', true], ['registration', 'VM', false],
    ['vitals_staff', 'VM', true], ['vitals_staff', 'MHT', false],
    ['nurse', 'MHT', true], ['nurse', 'NPR', false], ['nurse', 'VM', false], ['nurse', 'PC', false],
    ['doctor', 'PC2', true], ['doctor', 'LAB', false],
    ['lab_staff', 'LABC', true], ['lab_staff', 'PD', false],
    ['pharmacy_staff', 'PD', true], ['pharmacy_staff', 'INFUSION', false],
    ['infusion_staff', 'INFUSION', true], ['chemo_staff', 'INFUSION', true],
    ['manager', 'MHT', false], ['operations', 'PC', false], ['patient', 'NPR', false],
  ] as Array<[Role, string, boolean]>)('%s ที่สถานี %s = %s', (role, station, allowed) => {
    expect(stationAllowed(role, station)).toBe(allowed)
  })

  it('จำกัด Operations ให้เฉพาะ admin/manager/operations', () => {
    expect(routeAllowed('manager', '/operations')).toBe(true)
    expect(routeAllowed('operations', '/operations/insights')).toBe(true)
    expect(routeAllowed('doctor', '/operations')).toBe(false)
    expect(routeAllowed('physician', '/map')).toBe(false)
    expect(routeAllowed('nurse', '/operations')).toBe(false)
  })

  it('แยกหน้า appointment ของพยาบาลออกจากแพทย์', () => {
    expect(routeAllowed('nurse', '/appointments')).toBe(true)
    expect(routeAllowed('doctor', '/appointments')).toBe(false)
    expect(routeAllowed('physician', '/appointments')).toBe(false)
    expect(routeAllowed('doctor', '/physician/appointments')).toBe(true)
    expect(routeAllowed('physician', '/physician/appointments')).toBe(true)
    expect(routeAllowed('nurse', '/physician/appointments')).toBe(false)
  })

  it('แต่ละ clinical role เปิดได้เฉพาะ workspace ที่รับผิดชอบ', () => {
    expect(routeAllowed('nurse', '/registration')).toBe(false)
    expect(routeAllowed('nurse', '/vitals')).toBe(false)
    expect(routeAllowed('registration', '/registration')).toBe(true)
    expect(routeAllowed('vitals_staff', '/vitals')).toBe(true)
    expect(routeAllowed('doctor', '/physician')).toBe(true)
    expect(routeAllowed('lab_staff', '/lab')).toBe(true)
    expect(routeAllowed('pharmacy_staff', '/pharmacy')).toBe(true)
    expect(routeAllowed('infusion_staff', '/infusion')).toBe(true)
    expect(routeAllowed('manager', '/infusion')).toBe(false)
  })

  it('legacy aliases ใช้สิทธิ์เดียวกับ workspace ปัจจุบัน', () => {
    expect(routeAllowed('nurse', '/nurse')).toBe(true)
    expect(routeAllowed('manager', '/nurse')).toBe(false)
    expect(routeAllowed('doctor', '/doctor')).toBe(true)
    expect(routeAllowed('nurse', '/doctor')).toBe(false)
    expect(routeAllowed('infusion_staff', '/chemo')).toBe(true)
    expect(routeAllowed('manager', '/chemo')).toBe(false)
  })

  it.each([
    ['admin', '/operations'],
    ['manager', '/operations'],
    ['operations', '/operations'],
    ['nurse', '/appointments'],
    ['doctor', '/physician'],
    ['physician', '/physician'],
    ['registration', '/registration'],
    ['vitals_staff', '/vitals'],
    ['lab_staff', '/lab'],
    ['pharmacy_staff', '/pharmacy'],
    ['infusion_staff', '/infusion'],
    ['chemo_staff', '/infusion'],
    ['patient', '/patient'],
  ] as Array<[Role, string]>)('หน้าหลักของ %s คือ %s และเข้าถึงได้', (role, expected) => {
    expect(roleHomePath(role)).toBe(expected)
    expect(routeAllowed(role, expected)).toBe(true)
  })

  it('จำกัด mutation ฝ่ายปฏิบัติการไว้สามบทบาท', () => {
    expect(OPERATIONS_MUTATION_ROLES).toEqual(['admin', 'manager', 'operations'])
  })

  it('realtime channel ไม่ข้ามขอบเขตบทบาท', () => {
    expect(staffRealtimeChannelAllowed('nurse', 'patient:abc')).toBe(false)
    expect(staffRealtimeChannelAllowed('admin', 'tv')).toBe(false)
    expect(staffRealtimeChannelAllowed('lab_staff', 'station:LAB')).toBe(true)
    expect(staffRealtimeChannelAllowed('lab_staff', 'station:PD')).toBe(false)
    expect(staffRealtimeChannelAllowed('nurse', 'station:NPR')).toBe(false)
    expect(staffRealtimeChannelAllowed('nurse', 'station:MHT')).toBe(true)
    expect(staffRealtimeChannelAllowed('manager', 'appointments')).toBe(false)
    expect(staffRealtimeChannelAllowed('doctor', 'appointments')).toBe(true)
    expect(staffRealtimeChannelAllowed('chemo_staff', 'orders')).toBe(true)
  })
})
