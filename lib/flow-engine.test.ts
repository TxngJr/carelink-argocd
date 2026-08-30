import { describe, expect, it } from 'vitest'
import { adaptFlowPlan, buildBaselinePlan, buildFlowEstimate, classifyFlowState, quantile, simulateNewArrivalWait } from '@/lib/flow-engine'

describe('เครื่องมือคำนวณการไหลเวียนผู้ป่วย', () => {
  it('คำนวณ percentile แบบ interpolation', () => {
    expect(quantile([10, 20, 30, 40, 50], 0.5)).toBe(30)
    expect(quantile([10, 20, 30, 40, 50], 0.8)).toBe(42)
  })

  it('ใช้ค่าตั้งต้นและระบุแหล่งข้อมูลเมื่อ sample ยังไม่พอ', () => {
    expect(buildFlowEstimate([8, 12], 10)).toEqual({
      p50_min: 10,
      p80_min: 13,
      sample_count: 2,
      source: 'configured_fallback',
      window_days: 30,
    })
  })

  it('ใช้ประวัติจริงเมื่อมี sample ครบ', () => {
    const estimate = buildFlowEstimate(Array.from({ length: 20 }, (_, index) => index + 1), 30)
    expect(estimate.source).toBe('history')
    expect(estimate.sample_count).toBe(20)
    expect(estimate.p50_min).toBe(11)
    expect(estimate.p80_min).toBe(17)
  })

  it('จำลองหลายช่องบริการโดยคำนึงถึงเวลาที่ใช้ไปแล้ว', () => {
    const now = new Date('2026-08-30T03:30:00.000Z')
    const wait = simulateNewArrivalWait({
      now,
      capacity: 2,
      serviceMin: 20,
      active: [
        { status: 'in_progress', started_at: '2026-08-30T03:20:00.000Z' },
        { status: 'in_progress', started_at: '2026-08-30T03:25:00.000Z' },
      ],
      waitingCount: 2,
    })
    expect(wait).toBe(30)
  })

  it('จัดสถานะด้วย wait target และ queue pressure', () => {
    expect(classifyFlowState({ waiting: 0, inProgress: 0, capacity: 2, waitP80Min: 0 })).toBe('idle')
    expect(classifyFlowState({ waiting: 0, inProgress: 1, capacity: 2, waitP80Min: 0 })).toBe('flowing')
    expect(classifyFlowState({ waiting: 1, inProgress: 1, capacity: 2, waitP80Min: 15 })).toBe('building')
    expect(classifyFlowState({ waiting: 4, inProgress: 1, capacity: 2, waitP80Min: 45 })).toBe('bottleneck')
  })

  it('สร้าง baseline และปรับแผนโดยเก็บเหตุผลกับเวลาที่เลื่อน', () => {
    const baseline = buildBaselinePlan({
      encounterId: 'visit-1',
      stationCodes: ['VM', 'MHT'],
      startsAt: new Date('2026-08-30T01:00:00.000Z'),
      durationFor: () => 10,
    })
    expect(baseline[1].baseline_start_at).toBe('2026-08-30T01:10:00.000Z')

    const adapted = adaptFlowPlan({
      baseline,
      now: new Date('2026-08-30T01:05:00.000Z'),
      currentIndex: 0,
      waitFor: (code) => code === 'VM' ? 10 : 0,
      durationFor: () => 10,
    })
    expect(adapted[0].shift_min).toBe(15)
    expect(adapted[0].reason).toContain('10 นาที')
    expect(adapted[1].adapted_start_at).toBe('2026-08-30T01:25:00.000Z')
  })
})
