import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/server/auth'
import { STAFF_ROUTE_ACCESS } from '@/lib/access-control'

export async function proxy(request: NextRequest) {
  const rule = STAFF_ROUTE_ACCESS.find((item) => request.nextUrl.pathname === item.prefix || request.nextUrl.pathname.startsWith(`${item.prefix}/`))
  if (!rule) return NextResponse.next()

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    const login = new URL('/login/nurse', request.url)
    login.searchParams.set('กลับไป', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }
  if (!rule.roles.includes(session.role) && session.role !== 'admin') {
    const home = new URL('/', request.url)
    home.searchParams.set('ไม่อนุญาต', '1')
    return NextResponse.redirect(home)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/operations/:path*',
    '/map/:path*',
    '/registration/:path*',
    '/vitals/:path*',
    '/intake/:path*',
    '/physician/:path*',
    '/lab/:path*',
    '/pharmacy/:path*',
    '/infusion/:path*',
  ],
}
