import { useEffect, useRef } from 'react'
import type { LogEntry } from './useGeneration'

export function ProgressLog({ log, running }: { log: LogEntry[]; running: boolean }) {
  const end = useRef<HTMLLIElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [log.length])

  return (
    <ol className="max-h-80 space-y-1.5 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm">
      {log.map((entry, i) => (
        <li
          key={i}
          className={
            entry.kind === 'note' ? 'whitespace-pre-wrap text-neutral-300' : 'font-mono text-xs text-neutral-500'
          }
        >
          {entry.message}
        </li>
      ))}
      {running && (
        <li ref={end} className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="size-2 animate-pulse rounded-full bg-lime-300" /> working
        </li>
      )}
    </ol>
  )
}
