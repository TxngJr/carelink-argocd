import { redirect } from 'next/navigation'
import { StaffShell } from '@/components/staff-shell'
import { NurseAppointmentWorkspace } from '@/components/nurse-appointment-workspace'
import { pageSession } from '@/lib/server/auth'
import { roleHomePath } from '@/lib/access-control'

export default async function AppointmentsPage() {
  const session = await pageSession()
  if (!session) redirect('/login/nurse')

  if (session.role !== 'nurse' && session.role !== 'admin') {
    redirect(roleHomePath(session.role))
  }

  return (
    <StaffShell role={session.role} displayName={session.displayName || 'เจ้าหน้าที่นัดหมาย'}>
      <NurseAppointmentWorkspace />
    </StaffShell>
  )
}
