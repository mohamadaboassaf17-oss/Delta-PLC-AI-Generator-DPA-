import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { useEffect, useRef, type ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { useProject } from '@/hooks/useProject'
import { useGeneration } from '@/hooks/useGeneration'
import type { HmiTable, HMITag } from '@/types/hmi'
import type { Project } from '@/types/project'
import type { DvpModelSpec } from '@/lib/tauriApi'

interface ListenCallback<T> {
  (event: { payload: T }): void
}

const { invokeMock, listenMock, listenListeners, fire } = vi.hoisted(() => {
  const invokeMock = vi.fn()
  const listenMock = vi.fn()
  const listenListeners: Record<string, Array<ListenCallback<unknown>>> = {}

  listenMock.mockImplementation(
    (eventName: string, callback: ListenCallback<unknown>) => {
      if (!listenListeners[eventName]) {
        listenListeners[eventName] = []
      }
      listenListeners[eventName]!.push(callback)
      return Promise.resolve(() => {
        const arr = listenListeners[eventName]
        if (arr) {
          listenListeners[eventName] = arr.filter((c) => c !== callback)
        }
      })
    },
  )

  function fire<T>(eventName: string, payload: T): void {
    const arr = listenListeners[eventName]
    if (!arr) return
    for (const cb of arr) {
      cb({ payload })
    }
  }

  return { invokeMock, listenMock, listenListeners, fire }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

const modelList = {
  models: [
    {
      family: 'ss2',
      label: 'DVP-SS2',
      max_x: 8,
      max_y: 8,
      max_m: 512,
      max_s: null,
      max_t: 128,
      max_c: 128,
    } satisfies DvpModelSpec,
  ],
}

const settings = {
  active_provider: 'openai',
  generation: { model: 'gpt-4o', temperature: 0.2, max_tokens: 4096 },
  ui: { theme: 'system', language: 'en-US' },
}

function setupInvoke(project: Project): void {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'project_new') return Promise.resolve(project)
    if (cmd === 'dvp_list_models') return Promise.resolve(modelList)
    if (cmd === 'settings_get') return Promise.resolve(settings)
    if (cmd === 'secret_get') return Promise.resolve('sk-test-key')
    if (cmd === 'generate_code') return Promise.resolve(undefined)
    return Promise.resolve(null)
  })
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p-1',
    name: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 3,
    meta: { author: 'qa', model: 'DVP-SS2' },
    io_table: [],
    ...overrides,
  }
}

interface ProbeProps {
  onHmiTable: (table: HmiTable | null) => void
  onTrigger: (start: (description: string) => Promise<void>) => void
}

function Probe({ onHmiTable, onTrigger }: ProbeProps): ReactElement {
  const { project, createNew } = useProject()
  const { startGeneration } = useGeneration()
  const startRef = useRef(startGeneration)
  const hasCreatedProject = useRef(false)

  useEffect(() => {
    startRef.current = startGeneration
  })

  // `createNew` is re-created on every ProjectProvider render (it is not
  // memoized), so depending on it directly would re-run this effect forever.
  useEffect(() => {
    if (hasCreatedProject.current) return
    hasCreatedProject.current = true
    void createNew('Test')
  }, [createNew])

  useEffect(() => {
    onHmiTable(project?.hmi_table ?? null)
  }, [project?.hmi_table, onHmiTable])

  // Only expose the trigger once a project exists; otherwise startGeneration
  // runs with a stale `project === null` closure and its generation-done
  // handler computes HMI state against an empty project.
  useEffect(() => {
    if (!project) return
    onTrigger(async (desc) => {
      await startRef.current(desc)
    })
  }, [onTrigger, project])

  return <div data-testid="probe" />
}

async function waitForDoneListener(): Promise<void> {
  await waitFor(() => {
    const arr = listenListeners['generation-done']
    if (!arr || arr.length === 0) {
      throw new Error('generation-done listener not yet registered')
    }
  })
}

describe('useGeneration → HMI flow', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockClear()
    for (const key of Object.keys(listenListeners)) {
      delete listenListeners[key]
    }
  })

  it('processes the LLM hmiTagsRaw into an HmiTable on the project', async () => {
    const project = makeProject()
    setupInvoke(project)

    let lastHmi: HmiTable | null = null
    let trigger: ((desc: string) => Promise<void>) | null = null
    const onHmiTable = (t: HmiTable | null): void => {
      lastHmi = t
    }
    const onTrigger = (fn: (desc: string) => Promise<void>): void => {
      trigger = fn
    }

    render(
      <ProjectProvider>
        <Probe onHmiTable={onHmiTable} onTrigger={onTrigger} />
      </ProjectProvider>,
    )

    await waitFor(() => expect(trigger).not.toBeNull())

    await act(async () => {
      await trigger!('start motor when X0 is on')
    })

    await waitForDoneListener()

    const hmiPayload = JSON.stringify([
      { address: null, type: 'Button', label: 'Start', plcRef: 'X0', source: 'auto' },
      { address: null, type: 'Lamp', label: 'Run', plcRef: 'Y0', source: 'auto' },
    ])

    await act(async () => {
      fire('generation-done', {
        stCode: 'X0 := TRUE;',
        ilCode: 'LD X0\nOUT Y0',
        ldGraph: null,
        rawResponse: '...',
        hmiTagsRaw: hmiPayload,
      })
    })

    await waitFor(() => {
      if (lastHmi === null) throw new Error('hmi_table not yet set')
    })

    const hmi = lastHmi as unknown as HmiTable
    expect(hmi.tags).toHaveLength(2)
    expect(hmi.tags[0]?.address).toBe('M0')
    expect(hmi.tags[1]?.address).toBe('M1')
    expect(hmi.tags[0]?.source).toBe('auto')
    expect(hmi.tags[1]?.source).toBe('auto')
    expect(hmi.model).toBe('DVP-SS2')
    expect(hmi.reservedMRange).toEqual([0, 1])
  })

  it('preserves a pre-existing manual HMI tag when the LLM emits new tags', async () => {
    const project = makeProject({
      hmi_table: {
        tags: [
          {
            address: 'M3',
            type: 'Lamp',
            label: 'Operator Indicator',
            plcRef: 'Y0',
            source: 'manual',
          } satisfies HMITag,
        ],
        reservedMRange: [3, 3],
        model: 'DVP-SS2',
      },
    })
    setupInvoke(project)

    let lastHmi: HmiTable | null = null
    let trigger: ((desc: string) => Promise<void>) | null = null
    const onHmiTable = (t: HmiTable | null): void => {
      lastHmi = t
    }
    const onTrigger = (fn: (desc: string) => Promise<void>): void => {
      trigger = fn
    }

    render(
      <ProjectProvider>
        <Probe onHmiTable={onHmiTable} onTrigger={onTrigger} />
      </ProjectProvider>,
    )

    await waitFor(() => expect(trigger).not.toBeNull())

    await act(async () => {
      await trigger!('desc')
    })

    await waitForDoneListener()

    const hmiPayload = JSON.stringify([
      { address: null, type: 'Button', label: 'Start', plcRef: 'X0', source: 'auto' },
    ])

    await act(async () => {
      fire('generation-done', {
        stCode: '',
        ilCode: '',
        ldGraph: null,
        rawResponse: '',
        hmiTagsRaw: hmiPayload,
      })
    })

    await waitFor(() => {
      if (lastHmi === null) throw new Error('hmi_table not yet set')
      if (lastHmi.tags.length !== 2) {
        throw new Error(`tag count ${lastHmi.tags.length}`)
      }
    })

    const hmi = lastHmi as unknown as HmiTable
    expect(hmi.tags[0]?.source).toBe('manual')
    expect(hmi.tags[0]?.address).toBe('M3')
    expect(hmi.tags[0]?.label).toBe('Operator Indicator')
    expect(hmi.tags[1]?.source).toBe('auto')
    expect(hmi.tags[1]?.address).toBe('M0')
  })

  it('keeps the existing hmi_table when the LLM emits an empty hmiTagsRaw', async () => {
    const project = makeProject({
      hmi_table: {
        tags: [
          {
            address: 'M0',
            type: 'Button',
            label: 'Existing',
            plcRef: 'X0',
            source: 'auto',
          },
        ],
        reservedMRange: [0, 0],
        model: 'DVP-SS2',
      },
    })
    setupInvoke(project)

    let lastHmi: HmiTable | null = null
    let trigger: ((desc: string) => Promise<void>) | null = null
    const onHmiTable = (t: HmiTable | null): void => {
      lastHmi = t
    }
    const onTrigger = (fn: (desc: string) => Promise<void>): void => {
      trigger = fn
    }

    render(
      <ProjectProvider>
        <Probe onHmiTable={onHmiTable} onTrigger={onTrigger} />
      </ProjectProvider>,
    )

    await waitFor(() => expect(trigger).not.toBeNull())
    await act(async () => {
      await trigger!('desc')
    })
    await waitForDoneListener()

    await act(async () => {
      fire('generation-done', {
        stCode: '',
        ilCode: '',
        ldGraph: null,
        rawResponse: '',
        hmiTagsRaw: '',
      })
    })

    await waitFor(() => {
      if (lastHmi === null) throw new Error('hmi_table not yet set')
    })

    const hmi = lastHmi as unknown as HmiTable
    expect(hmi.tags).toHaveLength(1)
    expect(hmi.tags[0]?.label).toBe('Existing')
    expect(hmi.tags[0]?.address).toBe('M0')
  })
})
