import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { useProject } from '@/hooks/useProject'
import type { IOPoint } from '@/types/io'
import { IOMappingTable } from '@/components/IOMappingTable'
import { ProjectProvider } from '@/context/ProjectContext'
import type { DvpModelSpec } from '@/lib/tauriApi'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

const defaultModels: { models: DvpModelSpec[] } = {
  models: [
    { family: 'ss2', label: 'DVP-SS2', max_x: 8, max_y: 8, max_m: 512, max_s: null, max_t: 128, max_c: 128 },
  ],
}

function createProject(overrides?: Record<string, unknown>) {
  return {
    id: 'test-1',
    name: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 3 as const,
    meta: { author: 'qa' },
    io_table: [] as IOPoint[],
    ...overrides,
  }
}

function setupInvoke(project = createProject()) {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'project_new') return Promise.resolve(project)
    if (cmd === 'dvp_list_models') return Promise.resolve(defaultModels)
    return Promise.resolve(null)
  })
}

function ProjectSetupWrapper({ children }: { children: ReactElement }) {
  const { createNew } = useProject()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    createNew('Test Project').then(() => setReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!ready) return <div data-testid="loading">Loading...</div>
  return children
}

function renderWithProject(io_table?: IOPoint[]) {
  const project = createProject({ io_table: io_table ?? [] })
  setupInvoke(project)
  return render(
    <ProjectProvider>
      <ProjectSetupWrapper>
        <IOMappingTable />
      </ProjectSetupWrapper>
    </ProjectProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'dvp_list_models') return Promise.resolve(defaultModels)
    return Promise.resolve(null)
  })
})

describe('M3 — Preset validation UI (Timer/Counter K-constant)', () => {
  it('shows no preset error for Timer with valid K50', async () => {
    const points: IOPoint[] = [{ address: 'T0', type: 'Timer', label: 'Delay', defaultValue: 'K50' }]
    renderWithProject(points)
    // expand row to reveal defaultValue input
    const more = await screen.findByTestId('io-more-0')
    await waitFor(() => expect(more).toBeInTheDocument())
    await userEvent.click(more)
    await waitFor(() => expect(screen.getByTestId('io-default-0')).toBeInTheDocument())
    expect(screen.queryByTestId('io-default-0-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('io-default-0')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByTestId('io-default-0')).toHaveAttribute('placeholder', 'K50 (e.g. 5.0s)')
  })

  it('shows preset error for Timer with bare number 50', async () => {
    const points: IOPoint[] = [{ address: 'T0', type: 'Timer', label: 'Delay', defaultValue: '50' }]
    renderWithProject(points)
    await userEvent.click(await screen.findByTestId('io-more-0'))
    await waitFor(() => expect(screen.getByTestId('io-default-0')).toBeInTheDocument())
    const err = await screen.findByTestId('io-default-0-error')
    expect(err).toHaveTextContent(/K/)
    expect(screen.getByTestId('io-default-0')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('io-default-0')).toHaveClass('border-red-500')
  })

  it('shows preset error for Counter with invalid value and placeholder K10', async () => {
    const points: IOPoint[] = [{ address: 'C0', type: 'Counter', label: 'Cnt', defaultValue: 'bad' }]
    renderWithProject(points)
    await userEvent.click(await screen.findByTestId('io-more-0'))
    await waitFor(() => expect(screen.getByTestId('io-default-0')).toBeInTheDocument())
    expect(await screen.findByTestId('io-default-0-error')).toBeInTheDocument()
    expect(screen.getByTestId('io-default-0')).toHaveAttribute('placeholder', 'K10')
  })

  it('does not validate preset for Input type (free text)', async () => {
    const points: IOPoint[] = [{ address: 'X0', type: 'Input', label: 'Btn', defaultValue: '50' }]
    renderWithProject(points)
    await userEvent.click(await screen.findByTestId('io-more-0'))
    await waitFor(() => expect(screen.getByTestId('io-default-0')).toBeInTheDocument())
    expect(screen.queryByTestId('io-default-0-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('io-default-0')).toHaveAttribute('placeholder', '...')
  })

  it('uppercase-normalizes Timer preset on type (50 → remains invalid, k50→K50 valid)', async () => {
    const user = userEvent.setup()
    const points: IOPoint[] = [{ address: 'T0', type: 'Timer', label: 'Delay', defaultValue: '' }]
    renderWithProject(points)
    await user.click(await screen.findByTestId('io-more-0'))
    const input = await screen.findByTestId('io-default-0') as HTMLInputElement
    await user.clear(input)
    await user.type(input, 'k50')
    expect(input.value).toBe('K50')
    expect(screen.queryByTestId('io-default-0-error')).not.toBeInTheDocument()
  })
})
