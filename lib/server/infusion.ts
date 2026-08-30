import 'server-only'
import { ObjectId, type Document } from 'mongodb'
import { getDb } from '@/lib/server/db'
import { broadcast } from '@/lib/server/events'
import { buildEffectivePhases, materializeInfusionSession } from '@/lib/infusion-time'
import { evaluateInfusionReadiness, suggestInfusionQueue } from '@/lib/infusion-domain'
import { completeQueue, DomainError, notify, objectId } from '@/lib/server/domain'
import type {
  InfusionChair,
  InfusionPhaseTemplate,
  InfusionReadinessRequirement,
  InfusionSession,
} from '@/lib/types'

const ACTIVE_SESSION = ['reserved', 'active', 'paused', 'due']
type HydratedQueueDocument = Document & {
  _id: ObjectId
  status: string
  readiness: { ready: boolean; requirements: Array<{ key: InfusionReadinessRequirement; ready: boolean; label: string }> }
}

async function auditInfusion(input: {
  action: string
  staffId?: string
  sessionId?: ObjectId
  chairId?: ObjectId
  queueItemId?: ObjectId
  reason?: string
  metadata?: Record<string, unknown>
}) {
  const event = {
    _id: new ObjectId(),
    action: input.action,
    ...(input.staffId && ObjectId.isValid(input.staffId) ? { performed_by: new ObjectId(input.staffId) } : {}),
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
    ...(input.chairId ? { chair_id: input.chairId } : {}),
    ...(input.queueItemId ? { queue_item_id: input.queueItemId } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    created_at: new Date(),
  }
  await (await getDb()).collection('infusion_events').insertOne(event)
  return event
}

async function readinessFor(db: Awaited<ReturnType<typeof getDb>>, queue: Document, order?: Document, template?: Document) {
  const requirements = (template?.readiness_requirements || ['active_order']) as InfusionReadinessRequirement[]
  const encounterId = queue.encounter_id
  const relatedOrders = encounterId
    ? await db.collection('orders').find({ encounter_id: encounterId }).toArray()
    : []
  const activeOrder = Boolean(order && order.status !== 'cancelled' && Array.isArray(order.items) && order.items.some((item: Document) =>
    item.type === 'infusion' && !['cancelled', 'completed'].includes(String(item.status)),
  ))
  const labVerified = relatedOrders.some((row) =>
    row.lab_status === 'verified' || (Array.isArray(row.items) && row.items.some((item: Document) => item.type === 'lab' && item.status === 'completed')),
  )
  const medicationReady = relatedOrders.some((row) =>
    ['ready', 'dispensed'].includes(String(row.pharmacy_status)) ||
    (Array.isArray(row.items) && row.items.some((item: Document) =>
      item.type === 'medication' && ['ready', 'dispensed'].includes(String(item.status)),
    )),
  )
  return evaluateInfusionReadiness(requirements, {
    active_order: activeOrder,
    lab_verified: labVerified,
    medication_ready: medicationReady,
  }, {
    enabled: Boolean(queue.readiness_override),
    reason: String(queue.readiness_override_reason || ''),
  })
}

async function hydrateQueueRows(rows: Document[]): Promise<HydratedQueueDocument[]> {
  const db = await getDb()
  const templates = await db.collection('infusion_templates').find({}).toArray()
  const templateById = new Map(templates.map((template) => [template._id.toString(), template]))
  const output: HydratedQueueDocument[] = []
  for (const row of rows) {
    const order = await db.collection('orders').findOne({
      encounter_id: row.encounter_id,
      items: { $elemMatch: { type: 'infusion', status: { $nin: ['cancelled', 'completed'] } } },
      status: { $ne: 'cancelled' },
    }, { sort: { created_at: -1 } })
    const item = Array.isArray(order?.items)
      ? order.items.find((candidate: Document) => candidate.type === 'infusion' && !['cancelled', 'completed'].includes(String(candidate.status)))
      : undefined
    const template = item?.service_template_id && ObjectId.isValid(String(item.service_template_id))
      ? templateById.get(String(item.service_template_id))
      : templates.find((candidate) => candidate.code === 'HYDRATION_DEMO')
    output.push({
      ...row,
      order_id: order?._id,
      order_item_id: item?.id,
      template_id: template?._id,
      template_name: template?.name || item?.name || 'บริการ Infusion',
      service_kind: template?.service_kind || 'hydration',
      planned_for: item?.planned_for,
      duration_override_min: item?.duration_override_min,
      readiness: await readinessFor(db, row, order || undefined, template),
    } as unknown as HydratedQueueDocument)
  }
  return output
}

async function activeSessions() {
  const db = await getDb()
  const rows = await db.collection('infusion_sessions').aggregate([
    { $match: { status: { $in: ACTIVE_SESSION } } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
  ]).toArray()
  const now = Date.now()
  const sessions = rows.map((row) => materializeInfusionSession({
    ...row,
    id: row._id.toString(),
    chair_id: row.chair_id.toString(),
  } as unknown as InfusionSession, now))
  for (let index = 0; index < sessions.length; index++) {
    const session = sessions[index]
    if (session.status === 'due' && rows.find((row) => row._id.toString() === session.id)?.status !== 'due') {
      const changed = await db.collection('infusion_sessions').updateOne(
        { _id: objectId(session.id), status: 'active', version: session.version },
        { $set: { status: 'due', phases: session.phases, remaining_sec: session.remaining_sec, updated_at: new Date() }, $inc: { version: 1 } },
      )
      if (changed.modifiedCount) {
        session.version += 1
        broadcast('infusion', 'session_due', { session_id: session.id, chair_id: session.chair_id })
      } else {
        const latest = await db.collection('infusion_sessions').findOne({ _id: objectId(session.id), status: { $in: ACTIVE_SESSION } })
        if (latest) sessions[index] = materializeInfusionSession({ ...latest, id: latest._id.toString(), chair_id: latest.chair_id.toString() } as unknown as InfusionSession, now)
      }
    }
  }
  return sessions
}

export async function getInfusionBoard() {
  const db = await getDb()
  const [chairs, sessions, queueRows, templates] = await Promise.all([
    db.collection('infusion_chairs').find({ is_active: true }).sort({ sort_order: 1 }).toArray(),
    activeSessions(),
    db.collection('queue_items').aggregate([
      { $match: { station_code: 'INFUSION', status: { $in: ['waiting', 'called', 'in_progress', 'no_show'] } } },
      { $sort: { rank: 1, created_at: 1 } },
      { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
      { $lookup: { from: 'encounters', localField: 'encounter_id', foreignField: '_id', as: 'encounter_rows' } },
      { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] }, encounter: { $arrayElemAt: ['$encounter_rows', 0] } } },
      { $unset: ['patient_rows', 'encounter_rows'] },
    ]).toArray(),
    db.collection('infusion_templates').find({ is_active: true }).sort({ created_at: 1 }).toArray(),
  ])
  const queue = await hydrateQueueRows(queueRows)
  const queuedEncounterIds = new Set(queueRows.map((row) => row.encounter_id?.toString()))
  const plannedOrders = await db.collection('orders').aggregate([
    { $match: { items: { $elemMatch: { type: 'infusion', status: { $nin: ['cancelled', 'completed'] } } }, status: { $ne: 'cancelled' } } },
    { $sort: { created_at: 1 } },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] } } },
    { $unset: 'patient_rows' },
  ]).toArray()
  const planned = plannedOrders
    .filter((order) => !queuedEncounterIds.has(order.encounter_id?.toString()))
    .map((order) => {
      const item = (order.items as Document[]).find((candidate) => candidate.type === 'infusion' && !['cancelled', 'completed'].includes(String(candidate.status)))
      const template = templates.find((candidate) => candidate._id.toString() === String(item?.service_template_id)) || templates[0]
      return {
        id: `planned:${order._id.toString()}`,
        queue_no: 'วางแผน', encounter_id: order.encounter_id, patient_id: order.patient_id,
        station_code: 'INFUSION', status: 'waiting', patient: order.patient,
        order_id: order._id, order_item_id: item?.id, template_id: template?._id,
        template_name: template?.name || item?.name, service_kind: template?.service_kind,
        planned_for: item?.planned_for, readiness: { ready: false, requirements: [] },
        created_at: order.created_at,
      }
    })
  const sessionByChair = new Map(sessions.map((session) => [session.chair_id, session]))
  const chairBoard = chairs.map((chair) => ({ ...chair, session: sessionByChair.get(chair._id.toString()) }))
  const waiting = queue.filter((item) => item.status === 'waiting')
  const suggestion = suggestInfusionQueue(waiting)
  return {
    server_now: new Date().toISOString(),
    chairs: chairBoard,
    queue,
    planned,
    suggested_next: suggestion.suggested,
    templates,
    kpis: {
      active_chairs: sessions.length,
      total_chairs: chairs.length,
      infusing: sessions.filter((session) => session.status === 'active').length,
      due: sessions.filter((session) => session.status === 'due').length,
      waiting: waiting.length,
    },
  }
}

export async function listInfusionResources() {
  const db = await getDb()
  const [chairs, templates] = await Promise.all([
    db.collection('infusion_chairs').find({}).sort({ sort_order: 1 }).toArray(),
    db.collection('infusion_templates').find({}).sort({ created_at: 1 }).toArray(),
  ])
  return { chairs, templates }
}

export async function listActiveInfusionTemplates() {
  const db = await getDb()
  return db.collection('infusion_templates').find({ is_active: true }).sort({ created_at: 1 }).toArray()
}

export async function addInfusionChairs(count: number, defaultDurationMin?: number) {
  const db = await getDb()
  const safeCount = Math.min(50, Math.max(1, Math.floor(count)))
  const maximum = Math.max(8, Number(process.env.INFUSION_MAX_CHAIRS || 100))
  const existingCount = await db.collection('infusion_chairs').countDocuments()
  const last = await db.collection('infusion_chairs').findOne({}, { sort: { sort_order: -1 } })
  await db.collection('resource_limits').updateOne(
    { key: 'infusion_chairs' },
    { $setOnInsert: { _id: new ObjectId(), key: 'infusion_chairs', count: existingCount, next_order: Number(last?.sort_order || 0), created_at: new Date() } },
    { upsert: true },
  )
  const reservation = await db.collection('resource_limits').findOneAndUpdate(
    { key: 'infusion_chairs', count: { $lte: maximum - safeCount } },
    { $inc: { count: safeCount, next_order: safeCount }, $set: { updated_at: new Date() } },
    { returnDocument: 'after' },
  )
  if (!reservation) throw new DomainError(`เพิ่มเก้าอี้ไม่ได้ ระบบจำกัดรวม ${maximum} ตัว`, 'RESOURCE_LIMIT', 409)
  const start = Number(reservation.next_order) - safeCount + 1
  const now = new Date()
  const docs = Array.from({ length: safeCount }, (_, index) => {
    const number = start + index
    return {
      _id: new ObjectId(), code: `INF-${String(number).padStart(2, '0')}`, label: `เก้าอี้ ${number}`,
      sort_order: number, ...(defaultDurationMin ? { default_duration_min: defaultDurationMin } : {}),
      is_active: true, created_at: now, updated_at: now,
    }
  })
  try {
    await db.collection('infusion_chairs').insertMany(docs)
  } catch (error) {
    await db.collection('resource_limits').updateOne({ key: 'infusion_chairs' }, { $inc: { count: -safeCount } })
    throw error
  }
  broadcast('infusion', 'chairs_changed', { count: docs.length })
  return docs
}

export async function updateInfusionChair(chairId: string, input: Partial<Pick<InfusionChair, 'label' | 'default_duration_min' | 'is_active'>>) {
  const db = await getDb()
  const id = objectId(chairId)
  const chair = await db.collection('infusion_chairs').findOne({ _id: id })
  if (!chair) throw new DomainError('ไม่พบเก้าอี้', 'NOT_FOUND', 404)
  if (input.is_active === false) {
    const activeSession = chair.active_session_id || await db.collection('infusion_sessions').findOne({ chair_id: id, status: { $in: ACTIVE_SESSION } })
    if (activeSession) throw new DomainError('ไม่สามารถปิดเก้าอี้ที่มีผู้ป่วยจองหรือกำลังใช้งาน', 'CHAIR_OCCUPIED', 409)
  }
  const changes: Document = { updated_at: new Date() }
  if (input.label !== undefined) changes.label = input.label.trim()
  if (input.default_duration_min !== undefined) changes.default_duration_min = input.default_duration_min || null
  if (input.is_active !== undefined) changes.is_active = input.is_active
  const updated = await db.collection('infusion_chairs').findOneAndUpdate({ _id: id }, { $set: changes }, { returnDocument: 'after' })
  broadcast('infusion', 'chairs_changed', { chair_id: chairId })
  return updated
}

export async function createInfusionTemplate(input: Document) {
  const db = await getDb()
  const now = new Date()
  const doc = {
    _id: new ObjectId(), code: String(input.code).trim().toUpperCase(), name: String(input.name).trim(),
    service_kind: input.service_kind, phases: input.phases, readiness_requirements: input.readiness_requirements,
    is_active: true, is_demo: false, created_at: now, updated_at: now,
  }
  await db.collection('infusion_templates').insertOne(doc)
  broadcast('infusion', 'templates_changed', { template_id: doc._id })
  return doc
}

export async function updateInfusionTemplate(templateId: string, input: Document) {
  const db = await getDb()
  const update: Document = { updated_at: new Date() }
  for (const key of ['name', 'service_kind', 'phases', 'readiness_requirements', 'is_active']) {
    if (input[key] !== undefined) update[key] = input[key]
  }
  const row = await db.collection('infusion_templates').findOneAndUpdate(
    { _id: objectId(templateId) }, { $set: update }, { returnDocument: 'after' },
  )
  if (!row) throw new DomainError('ไม่พบ Template', 'NOT_FOUND', 404)
  broadcast('infusion', 'templates_changed', { template_id: templateId })
  return row
}

export async function callPatientToChair(
  chairId: string,
  queueItemId: string,
  staffId: string,
  input: { duration_override_min?: number; override_reason?: string },
) {
  const db = await getDb()
  const chairObjectId = objectId(chairId)
  const queueObjectId = objectId(queueItemId)
  const [chair, queue] = await Promise.all([
    db.collection('infusion_chairs').findOne({ _id: chairObjectId, is_active: true }),
    db.collection('queue_items').findOne({ _id: queueObjectId, station_code: 'INFUSION', status: 'waiting' }),
  ])
  if (!chair) throw new DomainError('เก้าอี้ไม่พร้อมใช้งาน', 'CHAIR_UNAVAILABLE', 409)
  if (!queue) throw new DomainError('คิวนี้ไม่อยู่ในสถานะรอ', 'QUEUE_UNAVAILABLE', 409)
  const hydrated = (await hydrateQueueRows([queue]))[0]
  const fifoRows = await db.collection('queue_items')
    .find({ station_code: 'INFUSION', status: 'waiting' })
    .sort({ rank: 1, created_at: 1 })
    .toArray()
  const suggestion = suggestInfusionQueue(await hydrateQueueRows(fifoRows))
  const suggestedId = suggestion.suggested?._id?.toString()
  const isManualInsertion = hydrated.readiness.ready && suggestedId && suggestedId !== queueItemId
  if (!hydrated.readiness.ready && !input.override_reason?.trim()) {
    throw new DomainError('ผู้ป่วยยังไม่ผ่านเงื่อนไขความพร้อม กรุณาระบุเหตุผลหากต้องการดำเนินการต่อ', 'NOT_READY', 409)
  }
  if (isManualInsertion && !input.override_reason?.trim()) {
    throw new DomainError('คิวนี้ไม่ใช่คิวพร้อมลำดับถัดไป กรุณาระบุเหตุผลในการแทรกคิว', 'QUEUE_OVERRIDE_REASON_REQUIRED', 409)
  }
  const template = hydrated.template_id
    ? await db.collection('infusion_templates').findOne({ _id: hydrated.template_id })
    : await db.collection('infusion_templates').findOne({ code: 'HYDRATION_DEMO' })
  if (!template) throw new DomainError('ไม่พบ Template บริการ', 'NOT_FOUND', 404)
  const sessionId = new ObjectId()
  const locked = await db.collection('infusion_chairs').findOneAndUpdate(
    { _id: chairObjectId, is_active: true, active_session_id: { $exists: false } },
    { $set: { active_session_id: sessionId, updated_at: new Date() } },
    { returnDocument: 'after' },
  )
  if (!locked) throw new DomainError('เก้าอี้ถูกจองโดยเจ้าหน้าที่คนอื่นแล้ว', 'CHAIR_OCCUPIED', 409)
  const queueChanged = await db.collection('queue_items').updateOne(
    { _id: queueObjectId, status: 'waiting' },
    {
      $set: {
        status: 'called', called_at: new Date(), assigned_staff_id: objectId(staffId), updated_at: new Date(),
        ...(input.override_reason?.trim() ? { readiness_override: true, readiness_override_reason: input.override_reason.trim() } : {}),
      },
      $inc: { call_count: 1 },
    },
  )
  if (!queueChanged.modifiedCount) {
    await db.collection('infusion_chairs').updateOne({ _id: chairObjectId, active_session_id: sessionId }, { $unset: { active_session_id: '' } })
    throw new DomainError('สถานะคิวเปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'QUEUE_UNAVAILABLE', 409)
  }
  const phases = buildEffectivePhases(
    template.phases as InfusionPhaseTemplate[],
    Number(chair.default_duration_min || 0) || undefined,
    input.duration_override_min ?? (Number(hydrated.duration_override_min || 0) || undefined),
  )
  const now = new Date()
  const session = {
    _id: sessionId, chair_id: chairObjectId, encounter_id: queue.encounter_id, queue_item_id: queueObjectId,
    order_id: hydrated.order_id, order_item_id: hydrated.order_item_id, patient_id: queue.patient_id, template_id: template._id,
    template_name: template.name, service_kind: template.service_kind, status: 'reserved', phases,
    current_phase_index: 0, planned_duration_sec: phases.reduce((sum, phase) => sum + phase.effective_duration_sec, 0),
    remaining_sec: phases.reduce((sum, phase) => sum + phase.remaining_sec, 0), progress_percent: 0,
    version: 1, reserved_at: now, created_at: now, updated_at: now,
  }
  try {
    await db.collection('infusion_sessions').insertOne(session)
  } catch (cause) {
    await Promise.all([
      db.collection('infusion_chairs').updateOne({ _id: chairObjectId, active_session_id: sessionId }, { $unset: { active_session_id: '' } }),
      db.collection('queue_items').updateOne({ _id: queueObjectId, status: 'called' }, { $set: { status: 'waiting', updated_at: new Date() } }),
    ])
    throw cause
  }
  await auditInfusion({ action: 'patient_called', staffId, sessionId, chairId: chairObjectId, queueItemId: queueObjectId, reason: input.override_reason })
  if (suggestedId === queueItemId && suggestion.bypassed.length > 0) {
    await auditInfusion({
      action: 'not_ready_queue_bypassed', staffId, sessionId, chairId: chairObjectId, queueItemId: queueObjectId,
      reason: 'ระบบเสนอคิวพร้อมลำดับถัดไป โดยคงอันดับคิวที่ยังไม่พร้อมไว้',
      metadata: { bypassed_queue_item_ids: suggestion.bypassed.map((item) => item._id?.toString()) },
    })
  }
  await notify(queue.patient_id, 'ถึงคิวให้สารน้ำแล้ว', `เชิญที่ ${chair.label}`, 'infusion_called', queue.encounter_id)
  broadcast('infusion', 'chair_reserved', { session_id: sessionId, chair_id: chairObjectId, queue_item_id: queueObjectId })
  return session
}

export async function startInfusionPhase(sessionId: string, staffId: string, expectedVersion: number) {
  const db = await getDb()
  const id = objectId(sessionId)
  const session = await db.collection('infusion_sessions').findOne({ _id: id, status: { $in: ['reserved', 'paused'] }, version: expectedVersion })
  if (!session) throw new DomainError('Session เปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  const phases = [...session.phases]
  const current = phases[session.current_phase_index]
  if (!current || !['pending', 'paused'].includes(current.status)) throw new DomainError('Phase นี้ไม่พร้อมเริ่ม', 'INVALID_STATE', 409)
  const now = new Date()
  phases[session.current_phase_index] = { ...current, status: 'active', started_at: now, paused_at: undefined }
  const updated = await db.collection('infusion_sessions').findOneAndUpdate(
    { _id: id, version: expectedVersion },
    { $set: { phases, status: 'active', started_at: session.started_at || now, updated_at: now }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  )
  if (!updated) throw new DomainError('Session เปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  if (session.status === 'reserved' && session.queue_item_id) {
    await db.collection('queue_items').updateOne(
      { _id: session.queue_item_id, status: 'called' },
      { $set: { status: 'in_progress', started_at: now, updated_at: now } },
    )
  }
  await auditInfusion({ action: 'phase_started', staffId, sessionId: id, chairId: session.chair_id, metadata: { phase: current.key } })
  broadcast('infusion', 'session_updated', { session_id: id, action: 'phase_started' })
  return updated
}

export async function pauseInfusion(sessionId: string, staffId: string, expectedVersion: number, reason: string) {
  const db = await getDb()
  const id = objectId(sessionId)
  const row = await db.collection('infusion_sessions').findOne({ _id: id, status: 'active', version: expectedVersion })
  if (!row) throw new DomainError('Session เปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  const materialized = materializeInfusionSession({ ...row, id: row._id.toString(), chair_id: row.chair_id.toString() } as unknown as InfusionSession)
  const phases = [...materialized.phases]
  phases[row.current_phase_index] = { ...phases[row.current_phase_index], status: 'paused', paused_at: new Date().toISOString(), started_at: undefined }
  const updated = await db.collection('infusion_sessions').findOneAndUpdate(
    { _id: id, version: expectedVersion },
    { $set: { phases, status: 'paused', remaining_sec: materialized.remaining_sec, updated_at: new Date() }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  )
  await auditInfusion({ action: 'session_paused', staffId, sessionId: id, chairId: row.chair_id, reason })
  broadcast('infusion', 'session_updated', { session_id: id, action: 'paused' })
  return updated
}

export async function adjustInfusionTime(sessionId: string, staffId: string, expectedVersion: number, deltaMin: number, reason: string) {
  const db = await getDb()
  const id = objectId(sessionId)
  const row = await db.collection('infusion_sessions').findOne({ _id: id, status: { $in: ['active', 'paused', 'due'] }, version: expectedVersion })
  if (!row) throw new DomainError('Session เปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  const materialized = materializeInfusionSession({ ...row, id: row._id.toString(), chair_id: row.chair_id.toString() } as unknown as InfusionSession)
  const phases = [...materialized.phases]
  const current = phases[row.current_phase_index]
  const remaining = Math.max(0, current.remaining_sec + Math.round(deltaMin * 60))
  const nextStatus = remaining === 0 ? 'due' : row.status === 'paused' ? 'paused' : 'active'
  phases[row.current_phase_index] = {
    ...current, remaining_sec: remaining, effective_duration_sec: Math.max(60, current.effective_duration_sec + Math.round(deltaMin * 60)),
    status: nextStatus,
    ...(nextStatus === 'active' ? { started_at: new Date().toISOString() } : { started_at: undefined }),
  }
  const updated = await db.collection('infusion_sessions').findOneAndUpdate(
    { _id: id, version: expectedVersion },
    { $set: { phases, status: nextStatus, remaining_sec: Math.max(0, materialized.remaining_sec + Math.round(deltaMin * 60)), updated_at: new Date() }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  )
  await auditInfusion({ action: 'time_adjusted', staffId, sessionId: id, chairId: row.chair_id, reason, metadata: { delta_min: deltaMin } })
  broadcast('infusion', 'session_updated', { session_id: id, action: 'time_adjusted' })
  return updated
}

export async function completeInfusionPhase(sessionId: string, staffId: string, expectedVersion: number, reason = '') {
  const db = await getDb()
  const id = objectId(sessionId)
  const row = await db.collection('infusion_sessions').findOne({ _id: id, status: { $in: ['active', 'paused', 'due'] }, version: expectedVersion })
  if (!row) throw new DomainError('Session เปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  const materialized = materializeInfusionSession({ ...row, id: row._id.toString(), chair_id: row.chair_id.toString() } as unknown as InfusionSession)
  const current = materialized.phases[row.current_phase_index]
  if (current.remaining_sec > 0 && !reason.trim()) throw new DomainError('กรุณาระบุเหตุผลเมื่อจบก่อนเวลา')
  const phases = [...materialized.phases]
  phases[row.current_phase_index] = { ...current, status: 'completed', remaining_sec: 0, completed_at: new Date().toISOString(), started_at: undefined }
  const isLast = row.current_phase_index >= phases.length - 1
  const updated = await db.collection('infusion_sessions').findOneAndUpdate(
    { _id: id, version: expectedVersion },
    {
      $set: {
        phases, current_phase_index: isLast ? row.current_phase_index : row.current_phase_index + 1,
        status: isLast ? 'due' : 'reserved', remaining_sec: phases.slice(row.current_phase_index + 1).reduce((sum, phase) => sum + phase.remaining_sec, 0),
        progress_percent: isLast ? 100 : materialized.progress_percent, updated_at: new Date(),
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  )
  await auditInfusion({ action: 'phase_completed', staffId, sessionId: id, chairId: row.chair_id, reason, metadata: { phase: current.key } })
  broadcast('infusion', 'session_updated', { session_id: id, action: 'phase_completed' })
  return updated
}

export async function completeInfusionSession(sessionId: string, staffId: string, expectedVersion: number, reason = '') {
  const db = await getDb()
  const id = objectId(sessionId)
  const row = await db.collection('infusion_sessions').findOne({ _id: id, status: { $in: ['due', 'active', 'paused', 'reserved'] }, version: expectedVersion })
  if (!row) throw new DomainError('Session เปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  const materialized = materializeInfusionSession({ ...row, id: row._id.toString(), chair_id: row.chair_id.toString() } as unknown as InfusionSession)
  if (materialized.remaining_sec > 0 && !reason.trim()) throw new DomainError('กรุณาระบุเหตุผลเมื่อจบก่อนเวลา')
  if (row.queue_item_id) {
    const queue = await db.collection('queue_items').findOne({ _id: row.queue_item_id })
    if (queue && queue.status !== 'completed') await completeQueue('INFUSION', row.queue_item_id.toString(), staffId, Number(queue.version || 1))
  }
  const now = new Date()
  const phases = materialized.phases.map((phase) => ({ ...phase, status: 'completed', remaining_sec: 0, completed_at: phase.completed_at || now }))
  const updated = await db.collection('infusion_sessions').findOneAndUpdate(
    { _id: id, version: expectedVersion },
    { $set: { phases, status: 'completed', remaining_sec: 0, progress_percent: 100, completed_at: now, updated_at: now }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  )
  if (!updated) throw new DomainError('Session เปลี่ยนแปลงแล้ว กรุณารีเฟรช', 'VERSION_CONFLICT', 409)
  if (row.order_id && row.order_item_id) {
    await db.collection('orders').updateOne(
      { _id: row.order_id },
      { $set: { 'items.$[item].status': 'completed', updated_at: now } },
      { arrayFilters: [{ 'item.id': row.order_item_id }] },
    )
  }
  await db.collection('infusion_chairs').updateOne({ _id: row.chair_id, active_session_id: id }, { $unset: { active_session_id: '' }, $set: { updated_at: now } })
  await auditInfusion({ action: 'session_completed', staffId, sessionId: id, chairId: row.chair_id, reason })
  broadcast('infusion', 'chair_released', { session_id: id, chair_id: row.chair_id })
  return updated
}

export async function recallInfusionPatient(sessionId: string, staffId: string) {
  const db = await getDb()
  const row = await db.collection('infusion_sessions').findOne({ _id: objectId(sessionId), status: 'reserved', started_at: { $exists: false } })
  if (!row?.queue_item_id) throw new DomainError('Session นี้ไม่อยู่ระหว่างเรียกผู้ป่วย', 'INVALID_STATE', 409)
  await db.collection('queue_items').updateOne({ _id: row.queue_item_id, status: 'called' }, { $inc: { call_count: 1 }, $set: { updated_at: new Date() } })
  await notify(row.patient_id, 'เรียกเข้ารับบริการอีกครั้ง', 'กรุณาไปที่ห้องให้สารน้ำและยาทางหลอดเลือด', 'infusion_recalled', row.encounter_id)
  await auditInfusion({ action: 'patient_recalled', staffId, sessionId: row._id, chairId: row.chair_id, queueItemId: row.queue_item_id })
  broadcast('infusion', 'patient_recalled', { session_id: row._id })
  return row
}

export async function noShowInfusionPatient(sessionId: string, staffId: string, reason: string) {
  const db = await getDb()
  const id = objectId(sessionId)
  const row = await db.collection('infusion_sessions').findOneAndUpdate(
    { _id: id, status: 'reserved', started_at: { $exists: false } },
    { $set: { status: 'no_show', no_show_reason: reason, completed_at: new Date(), updated_at: new Date() }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  )
  if (!row) throw new DomainError('Session นี้ไม่อยู่ระหว่างเรียกผู้ป่วย', 'INVALID_STATE', 409)
  if (row.queue_item_id) await db.collection('queue_items').updateOne({ _id: row.queue_item_id }, { $set: { status: 'no_show', updated_at: new Date() }, $inc: { skip_count: 1 } })
  await db.collection('infusion_chairs').updateOne({ _id: row.chair_id, active_session_id: id }, { $unset: { active_session_id: '' }, $set: { updated_at: new Date() } })
  await auditInfusion({ action: 'patient_no_show', staffId, sessionId: id, chairId: row.chair_id, queueItemId: row.queue_item_id, reason })
  broadcast('infusion', 'chair_released', { session_id: id, chair_id: row.chair_id })
  return row
}

export async function getInfusionHistory(filters: { query?: string; status?: string; from?: string; to?: string }) {
  const db = await getDb()
  const match: Document = {}
  if (filters.status) match.status = filters.status
  if (filters.from || filters.to) {
    match.created_at = {
      ...(filters.from ? { $gte: new Date(`${filters.from}T00:00:00+07:00`) } : {}),
      ...(filters.to ? { $lte: new Date(`${filters.to}T23:59:59+07:00`) } : {}),
    }
  }
  const rows = await db.collection('infusion_sessions').aggregate([
    { $match: match },
    { $sort: { created_at: -1 } },
    { $limit: 200 },
    { $lookup: { from: 'patients', localField: 'patient_id', foreignField: '_id', as: 'patient_rows' } },
    { $lookup: { from: 'infusion_chairs', localField: 'chair_id', foreignField: '_id', as: 'chair_rows' } },
    { $set: { patient: { $arrayElemAt: ['$patient_rows', 0] }, chair: { $arrayElemAt: ['$chair_rows', 0] } } },
    { $unset: ['patient_rows', 'chair_rows'] },
  ]).toArray()
  const events = await db.collection('infusion_events').aggregate([
    { $match: { session_id: { $in: rows.map((row) => row._id) } } },
    { $sort: { created_at: 1 } },
    { $lookup: { from: 'users', localField: 'performed_by', foreignField: '_id', as: 'performer_rows' } },
    { $set: { performer: { $arrayElemAt: ['$performer_rows', 0] } } },
    { $unset: 'performer_rows' },
  ]).toArray()
  const bySession = new Map<string, Document[]>()
  for (const event of events) {
    const key = event.session_id?.toString() || ''
    bySession.set(key, [...(bySession.get(key) || []), event])
  }
  const query = filters.query?.trim().toLowerCase()
  const filtered = query ? rows.filter((row) =>
    String(row.patient?.display_name || '').toLowerCase().includes(query) ||
    String(row.patient?.hn || '').toLowerCase().includes(query) ||
    String(row.chair?.label || '').toLowerCase().includes(query) ||
    (bySession.get(row._id.toString()) || []).some((event) => String(event.performer?.display_name || '').toLowerCase().includes(query)),
  ) : rows
  return filtered.map((row) => ({ ...row, events: bySession.get(row._id.toString()) || [] }))
}
