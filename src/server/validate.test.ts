import { describe, expect, it } from 'vitest'
import { validateComponentSource, validateFolder } from './validate'

const good = `import type { CSSProperties } from 'react'
import logo from '../assets/logo.svg'

export default function Title({ style }: { style: CSSProperties }) {
  return <h1 style={style} className="text-8xl"><img src={logo} />Hi</h1>
}
`

const config = (components: unknown[]) =>
  JSON.stringify({
    version: 1,
    meta: { title: 'T', aspectRatio: '16:9' },
    phases: [
      { id: 'a', label: 'A', duration: 1000 },
      { id: 'b', label: 'B', duration: 1000 },
    ],
    components,
  })

describe('validateComponentSource', () => {
  it('accepts a contract-following component', () => {
    expect(validateComponentSource(good)).toEqual([])
  })

  it('accepts `const X = ...; export default X`', () => {
    const src = `const X = ({ style }: any) => <div style={style} />\nexport default X\n`
    expect(validateComponentSource(src)).toEqual([])
  })

  it('reports syntax errors', () => {
    expect(validateComponentSource('export default function () { return <div style={style}> }')[0]).toMatch(
      /^syntax:/,
    )
  })

  it('rejects third-party and sibling imports', () => {
    const src = `import { motion } from 'framer-motion'\nimport Other from './other'\n${good}`
    expect(validateComponentSource(src)).toHaveLength(2)
  })

  it('requires a default export and a style prop', () => {
    expect(validateComponentSource('export function A() { return <div /> }')).toEqual([
      'must default-export a React component',
      'must accept a `style` prop and apply it to its root element',
    ])
  })

  it('rejects reading scroll position', () => {
    const src = good.replace('return', 'console.log(window.scrollY); return')
    expect(validateComponentSource(src)).toHaveLength(1)
  })
})

describe('validateFolder', () => {
  it('passes a complete folder', () => {
    const report = validateFolder({
      'presentation.json': config([
        { id: 'title', file: 'components/title.tsx', keyframes: [{ at: 0 }] },
      ]),
      'components/title.tsx': good,
    })
    expect(report).toEqual({ errors: [], warnings: [] })
  })

  it('flags missing component files and unused ones', () => {
    const report = validateFolder({
      'presentation.json': config([
        { id: 'title', file: 'components/title.tsx', keyframes: [{ at: 0 }] },
      ]),
      'components/extra.tsx': good,
    })
    expect(report.errors).toHaveLength(1)
    expect(report.warnings).toEqual(['components/extra.tsx is not used by presentation.json'])
  })

  it('warns when a component is mid-flight at a phase start', () => {
    const report = validateFolder({
      'presentation.json': config([
        {
          id: 'title',
          file: 'components/title.tsx',
          keyframes: [{ at: 500, x: 0 }, { at: 1500, x: 100 }],
        },
      ]),
      'components/title.tsx': good,
    })
    expect(report.errors).toEqual([])
    expect(report.warnings).toHaveLength(1)
  })

  it('reports invalid JSON', () => {
    expect(validateFolder({ 'presentation.json': '{' }).errors[0]).toMatch(/invalid JSON/)
  })
})
