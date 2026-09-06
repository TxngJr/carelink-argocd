import type { NextRequest } from 'next/server'
import { dispatchApi } from '@/lib/server/api'
import { sessionFromRequest } from '@/lib/server/auth'
import { staffApiAllowed } from '@/lib/api-access-control'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ segments: string[] }> }

async function handler(request: NextRequest, context: Context) {
  const { segments } = await context.params
  const session = await sessionFromRequest(request)

  if (session && !staffApiAllowed(session.role, request.method, segments)) {
    return Response.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'บทบาทนี้ไม่มีสิทธิ์ใช้งาน API ของส่วนงานนี้' } },
      { status: 403 },
    )
  }

  return dispatchApi(request, segments)
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE }
