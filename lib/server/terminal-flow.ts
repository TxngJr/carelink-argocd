import 'server-only'
import { getDb } from '@/lib/server/db'
import { completeQueue, objectId, startQueue } from '@/lib/server/domain'

const AUTO_TERMINAL_STATIONS = new Set(['DH', 'HA', 'IPW'])
const ACTIVE_TERMINAL_QUEUE_STATES = ['waiting', 'called', 'in_progress']

/**
 * DH and HA -> IPW are route semantics, not staffed workstations in the demo.
 * Once the last staffed station has completed, close these tail steps
 * automatically so the encounter and appointment reach `completed` instead
 * of leaving an orphan queue that no UI can operate.
 */
export async function finalizeTerminalQueuesForEncounter(encounterId: string, staffId: string) {
  const db = await getDb()
  const id = objectId(encounterId, 'Encounter ID')

  for (let guard = 0; guard < 3; guard++) {
    const encounter = await db.collection('encounters').findOne({ _id: id })
    if (!encounter || encounter.status === 'completed') return encounter

    const item = await db.collection('queue_items').findOne(
      {
        encounter_id: id,
        station_code: { $in: [...AUTO_TERMINAL_STATIONS] },
        status: { $in: ACTIVE_TERMINAL_QUEUE_STATES },
      },
      { sort: { created_at: 1 } },
    )
    if (!item) return encounter

    const stationCode = String(item.station_code)
    if (!AUTO_TERMINAL_STATIONS.has(stationCode)) return encounter

    let version = Number(item.version || 1)
    if (item.status !== 'in_progress') {
      const started = await startQueue(stationCode, item._id.toString(), staffId, version)
      version = Number(started.version || version + 1)
    }
    await completeQueue(stationCode, item._id.toString(), staffId, version)
  }

  return db.collection('encounters').findOne({ _id: id })
}
