import { z } from 'zod'
import type { Phase } from './schema'

/**
 * A story is the narrative layout of a presentation, saved as story.md:
 *
 *   # Title
 *   Theme — the through-line: audience, tone, palette.
 *
 *   ## Beat title
 *   <!-- phase: beat-id -->
 *   What the viewer sees and understands at this beat.
 *
 *   ### Transition
 *   How we move from this beat to the next. Omitted = the model chooses.
 *
 * Each beat maps one-to-one, in order, to the phase with the same id.
 */
export const storyBeatSchema = z.object({
  id: z.string().default(''),
  title: z.string(),
  description: z.string(),
  /** Motion from this beat into the next one. Empty = left to the model. Ignored on the last beat. */
  transition: z.string(),
})

export const storySchema = z.object({
  title: z.string(),
  theme: z.string(),
  beats: z.array(storyBeatSchema),
})

export type StoryBeat = z.infer<typeof storyBeatSchema>
export type Story = z.infer<typeof storySchema>

const BEAT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Gives every beat a unique kebab-case id. Explicit ids win (so renaming a beat keeps
 * its phase); beats without one derive it from their title.
 */
export function assignBeatIds<T extends StoryBeat>(beats: T[]): T[] {
  const used = new Set<string>()
  const claimed = beats.map((beat) => {
    if (!BEAT_ID.test(beat.id) || used.has(beat.id)) return null
    used.add(beat.id)
    return beat.id
  })
  return beats.map((beat, i) => {
    const explicit = claimed[i]
    if (explicit) return { ...beat, id: explicit }
    const base = slugify(beat.title) || `beat-${i + 1}`
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    return { ...beat, id }
  })
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export function serializeStory(story: Story): string {
  const lines = [`# ${oneLine(story.title) || 'Untitled'}`, '']
  if (story.theme.trim()) lines.push(story.theme.trim(), '')

  const beats = assignBeatIds(story.beats)
  beats.forEach((beat, i) => {
    lines.push(`## ${oneLine(beat.title) || `Beat ${i + 1}`}`, `<!-- phase: ${beat.id} -->`, '')
    if (beat.description.trim()) lines.push(beat.description.trim(), '')
    if (i < beats.length - 1 && beat.transition.trim()) {
      lines.push('### Transition', '', beat.transition.trim(), '')
    }
  })
  return `${lines.join('\n').trimEnd()}\n`
}

export function parseStory(markdown: string): Story {
  let title = ''
  const theme: string[] = []
  const beats: { id: string; title: string; description: string[]; transition: string[] }[] = []
  let section: 'description' | 'transition' = 'description'
  let fenced = false

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const current = beats[beats.length - 1]

    if (!fenced) {
      const h1 = /^#\s+(.*)$/.exec(line)
      if (h1 && !title && !current) {
        title = h1[1].trim()
        continue
      }
      const h2 = /^##\s+(.*)$/.exec(line)
      if (h2) {
        beats.push({ id: '', title: h2[1].trim(), description: [], transition: [] })
        section = 'description'
        continue
      }
      const phase = /^\s*<!--\s*phase:\s*([a-z0-9-]+)\s*-->\s*$/.exec(line)
      if (phase && current && !current.id) {
        current.id = phase[1]
        continue
      }
      if (current && /^###\s+transition\b/i.test(line)) {
        section = 'transition'
        continue
      }
    }

    if (!current) theme.push(line)
    else current[section].push(line)
  }

  return {
    title,
    theme: theme.join('\n').trim(),
    beats: assignBeatIds(
      beats.map((beat) => ({
        id: beat.id,
        title: beat.title,
        description: beat.description.join('\n').trim(),
        transition: beat.transition.join('\n').trim(),
      })),
    ),
  }
}

/** Seeds a story for a presentation that predates story.md: one beat per phase. */
export function storyFromPhases(title: string, phases: Pick<Phase, 'id' | 'label'>[]): Story {
  return {
    title,
    theme: '',
    beats: phases.map((phase) => ({
      id: phase.id,
      title: phase.label,
      description: '',
      transition: '',
    })),
  }
}

/** Plain-language list of what changed between two versions of a story. */
export function diffStories(before: Story, after: Story): string[] {
  const changes: string[] = []
  if (oneLine(before.title) !== oneLine(after.title)) {
    changes.push(`Retitled the presentation "${oneLine(after.title)}"`)
  }
  if (before.theme.trim() !== after.theme.trim()) {
    changes.push(after.theme.trim() ? 'Rewrote the theme' : 'Cleared the theme')
  }

  const prev = assignBeatIds(before.beats)
  const next = assignBeatIds(after.beats)
  const prevById = new Map(prev.map((beat) => [beat.id, beat]))
  const nextIds = new Set(next.map((beat) => beat.id))
  const name = (beat: StoryBeat) => `"${oneLine(beat.title) || beat.id}"`

  next.forEach((beat, i) => {
    const old = prevById.get(beat.id)
    if (!old) {
      changes.push(`Added beat ${name(beat)} at position ${i + 1}`)
      return
    }
    if (oneLine(old.title) !== oneLine(beat.title)) {
      changes.push(`Renamed beat ${name(old)} to ${name(beat)}`)
    }
    if (old.description.trim() !== beat.description.trim()) {
      changes.push(
        beat.description.trim() ? `Rewrote beat ${name(beat)}` : `Cleared the description of beat ${name(beat)}`,
      )
    }
  })
  for (const beat of prev) {
    if (!nextIds.has(beat.id)) changes.push(`Removed beat ${name(beat)}`)
  }

  const keptOrderBefore = prev.filter((beat) => nextIds.has(beat.id)).map((beat) => beat.id)
  const keptOrderAfter = next.filter((beat) => prevById.has(beat.id)).map((beat) => beat.id)
  if (keptOrderBefore.join() !== keptOrderAfter.join()) {
    changes.push(`Reordered beats: ${next.map(name).join(' → ')}`)
  }

  const transitionsBefore = new Map(
    prev.slice(0, -1).map((beat, i) => [`${beat.id}>${prev[i + 1].id}`, beat.transition.trim()]),
  )
  next.slice(0, -1).forEach((beat, i) => {
    const pair = `${name(beat)} → ${name(next[i + 1])}`
    const was = transitionsBefore.get(`${beat.id}>${next[i + 1].id}`)
    const now = beat.transition.trim()
    if (was === undefined) {
      changes.push(now ? `New transition ${pair} (described)` : `New transition ${pair} (left open)`)
    } else if (was !== now) {
      changes.push(now ? `Rewrote transition ${pair}` : `Transition ${pair} is now left open`)
    }
  })

  return changes
}

/** Beats and phases must line up one-to-one, in order. */
export function storyPhaseMismatches(story: Story, phases: Phase[]): string[] {
  const problems: string[] = []
  const beatIds = story.beats.map((beat) => beat.id)
  const phaseIds = phases.map((phase) => phase.id)
  for (const id of beatIds) {
    if (!phaseIds.includes(id)) problems.push(`story beat "${id}" has no matching phase`)
  }
  for (const id of phaseIds) {
    if (!beatIds.includes(id)) problems.push(`phase "${id}" has no matching story beat`)
  }
  if (problems.length === 0 && beatIds.join() !== phaseIds.join()) {
    problems.push(`phases are not in story order (expected ${beatIds.join(', ')})`)
  }
  return problems
}
