import { diffLines } from "diff";
import { z } from "zod";

/** Saved next to presentation.json; one JSON entry per line, oldest first. */
export const HISTORY_PATH = "history.jsonl";
/** How many recent entries Choreo sees with each new request. */
export const HISTORY_CONTEXT_LIMIT = 15;
/** Older entries are dropped from the file; this is working context, not an audit log. */
export const HISTORY_KEEP = 40;

const MAX_TEXT = 2000;
const MAX_EDIT_LINES = 24;

const clipped = (max: number) =>
  z.string().transform((s) => (s.length > max ? `${s.slice(0, max)}…` : s));

export const historyEntrySchema = z.object({
  at: z.string(),
  /** What produced the change: a story revision, a right-click instruction, a new presentation, or the designer by hand. */
  kind: z.enum([
    "create",
    "story",
    "component",
    "phase",
    "delete-component",
    "manual-edit",
    "variables",
    "rename",
  ]),
  outcome: z.enum(["applied", "discarded", "manual"]),
  /** What the designer asked for, in their words (or a description of a manual action). */
  request: clipped(MAX_TEXT),
  component: z.string().optional(),
  beat: z.string().optional(),
  /** Choreo's summary of what it proposed. */
  summary: clipped(MAX_TEXT).default(""),
  files: z.array(z.string()).default([]),
  /** Where the designer changed Choreo's code before applying: a few diff lines per file. */
  handEdits: z
    .array(z.object({ path: z.string(), diff: clipped(MAX_TEXT) }))
    .optional(),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type HistoryEntryInput = z.input<typeof historyEntrySchema>;

export function parseHistory(raw: string): HistoryEntry[] {
  return raw.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const parsed = historyEntrySchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

/** Only the changed lines between Choreo's proposal and what the designer kept. */
export function editDiff(proposed: string, kept: string): string {
  const lines = diffLines(proposed, kept).flatMap((part) =>
    part.added || part.removed
      ? part.value
          .replace(/\n$/, "")
          .split("\n")
          .map((line) => `${part.added ? "+" : "-"} ${line}`)
      : [],
  );
  const shown = lines.slice(0, MAX_EDIT_LINES);
  if (lines.length > shown.length)
    shown.push(`… ${lines.length - shown.length} more changed lines`);
  return shown.join("\n");
}

const OUTCOME_LABELS: Record<HistoryEntry["outcome"], string> = {
  applied: "applied",
  discarded: "DISCARDED by the designer",
  manual: "done by the designer",
};

/** The history block added to Choreo's opening message. */
export function formatHistory(entries: HistoryEntry[]): string {
  if (entries.length === 0) return "";
  const items = entries.map((entry, i) => {
    const scope = entry.component
      ? ` component="${entry.component}"`
      : entry.kind === "phase" && entry.beat
        ? ` phase="${entry.beat}"`
        : "";
    const parts = [
      `<change n="${i + 1}" at="${entry.at}" kind="${entry.kind}"${scope} outcome="${OUTCOME_LABELS[entry.outcome]}">`,
    ];
    parts.push(`Request: ${entry.request}`);
    if (entry.summary) parts.push(`Your summary: ${entry.summary}`);
    if (entry.files.length) parts.push(`Files: ${entry.files.join(", ")}`);
    for (const edit of entry.handEdits ?? []) {
      parts.push(
        entry.outcome === "manual"
          ? `The designer's edit to ${edit.path} (- before, + after):\n${edit.diff}`
          : `The designer hand-edited your ${edit.path} before applying (- yours, + theirs):\n${edit.diff}`,
      );
    }
    parts.push("</change>");
    return parts.join("\n");
  });
  return [
    `<history note="Earlier changes to this presentation, oldest first. Context only: the current files are the source of truth. Use it to resolve references like 'again' or 'undo that', respect hand edits as the designer's preference, and don't re-propose discarded ideas unless asked.">`,
    ...items,
    "</history>",
  ].join("\n");
}
