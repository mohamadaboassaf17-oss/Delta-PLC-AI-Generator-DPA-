import {
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

  const isDisabled = isGenerating || disabled === true

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
      <button
        type="submit"
        data-testid="generate-button"
        disabled={isDisabled || !description.trim()}
        className="self-end flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
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
    </form>
  )
}
