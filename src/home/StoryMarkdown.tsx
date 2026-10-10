import { useState } from 'react'

/** Read-only review of the whole story layout as it will be saved to story.md. */
export function StoryMarkdown({
  markdown,
  path,
  changes,
}: {
  markdown: string
  path: string
  /** Beat-level changes since the saved version; omitted when creating. */
  changes?: string[]
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="space-y-4">
      {changes && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-sm">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Changes since last save
          </p>
          {changes.length === 0 ? (
            <p className="mt-1.5 text-neutral-500">None yet — edit beats or transitions in the Beats view.</p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-neutral-300">
              {changes.map((change) => (
                <li key={change} className="flex gap-2">
                  <span className="text-sky-400">•</span>
                  {change}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <div className="flex items-center justify-between gap-3 bg-neutral-900 px-3 py-2">
          <span className="truncate font-mono text-xs text-neutral-400">{path}</span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(markdown)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }}
            className="shrink-0 rounded-md px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="overflow-x-auto bg-neutral-950 px-4 py-3 font-mono text-xs leading-6 whitespace-pre-wrap">
          {markdown.split('\n').map((line, i) => (
            <div key={i} className={lineStyle(line)}>
              {line || '\u00a0'}
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

function lineStyle(line: string): string {
  if (/^#\s/.test(line)) return 'font-semibold text-white'
  if (/^##\s/.test(line)) return 'font-semibold text-neutral-100'
  if (/^###\s+transition/i.test(line)) return 'text-sky-300'
  if (/^\s*<!--/.test(line)) return 'text-neutral-600'
  return 'text-neutral-400'
}
