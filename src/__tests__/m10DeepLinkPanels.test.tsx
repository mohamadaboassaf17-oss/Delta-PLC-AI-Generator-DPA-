import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectProvider } from '@/context/ProjectContext'
import { ToastProvider } from '@/components/Toast'

const { useGenerationMock, useChatMock, useReviewMock, useOnlineStatusMock } = vi.hoisted(() => ({
  useGenerationMock: vi.fn(),
  useChatMock: vi.fn(),
  useReviewMock: vi.fn(),
  useOnlineStatusMock: vi.fn<() => { isOnline: boolean }>(),
}))

vi.mock('@/hooks/useGeneration', () => ({
  useGeneration: () => useGenerationMock(),
}))
vi.mock('@/hooks/useChat', () => ({
  useChat: () => useChatMock(),
}))
vi.mock('@/hooks/useReview', () => ({
  useReview: () => useReviewMock(),
}))
vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))

import CodeGenerationPanel from '@/components/CodeGenerationPanel'
import { ChatPanel } from '@/components/ChatPanel'
import { AIReviewPanel } from '@/components/AIReviewPanel'

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <ProjectProvider>{ui}</ProjectProvider>
    </ToastProvider>,
  )
}

describe('M10 Deep-link panels — missing-key shows Open Settings', () => {
  beforeEach(() => {
    useOnlineStatusMock.mockReturnValue({ isOnline: true })
    useChatMock.mockReturnValue({
      isModifying: false,
      streamingSt: '',
      modificationError: null,
      showDiff: false,
      pendingSt: null,
      startModification: vi.fn(),
      applyModification: vi.fn(),
      rejectModification: vi.fn(),
      clearModification: vi.fn(),
    })
    useReviewMock.mockReturnValue({
      isReviewing: false,
      review: null,
      reviewError: null,
      startReview: vi.fn(),
      clearReview: vi.fn(),
    })
  })

  it('CodeGenerationPanel shows Open Settings on missing-key error', async () => {
    useGenerationMock.mockReturnValue({
      isGenerating: false,
      streamingSt: '',
      streamingIl: '',
      generationError: 'No API key found for openai. Please configure your API key in Settings. https://platform.openai.com/api-keys',
      startGeneration: vi.fn(),
      clearGeneration: vi.fn(),
    })
    // Need a project for panel to render generationError? CodeGenerationPanel renders error regardless of project.
    renderWithProviders(<CodeGenerationPanel />)
    const banner = await screen.findByTestId('generation-error-banner')
    expect(banner).toBeInTheDocument()
    expect(screen.getByTestId('open-settings-from-generation-error')).toBeInTheDocument()
    // recharge link should also be present because URL exists, but missing-key takes priority for deep-link button
    // recharge link is hidden when missing-key (to avoid duplicate), so check it is NOT there for missing-key
    expect(screen.queryByTestId('recharge-link-generation-error')).not.toBeInTheDocument()
  })

  it('CodeGenerationPanel shows recharge link on 429 without missing-key', async () => {
    useGenerationMock.mockReturnValue({
      isGenerating: false,
      streamingSt: '',
      streamingIl: '',
      generationError: 'تم تجاوز الحد المسموح / الرصيد منتهٍ — اشحن الرصيد: https://platform.openai.com/api-keys — quota exceeded',
      startGeneration: vi.fn(),
      clearGeneration: vi.fn(),
    })
    renderWithProviders(<CodeGenerationPanel />)
    const banner = await screen.findByTestId('generation-error-banner')
    expect(banner).toBeInTheDocument()
    expect(screen.queryByTestId('open-settings-from-generation-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('recharge-link-generation-error')).toBeInTheDocument()
    expect(screen.getByTestId('recharge-link-generation-error').getAttribute('href')).toContain('platform.openai.com')
  })

  it('ChatPanel shows Open Settings on missing-key modificationError', async () => {
    useGenerationMock.mockReturnValue({
      isGenerating: false,
      streamingSt: '',
      streamingIl: '',
      generationError: null,
      startGeneration: vi.fn(),
      clearGeneration: vi.fn(),
    })
    useChatMock.mockReturnValue({
      isModifying: false,
      streamingSt: '',
      modificationError: 'No API key found for anthropic. Please configure your API key in Settings.',
      showDiff: false,
      pendingSt: null,
      startModification: vi.fn(),
      applyModification: vi.fn(),
      rejectModification: vi.fn(),
      clearModification: vi.fn(),
    })
    renderWithProviders(<ChatPanel />)
    expect(await screen.findByTestId('chat-error-banner')).toBeInTheDocument()
    expect(screen.getByTestId('open-settings-from-chat-error')).toBeInTheDocument()
  })

  it('AIReviewPanel shows Open Settings on missing-key reviewError', async () => {
    useGenerationMock.mockReturnValue({
      isGenerating: false,
      streamingSt: '',
      streamingIl: '',
      generationError: null,
      startGeneration: vi.fn(),
      clearGeneration: vi.fn(),
    })
    useReviewMock.mockReturnValue({
      isReviewing: false,
      review: null,
      reviewError: 'No API key found for gemini. Please configure your API key in Settings. https://aistudio.google.com/apikey',
      startReview: vi.fn(),
      clearReview: vi.fn(),
    })
    renderWithProviders(<AIReviewPanel />)
    expect(await screen.findByTestId('ai-review-error')).toBeInTheDocument()
    expect(screen.getByTestId('open-settings-from-review-error')).toBeInTheDocument()
  })

  it('clicking Open Settings dispatches dpa:open-settings event', async () => {
    useGenerationMock.mockReturnValue({
      isGenerating: false,
      streamingSt: '',
      streamingIl: '',
      generationError: 'No API key found for openai. Please configure your API key in Settings.',
      startGeneration: vi.fn(),
      clearGeneration: vi.fn(),
    })
    const handler = vi.fn()
    window.addEventListener('dpa:open-settings', handler as EventListener)
    renderWithProviders(<CodeGenerationPanel />)
    const btn = await screen.findByTestId('open-settings-from-generation-error')
    btn.click()
    expect(handler).toHaveBeenCalled()
    window.removeEventListener('dpa:open-settings', handler as EventListener)
  })
})
