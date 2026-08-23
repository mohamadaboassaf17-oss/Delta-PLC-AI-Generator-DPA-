import { useEffect, useState, type ReactElement } from 'react'
import type { Toast as ToastType, ToastKind } from './ToastContext'

interface ToastProps {
  toasts: ToastType[]
  onDismiss: (id: string) => void
}

interface ToastItemProps {
  toast: ToastType
  onDismiss: (id: string) => void
}

/** Color tokens per kind. Matches the existing palette used elsewhere. */
const KIND_STYLES: Record<ToastKind, { container: string; icon: string }> = {
  success: {
    container: 'border-emerald-700 bg-emerald-950/80 text-emerald-100',
    icon: 'text-emerald-300',
  },
  error: {
    container: 'border-red-700 bg-red-950/80 text-red-100',
    icon: 'text-red-300',
  },
  info: {
    container: 'border-blue-700 bg-blue-950/80 text-blue-100',
    icon: 'text-blue-300',
  },
  warning: {
    container: 'border-amber-700 bg-amber-950/80 text-amber-100',
    icon: 'text-amber-300',
  },
}

function KindIcon({ kind }: { kind: ToastKind }): ReactElement {
  const className = `h-4 w-4 shrink-0 ${KIND_STYLES[kind].icon}`
  switch (kind) {
    case 'success':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )
    case 'error':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      )
    case 'warning':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    case 'info':
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )
  }
}

function ToastItem({ toast, onDismiss }: ToastItemProps): ReactElement {
  // Mount animation — start slightly off-screen + transparent, then settle in
  // on the next animation frame. No new deps required.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const handle = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(handle)
  }, [])

  const styles = KIND_STYLES[toast.kind]

  return (
    <div
      data-testid={`toast-${toast.kind}`}
      role={toast.kind === 'error' || toast.kind === 'warning' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg transition-all duration-200 ease-out ${
        styles.container
      } ${visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
    >
      <KindIcon kind={toast.kind} />
      <span className="flex-1 whitespace-pre-line leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 text-current opacity-70 transition hover:bg-white/10 hover:opacity-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Toast stack renderer. The provider is responsible for state — this
 * component is a stateless presentation layer that takes the current toasts
 * and dismiss handler as props.
 */
export function Toast({ toasts, onDismiss }: ToastProps): ReactElement | null {
  if (toasts.length === 0) return null

  return (
    <div
      data-testid="toast"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
