import { describe, expect, it } from 'vitest'
import { buildLiveFlowEdges, countPatientsByStation, nextStationForPatient } from '@/lib/live-flow-map'
import type { ActivePatientFlow } from '@/lib/types'

function patient(id: string, current: string, route: ActivePatientFlow['route']): ActivePatientFlow {
  return {
    id,
    encounter_no: `ENC-${id}`,
    patient: { hn: `HN-${id}`, display_name: `ผู้ป่วย ${id}` },
    priority: 'normal',
    current_station: current,
    station_name: current,
    queue_no: `${current}-001`,
    queue_status: 'waiting',
    est_wait_min: 5,
    est_wait_p80_min: 8,
    route,
    updated_at: new Date().toISOString(),
  }
}

describe('live flow map helpers', () => {
  it('หาสถานีถัดไปจาก route ปัจจุบัน', () => {
    const row = patient('1', 'VM', [
      { station_code: 'NPR', status: 'completed' },
      { station_code: 'EV', status: 'completed' },
      { station_code: 'VM', status: 'in_progress' },
      { station_code: 'MHT', status: 'pending' },
    ])
    expect(nextStationForPatient(row)).toBe('MHT')
  })

  it('ข้าม skipped step และเลือกสถานีถัดไปที่ยังทำงานจริง', () => {
    const row = patient('1', 'PC', [
      { station_code: 'PC', status: 'in_progress' },
      { station_code: 'LAB', status: 'skipped' },
      { station_code: 'PD', status: 'pending' },
      { station_code: 'DH', status: 'pending' },
    ])
    expect(nextStationForPatient(row)).toBe('PD')
  })

  it('รองรับช่วง handoff ที่ current_station ยังเป็นจุดเดิมแต่ route เลื่อนไปจุดใหม่แล้ว', () => {
    const row = patient('1', 'VM', [
      { station_code: 'NPR', status: 'completed' },
      { station_code: 'EV', status: 'completed' },
      { station_code: 'VM', status: 'completed' },
      { station_code: 'MHT', status: 'pending' },
      { station_code: 'PC', status: 'pending' },
    ])
    expect(nextStationForPatient(row)).toBe('MHT')
  })

  it('รวมเส้นทางเดียวกันเป็นจำนวนผู้ป่วยบนสายเดียว', () => {
    const rows = [
      patient('1', 'VM', [{ station_code: 'VM', status: 'in_progress' }, { station_code: 'MHT', status: 'pending' }]),
      patient('2', 'VM', [{ station_code: 'VM', status: 'in_progress' }, { station_code: 'MHT', status: 'pending' }]),
      patient('3', 'MHT', [{ station_code: 'MHT', status: 'in_progress' }, { station_code: 'PC', status: 'pending' }]),
    ]
    expect(buildLiveFlowEdges(rows)).toEqual([
      { from_station: 'VM', to_station: 'MHT', patient_count: 2, encounter_ids: ['1', '2'] },
      { from_station: 'MHT', to_station: 'PC', patient_count: 1, encounter_ids: ['3'] },
    ])
  })

  it('นับจำนวนผู้ป่วยตามสถานีปัจจุบัน', () => {
    const rows = [
      patient('1', 'VM', []),
      patient('2', 'VM', []),
      patient('3', 'PC', []),
    ]
    expect(Object.fromEntries(countPatientsByStation(rows))).toEqual({ VM: 2, PC: 1 })
  })
})
