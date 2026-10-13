import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const root = mkdtempSync(path.join(tmpdir(), 'phases-'))
vi.spyOn(process, 'cwd').mockReturnValue(root)

const { applyChanges, downloadName, forkPresentation, listPresentations, renamePresentation } = await import('./workspace')
const { Workspace, componentOpening, phaseOpening, runTool, stageStory } = await import('./generate')
const { validateFolder } = await import('./validate')

const component = `import type { CSSProperties } from 'react'
export default function Title({ style }: { style: CSSProperties }) {
  return <h1 style={style}>Hi</h1>
}
`

const config = {
  version: 1,
  meta: { title: 'Demo', aspectRatio: '16:9' },
  phases: [{ id: 'intro', label: 'Intro', duration: 1000 }],
  components: [{ id: 'title', file: 'components/title.tsx', keyframes: [{ at: 0 }] }],
}

describe('tool loop + apply', () => {
  let changes: ReturnType<InstanceType<typeof Workspace>['changes']>

  beforeAll(() => {
    const ws = new Workspace({}, [])
    expect(runTool(ws, 'write_component', { name: 'title', source: 'nope(' }).isError).toBe(true)
    expect(runTool(ws, 'write_component', { name: 'title', source: component }).isError).toBeFalsy()
    expect(runTool(ws, 'write_config', { config: { ...config, version: 2 } }).isError).toBe(true)
    expect(runTool(ws, 'write_config', { config }).content).toBe('Wrote presentation.json')
    expect(runTool(ws, 'read_file', { path: '../../etc/passwd' }).isError).toBe(true)
    changes = ws.changes()
  })

  it('stages only valid writes', () => {
    expect(changes.map((c) => [c.path, c.before])).toEqual([
      ['components/title.tsx', null],
      ['presentation.json', null],
    ])
  })

  it('creates a new presentation folder', async () => {
    const report = await applyChanges('demo', changes, { create: true })
    expect(report.errors).toEqual([])
    expect(readFileSync(path.join(root, 'presentations/demo/components/title.tsx'), 'utf8')).toBe(component)
    expect(existsSync(path.join(root, 'presentations/demo/assets'))).toBe(true)
    expect(await listPresentations()).toMatchObject([
      { id: 'demo', title: 'Demo', phaseCount: 1, componentCount: 1, errors: [] },
    ])
  })

  it('refuses to create over an existing presentation', async () => {
    expect((await applyChanges('demo', changes, { create: true })).errors).toHaveLength(1)
  })

  it('str_replace edits an existing file without rewriting it', () => {
    const ws = new Workspace(
      { 'components/title.tsx': component, 'presentation.json': `${JSON.stringify(config, null, 2)}\n` },
      [],
    )
    expect(runTool(ws, 'str_replace', { path: 'components/title.tsx', old_string: 'Hi', new_string: 'Hello' }).content).toMatch(
      /1 replacement/,
    )
    expect(ws.get('components/title.tsx')).toContain('Hello')
    expect(runTool(ws, 'str_replace', { path: 'components/title.tsx', old_string: 'nope', new_string: 'x' }).isError).toBe(
      true,
    )
    expect(
      runTool(ws, 'str_replace', {
        path: 'presentation.json',
        old_string: '"title": "Demo"',
        new_string: '"title": "Renamed"',
      }).isError,
    ).toBeFalsy()
  })

  it('str_replace can set and reject meta.backgroundColor', () => {
    const ws = new Workspace({ 'presentation.json': `${JSON.stringify(config, null, 2)}\n` }, [])
    const add = (color: string) =>
      runTool(ws, 'str_replace', {
        path: 'presentation.json',
        old_string: '"aspectRatio": "16:9"',
        new_string: `"aspectRatio": "16:9",\n    "backgroundColor": "${color}"`,
      })
    expect(add('not a color!!').isError).toBe(true)
    expect(add('#faf6ef').isError).toBeFalsy()
    expect(JSON.parse(ws.get('presentation.json')!).meta.backgroundColor).toBe('#faf6ef')
  })

  it('modifies an existing presentation and rejects stale proposals', async () => {
    const { readEditableFiles } = await import('./workspace')
    const ws = new Workspace(await readEditableFiles('demo'), [])
    runTool(ws, 'write_component', { name: 'title', source: component.replace('Hi', 'Hello') })
    const edit = ws.changes()
    expect(edit).toHaveLength(1)
    expect(edit[0].before).toBe(component)

    expect((await applyChanges('demo', edit, { create: false })).errors).toEqual([])
    expect((await applyChanges('demo', edit, { create: false })).errors[0]).toMatch(/changed on disk/)
  })

  it('refuses changes that would break the folder', async () => {
    const report = await applyChanges(
      'demo',
      [{ path: 'components/title.tsx', before: component.replace('Hi', 'Hello'), after: null }],
      { create: false },
    )
    expect(report.errors[0]).toMatch(/missing file/)
  })

  it('stages story.md, records open transitions and reviews the layout', () => {
    const ws = new Workspace(
      { 'components/title.tsx': component, 'presentation.json': `${JSON.stringify(config, null, 2)}\n` },
      [],
    )
    const story = {
      title: 'Demo',
      theme: 'Short and sweet.',
      beats: [
        { id: 'intro', title: 'Intro', description: 'Say hi.', transition: '' },
        { id: '', title: 'Outro', description: 'Say bye.', transition: '' },
      ],
    }
    const opening = stageStory(ws, { mode: 'modify', id: 'demo', story, notes: '' })
    expect(opening).toMatch(/laid out its story for the first time/)
    expect(ws.get('story.md')).toContain('<!-- phase: outro -->')

    expect(runTool(ws, 'set_transition', { beat: 'outro', text: 'x' }).isError).toBe(true)
    expect(runTool(ws, 'set_transition', { beat: 'intro', text: 'The title folds away.' }).isError).toBeFalsy()
    expect(ws.get('story.md')).toContain('### Transition\n\nThe title folds away.')

    const review = runTool(ws, 'review_story', {}).content
    expect(review).toContain('1. "Intro" — phase "intro"')
    expect(review).toContain('On stage at rest frame: title')
    expect(review).toContain('story beat "outro" has no matching phase')
    expect(validateFolder(ws.files()).warnings).toEqual([
      'story.md: story beat "outro" has no matching phase',
    ])
  })

  it('skips a modification with no story edits and no direction', () => {
    const story = { title: 'Demo', theme: '', beats: [{ id: 'intro', title: 'Intro', description: '', transition: '' }] }
    const ws = new Workspace({ 'story.md': '# Demo\n\n## Intro\n<!-- phase: intro -->\n' }, [])
    expect(stageStory(ws, { mode: 'modify', id: 'demo', story, notes: '' })).toBeNull()
    expect(stageStory(ws, { mode: 'modify', id: 'demo', story, notes: 'Bigger title' })).toMatch(/unchanged/)
    expect(ws.changes()).toEqual([])
  })

  it('quotes the old and new wording of a revised beat', () => {
    const saved = '# Demo\n\n## Intro\n<!-- phase: intro -->\n\nSay hi.\n\n## Outro\n<!-- phase: outro -->\n\nSay bye.\n'
    const ws = new Workspace({ 'story.md': saved }, [])
    const story = {
      title: 'Demo',
      theme: '',
      beats: [
        { id: 'intro', title: 'Intro', description: 'Say hello, warmly.', transition: '' },
        { id: 'outro', title: 'Outro', description: 'Say bye.', transition: '' },
      ],
    }
    const opening = stageStory(ws, { mode: 'modify', id: 'demo', story, notes: '' })
    expect(opening).toContain('- Rewrote beat "Intro"')
    expect(opening).toContain(
      '<edit>\nIn beat "Intro" (phase intro):\n<before>\nSay hi.\n</before>\n<after>\nSay hello, warmly.\n</after>\n</edit>',
    )
    expect(opening).not.toContain('Outro" (phase outro)')
  })

  it('builds a component-scoped instruction with its source and beats', () => {
    const ws = new Workspace(
      {
        'components/title.tsx': component,
        'presentation.json': `${JSON.stringify(config, null, 2)}\n`,
        'story.md': '# Demo\n\n## Hello there\n<!-- phase: intro -->\n',
      },
      [],
    )
    const opening = componentOpening(ws, {
      mode: 'component',
      id: 'demo',
      component: 'title',
      beat: 'intro',
      instruction: 'Make it wave',
    })
    expect(typeof opening).toBe('string')
    expect(opening).toContain('<source>\n' + component.trimEnd())
    expect(opening).toContain('On stage at the rest frame of: "Hello there" (intro)')
    expect(opening).toContain('looking at the beat "Hello there"')
    expect(opening).toContain('Make it wave')
    expect(componentOpening(ws, { mode: 'component', id: 'demo', component: 'nope', instruction: 'x' })).toEqual({
      error: 'There is no component "nope" in this presentation.',
    })
  })

  it('builds a phase-scoped instruction with its beat and the components in it', () => {
    const twoPhases = {
      ...config,
      phases: [
        { id: 'intro', label: 'Intro', duration: 1000 },
        { id: 'outro', label: 'Outro', duration: 500 },
      ],
      components: [
        { id: 'title', file: 'components/title.tsx', keyframes: [{ at: 0 }, { at: 1000, opacity: 0 }] },
        { id: 'bye', file: 'components/bye.tsx', keyframes: [{ at: 0, opacity: 0 }, { at: 1000 }] },
      ],
    }
    const ws = new Workspace(
      {
        'presentation.json': JSON.stringify(twoPhases),
        'story.md':
          '# Demo\n\n## Hello there\n<!-- phase: intro -->\n\nSay hi.\n\n### Transition\n\nFade into the goodbye.\n\n## Outro\n<!-- phase: outro -->\n',
      },
      [],
    )
    const opening = phaseOpening(ws, { mode: 'phase', id: 'demo', phase: 'outro', instruction: 'Hold longer' })
    expect(typeof opening).toBe('string')
    expect(opening).toContain('phase "Outro" (id outro, offsets 1000–1500; it is the last phase)')
    expect(opening).toContain('<component id="bye"')
    expect(opening).toContain('<component id="title"')
    expect(opening).toContain('Hold longer')

    const intro = phaseOpening(ws, { mode: 'phase', id: 'demo', phase: 'intro', instruction: 'x' })
    expect(intro).toContain('Say hi.')
    expect(intro).toContain('### Transition\nFade into the goodbye.')
    expect(phaseOpening(ws, { mode: 'phase', id: 'demo', phase: 'nope', instruction: 'x' })).toEqual({
      error: 'There is no phase "nope" in this presentation.',
    })
  })

  it('refuses paths outside the editable set', async () => {
    const report = await applyChanges(
      'demo',
      [{ path: '../escape.tsx', before: null, after: 'x' }],
      { create: false },
    )
    expect(report.errors[0]).toMatch(/not an editable path/)
  })

  it('saves, validates and resets hand-placed stop points', async () => {
    const { updateStops, readEditableFiles } = await import('./workspace')
    const read = async () => JSON.parse((await readEditableFiles('demo'))['presentation.json'])

    expect((await updateStops('demo', [600, 0, 600.2])).errors).toEqual([])
    const saved = await read()
    expect(saved.stops).toEqual([{ at: 0 }, { at: 600 }])
    expect(Object.keys(saved)).toEqual(['version', 'meta', 'phases', 'stops', 'components'])

    expect((await updateStops('demo', [5000])).errors[0]).toMatch(/past the end of the track/)
    expect((await updateStops('demo', null)).errors).toEqual([])
    expect((await read()).stops).toBeUndefined()
  })

  it('saves variables before components, logs them, and removes an empty set', async () => {
    const { updateVariables, readEditableFiles, readHistory } = await import('./workspace')
    const read = async () => JSON.parse((await readEditableFiles('demo'))['presentation.json'])

    expect((await updateVariables('demo', { clientName: 'Acme' })).errors).toEqual([])
    const saved = await read()
    expect(saved.variables).toEqual({ clientName: 'Acme' })
    expect(Object.keys(saved).slice(-2)).toEqual(['variables', 'components'])

    await updateVariables('demo', { clientName: 'Globex', tagline: 'Hi' })
    const [last] = await readHistory('demo', { limit: 1 })
    expect(last).toMatchObject({ kind: 'variables', outcome: 'manual' })
    expect(last.request).toBe('Changed variables: set clientName to "Globex"; added tagline = "Hi".')

    expect((await updateVariables('demo', { 'Bad Name': 'x' })).errors[0]).toMatch(/camelCase/)
    expect((await updateVariables('demo', {})).errors).toEqual([])
    expect((await read()).variables).toBeUndefined()
  })

  it('write_config keeps existing variables when the model omits them', () => {
    const withVars = { ...config, variables: { clientName: 'Acme' } }
    const ws = new Workspace({ 'presentation.json': `${JSON.stringify(withVars, null, 2)}\n` }, [])
    runTool(ws, 'write_config', { config })
    expect(JSON.parse(ws.get('presentation.json')!).variables).toEqual({ clientName: 'Acme' })
  })

  it('write_config keeps existing stops when the model omits them', () => {
    const withStops = { ...config, stops: [{ at: 250 }] }
    const ws = new Workspace({ 'presentation.json': `${JSON.stringify(withStops, null, 2)}\n` }, [])
    runTool(ws, 'write_config', { config: { ...config, meta: { title: 'Renamed', aspectRatio: '16:9' } } })
    expect(JSON.parse(ws.get('presentation.json')!).stops).toEqual([{ at: 250 }])
    expect(runTool(ws, 'write_config', { config: { ...config, stops: [{ at: 9, }, { at: 3 }] } }).isError).toBe(true)
  })

  it('saves hand edits to a component, validates them and logs them', async () => {
    const { saveComponentSource, readComponentSource, readHistory } = await import('./workspace')
    const path = 'components/title.tsx'
    const before = await readComponentSource('demo', path)
    const edit = (after: string, from = before) =>
      saveComponentSource('demo', { path, before: from, after, component: 'title' })

    expect((await edit(before.replace('<h1', '<h1 <'))).errors[0]).toMatch(/syntax/)
    expect((await edit(before, before)).errors).toEqual([])
    await expect(readComponentSource('demo', 'presentation.json')).rejects.toThrow(/not a component file/)

    const after = before.replace('>Hello<', '>Howdy<')
    expect((await edit(after)).errors).toEqual([])
    expect(await readComponentSource('demo', path)).toBe(after)
    expect((await edit(after.replace('Howdy', 'Yo'))).errors[0]).toMatch(/changed on disk/)

    const [entry] = (await readHistory('demo', { limit: 1 })).slice(-1)
    expect(entry).toMatchObject({ kind: 'manual-edit', outcome: 'manual', component: 'title', files: [path] })
    expect(entry.handEdits?.[0].diff).toContain('+   return <h1 style={style}>Howdy</h1>')
  })

  it('keeps only the most recent history entries', async () => {
    const { appendHistory, readHistory } = await import('./workspace')
    const { HISTORY_KEEP } = await import('~/engine/history')
    for (let i = 0; i < HISTORY_KEEP + 5; i++) {
      await appendHistory('demo', { kind: 'story', outcome: 'applied', request: `change ${i}` })
    }
    const entries = await readHistory('demo', { limit: 1000 })
    expect(entries).toHaveLength(HISTORY_KEEP)
    expect(entries.at(-1)?.request).toBe(`change ${HISTORY_KEEP + 4}`)
  })

  it('manages assets: upload, describe, protect while used, copy and remove', async () => {
    const { saveAssetFile, listAssetEntries, describeAssetEntry, removeAssetEntry, copyAssetEntry } = await import(
      './assets'
    )
    const { readEditableFiles } = await import('./workspace')
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4e, 0x47])
    new DataView(png.buffer).setUint32(16, 200)
    new DataView(png.buffer).setUint32(20, 100)

    await expect(saveAssetFile('demo', 'virus.exe', png)).rejects.toThrow(/aren't supported/)
    const first = await saveAssetFile('demo', 'Team Photo.PNG', png)
    const second = await saveAssetFile('demo', 'team photo.png', png)
    expect([first.name, second.name]).toEqual(['team-photo.png', 'team-photo-2.png'])
    expect(first).toMatchObject({ kind: 'image', width: 200, height: 100, bytes: 24 })

    await describeAssetEntry('demo', first.name, '  The whole team  ')
    expect((await listAssetEntries('demo')).find((a) => a.name === first.name)?.description).toBe('The whole team')

    const files = await readEditableFiles('demo')
    const source = files['components/title.tsx']
    const using = `import photo from '../assets/${first.name}'\n${source}`
    expect((await applyChanges('demo', [{ path: 'components/title.tsx', before: source, after: using }], { create: false })).errors).toEqual([])
    expect((await removeAssetEntry('demo', first.name)).error).toMatch(/Still used by components\/title.tsx/)
    expect((await applyChanges('demo', [{ path: 'components/title.tsx', before: using, after: source }], { create: false })).errors).toEqual([])

    const { mkdirSync, rmSync, writeFileSync } = await import('node:fs')
    mkdirSync(path.join(root, 'presentations/other'), { recursive: true })
    writeFileSync(path.join(root, 'presentations/other/presentation.json'), files['presentation.json'])
    const copied = await copyAssetEntry('demo', first.name, 'other')
    expect(copied).toMatchObject({ name: first.name, description: 'The whole team' })
    expect(existsSync(path.join(root, `presentations/other/assets/${first.name}`))).toBe(true)
    rmSync(path.join(root, 'presentations/other'), { recursive: true })

    expect((await removeAssetEntry('demo', first.name)).error).toBeUndefined()
    expect((await listAssetEntries('demo')).map((a) => a.name)).toEqual([second.name])
    expect(existsSync(path.join(root, `presentations/demo/assets/${first.name}`))).toBe(false)
  })

  it('deletes a component, keeping its file while another component still uses it', async () => {
    const { deleteComponent, readEditableFiles } = await import('./workspace')
    const before = (await readEditableFiles('demo'))['presentation.json']
    const current = JSON.parse(before)
    const twin = { ...current.components[0], id: 'twin' }
    const after = `${JSON.stringify({ ...current, components: [...current.components, twin] }, null, 2)}\n`
    expect((await applyChanges('demo', [{ path: 'presentation.json', before, after }], { create: false })).errors).toEqual([])

    expect((await deleteComponent('demo', 'nope')).errors[0]).toMatch(/does not exist/)
    expect((await deleteComponent('demo', 'twin')).errors).toEqual([])
    let files = await readEditableFiles('demo')
    expect(JSON.parse(files['presentation.json']).components.map((c: { id: string }) => c.id)).toEqual(['title'])
    expect(files['components/title.tsx']).toBeDefined()

    expect((await deleteComponent('demo', 'title')).errors).toEqual([])
    files = await readEditableFiles('demo')
    expect(JSON.parse(files['presentation.json']).components).toEqual([])
    expect(files['components/title.tsx']).toBeUndefined()
  })

  it('deletes a presentation folder and rejects bad ids', async () => {
    const { deletePresentation } = await import('./workspace')
    await expect(deletePresentation('../presentations')).rejects.toThrow(/invalid presentation id/)
    await expect(deletePresentation('nope')).rejects.toThrow(/does not exist/)
    await deletePresentation('demo')
    expect(existsSync(path.join(root, 'presentations/demo'))).toBe(false)
    expect(await listPresentations()).toEqual([])
  })
})

describe('forkPresentation', () => {
  const folder = (id: string) => path.join(root, 'presentations', id)

  beforeAll(() => {
    mkdirSync(path.join(folder('pitch'), 'components'), { recursive: true })
    mkdirSync(path.join(folder('pitch'), 'assets'), { recursive: true })
    writeFileSync(path.join(folder('pitch'), 'presentation.json'), JSON.stringify({ ...config, meta: { ...config.meta, title: 'Pitch' } }))
    writeFileSync(path.join(folder('pitch'), 'components/title.tsx'), component)
    writeFileSync(path.join(folder('pitch'), 'assets/logo.png'), 'png')
    writeFileSync(path.join(folder('pitch'), 'story.md'), '# Pitch\n\nThe theme.\n')
    writeFileSync(path.join(folder('pitch'), 'history.jsonl'), '{}\n')
  })

  it('copies the folder under a new title, without its history', async () => {
    expect(await forkPresentation('pitch')).toEqual({ id: 'pitch-fork', title: 'Pitch (fork)' })
    const copy = folder('pitch-fork')
    expect(JSON.parse(readFileSync(path.join(copy, 'presentation.json'), 'utf8')).meta.title).toBe('Pitch (fork)')
    expect(readFileSync(path.join(copy, 'story.md'), 'utf8')).toBe('# Pitch (fork)\n\nThe theme.\n')
    expect(readFileSync(path.join(copy, 'components/title.tsx'), 'utf8')).toBe(component)
    expect(existsSync(path.join(copy, 'assets/logo.png'))).toBe(true)
    expect(existsSync(path.join(copy, 'history.jsonl'))).toBe(false)
    expect(JSON.parse(readFileSync(path.join(folder('pitch'), 'presentation.json'), 'utf8')).meta.title).toBe('Pitch')
  })

  it('numbers later forks', async () => {
    expect(await forkPresentation('pitch')).toEqual({ id: 'pitch-fork-2', title: 'Pitch (fork 2)' })
  })

  it('refuses a presentation that does not exist', async () => {
    await expect(forkPresentation('missing')).rejects.toThrow('does not exist')
  })
})

describe('renamePresentation', () => {
  const folder = (id: string) => path.join(root, 'presentations', id)

  it('changes the title and story heading, and moves the folder to match', async () => {
    const report = await renamePresentation('pitch-fork', '  Pitch, take two ')
    expect(report).toMatchObject({ errors: [], id: 'pitch-take-two' })
    expect(existsSync(folder('pitch-fork'))).toBe(false)
    expect(JSON.parse(readFileSync(path.join(folder('pitch-take-two'), 'presentation.json'), 'utf8')).meta.title).toBe(
      'Pitch, take two',
    )
    expect(readFileSync(path.join(folder('pitch-take-two'), 'story.md'), 'utf8')).toBe('# Pitch, take two\n\nThe theme.\n')
    expect(readFileSync(path.join(folder('pitch-take-two'), 'history.jsonl'), 'utf8')).toContain(
      'Renamed “Pitch (fork)” to “Pitch, take two”.',
    )
    expect(await downloadName('pitch-take-two')).toBe('pitch-take-two')
  })

  it('numbers the folder when the name is taken', async () => {
    expect(await renamePresentation('pitch-fork-2', 'Pitch')).toMatchObject({ errors: [], id: 'pitch-2' })
    expect(existsSync(folder('pitch'))).toBe(true)
  })

  it('refuses an empty title', async () => {
    expect((await renamePresentation('pitch-take-two', '   ')).errors).toHaveLength(1)
  })
})
