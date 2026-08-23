import type { ReactElement } from 'react'

export interface ProviderIconProps {
  className?: string
}

export function OpenAiIcon({ className = 'size-4' }: ProviderIconProps): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5 20.25 7v10L12 21.5 3.75 17V7Z" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
}

export function AnthropicIcon({ className = 'size-4' }: ProviderIconProps): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4.5 5.25 19.5M12 4.5l6.75 15" />
    </svg>
  )
}

export function GeminiIcon({ className = 'size-4' }: ProviderIconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1.75c.72 5.85 4.68 9.81 10.53 10.53C16.83 13 12.87 16.96 12.15 22.8 11.43 16.96 7.47 13 1.62 12.28 7.47 11.56 11.28 7.6 12 1.75Z" />
    </svg>
  )
}

export function CustomIcon({ className = 'size-4' }: ProviderIconProps): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.61 13.39a4.5 4.5 0 0 0 6.36 0l2.65-2.65a4.5 4.5 0 0 0-6.36-6.36L11.84 5.8" />
      <path d="M13.39 10.61a4.5 4.5 0 0 0-6.36 0l-2.65 2.65a4.5 4.5 0 0 0 6.36 6.36l1.42-1.42" />
    </svg>
  )
}
