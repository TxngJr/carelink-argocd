import { describe, expect, it } from 'vitest'
import { OPERATIONS_MUTATION_ROLES, roleHomePath, routeAllowed, staffRealtimeChannelAllowed, stationAllowed } from '@/lib/access-control'
import type { Role } from '@/lib/types'

describe('ตารางสิทธิ์ CareLink', () => {
  it.each([
    ['registration', 'NPR', true], ['registration', 'VM', false],
    ['vitals_staff', 'VM', true], ['vitals_staff', 'MHT', false],
    ['nurse', 'MHT', true], ['nurse', 'PC', false], ['nurse', 'XR', false], ['nurse', 'LAB', false],
    ['doctor', 'PC2', true], ['doctor', 'LAB', false],
    ['lab_staff', 'LABC', true], ['lab_staff', 'PD', false],
    ['pharmacy_staff', 'PD', true], ['pharmacy_staff', 'INFUSION', false],
    ['infusion_staff', 'INFUSION', true], ['chemo_staff', 'INFUSION', true], ['patient', 'NPR', false],
  ] as Array<[Role, string, boolean]>)('%s ที่สถานี %s = %s', (role, station, allowed) => {
    expect(stationAllowed(role, station)).toBe(allowed)
  })

  it('ไม่ให้ผู้ป่วยเปิดหน้าเจ้าหน้าที่ และจำกัด Insights', () => {
    expect(routeAllowed('patient', '/operations')).toBe(false)
    expect(routeAllowed('doctor', '/operations')).toBe(true)
    expect(routeAllowed('doctor', '/operations/insights')).toBe(false)
    expect(routeAllowed('operations', '/operations/insights')).toBe(true)
  })

  it('ให้ doctor และ physician ใช้สิทธิ์แผนผังเดียวกัน', () => {
    expect(routeAllowed('doctor', '/map')).toBe(true)
    expect(routeAllowed('physician', '/map')).toBe(true)
  })

  it('จำกัด clinical workstation ที่มี action ให้ role ที่ API อนุญาตจริง', () => {
    expect(routeAllowed('manager', '/physician')).toBe(false)
    expect(routeAllowed('manager', '/lab')).toBe(false)
    expect(routeAllowed('doctor', '/lab')).toBe(false)
    expect(routeAllowed('physician', '/lab')).toBe(false)
    expect(routeAllowed('manager', '/pharmacy')).toBe(false)
    expect(routeAllowed('doctor', '/physician')).toBe(true)
    expect(routeAllowed('lab_staff', '/lab')).toBe(true)
    expect(routeAllowed('pharmacy_staff', '/pharmacy')).toBe(true)
  })

  it('legacy aliases ใช้สิทธิ์เดียวกับ workspace ปัจจุบัน', () => {
    expect(routeAllowed('doctor', '/doctor')).toBe(true)
    expect(routeAllowed('nurse', '/doctor')).toBe(false)
    expect(routeAllowed('infusion_staff', '/chemo')).toBe(true)
    expect(routeAllowed('chemo_staff', '/chemo')).toBe(true)
    expect(routeAllowed('pharmacy_staff', '/chemo')).toBe(false)
  })

  it.each([
    ['admin', '/operations'],
    ['manager', '/operations'],
    ['operations', '/operations'],
    ['nurse', '/intake'],
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

  it('role เฉพาะทางไม่ถูกส่งไปหน้าฝ่ายปฏิบัติการ', () => {
    expect(routeAllowed('registration', '/operations')).toBe(false)
    expect(routeAllowed('vitals_staff', '/operations')).toBe(false)
    expect(routeAllowed('lab_staff', '/operations')).toBe(false)
    expect(routeAllowed('pharmacy_staff', '/operations')).toBe(false)
    expect(routeAllowed('infusion_staff', '/operations')).toBe(false)
  })

  it('จำกัด mutation ฝ่ายปฏิบัติการไว้สามบทบาท', () => {
    expect(OPERATIONS_MUTATION_ROLES).toEqual(['admin', 'manager', 'operations'])
  })

  it('แยกช่อง realtime ของเจ้าหน้าที่ออกจากผู้ป่วยและจอสาธารณะ', () => {
    expect(staffRealtimeChannelAllowed('nurse', 'patient:abc')).toBe(false)
    expect(staffRealtimeChannelAllowed('admin', 'tv')).toBe(false)
    expect(staffRealtimeChannelAllowed('lab_staff', 'station:LAB')).toBe(true)
    expect(staffRealtimeChannelAllowed('lab_staff', 'station:PD')).toBe(false)
    expect(staffRealtimeChannelAllowed('nurse', 'station:XR')).toBe(false)
    expect(staffRealtimeChannelAllowed('chemo_staff', 'orders')).toBe(true)
  })
})
