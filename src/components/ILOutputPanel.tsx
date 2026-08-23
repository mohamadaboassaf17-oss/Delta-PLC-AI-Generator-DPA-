import { useState, useCallback, type ReactElement } from 'react'

interface ILOoutputPanelProps {
  code: string
}

export function ILOoutputPanel({ code }: ILOoutputPanelProps): ReactElement {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const hasContent = code.length > 0

  return (
    <div className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-medium text-[var(--color-text)]">
          Instruction List (IL)
        </h3>
        <button
          data-testid="copy-il-button"
          onClick={handleCopy}
          disabled={!hasContent}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {hasContent ? (
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--color-text)]">
            {code}
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
            Generated IL code will appear here
          </div>
        )}
      </div>
    </div>
  )
}
