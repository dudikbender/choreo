import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HISTORY_KEEP, HISTORY_PATH, editDiff, historyEntrySchema, parseHistory } from '~/engine/history'
import type { HistoryEntry, HistoryEntryInput } from '~/engine/history'
import { presentationSchema } from '~/engine/schema'
import { parseStory, storyFromPhases } from '~/engine/story'
import type { Story } from '~/engine/story'
import { COMPONENT_PATH, CONFIG_PATH, ID_PATTERN, STORY_PATH, isEditablePath, validateFolder } from './validate'
import type { FolderReport } from './validate'

export const PRESENTATIONS_DIR = path.resolve(process.cwd(), 'presentations')

export type FileChange = { path: string; before: string | null; after: string | null }

export function folderFor(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`invalid presentation id "${id}"`)
  return path.join(PRESENTATIONS_DIR, id)
}

function fileFor(id: string, relative: string): string {
  if (!isEditablePath(relative)) throw new Error(`"${relative}" is not an editable path`)
  return path.join(folderFor(id), relative)
}

export function presentationExists(id: string): boolean {
  return existsSync(folderFor(id))
}

/** Reads every editable file (config + components) of a presentation. */
export async function readEditableFiles(id: string): Promise<Record<string, string>> {
  const folder = folderFor(id)
  const files: Record<string, string> = {}
  if (!existsSync(folder)) return files

  for (const name of [CONFIG_PATH, STORY_PATH]) {
    if (existsSync(path.join(folder, name))) {
      files[name] = await readFile(path.join(folder, name), 'utf8')
    }
  }
  const componentsDir = path.join(folder, 'components')
  if (existsSync(componentsDir)) {
    for (const name of await readdir(componentsDir)) {
      const relative = `components/${name}`
      if (isEditablePath(relative)) {
        files[relative] = await readFile(path.join(componentsDir, name), 'utf8')
      }
    }
  }
  return files
}

export async function listAssets(id: string): Promise<string[]> {
  const assetsDir = path.join(folderFor(id), 'assets')
  if (!existsSync(assetsDir)) return []
  return (await readdir(assetsDir)).filter((name) => !name.startsWith('.')).sort()
}

/**
 * The saved story layout. Presentations made before story.md existed get one seeded
 * from their phases (`saved: false`).
 */
export async function readStory(id: string): Promise<{ story: Story; saved: boolean }> {
  const files = await readEditableFiles(id)
  if (files[STORY_PATH] !== undefined) return { story: parseStory(files[STORY_PATH]), saved: true }
  const parsed = presentationSchema.safeParse(safeJson(files[CONFIG_PATH]))
  return {
    story: parsed.success
      ? storyFromPhases(parsed.data.meta.title, parsed.data.phases)
      : { title: id, theme: '', beats: [] },
    saved: false,
  }
}

function safeJson(raw: string | undefined): unknown {
  try {
    return JSON.parse(raw ?? '')
  } catch {
    return undefined
  }
}

/**
 * Replaces the hand-placed stop points in presentation.json. `null` removes them, so
 * phase starts become the stops again.
 */
export async function updateStops(id: string, offsets: number[] | null): Promise<FolderReport> {
  const files = await readEditableFiles(id)
  const before = files[CONFIG_PATH]
  const raw = safeJson(before)
  if (before === undefined || !raw || typeof raw !== 'object') {
    return { errors: [`${CONFIG_PATH} is missing or not valid JSON`], warnings: [] }
  }

  const { version, meta, phases, stops: _previous, components, ...rest } = raw as Record<string, unknown>
  const sorted = offsets && [...new Set(offsets.map(Math.round))].sort((a, b) => a - b)
  const next = {
    version,
    meta,
    phases,
    ...(sorted?.length ? { stops: sorted.map((at) => ({ at })) } : {}),
    components,
    ...rest,
  }
  const after = `${JSON.stringify(next, null, 2)}\n`
  if (after === before) return { errors: [], warnings: [] }
  return applyChanges(id, [{ path: CONFIG_PATH, before, after }], { create: false })
}

/**
 * Removes a component from presentation.json, and its source file unless another
 * component still renders it.
 */
export async function deleteComponent(id: string, componentId: string): Promise<FolderReport> {
  const files = await readEditableFiles(id)
  const before = files[CONFIG_PATH]
  const raw = safeJson(before) as { components?: { id?: unknown; file?: unknown }[] } | undefined
  if (before === undefined || !raw || !Array.isArray(raw.components)) {
    return { errors: [`${CONFIG_PATH} is missing or not valid JSON`], warnings: [] }
  }

  const target = raw.components.find((c) => c.id === componentId)
  if (!target) return { errors: [`component "${componentId}" does not exist`], warnings: [] }

  const components = raw.components.filter((c) => c !== target)
  const changes: FileChange[] = [
    { path: CONFIG_PATH, before, after: `${JSON.stringify({ ...raw, components }, null, 2)}\n` },
  ]
  const file = typeof target.file === 'string' ? target.file : undefined
  if (file && files[file] !== undefined && !components.some((c) => c.file === file)) {
    changes.push({ path: file, before: files[file], after: null })
  }
  const report = await applyChanges(id, changes, { create: false })
  if (report.errors.length === 0) {
    await appendHistory(id, {
      kind: 'delete-component',
      outcome: 'manual',
      component: componentId,
      request: `Deleted the component "${componentId}"${changes.length > 1 ? ` and ${file}` : ''}.`,
      files: changes.map((c) => c.path),
    })
  }
  return report
}

/** Records a change (applied, discarded or manual) in the presentation's history. */
export async function appendHistory(id: string, entry: Omit<HistoryEntryInput, 'at'>): Promise<void> {
  if (!presentationExists(id)) return
  const parsed = historyEntrySchema.parse({ ...entry, at: new Date().toISOString() })
  const file = path.join(folderFor(id), HISTORY_PATH)
  const kept = existsSync(file) ? parseHistory(await readFile(file, 'utf8')).slice(-(HISTORY_KEEP - 1)) : []
  await writeFile(file, [...kept, parsed].map((e) => `${JSON.stringify(e)}\n`).join(''))
}

/** Writes a component source the designer edited by hand, and logs it. */
export async function saveComponentSource(
  id: string,
  { path: file, before, after, component }: { path: string; before: string; after: string; component: string },
): Promise<FolderReport> {
  if (!COMPONENT_PATH.test(file)) return { errors: [`"${file}" is not a component file`], warnings: [] }
  if (before === after) return { errors: [], warnings: [] }
  const report = await applyChanges(id, [{ path: file, before, after }], { create: false })
  if (report.errors.length === 0) {
    await appendHistory(id, {
      kind: 'manual-edit',
      outcome: 'manual',
      component,
      request: `Edited ${file} by hand.`,
      files: [file],
      handEdits: [{ path: file, diff: editDiff(before, after) }],
    })
  }
  return report
}

export async function readComponentSource(id: string, file: string): Promise<string> {
  if (!COMPONENT_PATH.test(file)) throw new Error(`"${file}" is not a component file`)
  const source = (await readEditableFiles(id))[file]
  if (source === undefined) throw new Error(`${file} does not exist`)
  return source
}

/** The most recent history entries, oldest first; optionally only those touching one component. */
export async function readHistory(id: string, { limit, component }: { limit: number; component?: string }): Promise<HistoryEntry[]> {
  const file = path.join(folderFor(id), HISTORY_PATH)
  if (!existsSync(file)) return []
  const entries = parseHistory(await readFile(file, 'utf8'))
  const relevant = component
    ? entries.filter((e) => e.component === component || e.files.some((f) => f === `components/${component}.tsx`))
    : entries
  return relevant.slice(-limit)
}

/** Removes a presentation folder, assets included. */
export async function deletePresentation(id: string): Promise<void> {
  if (!presentationExists(id)) throw new Error(`presentation "${id}" does not exist`)
  await rm(folderFor(id), { recursive: true, force: true })
}

export type PresentationSummary = {
  id: string
  title: string | null
  phaseCount: number
  componentCount: number
} & FolderReport

export async function listPresentations(): Promise<PresentationSummary[]> {
  if (!existsSync(PRESENTATIONS_DIR)) return []
  const entries = await readdir(PRESENTATIONS_DIR, { withFileTypes: true })
  const ids = entries
    .filter((e) => e.isDirectory() && ID_PATTERN.test(e.name))
    .map((e) => e.name)
    .sort()

  return Promise.all(
    ids.map(async (id) => {
      const files = await readEditableFiles(id)
      const report = validateFolder(files)
      let title: string | null = null
      let phaseCount = 0
      let componentCount = 0
      try {
        const config = JSON.parse(files[CONFIG_PATH] ?? '')
        title = typeof config?.meta?.title === 'string' ? config.meta.title : null
        phaseCount = Array.isArray(config?.phases) ? config.phases.length : 0
        componentCount = Array.isArray(config?.components) ? config.components.length : 0
      } catch {}
      return { id, title, phaseCount, componentCount, ...report }
    }),
  )
}

/**
 * Writes an approved change set. Refuses if any file changed on disk since the
 * proposal was generated, or if the result would not be a valid presentation.
 */
export async function applyChanges(
  id: string,
  changes: FileChange[],
  { create }: { create: boolean },
): Promise<FolderReport> {
  if (create && presentationExists(id)) {
    return { errors: [`a presentation named "${id}" already exists`], warnings: [] }
  }
  if (!create && !presentationExists(id)) {
    return { errors: [`presentation "${id}" does not exist`], warnings: [] }
  }

  const current = await readEditableFiles(id)
  const stale = changes.filter((c) => (current[c.path] ?? null) !== c.before)
  if (stale.length > 0) {
    return {
      errors: stale.map((c) => `${c.path} changed on disk since this proposal was generated`),
      warnings: [],
    }
  }

  const next = { ...current }
  for (const change of changes) {
    if (!isEditablePath(change.path)) {
      return { errors: [`"${change.path}" is not an editable path`], warnings: [] }
    }
    if (change.after === null) delete next[change.path]
    else next[change.path] = change.after
  }
  const report = validateFolder(next)
  if (report.errors.length > 0) return report

  const folder = folderFor(id)
  await mkdir(path.join(folder, 'components'), { recursive: true })
  await mkdir(path.join(folder, 'assets'), { recursive: true })
  for (const change of changes) {
    const target = fileFor(id, change.path)
    if (change.after === null) await rm(target, { force: true })
    else await writeFile(target, change.after)
  }
  return report
}
