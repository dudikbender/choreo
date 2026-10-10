import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HISTORY_CONTEXT_LIMIT } from '~/engine/history'
import type { HistoryEntry } from '~/engine/history'
import { getHistory } from '~/server/functions'

const OUTCOMES: Record<HistoryEntry['outcome'], { label: string; className: string }> = {
  applied: { label: 'Applied', className: 'bg-emerald-950 text-emerald-300' },
  discarded: { label: 'Discarded', className: 'bg-neutral-800 text-neutral-400' },
  manual: { label: 'By you', className: 'bg-sky-950 text-sky-300' },
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Earlier changes to a presentation (or one component), newest first. The most recent ones
 * are what Claude sees as context with the next request.
 */
export function HistoryList({ id, component }: { id: string; component?: string }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getHistory({ data: { id, component } })
      .then((result) => !cancelled && setEntries(result))
      .catch(() => !cancelled && setEntries([]))
    return () => {
      cancelled = true
    }
  }, [id, component])

  if (!entries || entries.length === 0) return null
  const newestFirst = [...entries].reverse()

  return (
    <details className="group rounded-lg border border-neutral-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-neutral-300 select-none hover:text-neutral-100 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-neutral-500 transition-transform group-open:rotate-90" />
        {component ? 'Earlier changes to this component' : 'Recent changes'}
        <span className="text-neutral-500">· {entries.length}</span>
        <span className="ml-auto text-xs text-neutral-500">
          {component
            ? 'Claude sees recent changes'
            : `Claude sees the last ${Math.min(HISTORY_CONTEXT_LIMIT, entries.length)}`}
        </span>
      </summary>
      <ol className="max-h-72 space-y-3 overflow-y-auto border-t border-neutral-800 px-3 py-3">
        {newestFirst.map((entry) => (
          <li key={entry.at + entry.request} className="text-sm">
            <div className="flex items-center gap-2 text-xs">
              <span className={`rounded px-1.5 py-0.5 font-medium ${OUTCOMES[entry.outcome].className}`}>
                {OUTCOMES[entry.outcome].label}
              </span>
              {entry.component && !component && <code className="font-mono text-sky-300">{entry.component}</code>}
              {entry.handEdits && <span className="text-amber-400">hand-edited</span>}
              <time dateTime={entry.at} className="ml-auto text-neutral-500">
                {timeAgo(entry.at)}
              </time>
            </div>
            <p
              className={`mt-1 line-clamp-2 whitespace-pre-wrap ${entry.outcome === 'discarded' ? 'text-neutral-500' : 'text-neutral-200'}`}
            >
              {entry.request}
            </p>
            {entry.summary && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{entry.summary}</p>}
          </li>
        ))}
      </ol>
    </details>
  )
}
