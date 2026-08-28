import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '@/components/ErrorBoundary'

function ThrowingChild(): never {
  throw new Error('boom from child')
}

describe('ErrorBoundary — M11 gap coverage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">ok</div>
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('boom from child')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('logs error via console.error in componentDidCatch', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('App crashed:'), expect.any(Error), expect.any(Object))
  })

  it('resets error state when Reload is clicked', async () => {
    const user = userEvent.setup()
    let shouldThrow = true
    function ConditionalChild(): React.JSX.Element {
      if (shouldThrow) throw new Error('boom')
      return <div data-testid="recovered">recovered</div>
    }
    render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    shouldThrow = false
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    expect(screen.getByTestId('recovered')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not expose stack or internal details beyond message', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )
    // Fallback only shows error.message, not full stack
    const pre = screen.getByText('boom from child')
    expect(pre.tagName).toBe('PRE')
    expect(pre.textContent).toBe('boom from child')
  })
})
