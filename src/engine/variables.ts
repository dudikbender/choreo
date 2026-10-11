import type { Variables } from './schema'

const REFERENCE = /\bvars\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)|\bvars\s*(?:\?\.)?\[\s*(['"`])([^'"`]+)\2\s*\]/g

/** Variable names a component reads, as `vars.name` or `vars['name']`. */
export function variableReferences(source: string): string[] {
  const names = new Set<string>()
  for (const match of source.matchAll(REFERENCE)) names.add(match[1] ?? match[3])
  return [...names]
}

/** "Client name" → "clientName". */
export function toVariableName(input: string): string {
  return input
    .replace(/^[^A-Za-z]+/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word[0].toLowerCase() : word[0].toUpperCase()) + word.slice(1))
    .join('')
}

/** The JSX expression to paste into a component to show a variable. */
export function variableSnippet(name: string): string {
  return `{vars.${name}}`
}

/** The variables block added to Claude's opening message. */
export function formatVariables(variables: Variables | undefined): string {
  const entries = Object.entries(variables ?? {})
  if (entries.length === 0) return ''
  return [
    '<variables note="Text values the designer set in presentation.json. Components show them with {vars.<name>}; use a variable instead of typing its value.">',
    ...entries.map(([name, value]) => `${name}: ${JSON.stringify(value)}`),
    '</variables>',
  ].join('\n')
}
