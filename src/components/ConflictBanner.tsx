import { type ReactElement } from 'react'
import type { ConflictReport } from '@/lib/tauriApi'

export interface ConflictBannerProps {
  report: ConflictReport | null
  isScanning: boolean
  error: string | null
  onOpenChat?: () => void
}

const KIND_LABEL: Record<string, string> = {
  'undefined': 'Undefined address',
  'type-mismatch': 'Type mismatch',
  'hmi-reserved': 'HMI-reserved address',
}

function pluralizeArabicConflicts(count: number): string {
  // Arabic pluralization: للأعداد 2-10 (وحدة مجمع سالم) نستخدم "تعارضات"
  // للعدد 1: "تعارض" (مفرد)
  // للأعداد 11-99: "تعارضًا" (مفرد مع تنوين)
  // للعدد 0: لا نعرض
  if (count === 1) return 'تعارض'
  if (count >= 2 && count <= 10) return 'تعارضات'
  return 'تعارضًا'
}

/**
 * Displays address-conflict warnings for the generated ST code. Renders
 * nothing when there are no conflicts.
 *
 * Shows a red, role="alert" banner with the conflict count in Arabic
 * and a "Show Details" (عرض التفاصيل) button. The button only opens
 * the chat panel on user click — the banner itself never auto-opens
 * the chat panel (M10.2.2).
 */
export function ConflictBanner({
  report,
  isScanning,
  error,
  onOpenChat,
}: ConflictBannerProps): ReactElement | null {
  if (error) {
    return (
      <div
        data-testid="conflict-banner-error"
        className="flex items-start gap-2 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300"
      >
        <span>Conflict scan failed: {error}</span>
      </div>
    )
  }

  if (isScanning && (!report || report.conflicts.length === 0)) {
    return (
      <div
        data-testid="conflict-banner-scanning"
        className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-xs text-[var(--color-text-muted)]"
      >
        <span>Scanning generated code for address conflicts…</span>
      </div>
    )
  }

  if (!report || report.conflicts.length === 0) {
    return null
  }

  const count = report.conflictingAddresses
  const noun = pluralizeArabicConflicts(count)

  return (
    <div
      data-testid="conflict-banner"
      role="alert"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-md border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200"
    >
      <div
        dir="rtl"
        className="flex items-center gap-3"
      >
        <span aria-hidden="true" className="text-base leading-none">
          ⚠
        </span>
        <span
          data-testid="conflict-banner-count"
          className="flex-1 text-right font-medium"
        >
          تم اكتشاف {count} {noun} في العناوين
        </span>
        {onOpenChat ? (
          <button
            type="button"
            data-testid="conflict-banner-show-details"
            onClick={onOpenChat}
            className="shrink-0 rounded-md border border-red-500 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            عرض التفاصيل
          </button>
        ) : null}
      </div>

      {report.shouldHalt ? (
        <p dir="rtl" className="mr-7 text-right text-xs text-red-300/80">
          تم إيقاف العرض مؤقتاً حتى يتم حل التعارضات. افتح لوحة المحادثة
          لتطلب من النموذج إصلاح الكود.
        </p>
      ) : (
        <p dir="rtl" className="mr-7 text-right text-xs text-red-300/80">
          تم تمييز العناوين المتعارضة داخل الكود.
        </p>
      )}

      <ul
        data-testid="conflict-list"
        className="ml-7 list-disc space-y-1 text-xs leading-relaxed"
      >
        {report.conflicts.map((c, idx) => (
          <li key={`${c.normalized}-${idx}`} data-testid="conflict-item">
            <span className="font-mono text-red-200">{c.address}</span>
            {c.line ? (
              <span className="ml-2 text-red-400/80">line {c.line}</span>
            ) : null}
            <span className="ml-2 text-red-300/80">
              {KIND_LABEL[c.kind] ?? c.kind} — {c.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ConflictBanner
