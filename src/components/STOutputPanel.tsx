/* eslint-disable react-refresh/only-export-components */
// `highlightST` and `highlightConflicts` are pure functions exported
// alongside the component so unit tests can exercise them in isolation.
// Splitting them into a separate file would be premature — they are
// tightly coupled to the panel's render output.

import { useMemo, type ReactElement } from 'react'
import type { ConflictReport } from '@/lib/tauriApi'

interface STOutputPanelProps {
  code: string
  isStreaming?: boolean
  /** Optional conflict report — when provided, matching addresses are wrapped in a highlight span and whole lines in conflict are marked. */
  conflictReport?: ConflictReport | null
}

const DVP_KEYWORDS = [
  'IF', 'THEN', 'ELSE', 'ELSIF', 'END_IF',
  'FOR', 'TO', 'BY', 'DO', 'END_FOR',
  'WHILE', 'END_WHILE',
  'REPEAT', 'UNTIL', 'END_REPEAT',
  'CASE', 'OF', 'END_CASE',
  'RETURN',
  'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'END_VAR',
  'TYPE', 'END_TYPE',
  'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK',
  'PROGRAM', 'END_PROGRAM',
  'CONFIGURATION', 'END_CONFIGURATION',
  'TASK', 'INTERVAL',
  'SET', 'RST',
  'TMR', 'CNT',
  'NOT', 'AND', 'OR', 'XOR', 'MOD',
  'TRUE', 'FALSE',
  'CTRL', 'STORE', 'LOAD', 'EXPT',
]

const KEYWORD_PATTERN = new RegExp(
  `\\b(${DVP_KEYWORDS.join('|')})\\b`,
  'g',
)

function spanBeforeOffset(html: string, offset: number): boolean {
  const before = html.slice(0, offset)
  const openCount = (before.match(/<span /g) || []).length
  const closeCount = (before.match(/<\/span>/g) || []).length
  return openCount > closeCount
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * Wraps every occurrence of a conflict address in a red highlight span
 * inside the already-highlighted HTML. Returns the HTML unchanged when
 * there are no conflicts.
 */
export function highlightConflicts(html: string, report: ConflictReport | null | undefined): string {
  if (!report || report.conflicts.length === 0) return html
  const addrs = Array.from(new Set(report.conflicts.map((c) => c.normalized)))
  if (addrs.length === 0) return html
  // Escape the original (already-escaped) addresses — they may not
  // contain HTML special chars, but defend anyway.
  const pattern = new RegExp(
    `\\b(${addrs.map((a) => a.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')})\\b`,
    'g',
  )
  return html.replace(pattern, (match, offset) => {
    if (spanBeforeOffset(html, offset)) return match
    const norm = match.toUpperCase()
    const conflict = report.conflicts.find((c) => c.normalized === norm)
    const title = conflict
      ? `${escapeAttr(conflict.message)} (${escapeAttr(conflict.kind)})`
      : 'Address conflict'
    // Both attribute values are wrapped in double-quotes; we must escape
    // any `&` and `"` in the interpolated values. `norm` is a normalized
    // DVP address and in practice can only contain ASCII alphanumerics
    // and `.`, but we defend regardless so a future regex change cannot
    // accidentally introduce attribute-injection.
    return `<span class="bg-red-950/70 text-red-200 border-b border-red-500/60" title="${title}" data-conflict="${escapeAttr(norm)}">${match}</span>`
  })
}

export function highlightST(code: string): string {
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(
    /\(\*[\s\S]*?\*\)/g,
    (match, offset) =>
      spanBeforeOffset(html, offset) ? match : `<span class="text-emerald-400 italic">${match}</span>`,
  )

  html = html.replace(
    /\/\/.*$/gm,
    (match, offset) =>
      spanBeforeOffset(html, offset) ? match : `<span class="text-emerald-400 italic">${match}</span>`,
  )

  html = html.replace(
    /'[^']*'/g,
    (match, offset) =>
      spanBeforeOffset(html, offset) ? match : `<span class="text-orange-400">${match}</span>`,
  )

  html = html.replace(
    KEYWORD_PATTERN,
    (match, offset) =>
      spanBeforeOffset(html, offset)
        ? match
        : `<span class="text-purple-400 font-semibold">${match}</span>`,
  )

  html = html.replace(
    /\b\d+(?:\.\d+)?\b/g,
    (match, offset) =>
      spanBeforeOffset(html, offset) ? match : `<span class="text-blue-400">${match}</span>`,
  )

  html = html.replace(
    /(:=|<=|>=|<>|=>|\+|-|\*|\/|;|,|\(|\)|\[|\]|\^|:)/g,
    (match, offset) =>
      spanBeforeOffset(html, offset) ? match : `<span class="text-gray-400 dark:text-gray-500">${match}</span>`,
  )

  return html
}

/**
 * Returns the set of line numbers (1-indexed) that contain at least one
 * conflict. Pure helper exported for unit testing.
 */
export function collectConflictLineNumbers(
  report: ConflictReport | null | undefined,
): Set<number> {
  const set = new Set<number>()
  if (!report) return set
  for (const c of report.conflicts) {
    if (typeof c.line === 'number' && Number.isFinite(c.line) && c.line > 0) {
      set.add(c.line)
    }
  }
  return set
}

export function STOutputPanel({ code, isStreaming, conflictReport }: STOutputPanelProps): ReactElement {
  const lines = useMemo(() => code.split('\n'), [code])
  const conflictLineNumbers = useMemo(
    () => collectConflictLineNumbers(conflictReport),
    [conflictReport],
  )

  const hasContent = code.length > 0
  const conflictCount = conflictReport?.conflicts.length ?? 0

  return (
    <div className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-medium text-[var(--color-text)]">
          Structured Text (ST)
        </h3>
        <div className="flex items-center gap-2">
          {conflictCount > 0 ? (
            <span
              data-testid="st-conflict-badge"
              className="rounded-full bg-red-900/60 px-2 py-0.5 text-[10px] font-medium text-red-200"
            >
              {conflictCount} conflict{conflictCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              </span>
              Streaming
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {hasContent ? (
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--color-text)]">
            {lines.map((line, idx) => {
              const lineNumber = idx + 1
              const isConflictLine = conflictLineNumbers.has(lineNumber)
              const html = highlightConflicts(highlightST(line), conflictReport)
              return (
                <div
                  key={`st-line-${lineNumber}`}
                  data-line-number={lineNumber}
                  data-conflict={isConflictLine ? 'true' : undefined}
                  className={
                    isConflictLine
                      ? '-mx-4 rounded border-r-2 border-red-500 bg-red-950/30 px-4 py-0.5'
                      : 'px-0 py-0.5'
                  }
                >
                  <code
                    // Safe by construction: `highlightST` escapes `&`,
                    // `<`, `>` in the original code BEFORE wrapping
                    // tokens in `<span class="...">...</span>`. The
                    // class names are hardcoded literals. `highlightConflicts`
                    // then wraps matched addresses in another span whose
                    // `title` / `data-conflict` attributes are
                    // double-quoted and run through `escapeAttr` (handles
                    // `&` and `"`). No LLM-controlled string reaches
                    // the DOM unescaped. See
                    // `src/__tests__/security/noCodeExecution.test.tsx`
                    // for the pinning tests.
                    dangerouslySetInnerHTML={{ __html: html.length > 0 ? html : '\u00A0' }}
                  />
                </div>
              )
            })}
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">
            Generated ST code will appear here
          </div>
        )}
      </div>
    </div>
  )
}
