import { useEffect, useRef } from 'react'
import type { LogEntry } from './useGeneration'

export function ProgressLog({ log, running }: { log: LogEntry[]; running: boolean }) {
  const end = useRef<HTMLLIElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [log.length])

  return (
    <ol className="max-h-80 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm">
      {log.map((entry, i) => (
        <li
          key={i}
          className={
            entry.kind === 'note' ? 'whitespace-pre-wrap text-foreground/80' : 'font-mono text-xs text-subtle-foreground'
          }
        >
          {entry.message}
        </li>
      ))}
      {running && (
        <li ref={end} className="flex items-center gap-2 text-xs text-subtle-foreground">
          <span className="size-2 animate-pulse rounded-full bg-lime-300" /> working
        </li>
      )}
    </ol>
  )
}
