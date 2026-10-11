import {
  Check,
  ChevronRight,
  Copy,
  Database,
  FileText,
  Globe,
  ImageIcon,
  Link2,
  Loader2,
  Music,
  Plus,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { UPLOAD_ACCEPT, formatBytes, isRemote } from "~/engine/assets";
import type { AssetEntry, AssetKind } from "~/engine/assets";
import {
  addAssetUrl,
  copyAsset,
  describeAsset,
  getAssets,
  removeAsset,
} from "~/server/functions";

type Others = Awaited<ReturnType<typeof getAssets>>["others"];

const KIND_ICONS: Record<AssetKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  data: Database,
  document: FileText,
  link: Link2,
  embed: Globe,
};

const fileUrl = (id: string, name: string) =>
  `/api/assets/${id}/${encodeURIComponent(name)}`;

/** What to paste into a component to use the asset. */
function usageSnippet(asset: AssetEntry): string {
  if (isRemote(asset)) return asset.url ?? "";
  const variable = asset.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) =>
      c ? c.toUpperCase() : "",
    )
    .replace(/^\d/, (d) => `_${d}`);
  return `import ${variable || "asset"} from '../assets/${asset.name}'`;
}

/**
 * Photos, videos, audio, data and links for one presentation. Choreo sees every asset's name,
 * kind and description (and can look at images), so describing them helps it use them well.
 */
export function AssetsDialog({
  id,
  title,
  onClose,
}: {
  id: string;
  title: string;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<AssetEntry[] | null>(null);
  const [others, setOthers] = useState<Others>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await getAssets({ data: { id } });
    setAssets(result.assets);
    setOthers(result.others);
  }, [id]);

  useEffect(() => {
    load().catch((error) => setErrors([(error as Error).message]));
  }, [load]);

  const run = async (label: string, task: () => Promise<string[] | void>) => {
    setBusy(label);
    setErrors([]);
    try {
      const problems = await task();
      if (problems?.length) setErrors(problems);
      await load();
    } catch (error) {
      setErrors([(error as Error).message]);
    } finally {
      setBusy(null);
    }
  };

  const upload = (files: File[]) => {
    if (files.length === 0) return;
    void run(
      files.length === 1
        ? `Uploading ${files[0].name}…`
        : `Uploading ${files.length} files…`,
      async () => {
        const form = new FormData();
        for (const file of files) form.append("file", file);
        const response = await fetch(`/api/asset-upload/${id}`, {
          method: "POST",
          body: form,
        });
        const body = (await response.json().catch(() => null)) as {
          errors?: string[];
          error?: string;
        } | null;
        return body?.error ? [body.error] : (body?.errors ?? []);
      },
    );
  };

  const addUrl = (value = url) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    void run("Adding link…", async () => {
      await addAssetUrl({
        data: {
          id,
          url: /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
        },
      });
      setUrl("");
    });
  };

  const count = assets?.length ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[calc(100vh-4rem)] flex-col gap-0 p-0 sm:max-w-3xl"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          upload([...event.dataTransfer.files]);
        }}
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (files.length > 0) {
            event.preventDefault();
            upload(files);
          }
        }}
      >
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>Assets · {title}</DialogTitle>
          <DialogDescription>
            Photos, videos, audio, JSON data and links. Choreo sees each asset’s
            description and can look at images, so mention them in your story or
            instructions.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="dashed"
              data-active={dragging}
              onClick={() => input.current?.click()}
              className="h-auto flex-col gap-1.5 py-6 whitespace-normal"
            >
              <Upload className="size-5" />
              <span>Drop files, paste, or browse</span>
              <span className="text-xs font-normal">
                Images, video, audio, JSON, PDF · up to 100 MB
              </span>
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="hidden"
              onChange={(event) => {
                upload([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
            <form
              className="flex flex-col justify-center gap-2 rounded-xl border border-border px-4 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                addUrl();
              }}
            >
              <label
                htmlFor="asset-url"
                className="text-sm font-medium text-foreground/80"
              >
                Add from a URL
              </label>
              <div className="flex gap-2">
                <input
                  id="asset-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://…"
                  className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none placeholder:text-subtle-foreground/70 focus:border-ring"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!url.trim() || busy !== null}
                >
                  Add
                </Button>
              </div>
              <span className="text-xs text-subtle-foreground">
                Image and video files are downloaded. YouTube, Vimeo and Loom
                become embeds; other pages are links.
              </span>
            </form>
          </div>

          {busy && (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
              {busy}
            </p>
          )}
          {errors.length > 0 && (
            <ul className="space-y-0.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {assets === null ? (
            <p className="text-sm text-subtle-foreground">Loading assets…</p>
          ) : count === 0 ? (
            <p className="text-sm text-subtle-foreground">No assets yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {assets.map((asset) => (
                <AssetCard
                  key={asset.name}
                  id={id}
                  asset={asset}
                  onDescribe={(description) =>
                    run("Saving description…", () =>
                      describeAsset({
                        data: { id, name: asset.name, description },
                      }),
                    )
                  }
                  onRemove={() =>
                    run(`Removing ${asset.name}…`, async () => {
                      const result = await removeAsset({
                        data: { id, name: asset.name },
                      });
                      return result.error ? [result.error] : [];
                    })
                  }
                />
              ))}
            </ul>
          )}

          {others.length > 0 && (
            <details className="group rounded-lg border border-border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-foreground/80 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 text-subtle-foreground transition-transform group-open:rotate-90" />
                Add from another presentation
              </summary>
              <div className="space-y-3 border-t border-border px-3 py-3">
                {others.map((group) => (
                  <div key={group.presentation}>
                    <p className="text-xs text-subtle-foreground">{group.title}</p>
                    <ul className="mt-1.5 flex flex-wrap gap-2">
                      {group.assets.map((asset) => {
                        const Icon = KIND_ICONS[asset.kind];
                        return (
                          <li key={asset.name}>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={busy !== null}
                              onClick={() =>
                                run(`Copying ${asset.name}…`, async () => {
                                  await copyAsset({
                                    data: {
                                      from: group.presentation,
                                      name: asset.name,
                                      to: id,
                                    },
                                  });
                                })
                              }
                              title={asset.description || asset.name}
                              className="h-auto gap-2 py-1 pl-1"
                            >
                              {asset.kind === "image" ? (
                                <img
                                  src={fileUrl(group.presentation, asset.name)}
                                  alt=""
                                  className="size-7 rounded bg-accent object-cover"
                                />
                              ) : (
                                <span className="flex size-7 items-center justify-center rounded bg-accent">
                                  <Icon className="size-3.5 text-muted-foreground" />
                                </span>
                              )}
                              <span className="max-w-40 truncate font-mono">
                                {asset.name}
                              </span>
                              <Plus className="size-3.5 text-subtle-foreground" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssetCard({
  id,
  asset,
  onDescribe,
  onRemove,
}: {
  id: string;
  asset: AssetEntry;
  onDescribe: (description: string) => void;
  onRemove: () => void;
}) {
  const [description, setDescription] = useState(asset.description);
  const [copied, setCopied] = useState(false);
  const Icon = KIND_ICONS[asset.kind];
  const remote = isRemote(asset);
  const details = [
    asset.kind,
    asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
    asset.bytes ? formatBytes(asset.bytes) : null,
  ].filter(Boolean);

  useEffect(() => setDescription(asset.description), [asset.description]);

  const commit = () => {
    if (description.trim() !== asset.description) onDescribe(description);
  };

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex h-36 items-center justify-center bg-card bg-[repeating-conic-gradient(#262626_0%_25%,#1c1c1c_0%_50%)] bg-size-[16px_16px]">
        {asset.kind === "image" ? (
          <img
            src={fileUrl(id, asset.name)}
            alt={asset.description || asset.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : asset.kind === "video" ? (
          <video
            src={fileUrl(id, asset.name)}
            muted
            controls
            preload="metadata"
            className="max-h-full max-w-full"
          />
        ) : asset.kind === "audio" ? (
          <audio
            src={fileUrl(id, asset.name)}
            controls
            preload="none"
            className="w-11/12"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Icon className="size-7 text-subtle-foreground" />
            {remote && (
              <a
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                className="line-clamp-2 text-xs break-all text-sky-700 dark:text-sky-300 hover:underline"
              >
                {asset.url}
              </a>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p
              className="truncate font-mono text-sm text-foreground"
              title={asset.name}
            >
              {asset.name}
            </p>
            <p className="text-xs text-subtle-foreground">{details.join(" · ")}</p>
          </div>
          <Button
            type="button"
            variant="quiet"
            size="icon-sm"
            aria-label={remote ? "Copy URL" : "Copy import line"}
            title={remote ? "Copy URL" : "Copy import line"}
            onClick={() => {
              void navigator.clipboard.writeText(usageSnippet(asset));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
          </Button>
          <Button
            type="button"
            variant="quiet-destructive"
            size="icon-sm"
            aria-label={`Remove ${asset.name}`}
            title="Remove"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          rows={2}
          placeholder="Describe it for Choreo — e.g. “Team photo at the offsite, Sarah in front”"
          aria-label={`Description of ${asset.name}`}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-xs leading-relaxed text-foreground outline-none placeholder:text-subtle-foreground/70 focus:border-ring"
        />
      </div>
    </li>
  );
}
