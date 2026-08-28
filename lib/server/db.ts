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

const uri = process.env.MONGO_URI || 'mongodb://localhost:27018/?replicaSet=rs0'
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
    db.collection('radiation_sessions').createIndex({ machine_code: 1, scheduled_time: 1 }),
    db.collection('triage_sessions').createIndex({ patient_id: 1, status: 1 }),
    db.collection('previsits').createIndex({ patient_id: 1 }),
    db.collection('help_requests').createIndex({ status: 1, created_at: -1 }),
    db.collection('recommendations').createIndex({ status: 1, created_at: -1 }),
  ])

  // Seed on startup if database is empty
  await runDatabaseSeed(false).catch((err) => console.warn('Auto-seed check note:', err?.message || err))
}

export async function getDb(): Promise<CareLinkDb> {
  if (!globalMongo.__carelinkDbPromise) {
    globalMongo.__carelinkDbPromise = (async () => {
      const mongo = client()
      await mongo.connect()
      const db = mongo.db(dbName)
      await initialize(db)
      return db
    })()
  }
  return globalMongo.__carelinkDbPromise as Promise<CareLinkDb>
}

export async function pingDb() {
  const db = await getDb()
  await db.command({ ping: 1 })
  return true
}
