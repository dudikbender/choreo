import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Check, KeyRound, Loader2, Palette } from 'lucide-react'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { THEMES, useTheme } from '~/lib/theme'
import type { ThemeId } from '~/lib/theme'
import { getApiKeyStatus, setApiKey } from '~/server/functions'

export const Route = createFileRoute('/settings')({
  loader: () => getApiKeyStatus(),
  head: () => ({ meta: [{ title: 'Settings · Choreo' }] }),
  component: Settings,
})

function Settings() {
  const status = Route.useLoaderData()
  const router = useRouter()
  const [replacing, setReplacing] = useState(false)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const editing = !status.set || replacing

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await setApiKey({ data: { key, replace: status.set } })
      setKey('')
      setReplacing(false)
      setSaved(true)
      await router.invalidate()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <Link to="/" aria-label="Back" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight select-none">Settings</h1>
      </header>

      <section className="rounded-2xl border border-border bg-card/60">
        <header className="border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <KeyRound className="size-4 text-muted-foreground" />
            Anthropic API key
          </h2>
          <p className="text-sm text-subtle-foreground">
            Used to design and modify presentations. It's saved to <code>.env</code> in this project and never sent to the
            browser.
          </p>
        </header>

        <div className="px-6 py-5">
          {status.set && !replacing && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="size-2 shrink-0 rounded-full bg-emerald-400" />
                <span className="text-foreground/80">{saved ? 'Saved and verified' : 'Set'}</span>
                <code className="truncate text-subtle-foreground">{status.hint}</code>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setReplacing(true)
                  setSaved(false)
                }}
              >
                Replace
              </Button>
            </div>
          )}

          {editing && (
            <form onSubmit={save} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm text-muted-foreground">
                  {status.set ? 'New API key' : 'No key is set yet. Paste one to get started.'}
                </span>
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-subtle-foreground/70 focus:border-ring focus:outline-none"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={saving || !key.trim()}>
                  {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  {saving ? 'Verifying…' : 'Save key'}
                </Button>
                {replacing && (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => {
                      setReplacing(false)
                      setKey('')
                      setError(null)
                    }}
                  >
                    Cancel
                  </Button>
                )}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-sm text-subtle-foreground underline hover:text-foreground/80"
                >
                  Get a key
                </a>
              </div>
            </form>
          )}
        </div>
      </section>

      <Appearance />
    </main>
  )
}

function Appearance() {
  const { theme, setTheme } = useTheme()

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card/60">
      <header className="border-b border-border px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Palette className="size-4 text-muted-foreground" />
          Appearance
        </h2>
        <p className="text-sm text-subtle-foreground">
          The studio's theme. Presentations keep their own design, and the present-mode controls stay dark.
        </p>
      </header>

      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-3">
        {THEMES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            onClick={() => setTheme(id)}
            className="group rounded-xl border border-border p-1.5 text-left outline-none hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-checked:border-foreground/60 aria-checked:ring-1 aria-checked:ring-foreground/60"
          >
            <ThemePreview id={id} />
            <span className="flex items-center justify-between px-1.5 pt-2 pb-1 text-sm">
              {label}
              {theme === id && <Check className="size-4" />}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** A miniature studio panel drawn with the theme's own tokens. */
function ThemePreview({ id }: { id: ThemeId }) {
  return (
    <div data-theme={id} className="flex h-20 gap-2 rounded-lg border border-border bg-background p-2 text-foreground">
      <div className="flex flex-1 flex-col gap-1.5 rounded-md border border-border bg-card p-2">
        <span className="h-1.5 w-3/4 rounded-full bg-foreground/80" />
        <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/60" />
        <span className="mt-auto h-3 w-10 rounded-full bg-primary" />
      </div>
      <div className="flex w-1/4 flex-col gap-1.5 py-1">
        <span className="h-1.5 rounded-full bg-accent" />
        <span className="h-1.5 rounded-full bg-accent" />
        <span className="h-1.5 rounded-full bg-accent" />
      </div>
    </div>
  )
}
