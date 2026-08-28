import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { useEffect, useRef, type ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { useProject } from '@/hooks/useProject'
import type { Project } from '@/types/project'
import type { IOPoint } from '@/types/io'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 3,
    meta: { model: 'DVP-SS2', author: 'qa' },
    io_table: [],
    ...overrides,
  }
}

interface HarnessState {
  project: Project | null
  status: string
  path: string | null
  isDirty: boolean
  error: string | null
  chatHistory: unknown[]
  createNew: (n: string) => Promise<void>
  openExisting: (p: string) => Promise<void>
  save: () => Promise<void>
  saveAs: (p: string) => Promise<void>
  close: () => void
  setProjectModel: (m: string) => void
  setIoTable: (t: IOPoint[]) => void
  setHmiTable: (t: unknown) => void
  addChatMessage: (m: unknown) => void
  setChatHistory: (h: unknown[]) => void
}

let harness: HarnessState | null = null

function Probe(): ReactElement {
  const api = useProject()
  const ref = useRef(api)
  useEffect(() => {
    ref.current = api
    harness = {
      project: api.project,
      status: api.status,
      path: api.path,
      isDirty: api.isDirty,
      error: api.error,
      chatHistory: api.chatHistory,
      createNew: (...a) => ref.current.createNew(...a),
      openExisting: (...a) => ref.current.openExisting(...a),
      save: () => ref.current.save(),
      saveAs: (...a) => ref.current.saveAs(...a),
      close: () => ref.current.close(),
      setProjectModel: (...a) => ref.current.setProjectModel(...a),
      setIoTable: (...a) => ref.current.setIoTable(...a as [IOPoint[]]),
      setHmiTable: (...a) => ref.current.setHmiTable(...a as [never]),
      addChatMessage: (...a) => ref.current.addChatMessage(...a as [never]),
      setChatHistory: (...a) => ref.current.setChatHistory(...a as [never[]]),
    }
  })
  return <div data-testid="probe" />
}

async function renderHarness(): Promise<void> {
  harness = null
  render(
    <ProjectProvider>
      <Probe />
    </ProjectProvider>,
  )
  await waitFor(() => {
    if (!harness) throw new Error('harness not ready')
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function get(): HarnessState {
  if (!harness) throw new Error('harness null')
  return harness
}

describe('useProject — M11 gap coverage', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    harness = null
  })

  it('createNew succeeds and sets project', async () => {
    const proj = makeProject()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(proj)
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('My Project')
    })
    await waitFor(() => {
      if (!get().project) throw new Error('project not set')
    })
    expect(get().project?.name).toBe('Test Project')
    expect(get().status).toBe('new')
    expect(invokeMock).toHaveBeenCalledWith('project_new', { name: 'My Project' })
  })

  it('createNew handles backend error and sets error', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.reject(new Error('backend down'))
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('Fail')
    })
    await waitFor(() => {
      if (!get().error) throw new Error('error not set')
    })
    expect(get().error).toMatch(/backend down/)
    expect(get().status).toBe('error')
  })

  it('openExisting calls project_open and bumps status to opened', async () => {
    const proj = makeProject({ chat_history: [] })
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_open') return Promise.resolve(proj)
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().openExisting('/tmp/a.dpa')
    })
    await waitFor(() => {
      if (!get().project) throw new Error('not opened')
    })
    expect(get().status).toBe('opened')
    expect(get().path).toBe('/tmp/a.dpa')
    expect(invokeMock).toHaveBeenCalledWith('project_open', { path: '/tmp/a.dpa' })
  })

  it('save requires project and path — sets error when no project', async () => {
    invokeMock.mockResolvedValue(null)
    await renderHarness()
    await act(async () => {
      await get().save()
    })
    await waitFor(() => {
      if (!get().error) throw new Error('expected error')
    })
    expect(get().error).toMatch(/No project to save/)
    expect(invokeMock).not.toHaveBeenCalledWith('project_save', expect.anything())
  })

  it('saveAs normalizes missing .dpa extension', async () => {
    const proj = makeProject()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(proj)
      if (cmd === 'project_save_as') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('P')
    })
    await waitFor(() => {
      if (!get().project) throw new Error('not created')
    })
    invokeMock.mockClear()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_save_as') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
    await act(async () => {
      await get().saveAs('/tmp/myproject')
    })
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('project_save_as', expect.objectContaining({ path: '/tmp/myproject.dpa' }))
    })
  })

  it('saveAs replaces wrong extension with .dpa', async () => {
    const proj = makeProject()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(proj)
      if (cmd === 'project_save_as') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('P')
    })
    await waitFor(() => {
      if (!get().project) throw new Error('not created')
    })
    invokeMock.mockClear()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_save_as') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
    await act(async () => {
      await get().saveAs('/tmp/file.txt')
    })
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('project_save_as', expect.objectContaining({ path: '/tmp/file.dpa' }))
    })
  })

  it('setProjectModel marks dirty and updates model', async () => {
    const proj = makeProject()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(proj)
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('P')
    })
    await waitFor(() => {
      if (!get().project) throw new Error('not created')
    })
    await act(async () => {
      get().setProjectModel('DVP-SA2')
    })
    await waitFor(() => {
      if (get().project?.meta.model !== 'DVP-SA2') throw new Error('model not updated')
    })
    expect(get().isDirty).toBe(true)
  })

  it('setIoTable marks dirty and updates io_table', async () => {
    const proj = makeProject()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(proj)
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('P')
    })
    await waitFor(() => {
      if (!get().project) throw new Error('not created')
    })
    await act(async () => {
      get().setIoTable([{ address: 'X0', type: 'Input', label: 'Btn' }])
    })
    await waitFor(() => {
      if ((get().project?.io_table?.length ?? 0) !== 1) throw new Error('io not set')
    })
    expect(get().project?.io_table?.[0]?.address).toBe('X0')
    expect(get().isDirty).toBe(true)
  })

  it('close clears project and calls project_clear_active', async () => {
    const proj = makeProject()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(proj)
      if (cmd === 'project_clear_active') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('P')
    })
    await waitFor(() => {
      if (!get().project) throw new Error('project not set')
    })
    await act(async () => {
      get().close()
    })
    await waitFor(() => {
      if (get().project !== null) throw new Error('not cleared')
    })
    // project_clear_active is called without args (no second param)
    expect(invokeMock).toHaveBeenCalledWith('project_clear_active')
  })

  it('addChatMessage appends to history and marks dirty', async () => {
    const proj = makeProject()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(proj)
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('P')
    })
    await act(async () => {
      get().addChatMessage({ role: 'user', content: 'hello', timestamp: new Date().toISOString() })
    })
    await waitFor(() => {
      if ((get().chatHistory.length ?? 0) !== 1) throw new Error('chat not added')
    })
    expect((get().chatHistory[0] as { content: string }).content).toBe('hello')
  })

  it('error reset: creating new project clears previous error', async () => {
    // First fail
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.reject(new Error('fail1'))
      return Promise.resolve(null)
    })
    await renderHarness()
    await act(async () => {
      await get().createNew('Fail')
    })
    await waitFor(() => {
      if (!get().error) throw new Error('error not set')
    })
    // Then succeed
    const proj = makeProject()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(proj)
      return Promise.resolve(null)
    })
    await act(async () => {
      await get().createNew('Ok')
    })
    await waitFor(() => {
      if (!get().project) throw new Error('not created')
    })
    expect(get().error).toBeNull()
    expect(get().status).toBe('new')
  })
})
