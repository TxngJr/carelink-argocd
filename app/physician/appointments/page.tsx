import { redirect } from 'next/navigation'
import { StaffShell } from '@/components/staff-shell'
import { DoctorAppointmentWorkspace } from '@/components/doctor-appointment-workspace'
import { pageSession } from '@/lib/server/auth'
import { roleHomePath } from '@/lib/access-control'

export default async function PhysicianAppointmentsPage() {
  const session = await pageSession()
  if (!session) redirect('/login/nurse')

  if (!['doctor', 'physician', 'admin'].includes(session.role)) {
    redirect(roleHomePath(session.role))
  }

  return (
    <StaffShell role={session.role} displayName={session.displayName || 'แพทย์'}>
      <DoctorAppointmentWorkspace />
    </StaffShell>
  )
}
