import { StaffShell } from '@/components/staff-shell'
import { DoctorAppointmentWorkspace } from '@/components/doctor-appointment-workspace'

export default function PhysicianAppointmentsPage() {
  return (
    <StaffShell role="doctor" displayName="แพทย์">
      <DoctorAppointmentWorkspace />
    </StaffShell>
  )
}
