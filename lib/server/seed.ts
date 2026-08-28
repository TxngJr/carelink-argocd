import 'server-only'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/server/db'
import { STATIONS } from '@/lib/stations'

export async function runDatabaseSeed(force = false) {
  const db = await getDb()

  const existingUsers = await db.collection('users').countDocuments()
  if (existingUsers > 0 && !force) {
    return { status: 'skipped', message: 'Database already has users' }
  }

  const now = new Date()
  const defaultPassword = await bcrypt.hash('password123', 10)

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
  const staffList = [
    { username: 'admin', display_name: 'ผู้ดูแลระบบกลาง', role: 'admin', department: 'ฝ่ายบริหาร', station_codes: ['*'], permissions: ['*'] },
    { username: 'manager', display_name: 'นริศรา จัดการกระบวนงาน', role: 'manager', department: 'ศูนย์บริหารจัดการเตียงและคิว', station_codes: ['*'], permissions: ['dashboard.read', 'dashboard.manage', 'patients.read', 'flow.read', 'flow.manage', 'insights.read'] },
    { username: 'nurse', display_name: 'พว. กนกพร ชำนาญการ', role: 'nurse', department: 'ผู้ป่วยนอก OPD', station_codes: ['NPR', 'EV', 'VM', 'MHT'], permissions: ['intake.read', 'intake.write', 'intake.escalate', 'vitals.read', 'vitals.write', 'registration.read', 'registration.advance', 'queue.read', 'queue.manage'] },
    { username: 'doctor', display_name: 'นพ. วรเมธ สถิตย์ธรรม', role: 'doctor', department: 'อายุรกรรมมะเร็งวิทยา', station_codes: ['PC', 'PC2', 'PC3', 'PC4'], permissions: ['physician.read', 'physician.write', 'orders.create', 'routes.change', 'queue.read', 'queue.manage'] },
    { username: 'registration', display_name: 'สมศรี มีน้ำใจ', role: 'registration', department: 'เวชระเบียนและตรวจสิทธิ', station_codes: ['NPR', 'EV'], permissions: ['registration.read', 'registration.advance', 'patients.read', 'patients.write', 'queue.read', 'queue.manage'] },
    { username: 'vitals', display_name: 'พว. ปิยะมาศ สดใส', role: 'vitals_staff', department: 'จุดคัดกรองและสัญญาณชีพ', station_codes: ['VM'], permissions: ['vitals.read', 'vitals.write', 'queue.read', 'queue.manage'] },
    { username: 'lab', display_name: 'ทนพ. ธนกฤต วิทยาศาสตร์', role: 'lab_staff', department: 'ห้องปฏิบัติการชันสูตร', station_codes: ['LAB', 'LABC'], permissions: ['lab.read', 'lab.collect', 'lab.result', 'lab.verify', 'queue.read', 'queue.manage'] },
    { username: 'pharmacy', display_name: 'ภก. เกริกเกียรติ บริบาล', role: 'pharmacy_staff', department: 'เภสัชกรรมคลินิก', station_codes: ['PD'], permissions: ['pharmacy.read', 'pharmacy.prepare', 'pharmacy.verify', 'pharmacy.dispense', 'queue.read', 'queue.manage'] },
    { username: 'chemo', display_name: 'พว. ภัทรวดี ดูแลดี', role: 'chemo_staff', department: 'ศูนย์เคมีบำบัด', station_codes: ['CHEMO', 'CHEMO_PRE', 'CHEMO_INF'], permissions: ['chemo.read', 'chemo.assign-chair', 'chemo.progress', 'queue.read', 'queue.manage'] },
    { username: 'radiation', display_name: 'นักรังสี. อลงกรณ์ ส่องสว่าง', role: 'rt_staff', department: 'รังสีรักษาและมะเร็งวิทยา', station_codes: ['RT_SIM', 'RT_L1', 'RT_L2', 'BRA'], permissions: ['radiation.read', 'radiation.reschedule', 'radiation.complete', 'queue.read', 'queue.manage'] },
  ]

  for (const staff of staffList) {
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
    { hn: 'HN000103', name: 'นายวิชัย เกรียงไกร', phone: '0834567890', gender: 'ชาย', age: 62, birth: '1964-03-15', insurance: 'CSMBS (ข้าราชการ)', allergies: ['Aspirin'], complaint: 'นัดฉายรังสีบริเวณทรวงอก Fraction 12/25' },
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

  // 4. Seed Active Chemo Chairs
  await db.collection('chemo_sessions').deleteMany({})
  const patientSuda = await db.collection('patients').findOne({ hn: 'HN000102' })
  if (patientSuda) {
    await db.collection('chemo_sessions').insertOne({
      _id: new ObjectId(),
      patient_id: patientSuda._id,
      chair_no: 2,
      protocol_name: 'FOLFOX-6 (Cycle 3)',
      cycle_no: 3,
      total_cycles: 6,
      premed_completed: true,
      progress_percent: 65,
      total_duration_min: 120,
      remaining_min: 42,
      nurse_call: false,
      status: 'infusing',
      started_at: new Date(Date.now() - 78 * 60000),
      created_at: now,
    })
  }

  // 5. Seed Radiation Sessions
  await db.collection('radiation_sessions').deleteMany({})
  const patientWichai = await db.collection('patients').findOne({ hn: 'HN000103' })
  if (patientWichai) {
    await db.collection('radiation_sessions').insertOne({
      _id: new ObjectId(),
      patient_id: patientWichai._id,
      machine_code: 'RT_L1',
      machine_name: 'เครื่องเร่งอนุภาคฉายรังสีห้อง 1 (Linac 1)',
      fraction_no: 12,
      total_fractions: 25,
      dose_gy: 2.0,
      scheduled_time: new Date(Date.now() + 30 * 60000).toISOString(),
      status: 'arrived',
      notes: 'ฉายบริเวณ mediastinum',
      created_at: now,
    })
  }

  // 6. Seed Flow Engine Recommendations
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

  return { status: 'success', message: 'Seed data completed with 10 staff roles, 24 stations, and sample patient flows' }
}
