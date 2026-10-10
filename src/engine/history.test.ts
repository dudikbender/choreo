import { describe, expect, it } from 'vitest'
import { editDiff, formatHistory, parseHistory } from './history'

const entry = {
  at: '2026-10-10T17:00:00.000Z',
  kind: 'component',
  outcome: 'applied',
  request: 'make the subtitle darker',
  component: 'hero-title',
  summary: 'Changed text-neutral-500 to text-neutral-600.',
  files: ['components/hero-title.tsx'],
}

describe('parseHistory', () => {
  it('reads one entry per line and skips blank or broken lines', () => {
    const raw = [JSON.stringify(entry), '', '{not json', JSON.stringify({ ...entry, kind: 'nope' }), JSON.stringify(entry)].join('\n')
    expect(parseHistory(raw)).toHaveLength(2)
  })

  it('clips very long text', () => {
    const [parsed] = parseHistory(JSON.stringify({ ...entry, request: 'x'.repeat(5000) }))
    expect(parsed.request.length).toBeLessThan(2100)
  })
})

describe('editDiff', () => {
  it('keeps only the changed lines', () => {
    const proposed = 'a\nb\n<p className="text-neutral-600">\nc\n'
    const kept = 'a\nb\n<p className="text-neutral-700">\nc\n'
    expect(editDiff(proposed, kept)).toBe('- <p className="text-neutral-600">\n+ <p className="text-neutral-700">')
  })

  it('caps long diffs', () => {
    const proposed = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
    const diff = editDiff(proposed, '')
    expect(diff.split('\n')).toHaveLength(25)
    expect(diff).toContain('more changed lines')
  })
})

describe('formatHistory', () => {
  it('is empty without entries', () => {
    expect(formatHistory([])).toBe('')
  })

  it('labels discards and hand edits', () => {
    const [applied] = parseHistory(
      JSON.stringify({ ...entry, handEdits: [{ path: 'components/hero-title.tsx', diff: '- 600\n+ 700' }] }),
    )
    const [discarded] = parseHistory(JSON.stringify({ ...entry, outcome: 'discarded', request: 'add a glow' }))
    const text = formatHistory([applied, discarded])
    expect(text).toContain('<history')
    expect(text).toContain('component="hero-title"')
    expect(text).toContain('hand-edited your components/hero-title.tsx')
    expect(text).toContain('outcome="DISCARDED by the designer"')
    expect(text.indexOf('make the subtitle darker')).toBeLessThan(text.indexOf('add a glow'))
  })
})
