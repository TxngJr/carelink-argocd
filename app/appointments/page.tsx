import { redirect } from 'next/navigation'
import { StaffDashboard } from '@/components/staff-dashboard'
import { pageSession } from '@/lib/server/auth'
import { roleHomePath } from '@/lib/access-control'

export default async function AppointmentsPage() {
  const session = await pageSession()
  if (!session) redirect('/login/nurse')

  if (session.role === 'nurse' || session.role === 'admin') {
    return <StaffDashboard role="nurse" displayName={session.displayName || 'เจ้าหน้าที่นัดหมาย'} />
  }

  redirect(roleHomePath(session.role))
}
