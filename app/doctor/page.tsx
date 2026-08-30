import { redirect } from 'next/navigation'
import { pageSession } from '@/lib/server/auth'

export default async function DoctorPage() {
  const session = await pageSession()
  if (!session) redirect('/login/nurse')
  if (session.role === 'nurse') redirect('/intake')
  if (session.role !== 'doctor' && session.role !== 'physician') redirect('/login/nurse')
  redirect('/physician')
}
