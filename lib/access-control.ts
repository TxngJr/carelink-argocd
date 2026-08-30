import type { Role } from '@/lib/types'

export const OPERATIONS_READ_ROLES: Role[] = ['admin', 'manager', 'operations', 'doctor', 'physician', 'nurse']
export const OPERATIONS_MUTATION_ROLES: Role[] = ['admin', 'manager', 'operations']

export const STAFF_ROUTE_ACCESS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/operations/insights', roles: ['admin', 'manager', 'operations'] },
  { prefix: '/operations', roles: OPERATIONS_READ_ROLES },
  { prefix: '/map', roles: OPERATIONS_READ_ROLES },
  { prefix: '/registration', roles: ['admin', 'manager', 'registration', 'nurse'] },
  { prefix: '/vitals', roles: ['admin', 'manager', 'vitals_staff', 'nurse'] },
  { prefix: '/intake', roles: ['admin', 'manager', 'nurse'] },
  { prefix: '/physician', roles: ['admin', 'manager', 'doctor', 'physician'] },
  { prefix: '/lab', roles: ['admin', 'manager', 'lab_staff'] },
  { prefix: '/pharmacy', roles: ['admin', 'manager', 'pharmacy_staff'] },
  { prefix: '/infusion', roles: ['admin', 'manager', 'infusion_staff', 'chemo_staff'] },
]

export function stationAllowed(role: Role, stationCode: string) {
  if (role === 'admin' || role === 'manager' || role === 'operations') return true
  if (role === 'doctor' || role === 'physician') return ['PC', 'PC2', 'PC3', 'PC4'].includes(stationCode)
  if (role === 'nurse') return ['NPR', 'EV', 'VM', 'MHT'].includes(stationCode)
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
  if (channel === 'orders') return ['doctor', 'physician', 'lab_staff', 'pharmacy_staff', 'infusion_staff'].includes(role)
  if (channel === 'encounters') return OPERATIONS_READ_ROLES.includes(role) || ['registration', 'vitals_staff'].includes(role)
  if (channel === 'staff') return ['operations', 'nurse'].includes(role)
  return false
}
