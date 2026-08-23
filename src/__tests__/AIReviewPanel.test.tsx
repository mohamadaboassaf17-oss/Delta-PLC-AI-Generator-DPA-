import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectProvider } from '@/context/ProjectContext'
import { AIReviewPanel } from '@/components/AIReviewPanel'

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

describe('AIReviewPanel', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
    invokeMock.mockImplementation(() => Promise.resolve(null))
    listenMock.mockResolvedValue(() => {})
  })

  it('renders the empty state when no project is loaded', () => {
    render(
      <ProjectProvider>
        <AIReviewPanel />
      </ProjectProvider>,
    )
    expect(screen.getByTestId('ai-review-empty')).toBeInTheDocument()
  })

  it('renders the panel header', () => {
    render(
      <ProjectProvider>
        <AIReviewPanel />
      </ProjectProvider>,
    )
    expect(screen.getByText('AI Code Review')).toBeInTheDocument()
  })

  it('renders the description text', () => {
    render(
      <ProjectProvider>
        <AIReviewPanel />
      </ProjectProvider>,
    )
    expect(screen.getByText(/Safety.*correctness review/i)).toBeInTheDocument()
  })

  it('renders the Run Review button in disabled state when no project is loaded', () => {
    render(
      <ProjectProvider>
        <AIReviewPanel />
      </ProjectProvider>,
    )
    const btn = screen.getByTestId('ai-review-run')
    expect(btn).toBeInTheDocument()
    expect(btn).toBeDisabled()
  })
})
