import type { Role } from '@/lib/types'

export const OPERATIONS_READ_ROLES: Role[] = ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse']
export const OPERATIONS_MUTATION_ROLES: Role[] = ['admin', 'manager', 'operations']

export const STAFF_ROUTE_ACCESS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/operations/insights', roles: ['admin', 'manager', 'operations'] },
  { prefix: '/operations/historical', roles: ['admin', 'manager', 'operations'] },
  { prefix: '/operations/methodology', roles: ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse'] },
  { prefix: '/operations', roles: OPERATIONS_READ_ROLES },
  { prefix: '/map', roles: OPERATIONS_READ_ROLES },
  { prefix: '/appointments', roles: ['admin', 'manager', 'nurse', 'doctor', 'physician'] },
  { prefix: '/registration', roles: ['admin', 'manager', 'registration', 'nurse'] },
  { prefix: '/vitals', roles: ['admin', 'manager', 'vitals_staff', 'nurse'] },
  { prefix: '/intake', roles: ['admin', 'manager', 'nurse'] },
  { prefix: '/physician', roles: ['admin', 'doctor', 'physician'] },
  { prefix: '/lab', roles: ['admin', 'lab_staff'] },
  { prefix: '/imaging', roles: ['admin', 'manager', 'operations', 'nurse', 'doctor', 'physician'] },
  { prefix: '/pharmacy', roles: ['admin', 'pharmacy_staff'] },
  { prefix: '/infusion', roles: ['admin', 'manager', 'infusion_staff', 'chemo_staff'] },
]

/**
 * หน้าหลักที่ปลอดภัยสำหรับแต่ละบทบาทหลังเข้าสู่ระบบหรือเมื่อถูก redirect
 * จากหน้าที่ไม่มีสิทธิ์ ใช้ร่วมกับ Navbar และ proxy เพื่อไม่ให้ role เฉพาะทาง
 * ถูกส่งไป /operations โดยอัตโนมัติ
 */
export function roleHomePath(role: Role) {
  if (role === 'patient') return '/patient'
  if (role === 'admin' || role === 'manager' || role === 'operations') return '/operations'
  if (role === 'doctor' || role === 'physician') return '/physician'
  if (role === 'nurse') return '/intake'
  if (role === 'registration') return '/registration'
  if (role === 'vitals_staff') return '/vitals'
  if (role === 'lab_staff') return '/lab'
  if (role === 'pharmacy_staff') return '/pharmacy'
  if (role === 'infusion_staff' || role === 'chemo_staff') return '/infusion'
  return '/'
}

export function stationAllowed(role: Role, stationCode: string) {
  if (role === 'admin' || role === 'manager' || role === 'operations') return true
  if (role === 'doctor' || role === 'physician') return ['PC', 'PC2', 'PC3', 'PC4'].includes(stationCode)
  if (role === 'nurse') return ['NPR', 'EV', 'VM', 'MHT', 'XR', 'CT', 'MRI', 'IR'].includes(stationCode)
  if (role === 'registration') return ['NPR', 'EV'].includes(stationCode)
  if (role === 'vitals_staff') return stationCode === 'VM'
  if (role === 'lab_staff') return ['LAB', 'LABC'].includes(stationCode)
  if (role === 'pharmacy_staff') return stationCode === 'PD'
  if (role === 'infusion_staff' || role === 'chemo_staff') return stationCode === 'INFUSION'
  return false
}

export function routeAllowed(role: Role, pathname: string) {
  const rule = STAFF_ROUTE_ACCESS.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))
  return !rule || role === 'admin' || rule.roles.includes(role)
}

export function staffRealtimeChannelAllowed(role: Role, channel: string) {
  if (channel.startsWith('patient:') || channel === 'tv') return false
  if (channel.startsWith('station:')) return stationAllowed(role, channel.slice('station:'.length))
  if (role === 'admin' || role === 'manager') return true
  if (channel === 'operations') return OPERATIONS_READ_ROLES.includes(role)
  if (channel === 'infusion') return role === 'infusion_staff' || role === 'chemo_staff'
  if (channel === 'lab') return role === 'lab_staff' || role === 'doctor' || role === 'physician'
  if (channel === 'pharmacy') return role === 'pharmacy_staff'
  if (channel === 'appointments') return ['operations', 'nurse', 'doctor', 'physician', 'registration'].includes(role)
  if (channel === 'clinical') return ['nurse', 'vitals_staff', 'doctor', 'physician', 'lab_staff'].includes(role)
  if (channel === 'orders') return ['doctor', 'physician', 'lab_staff', 'pharmacy_staff', 'infusion_staff', 'nurse'].includes(role)
  if (channel === 'encounters') return OPERATIONS_READ_ROLES.includes(role) || ['registration', 'vitals_staff'].includes(role)
  if (channel === 'staff') return ['operations', 'nurse'].includes(role)
  return false
}
