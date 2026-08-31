import type { Role } from '@/lib/types'

type DevelopmentRoleDefinition = {
  role: Role
  title: string
  duty: string
  department: string
  station_codes: string[]
  permissions: string[]
  users: Array<{ username: string; display_name: string }>
}

export type DevelopmentAccount = {
  username: string
  display_name: string
  role: Role
  role_label: string
  duty: string
  department: string
  order: number
}

export const DEVELOPMENT_ROLE_DEFINITIONS: DevelopmentRoleDefinition[] = [
  {
    role: 'admin',
    title: 'ผู้ดูแลระบบ',
    duty: 'ดูแลบัญชีผู้ใช้ สิทธิ์ การตั้งค่า และเข้าถึงทุกส่วนของระบบ',
    department: 'ฝ่ายบริหารระบบสารสนเทศ',
    station_codes: ['*'],
    permissions: ['*'],
    users: [
      { username: 'admin', display_name: 'ผู้ดูแลระบบกลาง' },
      { username: 'admin02', display_name: 'วิทยา ดูแลระบบ' },
      { username: 'admin03', display_name: 'ชนิดา ความปลอดภัย' },
      { username: 'admin04', display_name: 'ปกรณ์ สนับสนุนระบบ' },
    ],
  },
  {
    role: 'manager',
    title: 'ผู้จัดการ',
    duty: 'ติดตามภาพรวม คิว ทรัพยากร และตั้งค่าศูนย์ให้สารน้ำ',
    department: 'ศูนย์บริหารจัดการเตียงและคิว',
    station_codes: ['*'],
    permissions: ['dashboard.read', 'dashboard.manage', 'patients.read', 'flow.read', 'flow.manage', 'insights.read'],
    users: [
      { username: 'manager', display_name: 'นริศรา จัดการกระบวนงาน' },
      { username: 'manager02', display_name: 'กิตติพงศ์ บริหารคิว' },
      { username: 'manager03', display_name: 'อรทัย ประสานงาน' },
      { username: 'manager04', display_name: 'สุเมธ วางแผนงาน' },
    ],
  },
  {
    role: 'registration',
    title: 'เจ้าหน้าที่ลงทะเบียน',
    duty: 'ค้นหาและลงทะเบียนผู้ป่วย ตรวจสอบสิทธิ์ และส่งต่อเข้าคิว',
    department: 'เวชระเบียนและตรวจสิทธิ์',
    station_codes: ['NPR', 'EV'],
    permissions: ['registration.read', 'registration.advance', 'patients.read', 'patients.write', 'queue.read', 'queue.manage'],
    users: [
      { username: 'registration', display_name: 'สมศรี มีน้ำใจ' },
      { username: 'registration02', display_name: 'วราภรณ์ ลงทะเบียนดี' },
      { username: 'registration03', display_name: 'ณัฐชา ตรวจสิทธิ์' },
      { username: 'registration04', display_name: 'สิริพร เวชระเบียน' },
    ],
  },
  {
    role: 'nurse',
    title: 'พยาบาลคัดกรอง',
    duty: 'ยืนยันผู้มาถึง ซักประวัติ คัดกรอง และจัดลำดับความเร่งด่วน',
    department: 'ผู้ป่วยนอกและจุดคัดกรอง',
    station_codes: ['NPR', 'EV', 'VM', 'MHT'],
    permissions: ['intake.read', 'intake.write', 'intake.escalate', 'vitals.read', 'vitals.write', 'registration.read', 'registration.advance', 'queue.read', 'queue.manage'],
    users: [
      { username: 'nurse', display_name: 'พว. กนกพร ชำนาญการ' },
      { username: 'nurse02', display_name: 'พว. ศิริพร ใจเย็น' },
      { username: 'nurse03', display_name: 'พว. รุ่งนภา ดูแลดี' },
      { username: 'nurse04', display_name: 'พว. พิมพ์ชนก ใส่ใจ' },
    ],
  },
  {
    role: 'vitals_staff',
    title: 'เจ้าหน้าที่สัญญาณชีพ',
    duty: 'บันทึกสัญญาณชีพและข้อมูลสำคัญก่อนผู้ป่วยพบแพทย์',
    department: 'จุดคัดกรองและสัญญาณชีพ',
    station_codes: ['VM'],
    permissions: ['vitals.read', 'vitals.write', 'queue.read', 'queue.manage'],
    users: [
      { username: 'vitals', display_name: 'พว. ปิยะมาศ สดใส' },
      { username: 'vitals02', display_name: 'พว. อัญชลี แม่นยำ' },
      { username: 'vitals03', display_name: 'พว. สุภาวดี รอบคอบ' },
      { username: 'vitals04', display_name: 'พว. ญาดา สุขภาพดี' },
    ],
  },
  {
    role: 'doctor',
    title: 'แพทย์',
    duty: 'บันทึกการตรวจ สร้างคำสั่งรักษา และกำหนดเส้นทางผู้ป่วย',
    department: 'อายุรกรรมมะเร็งวิทยา',
    station_codes: ['PC', 'PC2', 'PC3', 'PC4'],
    permissions: ['physician.read', 'physician.write', 'orders.create', 'routes.change', 'queue.read', 'queue.manage'],
    users: [
      { username: 'doctor', display_name: 'นพ. วรเมธ สถิตย์ธรรม' },
      { username: 'doctor02', display_name: 'พญ. สิริกานต์ รักษาดี' },
      { username: 'doctor03', display_name: 'นพ. ธนภัทร วินิจฉัย' },
      { username: 'doctor04', display_name: 'พญ. กัญญารัตน์ ใจดี' },
    ],
  },
  {
    role: 'lab_staff',
    title: 'เจ้าหน้าที่ห้องปฏิบัติการ',
    duty: 'รับคิว เก็บสิ่งส่งตรวจ บันทึก และยืนยันผลตรวจทางห้องปฏิบัติการ',
    department: 'ห้องปฏิบัติการชันสูตร',
    station_codes: ['LAB', 'LABC'],
    permissions: ['lab.read', 'lab.collect', 'lab.result', 'lab.verify', 'queue.read', 'queue.manage'],
    users: [
      { username: 'lab', display_name: 'ทนพ. ธนกฤต วิทยาศาสตร์' },
      { username: 'lab02', display_name: 'ทนพ. ณัฐพงศ์ วิเคราะห์' },
      { username: 'lab03', display_name: 'ทนญ. ชุติมา ตรวจละเอียด' },
      { username: 'lab04', display_name: 'ทนญ. วรนุช ผลแม่นยำ' },
    ],
  },
  {
    role: 'pharmacy_staff',
    title: 'เภสัชกร',
    duty: 'จัดยา ตรวจความพร้อม และบันทึกการจ่ายยาให้ผู้ป่วย',
    department: 'เภสัชกรรมคลินิก',
    station_codes: ['PD'],
    permissions: ['pharmacy.read', 'pharmacy.prepare', 'pharmacy.verify', 'pharmacy.dispense', 'queue.read', 'queue.manage'],
    users: [
      { username: 'pharmacy', display_name: 'ภก. เกริกเกียรติ บริบาล' },
      { username: 'pharmacy02', display_name: 'ภญ. มัลลิกา จัดยาดี' },
      { username: 'pharmacy03', display_name: 'ภก. อัครพล ตรวจยา' },
      { username: 'pharmacy04', display_name: 'ภญ. ณัฐธิดา พร้อมจ่าย' },
    ],
  },
  {
    role: 'infusion_staff',
    title: 'พยาบาลศูนย์ให้สารน้ำ',
    duty: 'จัดคิว เก้าอี้ และควบคุมเวลาการให้สารน้ำหรือยาทางหลอดเลือด',
    department: 'ศูนย์ให้สารน้ำและยาทางหลอดเลือด',
    station_codes: ['INFUSION'],
    permissions: ['infusion.read', 'infusion.operate', 'queue.read', 'queue.manage'],
    users: [
      { username: 'infusion', display_name: 'พว. ภัทรวดี ดูแลดี' },
      { username: 'infusion02', display_name: 'พว. ขวัญเรือน ให้สารน้ำ' },
      { username: 'infusion03', display_name: 'พว. ชลิดา เฝ้าระวัง' },
      { username: 'infusion04', display_name: 'พว. วารุณี ควบคุมเวลา' },
    ],
  },
]

export const DEVELOPMENT_ACCOUNTS = DEVELOPMENT_ROLE_DEFINITIONS.flatMap((definition, roleIndex) =>
  definition.users.map((user, userIndex) => ({
    ...user,
    role: definition.role,
    role_label: definition.title,
    duty: definition.duty,
    department: definition.department,
    station_codes: definition.station_codes,
    permissions: definition.permissions,
    order: roleIndex * 100 + userIndex,
  })),
)

export function developmentRoleDetails(role: string) {
  return DEVELOPMENT_ROLE_DEFINITIONS.find((definition) => definition.role === role)
}
