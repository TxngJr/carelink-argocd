import { NextRequest } from 'next/server'
import { ObjectId, type ChangeStream } from 'mongodb'
import { eventBus } from '@/lib/server/events'
import { getDb } from '@/lib/server/db'
import { sessionFromRequest } from '@/lib/server/auth'
import type { RealtimeEnvelope } from '@/lib/types'
import { staffRealtimeChannelAllowed } from '@/lib/access-control'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const requestedScope = request.nextUrl.searchParams.get('scope') || 'staff'
  const session = await sessionFromRequest(request)
  let patientChannel = ''

  if (requestedScope !== 'public') {
    if (!session) return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบ' } }, { status: 401 })
    if (requestedScope === 'patient') {
      if (session.role !== 'patient') return Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์เปิดช่องข้อมูลนี้' } }, { status: 403 })
      const user = await (await getDb()).collection('users').findOne({ _id: new ObjectId(session.userId) })
      if (!user?.patient_id) return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลผู้ป่วย' } }, { status: 404 })
      patientChannel = `patient:${user.patient_id.toString()}`
    } else if (session.role === 'patient') {
      return Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์เปิดช่องข้อมูลเจ้าหน้าที่' } }, { status: 403 })
    }
  }

  const allowed = (event: RealtimeEnvelope) => {
    if (requestedScope === 'public') return event.channel === 'tv'
    if (requestedScope === 'patient') return event.channel === patientChannel
    return Boolean(session && staffRealtimeChannelAllowed(session.role, event.channel))
  }

  const encoder = new TextEncoder()
  let changeStream: ChangeStream | null = null
  const seen = new Set<string>()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RealtimeEnvelope) => {
        if (!allowed(event) || seen.has(event.id)) return
        seen.add(event.id)
        if (seen.size > 500) seen.delete(seen.values().next().value as string)
        controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
      }

      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString(), scope: requestedScope })}\n\n`))
      const unsubscribe = eventBus.subscribe(send)

      try {
        const db = await getDb()
        const lastId = request.headers.get('last-event-id')
        const last = lastId ? await db.collection('realtime_events').findOne({ id: lastId }) : null
        const since = last?.created_at instanceof Date ? last.created_at : new Date(Date.now() - 30_000)
        const recent = await db.collection('realtime_events').find({ created_at: { $gt: since } }).sort({ created_at: 1 }).limit(100).toArray()
        recent.forEach((row) => send({ id: String(row.id), channel: String(row.channel), type: String(row.type), payload: row.payload, timestamp: new Date(row.created_at).toISOString() }))

        changeStream = db.collection('realtime_events').watch([{ $match: { operationType: 'insert' } }], { fullDocument: 'updateLookup' })
        changeStream.on('change', (change) => {
          if (change.operationType !== 'insert') return
          const row = change.fullDocument
          send({ id: String(row.id), channel: String(row.channel), type: String(row.type), payload: row.payload, timestamp: new Date(row.created_at).toISOString() })
        })
      } catch (error) {
        controller.enqueue(encoder.encode(`event: degraded\ndata: ${JSON.stringify({ message: 'ใช้ช่องข้อมูลสำรองภายในเครื่อง', detail: error instanceof Error ? error.message : '' })}\n\n`))
      }

      const pingInterval = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ตรวจการเชื่อมต่อ ${Date.now()}\n\n`)) } catch { clearInterval(pingInterval) }
      }, 15_000)

      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval)
        unsubscribe()
        void changeStream?.close().catch(() => undefined)
        try { controller.close() } catch { /* ปิดไปแล้ว */ }
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
