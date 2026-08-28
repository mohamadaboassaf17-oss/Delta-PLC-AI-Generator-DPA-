import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { useEffect, useRef, type ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { useProject } from '@/hooks/useProject'
import { useGeneration } from '@/hooks/useGeneration'
import type { Settings } from '@/types/settings'
import type { Project } from '@/types/project'

interface ListenCallback<T> {
  (event: { payload: T }): void
}

const { invokeMock, listenMock, listenListeners, fire } = vi.hoisted(() => {
  const invokeMock = vi.fn()
  const listenMock = vi.fn()
  const listenListeners: Record<string, Array<ListenCallback<unknown>>> = {}
  listenMock.mockImplementation((eventName: string, callback: ListenCallback<unknown>) => {
    if (!listenListeners[eventName]) listenListeners[eventName] = []
    listenListeners[eventName]!.push(callback)
    return Promise.resolve(() => {
      const arr = listenListeners[eventName]
      if (arr) listenListeners[eventName] = arr.filter((c) => c !== callback)
    })
  })
  function fire<T>(eventName: string, payload: T): void {
    const arr = listenListeners[eventName]
    if (!arr) return
    for (const cb of arr) cb({ payload })
  }
  return { invokeMock, listenMock, listenListeners, fire }
})

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }))

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p-1',
    name: 'UseGeneration Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 3,
    meta: { model: 'DVP-SS2' },
    io_table: [{ address: 'X0', type: 'Input', label: 'Start Button' }],
    ...overrides,
  }
}

const defaultSettings: Settings = {
  active_provider: 'openai',
  generation: { model: 'gpt-4o', temperature: 0.2, max_tokens: 4096 },
  ui: { theme: 'system', language: 'en-US' },
}

function setupInvoke(settings: Settings, apiKey: string | null, project: Project): void {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'project_new') return Promise.resolve(project)
    if (cmd === 'dvp_list_models') return Promise.resolve({ models: [] })
    if (cmd === 'settings_get') return Promise.resolve(settings)
    if (cmd === 'secret_get') return Promise.resolve(apiKey)
    if (cmd === 'generate_code') return Promise.resolve(undefined)
    return Promise.resolve(null)
  })
}

interface HarnessState {
  generationError: string | null
  isGenerating: boolean
  streamingSt: string
  streamingIl: string
  startGeneration: (d: string) => Promise<void>
  clearGeneration: () => void
}

let harnessState: HarnessState | null = null

function Probe({ onReady }: { onReady: () => void }): ReactElement {
  const { createNew } = useProject()
  const gen = useGeneration()
  const genRef = useRef(gen)
  useEffect(() => {
    genRef.current = gen
    harnessState = {
      generationError: gen.generationError,
      isGenerating: gen.isGenerating,
      streamingSt: gen.streamingSt,
      streamingIl: gen.streamingIl,
      startGeneration: (...args) => genRef.current.startGeneration(...args),
      clearGeneration: () => genRef.current.clearGeneration(),
    }
  })
  const hasCreated = useRef(false)
  useEffect(() => {
    if (hasCreated.current) return
    hasCreated.current = true
    void createNew('UseGeneration Test').then(() => {
      // Wait a tick then signal ready
      queueMicrotask(() => onReady())
    })
  }, [createNew, onReady])
  return <div data-testid="probe" />
}

async function renderHarness(
  settings: Settings = defaultSettings,
  apiKey: string | null = 'sk-test',
  project: Project = makeProject(),
): Promise<void> {
  harnessState = null
  setupInvoke(settings, apiKey, project)
  await new Promise<void>((resolve) => {
    const onReady = (): void => resolve()
    render(
      <ProjectProvider>
        <Probe onReady={onReady} />
      </ProjectProvider>,
    )
  })
  // Wait for project to be set and harnessState populated
  await waitFor(() => {
    if (!harnessState) throw new Error('harness not ready')
  })
  // Extra tick for effects
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function getState(): HarnessState {
  if (!harnessState) throw new Error('harnessState null')
  return harnessState
}

describe('useGeneration — M11 gap coverage', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockClear()
    for (const k of Object.keys(listenListeners)) delete listenListeners[k]
    harnessState = null
  })

  it('sets error when description is empty', async () => {
    await renderHarness()
    await act(async () => {
      await getState().startGeneration('   ')
    })
    await waitFor(() => {
      expect(getState().generationError).toBe('Please enter a description of the automation task')
    })
    expect(getState().isGenerating).toBe(false)
  })

  it('sets error when no model is selected', async () => {
    const noModel: Settings = {
      ...defaultSettings,
      generation: { model: '', temperature: 0.2, max_tokens: 4096 },
    }
    await renderHarness(noModel)
    await act(async () => {
      await getState().startGeneration('start motor when X0 is on')
    })
    await waitFor(() => {
      expect(getState().generationError).toMatch(/No model selected/)
    })
    expect(getState().isGenerating).toBe(false)
  })

  it('sets error when API key is missing', async () => {
    await renderHarness(defaultSettings, null)
    await act(async () => {
      await getState().startGeneration('start motor when X0 is on')
    })
    await waitFor(() => {
      expect(getState().generationError).toMatch(/No API key found for openai/)
    })
    expect(getState().isGenerating).toBe(false)
  })

  it('sets isGenerating and accumulates streaming tokens', async () => {
    await renderHarness()
    await act(async () => {
      await getState().startGeneration('start motor when X0 is on')
    })
    await waitFor(() => expect(getState().isGenerating).toBe(true))
    await act(async () => {
      fire('generation-token', 'Y0 := ')
      fire('generation-token', 'X0;')
    })
    await waitFor(() => {
      expect(getState().streamingSt).toBe('Y0 := X0;')
    })
  })

  it('clearGeneration resets state and listeners', async () => {
    await renderHarness()
    await act(async () => {
      await getState().startGeneration('desc')
    })
    await waitFor(() => expect(getState().isGenerating).toBe(true))
    await act(async () => {
      fire('generation-token', 'partial')
    })
    await waitFor(() => expect(getState().streamingSt).toBe('partial'))
    await act(async () => {
      getState().clearGeneration()
    })
    await waitFor(() => {
      expect(getState().isGenerating).toBe(false)
      expect(getState().streamingSt).toBe('')
      expect(getState().streamingIl).toBe('')
      expect(getState().generationError).toBeNull()
    })
  })

  it('forwards customBaseUrl/customModelName when provider is custom', async () => {
    const customSettings: Settings = {
      active_provider: 'custom',
      generation: { model: 'llama3', temperature: 0.2, max_tokens: 4096 },
      ui: { theme: 'system', language: 'en-US' },
      custom_base_url: 'https://custom.example.com/v1',
      custom_model_name: 'my-model',
    }
    await renderHarness(customSettings, 'sk-custom')
    await act(async () => {
      await getState().startGeneration('desc')
    })
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'generate_code',
        expect.objectContaining({
          provider: 'custom',
          model: 'llama3',
          apiKey: 'sk-custom',
          customBaseUrl: 'https://custom.example.com/v1',
          customModelName: 'my-model',
        }),
      )
    })
  })

  it('injects label comments into ST on generation-done', async () => {
    const projectWithLabel = makeProject({
      io_table: [{ address: 'X0', type: 'Input', label: 'Start Button' }],
    })
    await renderHarness(defaultSettings, 'sk-test', projectWithLabel)
    await act(async () => {
      await getState().startGeneration('desc')
    })
    await waitFor(() => expect(getState().isGenerating).toBe(true))
    await act(async () => {
      fire('generation-done', {
        stCode: 'Y0 := X0;',
        ilCode: 'LD X0\nOUT Y0',
        ldGraph: null,
        rawResponse: '---ST---\nY0 := X0;',
        hmiTagsRaw: '',
      })
    })
    await waitFor(() => {
      expect(getState().streamingSt).toContain('Start Button')
      expect(getState().isGenerating).toBe(false)
    })
  })

  it('sets generationError on generation-error event', async () => {
    await renderHarness()
    await act(async () => {
      await getState().startGeneration('desc')
    })
    await waitFor(() => expect(getState().isGenerating).toBe(true))
    await act(async () => {
      fire('generation-error', { message: 'provider failed', kind: 'provider' })
    })
    await waitFor(() => {
      expect(getState().generationError).toBe('provider failed')
      expect(getState().isGenerating).toBe(false)
    })
  })
})
