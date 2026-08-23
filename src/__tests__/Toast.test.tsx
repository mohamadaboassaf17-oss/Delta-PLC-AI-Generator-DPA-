import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ToastProvider, useToast, type ToastContextValue } from '@/components/Toast'

/** Probe component that captures the toast API for use inside tests. */
function ToastProbe({
  onReady,
}: {
  onReady: (api: ToastContextValue) => void
}): ReactElement {
  const api = useToast()
  // Push the latest API into the closure on every render so the test can
  // trigger toasts at will.
  onReady(api)
  return <div data-testid="probe">probe-mounted</div>
}

function renderWithToast(): ToastContextValue {
  let api: ToastContextValue | null = null
  render(
    <ToastProvider>
      <ToastProbe onReady={(value) => (api = value)} />
    </ToastProvider>,
  )
  if (!api) throw new Error('Toast API not captured')
  return api
}

describe('Toast system', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('useToast throws when used outside a provider', () => {
    const original = console.error
    console.error = (): void => {} // suppress React's error boundary warning
    try {
      expect(() =>
        render(<ToastProbe onReady={() => {}} />),
      ).toThrow(/useToast must be used inside <ToastProvider>/)
    } finally {
      console.error = original
    }
  })

  it('renders a success toast when success() is called', () => {
    const api = renderWithToast()

    act(() => {
      api.success('Operation completed')
    })

    const toast = screen.getByTestId('toast-success')
    expect(toast).toBeInTheDocument()
    expect(toast).toHaveTextContent('Operation completed')
    expect(screen.getByTestId('toast')).toBeInTheDocument()
  })

  it('renders distinct toast kinds with the right test IDs', () => {
    const api = renderWithToast()

    act(() => {
      api.success('s')
      api.error('e')
      api.info('i')
    })

    expect(screen.getByTestId('toast-success')).toHaveTextContent('s')
    expect(screen.getByTestId('toast-error')).toHaveTextContent('e')
    expect(screen.getByTestId('toast-info')).toHaveTextContent('i')
  })

  it('auto-dismisses success toasts after the default 5000ms', () => {
    const api = renderWithToast()

    act(() => {
      api.success('Auto-gone')
    })

    expect(screen.getByTestId('toast-success')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(screen.queryByTestId('toast-success')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(screen.queryByTestId('toast-success')).not.toBeInTheDocument()
  })

  it('auto-dismisses error toasts after the default 8000ms', () => {
    const api = renderWithToast()

    act(() => {
      api.error('Bad thing')
    })

    act(() => {
      vi.advanceTimersByTime(7999)
    })
    expect(screen.queryByTestId('toast-error')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(screen.queryByTestId('toast-error')).not.toBeInTheDocument()
  })

  it('does not auto-dismiss when durationMs is 0', () => {
    const api = renderWithToast()

    act(() => {
      api.info('Sticky', 0)
    })

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByTestId('toast-info')).toBeInTheDocument()
  })

  it('stacks multiple toasts in the same container', () => {
    const api = renderWithToast()

    act(() => {
      api.info('one')
      api.info('two')
    })

    const container = screen.getByTestId('toast')
    expect(container).toBeInTheDocument()
    expect(container).toHaveTextContent('one')
    expect(container).toHaveTextContent('two')
  })

  it('caps visible toasts at 3, dropping the oldest', () => {
    const api = renderWithToast()

    act(() => {
      api.info('first', 0)
      api.info('second', 0)
      api.info('third', 0)
      api.info('fourth', 0)
    })

    const container = screen.getByTestId('toast')
    expect(container).not.toHaveTextContent('first')
    expect(container).toHaveTextContent('second')
    expect(container).toHaveTextContent('third')
    expect(container).toHaveTextContent('fourth')
  })

  it('removes the toast when the dismiss button is clicked', () => {
    const api = renderWithToast()

    act(() => {
      api.warning('Heads up', 0)
    })

    const toast = screen.getByTestId('toast-warning')
    expect(toast).toBeInTheDocument()

    const dismissBtn = screen.getByLabelText('Dismiss notification')
    act(() => {
      fireEvent.click(dismissBtn)
    })

    expect(screen.queryByTestId('toast-warning')).not.toBeInTheDocument()
  })

  it('removes only the toast whose dismiss button is clicked', () => {
    const api = renderWithToast()

    act(() => {
      api.info('keep me', 0)
      api.error('remove me', 0)
    })

    const dismissButtons = screen.getAllByLabelText('Dismiss notification')
    // Two toasts ⇒ two dismiss buttons. The error toast is the second one.
    expect(dismissButtons).toHaveLength(2)

    act(() => {
      fireEvent.click(dismissButtons[1])
    })

    expect(screen.queryByTestId('toast-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('toast-info')).toBeInTheDocument()
  })

  it('does not render the container when there are no toasts', () => {
    renderWithToast()
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument()
  })
})
