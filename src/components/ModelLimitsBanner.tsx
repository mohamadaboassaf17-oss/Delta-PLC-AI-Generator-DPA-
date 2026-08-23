import { type ReactElement } from 'react'
import type { ModelLimitResult } from '@/lib/tauriApi'

export interface ModelLimitsBannerProps {
  limits: ModelLimitResult | null
  isLoading: boolean
  error: string | null
}

/**
 * Yellow warning banner that appears when the project's I/O count
 * exceeds the selected DVP model's base-unit limits.
 *
 * The banner is hidden entirely when there is no model selected, no
 * I/O entries to check, or no excess in any category. When at least
 * one category is over the limit, every excess category is listed.
 */
export function ModelLimitsBanner({
  limits,
  isLoading,
  error,
}: ModelLimitsBannerProps): ReactElement | null {
  if (isLoading) {
    return (
      <div
        data-testid="model-limits-banner-loading"
        className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-xs text-[var(--color-text-muted)]"
      >
        <span>Checking I/O limits…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        data-testid="model-limits-banner-error"
        className="flex items-start gap-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300"
      >
        <span>Model limit check failed: {error}</span>
      </div>
    )
  }

  if (!limits || !limits.anyExcess) {
    return null
  }

  const excesses: string[] = []
  if (limits.xExcess > 0) excesses.push(`X: +${limits.xExcess}`)
  if (limits.yExcess > 0) excesses.push(`Y: +${limits.yExcess}`)
  if (limits.mExcess > 0) excesses.push(`M: +${limits.mExcess}`)
  if (limits.tExcess > 0) excesses.push(`T: +${limits.tExcess}`)
  if (limits.cExcess > 0) excesses.push(`C: +${limits.cExcess}`)

  return (
    <div
      data-testid="model-limits-banner"
      role="alert"
      className="flex items-start gap-3 rounded-md border border-yellow-700 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-200"
    >
      <svg
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className="flex-1">
        <div className="font-medium">
          I/O count exceeds {limits.model} base-unit limits
        </div>
        <div className="mt-0.5 text-xs text-yellow-300/80">
          {excesses.join(' · ')} — an expansion card is required.
        </div>
      </div>
    </div>
  )
}

export default ModelLimitsBanner
