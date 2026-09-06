import { describe, expect, it } from 'vitest'
import { buildDoctorRoute, NURSE_QUEUE_CODES, OPTIONAL_ROUTE_CODES } from '@/lib/stations'

describe('CareLink supported station routes', () => {
  it('จำกัดคิวพยาบาลไว้เฉพาะ workflow ที่มีหน้าจอรองรับจริง', () => {
    expect([...NURSE_QUEUE_CODES]).toEqual(['NPR', 'EV', 'VM', 'MHT'])
  })

  it('อนุญาต doctor route เฉพาะ station ที่มี operator workspace', () => {
    expect([...OPTIONAL_ROUTE_CODES]).toEqual(['LAB', 'LABC', 'INFUSION', 'PD'])
    expect(buildDoctorRoute(['LAB', 'PD'], 'DH')).toEqual(['LAB', 'PD', 'DH'])
    expect(buildDoctorRoute(['INFUSION'], 'IPW')).toEqual(['INFUSION', 'HA', 'IPW'])
  })

  it.each(['XR', 'CT', 'MRI', 'IR', 'HEM', 'SUR', 'GYN', 'ENT', 'OST', 'RC', 'TD'])(
    'ไม่สร้าง journey ใหม่ไปยัง map-only station %s',
    (station) => {
      expect(() => buildDoctorRoute([station], 'DH')).toThrow('ไม่รองรับใน workflow ปัจจุบัน')
    },
  )

  it('ปฏิเสธ station ซ้ำใน route เดียวกัน', () => {
    expect(() => buildDoctorRoute(['LAB', 'LAB'], 'DH')).toThrow('ห้ามเลือก Station ซ้ำ')
  })
})
