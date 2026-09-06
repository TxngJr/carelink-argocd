import { redirect } from 'next/navigation'
import { StaffDashboard } from '@/components/staff-dashboard'
import { pageSession } from '@/lib/server/auth'

export default async function AppointmentsPage() {
  const session = await pageSession()
  if (!session) redirect('/login/nurse')
  if (session.role === 'doctor' || session.role === 'physician') {
    return <StaffDashboard role="doctor" displayName={session.displayName || 'แพทย์'} />
  }
  if (['admin', 'manager', 'nurse'].includes(session.role)) {
    return <StaffDashboard role="nurse" displayName={session.displayName || 'เจ้าหน้าที่นัดหมาย'} />
  }
  redirect('/login/nurse')
}
