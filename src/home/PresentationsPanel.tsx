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
    <section className="flex min-h-0 flex-col rounded-2xl border border-neutral-800 bg-neutral-900/60">
      <header className="border-b border-neutral-800 px-6 py-4">
        <h2 className="text-lg font-semibold">Presentations</h2>
        <p className="text-sm text-neutral-500">
          {presentations.length} in <code>presentations/</code>
        </p>
      </header>

      {presentations.length === 0 ? (
        <p className="p-6 text-sm text-neutral-500">
          Nothing here yet.{" "}
          <Link
            to="/design"
            className="text-neutral-300 underline hover:text-white"
          >
            Design your first presentation
          </Link>
          .
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-neutral-800 overflow-y-auto">
          {presentations.map((p) => {
            const broken = p.errors.length > 0;
            return (
              <li key={p.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {p.title ?? p.id}
                    </div>
                    <div className="text-sm text-neutral-500">
                      {p.id} · {p.phaseCount} phases · {p.componentCount}{" "}
                      components
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      to="/design"
                      search={{ id: p.id }}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 hover:cursor-pointer"
                    >
                      Modify
                    </Link>
                    {broken ? (
                      <span className="rounded-lg px-3 py-1.5 text-sm text-neutral-600">
                        Present
                      </span>
                    ) : (
                      <Link
                        to="/studio/$id/present"
                        params={{ id: p.id }}
                        className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
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
                      <li key={e} className="text-red-400">
                        {e}
                      </li>
                    ))}
                    {p.warnings.map((w) => (
                      <li key={w} className="text-amber-400">
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
