import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { ProjectToolbar } from '@/components/ProjectToolbar'
import { IOMappingTable } from '@/components/IOMappingTable'
import { HMITagTable } from '@/components/HMITagTable'
import CodeGenerationPanel from '@/components/CodeGenerationPanel'
import { ChatPanel } from '@/components/ChatPanel'
import { AIReviewPanel } from '@/components/AIReviewPanel'
import { ModelLimitsBanner } from '@/components/ModelLimitsBanner'
import { useProject } from '@/hooks/useProject'
import { useModelLimits } from '@/hooks/useModelLimits'

type RightTab = 'review' | 'chat'

// M10.3.4 — persistence key for collapsed sidebar state. Stored as JSON so
// future toggles (e.g. left-only or right-only) can be added without
// breaking older clients.
const COLLAPSED_STORAGE_KEY = 'dpa.layout.collapsed'

interface CollapsedState {
  left: boolean
  right: boolean
}

const DEFAULT_COLLAPSED: CollapsedState = { left: false, right: false }

function readCollapsedState(): CollapsedState {
  if (typeof window === 'undefined') return DEFAULT_COLLAPSED
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (raw === null) return DEFAULT_COLLAPSED
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'left' in parsed &&
      'right' in parsed &&
      typeof (parsed as { left: unknown }).left === 'boolean' &&
      typeof (parsed as { right: unknown }).right === 'boolean'
    ) {
      return parsed as CollapsedState
    }
    return DEFAULT_COLLAPSED
  } catch {
    return DEFAULT_COLLAPSED
  }
}

function writeCollapsedState(state: CollapsedState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage may throw in private mode or when full; silently
    // ignore — the collapse still works for the rest of this session.
  }
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children?: ReactElement | ReactElement[]
}): ReactElement {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {children ? (
        <div className="mt-3">{children}</div>
      ) : (
        <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">Coming in {hint}</p>
      )}
    </div>
  )
}

interface RightSidebarTabsProps {
  active: RightTab
  onChange: (next: RightTab) => void
}

function RightSidebarTabs({ active, onChange }: RightSidebarTabsProps): ReactElement {
  const tabs: ReadonlyArray<{ id: RightTab; label: string }> = [
    { id: 'review', label: 'AI Review' },
    { id: 'chat', label: 'Chat' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Right sidebar panels"
      data-testid="right-sidebar-tabs"
      className="flex items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-panel)] p-2"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`right-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-[var(--color-accent)] text-white'
                : 'border border-transparent text-[var(--color-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

interface CollapseHandleProps {
  testId: string
  side: 'left' | 'right'
  isCollapsed: boolean
  onToggle: () => void
}

function CollapseHandle({
  testId,
  side,
  isCollapsed,
  onToggle,
}: CollapseHandleProps): ReactElement {
  const glyph =
    side === 'left' ? (isCollapsed ? '›' : '‹') : isCollapsed ? '‹' : '›'

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={isCollapsed ? `Expand ${side} sidebar` : `Collapse ${side} sidebar`}
      aria-expanded={!isCollapsed}
      onClick={onToggle}
      className="group flex h-full w-2.5 shrink-0 cursor-pointer items-center justify-center bg-[var(--color-bg)] transition-colors duration-[120ms] hover:bg-[var(--color-border)]"
    >
      <span
        aria-hidden="true"
        className="flex size-4 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] text-[10px] leading-none text-[var(--color-muted)] transition-colors duration-[120ms] group-hover:border-[var(--color-accent)] group-hover:text-[var(--color-accent)]"
      >
        {glyph}
      </span>
    </button>
  )
}

export function ProjectLayout({ children }: { children?: ReactElement }): ReactElement {
  const [rightTab, setRightTab] = useState<RightTab>('review')
  const [collapsed, setCollapsed] = useState<CollapsedState>(() => readCollapsedState())
  const { project } = useProject()
  const modelLimits = useModelLimits()

  const openChat = useCallback((): void => {
    setRightTab('chat')
    setCollapsed((prev) => (prev.right ? { ...prev, right: false } : prev))
  }, [])

  const toggleLeft = useCallback((): void => {
    setCollapsed((prev) => {
      const next = { ...prev, left: !prev.left }
      writeCollapsedState(next)
      return next
    })
  }, [])

  const toggleRight = useCallback((): void => {
    setCollapsed((prev) => {
      const next = { ...prev, right: !prev.right }
      writeCollapsedState(next)
      return next
    })
  }, [])

  // Persist whenever collapsed flips for reasons other than the toggle
  // handlers (defensive: future external setters won't bypass storage).
  useEffect(() => {
    writeCollapsedState(collapsed)
  }, [collapsed])

  if (!project) {
    return (
      <div className="flex h-full flex-col">
        <ProjectToolbar />
        {children ?? <></>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectToolbar />
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - I/O Table and HMI Tags */}
        <aside
          data-testid="left-sidebar"
          data-collapsed={collapsed.left}
          aria-hidden={collapsed.left}
          className={`relative shrink-0 overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-panel)] transition-[width,opacity] duration-[180ms] ease-out ${
            collapsed.left ? 'w-0 opacity-0 pointer-events-none' : 'w-80 opacity-100'
          }`}
        >
          {/* min-w keeps content at full open width so it clips instead of
              squeezing while the width transition runs. */}
          <div className="h-full min-w-80 overflow-y-auto">
            <div className="p-4">
              <section className="mb-6">
                <Panel title="I/O Table">
                  <IOMappingTable />
                </Panel>
              </section>
              <section className="mb-6">
                <ModelLimitsBanner
                  limits={modelLimits.limits}
                  isLoading={modelLimits.isLoading}
                  error={modelLimits.error}
                />
              </section>
              <section>
                <Panel title="HMI Tag Table">
                  <HMITagTable />
                </Panel>
              </section>
            </div>
          </div>
        </aside>

        <CollapseHandle
          testId="toggle-left-sidebar"
          side="left"
          isCollapsed={collapsed.left}
          onToggle={toggleLeft}
        />

        {/* Center area - Description + Generate (top), ST | LD | IL grid (bottom) */}
        <main className="flex-1 flex flex-col overflow-auto bg-[var(--color-bg)] min-w-0">
          <div className="mx-auto flex max-w-4xl w-full flex-1 flex-col gap-6 p-6">
            <section data-testid="center-top" className="shrink-0">
              <Panel title="Code Generation">
                <CodeGenerationPanel onOpenChat={openChat} />
              </Panel>
            </section>
          </div>
        </main>

        <CollapseHandle
          testId="toggle-right-sidebar"
          side="right"
          isCollapsed={collapsed.right}
          onToggle={toggleRight}
        />

        {/* Right sidebar - AI Review | Chat tabs */}
        <aside
          data-testid="right-sidebar"
          data-collapsed={collapsed.right}
          aria-hidden={collapsed.right}
          className={`shrink-0 overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-panel)] transition-[width,opacity] duration-[180ms] ease-out ${
            collapsed.right ? 'w-0 opacity-0 pointer-events-none' : 'w-96 opacity-100'
          }`}
        >
          {/* min-w keeps content at full open width so it clips instead of
              squeezing while the width transition runs. */}
          <div className="flex h-full min-w-96 flex-col">
            <RightSidebarTabs active={rightTab} onChange={setRightTab} />
            <div className="flex-1 overflow-hidden">
              {rightTab === 'review' ? (
                <div data-testid="right-tab-panel-review" className="h-full overflow-auto p-4">
                  <AIReviewPanel onOpenChat={openChat} />
                </div>
              ) : (
                <div data-testid="right-tab-panel-chat" className="h-full">
                  <ChatPanel />
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
