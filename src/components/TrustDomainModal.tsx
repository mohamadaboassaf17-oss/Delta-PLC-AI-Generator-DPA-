import { useEffect, useRef, useState, type ReactElement } from 'react'
import { trustedDomainsAdd } from '@/lib/tauriApi'

export interface TrustDomainModalProps {
  open: boolean
  domain: string | null
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Trust on First Use (TOFU) confirmation modal for Custom Provider domains.
 *
 * Rendered when the user is about to send a request to a Custom
 * Provider endpoint whose host:port has not been previously trusted.
 * The user must explicitly confirm before the domain is added to
 * `<app_data_dir>/trusted_domains.json` and the original action
 * (save settings / test connection / generate) is allowed to proceed.
 */
export function TrustDomainModal({
  open,
  domain,
  onCancel,
  onConfirm,
}: TrustDomainModalProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset error when opening */
    if (open) {
      setErr(null)
      setSubmitting(false)
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open])

  const handleConfirm = async (): Promise<void> => {
    if (domain === null || domain === '') return
    setSubmitting(true)
    setErr(null)
    try {
      await trustedDomainsAdd(domain)
      onConfirm()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add trusted domain')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      data-testid="trust-domain-dialog"
      className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6 text-[var(--color-text)] backdrop:bg-black/50"
      onCancel={(e) => {
        e.preventDefault()
        if (!submitting) onCancel()
      }}
    >
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-yellow-500">
        <span aria-hidden="true">⚠</span>
        <span>تأكيد الثقة بمزوّد خارجي</span>
      </h2>

      <p className="mb-3 text-sm">
        أنت على وشك إرسال بيانات مشروعك (الوصف، جدول I/O، الكود) إلى:
      </p>
      <p
        data-testid="trust-domain-target"
        className="mb-3 break-all rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-center font-mono text-sm font-semibold"
      >
        {domain ?? ''}
      </p>
      <p className="mb-4 text-sm">
        هذا مزوّد خارجي لم تستخدمه من قبل. تأكد أنك تثق به قبل المتابعة.
      </p>

      {err !== null && (
        <p
          role="alert"
          className="mb-3 text-xs text-[var(--color-danger)]"
          data-testid="trust-domain-error"
        >
          {err}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          data-testid="trust-domain-cancel"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-sm disabled:opacity-50"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting || domain === null || domain === ''}
          data-testid="trust-domain-confirm"
          className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
        >
          {submitting ? '…' : 'أثق بهذا المزوّد ومتابعة'}
        </button>
      </div>
    </dialog>
  )
}
