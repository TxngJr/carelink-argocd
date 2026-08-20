import { redirect } from 'next/navigation'
import { StaffDashboard } from '@/components/staff-dashboard'
import { pageSession } from '@/lib/server/auth'

export default async function DoctorPage() {
  const session = await pageSession()
  if (!session) redirect('/login/nurse')
  if (session.role === 'nurse') redirect('/nurse')
  if (session.role !== 'doctor') redirect('/login/nurse')
  return <StaffDashboard role="doctor" displayName={session.displayName || 'แพทย์'} />
}
