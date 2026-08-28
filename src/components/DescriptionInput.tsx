import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type FormEvent,
  type ChangeEvent,
} from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/components/Toast'
import { ProjectContext } from '@/context/ProjectContext'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'

interface DescriptionInputProps {
  onGenerate: (desc: string) => void
  isGenerating: boolean
  disabled?: boolean
}

export function DescriptionInput({
  onGenerate,
  isGenerating,
  disabled,
}: DescriptionInputProps): ReactElement {
  // ProjectContext is the source of truth for "which project is active".
  // We read it via `useContext` (not the throwing `useProject` hook) so
  // this component still renders in isolated unit tests that don't wrap
  // it in <ProjectProvider>.
  const projectCtx = useContext(ProjectContext)
  const project = projectCtx?.project ?? null

  // M10.3.3 — seed the textarea from project.meta.description so that
  // (a) opening a .dpa with a saved description restores it, and
  // (b) starting a new project (or switching projects) clears the
  // textarea instead of leaking the previous prompt across projects.
  const initialDescription = project?.meta?.description ?? ''
  const [description, setDescription] = useState<string>(initialDescription)
  const lastProjectIdRef = useRef<string | null>(project?.id ?? null)
  const { settings } = useSettings()
  const toast = useToast()

  // Re-sync to project metadata whenever the active project changes
  // (creation, open, or close). Tracking by project id prevents an
  // infinite loop when the user types and the project marks dirty.
  useEffect(() => {
    const currentId = project?.id ?? null
    if (currentId !== lastProjectIdRef.current) {
      setDescription(project?.meta?.description ?? '')
      lastProjectIdRef.current = currentId
    }
  }, [project?.id, project?.meta?.description])

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    if (!description.trim() || isGenerating || disabled) return
    if (settings.generation.model.trim() === '') {
      toast.error('Please select a model in Settings before generating code.')
      return
    }
    onGenerate(description.trim())
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setDescription(e.target.value)
  }

  const handleSpeechTranscript = useCallback((text: string) => {
    setDescription((prev) => (prev ? `${prev} ${text}` : text))
  }, [])

  const { isSupported: isSpeechSupported, isListening, error: speechError, start: startListening, stop: stopListening } =
    useSpeechRecognition(handleSpeechTranscript, 'ar-SA')

  const handleMicClick = useCallback(() => {
    if (isListening) stopListening()
    else startListening()
  }, [isListening, startListening, stopListening])

  const isDisabled = isGenerating || disabled === true
  const isGenerateDisabled = isDisabled || !description.trim()
  const generateTitle = isGenerating
    ? 'Generation in progress — please wait'
    : disabled
      ? 'Create or open a project first'
      : !description.trim()
        ? 'Enter a description first'
        : settings.generation.model.trim() === ''
          ? 'Select a model in Settings first'
          : 'Generate PLC code'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        data-testid="description-textarea"
        className="w-full min-h-[120px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-y disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder="Describe your PLC automation task, e.g.&#58; When the start button (X0) is pressed and the safety gate (X1) is closed, the conveyor motor (Y0) runs for 5 seconds. After 5 seconds, the diverter solenoid (Y1) activates for 2 seconds."
        value={description}
        onChange={handleChange}
        disabled={isDisabled}
        rows={4}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isSpeechSupported ? (
            <button
              type="button"
              data-testid="voice-button"
              onClick={handleMicClick}
              disabled={isDisabled}
              aria-disabled={isDisabled}
              aria-pressed={isListening}
              title={
                isDisabled
                  ? 'Create or open a project first'
                  : isListening
                    ? 'Stop recording'
                    : 'Record voice description (Arabic/English)'
              }
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isListening
                  ? 'border-red-500 bg-red-950/30 text-red-300 animate-pulse'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] hover:bg-[var(--color-panel)]'
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                <path d="M19 10a7 7 0 0 1-14 0" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              {isListening ? 'Listening…' : 'Voice'}
            </button>
          ) : null}
          {isListening ? (
            <span className="text-xs text-red-300 animate-pulse" data-testid="voice-listening-indicator">
              Listening…
            </span>
          ) : null}
          {speechError ? (
            <span className="text-xs text-amber-300" data-testid="voice-error" title={speechError}>
              {speechError}
            </span>
          ) : null}
        </div>
        <button
          type="submit"
          data-testid="generate-button"
          disabled={isGenerateDisabled}
          aria-disabled={isGenerateDisabled}
          title={generateTitle}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
        {isGenerating ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
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
            Generating...
          </>
        ) : (
          'Generate Code'
        )}
        </button>
      </div>
    </form>
  )
}
