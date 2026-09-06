import 'server-only'
import { ObjectId, type Document } from 'mongodb'
import { getDb } from '@/lib/server/db'
import { broadcast } from '@/lib/server/events'
import { DomainError, publicDocument, registerPatientByStaff } from '@/lib/server/domain'
import { runDatabaseSeed } from '@/lib/server/seed'

function objectId(value: string) {
  if (!ObjectId.isValid(value)) throw new DomainError('ID ไม่ถูกต้อง')
  return new ObjectId(value)
}

function regex(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}

function calculateAge(birthDate?: Date | string) {
  if (!birthDate) return undefined
  const birth = new Date(birthDate)
  if (!Number.isFinite(birth.getTime())) return undefined
  const now = new Date()
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const month = now.getUTCMonth() - birth.getUTCMonth()
  if (month < 0 || (month === 0 && now.getUTCDate() < birth.getUTCDate())) age--
  return Math.max(0, age)
}

export async function findPatientDuplicates(q: string, birthDate = '') {
  const db = await getDb()
  const term = q.trim()
  if (term.length < 2 && !birthDate) return []
  const filters: Document[] = []
  if (term) {
    const r = regex(term)
    filters.push({ display_name: r }, { phone: r }, { hn: r }, { national_id_masked: r })
  }
  if (birthDate) filters.push({ birth_date: new Date(birthDate) })
  const query = term && birthDate
    ? { $and: [{ $or: filters.slice(0, -1) }, filters.at(-1)!] }
    : term ? { $or: filters } : filters[0]
  return db.collection('patients').find(query || {}).sort({ updated_at: -1 }).limit(12).toArray()
}

export type RichPatientInput = {
  display_name: string
  phone: string
  birth_date: string
  insurance_type: string
  national_id_masked?: string
  gender?: string
  province?: string
  district?: string
  sub_district?: string
  address?: string
  insurance_no?: string
  referral_hospital?: string
  referral_status?: 'not_required' | 'pending' | 'valid' | 'missing'
  emergency_contact?: string
  caregiver_name?: string
}

export async function registerRichPatient(input: RichPatientInput) {
  const duplicate = await findPatientDuplicates(input.phone, input.birth_date)
  if (duplicate.some((row) => {
    const birth = row.birth_date ? new Date(row.birth_date) : null
    return String(row.phone || '') === input.phone && Boolean(birth && Number.isFinite(birth.getTime()) && birth.toISOString().slice(0, 10) === input.birth_date)
  })) {
    throw new DomainError('พบผู้ป่วยที่มีเบอร์โทรศัพท์และวันเกิดตรงกัน กรุณาเลือกประวัติเดิม', 'DUPLICATE_PATIENT', 409)
  }

  const patient = await registerPatientByStaff(input.display_name, input.phone, input.birth_date, input.insurance_type)
  if (!patient?._id) throw new DomainError('สร้างเวชระเบียนไม่สำเร็จ', 'REGISTRATION_ERROR', 500)
  const province = (input.province || 'กรุงเทพมหานคร').trim()
  const isOutProvince = province !== 'กรุงเทพมหานคร'
  const now = new Date()
  const patch = {
    national_id_masked: input.national_id_masked?.trim() || patient.national_id_masked || '',
    gender: input.gender?.trim() || '',
    age: calculateAge(input.birth_date),
    province,
    district: input.district?.trim() || '',
    sub_district: input.sub_district?.trim() || '',
    address: input.address?.trim() || '',
    is_out_province: isOutProvince,
    insurance_type: input.insurance_type.trim(),
    insurance_no: input.insurance_no?.trim() || '',
    referral_hospital: input.referral_hospital?.trim() || '',
    referral_status: input.referral_status || (isOutProvince ? 'pending' : 'not_required'),
    eligibility_status: 'pending',
    emergency_contact: input.emergency_contact?.trim() || '',
    caregiver_name: input.caregiver_name?.trim() || '',
    updated_at: now,
  }
  const updated = await (await getDb()).collection('patients').findOneAndUpdate({ _id: patient._id }, { $set: patch }, { returnDocument: 'after' })
  broadcast('encounters', 'patient_registered', { patient_id: patient._id.toString(), hn: patient.hn })
  return updated
}

export async function updateEligibility(patientId: string, input: Record<string, unknown>, actorId: string) {
  const db = await getDb()
  const status = String(input.status || '')
  if (!['pending', 'verified', 'rejected', 'expired'].includes(status)) throw new DomainError('สถานะสิทธิไม่ถูกต้อง')
  const now = new Date()
  const patient = await db.collection('patients').findOneAndUpdate(
    { _id: objectId(patientId) },
    { $set: {
      eligibility_status: status,
      insurance_type: String(input.insurance_type || '').trim(),
      insurance_no: String(input.insurance_no || '').trim(),
      referral_hospital: String(input.referral_hospital || '').trim(),
      referral_status: String(input.referral_status || 'not_required'),
      eligibility_note: String(input.note || '').trim(),
      eligibility_checked_by: objectId(actorId),
      eligibility_checked_at: now,
      updated_at: now,
    } },
    { returnDocument: 'after' },
  )
  if (!patient) throw new DomainError('ไม่พบผู้ป่วย', 'NOT_FOUND', 404)
  await db.collection('eligibility_events').insertOne({
    patient_id: patient._id,
    status,
    insurance_type: patient.insurance_type,
    referral_status: patient.referral_status,
    note: patient.eligibility_note,
    actor_id: objectId(actorId),
    created_at: now,
  })
  broadcast('encounters', 'eligibility_updated', { patient_id: patient._id.toString(), status })
  return patient
}

export async function getClinicalContext(encounterId: string) {
  const db = await getDb()
  const encounter = await db.collection('encounters').findOne({ _id: objectId(encounterId) })
  if (!encounter) throw new DomainError('ไม่พบ visit', 'NOT_FOUND', 404)
  const patientId = encounter.patient_id
  const [patient, vitals, previsit, assessment, note, orders] = await Promise.all([
    db.collection('patients').findOne({ _id: patientId }),
    db.collection('vitals').find({ encounter_id: encounter._id }).sort({ recorded_at: -1, created_at: -1 }).limit(1).next(),
    db.collection('previsits').find({ patient_id: patientId }).sort({ updated_at: -1, created_at: -1 }).limit(1).next(),
    db.collection('clinical_assessments').find({ encounter_id: encounter._id }).sort({ assessed_at: -1, created_at: -1 }).limit(1).next(),
    db.collection('clinical_notes').findOne({ encounter_id: encounter._id }),
    db.collection('orders').find({ encounter_id: encounter._id }).sort({ created_at: -1 }).toArray(),
  ])
  return { encounter, patient, vitals, previsit, assessment, note, orders }
}

export async function saveExtendedAssessment(encounterId: string, input: Record<string, unknown>, actorId: string) {
  const db = await getDb()
  const encounter = await db.collection('encounters').findOne({ _id: objectId(encounterId) })
  if (!encounter) throw new DomainError('ไม่พบ visit', 'NOT_FOUND', 404)
  const doc = {
    encounter_id: encounter._id,
    patient_id: encounter.patient_id,
    allergies_confirmed: Boolean(input.allergies_confirmed),
    current_medications: String(input.current_medications || '').trim(),
    herbal_medications: String(input.herbal_medications || '').trim(),
    chronic_conditions: String(input.chronic_conditions || '').trim(),
    cancer_history: String(input.cancer_history || '').trim(),
    previous_treatment: String(input.previous_treatment || '').trim(),
    current_regimen: String(input.current_regimen || '').trim(),
    last_treatment_date: String(input.last_treatment_date || '').trim(),
    functional_status: String(input.functional_status || '').trim(),
    food_intake: String(input.food_intake || '').trim(),
    nausea_vomiting: String(input.nausea_vomiting || '').trim(),
    fever_history: String(input.fever_history || '').trim(),
    fatigue: String(input.fatigue || '').trim(),
    smoking: String(input.smoking || '').trim(),
    alcohol: String(input.alcohol || '').trim(),
    referral_information: String(input.referral_information || '').trim(),
    assessed_by: objectId(actorId),
    assessed_at: new Date(),
    updated_at: new Date(),
  }
  await db.collection('extended_assessments').updateOne(
    { encounter_id: encounter._id },
    { $set: doc, $setOnInsert: { _id: new ObjectId(), created_at: new Date() } },
    { upsert: true },
  )
  broadcast('clinical', 'extended_assessment_saved', { encounter_id: encounterId })
  return db.collection('extended_assessments').findOne({ encounter_id: encounter._id })
}

async function orderWithPatient(orderId: ObjectId) {
  const db = await getDb()
  const rows = await db.collection('orders').aggregate([
    { $match: { _id: orderId } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
  ]).toArray()
  return rows[0] || null
}

export async function getImagingQueue(station = 'all') {
  const db = await getDb()
  const conditions: Document = { 'items.type': 'imaging', imaging_status: { $ne: 'completed' } }
  if (station !== 'all') conditions['items'] = { $elemMatch: { type: 'imaging', $or: [{ target_station: station }, { code: station }, ...(station === 'XR' ? [{ target_station: { $exists: false } }] : [])] } }
  return db.collection('orders').aggregate([
    { $match: conditions },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
    { $sort: { created_at: 1 } },
  ]).toArray()
}

export async function startImaging(orderId: string, version: number, stationCode: string, actorId: string) {
  const db = await getDb()
  if (!['XR', 'CT', 'MRI', 'IR'].includes(stationCode)) throw new DomainError('สถานี Imaging ไม่ถูกต้อง')
  const updated = await db.collection('orders').findOneAndUpdate(
    { _id: objectId(orderId), version, 'items.type': 'imaging', imaging_status: { $in: [null, 'ordered', 'waiting'] } },
    { $set: {
      'items.$[img].status': 'in_progress',
      'items.$[img].target_station': stationCode,
      imaging_status: 'in_progress',
      imaging_started_at: new Date(),
      imaging_started_by: objectId(actorId),
      status: 'in_progress',
      updated_at: new Date(),
    }, $inc: { version: 1 } },
    { arrayFilters: [{ 'img.type': 'imaging' }], returnDocument: 'after' },
  )
  if (!updated) throw new DomainError('รายการตรวจถูกแก้ไขแล้วหรือไม่อยู่ในสถานะรอตรวจ', 'VERSION_CONFLICT', 409)
  await db.collection('clinical_order_events').insertOne({ order_id: updated._id, encounter_id: updated.encounter_id, action: 'imaging_started', actor_id: objectId(actorId), station_code: stationCode, version: updated.version, created_at: new Date() })
  broadcast('orders', 'imaging_started', { order_id: orderId, station_code: stationCode })
  return orderWithPatient(updated._id)
}

export async function completeImaging(orderId: string, version: number, input: { station_code: string; findings: string; impression: string }, actorId: string) {
  const db = await getDb()
  if (input.findings.trim().length < 3 || input.impression.trim().length < 3) throw new DomainError('กรุณากรอก Findings และ Impression')
  const result = {
    station_code: input.station_code,
    findings: input.findings.trim(),
    impression: input.impression.trim(),
    completed_by: actorId,
    completed_at: new Date().toISOString(),
  }
  const updated = await db.collection('orders').findOneAndUpdate(
    { _id: objectId(orderId), version, imaging_status: 'in_progress' },
    { $set: {
      'items.$[img].status': 'completed',
      'items.$[img].results': result,
      imaging_status: 'completed',
      imaging_completed_at: new Date(),
      imaging_completed_by: objectId(actorId),
      updated_at: new Date(),
    }, $inc: { version: 1 } },
    { arrayFilters: [{ 'img.type': 'imaging' }], returnDocument: 'after' },
  )
  if (!updated) throw new DomainError('รายการตรวจถูกแก้ไขแล้วหรือยังไม่ได้เริ่มตรวจ', 'VERSION_CONFLICT', 409)
  const allComplete = Array.isArray(updated.items) && updated.items.every((item: Document) => ['completed', 'dispensed', 'cancelled'].includes(String(item.status)))
  if (allComplete) { await db.collection('orders').updateOne({ _id: updated._id, version: updated.version }, { $set: { status: 'completed' } }); updated.status = 'completed' }
  await db.collection('imaging_results').insertOne({ _id: new ObjectId(), order_id: updated._id, encounter_id: updated.encounter_id, patient_id: updated.patient_id, ...result, completed_by: objectId(actorId), completed_at: new Date() })
  await db.collection('clinical_order_events').insertOne({ order_id: updated._id, encounter_id: updated.encounter_id, action: 'imaging_completed', actor_id: objectId(actorId), reason: input.impression.trim(), version: updated.version, created_at: new Date() })
  broadcast('orders', 'imaging_completed', { order_id: orderId, station_code: input.station_code })
  return orderWithPatient(updated._id)
}

type SafetyFlag = { severity: 'info' | 'warning' | 'block'; kind: 'allergy' | 'interaction' | 'dose'; message: string }

function medicationNames(order: Document) {
  return (Array.isArray(order.items) ? order.items : []).filter((item: Document) => item.type === 'medication').map((item: Document) => `${item.name || ''} ${item.code || ''}`.toLowerCase())
}

function buildSafetyFlags(order: Document, patient: Document | null): SafetyFlag[] {
  const meds = medicationNames(order)
  const allergies = (Array.isArray(patient?.allergies) ? patient!.allergies : []).map((value: unknown) => String(value).toLowerCase())
  const flags: SafetyFlag[] = []
  const groups = [
    { allergy: ['penicillin'], medicines: ['penicillin', 'amoxicillin', 'ampicillin'] },
    { allergy: ['aspirin'], medicines: ['aspirin', 'asa'] },
    { allergy: ['sulfa', 'sulfonamide'], medicines: ['sulfamethoxazole', 'co-trimoxazole', 'trimethoprim-sulfamethoxazole'] },
  ]
  for (const group of groups) {
    if (allergies.some((a) => group.allergy.some((key) => a.includes(key))) && meds.some((m) => group.medicines.some((key) => m.includes(key)))) {
      flags.push({ severity: 'block', kind: 'allergy', message: 'พบความสอดคล้องกับประวัติแพ้ยาจากกฎสาธิต ต้องให้เภสัชกรตรวจทาน' })
    }
  }
  if (meds.some((m) => m.includes('warfarin')) && meds.some((m) => m.includes('aspirin'))) {
    flags.push({ severity: 'warning', kind: 'interaction', message: 'กฎสาธิตพบคู่ยาที่ต้องตรวจทานปฏิกิริยาระหว่างยา' })
  }
  const missingDose = (Array.isArray(order.items) ? order.items : []).some((item: Document) => item.type === 'medication' && !String(item.dosage || '').trim())
  if (missingDose) flags.push({ severity: 'warning', kind: 'dose', message: 'มีรายการยาที่ยังไม่ระบุขนาดยา' })
  if (!flags.length) flags.push({ severity: 'info', kind: 'dose', message: 'ไม่พบสัญญาณเตือนจากกฎสาธิต กรุณาตรวจทานตามขั้นตอนของหน่วยงาน' })
  return flags
}

export async function getPharmacySafety(orderId: string) {
  const db = await getDb()
  const order = await db.collection('orders').findOne({ _id: objectId(orderId), 'items.type': 'medication' })
  if (!order) throw new DomainError('ไม่พบใบสั่งยา', 'NOT_FOUND', 404)
  const patient = await db.collection('patients').findOne({ _id: order.patient_id })
  const review = await db.collection('pharmacy_reviews').find({ order_id: order._id }).sort({ created_at: -1 }).limit(1).next()
  const flags = buildSafetyFlags(order, patient)
  return {
    order_id: order._id,
    patient: patient ? { _id: patient._id, hn: patient.hn, display_name: patient.display_name, allergies: patient.allergies || [] } : null,
    flags,
    blocked: flags.some((flag) => flag.severity === 'block'),
    latest_review: review,
    disclaimer: 'กฎตรวจสอบนี้เป็น simulation สำหรับการศึกษา ไม่ใช่ clinical decision support สำหรับใช้งานจริง',
  }
}

export async function savePharmacyReview(orderId: string, input: { decision: 'approved' | 'override' | 'rejected'; note: string }, actorId: string) {
  const db = await getDb()
  const order = await db.collection('orders').findOne({ _id: objectId(orderId), 'items.type': 'medication' })
  if (!order) throw new DomainError('ไม่พบใบสั่งยา', 'NOT_FOUND', 404)
  const patient = await db.collection('patients').findOne({ _id: order.patient_id })
  const flags = buildSafetyFlags(order, patient)
  const blocked = flags.some((flag) => flag.severity === 'block')
  if (blocked && input.decision === 'approved') throw new DomainError('มี Allergy block จากกฎสาธิต กรุณาเลือก override พร้อมเหตุผล หรือปฏิเสธรายการ', 'SAFETY_REVIEW_REQUIRED', 409)
  if (input.decision === 'override' && input.note.trim().length < 5) throw new DomainError('การ Override ต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร')
  const review = {
    _id: new ObjectId(),
    order_id: order._id,
    encounter_id: order.encounter_id,
    patient_id: order.patient_id,
    decision: input.decision,
    note: input.note.trim(),
    flags,
    actor_id: objectId(actorId),
    created_at: new Date(),
  }
  await db.collection('pharmacy_reviews').insertOne(review)
  await db.collection('orders').updateOne({ _id: order._id }, { $set: { pharmacy_review_status: input.decision, pharmacy_reviewed_at: review.created_at, pharmacy_reviewed_by: review.actor_id } })
  await db.collection('clinical_order_events').insertOne({ order_id: order._id, encounter_id: order.encounter_id, action: `pharmacy_review_${input.decision}`, actor_id: review.actor_id, reason: review.note, created_at: review.created_at })
  broadcast('pharmacy', 'safety_review_updated', { order_id: orderId, decision: input.decision })
  return review
}

export async function getAdminOverview() {
  const db = await getDb()
  const [users, patients, encounters, orders, stations, chairs, auditCount] = await Promise.all([
    db.collection('users').countDocuments({ is_active: { $ne: false } }),
    db.collection('patients').countDocuments(),
    db.collection('encounters').countDocuments({ status: 'active' }),
    db.collection('orders').countDocuments({ status: { $ne: 'completed' } }),
    db.collection('stations').find({}).sort({ code: 1 }).toArray(),
    db.collection('infusion_chairs').find({ is_active: true }).sort({ sort_order: 1 }).toArray(),
    db.collection('audit_requests').countDocuments(),
  ])
  return { users, patients, active_encounters: encounters, open_orders: orders, stations, infusion_chairs: chairs, audit_count: auditCount, environment: process.env.APP_ENV || process.env.NODE_ENV || 'development' }
}

export async function listAudit(query = '') {
  const db = await getDb()
  const match: Document = {}
  if (query.trim()) {
    const r = regex(query.trim())
    match.$or = [{ action: r }, { actor_role: r }, { method: r }]
  }
  return db.collection('audit_requests').find(match).sort({ created_at: -1 }).limit(200).toArray()
}

const RESET_COLLECTIONS = [
  'appointments', 'appointment_requests', 'encounters', 'queue_items', 'queue_events', 'vitals', 'clinical_assessments', 'extended_assessments',
  'clinical_notes', 'orders', 'clinical_order_events', 'previsits', 'triage_sessions', 'help_requests', 'notifications', 'notices',
  'imaging_results', 'pharmacy_reviews', 'recommendation_decisions', 'audit_requests', 'infusion_sessions', 'infusion_events',
]

export async function resetDemoData(actorId?: string) {
  const env = process.env.APP_ENV || process.env.NODE_ENV || 'development'
  if (!['development', 'test', 'public_demo'].includes(env)) throw new DomainError('Demo Reset ปิดใช้งานใน environment นี้', 'FORBIDDEN', 403)
  const db = await getDb()
  for (const name of RESET_COLLECTIONS) await db.collection(name).deleteMany({})
  const seeded = await runDatabaseSeed(true, db)
  if (actorId && ObjectId.isValid(actorId)) await db.collection('audit_requests').insertOne({ actor_id: actorId, actor_role: 'admin', method: 'POST', action: 'extended/admin/demo-reset', created_at: new Date(), reset_event: true })
  broadcast('operations', 'demo_reset', { at: new Date().toISOString() })
  return { ...seeded, cleared_collections: RESET_COLLECTIONS.length }
}

const HISTORICAL_STATIONS = [
  { code: 'NPR', label: 'ลงทะเบียนผู้ป่วยใหม่', baseline_wait_min: 13, adapted_wait_min: 8, group: 'frontline' },
  { code: 'EV', label: 'ตรวจสอบสิทธิการรักษา', baseline_wait_min: 14, adapted_wait_min: 9, group: 'frontline' },
  { code: 'VM', label: 'วัดสัญญาณชีพ', baseline_wait_min: 27, adapted_wait_min: 16, group: 'frontline' },
  { code: 'MHT', label: 'ซักประวัติทางการแพทย์', baseline_wait_min: 34, adapted_wait_min: 21, group: 'frontline' },
  { code: 'PC', label: 'ตรวจโดยแพทย์', baseline_wait_min: 61, adapted_wait_min: 38, group: 'consult' },
  { code: 'LAB', label: 'ห้องปฏิบัติการ', baseline_wait_min: 35, adapted_wait_min: 22, group: 'diagnostic' },
  { code: 'XR', label: 'รังสีวินิจฉัย / Imaging', baseline_wait_min: 23, adapted_wait_min: 14, group: 'diagnostic' },
  { code: 'INFUSION', label: 'Chemotherapy / Infusion', baseline_wait_min: 38, adapted_wait_min: 23, group: 'treatment' },
  { code: 'PD', label: 'ห้องจ่ายยา', baseline_wait_min: 53, adapted_wait_min: 33, group: 'pharmacy' },
]

export async function getExtendedPrevisit(userId: string) {
  const db = await getDb()
  const user = await db.collection('users').findOne({ _id: objectId(userId), role: 'patient' })
  if (!user?.patient_id) throw new DomainError('ไม่พบข้อมูลผู้ป่วย', 'NOT_FOUND', 404)
  const [patient, previsit] = await Promise.all([
    db.collection('patients').findOne({ _id: user.patient_id }),
    db.collection('previsits').findOne({ patient_id: user.patient_id }),
  ])
  return { patient, previsit }
}

export async function saveExtendedPrevisit(userId: string, input: Record<string, unknown>) {
  const db = await getDb()
  const user = await db.collection('users').findOne({ _id: objectId(userId), role: 'patient' })
  if (!user?.patient_id) throw new DomainError('ไม่พบข้อมูลผู้ป่วย', 'NOT_FOUND', 404)
  const extended = {
    address: String(input.address || '').trim(),
    province: String(input.province || '').trim(),
    preferred_language: String(input.preferred_language || 'ไทย').trim(),
    caregiver_name: String(input.caregiver_name || '').trim(),
    caregiver_phone: String(input.caregiver_phone || '').trim(),
    special_needs: String(input.special_needs || '').trim(),
    chronic_conditions: String(input.chronic_conditions || '').trim(),
    cancer_history: String(input.cancer_history || '').trim(),
    previous_treatment: String(input.previous_treatment || '').trim(),
    referral_hospital: String(input.referral_hospital || '').trim(),
    referral_status: String(input.referral_status || '').trim(),
    consent_confirmed: Boolean(input.consent_confirmed),
    updated_at: new Date(),
  }
  await db.collection('previsits').updateOne({ patient_id: user.patient_id }, { $set: { extended, updated_at: new Date() }, $setOnInsert: { _id: new ObjectId(), patient_id: user.patient_id, created_at: new Date() } }, { upsert: true })
  await db.collection('patients').updateOne({ _id: user.patient_id }, { $set: { address: extended.address, province: extended.province, caregiver_name: extended.caregiver_name, updated_at: new Date() } })
  broadcast(`patient:${user.patient_id.toString()}`, 'previsit_extended_saved', { patient_id: user.patient_id.toString() })
  return db.collection('previsits').findOne({ patient_id: user.patient_id })
}

export async function getHistoricalInsights() {
  const baseline = HISTORICAL_STATIONS.reduce((sum, row) => sum + row.baseline_wait_min, 0) / HISTORICAL_STATIONS.length
  const adapted = HISTORICAL_STATIONS.reduce((sum, row) => sum + row.adapted_wait_min, 0) / HISTORICAL_STATIONS.length
  return {
    source: 'AMIS DynaFlow design capsule — aggregated educational benchmark; no patient identifiers are exposed',
    scope: 'Mini-project demonstration; Radiation/Brachytherapy excluded by project requirement',
    stations: HISTORICAL_STATIONS,
    summary: {
      mean_baseline_wait_min: Math.round(baseline * 10) / 10,
      mean_adapted_wait_min: Math.round(adapted * 10) / 10,
      improvement_percent: Math.round((1 - adapted / baseline) * 1000) / 10,
    },
  }
}

export async function getMethodology() {
  return {
    mode: 'deterministic_simulation',
    deployed_model: false,
    statement: 'ระบบเว็บปัจจุบันจำลองแนวคิด DynaFlow ด้วย deterministic queue/flow engine ไม่ได้รัน TFT, QI-MOGA หรือ GAT-MAPPO เป็นโมเดล production ใน request path',
    baseline: 'Baseline plan ถูกสร้างจากเส้นทางและ service-time configuration ตอนเริ่ม visit',
    adapted: 'Adapted plan ปรับจากสถานะคิวและค่า P50/P80 ที่คำนวณจากประวัติเมื่อมีตัวอย่างเพียงพอ',
    research_adapter: 'สามารถนำผล offline/precomputed จาก TFT/QI-MOGA/GAT-MAPPO เข้ามาเปรียบเทียบผ่าน dashboard ได้ในอนาคต',
    excluded_modules: ['Radiation Therapy', 'Brachytherapy'],
  }
}

export function asPublic<T = unknown>(value: unknown): T {
  return publicDocument<T>(value)
}
