import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { ToastProvider } from '@/components/Toast'

// `useOnlineStatus` is mocked per-test so we can flip the offline flag
// without touching the actual `navigator` global.
const { useOnlineStatusMock, useGenerationMock } = vi.hoisted(() => ({
  useOnlineStatusMock: vi.fn<() => { isOnline: boolean }>(),
  useGenerationMock: vi.fn(),
}))

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}))

vi.mock('@/hooks/useGeneration', () => ({
  useGeneration: () => useGenerationMock(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

import CodeGenerationPanel from '@/components/CodeGenerationPanel'
import { ChatPanel } from '@/components/ChatPanel'
import { AIReviewPanel } from '@/components/AIReviewPanel'

function renderWithProvider(ui: ReactElement): ReturnType<typeof render> {
  return render(
    <ToastProvider>
      <ProjectProvider>{ui}</ProjectProvider>
    </ToastProvider>,
  )
}

const defaultGeneration = {
  isGenerating: false,
  streamingSt: '',
  streamingIl: '',
  generationError: null,
  startGeneration: vi.fn(),
  clearGeneration: vi.fn(),
}

describe('Graceful degradation when offline', () => {
  beforeEach(() => {
    useGenerationMock.mockReturnValue(defaultGeneration)
  })

  afterEach(() => {
    useOnlineStatusMock.mockReset()
    useGenerationMock.mockReset()
  })

  describe('CodeGenerationPanel', () => {
    it('keeps Generate button disabled-because-no-project but online (control)', () => {
      useOnlineStatusMock.mockReturnValue({ isOnline: true })
      renderWithProvider(<CodeGenerationPanel />)

      // No project → button is disabled regardless of online status, but
      // the offline notice must not appear.
      expect(screen.getByTestId('generate-button')).toBeDisabled()
      expect(
        screen.queryByTestId('generation-offline-notice'),
      ).not.toBeInTheDocument()
    })

    it('shows the offline notice and disables Generate when offline', () => {
      useOnlineStatusMock.mockReturnValue({ isOnline: false })
      renderWithProvider(<CodeGenerationPanel />)

      expect(screen.getByTestId('generate-button')).toBeDisabled()
      expect(screen.getByTestId('generation-offline-notice')).toBeInTheDocument()
      expect(screen.getByTestId('generation-offline-notice')).toHaveTextContent(
        /offline/i,
      )
    })
  })

  describe('ChatPanel', () => {
    it('keeps the Send button enabled-disabled by content while online (control)', () => {
      useOnlineStatusMock.mockReturnValue({ isOnline: true })
      renderWithProvider(<ChatPanel />)

      // Empty input → still disabled, but for content reasons, not offline.
      expect(screen.getByTestId('chat-send-button')).toBeDisabled()
      expect(screen.queryByTestId('chat-offline-notice')).not.toBeInTheDocument()
      expect(screen.getByTestId('chat-input')).not.toBeDisabled()
    })

    it('disables the Send button and shows offline notice when offline', () => {
      useOnlineStatusMock.mockReturnValue({ isOnline: false })
      renderWithProvider(<ChatPanel />)

      const sendBtn = screen.getByTestId('chat-send-button')
      expect(sendBtn).toBeDisabled()
      expect(screen.getByTestId('chat-input')).toBeDisabled()
      expect(screen.getByTestId('chat-offline-notice')).toBeInTheDocument()
      expect(screen.getByTestId('chat-offline-notice')).toHaveTextContent(
        /requires internet/i,
      )
    })
  })

  describe('AIReviewPanel', () => {
    it('does not show offline notice while online (control)', () => {
      useOnlineStatusMock.mockReturnValue({ isOnline: true })
      renderWithProvider(<AIReviewPanel />)

      // No project → Run Review is still disabled, but for content reasons.
      expect(screen.getByTestId('ai-review-run')).toBeDisabled()
      expect(
        screen.queryByTestId('ai-review-offline-notice'),
      ).not.toBeInTheDocument()
    })

    it('disables Run Review and shows offline notice when offline', () => {
      useOnlineStatusMock.mockReturnValue({ isOnline: false })
      renderWithProvider(<AIReviewPanel />)

      expect(screen.getByTestId('ai-review-run')).toBeDisabled()
      expect(screen.getByTestId('ai-review-offline-notice')).toBeInTheDocument()
      expect(screen.getByTestId('ai-review-offline-notice')).toHaveTextContent(
        /requires internet/i,
      )
    })
  })
})
