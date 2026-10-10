import { Suspense, memo, useEffect, useMemo, useRef, useState } from 'react'
import { componentLoader } from '~/engine/presentations'
import type { SlideComponent } from '~/engine/presentations'
import type { Presentation } from '~/engine/schema'
import { useComponentStyle, useScrollStore } from '~/engine/scroll-store'
import {
  activePhaseIndex,
  findUnsettledAtPhaseStarts,
  layoutPhases,
  parseAspectRatio,
  resolveKeyframes,
  stopOffsets,
  trackLength,
} from '~/engine/timeline'
import type { PhaseRange, ResolvedKeyframe } from '~/engine/timeline'
import { ComponentContextMenu, SLOT_ATTRIBUTE } from './ComponentContextMenu'
import { AutoplayPausedNotice, FullscreenAutoplayButton, LoopFade } from './AutoplayControls'
import { PresentControls } from './PresentControls'
import { easeInOutCubic, useAutoplay } from './useAutoplay'

/**
 * Resolves component modules up front instead of via lazy/Suspense, so a config reload keeps
 * showing the current components until the new set is ready. Unchanged modules resolve to the
 * same function from the module cache, so they stay mounted.
 */
export function useComponentModules(id: string, files: string[]): Record<string, SlideComponent> | null {
  const [modules, setModules] = useState<Record<string, SlideComponent> | null>(null)
  const key = files.join('\n')

  useEffect(() => {
    let cancelled = false
    Promise.all(
      key.split('\n').map(async (file) => [file, (await componentLoader(id, file)()).default] as const),
    ).then((entries) => {
      if (!cancelled) setModules(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [id, key])

  return modules
}

const NEXT_KEYS = new Set(['ArrowDown', 'ArrowRight', 'PageDown', ' '])
const PREV_KEYS = new Set(['ArrowUp', 'ArrowLeft', 'PageUp'])

export function PresentMode({
  id,
  config,
  onConfigSaved,
}: {
  id: string
  config: Presentation
  onConfigSaved: (update: (config: Presentation) => Presentation) => void
}) {
  const ranges = useMemo(() => layoutPhases(config.phases), [config.phases])
  const total = trackLength(config.phases)
  const stageSize = parseAspectRatio(config.meta.aspectRatio)
  const fullscreen = useFullscreen()

  const modules = useComponentModules(
    id,
    config.components.map((c) => c.file),
  )
  const slots = useMemo(
    () =>
      config.components.flatMap((component) => {
        const Component = modules?.[component.file]
        return Component ? [{ id: component.id, keyframes: resolveKeyframes(component.keyframes), Component }] : []
      }),
    [config.components, modules],
  )

  const stops = useMemo(() => stopOffsets(config), [config])

  useScrollDriver()
  const autoplay = useAutoplay({ stops, end: total })
  useStopKeys(stops, autoplay.stepSeconds)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    for (const u of findUnsettledAtPhaseStarts(config)) {
      console.warn(
        `[phases] "${u.componentId}" is still moving at the start of phase "${u.phaseId}" (offset ${u.start}); snapping and PDF export will capture it mid-flight.`,
      )
    }
  }, [config])

  const backgroundColor = config.meta.backgroundColor

  return (
    <>
      <div aria-hidden style={{ height: `calc(${total}px + 100vh)` }} />
      <ComponentContextMenu presentationId={id} config={config} ranges={ranges}
        disabled={fullscreen}
        onConfigSaved={onConfigSaved}
      >
        <Stage width={stageSize.width} height={stageSize.height} backgroundColor={backgroundColor}>
          {slots.map((slot) => (
            <Slot
              key={slot.id}
              id={slot.id}
              keyframes={slot.keyframes}
              Component={slot.Component}
              interactive={!fullscreen}
            />
          ))}
        </Stage>
      </ComponentContextMenu>
      {!fullscreen && (
        <PhaseBar ranges={ranges} total={total} stops={stops} customStops={config.stops !== undefined} />
      )}
      <LoopFade active={autoplay.fading} color={backgroundColor} />
      <PresentControls id={id} title={config.meta.title} autoplay={autoplay} hidden={fullscreen} />
      {fullscreen && <FullscreenAutoplayButton autoplay={autoplay} />}
      {autoplay.paused && <AutoplayPausedNotice />}
    </>
  )
}

function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(
    () => typeof document !== 'undefined' && document.fullscreenElement !== null,
  )

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  return fullscreen
}

function useScrollDriver() {
  const setOffset = useScrollStore((s) => s.setOffset)

  useEffect(() => {
    let frame = 0
    const sync = () => {
      frame = 0
      setOffset(window.scrollY)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sync)
    }
    sync()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [setOffset])
}

/**
 * Arrow/page keys glide to the next or previous stop over `seconds`, eased. Pressing again
 * mid-glide aims past the current target, and any wheel or touch scroll cancels the glide.
 */
function useStopKeys(stops: number[], seconds: number) {
  useEffect(() => {
    let glide: { frame: number; to: number } | null = null
    const cancel = () => {
      if (glide) cancelAnimationFrame(glide.frame)
      glide = null
    }

    const glideTo = (to: number) => {
      cancel()
      const duration = seconds * 1000
      if (duration <= 0) {
        window.scrollTo({ top: to })
        return
      }
      const from = window.scrollY
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        window.scrollTo({ top: from + (to - from) * easeInOutCubic(t) })
        if (t < 1 && glide) glide.frame = requestAnimationFrame(tick)
        else glide = null
      }
      glide = { frame: requestAnimationFrame(tick), to }
    }

    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [role="dialog"]'))
      ) {
        return
      }

      const forward = NEXT_KEYS.has(event.key) && !(event.key === ' ' && event.shiftKey)
      const backward = PREV_KEYS.has(event.key) || (event.key === ' ' && event.shiftKey)
      if (!forward && !backward) return
      event.preventDefault()

      const offset = glide?.to ?? window.scrollY
      const next = forward ? stops.find((at) => at > offset + 1) : stops.findLast((at) => at < offset - 1)
      if (next !== undefined) glideTo(next)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('touchstart', cancel, { passive: true })
    return () => {
      cancel()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
    }
  }, [stops, seconds])
}

function Stage({
  width,
  height,
  backgroundColor,
  children,
}: {
  width: number
  height: number
  backgroundColor: string
  children: React.ReactNode
}) {
  const [scale, setScale] = useState<number | null>(null)

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / width, window.innerHeight / height))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [width, height])

  return (
    <div
      className="fixed inset-0 grid place-items-center overflow-hidden"
      style={{ backgroundColor }}
    >
      {scale !== null && (
        <div style={{ width: width * scale, height: height * scale }}>
          <div
            className="relative origin-top-left overflow-hidden [perspective:1600px]"
            style={{ width, height, transform: `scale(${scale})`, backgroundColor }}
          >
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </div>
      )}
    </div>
  )
}

const Slot = memo(function Slot({
  id,
  keyframes,
  Component,
  interactive,
}: {
  id: string
  keyframes: ResolvedKeyframe[]
  Component: React.ComponentType<{ style: React.CSSProperties }>
  /** Lets the component's own box receive pointer events, for the right-click menu. */
  interactive: boolean
}) {
  const style = useComponentStyle(keyframes)
  return (
    <div
      {...{ [SLOT_ATTRIBUTE]: id }}
      className={`pointer-events-none absolute inset-0 flex items-center justify-center [transform-style:preserve-3d] data-[targeted]:*:outline-4 data-[targeted]:*:outline-offset-8 data-[targeted]:*:outline-sky-400 data-[targeted]:*:outline-dashed ${
        interactive ? '*:pointer-events-auto' : ''
      }`}
    >
      <Component style={style} />
    </div>
  )
})

/** Clicks this close (in screen px) to a stop land exactly on it. */
const STOP_SNAP_PX = 8

function PhaseBar({
  ranges,
  total,
  stops,
  customStops,
}: {
  ranges: PhaseRange[]
  total: number
  stops: number[]
  /** Hand-placed stops get markers; phase starts are already visible as dividers. */
  customStops: boolean
}) {
  const active = useScrollStore((s) => activePhaseIndex(ranges, s.offset))
  const fill = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef(false)

  const offsetAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect()
    const at = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * total
    const snap = (STOP_SNAP_PX / rect.width) * total
    const nearest = stops.reduce((best, s) => (Math.abs(s - at) < Math.abs(best - at) ? s : best), Infinity)
    return Math.abs(nearest - at) <= snap ? nearest : Math.round(at)
  }

  const jump = (clientX: number) => window.scrollTo({ top: offsetAt(clientX) })

  useEffect(
    () =>
      useScrollStore.subscribe(({ offset }) => {
        if (fill.current) fill.current.style.transform = `scaleX(${Math.min(offset / total, 1)})`
      }),
    [total],
  )

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-10 px-6">
      <div className="mb-2 text-xs font-medium tracking-wide text-neutral-400 uppercase">
        {ranges[active].label}
      </div>
      <div
        ref={track}
        title="Click or drag to jump"
        className="group pointer-events-auto relative -my-2 cursor-pointer touch-none py-2"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          dragging.current = true
          // Keeps the drag going when the pointer strays off the thin track.
          event.currentTarget.setPointerCapture?.(event.pointerId)
          jump(event.clientX)
        }}
        onPointerMove={(event) => {
          setHover(offsetAt(event.clientX))
          if (dragging.current) jump(event.clientX)
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onLostPointerCapture={() => (dragging.current = false)}
        onPointerLeave={() => setHover(null)}
      >
        {hover !== null && (
          <div
            className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-md bg-neutral-950/90 px-2 py-1 text-xs whitespace-nowrap text-neutral-200 ring-1 ring-white/10"
            style={{ left: `${(hover / total) * 100}%` }}
          >
            {ranges[activePhaseIndex(ranges, hover)].label}
            <span className="ml-1.5 font-mono text-neutral-500">@{hover.toLocaleString()}</span>
          </div>
        )}
        <div className="relative h-1 overflow-hidden rounded-full bg-neutral-800 transition-[height] group-hover:h-1.5">
          <div
            ref={fill}
            className="h-full origin-left bg-neutral-300"
            style={{ transform: 'scaleX(0)' }}
          />
          {ranges.slice(1).map((r) => (
            <div
              key={r.id}
              className="absolute top-0 h-full w-0.5 bg-neutral-950"
              style={{ left: `${(r.start / total) * 100}%` }}
            />
          ))}
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-white"
            style={{ left: `${(hover / total) * 100}%` }}
          />
        )}
        {customStops &&
          stops.map((at) => (
            <div
              key={at}
              title={`Stop at ${at}`}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 ring-2 ring-neutral-950"
              style={{ left: `${(at / total) * 100}%` }}
            />
          ))}
      </div>
    </div>
  )
}
