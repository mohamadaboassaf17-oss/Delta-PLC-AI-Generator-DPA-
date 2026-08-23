import { useEffect, useState } from 'react'

export interface UseDevOverrideResult {
  /**
   * `true` when the user has toggled the developer-mode override ON via
   * `Ctrl+Shift+D`. This is an orthogonal power-user flag: it is up to
   * each consumer to decide which dev-only UI to gate on it.
   *
   * As of M12 the footer `PerformanceMonitor` is **not** gated on this
   * flag — it has its own explicit `usePerfMonitorVisibility` toggle in
   * the footer. Future dev-only panels may opt in.
   */
  devOverride: boolean
}

/**
 * Manages a local boolean that flips when the user presses
 * `Ctrl+Shift+D`. The hook is a power-user override on top of the
 * Vite-native `import.meta.env.DEV` gate, exposing a single boolean
 * that any dev-only panel can subscribe to.
 *
 * As of M12 this hook is orthogonal to the footer `PerformanceMonitor`
 * — that component is now controlled by `usePerfMonitorVisibility` and
 * a dedicated "Dev stats" toggle button. The `Ctrl+Shift+D` hotkey
 * remains available for future dev panels that want a global on/off
 * switch.
 *
 * The listener is attached to `window` and cleaned up on unmount. The
 * hook intentionally only calls `preventDefault()` when the hotkey
 * matches so we do not interfere with normal typing.
 */
export function useDevOverride(): UseDevOverrideResult {
  const [devOverride, setDevOverride] = useState<boolean>(false)

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || !event.shiftKey) return
      if (event.key !== 'D' && event.key !== 'd') return
      event.preventDefault()
      setDevOverride((prev) => !prev)
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [])

  return { devOverride }
}
