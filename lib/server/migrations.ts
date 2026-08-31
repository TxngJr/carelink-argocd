import 'server-only'
import { randomUUID } from 'node:crypto'
import { ObjectId, type Db, type Document } from 'mongodb'
import { STATIONS } from '@/lib/stations'
import {
  LEGACY_INFUSION_STATIONS,
  LEGACY_RADIATION_STATIONS,
  migrateLegacyRoute,
} from '@/lib/migration-routes'

const MIGRATION_ID = '2026-08-infusion-lounge-v1'
const WORKFLOW_HARDENING_MIGRATION_ID = '2026-08-public-demo-workflow-v1'
const LEGACY_INFUSION = LEGACY_INFUSION_STATIONS
const LEGACY_RADIATION = LEGACY_RADIATION_STATIONS

export const DEFAULT_INFUSION_TEMPLATES = [
  {
    code: 'HYDRATION_DEMO',
    name: 'น้ำเกลือทั่วไป',
    service_kind: 'hydration',
    phases: [
      { key: 'prepare', label: 'เตรียมความพร้อม', kind: 'preparation', duration_min: 5 },
      { key: 'infusion', label: 'ให้สารน้ำ', kind: 'infusion', duration_min: 60 },
      { key: 'observe', label: 'สังเกตอาการ', kind: 'observation', duration_min: 10 },
    ],
    readiness_requirements: ['active_order'],
  },
  {
    code: 'IV_MED_DEMO',
    name: 'ยาทางหลอดเลือด',
    service_kind: 'iv_medication',
    phases: [
      { key: 'prepare', label: 'เตรียมยา', kind: 'preparation', duration_min: 10 },
      { key: 'infusion', label: 'ให้ยาทางหลอดเลือด', kind: 'infusion', duration_min: 60 },
      { key: 'observe', label: 'สังเกตอาการ', kind: 'observation', duration_min: 15 },
    ],
    readiness_requirements: ['active_order', 'medication_ready'],
  },
  {
    code: 'CHEMOTHERAPY_DEMO',
    name: 'เคมีบำบัด',
    service_kind: 'chemotherapy',
    phases: [
      { key: 'premed', label: 'Pre-medication', kind: 'premed', duration_min: 30 },
      { key: 'infusion', label: 'ให้ยาเคมีบำบัด', kind: 'infusion', duration_min: 120 },
      { key: 'observe', label: 'สังเกตอาการ', kind: 'observation', duration_min: 30 },
    ],
    readiness_requirements: ['active_order', 'lab_verified', 'medication_ready'],
  },
] as const

export async function ensureInfusionDefaults(db: Db) {
  const now = new Date()
  for (const template of DEFAULT_INFUSION_TEMPLATES) {
    await db.collection('infusion_templates').updateOne(
      { code: template.code },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          ...template,
          phases: template.phases.map((phase) => ({ ...phase })),
          readiness_requirements: [...template.readiness_requirements],
          is_active: true,
          is_demo: true,
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true },
    )
  }

  for (let number = 1; number <= 8; number++) {
    const code = `INF-${String(number).padStart(2, '0')}`
    await db.collection('infusion_chairs').updateOne(
      { code },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          code,
          label: `เก้าอี้ ${number}`,
          sort_order: number,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true },
    )
  }
}

async function migrateLegacySessions(db: Db) {
  const legacyRows = await db.collection('chemo_sessions').find({}).sort({ created_at: 1 }).toArray()
  const chemoTemplate = await db.collection('infusion_templates').findOne({ code: 'CHEMOTHERAPY_DEMO' })
  if (!chemoTemplate) return 0

  let migrated = 0
  for (const row of legacyRows) {
    const legacyId = row._id.toString()
    if (await db.collection('infusion_sessions').findOne({ legacy_session_id: legacyId })) continue

    const chairNumber = Math.max(1, Number(row.chair_no || 1))
    const chairCode = `INF-${String(chairNumber).padStart(2, '0')}`
    await db.collection('infusion_chairs').updateOne(
      { code: chairCode },
      {
        $setOnInsert: {
          _id: new ObjectId(), code: chairCode, label: `เก้าอี้ ${chairNumber}`,
          sort_order: chairNumber, is_active: true, created_at: row.created_at || new Date(), updated_at: new Date(),
        },
      },
      { upsert: true },
    )
    const chair = await db.collection('infusion_chairs').findOne({ code: chairCode })
    if (!chair) throw new Error(`Migration failed: chair ${chairCode} was not created`)

    const mappedStatus = row.status === 'completed'
      ? 'completed'
      : row.status === 'paused' ? 'paused' : row.status === 'assigned' ? 'reserved' : 'active'
    if (mappedStatus !== 'completed') {
      const conflict = await db.collection('infusion_sessions').findOne({
        $or: [
          { chair_id: chair._id },
          ...(row.encounter_id ? [{ encounter_id: row.encounter_id }] : []),
        ],
        status: { $in: ['reserved', 'active', 'paused', 'due'] },
      })
      if (conflict) throw new Error(`Migration conflict: ${chairCode} or encounter already has an active infusion session`)
    }

    const totalSec = Math.max(60, Number(row.total_duration_min || 120) * 60)
    const remainingSec = mappedStatus === 'completed' ? 0 : Math.max(0, Number(row.remaining_min ?? row.total_duration_min ?? 120) * 60)
    const progress = totalSec ? Math.min(100, Math.max(0, Math.round((1 - remainingSec / totalSec) * 100))) : 0
    const phases = (chemoTemplate.phases as Document[]).map((phase, index) => ({
      ...phase,
      effective_duration_sec: index === 1 ? totalSec : Number(phase.duration_min || 0) * 60,
      remaining_sec: index === 1 ? remainingSec : Number(phase.duration_min || 0) * 60,
      status: mappedStatus === 'completed'
        ? 'completed'
        : index === 0
          ? 'completed'
          : index === 1
            ? mappedStatus === 'reserved' ? 'pending' : mappedStatus
            : 'pending',
      ...(index === 1 && row.started_at ? { started_at: row.started_at } : {}),
    }))

    const sessionId = new ObjectId()
    await db.collection('infusion_sessions').insertOne({
      _id: sessionId,
      legacy_session_id: legacyId,
      legacy_source: 'chemo_sessions',
      chair_id: chair._id,
      ...(row.encounter_id ? { encounter_id: row.encounter_id } : {}),
      patient_id: row.patient_id,
      template_id: chemoTemplate._id,
      template_name: String(row.protocol_name || chemoTemplate.name),
      service_kind: 'chemotherapy',
      status: mappedStatus,
      phases,
      current_phase_index: mappedStatus === 'completed' ? phases.length - 1 : 1,
      planned_duration_sec: phases.reduce((sum, phase) => sum + Number(phase.effective_duration_sec || 0), 0),
      remaining_sec: remainingSec,
      progress_percent: progress,
      version: 1,
      ...(row.started_at ? { started_at: row.started_at } : {}),
      ...(mappedStatus === 'reserved' ? { reserved_at: row.created_at || new Date() } : {}),
      ...(row.completed_at ? { completed_at: row.completed_at } : {}),
      created_at: row.created_at || new Date(),
      updated_at: new Date(),
    })
    if (mappedStatus !== 'completed') {
      await db.collection('infusion_chairs').updateOne(
        { _id: chair._id, active_session_id: { $exists: false } },
        { $set: { active_session_id: sessionId, updated_at: new Date() } },
      )
    }
    migrated++
  }
  return migrated
}

async function runCareLinkMigrationsUnlocked(db: Db) {
  await ensureInfusionDefaults(db)
  const hardeningDone = await db.collection('schema_migrations').findOne({ key: WORKFLOW_HARDENING_MIGRATION_ID })
  if (!hardeningDone) {
    const hardenedAt = new Date()
    const [orders, queues, recommendations] = await Promise.all([
      db.collection('orders').updateMany({ version: { $exists: false } }, { $set: { version: 1, updated_at: hardenedAt } }),
      db.collection('queue_items').updateMany({ version: { $exists: false } }, { $set: { version: 1, updated_at: hardenedAt } }),
      db.collection('recommendations').updateMany({ version: { $exists: false } }, { $set: { version: 1 } }),
    ])
    await db.collection('orders').updateMany(
      { 'items.type': 'lab', lab_status: { $exists: false } },
      { $set: { lab_status: 'ordered' } },
    )
    await db.collection('orders').updateMany({ 'items.type': 'lab', specimen_collected_at: { $exists: true }, verified_at: { $exists: false }, analyzed_at: { $exists: false } }, { $set: { lab_status: 'sample_collected' } })
    await db.collection('orders').updateMany({ 'items.type': 'lab', analyzed_at: { $exists: true }, verified_at: { $exists: false } }, { $set: { lab_status: 'results_recorded' } })
    await db.collection('orders').updateMany({ 'items.type': 'lab', verified_at: { $exists: true } }, { $set: { lab_status: 'verified' } })
    await db.collection('orders').updateMany(
      { 'items.type': 'medication', pharmacy_status: { $exists: false } },
      { $set: { pharmacy_status: 'waiting' } },
    )
    await db.collection('orders').updateMany({ pharmacy_status: 'prepared' }, { $set: { pharmacy_status: 'preparing' } })
    await db.collection('schema_migrations').insertOne({
      _id: new ObjectId(), key: WORKFLOW_HARDENING_MIGRATION_ID,
      orders_versioned: orders.modifiedCount,
      queues_versioned: queues.modifiedCount,
      recommendations_versioned: recommendations.modifiedCount,
      completed_at: hardenedAt,
    })
  }
  const done = await db.collection('schema_migrations').findOne({ key: MIGRATION_ID })
  if (done) return done

  const now = new Date()
  const roleResult = await db.collection('users').updateMany(
    { role: 'chemo_staff' },
    {
      $set: {
        role: 'infusion_staff',
        department: 'ศูนย์ให้สารน้ำและยาทางหลอดเลือด',
        station_codes: ['INFUSION'],
        permissions: ['infusion.read', 'infusion.operate', 'queue.read', 'queue.manage'],
        updated_at: now,
      },
    },
  )
  const radiationRoleResult = await db.collection('users').updateMany(
    { role: 'rt_staff' },
    { $set: { is_active: false, retired_at: now, updated_at: now } },
  )

  const stationResult = await db.collection('stations').updateMany(
    { code: { $in: [...LEGACY_INFUSION, ...LEGACY_RADIATION] } },
    { $set: { is_active: false, retired_at: now, updated_at: now } },
  )
  const infusion = STATIONS.find((station) => station.code === 'INFUSION')
  if (infusion) {
    await db.collection('stations').updateOne(
      { code: infusion.code },
      {
        $set: {
          name: infusion.name, floor: infusion.floor, room: infusion.room,
          average_service_min: infusion.averageServiceMin, capacity: 8,
          category: infusion.category, pos: infusion.pos, is_active: true, updated_at: now,
        },
        $setOnInsert: { _id: new ObjectId(), created_at: now },
      },
      { upsert: true },
    )
  }

  const encounters = await db.collection('encounters').find({
    'route.station_code': { $in: [...LEGACY_INFUSION, ...LEGACY_RADIATION] },
  }).toArray()
  for (const encounter of encounters) {
    const route = migrateLegacyRoute(Array.isArray(encounter.route) ? encounter.route : [])
    let currentStation = String(encounter.current_station || '')
    if (LEGACY_INFUSION.has(currentStation)) currentStation = 'INFUSION'
    if (LEGACY_RADIATION.has(currentStation)) {
      const retiredIndex = route.findIndex((step) => String(step.migrated_from || step.station_code) === String(encounter.current_station))
      const nextIndex = route.findIndex((step, index) => index > retiredIndex && step.status === 'pending' && !LEGACY_RADIATION.has(String(step.station_code)))
      if (nextIndex >= 0) {
        route[nextIndex] = { ...route[nextIndex], status: 'in_progress', started_at: now }
        currentStation = String(route[nextIndex].station_code)
        const existingQueue = await db.collection('queue_items').findOne({
          encounter_id: encounter._id,
          station_code: currentStation,
          status: { $in: ['waiting', 'called', 'in_progress'] },
        })
        if (!existingQueue) {
          const queueNo = `${currentStation}-M${encounter._id.toString().slice(-6).toUpperCase()}`
          await db.collection('queue_items').insertOne({
            _id: new ObjectId(), encounter_id: encounter._id, patient_id: encounter.patient_id,
            station_code: currentStation, queue_no: queueNo, status: 'waiting',
            priority: encounter.priority || 'normal', rank: now, call_count: 0, skip_count: 0,
            version: 1,
            migration_reason: 'ข้ามสถานีฉายแสงที่ยกเลิก', created_at: now, updated_at: now,
          })
          encounter.current_queue_no = queueNo
        } else {
          encounter.current_queue_no = existingQueue.queue_no
        }
      } else {
        currentStation = 'DH'
      }
    }
    await db.collection('encounters').updateOne(
      { _id: encounter._id },
      { $set: { route, current_station: currentStation, ...(encounter.current_queue_no ? { current_queue_no: encounter.current_queue_no } : {}), updated_at: now } },
    )
  }
  const infusionQueueResult = await db.collection('queue_items').updateMany(
    { station_code: { $in: [...LEGACY_INFUSION] } },
    { $set: { station_code: 'INFUSION', migrated_at: now, updated_at: now } },
  )
  const radiationQueueResult = await db.collection('queue_items').updateMany(
    { station_code: { $in: [...LEGACY_RADIATION] }, status: { $in: ['waiting', 'called', 'in_progress'] } },
    { $set: { status: 'completed', migration_reason: 'ยกเลิกระบบฉายแสง', completed_at: now, updated_at: now } },
  )

  const sessionsMigrated = await migrateLegacySessions(db)
  const result = {
    _id: new ObjectId(),
    key: MIGRATION_ID,
    roles_migrated: roleResult.modifiedCount,
    radiation_roles_deactivated: radiationRoleResult.modifiedCount,
    stations_retired: stationResult.modifiedCount,
    encounters_migrated: encounters.length,
    infusion_queues_migrated: infusionQueueResult.modifiedCount,
    radiation_queues_skipped: radiationQueueResult.modifiedCount,
    sessions_migrated: sessionsMigrated,
    completed_at: now,
  }
  await db.collection('schema_migrations').insertOne(result)
  return result
}

export async function runCareLinkMigrations(db: Db) {
  const owner = randomUUID()
  const lockId = 'carelink-startup-migrations'
  const staleBefore = new Date(Date.now() - 5 * 60_000)
  let lock = await db.collection('migration_locks').findOneAndUpdate(
    { key: lockId, $or: [{ owner: { $exists: false } }, { started_at: { $lt: staleBefore } }] },
    { $set: { owner, started_at: new Date() }, $setOnInsert: { _id: new ObjectId(), key: lockId } },
    { upsert: true, returnDocument: 'after' },
  ).catch(async (error: unknown) => {
    if ((error as { code?: number }).code !== 11000) throw error
    return db.collection('migration_locks').findOne({ key: lockId })
  })

  if (lock?.owner !== owner) {
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      lock = await db.collection('migration_locks').findOne({ key: lockId })
      if (!lock) return runCareLinkMigrations(db)
    }
    throw new Error('Timed out waiting for CareLink startup migrations')
  }

  try {
    return await runCareLinkMigrationsUnlocked(db)
  } finally {
    await db.collection('migration_locks').deleteOne({ key: lockId, owner })
  }
}
