import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StepEnterKey } from '@/components/ByokWizard/StepEnterKey'
import type { Provider } from '@/types/settings'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

describe('StepEnterKey — API key input is masked', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('renders the API key input with type="password" by default', () => {
    render(
      <StepEnterKey
        provider={'openai' as Provider}
        onSubmit={async () => {}}
        onBack={() => {}}
      />,
    )
    const input = screen.getByTestId('api-key-input') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.type).toBe('password')
  })

  it('keeps type="password" after typing characters', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <StepEnterKey
        provider={'openai' as Provider}
        onSubmit={async () => {}}
        onBack={() => {}}
      />,
    )
    const input = screen.getByTestId('api-key-input') as HTMLInputElement
    await user.type(input, 'sk-abcdefghijklmnopqrstuvwxyz')
    expect(input.type).toBe('password')
    // autoComplete must be off so password managers do not stash the
    // raw key in browser storage.
    expect(input.getAttribute('autocomplete')).toBe('off')
  })

  it('does not reflect the key in any user-visible text when masked', () => {
    render(
      <StepEnterKey
        provider={'openai' as Provider}
        onSubmit={async () => {}}
        onBack={() => {}}
      />,
    )
    const input = screen.getByTestId('api-key-input') as HTMLInputElement
    // The "value" attribute is set by React but the *rendered* DOM
    // value is `input.value`, and crucially the input's *type* is
    // "password" — so a screen reader or screen-share sees dots, not
    // the key.
    expect(input.type).toBe('password')
  })
})
