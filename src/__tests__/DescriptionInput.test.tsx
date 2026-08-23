import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { ToastProvider } from '@/components/Toast'
import { useProject } from '@/hooks/useProject'
import { DescriptionInput } from '@/components/DescriptionInput'
import type { Project } from '@/types/project'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      active_provider: 'openai' as const,
      generation: { model: 'gpt-4o-mini', temperature: 0.2 },
    },
    reload: vi.fn(),
  }),
}))

const newProject: Project = {
  id: 'new-1',
  name: 'Fresh',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  version: 3,
  meta: {},
  io_table: [],
}

const projectWithSavedDescription: Project = {
  id: 'opened-1',
  name: 'With history',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  version: 3,
  meta: {
    description: 'Previously saved automation prompt',
  },
  io_table: [],
}

interface TriggerProps {
  action: 'new' | 'open'
  ready: () => void
}

/** Drives ProjectContext into the requested state once, then signals ready. */
function ProjectTrigger({ action, ready }: TriggerProps): null {
  const { createNew, openExisting } = useProject()
  useEffect(() => {
    if (action === 'new') {
      void createNew('Fresh').then(() => ready())
    } else {
      void openExisting('/projects/with-history.dpa').then(() => ready())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderWith(trigger: ReactElement) {
  return render(
    <ToastProvider>
      <ProjectProvider>
        {trigger}
        <DescriptionInput onGenerate={vi.fn()} isGenerating={false} />
      </ProjectProvider>
    </ToastProvider>,
  )
}

describe('DescriptionInput — project description persistence (M10.3.3)', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('starts empty when New Project is created', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(newProject)
      return Promise.resolve(null)
    })

    let ready = false
    renderWith(<ProjectTrigger action="new" ready={() => (ready = true)} />)

    await waitFor(() => {
      expect(ready).toBe(true)
    })

    const textarea = screen.getByTestId('description-textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
  })

  it('loads project.meta.description when an existing .dpa is opened', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_open') return Promise.resolve(projectWithSavedDescription)
      return Promise.resolve(null)
    })

    let ready = false
    renderWith(<ProjectTrigger action="open" ready={() => (ready = true)} />)

    await waitFor(() => {
      expect(ready).toBe(true)
    })

    await waitFor(() => {
      const textarea = screen.getByTestId('description-textarea') as HTMLTextAreaElement
      expect(textarea.value).toBe('Previously saved automation prompt')
    })
  })

  it('clears stale text when the user switches between projects', async () => {
    // First: open a project with a saved description.
    let openCalled = false
    let createCalled = false
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_open') {
        openCalled = true
        return Promise.resolve(projectWithSavedDescription)
      }
      if (cmd === 'project_new') {
        createCalled = true
        return Promise.resolve(newProject)
      }
      if (cmd === 'project_clear_active') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    function Switcher(): ReactElement {
      const { project, openExisting, createNew, close } = useProject()
      useEffect(() => {
        if (!openCalled) {
          void openExisting('/projects/with-history.dpa')
        } else if (project && project.id === 'opened-1' && !createCalled) {
          close()
          // Trigger the next state after close has resolved (microtask).
          queueMicrotask(() => {
            void createNew('Fresh')
          })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [project])
      return <DescriptionInput onGenerate={vi.fn()} isGenerating={false} />
    }

    render(
      <ToastProvider>
        <ProjectProvider>
          <Switcher />
        </ProjectProvider>
      </ToastProvider>,
    )

    // The opened project's saved description appears first.
    await waitFor(() => {
      const ta = screen.getByTestId('description-textarea') as HTMLTextAreaElement
      expect(ta.value).toBe('Previously saved automation prompt')
    })

    // Once we cycle to a fresh project, the box must clear — the bug
    // we're guarding against was that the previous text stayed put.
    await waitFor(() => {
      const ta = screen.getByTestId('description-textarea') as HTMLTextAreaElement
      expect(ta.value).toBe('')
    })
  })

  it('lets the user type freely between project changes without clobbering', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(newProject)
      return Promise.resolve(null)
    })

    let ready = false
    renderWith(<ProjectTrigger action="new" ready={() => (ready = true)} />)
    await waitFor(() => {
      expect(ready).toBe(true)
    })

    const user = userEvent.setup()
    const textarea = screen.getByTestId('description-textarea')
    await user.type(textarea, 'my prompt')
    expect(textarea).toHaveValue('my prompt')
  })
})
