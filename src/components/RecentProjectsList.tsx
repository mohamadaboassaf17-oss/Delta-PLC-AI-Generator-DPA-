import type { ReactElement } from 'react'
import type { RecentEntry } from '@/types/project'
import { formatRelative } from '@/lib/version'

export interface RecentProjectsListProps {
  recents: RecentEntry[]
  loading: boolean
  onSelect: (entry: RecentEntry) => void
  onRemove?: (entry: RecentEntry) => void
}

function SkeletonRow(): ReactElement {
  return (
    <div
      data-testid="recent-skeleton-row"
      className="flex animate-pulse items-center justify-between border-b border-[var(--color-border)] py-2 last:border-b-0"
    >
      <div className="h-3 w-32 rounded bg-[var(--color-border)]" />
      <div className="h-3 w-16 rounded bg-[var(--color-border)]" />
    </div>
  )
}

export function RecentProjectsList({
  recents,
  loading,
  onSelect,
  onRemove,
}: RecentProjectsListProps): ReactElement {
  if (loading) {
    return (
      <div data-testid="recent-loading" className="flex flex-col">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  if (recents.length === 0) {
    return (
      <div
        data-testid="recent-empty"
        className="py-8 text-center text-sm text-[var(--color-muted)]"
      >
        No recent projects
      </div>
    )
  }

  return (
    <ul data-testid="recent-list" className="divide-y divide-[var(--color-border)]">
      {recents.map((entry) => (
        <li
          key={entry.id}
          data-testid="recent-row"
          className="flex items-center justify-between gap-2 py-2"
        >
          <button
            type="button"
            onClick={() => onSelect(entry)}
            className="flex flex-1 flex-col items-start text-left"
          >
            <span className="text-sm text-[var(--color-text)]">{entry.name}</span>
            <span className="font-mono text-xs text-[var(--color-muted)]">{entry.path}</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[var(--color-muted)]">
              {formatRelative(entry.last_opened)}
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(entry)}
                aria-label={`Remove ${entry.name}`}
                className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
              >
                ×
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
