import { describe, expect, it } from 'vitest'
import {
  assignBeatIds,
  diffStories,
  parseStory,
  serializeStory,
  storyFromPhases,
  storyPhaseMismatches,
  storyTextEdits,
} from './story'
import type { Story } from './story'

const story: Story = {
  title: 'Coffee Club',
  theme: 'A warm, earthy pitch.\n\nAudience: busy commuters.',
  beats: [
    { id: 'hero', title: 'Fresh roasted', description: 'Big title; beans drift in.', transition: 'Beans scatter outward.' },
    { id: '', title: 'How it works', description: '- Pick\n- Brew\n\n### Details\nThree steps.', transition: '' },
    { id: '', title: 'Pricing', description: '', transition: 'ignored on the last beat' },
  ],
}

describe('story markdown', () => {
  it('round-trips through markdown', () => {
    const markdown = serializeStory(story)
    expect(markdown).toContain('## Fresh roasted\n<!-- phase: hero -->')
    expect(markdown).toContain('<!-- phase: how-it-works -->')
    expect(markdown).not.toContain('ignored on the last beat')

    const parsed = parseStory(markdown)
    expect(parsed.title).toBe('Coffee Club')
    expect(parsed.theme).toBe(story.theme)
    expect(parsed.beats.map((b) => b.id)).toEqual(['hero', 'how-it-works', 'pricing'])
    expect(parsed.beats[0].transition).toBe('Beans scatter outward.')
    expect(parsed.beats[1].description).toBe('- Pick\n- Brew\n\n### Details\nThree steps.')
    expect(serializeStory(parsed)).toBe(markdown)
  })

  it('tolerates hand-written markdown', () => {
    const parsed = parseStory('# Talk\n\n## Intro\nHello\n\n```\n## not a beat\n```\n### transition\nfade\n## Outro\n')
    expect(parsed.beats.map((b) => [b.id, b.transition])).toEqual([
      ['intro', 'fade'],
      ['outro', ''],
    ])
    expect(parsed.beats[0].description).toContain('## not a beat')
  })

  it('keeps explicit ids stable and dedupes derived ones', () => {
    const beats = assignBeatIds([
      { id: '', title: 'Hero', description: '', transition: '' },
      { id: 'hero', title: 'Renamed', description: '', transition: '' },
      { id: '', title: '🙂', description: '', transition: '' },
    ])
    expect(beats.map((b) => b.id)).toEqual(['hero-2', 'hero', 'beat-3'])
  })
})

describe('story changes', () => {
  it('describes beat, order and transition edits', () => {
    const before = parseStory(serializeStory(story))
    const after: Story = {
      ...before,
      beats: [
        before.beats[1],
        { ...before.beats[0], title: 'Freshly roasted', transition: '' },
        { id: '', title: 'Sign up', description: 'CTA', transition: '' },
      ],
    }
    expect(diffStories(before, after)).toEqual([
      'Renamed beat "Fresh roasted" to "Freshly roasted"',
      'Added beat "Sign up" at position 3',
      'Removed beat "Pricing"',
      'Reordered beats: "How it works" → "Freshly roasted" → "Sign up"',
      'New transition "How it works" → "Freshly roasted" (left open)',
      'New transition "Freshly roasted" → "Sign up" (left open)',
    ])
    expect(diffStories(before, before)).toEqual([])
  })

  it('keeps the old and new wording of rewritten text', () => {
    const before = parseStory(serializeStory(story))
    const [hero, how, pricing] = before.beats
    const reworded: Story = {
      ...before,
      beats: [{ ...hero, title: 'Freshly roasted', description: 'Big title; beans fall in.', transition: 'Beans swirl.' }, how, pricing],
    }
    expect(storyTextEdits(before, reworded)).toEqual([
      { what: 'beat "Freshly roasted" (phase hero)', before: 'Big title; beans drift in.', after: 'Big title; beans fall in.' },
      { what: 'transition "Freshly roasted" → "How it works"', before: 'Beans scatter outward.', after: 'Beans swirl.' },
    ])

    expect(storyTextEdits(before, { ...before, beats: [hero, pricing] })).toEqual([
      { what: 'beat "How it works" (phase how-it-works), removed', before: how.description, after: '' },
    ])
    expect(storyTextEdits(before, before)).toEqual([])
  })

  it('checks beats against phases', () => {
    const config = {
      phases: [
        { id: 'a', label: 'A', duration: 100 },
        { id: 'b', label: 'B', duration: 100 },
      ],
    }
    const seeded = storyFromPhases('T', config.phases)
    expect(storyPhaseMismatches(seeded, config.phases)).toEqual([])
    expect(storyPhaseMismatches({ ...seeded, beats: [...seeded.beats].reverse() }, config.phases)).toEqual([
      'phases are not in story order (expected b, a)',
    ])
    expect(storyPhaseMismatches({ ...seeded, beats: seeded.beats.slice(1) }, config.phases)).toEqual([
      'phase "a" has no matching story beat',
    ])
  })
})
