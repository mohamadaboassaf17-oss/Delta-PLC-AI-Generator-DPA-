import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StatusBar } from '@/components/StatusBar'
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings'

// Mocks are hoisted by Vitest, so they apply to every test in this file.
const {
  useProjectMock,
  useOnlineStatusMock,
  useDevOverrideMock,
  usePerfMonitorVisibilityMock,
  useSettingsMock,
} = vi.hoisted(
  () => ({
    useProjectMock: vi.fn(),
    useOnlineStatusMock: vi.fn(),
    useDevOverrideMock: vi.fn(),
    usePerfMonitorVisibilityMock: vi.fn(),
    useSettingsMock: vi.fn(),
  }),
)

vi.mock('@/hooks/useProject', () => ({
  useProject: useProjectMock,
}))

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: useOnlineStatusMock,
}))

vi.mock('@/hooks/useDevOverride', () => ({
  useDevOverride: useDevOverrideMock,
}))

vi.mock('@/hooks/usePerfMonitorVisibility', () => ({
  usePerfMonitorVisibility: usePerfMonitorVisibilityMock,
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: useSettingsMock,
}))

function setupMocks(
  settings: Settings = DEFAULT_SETTINGS,
  perfVisible = false,
): { toggleSpy: ReturnType<typeof vi.fn> } {
  useProjectMock.mockReset()
  useProjectMock.mockReturnValue({
    project: null,
    isDirty: false,
    setProject: vi.fn(),
  })
  useOnlineStatusMock.mockReset()
  useOnlineStatusMock.mockReturnValue({ isOnline: true })
  useDevOverrideMock.mockReset()
  useDevOverrideMock.mockReturnValue({ devOverride: false, setDevOverride: vi.fn() })
  const toggleSpy = vi.fn()
  usePerfMonitorVisibilityMock.mockReset()
  usePerfMonitorVisibilityMock.mockReturnValue({
    visible: perfVisible,
    toggle: toggleSpy,
    setVisible: vi.fn(),
  })
  useSettingsMock.mockReset()
  useSettingsMock.mockReturnValue({
    settings,
    loading: false,
    error: null,
    setSettings: vi.fn(),
    reload: vi.fn(),
  })
  return { toggleSpy }
}

describe('StatusBar — M11.5.3 active provider + model badge', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('renders the OpenAI badge and the default model when settings are default', () => {
    render(<StatusBar />)
    const badge = screen.getByTestId('status-bar-provider')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('OpenAI')
    expect(screen.getByTestId('status-bar-model')).toHaveTextContent('gpt-4o')
  })

  it('renders Anthropic with its model when the active provider is Anthropic', () => {
    setupMocks({
      ...DEFAULT_SETTINGS,
      active_provider: 'anthropic',
      generation: { ...DEFAULT_SETTINGS.generation, model: 'claude-sonnet-4-6' },
    })
    render(<StatusBar />)
    expect(screen.getByTestId('status-bar-provider')).toHaveTextContent('Anthropic')
    expect(screen.getByTestId('status-bar-model')).toHaveTextContent('claude-sonnet-4-6')
  })

  it('renders Gemini with its model when the active provider is Gemini', () => {
    setupMocks({
      ...DEFAULT_SETTINGS,
      active_provider: 'gemini',
      generation: { ...DEFAULT_SETTINGS.generation, model: 'gemini-2.5-flash' },
    })
    render(<StatusBar />)
    expect(screen.getByTestId('status-bar-provider')).toHaveTextContent('Gemini')
    expect(screen.getByTestId('status-bar-model')).toHaveTextContent('gemini-2.5-flash')
  })

  it('renders Custom with custom_model_name (not generation.model) when active', () => {
    setupMocks({
      ...DEFAULT_SETTINGS,
      active_provider: 'custom',
      // generation.model still holds the built-in default — Custom must
      // read from custom_model_name instead.
      generation: { ...DEFAULT_SETTINGS.generation, model: 'gpt-3.5-turbo' },
      custom_base_url: 'https://openrouter.ai/api/v1',
      custom_model_name: 'meta-llama/llama-3.3-70b-instruct',
    })
    render(<StatusBar />)
    expect(screen.getByTestId('status-bar-provider')).toHaveTextContent('Custom')
    expect(screen.getByTestId('status-bar-model')).toHaveTextContent(
      'meta-llama/llama-3.3-70b-instruct',
    )
  })

  it('falls back to a dash when the active model is empty (Custom without a model name)', () => {
    setupMocks({
      ...DEFAULT_SETTINGS,
      active_provider: 'custom',
      custom_base_url: 'https://openrouter.ai/api/v1',
      custom_model_name: '',
    })
    render(<StatusBar />)
    expect(screen.getByTestId('status-bar-model')).toHaveTextContent('—')
  })

  it('always renders a single badge regardless of provider', () => {
    const { rerender } = render(<StatusBar />)
    expect(screen.getAllByTestId('status-bar-provider')).toHaveLength(1)
    setupMocks({
      ...DEFAULT_SETTINGS,
      active_provider: 'gemini',
      generation: { ...DEFAULT_SETTINGS.generation, model: 'gemini-2.5-pro' },
    })
    rerender(<StatusBar />)
    expect(screen.getAllByTestId('status-bar-provider')).toHaveLength(1)
    expect(screen.getByTestId('status-bar-provider')).toHaveTextContent('Gemini')
  })
})

describe('StatusBar — M12.1.1 performance monitor toggle', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('does not render PerformanceMonitor by default (visible=false)', () => {
    render(<StatusBar />)
    expect(screen.queryByTestId('performance-monitor')).not.toBeInTheDocument()
  })

  it('renders PerformanceMonitor when the visibility hook reports visible=true', () => {
    setupMocks(DEFAULT_SETTINGS, true)
    render(<StatusBar />)
    expect(screen.getByTestId('performance-monitor')).toBeInTheDocument()
  })

  it('always renders the Dev stats toggle button in the footer', () => {
    render(<StatusBar />)
    const toggle = screen.getByTestId('perf-monitor-toggle')
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveTextContent(/dev stats/i)
  })

  it('toggle button reports aria-pressed="false" when the perf monitor is hidden', () => {
    render(<StatusBar />)
    const toggle = screen.getByTestId('perf-monitor-toggle')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggle button reports aria-pressed="true" when the perf monitor is visible', () => {
    setupMocks(DEFAULT_SETTINGS, true)
    render(<StatusBar />)
    const toggle = screen.getByTestId('perf-monitor-toggle')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the toggle calls hook.toggle() exactly once', () => {
    const { toggleSpy } = setupMocks()
    render(<StatusBar />)
    const toggle = screen.getByTestId('perf-monitor-toggle')
    fireEvent.click(toggle)
    expect(toggleSpy).toHaveBeenCalledTimes(1)
  })

  it('toggle button has an accessible aria-label', () => {
    render(<StatusBar />)
    const toggle = screen.getByTestId('perf-monitor-toggle')
    expect(toggle).toHaveAccessibleName(/toggle performance monitor/i)
  })

  it('does not auto-show the perf monitor even when devOverride=true is mocked', () => {
    // The footer must no longer consult `useDevOverride` for the perf
    // monitor; only `usePerfMonitorVisibility` controls it.
    useDevOverrideMock.mockReturnValue({ devOverride: true, setDevOverride: vi.fn() })
    render(<StatusBar />)
    expect(screen.queryByTestId('performance-monitor')).not.toBeInTheDocument()
  })
})
