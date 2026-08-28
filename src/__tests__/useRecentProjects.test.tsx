import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRecentProjects } from '@/hooks/useRecentProjects'
import type { RecentEntry } from '@/types/project'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

const sample: RecentEntry[] = [
  { id: '1', name: 'Alpha', path: '/tmp/alpha.dpa', last_opened: '2026-01-01T00:00:00Z' },
  { id: '2', name: 'Beta', path: '/tmp/beta.dpa', last_opened: '2026-01-02T00:00:00Z' },
  { id: '3', name: 'Gamma', path: '/tmp/gamma.dpa', last_opened: '2026-01-03T00:00:00Z' },
]

describe('useRecentProjects', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('starts with empty recents and loading=true', () => {
    invokeMock.mockResolvedValue([])
    const { result } = renderHook(() => useRecentProjects())
    expect(result.current.recents).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('populates recents after project_list_recent resolves', async () => {
    invokeMock.mockResolvedValue(sample)
    const { result } = renderHook(() => useRecentProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recents).toEqual(sample)
    expect(result.current.error).toBeNull()
  })

  it('captures error and clears recents on rejection', async () => {
    invokeMock.mockRejectedValue(new Error('read failed'))
    const { result } = renderHook(() => useRecentProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('read failed')
    expect(result.current.recents).toEqual([])
  })

  it('filters out a recents entry by path on remove', async () => {
    // First call: initial load -> full sample. Second call: remove cmd -> void. Third call: refresh after remove -> filtered sample.
    let listCalls = 0
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'recent_projects_remove' || cmd === 'project_list_recent' || cmd === 'recent_projects_list') {
        // Distinguish by order: first list call returns full sample, second list call (after remove) returns filtered.
        if (cmd === 'recent_projects_remove') return Promise.resolve(undefined)
        listCalls++
        if (listCalls === 1) return Promise.resolve(sample)
        return Promise.resolve(sample.filter((r) => r.path !== '/tmp/beta.dpa'))
      }
      // Fallback for any other invoke during the hook
      return Promise.resolve(sample)
    })
    const { result } = renderHook(() => useRecentProjects())
    await waitFor(() => expect(result.current.recents).toEqual(sample))
    await act(async () => {
      await result.current.remove('/tmp/beta.dpa')
    })
    await waitFor(() =>
      expect(result.current.recents.map((r) => r.path)).toEqual([
        '/tmp/alpha.dpa',
        '/tmp/gamma.dpa',
      ]),
    )
    expect(invokeMock).toHaveBeenCalledWith('recent_projects_remove', { path: '/tmp/beta.dpa' })
  })

  it('refreshes via global event bus (FIX-02)', async () => {
    invokeMock.mockResolvedValue(sample)
    const { result } = renderHook(() => useRecentProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const updated: RecentEntry[] = [
      { id: '4', name: 'Delta', path: '/tmp/delta.dpa', last_opened: '2026-01-04T00:00:00Z' },
    ]
    invokeMock.mockResolvedValue(updated)
    // Simulate ProjectContext save emitting the global event
    window.dispatchEvent(new Event('dpa:recents:refresh'))
    await waitFor(() => expect(result.current.recents).toEqual(updated))
  })
})
