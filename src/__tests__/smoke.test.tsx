import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '@/App'

const { invokeMock, openDialogMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openDialogMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
  save: openDialogMock,
}))

function mockInvoke(): void {
  invokeMock.mockImplementation((cmd: string) => {
    switch (cmd) {
      case 'settings_get':
        return Promise.resolve({
          active_provider: 'openai',
          generation: { model: 'gpt-4o', temperature: 0.2, max_tokens: 4096 },
          ui: { theme: 'system', language: 'en-US' },
        })
      case 'project_list_recent':
        return Promise.resolve([])
      case 'secret_get':
        return Promise.resolve(null)
      default:
        return Promise.resolve(null)
    }
  })
}

describe('App shell', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    openDialogMock.mockReset()
    window.localStorage.setItem('dpa.onboarded', '1')
    window.localStorage.removeItem('dpa.byok.progress.v1')
    mockInvoke()
  })

  it('renders the app heading and welcome screen', async () => {
    render(<App />)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /delta plc ai generator/i }),
      ).toBeInTheDocument()
    })
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
  })

  it('shows the app version in the status bar', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('status-bar')).toBeInTheDocument()
    })
    expect(screen.getByTestId('status-bar')).toHaveTextContent('v0.1.0')
  })

  it('exposes the new and open project entry points', async () => {
    render(<App />)
    expect(await screen.findByTestId('new-project-btn')).toBeInTheDocument()
    expect(await screen.findByTestId('open-project-btn')).toBeInTheDocument()
  })
})
