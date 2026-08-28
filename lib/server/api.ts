import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { attachSessionCookie, clearSessionCookie, sessionFromRequest, signSession } from '@/lib/server/auth'
import {
  DomainError,
  acceptRecommendation,
  addTriageMessage,
  appointmentDetail,
  arriveRadiation,
  assignChemoChair,
  authenticate,
  callChemoNurse,
  callNext,
  cancelByStaff,
  cancelPatientAppointment,
  collectLabSample,
  completeChemo,
  completeQueue,
  completeRadiation,
  confirmAppointment,
  confirmCheckIn,
  createAppointment,
  createHelpRequest,
  createOrders,
  createTriageSession,
  currentAppointment,
  dispensePharmacy,
  getCurrentTriageSession,
  getEncounterDetail,
  getChemoChairs,
  getLabQueue,
  getLatestVitals,
  getMapOverview,
  getOperationsSnapshot,
  getPatient,
  getPharmacyQueue,
  getPrevisit,
  getRadiationSchedule,
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
  rejectRecommendation,
  reportArrival,
  reportBottleneck,
  requeue,
  rescheduleRadiation,
  resolveHelpRequest,
  saveAssessment,
  saveConsultation,
  saveLabResults,
  savePrevisit,
  saveVitals,
  searchPatients,
  setDoctorRoute,
  skipQueue,
  startChemo,
  startChemoPremed,
  startPreparePharmacy,
  startQueue,
  startRadiation,
  stationAllowed,
  submitTriageSession,
  updateAppointment,
  updateChemoProgress,
  updateEncounterPriority,
  verifyLabResults,
} from '@/lib/server/domain'
import { runDatabaseSeed } from '@/lib/server/seed'
import type { Role } from '@/lib/types'

const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) })
const registerSchema = z.object({
  display_name: z.string().trim().min(1),
  phone: z.string().trim().min(8),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  password: z.string().min(6),
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

function ok(data: unknown = null, message = 'OK', status = 200) {
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
function idAt(segments: string[], index: number) {
  const value = segments[index]
  if (!value) throw new DomainError('ID ไม่ถูกต้อง')
  return value
}

export async function dispatchApi(request: NextRequest, segments: string[]) {
  try {
    const method = request.method.toUpperCase()
    const path = segments.join('/')

    // Public / Dev routes
    if (path === 'dev/seed' && method === 'POST') {
      const result = await runDatabaseSeed(true)
      return ok(result, 'รีเซ็ตและ Seed ข้อมูลสำเร็จ')
    }
    if (path === 'tv' && method === 'GET') {
      const station = request.nextUrl.searchParams.get('station') || undefined
      return ok(await getTvBoard(station))
    }
    if (path === 'map/overview' && method === 'GET') {
      return ok(await getMapOverview())
    }

    // 1. Auth routes
    if (method === 'POST' && path === 'auth/login') {
      const input = loginSchema.parse(await body(request))
      const user = await authenticate(input.username, input.password)
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
        const input = await body(request)
        return ok(await saveAssessment(idAt(segments, 2), input, session.userId), 'บันทึกการคัดกรองพยาบาลแล้ว')
      }
      if (method === 'POST' && segments[1] === 'urgent' && segments.length === 3) {
        return ok(await markUrgent(idAt(segments, 2), session.userId), 'ยกระดับเคสด่วนแล้ว')
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
        const input = await body(request)
        return ok(await createOrders(idAt(segments, 2), input, session.userId), 'ส่งคำสั่งการรักษาสำเร็จ')
      }
    }

    // 5. Registration, Patients & Encounters Directory APIs
    if (segments[0] === 'registration' || segments[0] === 'patients' || segments[0] === 'encounters') {
      const session = await auth(request)
      if (method === 'GET' && (path === 'registration/patients' || path === 'patients')) {
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
      const session = await auth(request)
      if (method === 'POST' && segments[1]) {
        const input = await body(request)
        return ok(await saveVitals(idAt(segments, 1), input, session.userId), 'บันทึกสัญญาณชีพสำเร็จ')
      }
      if (method === 'GET' && segments[1] && segments[2] === 'latest') {
        return ok(await getLatestVitals(idAt(segments, 1)))
      }
    }

    // 7. Laboratory APIs
    if (segments[0] === 'lab') {
      const session = await auth(request, ['lab_staff', 'admin', 'doctor'])
      if (method === 'GET' && path === 'lab/queue') return ok(await getLabQueue())
      if (method === 'POST' && segments[2] === 'collect') return ok(await collectLabSample(idAt(segments, 1), session.userId), 'เก็บตัวอย่างสำเร็จ')
      if (method === 'POST' && segments[2] === 'results') {
        const input = await body(request)
        return ok(await saveLabResults(idAt(segments, 1), input, session.userId), 'บันทึกผลแล็บแล้ว')
      }
      if (method === 'POST' && segments[2] === 'verify') return ok(await verifyLabResults(idAt(segments, 1), session.userId), 'ยืนยันผลแล็บแล้ว')
    }

    // 8. Pharmacy APIs
    if (segments[0] === 'pharmacy') {
      const session = await auth(request, ['pharmacy_staff', 'admin'])
      if (method === 'GET' && path === 'pharmacy/queue') return ok(await getPharmacyQueue())
      if (method === 'POST' && segments[2] === 'prepare') return ok(await startPreparePharmacy(idAt(segments, 1), session.userId), 'เริ่มจัดยาแล้ว')
      if (method === 'POST' && segments[2] === 'ready') return ok(await readyPharmacy(idAt(segments, 1), session.userId), 'แจ้งยาพร้อมจ่ายแล้ว')
      if (method === 'POST' && segments[2] === 'dispense') return ok(await dispensePharmacy(idAt(segments, 1), session.userId), 'จ่ายยาเรียบร้อยแล้ว')
    }

    // 9. Chemotherapy Unit APIs
    if (segments[0] === 'chemo') {
      const session = await auth(request, ['chemo_staff', 'admin', 'nurse', 'doctor'])
      if (method === 'GET' && path === 'chemo/chairs') return ok(await getChemoChairs())
      if (method === 'POST' && path === 'chemo/assign-chair') {
        const input = z.object({ encounter_id: z.string(), chair_no: z.number(), protocol_name: z.string(), duration_min: z.number().default(60) }).parse(await body(request))
        return ok(await assignChemoChair(input.encounter_id, input.chair_no, input.protocol_name, input.duration_min), 'จัดเก้าอี้เคมีบำบัดแล้ว')
      }
      if (method === 'POST' && segments[2] === 'start-premed') return ok(await startChemoPremed(idAt(segments, 1)), 'เริ่ม Pre-med แล้ว')
      if (method === 'POST' && segments[2] === 'start') return ok(await startChemo(idAt(segments, 1)), 'เริ่มให้ยาเคมีบำบัดแล้ว')
      if (method === 'PATCH' && segments[2] === 'progress') {
        const input = z.object({ progress: z.number() }).parse(await body(request))
        return ok(await updateChemoProgress(idAt(segments, 1), input.progress))
      }
      if (method === 'POST' && segments[2] === 'call-nurse') {
        const input = z.object({ note: z.string().default('') }).parse(await body(request))
        return ok(await callChemoNurse(idAt(segments, 1), input.note), 'ส่งสัญญาณเรียกพยาบาลแล้ว')
      }
      if (method === 'POST' && segments[2] === 'complete') return ok(await completeChemo(idAt(segments, 1)), 'เสร็จสิ้นการให้ยาเคมีบำบัดแล้ว')
    }

    // 10. Radiation Oncology APIs
    if (segments[0] === 'radiation') {
      const session = await auth(request, ['rt_staff', 'admin', 'doctor'])
      if (method === 'GET' && path === 'radiation/schedule') return ok(await getRadiationSchedule())
      if (method === 'POST' && segments[2] === 'arrive') return ok(await arriveRadiation(idAt(segments, 1)), 'ผู้ป่วยมาถึงจุดฉายรังสีแล้ว')
      if (method === 'POST' && segments[2] === 'start') return ok(await startRadiation(idAt(segments, 1), session.userId), 'เริ่มฉายรังสีแล้ว')
      if (method === 'POST' && segments[2] === 'complete') return ok(await completeRadiation(idAt(segments, 1)), 'การฉายรังสีเสร็จสิ้นแล้ว')
      if (method === 'POST' && segments[2] === 'reschedule') {
        const input = z.object({ new_time: z.string(), reason: z.string().optional() }).parse(await body(request))
        return ok(await rescheduleRadiation(idAt(segments, 1), input.new_time, input.reason), 'เลื่อนนัดฉายรังสีแล้ว')
      }
    }

    // 11. Operations & AMIS Flow Engine APIs
    if (segments[0] === 'operations' || segments[0] === 'dashboard') {
      await auth(request)
      if (method === 'GET' && (path === 'operations/snapshot' || path === 'dashboard/snapshot' || path === 'operations/board')) {
        return ok(await getOperationsSnapshot())
      }
      if (method === 'POST' && path === 'operations/bottleneck') {
        const input = z.object({ station_code: z.string(), note: z.string().default('') }).parse(await body(request))
        return ok(await reportBottleneck(input.station_code, input.note), 'รายงานจุดติดขัดสำเร็จ')
      }
      if (method === 'POST' && segments[1] === 'recommendations' && segments[3] === 'accept') {
        return ok(await acceptRecommendation(idAt(segments, 2)), 'ตอบรับคำแนะนำแล้ว')
      }
      if (method === 'POST' && segments[1] === 'recommendations' && segments[3] === 'reject') {
        return ok(await rejectRecommendation(idAt(segments, 2)), 'ปฏิเสธคำแนะนำแล้ว')
      }
      if (method === 'GET' && path === 'operations/help-requests') {
        return ok(await listHelpRequests())
      }
      if (method === 'POST' && segments[1] === 'help-requests' && segments[3] === 'resolve') {
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
