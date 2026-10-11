import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PRESENTATIONS_UPDATED, loadPresentation } from '~/engine/presentations'
import type { LoadResult } from '~/engine/presentations'
import { PresentMode } from '~/present/PresentMode'

export const Route = createFileRoute('/studio/$id/present')({
  loader: ({ params }) => {
    const result = loadPresentation(params.id)
    if (!result) throw notFound()
    return result
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.ok ? loaderData.config.meta.title : 'Invalid presentation' }],
  }),
  component: PresentRoute,
})

function PresentRoute() {
  const result = Route.useLoaderData()
  return <LivePresentation key={result.id} initial={result} />
}

/**
 * Re-reads the registry when presentation files change instead of calling router.invalidate():
 * the router scrolls the window to the top after every load, which would throw the viewer back
 * to the start of the track on each edit.
 */
function LivePresentation({ initial }: { initial: LoadResult }) {
  const [result, setResult] = useState(initial)

  useEffect(() => {
    const refresh = () => {
      const next = loadPresentation(initial.id)
      if (next) setResult(next)
    }
    // The loader data may come from the server's registry during SSR; trust the client's.
    refresh()
    window.addEventListener(PRESENTATIONS_UPDATED, refresh)
    return () => window.removeEventListener(PRESENTATIONS_UPDATED, refresh)
  }, [initial.id])

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-xl font-semibold">“{result.id}” has an invalid presentation.json</h1>
        <ul className="mt-4 space-y-1 font-mono text-sm text-red-600 dark:text-red-400">
          {result.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
        <Link to="/" className="mt-8 inline-block text-muted-foreground underline">
          Back
        </Link>
      </main>
    )
  }

  return (
    <PresentMode
      id={result.id}
      config={result.config}
      onConfigSaved={(update) =>
        setResult((current) => (current.ok ? { ...current, config: update(current.config) } : current))
      }
    />
  )
}
