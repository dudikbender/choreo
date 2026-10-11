import { useState } from 'react'
import { Button } from '~/components/ui/button'

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
        <div className="rounded-lg border border-border bg-background/60 p-3 text-sm">
          <p className="text-xs font-medium tracking-wide text-subtle-foreground uppercase">
            Changes since last save
          </p>
          {changes.length === 0 ? (
            <p className="mt-1.5 text-subtle-foreground">None yet — edit beats or transitions in the Beats view.</p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-foreground/80">
              {changes.map((change) => (
                <li key={change} className="flex gap-2">
                  <span className="text-sky-600 dark:text-sky-400">•</span>
                  {change}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between gap-3 bg-card px-3 py-2">
          <span className="truncate font-mono text-xs text-muted-foreground">{path}</span>
          <Button
            type="button"
            variant="quiet"
            size="xs"
            onClick={async () => {
              await navigator.clipboard.writeText(markdown)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <pre className="overflow-x-auto bg-background px-4 py-3 font-mono text-xs leading-6 whitespace-pre-wrap">
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
  if (/^#\s/.test(line)) return 'font-semibold text-foreground'
  if (/^##\s/.test(line)) return 'font-semibold text-foreground'
  if (/^###\s+transition/i.test(line)) return 'text-sky-700 dark:text-sky-300'
  if (/^\s*<!--/.test(line)) return 'text-subtle-foreground/70'
  return 'text-muted-foreground'
}
