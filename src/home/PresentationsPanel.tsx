import { Link } from "@tanstack/react-router";
import type { PresentationSummary } from "~/server/workspace";
import { ExportButton } from "./ExportButton";
import { PresentationActions } from "./PresentationActions";

export function PresentationsPanel({
  presentations,
}: {
  presentations: PresentationSummary[];
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card/60">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">Presentations</h2>
        <p className="text-sm text-subtle-foreground">
          {presentations.length} in <code>presentations/</code>
        </p>
      </header>

      {presentations.length === 0 ? (
        <p className="p-6 text-sm text-subtle-foreground">
          Nothing here yet.{" "}
          <Link
            to="/design"
            className="text-foreground/80 underline hover:text-foreground"
          >
            Design your first presentation
          </Link>
          .
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {presentations.map((p) => {
            const broken = p.errors.length > 0;
            return (
              <li key={p.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {p.title ?? p.id}
                    </div>
                    <div className="text-sm text-subtle-foreground">
                      {p.id} · {p.phaseCount} phases · {p.componentCount}{" "}
                      components
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      to="/studio/$id/edit"
                      params={{ id: p.id }}
                      className="rounded-lg border border-input px-3 py-1.5 text-sm text-foreground hover:bg-accent hover:cursor-pointer"
                    >
                      Modify
                    </Link>
                    {broken ? (
                      <span className="rounded-lg px-3 py-1.5 text-sm text-subtle-foreground/70">
                        Present
                      </span>
                    ) : (
                      <Link
                        to="/studio/$id/present"
                        params={{ id: p.id }}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Present
                      </Link>
                    )}
                    <PresentationActions id={p.id} title={p.title ?? p.id} />
                  </div>
                </div>
                {(p.errors.length > 0 || p.warnings.length > 0) && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {p.errors.map((e) => (
                      <li key={e} className="text-red-600 dark:text-red-400">
                        {e}
                      </li>
                    ))}
                    {p.warnings.map((w) => (
                      <li key={w} className="text-amber-600 dark:text-amber-400">
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
