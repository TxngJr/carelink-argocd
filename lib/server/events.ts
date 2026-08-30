import 'server-only'
import { randomUUID } from 'node:crypto'
import type { RealtimeEnvelope } from '@/lib/types'

type EventListener = (event: RealtimeEnvelope) => void

class GlobalEventBus {
  private listeners: Set<EventListener> = new Set()

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  broadcast(channel: string, type: string, payload: unknown) {
    const event: RealtimeEnvelope = {
      id: randomUUID(),
      channel,
      type,
      payload,
      timestamp: new Date().toISOString(),
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('Error delivering event to listener', err)
      }
    }
    void import('@/lib/server/db').then(async ({ getDb }) => {
      const db = await getDb()
      await db.collection('realtime_events').insertOne({ ...event, created_at: new Date(event.timestamp) })
    }).catch((error) => console.warn('บันทึกเหตุการณ์เรียลไทม์ไม่สำเร็จ:', error instanceof Error ? error.message : error))
    return event
  }

  get listenerCount(): number {
    return this.listeners.size
  }
}

// In Next.js dev & standalone, keep event bus on globalThis so hot reloads don't duplicate
const globalBus = (globalThis as unknown as { __carelink_event_bus?: GlobalEventBus })
if (!globalBus.__carelink_event_bus) {
  globalBus.__carelink_event_bus = new GlobalEventBus()
}

export const eventBus = globalBus.__carelink_event_bus
export function broadcast(channel: string, type: string, payload: unknown = {}) {
  eventBus.broadcast(channel, type, payload)
}
