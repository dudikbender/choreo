import { Check, Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { VARIABLE_NAME } from '~/engine/schema'
import type { Variables } from '~/engine/schema'
import { toVariableName, variableSnippet } from '~/engine/variables'
import { getVariableUsage, saveVariables } from '~/server/functions'

type Row = { key: string; name: string; value: string }

let nextKey = 0
const row = (name = '', value = ''): Row => ({ key: String(nextKey++), name, value })

function problemsOf(rows: Row[]): Map<string, string> {
  const problems = new Map<string, string>()
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.name) problems.set(r.key, 'Give it a name')
    else if (!VARIABLE_NAME.test(r.name)) problems.set(r.key, 'Use camelCase letters and digits, like clientName')
    else if (seen.has(r.name)) problems.set(r.key, `There's already a variable called ${r.name}`)
    seen.add(r.name)
  }
  return problems
}

/**
 * Text shared across a presentation's components, like a client's name. Components show a
 * variable with {vars.<name>}, so changing it here updates every slide that uses it.
 */
export function VariablesDialog({
  id,
  title,
  variables,
  onSaved,
  onClose,
}: {
  id: string
  title: string
  variables: Variables
  onSaved: (variables: Variables) => void
  onClose: () => void
}) {
  const [typed, setRows] = useState<Row[]>(() => Object.entries(variables).map(([name, value]) => row(name, value)))
  const rows = typed.map((r) => ({ ...r, name: toVariableName(r.name) }))
  const [usage, setUsage] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    getVariableUsage({ data: { id } })
      .then(setUsage)
      .catch(() => {})
  }, [id])

  const problems = problemsOf(rows)
  const next = Object.fromEntries(rows.map((r) => [r.name, r.value]))
  const dirty = JSON.stringify(next) !== JSON.stringify(variables)
  const removedInUse = Object.keys(variables).filter((name) => !(name in next) && usage[name]?.length)

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const save = async () => {
    setTouched(true)
    if (problems.size > 0) return
    setSaving(true)
    setErrors([])
    try {
      const report = await saveVariables({ data: { id, variables: next } })
      if (report.errors.length > 0) {
        setErrors(report.errors)
        return
      }
      onSaved(next)
      onClose()
    } catch (error) {
      setErrors([(error as Error).message])
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-neutral-800 px-6 py-4 text-left">
          <DialogTitle>Variables · {title}</DialogTitle>
          <DialogDescription>
            Text you reuse across slides, like a client’s name or a tagline. Change it here and every component that
            uses it updates. Ask Claude to “use the clientName variable”, or paste{' '}
            <code className="font-mono text-neutral-300">{'{vars.name}'}</code> into a component.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {typed.length === 0 && <p className="text-sm text-neutral-500">No variables yet.</p>}
            {typed.length > 0 && (
              <ul className="space-y-2">
                {typed.map((r, i) => (
                  <VariableRow
                    key={r.key}
                    row={r}
                    name={rows[i].name}
                    usedBy={usage[rows[i].name] ?? []}
                    problem={touched ? problems.get(r.key) : undefined}
                    onChange={(patch) => update(r.key, patch)}
                    onRemove={() => setRows((current) => current.filter((other) => other.key !== r.key))}
                  />
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setRows((current) => [...current, row()])}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <Plus className="size-4" />
              Add variable
            </button>

            {removedInUse.length > 0 && (
              <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
                {removedInUse.join(', ')} {removedInUse.length === 1 ? 'is' : 'are'} still used by components, which
                will show nothing in {removedInUse.length === 1 ? 'its' : 'their'} place.
              </p>
            )}
            {errors.length > 0 && (
              <ul className="space-y-0.5 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-800 px-6 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!dirty || saving}
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:opacity-40"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function VariableRow({
  row: r,
  name,
  usedBy,
  problem,
  onChange,
  onRemove,
}: {
  row: Row
  /** The camelCase name it's saved under. */
  name: string
  usedBy: string[]
  problem?: string
  onChange: (patch: Partial<Row>) => void
  onRemove: () => void
}) {
  const nameId = useId()
  const [copied, setCopied] = useState(false)
  const field =
    'min-w-0 rounded-lg border bg-neutral-950 px-3 py-1.5 text-sm outline-none placeholder:text-neutral-600 focus:border-neutral-400'

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-2">
        <label htmlFor={nameId} className="sr-only">
          Variable name
        </label>
        <input
          id={nameId}
          value={r.name}
          onChange={(event) => onChange({ name: event.target.value })}
          onBlur={() => onChange({ name })}
          placeholder="clientName"
          autoFocus={!r.name}
          spellCheck={false}
          className={`${field} w-44 shrink-0 font-mono ${problem ? 'border-red-700' : 'border-neutral-700'}`}
        />
        <input
          value={r.value}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder="Acme Holdings"
          aria-label={`Value of ${name || 'new variable'}`}
          className={`${field} flex-1 border-neutral-700`}
        />
        <button
          type="button"
          aria-label={`Copy ${variableSnippet(name)}`}
          title={`Copy ${variableSnippet(name)}`}
          disabled={!name}
          onClick={() => {
            void navigator.clipboard.writeText(variableSnippet(name))
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
        >
          {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
        </button>
        <button
          type="button"
          aria-label={`Remove ${name || 'variable'}`}
          title="Remove"
          onClick={onRemove}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-red-950 hover:text-red-300"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {problem ? (
        <p className="pl-1 text-xs text-red-400">{problem}</p>
      ) : (
        usedBy.length > 0 && (
          <p className="pl-1 text-xs text-neutral-500" title={usedBy.join('\n')}>
            Used by {usedBy.length} component{usedBy.length === 1 ? '' : 's'}
          </p>
        )
      )}
    </li>
  )
}
