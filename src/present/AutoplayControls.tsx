import { ChevronDown, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { AUTOPLAY_SPEEDS, LOOP_FADE_MS, STEP_DURATIONS, STOP_TIME_LIMITS, STOP_TIME_PRESETS } from './useAutoplay'
import type { Autoplay, AutoplayMode, AutoplaySpeed } from './useAutoplay'

const MODE_LABELS: Record<AutoplayMode, string> = {
  stops: 'Stop to stop',
  continuous: 'Continuous',
}

export function AutoplayControls({ autoplay }: { autoplay: Autoplay }) {
  const { playing, mode, setMode, speed, setSpeed, toggle } = autoplay

  return (
    <div className="flex items-center rounded-full bg-white/5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        className="flex items-center gap-2 rounded-full py-2.5 pr-3 pl-4 text-sm font-medium text-neutral-200 hover:bg-white/10"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        {playing ? 'Pause' : 'Auto-play'}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Playback settings"
          className="flex items-center gap-1 rounded-full py-2.5 pr-3 pl-2 font-mono text-xs text-neutral-400 outline-none hover:bg-white/10 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-500 data-[state=open]:bg-white/10 data-[state=open]:text-neutral-100"
        >
          {speed}×
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-neutral-500">Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as AutoplayMode)}>
            {(Object.keys(MODE_LABELS) as AutoplayMode[]).map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {MODE_LABELS[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-neutral-500">Speed</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={String(speed)}
            onValueChange={(value) => setSpeed(Number(value) as AutoplaySpeed)}
          >
            {AUTOPLAY_SPEEDS.map((value) => (
              <DropdownMenuRadioItem key={value} value={String(value)}>
                {value}×
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <StopTimeField autoplay={autoplay} />
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={autoplay.loop}
            onCheckedChange={autoplay.setLoop}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="flex flex-col">
              Loop
              <span className="text-xs text-neutral-500">Fade back to the start at the end</span>
            </span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-neutral-500">
            Arrow-key steps · time to the next stop
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={String(autoplay.stepSeconds)}
            onValueChange={(value) => autoplay.setStepSeconds(Number(value))}
          >
            {STEP_DURATIONS.map(({ seconds, label }) => (
              <DropdownMenuRadioItem key={seconds} value={String(seconds)} onSelect={(event) => event.preventDefault()}>
                {label}
                {seconds > 0 && <span className="ml-auto font-mono text-xs text-neutral-500">{seconds}s</span>}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-neutral-500">
            Hold <kbd className="rounded border border-neutral-700 px-1 font-mono text-neutral-300">P</kbd> to
            pause; release to continue. Scrolling yourself stops auto-play.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** How long to rest on each stop. Plain controls rather than menu items, so clicks don't close the menu. */
function StopTimeField({ autoplay }: { autoplay: Autoplay }) {
  const { mode, stopTime, setStopTime } = autoplay
  const [draft, setDraft] = useState(String(stopTime))
  const disabled = mode !== 'stops'

  useEffect(() => setDraft(String(stopTime)), [stopTime])

  const commit = () => {
    const seconds = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(seconds)) setDraft(String(stopTime))
    else setStopTime(seconds)
  }

  return (
    <div className={`px-2 py-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <label htmlFor="autoplay-stop-time" className="text-xs text-neutral-500">
        Stop time{disabled && ' · stop to stop only'}
      </label>
      <div className="mt-1.5 flex items-center gap-1">
        {STOP_TIME_PRESETS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            disabled={disabled}
            onClick={() => setStopTime(seconds)}
            aria-pressed={stopTime === seconds}
            className="rounded-md px-2 py-1 font-mono text-xs text-neutral-300 hover:bg-white/10 aria-pressed:bg-white aria-pressed:text-neutral-950"
          >
            {seconds}s
          </button>
        ))}
        <div className="ml-auto flex items-center rounded-md border border-neutral-700 focus-within:border-neutral-400">
          <input
            id="autoplay-stop-time"
            type="number"
            inputMode="decimal"
            min={STOP_TIME_LIMITS.min}
            max={STOP_TIME_LIMITS.max}
            step={1}
            disabled={disabled}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') return
              // Keep the menu's typeahead and arrow-key navigation out of the field.
              event.stopPropagation()
              if (event.key === 'Enter') commit()
            }}
            className="w-12 bg-transparent py-1 pl-2 text-right font-mono text-xs text-neutral-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="pr-2 pl-0.5 font-mono text-xs text-neutral-500">s</span>
        </div>
      </div>
    </div>
  )
}

const IDLE_HIDE_MS = 2500

/**
 * The dock is hidden in fullscreen, so this is the only way to start or stop auto-play there.
 * It fades out once the mouse rests and only comes back when the mouse moves (not on scroll),
 * so it stays out of the audience's way.
 */
export function FullscreenAutoplayButton({ autoplay }: { autoplay: Autoplay }) {
  const { playing, toggle } = autoplay
  const [active, setActive] = useState(true)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    let timer = window.setTimeout(() => setActive(false), IDLE_HIDE_MS)
    let last: { x: number; y: number } | null = null
    const wake = (event: MouseEvent) => {
      // Browsers fire mousemove when the page scrolls under a still cursor; only real movement counts.
      const moved = last === null || event.screenX !== last.x || event.screenY !== last.y
      last = { x: event.screenX, y: event.screenY }
      if (!moved) return
      setActive(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setActive(false), IDLE_HIDE_MS)
    }
    window.addEventListener('mousemove', wake)
    return () => {
      window.removeEventListener('mousemove', wake)
      window.clearTimeout(timer)
    }
  }, [])

  const visible = active || hovered

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={playing}
      aria-label={playing ? 'Pause auto-play' : 'Start auto-play'}
      className={`fixed right-6 bottom-6 z-30 flex items-center gap-2 rounded-full bg-neutral-950/70 py-2.5 pr-4 pl-3.5 text-sm font-medium text-neutral-100 shadow-2xl ring-1 ring-white/10 backdrop-blur-md transition-opacity duration-500 hover:bg-neutral-900 focus-visible:opacity-100 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      {playing ? 'Pause' : 'Auto-play'}
      <kbd className="ml-1 rounded border border-white/15 px-1 font-mono text-[10px] text-neutral-400">hold P</kbd>
    </button>
  )
}

/** Covers the stage while auto-play loops from the end back to the start. */
export function LoopFade({ active, color }: { active: boolean; color: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-20 transition-opacity ease-in-out ${active ? 'opacity-100' : 'opacity-0'}`}
      style={{ backgroundColor: color, transitionDuration: `${LOOP_FADE_MS}ms` }}
    />
  )
}

/** Shown while P is held, including in fullscreen where the dock is hidden. */
export function AutoplayPausedNotice() {
  return (
    <div
      role="status"
      className="pointer-events-none fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-950/85 px-4 py-2 text-sm text-neutral-100 shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
    >
      <Pause className="size-4" />
      Paused · release P to continue
    </div>
  )
}
