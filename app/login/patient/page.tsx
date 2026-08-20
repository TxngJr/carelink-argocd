import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { pageSession } from '@/lib/server/auth'

export const metadata: Metadata = { title: 'เข้าสู่ระบบผู้ป่วย' }
export default async function PatientLoginPage() {
  const session = await pageSession()
  if (session?.role === 'patient') redirect('/patient')
  if (session?.role === 'nurse') redirect('/nurse')
  if (session?.role === 'doctor') redirect('/doctor')
  return <main className="auth-page patient-auth"><div className="auth-side-copy"><span className="eyebrow light">YOUR CARE JOURNEY</span><h2>รู้ว่าตอนนี้อยู่ขั้นตอนไหน<br/>และต้องไปที่ไหนต่อ</h2><p>ติดตามคิว เวลารอ จุดบริการถัดไป และการแจ้งเตือนผ่านเว็บบนมือถือ</p></div><AuthForm mode="patient" /></main>
}
