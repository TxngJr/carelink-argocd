import type { InfusionReadinessRequirement } from '@/lib/types'

export type InfusionReadinessFacts = {
  active_order: boolean
  lab_verified: boolean
  medication_ready: boolean
}

const readinessLabel: Record<InfusionReadinessRequirement, string> = {
  active_order: 'มีคำสั่งแพทย์ที่ใช้งานอยู่',
  lab_verified: 'ผลแล็บผ่านการยืนยัน',
  medication_ready: 'ยาหรือสารน้ำพร้อม',
}

export function evaluateInfusionReadiness(
  requirements: InfusionReadinessRequirement[],
  facts: InfusionReadinessFacts,
  override?: { enabled: boolean; reason?: string },
) {
  const checks = requirements.map((key) => ({ key, label: readinessLabel[key], ready: facts[key] }))
  const overridden = Boolean(override?.enabled)
  return {
    ready: overridden || checks.every((check) => check.ready),
    requirements: checks,
    ...(overridden ? { overridden: true, override_reason: override?.reason || '' } : {}),
  }
}

export function suggestInfusionQueue<T extends { readiness: { ready: boolean } }>(items: T[]) {
  const suggestedIndex = items.findIndex((item) => item.readiness.ready)
  if (suggestedIndex < 0) return { suggested: undefined, bypassed: [] as T[] }
  return {
    suggested: items[suggestedIndex],
    bypassed: items.slice(0, suggestedIndex).filter((item) => !item.readiness.ready),
  }
}
