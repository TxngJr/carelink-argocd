import type { Role } from '@/lib/types'

/**
 * Strict RBAC policy for staff workspaces.
 *
 * Rules:
 * - Admin may access every staff workspace.
 * - Manager / Operations stay in operational-management workspaces only.
 * - Clinical roles only see and operate the workspace they are responsible for.
 * - Doctor appointment confirmation lives under /physician/appointments; /appointments is nurse-only.
 */
export const OPERATIONS_READ_ROLES: Role[] = ['admin', 'manager', 'operations']
export const OPERATIONS_MUTATION_ROLES: Role[] = ['admin', 'manager', 'operations']

export const STAFF_ROUTE_ACCESS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/operations/insights', roles: OPERATIONS_READ_ROLES },
  { prefix: '/operations', roles: OPERATIONS_READ_ROLES },
  { prefix: '/map', roles: OPERATIONS_READ_ROLES },

  { prefix: '/appointments', roles: ['admin', 'nurse'] },
  { prefix: '/registration', roles: ['admin', 'registration'] },
  { prefix: '/vitals', roles: ['admin', 'vitals_staff'] },
  { prefix: '/nurse', roles: ['admin', 'nurse'] },
  { prefix: '/intake', roles: ['admin', 'nurse'] },
  { prefix: '/doctor', roles: ['admin', 'doctor', 'physician'] },
  { prefix: '/physician', roles: ['admin', 'doctor', 'physician'] },
  { prefix: '/lab', roles: ['admin', 'lab_staff'] },
  { prefix: '/pharmacy', roles: ['admin', 'pharmacy_staff'] },
  { prefix: '/chemo', roles: ['admin', 'infusion_staff', 'chemo_staff'] },
  { prefix: '/infusion', roles: ['admin', 'infusion_staff', 'chemo_staff'] },
]

export function roleHomePath(role: Role) {
  if (role === 'patient') return '/patient'
  if (role === 'admin' || role === 'manager' || role === 'operations') return '/operations'
  if (role === 'doctor' || role === 'physician') return '/physician'
  if (role === 'nurse') return '/appointments'
  if (role === 'registration') return '/registration'
  if (role === 'vitals_staff') return '/vitals'
  if (role === 'lab_staff') return '/lab'
  if (role === 'pharmacy_staff') return '/pharmacy'
  if (role === 'infusion_staff' || role === 'chemo_staff') return '/infusion'
  return '/'
}

export function stationAllowed(role: Role, stationCode: string) {
  if (role === 'admin') return true
  if (role === 'doctor' || role === 'physician') return ['PC', 'PC2', 'PC3', 'PC4'].includes(stationCode)
  if (role === 'nurse') return stationCode === 'MHT'
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
  if (role === 'admin') return true
  if (channel.startsWith('station:')) return stationAllowed(role, channel.slice('station:'.length))

  if (role === 'manager' || role === 'operations') {
    return ['operations', 'encounters', 'staff'].includes(channel)
  }
  if (channel === 'appointments') return ['nurse', 'doctor', 'physician'].includes(role)
  if (channel === 'clinical') return ['nurse', 'vitals_staff', 'doctor', 'physician', 'lab_staff'].includes(role)
  if (channel === 'orders') return ['doctor', 'physician', 'lab_staff', 'pharmacy_staff', 'infusion_staff', 'chemo_staff'].includes(role)
  if (channel === 'lab') return role === 'lab_staff' || role === 'doctor' || role === 'physician'
  if (channel === 'pharmacy') return role === 'pharmacy_staff'
  if (channel === 'infusion') return role === 'infusion_staff' || role === 'chemo_staff'
  if (channel === 'encounters') return ['registration', 'vitals_staff', 'nurse', 'doctor', 'physician', 'lab_staff', 'pharmacy_staff', 'infusion_staff', 'chemo_staff'].includes(role)
  return false
}
