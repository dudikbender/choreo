import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { CodeEditor, DiffView } from '~/home/DiffView'
import { getComponentSource, saveComponent } from '~/server/functions'
import type { ComponentTarget } from './ComponentInstructionDialog'

const primary =
  'rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40'
const secondary = 'rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800'
const tab =
  'rounded-md px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-200 aria-pressed:bg-neutral-800 aria-pressed:text-neutral-100'

/** Edit a component's source by hand. Saving runs the same checks as Claude's changes. */
export function ComponentCodeDialog({
  presentationId,
  target,
  onSaved,
  onClose,
}: {
  presentationId: string
  target: ComponentTarget
  onSaved: () => void
  onClose: () => void
}) {
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [view, setView] = useState<'edit' | 'changes'>('edit')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const dirty = saved !== null && draft !== saved

  useEffect(() => {
    let cancelled = false
    getComponentSource({ data: { id: presentationId, path: target.file } })
      .then((source) => {
        if (cancelled) return
        setSaved(source)
        setDraft(source)
      })
      .catch((error) => !cancelled && setLoadError((error as Error).message))
    return () => {
      cancelled = true
    }
  }, [presentationId, target.file])

  const save = async () => {
    if (!dirty || saved === null || saving) return
    setSaving(true)
    setErrors([])
    try {
      const report = await saveComponent({
        data: { id: presentationId, component: target.componentId, path: target.file, before: saved, after: draft },
      })
      if (report.errors.length > 0) {
        setErrors(report.errors)
        return
      }
      onSaved()
      onClose()
    } catch (error) {
      setErrors([(error as Error).message])
    } finally {
      setSaving(false)
    }
  }

  const close = () => {
    if (saving) return
    if (dirty && !window.confirm('Discard your unsaved changes?')) return
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="flex max-h-[calc(100vh-4rem)] flex-col gap-0 p-0 sm:max-w-4xl"
        onKeyDown={(event) => {
          if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <DialogHeader className="flex-row items-start justify-between gap-4 border-b border-neutral-800 px-6 py-4 text-left">
          <div className="min-w-0">
            <DialogTitle>
              Edit <code className="font-mono text-sky-300">{target.componentId}</code>
            </DialogTitle>
            <DialogDescription className="font-mono">{target.file}</DialogDescription>
          </div>
          {saved !== null && (
            <div className="mr-8 flex shrink-0 rounded-lg border border-neutral-800 p-0.5" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'edit'} onClick={() => setView('edit')} className={tab}>
                Edit
              </button>
              <button
                type="button"
                aria-pressed={view === 'changes'}
                onClick={() => setView('changes')}
                disabled={!dirty}
                className={`${tab} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                Changes
              </button>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {saved === null ? (
            <p className={`text-sm ${loadError ? 'text-red-400' : 'text-neutral-500'}`}>
              {loadError ?? 'Loading source…'}
            </p>
          ) : view === 'edit' || !dirty ? (
            <div className="overflow-hidden rounded-lg border border-neutral-800">
              <CodeEditor
                value={draft}
                onChange={setDraft}
                onRevert={dirty ? () => setDraft(saved) : undefined}
                revertLabel="Revert to saved"
                hint="Tab indents · ⌘S saves · checked before saving"
                label={`Edit ${target.file}`}
                maxRows={32}
                autoFocus
              />
            </div>
          ) : (
            <DiffView change={{ path: target.file, before: saved, after: draft }} />
          )}
          {errors.length > 0 && (
            <ul className="space-y-0.5 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t border-neutral-800 px-6 py-4">
          <span className="mr-auto self-center text-xs text-neutral-500">
            {dirty ? 'Unsaved changes' : 'Keyframes live in presentation.json; this edits the component’s look.'}
          </span>
          <button type="button" onClick={close} disabled={saving} className={secondary}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!dirty || saving} className={primary}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
