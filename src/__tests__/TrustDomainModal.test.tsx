import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrustDomainModal } from '@/components/TrustDomainModal'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

function setupInvokeMock(): void {
  invokeMock.mockReset()
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'trusted_domains_add') return Promise.resolve(undefined)
    return Promise.resolve(null)
  })
}

describe('TrustDomainModal', () => {
  beforeEach(() => {
    setupInvokeMock()
  })

  it('renders the target domain in the warning copy', () => {
    render(
      <TrustDomainModal
        open
        domain="openrouter.ai"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByTestId('trust-domain-target').textContent).toBe('openrouter.ai')
  })

  it('invokes trusted_domains_add and onConfirm when the user confirms', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TrustDomainModal
        open
        domain="openrouter.ai"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByTestId('trust-domain-confirm'))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('trusted_domains_add', {
        domain: 'openrouter.ai',
      })
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel and does not add the domain when the user cancels', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TrustDomainModal
        open
        domain="openrouter.ai"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByTestId('trust-domain-cancel'))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(invokeMock).not.toHaveBeenCalledWith(
      'trusted_domains_add',
      expect.anything(),
    )
  })

  it('surfaces the error from trusted_domains_add without calling onConfirm', async () => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'trusted_domains_add') {
        return Promise.reject(new Error('disk full'))
      }
      return Promise.resolve(null)
    })
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TrustDomainModal
        open
        domain="openrouter.ai"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByTestId('trust-domain-confirm'))

    await waitFor(() => {
      expect(screen.getByTestId('trust-domain-error')).toHaveTextContent('disk full')
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables both buttons while the add request is in flight', async () => {
    let resolveAdd: ((value: unknown) => void) | null = null
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'trusted_domains_add') {
        return new Promise<unknown>((resolve) => {
          resolveAdd = resolve
        })
      }
      return Promise.resolve(null)
    })
    const user = userEvent.setup()
    render(
      <TrustDomainModal
        open
        domain="openrouter.ai"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    const confirm = screen.getByTestId('trust-domain-confirm')
    const cancel = screen.getByTestId('trust-domain-cancel')
    await user.click(confirm)

    expect(confirm).toBeDisabled()
    expect(cancel).toBeDisabled()

    await act(async () => {
      if (resolveAdd) resolveAdd(undefined)
    })
  })
})
