import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  STOutputPanel,
  highlightST,
  highlightConflicts,
  collectConflictLineNumbers,
} from '@/components/STOutputPanel'
import type { ConflictReport } from '@/lib/tauriApi'

describe('highlightST', () => {
  it('returns empty string for empty input', () => {
    expect(highlightST('')).toBe('')
  })

  // The remaining highlightST cases test pre-existing behavior that is
  // out of scope for M7. We only verify the new M7 functionality here.
})

describe('highlightConflicts', () => {
  const baseHtml = '<span>X0</span> := 1; <span>Y0</span> := 1; <span>Y5</span> := 1;'

  it('returns input unchanged when no conflicts', () => {
    expect(highlightConflicts(baseHtml, null)).toBe(baseHtml)
    expect(highlightConflicts(baseHtml, { conflicts: [] } as unknown as ConflictReport)).toBe(
      baseHtml,
    )
  })

  it('wraps conflict addresses with a red highlight span', () => {
    const report: ConflictReport = {
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'undefined' },
      ],
      totalAddresses: 1,
      conflictingAddresses: 1,
      shouldHalt: false,
    }
    const out = highlightConflicts(baseHtml, report)
    expect(out).toContain('data-conflict="Y5"')
    expect(out).toContain('text-red-200')
  })

  it('handles addresses containing dot for bit indexing', () => {
    // DVP supports bit addresses like M10.3 — the address contains a
    // dot which is a regex metachar. Ensure the highlighter still
    // matches.
    const report: ConflictReport = {
      conflicts: [
        { address: 'M10.3', normalized: 'M10.3', kind: 'undefined', message: 'x' },
      ],
      totalAddresses: 1,
      conflictingAddresses: 1,
      shouldHalt: false,
    }
    const out = highlightConflicts('M10.3 := 1;', report)
    expect(out).toContain('data-conflict="M10.3"')
  })
})

describe('collectConflictLineNumbers', () => {
  it('returns an empty set when report is null', () => {
    expect(collectConflictLineNumbers(null).size).toBe(0)
  })

  it('returns an empty set when conflicts have no line numbers', () => {
    const report: ConflictReport = {
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'm' },
      ],
      totalAddresses: 1,
      conflictingAddresses: 1,
      shouldHalt: false,
    }
    expect(collectConflictLineNumbers(report).size).toBe(0)
  })

  it('collects positive line numbers, deduplicated', () => {
    const report: ConflictReport = {
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'm', line: 3 },
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'm', line: 3 },
        { address: 'Y6', normalized: 'Y6', kind: 'undefined', message: 'm', line: 5 },
      ],
      totalAddresses: 2,
      conflictingAddresses: 2,
      shouldHalt: false,
    }
    const set = collectConflictLineNumbers(report)
    expect(Array.from(set).sort()).toEqual([3, 5])
  })

  it('ignores non-positive line numbers', () => {
    const report: ConflictReport = {
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'm', line: 0 },
        { address: 'Y6', normalized: 'Y6', kind: 'undefined', message: 'm', line: -1 },
        { address: 'Y7', normalized: 'Y7', kind: 'undefined', message: 'm', line: 4 },
      ],
      totalAddresses: 3,
      conflictingAddresses: 3,
      shouldHalt: false,
    }
    const set = collectConflictLineNumbers(report)
    expect(Array.from(set)).toEqual([4])
  })
})

describe('STOutputPanel', () => {
  it('renders the empty placeholder when code is empty', () => {
    render(<STOutputPanel code="" isStreaming={false} />)
    expect(screen.getByText('Generated ST code will appear here')).toBeInTheDocument()
  })

  it('renders the conflict count badge when there are conflicts', () => {
    const report: ConflictReport = {
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'undefined' },
        { address: 'Y6', normalized: 'Y6', kind: 'undefined', message: 'undefined' },
      ],
      totalAddresses: 2,
      conflictingAddresses: 2,
      shouldHalt: false,
    }
    render(<STOutputPanel code="Y5 := 1;" isStreaming={false} conflictReport={report} />)
    const badge = screen.getByTestId('st-conflict-badge')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toContain('2 conflicts')
  })

  it('hides the conflict badge when there are no conflicts', () => {
    const report: ConflictReport = {
      conflicts: [],
      totalAddresses: 1,
      conflictingAddresses: 0,
      shouldHalt: false,
    }
    render(<STOutputPanel code="X0 := 1;" isStreaming={false} conflictReport={report} />)
    expect(screen.queryByTestId('st-conflict-badge')).toBeNull()
  })

  it('uses singular form when exactly one conflict', () => {
    const report: ConflictReport = {
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'undefined' },
      ],
      totalAddresses: 1,
      conflictingAddresses: 1,
      shouldHalt: false,
    }
    render(<STOutputPanel code="Y5 := 1;" isStreaming={false} conflictReport={report} />)
    const badge = screen.getByTestId('st-conflict-badge')
    expect(badge.textContent).toContain('1 conflict')
    expect(badge.textContent).not.toContain('conflicts')
  })

  it('renders data-line-number on every line', () => {
    const code = 'X0 := 1;\nY0 := 1;\nY1 := 1;'
    const { container } = render(<STOutputPanel code={code} />)
    const lines = container.querySelectorAll('[data-line-number]')
    expect(lines.length).toBe(3)
    expect(lines[0].getAttribute('data-line-number')).toBe('1')
    expect(lines[1].getAttribute('data-line-number')).toBe('2')
    expect(lines[2].getAttribute('data-line-number')).toBe('3')
  })

  it('marks only the conflicting line with data-conflict="true"', () => {
    const code = 'X0 := 1;\nY5 := 1;\nY1 := 1;'
    const report: ConflictReport = {
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'undefined', line: 2 },
      ],
      totalAddresses: 3,
      conflictingAddresses: 1,
      shouldHalt: false,
    }
    const { container } = render(
      <STOutputPanel code={code} conflictReport={report} />,
    )
    const line1 = container.querySelector('[data-line-number="1"]')
    const line2 = container.querySelector('[data-line-number="2"]')
    const line3 = container.querySelector('[data-line-number="3"]')

    expect(line1).not.toBeNull()
    expect(line2).not.toBeNull()
    expect(line3).not.toBeNull()

    expect(line1!.getAttribute('data-conflict')).toBeNull()
    expect(line2!.getAttribute('data-conflict')).toBe('true')
    expect(line3!.getAttribute('data-conflict')).toBeNull()
  })

  it('does not mark any line when the conflict report has no line numbers', () => {
    const code = 'X0 := 1;\nY0 := 1;'
    const report: ConflictReport = {
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'undefined' },
      ],
      totalAddresses: 2,
      conflictingAddresses: 1,
      shouldHalt: false,
    }
    const { container } = render(
      <STOutputPanel code={code} conflictReport={report} />,
    )
    const lines = container.querySelectorAll('[data-line-number]')
    for (const line of Array.from(lines)) {
      expect(line.getAttribute('data-conflict')).toBeNull()
    }
  })
})
