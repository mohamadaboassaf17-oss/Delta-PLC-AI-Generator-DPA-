import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ProjectProvider, useProjectContextValue } from '@/context/ProjectContext'
import type { Project } from '@/types/project'
import type { ChatMessage } from '@/types/chat'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

const sampleHistory: ChatMessage[] = [
  {
    timestamp: '2026-06-01T10:00:00Z',
    role: 'user',
    content: 'previous question',
  },
  {
    timestamp: '2026-06-01T10:01:00Z',
    role: 'assistant',
    content: 'previous answer',
    proposal: { st: 'Y0 := 1;', summary: 'baseline' },
  },
]

const projectWithHistory: Project = {
  id: 'persist-1',
  name: 'Persisted',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  version: 3,
  meta: { model: 'DVP-SS2' },
  io_table: [],
  chat_history: sampleHistory,
}

const projectNoHistory: Project = {
  ...projectWithHistory,
  id: 'persist-2',
  chat_history: undefined,
}

interface Probe {
  historyLength: number
  firstMessage: string | null
  projectChatLength: number
}

let lastProbe: Probe = { historyLength: 0, firstMessage: null, projectChatLength: 0 }
let createNewCalled = 0
let openExistingCalled = 0

function TestHarness(): ReactElement {
  const { project, chatHistory, openExisting, createNew } = useProjectContextValue()
  // Record the call counts so we can detect loops.
  if (project === null) {
    if (createNewCalled === 0) {
      createNewCalled++
      void createNew('Test')
    } else if (openExistingCalled === 0) {
      openExistingCalled++
      void openExisting('/fake/path.dpa')
    }
  }
  // eslint-disable-next-line react-hooks/globals
  lastProbe = {
    historyLength: chatHistory.length,
    firstMessage: chatHistory[0]?.content ?? null,
    projectChatLength: project?.chat_history?.length ?? 0,
  }
  return <div data-testid="probe">{project?.name ?? 'no-project'}</div>
}

describe('ProjectContext chat history restore', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    lastProbe = { historyLength: 0, firstMessage: null, projectChatLength: 0 }
    createNewCalled = 0
    openExistingCalled = 0
  })

  it('restores chat history when a project with chat_history is created', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectWithHistory)
      return Promise.resolve(null)
    })
    render(
      <ProjectProvider>
        <TestHarness />
      </ProjectProvider>,
    )
    await waitFor(() => {
      expect(lastProbe.projectChatLength).toBe(2)
    })
    expect(lastProbe.historyLength).toBe(2)
    expect(lastProbe.firstMessage).toBe('previous question')
  })

  it('handles a project without chat_history gracefully', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectNoHistory)
      return Promise.resolve(null)
    })
    render(
      <ProjectProvider>
        <TestHarness />
      </ProjectProvider>,
    )
    await waitFor(() => {
      expect(lastProbe.projectChatLength).toBe(0)
    })
    expect(lastProbe.historyLength).toBe(0)
  })

  it('treats a missing chat_history field on a project as an empty history', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectNoHistory)
      return Promise.resolve(null)
    })
    render(
      <ProjectProvider>
        <TestHarness />
      </ProjectProvider>,
    )
    await waitFor(() => {
      // History length stays at zero and no error is thrown.
      expect(lastProbe.historyLength).toBe(0)
    })
  })
})
