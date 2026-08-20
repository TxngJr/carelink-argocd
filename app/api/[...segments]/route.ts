import type { NextRequest } from 'next/server'
import { dispatchApi } from '@/lib/server/api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ segments: string[] }> }

async function handler(request: NextRequest, context: Context) {
  const { segments } = await context.params
  return dispatchApi(request, segments)
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE }
