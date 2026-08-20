import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { attachSessionCookie, clearSessionCookie, sessionFromRequest, signSession } from '@/lib/server/auth'
import {
  DomainError,
  appointmentDetail,
  authenticate,
  callNext,
  cancelByStaff,
  cancelPatientAppointment,
  completeQueue,
  confirmAppointment,
  confirmCheckIn,
  createAppointment,
  currentAppointment,
  getStationQueue,
  getUser,
  listAppointments,
  markNotificationRead,
  patientJourney,
  patientNotifications,
  proposeAppointment,
  publicDocument,
  recallQueue,
  registerPatient,
  reportArrival,
  requeue,
  setDoctorRoute,
  skipQueue,
  startQueue,
  stationAllowed,
  updateAppointment,
} from '@/lib/server/domain'
import type { Role } from '@/lib/types'

const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) })
const registerSchema = z.object({ display_name: z.string().trim().min(1), phone: z.string().trim().min(8), birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), password: z.string().min(6) })
const measurementsSchema = z.object({
  height_cm: z.number().finite().optional(), weight_kg: z.number().finite().optional(),
  sbp: z.number().int().optional(), dbp: z.number().int().optional(), spo2: z.number().int().optional(),
}).default({})
const appointmentSchema = z.object({ chief_complaint: z.string().trim().min(1), measurements: measurementsSchema })
const scheduleSchema = z.object({ appointment_at: z.string().min(1), note: z.string().default(''), assigned_pc: z.string().optional() })

function ok(data: unknown = null, message = 'OK', status = 200) {
  return NextResponse.json({ success: true, data: publicDocument(data), message }, { status })
}
function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}
async function body(request: NextRequest) {
  try { return await request.json() } catch { throw new DomainError('ข้อมูล JSON ไม่ถูกต้อง') }
}
async function auth(request: NextRequest, roles?: Role[]) {
  const session = await sessionFromRequest(request)
  if (!session) throw new DomainError('กรุณาเข้าสู่ระบบ', 'UNAUTHORIZED', 401)
  if (roles && !roles.includes(session.role)) throw new DomainError('ไม่มีสิทธิ์ใช้งานส่วนนี้', 'FORBIDDEN', 403)
  return session
}
function idAt(segments: string[], index: number) {
  const value = segments[index]
  if (!value) throw new DomainError('ID ไม่ถูกต้อง')
  return value
}

export async function dispatchApi(request: NextRequest, segments: string[]) {
  try {
    const method = request.method.toUpperCase()
    const path = segments.join('/')

    if (method === 'POST' && path === 'auth/login') {
      const input = loginSchema.parse(await body(request))
      const user = await authenticate(input.username, input.password)
      if (!['nurse', 'doctor'].includes(user.role)) throw new DomainError('บัญชีผู้ป่วยกรุณาใช้หน้าเข้าสู่ระบบผู้ป่วย', 'FORBIDDEN', 403)
      const token = await signSession({ userId: user._id.toHexString(), role: user.role as Role, displayName: user.display_name })
      const response = ok({ token, user })
      attachSessionCookie(response, token)
      return response
    }
    if (method === 'POST' && path === 'mobile/auth/login') {
      const input = loginSchema.parse(await body(request))
      const user = await authenticate(input.username, input.password, 'patient')
      const token = await signSession({ userId: user._id.toHexString(), role: 'patient', displayName: user.display_name })
      const response = ok({ token, user: { _id: user._id, display_name: user.display_name, role: user.role } })
      attachSessionCookie(response, token)
      return response
    }
    if (method === 'POST' && path === 'mobile/auth/register') {
      const input = registerSchema.parse(await body(request))
      const user = await registerPatient(input.display_name, input.phone, input.birth_date, input.password)
      if (!user) throw new DomainError('สมัครสมาชิกไม่สำเร็จ', 'REGISTRATION_ERROR', 500)
      const token = await signSession({ userId: user._id.toHexString(), role: 'patient', displayName: user.display_name })
      const response = ok({ token, user: { _id: user._id, display_name: user.display_name, role: user.role } }, 'สมัครสมาชิกสำเร็จ', 201)
      attachSessionCookie(response, token)
      return response
    }
    if (method === 'POST' && path === 'auth/logout') {
      const response = ok()
      clearSessionCookie(response)
      return response
    }
    if (method === 'GET' && path === 'auth/me') {
      const session = await auth(request)
      const user = await getUser(session.userId)
      if (!user) throw new DomainError('ไม่พบผู้ใช้', 'NOT_FOUND', 404)
      return ok(user)
    }
    if (method === 'GET' && path === 'mobile/me') {
      const session = await auth(request, ['patient'])
      const user = await getUser(session.userId)
      if (!user) throw new DomainError('ไม่พบผู้ใช้', 'NOT_FOUND', 404)
      return ok({ _id: user._id, display_name: user.display_name, role: user.role, username: user.username })
    }
    if (method === 'GET' && path === 'mobile/journey/current') {
      const session = await auth(request, ['patient'])
      return ok(await patientJourney(session.userId))
    }
    if (method === 'GET' && path === 'mobile/notifications') {
      const session = await auth(request, ['patient'])
      return ok(await patientNotifications(session.userId))
    }
    if (method === 'PATCH' && segments[0] === 'mobile' && segments[1] === 'notifications' && segments[3] === 'read') {
      const session = await auth(request, ['patient'])
      await markNotificationRead(session.userId, idAt(segments, 2))
      return ok()
    }

    if (segments[0] === 'mobile' && segments[1] === 'appointment-requests') {
      const session = await auth(request, ['patient'])
      if (method === 'POST' && segments.length === 2) {
        const input = appointmentSchema.parse(await body(request))
        return ok(await createAppointment(session.userId, input.chief_complaint, input.measurements), 'ส่งคำขอนัดสำเร็จ', 201)
      }
      if (method === 'GET' && segments[2] === 'current') return ok(await currentAppointment(session.userId))
      if (method === 'PATCH' && segments.length === 3) {
        const input = appointmentSchema.parse(await body(request))
        return ok(await updateAppointment(session.userId, idAt(segments, 2), input.chief_complaint, input.measurements), 'แก้ไขคำขอสำเร็จ')
      }
      if (method === 'POST' && segments[3] === 'cancel') {
        const input = z.object({ reason: z.string().default('') }).parse(await body(request))
        await cancelPatientAppointment(session.userId, idAt(segments, 2), input.reason)
        return ok(null, 'ยกเลิกคำขอแล้ว')
      }
      if (method === 'POST' && segments[3] === 'report-arrival') return ok(await reportArrival(session.userId, idAt(segments, 2)), 'แจ้งการมาถึงแล้ว กรุณารอพยาบาลยืนยัน')
    }

    if (segments[0] === 'nurse') {
      await auth(request, ['nurse'])
      if (method === 'GET' && path === 'nurse/appointment-requests') return ok(await listAppointments(request.nextUrl.searchParams.get('status') || undefined))
      if (method === 'GET' && segments[1] === 'appointment-requests' && segments.length === 3) return ok(await appointmentDetail(idAt(segments, 2)))
      if (method === 'POST' && segments[1] === 'appointment-requests' && segments[3] === 'propose') {
        const input = scheduleSchema.parse(await body(request))
        return ok(await proposeAppointment(idAt(segments, 2), input.appointment_at, input.note), 'เสนอวันนัดแล้ว')
      }
      if (method === 'POST' && segments[1] === 'appointment-requests' && segments[3] === 'cancel') {
        const input = z.object({ reason: z.string().default('') }).parse(await body(request))
        await cancelByStaff(idAt(segments, 2), input.reason)
        return ok(null, 'ยกเลิกคำขอแล้ว')
      }
      if (method === 'GET' && path === 'nurse/arrivals/today') return ok(await listAppointments('arrival_reported'))
      if (method === 'POST' && segments[1] === 'appointment-requests' && segments[3] === 'confirm-checkin') return ok(await confirmCheckIn(idAt(segments, 2)), 'ยืนยันเช็กอินและออกคิวแล้ว')
    }

    if (segments[0] === 'doctor') {
      await auth(request, ['doctor'])
      if (method === 'GET' && path === 'doctor/appointment-requests') return ok(await listAppointments(request.nextUrl.searchParams.get('status') || undefined))
      if (method === 'POST' && segments[1] === 'appointment-requests' && segments[3] === 'confirm') {
        const input = scheduleSchema.extend({ assigned_pc: z.enum(['PC', 'PC2', 'PC3', 'PC4']) }).parse(await body(request))
        return ok(await confirmAppointment(idAt(segments, 2), input.appointment_at, input.assigned_pc, input.note), 'ยืนยันวันนัดแล้ว')
      }
      if (method === 'POST' && segments[1] === 'encounters' && segments[3] === 'route') {
        const input = z.object({ station_codes: z.array(z.string()).min(1) }).parse(await body(request))
        return ok(await setDoctorRoute(idAt(segments, 2), input.station_codes), 'บันทึกเส้นทางแล้ว')
      }
    }

    if (segments[0] === 'stations' && segments[1]) {
      const session = await auth(request, ['nurse', 'doctor'])
      const code = segments[1]
      if (!stationAllowed(session.role, code)) throw new DomainError('บทบาทนี้ไม่มีสิทธิ์จัดการ Station นี้', 'FORBIDDEN', 403)
      if (method === 'GET' && segments[2] === 'queue' && segments.length === 3) return ok(await getStationQueue(code))
      if (method === 'POST' && segments[2] === 'call-next') return ok({ queue_item: await callNext(code, session.userId) }, 'เรียกคิวสำเร็จ')
      if (method === 'POST' && segments[2] === 'queue' && segments[3] && segments[4]) {
        const itemId = segments[3]
        switch (segments[4]) {
          case 'start': return ok({ queue_item: await startQueue(code, itemId, session.userId) }, 'เริ่มให้บริการแล้ว')
          case 'complete': return ok(await completeQueue(code, itemId, session.userId), 'เสร็จสิ้น Station แล้ว')
          case 'recall': return ok({ queue_item: await recallQueue(code, itemId, session.userId) }, 'เรียกซ้ำสำเร็จ')
          case 'skip': return ok({ queue_item: await skipQueue(code, itemId, session.userId) }, 'ข้ามคิวสำเร็จ')
          case 'requeue': return ok({ queue_item: await requeue(code, itemId, session.userId) }, 'นำคิวกลับเข้าแถวสำเร็จ')
        }
      }
    }

    return fail(404, 'NOT_FOUND', 'ไม่พบ API ที่ร้องขอ')
  } catch (error) {
    if (error instanceof z.ZodError) return fail(400, 'VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูลที่กรอก')
    if (error instanceof DomainError) return fail(error.status, error.code, error.message)
    console.error('CareLink API error', error)
    return fail(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาด กรุณาลองใหม่')
  }
}
