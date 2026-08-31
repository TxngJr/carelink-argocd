import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Db } from 'mongodb'
import { attachSessionCookie, clearSessionCookie, SESSION_COOKIE, sessionFromRequest, signSession } from '@/lib/server/auth'
import {
  DomainError,
  acceptRecommendation,
  addTriageMessage,
  appointmentDetail,
  authenticate,
  callNext,
  cancelByStaff,
  cancelPatientAppointment,
  collectLabSample,
  completeQueue,
  confirmAppointment,
  confirmCheckIn,
  createAppointment,
  createHelpRequest,
  createOrders,
  createTriageSession,
  currentAppointment,
  dispensePharmacy,
  getCurrentTriageSession,
  getActivePatientFlow,
  getEncounterDetail,
  getFlowSchedule,
  getLabQueue,
  getKioskJourney,
  getLatestVitals,
  getMapOverview,
  getOperationsSnapshot,
  getOperationsInsights,
  getPatient,
  getPharmacyQueue,
  getPrevisit,
  getStationQueue,
  getTvBoard,
  getUser,
  listAppointments,
  listEncounters,
  listHelpRequests,
  markAllNotificationsRead,
  markNotificationRead,
  markUrgent,
  patientJourney,
  patientNotifications,
  proposeAppointment,
  publicDocument,
  readyPharmacy,
  recallQueue,
  registerPatient,
  registerPatientByStaff,
  rejectRecommendation,
  reportArrival,
  reportBottleneck,
  requeue,
  resolveHelpRequest,
  saveAssessment,
  saveConsultation,
  saveLabResults,
  savePrevisit,
  saveVitals,
  searchPatients,
  setDoctorRoute,
  skipQueue,
  startPreparePharmacy,
  startQueue,
  stationAllowed,
  submitTriageSession,
  updateAppointment,
  verifyLabResults,
} from '@/lib/server/domain'
import {
  addInfusionChairs,
  adjustInfusionTime,
  callPatientToChair,
  completeInfusionPhase,
  completeInfusionSession,
  createInfusionTemplate,
  getInfusionBoard,
  getInfusionHistory,
  listActiveInfusionTemplates,
  listInfusionResources,
  noShowInfusionPatient,
  pauseInfusion,
  recallInfusionPatient,
  startInfusionPhase,
  updateInfusionChair,
  updateInfusionTemplate,
} from '@/lib/server/infusion'
import { getDb } from '@/lib/server/db'
import { rateLimit } from '@/lib/server/rate-limit'
import {
  developmentLoginEnabled,
  findDevelopmentAccount,
  listDevelopmentAccounts,
} from '@/lib/server/development-accounts'
import {
  INFUSION_CONFIGURATOR_ROLES,
  INFUSION_OPERATOR_ROLES,
  INFUSION_TEMPLATE_VIEWER_ROLES,
} from '@/lib/infusion-permissions'
import type { OrderItem, Role } from '@/lib/types'

const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) })
const developmentLoginSchema = z.object({
  username: z.string().trim().min(1).max(64).regex(/^[a-z0-9._-]+$/),
})
const registerSchema = z.object({
  display_name: z.string().trim().min(1),
  phone: z.string().trim().min(8),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  password: z.string().min(6),
})
const staffRegisterSchema = registerSchema.omit({ password: true }).extend({
  insurance_type: z.string().trim().min(1).max(120),
})
const kioskLookupSchema = z.object({
  identifier: z.string().trim().min(4).max(30),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
const measurementsSchema = z.object({
  height_cm: z.number().finite().optional(),
  weight_kg: z.number().finite().optional(),
  sbp: z.number().int().optional(),
  dbp: z.number().int().optional(),
  spo2: z.number().int().optional(),
}).default({})
const appointmentSchema = z.object({ chief_complaint: z.string().trim().min(1), measurements: measurementsSchema })
const scheduleSchema = z.object({ appointment_at: z.string().min(1), note: z.string().default(''), assigned_pc: z.string().optional() })
const infusionPhaseSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.enum(['preparation', 'premed', 'infusion', 'observation']),
  duration_min: z.number().int().min(1).max(1440),
})
const infusionTemplateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  service_kind: z.enum(['hydration', 'iv_medication', 'chemotherapy']),
  phases: z.array(infusionPhaseSchema).min(1).max(10),
  readiness_requirements: z.array(z.enum(['active_order', 'lab_verified', 'medication_ready'])).min(1),
})
const orderItemSchema = z.object({
  id: z.string().optional().default(''),
  type: z.enum(['lab', 'imaging', 'medication', 'infusion', 'procedure']),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(240),
  quantity: z.number().int().min(1).max(10_000).optional(),
  dosage: z.string().max(240).optional(),
  frequency: z.string().max(240).optional(),
  route: z.string().max(120).optional(),
  instructions: z.string().max(1_000).optional(),
  status: z.enum(['ordered', 'in_progress', 'sample_collected', 'analyzed', 'prepared', 'ready', 'dispensed', 'completed', 'cancelled']).default('ordered'),
  target_station: z.string().max(40).optional(),
  service_template_id: z.string().optional(),
  planned_for: z.string().datetime().optional(),
  duration_override_min: z.number().int().min(1).max(1440).optional(),
}).superRefine((item, context) => {
  if (item.type === 'infusion' && !item.service_template_id) {
    context.addIssue({ code: 'custom', path: ['service_template_id'], message: 'กรุณาเลือก Template Infusion' })
  }
})
const ordersSchema = z.object({ items: z.array(orderItemSchema).min(1).max(100), notes: z.string().max(2_000).optional() })
const vitalsSchema = z.object({
  sbp: z.number().int().min(40).max(300),
  dbp: z.number().int().min(20).max(200),
  pulse: z.number().int().min(20).max(250).optional(),
  temperature: z.number().min(30).max(45).optional(),
  respiratory_rate: z.number().int().min(4).max(80).optional(),
  spo2: z.number().int().min(50).max(100).optional(),
  weight_kg: z.number().min(2).max(500).optional(),
  height_cm: z.number().min(50).max(250).optional(),
  pain_score: z.number().int().min(0).max(10).optional(),
  consciousness: z.enum(['alert', 'voice', 'pain', 'unresponsive']).optional(),
  triage_level: z.enum(['ESI-1', 'ESI-2', 'ESI-3', 'ESI-4', 'ESI-5', 'urgent', 'normal', 'fast_track']).optional(),
  notes: z.string().trim().max(2_000).default(''),
})
const assessmentSchema = z.object({
  chief_complaint: z.string().trim().min(1).max(1_000),
  history_of_illness: z.string().trim().max(4_000).default(''),
  triage_level: z.enum(['normal', 'urgent', 'emergency', 'fast_track']),
  is_urgent: z.boolean().default(false),
  is_fast_track: z.boolean().default(false),
  nurse_notes: z.string().trim().max(4_000).default(''),
})
const versionSchema = z.object({ version: z.number().int().min(1) })
const recommendationDecisionSchema = versionSchema.extend({ reason: z.string().trim().min(3).max(1_000) })
const labResultsSchema = versionSchema.extend({ results: z.record(z.string(), z.unknown()) })

function ok(data: unknown = null, message = 'สำเร็จ', status = 200) {
  return NextResponse.json({ success: true, data: publicDocument(data), message }, { status })
}
function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}
async function body(request: NextRequest) {
  try {
    return await request.json()
  } catch {
    throw new DomainError('ข้อมูล JSON ไม่ถูกต้อง')
  }
}
async function auth(request: NextRequest, roles?: Role[]) {
  const session = await sessionFromRequest(request)
  if (!session) throw new DomainError('กรุณาเข้าสู่ระบบ', 'UNAUTHORIZED', 401)
  if (roles && !roles.includes(session.role) && session.role !== 'admin') {
    throw new DomainError('ไม่มีสิทธิ์ใช้งานส่วนนี้', 'FORBIDDEN', 403)
  }
  return session
}

function mutationOriginAllowed(request: NextRequest) {
  const origin = request.headers.get('origin')
  const cookieMutation = Boolean(request.cookies.get(SESSION_COOKIE)?.value)
  if (!origin) return !cookieMutation || Boolean(request.headers.get('authorization'))
  try {
    const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host
    const requestProtocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '')
    return new URL(origin).origin === `${requestProtocol}://${requestHost}`
  } catch {
    return false
  }
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

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!mutationOriginAllowed(request)) throw new DomainError('ไม่อนุญาตคำขอจากเว็บไซต์อื่น', 'FORBIDDEN', 403)
      const session = await sessionFromRequest(request)
      const allowed = await rateLimit(request, 'mutation', Number(process.env.DEMO_WRITE_RATE || 60), 60_000, session?.sessionId)
      if (!allowed) throw new DomainError('ทำรายการถี่เกินไป กรุณารอสักครู่', 'RATE_LIMITED', 429)
      if (session) {
        await (await getDb()).collection('audit_requests').insertOne({
          actor_id: session.userId,
          actor_role: session.role,
          demo_session_id: session.demoSessionId,
          method,
          action: path,
          created_at: new Date(),
        })
      }
    }

    // Public / Dev routes
    if (path === 'dev/seed' && method === 'POST') {
      throw new DomainError('ปิดการรีเซ็ตข้อมูลผ่านเว็บไซต์ กรุณาใช้คำสั่งผู้ดูแลระบบ', 'NOT_FOUND', 404)
    }
    if (path === 'tv' && method === 'GET') {
      const station = request.nextUrl.searchParams.get('station') || undefined
      return ok(await getTvBoard(station))
    }
    if (path === 'map/overview' && method === 'GET') {
      await auth(request, ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse'])
      return ok(await getMapOverview())
    }
    if (path === 'kiosk/lookup' && method === 'POST') {
      if (!await rateLimit(request, 'kiosk', 20)) throw new DomainError('ค้นหาถี่เกินไป กรุณารอสักครู่', 'RATE_LIMITED', 429)
      const input = kioskLookupSchema.parse(await body(request))
      return ok(await getKioskJourney(input.identifier, input.birth_date))
    }

    // 1. Auth routes
    if (method === 'GET' && path === 'auth/development-accounts') {
      if (!developmentLoginEnabled()) {
        throw new DomainError('ไม่เปิดใช้งานรายการบัญชีสำหรับทดสอบ', 'NOT_FOUND', 404)
      }
      return ok(await listDevelopmentAccounts(await getDb() as unknown as Db))
    }
    if (method === 'POST' && path === 'auth/development-login') {
      if (!developmentLoginEnabled()) {
        throw new DomainError('ไม่เปิดใช้งานการเข้าสู่ระบบแบบเลือกบทบาท', 'NOT_FOUND', 404)
      }
      if (!await rateLimit(request, 'development-login', Number(process.env.DEMO_AUTH_RATE || 10))) throw new DomainError('เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่', 'RATE_LIMITED', 429)
      const input = developmentLoginSchema.parse(await body(request))
      const user = await findDevelopmentAccount(await getDb() as unknown as Db, input.username)
      if (!user) throw new DomainError('ไม่พบบัญชีเจ้าหน้าที่สำหรับทดสอบ', 'NOT_FOUND', 404)
      const token = await signSession({ userId: user._id.toHexString(), role: user.role as Role, displayName: user.display_name })
      const response = ok({ token, user: { _id: user._id, username: user.username, display_name: user.display_name, role: user.role } })
      attachSessionCookie(response, token)
      return response
    }
    if (method === 'POST' && path === 'auth/login') {
      if (!await rateLimit(request, 'staff-login', Number(process.env.DEMO_AUTH_RATE || 10))) throw new DomainError('เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่', 'RATE_LIMITED', 429)
      const input = loginSchema.parse(await body(request))
      const user = await authenticate(input.username, input.password)
      const token = await signSession({ userId: user._id.toHexString(), role: user.role as Role, displayName: user.display_name })
      const response = ok({ token, user })
      attachSessionCookie(response, token)
      return response
    }
    if (method === 'POST' && path === 'mobile/auth/login') {
      if (!await rateLimit(request, 'patient-login', Number(process.env.DEMO_AUTH_RATE || 10))) throw new DomainError('เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่', 'RATE_LIMITED', 429)
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

    // 2. Patient Mobile App APIs
    if (segments[0] === 'mobile') {
      const session = await auth(request, ['patient'])

      if (method === 'GET' && segments[1] === 'journey' && segments[2] === 'current') {
        return ok(await patientJourney(session.userId))
      }
      if (method === 'GET' && segments[1] === 'notifications') {
        return ok(await patientNotifications(session.userId))
      }
      if (method === 'PATCH' && segments[1] === 'notifications' && segments[2] === 'read-all') {
        await markAllNotificationsRead(session.userId)
        return ok(null, 'อ่านทั้งหมดแล้ว')
      }
      if (method === 'PATCH' && segments[1] === 'notifications' && segments[3] === 'read') {
        await markNotificationRead(session.userId, idAt(segments, 2))
        return ok()
      }
      if (segments[1] === 'appointment-requests') {
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
        if (method === 'POST' && segments[3] === 'report-arrival') {
          return ok(await reportArrival(session.userId, idAt(segments, 2)), 'แจ้งการมาถึงแล้ว กรุณารอพยาบาลยืนยัน')
        }
      }
      if (segments[1] === 'previsit' && segments[2] === 'current') {
        if (method === 'GET') return ok(await getPrevisit(session.userId))
        if (method === 'PUT' || method === 'POST') {
          const input = await body(request)
          return ok(await savePrevisit(session.userId, input), 'บันทึกข้อมูลก่อนมารับบริการแล้ว')
        }
      }
      if (segments[1] === 'triage') {
        if (segments[2] === 'sessions') {
          if (method === 'POST' && segments.length === 3) return ok(await createTriageSession(session.userId))
          if (method === 'GET' && segments[3] === 'current') return ok(await getCurrentTriageSession(session.userId))
          if (method === 'POST' && segments[4] === 'messages') {
            const input = z.object({ message: z.string().min(1) }).parse(await body(request))
            return ok(await addTriageMessage(session.userId, idAt(segments, 3), input.message))
          }
          if (method === 'POST' && segments[4] === 'submit') {
            return ok(await submitTriageSession(session.userId, idAt(segments, 3)), 'ส่งข้อมูลคัดกรองให้พยาบาลแล้ว')
          }
        }
      }
      if (method === 'POST' && segments[1] === 'help-request') {
        const input = z.object({ category: z.enum(['directions', 'queue', 'clinical', 'other']), message: z.string().min(1) }).parse(await body(request))
        return ok(await createHelpRequest(session.userId, input), 'ส่งคำขอความช่วยเหลือแล้ว ทีมดูแลจะติดต่อคุณโดยเร็ว')
      }
    }

    // 3. Nurse & Intake Workspace APIs
    if (segments[0] === 'nurse' || segments[0] === 'intake') {
      const session = await auth(request, ['nurse', 'admin', 'manager'])
      if (method === 'GET' && (path === 'nurse/appointment-requests' || path === 'intake/appointment-requests')) {
        return ok(await listAppointments(request.nextUrl.searchParams.get('status') || undefined))
      }
      if (method === 'GET' && segments[1] === 'appointment-requests' && segments.length === 3) {
        return ok(await appointmentDetail(idAt(segments, 2)))
      }
      if (method === 'POST' && segments[1] === 'appointment-requests' && segments[3] === 'propose') {
        const input = scheduleSchema.parse(await body(request))
        return ok(await proposeAppointment(idAt(segments, 2), input.appointment_at, input.note), 'เสนอวันนัดแล้ว')
      }
      if (method === 'POST' && segments[1] === 'appointment-requests' && segments[3] === 'cancel') {
        const input = z.object({ reason: z.string().default('') }).parse(await body(request))
        await cancelByStaff(idAt(segments, 2), input.reason)
        return ok(null, 'ยกเลิกคำขอแล้ว')
      }
      if (method === 'GET' && (path === 'nurse/arrivals/today' || path === 'intake/arrivals/today')) {
        return ok(await listAppointments('arrival_reported'))
      }
      if (method === 'POST' && segments[1] === 'appointment-requests' && segments[3] === 'confirm-checkin') {
        return ok(await confirmCheckIn(idAt(segments, 2)), 'ยืนยันเช็กอินและออกคิวแล้ว')
      }
      if (method === 'POST' && segments[1] === 'assessment' && segments.length === 3) {
        const input = assessmentSchema.parse(await body(request))
        return ok(await saveAssessment(idAt(segments, 2), input, session.userId), 'บันทึกการคัดกรองพยาบาลแล้ว')
      }
      if (method === 'POST' && segments[1] === 'urgent' && segments.length === 3) {
        return ok(await markUrgent(idAt(segments, 2)), 'ยกระดับเคสด่วนแล้ว')
      }
    }

    // 4. Doctor & Physician Workspace APIs
    if (segments[0] === 'doctor' || segments[0] === 'physician') {
      const session = await auth(request, ['doctor', 'physician', 'admin'])
      if (method === 'GET' && (path === 'doctor/appointment-requests' || path === 'physician/appointment-requests')) {
        return ok(await listAppointments(request.nextUrl.searchParams.get('status') || undefined))
      }
      if (method === 'POST' && segments[1] === 'appointment-requests' && segments[3] === 'confirm') {
        const input = scheduleSchema.extend({ assigned_pc: z.enum(['PC', 'PC2', 'PC3', 'PC4']) }).parse(await body(request))
        return ok(await confirmAppointment(idAt(segments, 2), input.appointment_at, input.assigned_pc, input.note), 'ยืนยันวันนัดแล้ว')
      }
      if (method === 'POST' && segments[1] === 'encounters' && segments[3] === 'route') {
        const input = z.object({ station_codes: z.array(z.string()).min(1) }).parse(await body(request))
        return ok(await setDoctorRoute(idAt(segments, 2), input.station_codes), 'บันทึกเส้นทางแล้ว')
      }
      if (method === 'POST' && segments[1] === 'encounters' && segments[3] === 'note') {
        const input = await body(request)
        return ok(await saveConsultation(idAt(segments, 2), input, session.userId), 'บันทึกประวัติการตรวจแล้ว')
      }
      if (method === 'POST' && segments[1] === 'encounters' && segments[3] === 'orders') {
        const input = ordersSchema.parse(await body(request)) as { items: OrderItem[]; notes?: string }
        return ok(await createOrders(idAt(segments, 2), input, session.userId), 'ส่งคำสั่งการรักษาสำเร็จ')
      }
    }

    // 5. Registration, Patients & Encounters Directory APIs
    if (segments[0] === 'registration' || segments[0] === 'patients' || segments[0] === 'encounters') {
      await auth(request, ['admin', 'manager', 'operations', 'nurse', 'doctor', 'physician', 'registration', 'vitals_staff', 'lab_staff', 'pharmacy_staff', 'infusion_staff'])
      if (method === 'POST' && path === 'registration/patients') {
        await auth(request, ['admin', 'manager', 'registration', 'nurse'])
        const input = staffRegisterSchema.parse(await body(request))
        return ok(await registerPatientByStaff(input.display_name, input.phone, input.birth_date, input.insurance_type), 'ลงทะเบียนประวัติผู้ป่วยแล้ว', 201)
      }
      if (method === 'GET' && (path === 'registration/patients' || path === 'patients')) {
        await auth(request, ['admin', 'manager', 'operations', 'nurse', 'doctor', 'physician', 'registration'])
        const q = request.nextUrl.searchParams.get('q') || ''
        return ok(await searchPatients(q))
      }
      if (method === 'GET' && segments[0] === 'patients' && segments.length === 2) {
        return ok(await getPatient(idAt(segments, 1)))
      }
      if (method === 'GET' && segments[0] === 'encounters') {
        if (segments.length === 1) return ok(await listEncounters(request.nextUrl.searchParams.get('status') || undefined))
        if (segments.length === 2) return ok(await getEncounterDetail(idAt(segments, 1)))
      }
    }

    // 6. Vitals Measurement APIs
    if (segments[0] === 'vitals') {
      const session = await auth(request, ['admin', 'manager', 'nurse', 'vitals_staff'])
      if (method === 'POST' && segments[1]) {
        const input = vitalsSchema.parse(await body(request))
        return ok(await saveVitals(idAt(segments, 1), input, session.userId), 'บันทึกสัญญาณชีพสำเร็จ')
      }
      if (method === 'GET' && segments[1] && segments[2] === 'latest') {
        return ok(await getLatestVitals(idAt(segments, 1)))
      }
    }

    // 7. Laboratory APIs
    if (segments[0] === 'lab') {
      const session = await auth(request, method === 'GET' ? ['lab_staff', 'admin', 'manager', 'doctor', 'physician'] : ['lab_staff', 'admin'])
      if (method === 'GET' && path === 'lab/queue') return ok(await getLabQueue())
      if (method === 'POST' && segments[2] === 'collect') {
        const input = versionSchema.parse(await body(request))
        return ok(await collectLabSample(idAt(segments, 1), session.userId, input.version), 'เก็บตัวอย่างสำเร็จ')
      }
      if (method === 'POST' && segments[2] === 'results') {
        const input = labResultsSchema.parse(await body(request))
        return ok(await saveLabResults(idAt(segments, 1), input.results, session.userId, input.version), 'บันทึกผลแล็บแล้ว')
      }
      if (method === 'POST' && segments[2] === 'verify') {
        const input = recommendationDecisionSchema.parse(await body(request))
        return ok(await verifyLabResults(idAt(segments, 1), session.userId, input.version, input.reason), 'ยืนยันผลแล็บแล้ว')
      }
    }

    // 8. Pharmacy APIs
    if (segments[0] === 'pharmacy') {
      const session = await auth(request, method === 'GET' ? ['pharmacy_staff', 'admin', 'manager'] : ['pharmacy_staff', 'admin'])
      if (method === 'GET' && path === 'pharmacy/queue') return ok(await getPharmacyQueue())
      if (method === 'POST' && segments[2] === 'prepare') {
        const input = versionSchema.parse(await body(request))
        return ok(await startPreparePharmacy(idAt(segments, 1), session.userId, input.version), 'เริ่มจัดยาแล้ว')
      }
      if (method === 'POST' && segments[2] === 'ready') {
        const input = versionSchema.parse(await body(request))
        return ok(await readyPharmacy(idAt(segments, 1), session.userId, input.version), 'แจ้งยาพร้อมจ่ายแล้ว')
      }
      if (method === 'POST' && segments[2] === 'dispense') {
        const input = recommendationDecisionSchema.parse(await body(request))
        return ok(await dispensePharmacy(idAt(segments, 1), session.userId, input.version, input.reason), 'จ่ายยาเรียบร้อยแล้ว')
      }
    }

    // 9. Infusion Lounge APIs
    if (segments[0] === 'infusion') {
      const operatorRoles: Role[] = INFUSION_OPERATOR_ROLES
      if (method === 'GET' && path === 'infusion/board') {
        await auth(request, operatorRoles)
        return ok(await getInfusionBoard())
      }
      if (method === 'GET' && path === 'infusion/history') {
        await auth(request, operatorRoles)
        return ok(await getInfusionHistory({
          query: request.nextUrl.searchParams.get('q') || undefined,
          status: request.nextUrl.searchParams.get('status') || undefined,
          from: request.nextUrl.searchParams.get('from') || undefined,
          to: request.nextUrl.searchParams.get('to') || undefined,
        }))
      }
      if (method === 'GET' && path === 'infusion/templates') {
        await auth(request, INFUSION_TEMPLATE_VIEWER_ROLES)
        return ok(await listActiveInfusionTemplates())
      }
      if (method === 'GET' && path === 'infusion/resources') {
        await auth(request, INFUSION_CONFIGURATOR_ROLES)
        return ok(await listInfusionResources())
      }
      if (method === 'POST' && path === 'infusion/chairs/bulk') {
        await auth(request, INFUSION_CONFIGURATOR_ROLES)
        const input = z.object({ count: z.number().int().min(1).max(50), default_duration_min: z.number().int().min(1).max(1440).optional() }).parse(await body(request))
        return ok(await addInfusionChairs(input.count, input.default_duration_min), 'เพิ่มเก้าอี้แล้ว', 201)
      }
      if (method === 'PATCH' && segments[1] === 'chairs' && segments.length === 3) {
        await auth(request, INFUSION_CONFIGURATOR_ROLES)
        const input = z.object({ label: z.string().trim().min(1).max(80).optional(), default_duration_min: z.number().int().min(0).max(1440).optional(), is_active: z.boolean().optional() }).parse(await body(request))
        return ok(await updateInfusionChair(idAt(segments, 2), input), 'บันทึกเก้าอี้แล้ว')
      }
      if (method === 'POST' && path === 'infusion/templates') {
        await auth(request, INFUSION_CONFIGURATOR_ROLES)
        return ok(await createInfusionTemplate(infusionTemplateSchema.parse(await body(request))), 'สร้าง Template แล้ว', 201)
      }
      if (method === 'PATCH' && segments[1] === 'templates' && segments.length === 3) {
        await auth(request, ['manager', 'admin'])
        const input = infusionTemplateSchema.partial().extend({ is_active: z.boolean().optional() }).parse(await body(request))
        return ok(await updateInfusionTemplate(idAt(segments, 2), input), 'บันทึก Template แล้ว')
      }

      const session = await auth(request, operatorRoles)
      if (method === 'POST' && segments[1] === 'chairs' && segments[3] === 'call') {
        const input = z.object({ queue_item_id: z.string(), duration_override_min: z.number().int().min(1).max(1440).optional(), override_reason: z.string().trim().max(500).optional() }).parse(await body(request))
        return ok(await callPatientToChair(idAt(segments, 2), input.queue_item_id, session.userId, input), 'เรียกผู้ป่วยและจองเก้าอี้แล้ว')
      }
      if (method === 'POST' && segments[1] === 'sessions' && segments.length === 4) {
        const id = idAt(segments, 2)
        const action = segments[3]
        if (action === 'start') {
          const input = z.object({ version: z.number().int().min(1) }).parse(await body(request))
          return ok(await startInfusionPhase(id, session.userId, input.version), 'เริ่มนับเวลาแล้ว')
        }
        if (action === 'pause') {
          const input = z.object({ version: z.number().int().min(1), reason: z.string().trim().min(1).max(500) }).parse(await body(request))
          return ok(await pauseInfusion(id, session.userId, input.version, input.reason), 'พักเวลาแล้ว')
        }
        if (action === 'adjust') {
          const input = z.object({ version: z.number().int().min(1), delta_min: z.number().int().min(-1440).max(1440).refine((value) => value !== 0), reason: z.string().trim().min(1).max(500) }).parse(await body(request))
          return ok(await adjustInfusionTime(id, session.userId, input.version, input.delta_min, input.reason), 'ปรับเวลาแล้ว')
        }
        if (action === 'complete-phase') {
          const input = z.object({ version: z.number().int().min(1), reason: z.string().trim().max(500).default('') }).parse(await body(request))
          return ok(await completeInfusionPhase(id, session.userId, input.version, input.reason), 'ยืนยันจบขั้นตอนแล้ว')
        }
        if (action === 'complete') {
          const input = z.object({ version: z.number().int().min(1), reason: z.string().trim().max(500).default('') }).parse(await body(request))
          return ok(await completeInfusionSession(id, session.userId, input.version, input.reason), 'จบการให้สารน้ำและปล่อยเก้าอี้แล้ว')
        }
        if (action === 'recall') return ok(await recallInfusionPatient(id, session.userId), 'เรียกผู้ป่วยซ้ำแล้ว')
        if (action === 'no-show') {
          const input = z.object({ reason: z.string().trim().min(1).max(500) }).parse(await body(request))
          return ok(await noShowInfusionPatient(id, session.userId, input.reason), 'บันทึกไม่พบผู้ป่วยและปล่อยเก้าอี้แล้ว')
        }
      }
    }

    // 11. Operations & AMIS Flow Engine APIs
    if (segments[0] === 'operations' || segments[0] === 'dashboard') {
      const operationSession = await auth(request, ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse'])
      if (method === 'GET' && (path === 'operations/snapshot' || path === 'dashboard/snapshot' || path === 'operations/board')) {
        return ok(await getOperationsSnapshot())
      }
      if (method === 'GET' && path === 'operations/schedule') return ok(await getFlowSchedule())
      if (method === 'GET' && path === 'operations/active-patients') return ok(await getActivePatientFlow())
      if (method === 'GET' && path === 'operations/insights') {
        if (!['admin', 'manager', 'operations'].includes(operationSession.role)) throw new DomainError('ไม่มีสิทธิ์ดูรายงานเชิงปฏิบัติการ', 'FORBIDDEN', 403)
        return ok(await getOperationsInsights(request.nextUrl.searchParams.get('from') || undefined, request.nextUrl.searchParams.get('to') || undefined))
      }
      if (method === 'POST' && path === 'operations/bottleneck') {
        if (!['admin', 'manager', 'operations'].includes(operationSession.role)) throw new DomainError('ไม่มีสิทธิ์รายงานหรือจัดการจุดติดขัด', 'FORBIDDEN', 403)
        const input = z.object({ station_code: z.string(), note: z.string().default('') }).parse(await body(request))
        return ok(await reportBottleneck(input.station_code, input.note), 'รายงานจุดติดขัดสำเร็จ')
      }
      if (method === 'POST' && segments[1] === 'recommendations' && segments[3] === 'accept') {
        if (!['admin', 'manager', 'operations'].includes(operationSession.role)) throw new DomainError('ไม่มีสิทธิ์ตัดสินใจคำแนะนำ', 'FORBIDDEN', 403)
        const input = recommendationDecisionSchema.parse(await body(request))
        return ok(await acceptRecommendation(idAt(segments, 2), operationSession.userId, input.reason, input.version), 'ตอบรับคำแนะนำแล้ว')
      }
      if (method === 'POST' && segments[1] === 'recommendations' && segments[3] === 'reject') {
        if (!['admin', 'manager', 'operations'].includes(operationSession.role)) throw new DomainError('ไม่มีสิทธิ์ตัดสินใจคำแนะนำ', 'FORBIDDEN', 403)
        const input = recommendationDecisionSchema.parse(await body(request))
        return ok(await rejectRecommendation(idAt(segments, 2), operationSession.userId, input.reason, input.version), 'ปฏิเสธคำแนะนำแล้ว')
      }
      if (method === 'GET' && path === 'operations/help-requests') {
        return ok(await listHelpRequests())
      }
      if (method === 'POST' && segments[1] === 'help-requests' && segments[3] === 'resolve') {
        if (!['admin', 'manager', 'operations', 'nurse'].includes(operationSession.role)) throw new DomainError('ไม่มีสิทธิ์ปิดงานช่วยเหลือ', 'FORBIDDEN', 403)
        const input = z.object({ notes: z.string().default('') }).parse(await body(request))
        return ok(await resolveHelpRequest(idAt(segments, 2), input.notes), 'ปิดงานช่วยเหลือแล้ว')
      }
    }

    // 12. Station Queue Action Handlers
    if (segments[0] === 'stations' && segments[1]) {
      const session = await auth(request)
      const code = segments[1]
      if (!stationAllowed(session.role, code)) {
        throw new DomainError('บทบาทนี้ไม่มีสิทธิ์จัดการ Station นี้', 'FORBIDDEN', 403)
      }
      if (method === 'GET' && segments[2] === 'queue' && segments.length === 3) return ok(await getStationQueue(code))
      if (method === 'POST' && segments[2] === 'call-next') return ok({ queue_item: await callNext(code, session.userId) }, 'เรียกคิวสำเร็จ')
      if (method === 'POST' && segments[2] === 'queue' && segments[3] && segments[4]) {
        const itemId = segments[3]
        const input = versionSchema.parse(await body(request))
        switch (segments[4]) {
          case 'start': return ok({ queue_item: await startQueue(code, itemId, session.userId, input.version) }, 'เริ่มให้บริการแล้ว')
          case 'complete': return ok(await completeQueue(code, itemId, session.userId, input.version), 'เสร็จสิ้น Station แล้ว')
          case 'recall': return ok({ queue_item: await recallQueue(code, itemId, session.userId, input.version) }, 'เรียกซ้ำสำเร็จ')
          case 'skip': return ok({ queue_item: await skipQueue(code, itemId, session.userId, input.version) }, 'ข้ามคิวสำเร็จ')
          case 'requeue': return ok({ queue_item: await requeue(code, itemId, session.userId, input.version) }, 'นำคิวกลับเข้าแถวสำเร็จ')
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
