import { useCallback, useEffect, useRef, useState } from "react";
import { editDiff } from "~/engine/history";
import type { HistoryEntryInput } from "~/engine/history";
import type { GenerateEvent, GenerateRequest } from "~/server/generate";
import type { FileChange } from "~/server/workspace";

export type LogEntry = { kind: "status" | "note"; message: string };

export type GenerationState =
  | { phase: "idle" }
  | { phase: "running"; log: LogEntry[] }
  | {
      phase: "review";
      log: LogEntry[];
      summary: string;
      changes: FileChange[];
      warnings: string[];
      usage?: {
        input: number;
        output: number;
        thinking: number;
        cacheRead: number;
      };
      request: GenerateRequest;
      /** The request in the designer's words, for the history. */
      label: string;
      /** Choreo's version of each file, before any hand edits. */
      proposed: Record<string, string | null>;
    }
  | { phase: "error"; log: LogEntry[]; message: string };

export type ReviewState = Extract<GenerationState, { phase: "review" }>;

/** The history entry for a reviewed proposal; the server adds the time and outcome. */
export function historyFor(
  state: ReviewState,
): Omit<HistoryEntryInput, "at" | "outcome"> {
  const { request } = state;
  const handEdits = state.changes.flatMap((change) => {
    const proposed = state.proposed[change.path];
    return proposed != null && change.after != null && proposed !== change.after
      ? [{ path: change.path, diff: editDiff(proposed, change.after) }]
      : [];
  });
  return {
    kind: request.mode === "modify" ? "story" : request.mode,
    request: state.label,
    ...(request.mode === "component"
      ? { component: request.component, beat: request.beat }
      : request.mode === "phase"
        ? { beat: request.phase }
        : {}),
    summary: state.summary,
    files: state.changes.map((c) => c.path),
    ...(handEdits.length ? { handEdits } : {}),
  };
}

export function useGeneration() {
  const [state, setState] = useState<GenerationState>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);

  const start = useCallback(async (request: GenerateRequest, label: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const log: LogEntry[] = [];
    setState({ phase: "running", log });

    const handle = (event: GenerateEvent) => {
      if (event.type === "status" || event.type === "note") {
        const last = log[log.length - 1];
        if (!(
          event.type === "status" &&
          last?.kind === "status" &&
          last.message === event.message
        )) {
          log.push({ kind: event.type, message: event.message });
        }
        setState({ phase: "running", log: [...log] });
      } else if (event.type === "done") {
        const { type: _type, ...result } = event;
        const proposed = Object.fromEntries(
          event.changes.map((c) => [c.path, c.after]),
        );
        setState({
          phase: "review",
          log: [...log],
          ...result,
          request,
          label,
          proposed,
        });
      } else {
        setState({ phase: "error", log: [...log], message: event.message });
      }
    };

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ phase: "error", log, message: (error as Error).message });
    }
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setState({ phase: "idle" });
  }, []);

  /** Hand-edits a proposed file before it's applied; apply still validates the result. */
  const editChange = useCallback((path: string, after: string) => {
    setState((current) =>
      current.phase === "review"
        ? {
            ...current,
            changes: current.changes.map((c) =>
              c.path === path ? { ...c, after } : c,
            ),
          }
        : current,
    );
  }, []);

  return { state, start, reset, editChange };
}
