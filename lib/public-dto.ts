import { stationMap } from '@/lib/stations'

export type PublicTvQueueItem = {
  queue_no: string
  station_code: string
  station_name: string
  status: string
  called_at?: unknown
}

export function toPublicTvQueueItem(item: Record<string, unknown>): PublicTvQueueItem {
  const stationCode = String(item.station_code || '')
  return {
    queue_no: String(item.queue_no || ''),
    station_code: stationCode,
    station_name: stationMap.get(stationCode)?.name || stationCode,
    status: String(item.status || ''),
    ...(item.called_at ? { called_at: item.called_at } : {}),
  }
}
