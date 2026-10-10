import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Check, KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
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
        <Link to="/" aria-label="Back" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight select-none">Settings</h1>
      </header>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60">
        <header className="border-b border-neutral-800 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <KeyRound className="size-4 text-neutral-400" />
            Anthropic API key
          </h2>
          <p className="text-sm text-neutral-500">
            Used to design and modify presentations. It's saved to <code>.env</code> in this project and never sent to the
            browser.
          </p>
        </header>

        <div className="px-6 py-5">
          {status.set && !replacing && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="size-2 shrink-0 rounded-full bg-emerald-400" />
                <span className="text-neutral-300">{saved ? 'Saved and verified' : 'Set'}</span>
                <code className="truncate text-neutral-500">{status.hint}</code>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplacing(true)
                  setSaved(false)
                }}
                className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Replace
              </button>
            </div>
          )}

          {editing && (
            <form onSubmit={save} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm text-neutral-400">
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
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || !key.trim()}
                  className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {saving ? 'Verifying…' : 'Save key'}
                </button>
                {replacing && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplacing(false)
                      setKey('')
                      setError(null)
                    }}
                    className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  >
                    Cancel
                  </button>
                )}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-sm text-neutral-500 underline hover:text-neutral-300"
                >
                  Get a key
                </a>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
