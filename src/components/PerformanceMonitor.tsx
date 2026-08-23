import { useEffect, useState, type ReactElement } from 'react'

/**
 * Lightweight FPS counter based on `requestAnimationFrame`. The value
 * is averaged over 1-second buckets and rendered as a number; while
 * the first bucket is still being collected, the field reads `N/A` to
 * match the legacy debug bar format.
 */
function useFps(): { fps: number | null } {
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.requestAnimationFrame !== 'function') return

    let rafId = 0
    let frames = 0
    let lastSample = performance.now()

    const tick = (now: number): void => {
      frames += 1
      const elapsed = now - lastSample
      if (elapsed >= 1000) {
        setFps(Math.round((frames * 1000) / elapsed))
        frames = 0
        lastSample = now
      }
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  return { fps }
}

/**
 * Compact debug bar showing `FPS | GPU | CPU`. Real CPU/GPU telemetry
 * is not accessible from a sandboxed webview, so those fields are
 * rendered as `N/A` and reserved for future Tauri-side IPC. The
 * component is the visual side of the dev-gate; gating itself lives
 * in the consumer (e.g. `StatusBar`) via
 * `(import.meta.env.DEV || devOverride) && <PerformanceMonitor />`.
 */
export function PerformanceMonitor(): ReactElement {
  const { fps } = useFps()
  const fpsLabel = fps === null ? 'N/A' : String(fps)
  return (
    <span
      data-testid="performance-monitor"
      className="font-mono text-[var(--color-muted)]"
      aria-label="Performance monitor"
    >
      FPS {fpsLabel} | GPU N/A | CPU N/A
    </span>
  )
}
