import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { APP_VERSION } from '@/lib/version'

vi.mock('@/hooks/useProject', () => ({
  useProject: () => ({
    createNew: vi.fn(),
    openExisting: vi.fn(),
    error: null,
    status: 'idle',
  }),
}))

vi.mock('@/hooks/useRecentProjects', () => ({
  useRecentProjects: () => ({
    recents: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

describe('WelcomeScreen', () => {
  it('renders the welcome screen shell', () => {
    render(<WelcomeScreen onOpenSettings={vi.fn()} />)
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
  })

  it('displays the app version with a lowercase v prefix and no M1 milestone label', () => {
    render(<WelcomeScreen onOpenSettings={vi.fn()} />)
    const versionText = `v${APP_VERSION}`
    expect(screen.getByText(versionText)).toBeInTheDocument()
  })

  it('does not include the M1 milestone label in the version text', () => {
    render(<WelcomeScreen onOpenSettings={vi.fn()} />)
    const heading = screen.getByRole('heading', { level: 1, name: /delta plc ai generator/i })
    const wrapper = heading.parentElement
    expect(wrapper).not.toBeNull()
    expect(wrapper!.textContent).not.toMatch(/M1\b/)
  })
})
