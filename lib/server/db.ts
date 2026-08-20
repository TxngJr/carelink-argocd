import 'server-only'
import bcrypt from 'bcryptjs'
import {
  Db,
  MongoClient,
  type Collection,
  type CollectionOptions,
  type Document,
  type FindOneAndUpdateOptions,
} from 'mongodb'
import { STATIONS } from '@/lib/stations'

const uri = process.env.MONGO_URI || 'mongodb://localhost:27018/?replicaSet=rs0'
const dbName = process.env.DB_NAME || 'carelink'

// Most CareLink collections use MongoDB's normal ObjectId identifier. Only the
// counter collections intentionally use string `_id` values. Keep the default
// collection schema intact and add a narrow overload for that one operation so
// ObjectId typing remains strict everywhere else in the domain layer.
type CareLinkCollection = Collection<Document> & {
  findOneAndUpdate(
    filter: { _id: string },
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
    db.collection('stations').createIndex({ code: 1 }, { unique: true }),
    db.collection('queue_items').createIndex({ station_code: 1, status: 1, rank: 1 }),
    db.collection('queue_items').createIndex({ encounter_id: 1, station_code: 1, created_at: -1 }),
    db.collection('appointment_requests').createIndex({ patient_id: 1, created_at: -1 }),
    db.collection('notifications').createIndex({ patient_id: 1, created_at: -1 }),
  ])

  const passwordHash = await bcrypt.hash('password123', 10)
  const now = new Date()
  await Promise.all([
    db.collection('users').updateOne(
      { username: 'nurse' },
      { $setOnInsert: { username: 'nurse', password_hash: passwordHash, role: 'nurse', display_name: 'พยาบาล CareLink', department: 'OPD', station_codes: STATIONS.filter((s) => !['PC', 'PC2', 'PC3', 'PC4'].includes(s.code)).map((s) => s.code), is_active: true, created_at: now, updated_at: now } },
      { upsert: true },
    ),
    db.collection('users').updateOne(
      { username: 'doctor' },
      { $setOnInsert: { username: 'doctor', password_hash: passwordHash, role: 'doctor', display_name: 'แพทย์ CareLink', department: 'Oncology', station_codes: ['PC', 'PC2', 'PC3', 'PC4'], is_active: true, created_at: now, updated_at: now } },
      { upsert: true },
    ),
    ...STATIONS.map((station, index) => db.collection('stations').updateOne(
      { code: station.code },
      { $setOnInsert: { code: station.code, name: station.name, type: 'service', floor: station.floor, capacity: station.capacity, average_service_min: station.averageServiceMin, is_active: true, current_open_slots: station.capacity, sort_order: index + 1, created_at: now, updated_at: now } },
      { upsert: true },
    )),
  ])
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
