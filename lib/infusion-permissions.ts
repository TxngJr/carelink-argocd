import type { Role } from '@/lib/types'

export const INFUSION_OPERATOR_ROLES: Role[] = ['infusion_staff', 'manager', 'admin']
export const INFUSION_CONFIGURATOR_ROLES: Role[] = ['manager', 'admin']
export const INFUSION_ORDER_ROLES: Role[] = ['doctor', 'physician', 'admin']
export const INFUSION_TEMPLATE_VIEWER_ROLES: Role[] = ['doctor', 'physician', 'infusion_staff', 'manager', 'admin']

export function canOperateInfusion(role: Role) {
  return INFUSION_OPERATOR_ROLES.includes(role === 'chemo_staff' ? 'infusion_staff' : role)
}

export function canConfigureInfusion(role: Role) {
  return INFUSION_CONFIGURATOR_ROLES.includes(role)
}

export function canCreateInfusionOrder(role: Role) {
  return INFUSION_ORDER_ROLES.includes(role)
}
