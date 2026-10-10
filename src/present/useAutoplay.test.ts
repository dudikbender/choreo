import { describe, expect, it } from 'vitest'
import { clampStopTime, easeInOutCubic, nextLeg } from './useAutoplay'

describe('nextLeg', () => {
  const stops = [0, 500, 1200]

  it('glides to the next stop ahead, then to the end of the track', () => {
    expect(nextLeg(0, stops, 3000, 1)?.to).toBe(500)
    expect(nextLeg(600, stops, 3000, 1)?.to).toBe(1200)
    expect(nextLeg(1200, stops, 3000, 1)?.to).toBe(3000)
    expect(nextLeg(3000, stops, 3000, 1)).toBeNull()
  })

  it('treats a position within a pixel of a stop as on it', () => {
    expect(nextLeg(499.5, stops, 3000, 1)?.to).toBe(1200)
  })

  it('scales glide time with speed, within bounds', () => {
    const slow = nextLeg(1200, stops, 3000, 0.5)!.duration
    const fast = nextLeg(1200, stops, 3000, 2)!.duration
    expect(slow).toBeGreaterThan(fast)
    expect(nextLeg(0, [0, 10], 3000, 2)!.duration).toBe(700)
    expect(nextLeg(0, [0], 100_000, 0.5)!.duration).toBe(4000)
  })
})

describe('clampStopTime', () => {
  it('keeps stop times within bounds at tenth-of-a-second precision', () => {
    expect(clampStopTime(12)).toBe(12)
    expect(clampStopTime(1.234)).toBe(1.2)
    expect(clampStopTime(-5)).toBe(0)
    expect(clampStopTime(10_000)).toBe(600)
    expect(clampStopTime(Number.NaN)).toBe(3)
  })
})

describe('easeInOutCubic', () => {
  it('starts at 0, ends at 1 and is symmetric', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
  })
})
