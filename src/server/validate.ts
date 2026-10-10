import { parseSync } from 'oxc-parser'
import { presentationSchema } from '~/engine/schema'
import { parseStory, storyPhaseMismatches } from '~/engine/story'
import { findUnsettledAtPhaseStarts } from '~/engine/timeline'

export const CONFIG_PATH = 'presentation.json'
export const STORY_PATH = 'story.md'
export const COMPONENT_PATH = /^components\/[a-z0-9]+(?:-[a-z0-9]+)*\.tsx$/
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const ALLOWED_IMPORT = /^(react|\.\.\/assets\/[A-Za-z0-9_.-]+)$/

export function isEditablePath(path: string): boolean {
  return path === CONFIG_PATH || path === STORY_PATH || COMPONENT_PATH.test(path)
}

/** Checks a component file against the authoring contract (see PLAN.md §3). */
export function validateComponentSource(source: string): string[] {
  const { errors: syntaxErrors, module } = parseSync('component.tsx', source)
  if (syntaxErrors.length > 0) return syntaxErrors.map((e) => `syntax: ${e.message}`)

  const errors: string[] = []
  for (const { moduleRequest } of module.staticImports) {
    if (!ALLOWED_IMPORT.test(moduleRequest.value)) {
      errors.push(
        `imports "${moduleRequest.value}" — only "react" and "../assets/<file>" are allowed`,
      )
    }
  }
  if (module.dynamicImports.length > 0 || /\brequire\(/.test(source)) {
    errors.push('must not use dynamic import() or require()')
  }
  const hasDefaultExport = module.staticExports.some((e) =>
    e.entries.some((entry) => entry.exportName.kind === 'Default'),
  )
  if (!hasDefaultExport) errors.push('must default-export a React component')
  if (!/\bstyle\b/.test(source)) {
    errors.push('must accept a `style` prop and apply it to its root element')
  }
  if (/\bscroll(Y|Top|To)\b|addEventListener\(\s*['"]scroll/.test(source)) {
    errors.push('must not read scroll position — the engine passes the resolved transform via `style`')
  }
  return errors
}

export type FolderReport = { errors: string[]; warnings: string[] }

/** Validates a whole presentation folder, given as path → contents. */
export function validateFolder(files: Record<string, string>): FolderReport {
  const errors: string[] = []
  const warnings: string[] = []

  for (const [path, source] of Object.entries(files)) {
    if (COMPONENT_PATH.test(path)) {
      for (const error of validateComponentSource(source)) errors.push(`${path}: ${error}`)
    }
  }

  const rawConfig = files[CONFIG_PATH]
  if (rawConfig === undefined) {
    errors.push(`${CONFIG_PATH} is missing`)
    return { errors, warnings }
  }

  let json: unknown
  try {
    json = JSON.parse(rawConfig)
  } catch (error) {
    errors.push(`${CONFIG_PATH}: invalid JSON (${(error as Error).message})`)
    return { errors, warnings }
  }

  const parsed = presentationSchema.safeParse(json)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${CONFIG_PATH}: ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    }
    return { errors, warnings }
  }

  for (const component of parsed.data.components) {
    if (files[component.file] === undefined) {
      errors.push(`${CONFIG_PATH}: component "${component.id}" points at missing file ${component.file}`)
    }
  }
  const referenced = new Set(parsed.data.components.map((c) => c.file))
  for (const path of Object.keys(files)) {
    if (COMPONENT_PATH.test(path) && !referenced.has(path)) {
      warnings.push(`${path} is not used by ${CONFIG_PATH}`)
    }
  }
  for (const u of findUnsettledAtPhaseStarts(parsed.data)) {
    warnings.push(
      `"${u.componentId}" is still moving at the start of phase "${u.phaseId}" (offset ${u.start})`,
    )
  }
  const story = files[STORY_PATH]
  if (story !== undefined) {
    for (const problem of storyPhaseMismatches(parseStory(story), parsed.data.phases)) {
      warnings.push(`${STORY_PATH}: ${problem}`)
    }
  }

  return { errors, warnings }
}
