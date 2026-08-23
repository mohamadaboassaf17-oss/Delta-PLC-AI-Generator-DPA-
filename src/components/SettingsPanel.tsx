import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS, type Provider, type Settings, type Theme } from '@/types/settings'
import {
  generateCode,
  secretGet,
  trustedDomainsList,
  trustedDomainsRemove,
  type TrustedDomain,
} from '@/lib/tauriApi'
import {
  TEMPERATURE_MAX,
  getTemperatureWarning,
} from '@/lib/validators/temperature'
import { validateCustomBaseUrl } from '@/lib/validators/customProvider'
import { TrustDomainModal } from '@/components/TrustDomainModal'
import {
  AnthropicIcon,
  CustomIcon,
  GeminiIcon,
  OpenAiIcon,
} from '@/assets/providers'

export interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

const PROVIDERS: Provider[] = ['openai', 'anthropic', 'gemini', 'custom']
const THEMES: Theme[] = ['light', 'dark', 'system']

const PROVIDER_ICONS: Record<Provider, ReactElement> = {
  openai: <OpenAiIcon />,
  anthropic: <AnthropicIcon />,
  gemini: <GeminiIcon />,
  custom: <CustomIcon />,
}

/** Minimal prompt sent by the Test Connection button. */
const TEST_CONNECTION_PROMPT = 'ping'

/** Mapping of provider -> recommended default model. */
const DEFAULT_MODELS: Record<Provider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-flash',
  custom: 'gpt-3.5-turbo', // placeholder — Custom uses its own model_name field
}

/** Gemini's built-in model options (M11.2). The "Custom..." entry is
 *  a sentinel that the SettingsPanel replaces with a free-text input. */
const GEMINI_MODEL_OPTIONS: readonly string[] = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'Custom...',
] as const

const GEMINI_CUSTOM_SENTINEL = 'Custom...'

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

const TEST_STATUS_RESET_MS = 5000

export function SettingsPanel({ open, onClose }: SettingsPanelProps): ReactElement {
  const { settings, setSettings, error } = useSettings()
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [draft, setDraft] = useState<Settings>(settings)
  const [dirty, setDirty] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [trustModalDomain, setTrustModalDomain] = useState<string | null>(null)
  /** When the trust modal closes, this callback runs (if set) so the
   *  parent flow (save / test connection) can resume or abort. */
  const trustResolveRef = useRef<((trusted: boolean) => void) | null>(null)
  const [trustedDomains, setTrustedDomains] = useState<TrustedDomain[]>([])
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync draft with incoming settings when dialog opens */
    if (open) {
      setDraft(settings)
      setDirty(false)
      setLocalError(null)
      setTestStatus('idle')
      setTestMessage(null)
      // showModal() on an already-open <dialog> throws InvalidStateError
      // (HTML spec). The settings identity changes after a save, which
      // re-runs this effect while the panel is still open — guard it.
      if (!dialogRef.current?.open) {
        dialogRef.current?.showModal()
      }
      // Load the trusted domains list whenever the panel opens.
      void trustedDomainsList()
        .then((list) => setTrustedDomains(list))
        .catch(() => setTrustedDomains([]))
    } else {
      dialogRef.current?.close()
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, settings])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const scheduleTestStatusReset = (): void => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current)
    }
    resetTimerRef.current = setTimeout(() => {
      setTestStatus('idle')
      setTestMessage(null)
      resetTimerRef.current = null
    }, TEST_STATUS_RESET_MS)
  }

  const handleChangeProvider = (next: Provider): void => {
    setDraft((d) => ({
      ...d,
      active_provider: next,
      generation: { ...d.generation, model: DEFAULT_MODELS[next] },
    }))
    setDirty(true)
    setTestStatus('idle')
    setTestMessage(null)
  }

  const handleChangeModel = (value: string): void => {
    setDraft((d) => ({ ...d, generation: { ...d.generation, model: value } }))
    setDirty(true)
  }

  const handleChangeTemperature = (value: number): void => {
    setDraft((d) => ({ ...d, generation: { ...d.generation, temperature: value } }))
    setDirty(true)
  }

  const handleChangeMaxTokens = (value: number): void => {
    setDraft((d) => ({ ...d, generation: { ...d.generation, max_tokens: value } }))
    setDirty(true)
  }

  const handleChangeTheme = (next: Theme): void => {
    setDraft((d) => ({ ...d, ui: { ...d.ui, theme: next } }))
    setDirty(true)
  }

  const handleChangeLanguage = (value: string): void => {
    setDraft((d) => ({ ...d, ui: { ...d.ui, language: value } }))
    setDirty(true)
  }

  const handleChangeCustomBaseUrl = (value: string): void => {
    setDraft((d) => ({ ...d, custom_base_url: value }))
    setDirty(true)
  }

  const handleChangeCustomModelName = (value: string): void => {
    setDraft((d) => ({ ...d, custom_model_name: value }))
    setDirty(true)
  }

  /**
   * If the active provider is Custom and its base URL points to a
   * domain that is not yet trusted, show the TrustDomainModal and
   * return a promise that resolves with the user's choice.
   *
   * Returns immediately (`Promise<true>`) when no trust step is
   * needed (non-Custom provider, or domain is already trusted).
   */
  const ensureCustomDomainTrusted = (s: Settings): Promise<boolean> => {
    if (s.active_provider !== 'custom') return Promise.resolve(true)
    const url = (s.custom_base_url ?? '').trim()
    if (url === '') return Promise.resolve(true)
    const v = validateCustomBaseUrl(url)
    if (!v.ok || v.domain === null) return Promise.resolve(true) // shape error is reported separately
    return new Promise<boolean>((resolve) => {
      trustedDomainsList()
        .then((list) => {
          if (list.some((d) => d.domain === v.domain)) {
            resolve(true)
            return
          }
          // Need to ask — show the modal.
          setTrustModalDomain(v.domain)
          trustResolveRef.current = resolve
        })
        .catch(() => resolve(true)) // on read failure, fall through
    })
  }

  const handleTrustModalConfirm = (): void => {
    setTrustModalDomain(null)
    if (trustResolveRef.current !== null) {
      trustResolveRef.current(true)
      trustResolveRef.current = null
    }
    // Refresh the list
    void trustedDomainsList()
      .then((list) => setTrustedDomains(list))
      .catch(() => {})
  }

  const handleTrustModalCancel = (): void => {
    setTrustModalDomain(null)
    if (trustResolveRef.current !== null) {
      trustResolveRef.current(false)
      trustResolveRef.current = null
    }
  }

  const handleRemoveTrusted = async (domain: string): Promise<void> => {
    try {
      await trustedDomainsRemove(domain)
      const list = await trustedDomainsList()
      setTrustedDomains(list)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Failed to remove trusted domain')
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setLocalError(null)
    try {
      // If Custom: validate the base URL and (if needed) ask the
      // user to trust the domain before saving.
      if (draft.active_provider === 'custom') {
        const url = (draft.custom_base_url ?? '').trim()
        if (url !== '') {
          const v = validateCustomBaseUrl(url)
          if (!v.ok) {
            setLocalError(v.reason ?? 'Invalid Custom Base URL')
            setSaving(false)
            return
          }
        }
      }
      const trusted = await ensureCustomDomainTrusted(draft)
      if (!trusted) {
        setLocalError('لم تتم الموافقة على المزوّد — لم يُحفظ شيء')
        setSaving(false)
        return
      }
      await setSettings(draft)
      setDirty(false)
      onClose()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = (): void => {
    if (dirty) {
      setDraft(settings)
      setDirty(false)
    }
    setLocalError(null)
    setTestStatus('idle')
    setTestMessage(null)
    onClose()
  }

  const handleReset = (): void => {
    setDraft(DEFAULT_SETTINGS)
    setDirty(true)
  }

  const handleTestConnection = async (): Promise<void> => {
    if (testStatus === 'testing') return
    const model = draft.generation.model.trim()
    const customModelName = (draft.custom_model_name ?? '').trim()
    const isCustom = draft.active_provider === 'custom'
    const effectiveModel = isCustom ? customModelName : model
    if (effectiveModel === '') {
      setTestStatus('error')
      setTestMessage(
        isCustom
          ? 'Please enter a Custom model name before testing the connection.'
          : 'Please enter a model name before testing the connection.',
      )
      scheduleTestStatusReset()
      return
    }
    // For Custom, validate the Base URL.
    if (isCustom) {
      const url = (draft.custom_base_url ?? '').trim()
      if (url === '') {
        setTestStatus('error')
        setTestMessage('Please enter a Custom Base URL before testing the connection.')
        scheduleTestStatusReset()
        return
      }
      const v = validateCustomBaseUrl(url)
      if (!v.ok) {
        setTestStatus('error')
        setTestMessage(v.reason ?? 'Invalid Custom Base URL')
        scheduleTestStatusReset()
        return
      }
    }
    // If Custom, ensure the user has confirmed trust for the domain.
    const trusted = await ensureCustomDomainTrusted(draft)
    if (!trusted) {
      setTestStatus('error')
      setTestMessage('لم تتم الموافقة على المزوّد — لم يكتمل الاختبار')
      scheduleTestStatusReset()
      return
    }
    setTestStatus('testing')
    setTestMessage(null)
    try {
      const provider = draft.active_provider
      const apiKey = await secretGet(provider)
      if (apiKey === null || apiKey.trim() === '') {
        setTestStatus('error')
        setTestMessage(`No API key saved for ${provider}. Add one in the BYOK wizard first.`)
        return
      }
      const result = await generateCode(
        TEST_CONNECTION_PROMPT,
        provider,
        effectiveModel,
        apiKey,
        isCustom ? draft.custom_base_url : undefined,
        isCustom ? draft.custom_model_name : undefined,
      )
      if (result.error !== undefined) {
        setTestStatus('error')
        setTestMessage(result.error)
      } else {
        setTestStatus('success')
        setTestMessage('Connection successful')
      }
    } catch (err) {
      setTestStatus('error')
      setTestMessage(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      scheduleTestStatusReset()
    }
  }

  /* H8: derive the active Custom domain through the validator — a bare
   * new URL() on partially-typed input (e.g. `openrouter`) throws and
   * crashed the whole app during render. The validator never throws. */
  const activeCustomBaseUrl = draft.custom_base_url ?? ''
  const activeCustomDomain = validateCustomBaseUrl(activeCustomBaseUrl).domain
  const isActiveCustomUrlInvalid =
    activeCustomBaseUrl.trim() !== '' && activeCustomDomain === null
  const isUntrustedActiveCustomDomain =
    activeCustomDomain !== null &&
    !trustedDomains.some((d) => d.domain === activeCustomDomain)

  return (
    <dialog
      ref={dialogRef}
      data-testid="settings-dialog"
      className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6 text-[var(--color-text)] backdrop:bg-black/50"
      onCancel={(e) => {
        e.preventDefault()
        handleCancel()
      }}
    >
      <h2 className="mb-4 text-lg font-semibold">Settings</h2>

      <fieldset className="mb-4">
        <legend className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Provider
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleChangeProvider(p)}
              data-testid={`provider-button-${p}`}
              className={`rounded-md border px-3 py-2 text-sm capitalize ${
                draft.active_provider === p
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)]'
              }`}
            >
              <span className="flex min-w-0 items-center justify-center gap-1.5">
                {PROVIDER_ICONS[p]}
                <span className="truncate">{p}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>


      <fieldset className="mb-4">
        <legend className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Generation
        </legend>
        <label className="mb-2 block text-sm">
          Model
          <div className="mt-1 flex gap-2">
            {draft.active_provider === 'gemini' ? (
              <>
                <select
                  value={GEMINI_MODEL_OPTIONS.includes(draft.generation.model) ? draft.generation.model : GEMINI_CUSTOM_SENTINEL}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === GEMINI_CUSTOM_SENTINEL) {
                      // Switching to Custom: clear the model so the
                      // text input below becomes the source of truth.
                      handleChangeModel('')
                    } else {
                      handleChangeModel(v)
                    }
                  }}
                  data-testid="gemini-model-select"
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
                >
                  {GEMINI_MODEL_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {draft.generation.model === '' ||
                !GEMINI_MODEL_OPTIONS.includes(draft.generation.model) ? (
                  <input
                    type="text"
                    placeholder="custom Gemini model"
                    value={draft.generation.model}
                    onChange={(e) => handleChangeModel(e.target.value)}
                    data-testid="gemini-custom-model-input"
                    className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
                  />
                ) : null}
              </>
            ) : (
              <input
                type="text"
                value={draft.generation.model}
                onChange={(e) => handleChangeModel(e.target.value)}
                data-testid="model-input"
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
              />
            )}
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
              data-testid="test-connection-button"
              className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === 'testing' ? (
                <>
                  <svg
                    className="h-3 w-3 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    data-testid="test-connection-spinner"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Testing…
                </>
              ) : (
                'Test Connection'
              )}
            </button>
          </div>
        </label>
        {testMessage !== null && (
          <p
            role="status"
            data-testid="test-connection-message"
            className={`mb-2 text-xs ${
              testStatus === 'success'
                ? 'text-emerald-400'
                : testStatus === 'error'
                  ? 'text-[var(--color-danger)]'
                  : 'text-[var(--color-muted)]'
            }`}
          >
            {testStatus === 'success' ? '✅ ' : testStatus === 'error' ? '❌ ' : ''}
            {testMessage}
          </p>
        )}
        <label className="mb-2 block text-sm">
          Temperature: {draft.generation.temperature.toFixed(1)}
          <input
            type="range"
            min={0}
            max={TEMPERATURE_MAX}
            step={0.1}
            value={draft.generation.temperature}
            onChange={(e) => handleChangeTemperature(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        {(() => {
          const warning = getTemperatureWarning(draft.generation.temperature)
          if (warning.message === null) return null
          const className =
            warning.level === 'danger' ? 'text-red-700' : 'text-yellow-700'
          return (
            <p
              data-testid="temperature-warning"
              role="status"
              className={`mb-2 text-xs ${className}`}
            >
              {warning.message}
            </p>
          )
        })()}
        <label className="mb-2 block text-sm">
          Max Tokens
          <input
            type="number"
            min={1}
            value={draft.generation.max_tokens}
            onChange={(e) => handleChangeMaxTokens(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
          />
        </label>

        {draft.active_provider === 'custom' && (
          <div
            data-testid="custom-fields"
            className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
          >
            <p className="mb-2 text-xs text-[var(--color-muted)]">
              يجب أن يدعم هذا الـ Endpoint صيغة OpenAI (<code>/chat/completions</code>)
            </p>
            <label className="mb-2 block text-sm">
              Custom Base URL
              <input
                type="text"
                value={draft.custom_base_url ?? ''}
                onChange={(e) => handleChangeCustomBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                data-testid="custom-base-url-input"
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-sm"
              />
            </label>
            <label className="mb-0 block text-sm">
              Custom Model Name
              <input
                type="text"
                value={draft.custom_model_name ?? ''}
                onChange={(e) => handleChangeCustomModelName(e.target.value)}
                placeholder="meta-llama/llama-3.3-70b"
                data-testid="custom-model-name-input"
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-sm"
              />
            </label>
          </div>
        )}
      </fieldset>

      {draft.active_provider === 'custom' && (
        <fieldset
          data-testid="trusted-domains-fieldset"
          className="mb-4"
        >
          <legend className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">
            Trusted Custom Providers
          </legend>
          {trustedDomains.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">
              لا توجد مزوّدات موثوقة بعد. عند حفظ إعدادات Custom لأول مرة، سيُطلب منك تأكيد الثقة بالمزوّد.
            </p>
          ) : (
            <ul className="space-y-1">
              {trustedDomains.map((d) => (
                <li
                  key={d.domain}
                  data-testid="trusted-domain-row"
                  className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                >
                  <span className="font-mono">{d.domain}</span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveTrusted(d.domain)}
                    data-testid="remove-trusted-domain"
                    className="text-[var(--color-danger)] hover:underline"
                  >
                    إزالة الثقة
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isActiveCustomUrlInvalid ? (
            <p
              data-testid="active-domain-invalid-warning"
              role="status"
              className="mt-2 text-xs text-[var(--color-muted)]"
            >
              ⚠ الرابط الحالي غير مكتمل أو غير صالح — سيتم التحقق منه عند الحفظ.
            </p>
          ) : isUntrustedActiveCustomDomain ? (
            <p
              data-testid="active-domain-not-trusted-warning"
              className="mt-2 text-xs text-amber-700"
            >
              ⚠ المزوّد الحالي غير موثوق. سيُطلب منك تأكيد الثقة عند الحفظ أو الاختبار.
            </p>
          ) : null}
        </fieldset>
      )}

      <fieldset className="mb-4">
        <legend className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">UI</legend>
        <label className="mb-2 block text-sm">
          Theme
          <select
            value={draft.ui.theme}
            onChange={(e) => handleChangeTheme(e.target.value as Theme)}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-2 block text-sm">
          Language (BCP-47)
          <input
            type="text"
            value={draft.ui.language}
            onChange={(e) => handleChangeLanguage(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
          />
        </label>
      </fieldset>

      {(localError || error) && (
        <p role="alert" className="mb-2 text-xs text-[var(--color-danger)]">
          {localError ?? error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Reset to defaults
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <TrustDomainModal
        open={trustModalDomain !== null}
        domain={trustModalDomain}
        onCancel={handleTrustModalCancel}
        onConfirm={handleTrustModalConfirm}
      />
    </dialog>
  )
}
