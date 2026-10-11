import { Suspense, memo, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { SlideComponent } from "~/engine/presentations";
import type { Variables } from "~/engine/schema";
import { useComponentStyle, useScrollStore } from "~/engine/scroll-store";
import type { ResolvedKeyframe } from "~/engine/timeline";
import { easeInOutCubic } from "./useAutoplay";

/*
 * The scroll-driven stage, shared by present mode and saved HTML files (src/standalone).
 * Keep studio-only imports out of this module so saved files stay small.
 */

export const SLOT_ATTRIBUTE = "data-component-slot";

const NEXT_KEYS = new Set(["ArrowDown", "ArrowRight", "PageDown", " "]);
const PREV_KEYS = new Set(["ArrowUp", "ArrowLeft", "PageUp"]);
export function useFullscreen() {
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

export function useScrollDriver() {
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
export function useStopKeys(stops: number[], seconds: number) {
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

export function Stage({
  width,
  height,
  backgroundColor,
  children,
}: {
  width: number;
  height: number;
  backgroundColor: string;
  children: ReactNode;
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

export const Slot = memo(function Slot({
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
