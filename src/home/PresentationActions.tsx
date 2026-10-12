import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  EllipsisVertical,
  FileDown,
  FileText,
  GitFork,
  ImageIcon,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { forkPresentation, removePresentation } from "~/server/functions";
import { AssetsDialog } from "./AssetsDialog";
import { download } from "./download";
import { RenameDialog } from "./RenameDialog";

export function PresentationActions({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [managingAssets, setManagingAssets] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<"forking" | "saving" | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  /** Keeps the menu open while `task` runs, so its progress and any error show in place. */
  const run = async (kind: "forking" | "saving", task: () => Promise<void>) => {
    setBusy(kind);
    setMenuError(null);
    try {
      await task();
      setMenuOpen(false);
    } catch (e) {
      setMenuError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fork = () =>
    run("forking", async () => {
      const copy = await forkPresentation({ data: { id } });
      await navigate({ to: "/studio/$id/edit", params: { id: copy.id } });
    });

  const save = () =>
    run("saving", () => download(`/api/save/${id}`, `${id}.html`));

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await removePresentation({ data: { id } });
      setConfirming(false);
      await router.invalidate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          if (busy) return;
          setMenuOpen(open);
          if (!open) setMenuError(null);
        }}
      >
        <DropdownMenuTrigger
          aria-label={`More actions for ${title}`}
          className="rounded-lg p-2 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground hover:cursor-pointer"
        >
          <EllipsisVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setManagingAssets(true)}>
            <ImageIcon />
            Assets…
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/studio/$id/print" params={{ id }}>
              <FileText />
              Export...
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy !== null}
            title="Copy this presentation, then give the copy a new instruction"
            onSelect={(event) => {
              event.preventDefault();
              void fork();
            }}
          >
            {busy === "forking" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <GitFork />
            )}
            {busy === "forking" ? "Forking…" : "Fork…"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy !== null}
            title="Download a single HTML file that plays on its own, scroll and all"
            onSelect={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {busy === "saving" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FileDown />
            )}
            {busy === "saving" ? "Saving…" : "Save…"}
          </DropdownMenuItem>
          {menuError && (
            <p
              role="alert"
              className="max-w-56 px-2 py-1.5 text-xs text-red-600 dark:text-red-400"
            >
              {menuError}
            </p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirming(true)}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (deleting) return;
          setConfirming(open);
          if (!open) setError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes{" "}
              <code className="text-foreground/80">presentations/{id}/</code> —
              its story, components and assets. It can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renaming && (
        <RenameDialog
          id={id}
          title={title}
          onClose={() => setRenaming(false)}
        />
      )}
      {managingAssets && (
        <AssetsDialog
          id={id}
          title={title}
          onClose={() => setManagingAssets(false)}
        />
      )}
    </>
  );
}
