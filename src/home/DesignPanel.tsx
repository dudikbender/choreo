import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { SegmentedControl } from "~/components/ui/segmented-control";
import {
  assignBeatIds,
  diffStories,
  serializeStory,
  slugify,
} from "~/engine/story";
import type { Story } from "~/engine/story";
import { applyProposal, getStory, recordDiscard } from "~/server/functions";
import type { StoryLayout } from "~/server/layout";
import { DescribeStoryDialog } from "./DescribeStoryDialog";
import { DiffView } from "./DiffView";
import { HistoryList } from "./HistoryList";
import { DictationTextarea, StoryEditor, newBeat } from "./StoryEditor";
import type { DraftBeat } from "./StoryEditor";
import { StoryMarkdown } from "./StoryMarkdown";
import { ProgressLog } from "./ProgressLog";
import { historyFor, useGeneration } from "./useGeneration";

export type DesignTarget =
  { mode: "create" } | { mode: "modify"; id: string; title: string };

type Draft = { title: string; theme: string; beats: DraftBeat[] };

const blankDraft = (): Draft => ({
  title: "",
  theme: "",
  beats: [newBeat(), newBeat(), newBeat()],
});
const toDraft = (story: Story): Draft => ({
  title: story.title,
  theme: story.theme,
  beats: story.beats.map((beat) => newBeat(beat)),
});
const toStory = (draft: Draft): Story => ({
  title: draft.title,
  theme: draft.theme,
  beats: draft.beats.map(({ key: _key, ...beat }) => beat),
});

export function DesignPanel({
  target,
  existingIds,
  onTargetChange,
  onApplied,
  allowModeSwitch = true,
  onDone,
}: {
  target: DesignTarget;
  existingIds: string[];
  onTargetChange: (target: DesignTarget) => void;
  onApplied: () => Promise<void>;
  /** When false, hides the create/modify switch (used in the present-mode dialog). */
  allowModeSwitch?: boolean;
  /** Replaces the post-save "Present" link — e.g. a Done button that closes a dialog. */
  onDone?: () => void;
}) {
  const creating = target.mode === "create";
  const [draft, setDraft] = useState<Draft | null>(
    creating ? blankDraft : null,
  );
  const [saved, setSaved] = useState<Story | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [describing, setDescribing] = useState(false);
  const [view, setView] = useState<"beats" | "markdown">("beats");
  const [applying, setApplying] = useState(false);
  const [applyErrors, setApplyErrors] = useState<string[]>([]);
  const [applied, setApplied] = useState<{ id: string; title: string } | null>(
    null,
  );
  /** Bumped after each apply or discard so the history list refetches. */
  const [historyVersion, setHistoryVersion] = useState(0);
  const { state, start, reset, editChange } = useGeneration();
  const body = useRef<HTMLDivElement>(null);

  const id = creating ? slugify(draft?.title ?? "") : target.id;
  const idTaken = creating && existingIds.includes(id);

  const modifyId = target.mode === "modify" ? target.id : null;
  const loadStory = useCallback(async () => {
    if (!modifyId) return;
    try {
      const result = await getStory({ data: { id: modifyId } });
      setSaved(result.story);
      setDraft(toDraft(result.story));
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [modifyId]);

  useEffect(() => {
    void loadStory();
  }, [loadStory]);

  const story = useMemo(() => (draft ? toStory(draft) : null), [draft]);
  const ids = useMemo(
    () => (draft ? assignBeatIds(draft.beats).map((b) => b.id) : []),
    [draft],
  );
  const markdown = useMemo(() => (story ? serializeStory(story) : ""), [story]);
  const changes = useMemo(
    () => (saved && story ? diffStories(saved, story) : []),
    [saved, story],
  );

  const blocker = !draft
    ? "Loading…"
    : creating && !draft.title.trim()
      ? "Give the presentation a title"
      : idTaken
        ? `presentations/${id} already exists`
        : draft.beats.length === 0
          ? "Add at least one beat"
          : draft.beats.some((beat) => !beat.title.trim())
            ? "Give every beat a title"
            : !creating && changes.length === 0 && !notes.trim()
              ? "Edit a beat or transition, or add direction"
              : null;

  const hasWrittenStory =
    !!draft?.theme.trim() ||
    !!draft?.beats.some(
      (b) => b.title.trim() || b.description.trim() || b.transition.trim(),
    );

  const applyLayout = (layout: StoryLayout) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            theme: layout.theme,
            beats: layout.beats.map((beat) => newBeat(beat)),
          }
        : d,
    );
    setDescribing(false);
    setView("beats");
    body.current?.scrollTo({ top: 0 });
  };

  const generate = () => {
    if (blocker || !story) return;
    setApplyErrors([]);
    const label = creating
      ? `Create "${story.title}" from its story.`
      : [...changes.map((c) => `Story: ${c}`), notes.trim()]
          .filter(Boolean)
          .join("\n");
    start({ mode: target.mode, id, story, notes }, label);
  };

  const discard = () => {
    if (state.phase === "review" && !creating) {
      void recordDiscard({ data: { id, history: historyFor(state) } }).then(
        () => setHistoryVersion((v) => v + 1),
      );
    }
    reset();
  };

  const apply = async () => {
    if (state.phase !== "review") return;
    setApplying(true);
    try {
      const report = await applyProposal({
        data: {
          id,
          create: creating,
          changes: state.changes,
          history: historyFor(state),
        },
      });
      if (report.errors.length > 0) {
        setApplyErrors(report.errors);
        return;
      }
      await onApplied();
      reset();
      setHistoryVersion((v) => v + 1);
      setApplied({ id, title: creating ? (draft?.title ?? id) : target.title });
      setNotes("");
      setView("beats");
      if (creating) setDraft(blankDraft());
      else await loadStory();
    } catch (error) {
      setApplyErrors([(error as Error).message]);
    } finally {
      setApplying(false);
    }
  };

  const editing = state.phase === "idle" || state.phase === "error";
  const transitionCount = Math.max(0, (draft?.beats.length ?? 0) - 1);
  const described =
    draft?.beats.slice(0, -1).filter((b) => b.transition.trim()).length ?? 0;
  const reviewChanges =
    state.phase === "review" ? storyFirst(state.changes) : [];

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card/60">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-lg font-semibold">
              {creating ? "Design a presentation" : `Modify “${target.title}”`}
            </h2>
            {editing && draft && (
              <SegmentedControl aria-label="View">
                {(["beats", "markdown"] as const).map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant="segment"
                    size="xs"
                    aria-pressed={view === v}
                    onClick={() => {
                      setView(v);
                      body.current?.scrollTo({ top: 0 });
                    }}
                  >
                    {v === "beats" ? "Story" : "story.md"}
                  </Button>
                ))}
              </SegmentedControl>
            )}
          </div>
          <p className="text-sm text-subtle-foreground">
            {creating
              ? "Lay out the story beat by beat. Choreo choreographs the transitions you leave open."
              : "Revise the beats and transitions. Choreo updates the choreography to match."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {allowModeSwitch && !creating && (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={() => onTargetChange({ mode: "create" })}
            >
              New instead
            </Button>
          )}
          {onDone && (
            <Button type="button" variant="quiet" size="sm" onClick={onDone}>
              Close
            </Button>
          )}
        </div>
      </header>

      <div ref={body} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        {applied && state.phase === "idle" && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm">
            <p className="text-emerald-700 dark:text-emerald-300">Saved “{applied.title}”.</p>
            <div className="mt-3 flex gap-2">
              {onDone ? (
                <Button type="button" size="sm" onClick={onDone}>
                  Done
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link to="/studio/$id/present" params={{ id: applied.id }}>
                    Present
                  </Link>
                </Button>
              )}
              {allowModeSwitch && creating && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onTargetChange({
                      mode: "modify",
                      id: applied.id,
                      title: applied.title,
                    })
                  }
                >
                  Keep refining
                </Button>
              )}
            </div>
          </div>
        )}

        {editing && !draft && (
          <p
            className={`text-sm ${loadError ? "text-red-600 dark:text-red-400" : "text-subtle-foreground"}`}
          >
            {loadError
              ? `Couldn’t load the story: ${loadError}`
              : "Loading story…"}
          </p>
        )}

        {editing && draft && view === "markdown" && (
          <StoryMarkdown
            markdown={markdown}
            path={`presentations/${id || "…"}/story.md`}
            changes={creating ? undefined : changes}
          />
        )}

        {editing && draft && view === "beats" && (
          <div
            className="space-y-6"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                generate();
              }
            }}
          >
            {!creating && <HistoryList key={historyVersion} id={id} />}

            {creating && (
              <label className="block">
                <span className="text-sm text-muted-foreground">Title</span>
                <input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  placeholder="Quarterly Vision"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:border-ring"
                />
                {id && (
                  <span
                    className={`mt-1 block text-xs ${idTaken ? "text-red-600 dark:text-red-400" : "text-subtle-foreground"}`}
                  >
                    {idTaken
                      ? `presentations/${id} already exists`
                      : `Saved to presentations/${id}/`}
                  </span>
                )}
              </label>
            )}

            <div>
              <FieldLabel
                title="Theme"
                hint="The through-line: audience, tone, palette, the one thing viewers should remember."
              />
              <div className="mt-1.5 rounded-lg border border-input bg-background focus-within:border-ring">
                <DictationTextarea
                  value={draft.theme}
                  onChange={(theme) =>
                    setDraft((d) => (d ? { ...d, theme } : d))
                  }
                  rows={3}
                  placeholder="A warm, confident pitch for first-time investors. Earthy palette, generous type. Leave them believing coffee subscriptions can be personal."
                  className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-subtle-foreground/70"
                />
              </div>
            </div>

            <div>
              <FieldLabel
                title={`Story beats · ${draft.beats.length}`}
                hint="Each beat becomes a phase: a rest frame the viewer scrolls to. Describe the transitions that matter; leave the rest to Choreo."
                action={
                  creating && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setDescribing(true)}
                    >
                      Describe story
                    </Button>
                  )
                }
              />
              <div className="mt-3">
                <StoryEditor
                  beats={draft.beats}
                  ids={ids}
                  onChange={(update) =>
                    setDraft((d) => (d ? { ...d, beats: update(d.beats) } : d))
                  }
                />
              </div>
            </div>

            {!creating && (
              <div>
                <FieldLabel
                  title="Other direction"
                  hint="Optional — changes that aren't about a single beat."
                />
                <div className="mt-1.5 rounded-lg border border-input bg-background focus-within:border-ring">
                  <DictationTextarea
                    value={notes}
                    onChange={setNotes}
                    rows={2}
                    placeholder="Make every heading a size bigger and slow the whole thing down a little."
                    className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-subtle-foreground/70"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {state.phase === "error" && (
          <p className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm whitespace-pre-wrap text-red-700 dark:text-red-300">
            {state.message}
          </p>
        )}

        {state.phase === "running" && <ProgressLog log={state.log} running />}

        {state.phase === "review" && (
          <div className="space-y-4">
            <p className="text-sm whitespace-pre-wrap text-foreground">
              {state.summary}
            </p>
            {state.usage && (
              <p className="font-mono text-xs text-subtle-foreground">
                {state.usage.input.toLocaleString()} in /{" "}
                {state.usage.output.toLocaleString()} out
                {state.usage.thinking
                  ? ` (${state.usage.thinking.toLocaleString()} thinking)`
                  : ""}
                {state.usage.cacheRead
                  ? ` · ${state.usage.cacheRead.toLocaleString()} cache hits`
                  : ""}
              </p>
            )}
            {state.warnings.length > 0 && (
              <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
                {state.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {reviewChanges.length === 0 ? (
              <p className="text-sm text-subtle-foreground">No files changed.</p>
            ) : (
              <div className="space-y-2">
                {reviewChanges.map((change) => (
                  <DiffView
                    key={change.path}
                    change={change}
                    onEdit={(after) => editChange(change.path, after)}
                  />
                ))}
              </div>
            )}
            {applyErrors.length > 0 && (
              <ul className="space-y-0.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                {applyErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {editing && draft && (
        <footer className="flex items-center gap-3 border-t border-border px-6 py-4">
          <p
            className={`min-w-0 flex-1 truncate text-xs ${blocker && blocker !== "Loading…" ? "text-muted-foreground" : "text-subtle-foreground"}`}
          >
            {blocker ??
              `${draft.beats.length} beat${draft.beats.length === 1 ? "" : "s"} · ${described} of ${transitionCount} transition${transitionCount === 1 ? "" : "s"} described · ⌘↵ to generate`}
          </p>
          <Button type="button" onClick={generate} disabled={blocker !== null}>
            {creating ? "Generate presentation" : "Generate changes"}
          </Button>
        </footer>
      )}

      {state.phase === "running" && (
        <footer className="flex border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={reset}>
            Cancel
          </Button>
        </footer>
      )}

      {state.phase === "review" && (
        <footer className="flex gap-2 border-t border-border px-6 py-4">
          <Button
            type="button"
            onClick={apply}
            disabled={applying || state.changes.length === 0}
          >
            {applying
              ? "Applying…"
              : `Apply ${state.changes.length} change${state.changes.length === 1 ? "" : "s"}`}
          </Button>
          <Button type="button" variant="outline" onClick={discard}>
            Discard
          </Button>
        </footer>
      )}

      {describing && draft && (
        <DescribeStoryDialog
          title={draft.title}
          replacesBeats={hasWrittenStory}
          onLayout={applyLayout}
          onClose={() => setDescribing(false)}
        />
      )}
    </section>
  );
}

function storyFirst<T extends { path: string }>(changes: T[]): T[] {
  return [...changes].sort(
    (a, b) => Number(b.path === "story.md") - Number(a.path === "story.md"),
  );
}

function FieldLabel({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <span className="text-sm text-foreground/80">{title}</span>
        <p className="text-xs text-subtle-foreground">{hint}</p>
      </div>
      {action}
    </div>
  );
}
