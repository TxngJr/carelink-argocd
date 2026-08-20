import { redirect } from 'next/navigation'
import { PatientDashboard } from '@/components/patient-dashboard'
import { pageSession } from '@/lib/server/auth'

export default async function PatientPage() {
  const session = await pageSession()
  if (!session || session.role !== 'patient') redirect('/login/patient')
  return <PatientDashboard displayName={session.displayName || 'ผู้ป่วย'} />
}
