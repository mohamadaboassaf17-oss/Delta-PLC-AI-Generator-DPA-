import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App crashed:', error, info)
  }

  handleReset = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactElement | ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--color-bg)] p-8 text-center text-[var(--color-text)]"
        >
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <pre className="max-w-2xl whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-left text-xs text-[var(--color-danger)]">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
