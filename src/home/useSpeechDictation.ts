import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionResultEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null
}

/**
 * Dictates into a text field via the Web Speech API.
 * Final segments append to the value; interim text is shown live while listening.
 */
export function useSpeechDictation(
  value: string,
  onChange: (next: string) => void,
) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)
  useEffect(() => setSupported(speechRecognitionSupported()), [])

  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const wantListen = useRef(false)
  const committed = useRef(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const stop = useCallback(() => {
    wantListen.current = false
    setListening(false)
    setInterim('')
    recognition.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      setError('Speech recognition isn’t supported in this browser. Try Chrome or Edge.')
      return
    }

    recognition.current?.abort()
    wantListen.current = true
    committed.current = value
    setError(null)
    setInterim('')
    setListening(true)

    const rec = new Ctor()
    recognition.current = rec
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'

    rec.onresult = (event) => {
      let finals = ''
      let nextInterim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const piece = result[0].transcript
        if (result.isFinal) finals += piece
        else nextInterim += piece
      }
      if (finals) {
        const base = committed.current
        const joined = base && !/\s$/.test(base) ? `${base} ${finals.trim()}` : `${base}${finals.trim()}`
        committed.current = joined.replace(/\s+/g, ' ').trimStart()
        onChangeRef.current(committed.current)
      }
      setInterim(nextInterim.trim())
    }

    rec.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return
      if (event.error === 'not-allowed') {
        setError('Microphone access was denied.')
        wantListen.current = false
        setListening(false)
        setInterim('')
        return
      }
      setError(`Speech recognition error: ${event.error}`)
    }

    rec.onend = () => {
      if (!wantListen.current) {
        setListening(false)
        setInterim('')
        return
      }
      // Chrome ends continuous sessions after ~60s — restart while the user still wants to dictate.
      window.setTimeout(() => {
        if (!wantListen.current) return
        try {
          rec.start()
        } catch {
          setListening(false)
          wantListen.current = false
        }
      }, 250)
    }

    try {
      rec.start()
    } catch {
      setError('Couldn’t start the microphone.')
      wantListen.current = false
      setListening(false)
    }
  }, [value])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  useEffect(() => () => {
    wantListen.current = false
    recognition.current?.abort()
  }, [])

  const displayValue = interim
    ? `${committed.current}${committed.current && !/\s$/.test(committed.current) ? ' ' : ''}${interim}`
    : value

  return { supported, listening, interim, error, displayValue, toggle, stop }
}
