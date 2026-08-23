import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictBanner } from '@/components/ConflictBanner'
import type { ConflictReport } from '@/lib/tauriApi'

function report(
  overrides: Partial<ConflictReport> = {},
): ConflictReport {
  return {
    conflicts: [],
    totalAddresses: 0,
    conflictingAddresses: 0,
    shouldHalt: false,
    ...overrides,
  }
}

describe('ConflictBanner', () => {
  it('renders nothing when there are no conflicts', () => {
    const { container } = render(
      <ConflictBanner report={report()} isScanning={false} error={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the scanning state while the scanner is running and no report exists', () => {
    render(<ConflictBanner report={null} isScanning={true} error={null} />)
    expect(screen.getByTestId('conflict-banner-scanning')).toBeInTheDocument()
  })

  it('renders the error state when the scanner fails', () => {
    render(<ConflictBanner report={null} isScanning={false} error="Tauri call failed" />)
    const banner = screen.getByTestId('conflict-banner-error')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('Tauri call failed')
  })

  it('renders the Arabic warning banner with the conflict count when shouldHalt is false', () => {
    const rep = report({
      conflicts: [
        {
          address: 'Y5',
          normalized: 'Y5',
          kind: 'undefined',
          message: 'Y5 is not defined in the I/O table',
          line: 3,
        },
      ],
      totalAddresses: 4,
      conflictingAddresses: 1,
      shouldHalt: false,
    })
    render(
      <ConflictBanner
        report={rep}
        isScanning={false}
        error={null}
        onOpenChat={vi.fn()}
      />,
    )
    const banner = screen.getByTestId('conflict-banner')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveAttribute('role', 'alert')
    expect(banner).toHaveAttribute('aria-live', 'polite')
    const countEl = screen.getByTestId('conflict-banner-count')
    expect(countEl.textContent).toContain('1')
    expect(countEl.textContent).toContain('تعارض')
    expect(screen.getByTestId('conflict-item').textContent).toContain('Y5')
    // Show Details button is ALWAYS present when onOpenChat is provided
    expect(screen.getByTestId('conflict-banner-show-details')).toBeInTheDocument()
  })

  it('renders the Arabic banner with "تعارضات" plural for counts 2–10', () => {
    const rep = report({
      conflicts: [
        { address: 'X50', normalized: 'X50', kind: 'undefined', message: 'undefined', line: 1 },
        { address: 'X51', normalized: 'X51', kind: 'undefined', message: 'undefined', line: 2 },
        { address: 'X52', normalized: 'X52', kind: 'undefined', message: 'undefined', line: 3 },
      ],
      totalAddresses: 6,
      conflictingAddresses: 3,
      shouldHalt: false,
    })
    render(<ConflictBanner report={rep} isScanning={false} error={null} />)
    const countEl = screen.getByTestId('conflict-banner-count')
    expect(countEl.textContent).toContain('3')
    expect(countEl.textContent).toContain('تعارضات')
    expect(countEl.textContent).toContain('العناوين')
  })

  it('shows the "Show Details" button and the halt-specific hint when shouldHalt is true', () => {
    const onOpenChat = vi.fn()
    const rep = report({
      conflicts: [
        { address: 'X50', normalized: 'X50', kind: 'undefined', message: 'undefined' },
        { address: 'X51', normalized: 'X51', kind: 'undefined', message: 'undefined' },
        { address: 'X52', normalized: 'X52', kind: 'undefined', message: 'undefined' },
        { address: 'X53', normalized: 'X53', kind: 'undefined', message: 'undefined' },
      ],
      totalAddresses: 8,
      conflictingAddresses: 4,
      shouldHalt: true,
    })
    render(
      <ConflictBanner
        report={rep}
        isScanning={false}
        error={null}
        onOpenChat={onOpenChat}
      />,
    )
    const banner = screen.getByTestId('conflict-banner')
    const showBtn = screen.getByTestId('conflict-banner-show-details')
    expect(showBtn).toBeInTheDocument()
    expect(showBtn.textContent).toContain('عرض التفاصيل')
    fireEvent.click(showBtn)
    expect(onOpenChat).toHaveBeenCalledOnce()
    // Banner contains the Arabic count
    expect(banner.textContent).toContain('4')
  })

  it('falls back to the raw kind label when the kind is unknown', () => {
    const rep = report({
      conflicts: [
        {
          address: 'M5',
          normalized: 'M5',
          // Cast to bypass type checking for the test edge case.
          kind: 'unknown-kind' as unknown as 'undefined',
          message: 'mystery',
        },
      ],
      conflictingAddresses: 1,
      shouldHalt: false,
    })
    render(<ConflictBanner report={rep} isScanning={false} error={null} />)
    expect(screen.getByTestId('conflict-item').textContent).toContain('unknown-kind')
  })

  it('renders the banner without the Show Details button when no onOpenChat callback is provided', () => {
    const rep = report({
      conflicts: [
        { address: 'Y5', normalized: 'Y5', kind: 'undefined', message: 'm' },
      ],
      conflictingAddresses: 1,
      shouldHalt: false,
    })
    render(<ConflictBanner report={rep} isScanning={false} error={null} />)
    expect(screen.getByTestId('conflict-banner')).toBeInTheDocument()
    expect(screen.queryByTestId('conflict-banner-show-details')).toBeNull()
  })
})
