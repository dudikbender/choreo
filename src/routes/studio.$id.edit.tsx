import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { DesignPanel } from '~/home/DesignPanel'
import { getPresentations } from '~/server/functions'

export const Route = createFileRoute('/studio/$id/edit')({
  loader: () => getPresentations(),
  head: ({ loaderData, params }) => {
    const existing = loaderData?.find((p) => p.id === params.id)
    return { meta: [{ title: `Modify ${existing?.title ?? params.id} · Choreo` }] }
  },
  component: EditRoute,
})

function EditRoute() {
  const presentations = Route.useLoaderData()
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const existing = presentations.find((p) => p.id === id)

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← All presentations
        </Link>
        {existing && existing.errors.length === 0 && (
          <Link
            to="/studio/$id/present"
            params={{ id: existing.id }}
            className="rounded-lg border border-input px-3 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            Present
          </Link>
        )}
      </header>

      {existing ? (
        <div className="grid min-h-0 flex-1">
          <DesignPanel
            key={existing.id}
            target={{ mode: 'modify', id: existing.id, title: existing.title ?? existing.id }}
            existingIds={presentations.map((p) => p.id)}
            onTargetChange={(next) =>
              next.mode === 'modify'
                ? navigate({ to: '/studio/$id/edit', params: { id: next.id } })
                : navigate({ to: '/design' })
            }
            onApplied={() => router.invalidate()}
          />
        </div>
      ) : (
        <p className="text-muted-foreground">
          There is no presentation named “{id}”.{' '}
          <Link to="/design" className="underline hover:text-foreground">
            Design a new one
          </Link>
          .
        </p>
      )}
    </main>
  )
}
