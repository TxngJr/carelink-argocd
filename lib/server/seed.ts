import 'server-only'
import bcrypt from 'bcryptjs'
import { ObjectId, type Db } from 'mongodb'
import { getDb } from '@/lib/server/db'
import { STATIONS } from '@/lib/stations'
import { ensureInfusionDefaults } from '@/lib/server/migrations'
import { DEVELOPMENT_ACCOUNTS } from '@/lib/development-accounts'

export async function runDatabaseSeed(force = false, providedDb?: Db) {
  const db = providedDb || await getDb()

  const existingUsers = await db.collection('users').countDocuments()
  if (existingUsers > 0 && !force) {
    return { status: 'skipped', message: 'Database already has users' }
  }

  const now = new Date()
  const defaultPassword = await bcrypt.hash(process.env.DEVELOPMENT_LOGIN_PASSWORD || 'password123', 10)

  // 1. Seed Stations
  await db.collection('stations').deleteMany({})
  const stationDocs = STATIONS.map((s) => ({
    _id: new ObjectId(),
    code: s.code,
    name: s.name,
    floor: s.floor,
    room: s.room || '',
    average_service_min: s.averageServiceMin,
    capacity: s.capacity,
    category: s.category,
    pos: s.pos,
    created_at: now,
    updated_at: now,
  }))
  await db.collection('stations').insertMany(stationDocs)

  // 2. Seed Staff Accounts
  for (const staff of DEVELOPMENT_ACCOUNTS) {
    await db.collection('users').updateOne(
      { username: staff.username },
      {
        $set: {
          username: staff.username,
          password_hash: defaultPassword,
          role: staff.role,
          display_name: staff.display_name,
          department: staff.department,
          station_codes: staff.station_codes,
          permissions: staff.permissions,
          is_active: true,
          is_development_account: true,
          development_account_order: staff.order,
          updated_at: now,
        },
        $setOnInsert: { _id: new ObjectId(), created_at: now },
      },
      { upsert: true }
    )
  }

  // 3. Seed Demo Patients & Encounters
  const demoPatients = [
    { hn: 'HN000101', name: 'นายสมชาย ใจดี', phone: '0812345678', gender: 'ชาย', age: 48, birth: '1978-05-12', insurance: 'UC (บัตรทอง)', allergies: ['Penicillin'], complaint: 'ตรวจติดตามก้อนที่ลำคอและอาการกลืนลำบาก' },
    { hn: 'HN000102', name: 'นางสุดา รักสุข', phone: '0823456789', gender: 'หญิง', age: 54, birth: '1972-11-20', insurance: 'SSS (ประกันสังคม)', allergies: [], complaint: 'นัดให้ยาเคมีบำบัด Cycle 3' },
    { hn: 'HN000103', name: 'นายวิชัย เกรียงไกร', phone: '0834567890', gender: 'ชาย', age: 62, birth: '1964-03-15', insurance: 'CSMBS (ข้าราชการ)', allergies: ['Aspirin'], complaint: 'นัดติดตามอาการและทบทวนแผนการรักษา' },
    { hn: 'HN000104', name: 'นางสาวพิมพ์ใจ ทองดี', phone: '0845678901', gender: 'หญิง', age: 39, birth: '1987-08-04', insurance: 'UC (บัตรทอง)', allergies: [], complaint: 'ปวดท้องน้อยเรื้อรัง อ่อนเพลีย' },
    { hn: 'HN000105', name: 'นายประเสริฐ ชัยชนะ', phone: '0856789012', gender: 'ชาย', age: 58, birth: '1968-09-28', insurance: 'CSMBS (ข้าราชการ)', allergies: ['Sulfa'], complaint: 'มีไข้สูง 38.5 องศา หนาวสั่น หลังทำเคมีบำบัด 5 วัน' },
  ]

  for (let i = 0; i < demoPatients.length; i++) {
    const p = demoPatients[i]
    let patientDoc = await db.collection('patients').findOne({ hn: p.hn })
    if (!patientDoc) {
      const patientId = new ObjectId()
      patientDoc = {
        _id: patientId,
        hn: p.hn,
        national_id_masked: `1-1002-00${i}4-55-6`,
        display_name: p.name,
        gender: p.gender,
        age: p.age,
        birth_date: new Date(p.birth),
        phone: p.phone,
        province: 'กรุงเทพมหานคร',
        is_out_province: false,
        insurance_type: p.insurance,
        eligibility_status: 'valid',
        allergies: p.allergies,
        chronic_conditions: ['Hypertension'],
        created_at: now,
        updated_at: now,
      }
      await db.collection('patients').insertOne(patientDoc)

      // Create Patient Login User
      await db.collection('users').updateOne(
        { username: p.phone },
        {
          $set: {
            username: p.phone,
            password_hash: defaultPassword,
            role: 'patient',
            display_name: p.name,
            patient_id: patientId,
            is_active: true,
            updated_at: now,
          },
          $setOnInsert: { _id: new ObjectId(), created_at: now },
        },
        { upsert: true }
      )
    }
  }

  // 4. Seed configurable infusion resources. Legacy chemo/radiation collections are never deleted.
  await ensureInfusionDefaults(db as unknown as Db)

  // 5. Seed Flow Engine Recommendations
  await db.collection('recommendations').deleteMany({})
  await db.collection('recommendations').insertOne({
    _id: new ObjectId(),
    station_code: 'VM',
    station_name: 'วัดสัญญาณชีพ',
    type: 'open_counter',
    title: 'เปิดจุดวัดสัญญาณชีพเพิ่ม 1 ช่อง',
    reason: 'มีผู้ป่วยรอวัดสัญญาณชีพสะสม 6 คน เกินเกณฑ์เฉลี่ย 15 นาที',
    action_label: 'เปิดเคาน์เตอร์ VM-2',
    status: 'pending',
    created_at: now,
  })

  return { status: 'success', message: `เตรียมข้อมูลสำเร็จ: บัญชีเจ้าหน้าที่ ${DEVELOPMENT_ACCOUNTS.length} บัญชี จุดบริการ ${STATIONS.length} จุด และเก้าอี้ให้สารน้ำ 8 ตัว` }
}
