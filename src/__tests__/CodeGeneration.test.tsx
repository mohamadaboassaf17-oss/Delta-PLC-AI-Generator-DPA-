import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { DescriptionInput } from '@/components/DescriptionInput'
import { STOutputPanel, highlightST } from '@/components/STOutputPanel'
import { ILOoutputPanel } from '@/components/ILOutputPanel'
import { LadderOutputPanel } from '@/components/LadderOutputPanel'
import { ToastProvider } from '@/components/Toast'
import { SAMPLE_LADDER_GRAPH } from '@/types/ladder'

const { invokeMock, useGenerationMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  useGenerationMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

vi.mock('@/hooks/useGeneration', () => ({
  useGeneration: () => useGenerationMock(),
}))

import CodeGenerationPanel from '@/components/CodeGenerationPanel'

const defaultGenerationResult = {
  isGenerating: false,
  streamingSt: '',
  streamingIl: '',
  generationError: null,
  startGeneration: vi.fn(),
  clearGeneration: vi.fn(),
}

function setupInvoke() {
  invokeMock.mockResolvedValue(null)
}

function renderWithProvider(ui: ReactElement) {
  return render(
    <ToastProvider>
      <ProjectProvider>{ui}</ProjectProvider>
    </ToastProvider>,
  )
}

describe('DescriptionInput', () => {
  it('renders textarea and generate button', () => {
    render(
      <ToastProvider>
        <DescriptionInput onGenerate={vi.fn()} isGenerating={false} />
      </ToastProvider>,
    )

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByTestId('generate-button')).toBeInTheDocument()
  })

  it('shows "Generate Code" button text when idle', () => {
    render(
      <ToastProvider>
        <DescriptionInput onGenerate={vi.fn()} isGenerating={false} />
      </ToastProvider>,
    )

    expect(screen.getByTestId('generate-button')).toHaveTextContent(
      'Generate Code',
    )
    expect(screen.queryByText('Generating...')).not.toBeInTheDocument()
  })

  it('shows spinner and "Generating..." when active', () => {
    render(
      <ToastProvider>
        <DescriptionInput onGenerate={vi.fn()} isGenerating={true} />
      </ToastProvider>,
    )

    expect(screen.getByTestId('generate-button')).toHaveTextContent(
      'Generating...',
    )
    expect(screen.queryByText('Generate Code')).not.toBeInTheDocument()
  })

  it('calls onGenerate with description on submit', async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()

    render(
      <ToastProvider>
        <DescriptionInput onGenerate={onGenerate} isGenerating={false} />
      </ToastProvider>,
    )

    await user.type(screen.getByRole('textbox'), 'Start motor when X0 is on')
    await user.click(screen.getByTestId('generate-button'))

    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate).toHaveBeenCalledWith('Start motor when X0 is on')
  })

  it('does not call onGenerate when textarea is empty', async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()

    render(
      <ToastProvider>
        <DescriptionInput onGenerate={onGenerate} isGenerating={false} />
      </ToastProvider>,
    )

    await user.click(screen.getByTestId('generate-button'))

    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('disables button when disabled prop is true', () => {
    render(
      <ToastProvider>
        <DescriptionInput
          onGenerate={vi.fn()}
          isGenerating={false}
          disabled={true}
        />
      </ToastProvider>,
    )

    expect(screen.getByTestId('generate-button')).toBeDisabled()
  })

  it('disables button when isGenerating is true', () => {
    render(
      <ToastProvider>
        <DescriptionInput onGenerate={vi.fn()} isGenerating={true} />
      </ToastProvider>,
    )

    expect(screen.getByTestId('generate-button')).toBeDisabled()
  })
})

describe('STOutputPanel', () => {
  it('shows empty state when no code', () => {
    render(<STOutputPanel code="" />)

    expect(
      screen.getByText('Generated ST code will appear here'),
    ).toBeInTheDocument()
  })

  it('renders code content in the DOM when code is provided', () => {
    render(<STOutputPanel code="IF X0 THEN" />)

    const pre = document.querySelector('pre')
    expect(pre).toBeInTheDocument()
    expect(pre!.textContent).toContain('IF')
    expect(pre!.textContent).toContain('THEN')
    expect(pre!.textContent).toContain('X0')
  })

  it('shows streaming indicator when isStreaming is true', () => {
    render(<STOutputPanel code="LD X0" isStreaming={true} />)

    expect(screen.getByText('Streaming')).toBeInTheDocument()
  })

  it('does not show streaming indicator when isStreaming is false', () => {
    render(<STOutputPanel code="LD X0" isStreaming={false} />)

    expect(screen.queryByText('Streaming')).not.toBeInTheDocument()
  })

  it('renders an h3 heading "Structured Text (ST)"', () => {
    render(<STOutputPanel code="" />)

    expect(screen.getByText('Structured Text (ST)')).toBeInTheDocument()
  })
})

describe('highlightST', () => {
  it('returns a string without throwing', () => {
    const result = highlightST('IF THEN ELSE')
    expect(typeof result).toBe('string')
  })

  it('preserves original code text in the output', () => {
    const result = highlightST('IF THEN ELSE')
    expect(result).toContain('IF')
    expect(result).toContain('THEN')
    expect(result).toContain('ELSE')
  })

  it('escapes HTML special characters in code', () => {
    const result = highlightST('a < b')
    expect(result).toContain('&lt')
    expect(result).not.toContain('< b')
  })

  it('wraps strings in colored spans', () => {
    const result = highlightST("'hello'")
    expect(result).toContain('orange')
    expect(result).toContain("'hello'")
  })

  it('wraps operators in gray spans', () => {
    const result = highlightST(':=')
    expect(result).toContain('text-gray-400')
  })
})

describe('ILOoutputPanel', () => {
  it('shows empty state when no code', () => {
    render(<ILOoutputPanel code="" />)

    expect(
      screen.getByText('Generated IL code will appear here'),
    ).toBeInTheDocument()
  })

  it('renders IL code content in pre element', () => {
    render(<ILOoutputPanel code="LD X0\nOUT Y0" />)

    const pre = document.querySelector('pre')
    expect(pre).toBeInTheDocument()
    expect(pre?.textContent).toContain('LD X0')
    expect(pre?.textContent).toContain('OUT Y0')
  })

  it('copy button has correct data-testid', () => {
    render(<ILOoutputPanel code="LD X0" />)

    expect(screen.getByTestId('copy-il-button')).toBeInTheDocument()
  })

  it('copy button is disabled when no code', () => {
    render(<ILOoutputPanel code="" />)

    expect(screen.getByTestId('copy-il-button')).toBeDisabled()
  })

  it('shows "Copied!" when copy succeeds via clipboard API', async () => {
    const user = userEvent.setup()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    render(<ILOoutputPanel code="LD X0" />)

    await user.click(screen.getByTestId('copy-il-button'))

    expect(screen.getByText('Copied!')).toBeInTheDocument()
  })

  it('falls back to execCommand when clipboard API fails', async () => {
    const user = userEvent.setup()

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
      writable: true,
      configurable: true,
    })

    document.execCommand = vi.fn().mockReturnValue(true)

    render(<ILOoutputPanel code="LD X0" />)

    await user.click(screen.getByTestId('copy-il-button'))

    expect(screen.getByText('Copied!')).toBeInTheDocument()
  })
})

describe('CodeGenerationPanel', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    useGenerationMock.mockReturnValue(defaultGenerationResult)
    setupInvoke()
  })

  it('renders DescriptionInput inside panel', () => {
    renderWithProvider(<CodeGenerationPanel />)

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByTestId('generate-button')).toBeInTheDocument()
  })

  it('shows ST and IL panel headers', () => {
    renderWithProvider(<CodeGenerationPanel />)

    expect(screen.getByText('Structured Text (ST)')).toBeInTheDocument()
    expect(screen.getByText('Ladder Diagram (LD)')).toBeInTheDocument()
    expect(screen.getAllByText('Instruction List (IL)').length).toBeGreaterThan(0)
  })

  it('shows error banner when generationError is set', () => {
    useGenerationMock.mockReturnValue({
      ...defaultGenerationResult,
      generationError: 'API key is invalid',
    })

    renderWithProvider(<CodeGenerationPanel />)

    const banner = screen.getByTestId('generation-error-banner')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveTextContent('API key is invalid')
  })

  it('does not show error banner when generationError is null', () => {
    renderWithProvider(<CodeGenerationPanel />)

    expect(
      screen.queryByTestId('generation-error-banner'),
    ).not.toBeInTheDocument()
  })

  it('disables generate button when no project is loaded', () => {
    renderWithProvider(<CodeGenerationPanel />)

    expect(screen.getByTestId('generate-button')).toBeDisabled()
  })
})

describe('LadderOutputPanel', () => {
  it('renders empty state when graph is null', () => {
    render(<LadderOutputPanel graph={null} />)

    expect(screen.getByTestId('ladder-empty')).toBeInTheDocument()
  })

  it('renders empty state when graph.nodes is empty', () => {
    render(<LadderOutputPanel graph={{ nodes: [], edges: [] }} />)

    expect(screen.getByTestId('ladder-empty')).toBeInTheDocument()
  })

  it('does not crash when graph is undefined', () => {
    render(<LadderOutputPanel graph={undefined} />)

    expect(screen.getByTestId('ladder-empty')).toBeInTheDocument()
  })

  it('renders nodes from the sample ladder graph', () => {
    render(<LadderOutputPanel graph={SAMPLE_LADDER_GRAPH} />)

    expect(screen.getByTestId('ladder-panel')).toBeInTheDocument()
    expect(screen.getByTestId('ladder-node-contact_no')).toBeInTheDocument()
    expect(screen.getByTestId('ladder-node-coil_out')).toBeInTheDocument()
  })
})
