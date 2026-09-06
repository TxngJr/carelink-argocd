import type { NextRequest } from 'next/server'
import { dispatchApi } from '@/lib/server/api'
import { sessionFromRequest } from '@/lib/server/auth'
import { finalizeTerminalQueuesForEncounter } from '@/lib/server/terminal-flow'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ station: string; itemId: string }> }

type CompleteEnvelope = {
  success?: boolean
  data?: {
    next_queue_item?: { encounter_id?: string } | null
  }
}

export async function POST(request: NextRequest, context: Context) {
  const { station, itemId } = await context.params
  const response = await dispatchApi(request, ['stations', station, 'queue', itemId, 'complete'])
  if (!response.ok) return response

  try {
    const payload = await response.clone().json() as CompleteEnvelope
    const encounterId = payload.data?.next_queue_item?.encounter_id
    if (payload.success && encounterId) {
      const session = await sessionFromRequest(request)
      if (session) await finalizeTerminalQueuesForEncounter(encounterId, session.userId)
    }
  } catch (error) {
    console.error('terminal-flow queue finalization failed', error)
  }

  return response
}
