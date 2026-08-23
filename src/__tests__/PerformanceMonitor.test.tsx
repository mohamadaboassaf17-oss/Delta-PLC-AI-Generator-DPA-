import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen, renderHook } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useDevOverride } from '@/hooks/useDevOverride'
import {
  usePerfMonitorVisibility,
  type UsePerfMonitorVisibilityResult,
} from '@/hooks/usePerfMonitorVisibility'
import { PerformanceMonitor } from '@/components/PerformanceMonitor'

/**
 * Mirror of the gating pattern used in `StatusBar`. Production code uses
 * `import.meta.env.DEV` which is replaced at build time by Vite and is
 * therefore not stubbable in unit tests; using a prop here keeps the
 * test focused on the `(dev || devOverride) && <PerformanceMonitor />`
 * branch logic itself.
 */
function DevGatedPerformanceMonitor({ dev }: { dev: boolean }): ReactElement {
  const { devOverride } = useDevOverride()
  if (!(dev || devOverride)) return <></>
  return <PerformanceMonitor />
}

describe('useDevOverride', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('starts with devOverride=false', () => {
    const { result } = renderHook(() => useDevOverride())
    expect(result.current.devOverride).toBe(false)
  })

  it('flips devOverride on Ctrl+Shift+D', () => {
    const { result } = renderHook(() => useDevOverride())
    expect(result.current.devOverride).toBe(false)

    act(() => {
      fireEvent.keyDown(window, { key: 'D', ctrlKey: true, shiftKey: true })
    })
    expect(result.current.devOverride).toBe(true)

    act(() => {
      fireEvent.keyDown(window, { key: 'D', ctrlKey: true, shiftKey: true })
    })
    expect(result.current.devOverride).toBe(false)
  })

  it('accepts lowercase d as well', () => {
    const { result } = renderHook(() => useDevOverride())
    act(() => {
      fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true })
    })
    expect(result.current.devOverride).toBe(true)
  })

  it('ignores plain D, Ctrl+D, and Shift+D without both modifiers', () => {
    const { result } = renderHook(() => useDevOverride())
    act(() => {
      fireEvent.keyDown(window, { key: 'D' })
    })
    act(() => {
      fireEvent.keyDown(window, { key: 'D', ctrlKey: true })
    })
    act(() => {
      fireEvent.keyDown(window, { key: 'D', shiftKey: true })
    })
    expect(result.current.devOverride).toBe(false)
  })

  it('removes the keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useDevOverride())
    unmount()
    const removed = removeSpy.mock.calls.map((c) => c[0])
    expect(removed).toContain('keydown')
    removeSpy.mockRestore()
  })
})

describe('PerformanceMonitor gating', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is not rendered in production (dev=false) without a keyboard override', () => {
    render(<DevGatedPerformanceMonitor dev={false} />)
    expect(screen.queryByTestId('performance-monitor')).not.toBeInTheDocument()
  })

  it('is rendered in development (dev=true) without a keyboard override', () => {
    render(<DevGatedPerformanceMonitor dev={true} />)
    expect(screen.getByTestId('performance-monitor')).toBeInTheDocument()
    expect(screen.getByTestId('performance-monitor')).toHaveTextContent(/FPS/)
  })

  it('appears in production after pressing Ctrl+Shift+D (devOverride path)', () => {
    render(<DevGatedPerformanceMonitor dev={false} />)
    expect(screen.queryByTestId('performance-monitor')).not.toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(window, { key: 'D', ctrlKey: true, shiftKey: true })
    })

    expect(screen.getByTestId('performance-monitor')).toBeInTheDocument()
  })

  it('hides again in production when the user presses Ctrl+Shift+D a second time', () => {
    render(<DevGatedPerformanceMonitor dev={false} />)

    act(() => {
      fireEvent.keyDown(window, { key: 'D', ctrlKey: true, shiftKey: true })
    })
    expect(screen.getByTestId('performance-monitor')).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(window, { key: 'D', ctrlKey: true, shiftKey: true })
    })
    expect(screen.queryByTestId('performance-monitor')).not.toBeInTheDocument()
  })
})

/**
 * Mirror of the visibility pattern used in `StatusBar`: the component
 * only renders when `usePerfMonitorVisibility().visible === true`.
 * Kept as a local helper so this test file remains self-contained.
 */
function VisibilityGatedPerformanceMonitor(): ReactElement {
  const { visible }: UsePerfMonitorVisibilityResult = usePerfMonitorVisibility()
  if (!visible) return <></>
  return <PerformanceMonitor />
}

describe('PerformanceMonitor visibility via usePerfMonitorVisibility', () => {
  const STORAGE_KEY = 'dpa.perfMonitorVisible'

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('defaults to hidden when localStorage is empty', () => {
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)
    render(<VisibilityGatedPerformanceMonitor />)
    expect(screen.queryByTestId('performance-monitor')).not.toBeInTheDocument()
  })

  it('reads true from localStorage and renders the monitor', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(true)
    render(<VisibilityGatedPerformanceMonitor />)
    expect(screen.getByTestId('performance-monitor')).toBeInTheDocument()
  })

  it('reads false from localStorage and hides the monitor', () => {
    window.localStorage.setItem(STORAGE_KEY, 'false')
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)
    render(<VisibilityGatedPerformanceMonitor />)
    expect(screen.queryByTestId('performance-monitor')).not.toBeInTheDocument()
  })

  it('toggle() flips the value and writes to localStorage', () => {
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()

    act(() => {
      result.current.toggle()
    })
    expect(result.current.visible).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

    act(() => {
      result.current.toggle()
    })
    expect(result.current.visible).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('responds to a storage event from another tab and re-renders the monitor', () => {
    render(<VisibilityGatedPerformanceMonitor />)
    expect(screen.queryByTestId('performance-monitor')).not.toBeInTheDocument()

    act(() => {
      fireEvent(
        window,
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'true',
          oldValue: null,
          storageArea: window.localStorage,
          url: window.location.href,
        }),
      )
    })

    expect(screen.getByTestId('performance-monitor')).toBeInTheDocument()
  })
})
