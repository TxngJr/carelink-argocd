import 'server-only'
import bcrypt from 'bcryptjs'
import { ObjectId, type Document } from 'mongodb'
import { BASE_ROUTE, OPTIONAL_ROUTE_CODES, PC_CODES, STATIONS, stationMap } from '@/lib/stations'
import { stationAllowed } from '@/lib/access-control'
import { toPublicTvQueueItem } from '@/lib/public-dto'
import { getDb } from '@/lib/server/db'
import { broadcast } from '@/lib/server/events'
import {
  adaptFlowPlan,
  buildBaselinePlan,
  buildFlowEstimate,
  classifyFlowState,
  FLOW_HISTORY_WINDOW_DAYS,
  minutesBetween,
  simulateNewArrivalWait,
} from '@/lib/flow-engine'
import type {
  ActivePatientFlow,
  AppointmentMeasurements,
  FlowPlanSegment,
  FlowScheduleSlot,
  HelpRequestSubmission,
  OperationsInsights,
  OrderItem,
  PrevisitSubmission,
  Role,
} from '@/lib/types'

const ACTIVE_APPOINTMENTS = ['submitted', 'nurse_proposed', 'confirmed', 'arrival_reported', 'checked_in', 'in_service']
const ACTIVE_QUEUE = ['waiting', 'called', 'in_progress']

export class DomainError extends Error {
  constructor(message: string, public code = 'VALIDATION_ERROR', public status = 400) {
    super(message)
  }
}

export function objectId(value: string, label = 'ID') {
  if (!ObjectId.isValid(value)) throw new DomainError(`${label} ไม่ถูกต้อง`)
  return new ObjectId(value)
}

function serialize(value: unknown): unknown {
  if (value instanceof ObjectId) return value.toHexString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'password_hash') continue
      output[key === '_id' ? 'id' : key] = serialize(nested)
    }
    return output
  }
  return value
}

export function publicDocument<T = unknown>(value: unknown): T {
  return serialize(value) as T
}

function bangkokDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function bangkokDayRange(date = new Date()) {
  const key = bangkokDateKey(date)
  const start = new Date(`${key}T00:00:00+07:00`)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), key }
}

function bangkokHour(date: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', hour: '2-digit', hour12: false }).format(date).padStart(2, '0')
}

export async function counter(collection: string, key: string) {
  const row = await (await getDb()).collection(collection).findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  return Number(row?.value || 1)
}

export async function generateQueueNo(stationCode: string) {
  const day = bangkokDateKey().replaceAll('-', '')
  return `${stationCode}-${String(await counter('daily_counters', `${day}:${stationCode}`)).padStart(3, '0')}`
}

export async function notify(patientId: ObjectId, title: string, message: string, type: string, encounterId?: ObjectId) {
  const db = await getDb()
  const notif = {
    _id: new ObjectId(),
    patient_id: patientId,
    ...(encounterId ? { encounter_id: encounterId } : {}),
    channel: 'in_app',
    title,
    message,
    type,
    is_read: false,
    created_at: new Date(),
  }
  await db.collection('notifications').insertOne(notif)
  broadcast(`patient:${patientId.toHexString()}`, 'notification_created', notif)
}

async function auditQueue(item: Document, action: string, staffId?: string, fromStation = '', toStation = '') {
  const db = await getDb()
  await db.collection('queue_events').insertOne({
    encounter_id: item.encounter_id,
    patient_id: item.patient_id,
    station_code: item.station_code,
    queue_no: item.queue_no,
    from_station: fromStation,
    to_station: toStation,
    action,
    ...(staffId && ObjectId.isValid(staffId) ? { performed_by: new ObjectId(staffId) } : {}),
    note: '',
    metadata: {},
    created_at: new Date(),
  })
}

// -------------------------------------------------------------
// Auth & Users
// -------------------------------------------------------------

export async function authenticate(username: string, password: string, requiredRole?: Role) {
  const db = await getDb()
  const user = await db.collection('users').findOne({ username: username.trim(), is_active: { $ne: false } })
  if (!user || typeof user.password_hash !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
    throw new DomainError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'UNAUTHORIZED', 401)
  }
  if (requiredRole && user.role !== requiredRole) {
    throw new DomainError(requiredRole === 'patient' ? 'บัญชีนี้ไม่ใช่บัญชีผู้ป่วย' : 'บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้', 'FORBIDDEN', 403)
  }
  return user
}

export async function registerPatient(displayName: string, phone: string, birthDate: string, password: string, insuranceType = 'UC (บัตรทอง)') {
  const db = await getDb()
  const name = displayName.trim()
  const cleanPhone = phone.trim()
  if (!name || !cleanPhone) throw new DomainError('กรุณากรอกข้อมูลให้ครบ')
  if (password.length < 6) throw new DomainError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
  const birth = new Date(`${birthDate}T00:00:00+07:00`)
  if (Number.isNaN(birth.getTime()) || birth > new Date()) throw new DomainError('วันเกิดไม่ถูกต้อง')
  if (await db.collection('users').findOne({ username: cleanPhone })) {
    throw new DomainError('เบอร์โทรนี้ถูกใช้งานแล้ว', 'REGISTRATION_ERROR', 409)
  }
  const now = new Date()
  const patientId = new ObjectId()
  const userId = new ObjectId()
  const hn = `HN${String(await counter('system_counters', 'patient_hn')).padStart(6, '0')}`
  const passwordHash = await bcrypt.hash(password, 10)
  const age = Math.max(0, now.getFullYear() - birth.getFullYear())

  await db.collection('patients').insertOne({
    _id: patientId,
    hn,
    national_id_masked: '',
    display_name: name,
    gender: '',
    age,
    birth_date: birth,
    phone: cleanPhone,
    province: 'กรุงเทพมหานคร',
    is_out_province: false,
    insurance_type: insuranceType.trim() || 'ไม่ระบุสิทธิ',
    eligibility_status: 'demo_recorded',
    allergies: [],
    chronic_conditions: [],
    created_at: now,
    updated_at: now,
  })

  try {
    await db.collection('users').insertOne({
      _id: userId,
      username: cleanPhone,
      password_hash: passwordHash,
      role: 'patient',
      display_name: name,
      department: '',
      station_codes: [],
      patient_id: patientId,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
  } catch (error) {
    await db.collection('patients').deleteOne({ _id: patientId })
    throw error
  }
  return db.collection('users').findOne({ _id: userId })
}

export async function registerPatientByStaff(displayName: string, phone: string, birthDate: string, insuranceType: string) {
  const user = await registerPatient(displayName, phone, birthDate, process.env.DEVELOPMENT_LOGIN_PASSWORD || 'password123', insuranceType)
  if (!user?.patient_id) throw new DomainError('ลงทะเบียนผู้ป่วยไม่สำเร็จ', 'REGISTRATION_ERROR', 500)
  return (await getDb()).collection('patients').findOne({ _id: user.patient_id })
}

export async function getUser(userId: string) {
  return (await getDb()).collection('users').findOne({ _id: objectId(userId), is_active: { $ne: false } })
}

export async function patientIdForUser(userId: string) {
  const user = await (await getDb()).collection('users').findOne({ _id: objectId(userId), role: 'patient' })
  if (!user?.patient_id) throw new DomainError('ไม่พบข้อมูลผู้ป่วย', 'NOT_FOUND', 404)
  return user.patient_id as ObjectId
}

// -------------------------------------------------------------
// Patients & Encounters
// -------------------------------------------------------------

export async function searchPatients(query: string) {
  const db = await getDb()
  const clean = query.trim()
  if (!clean) return db.collection('patients').find({}).sort({ created_at: -1 }).limit(30).toArray()
  return db.collection('patients').find({
    $or: [
      { hn: { $regex: clean, $options: 'i' } },
      { display_name: { $regex: clean, $options: 'i' } },
      { phone: { $regex: clean, $options: 'i' } },
    ],
  }).limit(30).toArray()
}

export async function getPatient(patientId: string) {
  return (await getDb()).collection('patients').findOne({ _id: objectId(patientId) })
}

export async function listEncounters(status?: string) {
  const db = await getDb()
  const match = status ? { status } : {}
  return db.collection('encounters').aggregate([
    { $match: match },
    { $sort: { created_at: -1 } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
  ]).toArray()
}

export async function getEncounterDetail(encounterId: string) {
  const db = await getDb()
  const id = objectId(encounterId)
  const encounter = await db.collection('encounters').findOne({ _id: id })
  if (!encounter) return null
  const patient = await db.collection('patients').findOne({ _id: encounter.patient_id })
  const latestVitals = await db.collection('vitals').findOne({ encounter_id: id }, { sort: { recorded_at: -1 } })
  const assessment = await db.collection('clinical_assessments').findOne({ encounter_id: id })
  const note = await db.collection('clinical_notes').findOne({ encounter_id: id })
  const orders = await db.collection('orders').find({ encounter_id: id }).toArray()
  return { ...encounter, patient, latest_vitals: latestVitals, assessment, note, orders }
}

export async function updateEncounterPriority(encounterId: string, priority: 'normal' | 'urgent' | 'fast_track') {
  const db = await getDb()
  const id = objectId(encounterId)
  const encounter = await db.collection('encounters').findOneAndUpdate(
    { _id: id },
    { $set: { priority, updated_at: new Date() } },
    { returnDocument: 'after' }
  )
  if (!encounter) throw new DomainError('ไม่พบ visit', 'NOT_FOUND', 404)
  await db.collection('queue_items').updateMany({ encounter_id: id, status: { $in: ACTIVE_QUEUE } }, { $set: { priority } })
  broadcast('encounters', 'priority_changed', { encounter_id: id.toHexString(), priority })
  return encounter
}

// -------------------------------------------------------------
// Appointments
// -------------------------------------------------------------

function validateMeasurements(m: AppointmentMeasurements) {
  if ((m.sbp === undefined) !== (m.dbp === undefined)) throw new DomainError('กรุณากรอกความดันตัวบนและตัวล่างให้ครบทั้งคู่')
  if (m.height_cm !== undefined && (m.height_cm < 50 || m.height_cm > 250)) throw new DomainError('ส่วนสูงต้องอยู่ระหว่าง 50–250 ซม.')
  if (m.weight_kg !== undefined && (m.weight_kg < 2 || m.weight_kg > 500)) throw new DomainError('น้ำหนักต้องอยู่ระหว่าง 2–500 กก.')
  if (m.sbp !== undefined && m.dbp !== undefined && (m.sbp < 40 || m.sbp > 300 || m.dbp < 20 || m.dbp > 200)) throw new DomainError('ค่าความดันอยู่นอกช่วงที่ระบบรับได้')
  if (m.spo2 !== undefined && (m.spo2 < 50 || m.spo2 > 100)) throw new DomainError('SpO₂ ต้องอยู่ระหว่าง 50–100')
}

export async function createAppointment(userId: string, chiefComplaint: string, measurements: AppointmentMeasurements) {
  const db = await getDb()
  const patientId = await patientIdForUser(userId)
  const complaint = chiefComplaint.trim()
  if (!complaint) throw new DomainError('กรุณาระบุอาการสำคัญ')
  validateMeasurements(measurements)
  if (await db.collection('appointment_requests').countDocuments({ patient_id: patientId, status: { $in: ACTIVE_APPOINTMENTS } })) {
    throw new DomainError('ไม่สามารถสร้างคำขอใหม่ขณะมีคำขอที่กำลังดำเนินการ', 'INVALID_STATE', 409)
  }
  const now = new Date()
  const row = {
    _id: new ObjectId(),
    patient_id: patientId,
    chief_complaint: complaint,
    measurements,
    status: 'submitted',
    created_at: now,
    updated_at: now,
  }
  await db.collection('appointment_requests').insertOne(row)
  broadcast('appointments', 'appointment_created', row)
  return row
}

export async function currentAppointment(userId: string) {
  const patientId = await patientIdForUser(userId)
  return (await getDb()).collection('appointment_requests').find({ patient_id: patientId }).sort({ created_at: -1 }).limit(1).next()
}

export async function updateAppointment(userId: string, appointmentId: string, chiefComplaint: string, measurements: AppointmentMeasurements) {
  const patientId = await patientIdForUser(userId)
  const complaint = chiefComplaint.trim()
  if (!complaint) throw new DomainError('กรุณาระบุอาการสำคัญ')
  validateMeasurements(measurements)
  const row = await (await getDb()).collection('appointment_requests').findOneAndUpdate(
    { _id: objectId(appointmentId), patient_id: patientId, status: 'submitted' },
    { $set: { chief_complaint: complaint, measurements, updated_at: new Date() } },
    { returnDocument: 'after' }
  )
  if (!row) throw new DomainError('ไม่สามารถแก้ไขคำขอในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
  return row
}

export async function cancelPatientAppointment(userId: string, appointmentId: string, reason: string) {
  const patientId = await patientIdForUser(userId)
  const result = await (await getDb()).collection('appointment_requests').updateOne(
    { _id: objectId(appointmentId), patient_id: patientId, status: { $in: ['submitted', 'nurse_proposed', 'confirmed'] } },
    { $set: { status: 'cancelled', cancel_reason: reason.trim(), updated_at: new Date() } }
  )
  if (!result.modifiedCount) throw new DomainError('ไม่สามารถยกเลิกคำขอในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
  broadcast('appointments', 'appointment_cancelled', { id: appointmentId })
}

export async function reportArrival(userId: string, appointmentId: string) {
  const db = await getDb()
  const patientId = await patientIdForUser(userId)
  const id = objectId(appointmentId)
  const current = await db.collection('appointment_requests').findOne({ _id: id, patient_id: patientId })
  if (!current) throw new DomainError('ไม่พบคำขอนัด', 'NOT_FOUND', 404)
  if (['arrival_reported', 'checked_in', 'in_service', 'completed'].includes(current.status)) return current
  if (current.status !== 'confirmed' || !current.appointment_at || bangkokDateKey(new Date(current.appointment_at)) !== bangkokDateKey()) {
    throw new DomainError('สามารถแจ้งมาถึงได้เฉพาะวันนัดที่แพทย์ยืนยันแล้ว', 'INVALID_STATE', 409)
  }
  const now = new Date()
  const row = await db.collection('appointment_requests').findOneAndUpdate(
    { _id: id, status: 'confirmed' },
    { $set: { status: 'arrival_reported', arrival_reported_at: now, updated_at: now } },
    { returnDocument: 'after' }
  )
  if (!row) throw new DomainError('สถานะคำขอเปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'INVALID_STATE', 409)
  broadcast('appointments', 'arrival_reported', row)
  return row
}

export async function listAppointments(status?: string) {
  const db = await getDb()
  const match = status ? { status } : {}
  return db.collection('appointment_requests').aggregate([
    { $match: match },
    { $sort: { created_at: 1 } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
  ]).toArray()
}

export async function appointmentDetail(id: string) {
  const rows = await listAppointments()
  const oid = objectId(id)
  return rows.find((row) => (row._id as ObjectId).equals(oid)) || null
}

function parseFutureAppointment(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new DomainError('วันและเวลาไม่ถูกต้อง')
  if (date.getTime() < Date.now()) throw new DomainError('วันนัดต้องไม่เป็นอดีต')
  return date
}

export async function proposeAppointment(id: string, appointmentAt: string, note: string) {
  const db = await getDb()
  const at = parseFutureAppointment(appointmentAt)
  const now = new Date()
  const row = await db.collection('appointment_requests').findOneAndUpdate(
    { _id: objectId(id), status: 'submitted' },
    { $set: { status: 'nurse_proposed', appointment_at: at, nurse_note: note.trim(), proposed_at: now, updated_at: now } },
    { returnDocument: 'after' }
  )
  if (!row) throw new DomainError('ไม่สามารถทำรายการในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
  await notify(row.patient_id, 'พยาบาลเสนอวันนัด', 'กรุณารอแพทย์ยืนยันวันนัด', 'appointment_proposed')
  broadcast('appointments', 'appointment_proposed', row)
  return row
}

export async function confirmAppointment(id: string, appointmentAt: string, pc: string, note: string) {
  if (!PC_CODES.has(pc)) throw new DomainError('กรุณาเลือกห้องตรวจ PC–PC4')
  const db = await getDb()
  const at = parseFutureAppointment(appointmentAt)
  const now = new Date()
  const row = await db.collection('appointment_requests').findOneAndUpdate(
    { _id: objectId(id), status: 'nurse_proposed' },
    { $set: { status: 'confirmed', appointment_at: at, assigned_pc: pc, doctor_note: note.trim(), confirmed_at: now, updated_at: now } },
    { returnDocument: 'after' }
  )
  if (!row) throw new DomainError('ไม่สามารถทำรายการในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
  await notify(row.patient_id, 'ยืนยันวันนัดแล้ว', 'แพทย์ยืนยันวันและเวลานัดของคุณแล้ว', 'appointment_confirmed')
  broadcast('appointments', 'appointment_confirmed', row)
  return row
}

export async function cancelByStaff(id: string, reason: string) {
  const result = await (await getDb()).collection('appointment_requests').updateOne(
    { _id: objectId(id), status: { $in: ['submitted', 'nurse_proposed', 'confirmed'] } },
    { $set: { status: 'cancelled', cancel_reason: reason.trim(), updated_at: new Date() } }
  )
  if (!result.modifiedCount) throw new DomainError('ไม่สามารถยกเลิกคำขอในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
  broadcast('appointments', 'appointment_cancelled', { id })
}

function routeSteps(codes: string[], startsAt = new Date()) {
  const baseline = buildBaselinePlan({
    stationCodes: codes,
    startsAt,
    durationFor: (code) => stationMap.get(code)?.averageServiceMin || 10,
  })
  return baseline.map((segment) => ({
    id: new ObjectId(),
    station_code: segment.station_code,
    status: 'pending',
    estimated_wait_min: 0,
    baseline_start_at: new Date(segment.baseline_start_at),
    baseline_end_at: new Date(segment.baseline_end_at),
  }))
}

async function enqueue(encounterId: ObjectId, patientId: ObjectId, stationCode: string, priority: string, queueNo?: string) {
  const db = await getDb()
  const now = new Date()
  const active = await db.collection('queue_items').countDocuments({ station_code: stationCode, status: { $in: ACTIVE_QUEUE } })
  const station = await db.collection('stations').findOne({ code: stationCode })
  const row = {
    _id: new ObjectId(),
    queue_no: queueNo || (await generateQueueNo(stationCode)),
    encounter_id: encounterId,
    patient_id: patientId,
    station_code: stationCode,
    status: 'waiting',
    priority,
    estimated_wait_min: active * Number(station?.average_service_min || 10),
    rank: now,
    call_count: 0,
    skip_count: 0,
    version: 1,
    created_at: now,
    updated_at: now,
  }
  await db.collection('queue_items').insertOne(row)
  broadcast(`station:${stationCode}`, 'queue_updated', row)
  broadcast('tv', 'queue_updated', { station_code: stationCode, queue_no: row.queue_no, status: row.status })
  return row
}

export async function confirmCheckIn(id: string) {
  const db = await getDb()
  const requestId = objectId(id)
  const req = await db.collection('appointment_requests').findOne({ _id: requestId })
  if (!req) throw new DomainError('ไม่พบคำขอนัด', 'NOT_FOUND', 404)
  if (req.encounter_id) return req
  if (req.status !== 'arrival_reported' || !PC_CODES.has(req.assigned_pc)) {
    throw new DomainError('ไม่สามารถเช็กอินคำขอนี้ได้', 'INVALID_STATE', 409)
  }
  const now = new Date()
  const encounterId = new ObjectId()
  const codes = [...BASE_ROUTE, req.assigned_pc]
  const steps = routeSteps(codes)
  steps[0] = { ...steps[0], status: 'in_progress', started_at: now } as typeof steps[number]
  const queueNo = await generateQueueNo('NPR')
  const encounter = {
    _id: encounterId,
    encounter_no: `VIS-${bangkokDateKey().replaceAll('-', '')}-${String(await counter('system_counters', `visit:${bangkokDateKey()}`)).padStart(4, '0')}`,
    patient_id: req.patient_id,
    appointment_request_id: req._id,
    visit_date: now,
    appointment_time: req.appointment_at,
    status: 'active',
    priority: 'normal',
    flags: [],
    current_station: 'NPR',
    current_queue_no: queueNo,
    route: steps,
    total_wait_min: 0,
    total_visit_min: 0,
    checked_in_at: now,
    created_at: now,
    updated_at: now,
  }
  await db.collection('encounters').insertOne(encounter)
  try {
    await enqueue(encounterId, req.patient_id, 'NPR', 'normal', queueNo)
  } catch (error) {
    await db.collection('encounters').deleteOne({ _id: encounterId })
    throw error
  }
  const result = await db.collection('appointment_requests').findOneAndUpdate(
    { _id: requestId, status: 'arrival_reported', encounter_id: { $exists: false } },
    { $set: { status: 'checked_in', encounter_id: encounterId, checked_in_at: now, updated_at: now } },
    { returnDocument: 'after' }
  )
  if (!result) {
    await db.collection('queue_items').deleteMany({ encounter_id: encounterId })
    await db.collection('encounters').deleteOne({ _id: encounterId })
    throw new DomainError('คำขอนี้ถูกเช็กอินแล้ว', 'INVALID_STATE', 409)
  }
  await notify(req.patient_id, 'เช็กอินสำเร็จ', `คุณได้รับคิว ${queueNo} ที่จุดลงทะเบียน`, 'checked_in', encounterId)
  broadcast('encounters', 'encounter_created', encounter)
  return result
}

// -------------------------------------------------------------
// Station Queue Management
// -------------------------------------------------------------

export async function getStationQueue(stationCode: string) {
  const db = await getDb()
  const items = await db.collection('queue_items').aggregate([
    { $match: { station_code: stationCode, status: { $in: ['waiting', 'called', 'in_progress', 'no_show'] } } },
    { $sort: { rank: 1, created_at: 1 } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $lookup: { from: 'encounters', localField: 'encounter_id', foreignField: '_id', as: 'encounter_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] }, encounter: { $arrayElemAt: ['$encounter_rows', 0] } } },
    { $unset: ['patient_rows', 'encounter_rows'] },
  ]).toArray()
  const counts = { waiting: 0, called: 0, in_progress: 0, no_show: 0 }
  const nowServing: Document[] = []
  for (const item of items) {
    if (item.status === 'waiting') counts.waiting++
    if (item.status === 'called') { counts.called++; nowServing.push(item) }
    if (item.status === 'in_progress') { counts.in_progress++; nowServing.push(item) }
    if (item.status === 'no_show') counts.no_show++
  }
  return { items, now_serving: nowServing, counts }
}

export async function callNext(stationCode: string, staffId: string) {
  const now = new Date()
  const row = await (await getDb()).collection('queue_items').findOneAndUpdate(
    { station_code: stationCode, status: 'waiting' },
    { $set: { status: 'called', assigned_staff_id: objectId(staffId), called_at: now, updated_at: now }, $inc: { call_count: 1, version: 1 } },
    { sort: { rank: 1, created_at: 1 }, returnDocument: 'after' }
  )
  if (!row) throw new DomainError('ไม่มีคิวรอ', 'EMPTY_QUEUE', 404)
  await auditQueue(row, 'call', staffId)
  await notify(row.patient_id, 'ถึงคิวของคุณแล้ว', `เชิญที่ ${stationMap.get(stationCode)?.name || stationCode}`, 'queue_called', row.encounter_id)
  broadcast(`station:${stationCode}`, 'queue_called', row)
  broadcast('tv', 'queue_called', { station_code: stationCode, queue_no: row.queue_no, station_name: stationMap.get(stationCode)?.name })
  return row
}

export async function startQueue(stationCode: string, itemId: string, staffId: string, version: number) {
  const now = new Date()
  const db = await getDb()
  const row = await db.collection('queue_items').findOneAndUpdate(
    { _id: objectId(itemId), station_code: stationCode, status: { $in: ['waiting', 'called'] }, version },
    { $set: { status: 'in_progress', assigned_staff_id: objectId(staffId), started_at: now, updated_at: now }, $inc: { version: 1 } },
    { returnDocument: 'after' }
  )
  if (!row) throw new DomainError('ไม่สามารถเริ่มคิวนี้ได้', 'INVALID_STATE', 409)
  await auditQueue(row, 'start', staffId)
  const encounter = await db.collection('encounters').findOne({ _id: row.encounter_id })
  if (encounter?.appointment_request_id) {
    await db.collection('appointment_requests').updateOne({ _id: encounter.appointment_request_id, status: 'checked_in' }, { $set: { status: 'in_service', updated_at: now } })
  }
  broadcast(`station:${stationCode}`, 'queue_started', row)
  return row
}

export async function recallQueue(stationCode: string, itemId: string, staffId: string, version: number) {
  const row = await (await getDb()).collection('queue_items').findOneAndUpdate(
    { _id: objectId(itemId), station_code: stationCode, status: { $in: ['called', 'in_progress'] }, version },
    { $set: { updated_at: new Date() }, $inc: { call_count: 1, version: 1 } },
    { returnDocument: 'after' }
  )
  if (!row) throw new DomainError('ไม่พบคิวที่เรียกอยู่', 'NOT_FOUND', 404)
  await auditQueue(row, 'recall', staffId)
  await notify(row.patient_id, 'เรียกคิวอีกครั้ง', `กรุณาไปที่ ${stationMap.get(stationCode)?.name || stationCode}`, 'queue_called', row.encounter_id)
  broadcast(`station:${stationCode}`, 'queue_recalled', row)
  broadcast('tv', 'queue_called', { station_code: stationCode, queue_no: row.queue_no, station_name: stationMap.get(stationCode)?.name })
  return row
}

export async function skipQueue(stationCode: string, itemId: string, staffId: string, version: number) {
  const row = await (await getDb()).collection('queue_items').findOneAndUpdate(
    { _id: objectId(itemId), station_code: stationCode, status: { $in: ['waiting', 'called'] }, version },
    { $set: { status: 'no_show', updated_at: new Date() }, $inc: { skip_count: 1, version: 1 } },
    { returnDocument: 'after' }
  )
  if (!row) throw new DomainError('ไม่พบคิว', 'NOT_FOUND', 404)
  await auditQueue(row, 'no_show', staffId)
  broadcast(`station:${stationCode}`, 'queue_skipped', row)
  return row
}

export async function requeue(stationCode: string, itemId: string, staffId: string, version: number) {
  const now = new Date()
  const row = await (await getDb()).collection('queue_items').findOneAndUpdate(
    { _id: objectId(itemId), station_code: stationCode, status: 'no_show', version },
    { $set: { status: 'waiting', rank: now, updated_at: now }, $unset: { called_at: '', assigned_staff_id: '' }, $inc: { version: 1 } },
    { returnDocument: 'after' }
  )
  if (!row) throw new DomainError('ไม่พบคิว', 'NOT_FOUND', 404)
  await auditQueue(row, 'requeue', staffId)
  broadcast(`station:${stationCode}`, 'queue_requeued', row)
  return row
}

export async function completeQueue(stationCode: string, itemId: string, staffId: string, version: number) {
  const db = await getDb()
  const item = await db.collection('queue_items').findOne({ _id: objectId(itemId), station_code: stationCode })
  if (!item) throw new DomainError('ไม่พบคิว', 'NOT_FOUND', 404)
  if (item.status === 'completed') throw new DomainError('คิวนี้ถูกปิดไปแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  if (Number(item.version) !== version) throw new DomainError('ข้อมูลคิวถูกแก้ไขแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  if (!['called', 'in_progress'].includes(item.status)) throw new DomainError('คิวนี้ยังไม่พร้อมเสร็จสิ้น', 'INVALID_STATE', 409)
  const encounter = await db.collection('encounters').findOne({ _id: item.encounter_id, status: 'active' })
  if (!encounter) throw new DomainError('ไม่พบ visit ที่กำลังดำเนินการ', 'NOT_FOUND', 404)
  const route = Array.isArray(encounter.route) ? [...encounter.route] : []
  const index = route.findIndex((step) => step.station_code === stationCode && step.status === 'in_progress')
  if (index < 0) throw new DomainError('Route ของ Station นี้ไม่ได้อยู่ในสถานะกำลังดำเนินการ', 'INVALID_STATE', 409)
  if (PC_CODES.has(stationCode) && index === route.length - 1) {
    throw new DomainError('กรุณากำหนดเส้นทางหลังห้องตรวจก่อนกดเสร็จ', 'INVALID_STATE', 409)
  }
  const now = new Date()
  route[index] = { ...route[index], status: 'completed', completed_at: now }
  const changed = await db.collection('queue_items').updateOne(
    { _id: item._id, status: item.status, version },
    { $set: { status: 'completed', completed_at: now, updated_at: now }, $inc: { version: 1 } }
  )
  if (!changed.modifiedCount) throw new DomainError('สถานะคิวเปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'INVALID_STATE', 409)
  const completed = { ...item, status: 'completed', completed_at: now, updated_at: now, version: version + 1 }
  await auditQueue(completed, 'complete_station', staffId)

  if (index === route.length - 1) {
    await db.collection('encounters').updateOne(
      { _id: encounter._id },
      { $set: { route, status: 'completed', completed_at: now, updated_at: now } }
    )
    if (encounter.appointment_request_id) {
      await db.collection('appointment_requests').updateOne({ _id: encounter.appointment_request_id }, { $set: { status: 'completed', updated_at: now } })
    }
    await notify(item.patient_id, 'การรับบริการเสร็จสมบูรณ์', 'การรับบริการวันนี้เสร็จสมบูรณ์แล้ว', 'visit_completed', encounter._id)
    broadcast('encounters', 'encounter_completed', { encounter_id: encounter._id.toHexString() })
    return { queue_item: completed, next_queue_item: null }
  }

  const nextCode = route[index + 1].station_code
  const queueNo = await generateQueueNo(nextCode)
  route[index + 1] = { ...route[index + 1], status: 'in_progress', started_at: now }
  let next: Document
  try {
    next = await enqueue(encounter._id, encounter.patient_id, nextCode, encounter.priority || 'normal', queueNo)
  } catch (error) {
    await db.collection('queue_items').updateOne({ _id: item._id, version: version + 1 }, { $set: { status: item.status }, $unset: { completed_at: '' }, $inc: { version: -1 } })
    throw error
  }
  await db.collection('encounters').updateOne(
    { _id: encounter._id },
    { $set: { route, current_station: nextCode, current_queue_no: queueNo, updated_at: now } }
  )
  await auditQueue(next, 'move_to_station', staffId, stationCode, nextCode)
  await notify(item.patient_id, 'ไปยังจุดถัดไป', `กรุณาไปที่ ${stationMap.get(nextCode)?.name || nextCode}`, 'station_changed', encounter._id)
  const ahead = await db.collection('queue_items').countDocuments({
    station_code: nextCode,
    status: { $in: ['waiting', 'called'] },
    rank: { $lt: next.rank },
  })
  if (ahead <= 2) {
    await notify(item.patient_id, 'ใกล้ถึงคิวแล้ว', `ขณะนี้มีผู้ป่วยข้างหน้าคุณไม่เกิน 2 คิวที่ ${stationMap.get(nextCode)?.name || nextCode}`, 'queue_near', encounter._id)
  }
  broadcast('encounters', 'encounter_moved', { encounter_id: encounter._id.toHexString(), next_station: nextCode })
  return { queue_item: completed, next_queue_item: next }
}

// -------------------------------------------------------------
// Clinical: Vitals, Nurse Workup, Doctor Orders
// -------------------------------------------------------------

export async function saveVitals(encounterId: string, vitalsData: Record<string, unknown>, staffId?: string) {
  const db = await getDb()
  const encId = objectId(encounterId)
  const encounter = await db.collection('encounters').findOne({ _id: encId })
  if (!encounter) throw new DomainError('ไม่พบ visit', 'NOT_FOUND', 404)

  const height = Number(vitalsData.height_cm || 0)
  const weight = Number(vitalsData.weight_kg || 0)
  let bmi: number | undefined
  if (height > 0 && weight > 0) {
    const hM = height / 100
    bmi = Number((weight / (hM * hM)).toFixed(1))
  }

  const record = {
    _id: new ObjectId(),
    encounter_id: encId,
    patient_id: encounter.patient_id,
    sbp: vitalsData.sbp ? Number(vitalsData.sbp) : undefined,
    dbp: vitalsData.dbp ? Number(vitalsData.dbp) : undefined,
    pulse: vitalsData.pulse ? Number(vitalsData.pulse) : undefined,
    temperature: vitalsData.temperature ? Number(vitalsData.temperature) : undefined,
    respiratory_rate: vitalsData.respiratory_rate ? Number(vitalsData.respiratory_rate) : undefined,
    spo2: vitalsData.spo2 ? Number(vitalsData.spo2) : undefined,
    weight_kg: weight || undefined,
    height_cm: height || undefined,
    bmi,
    pain_score: vitalsData.pain_score !== undefined ? Number(vitalsData.pain_score) : undefined,
    consciousness: vitalsData.consciousness || 'alert',
    triage_level: vitalsData.triage_level || 'normal',
    notes: String(vitalsData.notes || '').trim(),
    recorded_by: staffId,
    recorded_at: new Date(),
  }

  await db.collection('vitals').insertOne(record)
  broadcast('clinical', 'vitals_saved', record)
  return record
}

export async function getLatestVitals(encounterId: string) {
  return (await getDb()).collection('vitals').findOne({ encounter_id: objectId(encounterId) }, { sort: { recorded_at: -1 } })
}

export async function saveAssessment(encounterId: string, assessmentData: Record<string, unknown>, staffId?: string) {
  const db = await getDb()
  const encId = objectId(encounterId)
  const encounter = await db.collection('encounters').findOne({ _id: encId })
  if (!encounter) throw new DomainError('ไม่พบ visit', 'NOT_FOUND', 404)

  const doc = {
    _id: new ObjectId(),
    encounter_id: encId,
    patient_id: encounter.patient_id,
    chief_complaint: String(assessmentData.chief_complaint || '').trim(),
    history_of_illness: String(assessmentData.history_of_illness || '').trim(),
    triage_level: String(assessmentData.triage_level || 'normal'),
    is_urgent: Boolean(assessmentData.is_urgent),
    is_fast_track: Boolean(assessmentData.is_fast_track),
    nurse_notes: String(assessmentData.nurse_notes || '').trim(),
    assessed_by: staffId,
    assessed_at: new Date(),
  }
  await db.collection('clinical_assessments').updateOne(
    { encounter_id: encId },
    { $set: doc },
    { upsert: true }
  )
  broadcast('clinical', 'assessment_saved', doc)
  return doc
}

export async function markUrgent(encounterId: string) {
  return updateEncounterPriority(encounterId, 'urgent')
}

export async function saveConsultation(encounterId: string, noteData: Record<string, unknown>, staffId: string) {
  const db = await getDb()
  const encId = objectId(encounterId)
  const encounter = await db.collection('encounters').findOne({ _id: encId })
  if (!encounter) throw new DomainError('ไม่พบ visit', 'NOT_FOUND', 404)

  const doc = {
    _id: new ObjectId(),
    encounter_id: encId,
    patient_id: encounter.patient_id,
    doctor_id: staffId,
    subjective: String(noteData.subjective || '').trim(),
    objective: String(noteData.objective || '').trim(),
    assessment: String(noteData.assessment || '').trim(),
    plan: String(noteData.plan || '').trim(),
    icd10_codes: Array.isArray(noteData.icd10_codes) ? noteData.icd10_codes : [],
    updated_at: new Date(),
  }
  await db.collection('clinical_notes').updateOne(
    { encounter_id: encId },
    { $set: doc, $setOnInsert: { created_at: new Date() } },
    { upsert: true }
  )
  broadcast('clinical', 'consult_note_saved', doc)
  return doc
}

export async function createOrders(encounterId: string, orderData: { items: OrderItem[]; notes?: string }, staffId: string) {
  const db = await getDb()
  const encId = objectId(encounterId)
  const encounter = await db.collection('encounters').findOne({ _id: encId })
  if (!encounter) throw new DomainError('ไม่พบ visit', 'NOT_FOUND', 404)

  const infusionTemplateIds = [...new Set((orderData.items || [])
    .filter((item) => item.type === 'infusion')
    .map((item) => item.service_template_id || ''))]
  if (infusionTemplateIds.some((id) => !ObjectId.isValid(id))) throw new DomainError('กรุณาเลือก Template สำหรับบริการ Infusion')
  const templates = infusionTemplateIds.length
    ? await db.collection('infusion_templates').find({ _id: { $in: infusionTemplateIds.map((id) => new ObjectId(id)) }, is_active: true }).toArray()
    : []
  if (templates.length !== infusionTemplateIds.length) throw new DomainError('Template Infusion ไม่พร้อมใช้งาน', 'INVALID_TEMPLATE', 409)
  const templateById = new Map(templates.map((template) => [template._id.toString(), template]))

  const items = (orderData.items || []).map((item) => ({
    id: new ObjectId().toHexString(),
    type: item.type,
    code: item.code,
    name: item.name,
    quantity: item.quantity || 1,
    dosage: item.dosage || '',
    frequency: item.frequency || '',
    route: item.route || '',
    instructions: item.instructions || '',
    ...(item.type === 'infusion' ? {
      target_station: 'INFUSION',
      service_template_id: item.service_template_id || '',
      planned_for: item.planned_for || '',
      duration_override_min: item.duration_override_min || undefined,
      readiness_metadata: {
        requirements: templateById.get(item.service_template_id || '')?.readiness_requirements || ['active_order'],
        source: 'service_template',
      },
    } : {}),
    status: 'ordered' as const,
  }))

  const doc = {
    _id: new ObjectId(),
    encounter_id: encId,
    patient_id: encounter.patient_id,
    doctor_id: staffId,
    order_type: items.length > 0 && items.every((item) => item.type === items[0].type) && ['lab', 'imaging', 'medication', 'infusion'].includes(items[0].type)
      ? items[0].type
      : 'mixed',
    items,
    status: 'pending',
    version: 1,
    ...(items.some((item) => item.type === 'lab') ? { lab_status: 'ordered' } : {}),
    ...(items.some((item) => item.type === 'medication') ? { pharmacy_status: 'waiting' } : {}),
    notes: String(orderData.notes || '').trim(),
    created_at: new Date(),
    updated_at: new Date(),
  }
  await db.collection('orders').insertOne(doc)
  broadcast('orders', 'order_created', doc)
  return doc
}

// -------------------------------------------------------------
// Laboratory & Pharmacy Workflows
// -------------------------------------------------------------

function versionFilter(version: number) {
  return { version }
}

async function auditClinicalOrder(order: Document, action: string, staffId: string, reason = '') {
  await (await getDb()).collection('clinical_order_events').insertOne({
    order_id: order._id,
    encounter_id: order.encounter_id,
    action,
    actor_id: objectId(staffId),
    reason: reason.trim(),
    version: Number(order.version || 1),
    created_at: new Date(),
  })
}

async function synchronizeOrderStatus(order: Document) {
  const complete = Array.isArray(order.items) && order.items.every((item: Document) => ['completed', 'dispensed', 'cancelled'].includes(String(item.status)))
  const status = complete ? 'completed' : 'in_progress'
  if (order.status !== status) await (await getDb()).collection('orders').updateOne({ _id: order._id, version: order.version }, { $set: { status } })
  order.status = status
  return order
}

export async function getLabQueue() {
  const db = await getDb()
  return db.collection('orders').aggregate([
    { $match: { 'items.type': 'lab', lab_status: { $ne: 'verified' } } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
  ]).toArray()
}

export async function collectLabSample(orderId: string, staffId: string, version: number) {
  const db = await getDb()
  const doc = await db.collection('orders').findOneAndUpdate(
    { _id: objectId(orderId), lab_status: { $in: ['ordered', null] }, ...versionFilter(version) },
    { $set: { 'items.$[elem].status': 'sample_collected', status: 'in_progress', lab_status: 'sample_collected', specimen_collected_at: new Date(), specimen_collected_by: objectId(staffId) }, $inc: { version: 1 } },
    { arrayFilters: [{ 'elem.type': 'lab' }], returnDocument: 'after' }
  )
  if (!doc) throw new DomainError('สถานะใบสั่งตรวจเปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  await auditClinicalOrder(doc, 'sample_collected', staffId)
  broadcast('lab', 'sample_collected', { orderId, version: doc.version })
  return doc
}

export async function saveLabResults(orderId: string, results: Record<string, unknown>, staffId: string, version: number) {
  const db = await getDb()
  const doc = await db.collection('orders').findOneAndUpdate(
    { _id: objectId(orderId), lab_status: 'sample_collected', ...versionFilter(version) },
    { $set: { 'items.$[elem].status': 'analyzed', 'items.$[elem].results': results, lab_status: 'results_recorded', analyzed_at: new Date(), analyzed_by: objectId(staffId) }, $inc: { version: 1 } },
    { arrayFilters: [{ 'elem.type': 'lab' }], returnDocument: 'after' }
  )
  if (!doc) throw new DomainError('ต้องเก็บตัวอย่างก่อนบันทึกผล หรือข้อมูลถูกแก้ไขแล้ว', 'VERSION_CONFLICT', 409)
  await auditClinicalOrder(doc, 'results_recorded', staffId)
  broadcast('lab', 'results_saved', { orderId, version: doc.version })
  return doc
}

export async function verifyLabResults(orderId: string, staffId: string, version: number, reason = '') {
  const db = await getDb()
  const current = await db.collection('orders').findOne({ _id: objectId(orderId), lab_status: 'results_recorded', ...versionFilter(version) })
  if (!current) throw new DomainError('ผลตรวจยังไม่พร้อมยืนยัน หรือข้อมูลถูกแก้ไขแล้ว', 'VERSION_CONFLICT', 409)
  if (current.analyzed_by?.toString() === staffId) throw new DomainError('ผู้ตรวจยืนยันต้องเป็นคนละคนกับผู้บันทึกผล', 'SEPARATION_OF_DUTIES', 409)
  const doc = await db.collection('orders').findOneAndUpdate(
    { _id: current._id, lab_status: 'results_recorded', ...versionFilter(version) },
    { $set: { 'items.$[elem].status': 'completed', lab_status: 'verified', verified_at: new Date(), verified_by: objectId(staffId) }, $inc: { version: 1 } },
    { arrayFilters: [{ 'elem.type': 'lab' }], returnDocument: 'after' }
  )
  if (!doc) throw new DomainError('ข้อมูลถูกแก้ไขโดยเจ้าหน้าที่คนอื่น กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  await synchronizeOrderStatus(doc)
  await auditClinicalOrder(doc, 'results_verified', staffId, reason)
  broadcast('lab', 'results_verified', { orderId, version: doc.version })
  return doc
}

export async function getPharmacyQueue() {
  const db = await getDb()
  return db.collection('orders').aggregate([
    { $match: { 'items.type': 'medication', pharmacy_status: { $ne: 'dispensed' } } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
  ]).toArray()
}

export async function startPreparePharmacy(orderId: string, staffId: string, version: number) {
  const db = await getDb()
  const doc = await db.collection('orders').findOneAndUpdate(
    { _id: objectId(orderId), pharmacy_status: { $in: ['waiting', null] }, ...versionFilter(version) },
    { $set: { 'items.$[elem].status': 'prepared', pharmacy_status: 'preparing', prepared_by: objectId(staffId), prepared_at: new Date() }, $inc: { version: 1 } },
    { arrayFilters: [{ 'elem.type': 'medication' }], returnDocument: 'after' }
  )
  if (!doc) throw new DomainError('ใบสั่งยาไม่อยู่ในสถานะรอจัด หรือข้อมูลถูกแก้ไขแล้ว', 'VERSION_CONFLICT', 409)
  await auditClinicalOrder(doc, 'preparation_started', staffId)
  broadcast('pharmacy', 'rx_prepared', { orderId, version: doc.version })
  return doc
}

export async function readyPharmacy(orderId: string, staffId: string, version: number) {
  const db = await getDb()
  const doc = await db.collection('orders').findOneAndUpdate(
    { _id: objectId(orderId), pharmacy_status: 'preparing', ...versionFilter(version) },
    { $set: { 'items.$[elem].status': 'ready', pharmacy_status: 'ready', ready_at: new Date(), ready_by: objectId(staffId) }, $inc: { version: 1 } },
    { arrayFilters: [{ 'elem.type': 'medication' }], returnDocument: 'after' },
  )
  if (!doc) throw new DomainError('ต้องเริ่มจัดยาก่อนแจ้งพร้อมจ่าย หรือข้อมูลถูกแก้ไขแล้ว', 'VERSION_CONFLICT', 409)
  await auditClinicalOrder(doc, 'medication_ready', staffId)
  broadcast('pharmacy', 'rx_ready', { orderId, version: doc.version })
  return doc
}

export async function dispensePharmacy(orderId: string, staffId: string, version: number, reason = '') {
  const db = await getDb()
  const doc = await db.collection('orders').findOneAndUpdate(
    { _id: objectId(orderId), pharmacy_status: 'ready', ...versionFilter(version) },
    { $set: { 'items.$[elem].status': 'dispensed', pharmacy_status: 'dispensed', dispensed_by: objectId(staffId), dispensed_at: new Date() }, $inc: { version: 1 } },
    { arrayFilters: [{ 'elem.type': 'medication' }], returnDocument: 'after' }
  )
  if (!doc) throw new DomainError('ยาต้องอยู่ในสถานะพร้อมจ่าย หรือข้อมูลถูกแก้ไขแล้ว', 'VERSION_CONFLICT', 409)
  await synchronizeOrderStatus(doc)
  await auditClinicalOrder(doc, 'medication_dispensed', staffId, reason)
  broadcast('pharmacy', 'rx_dispensed', { orderId, version: doc.version })
  return doc
}

// -------------------------------------------------------------
// Operations, AMIS Flow Engine & Insights
// -------------------------------------------------------------

export async function getOperationsSnapshot() {
  const db = await getDb()
  const now = new Date()
  const { start: todayStart, end: todayEnd } = bangkokDayRange(now)
  const historyFrom = new Date(now.getTime() - FLOW_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const [encountersToday, queueItems, queueHistory, recommendations] = await Promise.all([
    db.collection('encounters').find({ checked_in_at: { $gte: todayStart, $lt: todayEnd } }).toArray(),
    db.collection('queue_items').find({ status: { $in: ACTIVE_QUEUE } }).toArray(),
    db.collection('queue_items').find({ completed_at: { $gte: historyFrom }, started_at: { $exists: true } }).toArray(),
    db.collection('recommendations').find({ status: 'pending' }).toArray(),
  ])

  const queuesByStation = new Map<string, { waiting: Document[]; active: Document[] }>()
  for (const q of queueItems) {
    const prev = queuesByStation.get(q.station_code) || { waiting: [], active: [] }
    if (q.status === 'waiting') prev.waiting.push(q)
    if (q.status === 'called' || q.status === 'in_progress') prev.active.push(q)
    queuesByStation.set(q.station_code, prev)
  }

  const samplesByStation = new Map<string, number[]>()
  const waitsToday: number[] = []
  for (const item of queueHistory) {
    const duration = minutesBetween(item.started_at, item.completed_at)
    if (duration > 0) {
      const values = samplesByStation.get(String(item.station_code)) || []
      values.push(duration)
      samplesByStation.set(String(item.station_code), values)
    }
    if (item.started_at >= todayStart) {
      const wait = minutesBetween(item.created_at, item.started_at)
      if (wait >= 0) waitsToday.push(wait)
    }
  }

  let bottleneckCount = 0
  const stationStatuses = STATIONS.map((s) => {
    const q = queuesByStation.get(s.code) || { waiting: [], active: [] }
    const estimate = buildFlowEstimate(samplesByStation.get(s.code) || [], s.averageServiceMin)
    const estWait = simulateNewArrivalWait({ now, capacity: s.capacity, serviceMin: estimate.p50_min, active: q.active as Array<{ status: string; started_at?: Date }>, waitingCount: q.waiting.length })
    const estWaitP80 = simulateNewArrivalWait({ now, capacity: s.capacity, serviceMin: estimate.p80_min, active: q.active as Array<{ status: string; started_at?: Date }>, waitingCount: q.waiting.length })
    const state = classifyFlowState({ waiting: q.waiting.length, inProgress: q.active.length, capacity: s.capacity, waitP80Min: estWaitP80 })
    if (state === 'bottleneck') bottleneckCount++
    const completedLastHour = queueHistory.filter((item) => item.station_code === s.code && item.completed_at >= new Date(now.getTime() - 60 * 60 * 1000)).length

    return {
      code: s.code,
      name: s.name,
      floor: s.floor,
      state,
      waiting_count: q.waiting.length,
      in_progress_count: q.active.length,
      capacity: s.capacity,
      avg_service_min: estimate.p50_min,
      est_wait_min: estWait,
      est_wait_p80_min: estWaitP80,
      estimate,
      queue_pressure: Number(((q.waiting.length + q.active.length) / Math.max(1, s.capacity)).toFixed(2)),
      throughput_per_hour: completedLastHour,
    }
  })

  const completedTodayRows = encountersToday.filter((encounter) => encounter.status === 'completed' && encounter.completed_at)
  const visitDurations = completedTodayRows.map((encounter) => minutesBetween(encounter.checked_in_at, encounter.completed_at)).filter((value) => value > 0)
  const hourlyFlow = Array.from({ length: 11 }, (_, index) => {
    const hour = String(index + 8).padStart(2, '0')
    return {
      hour: `${hour}:00`,
      arrivals: encountersToday.filter((encounter) => encounter.checked_in_at && bangkokHour(new Date(encounter.checked_in_at)) === hour).length,
      discharges: completedTodayRows.filter((encounter) => bangkokHour(new Date(encounter.completed_at)) === hour).length,
    }
  })

  return {
    server_now: now,
    generated_at: now,
    data_window: { days: FLOW_HISTORY_WINDOW_DAYS, from: historyFrom, to: now },
    kpis: {
      total_patients_today: encountersToday.length,
      active_now: encountersToday.filter((encounter) => encounter.status === 'active').length,
      completed_today: completedTodayRows.length,
      avg_total_visit_min: visitDurations.length ? Math.round(visitDurations.reduce((sum, value) => sum + value, 0) / visitDurations.length) : 0,
      avg_wait_min: waitsToday.length ? Math.round(waitsToday.reduce((sum, value) => sum + value, 0) / waitsToday.length) : 0,
      bottleneck_station_count: bottleneckCount,
    },
    stations: stationStatuses,
    recommendations,
    hourly_flow: hourlyFlow,
  }
}

export async function getFlowBoard() {
  return getOperationsSnapshot()
}

function segmentFromRoute(encounter: Document, step: Document, index: number): FlowPlanSegment {
  const encounterStart = new Date(encounter.checked_in_at || encounter.created_at).getTime()
  const fallbackStart = new Date(encounterStart + index * 10 * 60_000)
  const baselineStart = step.baseline_start_at ? new Date(step.baseline_start_at) : fallbackStart
  const baselineEnd = step.baseline_end_at
    ? new Date(step.baseline_end_at)
    : new Date(baselineStart.getTime() + (stationMap.get(String(step.station_code))?.averageServiceMin || 10) * 60_000)
  return {
    id: step.id?.toString() || `${encounter._id}:${index}`,
    encounter_id: encounter._id.toString(),
    station_code: String(step.station_code),
    baseline_start_at: baselineStart.toISOString(),
    baseline_end_at: baselineEnd.toISOString(),
    adapted_start_at: baselineStart.toISOString(),
    adapted_end_at: baselineEnd.toISOString(),
    shift_min: 0,
    reason: 'แผนตั้งต้นเมื่อสร้างเส้นทาง',
  }
}

export async function getFlowSchedule(): Promise<FlowScheduleSlot[]> {
  const db = await getDb()
  const now = new Date()
  const [snapshot, encounters] = await Promise.all([
    getOperationsSnapshot(),
    db.collection('encounters').find({ status: 'active' }).sort({ checked_in_at: 1 }).toArray(),
  ])
  const stationByCode = new Map(snapshot.stations.map((station) => [station.code, station]))
  const patientIds = encounters.map((row) => row.patient_id).filter(Boolean)
  const patients = await db.collection('patients').find({ _id: { $in: patientIds } }).toArray()
  const patientById = new Map(patients.map((row) => [row._id.toString(), row]))

  return encounters.flatMap((encounter) => {
    const route = Array.isArray(encounter.route) ? encounter.route : []
    const currentIndex = Math.max(0, route.findIndex((step: Document) => step.status === 'in_progress'))
    const baseline = route.map((step: Document, index: number) => segmentFromRoute(encounter, step, index))
    const adapted = adaptFlowPlan({
      baseline,
      now,
      currentIndex,
      waitFor: (code) => stationByCode.get(code)?.est_wait_p80_min || 0,
      durationFor: (code) => stationByCode.get(code)?.estimate.p80_min || stationMap.get(code)?.averageServiceMin || 10,
    })
    const patient = patientById.get(encounter.patient_id?.toString())
    return adapted.map((segment, index): FlowScheduleSlot => ({
      id: segment.id,
      encounter_id: encounter._id.toString(),
      patient: { hn: String(patient?.hn || ''), display_name: String(patient?.display_name || '') },
      station_code: segment.station_code,
      station_name: stationMap.get(segment.station_code)?.name || segment.station_code,
      status: route[index]?.status === 'completed' ? 'completed'
        : route[index]?.status === 'in_progress' ? 'in_progress' : 'planned',
      baseline_start_at: segment.baseline_start_at,
      baseline_end_at: segment.baseline_end_at,
      adapted_start_at: segment.adapted_start_at,
      adapted_end_at: segment.adapted_end_at,
      shift_min: segment.shift_min,
      reason: segment.reason,
    }))
  })
}

export async function getActivePatientFlow(): Promise<ActivePatientFlow[]> {
  const db = await getDb()
  const [snapshot, rows] = await Promise.all([
    getOperationsSnapshot(),
    db.collection('encounters').aggregate([
      { $match: { status: 'active' } },
      { $sort: { updated_at: -1 } },
      { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
      { $lookup: { from: 'queue_items', let: { encounterId: '$_id', currentStation: '$current_station' }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$encounter_id', '$$encounterId'] }, { $eq: ['$station_code', '$$currentStation'] }, { $in: ['$status', ACTIVE_QUEUE] }] } } },
        { $sort: { created_at: -1 } }, { $limit: 1 },
      ], as: 'queue_rows' } },
      { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] }, queue: { $arrayElemAt: ['$queue_rows', 0] } } },
      { $unset: ['patient_rows', 'queue_rows'] },
    ]).toArray(),
  ])
  const stationByCode = new Map(snapshot.stations.map((station) => [station.code, station]))
  return rows.map((row): ActivePatientFlow => {
    const station = stationByCode.get(String(row.current_station))
    return {
      id: row._id.toString(),
      encounter_no: String(row.encounter_no || ''),
      patient: { hn: String(row.patient?.hn || ''), display_name: String(row.patient?.display_name || '') },
      priority: row.priority || 'normal',
      current_station: String(row.current_station || ''),
      station_name: station?.name || String(row.current_station || ''),
      queue_no: String(row.queue?.queue_no || row.current_queue_no || ''),
      queue_status: row.queue?.status || '',
      waiting_since: row.queue?.created_at?.toISOString?.() || row.queue?.created_at,
      est_wait_min: station?.est_wait_min || 0,
      est_wait_p80_min: station?.est_wait_p80_min || 0,
      route: row.route || [],
      updated_at: new Date(row.updated_at || row.created_at).toISOString(),
    }
  })
}

export async function getOperationsInsights(from?: string, to?: string): Promise<OperationsInsights> {
  const db = await getDb()
  const now = new Date()
  const defaultRange = bangkokDayRange(now)
  const rangeStart = from ? new Date(from) : defaultRange.start
  const rangeEnd = to ? new Date(to) : defaultRange.end
  if (!Number.isFinite(rangeStart.getTime()) || !Number.isFinite(rangeEnd.getTime()) || rangeStart >= rangeEnd) {
    throw new DomainError('ช่วงเวลาสำหรับรายงานไม่ถูกต้อง')
  }
  const [encounters, queueRows, snapshot] = await Promise.all([
    db.collection('encounters').find({ checked_in_at: { $gte: rangeStart, $lt: rangeEnd } }).toArray(),
    db.collection('queue_items').find({ created_at: { $gte: rangeStart, $lt: rangeEnd } }).toArray(),
    getOperationsSnapshot(),
  ])
  const completed = encounters.filter((row) => row.status === 'completed' && row.completed_at)
  const visitMinutes = completed.map((row) => minutesBetween(row.checked_in_at, row.completed_at)).filter((value) => value > 0)
  const waitMinutes = queueRows.map((row) => minutesBetween(row.created_at, row.started_at)).filter((value) => value > 0)
  const hours = new Set<string>()
  encounters.forEach((row) => row.checked_in_at && hours.add(`${bangkokHour(new Date(row.checked_in_at))}:00`))
  completed.forEach((row) => row.completed_at && hours.add(`${bangkokHour(new Date(row.completed_at))}:00`))
  const hourlyFlow = [...hours].sort().map((hour) => ({
    hour,
    arrivals: encounters.filter((row) => `${bangkokHour(new Date(row.checked_in_at))}:00` === hour).length,
    discharges: completed.filter((row) => `${bangkokHour(new Date(row.completed_at))}:00` === hour).length,
  }))
  return {
    generated_at: now.toISOString(),
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
    totals: {
      arrivals: encounters.length,
      completed: completed.length,
      completion_rate_percent: encounters.length ? Math.round(completed.length / encounters.length * 1000) / 10 : 0,
      avg_visit_min: visitMinutes.length ? Math.round(visitMinutes.reduce((sum, value) => sum + value, 0) / visitMinutes.length) : 0,
      avg_wait_min: waitMinutes.length ? Math.round(waitMinutes.reduce((sum, value) => sum + value, 0) / waitMinutes.length) : 0,
    },
    hourly_flow: hourlyFlow,
    station_performance: snapshot.stations,
  }
}

export async function reportBottleneck(stationCode: string, note = '') {
  const db = await getDb()
  const station = stationMap.get(stationCode)
  const rec = {
    _id: new ObjectId(),
    station_code: stationCode,
    station_name: station?.name || stationCode,
    type: 'staff_assist',
    title: `แจ้งเตือนคอขวดเร่งด่วนที่ ${station?.name || stationCode}`,
    reason: note || 'เจ้าหน้าที่ประจำจุดขอกำลังเสริมเนื่องจากมีผู้ป่วยสะสม',
    action_label: 'จัดส่งเจ้าหน้าที่เสริม',
    status: 'pending',
    version: 1,
    created_at: new Date(),
  }
  await db.collection('recommendations').insertOne(rec)
  broadcast('operations', 'bottleneck_reported', rec)
  return rec
}

async function decideRecommendation(id: string, decision: 'accepted' | 'rejected', actorId: string, reason: string, version: number) {
  const db = await getDb()
  const doc = await db.collection('recommendations').findOneAndUpdate(
    { _id: objectId(id), status: 'pending', version },
    { $set: { status: decision, decision_reason: reason.trim(), decided_by: objectId(actorId), resolved_at: new Date() }, $inc: { version: 1 } },
    { returnDocument: 'after' }
  )
  if (!doc) throw new DomainError('คำแนะนำถูกตัดสินใจหรือแก้ไขแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  await db.collection('recommendation_decisions').insertOne({
    recommendation_id: doc._id,
    decision,
    actor_id: objectId(actorId),
    reason: reason.trim(),
    version: doc.version,
    decided_at: new Date(),
  })
  broadcast('operations', `recommendation_${decision}`, { id, actor_id: actorId, version: doc.version })
  return doc
}

export async function acceptRecommendation(id: string, actorId: string, reason: string, version: number) {
  return decideRecommendation(id, 'accepted', actorId, reason, version)
}

export async function rejectRecommendation(id: string, actorId: string, reason: string, version: number) {
  return decideRecommendation(id, 'rejected', actorId, reason, version)
}

// -------------------------------------------------------------
// Public TV & Maps
// -------------------------------------------------------------

export async function getTvBoard(stationCode?: string) {
  const db = await getDb()
  const filter = stationCode ? { station_code: stationCode } : {}
  const items = await db.collection('queue_items').aggregate([
    { $match: { ...filter, status: { $in: ['called', 'in_progress', 'waiting'] } } },
    { $sort: { called_at: -1, rank: 1 } },
    { $limit: 12 },
  ]).toArray()

  const serving = items.filter((item) => ['called', 'in_progress'].includes(item.status)).map(toPublicTvQueueItem)
  const waiting = items.filter((item) => item.status === 'waiting').map(toPublicTvQueueItem)
  return { serving, waiting, updated_at: new Date() }
}

export async function getKioskJourney(identifier: string, birthDate: string) {
  const db = await getDb()
  const clean = identifier.trim().toUpperCase()
  const birth = new Date(`${birthDate}T00:00:00+07:00`)
  if (!clean || Number.isNaN(birth.getTime())) throw new DomainError('กรุณากรอกข้อมูลยืนยันให้ครบ')
  const nextDay = new Date(birth.getTime() + 24 * 60 * 60 * 1000)
  const patient = await db.collection('patients').findOne({
    $and: [
      { $or: [{ hn: clean }, { phone: identifier.trim() }] },
      { birth_date: { $gte: birth, $lt: nextDay } },
    ],
  })
  if (!patient) throw new DomainError('ไม่พบข้อมูลที่ตรงกัน กรุณาตรวจสอบ HN/เบอร์โทรและวันเกิด', 'NOT_FOUND', 404)
  const encounter = await db.collection('encounters').findOne({ patient_id: patient._id, status: 'active' }, { sort: { created_at: -1 } })
  if (!encounter) return { patient: { display_name: patient.display_name, hn: patient.hn }, journey: null }
  const queue = await db.collection('queue_items').findOne({ encounter_id: encounter._id, station_code: encounter.current_station, status: { $in: ACTIVE_QUEUE } }, { sort: { created_at: -1 } })
  const ahead = queue ? await db.collection('queue_items').countDocuments({ station_code: encounter.current_station, status: { $in: ['waiting', 'called'] }, rank: { $lt: queue.rank } }) : 0
  const station = stationMap.get(encounter.current_station)
  const snapshot = await getOperationsSnapshot()
  const flow = snapshot.stations.find((row) => row.code === encounter.current_station)
  const active = await db.collection('queue_items').find({ station_code: encounter.current_station, status: { $in: ['called', 'in_progress'] } }).toArray()
  const activeItems = active.map((row) => ({
    status: String(row.status),
    ...(row.started_at instanceof Date ? { started_at: row.started_at } : {}),
  }))
  const estimatedWait = simulateNewArrivalWait({ now: new Date(), capacity: flow?.capacity || station?.capacity || 1, serviceMin: flow?.estimate.p50_min || station?.averageServiceMin || 10, active: activeItems, waitingCount: ahead })
  const currentIndex = (encounter.route || []).findIndex((step: Document) => step.status === 'in_progress')
  const next = currentIndex >= 0 ? encounter.route?.[currentIndex + 1] : undefined
  return {
    patient: { display_name: patient.display_name, hn: patient.hn },
    journey: {
      queue_no: queue?.queue_no || encounter.current_queue_no,
      current_station: encounter.current_station,
      station_name: station?.name || encounter.current_station,
      station_floor: station?.floor || '',
      queue_ahead: ahead,
      est_wait_min: estimatedWait,
      est_wait_band: Math.max(0, (flow?.est_wait_p80_min || estimatedWait) - estimatedWait),
      wait_source: flow?.estimate.source || 'configured_fallback',
      flow_status: flow?.state,
      next_station: next?.station_code || '',
      next_station_name: next ? stationMap.get(next.station_code)?.name || next.station_code : '',
    },
  }
}

export async function getMapOverview() {
  const snapshot = await getOperationsSnapshot()
  const since = new Date(Date.now() - 30 * 60_000)
  const transitions = await (await getDb()).collection('queue_events').aggregate([
    { $match: { action: 'move_to_station', created_at: { $gte: since }, from_station: { $ne: '' }, to_station: { $ne: '' } } },
    { $group: { _id: { from: '$from_station', to: '$to_station' }, patient_count: { $sum: 1 } } },
    { $sort: { patient_count: -1 } },
  ]).toArray()
  const floors = ['ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'อาคารผู้ป่วยใน']
  return {
    generated_at: new Date().toISOString(),
    floors: floors.map((floor) => ({ floor, stations: snapshot.stations.filter((s) => s.floor === floor) })),
    movements: transitions.map((row) => ({
      from_station: String(row._id.from),
      to_station: String(row._id.to),
      patient_count: Number(row.patient_count),
    })),
  }
}

// -------------------------------------------------------------
// Patient Mobile Features: Previsit, Triage, Help Requests
// -------------------------------------------------------------

export async function getPrevisit(userId: string) {
  const patientId = await patientIdForUser(userId)
  return (await getDb()).collection('previsits').findOne({ patient_id: patientId })
}

export async function savePrevisit(userId: string, data: PrevisitSubmission) {
  const db = await getDb()
  const patientId = await patientIdForUser(userId)
  const doc = {
    patient_id: patientId,
    chief_complaint: String(data.chief_complaint || '').trim(),
    food_intake: String(data.food_intake || '').trim(),
    symptoms: Array.isArray(data.symptoms) ? data.symptoms : [],
    allergies: Array.isArray(data.allergies) ? data.allergies : [],
    current_medications: Array.isArray(data.current_medications) ? data.current_medications : [],
    herbal_medications: Array.isArray(data.herbal_medications) ? data.herbal_medications : [],
    payer: String(data.payer || '').trim(),
    contact_phone: String(data.contact_phone || '').trim(),
    referral_status: String(data.referral_status || '').trim(),
    home_vitals: data.home_vitals || {},
    updated_at: new Date(),
  }
  const result = await db.collection('previsits').findOneAndUpdate(
    { patient_id: patientId },
    { $set: doc, $setOnInsert: { _id: new ObjectId(), created_at: new Date() } },
    { upsert: true, returnDocument: 'after' }
  )
  broadcast(`patient:${patientId.toHexString()}`, 'previsit_updated', result)
  return result
}

export async function getCurrentTriageSession(userId: string) {
  const patientId = await patientIdForUser(userId)
  return (await getDb()).collection('triage_sessions').findOne({ patient_id: patientId, status: 'active' }, { sort: { created_at: -1 } })
}

export async function createTriageSession(userId: string) {
  const db = await getDb()
  const patientId = await patientIdForUser(userId)
  const session = {
    _id: new ObjectId(),
    patient_id: patientId,
    status: 'active',
    messages: [
      {
        id: new ObjectId().toHexString(),
        role: 'system',
        content: 'สวัสดีครับ ผมเป็นระบบคัดกรองอาการอัตโนมัติ CareLink กรุณาเล่าอาการที่ท่านต้องการปรึกษาทีมแพทย์ในวันนี้ครับ',
        created_at: new Date().toISOString(),
      },
    ],
    created_at: new Date(),
    updated_at: new Date(),
  }
  await db.collection('triage_sessions').insertOne(session)
  return session
}

export async function addTriageMessage(userId: string, sessionId: string, message: string) {
  const db = await getDb()
  const patientId = await patientIdForUser(userId)
  const now = new Date()
  const patientMsg = {
    id: new ObjectId().toHexString(),
    role: 'patient',
    content: message.trim(),
    created_at: now.toISOString(),
  }

  // Deterministic demonstration rules; this is not diagnosis or clinical advice.
  let botReply = 'รับทราบข้อมูลครับ มีอาการอื่นร่วมด้วย เช่น ไข้ หรืออาการปวดหรือไม่ครับ?'
  if (message.includes('ไข้') || message.includes('ร้อน')) {
    botReply = 'วัดอุณหภูมิได้เท่าไรครับ? และเริ่มมีไข้มาตั้งแต่เมื่อไรครับ'
  } else if (message.includes('ปวด') || message.includes('เจ็บ')) {
    botReply = 'ระดับความปวดประมาณเท่าไรจาก 0 ถึง 10 ครับ? และปวดตลอดเวลาหรือเป็นพักๆ ครับ'
  } else if (message.includes('ยา') || message.includes('แพ้')) {
    botReply = 'มียาเดิมที่รับประทานประจำ หรือมีประวัติแพ้ยาตัวใดไหมครับ'
  }

  const assistantMsg = {
    id: new ObjectId().toHexString(),
    role: 'assistant',
    content: botReply,
    created_at: new Date(now.getTime() + 500).toISOString(),
  }

  const doc = await db.collection('triage_sessions').findOneAndUpdate(
    { _id: objectId(sessionId), patient_id: patientId },
    { $push: { messages: { $each: [patientMsg, assistantMsg] } }, $set: { updated_at: now } },
    { returnDocument: 'after' }
  )
  return doc
}

export async function submitTriageSession(userId: string, sessionId: string) {
  const db = await getDb()
  const patientId = await patientIdForUser(userId)
  const session = await db.collection('triage_sessions').findOne({ _id: objectId(sessionId), patient_id: patientId })
  if (!session) throw new DomainError('ไม่พบ session คัดกรอง', 'NOT_FOUND', 404)

  const summary = (session.messages || [])
    .filter((m: { role: string }) => m.role === 'patient')
    .map((m: { content: string }) => m.content)
    .join(' | ')

  const doc = await db.collection('triage_sessions').findOneAndUpdate(
    { _id: objectId(sessionId) },
    { $set: { status: 'submitted', summary: `สรุปอาการจากบทสนทนา: ${summary}`, submitted_at: new Date() } },
    { returnDocument: 'after' }
  )
  return doc
}

export async function createHelpRequest(userId: string, submission: HelpRequestSubmission) {
  const db = await getDb()
  const patientId = await patientIdForUser(userId)
  const req = {
    _id: new ObjectId(),
    patient_id: patientId,
    category: submission.category,
    message: submission.message.trim(),
    status: 'pending',
    created_at: new Date(),
  }
  await db.collection('help_requests').insertOne(req)
  broadcast('staff', 'help_requested', req)
  return req
}

export async function listHelpRequests() {
  const db = await getDb()
  return db.collection('help_requests').aggregate([
    { $match: { status: 'pending' } },
    { $sort: { created_at: -1 } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
  ]).toArray()
}

export async function resolveHelpRequest(id: string, staffNotes = '') {
  const db = await getDb()
  return db.collection('help_requests').findOneAndUpdate(
    { _id: objectId(id) },
    { $set: { status: 'resolved', staff_notes: staffNotes, resolved_at: new Date() } },
    { returnDocument: 'after' }
  )
}

// -------------------------------------------------------------
// Patient Journey & Notifications
// -------------------------------------------------------------

export { stationAllowed }

export async function patientJourney(userId: string) {
  const db = await getDb()
  const patientId = await patientIdForUser(userId)
  const patient = await db.collection('patients').findOne({ _id: patientId })
  const encounter = await db.collection('encounters').findOne({ patient_id: patientId, status: 'active' }, { sort: { created_at: -1 } })
  if (!encounter) return null

  const route = encounter.route || []
  const currentIndex = route.findIndex((step: Document) => step.status === 'in_progress')
  const nextStep = route.find((step: Document) => step.status === 'pending')
  const stationCodes = [encounter.current_station, nextStep?.station_code].filter(Boolean)
  const stations = await db.collection('stations').find({ code: { $in: stationCodes } }).toArray()
  const byCode = new Map(stations.map((station) => [station.code, station]))

  const myItem = await db.collection('queue_items').findOne({ encounter_id: encounter._id, station_code: encounter.current_station }, { sort: { created_at: -1 } })
  let queueAhead = 0
  if (myItem && ['waiting', 'called'].includes(myItem.status)) {
    queueAhead = await db.collection('queue_items').countDocuments({
      station_code: encounter.current_station,
      status: { $in: ['waiting', 'called'] },
      rank: { $lt: myItem.rank },
    })
  }

  const serving = await db.collection('queue_items').findOne({ station_code: encounter.current_station, status: { $in: ['called', 'in_progress'] } }, { sort: { called_at: -1 } })
  const station = byCode.get(encounter.current_station)
  const snapshot = await getOperationsSnapshot()
  const flow = snapshot.stations.find((row) => row.code === encounter.current_station)
  const activeAtStation = await db.collection('queue_items').find({ station_code: encounter.current_station, status: { $in: ['called', 'in_progress'] } }).toArray()
  const activeItems = activeAtStation.map((row) => ({
    status: String(row.status),
    ...(row.started_at instanceof Date ? { started_at: row.started_at } : {}),
  }))
  const wait = simulateNewArrivalWait({ now: new Date(), capacity: flow?.capacity || 1, serviceMin: flow?.estimate.p50_min || 10, active: activeItems, waitingCount: queueAhead })
  const waitP80 = simulateNewArrivalWait({ now: new Date(), capacity: flow?.capacity || 1, serviceMin: flow?.estimate.p80_min || 13, active: activeItems, waitingCount: queueAhead })

  return {
    encounter,
    patient: { hn: patient?.hn, display_name: patient?.display_name },
    current_station: encounter.current_station,
    station_name: station?.name || encounter.current_station,
    station_floor: station?.floor || '',
    next_station: nextStep?.station_code || '',
    next_station_name: nextStep ? byCode.get(nextStep.station_code)?.name || nextStep.station_code : '',
    next_station_floor: nextStep ? byCode.get(nextStep.station_code)?.floor || '' : '',
    estimated_wait: wait,
    queue_ahead: queueAhead,
    step_current: currentIndex >= 0 ? currentIndex + 1 : 0,
    step_total: route.length,
    route,
    queue_no: encounter.current_queue_no,
    est_wait_min: wait,
    est_wait_band: Math.max(0, waitP80 - wait),
    wait_source: flow?.estimate.source || 'configured_fallback',
    flow_status: flow?.state,
    queue_status: myItem?.status || '',
    now_serving_queue_no: serving?.queue_no || '',
    updated_at: new Date(),
  }
}

export async function patientNotifications(userId: string) {
  const patientId = await patientIdForUser(userId)
  return (await getDb()).collection('notifications').find({ patient_id: patientId }).sort({ created_at: -1 }).limit(100).toArray()
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const patientId = await patientIdForUser(userId)
  const result = await (await getDb()).collection('notifications').updateOne({ _id: objectId(notificationId), patient_id: patientId }, { $set: { is_read: true } })
  if (!result.matchedCount) throw new DomainError('ไม่พบการแจ้งเตือน', 'NOT_FOUND', 404)
}

export async function markAllNotificationsRead(userId: string) {
  const patientId = await patientIdForUser(userId)
  await (await getDb()).collection('notifications').updateMany({ patient_id: patientId, is_read: false }, { $set: { is_read: true } })
}

export function validateDoctorRoute(codes: string[]) {
  if (!codes.length) throw new DomainError('กรุณาเลือกปลายทางของ visit')
  const seen = new Set<string>()
  codes.forEach((code, index) => {
    if (seen.has(code)) throw new DomainError('ห้ามเลือก Station ซ้ำ')
    seen.add(code)
    const last = index === codes.length - 1
    if (code === 'DH') {
      if (!last) throw new DomainError('DH ต้องเป็น Station สุดท้าย')
    } else if (code === 'HA') {
      if (index !== codes.length - 2 || codes[index + 1] !== 'IPW') throw new DomainError('HA ต้องตามด้วย IPW เพื่อจบ visit')
    } else if (code === 'IPW') {
      if (!last || index === 0 || codes[index - 1] !== 'HA') throw new DomainError('IPW ต้องอยู่หลัง HA และเป็น Station สุดท้าย')
    } else if (!OPTIONAL_ROUTE_CODES.has(code)) {
      throw new DomainError(`Station ${code} ในเส้นทางไม่ถูกต้อง`)
    }
  })
  if (!['DH', 'IPW'].includes(codes.at(-1) || '')) throw new DomainError('Route ต้องจบที่ DH หรือ HA → IPW')
}

export async function setDoctorRoute(encounterId: string, codes: string[]) {
  const db = await getDb()
  const id = objectId(encounterId)
  const encounter = await db.collection('encounters').findOne({ _id: id, status: 'active' })
  if (!encounter) throw new DomainError('ไม่พบ visit ที่กำลังดำเนินการ', 'NOT_FOUND', 404)
  if (!PC_CODES.has(encounter.current_station)) throw new DomainError('กำหนด Route ได้เฉพาะตอนผู้ป่วยอยู่ห้องตรวจแพทย์', 'INVALID_STATE', 409)

  const hasInfusionOrder = await db.collection('orders').countDocuments({
    encounter_id: id,
    items: { $elemMatch: { type: 'infusion', status: { $nin: ['cancelled', 'completed'] } } },
    status: { $ne: 'cancelled' },
  }) > 0
  const normalizedCodes = [...codes]
  if (hasInfusionOrder && !normalizedCodes.includes('INFUSION')) {
    const pharmacyIndex = normalizedCodes.indexOf('PD')
    const insertionIndex = pharmacyIndex >= 0
      ? pharmacyIndex
      : normalizedCodes.at(-1) === 'IPW'
        ? Math.max(0, normalizedCodes.length - 2)
        : Math.max(0, normalizedCodes.length - 1)
    normalizedCodes.splice(insertionIndex, 0, 'INFUSION')
  }
  validateDoctorRoute(normalizedCodes)

  const prefix: Document[] = []
  for (const step of encounter.route || []) {
    prefix.push(step)
    if (step.station_code === encounter.current_station) break
  }
  const lastBaselineEnd = prefix.at(-1)?.baseline_end_at ? new Date(prefix.at(-1)?.baseline_end_at).getTime() : 0
  const routeStart = new Date(Math.max(Date.now(), Number.isFinite(lastBaselineEnd) ? lastBaselineEnd : 0))
  const route = [...prefix, ...routeSteps(normalizedCodes, routeStart)]
  await db.collection('encounters').updateOne({ _id: id, current_station: encounter.current_station }, { $set: { route, updated_at: new Date() } })
  broadcast('encounters', 'route_updated', { encounter_id: id.toHexString(), route })
  return { ...encounter, route }
}

export async function resetPrototypeData() {
  const db = await getDb()
  await Promise.all([
    'appointment_requests',
    'encounters',
    'queue_items',
    'queue_events',
    'notifications',
    'orders',
    'vitals',
    'clinical_assessments',
    'clinical_notes',
    'infusion_sessions',
    'infusion_events',
    'triage_sessions',
    'previsits',
    'help_requests',
    'recommendations',
    'daily_counters',
  ].map((name) => db.collection(name).deleteMany({})))
}
