import { describe, expect, it } from 'vitest'
import { migrateLegacyRoute } from '../migration-routes'

describe('CareLink legacy route migration', () => {
  it('keeps the active chemotherapy step as the single INFUSION step', () => {
    const migrated = migrateLegacyRoute([
      { station_code: 'CHEMO_PRE', status: 'completed' },
      { station_code: 'CHEMO_INF', status: 'in_progress' },
      { station_code: 'PD', status: 'pending' },
    ])

    expect(migrated).toEqual([
      expect.objectContaining({ station_code: 'CHEMO_PRE', status: 'skipped', migrated_from: 'CHEMO_PRE' }),
      expect.objectContaining({ station_code: 'INFUSION', status: 'in_progress', migrated_from: 'CHEMO_INF' }),
      { station_code: 'PD', status: 'pending' },
    ])
    expect(migrated.filter((step) => step.station_code === 'INFUSION')).toHaveLength(1)
    expect(migrateLegacyRoute(migrated)).toEqual(migrated)
  })

  it('marks only treatment-radiation stations skipped and preserves diagnostic imaging', () => {
    const migrated = migrateLegacyRoute([
      { station_code: 'XR', status: 'completed' },
      { station_code: 'RT_SIM', status: 'in_progress' },
      { station_code: 'CT', status: 'pending' },
      { station_code: 'MRI', status: 'pending' },
      { station_code: 'IR', status: 'pending' },
    ])

    expect(migrated[1]).toEqual(expect.objectContaining({ station_code: 'RT_SIM', status: 'skipped', migration_reason: 'ยกเลิกระบบฉายแสง' }))
    expect(migrated.map((step) => step.station_code)).toEqual(['XR', 'RT_SIM', 'CT', 'MRI', 'IR'])
  })
})
