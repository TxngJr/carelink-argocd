import type { Document } from 'mongodb'

export const LEGACY_INFUSION_STATIONS = new Set(['CHEMO', 'CHEMO_PRE', 'CHEMO_INF'])
export const LEGACY_RADIATION_STATIONS = new Set(['BRA', 'RT_SIM', 'RT_L1', 'RT_L2', 'RT'])

export function migrateLegacyRoute(route: Document[] = []) {
  const legacyInfusionIndexes = route
    .map((step, index) => LEGACY_INFUSION_STATIONS.has(String(step.station_code || '')) ? index : -1)
    .filter((index) => index >= 0)
  const alreadyMigrated = route.some((step) => step.station_code === 'INFUSION')
  const canonicalInfusionIndex = alreadyMigrated
    ? undefined
    : legacyInfusionIndexes.find((index) => route[index]?.status === 'in_progress')
      ?? legacyInfusionIndexes.find((index) => route[index]?.status === 'pending')
      ?? legacyInfusionIndexes.at(-1)

  return route.map((step, index) => {
    const code = String(step.station_code || '')
    if (LEGACY_RADIATION_STATIONS.has(code)) {
      return { ...step, status: 'skipped', migration_reason: 'ยกเลิกระบบฉายแสง', migrated_from: code }
    }
    if (LEGACY_INFUSION_STATIONS.has(code)) {
      return index === canonicalInfusionIndex
        ? { ...step, station_code: 'INFUSION', migrated_from: code }
        : { ...step, status: 'skipped', migration_reason: 'รวมขั้นตอนเดิมเข้าสถานี INFUSION', migrated_from: code }
    }
    return step
  })
}
