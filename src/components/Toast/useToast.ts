import { useContext } from 'react'
import { ToastContext, type ToastContextValue } from './ToastContext'

/**
 * Access the toast API.
 *
 * Throws if called outside of a `<ToastProvider>` so that misuse fails loudly
 * during development rather than silently dropping notifications.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }
  return ctx
}
