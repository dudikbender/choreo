import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { DesignPanel } from '~/home/DesignPanel'
import type { DesignTarget } from '~/home/DesignPanel'
import { getPresentations } from '~/server/functions'

export const Route = createFileRoute('/design')({
  validateSearch: (search: Record<string, unknown>): { id?: string } =>
    typeof search.id === 'string' && search.id ? { id: search.id } : {},
  loader: () => getPresentations(),
  head: () => ({ meta: [{ title: 'Design · Phases' }] }),
  component: DesignRoute,
})

function DesignRoute() {
  const presentations = Route.useLoaderData()
  const { id } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()

  const existing = id ? presentations.find((p) => p.id === id) : undefined
  const target: DesignTarget = existing
    ? { mode: 'modify', id: existing.id, title: existing.title ?? existing.id }
    : { mode: 'create' }

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← All presentations
        </Link>
        {existing && existing.errors.length === 0 && (
          <Link
            to="/studio/$id/present"
            params={{ id: existing.id }}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Present
          </Link>
        )}
      </header>

      {id && !existing ? (
        <p className="text-neutral-400">
          There is no presentation named “{id}”.{' '}
          <Link to="/design" className="underline hover:text-neutral-200">
            Design a new one
          </Link>
          .
        </p>
      ) : (
        <div className="grid min-h-0 flex-1">
          <DesignPanel
            key={target.mode === 'modify' ? target.id : 'create'}
            target={target}
            existingIds={presentations.map((p) => p.id)}
            onTargetChange={(next) =>
              navigate({ to: '/design', search: next.mode === 'modify' ? { id: next.id } : {} })
            }
            onApplied={() => router.invalidate()}
          />
        </div>
      )}
    </main>
  )
}
