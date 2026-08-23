import { createContext } from 'react'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  /** Milliseconds before auto-dismiss. `0` means the toast will not auto-dismiss. */
  durationMs: number
}

export interface ToastContextValue {
  toasts: Toast[]
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
  warning: (message: string, durationMs?: number) => void
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** Default auto-dismiss timings (ms) per toast kind. */
export const TOAST_DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  error: 8000,
}

/** Maximum number of toasts simultaneously visible. Older toasts are dropped. */
export const TOAST_MAX_VISIBLE = 3
