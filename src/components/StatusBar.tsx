import type { ReactElement } from 'react'
import { APP_VERSION } from '@/lib/version'
import { useProject } from '@/hooks/useProject'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePerfMonitorVisibility } from '@/hooks/usePerfMonitorVisibility'
import { useSettings } from '@/hooks/useSettings'
import { PerformanceMonitor } from '@/components/PerformanceMonitor'

/** Human-readable label for the active provider shown in the StatusBar badge. */
function providerLabel(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    case 'gemini':
      return 'Gemini'
    case 'custom':
      return 'Custom'
    default:
      return provider
  }
}

export function StatusBar(): ReactElement {
  const { project, isDirty } = useProject()
  const { isOnline } = useOnlineStatus()
  const { settings } = useSettings()
  const { visible: perfVisible, toggle: togglePerf } = usePerfMonitorVisibility()
  const dirtyLabel = isDirty ? ' • unsaved' : ''
  // For Custom the model name lives in `custom_model_name`; for built-in
  // providers it lives in `generation.model`. Trim and fall back to "—"
  // when neither is set so the badge never shows an empty trailing slot.
  const isCustom = settings.active_provider === 'custom'
  const activeModel = isCustom
    ? (settings.custom_model_name ?? '').trim()
    : settings.generation.model.trim()
  const modelLabel = activeModel === '' ? '—' : activeModel
  return (
    <footer
      data-testid="status-bar"
      className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-panel)] px-4 text-xs text-[var(--color-muted)]"
    >
      <span className="font-mono">v{APP_VERSION}</span>
      <span className="truncate px-2" data-testid="status-bar-project">
        {project ? `${project.name}${dirtyLabel}` : ''}
      </span>
      <span
        data-testid="status-bar-provider"
        title={`Active provider: ${providerLabel(settings.active_provider)}`}
        className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono"
      >
        <span aria-hidden="true" className="text-[var(--color-accent)]">●</span>
        <span>{providerLabel(settings.active_provider)}</span>
        <span className="text-[var(--color-muted)]">·</span>
        <span data-testid="status-bar-model">{modelLabel}</span>
      </span>
      <span className="flex items-center gap-3">
        {!isOnline && (
          <span
            data-testid="offline-indicator"
            role="status"
            aria-label="Offline"
            title="No internet connection. AI features are disabled; local features still work."
            className="flex items-center gap-1 rounded-md border border-amber-700/60 bg-amber-950/40 px-1.5 py-0.5 font-medium text-amber-300"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <span>Offline</span>
          </span>
        )}
        <span className="font-mono text-[var(--color-muted)]">theme: auto</span>
        <button
          type="button"
          data-testid="perf-monitor-toggle"
          aria-pressed={perfVisible}
          aria-label="Toggle performance monitor"
          onClick={togglePerf}
          className="rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-[var(--color-muted)] hover:border-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          Dev stats
        </button>
        {import.meta.env.DEV && perfVisible && <PerformanceMonitor />}
      </span>
    </footer>
  )
}
