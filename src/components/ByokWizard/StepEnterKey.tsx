import { useState, type FormEvent, type ReactElement } from 'react'
import type { Provider } from '@/types/settings'
import { validateApiKeyShape } from '@/lib/providers'
import { Step3EnterKeyIllustration } from '@/assets/wizard'

export interface StepEnterKeyProps {
  provider: Provider
  onSubmit: (key: string) => Promise<void>
  onBack: () => void
}

export function StepEnterKey({ provider, onSubmit, onBack }: StepEnterKeyProps): ReactElement {
  const [key, setKey] = useState<string>('')
  const [show, setShow] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const validation = validateApiKeyShape(provider, key)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!validation.ok) return
    setSubmitting(true)
    try {
      await onSubmit(key.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form data-testid="byok-step-3" onSubmit={handleSubmit} className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Enter your API key</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Stored locally in the OS keychain. Never sent anywhere except {provider}.
        </p>
      </header>
      <Step3EnterKeyIllustration className="w-full max-w-md mx-auto" />
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--color-muted)]">
          API Key
        </label>
        <div className="flex gap-2">
          <input
            type={show ? 'text' : 'password'}
            data-testid="api-key-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-sm"
            placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide key' : 'Show key'}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        {key.length > 0 && !validation.ok && (
          <p data-testid="api-key-error" role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
            {validation.reason}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          ← Back
        </button>
        <button
          type="submit"
          data-testid="api-key-submit"
          disabled={!validation.ok || submitting}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
        >
          {submitting ? 'Validating…' : 'Continue'}
        </button>
      </div>
    </form>
  )
}
