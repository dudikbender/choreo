import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { slugify } from "~/engine/story";
import { renamePresentation } from "~/server/functions";

/** Changes a presentation's title; its folder (and id) follow the new title. */
export function RenameDialog({
  id,
  title,
  onClose,
}: {
  id: string;
  title: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = draft.trim();
  const folder = slugify(next) || id;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!next || (next === title && folder === id)) return onClose();
    setSaving(true);
    setError(null);
    try {
      const report = await renamePresentation({ data: { id, title: next } });
      if (report.errors.length) throw new Error(report.errors.join("\n"));
      await router.invalidate();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename presentation</DialogTitle>
            <DialogDescription>
              {folder === id ? (
                <>
                  Its folder stays{" "}
                  <code className="text-foreground/80">
                    presentations/{id}/
                  </code>
                  .
                </>
              ) : (
                <>
                  Its folder moves to{" "}
                  <code className="text-foreground/80">
                    presentations/{folder}/
                  </code>
                  , or {folder}-2 if that's taken.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Title"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            maxLength={200}
            autoFocus
          />
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !next}>
              {saving ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
