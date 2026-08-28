export type StationCategory =
  | 'admin'
  | 'clinical'
  | 'lab'
  | 'imaging'
  | 'treatment'
  | 'pharmacy'
  | 'exit'

export type StationDefinition = {
  code: string
  name: string
  floor: string
  room?: string
  averageServiceMin: number
  capacity: number
  category: StationCategory
  pos: [number, number] // Spatial canvas coordinate [x, y]
  description?: string
}

export const STATIONS: StationDefinition[] = [
  // Floor 1: Frontline Intake & General
  { code: 'NPR', name: 'ลงทะเบียนผู้ป่วย', floor: 'ชั้น 1', room: 'เคาน์เตอร์ 1-4', averageServiceMin: 8, capacity: 12, category: 'admin', pos: [70, 320], description: 'ตรวจสอบประวัติ ออกบัตรคิว' },
  { code: 'EV', name: 'ตรวจสอบสิทธิการรักษา', floor: 'ชั้น 1', room: 'เคาน์เตอร์ 5-8', averageServiceMin: 8, capacity: 10, category: 'admin', pos: [185, 320], description: 'เช็กสิทธิบัตรทอง/ประกันสังคม/กรมบัญชีกลาง' },
  { code: 'VM', name: 'วัดสัญญาณชีพ', floor: 'ชั้น 1', room: 'ห้อง 101', averageServiceMin: 7, capacity: 10, category: 'clinical', pos: [300, 320], description: 'วัดความดัน ชีพจร ออกซิเจน น้ำหนัก ส่วนสูง' },
  { code: 'MHT', name: 'ซักประวัติทางการแพทย์', floor: 'ชั้น 1', room: 'ห้อง 102-105', averageServiceMin: 10, capacity: 8, category: 'clinical', pos: [415, 320], description: 'คัดกรองอาการ ประเมินความเร่งด่วน ESI' },
  { code: 'LAB', name: 'ห้องปฏิบัติการชันสูตร', floor: 'ชั้น 1', room: 'ห้องปฏิบัติการกลาง', averageServiceMin: 12, capacity: 15, category: 'lab', pos: [650, 165], description: 'เจาะเลือด ตรวจปัสสาวะ วิเคราะห์ผลแล็บ' },
  { code: 'LABC', name: 'จุดเจาะเลือด/เก็บสิ่งส่งตรวจ', floor: 'ชั้น 1', room: 'ห้อง 108', averageServiceMin: 6, capacity: 12, category: 'lab', pos: [650, 165], description: 'เก็บตัวอย่างสิ่งส่งตรวจ' },
  { code: 'PD', name: 'ห้องจ่ายยา', floor: 'ชั้น 1', room: 'ช่องบริการ 1-6', averageServiceMin: 10, capacity: 14, category: 'pharmacy', pos: [1240, 320], description: 'ตรวจสอบใบสั่งยา จัดยา ให้คำแนะนำการใช้ยา' },
  { code: 'HA', name: 'ประสานงานรับไว้รักษา', floor: 'ชั้น 1', room: 'ห้องส่งต่อ', averageServiceMin: 12, capacity: 6, category: 'admin', pos: [1280, 420], description: 'เตรียมเอกสารนอนโรงพยาบาล' },
  { code: 'DH', name: 'กลับบ้าน', floor: 'ชั้น 1', room: 'ทางออกหลัก', averageServiceMin: 3, capacity: 25, category: 'exit', pos: [1360, 320], description: 'เสร็จสิ้นกระบวนการบริการวันนี้' },

  // Floor 2: Consultations & Imaging
  { code: 'PC', name: 'ห้องตรวจแพทย์ 1', floor: 'ชั้น 2', room: 'ห้องตรวจ 201', averageServiceMin: 15, capacity: 6, category: 'clinical', pos: [530, 265], description: 'ตรวจวินิจฉัยและวางแผนการรักษา' },
  { code: 'PC2', name: 'ห้องตรวจแพทย์ 2', floor: 'ชั้น 2', room: 'ห้องตรวจ 202', averageServiceMin: 15, capacity: 6, category: 'clinical', pos: [530, 320], description: 'ตรวจวินิจฉัยและวางแผนการรักษา' },
  { code: 'PC3', name: 'ห้องตรวจแพทย์ 3', floor: 'ชั้น 2', room: 'ห้องตรวจ 203', averageServiceMin: 15, capacity: 6, category: 'clinical', pos: [530, 375], description: 'ตรวจวินิจฉัยและวางแผนการรักษา' },
  { code: 'PC4', name: 'ห้องตรวจแพทย์ 4', floor: 'ชั้น 2', room: 'ห้องตรวจ 204', averageServiceMin: 15, capacity: 6, category: 'clinical', pos: [530, 430], description: 'ตรวจวินิจฉัยและวางแผนการรักษา' },
  { code: 'XR', name: 'รังสีวินิจฉัย (X-Ray)', floor: 'ชั้น 2', room: 'ห้องรังสี 210', averageServiceMin: 15, capacity: 8, category: 'imaging', pos: [650, 70], description: 'เอกซเรย์ทรวงอก กระดูก ข้อ' },
  { code: 'CT', name: 'เอกซเรย์คอมพิวเตอร์ (CT)', floor: 'ชั้น 2', room: 'ห้อง CT Scan', averageServiceMin: 20, capacity: 6, category: 'imaging', pos: [770, 70], description: 'CT Scan อวัยวะภายใน' },
  { code: 'MRI', name: 'ตรวจคลื่นแม่เหล็กไฟฟ้า (MRI)', floor: 'ชั้น 2', room: 'ห้อง MRI', averageServiceMin: 35, capacity: 4, category: 'imaging', pos: [890, 70], description: 'MRI ตรวจวินิจฉัยอย่างละเอียด' },
  { code: 'IR', name: 'งานรังสีร่วมรักษา', floor: 'ชั้น 2', room: 'ห้อง IR Suite', averageServiceMin: 25, capacity: 5, category: 'imaging', pos: [1010, 70], description: 'หัตถการทางรังสีวิทยา' },
  { code: 'HEM', name: 'คลินิกโลหิตวิทยา', floor: 'ชั้น 2', room: 'ห้อง 215', averageServiceMin: 15, capacity: 6, category: 'clinical', pos: [650, 390], description: 'ตรวจรักษาโรคเลือดและไขกระดูก' },
  { code: 'SUR', name: 'คลินิกศัลยกรรม', floor: 'ชั้น 2', room: 'ห้อง 216', averageServiceMin: 15, capacity: 6, category: 'clinical', pos: [650, 470], description: 'ตรวจและนัดผ่าตัด' },
  { code: 'GYN', name: 'คลินิกมะเร็งนรีเวช', floor: 'ชั้น 2', room: 'ห้อง 218', averageServiceMin: 15, capacity: 6, category: 'clinical', pos: [770, 470], description: 'ตรวจเฉพาะทางมะเร็งนรีเวช' },
  { code: 'ENT', name: 'คลินิกหู คอ จมูก', floor: 'ชั้น 2', room: 'ห้อง 220', averageServiceMin: 15, capacity: 6, category: 'clinical', pos: [890, 470], description: 'ตรวจโสต ศอ นาสิกวิทยา' },
  { code: 'OST', name: 'งานออสโตมีและดูแลแผล', floor: 'ชั้น 2', room: 'ห้องดูแลแผล 225', averageServiceMin: 18, capacity: 6, category: 'clinical', pos: [1010, 470], description: 'ล้างแผล ดูแลท่อและทวารเทียม' },
  { code: 'RC', name: 'พบแพทย์หลังผลตรวจ', floor: 'ชั้น 2', room: 'ห้องตรวจ 230', averageServiceMin: 12, capacity: 8, category: 'clinical', pos: [1020, 320], description: 'ฟังผลแล็บ/เอกซเรย์ และสรุปการรักษา' },
  { code: 'TD', name: 'วินิจฉัยและวางแผนการรักษา', floor: 'ชั้น 2', room: 'ห้องประชุมแผนก', averageServiceMin: 20, capacity: 5, category: 'clinical', pos: [1130, 320], description: 'Tumor Board และแผนการรักษาระยะยาว' },

  // Floor 3: Specialized Treatments
  { code: 'CHEMO', name: 'คลินิกเคมีบำบัด', floor: 'ชั้น 3', room: 'ศูนย์เคมีบำบัด', averageServiceMin: 30, capacity: 12, category: 'treatment', pos: [830, 420], description: 'ให้ยาเคมีบำบัดแบบ Day Care' },
  { code: 'CHEMO_PRE', name: 'เตรียมความพร้อมเคมีบำบัด', floor: 'ชั้น 3', room: 'ห้อง 301', averageServiceMin: 15, capacity: 8, category: 'treatment', pos: [770, 420], description: 'ตรวจผลเลือดและให้ยาแก้แพ้ก่อนเคมีบำบัด' },
  { code: 'CHEMO_INF', name: 'ห้องให้ยาเคมีบำบัด', floor: 'ชั้น 3', room: 'Day Care Lounge', averageServiceMin: 45, capacity: 12, category: 'treatment', pos: [890, 420], description: 'เก้าอี้และเตียงให้ยาเคมีบำบัด' },
  { code: 'BRA', name: 'รังสีรักษาระยะใกล้ (Brachytherapy)', floor: 'ชั้น 3', room: 'ห้องใส่แร่ 310', averageServiceMin: 25, capacity: 5, category: 'treatment', pos: [1010, 560], description: 'การใส่แร่รักษาเฉพาะจุด' },
  { code: 'RT_SIM', name: 'จำลองการฉายรังสี (RT-Sim)', floor: 'ชั้น 3', room: 'ห้อง CT Simulator', averageServiceMin: 30, capacity: 4, category: 'treatment', pos: [650, 560], description: 'ทำแผนที่และหน้ากากจำลองการฉายรังสี' },
  { code: 'RT_L1', name: 'เครื่องฉายรังสี Linac 1', floor: 'ชั้น 3', room: 'ห้องเครื่อง Linac 1', averageServiceMin: 20, capacity: 6, category: 'treatment', pos: [770, 560], description: 'เครื่องเร่งอนุภาคฉายรังสีห้อง 1' },
  { code: 'RT_L2', name: 'เครื่องฉายรังสี Linac 2', floor: 'ชั้น 3', room: 'ห้องเครื่อง Linac 2', averageServiceMin: 20, capacity: 6, category: 'treatment', pos: [890, 560], description: 'เครื่องเร่งอนุภาคฉายรังสีห้อง 2' },

  // Inpatient / Exit
  { code: 'IPW', name: 'หอผู้ป่วยใน', floor: 'อาคารผู้ป่วยใน', room: 'วอร์ด 4-7', averageServiceMin: 10, capacity: 20, category: 'exit', pos: [1360, 420], description: 'รับตัวเข้านอนพักรักษาในโรงพยาบาล' },
]

export const PC_CODES = new Set(['PC', 'PC2', 'PC3', 'PC4'])
export const BASE_ROUTE = ['NPR', 'EV', 'VM', 'MHT'] as const
export const OPTIONAL_ROUTE_CODES = new Set([
  'XR', 'CT', 'MRI', 'IR', 'LAB', 'LABC', 'HEM', 'SUR', 'GYN', 'ENT', 'OST',
  'CHEMO', 'CHEMO_PRE', 'CHEMO_INF', 'BRA', 'RT_SIM', 'RT_L1', 'RT_L2', 'RC', 'TD', 'PD',
])

export const stationMap = new Map(STATIONS.map((station) => [station.code, station]))

export function getStation(code: string): StationDefinition {
  return stationMap.get(code) || {
    code,
    name: code,
    floor: 'ชั้น 1',
    averageServiceMin: 10,
    capacity: 10,
    category: 'clinical',
    pos: [500, 300],
  }
}

export function buildDoctorRoute(selected: string[], terminal: 'DH' | 'IPW') {
  const unique = new Set(selected)
  if (unique.size !== selected.length) throw new Error('ห้ามเลือก Station ซ้ำ')
  for (const code of selected) {
    if (!OPTIONAL_ROUTE_CODES.has(code)) throw new Error(`Station ${code} หลังห้องตรวจไม่ถูกต้อง`)
  }
  return terminal === 'IPW' ? [...selected, 'HA', 'IPW'] : [...selected, 'DH']
}
