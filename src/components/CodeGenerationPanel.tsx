import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useGeneration } from '@/hooks/useGeneration'
import { DescriptionInput } from '@/components/DescriptionInput'
import { STOutputPanel } from '@/components/STOutputPanel'
import { ILOoutputPanel } from '@/components/ILOutputPanel'
import { LadderOutputPanel } from '@/components/LadderOutputPanel'
import { ConflictBanner } from '@/components/ConflictBanner'
import { useProject } from '@/hooks/useProject'
import { useCodeConflicts } from '@/hooks/useCodeConflicts'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { renderLadder } from '@/lib/tauriApi'

export interface CodeGenerationPanelProps {
  /** Optional callback to open the chat panel — invoked only when the user clicks the conflict banner's "Show Details" button. */
  onOpenChat?: () => void
}

type ActiveTab = 'st' | 'ld' | 'il'

interface TabDescriptor {
  readonly id: ActiveTab
  readonly label: string
  readonly testId: string
}

const TABS: readonly TabDescriptor[] = [
  { id: 'st', label: 'Structured Text', testId: 'tab-st' },
  { id: 'ld', label: 'Ladder Diagram', testId: 'tab-ld' },
  { id: 'il', label: 'Instruction List', testId: 'tab-il' },
]

function isMissingKeyError(message: string): boolean {
  return message.includes('No API key') || message.includes('API key')
}

function extractRechargeLink(message: string): string | null {
  const match = message.match(/https:\/\/[^\s)]+/)
  return match ? match[0] : null
}

function hasRechargeLink(message: string): boolean {
  return extractRechargeLink(message) !== null
}

function renderErrorWithLink(message: string): ReactElement {
  const url = extractRechargeLink(message)
  if (!url) return <>{message}</>
  const parts = message.split(url)
  return (
    <>
      {parts[0]}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-white"
      >
        {url}
      </a>
      {parts[1] ?? ''}
    </>
  )
}

export default function CodeGenerationPanel({
  onOpenChat,
}: CodeGenerationPanelProps = {}): ReactElement {
  const { project, setGenerated } = useProject()
  const {
    isGenerating,
    streamingSt,
    streamingIl,
    generationError,
    startGeneration,
    clearGeneration,
  } = useGeneration()
  const {
    report: conflictReport,
    isScanning: isScanningConflicts,
    error: conflictScanError,
  } = useCodeConflicts()
  const { isOnline } = useOnlineStatus()

  const hasProject = project !== null
  const ladderGraph = project?.generated?.ld ?? null

  // M6.1 — Deterministic ST→LD fallback via `render_ladder` IPC.
  // The happy path pre-computes `ldGraph` in the `generation-done` /
  // `modification-done` payload (`generation.rs:432,446`). This effect covers
  // legacy `.dpa` files (v2) or manual edits where `st` exists but `ld` is
  // missing/empty, healing the graph lazily without blocking render.
  const lastHealedStRef = useRef<string | null>(null)
  useEffect(() => {
    const st = project?.generated?.st
    const ld = project?.generated?.ld
    if (!st || isGenerating) return
    if (ld && ld.nodes.length > 0) return
    if (lastHealedStRef.current === st) return
    lastHealedStRef.current = st
    void renderLadder(st).then((res) => {
      if (res.data && res.data.nodes.length > 0 && project?.generated) {
        setGenerated({ ...project.generated, ld: res.data })
      }
    })
  }, [project?.generated?.st, project?.generated?.ld, project?.generated, isGenerating, setGenerated])

  // Local-only UI state — intentionally NOT persisted in `.dpa` (per PRD §7
  // and AGENTS.md: "Active tab state is local UI state").
  const [activeTab, setActiveTab] = useState<ActiveTab>('st')
  const [isLdMaximized, setIsLdMaximized] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const openChat = useCallback(() => {
    if (onOpenChat) onOpenChat()
  }, [onOpenChat])

  const handleSelectTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab)
  }, [])

  const handleMaximizeLd = useCallback(() => {
    setIsLdMaximized(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsLdMaximized(false)
  }, [])

  // Escape key closes the fullscreen modal.
  useEffect(() => {
    if (!isLdMaximized) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsLdMaximized(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isLdMaximized])

  // Lock body scroll + move focus into the modal while it's open. Restores
  // the previous overflow value on close to play nicely with other overlays.
  useEffect(() => {
    if (!isLdMaximized) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isLdMaximized])

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <DescriptionInput
          onGenerate={startGeneration}
          isGenerating={isGenerating}
          disabled={!hasProject || !isOnline}
        />
        {!isOnline && (
          <p
            data-testid="generation-offline-notice"
            className="mt-2 text-xs text-amber-300"
          >
            You&apos;re offline — Generate is disabled. Local features still work.
          </p>
        )}
      </div>

      {generationError && (
        <div
          data-testid="generation-error-banner"
          className="flex items-start gap-3 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex flex-1 flex-col gap-2">
            <span>{renderErrorWithLink(generationError)}</span>
            {isMissingKeyError(generationError) && (
              <button
                type="button"
                data-testid="open-settings-from-generation-error"
                onClick={() => window.dispatchEvent(new CustomEvent('dpa:open-settings'))}
                className="self-start rounded-md bg-red-900/60 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-800/80 hover:text-white transition-colors"
              >
                Open Settings →
              </button>
            )}
            {hasRechargeLink(generationError) && !isMissingKeyError(generationError) && (
              <a
                href={extractRechargeLink(generationError) ?? '#'}
                target="_blank"
                rel="noreferrer"
                data-testid="recharge-link-generation-error"
                className="self-start text-xs text-red-200 underline hover:text-white"
              >
                Recharge / Manage API key →
              </a>
            )}
          </div>
          <button
            className="shrink-0 text-red-400 hover:text-red-300 transition-colors"
            onClick={clearGeneration}
            aria-label="Dismiss error"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <ConflictBanner
        report={conflictReport}
        isScanning={isScanningConflicts}
        error={conflictScanError}
        onOpenChat={openChat}
      />

      {/*
        M10.2.2: Removed the `shouldHalt` overlay branch that previously
        replaced the entire code area with a "rendering paused" panel
        containing an "Open chat panel" button. The ConflictBanner above
        now surfaces conflicts and provides an explicit "Show Details"
        (عرض التفاصيل) button so the user — not the app — decides when
        to switch to the chat tab.
      */}
      <div
        data-testid="code-tabs-container"
        className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]"
      >
        <div
          role="tablist"
          aria-label="Generated code views"
          className="flex items-center border-b border-[var(--color-border)] px-2"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                data-testid={tab.testId}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => handleSelectTab(tab.id)}
                className={`-mb-px px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
          {activeTab === 'ld' && (
            <button
              type="button"
              data-testid="maximize-ld-button"
              aria-label="Maximize Ladder Diagram"
              onClick={handleMaximizeLd}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              <span aria-hidden="true">⤢</span>
              Maximize
            </button>
          )}
        </div>

        <div className="min-h-[500px] p-4">
          <div
            role="tabpanel"
            id="tabpanel-st"
            data-testid="tabpanel-st"
            aria-labelledby="tab-st"
            hidden={activeTab !== 'st'}
            className="h-full"
          >
            <STOutputPanel
              code={streamingSt}
              isStreaming={isGenerating}
              conflictReport={conflictReport}
            />
          </div>
          <div
            role="tabpanel"
            id="tabpanel-ld"
            data-testid="tabpanel-ld"
            aria-labelledby="tab-ld"
            hidden={activeTab !== 'ld'}
            className="h-full"
          >
            <LadderOutputPanel graph={ladderGraph} />
          </div>
          <div
            role="tabpanel"
            id="tabpanel-il"
            data-testid="tabpanel-il"
            aria-labelledby="tab-il"
            hidden={activeTab !== 'il'}
            className="h-full"
          >
            <ILOoutputPanel code={isGenerating ? '' : streamingIl} />
          </div>
        </div>
      </div>

      {isLdMaximized && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ld-modal-title"
          data-testid="ld-maximized-modal"
          className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2">
            <h2
              id="ld-modal-title"
              className="text-sm font-medium text-[var(--color-text)]"
            >
              Ladder Diagram — Fullscreen
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              data-testid="ld-modal-close"
              aria-label="Close fullscreen Ladder Diagram"
              onClick={handleCloseModal}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Close (Esc)
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <LadderOutputPanel graph={ladderGraph} fullscreen />
          </div>
        </div>
      )}
    </div>
  )
}
