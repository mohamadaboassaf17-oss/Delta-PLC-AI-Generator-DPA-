import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { Provider } from '@/types/settings'
import { BRANDS } from '@/lib/brands'
import { validateApiKeyShape } from '@/lib/providers'
import { safeInvoke } from '@/lib/tauriApi'

export interface ApiKeySettingsProps {
  provider: Provider
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

const TEST_RESET_MS = 5000

function placeholderFor(provider: Provider): string {
  switch (provider) {
    case 'openai':
      return 'sk-...'
    case 'anthropic':
      return 'sk-ant-...'
    case 'gemini':
      return 'AIza...'
    case 'custom':
      return '••••••••••••••••'
    default:
      return '••••'
  }
}

export function ApiKeySettings({ provider }: ApiKeySettingsProps): ReactElement {
  const [keyInput, setKeyInput] = useState<string>('')
  const [show, setShow] = useState<boolean>(false)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [saving, setSaving] = useState<boolean>(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const brand = BRANDS[provider]
  const validation = validateApiKeyShape(provider, keyInput)
  const showValidationError = keyInput.length > 0 && !validation.ok

  const loadHasKey = async (p: Provider): Promise<void> => {
    const result = await safeInvoke<boolean>('settings_has_api_key', { provider: p })
    if (result.error) {
      // Fallback to secret_get for backward compat
      const fallback = await safeInvoke<string | null>('secret_get', { provider: p })
      if (!fallback.error) {
        setHasKey(fallback.data !== null && fallback.data !== undefined && fallback.data !== '')
        return
      }
      setHasKey(null)
      return
    }
    setHasKey(result.data ?? false)
  }

  // Provider switch: reset UI and re-check keychain. The setState calls
  // are intentional synchronisation for provider change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHasKey(provider)
    setSaveMessage(null)
    setSaveError(null)
    setTestStatus('idle')
    setTestMessage(null)
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  }, [provider])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const scheduleReset = (): void => {
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      setTestStatus('idle')
      setTestMessage(null)
      resetTimerRef.current = null
    }, TEST_RESET_MS)
  }

  const handleSave = async (): Promise<void> => {
    if (!validation.ok) return
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)
    const trimmed = keyInput.trim()
    // Prefer canonical settings_set_api_key, fallback to secret_set
    const primary = await safeInvoke<void>('settings_set_api_key', { provider, key: trimmed })
    let finalResult = primary
    if (primary.error) {
      const fb = await safeInvoke<void>('secret_set', { provider, key: trimmed })
      if (!fb.error) finalResult = fb
      else if (primary.error.includes('not found')) finalResult = fb
    }
    if (finalResult.error) {
      setSaveError(finalResult.error)
      setSaving(false)
      return
    }
    setHasKey(true)
    setSaveMessage('Key saved ')
    setKeyInput('')
    setSaving(false)
    setTimeout(() => setSaveMessage(null), 3000)
  }

  const handleTest = async (): Promise<void> => {
    if (testStatus === 'testing') return
    // If input has a value, test that value; otherwise test stored key via backend probe
    const trimmed = keyInput.trim()
    setTestStatus('testing')
    setTestMessage(null)
    // Try settings_test_connection first, fallback to secret_test
    const res = await safeInvoke<void>('settings_test_connection', {
      provider,
      key: trimmed.length > 0 ? trimmed : undefined,
    })
    if (res.error) {
      // Detect "command not found" vs real probe failure — fallback to secret_test for rich result
      if (res.error.includes('not found') || res.error.includes('unknown')) {
        const fb = await safeInvoke<{ ok: boolean; message: string }>('secret_test', {
          provider,
          key: trimmed.length > 0 ? trimmed : undefined,
        })
        if (fb.error) {
          setTestStatus('error')
          setTestMessage(fb.error)
          scheduleReset()
          return
        }
        if (fb.data && (fb.data as unknown as { ok: boolean }).ok) {
          setTestStatus('success')
          setTestMessage((fb.data as unknown as { message: string }).message ?? 'Connection successful')
        } else {
          setTestStatus('error')
          setTestMessage((fb.data as unknown as { message: string })?.message ?? 'Connection failed')
        }
        scheduleReset()
        return
      }
      setTestStatus('error')
      setTestMessage(res.error)
      scheduleReset()
      return
    }
    setTestStatus('success')
    setTestMessage('Connection successful')
    scheduleReset()
  }

  const handleClear = async (): Promise<void> => {
    const res = await safeInvoke<void>('secret_delete', { provider })
    if (res.error) {
      setSaveError(res.error)
      return
    }
    // Also try settings alias delete if exists (no-op if not)
    setHasKey(false)
    setSaveMessage('Key removed')
    setTimeout(() => setSaveMessage(null), 3000)
  }

  return (
    <fieldset className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <legend className="px-1 text-xs uppercase tracking-wider text-[var(--color-muted)]">
        API Key — {brand}
      </legend>

      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-[var(--color-muted)]" data-testid="api-key-status">
          {hasKey === null ? 'Checking…' : hasKey ? '✓ Key saved' : 'No key saved'}
        </span>
        {hasKey ? (
          <button
            type="button"
            onClick={handleClear}
            data-testid={`clear-key-${provider}`}
            className="text-xs text-[var(--color-danger)] hover:underline"
            title="Remove the stored key for this provider"
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="flex gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={placeholderFor(provider)}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${brand} API key`}
          data-testid={`api-key-input-${provider}`}
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide key' : 'Show key'}
          data-testid={`toggle-key-visibility-${provider}`}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>

      {showValidationError && (
        <p data-testid={`api-key-error-${provider}`} role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
          {validation.reason}
        </p>
      )}

      {(saveError || saveMessage) && (
        <p
          role={saveError ? 'alert' : 'status'}
          data-testid={`api-key-save-message-${provider}`}
          className={`mt-1 text-xs ${saveError ? 'text-[var(--color-danger)]' : 'text-emerald-400'}`}
        >
          {saveError ?? saveMessage}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!validation.ok || saving}
          data-testid={`save-key-${provider}`}
          title={validation.ok ? 'Save key to OS keychain' : validation.reason ?? 'Enter a valid key to enable saving'}
          aria-disabled={!validation.ok || saving}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Key'}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testStatus === 'testing'}
          data-testid={`test-connection-${provider}`}
          title={
            testStatus === 'testing'
              ? 'Testing…'
              : hasKey || keyInput.trim().length > 0
                ? 'Probe the API with the stored or entered key'
                : 'Save a key first, or enter one above to test'
          }
          aria-disabled={testStatus === 'testing'}
          className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-xs hover:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testStatus === 'testing' ? (
            <>
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-testid={`test-connection-spinner-${provider}`}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Testing…
            </>
          ) : (
            'Test Connection'
          )}
        </button>
      </div>

      {testMessage !== null && (
        <p
          role="status"
          data-testid={`test-connection-message-${provider}`}
          className={`mt-2 text-xs ${testStatus === 'success' ? 'text-emerald-400' : testStatus === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'}`}
        >
          {testStatus === 'success' ? '✅ ' : testStatus === 'error' ? '❌ ' : ''}
          {testMessage}
        </p>
      )}
    </fieldset>
  )
}
