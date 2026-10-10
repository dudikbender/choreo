import { presentationSchema } from '~/engine/schema'
import { parseStory, storyPhaseMismatches } from '~/engine/story'
import type { Story } from '~/engine/story'
import { findUnsettledAtPhaseStarts, layoutPhases, poseAt, resolveKeyframes } from '~/engine/timeline'
import { CONFIG_PATH, STORY_PATH } from './validate'

const VISIBLE = 0.05

/**
 * Renders the whole story layout next to the choreography it maps to: for each beat,
 * its phase range, what is on stage at its rest frame, what enters and exits, and the
 * transition into the next beat.
 */
export function reviewLayout(files: Record<string, string>): string {
  const rawStory = files[STORY_PATH]
  const story: Story | null = rawStory === undefined ? null : parseStory(rawStory)
  const sections: string[] = [
    rawStory === undefined ? `${STORY_PATH} does not exist yet.` : `== ${STORY_PATH} ==\n${rawStory.trim()}`,
  ]

  let json: unknown
  try {
    json = JSON.parse(files[CONFIG_PATH] ?? '')
  } catch {
    sections.push(`${CONFIG_PATH} is missing or not valid JSON, so there is no choreography to review yet.`)
    return sections.join('\n\n')
  }
  const parsed = presentationSchema.safeParse(json)
  if (!parsed.success) {
    sections.push(`${CONFIG_PATH} does not match the schema yet, so there is no choreography to review.`)
    return sections.join('\n\n')
  }

  const config = parsed.data
  const ranges = layoutPhases(config.phases)
  const tracks = config.components.map((c) => ({ id: c.id, keyframes: resolveKeyframes(c.keyframes) }))
  const visibleAt = (offset: number) =>
    tracks.filter((t) => poseAt(t.keyframes, offset).opacity > VISIBLE).map((t) => t.id)
  const beatById = new Map(story?.beats.map((beat) => [beat.id, beat]))
  const list = (ids: string[]) => (ids.length ? ids.join(', ') : 'nothing')

  const lines = [
    `== Layout (${CONFIG_PATH}) ==`,
    `Track length ${ranges.at(-1)?.end ?? 0}; each beat's rest frame is its phase start.`,
    config.stops
      ? `Stop points (placed by the designer; keep them on the same moments): ${config.stops.map((s) => s.at).join(', ')}`
      : 'Stop points: phase starts (default).',
  ]
  ranges.forEach((range, i) => {
    const beat = beatById.get(range.id)
    const next = ranges[i + 1]
    const atStart = visibleAt(range.start)
    const atEnd = visibleAt(range.end)
    const moving = tracks
      .filter((t) => t.keyframes.some((kf) => kf.at > range.start && kf.at < range.end))
      .map((t) => t.id)

    lines.push(
      '',
      `${i + 1}. ${beat ? `"${beat.title}"` : '(no story beat)'} — phase "${range.id}" (label "${range.label}"), ${range.start}–${range.end}`,
      `   On stage at rest frame: ${list(atStart)}`,
      `   Animating during the phase: ${list(moving)}`,
    )
    if (next) {
      const enters = atEnd.filter((id) => !atStart.includes(id))
      const exits = atStart.filter((id) => !atEnd.includes(id))
      const nextBeat = beatById.get(next.id)
      lines.push(
        `   Into "${nextBeat?.title ?? next.label}": enters ${list(enters)}; exits ${list(exits)}`,
        `   Transition in story: ${beat?.transition ? beat.transition.replace(/\s+/g, ' ') : 'left open (choose one and record it with set_transition)'}`,
      )
    }
  })
  sections.push(lines.join('\n'))

  const problems = [
    ...(story ? storyPhaseMismatches(story, config.phases) : []),
    ...findUnsettledAtPhaseStarts(config).map(
      (u) => `"${u.componentId}" is still moving at the rest frame of "${u.phaseId}" (offset ${u.start})`,
    ),
  ]
  sections.push(problems.length ? `== Problems ==\n${problems.map((p) => `- ${p}`).join('\n')}` : '== Problems ==\nNone.')
  return sections.join('\n\n')
}
