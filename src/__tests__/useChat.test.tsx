import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { useEffect, useRef, type ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { useProject } from '@/hooks/useProject'
import { useChat } from '@/hooks/useChat'
import type { Settings } from '@/types/settings'
import type { Project } from '@/types/project'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

const customSettings: Settings = {
  active_provider: 'custom',
  generation: { model: 'llama3', temperature: 0.2, max_tokens: 4096 },
  ui: { theme: 'system', language: 'en-US' },
  custom_base_url: 'https://api.example.com/v1',
  custom_model_name: 'my-model',
}

const openaiSettings: Settings = {
  active_provider: 'openai',
  generation: { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 4096 },
  ui: { theme: 'system', language: 'en-US' },
}

function makeProject(): Project {
  return {
    id: 'p-1',
    name: 'Use Chat Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 3,
    meta: {},
    io_table: [],
  }
}

function setupInvoke(settings: Settings): void {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'project_new') return Promise.resolve(makeProject())
    if (cmd === 'settings_get') return Promise.resolve(settings)
    if (cmd === 'secret_get') return Promise.resolve('sk-test-key')
    if (cmd === 'modify_code') return Promise.resolve(undefined)
    return Promise.resolve(null)
  })
}

interface ProbeProps {
  onTrigger: (start: (message: string) => Promise<void>) => void
}

function Probe({ onTrigger }: ProbeProps): ReactElement {
  const { project, createNew } = useProject()
  const { startModification } = useChat()
  const startRef = useRef(startModification)
  const hasCreatedProject = useRef(false)

  useEffect(() => {
    startRef.current = startModification
  })

  // `createNew` is re-created on every ProjectProvider render (it is not
  // memoized), so depending on it directly would re-run this effect forever.
  useEffect(() => {
    if (hasCreatedProject.current) return
    hasCreatedProject.current = true
    void createNew('Use Chat Test')
  }, [createNew])

  // Expose the trigger only once a project exists; otherwise
  // startModification bails out on the stale null-project closure.
  useEffect(() => {
    if (!project) return
    onTrigger((message) => startRef.current(message))
  }, [onTrigger, project])

  return <div data-testid="probe" />
}

async function renderAndStartModification(
  settings: Settings,
): Promise<void> {
  setupInvoke(settings)

  let trigger: ((message: string) => Promise<void>) | null = null
  const onTrigger = (fn: (message: string) => Promise<void>): void => {
    trigger = fn
  }

  render(
    <ProjectProvider>
      <Probe onTrigger={onTrigger} />
    </ProjectProvider>,
  )

  await waitFor(() => {
    if (trigger === null) throw new Error('trigger not yet exposed')
  })

  invokeMock.mockClear()
  await act(async () => {
    await trigger!('change M10 to M20')
  })
}

describe('useChat — H7 Custom-provider modification fix', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('forwards customBaseUrl and customModelName to modify_code when the active provider is custom', async () => {
    await renderAndStartModification(customSettings)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'modify_code',
        expect.objectContaining({
          provider: 'custom',
          model: 'llama3',
          apiKey: 'sk-test-key',
          customBaseUrl: 'https://api.example.com/v1',
          customModelName: 'my-model',
        }),
      )
    })
  })

  it('sends empty custom fields for a non-custom provider', async () => {
    await renderAndStartModification(openaiSettings)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'modify_code',
        expect.objectContaining({
          provider: 'openai',
          customBaseUrl: '',
          customModelName: '',
        }),
      )
    })
  })
})
