import { useCallback, useEffect, useRef, useState } from 'react'

export type AutoplayMode = 'stops' | 'continuous'

export const AUTOPLAY_SPEEDS = [0.5, 1, 2] as const
export type AutoplaySpeed = (typeof AUTOPLAY_SPEEDS)[number]

/** Continuous mode at 1×, in track units (px) per second. */
const CONTINUOUS_PX_PER_SECOND = 400
/** Stop-to-stop glide speed at 1×; clamped so short hops aren't jerky and long ones don't drag. */
const GLIDE_PX_PER_SECOND = 900
const GLIDE_MS = { min: 700, max: 4000 }
export const STOP_TIME_PRESETS = [2, 3, 5, 10] as const
export const STOP_TIME_LIMITS = { min: 0, max: 600 }
const SETTINGS_KEY = 'autoplay-settings'

/** Each half of the loop's dip: fade out at the end, then back in at the start. */
export const LOOP_FADE_MS = 450

/** How long an arrow-key step takes to glide to the next stop, in seconds (0 jumps). */
export const STEP_DURATIONS = [
  { seconds: 0, label: 'Instant' },
  { seconds: 0.6, label: 'Quick' },
  { seconds: 1.2, label: 'Smooth' },
  { seconds: 2, label: 'Slow' },
  { seconds: 3.5, label: 'Cinematic' },
] as const

type Settings = { mode: AutoplayMode; speed: AutoplaySpeed; stopTime: number; loop: boolean; stepSeconds: number }
const DEFAULT_SETTINGS: Settings = { mode: 'stops', speed: 1, stopTime: 3, loop: false, stepSeconds: 1.2 }

export function clampStopTime(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_SETTINGS.stopTime
  return Math.min(STOP_TIME_LIMITS.max, Math.max(STOP_TIME_LIMITS.min, Math.round(seconds * 10) / 10))
}

function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>
    return {
      mode: saved.mode === 'continuous' ? 'continuous' : 'stops',
      speed: AUTOPLAY_SPEEDS.find((s) => s === saved.speed) ?? DEFAULT_SETTINGS.speed,
      stopTime: saved.stopTime === undefined ? DEFAULT_SETTINGS.stopTime : clampStopTime(saved.stopTime),
      loop: saved.loop === true,
      stepSeconds:
        STEP_DURATIONS.find((d) => d.seconds === saved.stepSeconds)?.seconds ?? DEFAULT_SETTINGS.stepSeconds,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Scroll drift beyond this between frames means the viewer scrolled, so autoplay yields. */
const DRIFT_TOLERANCE = 2
const RESIZE_GRACE_MS = 600

export type Leg = { from: number; to: number; duration: number }

/** The next glide from `position`: to the next stop, then to the end of the track. */
export function nextLeg(position: number, stops: number[], end: number, speed: number): Leg | null {
  const to = stops.find((at) => at > position + 1 && at <= end) ?? (position < end - 1 ? end : undefined)
  if (to === undefined) return null
  const ms = ((to - position) / (GLIDE_PX_PER_SECOND * speed)) * 1000
  return { from: position, to, duration: Math.min(GLIDE_MS.max, Math.max(GLIDE_MS.min, ms)) }
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('input, textarea, select, [role="dialog"], [role="alertdialog"]') !== null)
  )
}

/** True while P is held down (and the page has focus). */
function useHeldKey(key: string): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      event.preventDefault()
      setHeld(true)
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === key) setHeld(false)
    }
    const release = () => setHeld(false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', release)
    }
  }, [key])

  return held
}

/**
 * Drives the scroll position over time. Writes the position directly every frame
 * (not `behavior: 'smooth'`) so speed is ours to control. Holding P pauses; any scroll the
 * viewer makes themselves (wheel, keys, scrollbar) stops autoplay.
 */
export function useAutoplay({ stops, end }: { stops: number[]; end: number }) {
  const [playing, setPlaying] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const { mode, speed, stopTime, loop, stepSeconds } = settings
  const [fading, setFading] = useState(false)
  const held = useHeldKey('p')
  const heldRef = useRef(held)
  heldRef.current = held
  /** Read live so changing the stop time mid-rest applies without restarting the leg. */
  const stopTimeRef = useRef(stopTime)
  stopTimeRef.current = stopTime
  const loopRef = useRef(loop)
  loopRef.current = loop

  // localStorage only exists on the client; reading it during render would break hydration.
  useEffect(() => setSettings(readSettings()), [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    let position = window.scrollY
    let written = position
    let leg: (Leg & { elapsed: number }) | null = null
    /** Time spent resting on the current stop; null while gliding. */
    let rested: number | null = null
    /** Time into the fade-out before looping back to the start; null when not looping. */
    let fade: number | null = null

    /** At the end: loop back to the start behind a fade, or stop. Returns false when stopping. */
    const finish = () => {
      if (!loopRef.current) {
        setPlaying(false)
        return false
      }
      fade = 0
      setFading(true)
      return true
    }

    const write = (top: number) => {
      position = top
      window.scrollTo({ top })
      written = window.scrollY
    }

    let size = `${window.innerWidth}x${window.innerHeight}`
    let resizedAt = -Infinity

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100)
      last = now

      // Entering/leaving fullscreen resizes the page, and the browser may nudge the scroll
      // position while it relays out. That isn't the viewer scrolling, so don't yield to it.
      const nextSize = `${window.innerWidth}x${window.innerHeight}`
      if (nextSize !== size) {
        size = nextSize
        resizedAt = now
      }
      if (now - resizedAt < RESIZE_GRACE_MS) {
        written = window.scrollY
      } else if (Math.abs(window.scrollY - written) > DRIFT_TOLERANCE) {
        setPlaying(false)
        return
      }

      if (!heldRef.current) {
        if (fade !== null) {
          fade += dt
          if (fade >= LOOP_FADE_MS) {
            // Hidden behind the fade, so jump straight there rather than playing the transitions back.
            write(0)
            fade = null
            leg = null
            rested = mode === 'stops' ? 0 : null
            setFading(false)
          }
        } else if (mode === 'continuous') {
          write(Math.min(end, position + (dt / 1000) * CONTINUOUS_PX_PER_SECOND * speed))
          if (position >= end && !finish()) return
        } else if (rested !== null && rested < stopTimeRef.current * 1000) {
          rested += dt
        } else {
          rested = null
          if (!leg) {
            const next = nextLeg(position, stops, end, speed)
            if (!next) {
              if (!finish()) return
              frame = requestAnimationFrame(tick)
              return
            }
            leg = { ...next, elapsed: 0 }
          }
          leg.elapsed += dt
          const t = Math.min(1, leg.elapsed / leg.duration)
          write(leg.from + (leg.to - leg.from) * easeInOutCubic(t))
          if (t >= 1) {
            // When looping, rest on the last frame like any other stop before fading out.
            if (leg.to >= end && !loopRef.current) {
              setPlaying(false)
              return
            }
            leg = null
            rested = 0
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      setFading(false)
    }
  }, [playing, mode, speed, stops, end])

  const toggle = useCallback(() => {
    if (!playing && window.scrollY >= end - 1) window.scrollTo({ top: 0 })
    setPlaying(!playing)
  }, [playing, end])

  return {
    playing,
    paused: playing && held,
    mode,
    speed,
    stopTime,
    loop,
    fading,
    stepSeconds,
    setStepSeconds: (seconds: number) => update({ stepSeconds: seconds }),
    setMode: (value: AutoplayMode) => update({ mode: value }),
    setLoop: (value: boolean) => update({ loop: value }),
    setSpeed: (value: AutoplaySpeed) => update({ speed: value }),
    setStopTime: (seconds: number) => update({ stopTime: clampStopTime(seconds) }),
    toggle,
  }
}

export type Autoplay = ReturnType<typeof useAutoplay>
