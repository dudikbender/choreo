import { describe, expect, it } from 'vitest'
import { serializeStory } from '~/engine/story'
import { parseLayout } from './layout'

describe('story layout from a description', () => {
  it('shapes the model output into story beats', () => {
    const layout = parseLayout({
      theme: ' Warm and earthy. ',
      beats: [
        { title: 'Stale beans', description: 'The problem.', transition: 'The bag tears open.' },
        { title: 'How it works', description: 'Three steps.', transition: 'nowhere to go' },
      ],
    })
    expect(layout).toEqual({
      theme: 'Warm and earthy.',
      beats: [
        { id: '', title: 'Stale beans', description: 'The problem.', transition: 'The bag tears open.' },
        { id: '', title: 'How it works', description: 'Three steps.', transition: '' },
      ],
    })
    expect(serializeStory({ title: 'Coffee Club', ...layout! })).toContain('<!-- phase: stale-beans -->')
  })

  it('rejects layouts without usable beats', () => {
    expect(parseLayout(undefined)).toBeNull()
    expect(parseLayout({ theme: 'x', beats: [] })).toBeNull()
    expect(parseLayout({ theme: 'x', beats: [{ title: ' ', description: 'y' }] })).toBeNull()
    expect(parseLayout({ theme: 'x', beats: [{ title: 'A', description: 'y' }] })?.beats[0].transition).toBe('')
  })
})
