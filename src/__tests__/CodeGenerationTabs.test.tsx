import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { ToastProvider } from '@/components/Toast'

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

// Mock the three heavy child components with simple stubs so the tab tests
// are isolated from their internal rendering (ReactFlow, syntax highlighter,
// clipboard, etc.).
vi.mock('@/components/STOutputPanel', () => ({
  STOutputPanel: (): ReactElement => (
    <div data-testid="st-mock">ST Output Mock</div>
  ),
}))

vi.mock('@/components/LadderOutputPanel', () => ({
  LadderOutputPanel: ({
    fullscreen = false,
  }: {
    fullscreen?: boolean
  }): ReactElement => (
    <div
      data-testid={
        fullscreen ? 'ladder-mock-fullscreen' : 'ladder-mock-inline'
      }
    >
      Ladder Output Mock{fullscreen ? ' (fullscreen)' : ''}
    </div>
  ),
}))

vi.mock('@/components/ILOutputPanel', () => ({
  ILOoutputPanel: (): ReactElement => (
    <div data-testid="il-mock">IL Output Mock</div>
  ),
}))

vi.mock('@/components/ConflictBanner', () => ({
  ConflictBanner: (): ReactElement => (
    <div data-testid="conflict-banner-mock" />
  ),
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

const defaultConflicts = {
  report: null,
  isScanning: false,
  error: null,
  scan: vi.fn(),
  clear: vi.fn(),
}

function renderPanel(): ReturnType<typeof render> {
  return render(
    <ToastProvider>
      <ProjectProvider>
        <CodeGenerationPanel />
      </ProjectProvider>
    </ToastProvider>,
  )
}

describe('CodeGenerationPanel — Tabs + Maximize modal (M10.2.1)', () => {
  beforeEach(() => {
    useGenerationMock.mockReturnValue(defaultGeneration)
    useOnlineStatusMock.mockReturnValue({ isOnline: true })
    useCodeConflictsMock.mockReturnValue(defaultConflicts)
  })

  afterEach(() => {
    useGenerationMock.mockReset()
    useOnlineStatusMock.mockReset()
    useCodeConflictsMock.mockReset()
    // Make sure no test leaks the body scroll lock to the next one.
    document.body.style.overflow = ''
  })

  describe('Tab bar', () => {
    it('renders three tabs with role="tab"', () => {
      renderPanel()

      expect(screen.getByTestId('tab-st')).toHaveAttribute('role', 'tab')
      expect(screen.getByTestId('tab-ld')).toHaveAttribute('role', 'tab')
      expect(screen.getByTestId('tab-il')).toHaveAttribute('role', 'tab')
    })

    it('wraps the tabs in a role="tablist"', () => {
      renderPanel()

      const list = screen.getByRole('tablist')
      expect(list).toBeInTheDocument()
      expect(list).toHaveAttribute('aria-label', 'Generated code views')
    })

    it('starts with the Structured Text tab active', () => {
      renderPanel()

      expect(screen.getByTestId('tab-st')).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(screen.getByTestId('tab-ld')).toHaveAttribute(
        'aria-selected',
        'false',
      )
      expect(screen.getByTestId('tab-il')).toHaveAttribute(
        'aria-selected',
        'false',
      )
    })

    it('shows only the ST panel content by default (others hidden)', () => {
      renderPanel()

      const stPanel = screen.getByTestId('tabpanel-st')
      const ldPanel = screen.getByTestId('tabpanel-ld')
      const ilPanel = screen.getByTestId('tabpanel-il')

      expect(stPanel.hidden).toBe(false)
      expect(ldPanel.hidden).toBe(true)
      expect(ilPanel.hidden).toBe(true)
    })

    it('switches to the Ladder Diagram tab when clicked', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-ld'))

      expect(screen.getByTestId('tab-ld')).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(screen.getByTestId('tab-st')).toHaveAttribute(
        'aria-selected',
        'false',
      )
      expect(screen.getByTestId('tabpanel-ld').hidden).toBe(false)
      expect(screen.getByTestId('tabpanel-st').hidden).toBe(true)
    })

    it('switches to the Instruction List tab when clicked', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-il'))

      expect(screen.getByTestId('tab-il')).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(screen.getByTestId('tabpanel-il').hidden).toBe(false)
      expect(screen.getByTestId('tabpanel-st').hidden).toBe(true)
      expect(screen.getByTestId('tabpanel-ld').hidden).toBe(true)
    })

    it('keeps every panel mounted across tab switches (no remount)', async () => {
      const user = userEvent.setup()
      renderPanel()

      // All three panel containers exist regardless of which tab is active.
      expect(screen.getByTestId('tabpanel-st')).toBeInTheDocument()
      expect(screen.getByTestId('tabpanel-ld')).toBeInTheDocument()
      expect(screen.getByTestId('tabpanel-il')).toBeInTheDocument()

      await user.click(screen.getByTestId('tab-ld'))

      expect(screen.getByTestId('tabpanel-st')).toBeInTheDocument()
      expect(screen.getByTestId('tabpanel-ld')).toBeInTheDocument()
      expect(screen.getByTestId('tabpanel-il')).toBeInTheDocument()
    })
  })

  describe('Maximize button', () => {
    it('is hidden by default (ST tab active)', () => {
      renderPanel()

      expect(
        screen.queryByTestId('maximize-ld-button'),
      ).not.toBeInTheDocument()
    })

    it('is hidden when the IL tab is active', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-il'))

      expect(
        screen.queryByTestId('maximize-ld-button'),
      ).not.toBeInTheDocument()
    })

    it('appears only when the LD tab is active', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-ld'))

      const btn = screen.getByTestId('maximize-ld-button')
      expect(btn).toBeInTheDocument()
      expect(btn).toHaveAttribute('aria-label', 'Maximize Ladder Diagram')
    })
  })

  describe('Maximize modal', () => {
    it('is not in the DOM on initial render', () => {
      renderPanel()

      expect(
        screen.queryByTestId('ld-maximized-modal'),
      ).not.toBeInTheDocument()
    })

    it('opens when the Maximize button is clicked and contains a fullscreen LadderDiagram', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-ld'))
      await user.click(screen.getByTestId('maximize-ld-button'))

      const modal = screen.getByTestId('ld-maximized-modal')
      expect(modal).toBeInTheDocument()
      expect(modal).toHaveAttribute('role', 'dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')

      // The fullscreen LadderOutputPanel is rendered inside the modal —
      // a second LD instance distinct from the tab-panel one.
      expect(screen.getByTestId('ladder-mock-fullscreen')).toBeInTheDocument()
    })

    it('closes when the Close button is clicked', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-ld'))
      await user.click(screen.getByTestId('maximize-ld-button'))
      expect(screen.getByTestId('ld-maximized-modal')).toBeInTheDocument()

      await user.click(screen.getByTestId('ld-modal-close'))

      expect(
        screen.queryByTestId('ld-maximized-modal'),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('ladder-mock-fullscreen'),
      ).not.toBeInTheDocument()
    })

    it('closes when the Escape key is pressed', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-ld'))
      await user.click(screen.getByTestId('maximize-ld-button'))
      expect(screen.getByTestId('ld-maximized-modal')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(
        screen.queryByTestId('ld-maximized-modal'),
      ).not.toBeInTheDocument()
    })

    it('does NOT close when an unrelated key is pressed', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-ld'))
      await user.click(screen.getByTestId('maximize-ld-button'))

      fireEvent.keyDown(window, { key: 'a' })
      fireEvent.keyDown(window, { key: 'Enter' })

      expect(screen.getByTestId('ld-maximized-modal')).toBeInTheDocument()
    })

    it('locks body scroll while open and restores it on close', async () => {
      const user = userEvent.setup()
      renderPanel()

      expect(document.body.style.overflow).toBe('')

      await user.click(screen.getByTestId('tab-ld'))
      await user.click(screen.getByTestId('maximize-ld-button'))
      expect(document.body.style.overflow).toBe('hidden')

      await user.click(screen.getByTestId('ld-modal-close'))
      expect(document.body.style.overflow).toBe('')
    })

    it('moves keyboard focus to the Close button when opened', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-ld'))
      await user.click(screen.getByTestId('maximize-ld-button'))

      expect(screen.getByTestId('ld-modal-close')).toHaveFocus()
    })

    it('removes the Escape listener after closing (no leak)', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByTestId('tab-ld'))
      await user.click(screen.getByTestId('maximize-ld-button'))
      await user.click(screen.getByTestId('ld-modal-close'))

      // After close, pressing Escape must NOT reopen or cause errors —
      // confirms the keydown handler was unbound.
      fireEvent.keyDown(window, { key: 'Escape' })

      expect(
        screen.queryByTestId('ld-maximized-modal'),
      ).not.toBeInTheDocument()
    })
  })
})
