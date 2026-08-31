import { NextResponse } from 'next/server'
import { pingDb } from '@/lib/server/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await pingDb()
    return NextResponse.json({ status: 'ready', service: 'carelink-next', db: true })
  } catch {
    return NextResponse.json({ status: 'not_ready', service: 'carelink-next', db: false }, { status: 503 })
  }
}
