import { describe, expect, it } from 'vitest'
import { DEVELOPMENT_ACCOUNTS, DEVELOPMENT_ROLE_DEFINITIONS } from './development-accounts'

describe('บัญชีผู้ใช้สำหรับโหมดพัฒนา', () => {
  it('มีสี่บัญชีต่อบทบาทและชื่อบัญชีไม่ซ้ำกัน', () => {
    expect(DEVELOPMENT_ROLE_DEFINITIONS).toHaveLength(10)
    DEVELOPMENT_ROLE_DEFINITIONS.forEach((definition) => expect(definition.users).toHaveLength(4))
    expect(DEVELOPMENT_ACCOUNTS).toHaveLength(40)
    expect(new Set(DEVELOPMENT_ACCOUNTS.map((account) => account.username)).size).toBe(40)
  })

  it('มีบัญชีศูนย์ปฏิบัติการสำหรับทดสอบ role operations โดยตรง', () => {
    const operations = DEVELOPMENT_ACCOUNTS.find((account) => account.username === 'operations')
    expect(operations?.role).toBe('operations')
    expect(operations?.department).toContain('ศูนย์ปฏิบัติการ')
  })

  it('ทุกบัญชีมีชื่อ บทบาท หน่วยงาน และคำอธิบายหน้าที่ครบถ้วน', () => {
    DEVELOPMENT_ACCOUNTS.forEach((account) => {
      expect(account.display_name).not.toBe('')
      expect(account.role_label).not.toBe('')
      expect(account.department).not.toBe('')
      expect(account.duty).not.toBe('')
    })
  })
})
