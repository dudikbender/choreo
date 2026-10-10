import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { DiffView } from '~/home/DiffView'
import { HistoryList } from '~/home/HistoryList'
import { ProgressLog } from '~/home/ProgressLog'
import { DictationTextarea } from '~/home/StoryEditor'
import { historyFor, useGeneration } from '~/home/useGeneration'
import { applyProposal, recordDiscard } from '~/server/functions'

export type ComponentTarget = {
  componentId: string
  file: string
  /** Phase the viewer was on when they right-clicked. */
  beat: { id: string; label: string }
}

const primary =
  'rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40'
const secondary = 'rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800'

export function ComponentInstructionDialog({
  presentationId,
  target,
  onClose,
}: {
  presentationId: string
  target: ComponentTarget
  onClose: () => void
}) {
  const [instruction, setInstruction] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyErrors, setApplyErrors] = useState<string[]>([])
  const { state, start, reset, editChange } = useGeneration()

  const generate = () => {
    if (!instruction.trim()) return
    setApplyErrors([])
    start(
      {
        mode: 'component',
        id: presentationId,
        component: target.componentId,
        beat: target.beat.id,
        instruction,
      },
      instruction.trim(),
    )
  }

  const discard = () => {
    if (state.phase === 'review') void recordDiscard({ data: { id: presentationId, history: historyFor(state) } })
    reset()
  }

  const apply = async () => {
    if (state.phase !== 'review') return
    setApplying(true)
    try {
      const report = await applyProposal({
        data: { id: presentationId, create: false, changes: state.changes, history: historyFor(state) },
      })
      if (report.errors.length > 0) {
        setApplyErrors(report.errors)
        return
      }
      onClose()
    } catch (error) {
      setApplyErrors([(error as Error).message])
    } finally {
      setApplying(false)
    }
  }

  const editing = state.phase === 'idle' || state.phase === 'error'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open || applying) return
        discard()
        onClose()
      }}
    >
      <DialogContent className="flex max-h-[min(860px,calc(100vh-4rem))] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-neutral-800 px-6 py-4 text-left">
          <DialogTitle>
            Instruct Claude about <code className="font-mono text-sky-300">{target.componentId}</code>
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{target.file}</span> · right-clicked during “{target.beat.label}”. Claude gets
            this component’s code and choreography.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {editing && (
            <div
              className="rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-neutral-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  generate()
                }
              }}
            >
              <DictationTextarea
                value={instruction}
                onChange={setInstruction}
                rows={4}
                autoFocus
                placeholder="Make this a size bigger and have it slide in from the left during this beat."
                aria-label="Instruction"
                className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-neutral-600"
              />
            </div>
          )}

          {editing && <HistoryList id={presentationId} component={target.componentId} />}

          {state.phase === 'error' && (
            <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm whitespace-pre-wrap text-red-300">
              {state.message}
            </p>
          )}

          {state.phase === 'running' && <ProgressLog log={state.log} running />}

          {state.phase === 'review' && (
            <>
              <p className="text-sm whitespace-pre-wrap text-neutral-200">{state.summary}</p>
              {state.warnings.length > 0 && (
                <ul className="space-y-0.5 text-xs text-amber-400">
                  {state.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {state.changes.length === 0 ? (
                <p className="text-sm text-neutral-500">No files changed.</p>
              ) : (
                <div className="space-y-2">
                  {state.changes.map((change) => (
                    <DiffView
                      key={change.path}
                      change={change}
                      onEdit={(after) => editChange(change.path, after)}
                    />
                  ))}
                </div>
              )}
              {applyErrors.length > 0 && (
                <ul className="space-y-0.5 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
                  {applyErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t border-neutral-800 px-6 py-4">
          {editing && (
            <>
              <span className="mr-auto self-center text-xs text-neutral-500">⌘↵ to generate</span>
              <button type="button" onClick={onClose} className={secondary}>
                Cancel
              </button>
              <button type="button" onClick={generate} disabled={!instruction.trim()} className={primary}>
                Generate change
              </button>
            </>
          )}
          {state.phase === 'running' && (
            <button type="button" onClick={reset} className={secondary}>
              Stop
            </button>
          )}
          {state.phase === 'review' && (
            <>
              <button type="button" onClick={discard} disabled={applying} className={secondary}>
                Discard
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={applying || state.changes.length === 0}
                className={primary}
              >
                {applying
                  ? 'Applying…'
                  : `Apply ${state.changes.length} change${state.changes.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
