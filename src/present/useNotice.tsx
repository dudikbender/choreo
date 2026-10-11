import { useCallback, useEffect, useRef, useState } from 'react'

export type Flash = (message: string, error?: boolean) => void

/** A short-lived status pill at the top of the screen, e.g. "Stop added at 1,200". */
export function useNotice(): [Flash, React.ReactNode] {
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const flash = useCallback<Flash>((message, error = false) => {
    window.clearTimeout(timer.current)
    setNotice({ message, error })
    timer.current = window.setTimeout(() => setNotice(null), error ? 5000 : 2200)
  }, [])

  const element = notice && (
    <div
      role="status"
      className={`pointer-events-none fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-2xl ring-1 backdrop-blur-md ${
        notice.error ? 'bg-red-950/90 text-red-200 ring-red-800' : 'bg-neutral-950/85 text-neutral-100 ring-white/10'
      }`}
    >
      {notice.message}
    </div>
  )

  return [flash, element]
}
