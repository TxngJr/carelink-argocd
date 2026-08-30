import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthForm } from './auth-form'

const mocks = vi.hoisted(() => ({
  getDevelopmentAccounts: vi.fn(),
  developmentLogin: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

vi.mock('@/lib/client', () => ({
  clientApi: {
    getDevelopmentAccounts: mocks.getDevelopmentAccounts,
    developmentLogin: mocks.developmentLogin,
  },
}))

describe('แบบฟอร์มเข้าสู่ระบบเจ้าหน้าที่', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDevelopmentAccounts.mockResolvedValue([
      { username: 'admin02', display_name: 'วิทยา ดูแลระบบ', role: 'admin', role_label: 'ผู้ดูแลระบบ', duty: 'ดูแลบัญชีผู้ใช้และสิทธิ์', department: 'ฝ่ายบริหารระบบสารสนเทศ', order: 1 },
      { username: 'doctor02', display_name: 'พญ. สิริกานต์ รักษาดี', role: 'doctor', role_label: 'แพทย์', duty: 'บันทึกการตรวจและสร้างคำสั่งรักษา', department: 'อายุรกรรมมะเร็งวิทยา', order: 501 },
      { username: 'infusion02', display_name: 'พว. ขวัญเรือน ให้สารน้ำ', role: 'infusion_staff', role_label: 'พยาบาลศูนย์ให้สารน้ำ', duty: 'จัดคิว เก้าอี้ และควบคุมเวลา', department: 'ศูนย์ให้สารน้ำและยาทางหลอดเลือด', order: 801 },
    ])
  })

  it('ซ่อนบัญชีสาธิตเมื่อไม่ได้เปิดโหมดพัฒนา', () => {
    render(<AuthForm mode="staff" />)

    expect(screen.queryByText('ตารางบัญชีผู้ใช้สำหรับทดสอบ')).not.toBeInTheDocument()
    expect(mocks.getDevelopmentAccounts).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument()
  })

  it('แสดงตารางบัญชีจากฐานข้อมูลพร้อมบทบาทและหน้าที่ภาษาไทยในโหมดพัฒนา', async () => {
    render(<AuthForm mode="staff" enableDevelopmentLogin />)

    expect(screen.getByText('ตารางบัญชีผู้ใช้สำหรับทดสอบ')).toBeInTheDocument()
    expect(await screen.findByText('วิทยา ดูแลระบบ')).toBeInTheDocument()
    expect(screen.getByText('doctor02')).toBeInTheDocument()
    expect(screen.getAllByText('แพทย์').length).toBeGreaterThan(0)
    expect(screen.getAllByText('พยาบาลศูนย์ให้สารน้ำ').length).toBeGreaterThan(0)
    expect(screen.getByText('บันทึกการตรวจและสร้างคำสั่งรักษา')).toBeInTheDocument()
    expect(screen.getByText('3 บัญชี')).toBeInTheDocument()
  })

  it('เข้าสู่บัญชีที่เลือกและเปิดพื้นที่ทำงานตามบทบาท', async () => {
    mocks.developmentLogin.mockResolvedValue({ token: 'token', user: { role: 'doctor' } })
    render(<AuthForm mode="staff" enableDevelopmentLogin />)

    fireEvent.click(await screen.findByRole('button', { name: 'เข้าสู่ระบบด้วยบัญชี doctor02 บทบาทแพทย์' }))

    await waitFor(() => expect(mocks.developmentLogin).toHaveBeenCalledWith('doctor02'))
    expect(mocks.replace).toHaveBeenCalledWith('/physician')
    expect(mocks.refresh).toHaveBeenCalled()
  })
})
