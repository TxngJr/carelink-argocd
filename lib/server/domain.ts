import 'server-only'
import bcrypt from 'bcryptjs'
import { ObjectId, type Document } from 'mongodb'
import { BASE_ROUTE, OPTIONAL_ROUTE_CODES, PC_CODES, stationMap } from '@/lib/stations'
import { getDb } from '@/lib/server/db'
import type { AppointmentMeasurements, Role } from '@/lib/types'

const ACTIVE_APPOINTMENTS = ['submitted', 'nurse_proposed', 'confirmed', 'arrival_reported', 'checked_in', 'in_service']
const ACTIVE_QUEUE = ['waiting', 'called', 'in_progress']

export class DomainError extends Error {
  constructor(message: string, public code = 'VALIDATION_ERROR', public status = 400) { super(message) }
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
export function publicDocument<T = unknown>(value: unknown): T { return serialize(value) as T }

function bangkokDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function validateMeasurements(m: AppointmentMeasurements) {
  if ((m.sbp === undefined) !== (m.dbp === undefined)) throw new DomainError('กรุณากรอกความดันตัวบนและตัวล่างให้ครบทั้งคู่')
  if (m.height_cm !== undefined && (m.height_cm < 50 || m.height_cm > 250)) throw new DomainError('ส่วนสูงต้องอยู่ระหว่าง 50–250 ซม.')
  if (m.weight_kg !== undefined && (m.weight_kg < 2 || m.weight_kg > 500)) throw new DomainError('น้ำหนักต้องอยู่ระหว่าง 2–500 กก.')
  if (m.sbp !== undefined && m.dbp !== undefined && (m.sbp < 40 || m.sbp > 300 || m.dbp < 20 || m.dbp > 200)) throw new DomainError('ค่าความดันอยู่นอกช่วงที่ระบบรับได้')
  if (m.spo2 !== undefined && (m.spo2 < 50 || m.spo2 > 100)) throw new DomainError('SpO₂ ต้องอยู่ระหว่าง 50–100')
}

async function counter(collection: string, key: string) {
  const row = await (await getDb()).collection(collection).findOneAndUpdate({ _id: key }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' })
  return Number(row?.value || 1)
}

async function generateQueueNo(stationCode: string) {
  const day = bangkokDateKey().replaceAll('-', '')
  return `${stationCode}-${String(await counter('daily_counters', `${day}:${stationCode}`)).padStart(3, '0')}`
}

async function notify(patientId: ObjectId, title: string, message: string, type: string, encounterId?: ObjectId) {
  await (await getDb()).collection('notifications').insertOne({
    patient_id: patientId, ...(encounterId ? { encounter_id: encounterId } : {}), channel: 'in_app', title, message, type, is_read: false, created_at: new Date(),
  })
}

async function auditQueue(item: Document, action: string, staffId?: string, fromStation = '', toStation = '') {
  await (await getDb()).collection('queue_events').insertOne({
    encounter_id: item.encounter_id, patient_id: item.patient_id, station_code: item.station_code,
    queue_no: item.queue_no, from_station: fromStation, to_station: toStation, action,
    ...(staffId && ObjectId.isValid(staffId) ? { performed_by: new ObjectId(staffId) } : {}), note: '', metadata: {}, created_at: new Date(),
  })
}

export async function authenticate(username: string, password: string, requiredRole?: Role) {
  const user = await (await getDb()).collection('users').findOne({ username: username.trim(), is_active: { $ne: false } })
  if (!user || typeof user.password_hash !== 'string' || !(await bcrypt.compare(password, user.password_hash))) throw new DomainError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'UNAUTHORIZED', 401)
  if (requiredRole && user.role !== requiredRole) throw new DomainError(requiredRole === 'patient' ? 'บัญชีนี้ไม่ใช่บัญชีผู้ป่วย' : 'บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้', 'FORBIDDEN', 403)
  return user
}

export async function registerPatient(displayName: string, phone: string, birthDate: string, password: string) {
  const db = await getDb(); const name = displayName.trim(); const cleanPhone = phone.trim()
  if (!name || !cleanPhone) throw new DomainError('กรุณากรอกข้อมูลให้ครบ')
  if (password.length < 6) throw new DomainError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
  const birth = new Date(`${birthDate}T00:00:00+07:00`)
  if (Number.isNaN(birth.getTime()) || birth > new Date()) throw new DomainError('วันเกิดไม่ถูกต้อง')
  if (await db.collection('users').findOne({ username: cleanPhone })) throw new DomainError('เบอร์โทรนี้ถูกใช้งานแล้ว', 'REGISTRATION_ERROR', 409)
  const now = new Date(); const patientId = new ObjectId(); const userId = new ObjectId()
  const hn = `HN${String(await counter('system_counters', 'patient_hn')).padStart(6, '0')}`
  const passwordHash = await bcrypt.hash(password, 10)
  const age = Math.max(0, now.getFullYear() - birth.getFullYear())
  await db.collection('patients').insertOne({ _id: patientId, hn, national_id_masked: '', first_name: '', last_name: '', display_name: name, gender: '', age, birth_date: birth, phone: cleanPhone, province: '', is_out_province: false, insurance_type: '', eligibility_status: '', allergies: [], chronic_conditions: [], created_at: now, updated_at: now })
  try {
    await db.collection('users').insertOne({ _id: userId, username: cleanPhone, password_hash: passwordHash, role: 'patient', display_name: name, department: '', station_codes: [], patient_id: patientId, is_active: true, created_at: now, updated_at: now })
  } catch (error) { await db.collection('patients').deleteOne({ _id: patientId }); throw error }
  return db.collection('users').findOne({ _id: userId })
}

export async function getUser(userId: string) { return (await getDb()).collection('users').findOne({ _id: objectId(userId), is_active: { $ne: false } }) }
async function patientIdForUser(userId: string) {
  const user = await (await getDb()).collection('users').findOne({ _id: objectId(userId), role: 'patient' })
  if (!user?.patient_id) throw new DomainError('ไม่พบข้อมูลผู้ป่วย', 'NOT_FOUND', 404)
  return user.patient_id as ObjectId
}

export async function createAppointment(userId: string, chiefComplaint: string, measurements: AppointmentMeasurements) {
  const db = await getDb(); const patientId = await patientIdForUser(userId); const complaint = chiefComplaint.trim()
  if (!complaint) throw new DomainError('กรุณาระบุอาการสำคัญ'); validateMeasurements(measurements)
  if (await db.collection('appointment_requests').countDocuments({ patient_id: patientId, status: { $in: ACTIVE_APPOINTMENTS } })) throw new DomainError('ไม่สามารถสร้างคำขอใหม่ขณะมีคำขอที่กำลังดำเนินการ', 'INVALID_STATE', 409)
  const now = new Date(); const row = { _id: new ObjectId(), patient_id: patientId, chief_complaint: complaint, measurements, status: 'submitted', created_at: now, updated_at: now }
  await db.collection('appointment_requests').insertOne(row); return row
}

export async function currentAppointment(userId: string) {
  const patientId = await patientIdForUser(userId)
  return (await getDb()).collection('appointment_requests').find({ patient_id: patientId }).sort({ created_at: -1 }).limit(1).next()
}

export async function updateAppointment(userId: string, appointmentId: string, chiefComplaint: string, measurements: AppointmentMeasurements) {
  const patientId = await patientIdForUser(userId); const complaint = chiefComplaint.trim(); if (!complaint) throw new DomainError('กรุณาระบุอาการสำคัญ'); validateMeasurements(measurements)
  const row = await (await getDb()).collection('appointment_requests').findOneAndUpdate({ _id: objectId(appointmentId), patient_id: patientId, status: 'submitted' }, { $set: { chief_complaint: complaint, measurements, updated_at: new Date() } }, { returnDocument: 'after' })
  if (!row) throw new DomainError('ไม่สามารถแก้ไขคำขอในสถานะปัจจุบันได้', 'INVALID_STATE', 409); return row
}

export async function cancelPatientAppointment(userId: string, appointmentId: string, reason: string) {
  const patientId = await patientIdForUser(userId)
  const result = await (await getDb()).collection('appointment_requests').updateOne({ _id: objectId(appointmentId), patient_id: patientId, status: { $in: ['submitted', 'nurse_proposed', 'confirmed'] } }, { $set: { status: 'cancelled', cancel_reason: reason.trim(), updated_at: new Date() } })
  if (!result.modifiedCount) throw new DomainError('ไม่สามารถยกเลิกคำขอในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
}

export async function reportArrival(userId: string, appointmentId: string) {
  const db = await getDb(); const patientId = await patientIdForUser(userId); const id = objectId(appointmentId)
  const current = await db.collection('appointment_requests').findOne({ _id: id, patient_id: patientId }); if (!current) throw new DomainError('ไม่พบคำขอนัด', 'NOT_FOUND', 404)
  if (['arrival_reported', 'checked_in', 'in_service', 'completed'].includes(current.status)) return current
  if (current.status !== 'confirmed' || !current.appointment_at || bangkokDateKey(new Date(current.appointment_at)) !== bangkokDateKey()) throw new DomainError('สามารถแจ้งมาถึงได้เฉพาะวันนัดที่แพทย์ยืนยันแล้ว', 'INVALID_STATE', 409)
  const now = new Date(); const row = await db.collection('appointment_requests').findOneAndUpdate({ _id: id, status: 'confirmed' }, { $set: { status: 'arrival_reported', arrival_reported_at: now, updated_at: now } }, { returnDocument: 'after' })
  if (!row) throw new DomainError('สถานะคำขอเปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'INVALID_STATE', 409); return row
}

export async function listAppointments(status?: string) {
  const db = await getDb(); const match = status ? { status } : {}
  return db.collection('appointment_requests').aggregate([
    { $match: match }, { $sort: { created_at: 1 } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } }, { $unset: 'patient_rows' },
  ]).toArray()
}
export async function appointmentDetail(id: string) { const rows = await listAppointments(); const oid = objectId(id); return rows.find((row) => row._id.equals(oid)) || null }

function parseFutureAppointment(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new DomainError('วันและเวลาไม่ถูกต้อง'); if (date.getTime() < Date.now()) throw new DomainError('วันนัดต้องไม่เป็นอดีต'); return date }

export async function proposeAppointment(id: string, appointmentAt: string, note: string) {
  const db = await getDb(); const at = parseFutureAppointment(appointmentAt); const now = new Date()
  const row = await db.collection('appointment_requests').findOneAndUpdate({ _id: objectId(id), status: 'submitted' }, { $set: { status: 'nurse_proposed', appointment_at: at, nurse_note: note.trim(), proposed_at: now, updated_at: now } }, { returnDocument: 'after' })
  if (!row) throw new DomainError('ไม่สามารถทำรายการในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
  await notify(row.patient_id, 'พยาบาลเสนอวันนัด', 'กรุณารอแพทย์ยืนยันวันนัด', 'appointment_proposed'); return row
}

export async function confirmAppointment(id: string, appointmentAt: string, pc: string, note: string) {
  if (!PC_CODES.has(pc)) throw new DomainError('กรุณาเลือกห้องตรวจ PC–PC4')
  const db = await getDb(); const at = parseFutureAppointment(appointmentAt); const now = new Date()
  const row = await db.collection('appointment_requests').findOneAndUpdate({ _id: objectId(id), status: 'nurse_proposed' }, { $set: { status: 'confirmed', appointment_at: at, assigned_pc: pc, doctor_note: note.trim(), confirmed_at: now, updated_at: now } }, { returnDocument: 'after' })
  if (!row) throw new DomainError('ไม่สามารถทำรายการในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
  await notify(row.patient_id, 'ยืนยันวันนัดแล้ว', 'แพทย์ยืนยันวันและเวลานัดของคุณแล้ว', 'appointment_confirmed'); return row
}

export async function cancelByStaff(id: string, reason: string) {
  const result = await (await getDb()).collection('appointment_requests').updateOne({ _id: objectId(id), status: { $in: ['submitted', 'nurse_proposed', 'confirmed'] } }, { $set: { status: 'cancelled', cancel_reason: reason.trim(), updated_at: new Date() } })
  if (!result.modifiedCount) throw new DomainError('ไม่สามารถยกเลิกคำขอในสถานะปัจจุบันได้', 'INVALID_STATE', 409)
}

function routeSteps(codes: string[]) { return codes.map((station_code) => ({ id: new ObjectId(), station_code, status: 'pending', estimated_wait_min: 0 })) }
async function enqueue(encounterId: ObjectId, patientId: ObjectId, stationCode: string, priority: string, queueNo?: string) {
  const db = await getDb(); const now = new Date(); const active = await db.collection('queue_items').countDocuments({ station_code: stationCode, status: { $in: ACTIVE_QUEUE } }); const station = await db.collection('stations').findOne({ code: stationCode })
  const row = { _id: new ObjectId(), queue_no: queueNo || await generateQueueNo(stationCode), encounter_id: encounterId, patient_id: patientId, station_code: stationCode, status: 'waiting', priority, estimated_wait_min: active * Number(station?.average_service_min || 10), rank: now, call_count: 0, skip_count: 0, created_at: now, updated_at: now }
  await db.collection('queue_items').insertOne(row); return row
}

export async function confirmCheckIn(id: string) {
  const db = await getDb(); const requestId = objectId(id); const req = await db.collection('appointment_requests').findOne({ _id: requestId }); if (!req) throw new DomainError('ไม่พบคำขอนัด', 'NOT_FOUND', 404)
  if (req.encounter_id) return req
  if (req.status !== 'arrival_reported' || !PC_CODES.has(req.assigned_pc)) throw new DomainError('ไม่สามารถเช็กอินคำขอนี้ได้', 'INVALID_STATE', 409)
  const now = new Date(); const encounterId = new ObjectId(); const codes = [...BASE_ROUTE, req.assigned_pc]; const steps = routeSteps(codes); steps[0] = { ...steps[0], status: 'in_progress', started_at: now } as typeof steps[number]
  const queueNo = await generateQueueNo('NPR')
  const encounter = { _id: encounterId, encounter_no: `VIS-${bangkokDateKey().replaceAll('-', '')}-${String(await counter('system_counters', `visit:${bangkokDateKey()}`)).padStart(4, '0')}`, patient_id: req.patient_id, appointment_request_id: req._id, visit_date: now, appointment_time: req.appointment_at, status: 'active', priority: 'normal', flags: [], current_station: 'NPR', current_queue_no: queueNo, route: steps, total_wait_min: 0, total_visit_min: 0, checked_in_at: now, created_at: now, updated_at: now }
  await db.collection('encounters').insertOne(encounter)
  try { await enqueue(encounterId, req.patient_id, 'NPR', 'normal', queueNo) } catch (error) { await db.collection('encounters').deleteOne({ _id: encounterId }); throw error }
  const result = await db.collection('appointment_requests').findOneAndUpdate({ _id: requestId, status: 'arrival_reported', encounter_id: { $exists: false } }, { $set: { status: 'checked_in', encounter_id: encounterId, checked_in_at: now, updated_at: now } }, { returnDocument: 'after' })
  if (!result) { await db.collection('queue_items').deleteMany({ encounter_id: encounterId }); await db.collection('encounters').deleteOne({ _id: encounterId }); throw new DomainError('คำขอนี้ถูกเช็กอินแล้ว', 'INVALID_STATE', 409) }
  await notify(req.patient_id, 'เช็กอินสำเร็จ', `คุณได้รับคิว ${queueNo} ที่จุดลงทะเบียน`, 'checked_in', encounterId); return result
}

export async function getStationQueue(stationCode: string) {
  const db = await getDb(); const items = await db.collection('queue_items').aggregate([
    { $match: { station_code: stationCode, status: { $in: ['waiting', 'called', 'in_progress', 'no_show'] } } }, { $sort: { rank: 1, created_at: 1 } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } }, { $lookup: { from: 'encounters', localField: 'encounter_id', foreignField: '_id', as: 'encounter_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] }, encounter: { $arrayElemAt: ['$encounter_rows', 0] } } }, { $unset: ['patient_rows', 'encounter_rows'] },
  ]).toArray()
  const counts = { waiting: 0, called: 0, in_progress: 0 }; const nowServing: Document[] = []
  for (const item of items) { if (item.status === 'waiting') counts.waiting++; if (item.status === 'called') { counts.called++; nowServing.push(item) } if (item.status === 'in_progress') { counts.in_progress++; nowServing.push(item) } }
  return { items, now_serving: nowServing, counts }
}

export async function callNext(stationCode: string, staffId: string) {
  const now = new Date(); const row = await (await getDb()).collection('queue_items').findOneAndUpdate({ station_code: stationCode, status: 'waiting' }, { $set: { status: 'called', assigned_staff_id: objectId(staffId), called_at: now, updated_at: now }, $inc: { call_count: 1 } }, { sort: { rank: 1, created_at: 1 }, returnDocument: 'after' })
  if (!row) throw new DomainError('ไม่มีคิวรอ', 'EMPTY_QUEUE', 404)
  await auditQueue(row, 'call', staffId); await notify(row.patient_id, 'ถึงคิวของคุณแล้ว', `เชิญที่ ${stationMap.get(stationCode)?.name || stationCode}`, 'queue_called', row.encounter_id); return row
}

export async function startQueue(stationCode: string, itemId: string, staffId: string) {
  const now = new Date(); const db = await getDb(); const row = await db.collection('queue_items').findOneAndUpdate({ _id: objectId(itemId), station_code: stationCode, status: { $in: ['waiting', 'called'] } }, { $set: { status: 'in_progress', assigned_staff_id: objectId(staffId), started_at: now, updated_at: now } }, { returnDocument: 'after' })
  if (!row) throw new DomainError('ไม่สามารถเริ่มคิวนี้ได้', 'INVALID_STATE', 409)
  await auditQueue(row, 'start', staffId); const encounter = await db.collection('encounters').findOne({ _id: row.encounter_id }); if (encounter?.appointment_request_id) await db.collection('appointment_requests').updateOne({ _id: encounter.appointment_request_id, status: 'checked_in' }, { $set: { status: 'in_service', updated_at: now } }); return row
}

export async function recallQueue(stationCode: string, itemId: string, staffId?: string) {
  const row = await (await getDb()).collection('queue_items').findOneAndUpdate({ _id: objectId(itemId), station_code: stationCode, status: { $in: ['called', 'in_progress'] } }, { $set: { updated_at: new Date() }, $inc: { call_count: 1 } }, { returnDocument: 'after' })
  if (!row) throw new DomainError('ไม่พบคิวที่เรียกอยู่', 'NOT_FOUND', 404); await auditQueue(row, 'recall', staffId); await notify(row.patient_id, 'เรียกคิวอีกครั้ง', `กรุณาไปที่ ${stationMap.get(stationCode)?.name || stationCode}`, 'queue_called', row.encounter_id); return row
}
export async function skipQueue(stationCode: string, itemId: string, staffId?: string) {
  const row = await (await getDb()).collection('queue_items').findOneAndUpdate({ _id: objectId(itemId), station_code: stationCode, status: { $in: ['waiting', 'called'] } }, { $set: { status: 'no_show', updated_at: new Date() }, $inc: { skip_count: 1 } }, { returnDocument: 'after' })
  if (!row) throw new DomainError('ไม่พบคิว', 'NOT_FOUND', 404); await auditQueue(row, 'no_show', staffId); return row
}
export async function requeue(stationCode: string, itemId: string, staffId?: string) {
  const now = new Date(); const row = await (await getDb()).collection('queue_items').findOneAndUpdate({ _id: objectId(itemId), station_code: stationCode, status: 'no_show' }, { $set: { status: 'waiting', rank: now, updated_at: now }, $unset: { called_at: '', assigned_staff_id: '' } }, { returnDocument: 'after' })
  if (!row) throw new DomainError('ไม่พบคิว', 'NOT_FOUND', 404); await auditQueue(row, 'requeue', staffId); return row
}

export async function completeQueue(stationCode: string, itemId: string, staffId?: string) {
  const db = await getDb(); const item = await db.collection('queue_items').findOne({ _id: objectId(itemId), station_code: stationCode }); if (!item) throw new DomainError('ไม่พบคิว', 'NOT_FOUND', 404)
  if (item.status === 'completed') return { queue_item: item, next_queue_item: null }
  if (!['called', 'in_progress'].includes(item.status)) throw new DomainError('คิวนี้ยังไม่พร้อมเสร็จสิ้น', 'INVALID_STATE', 409)
  const encounter = await db.collection('encounters').findOne({ _id: item.encounter_id, status: 'active' }); if (!encounter) throw new DomainError('ไม่พบ visit ที่กำลังดำเนินการ', 'NOT_FOUND', 404)
  const route = Array.isArray(encounter.route) ? [...encounter.route] : []; const index = route.findIndex((step) => step.station_code === stationCode && step.status === 'in_progress')
  if (index < 0) throw new DomainError('Route ของ Station นี้ไม่ได้อยู่ในสถานะกำลังดำเนินการ', 'INVALID_STATE', 409)
  if (PC_CODES.has(stationCode) && index === route.length - 1) throw new DomainError('กรุณากำหนดเส้นทางหลังห้องตรวจก่อนกดเสร็จ', 'INVALID_STATE', 409)
  const now = new Date(); route[index] = { ...route[index], status: 'completed', completed_at: now }
  const changed = await db.collection('queue_items').updateOne({ _id: item._id, status: item.status }, { $set: { status: 'completed', completed_at: now, updated_at: now } }); if (!changed.modifiedCount) throw new DomainError('สถานะคิวเปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'INVALID_STATE', 409)
  const completed = { ...item, status: 'completed', completed_at: now, updated_at: now }; await auditQueue(completed, 'complete_station', staffId)
  if (index === route.length - 1) {
    await db.collection('encounters').updateOne({ _id: encounter._id }, { $set: { route, status: 'completed', completed_at: now, updated_at: now } }); if (encounter.appointment_request_id) await db.collection('appointment_requests').updateOne({ _id: encounter.appointment_request_id }, { $set: { status: 'completed', updated_at: now } }); await notify(item.patient_id, 'การรับบริการเสร็จสมบูรณ์', 'การรับบริการวันนี้เสร็จสมบูรณ์แล้ว', 'visit_completed', encounter._id); return { queue_item: completed, next_queue_item: null }
  }
  const nextCode = route[index + 1].station_code; const queueNo = await generateQueueNo(nextCode); route[index + 1] = { ...route[index + 1], status: 'in_progress', started_at: now }
  let next: Document; try { next = await enqueue(encounter._id, encounter.patient_id, nextCode, encounter.priority || 'normal', queueNo) } catch (error) { await db.collection('queue_items').updateOne({ _id: item._id }, { $set: { status: item.status }, $unset: { completed_at: '' } }); throw error }
  await db.collection('encounters').updateOne({ _id: encounter._id }, { $set: { route, current_station: nextCode, current_queue_no: queueNo, updated_at: now } }); await auditQueue(next, 'move_to_station', staffId, stationCode, nextCode); await notify(item.patient_id, 'ไปยังจุดถัดไป', `กรุณาไปที่ ${stationMap.get(nextCode)?.name || nextCode}`, 'station_changed', encounter._id)
  const ahead = await db.collection('queue_items').countDocuments({ station_code: nextCode, status: { $in: ['waiting', 'called'] }, rank: { $lt: next.rank } }); if (ahead <= 2) await notify(item.patient_id, 'ใกล้ถึงคิวแล้ว', `ขณะนี้มีผู้ป่วยข้างหน้าคุณไม่เกิน 2 คิวที่ ${stationMap.get(nextCode)?.name || nextCode}`, 'queue_near', encounter._id)
  return { queue_item: completed, next_queue_item: next }
}

function validateDoctorRoute(codes: string[]) {
  if (!codes.length) throw new DomainError('กรุณาเลือกปลายทางของ visit'); const seen = new Set<string>()
  codes.forEach((code, index) => { if (seen.has(code)) throw new DomainError('ห้ามเลือก Station ซ้ำ'); seen.add(code); const last = index === codes.length - 1; if (code === 'DH') { if (!last) throw new DomainError('DH ต้องเป็น Station สุดท้าย') } else if (code === 'HA') { if (index !== codes.length - 2 || codes[index + 1] !== 'IPW') throw new DomainError('HA ต้องตามด้วย IPW เพื่อจบ visit') } else if (code === 'IPW') { if (!last || index === 0 || codes[index - 1] !== 'HA') throw new DomainError('IPW ต้องอยู่หลัง HA และเป็น Station สุดท้าย') } else if (!OPTIONAL_ROUTE_CODES.has(code)) throw new DomainError('Station ในเส้นทางไม่ถูกต้อง') })
  if (!['DH', 'IPW'].includes(codes.at(-1) || '')) throw new DomainError('Route ต้องจบที่ DH หรือ HA → IPW')
}
export async function setDoctorRoute(encounterId: string, codes: string[]) {
  validateDoctorRoute(codes); const db = await getDb(); const id = objectId(encounterId); const encounter = await db.collection('encounters').findOne({ _id: id, status: 'active' }); if (!encounter) throw new DomainError('ไม่พบ visit ที่กำลังดำเนินการ', 'NOT_FOUND', 404); if (!PC_CODES.has(encounter.current_station)) throw new DomainError('กำหนด Route ได้เฉพาะตอนผู้ป่วยอยู่ห้องตรวจแพทย์', 'INVALID_STATE', 409)
  const prefix: Document[] = []; for (const step of encounter.route || []) { prefix.push(step); if (step.station_code === encounter.current_station) break }
  const route = [...prefix, ...routeSteps(codes)]; await db.collection('encounters').updateOne({ _id: id, current_station: encounter.current_station }, { $set: { route, updated_at: new Date() } }); return { ...encounter, route }
}

export function stationAllowed(role: Role, stationCode: string) { const isPc = PC_CODES.has(stationCode); return (role === 'doctor' && isPc) || (role === 'nurse' && !isPc) }

export async function patientJourney(userId: string) {
  const db = await getDb(); const patientId = await patientIdForUser(userId); const patient = await db.collection('patients').findOne({ _id: patientId }); const encounter = await db.collection('encounters').findOne({ patient_id: patientId, status: 'active' }, { sort: { created_at: -1 } }); if (!encounter) return null
  const route = encounter.route || []; const currentIndex = route.findIndex((step: Document) => step.status === 'in_progress'); const nextStep = route.find((step: Document) => step.status === 'pending'); const stationCodes = [encounter.current_station, nextStep?.station_code].filter(Boolean); const stations = await db.collection('stations').find({ code: { $in: stationCodes } }).toArray(); const byCode = new Map(stations.map((station) => [station.code, station]))
  const myItem = await db.collection('queue_items').findOne({ encounter_id: encounter._id, station_code: encounter.current_station }, { sort: { created_at: -1 } }); let queueAhead = 0; if (myItem && ['waiting', 'called'].includes(myItem.status)) queueAhead = await db.collection('queue_items').countDocuments({ station_code: encounter.current_station, status: { $in: ['waiting', 'called'] }, rank: { $lt: myItem.rank } })
  const serving = await db.collection('queue_items').findOne({ station_code: encounter.current_station, status: { $in: ['called', 'in_progress'] } }, { sort: { called_at: -1 } }); const station = byCode.get(encounter.current_station); const average = Number(station?.average_service_min || 10); const wait = queueAhead * average
  return { encounter, patient: { hn: patient?.hn, display_name: patient?.display_name }, current_station: encounter.current_station, station_name: station?.name || encounter.current_station, station_floor: station?.floor || '', next_station: nextStep?.station_code || '', next_station_name: nextStep ? byCode.get(nextStep.station_code)?.name || nextStep.station_code : '', next_station_floor: nextStep ? byCode.get(nextStep.station_code)?.floor || '' : '', estimated_wait: wait, queue_ahead: queueAhead, step_current: currentIndex >= 0 ? currentIndex + 1 : 0, step_total: route.length, route, queue_no: encounter.current_queue_no, est_wait_min: wait, est_wait_band: average, wait_source: 'queue_position', queue_status: myItem?.status || '', now_serving_queue_no: serving?.queue_no || '', updated_at: new Date() }
}

export async function patientNotifications(userId: string) { const patientId = await patientIdForUser(userId); return (await getDb()).collection('notifications').find({ patient_id: patientId }).sort({ created_at: -1 }).limit(100).toArray() }
export async function markNotificationRead(userId: string, notificationId: string) { const patientId = await patientIdForUser(userId); const result = await (await getDb()).collection('notifications').updateOne({ _id: objectId(notificationId), patient_id: patientId }, { $set: { is_read: true } }); if (!result.matchedCount) throw new DomainError('ไม่พบการแจ้งเตือน', 'NOT_FOUND', 404) }
export async function resetPrototypeData() { if (process.env.APP_ENV !== 'development') throw new DomainError('not available', 'FORBIDDEN', 403); const db = await getDb(); await Promise.all(['appointment_requests', 'encounters', 'queue_items', 'queue_events', 'notifications', 'daily_counters'].map((name) => db.collection(name).deleteMany({}))) }
