import type { ActivePatientFlow } from '@/lib/types'

export type LiveFlowEdge = {
  from_station: string
  to_station: string
  patient_count: number
  encounter_ids: string[]
}

export function nextStationForPatient(row: ActivePatientFlow) {
  const currentIndex = row.route.findIndex((step) => step.station_code === row.current_station && step.status !== 'completed' && step.status !== 'skipped')
  const fallbackIndex = row.route.findIndex((step) => step.status !== 'completed' && step.status !== 'skipped')
  const index = currentIndex >= 0 ? currentIndex : fallbackIndex
  if (index < 0) return ''
  return row.route.slice(index + 1).find((step) => step.status !== 'completed' && step.status !== 'skipped')?.station_code || ''
}

export function buildLiveFlowEdges(rows: ActivePatientFlow[]): LiveFlowEdge[] {
  const groups = new Map<string, LiveFlowEdge>()
  for (const row of rows) {
    const from = row.current_station
    const to = nextStationForPatient(row)
    if (!from || !to || from === to) continue
    const key = `${from}->${to}`
    const current = groups.get(key)
    if (current) {
      current.patient_count += 1
      current.encounter_ids.push(row.id)
      continue
    }
    groups.set(key, { from_station: from, to_station: to, patient_count: 1, encounter_ids: [row.id] })
  }
  return [...groups.values()].sort((a, b) => b.patient_count - a.patient_count || a.from_station.localeCompare(b.from_station))
}

export function countPatientsByStation(rows: ActivePatientFlow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.current_station) continue
    counts.set(row.current_station, (counts.get(row.current_station) || 0) + 1)
  }
  return counts
}
