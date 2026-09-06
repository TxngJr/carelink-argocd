import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { roleHomePath } from '@/lib/access-control'
import { pageSession } from '@/lib/server/auth'

export const metadata: Metadata = { title: 'เข้าสู่ระบบบุคลากร' }
export default async function StaffLoginPage() {
  const session = await pageSession()
  if (session) redirect(roleHomePath(session.role))
  const enableDevelopmentLogin = ['development', 'public_demo'].includes(process.env.APP_ENV || '') || process.env.NODE_ENV === 'development'
  return <main className={`auth-page staff-auth${enableDevelopmentLogin ? ' development-auth' : ''}`}><div className="auth-side-copy"><span className="eyebrow light">พื้นที่ทำงานของทีมดูแล</span><h2>จัดการเส้นทางผู้ป่วย<br/>ได้จากหน้าจอเดียว</h2><p>นัดหมาย → เช็กอิน → คิว → ส่งต่อจุดบริการ → เสร็จสิ้นการรับบริการ</p></div><AuthForm mode="staff" enableDevelopmentLogin={enableDevelopmentLogin} /></main>
}
