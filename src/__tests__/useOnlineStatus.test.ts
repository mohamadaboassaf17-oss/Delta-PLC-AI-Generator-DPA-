import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, renderHook } from '@testing-library/react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

const ORIGINAL_NAVIGATOR_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator',
)

function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { ...globalThis.navigator, onLine: value },
  })
}

describe('useOnlineStatus', () => {
  beforeEach(() => {
    setNavigatorOnLine(true)
  })

  afterEach(() => {
    if (ORIGINAL_NAVIGATOR_DESCRIPTOR) {
      Object.defineProperty(globalThis, 'navigator', ORIGINAL_NAVIGATOR_DESCRIPTOR)
    }
  })

  it('returns true when navigator.onLine starts true', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current.isOnline).toBe(true)
  })

  it('returns false when navigator.onLine starts false', () => {
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current.isOnline).toBe(false)
  })

  it('flips to false when the window emits an "offline" event', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current.isOnline).toBe(true)

    act(() => {
      fireEvent(window, new Event('offline'))
    })

    expect(result.current.isOnline).toBe(false)
  })

  it('flips back to true when the window emits an "online" event', () => {
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current.isOnline).toBe(false)

    act(() => {
      fireEvent(window, new Event('online'))
    })

    expect(result.current.isOnline).toBe(true)
  })

  it('cleans up event listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useOnlineStatus())

    const addedEvents = addSpy.mock.calls.map((c) => c[0])
    expect(addedEvents).toContain('online')
    expect(addedEvents).toContain('offline')

    unmount()

    const removedEvents = removeSpy.mock.calls.map((c) => c[0])
    expect(removedEvents).toContain('online')
    expect(removedEvents).toContain('offline')

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('defaults to true when navigator.onLine is undefined', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current.isOnline).toBe(true)
  })
})
