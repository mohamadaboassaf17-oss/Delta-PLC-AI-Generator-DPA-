import { useState, type FormEvent, type ReactElement } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { APP_VERSION } from '@/lib/version'
import { useProject } from '@/hooks/useProject'
import { useRecentProjects } from '@/hooks/useRecentProjects'
import { RecentProjectsList } from '@/components/RecentProjectsList'

export interface WelcomeScreenProps {
  onOpenSettings: () => void
}

export function WelcomeScreen({ onOpenSettings }: WelcomeScreenProps): ReactElement {
  const { createNew, openExisting, error, status } = useProject()
  const { recents, loading, refresh, remove } = useRecentProjects()
  const [showNewForm, setShowNewForm] = useState<boolean>(false)
  const [name, setName] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)

  const handleOpen = async (): Promise<void> => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'DPA Project', extensions: ['dpa'] }],
    })
    if (typeof selected === 'string' && selected.length > 0) {
      await openExisting(selected)
      void refresh()
    }
  }

  const handleNewClick = (): void => {
    setShowNewForm(true)
  }

  const handleNewSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    setSubmitting(true)
    try {
      await createNew(trimmed)
      void refresh()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectRecent = async (entry: { path: string }): Promise<void> => {
    await openExisting(entry.path)
    void refresh()
  }

  const handleRemoveRecent = (entry: { path: string }): void => {
    void remove(entry.path)
  }

  return (
    <main
      data-testid="welcome-screen"
      className="flex flex-1 flex-col items-stretch justify-start gap-8 overflow-auto p-8"
    >
      <header className="mx-auto flex max-w-2xl flex-col items-center gap-2 pt-8 text-center">
        <h1 className="text-3xl font-semibold text-[var(--color-text)]">
          Delta PLC AI Generator
        </h1>
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
          v{APP_VERSION}
        </p>
      </header>

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        {!showNewForm && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              data-testid="new-project-btn"
              onClick={handleNewClick}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6 text-left hover:border-[var(--color-accent)]"
            >
              <h2 className="text-lg font-medium text-[var(--color-text)]">New Project</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Start a fresh DPA project from scratch.
              </p>
            </button>
            <button
              type="button"
              data-testid="open-project-btn"
              onClick={handleOpen}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6 text-left hover:border-[var(--color-accent)]"
            >
              <h2 className="text-lg font-medium text-[var(--color-text)]">Open Project…</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Load an existing <code>.dpa</code> file.
              </p>
            </button>
          </div>
        )}

        {showNewForm && (
          <form
            data-testid="new-project-form"
            onSubmit={handleNewSubmit}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6"
          >
            <h2 className="text-lg font-medium text-[var(--color-text)]">Name your project</h2>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My PLC Project"
                disabled={submitting}
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={submitting || name.trim().length === 0}
                className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
              >
                {submitting ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewForm(false)
                  setName('')
                }}
                disabled={submitting}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {status === 'saving' && (
          <p className="text-sm text-[var(--color-muted)]">Working…</p>
        )}
      </section>

      <section className="mx-auto w-full max-w-2xl">
        <h3 className="mb-2 text-sm font-medium text-[var(--color-text)]">Recent Projects</h3>
        <RecentProjectsList
          recents={recents}
          loading={loading}
          onSelect={(e) => void handleSelectRecent(e)}
          onRemove={handleRemoveRecent}
        />
      </section>

      <div className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          data-testid="skip-to-settings"
          onClick={onOpenSettings}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Skip to Settings →
        </button>
      </div>
    </main>
  )
}
