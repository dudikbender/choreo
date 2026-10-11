import { useMemo } from "react";
import type { SlideComponent } from "~/engine/presentations";
import type { Presentation } from "~/engine/schema";
import { ScrollStoreProvider } from "~/engine/scroll-store";
import {
  parseAspectRatio,
  resolveKeyframes,
  stopOffsets,
  trackLength,
} from "~/engine/timeline";
import {
  AutoplayPausedNotice,
  FullscreenAutoplayButton,
  LoopFade,
} from "~/present/AutoplayControls";
import { Slot, Stage, useScrollDriver, useStopKeys } from "~/present/stage";
import { useAutoplay } from "~/present/useAutoplay";

/**
 * The presentation on its own, for saved HTML files: scrolling, arrow-key stops and
 * auto-play, without any studio controls. `modules` maps component files to components.
 */
export function Player(props: {
  config: Presentation;
  modules: Record<string, SlideComponent>;
}) {
  return (
    <ScrollStoreProvider>
      <PlayerStage {...props} />
    </ScrollStoreProvider>
  );
}

function PlayerStage({
  config,
  modules,
}: {
  config: Presentation;
  modules: Record<string, SlideComponent>;
}) {
  const total = trackLength(config.phases);
  const stageSize = parseAspectRatio(config.meta.aspectRatio);
  const stops = useMemo(() => stopOffsets(config), [config]);
  const slots = useMemo(
    () =>
      config.components.map((component) => ({
        id: component.id,
        keyframes: resolveKeyframes(component.keyframes),
        Component: modules[component.file],
      })),
    [config.components, modules],
  );
  const vars = useMemo(() => config.variables ?? {}, [config.variables]);

  useScrollDriver();
  const autoplay = useAutoplay({ stops, end: total });
  useStopKeys(stops, autoplay.stepSeconds);

  const backgroundColor = config.meta.backgroundColor;

  return (
    <>
      <div aria-hidden style={{ height: `calc(${total}px + 100vh)` }} />
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
            interactive
          />
        ))}
      </Stage>
      <LoopFade active={autoplay.fading} color={backgroundColor} />
      <FullscreenAutoplayButton autoplay={autoplay} />
      {autoplay.paused && <AutoplayPausedNotice />}
    </>
  );
}
