import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectProvider } from '@/context/ProjectContext'
import { ToastProvider } from '@/components/Toast'
import type { ConflictReport } from '@/lib/tauriApi'

// Hoisted mocks — created before any imports below so the `vi.mock()`
// factories can reference them.
const { useGenerationMock, useOnlineStatusMock, useCodeConflictsMock } =
  vi.hoisted(() => ({
    useGenerationMock: vi.fn(),
    useOnlineStatusMock: vi.fn(),
    useCodeConflictsMock: vi.fn(),
  }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock('@/hooks/useGeneration', () => ({
  useGeneration: () => useGenerationMock(),
}))

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}))

vi.mock('@/hooks/useCodeConflicts', () => ({
  useCodeConflicts: () => useCodeConflictsMock(),
}))

import CodeGenerationPanel from '@/components/CodeGenerationPanel'

const defaultGeneration = {
  isGenerating: false,
  streamingSt: '',
  streamingIl: '',
  generationError: null,
  startGeneration: vi.fn(),
  clearGeneration: vi.fn(),
}

const emptyConflicts = {
  report: null as ConflictReport | null,
  isScanning: false,
  error: null as string | null,
  scan: vi.fn(),
  clear: vi.fn(),
}

function reportWithConflicts(
  count: number,
  options: { shouldHalt?: boolean; withLines?: boolean } = {},
): ConflictReport {
  const shouldHalt = options.shouldHalt ?? false
  const conflicts = Array.from({ length: count }, (_, i) => ({
    address: `Y${100 + i}`,
    normalized: `Y${100 + i}`,
    kind: 'undefined' as const,
    message: `Y${100 + i} is undefined`,
    ...(options.withLines ? { line: i + 1 } : {}),
  }))
  return {
    conflicts,
    totalAddresses: count,
    conflictingAddresses: count,
    shouldHalt,
  }
}

function renderPanel(props: { onOpenChat?: () => void } = {}): ReturnType<typeof render> {
  return render(
    <ToastProvider>
      <ProjectProvider>
        <CodeGenerationPanel onOpenChat={props.onOpenChat} />
      </ProjectProvider>
    </ToastProvider>,
  )
}

describe('M10.2.2 — Conflict Resolution UX (no auto-open)', () => {
  beforeEach(() => {
    useGenerationMock.mockReturnValue(defaultGeneration)
    useOnlineStatusMock.mockReturnValue({ isOnline: true })
    useCodeConflictsMock.mockReturnValue(emptyConflicts)
  })

  afterEach(() => {
    useGenerationMock.mockReset()
    useOnlineStatusMock.mockReset()
    useCodeConflictsMock.mockReset()
  })

  describe('Banner rendering', () => {
    it('does NOT render the conflict banner when conflictCount === 0', () => {
      renderPanel()
      expect(screen.queryByTestId('conflict-banner')).toBeNull()
    })

    it('renders the banner with the Arabic count text when conflictCount === 3', () => {
      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: reportWithConflicts(3, { shouldHalt: false }),
      })
      renderPanel()
      const banner = screen.getByTestId('conflict-banner')
      expect(banner).toBeInTheDocument()
      const countEl = screen.getByTestId('conflict-banner-count')
      expect(countEl.textContent).toContain('3')
      expect(countEl.textContent).toContain('تعارضات')
      expect(countEl.textContent).toContain('العناوين')
    })

    it('renders the Show Details button (عرض التفاصيل) when conflicts exist', () => {
      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: reportWithConflicts(3, { shouldHalt: false }),
      })
      renderPanel()
      const btn = screen.getByTestId('conflict-banner-show-details')
      expect(btn).toBeInTheDocument()
      expect(btn.textContent).toContain('عرض التفاصيل')
    })

    it('keeps rendering the code area (no halt overlay) when shouldHalt is true', () => {
      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: reportWithConflicts(5, { shouldHalt: true }),
      })
      renderPanel()
      // The code tabs container is still present
      expect(screen.getByTestId('code-tabs-container')).toBeInTheDocument()
      // The legacy halt overlay is gone
      expect(screen.queryByTestId('halt-overlay')).toBeNull()
    })
  })

  describe('No auto-open of Chat Panel', () => {
    it('does NOT call onOpenChat when conflicts first appear (0 → 3)', () => {
      const onOpenChat = vi.fn()
      // First render with no conflicts
      useCodeConflictsMock.mockReturnValue(emptyConflicts)
      const { rerender } = renderPanel({ onOpenChat })
      expect(onOpenChat).not.toHaveBeenCalled()

      // Now flip to 3 conflicts
      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: reportWithConflicts(3, { shouldHalt: false }),
      })
      rerender(
        <ToastProvider>
          <ProjectProvider>
            <CodeGenerationPanel onOpenChat={onOpenChat} />
          </ProjectProvider>
        </ToastProvider>,
      )

      // The chat panel is NOT opened automatically
      expect(onOpenChat).not.toHaveBeenCalled()
    })

    it('does NOT call onOpenChat when shouldHalt flips true', () => {
      const onOpenChat = vi.fn()
      useCodeConflictsMock.mockReturnValue(emptyConflicts)
      const { rerender } = renderPanel({ onOpenChat })
      expect(onOpenChat).not.toHaveBeenCalled()

      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: reportWithConflicts(5, { shouldHalt: true }),
      })
      rerender(
        <ToastProvider>
          <ProjectProvider>
            <CodeGenerationPanel onOpenChat={onOpenChat} />
          </ProjectProvider>
        </ToastProvider>,
      )

      // Even with shouldHalt, the chat must NOT auto-open
      expect(onOpenChat).not.toHaveBeenCalled()
    })

    it('calls onOpenChat when the user clicks the Show Details button', async () => {
      const onOpenChat = vi.fn()
      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: reportWithConflicts(3, { shouldHalt: false }),
      })
      const user = userEvent.setup()
      renderPanel({ onOpenChat })

      const btn = screen.getByTestId('conflict-banner-show-details')
      await user.click(btn)
      expect(onOpenChat).toHaveBeenCalledTimes(1)
    })

    it('calls onOpenChat when the user clicks Show Details on a halt banner', async () => {
      const onOpenChat = vi.fn()
      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: reportWithConflicts(5, { shouldHalt: true }),
      })
      const user = userEvent.setup()
      renderPanel({ onOpenChat })

      const btn = screen.getByTestId('conflict-banner-show-details')
      await user.click(btn)
      expect(onOpenChat).toHaveBeenCalledTimes(1)
    })
  })

  describe('ST panel line highlighting', () => {
    it('marks conflicting lines with data-conflict="true" and non-conflicting lines without it', () => {
      const conflicts = reportWithConflicts(0, { withLines: false })
      conflicts.conflicts = [
        {
          address: 'Y5',
          normalized: 'Y5',
          kind: 'undefined' as const,
          message: 'Y5 is undefined',
          line: 2,
        },
        {
          address: 'Y6',
          normalized: 'Y6',
          kind: 'undefined' as const,
          message: 'Y6 is undefined',
          line: 4,
        },
      ]
      conflicts.totalAddresses = 4
      conflicts.conflictingAddresses = 2
      useGenerationMock.mockReturnValue({
        ...defaultGeneration,
        streamingSt: 'X0 := 1;\nY5 := 1;\nZ0 := 0;\nY6 := 1;',
      })
      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: conflicts,
      })

      const { container } = renderPanel()

      const line1 = container.querySelector('[data-line-number="1"]')
      const line2 = container.querySelector('[data-line-number="2"]')
      const line3 = container.querySelector('[data-line-number="3"]')
      const line4 = container.querySelector('[data-line-number="4"]')

      expect(line1).not.toBeNull()
      expect(line2).not.toBeNull()
      expect(line3).not.toBeNull()
      expect(line4).not.toBeNull()

      // Lines NOT in conflict
      expect(line1!.getAttribute('data-conflict')).toBeNull()
      expect(line3!.getAttribute('data-conflict')).toBeNull()

      // Lines in conflict
      expect(line2!.getAttribute('data-conflict')).toBe('true')
      expect(line4!.getAttribute('data-conflict')).toBe('true')
    })

    it('does not mark any line as conflict when the report has no line numbers', () => {
      useGenerationMock.mockReturnValue({
        ...defaultGeneration,
        streamingSt: 'Y5 := 1;\nY6 := 1;',
      })
      useCodeConflictsMock.mockReturnValue({
        ...emptyConflicts,
        report: reportWithConflicts(2, { withLines: false }),
      })

      const { container } = renderPanel()
      const lines = container.querySelectorAll('[data-line-number]')
      for (const line of Array.from(lines)) {
        expect(line.getAttribute('data-conflict')).toBeNull()
      }
    })
  })
})
