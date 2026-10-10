import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadPresentation } from '~/engine/presentations'
import type { Presentation } from '~/engine/schema'
import {
  activePhaseIndex,
  layoutPhases,
  parseAspectRatio,
  poseAt,
  poseToStyle,
  resolveKeyframes,
  stopOffsets,
} from '~/engine/timeline'
import { useExportPdf } from '~/home/useExportPdf'
import { useComponentModules } from '~/present/PresentMode'

/**
 * Every stop point rendered as its own page, straight from the keyframes (no scrolling).
 * The PDF export loads this with ?pdf=1 and prints it with headless Chrome; on screen it's a
 * preview with a browser-print fallback.
 */
export const Route = createFileRoute('/studio/$id/print')({
  validateSearch: (search: Record<string, unknown>): { pdf?: 1 } =>
    search.pdf === 1 || search.pdf === '1' ? { pdf: 1 } : {},
  loader: ({ params }) => {
    const result = loadPresentation(params.id)
    if (!result) throw notFound()
    return result
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.ok ? `${loaderData.config.meta.title} · Export` : 'Invalid presentation' }],
  }),
  component: PrintRoute,
})

function PrintRoute() {
  const initial = Route.useLoaderData()
  const { pdf } = Route.useSearch()
  // The loader may run against the server's registry during SSR; trust the client's.
  const [result, setResult] = useState(initial)
  useEffect(() => {
    const next = loadPresentation(initial.id)
    if (next) setResult(next)
  }, [initial.id])

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16" data-print-error="invalid presentation.json">
        <h1 className="text-xl font-semibold">“{result.id}” has an invalid presentation.json</h1>
      </main>
    )
  }
  return <PrintPages id={result.id} config={result.config} chrome={!pdf} />
}

function PrintPages({ id, config, chrome }: { id: string; config: Presentation; chrome: boolean }) {
  const { width, height } = parseAspectRatio(config.meta.aspectRatio)
  const modules = useComponentModules(
    id,
    config.components.map((c) => c.file),
  )
  const stops = useMemo(() => stopOffsets(config), [config])
  const ranges = useMemo(() => layoutPhases(config.phases), [config.phases])
  const components = useMemo(
    () => config.components.map((c) => ({ ...c, resolved: resolveKeyframes(c.keyframes) })),
    [config.components],
  )
  const root = useRef<HTMLDivElement>(null)
  useMarkReady(modules !== null, root)

  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    if (!chrome) return
    const fit = () => setScale(Math.min(1, (Math.min(window.innerWidth, 1400) - 64) / width))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [chrome, width])

  const background = config.meta.backgroundColor

  return (
    <>
      <style>{`@page { size: ${width}px ${height}px; margin: 0 } @media print { html, body { background: ${background ?? '#171717'} !important } }`}</style>
      {chrome && <Toolbar id={id} title={config.meta.title} count={stops.length} />}
      <div
        ref={root}
        className={chrome ? 'flex flex-col items-center gap-8 px-8 pt-24 pb-16 print:block print:p-0' : ''}
      >
        {stops.map((at, index) => {
          const phase = ranges[activePhaseIndex(ranges, at)]
          return (
            <figure key={`${at}-${index}`} className="m-0 break-after-page print:m-0">
              {chrome && (
                <figcaption className="mb-2 flex items-baseline gap-2 text-xs text-neutral-500 print:hidden">
                  <span className="font-medium text-neutral-300">Page {index + 1}</span>
                  <span>{phase?.label}</span>
                  <span className="font-mono">@{at.toLocaleString()}</span>
                </figcaption>
              )}
              <div
                className={chrome ? 'overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10 print:rounded-none print:shadow-none print:ring-0' : ''}
                style={chrome ? { width: width * scale, height: height * scale } : undefined}
              >
                <div
                  className={`relative origin-top-left overflow-hidden contain-strict [perspective:1600px] ${chrome ? '[transform:scale(var(--scale))] print:[transform:none]' : ''}`}
                  style={{ width, height, backgroundColor: background, ['--scale' as string]: scale }}
                >
                  {modules &&
                    components.map((component) => {
                      const Component = modules[component.file]
                      if (!Component) return null
                      return (
                        <div
                          key={component.id}
                          className="pointer-events-none absolute inset-0 flex items-center justify-center [transform-style:preserve-3d]"
                        >
                          <Component style={poseToStyle(poseAt(component.resolved, at))} />
                        </div>
                      )
                    })}
                </div>
              </div>
            </figure>
          )
        })}
      </div>
    </>
  )
}

/** Sets data-print-ready on <html> once components, fonts, images and videos have loaded. */
function useMarkReady(loaded: boolean, root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!loaded || !root.current) return
    let cancelled = false
    const container = root.current
    const settle = <T,>(promise: Promise<T>) => Promise.race([promise, new Promise((r) => setTimeout(r, 10_000))])
    const media = async () => {
      await document.fonts.ready
      const images = [...container.querySelectorAll('img')].map((img) => settle(img.decode().catch(() => {})))
      const videos = [...container.querySelectorAll('video')].map((video) =>
        video.readyState >= 2
          ? Promise.resolve()
          : settle(new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }))),
      )
      await Promise.all([...images, ...videos])
      // Two frames so the final layout is painted before Chrome prints.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    }
    void media().then(() => {
      if (!cancelled) document.documentElement.dataset.printReady = 'true'
    })
    return () => {
      cancelled = true
      delete document.documentElement.dataset.printReady
    }
  }, [loaded, root])
}

function Toolbar({ id, title, count }: { id: string; title: string; count: number }) {
  const { exporting, error, exportPdf } = useExportPdf()
  return (
    <header className="fixed inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/90 px-6 py-3 backdrop-blur print:hidden">
      <Link to="/" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100" aria-label="Back">
        <ArrowLeft className="size-4" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-medium">{title}</h1>
        <p className="text-xs text-neutral-500">
          {count} page{count === 1 ? '' : 's'} · one per stop point
          {error && <span className="ml-2 text-red-400">{error}</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
      >
        <Printer className="size-4" />
        Print…
      </button>
      <button
        type="button"
        onClick={() => void exportPdf(id)}
        disabled={exporting}
        className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:opacity-50"
      >
        <Download className="size-4" />
        {exporting ? 'Exporting…' : 'Download PDF'}
      </button>
    </header>
  )
}
