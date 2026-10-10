import { Link, createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { PresentationsPanel } from "~/home/PresentationsPanel";
import { getPresentations } from "~/server/functions";

export const Route = createFileRoute("/")({
  loader: () => getPresentations(),
  component: Home,
});

function Home() {
  const presentations = Route.useLoaderData();

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight select-none">
            Choreo
          </h1>
          <p className="mt-1 text-neutral-400 select-none">
            Present your story, in scroll motion.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/settings"
            aria-label="Settings"
            title="Settings"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Settings className="size-5" />
          </Link>
          <Link
            to="/design"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
          >
            New presentation
          </Link>
        </div>
      </header>

      <PresentationsPanel presentations={presentations} />
    </main>
  );
}
