import { NextRequest } from 'next/server'
import { eventBus } from '@/lib/server/events'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat and connected event
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString() })}\n\n`))

      const unsubscribe = eventBus.subscribe((event) => {
        try {
          const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(payload))
        } catch {
          // Stream might be closed
        }
      })

      // Send ping every 15 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`))
        } catch {
          clearInterval(pingInterval)
        }
      }, 15000)

      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Ignore
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
