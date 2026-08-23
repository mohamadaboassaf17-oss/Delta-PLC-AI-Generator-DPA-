import { useEffect, useRef } from 'react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useProject } from '@/hooks/useProject'
import { useToast } from '@/components/Toast'

/**
 * Watches for the `online → offline` transition and, if the active project is
 * dirty and has a known save path, triggers a non-blocking auto-save. The
 * result is surfaced through the toast system.
 *
 * Behaviour matrix on going offline:
 *  - Dirty + saved path → call `save()`, toast success/error
 *  - Dirty + no path    → warning toast (cannot auto-save without a path)
 *  - Not dirty          → no-op
 */
export function useAutoSaveOnOffline(): void {
  const { isOnline } = useOnlineStatus()
  const { isDirty, path, save } = useProject()
  const toast = useToast()

  // Track the previous online status so we only react on the transition,
  // not on every render while offline.
  const wasOnlineRef = useRef<boolean>(isOnline)

  // Mirror the live values into refs so the effect that watches `isOnline`
  // sees the most recent project state without needing to re-run when the
  // user types in an unrelated panel.
  const isDirtyRef = useRef<boolean>(isDirty)
  const pathRef = useRef<string | null>(path)
  const saveRef = useRef<typeof save>(save)
  const toastRef = useRef<typeof toast>(toast)

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    pathRef.current = path
  }, [path])

  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    const wasOnline = wasOnlineRef.current
    wasOnlineRef.current = isOnline

    // Only react to the online → offline edge.
    if (!(wasOnline && !isOnline)) return

    if (!isDirtyRef.current) return

    const currentPath = pathRef.current
    if (currentPath === null) {
      toastRef.current.warning(
        'Project is unsaved (no path). Save manually before going offline.',
      )
      return
    }

    void (async (): Promise<void> => {
      try {
        await saveRef.current()
        toastRef.current.info('Auto-saved draft (offline)')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toastRef.current.error(`Auto-save failed: ${message}`)
      }
    })()
  }, [isOnline])
}
