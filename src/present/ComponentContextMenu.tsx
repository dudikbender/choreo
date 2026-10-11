import {
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  MapPinOff,
  MapPinPlus,
  MessageSquareText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import type { Presentation } from "~/engine/schema";
import { activePhaseIndex, stopOffsets } from "~/engine/timeline";
import type { PhaseRange } from "~/engine/timeline";
import type { Flash } from "./useNotice";
import { writeStops } from "./writeStops";
import { ComponentCodeDialog } from "./ComponentCodeDialog";
import { ComponentInstructionDialog } from "./ComponentInstructionDialog";
import type { ComponentTarget } from "./ComponentInstructionDialog";
import { DeleteComponentDialog } from "./DeleteComponentDialog";

export const SLOT_ATTRIBUTE = "data-component-slot";

/** How close (in scroll px) the current position must be to a stop to count as "on" it. */
const STOP_TOLERANCE = 24;

function isVisible(slot: HTMLElement): boolean {
  const root = slot.firstElementChild;
  if (!root) return false;
  const style = getComputedStyle(root);
  if (Number(style.opacity) <= 0.05 || style.visibility === "hidden")
    return false;
  const rect = root.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < innerWidth &&
    rect.top < innerHeight
  );
}

/**
 * Every visible component the viewer could mean, topmost first: those under the pointer in
 * paint order, then those whose box covers the point but don't take pointer events, then the
 * rest of what's on stage. Invisible components parked over the stage are skipped.
 */
export function componentStackAt(
  x: number,
  y: number,
): { ids: string[]; underPointer: number } {
  const ids: string[] = [];
  const add = (slot: HTMLElement | null) => {
    const id = slot?.getAttribute(SLOT_ATTRIBUTE);
    if (slot && id && !ids.includes(id) && isVisible(slot)) ids.push(id);
  };
  for (const element of document.elementsFromPoint(x, y))
    add(element.closest<HTMLElement>(`[${SLOT_ATTRIBUTE}]`));
  // Later slots paint over earlier ones.
  const slots = [
    ...document.querySelectorAll<HTMLElement>(`[${SLOT_ATTRIBUTE}]`),
  ].reverse();
  for (const slot of slots) {
    const rect = slot.firstElementChild?.getBoundingClientRect();
    if (
      rect &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    )
      add(slot);
  }
  const underPointer = ids.length;
  for (const slot of slots) add(slot);
  return { ids, underPointer };
}

export function ComponentContextMenu({
  presentationId,
  config,
  ranges,
  disabled,
  onConfigSaved,
  flash,
  children,
}: {
  presentationId: string;
  config: Presentation;
  ranges: PhaseRange[];
  disabled: boolean;
  /** Applies a successful save to the on-screen config, mirroring what the server wrote. */
  onConfigSaved: (update: (config: Presentation) => Presentation) => void;
  flash: Flash;
  children: React.ReactNode;
}) {
  const [stack, setStack] = useState<{
    ids: string[];
    underPointer: number;
    index: number;
  }>({
    ids: [],
    underPointer: 0,
    index: -1,
  });
  const [menuOffset, setMenuOffset] = useState(0);
  const [instructing, setInstructing] = useState<ComponentTarget | null>(null);
  const [deleting, setDeleting] = useState<ComponentTarget | null>(null);
  const [editing, setEditing] = useState<ComponentTarget | null>(null);

  const stops = stopOffsets(config);
  const custom = config.stops !== undefined;
  const end = ranges.at(-1)?.end ?? 0;
  const phase = ranges[activePhaseIndex(ranges, menuOffset)];
  const selected = config.components.find(
    (c) => c.id === stack.ids[stack.index],
  );
  const menuTarget: ComponentTarget | null =
    selected && phase
      ? {
          componentId: selected.id,
          file: selected.file,
          beat: { id: phase.id, label: phase.label },
        }
      : null;
  const highlighted = (instructing ?? deleting ?? editing ?? menuTarget)
    ?.componentId;
  const cycle = (step: number) =>
    setStack((s) => {
      if (s.ids.length === 0) return s;
      const from = s.index === -1 ? (step > 0 ? -1 : 0) : s.index;
      return { ...s, index: (from + step + s.ids.length) % s.ids.length };
    });
  const stopHere = stops
    .filter((at) => Math.abs(at - menuOffset) <= STOP_TOLERANCE)
    .sort((a, b) => Math.abs(a - menuOffset) - Math.abs(b - menuOffset))[0];

  useEffect(() => {
    if (!highlighted) return;
    const slot = document.querySelector(`[${SLOT_ATTRIBUTE}="${highlighted}"]`);
    slot?.setAttribute("data-targeted", "");
    return () => slot?.removeAttribute("data-targeted");
  }, [highlighted]);

  const setStops = (next: number[] | null, message: string) =>
    writeStops({ presentationId, next, message, onConfigSaved, flash });

  const onContextMenu = (event: React.MouseEvent) => {
    const offset = Math.min(Math.round(window.scrollY), end);
    setMenuOffset(offset);
    const found = componentStackAt(event.clientX, event.clientY);
    const ids = found.ids.filter((id) =>
      config.components.some((c) => c.id === id),
    );
    const underPointer = Math.min(found.underPointer, ids.length);
    setStack({ ids, underPointer, index: underPointer > 0 ? 0 : -1 });
  };

  return (
    <>
      <ContextMenu
        onOpenChange={(open) => {
          if (!open) setStack((s) => ({ ...s, index: -1 }));
        }}
      >
        <ContextMenuTrigger
          asChild
          disabled={disabled}
          onContextMenu={onContextMenu}
        >
          <div className="contents">{children}</div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-64"
          onKeyDown={(event) => {
            if (event.key !== "[" && event.key !== "]") return;
            event.preventDefault();
            event.stopPropagation();
            cycle(event.key === "]" ? 1 : -1);
          }}
        >
          {stack.ids.length > (stack.index === -1 ? 0 : 1) && (
            <>
              <div className="flex items-center gap-1 px-1 pb-1">
                <ContextMenuItem
                  aria-label="Previous component"
                  className="justify-center px-2"
                  onSelect={(event) => {
                    event.preventDefault();
                    cycle(-1);
                  }}
                >
                  <ChevronLeft />
                </ContextMenuItem>
                <span className="flex-1 text-center text-xs text-subtle-foreground">
                  {stack.index === -1 ? (
                    `${stack.ids.length} on stage`
                  ) : (
                    <>
                      <span className="text-foreground/80">
                        {stack.index + 1} / {stack.ids.length}
                      </span>{" "}
                      ·{" "}
                      {stack.index < stack.underPointer
                        ? "under cursor"
                        : "elsewhere"}
                    </>
                  )}
                </span>
                <ContextMenuItem
                  aria-label="Next component"
                  className="justify-center px-2"
                  onSelect={(event) => {
                    event.preventDefault();
                    cycle(1);
                  }}
                >
                  <ChevronRight />
                </ContextMenuItem>
              </div>
              <ContextMenuSeparator />
            </>
          )}
          {menuTarget ? (
            <>
              <ContextMenuLabel className="flex flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-sm text-foreground">
                    {menuTarget.componentId}
                  </span>
                  {stack.ids.length > 1 && (
                    <span className="shrink-0 text-[10px] font-normal text-subtle-foreground/70">
                      <kbd className="font-mono">[</kbd>{" "}
                      <kbd className="font-mono">]</kbd> to cycle
                    </span>
                  )}
                </span>
                <span className="text-xs font-normal text-subtle-foreground">
                  {menuTarget.file} · {menuTarget.beat.label}
                </span>
              </ContextMenuLabel>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => setInstructing(menuTarget)}>
                <MessageSquareText />
                Instruct Choreo…
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => setEditing(menuTarget)}>
                <Code />
                Edit code…
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  void navigator.clipboard.writeText(menuTarget.file)
                }
              >
                <Copy />
                Copy file path
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => setDeleting(menuTarget)}
              >
                <Trash2 />
                Delete component…
              </ContextMenuItem>
            </>
          ) : (
            <ContextMenuLabel className="text-xs font-normal text-subtle-foreground">
              {stack.ids.length > 0
                ? "No component under the cursor. Use the arrows to pick one on stage."
                : "Right-click a component to instruct Choreo about it."}
            </ContextMenuLabel>
          )}

          <ContextMenuSeparator />
          <ContextMenuLabel className="flex items-baseline justify-between text-xs font-normal text-subtle-foreground">
            <span>
              Stop points · {custom ? `${stops.length} placed` : "phase starts"}
            </span>
            <span className="font-mono">@{menuOffset.toLocaleString()}</span>
          </ContextMenuLabel>
          {stopHere === undefined ? (
            <ContextMenuItem
              onSelect={() =>
                void setStops(
                  [...stops, menuOffset],
                  `Stop added at ${menuOffset.toLocaleString()}`,
                )
              }
            >
              <MapPinPlus />
              Add stop point here
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              disabled={stops.length === 1}
              onSelect={() =>
                void setStops(
                  stops.filter((at) => at !== stopHere),
                  `Stop at ${stopHere.toLocaleString()} removed`,
                )
              }
            >
              <MapPinOff />
              Remove stop point here
            </ContextMenuItem>
          )}
          {custom && (
            <ContextMenuItem
              onSelect={() =>
                void setStops(null, "Stops reset to phase starts")
              }
            >
              <RotateCcw />
              Reset to phase starts
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {instructing && (
        <ComponentInstructionDialog
          presentationId={presentationId}
          target={instructing}
          onClose={() => setInstructing(null)}
        />
      )}

      {editing && (
        <ComponentCodeDialog
          presentationId={presentationId}
          target={editing}
          onSaved={() => flash(`Saved ${editing.file}`)}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <DeleteComponentDialog
          presentationId={presentationId}
          target={deleting}
          sharedFile={config.components.some(
            (c) => c.id !== deleting.componentId && c.file === deleting.file,
          )}
          onDeleted={() => {
            onConfigSaved((current) => ({
              ...current,
              components: current.components.filter(
                (c) => c.id !== deleting.componentId,
              ),
            }));
            flash(`Deleted ${deleting.componentId}`);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
