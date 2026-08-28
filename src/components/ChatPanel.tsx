import { useState, useCallback, type ReactElement, type ChangeEvent, type FormEvent } from 'react'
import { useProject } from '@/hooks/useProject'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useChat } from '@/hooks/useChat'

function isMissingKeyErrorChat(message: string): boolean {
  return message.includes('No API key') || message.includes('API key')
}
function extractRechargeLinkChat(message: string): string | null {
  const match = message.match(/https:\/\/[^\s)]+/)
  return match ? match[0] : null
}
function hasRechargeLinkChat(message: string): boolean {
  return extractRechargeLinkChat(message) !== null
}
function renderChatErrorWithLink(message: string): ReactElement {
  const url = extractRechargeLinkChat(message)
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

interface ChatPanelProps {
  /** When false the panel returns null. Defaults to true so the panel can be embedded inline (e.g., as a sidebar tab). */
  isOpen?: boolean
  /** Optional close handler. When omitted, the close button is not rendered (panel is non-dismissable, e.g., as a sidebar tab). */
  onClose?: () => void
}

export function ChatPanel({ isOpen = true, onClose }: ChatPanelProps): ReactElement {
  const { chatHistory, setChatHistory } = useProject()
  const { isOnline } = useOnlineStatus()
  // Modification lifecycle (streaming, diff, apply/reject, Custom-provider
  // plumbing) lives entirely in useChat — see hooks/useChat.ts.
  const {
    isModifying,
    streamingSt,
    modificationError,
    showDiff,
    pendingSt,
    startModification,
    applyModification,
    rejectModification,
  } = useChat()
  const [inputValue, setInputValue] = useState('')

  const handleClearChat = useCallback(() => {
    setChatHistory([])
  }, [setChatHistory])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (inputValue.trim() && !isModifying) {
      startModification(inputValue)
      setInputValue('')
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
  }

  if (!isOpen) return <></>

  return (
    <div
      data-testid="chat-panel"
      className="flex h-full w-full flex-col border-l border-[var(--color-border)] bg-[var(--color-panel)]"
      role="dialog"
      aria-label="Chat Panel"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
        <h2 className="text-sm font-medium text-[var(--color-text)]">Chat</h2>
        <div className="flex items-center gap-1">
          {chatHistory.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              data-testid="clear-chat-button"
              className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] transition-colors"
              aria-label="Clear chat"
              title="Clear chat"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] transition-colors"
              aria-label="Close chat panel"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto flex flex-col p-4 gap-3">
        {chatHistory.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-muted)]">
            No messages yet. Ask a question or request a modification.
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3">
          {chatHistory.map((msg, idx) => (
            <div
              key={`${msg.timestamp}-${idx}`}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-[var(--color-accent)] text-white rounded-tr-none'
                    : 'bg-[var(--color-bg)] text-[var(--color-text)] rounded-tl-none'
                }`}
              >
                {msg.content}
                {msg.proposal && (
                  <div className="mt-2 p-2 rounded bg-[var(--color-border)] text-xs font-mono">
                    <div className="text-[var(--color-muted)] mb-1">Proposed ST:</div>
                    <pre className="whitespace-pre-wrap max-h-32 overflow-auto">{msg.proposal.st}</pre>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isModifying && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] rounded-tl-none animate-pulse">
                {streamingSt || 'Generating...'}
              </div>
            </div>
          )}

          {showDiff && pendingSt && (
            <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-panel)] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--color-text)]">Proposed Changes</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={rejectModification}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)]"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={applyModification}
                    className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs text-white hover:bg-[var(--color-accent-hover)]"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div className="rounded bg-[var(--color-bg)] p-2 max-h-64 overflow-auto">
                <pre className="font-mono text-xs whitespace-pre-wrap text-[var(--color-text)]">{pendingSt}</pre>
              </div>
            </div>
          )}
        </div>

        {modificationError && (
          <div
            data-testid="chat-error-banner"
            className="flex flex-col gap-2 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300"
            role="alert"
          >
            <span>{renderChatErrorWithLink(modificationError)}</span>
            {isMissingKeyErrorChat(modificationError) && (
              <button
                type="button"
                data-testid="open-settings-from-chat-error"
                onClick={() => window.dispatchEvent(new CustomEvent('dpa:open-settings'))}
                className="self-start rounded-md bg-red-900/60 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-800/80 hover:text-white transition-colors"
              >
                Open Settings →
              </button>
            )}
            {hasRechargeLinkChat(modificationError) && !isMissingKeyErrorChat(modificationError) && (
              <a
                href={extractRechargeLinkChat(modificationError) ?? '#'}
                target="_blank"
                rel="noreferrer"
                data-testid="recharge-link-chat-error"
                className="self-start text-xs text-red-200 underline hover:text-white"
              >
                Recharge / Manage API key →
              </a>
            )}
          </div>
        )}

        {!isOnline && (
          <p
            data-testid="chat-offline-notice"
            className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300"
          >
            Chat requires internet connection.
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 shrink-0">
          <textarea
            data-testid="chat-input"
            value={inputValue}
            onChange={handleInputChange}
            disabled={isModifying || !isOnline}
            rows={3}
            placeholder="Ask for a modification... (e.g., 'Change M10 to M20')"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none resize-none disabled:opacity-50"
            aria-label="Chat input"
          />
          <button
            type="submit"
            data-testid="chat-send-button"
            disabled={isModifying || !inputValue.trim() || !isOnline}
            aria-disabled={isModifying || !inputValue.trim() || !isOnline}
            title={
              !isOnline
                ? 'Requires internet connection'
                : isModifying
                  ? 'Generation in progress — please wait'
                  : !inputValue.trim()
                    ? 'Enter a modification request first'
                    : 'Send modification request'
            }
            className="self-end rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isModifying ? 'Generating...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
