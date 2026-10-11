import { diffLines } from "diff";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { SegmentedControl } from "~/components/ui/segmented-control";
import type { FileChange } from "~/server/workspace";

const CONTEXT = 3;

type Line = { kind: "add" | "remove" | "same"; text: string };
type Row = Line | { kind: "skip"; count: number };

function toRows(before: string, after: string): Row[] {
  const lines: Line[] = diffLines(before, after).flatMap((part) =>
    part.value
      .replace(/\n$/, "")
      .split("\n")
      .map(
        (text) =>
          ({
            kind: part.added ? "add" : part.removed ? "remove" : "same",
            text,
          }) as Line,
      ),
  );

  const near = lines.map((_, i) =>
    lines
      .slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1)
      .some((line) => line.kind !== "same"),
  );

  const rows: Row[] = [];
  lines.forEach((line, i) => {
    if (near[i]) rows.push(line);
    else {
      const last = rows[rows.length - 1];
      if (last?.kind === "skip") last.count++;
      else rows.push({ kind: "skip", count: 1 });
    }
  });
  return rows;
}

const rowStyles = {
  add: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300",
  remove: "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300",
  same: "text-muted-foreground",
} as const;

const marks = { add: "+", remove: "-", same: " " } as const;

/**
 * A proposed file change. With `onEdit`, the proposed content can be edited in place before
 * applying; the diff always compares the file on disk with the current (possibly edited) text.
 */
export function DiffView({
  change,
  onEdit,
}: {
  change: FileChange;
  onEdit?: (after: string) => void;
}) {
  const [open, setOpen] = useState(change.before !== null);
  const [view, setView] = useState<"diff" | "edit">("diff");
  const [proposed] = useState(change.after);
  const rows = useMemo(
    () => toRows(change.before ?? "", change.after ?? ""),
    [change],
  );
  const added = rows.filter((r) => r.kind === "add").length;
  const removed = rows.filter((r) => r.kind === "remove").length;
  const label =
    change.before === null
      ? "new"
      : change.after === null
        ? "deleted"
        : "modified";
  const editable = onEdit !== undefined && change.after !== null;
  const edited = change.after !== proposed;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center bg-card text-sm">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-accent"
        >
          <span className="text-subtle-foreground">{open ? "▾" : "▸"}</span>
          <span className="truncate font-mono text-foreground">
            {change.path}
          </span>
          <span className="text-xs text-subtle-foreground">{label}</span>
          {edited && (
            <span className="rounded bg-sky-50 dark:bg-sky-950 px-1.5 text-xs text-sky-700 dark:text-sky-300">
              edited
            </span>
          )}
          <span className="ml-auto font-mono text-xs">
            <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>{" "}
            <span className="text-red-600 dark:text-red-400">-{removed}</span>
          </span>
        </button>
        {editable && (
          <SegmentedControl
            aria-label={`View ${change.path}`}
            className="mx-2 border-0"
          >
            {(["diff", "edit"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant="segment"
                size="xs"
                aria-pressed={open && view === value}
                onClick={() => {
                  setView(value);
                  setOpen(true);
                }}
              >
                {value === "diff" ? "Diff" : "Edit"}
              </Button>
            ))}
          </SegmentedControl>
        )}
      </div>
      {open && editable && view === "edit" && (
        <CodeEditor
          value={change.after ?? ""}
          onChange={onEdit}
          onRevert={
            edited && proposed !== null ? () => onEdit(proposed) : undefined
          }
          label={`Edit ${change.path}`}
        />
      )}
      {open && view === "diff" && (
        <pre className="max-h-96 overflow-auto bg-background py-2 font-mono text-xs leading-5">
          {rows.map((row, i) =>
            row.kind === "skip" ? (
              <div key={i} className="px-3 text-subtle-foreground/70">
                ⋯ {row.count} unchanged line{row.count === 1 ? "" : "s"}
              </div>
            ) : (
              <div
                key={i}
                className={`px-3 whitespace-pre ${rowStyles[row.kind]}`}
              >
                {marks[row.kind]} {row.text}
              </div>
            ),
          )}
        </pre>
      )}
    </div>
  );
}

const INDENT = "  ";

export function CodeEditor({
  value,
  onChange,
  onRevert,
  revertLabel = "Revert to Choreo’s version",
  hint = "Tab indents · checked when you apply",
  label,
  autoFocus,
  maxRows = 24,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Restores the starting version; absent when there are no edits. */
  onRevert?: () => void;
  revertLabel?: string;
  hint?: string;
  label: string;
  autoFocus?: boolean;
  maxRows?: number;
}) {
  const lines = value.split("\n").length;

  return (
    <div className="bg-background">
      <textarea
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key !== "Tab" ||
            event.metaKey ||
            event.ctrlKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          // Dialog focus traps would otherwise move focus out of the editor.
          event.stopPropagation();
          const el = event.currentTarget;
          const { selectionStart: start, selectionEnd: end } = el;
          if (event.shiftKey) {
            const lineStart = value.lastIndexOf("\n", start - 1) + 1;
            if (value.startsWith(INDENT, lineStart)) {
              onChange(
                value.slice(0, lineStart) +
                  value.slice(lineStart + INDENT.length),
              );
              requestAnimationFrame(() =>
                el.setSelectionRange(
                  start - INDENT.length,
                  end - INDENT.length,
                ),
              );
            }
            return;
          }
          onChange(value.slice(0, start) + INDENT + value.slice(end));
          requestAnimationFrame(() =>
            el.setSelectionRange(start + INDENT.length, start + INDENT.length),
          );
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        rows={Math.min(lines + 1, maxRows)}
        className="block w-full resize-y bg-transparent px-3 py-2 font-mono text-xs leading-5 whitespace-pre text-foreground outline-none [tab-size:2]"
      />
      <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-xs text-subtle-foreground">
        <span>{hint}</span>
        {onRevert && (
          <Button
            type="button"
            variant="quiet"
            size="xs"
            onClick={onRevert}
            className="ml-auto"
          >
            {revertLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
