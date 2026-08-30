import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getDb } from '@/lib/server/db'

function requestAddress(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'ไม่ทราบต้นทาง'
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

export async function rateLimit(request: NextRequest, scope: string, limit: number, windowMs = 60_000, identity?: string) {
  if (process.env.DISABLE_RATE_LIMIT === 'true') return true
  const now = Date.now()
  const bucketStart = Math.floor(now / windowMs) * windowMs
  const expiresAt = new Date(bucketStart + windowMs * 2)
  const key = `${scope}:${digest(identity || requestAddress(request))}:${bucketStart}`
  const row = await (await getDb()).collection('rate_limits').findOneAndUpdate(
    { _id: key },
    {
      $inc: { count: 1 },
      $setOnInsert: { scope, bucket_started_at: new Date(bucketStart), expires_at: expiresAt },
    },
    { upsert: true, returnDocument: 'after' },
  )
  return Number(row?.count || 0) <= limit
}
