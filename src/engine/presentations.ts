import type { ComponentType, CSSProperties } from 'react'
import { presentationSchema } from './schema'
import type { Presentation } from './schema'

export type SlideComponent = ComponentType<{ style: CSSProperties }>

export const __globs = {
  configs: import.meta.glob<unknown>('/presentations/*/presentation.json', {
    eager: true,
    import: 'default',
  }),
  componentModules: import.meta.glob<{ default: SlideComponent }>(
    '/presentations/*/components/*.tsx',
  ),
}

export const PRESENTATIONS_UPDATED = 'presentations:updated'

/**
 * Importers keep the first instance of this module, but Vite runs the accept callback of the
 * newest one — so the registry lives in hot.data, shared by every instance, or only the first
 * update after a page load would ever reach the app.
 */
const registry: typeof __globs = import.meta.hot?.data.registry ?? { ...__globs }

// Adding or editing presentation files swaps the registry in place instead of
// letting Vite fall back to a full page reload (which would drop editor state).
if (import.meta.hot) {
  import.meta.hot.data.registry = registry
  import.meta.hot.accept((next) => {
    if (!next) return
    Object.assign(registry, next.__globs)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PRESENTATIONS_UPDATED))
  })
}

const idFromPath = (path: string) => path.split('/')[2]

export type LoadResult =
  | { ok: true; id: string; config: Presentation }
  | { ok: false; id: string; errors: string[] }

export function listPresentationIds(): string[] {
  return Object.keys(registry.configs).map(idFromPath).sort()
}

export function loadPresentation(id: string): LoadResult | null {
  const raw = registry.configs[`/presentations/${id}/presentation.json`]
  if (raw === undefined) return null

  const parsed = presentationSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      id,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    }
  }

  const missing = parsed.data.components
    .filter((c) => !registry.componentModules[`/presentations/${id}/${c.file}`])
    .map((c) => `components.${c.id}: file "${c.file}" does not exist`)
  if (missing.length > 0) return { ok: false, id, errors: missing }

  return { ok: true, id, config: parsed.data }
}

export function componentLoader(id: string, file: string) {
  return registry.componentModules[`/presentations/${id}/${file}`]
}
