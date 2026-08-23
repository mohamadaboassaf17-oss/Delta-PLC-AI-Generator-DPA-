import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { useProject } from '@/hooks/useProject'
import type { Project } from '@/types/project'
import { ChatPanel } from '@/components/ChatPanel'

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

const seedProject: Project = {
  id: 'p-1',
  name: 'Chat Panel Test',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  version: 3,
  meta: {},
  io_table: [],
}

/** Seeds a new project then adds two chat messages once it is loaded. */
function MessageSeeder(): null {
  const { createNew, status, addChatMessage } = useProject()
  useEffect(() => {
    void createNew('Chat Panel Test')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (status === 'new') {
      addChatMessage({ timestamp: '2026-06-01T00:00:01Z', role: 'user', content: 'Hello' })
      addChatMessage({ timestamp: '2026-06-01T00:00:02Z', role: 'assistant', content: 'World' })
    }
  }, [status, addChatMessage])
  return null
}

function renderWithMessages(): void {
  render(
    <ProjectProvider>
      <MessageSeeder />
      <ChatPanel isOpen={true} onClose={() => {}} />
    </ProjectProvider>,
  )
}

describe('ChatPanel', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
    invokeMock.mockImplementation(() => Promise.resolve(null))
    listenMock.mockResolvedValue(() => {})
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ProjectProvider>
        <ChatPanel isOpen={false} onClose={() => {}} />
      </ProjectProvider>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the empty-history message when no project is loaded', () => {
    render(
      <ProjectProvider>
        <ChatPanel isOpen={true} onClose={() => {}} />
      </ProjectProvider>,
    )
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument()
  })

  it('renders the close button when open', () => {
    render(
      <ProjectProvider>
        <ChatPanel isOpen={true} onClose={() => {}} />
      </ProjectProvider>,
    )
    expect(screen.getByLabelText('Close chat panel')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <ProjectProvider>
        <ChatPanel isOpen={true} onClose={onClose} />
      </ProjectProvider>,
    )
    fireEvent.click(screen.getByLabelText('Close chat panel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders the chat input textarea when open', () => {
    render(
      <ProjectProvider>
        <ChatPanel isOpen={true} onClose={() => {}} />
      </ProjectProvider>,
    )
    const input = screen.getByTestId('chat-input')
    expect(input).toBeInTheDocument()
  })

  it('disables the Send button when input is empty', () => {
    render(
      <ProjectProvider>
        <ChatPanel isOpen={true} onClose={() => {}} />
      </ProjectProvider>,
    )
    const sendBtn = screen.getByText('Send')
    expect(sendBtn).toBeDisabled()
  })

  it('renders the clear button when messages exist', async () => {
    invokeMock.mockImplementation((cmd: string) =>
      cmd === 'project_new' ? Promise.resolve(seedProject) : Promise.resolve(null),
    )
    renderWithMessages()
    await waitFor(() => expect(screen.getByTestId('clear-chat-button')).toBeInTheDocument())
    expect(screen.getByLabelText('Clear chat')).toBeInTheDocument()
  })

  it('clears the message list and shows the empty state when the clear button is clicked', async () => {
    invokeMock.mockImplementation((cmd: string) =>
      cmd === 'project_new' ? Promise.resolve(seedProject) : Promise.resolve(null),
    )
    const user = userEvent.setup()
    renderWithMessages()

    await waitFor(() => {
      expect(screen.getByTestId('clear-chat-button')).toBeInTheDocument()
    })
    expect(screen.getByText('Hello')).toBeInTheDocument()

    await user.click(screen.getByTestId('clear-chat-button'))

    await waitFor(() => {
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
    expect(screen.queryByText('World')).not.toBeInTheDocument()
    expect(screen.queryByTestId('clear-chat-button')).not.toBeInTheDocument()
  })
})
