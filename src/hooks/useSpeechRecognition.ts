import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseSpeechRecognitionResult {
  isSupported: boolean
  isListening: boolean
  error: string | null
  start: () => void
  stop: () => void
  transcript: string
}

type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition as any) ?? (w.webkitSpeechRecognition as any) ?? null
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useSpeechRecognition(
  onTranscript: (text: string) => void,
  lang: string = 'ar-SA',
): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const isSupported = getSpeechRecognitionCtor() !== null

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('Speech recognition not supported in this browser')
      return
    }
    if (isListening) return

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true

    rec.onstart = () => {
      setIsListening(true)
      setError(null)
    }
    rec.onresult = (e) => {
      let finalText = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i] as unknown as { isFinal: boolean; 0: { transcript: string } }
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) finalText += text + ' '
        else interim += text
      }
      const combined = (finalText || interim).trim()
      setTranscript(combined)
      if (finalText.trim()) {
        onTranscript(finalText.trim())
      }
    }
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone permission denied' : e.error)
      setIsListening(false)
    }
    rec.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = rec
    try {
      rec.start()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recognition')
      setIsListening(false)
    }
  }, [isListening, lang, onTranscript])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  return { isSupported, isListening, error, start, stop, transcript }
}
