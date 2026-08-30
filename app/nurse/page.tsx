import { redirect } from 'next/navigation'
import { pageSession } from '@/lib/server/auth'

export default async function NursePage() {
  const session = await pageSession()
  if (!session) redirect('/login/nurse')
  if (session.role === 'doctor') redirect('/physician')
  if (session.role !== 'nurse') redirect('/login/nurse')
  redirect('/intake')
}
