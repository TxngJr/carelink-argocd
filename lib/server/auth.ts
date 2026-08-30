import 'server-only'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
import type { Role } from '@/lib/types'

export const SESSION_COOKIE = 'carelink_session'

export type Session = {
  userId: string
  role: Role
  displayName: string
  sessionId: string
  demoSessionId: string
}

const SESSION_ROLES: Role[] = [
  'admin', 'manager', 'operations', 'nurse', 'doctor', 'physician', 'registration',
  'vitals_staff', 'lab_staff', 'pharmacy_staff', 'infusion_staff', 'chemo_staff', 'patient',
]

function normalizeRole(value: unknown): Role | null {
  const role = String(value || '') as Role
  if (!SESSION_ROLES.includes(role)) return null
  return role === 'chemo_staff' ? 'infusion_staff' : role
}

function sessionSecret() {
  const configured = process.env.JWT_SECRET
  if (configured) return new TextEncoder().encode(configured)
  if (process.env.NODE_ENV === 'production') throw new Error('ต้องกำหนด JWT_SECRET ก่อนเปิดระบบ production')
  return new TextEncoder().encode('carelink-local-development-secret')
}

export async function signSession(session: Omit<Session, 'sessionId' | 'demoSessionId'> & { sessionId?: string }) {
  const demoSessionId = session.sessionId || randomUUID()
  return new SignJWT({ role: session.role, display_name: session.displayName, demo_session_id: demoSessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(session.userId)
    .setJti(demoSessionId)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(sessionSecret())
}

export async function verifySessionToken(token?: string | null): Promise<Session | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ['HS256'] })
    if (!payload.sub || !payload.jti || !ObjectId.isValid(payload.sub)) return null
    const role = normalizeRole(payload.role)
    if (!role) return null
    return {
      userId: payload.sub,
      role,
      displayName: String(payload.display_name || ''),
      sessionId: payload.jti,
      demoSessionId: String(payload.demo_session_id || payload.jti),
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
