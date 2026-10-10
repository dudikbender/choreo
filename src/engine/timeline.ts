import { KEYFRAME_PROPS } from './schema'
import type { Keyframe, KeyframeProp, Phase, Presentation } from './schema'

export type Pose = Record<KeyframeProp, number>

export const DEFAULT_POSE: Pose = {
  x: 0,
  y: 0,
  z: 0,
  scale: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  opacity: 1,
}

export type ResolvedKeyframe = { at: number; pose: Pose }

export function resolveKeyframes(keyframes: Keyframe[]): ResolvedKeyframe[] {
  let prev = DEFAULT_POSE
  return keyframes.map((kf) => {
    const pose = { ...prev }
    for (const prop of KEYFRAME_PROPS) {
      const value = kf[prop]
      if (value !== undefined) pose[prop] = value
    }
    prev = pose
    return { at: kf.at, pose }
  })
}

/** Holds the first pose before the first keyframe and the last pose past the last one. */
export function poseAt(keyframes: ResolvedKeyframe[], offset: number): Pose {
  const first = keyframes[0]
  if (offset <= first.at) return first.pose
  const last = keyframes[keyframes.length - 1]
  if (offset >= last.at) return last.pose

  let lo = 0
  let hi = keyframes.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (keyframes[mid].at <= offset) lo = mid
    else hi = mid
  }

  const a = keyframes[lo]
  const b = keyframes[hi]
  const t = (offset - a.at) / (b.at - a.at)
  const pose = {} as Pose
  for (const prop of KEYFRAME_PROPS) {
    pose[prop] = a.pose[prop] + (b.pose[prop] - a.pose[prop]) * t
  }
  return pose
}

const round = (n: number) => Math.round(n * 100) / 100

export type ComponentStyle = { transform: string; opacity: number }

// Values are rounded so that sub-pixel jitter doesn't produce a new string and re-render.
export function poseToStyle(pose: Pose): ComponentStyle {
  return {
    transform:
      `translate3d(${round(pose.x)}px, ${round(pose.y)}px, ${round(pose.z)}px) ` +
      `rotateX(${round(pose.rotateX)}deg) rotateY(${round(pose.rotateY)}deg) ` +
      `rotateZ(${round(pose.rotateZ)}deg) scale(${Math.round(pose.scale * 1000) / 1000})`,
    opacity: round(pose.opacity),
  }
}

export type PhaseRange = { id: string; label: string; start: number; end: number }

export function layoutPhases(phases: Phase[]): PhaseRange[] {
  let start = 0
  return phases.map((phase) => {
    const range = { id: phase.id, label: phase.label, start, end: start + phase.duration }
    start = range.end
    return range
  })
}

/** Scroll offsets that arrow keys snap to and PDF export captures. */
export function stopOffsets(config: Pick<Presentation, 'phases' | 'stops'>): number[] {
  return config.stops ? config.stops.map((stop) => stop.at) : layoutPhases(config.phases).map((r) => r.start)
}

export function trackLength(phases: Phase[]): number {
  return phases.reduce((sum, phase) => sum + phase.duration, 0)
}

export function activePhaseIndex(ranges: PhaseRange[], offset: number): number {
  let index = 0
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].start <= offset) index = i
    else break
  }
  return index
}

export type UnsettledComponent = { phaseId: string; componentId: string; start: number }

/**
 * Lists components that are still mid-motion at a phase's start offset.
 * Present-mode snapping and PDF export both capture phase starts, so any hit
 * here means that frame shows something mid-flight.
 */
export function findUnsettledAtPhaseStarts(config: Presentation): UnsettledComponent[] {
  const ranges = layoutPhases(config.phases)
  const result: UnsettledComponent[] = []
  for (const component of config.components) {
    const keyframes = resolveKeyframes(component.keyframes)
    for (const range of ranges) {
      for (let i = 0; i < keyframes.length - 1; i++) {
        const a = keyframes[i]
        const b = keyframes[i + 1]
        if (a.at < range.start && range.start < b.at) {
          const moving = KEYFRAME_PROPS.some((prop) => a.pose[prop] !== b.pose[prop])
          if (moving) {
            result.push({ phaseId: range.id, componentId: component.id, start: range.start })
          }
          break
        }
      }
    }
  }
  return result
}

export function parseAspectRatio(aspectRatio: string): { width: number; height: number } {
  const [w, h] = aspectRatio.split(':').map(Number)
  const width = 1920
  return { width, height: Math.round((width * h) / w) }
}
