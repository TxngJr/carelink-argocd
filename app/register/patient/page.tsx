import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { pageSession } from '@/lib/server/auth'

export const metadata: Metadata = { title: 'สมัครสมาชิกผู้ป่วย' }
export default async function PatientRegisterPage() {
  const session = await pageSession()
  if (session?.role === 'patient') redirect('/patient')
  return <main className="auth-page patient-auth"><div className="auth-side-copy"><span className="eyebrow light">เริ่มใช้งานครั้งแรก</span><h2>เริ่มต้นใช้งาน CareLink<br/>ด้วยบัญชีผู้ป่วย</h2><p>สมัครด้วยชื่อ เบอร์โทร วันเกิด และรหัสผ่าน จากนั้นส่งคำขอนัดได้ทันที</p></div><AuthForm mode="register" /></main>
}
