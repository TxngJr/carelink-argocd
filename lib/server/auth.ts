import 'server-only'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import { ObjectId } from 'mongodb'
import type { Role } from '@/lib/types'

export const SESSION_COOKIE = 'carelink_session'
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'carelink-demo-jwt-secret-denmannsolutions-2026')

export type Session = {
  userId: string
  role: Role
  displayName: string
}

export async function signSession(session: Session) {
  return new SignJWT({ role: session.role, display_name: session.displayName })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret)
}

export async function verifySessionToken(token?: string | null): Promise<Session | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    if (!payload.sub || !ObjectId.isValid(payload.sub)) return null
    if (!['nurse', 'doctor', 'patient'].includes(String(payload.role))) return null
    return {
      userId: payload.sub,
      role: payload.role as Role,
      displayName: String(payload.display_name || ''),
    }
  } catch {
    return null
  }
}

export async function sessionFromRequest(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null
  return verifySessionToken(bearer || request.cookies.get(SESSION_COOKIE)?.value)
}

export async function pageSession() {
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value)
}

export function attachSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
