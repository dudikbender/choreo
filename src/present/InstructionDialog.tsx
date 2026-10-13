import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { DiffView } from "~/home/DiffView";
import { HistoryList } from "~/home/HistoryList";
import { ProgressLog } from "~/home/ProgressLog";
import { DictationTextarea } from "~/home/StoryEditor";
import { historyFor, useGeneration } from "~/home/useGeneration";
import { applyProposal, recordDiscard } from "~/server/functions";
import type { GenerateRequest } from "~/server/generate";

/** Free-text instruction to Choreo, then review and apply its proposed changes. */
export function InstructionDialog({
  presentationId,
  title,
  description,
  placeholder,
  history,
  buildRequest,
  onClose,
}: {
  presentationId: string;
  title: React.ReactNode;
  description: React.ReactNode;
  placeholder: string;
  /** Narrows the earlier-changes list to one component or phase. */
  history: { component?: string; phase?: string };
  buildRequest: (instruction: string) => GenerateRequest;
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyErrors, setApplyErrors] = useState<string[]>([]);
  const { state, start, reset, editChange } = useGeneration();

  const generate = () => {
    if (!instruction.trim()) return;
    setApplyErrors([]);
    start(buildRequest(instruction), instruction.trim());
  };

  const discard = () => {
    if (state.phase === "review")
      void recordDiscard({
        data: { id: presentationId, history: historyFor(state) },
      });
    reset();
  };

  const apply = async () => {
    if (state.phase !== "review") return;
    setApplying(true);
    try {
      const report = await applyProposal({
        data: {
          id: presentationId,
          create: false,
          changes: state.changes,
          history: historyFor(state),
        },
      });
      if (report.errors.length > 0) {
        setApplyErrors(report.errors);
        return;
      }
      onClose();
    } catch (error) {
      setApplyErrors([(error as Error).message]);
    } finally {
      setApplying(false);
    }
  };

  const editing = state.phase === "idle" || state.phase === "error";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open || applying) return;
        discard();
        onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(860px,calc(100vh-4rem))] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {editing && (
            <div
              className="rounded-lg border border-input bg-background focus-within:border-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  generate();
                }
              }}
            >
              <DictationTextarea
                value={instruction}
                onChange={setInstruction}
                rows={4}
                autoFocus
                placeholder={placeholder}
                aria-label="Instruction"
                className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-subtle-foreground/70"
              />
            </div>
          )}

          {editing && <HistoryList id={presentationId} {...history} />}

          {state.phase === "error" && (
            <p className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm whitespace-pre-wrap text-red-700 dark:text-red-300">
              {state.message}
            </p>
          )}

          {state.phase === "running" && <ProgressLog log={state.log} running />}

          {state.phase === "review" && (
            <>
              <p className="text-sm whitespace-pre-wrap text-foreground">
                {state.summary}
              </p>
              {state.warnings.length > 0 && (
                <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
                  {state.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {state.changes.length === 0 ? (
                <p className="text-sm text-subtle-foreground">No files changed.</p>
              ) : (
                <div className="space-y-2">
                  {state.changes.map((change) => (
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
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          {editing && (
            <>
              <span className="mr-auto self-center text-xs text-subtle-foreground">
                ⌘↵ to generate
              </span>
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={generate}
                disabled={!instruction.trim()}
              >
                Generate change
              </Button>
            </>
          )}
          {state.phase === "running" && (
            <Button variant="outline" type="button" onClick={reset}>
              Stop
            </Button>
          )}
          {state.phase === "review" && (
            <>
              <Button
                variant="outline"
                type="button"
                onClick={discard}
                disabled={applying}
              >
                Discard
              </Button>
              <Button
                type="button"
                onClick={apply}
                disabled={applying || state.changes.length === 0}
              >
                {applying
                  ? "Applying…"
                  : `Apply ${state.changes.length} change${state.changes.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
