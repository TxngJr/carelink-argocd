import type { Role } from '@/lib/types'
import { stationAllowed } from '@/lib/access-control'

const STAFF_DIRECTORY_ROLES: Role[] = [
  'admin', 'manager', 'operations', 'nurse', 'doctor', 'physician', 'registration',
  'vitals_staff', 'lab_staff', 'pharmacy_staff', 'infusion_staff', 'chemo_staff',
]

function family(segments: string[]) {
  return segments[0] || ''
}

/**
 * Additional API-level RBAC guard used before dispatchApi().
 * dispatchApi keeps domain/state validation; this layer prevents a logged-in role
 * from calling another role's workspace API even if it knows the endpoint URL.
 */
export function staffApiAllowed(role: Role, method: string, segments: string[]) {
  const root = family(segments)
  const verb = method.toUpperCase()

  if (role === 'admin') return true

  // Public, auth and patient APIs are governed by their own handlers.
  if (['auth', 'mobile', 'tv', 'kiosk', 'dev'].includes(root)) return true

  if (root === 'map') return ['manager', 'operations'].includes(role)
  if (root === 'operations' || root === 'dashboard') return ['manager', 'operations'].includes(role)

  if (root === 'nurse' || root === 'intake') return role === 'nurse'
  if (root === 'doctor' || root === 'physician') return role === 'doctor' || role === 'physician'
  if (root === 'registration') return role === 'registration'
  if (root === 'vitals') return role === 'vitals_staff'
  if (root === 'lab') return role === 'lab_staff'
  if (root === 'pharmacy') return role === 'pharmacy_staff'

  if (root === 'infusion') {
    // Physicians only need active templates to create valid infusion orders.
    if (verb === 'GET' && segments[1] === 'templates') {
      return ['doctor', 'physician', 'infusion_staff', 'chemo_staff'].includes(role)
    }
    return role === 'infusion_staff' || role === 'chemo_staff'
  }

  if (root === 'stations') {
    const stationCode = segments[1] || ''
    return Boolean(stationCode && stationAllowed(role, stationCode))
  }

  // Shared patient/encounter read models are required by each role's own workspace.
  if (root === 'patients' || root === 'encounters') {
    return verb === 'GET' && STAFF_DIRECTORY_ROLES.includes(role)
  }

  // Unknown catch-all API routes are left to dispatchApi(), which returns 404/403.
  return true
}
