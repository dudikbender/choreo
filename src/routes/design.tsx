import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { DesignPanel } from '~/home/DesignPanel'
import { getPresentations } from '~/server/functions'

export const Route = createFileRoute('/design')({
  loader: () => getPresentations(),
  head: () => ({ meta: [{ title: 'New presentation · Choreo' }] }),
  component: DesignRoute,
})

function DesignRoute() {
  const presentations = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← All presentations
        </Link>
      </header>

      <div className="grid min-h-0 flex-1">
        <DesignPanel
          target={{ mode: 'create' }}
          existingIds={presentations.map((p) => p.id)}
          onTargetChange={(next) => {
            if (next.mode === 'modify') navigate({ to: '/studio/$id/edit', params: { id: next.id } })
          }}
          onApplied={() => router.invalidate()}
        />
      </div>
    </main>
  )
}
