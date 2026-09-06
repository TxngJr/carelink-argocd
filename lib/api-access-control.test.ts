import { describe, expect, it } from 'vitest'
import { staffApiAllowed } from '@/lib/api-access-control'

describe('API RBAC', () => {
  it('แยก nurse, registration และ vitals API ออกจากกัน', () => {
    expect(staffApiAllowed('nurse', 'GET', ['nurse', 'appointment-requests'])).toBe(true)
    expect(staffApiAllowed('nurse', 'POST', ['registration', 'patients'])).toBe(false)
    expect(staffApiAllowed('nurse', 'POST', ['vitals', 'enc-1'])).toBe(false)
    expect(staffApiAllowed('registration', 'POST', ['registration', 'patients'])).toBe(true)
    expect(staffApiAllowed('vitals_staff', 'POST', ['vitals', 'enc-1'])).toBe(true)
  })

  it('แพทย์ยืนยันนัดผ่าน doctor API แต่ห้ามใช้ nurse appointment API', () => {
    expect(staffApiAllowed('doctor', 'GET', ['doctor', 'appointment-requests'])).toBe(true)
    expect(staffApiAllowed('physician', 'POST', ['doctor', 'appointment-requests', 'a1', 'confirm'])).toBe(true)
    expect(staffApiAllowed('doctor', 'GET', ['nurse', 'appointment-requests'])).toBe(false)
    expect(staffApiAllowed('doctor', 'POST', ['nurse', 'appointment-requests', 'a1', 'confirm-checkin'])).toBe(false)
  })

  it('จำกัด operational API ให้ manager/operations และให้ patient directory เป็น read-only', () => {
    expect(staffApiAllowed('manager', 'GET', ['operations', 'snapshot'])).toBe(true)
    expect(staffApiAllowed('operations', 'GET', ['map', 'overview'])).toBe(true)
    expect(staffApiAllowed('manager', 'GET', ['registration', 'patients'])).toBe(true)
    expect(staffApiAllowed('operations', 'GET', ['registration', 'patients'])).toBe(true)
    expect(staffApiAllowed('manager', 'POST', ['registration', 'patients'])).toBe(false)
    expect(staffApiAllowed('doctor', 'GET', ['operations', 'snapshot'])).toBe(false)
    expect(staffApiAllowed('manager', 'POST', ['stations', 'MHT', 'call-next'])).toBe(false)
  })

  it('แยก clinical service APIs ตามเจ้าหน้าที่ประจำจุด', () => {
    expect(staffApiAllowed('lab_staff', 'GET', ['lab', 'queue'])).toBe(true)
    expect(staffApiAllowed('lab_staff', 'GET', ['pharmacy', 'queue'])).toBe(false)
    expect(staffApiAllowed('pharmacy_staff', 'GET', ['pharmacy', 'queue'])).toBe(true)
    expect(staffApiAllowed('infusion_staff', 'GET', ['infusion', 'board'])).toBe(true)
    expect(staffApiAllowed('manager', 'GET', ['infusion', 'board'])).toBe(false)
  })

  it('แพทย์อ่าน infusion template เพื่อออก order ได้ แต่ห้ามควบคุม Infusion Lounge', () => {
    expect(staffApiAllowed('doctor', 'GET', ['infusion', 'templates'])).toBe(true)
    expect(staffApiAllowed('doctor', 'GET', ['infusion', 'board'])).toBe(false)
    expect(staffApiAllowed('doctor', 'POST', ['infusion', 'chairs', '1', 'call'])).toBe(false)
  })

  it('shared encounter detail เป็น read-only สำหรับ staff workspace', () => {
    expect(staffApiAllowed('doctor', 'GET', ['encounters', 'enc-1'])).toBe(true)
    expect(staffApiAllowed('nurse', 'GET', ['encounters', 'enc-1'])).toBe(true)
    expect(staffApiAllowed('patient', 'GET', ['encounters', 'enc-1'])).toBe(false)
    expect(staffApiAllowed('registration', 'POST', ['encounters'])).toBe(false)
  })
})
