import { type ReactElement, useCallback, useState } from 'react'
import { useReview } from '@/hooks/useReview'
import { useProject } from '@/hooks/useProject'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

function isMissingKeyErrorReview(message: string): boolean {
  return message.includes('No API key') || message.includes('API key')
}
function extractRechargeLinkReview(message: string): string | null {
  const match = message.match(/https:\/\/[^\s)]+/)
  return match ? match[0] : null
}
function hasRechargeLinkReview(message: string): boolean {
  return extractRechargeLinkReview(message) !== null
}
function renderReviewErrorWithLink(message: string): ReactElement {
  const url = extractRechargeLinkReview(message)
  if (!url) return <>{message}</>
  const parts = message.split(url)
  return (
    <>
      {parts[0]}
      <a href={url} target="_blank" rel="noreferrer" className="underline hover:text-white">
        {url}
      </a>
      {parts[1] ?? ''}
    </>
  )
}

export interface AIReviewPanelProps {
  /** Optional callback to open the chat panel (used for halt-on-conflict). */
  onOpenChat?: () => void
}

/**
 * AI Review Panel — M7.
 *
 * Renders a structured code review produced by the LLM. The review is
 * triggered manually by clicking "Run Review" — there is no automatic
 * streaming so the LLM's full output arrives in a single response.
 *
 * Three sections are displayed (when the LLM populates them):
 *  1. What the code does
 *  2. Timers & counters (with preset values)
 *  3. Edge cases & potential issues
 */
export function AIReviewPanel({ onOpenChat }: AIReviewPanelProps): ReactElement {
  const { project } = useProject()
  const { isReviewing, review, reviewError, startReview, clearReview } = useReview()
  const { isOnline } = useOnlineStatus()
  const [showRaw, setShowRaw] = useState(false)

  const handleRun = useCallback(() => {
    void startReview()
  }, [startReview])

  const hasGenerated = Boolean((project?.generated?.st ?? '').trim())

  return (
    <section
      data-testid="ai-review-panel"
      aria-label="AI Code Review"
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            AI Code Review
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Safety &amp; correctness review of the generated code.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {review ? (
            <button
              type="button"
              data-testid="ai-review-clear"
              onClick={clearReview}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            data-testid="ai-review-run"
            onClick={handleRun}
            disabled={isReviewing || !hasGenerated || !isOnline}
            aria-disabled={isReviewing || !hasGenerated || !isOnline}
            title={
              !isOnline
                ? 'Requires internet connection'
                : isReviewing
                  ? 'Review in progress — please wait'
                  : !hasGenerated
                    ? 'Generate code to enable review'
                    : 'Run AI safety review'
            }
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900/50 disabled:text-blue-200/60"
          >
            {isReviewing ? 'Reviewing…' : 'Run Review'}
          </button>
        </div>
      </header>

      {!isOnline ? (
        <p
          data-testid="ai-review-offline-notice"
          className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300"
        >
          AI Review requires internet connection.
        </p>
      ) : null}

      {!hasGenerated ? (
        <p
          data-testid="ai-review-empty"
          className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-xs text-[var(--color-text-muted)]"
        >
          No generated code to review. Use the Generate button to create one.
        </p>
      ) : null}

      {reviewError ? (
        <div
          data-testid="ai-review-error"
          className="flex flex-col gap-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300"
        >
          <span className="flex-1">{renderReviewErrorWithLink(reviewError)}</span>
          {isMissingKeyErrorReview(reviewError) && (
            <button
              type="button"
              data-testid="open-settings-from-review-error"
              onClick={() => window.dispatchEvent(new CustomEvent('dpa:open-settings'))}
              className="self-start rounded-md bg-red-900/60 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-800/80 hover:text-white transition-colors"
            >
              Open Settings →
            </button>
          )}
          {hasRechargeLinkReview(reviewError) && !isMissingKeyErrorReview(reviewError) && (
            <a
              href={extractRechargeLinkReview(reviewError) ?? '#'}
              target="_blank"
              rel="noreferrer"
              data-testid="recharge-link-review-error"
              className="self-start text-xs text-red-200 underline hover:text-white"
            >
              Recharge / Manage API key →
            </a>
          )}
        </div>
      ) : null}

      {isReviewing ? (
        <div
          data-testid="ai-review-loading"
          className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]"
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400"
          />
          <span>Reviewing generated code with the LLM…</span>
        </div>
      ) : null}

      {review && !isReviewing ? (
        <div data-testid="ai-review-result" className="flex flex-col gap-3">
          <ReviewSection
            testId="ai-review-description"
            title="What the code does"
            body={review.description || 'No description provided.'}
          />
          <ReviewSection
            testId="ai-review-timers"
            title="Timers & Counters"
            body={review.timersCounters || 'None'}
            preserveNewlines
          />
          <ReviewSection
            testId="ai-review-edge-cases"
            title="Edge Cases & Potential Issues"
            body={review.edgeCases || 'No significant issues detected.'}
            preserveNewlines
          />
          {onOpenChat ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onOpenChat}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Discuss this review in the chat panel →
              </button>
            </div>
          ) : null}
          <details
            data-testid="ai-review-raw-details"
            className="text-xs text-[var(--color-text-muted)]"
            open={showRaw}
            onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer select-none">
              Show raw response
            </summary>
            <pre className="mt-1 whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-[11px] text-[var(--color-text-muted)]">
              {[
                review.description,
                review.timersCounters,
                review.edgeCases,
              ]
                .filter(Boolean)
                .join('\n')}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  )
}

interface ReviewSectionProps {
  testId: string
  title: string
  body: string
  preserveNewlines?: boolean
}

function ReviewSection({
  testId,
  title,
  body,
  preserveNewlines = false,
}: ReviewSectionProps): ReactElement {
  return (
    <div data-testid={testId} className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </h3>
      {preserveNewlines ? (
        <pre className="whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-xs leading-relaxed text-[var(--color-text)]">
          {body}
        </pre>
      ) : (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-xs leading-relaxed text-[var(--color-text)]">
          {body}
        </p>
      )}
    </div>
  )
}

export default AIReviewPanel
