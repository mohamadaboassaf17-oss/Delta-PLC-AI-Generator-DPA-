import type { ReactElement } from 'react'
import type { Provider } from '@/types/settings'
import { PROVIDER_LABELS } from '@/lib/providers'
import { Step2GetKeyIllustration } from '@/assets/wizard'

export interface StepGetKeyProps {
  provider: Provider
  onContinue: () => void
  onBack: () => void
}

export function StepGetKey({ provider, onContinue, onBack }: StepGetKeyProps): ReactElement {
  const label = PROVIDER_LABELS[provider]
  const instr =
    provider === 'openai'
      ? 'Log in, then click "Create new secret key". Copy the value — you will not see it again.'
      : 'Log in, then create a new key under Settings → API Keys. Copy it immediately.'
  return (
    <div data-testid="byok-step-2" className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold text-[var(--color-text)]">
          Get your {label.name} API key
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{instr}</p>
      </header>
      <Step2GetKeyIllustration className="w-full max-w-md mx-auto" />
      <a
        data-testid="provider-key-url"
        href={label.keyUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="block break-all rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-xs text-[var(--color-accent)] hover:underline"
      >
        {label.keyUrl}
      </a>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          ← Back
        </button>
        <button
          type="button"
          data-testid="byok-continue-2"
          onClick={onContinue}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white hover:bg-[var(--color-accent-hover)]"
        >
          I have my key
        </button>
      </div>
    </div>
  )
}
