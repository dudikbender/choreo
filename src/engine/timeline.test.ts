import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presentationSchema } from './schema'
import {
  activePhaseIndex,
  findUnsettledAtPhaseStarts,
  layoutPhases,
  poseAt,
  poseToStyle,
  resolveKeyframes,
} from './timeline'

const planExample = {
  version: 1,
  meta: { title: 'Quarterly Vision', aspectRatio: '16:9' },
  phases: [
    { id: 'intro', label: 'Intro', duration: 1200 },
    { id: 'growth', label: 'Growth', duration: 1800 },
  ],
  components: [
    {
      id: 'hero-title',
      file: 'components/hero-title.tsx',
      keyframes: [
        { at: 0, x: 0, z: 0, scale: 1, opacity: 1 },
        { at: 900, x: -180, z: -30, scale: 0.85, opacity: 0.8 },
        { at: 1600, x: -400, z: -80, scale: 0.6, opacity: 0.4 },
      ],
    },
  ],
}

describe('schema', () => {
  it('accepts the example from the plan', () => {
    expect(presentationSchema.safeParse(planExample).success).toBe(true)
  })

  it('defaults meta.backgroundColor and accepts a CSS color', () => {
    const parsed = presentationSchema.parse(planExample)
    expect(parsed.meta.backgroundColor).toBe('#171717')
    expect(
      presentationSchema.safeParse({
        ...planExample,
        meta: { ...planExample.meta, backgroundColor: '#faf6ef' },
      }).success,
    ).toBe(true)
    expect(
      presentationSchema.safeParse({
        ...planExample,
        meta: { ...planExample.meta, backgroundColor: 'not a color!!' },
      }).success,
    ).toBe(false)
  })

  it('rejects unsorted keyframes', () => {
    const bad = structuredClone(planExample)
    bad.components[0].keyframes.reverse()
    expect(presentationSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects duplicate ids', () => {
    const bad = structuredClone(planExample)
    bad.phases[1].id = 'intro'
    expect(presentationSchema.safeParse(bad).success).toBe(false)
  })

  it('requires a version', () => {
    const { version: _, ...unversioned } = planExample
    expect(presentationSchema.safeParse(unversioned).success).toBe(false)
  })

  it('validates every presentation on disk', () => {
    for (const id of readdirSync('presentations')) {
      const raw = JSON.parse(readFileSync(`presentations/${id}/presentation.json`, 'utf8'))
      const parsed = presentationSchema.safeParse(raw)
      expect(parsed.error?.issues ?? [], id).toEqual([])
      expect(findUnsettledAtPhaseStarts(parsed.data!), id).toEqual([])
    }
  })
})

describe('poseAt', () => {
  const kfs = resolveKeyframes([
    { at: 100, x: 0, opacity: 1 },
    { at: 200, x: 100 },
    { at: 400, x: -100, opacity: 0 },
  ])

  it('holds the first pose before the first keyframe', () => {
    expect(poseAt(kfs, 0).x).toBe(0)
  })

  it('holds the last pose past the last keyframe', () => {
    expect(poseAt(kfs, 10_000)).toMatchObject({ x: -100, opacity: 0 })
  })

  it('interpolates between the bracketing keyframes', () => {
    expect(poseAt(kfs, 150).x).toBe(50)
    expect(poseAt(kfs, 300)).toMatchObject({ x: 0, opacity: 0.5 })
  })

  it('carries omitted properties forward', () => {
    expect(kfs[1].pose.opacity).toBe(1)
    expect(kfs[1].pose.scale).toBe(1)
  })
})

describe('phases', () => {
  const ranges = layoutPhases(planExample.phases)

  it('lays phases end to end', () => {
    expect(ranges.map((r) => [r.start, r.end])).toEqual([
      [0, 1200],
      [1200, 3000],
    ])
  })

  it('finds the active phase', () => {
    expect(activePhaseIndex(ranges, 0)).toBe(0)
    expect(activePhaseIndex(ranges, 1199)).toBe(0)
    expect(activePhaseIndex(ranges, 1200)).toBe(1)
    expect(activePhaseIndex(ranges, 99_999)).toBe(1)
  })

  it('flags the plan example: hero-title is mid-flight at the growth phase start', () => {
    expect(findUnsettledAtPhaseStarts(presentationSchema.parse(planExample))).toEqual([
      { phaseId: 'growth', componentId: 'hero-title', start: 1200 },
    ])
  })
})

describe('poseToStyle', () => {
  it('produces identical output for sub-pixel differences', () => {
    const a = resolveKeyframes([{ at: 0, x: 10.0001 }])[0].pose
    const b = resolveKeyframes([{ at: 0, x: 10.0002 }])[0].pose
    expect(poseToStyle(a)).toEqual(poseToStyle(b))
  })
})
