import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { pageSession } from '@/lib/server/auth'

export const metadata: Metadata = { title: 'เข้าสู่ระบบบุคลากร' }
export default async function StaffLoginPage() {
  const session = await pageSession()
  if (session?.role === 'nurse') redirect('/nurse')
  if (session?.role === 'doctor') redirect('/doctor')
  if (session?.role === 'patient') redirect('/patient')
  return <main className="auth-page staff-auth"><div className="auth-side-copy"><span className="eyebrow light">CARE TEAM WORKSPACE</span><h2>จัดการ Patient Flow<br/>ได้จากหน้าจอเดียว</h2><p>นัดหมาย → เช็กอิน → คิว → ส่งต่อ Station → เสร็จสิ้น Visit</p></div><AuthForm mode="staff" /></main>
}
