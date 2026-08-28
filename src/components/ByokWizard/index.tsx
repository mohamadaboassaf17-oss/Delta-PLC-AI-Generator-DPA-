import { useEffect, useRef, useState, type ReactElement, type SyntheticEvent } from 'react'
import type { Provider, SecretTestResult } from '@/types/settings'
import { safeInvoke, secretTest } from '@/lib/tauriApi'
import { StepProvider } from './StepProvider'
import { StepGetKey } from './StepGetKey'
import { StepEnterKey } from './StepEnterKey'
import { StepTest, type StepTestState } from './StepTest'

const STORAGE_KEY = 'dpa.byok.progress.v1'
const ONBOARDED_KEY = 'dpa.onboarded'

type WizardStep = 1 | 2 | 3 | 4

interface PersistedState {
  step: WizardStep
  provider: Provider | null
}

function loadPersisted(): PersistedState {
  if (typeof window === 'undefined') return { step: 1, provider: null }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { step: 1, provider: null }
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const step: WizardStep = parsed.step === 2 || parsed.step === 3 || parsed.step === 4 ? parsed.step : 1
    const provider: Provider | null =
      parsed.provider === 'openai' ||
      parsed.provider === 'anthropic' ||
      parsed.provider === 'gemini' ||
      parsed.provider === 'custom'
        ? (parsed.provider as Provider)
        : null
    return { step, provider }
  } catch {
    return { step: 1, provider: null }
  }
}

function savePersisted(state: PersistedState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function clearPersisted(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function markOnboarded(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export interface ByokWizardProps {
  open: boolean
  onComplete: () => void
  onSkip: () => void
}

export function ByokWizard({ open, onComplete, onSkip }: ByokWizardProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [step, setStep] = useState<WizardStep>(1)
  const [provider, setProvider] = useState<Provider | null>(null)
  const [testState, setTestState] = useState<StepTestState>({ kind: 'loading' })
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync wizard state with open prop and persisted progress */
    if (open) {
      const persisted = loadPersisted()
      setStep(persisted.step)
      setProvider(persisted.provider)
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open])

  useEffect(() => {
    savePersisted({ step, provider })
  }, [step, provider])

  const handleSelectProvider = (p: Provider): void => {
    setProvider(p)
  }

  const handleContinueFromProvider = (): void => {
    if (provider) setStep(2)
  }

  const handleContinueFromGetKey = (): void => {
    setStep(3)
  }

  const handleSubmitKey = async (key: string): Promise<void> => {
    if (!provider) return
    setPendingKey(key)
    setStep(4)
    setTestState({ kind: 'loading' })
    const storeResult = await safeInvoke<void>('secret_set', { provider, key })
    if (storeResult.error) {
      setTestState({ kind: 'error', message: `Failed to store key: ${storeResult.error}` })
      return
    }
    try {
      const result: SecretTestResult = await secretTest(provider, key)
      if (result.ok) {
        setTestState({ kind: 'success', result })
      } else {
        setTestState({ kind: 'error', message: result.message })
      }
    } catch (err) {
      setTestState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Test failed',
      })
    }
  }

  const handleDone = (): void => {
    markOnboarded()
    clearPersisted()
    onComplete()
  }

  const handleSkipAll = (): void => {
    markOnboarded()
    clearPersisted()
    onSkip()
  }

  const handleTryAgain = (): void => {
    if (pendingKey && provider) {
      void handleSubmitKey(pendingKey)
    } else {
      setStep(3)
    }
  }

  const handleChangeProvider = (): void => {
    setTestState({ kind: 'loading' })
    setPendingKey(null)
    setStep(1)
  }

  const handleCancel = (e: SyntheticEvent<HTMLDialogElement>): void => {
    e.preventDefault()
    handleSkipAll()
  }

  return (
    <dialog
      ref={dialogRef}
      data-testid="byok-dialog"
      className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6 text-[var(--color-text)] backdrop:bg-black/60"
      onCancel={handleCancel}
    >
      {step === 1 && (
        <StepProvider
          selected={provider}
          onSelect={handleSelectProvider}
          onContinue={handleContinueFromProvider}
          onSkip={handleSkipAll}
        />
      )}
      {step === 2 && provider && (
        <StepGetKey
          provider={provider}
          onContinue={handleContinueFromGetKey}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && provider && (
        <StepEnterKey
          provider={provider}
          onSubmit={handleSubmitKey}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <StepTest
          state={testState}
          onDone={handleDone}
          onTryAgain={handleTryAgain}
          onChangeProvider={handleChangeProvider}
        />
      )}

      <div className="mt-6 flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4].map((s) => (
          <span
            key={s}
            data-testid={`byok-step-dot-${s}`}
            className={`h-1.5 w-6 rounded-full ${
              s === step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
            }`}
          />
        ))}
      </div>
    </dialog>
  )
}
