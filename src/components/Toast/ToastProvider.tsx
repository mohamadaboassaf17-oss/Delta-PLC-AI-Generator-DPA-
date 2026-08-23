import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  TOAST_DEFAULT_DURATION_MS,
  TOAST_MAX_VISIBLE,
  ToastContext,
  type Toast,
  type ToastContextValue,
  type ToastKind,
} from './ToastContext'
import { Toast as ToastRenderer } from './Toast'

export interface ToastProviderProps {
  children: ReactNode
}

let fallbackCounter = 0

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackCounter += 1
  return `toast-${Date.now()}-${fallbackCounter}`
}

/**
 * Provides the toast context and renders the toast stack so consumers do not
 * have to mount the renderer themselves.
 *
 * Auto-dismiss timers are tracked per-toast and cleared on dismiss/unmount so
 * the provider can be safely mounted near the root of the app without leaking
 * timers across project switches.
 */
export function ToastProvider({ children }: ToastProviderProps): ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const clearTimer = useCallback((id: string): void => {
    const handle = timersRef.current.get(id)
    if (handle !== undefined) {
      clearTimeout(handle)
      timersRef.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: string): void => {
      clearTimer(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    },
    [clearTimer],
  )

  const push = useCallback(
    (kind: ToastKind, message: string, durationMs?: number): void => {
      const id = generateId()
      const resolvedDuration =
        typeof durationMs === 'number' ? durationMs : TOAST_DEFAULT_DURATION_MS[kind]
      const toast: Toast = { id, kind, message, durationMs: resolvedDuration }

      setToasts((prev) => {
        // Enforce the visible cap by dropping the oldest entries first.
        const combined = [...prev, toast]
        if (combined.length <= TOAST_MAX_VISIBLE) return combined
        const overflow = combined.slice(0, combined.length - TOAST_MAX_VISIBLE)
        for (const dropped of overflow) {
          clearTimer(dropped.id)
        }
        return combined.slice(combined.length - TOAST_MAX_VISIBLE)
      })

      if (resolvedDuration > 0) {
        const handle = setTimeout(() => {
          dismiss(id)
        }, resolvedDuration)
        timersRef.current.set(id, handle)
      }
    },
    [dismiss, clearTimer],
  )

  const success = useCallback(
    (message: string, durationMs?: number) => push('success', message, durationMs),
    [push],
  )
  const error = useCallback(
    (message: string, durationMs?: number) => push('error', message, durationMs),
    [push],
  )
  const info = useCallback(
    (message: string, durationMs?: number) => push('info', message, durationMs),
    [push],
  )
  const warning = useCallback(
    (message: string, durationMs?: number) => push('warning', message, durationMs),
    [push],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const handle of timers.values()) {
        clearTimeout(handle)
      }
      timers.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, success, error, info, warning, dismiss }),
    [toasts, success, error, info, warning, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRenderer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}
