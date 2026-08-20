export type StationDefinition = {
  code: string
  name: string
  floor: string
  averageServiceMin: number
  capacity: number
}

export const STATIONS: StationDefinition[] = [
  { code: 'NPR', name: 'ลงทะเบียนผู้ป่วย', floor: 'ชั้น 1', averageServiceMin: 8, capacity: 12 },
  { code: 'EV', name: 'ตรวจสอบสิทธิการรักษา', floor: 'ชั้น 1', averageServiceMin: 8, capacity: 10 },
  { code: 'VM', name: 'วัดสัญญาณชีพ', floor: 'ชั้น 1', averageServiceMin: 7, capacity: 10 },
  { code: 'MHT', name: 'ซักประวัติทางการแพทย์', floor: 'ชั้น 1', averageServiceMin: 10, capacity: 8 },
  { code: 'PC', name: 'ห้องตรวจแพทย์ 1', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'PC2', name: 'ห้องตรวจแพทย์ 2', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'PC3', name: 'ห้องตรวจแพทย์ 3', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'PC4', name: 'ห้องตรวจแพทย์ 4', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'XR', name: 'รังสีวินิจฉัย', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 8 },
  { code: 'LAB', name: 'ห้องปฏิบัติการ', floor: 'ชั้น 1', averageServiceMin: 12, capacity: 12 },
  { code: 'HEM', name: 'คลินิกโลหิตวิทยา', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'SUR', name: 'คลินิกศัลยกรรมทั่วไป', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'GYN', name: 'คลินิกมะเร็งนรีเวช', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'IR', name: 'งานรังสีร่วมรักษา', floor: 'ชั้น 2', averageServiceMin: 18, capacity: 5 },
  { code: 'CHEMO', name: 'คลินิกเคมีบำบัด', floor: 'ชั้น 3', averageServiceMin: 20, capacity: 10 },
  { code: 'ENT', name: 'คลินิกหู คอ จมูก', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'BRA', name: 'รังสีรักษาระยะใกล้', floor: 'ชั้น 3', averageServiceMin: 20, capacity: 5 },
  { code: 'RT', name: 'งานรังสีรักษา/ฉายแสง', floor: 'ชั้น 3', averageServiceMin: 20, capacity: 8 },
  { code: 'OST', name: 'งานออสโตมีและดูแลแผล', floor: 'ชั้น 2', averageServiceMin: 15, capacity: 6 },
  { code: 'RC', name: 'พบแพทย์หลังผลตรวจ', floor: 'ชั้น 2', averageServiceMin: 12, capacity: 6 },
  { code: 'TD', name: 'วินิจฉัยและวางแผนการรักษา', floor: 'ชั้น 2', averageServiceMin: 20, capacity: 5 },
  { code: 'HA', name: 'รับไว้รักษา', floor: 'ชั้น 1', averageServiceMin: 12, capacity: 6 },
  { code: 'PD', name: 'รับยา', floor: 'ชั้น 1', averageServiceMin: 10, capacity: 12 },
  { code: 'DH', name: 'กลับบ้าน', floor: 'ชั้น 1', averageServiceMin: 3, capacity: 20 },
  { code: 'IPW', name: 'หอผู้ป่วยใน', floor: 'อาคารผู้ป่วยใน', averageServiceMin: 10, capacity: 10 },
]

export const PC_CODES = new Set(['PC', 'PC2', 'PC3', 'PC4'])
export const BASE_ROUTE = ['NPR', 'EV', 'VM', 'MHT'] as const
export const OPTIONAL_ROUTE_CODES = new Set([
  'XR', 'LAB', 'HEM', 'SUR', 'GYN', 'IR', 'CHEMO', 'ENT', 'BRA', 'RT', 'OST', 'RC', 'TD', 'PD',
])

export const stationMap = new Map(STATIONS.map((station) => [station.code, station]))

export function buildDoctorRoute(selected: string[], terminal: 'DH' | 'IPW') {
  const unique = new Set(selected)
  if (unique.size !== selected.length) throw new Error('ห้ามเลือก Station ซ้ำ')
  for (const code of selected) {
    if (!OPTIONAL_ROUTE_CODES.has(code)) throw new Error('Station หลังห้องตรวจไม่ถูกต้อง')
  }
  return terminal === 'IPW' ? [...selected, 'HA', 'IPW'] : [...selected, 'DH']
}
