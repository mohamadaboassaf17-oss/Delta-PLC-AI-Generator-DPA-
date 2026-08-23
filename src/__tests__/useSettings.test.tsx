import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSettings } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

describe('useSettings', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('starts with default settings and loading=true', () => {
    invokeMock.mockResolvedValue(DEFAULT_SETTINGS)
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('updates state once settings_get resolves', async () => {
    const next: Settings = {
      active_provider: 'anthropic',
      generation: { model: 'claude-3-5-sonnet', temperature: 0.5, max_tokens: 2048 },
      ui: { theme: 'dark', language: 'pt-BR' },
    }
    invokeMock.mockResolvedValue(next)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.settings).toEqual(next)
    expect(result.current.error).toBeNull()
  })

  it('captures error and keeps defaults on rejection', async () => {
    invokeMock.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('invokes settings_set with the next settings on setSettings', async () => {
    invokeMock.mockResolvedValue(DEFAULT_SETTINGS)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const next: Settings = {
      active_provider: 'anthropic',
      generation: { model: 'claude-3-5-sonnet', temperature: 0.7, max_tokens: 8192 },
      ui: { theme: 'light', language: 'en-US' },
    }
    await act(async () => {
      await result.current.setSettings(next)
    })
    expect(invokeMock).toHaveBeenCalledWith('settings_set', { settings: next })
    expect(result.current.settings).toEqual(next)
  })

  it('throws when settings_set rejects', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'settings_set') return Promise.reject(new Error('denied'))
      return Promise.resolve(DEFAULT_SETTINGS)
    })
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await expect(
        result.current.setSettings({
          active_provider: 'openai',
          generation: { model: 'gpt-4o', temperature: 0.1, max_tokens: 1024 },
          ui: { theme: 'system', language: 'en-US' },
        }),
      ).rejects.toThrow('denied')
    })
    expect(result.current.error).toBe('denied')
  })
})
