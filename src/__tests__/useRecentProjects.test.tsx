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
    invokeMock.mockResolvedValue(sample)
    const { result } = renderHook(() => useRecentProjects())
    await waitFor(() => expect(result.current.recents).toEqual(sample))
    act(() => {
      result.current.remove('/tmp/beta.dpa')
    })
    expect(result.current.recents.map((r) => r.path)).toEqual([
      '/tmp/alpha.dpa',
      '/tmp/gamma.dpa',
    ])
  })
})
