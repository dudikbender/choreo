import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { layoutStory } from "~/server/functions";
import type { StoryLayout } from "~/server/layout";
import { DictationTextarea } from "./StoryEditor";

/** Describe a presentation in prose; Choreo turns it into a theme and beats for the editor. */
export function DescribeStoryDialog({
  title,
  replacesBeats,
  onLayout,
  onClose,
}: {
  title: string;
  /** Warns that the beats already in the editor will be replaced. */
  replacesBeats: boolean;
  onLayout: (layout: StoryLayout) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!description.trim() || running) return;
    setRunning(true);
    setError(null);
    try {
      onLayout(await layoutStory({ data: { title, description } }));
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !running && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>Describe the story</DialogTitle>
          <DialogDescription>
            What it’s about, who it’s for, the tone, and the points to hit in
            order. Choreo lays it out as a theme and story beats you can refine
            before generating.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
            <div className="rounded-lg border border-input bg-background focus-within:border-ring">
              <DictationTextarea
                value={description}
                onChange={setDescription}
                disabled={running}
                rows={10}
                autoFocus
                placeholder="A five-minute pitch to first-time investors for a coffee subscription. Warm and earthy, generous type. Open on the problem: stale supermarket beans. Then how it works in three steps, the pricing tiers, and close on a sign-up call to action."
                className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-subtle-foreground/70"
              />
            </div>
            {replacesBeats && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                This replaces the theme and beats you’ve already written.
              </p>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={running}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!description.trim() || running}
            >
              {running && <Loader2 className="animate-spin" />}
              {running ? "Laying out…" : "Lay out beats"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
