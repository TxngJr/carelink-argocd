import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { pageSession } from '@/lib/server/auth'

export const metadata: Metadata = { title: 'เข้าสู่ระบบบุคลากร' }
export default async function StaffLoginPage() {
  const session = await pageSession()
  if (session?.role === 'admin' || session?.role === 'manager') redirect('/operations')
  if (session?.role === 'nurse') redirect('/intake')
  if (session?.role === 'doctor' || session?.role === 'physician') redirect('/physician')
  if (session?.role === 'registration') redirect('/registration')
  if (session?.role === 'vitals_staff') redirect('/vitals')
  if (session?.role === 'lab_staff') redirect('/lab')
  if (session?.role === 'pharmacy_staff') redirect('/pharmacy')
  if (session?.role === 'infusion_staff' || session?.role === 'chemo_staff') redirect('/infusion')
  if (session?.role === 'patient') redirect('/patient')
  const enableDevelopmentLogin = ['development', 'public_demo'].includes(process.env.APP_ENV || '') || process.env.NODE_ENV === 'development'
  return <main className={`auth-page staff-auth${enableDevelopmentLogin ? ' development-auth' : ''}`}><div className="auth-side-copy"><span className="eyebrow light">พื้นที่ทำงานของทีมดูแล</span><h2>จัดการเส้นทางผู้ป่วย<br/>ได้จากหน้าจอเดียว</h2><p>นัดหมาย → เช็กอิน → คิว → ส่งต่อจุดบริการ → เสร็จสิ้นการรับบริการ</p></div><AuthForm mode="staff" enableDevelopmentLogin={enableDevelopmentLogin} /></main>
}
