import { describe, expect, it } from 'vitest'
import { DEVELOPMENT_ACCOUNTS, DEVELOPMENT_ROLE_DEFINITIONS } from './development-accounts'

const ACTIVE_DEMO_STAFF_ROLES = [
  'admin',
  'manager',
  'operations',
  'registration',
  'nurse',
  'vitals_staff',
  'doctor',
  'lab_staff',
  'pharmacy_staff',
  'infusion_staff',
]

describe('บัญชีผู้ใช้สำหรับโหมดพัฒนา', () => {
  it('ครอบคลุมทุกบทบาทเจ้าหน้าที่ที่ใช้จริงใน demo และมีสี่บัญชีต่อบทบาท', () => {
    expect(DEVELOPMENT_ROLE_DEFINITIONS.map((definition) => definition.role)).toEqual(ACTIVE_DEMO_STAFF_ROLES)
    DEVELOPMENT_ROLE_DEFINITIONS.forEach((definition) => expect(definition.users).toHaveLength(4))
    expect(DEVELOPMENT_ACCOUNTS).toHaveLength(40)
    expect(new Set(DEVELOPMENT_ACCOUNTS.map((account) => account.username)).size).toBe(40)
  })

  it('มีบัญชีศูนย์ปฏิบัติการสำหรับทดสอบ role operations โดยตรง', () => {
    const operations = DEVELOPMENT_ACCOUNTS.find((account) => account.username === 'operations')
    expect(operations?.role).toBe('operations')
    expect(operations?.department).toContain('ศูนย์ปฏิบัติการ')
  })

  it('ทุกบัญชีมีข้อมูล mock ที่จำเป็นต่อการแสดงตารางและการกำหนดสิทธิ์ครบถ้วน', () => {
    DEVELOPMENT_ACCOUNTS.forEach((account) => {
      expect(account.display_name).not.toBe('')
      expect(account.role_label).not.toBe('')
      expect(account.department).not.toBe('')
      expect(account.duty).not.toBe('')
      expect(account.station_codes.length).toBeGreaterThan(0)
      expect(account.permissions.length).toBeGreaterThan(0)
      expect(Number.isFinite(account.order)).toBe(true)
    })
  })

  it('แต่ละบทบาทมีบัญชีหลักที่ใช้ชื่อมาตรฐานสำหรับ E2E และการสาธิต', () => {
    const requiredUsernames = [
      'admin',
      'manager',
      'operations',
      'registration',
      'nurse',
      'vitals',
      'doctor',
      'lab',
      'pharmacy',
      'infusion',
    ]

    requiredUsernames.forEach((username) => {
      expect(DEVELOPMENT_ACCOUNTS.some((account) => account.username === username), username).toBe(true)
    })
  })
})
