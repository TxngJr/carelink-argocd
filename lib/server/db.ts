import 'server-only'
import {
  Db,
  MongoClient,
  type Collection,
  type CollectionOptions,
  type Document,
  type FindOneAndUpdateOptions,
} from 'mongodb'
import { runDatabaseSeed } from '@/lib/server/seed'
import { runCareLinkMigrations } from '@/lib/server/migrations'
import { developmentLoginEnabled, ensureDevelopmentAccounts } from '@/lib/server/development-accounts'

const uri = process.env.MONGO_URI || 'mongodb://localhost:27018/?replicaSet=rs0&directConnection=true'
const dbName = process.env.DB_NAME || 'carelink'

type CareLinkCollection = Collection<Document> & {
  findOneAndUpdate(
    filter: { _id: string } | Document,
    update: Document,
    options?: FindOneAndUpdateOptions,
  ): Promise<Document | null>
}

type CareLinkDb = Omit<Db, 'collection'> & {
  collection(name: string, options?: CollectionOptions): CareLinkCollection
}

type GlobalMongo = typeof globalThis & {
  __carelinkClient?: MongoClient
  __carelinkDbPromise?: Promise<Db>
}

const globalMongo = globalThis as GlobalMongo

function client() {
  if (!globalMongo.__carelinkClient) {
    globalMongo.__carelinkClient = new MongoClient(uri, {
      maxPoolSize: 20,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
    })
  }
  return globalMongo.__carelinkClient
}

async function initialize(db: Db) {
  await Promise.all([
    db.collection('users').createIndex({ username: 1 }, { unique: true }),
    db.collection('users').createIndex({ is_development_account: 1, development_account_order: 1 }),
    db.collection('patients').createIndex({ phone: 1 }, { unique: true, sparse: true }),
    db.collection('patients').createIndex({ hn: 1 }, { unique: true }),
    db.collection('stations').createIndex({ code: 1 }, { unique: true }),
    db.collection('queue_items').createIndex({ station_code: 1, status: 1, rank: 1 }),
    db.collection('queue_items').createIndex({ encounter_id: 1, station_code: 1, created_at: -1 }),
    db.collection('appointment_requests').createIndex({ patient_id: 1, created_at: -1 }),
    db.collection('notifications').createIndex({ patient_id: 1, created_at: -1 }),
    db.collection('orders').createIndex({ encounter_id: 1, created_at: -1 }),
    db.collection('vitals').createIndex({ encounter_id: 1, created_at: -1 }),
    db.collection('clinical_notes').createIndex({ encounter_id: 1 }),
    db.collection('chemo_sessions').createIndex({ patient_id: 1, status: 1 }),
    db.collection('infusion_chairs').createIndex({ code: 1 }, { unique: true }),
    db.collection('infusion_templates').createIndex({ code: 1 }, { unique: true }),
    db.collection('infusion_sessions').createIndex({ chair_id: 1, status: 1 }),
    db.collection('infusion_sessions').createIndex({ encounter_id: 1, status: 1 }),
    db.collection('infusion_sessions').createIndex(
      { chair_id: 1 },
      { unique: true, name: 'one_active_infusion_per_chair', partialFilterExpression: { status: { $in: ['reserved', 'active', 'paused', 'due'] } } },
    ),
    db.collection('infusion_sessions').createIndex(
      { encounter_id: 1 },
      { unique: true, name: 'one_active_infusion_per_encounter', partialFilterExpression: { encounter_id: { $exists: true }, status: { $in: ['reserved', 'active', 'paused', 'due'] } } },
    ),
    db.collection('infusion_sessions').createIndex({ legacy_session_id: 1 }, { unique: true, sparse: true }),
    db.collection('infusion_events').createIndex({ session_id: 1, created_at: -1 }),
    db.collection('infusion_events').createIndex({ created_at: -1 }),
    db.collection('schema_migrations').createIndex({ key: 1 }, { unique: true }),
    db.collection('migration_locks').createIndex({ key: 1 }, { unique: true }),
    db.collection('resource_limits').createIndex({ key: 1 }, { unique: true }),
    db.collection('triage_sessions').createIndex({ patient_id: 1, status: 1 }),
    db.collection('previsits').createIndex({ patient_id: 1 }),
    db.collection('help_requests').createIndex({ status: 1, created_at: -1 }),
    db.collection('recommendations').createIndex({ status: 1, created_at: -1 }),
    db.collection('recommendation_decisions').createIndex({ recommendation_id: 1, decided_at: -1 }),
    db.collection('clinical_order_events').createIndex({ order_id: 1, created_at: -1 }),
    db.collection('audit_requests').createIndex({ demo_session_id: 1, created_at: -1 }),
    db.collection('rate_limits').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    db.collection('realtime_events').createIndex({ created_at: 1 }, { expireAfterSeconds: 86_400 }),
    db.collection('realtime_events').createIndex({ id: 1 }, { unique: true }),
  ])
  // Passing this initialized Db explicitly avoids the recursive getDb() call
  // that previously deadlocked startup while still completing data setup
  // before the application reports readiness.
  await runDatabaseSeed(false, db).catch((err) => console.warn('Auto-seed check note:', err?.message || err))
  await runCareLinkMigrations(db)
  if (developmentLoginEnabled()) await ensureDevelopmentAccounts(db)
}

export async function getDb(): Promise<CareLinkDb> {
  if (!globalMongo.__carelinkDbPromise) {
    const dbPromise = (async () => {
      const mongo = client()
      await mongo.connect()
      const db = mongo.db(dbName)
      await initialize(db)
      return db
    })()
    // Keep the shared connection promise focused on connectivity/index setup. If
    // connecting fails (for example while the Mongo replica set is electing),
    // clear it so the next request/probe can retry instead of caching a rejection.
    globalMongo.__carelinkDbPromise = dbPromise.catch((error) => {
      globalMongo.__carelinkDbPromise = undefined
      throw error
    })
  }
  return globalMongo.__carelinkDbPromise as Promise<CareLinkDb>
}

export async function pingDb() {
  const db = await getDb()
  await db.command({ ping: 1 })
  return true
}
