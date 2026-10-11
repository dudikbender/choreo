import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { SegmentedControl } from "~/components/ui/segmented-control";
import { CodeEditor, DiffView } from "~/home/DiffView";
import { getComponentSource, saveComponent } from "~/server/functions";
import type { ComponentTarget } from "./ComponentInstructionDialog";

/** Edit a component's source by hand. Saving runs the same checks as Choreo's changes. */
export function ComponentCodeDialog({
  presentationId,
  target,
  onSaved,
  onClose,
}: {
  presentationId: string;
  target: ComponentTarget;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"edit" | "changes">("edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dirty = saved !== null && draft !== saved;

  useEffect(() => {
    let cancelled = false;
    getComponentSource({ data: { id: presentationId, path: target.file } })
      .then((source) => {
        if (cancelled) return;
        setSaved(source);
        setDraft(source);
      })
      .catch((error) => !cancelled && setLoadError((error as Error).message));
    return () => {
      cancelled = true;
    };
  }, [presentationId, target.file]);

  const save = async () => {
    if (!dirty || saved === null || saving) return;
    setSaving(true);
    setErrors([]);
    try {
      const report = await saveComponent({
        data: {
          id: presentationId,
          component: target.componentId,
          path: target.file,
          before: saved,
          after: draft,
        },
      });
      if (report.errors.length > 0) {
        setErrors(report.errors);
        return;
      }
      onSaved();
      onClose();
    } catch (error) {
      setErrors([(error as Error).message]);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (saving) return;
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="flex max-h-[calc(100vh-4rem)] flex-col gap-0 p-0 sm:max-w-4xl"
        onKeyDown={(event) => {
          if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void save();
          }
        }}
      >
        <DialogHeader className="flex-row items-start justify-between gap-4 border-b border-border px-6 py-4 text-left">
          <div className="min-w-0">
            <DialogTitle>
              Edit{" "}
              <code className="font-mono text-sky-700 dark:text-sky-300">
                {target.componentId}
              </code>
            </DialogTitle>
            <DialogDescription className="font-mono">
              {target.file}
            </DialogDescription>
          </div>
          {saved !== null && (
            <SegmentedControl aria-label="View" className="mr-8 shrink-0">
              <Button
                type="button"
                variant="segment"
                size="xs"
                aria-pressed={view === "edit"}
                onClick={() => setView("edit")}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="segment"
                size="xs"
                aria-pressed={view === "changes"}
                onClick={() => setView("changes")}
                disabled={!dirty}
              >
                Changes
              </Button>
            </SegmentedControl>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {saved === null ? (
            <p
              className={`text-sm ${loadError ? "text-red-600 dark:text-red-400" : "text-subtle-foreground"}`}
            >
              {loadError ?? "Loading source…"}
            </p>
          ) : view === "edit" || !dirty ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <CodeEditor
                value={draft}
                onChange={setDraft}
                onRevert={dirty ? () => setDraft(saved) : undefined}
                revertLabel="Revert to saved"
                hint="Tab indents · ⌘S saves · checked before saving"
                label={`Edit ${target.file}`}
                maxRows={32}
                autoFocus
              />
            </div>
          ) : (
            <DiffView
              change={{ path: target.file, before: saved, after: draft }}
            />
          )}
          {errors.length > 0 && (
            <ul className="space-y-0.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <span className="mr-auto self-center text-xs text-subtle-foreground">
            {dirty
              ? "Unsaved changes"
              : "Keyframes live in presentation.json; this edits the component’s look."}
          </span>
          <Button
            variant="outline"
            type="button"
            onClick={close}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
