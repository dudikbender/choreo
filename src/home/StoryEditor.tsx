import { useState } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import type { StoryBeat } from '~/engine/story'
import { useSpeechDictation } from './useSpeechDictation'

export type DraftBeat = StoryBeat & { key: string }

let keySeq = 0
export function newBeat(fields: Partial<StoryBeat> = {}): DraftBeat {
  return { key: `beat-${++keySeq}`, id: '', title: '', description: '', transition: '', ...fields }
}

const BEAT_HINTS = [
  { title: 'The hook', description: 'Open on the one idea that makes people lean in.' },
  { title: 'The problem', description: 'What’s broken today, and who feels it?' },
  { title: 'The turn', description: 'Reveal the answer — the moment the story pivots.' },
  { title: 'The proof', description: 'Numbers, a demo, a customer — why it’s true.' },
  { title: 'The ask', description: 'What should the viewer do or believe at the end?' },
]
const hint = (index: number) => BEAT_HINTS[Math.min(index, BEAT_HINTS.length - 1)]

export function StoryEditor({
  beats,
  ids,
  onChange,
}: {
  beats: DraftBeat[]
  /** Resolved phase id per beat, same order as `beats`. */
  ids: string[]
  onChange: (update: (beats: DraftBeat[]) => DraftBeat[]) => void
}) {
  const [focusKey, setFocusKey] = useState<string | null>(null)

  const update = (key: string, patch: Partial<StoryBeat>) =>
    onChange((list) => list.map((beat) => (beat.key === key ? { ...beat, ...patch } : beat)))
  const move = (index: number, delta: number) =>
    onChange((list) => {
      const next = [...list]
      const [beat] = next.splice(index, 1)
      next.splice(index + delta, 0, beat)
      return next
    })
  const insert = (index: number) => {
    const beat = newBeat()
    setFocusKey(beat.key)
    onChange((list) => [...list.slice(0, index), beat, ...list.slice(index)])
  }

  return (
    <ol>
      {beats.map((beat, i) => (
        <li key={beat.key}>
          <BeatCard
            beat={beat}
            index={i}
            id={ids[i]}
            autoFocus={beat.key === focusKey}
            canMoveUp={i > 0}
            canMoveDown={i < beats.length - 1}
            canRemove={beats.length > 1}
            onChange={(patch) => update(beat.key, patch)}
            onMove={(delta) => move(i, delta)}
            onRemove={() => onChange((list) => list.filter((b) => b.key !== beat.key))}
          />
          {i < beats.length - 1 && (
            <TransitionLink
              value={beat.transition}
              nextTitle={beats[i + 1].title.trim() || `beat ${i + 2}`}
              onChange={(transition) => update(beat.key, { transition })}
              onInsert={() => insert(i + 1)}
            />
          )}
        </li>
      ))}
      <li className="flex gap-3 pt-3">
        <div className="flex w-8 shrink-0 justify-center">
          <span className="size-2 translate-y-2.5 rounded-full bg-neutral-700" />
        </div>
        <button
          type="button"
          onClick={() => insert(beats.length)}
          className="flex-1 rounded-xl border border-dashed border-neutral-800 px-3 py-2.5 text-left text-sm text-neutral-500 hover:border-neutral-600 hover:text-neutral-200"
        >
          + Add a beat
        </button>
      </li>
    </ol>
  )
}

function BeatCard({
  beat,
  index,
  id,
  autoFocus,
  canMoveUp,
  canMoveDown,
  canRemove,
  onChange,
  onMove,
  onRemove,
}: {
  beat: DraftBeat
  index: number
  id: string
  autoFocus: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  canRemove: boolean
  onChange: (patch: Partial<StoryBeat>) => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const label = beat.title.trim() || `beat ${index + 1}`
  return (
    <div className="group flex gap-3">
      <div className="flex w-8 shrink-0 justify-center pt-2">
        <span className="flex size-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 font-mono text-xs text-neutral-400 transition-colors group-focus-within:border-neutral-300 group-focus-within:text-white">
          {index + 1}
        </span>
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-neutral-800 bg-neutral-950/70 transition-colors group-focus-within:border-neutral-600">
        <div className="flex items-center gap-2 border-b border-neutral-800/80 py-1.5 pr-1.5 pl-3">
          <input
            value={beat.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={hint(index).title}
            aria-label={`Beat ${index + 1} title`}
            autoFocus={autoFocus}
            className="min-w-0 flex-1 bg-transparent py-1 font-medium outline-none placeholder:text-neutral-600"
          />
          {id && (beat.title.trim() || beat.id) && (
            <span className="hidden font-mono text-[11px] text-neutral-600 sm:block" title="Phase id">
              #{id}
            </span>
          )}
          <div className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <IconButton label={`Move ${label} up`} disabled={!canMoveUp} onClick={() => onMove(-1)}>
              <path d="m6 15 6-6 6 6" />
            </IconButton>
            <IconButton label={`Move ${label} down`} disabled={!canMoveDown} onClick={() => onMove(1)}>
              <path d="m6 9 6 6 6-6" />
            </IconButton>
            <IconButton label={`Remove ${label}`} disabled={!canRemove} onClick={onRemove}>
              <path d="M18 6 6 18M6 6l12 12" />
            </IconButton>
          </div>
        </div>
        <DictationTextarea
          value={beat.description}
          onChange={(description) => onChange({ description })}
          rows={3}
          placeholder={
            beat.id
              ? 'Leave blank to keep this beat as it is, or describe what the viewer should see and understand here.'
              : hint(index).description
          }
          aria-label={`Beat ${index + 1} description`}
          className="block w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-neutral-600"
        />
      </div>
    </div>
  )
}

function TransitionLink({
  value,
  nextTitle,
  onChange,
  onInsert,
}: {
  value: string
  nextTitle: string
  onChange: (value: string) => void
  onInsert: () => void
}) {
  const [open, setOpen] = useState(false)
  const described = value.trim().length > 0
  const expanded = open || described

  return (
    <div className="group/link flex gap-3">
      <div className="flex w-8 shrink-0 justify-center">
        <div
          className={`border-l-2 border-dashed ${described ? 'border-sky-500/50' : 'border-neutral-800'}`}
        />
      </div>
      <div className="min-w-0 flex-1 py-2.5">
        {expanded ? (
          <div className="rounded-lg border border-dashed border-sky-500/30 bg-sky-500/5 focus-within:border-sky-400/60">
            <div className="flex items-center gap-2 px-3 pt-2 text-xs">
              <ArrowIcon className="text-sky-400" />
              <span className="font-medium text-sky-300">Transition</span>
              <span className="min-w-0 truncate text-neutral-500">into “{nextTitle}”</span>
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="ml-auto shrink-0 text-neutral-500 hover:text-neutral-200"
              >
                Let Claude choose
              </button>
            </div>
            <DictationTextarea
              value={value}
              onChange={onChange}
              rows={2}
              autoFocus={open && !described}
              placeholder="e.g. The headline shrinks into the corner as the problem cards rise from below."
              aria-label={`Transition into ${nextTitle}`}
              className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-neutral-600"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              title="Claude will choose this transition. Click to describe it yourself."
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 py-1 text-xs text-neutral-500 hover:border-sky-500/40 hover:text-sky-200"
            >
              <ArrowIcon />
              Auto transition
              <span className="text-neutral-300">· Describe</span>
            </button>
            <button
              type="button"
              onClick={onInsert}
              className="rounded-full px-2 py-1 text-xs text-neutral-600 opacity-0 transition-opacity group-hover/link:opacity-100 hover:text-neutral-200 focus-visible:opacity-100"
            >
              + Insert beat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function DictationTextarea({
  value,
  onChange,
  className = '',
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}) {
  const dictation = useSpeechDictation(value, onChange)
  return (
    <div className="relative">
      <textarea
        {...rest}
        value={dictation.displayValue}
        onChange={(e) => {
          if (dictation.listening) dictation.stop()
          onChange(e.target.value)
        }}
        className={`${className} ${dictation.supported ? 'pr-10' : ''}`}
      />
      {dictation.supported && (
        <button
          type="button"
          onClick={dictation.toggle}
          aria-pressed={dictation.listening}
          aria-label={dictation.listening ? 'Stop dictation' : 'Start dictation'}
          title={dictation.listening ? 'Stop listening' : 'Dictate with microphone'}
          className={`absolute top-1.5 right-1.5 rounded-full p-1.5 ${
            dictation.listening
              ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40'
              : 'text-neutral-600 hover:bg-neutral-800 hover:text-neutral-200'
          }`}
        >
          <MicIcon listening={dictation.listening} />
        </button>
      )}
      {dictation.error && <p className="px-3 pb-2 text-xs text-red-400">{dictation.error}</p>}
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-30"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  )
}

function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-3.5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  )
}

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-3.5 ${listening ? 'animate-pulse' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  )
}
