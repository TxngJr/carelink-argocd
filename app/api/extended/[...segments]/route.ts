import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { SESSION_COOKIE, sessionFromRequest } from '@/lib/server/auth'
import { getDb } from '@/lib/server/db'
import { rateLimit } from '@/lib/server/rate-limit'
import { DomainError } from '@/lib/server/domain'
import type { Role } from '@/lib/types'
import {
  asPublic,
  completeImaging,
  findPatientDuplicates,
  getAdminOverview,
  getClinicalContext,
  getHistoricalInsights,
  getImagingQueue,
  getMethodology,
  getPharmacySafety,
  getExtendedPrevisit,
  listAudit,
  registerRichPatient,
  resetDemoData,
  saveExtendedPrevisit,
  saveExtendedAssessment,
  savePharmacyReview,
  startImaging,
  updateEligibility,
} from '@/lib/server/extended'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Context = { params: Promise<{ segments: string[] }> }
type Session = Awaited<ReturnType<typeof sessionFromRequest>>

function ok(data: unknown = null, message = 'สำเร็จ', status = 200) {
  return NextResponse.json({ success: true, data: asPublic(data), message }, { status })
}
function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}
async function json(request: NextRequest) {
  try { return await request.json() } catch { throw new DomainError('ข้อมูล JSON ไม่ถูกต้อง') }
}
async function auth(request: NextRequest, roles?: Role[]) {
  const session = await sessionFromRequest(request)
  if (!session) throw new DomainError('กรุณาเข้าสู่ระบบ', 'UNAUTHORIZED', 401)
  if (roles && !roles.includes(session.role) && session.role !== 'admin') throw new DomainError('ไม่มีสิทธิ์ใช้งานส่วนนี้', 'FORBIDDEN', 403)
  return session
}
function mutationOriginAllowed(request: NextRequest) {
  const origin = request.headers.get('origin')
  const cookieMutation = Boolean(request.cookies.get(SESSION_COOKIE)?.value)
  if (!origin) return !cookieMutation || Boolean(request.headers.get('authorization'))
  try {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host
    const protocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '')
    return new URL(origin).origin === `${protocol}://${host}`
  } catch { return false }
}
function id(segments: string[], index: number) {
  const value = segments[index]
  if (!value) throw new DomainError('ID ไม่ถูกต้อง')
  return value
}

const patientSchema = z.object({
  display_name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(8).max(20),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  insurance_type: z.string().trim().min(1).max(120),
  national_id_masked: z.string().trim().max(40).optional(),
  gender: z.string().trim().max(40).optional(),
  province: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  sub_district: z.string().trim().max(120).optional(),
  address: z.string().trim().max(1000).optional(),
  insurance_no: z.string().trim().max(120).optional(),
  referral_hospital: z.string().trim().max(240).optional(),
  referral_status: z.enum(['not_required', 'pending', 'valid', 'missing']).optional(),
  emergency_contact: z.string().trim().max(160).optional(),
  caregiver_name: z.string().trim().max(160).optional(),
})
const eligibilitySchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'expired']),
  insurance_type: z.string().trim().min(1).max(120),
  insurance_no: z.string().trim().max(120).default(''),
  referral_hospital: z.string().trim().max(240).default(''),
  referral_status: z.enum(['not_required', 'pending', 'valid', 'missing']).default('not_required'),
  note: z.string().trim().max(1000).default(''),
})
const imagingStartSchema = z.object({ version: z.number().int().min(1), station_code: z.enum(['XR', 'CT', 'MRI', 'IR']) })
const imagingCompleteSchema = imagingStartSchema.extend({ findings: z.string().trim().min(3).max(6000), impression: z.string().trim().min(3).max(3000) })
const pharmacyReviewSchema = z.object({ decision: z.enum(['approved', 'override', 'rejected']), note: z.string().trim().max(2000).default('') })

async function auditMutation(request: NextRequest, session: NonNullable<Session>, action: string) {
  await (await getDb()).collection('audit_requests').insertOne({
    actor_id: session.userId,
    actor_role: session.role,
    demo_session_id: session.demoSessionId,
    method: request.method.toUpperCase(),
    action: `extended/${action}`,
    created_at: new Date(),
  })
}

async function handler(request: NextRequest, context: Context) {
  try {
    const { segments } = await context.params
    const method = request.method.toUpperCase()
    const path = segments.join('/')

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!mutationOriginAllowed(request)) throw new DomainError('ไม่อนุญาตคำขอจากเว็บไซต์อื่น', 'FORBIDDEN', 403)
      const session = await auth(request)
      if (!await rateLimit(request, 'extended-mutation', Number(process.env.DEMO_WRITE_RATE || 60), 60_000, session.sessionId)) throw new DomainError('ทำรายการถี่เกินไป กรุณารอสักครู่', 'RATE_LIMITED', 429)
      await auditMutation(request, session, path)
    }

    if (method === 'GET' && path === 'registration/duplicates') {
      await auth(request, ['admin', 'manager', 'registration', 'nurse'])
      return ok(await findPatientDuplicates(request.nextUrl.searchParams.get('q') || '', request.nextUrl.searchParams.get('birth_date') || ''))
    }
    if (method === 'POST' && path === 'registration/patients') {
      await auth(request, ['admin', 'manager', 'registration', 'nurse'])
      return ok(await registerRichPatient(patientSchema.parse(await json(request))), 'สร้างเวชระเบียนและข้อมูลสิทธิเริ่มต้นแล้ว', 201)
    }
    if (method === 'PATCH' && segments[0] === 'registration' && segments[1] === 'patients' && segments[3] === 'eligibility') {
      const session = await auth(request, ['admin', 'manager', 'registration', 'nurse'])
      return ok(await updateEligibility(id(segments, 2), eligibilitySchema.parse(await json(request)), session.userId), 'บันทึกผลตรวจสอบสิทธิแล้ว')
    }

    if (method === 'GET' && segments[0] === 'clinical' && segments[1] === 'context') {
      await auth(request, ['admin', 'manager', 'operations', 'nurse', 'doctor', 'physician', 'registration', 'vitals_staff', 'lab_staff', 'pharmacy_staff', 'infusion_staff'])
      return ok(await getClinicalContext(id(segments, 2)))
    }
    if (method === 'PUT' && segments[0] === 'clinical' && segments[1] === 'assessment') {
      const session = await auth(request, ['admin', 'manager', 'nurse'])
      return ok(await saveExtendedAssessment(id(segments, 2), await json(request), session.userId), 'บันทึกข้อมูลซักประวัติเพิ่มเติมแล้ว')
    }

    if (method === 'GET' && path === 'imaging/queue') {
      await auth(request, ['admin', 'manager', 'operations', 'nurse', 'doctor', 'physician'])
      return ok(await getImagingQueue(request.nextUrl.searchParams.get('station') || 'all'))
    }
    if (method === 'POST' && segments[0] === 'imaging' && segments[2] === 'start') {
      const session = await auth(request, ['admin', 'manager', 'operations', 'nurse'])
      const input = imagingStartSchema.parse(await json(request))
      return ok(await startImaging(id(segments, 1), input.version, input.station_code, session.userId), 'เริ่มตรวจ Imaging แล้ว')
    }
    if (method === 'POST' && segments[0] === 'imaging' && segments[2] === 'complete') {
      const session = await auth(request, ['admin', 'manager', 'operations', 'nurse'])
      const input = imagingCompleteSchema.parse(await json(request))
      return ok(await completeImaging(id(segments, 1), input.version, input, session.userId), 'บันทึกผล Imaging แล้ว')
    }

    if (method === 'GET' && segments[0] === 'pharmacy' && segments[2] === 'safety') {
      await auth(request, ['admin', 'manager', 'pharmacy_staff'])
      return ok(await getPharmacySafety(id(segments, 1)))
    }
    if (method === 'POST' && segments[0] === 'pharmacy' && segments[2] === 'review') {
      const session = await auth(request, ['admin', 'manager', 'pharmacy_staff'])
      return ok(await savePharmacyReview(id(segments, 1), pharmacyReviewSchema.parse(await json(request)), session.userId), 'บันทึก Pharmacy safety review แล้ว')
    }

    if (method === 'GET' && path === 'admin/overview') {
      await auth(request, ['admin'])
      return ok(await getAdminOverview())
    }
    if (method === 'GET' && path === 'admin/audit') {
      await auth(request, ['admin'])
      return ok(await listAudit(request.nextUrl.searchParams.get('q') || ''))
    }
    if (method === 'POST' && path === 'admin/demo-reset') {
      const session = await auth(request, ['admin'])
      const input = z.object({ confirm: z.literal('RESET_DEMO') }).parse(await json(request))
      void input
      return ok(await resetDemoData(session.userId), 'รีเซ็ตข้อมูลสาธิตแล้ว')
    }

    if (method === 'GET' && path === 'patient/previsit') {
      const session = await auth(request, ['patient'])
      return ok(await getExtendedPrevisit(session.userId))
    }
    if (method === 'PUT' && path === 'patient/previsit') {
      const session = await auth(request, ['patient'])
      return ok(await saveExtendedPrevisit(session.userId, await json(request)), 'บันทึกข้อมูล Pre-visit เพิ่มเติมแล้ว')
    }

    if (method === 'GET' && path === 'analytics/historical') {
      await auth(request, ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse'])
      return ok(await getHistoricalInsights())
    }
    if (method === 'GET' && path === 'analytics/methodology') {
      await auth(request, ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse'])
      return ok(await getMethodology())
    }

    return fail(404, 'NOT_FOUND', 'ไม่พบ Extended API ที่ร้องขอ')
  } catch (error) {
    if (error instanceof z.ZodError) return fail(400, 'VALIDATION_ERROR', error.issues[0]?.message || 'กรุณาตรวจสอบข้อมูลที่กรอก')
    if (error instanceof DomainError) return fail(error.status, error.code, error.message)
    console.error('CareLink Extended API error', error)
    return fail(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาด กรุณาลองใหม่')
  }
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE }
