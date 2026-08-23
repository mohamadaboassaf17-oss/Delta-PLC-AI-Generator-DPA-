import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPanel } from '@/components/SettingsPanel'
import { DescriptionInput } from '@/components/DescriptionInput'
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings'
import { ToastProvider } from '@/components/Toast'
import {
  TEMPERATURE_MAX,
  getTemperatureWarning,
} from '@/lib/validators/temperature'

// Mocks are hoisted by Vitest, so they apply to every test in this file.
const { invokeMock, useSettingsMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  useSettingsMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: useSettingsMock,
}))

function setupInvokeMock(settings: Settings = DEFAULT_SETTINGS): void {
  invokeMock.mockReset()
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'settings_get') return Promise.resolve(settings)
    if (cmd === 'settings_set') return Promise.resolve(undefined)
    if (cmd === 'secret_get') return Promise.resolve('sk-test-key-1234567890')
    if (cmd === 'generate_code') return Promise.resolve(undefined)
    return Promise.resolve(null)
  })
}

function setupSettingsMock(settings: Settings = DEFAULT_SETTINGS): void {
  useSettingsMock.mockReset()
  useSettingsMock.mockReturnValue({
    settings,
    loading: false,
    error: null,
    setSettings: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  })
}

async function openDialog(): Promise<void> {
  await waitFor(() => {
    const dialog = screen.queryByTestId('settings-dialog') as HTMLDialogElement | null
    if (dialog === null) throw new Error('settings dialog not yet rendered')
    if (!dialog.hasAttribute('open')) throw new Error('settings dialog not yet open')
  })
}

describe('SettingsPanel — default model on provider change (M10.1.4)', () => {
  beforeEach(() => {
    setupInvokeMock()
    setupSettingsMock()
  })

  it('selects OpenAI by default and shows the OpenAI default model', async () => {
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()
    const modelInput = screen.getByDisplayValue(DEFAULT_SETTINGS.generation.model)
    expect(modelInput).toBeInTheDocument()
    expect(modelInput).toHaveValue('gpt-4o')
  })

  it('sets the model to gpt-4o when the user picks OpenAI', async () => {
    setupSettingsMock({
      ...DEFAULT_SETTINGS,
      active_provider: 'anthropic',
      generation: { ...DEFAULT_SETTINGS.generation, model: 'claude-sonnet-4-6' },
    })
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    await user.click(screen.getByRole('button', { name: /^openai$/i }))

    const modelInput = screen.getByLabelText(/Model/i) as HTMLInputElement
    expect(modelInput.value).toBe('gpt-4o')
  })

  it('sets the model to claude-sonnet-4-6 when the user picks Anthropic', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    await user.click(screen.getByRole('button', { name: /^anthropic$/i }))

    const modelInput = screen.getByLabelText(/Model/i) as HTMLInputElement
    expect(modelInput.value).toBe('claude-sonnet-4-6')
  })

  it('overrides the model when the user switches provider (OpenAI → Anthropic → OpenAI)', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const modelInput = screen.getByLabelText(/Model/i) as HTMLInputElement
    expect(modelInput.value).toBe('gpt-4o')

    await user.click(screen.getByRole('button', { name: /^anthropic$/i }))
    expect(modelInput.value).toBe('claude-sonnet-4-6')

    await user.click(screen.getByRole('button', { name: /^openai$/i }))
    expect(modelInput.value).toBe('gpt-4o')
  })

  it('overrides a manually-typed model when the user switches provider', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const modelInput = screen.getByLabelText(/Model/i) as HTMLInputElement
    await user.clear(modelInput)
    await user.type(modelInput, 'gpt-4o-mini')
    expect(modelInput.value).toBe('gpt-4o-mini')

    await user.click(screen.getByRole('button', { name: /^anthropic$/i }))
    expect(modelInput.value).toBe('claude-sonnet-4-6')
  })
})

describe('SettingsPanel — Test Connection button (M10.1.3)', () => {
  beforeEach(() => {
    setupInvokeMock()
    setupSettingsMock()
  })

  it('renders the Test Connection button enabled with no status message initially', async () => {
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const button = screen.getByTestId('test-connection-button')
    expect(button).toBeInTheDocument()
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('Test Connection')
    expect(screen.queryByTestId('test-connection-message')).not.toBeInTheDocument()
    expect(screen.queryByTestId('test-connection-spinner')).not.toBeInTheDocument()
  })

  it('calls generate_code with the minimal "ping" prompt on click', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    await user.click(screen.getByTestId('test-connection-button'))

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        (call) => call[0] === 'generate_code',
      )
      expect(calls.length).toBeGreaterThan(0)
    })

    const generateCall = invokeMock.mock.calls.find(
      (call) => call[0] === 'generate_code',
    )
    expect(generateCall).toBeDefined()
    expect(generateCall?.[1]).toEqual({
      prompt: 'ping',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test-key-1234567890',
    })
  })

  it('disables the button and shows a spinner while the call is in flight', async () => {
    let resolveGenerate: ((value: unknown) => void) | null = null
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'settings_get') return Promise.resolve(DEFAULT_SETTINGS)
      if (cmd === 'settings_set') return Promise.resolve(undefined)
      if (cmd === 'secret_get') return Promise.resolve('sk-test-key-1234567890')
      if (cmd === 'generate_code') {
        return new Promise<unknown>((resolve) => {
          resolveGenerate = resolve
        })
      }
      return Promise.resolve(null)
    })

    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const button = screen.getByTestId('test-connection-button')
    await user.click(button)

    // While the promise is unresolved, the button should be disabled with a spinner.
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Testing…')
    expect(screen.getByTestId('test-connection-spinner')).toBeInTheDocument()

    // Resolve the in-flight call so the React tree can settle.
    await act(async () => {
      if (resolveGenerate) resolveGenerate(undefined)
    })
  })

  it('shows the success message when generate_code resolves', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    await user.click(screen.getByTestId('test-connection-button'))

    const message = await screen.findByTestId('test-connection-message')
    expect(message).toHaveTextContent('✅ Connection successful')
    expect(message.className).toContain('text-emerald-400')
  })

  it('shows the error message when generate_code rejects', async () => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'settings_get') return Promise.resolve(DEFAULT_SETTINGS)
      if (cmd === 'settings_set') return Promise.resolve(undefined)
      if (cmd === 'secret_get') return Promise.resolve('sk-test-key-1234567890')
      if (cmd === 'generate_code') return Promise.reject(new Error('Invalid API key'))
      return Promise.resolve(null)
    })

    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    await user.click(screen.getByTestId('test-connection-button'))

    const message = await screen.findByTestId('test-connection-message')
    expect(message).toHaveTextContent('❌ Invalid API key')
    expect(message.className).toContain('text-[var(--color-danger)]')
  })

  it('shows the error message when generate_code throws synchronously', async () => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'settings_get') return Promise.resolve(DEFAULT_SETTINGS)
      if (cmd === 'settings_set') return Promise.resolve(undefined)
      if (cmd === 'secret_get') return Promise.resolve('sk-test-key-1234567890')
      if (cmd === 'generate_code') return Promise.reject('Prompt cannot be empty')
      return Promise.resolve(null)
    })

    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    await user.click(screen.getByTestId('test-connection-button'))

    const message = await screen.findByTestId('test-connection-message')
    expect(message).toHaveTextContent('❌ Prompt cannot be empty')
  })

  it('shows an error when no API key is stored for the active provider', async () => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'settings_get') return Promise.resolve(DEFAULT_SETTINGS)
      if (cmd === 'settings_set') return Promise.resolve(undefined)
      if (cmd === 'secret_get') return Promise.resolve(null)
      if (cmd === 'generate_code') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })

    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    await user.click(screen.getByTestId('test-connection-button'))

    const message = await screen.findByTestId('test-connection-message')
    expect(message).toHaveTextContent('❌')
    expect(message).toHaveTextContent(/No API key saved for openai/i)

    const generateCalls = invokeMock.mock.calls.filter(
      (call) => call[0] === 'generate_code',
    )
    expect(generateCalls).toHaveLength(0)
  })

  it('shows an error and does not call generate_code when the model is empty', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const modelInput = screen.getByLabelText(/Model/i) as HTMLInputElement
    await user.clear(modelInput)

    await user.click(screen.getByTestId('test-connection-button'))

    const message = await screen.findByTestId('test-connection-message')
    expect(message).toHaveTextContent('Please enter a model name')

    const generateCalls = invokeMock.mock.calls.filter(
      (call) => call[0] === 'generate_code',
    )
    expect(generateCalls).toHaveLength(0)
  })

  it('auto-clears the success message after 5 seconds', async () => {
    // Render and open the dialog under real timers first, then switch
    // to fake timers for the click + auto-dismiss cycle.
    const { unmount } = render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    vi.useFakeTimers()
    try {
      // Click and flush only the microtask queue (the awaited invoke
      // chain) so the success message is in place. Do NOT run the
      // 5-second auto-dismiss timer yet.
      await act(async () => {
        fireEvent.click(screen.getByTestId('test-connection-button'))
        // Allow the microtask queue (await Promise.resolve() inside
        // handleTestConnection) to drain.
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(screen.getByTestId('test-connection-message')).toHaveTextContent(
        '✅ Connection successful',
      )

      act(() => {
        vi.advanceTimersByTime(4999)
      })
      expect(
        screen.queryByTestId('test-connection-message'),
      ).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(2)
      })
      expect(
        screen.queryByTestId('test-connection-message'),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }

    unmount()
  })
})

// ---------------------------------------------------------------------------
// M10.1.4 — DescriptionInput Generate button guard
// ---------------------------------------------------------------------------
// The toast assertion below lives in this file because the toast surface is
// the user-visible proof that the Generate button refused to call into the
// hook chain. We render DescriptionInput wrapped in a ToastProvider and
// use the mocked useSettings to control the model state.

describe('DescriptionInput — Generate button guard (M10.1.4)', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('does not call onGenerate and shows a toast when the model is empty', async () => {
    setupSettingsMock({
      active_provider: 'openai',
      generation: { model: '', temperature: 0.2, max_tokens: 4096 },
      ui: { theme: 'system', language: 'en-US' },
    })

    const onGenerate = vi.fn()
    render(
      <ToastProvider>
        <DescriptionInput onGenerate={onGenerate} isGenerating={false} />
      </ToastProvider>,
    )

    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox'), 'Start motor when X0 is on')
    await user.click(screen.getByTestId('generate-button'))

    expect(onGenerate).not.toHaveBeenCalled()
    const errorToast = screen.getByTestId('toast-error')
    expect(errorToast).toHaveTextContent(/select a model in Settings/i)
  })

  it('calls onGenerate when the model is set', async () => {
    setupSettingsMock({
      active_provider: 'openai',
      generation: { model: 'gpt-4o', temperature: 0.2, max_tokens: 4096 },
      ui: { theme: 'system', language: 'en-US' },
    })

    const onGenerate = vi.fn()
    render(
      <ToastProvider>
        <DescriptionInput onGenerate={onGenerate} isGenerating={false} />
      </ToastProvider>,
    )

    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox'), 'Start motor when X0 is on')
    await user.click(screen.getByTestId('generate-button'))

    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate).toHaveBeenCalledWith('Start motor when X0 is on')
    expect(screen.queryByTestId('toast-error')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// M10.4.1 — Temperature slider warning
// ---------------------------------------------------------------------------
// The LLM temperature directly affects the reliability of generated PLC code.
// Above 0.3 the code becomes dangerous for industrial use; above 0.6 it is
// unfit for production. The slider's max is hard-capped at 0.7 in the UI to
// keep users from typing 1.0/2.0 and producing nonsense.

describe('getTemperatureWarning helper (M10.4.1)', () => {
  it('returns none at 0.0 (safe default)', () => {
    expect(getTemperatureWarning(0)).toEqual({ level: 'none', message: null })
  })

  it('returns warn at the 0.3 boundary', () => {
    const result = getTemperatureWarning(0.3)
    expect(result.level).toBe('warn')
    expect(result.message).not.toBeNull()
    expect(result.message).toContain('0.3')
  })

  it('returns warn for the 0.3–0.6 mid band', () => {
    const result = getTemperatureWarning(0.5)
    expect(result.level).toBe('warn')
    expect(result.message).toContain('0.3')
  })

  it('returns warn at the 0.6 upper boundary', () => {
    const result = getTemperatureWarning(0.6)
    expect(result.level).toBe('warn')
    expect(result.message).toContain('0.3')
  })

  it('returns danger just above 0.6', () => {
    const result = getTemperatureWarning(0.65)
    expect(result.level).toBe('danger')
    expect(result.message).toContain('0.6')
  })

  it('returns danger at the slider cap 0.7', () => {
    const result = getTemperatureWarning(TEMPERATURE_MAX)
    expect(result.level).toBe('danger')
    expect(result.message).toContain('0.6')
  })
})

describe('SettingsPanel — temperature warning UI (M10.4.1)', () => {
  beforeEach(() => {
    setupInvokeMock()
  })

  it('caps the temperature slider at TEMPERATURE_MAX (0.7)', async () => {
    setupSettingsMock({
      ...DEFAULT_SETTINGS,
      generation: { ...DEFAULT_SETTINGS.generation, temperature: 0.2 },
    })
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const slider = screen.getByLabelText(/Temperature/i) as HTMLInputElement
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider.max).toBe(String(TEMPERATURE_MAX))
    expect(parseFloat(slider.max)).toBeCloseTo(0.7, 5)
  })

  it('does not show any warning when temperature is below 0.3', async () => {
    setupSettingsMock({
      ...DEFAULT_SETTINGS,
      generation: { ...DEFAULT_SETTINGS.generation, temperature: 0.2 },
    })
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    expect(screen.queryByTestId('temperature-warning')).not.toBeInTheDocument()
  })

  it('shows the yellow warning at temperature 0.5', async () => {
    setupSettingsMock({
      ...DEFAULT_SETTINGS,
      generation: { ...DEFAULT_SETTINGS.generation, temperature: 0.5 },
    })
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const warning = screen.getByTestId('temperature-warning')
    expect(warning).toHaveTextContent('⚠')
    expect(warning).toHaveTextContent('0.3')
    expect(warning.className).toContain('text-yellow-700')
    expect(warning).toHaveAttribute('role', 'status')
  })

  it('shows the red danger warning at temperature 0.7', async () => {
    setupSettingsMock({
      ...DEFAULT_SETTINGS,
      generation: { ...DEFAULT_SETTINGS.generation, temperature: 0.7 },
    })
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const warning = screen.getByTestId('temperature-warning')
    expect(warning).toHaveTextContent('⚠')
    expect(warning).toHaveTextContent('0.6')
    expect(warning.className).toContain('text-red-700')
  })

  it('reacts to slider input by showing/hiding the warning', async () => {
    setupSettingsMock({
      ...DEFAULT_SETTINGS,
      generation: { ...DEFAULT_SETTINGS.generation, temperature: 0.2 },
    })
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    expect(screen.queryByTestId('temperature-warning')).not.toBeInTheDocument()

    const slider = screen.getByLabelText(/Temperature/i) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.5' } })

    const warning = screen.getByTestId('temperature-warning')
    expect(warning.className).toContain('text-yellow-700')

    fireEvent.change(slider, { target: { value: '0.7' } })
    expect(screen.getByTestId('temperature-warning').className).toContain('text-red-700')

    fireEvent.change(slider, { target: { value: '0.1' } })
    expect(screen.queryByTestId('temperature-warning')).not.toBeInTheDocument()
  })
})



// ---------------------------------------------------------------------------
// M11.2 — Gemini model selector
// ---------------------------------------------------------------------------

describe('SettingsPanel — Gemini model selector (M11.2)', () => {
  beforeEach(() => {
    setupInvokeMock()
    setupSettingsMock()
  })

  it('renders a Gemini button and is clickable', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()
    const btn = screen.getByTestId('provider-button-gemini')
    expect(btn).toBeInTheDocument()
    await user.click(btn)
    expect(btn.className).toContain('bg-[var(--color-accent)]')
  })

  it('sets the model to gemini-2.5-flash when the user picks Gemini', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()
    await user.click(screen.getByTestId('provider-button-gemini'))
    // The Gemini model <select> should be visible and default to flash.
    const select = screen.getByTestId('gemini-model-select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('gemini-2.5-flash')
  })

  it('Gemini model selector shows the four options', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()
    await user.click(screen.getByTestId('provider-button-gemini'))
    const select = screen.getByTestId('gemini-model-select') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('gemini-2.5-pro')
    expect(options).toContain('gemini-2.5-flash')
    expect(options).toContain('gemini-2.5-flash-lite')
    expect(options).toContain('Custom...')
  })

  it('picking "Custom..." in the Gemini selector reveals a free-text input', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()
    await user.click(screen.getByTestId('provider-button-gemini'))
    const select = screen.getByTestId('gemini-model-select') as HTMLSelectElement
    await user.selectOptions(select, 'Custom...')
    const input = screen.getByTestId('gemini-custom-model-input') as HTMLInputElement
    expect(input).toBeInTheDocument()
    await user.type(input, 'gemini-2.0-experimental')
    expect(input.value).toBe('gemini-2.0-experimental')
  })

  it('picking a non-Custom Gemini option hides the custom input', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()
    await user.click(screen.getByTestId('provider-button-gemini'))
    // Switch to Custom first to make the input appear.
    const select = screen.getByTestId('gemini-model-select') as HTMLSelectElement
    await user.selectOptions(select, 'Custom...')
    expect(screen.getByTestId('gemini-custom-model-input')).toBeInTheDocument()
    // Now switch back to a built-in option.
    await user.selectOptions(select, 'gemini-2.5-pro')
    expect(screen.queryByTestId('gemini-custom-model-input')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// M11.5.2 — Provider icons in the selector grid
// ---------------------------------------------------------------------------

describe('SettingsPanel — provider icons (M11.5.2)', () => {
  beforeEach(() => {
    setupInvokeMock()
    setupSettingsMock()
  })

  it.each(['openai', 'anthropic', 'gemini', 'custom'] as const)(
    'renders an inline svg icon inside the %s provider button',
    async (provider) => {
      render(<SettingsPanel open onClose={vi.fn()} />)
      await openDialog()

      const button = screen.getByTestId(`provider-button-${provider}`)
      const svg = button.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(button).toHaveTextContent(provider)
    },
  )

  it('icons use currentColor so they adapt to selected/unselected styles', async () => {
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    for (const provider of ['openai', 'anthropic', 'gemini', 'custom'] as const) {
      const svg = screen
        .getByTestId(`provider-button-${provider}`)
        .querySelector('svg')
      const markup = svg?.outerHTML ?? ''
      expect(markup).toContain('currentColor')
      expect(markup).not.toMatch(/fill="#|stroke="#/)
    }
  })

  it('keeps provider selection functional with icons rendered', async () => {
    // Switching to Custom triggers a trusted-domains read; provide a list.
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'settings_get') return Promise.resolve(DEFAULT_SETTINGS)
      if (cmd === 'settings_set') return Promise.resolve(undefined)
      if (cmd === 'secret_get') return Promise.resolve('sk-test-key-1234567890')
      if (cmd === 'generate_code') return Promise.resolve(undefined)
      if (cmd === 'trusted_domains_list') return Promise.resolve([])
      return Promise.resolve(null)
    })

    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    await user.click(screen.getByTestId('provider-button-anthropic'))
    const modelInput = screen.getByLabelText(/Model/i) as HTMLInputElement
    expect(modelInput.value).toBe('claude-sonnet-4-6')

    await user.click(screen.getByTestId('provider-button-gemini'))
    expect(screen.getByTestId('gemini-model-select')).toBeInTheDocument()

    await user.click(screen.getByTestId('provider-button-custom'))
    expect(screen.getByTestId('custom-fields')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// H8 — render-crash fixes: raw-keystroke URL derivation + showModal guard
// ---------------------------------------------------------------------------

describe('SettingsPanel — Custom Base URL typing safety (H8)', () => {
  const CUSTOM_SETTINGS: Settings = {
    ...DEFAULT_SETTINGS,
    active_provider: 'custom',
    custom_base_url: '',
    custom_model_name: '',
  }

  function setupCustomInvoke(trustedDomains: Array<{ domain: string }> = []): void {
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'settings_get') return Promise.resolve(CUSTOM_SETTINGS)
      if (cmd === 'settings_set') return Promise.resolve(undefined)
      if (cmd === 'secret_get') return Promise.resolve('sk-test-key-1234567890')
      if (cmd === 'generate_code') return Promise.resolve(undefined)
      if (cmd === 'trusted_domains_list') {
        return Promise.resolve(
          trustedDomains.map((d) => ({ ...d, trusted_at: '2025-01-01T00:00:00Z' })),
        )
      }
      return Promise.resolve(null)
    })
  }

  it('renders without throwing while garbage/partial input is typed into the Custom Base URL', async () => {
    setupCustomInvoke()
    setupSettingsMock(CUSTOM_SETTINGS)

    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const input = screen.getByTestId('custom-base-url-input') as HTMLInputElement
    expect(screen.queryByTestId('active-domain-invalid-warning')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('active-domain-not-trusted-warning'),
    ).not.toBeInTheDocument()

    // Keystroke-by-keystroke: every intermediate value re-renders. This
    // crashed before H8 (`new URL('o…')` threw TypeError during render).
    await user.type(input, 'openrouter')
    expect(input.value).toBe('openrouter')
    expect(screen.getByTestId('active-domain-invalid-warning')).toBeInTheDocument()
    expect(
      screen.queryByTestId('active-domain-not-trusted-warning'),
    ).not.toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'https://')
    expect(input.value).toBe('https://')
    expect(screen.getByTestId('active-domain-invalid-warning')).toBeInTheDocument()
    expect(
      screen.queryByTestId('active-domain-not-trusted-warning'),
    ).not.toBeInTheDocument()

    // Completing to a parseable, untrusted URL flips to the trust warning.
    await user.type(input, 'openrouter.ai/api/v1')
    expect(input.value).toBe('https://openrouter.ai/api/v1')
    expect(screen.queryByTestId('active-domain-invalid-warning')).not.toBeInTheDocument()
    expect(screen.getByTestId('active-domain-not-trusted-warning')).toBeInTheDocument()
  })

  it('shows neither warning once the typed URL domain is trusted', async () => {
    setupCustomInvoke([{ domain: 'openrouter.ai' }])
    setupSettingsMock(CUSTOM_SETTINGS)

    const user = userEvent.setup()
    render(<SettingsPanel open onClose={vi.fn()} />)
    await openDialog()

    const input = screen.getByTestId('custom-base-url-input') as HTMLInputElement
    await user.type(input, 'https://openrouter.ai/api/v1')

    expect(input.value).toBe('https://openrouter.ai/api/v1')
    expect(screen.queryByTestId('active-domain-invalid-warning')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('active-domain-not-trusted-warning'),
    ).not.toBeInTheDocument()
  })
})

describe('SettingsPanel — showModal guard while dialog stays open (H8)', () => {
  it('does not re-invoke showModal when settings identity changes while open, and still closes/reopens', async () => {
    const baseSettings: Settings = {
      ...DEFAULT_SETTINGS,
      active_provider: 'custom',
      custom_base_url: '',
      custom_model_name: '',
    }
    // Custom provider is active, so trusted_domains_list must resolve
    // to a real array (a null resolve would poison component state).
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'settings_get') return Promise.resolve(baseSettings)
      if (cmd === 'settings_set') return Promise.resolve(undefined)
      if (cmd === 'secret_get') return Promise.resolve('sk-test-key-1234567890')
      if (cmd === 'generate_code') return Promise.resolve(undefined)
      if (cmd === 'trusted_domains_list') return Promise.resolve([])
      return Promise.resolve(null)
    })
    setupSettingsMock(baseSettings)

    const onClose = vi.fn()
    const { rerender } = render(<SettingsPanel open onClose={onClose} />)
    await openDialog()

    // Settle the async trusted_domains_list read triggered by the open
    // effect so its setState lands inside act().
    const flushAsyncLoads = async (): Promise<void> => {
      await act(async () => {
        await Promise.resolve()
      })
    }
    await flushAsyncLoads()

    const dialog = screen.getByTestId('settings-dialog') as HTMLDialogElement
    const showModalSpy = vi.spyOn(dialog, 'showModal')

    // Simulate save-while-open: the hook exposes a NEW settings object
    // but `open` stays true — previously this re-ran the effect and
    // called showModal() on an already-open <dialog> (InvalidStateError).
    setupSettingsMock({ ...baseSettings, custom_base_url: 'https://openrouter.ai/api/v1' })
    rerender(<SettingsPanel open onClose={onClose} />)
    await flushAsyncLoads()

    expect(showModalSpy).not.toHaveBeenCalled()
    expect(dialog).toHaveAttribute('open')
    expect(onClose).not.toHaveBeenCalled()

    // Closing still works…
    rerender(<SettingsPanel open={false} onClose={onClose} />)
    expect(dialog).not.toHaveAttribute('open')

    // …and reopening calls showModal exactly once.
    rerender(<SettingsPanel open onClose={onClose} />)
    await flushAsyncLoads()
    expect(showModalSpy).toHaveBeenCalledTimes(1)
    expect(dialog).toHaveAttribute('open')

    showModalSpy.mockRestore()
  })
})
