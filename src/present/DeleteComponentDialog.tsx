import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { removeComponent } from '~/server/functions'
import type { ComponentTarget } from './ComponentInstructionDialog'

export function DeleteComponentDialog({
  presentationId,
  target,
  sharedFile,
  onDeleted,
  onClose,
}: {
  presentationId: string
  target: ComponentTarget
  /** Another component renders the same file, so the file stays. */
  sharedFile: boolean
  onDeleted: () => void
  onClose: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const remove = async () => {
    setDeleting(true)
    setErrors([])
    try {
      const report = await removeComponent({ data: { id: presentationId, component: target.componentId } })
      if (report.errors.length > 0) {
        setErrors(report.errors)
        return
      }
      onDeleted()
      onClose()
    } catch (error) {
      setErrors([(error as Error).message])
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !deleting) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete <span className="font-mono">{target.componentId}</span>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {sharedFile ? (
              <>
                Removes it and its keyframes from <code className="text-neutral-300">presentation.json</code>.{' '}
                <code className="text-neutral-300">{target.file}</code> stays, because another component uses it.
              </>
            ) : (
              <>
                Removes it and its keyframes from <code className="text-neutral-300">presentation.json</code> and
                deletes <code className="text-neutral-300">{target.file}</code>. It can’t be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errors.length > 0 && (
          <ul className="space-y-1 text-sm text-red-400">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault()
              void remove()
            }}
          >
            {deleting ? 'Deleting…' : 'Delete component'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
