import { redirect } from 'next/navigation'
import { StaffDashboard } from '@/components/staff-dashboard'
import { pageSession } from '@/lib/server/auth'

export default async function NursePage() {
  const session = await pageSession()
  if (!session) redirect('/login/nurse')
  if (session.role === 'doctor') redirect('/doctor')
  if (session.role !== 'nurse') redirect('/login/nurse')
  return <StaffDashboard role="nurse" displayName={session.displayName || 'พยาบาล'} />
}
