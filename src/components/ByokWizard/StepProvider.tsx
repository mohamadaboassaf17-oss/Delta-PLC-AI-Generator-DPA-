import type { ReactElement } from 'react'
import type { Provider } from '@/types/settings'
import { PROVIDER_LABELS } from '@/lib/providers'
import { Step1ProviderIllustration } from '@/assets/wizard'

export interface StepProviderProps {
  selected: Provider | null
  onSelect: (provider: Provider) => void
  onContinue: () => void
  onSkip: () => void
}

export function StepProvider({
  selected,
  onSelect,
  onContinue,
  onSkip,
}: StepProviderProps): ReactElement {
  const providers = Object.keys(PROVIDER_LABELS) as Provider[]
  return (
    <div data-testid="byok-step-1" className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Choose your provider</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          You can switch later in Settings.
        </p>
      </header>
      <Step1ProviderIllustration className="w-full max-w-md mx-auto" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {providers.map((p) => {
          const label = PROVIDER_LABELS[p]
          const active = selected === p
          return (
            <button
              key={p}
              type="button"
              data-testid={`provider-${p}`}
              onClick={() => onSelect(p)}
              className={`flex items-center gap-3 rounded-lg border p-4 text-left ${
                active
                  ? 'border-[var(--color-accent)] bg-[var(--color-panel)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)]'
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-border)] font-mono text-sm"
              >
                {label.abbreviation}
              </span>
              <span>
                <span className="block text-sm font-medium text-[var(--color-text)]">
                  {label.name}
                </span>
                <span className="block text-xs text-[var(--color-muted)]">
                  {p === 'openai' ? 'GPT-4o, GPT-4.1' : 'Claude 3.5/3.7 Sonnet'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          data-testid="byok-skip"
          onClick={onSkip}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Skip for now
        </button>
        <button
          type="button"
          data-testid="byok-continue-1"
          onClick={onContinue}
          disabled={selected === null}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
