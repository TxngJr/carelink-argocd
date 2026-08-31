import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Countdown } from './ui'
import type { InfusionPhase } from '@/lib/types'

describe('Countdown', () => {
  afterEach(() => vi.useRealTimers())

  it('uses server time, advances locally, warns at ten minutes and stops at zero', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-30T03:00:00.000Z')
    const phase: InfusionPhase = {
      key: 'infusion', label: 'ให้สารน้ำ', kind: 'infusion', duration_min: 10,
      effective_duration_sec: 600, remaining_sec: 600, status: 'active', started_at: '2026-08-30T03:00:00.000Z',
    }
    const onDue = vi.fn()
    render(<Countdown phase={phase} serverNow="2026-08-30T03:00:00.000Z" onDue={onDue} />)
    expect(screen.getByLabelText('เวลาเหลือ 00:10:00')).toHaveClass('warning')

    act(() => vi.advanceTimersByTime(600_000))
    expect(screen.getByLabelText('เวลาเหลือ 00:00:00')).toHaveClass('due')
    expect(onDue).toHaveBeenCalled()
  })
})
