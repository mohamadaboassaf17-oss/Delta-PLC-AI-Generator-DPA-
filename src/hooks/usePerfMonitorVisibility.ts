import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'dpa.perfMonitorVisible'
const IS_DEV = import.meta.env.DEV === true

function readStored(): boolean {
  if (!IS_DEV) return false
  if (typeof window === 'undefined') return false
  if (typeof window.localStorage === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return false
    return raw === 'true'
  } catch (err: unknown) {
    console.warn('usePerfMonitorVisibility: localStorage read failed', err)
    return false
  }
}

function writeStored(value: boolean): void {
  if (!IS_DEV) return
  if (typeof window === 'undefined') return
  if (typeof window.localStorage === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
  } catch (err: unknown) {
    console.warn('usePerfMonitorVisibility: localStorage write failed', err)
  }
}

export interface UsePerfMonitorVisibilityResult {
  /** Whether the footer FPS / GPU / CPU performance monitor should be visible. */
  visible: boolean
  /** Flip the current visibility state and persist the new value. */
  toggle: () => void
  /** Force a specific visibility value and persist it. */
  setVisible: (value: boolean) => void
}

/**
 * Manages the visibility of the footer `PerformanceMonitor` (FPS / GPU / CPU).
 *
 * State is persisted to `localStorage` under the key `dpa.perfMonitorVisible`
 * so the user's preference survives reloads. The value is stored as the
 * string `"true"` or `"false"` (not JSON) so it round-trips cleanly with
 * the browser's native `storage` event payload (`newValue`).
 *
 * The hook subscribes to the `storage` event on `window` so changes made in
 * another tab (or in another instance of the same app) are mirrored in this
 * tab without requiring a reload. SSR-safe: when `window` is not defined,
 * the hook returns `visible: false` and ignores all persistence calls.
 */
export function usePerfMonitorVisibility(): UsePerfMonitorVisibilityResult {
  const [visible, setVisibleState] = useState<boolean>(() => readStored())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY) return
      if (event.newValue === null) {
        setVisibleState(false)
        return
      }
      setVisibleState(event.newValue === 'true')
    }

    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('storage', handler)
    }
  }, [])

  const setVisible = useCallback((value: boolean): void => {
    setVisibleState(value)
    writeStored(value)
  }, [])

  const toggle = useCallback((): void => {
    setVisibleState((prev) => {
      const next = !prev
      writeStored(next)
      return next
    })
  }, [])

  return { visible, toggle, setVisible }
}
