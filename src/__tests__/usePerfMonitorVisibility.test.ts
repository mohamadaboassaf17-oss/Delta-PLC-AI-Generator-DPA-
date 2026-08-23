import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, renderHook } from '@testing-library/react'
import { usePerfMonitorVisibility } from '@/hooks/usePerfMonitorVisibility'

const STORAGE_KEY = 'dpa.perfMonitorVisible'

describe('usePerfMonitorVisibility', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('defaults to hidden when localStorage is empty', () => {
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)
  })

  it('reads true from localStorage on first render', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(true)
  })

  it('reads false from localStorage on first render', () => {
    window.localStorage.setItem(STORAGE_KEY, 'false')
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)
  })

  it('toggle() flips from false to true and writes "true" to localStorage', () => {
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.visible).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('toggle() flips back to false and writes "false" to localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(true)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.visible).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('setVisible(true) forces the value to true regardless of prior state', () => {
    window.localStorage.setItem(STORAGE_KEY, 'false')
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)

    act(() => {
      result.current.setVisible(true)
    })

    expect(result.current.visible).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('setVisible(false) forces the value to false regardless of prior state', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(true)

    act(() => {
      result.current.setVisible(false)
    })

    expect(result.current.visible).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false')
  })

  it('responds to a storage event from another tab (newValue="true" flips to true)', () => {
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)

    act(() => {
      fireEvent(
        window,
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'true',
          oldValue: 'false',
          storageArea: window.localStorage,
          url: window.location.href,
        }),
      )
    })

    expect(result.current.visible).toBe(true)
  })

  it('responds to a storage event with newValue="false" by flipping back', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(true)

    act(() => {
      fireEvent(
        window,
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'false',
          oldValue: 'true',
          storageArea: window.localStorage,
          url: window.location.href,
        }),
      )
    })

    expect(result.current.visible).toBe(false)
  })

  it('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => usePerfMonitorVisibility())
    expect(result.current.visible).toBe(false)

    act(() => {
      fireEvent(
        window,
        new StorageEvent('storage', {
          key: 'some.other.key',
          newValue: '"true"',
          oldValue: null,
          storageArea: window.localStorage,
          url: window.location.href,
        }),
      )
    })

    expect(result.current.visible).toBe(false)
  })

  it('treats any localStorage value other than "true" as false', () => {
    window.localStorage.setItem(STORAGE_KEY, 'TRUE')
    const a = renderHook(() => usePerfMonitorVisibility())
    expect(a.result.current.visible).toBe(false)
    a.unmount()

    window.localStorage.setItem(STORAGE_KEY, '1')
    const b = renderHook(() => usePerfMonitorVisibility())
    expect(b.result.current.visible).toBe(false)
    b.unmount()

    window.localStorage.setItem(STORAGE_KEY, 'yes')
    const c = renderHook(() => usePerfMonitorVisibility())
    expect(c.result.current.visible).toBe(false)
  })

  it('returns a stable toggle reference across renders that do not change the value', () => {
    const { result, rerender } = renderHook(() => usePerfMonitorVisibility())
    const initial = result.current.toggle
    rerender()
    expect(result.current.toggle).toBe(initial)
  })

  it('returns a stable setVisible reference across renders that do not change the value', () => {
    const { result, rerender } = renderHook(() => usePerfMonitorVisibility())
    const initial = result.current.setVisible
    rerender()
    expect(result.current.setVisible).toBe(initial)
  })
})
