import { MapPinOff, PanelLeft, PanelTop } from "lucide-react";
import { Suspense, memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import { componentLoader, variablesOf } from "~/engine/presentations";
import type { SlideComponent } from "~/engine/presentations";
import type { Presentation, Variables } from "~/engine/schema";
import { useComponentStyle, useScrollStore } from "~/engine/scroll-store";
import {
  activePhaseIndex,
  findUnsettledAtPhaseStarts,
  layoutPhases,
  parseAspectRatio,
  resolveKeyframes,
  stopOffsets,
  trackLength,
} from "~/engine/timeline";
import type { PhaseRange, ResolvedKeyframe } from "~/engine/timeline";
import { ComponentContextMenu, SLOT_ATTRIBUTE } from "./ComponentContextMenu";
import {
  AutoplayPausedNotice,
  FullscreenAutoplayButton,
  LoopFade,
} from "./AutoplayControls";
import { PresentControls } from "./PresentControls";
import { easeInOutCubic, useAutoplay } from "./useAutoplay";
import { useNotice } from "./useNotice";
import { writeStops } from "./writeStops";

/**
 * Resolves component modules up front instead of via lazy/Suspense, so a config reload keeps
 * showing the current components until the new set is ready. Unchanged modules resolve to the
 * same function from the module cache, so they stay mounted.
 */
export function useComponentModules(
  id: string,
  files: string[],
): Record<string, SlideComponent> | null {
  const [modules, setModules] = useState<Record<string, SlideComponent> | null>(
    null,
  );
  const key = files.join("\n");

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      key
        .split("\n")
        .map(
          async (file) =>
            [file, (await componentLoader(id, file)()).default] as const,
        ),
    ).then((entries) => {
      if (!cancelled) setModules(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [id, key]);

  return modules;
}

const NEXT_KEYS = new Set(["ArrowDown", "ArrowRight", "PageDown", " "]);
const PREV_KEYS = new Set(["ArrowUp", "ArrowLeft", "PageUp"]);

export function PresentMode({
  id,
  config,
  onConfigSaved,
}: {
  id: string;
  config: Presentation;
  onConfigSaved: (update: (config: Presentation) => Presentation) => void;
}) {
  const ranges = useMemo(() => layoutPhases(config.phases), [config.phases]);
  const total = trackLength(config.phases);
  const stageSize = parseAspectRatio(config.meta.aspectRatio);
  const fullscreen = useFullscreen();

  const modules = useComponentModules(
    id,
    config.components.map((c) => c.file),
  );
  const slots = useMemo(
    () =>
      config.components.flatMap((component) => {
        const Component = modules?.[component.file];
        return Component
          ? [
              {
                id: component.id,
                keyframes: resolveKeyframes(component.keyframes),
                Component,
              },
            ]
          : [];
      }),
    [config.components, modules],
  );

  const stops = useMemo(() => stopOffsets(config), [config]);

  useScrollDriver();
  const autoplay = useAutoplay({ stops, end: total });
  useStopKeys(stops, autoplay.stepSeconds);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    for (const u of findUnsettledAtPhaseStarts(config)) {
      console.warn(
        `[phases] "${u.componentId}" is still moving at the start of phase "${u.phaseId}" (offset ${u.start}); snapping and PDF export will capture it mid-flight.`,
      );
    }
  }, [config]);

  const backgroundColor = config.meta.backgroundColor;
  const vars = variablesOf(config);
  const [flash, notice] = useNotice();

  return (
    <>
      <div aria-hidden style={{ height: `calc(${total}px + 100vh)` }} />
      <ComponentContextMenu
        presentationId={id}
        config={config}
        ranges={ranges}
        disabled={fullscreen}
        onConfigSaved={onConfigSaved}
        flash={flash}
      >
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          backgroundColor={backgroundColor}
        >
          {slots.map((slot) => (
            <Slot
              key={slot.id}
              id={slot.id}
              keyframes={slot.keyframes}
              Component={slot.Component}
              vars={vars}
              interactive={!fullscreen}
            />
          ))}
        </Stage>
      </ComponentContextMenu>
      {!fullscreen && (
        <PhaseBar
          ranges={ranges}
          total={total}
          stops={stops}
          customStops={config.stops !== undefined}
          onRemoveStop={(at) => {
            const rest = stops.filter((stop) => stop !== at);
            void writeStops({
              presentationId: id,
              next: rest.length ? rest : null,
              message: rest.length
                ? `Stop at ${at.toLocaleString()} removed`
                : "Last stop removed · phase starts are the stops again",
              onConfigSaved,
              flash,
            });
          }}
        />
      )}
      {notice}
      <LoopFade active={autoplay.fading} color={backgroundColor} />
      <PresentControls
        id={id}
        title={config.meta.title}
        variables={vars}
        onVariablesSaved={(variables) =>
          onConfigSaved((current) => ({
            ...current,
            variables: Object.keys(variables).length ? variables : undefined,
          }))
        }
        autoplay={autoplay}
        hidden={fullscreen}
      />
      {fullscreen && <FullscreenAutoplayButton autoplay={autoplay} />}
      {autoplay.paused && <AutoplayPausedNotice />}
    </>
  );
}

function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(
    () =>
      typeof document !== "undefined" && document.fullscreenElement !== null,
  );

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  return fullscreen;
}

function useScrollDriver() {
  const setOffset = useScrollStore((s) => s.setOffset);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      setOffset(window.scrollY);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [setOffset]);
}

/**
 * Arrow/page keys glide to the next or previous stop over `seconds`, eased. Pressing again
 * mid-glide aims past the current target, and any wheel or touch scroll cancels the glide.
 */
function useStopKeys(stops: number[], seconds: number) {
  useEffect(() => {
    let glide: { frame: number; to: number } | null = null;
    const cancel = () => {
      if (glide) cancelAnimationFrame(glide.frame);
      glide = null;
    };

    const glideTo = (to: number) => {
      cancel();
      const duration = seconds * 1000;
      if (duration <= 0) {
        window.scrollTo({ top: to });
        return;
      }
      const from = window.scrollY;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo({ top: from + (to - from) * easeInOutCubic(t) });
        if (t < 1 && glide) glide.frame = requestAnimationFrame(tick);
        else glide = null;
      };
      glide = { frame: requestAnimationFrame(tick), to };
    };

    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [role="dialog"]'))
      ) {
        return;
      }

      const forward =
        NEXT_KEYS.has(event.key) && !(event.key === " " && event.shiftKey);
      const backward =
        PREV_KEYS.has(event.key) || (event.key === " " && event.shiftKey);
      if (!forward && !backward) return;
      event.preventDefault();

      const offset = glide?.to ?? window.scrollY;
      const next = forward
        ? stops.find((at) => at > offset + 1)
        : stops.findLast((at) => at < offset - 1);
      if (next !== undefined) glideTo(next);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    return () => {
      cancel();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
    };
  }, [stops, seconds]);
}

function Stage({
  width,
  height,
  backgroundColor,
  children,
}: {
  width: number;
  height: number;
  backgroundColor: string;
  children: React.ReactNode;
}) {
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const fit = () =>
      setScale(
        Math.min(window.innerWidth / width, window.innerHeight / height),
      );
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [width, height]);

  return (
    <div
      className="fixed inset-0 grid place-items-center overflow-hidden"
      style={{ backgroundColor }}
    >
      {scale !== null && (
        <div style={{ width: width * scale, height: height * scale }}>
          <div
            className="relative origin-top-left overflow-hidden [perspective:1600px]"
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              backgroundColor,
            }}
          >
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

const Slot = memo(function Slot({
  id,
  keyframes,
  Component,
  vars,
  interactive,
}: {
  id: string;
  keyframes: ResolvedKeyframe[];
  Component: SlideComponent;
  vars: Variables;
  /** Lets the component's own box receive pointer events, for the right-click menu. */
  interactive: boolean;
}) {
  const style = useComponentStyle(keyframes);
  return (
    <div
      {...{ [SLOT_ATTRIBUTE]: id }}
      className={`pointer-events-none absolute inset-0 flex items-center justify-center [transform-style:preserve-3d] data-[targeted]:*:outline-4 data-[targeted]:*:outline-offset-8 data-[targeted]:*:outline-sky-400 data-[targeted]:*:outline-dashed ${
        interactive ? "*:pointer-events-auto" : ""
      }`}
    >
      <Component style={style} vars={vars} />
    </div>
  );
});

/** Clicks this close (in screen px) to a stop land exactly on it. */
const STOP_SNAP_PX = 8;

type Orientation = "vertical" | "horizontal";
const ORIENTATION_KEY = "timeline-orientation";

/** Down the left edge, or across the top. Remembered per browser. */
function useTimelineOrientation() {
  /** Null until read, so the bar doesn't flash on the wrong side before hydration. */
  const [orientation, setOrientation] = useState<Orientation | null>(null);
  // localStorage only exists on the client; reading it during render would break hydration.
  useEffect(() => {
    setOrientation(
      localStorage.getItem(ORIENTATION_KEY) === "horizontal"
        ? "horizontal"
        : "vertical",
    );
  }, []);
  const toggle = () =>
    setOrientation((current) => {
      const next = current === "vertical" ? "horizontal" : "vertical";
      try {
        localStorage.setItem(ORIENTATION_KEY, next);
      } catch {}
      return next;
    });
  return [orientation, toggle] as const;
}

const AXES = {
  vertical: {
    container: "top-12 bottom-6 left-6",
    track: "-mx-2 h-full px-2",
    bar: "h-full w-1 transition-[width] group-hover:w-1.5",
    fill: "origin-top",
    divider: "left-0 h-0.5 w-full",
    label: "left-full ml-1",
    tooltip: "left-full ml-1 -translate-y-1/2",
    marker: "left-2.5",
    tick: "h-px w-3",
    position: "top",
    scale: "scaleY",
  },
  horizontal: {
    container: "top-6 right-6 left-12",
    track: "-my-2 w-full py-2",
    bar: "h-1 w-full transition-[height] group-hover:h-1.5",
    fill: "origin-left",
    divider: "top-0 h-full w-0.5",
    // Sits over the top of the slide, so it needs its own backdrop to stay legible.
    label:
      "top-full mt-1 rounded-md bg-neutral-950/70 px-2 py-0.5 text-neutral-300! backdrop-blur-sm",
    tooltip: "top-full mt-1",
    marker: "top-2.5",
    tick: "h-3 w-px",
    position: "left",
    scale: "scaleX",
  },
} as const;

function PhaseBar({
  ranges,
  total,
  stops,
  customStops,
  onRemoveStop,
}: {
  ranges: PhaseRange[];
  total: number;
  stops: number[];
  /** Hand-placed stops get markers; phase starts are already visible as dividers. */
  customStops: boolean;
  onRemoveStop: (at: number) => void;
}) {
  const [orientation, toggleOrientation] = useTimelineOrientation();
  if (orientation === null) return null;
  return (
    <PhaseTrack
      {...{ ranges, total, stops, customStops, orientation, onRemoveStop }}
      onToggle={toggleOrientation}
    />
  );
}

function PhaseTrack({
  ranges,
  total,
  stops,
  customStops,
  orientation,
  onToggle: toggleOrientation,
  onRemoveStop,
}: {
  ranges: PhaseRange[];
  total: number;
  stops: number[];
  customStops: boolean;
  orientation: Orientation;
  onToggle: () => void;
  onRemoveStop: (at: number) => void;
}) {
  const axis = AXES[orientation];
  const vertical = orientation === "vertical";
  const active = useScrollStore((s) => activePhaseIndex(ranges, s.offset));
  const fill = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);

  const [menuStop, setMenuStop] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  /** The stop within STOP_SNAP_PX of the pointer, and the raw offset under it. */
  const pointerAt = (event: { clientX: number; clientY: number }) => {
    const rect = track.current!.getBoundingClientRect();
    const [pointer, start, length] = vertical
      ? [event.clientY, rect.top, rect.height]
      : [event.clientX, rect.left, rect.width];
    const at = Math.min(1, Math.max(0, (pointer - start) / length)) * total;
    const snap = (STOP_SNAP_PX / length) * total;
    const nearest = stops.reduce(
      (best, s) => (Math.abs(s - at) < Math.abs(best - at) ? s : best),
      Infinity,
    );
    return { at, stop: Math.abs(nearest - at) <= snap ? nearest : undefined };
  };

  const offsetAt = (event: React.PointerEvent) => {
    const { at, stop } = pointerAt(event);
    return stop ?? Math.round(at);
  };

  const jump = (event: React.PointerEvent) =>
    window.scrollTo({ top: offsetAt(event) });
  const along = (at: number) => ({ [axis.position]: `${(at / total) * 100}%` });
  /** Across the top, slides labels left as they near the end so they never run off-screen. */
  const label = (at: number) =>
    vertical
      ? along(at)
      : { ...along(at), transform: `translateX(-${(at / total) * 100}%)` };

  useEffect(() => {
    const paint = (offset: number) => {
      if (fill.current)
        fill.current.style.transform = `${axis.scale}(${Math.min(offset / total, 1)})`;
    };
    paint(useScrollStore.getState().offset);
    return useScrollStore.subscribe(({ offset }) => paint(offset));
  }, [total, axis.scale]);

  return (
    <>
      <button
        type="button"
        onClick={toggleOrientation}
        aria-label={
          vertical
            ? "Move the timeline to the top"
            : "Move the timeline to the left side"
        }
        title={
          vertical
            ? "Move the timeline to the top"
            : "Move the timeline to the left side"
        }
        className="fixed top-3 left-3 z-10 flex size-7 items-center justify-center rounded text-neutral-500 hover:cursor-pointer hover:bg-neutral-800/80 hover:text-neutral-100"
      >
        {vertical ? (
          <PanelTop size={16} strokeWidth={2} />
        ) : (
          <PanelLeft size={16} strokeWidth={2} />
        )}
      </button>
      <div className={`pointer-events-none fixed z-10 ${axis.container}`}>
        <ContextMenu onOpenChange={setMenuOpen}>
          <ContextMenuTrigger
            asChild
            onContextMenu={(event) => {
              const { stop } = pointerAt(event);
              // Only hand-placed stops have dots to right-click; elsewhere, open nothing.
              if (!customStops || stop === undefined) {
                event.preventDefault();
                return;
              }
              setMenuStop(stop);
            }}
          >
            <div
              ref={track}
              title="Click or drag to jump"
              className={`group pointer-events-auto relative cursor-pointer touch-none ${axis.track}`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                dragging.current = true;
                // Keeps the drag going when the pointer strays off the thin track.
                event.currentTarget.setPointerCapture?.(event.pointerId);
                jump(event);
              }}
              onPointerMove={(event) => {
                setHover(offsetAt(event));
                if (dragging.current) jump(event);
              }}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
              onLostPointerCapture={() => (dragging.current = false)}
              onPointerLeave={() => setHover(null)}
            >
              <div
                className={`relative overflow-hidden rounded-full bg-neutral-800 ${axis.bar}`}
              >
                <div
                  ref={fill}
                  className={`size-full bg-neutral-300 ${axis.fill}`}
                  style={{ transform: `${axis.scale}(0)` }}
                />
                {ranges.slice(1).map((r) => (
                  <div
                    key={r.id}
                    className={`absolute bg-neutral-950 ${axis.divider}`}
                    style={along(r.start)}
                  />
                ))}
              </div>
              {hover === null || menuOpen ? (
                <div
                  className={`pointer-events-none absolute text-xs font-medium tracking-wide whitespace-nowrap text-neutral-400 uppercase ${axis.label}`}
                  style={label(ranges[active].start)}
                >
                  {ranges[active].label}
                </div>
              ) : (
                <>
                  <div
                    className={`pointer-events-none absolute rounded-md bg-neutral-950/90 px-2 py-1 text-xs whitespace-nowrap text-neutral-200 ring-1 ring-white/10 ${axis.tooltip}`}
                    style={label(hover)}
                  >
                    {ranges[activePhaseIndex(ranges, hover)].label}
                  </div>
                  <div
                    className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 bg-white ${axis.marker} ${axis.tick}`}
                    style={along(hover)}
                  />
                </>
              )}
              {customStops &&
                stops.map((at) => (
                  <div
                    key={at}
                    title={`Stop at ${at}`}
                    className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 ring-2 ring-neutral-950 ${axis.marker}`}
                    style={along(at)}
                  />
                ))}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            {menuStop !== null && (
              <>
                <ContextMenuLabel className="flex items-baseline justify-between gap-2 text-xs font-normal text-neutral-500">
                  <span className="truncate">
                    {ranges[activePhaseIndex(ranges, menuStop)].label}
                  </span>
                  <span className="font-mono">
                    @{menuStop.toLocaleString()}
                  </span>
                </ContextMenuLabel>
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onSelect={() => onRemoveStop(menuStop)}
                >
                  <MapPinOff />
                  Remove stop point
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </>
  );
}
