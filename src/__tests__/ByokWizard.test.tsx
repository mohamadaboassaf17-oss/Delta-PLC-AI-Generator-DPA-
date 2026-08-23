import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ByokWizard } from '@/components/ByokWizard'
import type { SecretTestResult } from '@/types/settings'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

const testResult: SecretTestResult = {
  ok: true,
  message: 'Connected',
  latency_ms: 100,
  model_count: 5,
}

function setupInvokeMock(): void {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'secret_set') return Promise.resolve(undefined)
    if (cmd === 'secret_test') return Promise.resolve(testResult)
    return Promise.resolve(null)
  })
}

describe('ByokWizard', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    window.localStorage.removeItem('dpa.byok.progress.v1')
    window.localStorage.removeItem('dpa.onboarded')
  })

  it('shows Step 1 provider selection on open', async () => {
    setupInvokeMock()
    render(<ByokWizard open onComplete={vi.fn()} onSkip={vi.fn()} />)
    expect(await screen.findByTestId('byok-step-1')).toBeInTheDocument()
    expect(screen.getByTestId('provider-openai')).toBeInTheDocument()
    expect(screen.getByTestId('provider-anthropic')).toBeInTheDocument()
  })

  it('advances from Step 1 to Step 2 when a provider is selected and continued', async () => {
    setupInvokeMock()
    const user = userEvent.setup()
    render(<ByokWizard open onComplete={vi.fn()} onSkip={vi.fn()} />)
    await user.click(await screen.findByTestId('provider-openai'))
    await user.click(screen.getByTestId('byok-continue-1'))
    expect(await screen.findByTestId('byok-step-2')).toBeInTheDocument()
  })

  it('advances from Step 2 to Step 3 on continue', async () => {
    setupInvokeMock()
    const user = userEvent.setup()
    render(<ByokWizard open onComplete={vi.fn()} onSkip={vi.fn()} />)
    await user.click(await screen.findByTestId('provider-openai'))
    await user.click(screen.getByTestId('byok-continue-1'))
    await user.click(await screen.findByTestId('byok-continue-2'))
    expect(await screen.findByTestId('byok-step-3')).toBeInTheDocument()
  })

  it('submits the key, runs secret_set + secret_test, and reaches success', async () => {
    setupInvokeMock()
    const user = userEvent.setup()
    render(<ByokWizard open onComplete={vi.fn()} onSkip={vi.fn()} />)
    await user.click(await screen.findByTestId('provider-openai'))
    await user.click(screen.getByTestId('byok-continue-1'))
    await user.click(await screen.findByTestId('byok-continue-2'))
    const validKey = 'sk-' + 'a'.repeat(25)
    await user.type(screen.getByTestId('api-key-input'), validKey)
    await user.click(screen.getByTestId('api-key-submit'))
    expect(await screen.findByTestId('byok-success')).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledWith('secret_set', {
      provider: 'openai',
      key: validKey,
    })
    expect(invokeMock).toHaveBeenCalledWith('secret_test', {
      provider: 'openai',
      key: validKey,
    })
  })

  it('marks the user as onboarded when done is clicked after success', async () => {
    setupInvokeMock()
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<ByokWizard open onComplete={onComplete} onSkip={vi.fn()} />)
    await user.click(await screen.findByTestId('provider-openai'))
    await user.click(screen.getByTestId('byok-continue-1'))
    await user.click(await screen.findByTestId('byok-continue-2'))
    await user.type(screen.getByTestId('api-key-input'), 'sk-' + 'a'.repeat(25))
    await user.click(screen.getByTestId('api-key-submit'))
    await user.click(await screen.findByTestId('byok-done'))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(window.localStorage.getItem('dpa.onboarded')).toBe('1')
  })

  it('calls onSkip when skip is clicked from Step 1', async () => {
    setupInvokeMock()
    const onSkip = vi.fn()
    const user = userEvent.setup()
    render(<ByokWizard open onComplete={vi.fn()} onSkip={onSkip} />)
    await user.click(await screen.findByTestId('byok-skip'))
    await waitFor(() => expect(onSkip).toHaveBeenCalled())
    expect(window.localStorage.getItem('dpa.onboarded')).toBe('1')
  })
})
