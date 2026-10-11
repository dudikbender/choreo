import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { AssetsDialog } from '~/home/AssetsDialog'
import { DesignPanel } from '~/home/DesignPanel'
import { VariablesDialog } from '~/home/VariablesDialog'
import type { Variables } from '~/engine/schema'
import { AutoplayControls } from './AutoplayControls'
import type { Autoplay } from './useAutoplay'

export function PresentControls({
  id,
  title,
  variables,
  onVariablesSaved,
  autoplay,
  hidden,
}: {
  id: string
  title: string
  variables: Variables
  onVariablesSaved: (variables: Variables) => void
  autoplay: Autoplay
  /** Hide the dock (and the modify dialog) while the page is in fullscreen present. */
  hidden: boolean
}) {
  const navigate = useNavigate()
  const [modifying, setModifying] = useState(false)
  const [managingAssets, setManagingAssets] = useState(false)
  const [editingVariables, setEditingVariables] = useState(false)

  if (hidden) return null

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-neutral-950/80 p-1.5 shadow-2xl backdrop-blur-md">
          <DockButton onClick={() => navigate({ to: '/' })}>Main</DockButton>
          <DockButton onClick={() => setModifying(true)}>Modify</DockButton>
          <DockButton onClick={() => setManagingAssets(true)}>Assets</DockButton>
          <DockButton onClick={() => setEditingVariables(true)}>Variables</DockButton>
          <AutoplayControls autoplay={autoplay} />
          <DockButton primary onClick={() => void enterFullscreen()}>
            Present
          </DockButton>
        </div>
      </div>

      {modifying && (
        <ModifyDialog
          id={id}
          title={title}
          onClose={() => setModifying(false)}
          onApplied={async () => {}}
        />
      )}
      {managingAssets && <AssetsDialog id={id} title={title} onClose={() => setManagingAssets(false)} />}
      {editingVariables && (
        <VariablesDialog
          id={id}
          title={title}
          variables={variables}
          onSaved={onVariablesSaved}
          onClose={() => setEditingVariables(false)}
        />
      )}
    </>
  )
}

async function enterFullscreen() {
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  if (document.fullscreenElement) return
  if (root.requestFullscreen) await root.requestFullscreen()
  else root.webkitRequestFullscreen?.()
}

function DockButton({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <Button type="button" variant={primary ? 'dock-primary' : 'dock'} size="pill" onClick={onClick}>
      {children}
    </Button>
  )
}

function ModifyDialog({
  id,
  title,
  onClose,
  onApplied,
}: {
  id: string
  title: string
  onClose: () => void
  onApplied: () => Promise<void>
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('textarea, button, input')?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(880px,calc(100vh-4rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-input bg-card shadow-2xl [&_section]:h-full [&_section]:min-h-0 [&_section]:rounded-none [&_section]:border-0"
      >
        <span id={titleId} className="sr-only">
          Modify {title}
        </span>
        <DesignPanel
          key={id}
          target={{ mode: 'modify', id, title }}
          existingIds={[id]}
          onTargetChange={() => {}}
          onApplied={onApplied}
          allowModeSwitch={false}
          onDone={onClose}
        />
      </div>
    </div>
  )
}
