import { describe, expect, it } from 'vitest'
import { toPublicTvQueueItem } from '@/lib/public-dto'

describe('Public TV DTO', () => {
  it('อนุญาตเฉพาะข้อมูลคิวและสถานี', () => {
    const dto = toPublicTvQueueItem({
      queue_no: 'VM-001', station_code: 'VM', status: 'called',
      patient_id: 'secret', encounter_id: 'secret', patient: { display_name: 'ห้ามส่ง' },
    })
    expect(dto).toEqual({ queue_no: 'VM-001', station_code: 'VM', station_name: 'วัดสัญญาณชีพ', status: 'called' })
    expect(dto).not.toHaveProperty('patient_id')
    expect(dto).not.toHaveProperty('encounter_id')
    expect(dto).not.toHaveProperty('patient')
  })
})
