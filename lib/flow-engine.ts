import type { FlowEstimate, FlowPlanSegment, FlowState } from '@/lib/types'

export const FLOW_HISTORY_WINDOW_DAYS = 30
export const FLOW_HISTORY_MIN_SAMPLES = 20

export function quantile(values: number[], percentile: number): number {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
  if (!clean.length) return 0
  const bounded = Math.min(1, Math.max(0, percentile))
  const index = (clean.length - 1) * bounded
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return clean[lower]
  return clean[lower] + (clean[upper] - clean[lower]) * (index - lower)
}

export function buildFlowEstimate(
  samplesMin: number[],
  configuredFallbackMin: number,
  minimumSamples = FLOW_HISTORY_MIN_SAMPLES,
): FlowEstimate {
  const samples = samplesMin.filter((value) => Number.isFinite(value) && value > 0 && value <= 24 * 60)
  const fallback = Math.max(1, Math.round(configuredFallbackMin || 10))
  if (samples.length < minimumSamples) {
    return {
      p50_min: fallback,
      p80_min: Math.max(fallback, Math.ceil(fallback * 1.25)),
      sample_count: samples.length,
      source: 'configured_fallback',
      window_days: FLOW_HISTORY_WINDOW_DAYS,
    }
  }
  return {
    p50_min: Math.max(1, Math.round(quantile(samples, 0.5))),
    p80_min: Math.max(1, Math.ceil(quantile(samples, 0.8))),
    sample_count: samples.length,
    source: 'history',
    window_days: FLOW_HISTORY_WINDOW_DAYS,
  }
}

type ActiveService = { started_at?: string | Date; status: string }

function remainingMinutes(nowMs: number, serviceMin: number, item: ActiveService) {
  if (item.status !== 'in_progress' || !item.started_at) return serviceMin
  const startedMs = new Date(item.started_at).getTime()
  if (!Number.isFinite(startedMs)) return serviceMin
  return Math.max(0, serviceMin - (nowMs - startedMs) / 60_000)
}

/**
 * Simulates parallel service lanes and returns the wait for a newly-arriving patient.
 * The function is deterministic and deliberately explainable; it is not an ML model.
 */
export function simulateNewArrivalWait(args: {
  now: Date
  capacity: number
  serviceMin: number
  active: ActiveService[]
  waitingCount: number
}) {
  const capacity = Math.max(1, Math.floor(args.capacity || 1))
  const duration = Math.max(1, args.serviceMin)
  const lanes = args.active
    .slice(0, capacity)
    .map((item) => remainingMinutes(args.now.getTime(), duration, item))
  while (lanes.length < capacity) lanes.push(0)

  for (let index = 0; index < Math.max(0, args.waitingCount); index++) {
    const earliest = lanes.indexOf(Math.min(...lanes))
    lanes[earliest] += duration
  }
  return Math.max(0, Math.ceil(Math.min(...lanes)))
}

export function classifyFlowState(args: {
  waiting: number
  inProgress: number
  capacity: number
  waitP80Min: number
  targetWaitMin?: number
}): FlowState {
  if (args.waiting === 0 && args.inProgress === 0) return 'idle'
  const capacity = Math.max(1, args.capacity)
  const target = Math.max(5, args.targetWaitMin || 20)
  const pressure = (args.waiting + args.inProgress) / capacity
  if (args.waitP80Min > target * 2 || pressure >= 2) return 'bottleneck'
  if (args.waitP80Min > target || pressure >= 1) return 'building'
  return 'flowing'
}

export function minutesBetween(start?: string | Date, end?: string | Date) {
  if (!start || !end) return 0
  const value = (new Date(end).getTime() - new Date(start).getTime()) / 60_000
  return Number.isFinite(value) && value >= 0 ? value : 0
}

export function buildBaselinePlan(args: {
  encounterId?: string
  stationCodes: string[]
  startsAt: Date
  durationFor: (stationCode: string) => number
}): FlowPlanSegment[] {
  let cursor = args.startsAt.getTime()
  return args.stationCodes.map((stationCode, index) => {
    const durationMin = Math.max(1, Math.round(args.durationFor(stationCode)))
    const start = new Date(cursor)
    cursor += durationMin * 60_000
    return {
      id: `${args.encounterId || 'plan'}:${index}:${stationCode}`,
      encounter_id: args.encounterId,
      station_code: stationCode,
      baseline_start_at: start.toISOString(),
      baseline_end_at: new Date(cursor).toISOString(),
      adapted_start_at: start.toISOString(),
      adapted_end_at: new Date(cursor).toISOString(),
      shift_min: 0,
      reason: 'แผนตั้งต้นเมื่อสร้างเส้นทาง',
    }
  })
}

export function adaptFlowPlan(args: {
  baseline: FlowPlanSegment[]
  now: Date
  currentIndex: number
  waitFor: (stationCode: string) => number
  durationFor: (stationCode: string) => number
}): FlowPlanSegment[] {
  let cursor = args.now.getTime()
  return args.baseline.map((segment, index) => {
    if (index < args.currentIndex) return segment
    const waitMin = Math.max(0, Math.round(args.waitFor(segment.station_code)))
    const durationMin = Math.max(1, Math.round(args.durationFor(segment.station_code)))
    const startMs = Math.max(cursor + waitMin * 60_000, args.now.getTime())
    const endMs = startMs + durationMin * 60_000
    cursor = endMs
    const baselineStart = new Date(segment.baseline_start_at).getTime()
    const shiftMin = Number.isFinite(baselineStart) ? Math.round((startMs - baselineStart) / 60_000) : 0
    return {
      ...segment,
      adapted_start_at: new Date(startMs).toISOString(),
      adapted_end_at: new Date(endMs).toISOString(),
      shift_min: shiftMin,
      reason: waitMin > 0
        ? `เลื่อนตามคิวปัจจุบันที่ ${segment.station_code} ประมาณ ${waitMin} นาที`
        : shiftMin === 0 ? 'ตรงตามแผนตั้งต้น' : 'ปรับตามเวลาปัจจุบันของเส้นทาง',
    }
  })
}
