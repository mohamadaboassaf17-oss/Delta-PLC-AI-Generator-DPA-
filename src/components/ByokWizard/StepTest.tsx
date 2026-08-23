import type { ReactElement } from 'react'
import type { SecretTestResult } from '@/types/settings'
import { Step4TestIllustration } from '@/assets/wizard'

export type StepTestState =
  | { kind: 'loading' }
  | { kind: 'success'; result: SecretTestResult }
  | { kind: 'error'; message: string }

export interface StepTestProps {
  state: StepTestState
  onDone: () => void
  onTryAgain: () => void
  onChangeProvider: () => void
}

export function StepTest({
  state,
  onDone,
  onTryAgain,
  onChangeProvider,
}: StepTestProps): ReactElement {
  return (
    <div data-testid="byok-step-4" className="flex flex-col gap-4">
      <Step4TestIllustration className="w-full max-w-md mx-auto" />
      {state.kind === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div
            data-testid="byok-loading-spinner"
            className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]"
            aria-label="Testing"
          />
          <p className="text-sm text-[var(--color-muted)]">Verifying your API key…</p>
        </div>
      )}

      {state.kind === 'success' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div
            data-testid="byok-success"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success)] text-2xl text-white"
            aria-label="Success"
          >
            ✓
          </div>
          <p className="text-sm text-[var(--color-text)]">{state.result.message}</p>
          <p className="font-mono text-xs text-[var(--color-muted)]">
            {state.result.latency_ms}ms
            {state.result.model_count !== null
              ? ` • ${state.result.model_count} models`
              : ''}
          </p>
          <button
            type="button"
            data-testid="byok-done"
            onClick={onDone}
            className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white hover:bg-[var(--color-accent-hover)]"
          >
            Done
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div
            data-testid="byok-error"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger)] text-2xl text-white"
            aria-label="Failed"
          >
            ✕
          </div>
          <p className="text-sm text-[var(--color-text)]">{state.message}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onTryAgain}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onChangeProvider}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            >
              Change provider
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
