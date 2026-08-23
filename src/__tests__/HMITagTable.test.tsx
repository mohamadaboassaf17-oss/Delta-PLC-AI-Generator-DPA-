import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { useProject } from '@/hooks/useProject'
import { HMITagTable } from '@/components/HMITagTable'
import type { HMITag, HmiTable } from '@/types/hmi'
import type { IOPoint } from '@/types/io'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

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
    return Promise.resolve(null)
  })
}

function ProjectSetupWrapper({ children }: { children: ReactElement }) {
  const { createNew } = useProject()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    createNew('Test Project').then(() => setReady(true))
  }, [])

  if (!ready) return <div data-testid="loading">Loading...</div>
  return children
}

function renderWithProject(overrides?: Record<string, unknown>) {
  const project = createProject(overrides)
  setupInvoke(project)
  return render(
    <ProjectProvider>
      <ProjectSetupWrapper>
        <HMITagTable />
      </ProjectSetupWrapper>
    </ProjectProvider>,
  )
}

describe('HMITagTable', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('renders empty state when no tags', () => {
    setupInvoke()
    render(
      <ProjectProvider>
        <HMITagTable />
      </ProjectProvider>,
    )
    expect(screen.getByTestId('hmi-add-row')).toBeInTheDocument()
    expect(screen.getByText(/No HMI tags yet/)).toBeInTheDocument()
  })

  it('renders existing tags with correct type and label', async () => {
    const tags: HMITag[] = [
      { address: 'M0', type: 'Button', label: 'Start', plcRef: 'X0', source: 'manual' },
      { address: 'M1', type: 'Lamp', label: 'Running', plcRef: 'Y0', source: 'auto' },
    ]
    const hmiTable: HmiTable = { tags, reservedMRange: [0, 1], model: null }
    renderWithProject({ hmi_table: hmiTable })

    await waitFor(() => {
      expect(screen.getByText('M0')).toBeInTheDocument()
    })

    expect(screen.getByText('M1')).toBeInTheDocument()
    expect(screen.getByTestId('hmi-type-0')).toHaveValue('Button')
    expect(screen.getByTestId('hmi-type-1')).toHaveValue('Lamp')
    expect(screen.getByTestId('hmi-label-0')).toHaveValue('Start')
    expect(screen.getByTestId('hmi-label-1')).toHaveValue('Running')
    // M12.1.3 — plcRef moves to the expandable row. Expand the first row
    // to verify it carries through.
    await userEvent.setup().click(screen.getByTestId('hmi-more-0'))
    await waitFor(() => {
      expect(screen.getByTestId('hmi-plcref-0')).toBeInTheDocument()
    })
    expect(screen.getByTestId('hmi-plcref-0')).toHaveValue('X0')
  })

  it('adds a new manual row when clicking add button', async () => {
    const user = userEvent.setup()
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByTestId('hmi-add-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('hmi-add-row'))

    expect(screen.getByTestId('hmi-type-0')).toHaveValue('Button')
    expect(screen.getByTestId('hmi-label-0')).toHaveValue('')
    expect(screen.getByText('Manual')).toBeInTheDocument()
  })

  it('changes tag type via dropdown', async () => {
    const user = userEvent.setup()
    const tags: HMITag[] = [
      { address: 'M0', type: 'Button', label: 'Test', plcRef: 'X0', source: 'auto' },
    ]
    const hmiTable: HmiTable = { tags, reservedMRange: [0, 0], model: null }
    renderWithProject({ hmi_table: hmiTable })

    await waitFor(() => {
      expect(screen.getByTestId('hmi-type-0')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByTestId('hmi-type-0'), 'Lamp')

    expect(screen.getByTestId('hmi-type-0')).toHaveValue('Lamp')
    expect(screen.getByText('Manual')).toBeInTheDocument()
  })

  it('edits label input and commits the change', async () => {
    const user = userEvent.setup()
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByTestId('hmi-add-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('hmi-add-row'))

    const labelInput = screen.getByTestId('hmi-label-0')
    await user.clear(labelInput)
    await user.type(labelInput, 'Start Button')

    expect(labelInput).toHaveValue('Start Button')
  })

  it('deletes a row', async () => {
    const user = userEvent.setup()
    const tags: HMITag[] = [
      { address: 'M0', type: 'Button', label: 'Keep', plcRef: 'X0', source: 'manual' },
      { address: 'M1', type: 'Lamp', label: 'Delete', plcRef: 'X1', source: 'manual' },
    ]
    const hmiTable: HmiTable = { tags, reservedMRange: [0, 1], model: null }
    renderWithProject({ hmi_table: hmiTable })

    await waitFor(() => {
      expect(screen.getByTestId('hmi-delete-1')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('hmi-delete-1'))

    await waitFor(() => {
      expect(screen.getByText('M0')).toBeInTheDocument()
      expect(screen.queryByText('M1')).not.toBeInTheDocument()
    })
  })

  it('shows conflict banner and red border when address overlaps', async () => {
    const tags: HMITag[] = [
      { address: 'M5', type: 'Button', label: 'Btn', plcRef: 'X0', source: 'auto' },
    ]
    const hmiTable: HmiTable = { tags, reservedMRange: [5, 5], model: null }
    const ioPoints: IOPoint[] = [
      { address: 'M5', type: 'Relay', label: 'Existing Relay' },
      { address: 'X0', type: 'Input', label: 'Input 0' },
    ]
    renderWithProject({ hmi_table: hmiTable, io_table: ioPoints })

    await waitFor(() => {
      expect(screen.getByTestId('hmi-conflict-banner')).toBeInTheDocument()
    })

    expect(screen.getByTestId('hmi-conflict-banner')).toHaveTextContent(/HMI tag address M5/)
    expect(screen.getByTestId('hmi-conflict-banner')).toHaveTextContent(/already used by a relay/)
  })

  it('shows conflict banner when plc ref is missing from I/O table', async () => {
    const tags: HMITag[] = [
      { address: 'M0', type: 'Button', label: 'Btn', plcRef: 'X5', source: 'auto' },
    ]
    const hmiTable: HmiTable = { tags, reservedMRange: [0, 0], model: null }
    const ioPoints: IOPoint[] = [
      { address: 'X0', type: 'Input', label: 'Input 0' },
    ]
    renderWithProject({ hmi_table: hmiTable, io_table: ioPoints })

    await waitFor(() => {
      expect(screen.getByTestId('hmi-conflict-banner')).toBeInTheDocument()
    })

    expect(screen.getByTestId('hmi-conflict-banner')).toHaveTextContent(/PLC reference X5/)
    expect(screen.getByTestId('hmi-conflict-banner')).toHaveTextContent(/not defined/)
  })

  it('shows no conflict banner when addresses are clean', async () => {
    const tags: HMITag[] = [
      { address: 'M0', type: 'Button', label: 'Btn', plcRef: 'X0', source: 'auto' },
    ]
    const hmiTable: HmiTable = { tags, reservedMRange: [0, 0], model: null }
    const ioPoints: IOPoint[] = [
      { address: 'X0', type: 'Input', label: 'Input 0' },
    ]
    renderWithProject({ hmi_table: hmiTable, io_table: ioPoints })

    await waitFor(() => {
      expect(screen.getByText('M0')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('hmi-conflict-banner')).not.toBeInTheDocument()
  })

  // --- M12.1.3: expandable row for PLC Reference / Comment -----------

  describe('expandable row (M12.1.3)', () => {
    it('does not render plcRef/comment inputs in the main row body by default', async () => {
      const tags: HMITag[] = [
        { address: 'M0', type: 'Button', label: 'Btn', plcRef: 'X0', source: 'manual' },
      ]
      const hmiTable: HmiTable = { tags, reservedMRange: [0, 0], model: null }
      renderWithProject({ hmi_table: hmiTable })

      await waitFor(() => {
        expect(screen.getByTestId('hmi-more-0')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('hmi-plcref-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('hmi-comment-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('hmi-more-row-0')).not.toBeInTheDocument()
    })

    it('renders plcRef/comment inputs in expandable row when ⋯ is clicked', async () => {
      const user = userEvent.setup()
      const tags: HMITag[] = [
        { address: 'M0', type: 'Button', label: 'Btn', plcRef: 'X0', source: 'manual' },
      ]
      const hmiTable: HmiTable = { tags, reservedMRange: [0, 0], model: null }
      renderWithProject({ hmi_table: hmiTable })

      await waitFor(() => {
        expect(screen.getByTestId('hmi-more-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('hmi-more-0'))

      await waitFor(() => {
        expect(screen.getByTestId('hmi-more-row-0')).toBeInTheDocument()
      })
      expect(screen.getByTestId('hmi-plcref-0')).toBeInTheDocument()
      expect(screen.getByTestId('hmi-comment-0')).toBeInTheDocument()
    })

    it('hides the inputs again on second click', async () => {
      const user = userEvent.setup()
      const tags: HMITag[] = [
        { address: 'M0', type: 'Button', label: 'Btn', plcRef: 'X0', source: 'manual' },
      ]
      const hmiTable: HmiTable = { tags, reservedMRange: [0, 0], model: null }
      renderWithProject({ hmi_table: hmiTable })

      await waitFor(() => {
        expect(screen.getByTestId('hmi-more-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('hmi-more-0'))
      await user.click(screen.getByTestId('hmi-more-0'))

      await waitFor(() => {
        expect(screen.queryByTestId('hmi-more-row-0')).not.toBeInTheDocument()
      })
      expect(screen.queryByTestId('hmi-plcref-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('hmi-comment-0')).not.toBeInTheDocument()
    })

    it('editing the plcRef inside the expandable row updates the project state', async () => {
      const user = userEvent.setup()
      const tags: HMITag[] = [
        { address: 'M0', type: 'Button', label: 'Btn', plcRef: 'X0', source: 'manual' },
      ]
      const hmiTable: HmiTable = { tags, reservedMRange: [0, 0], model: null }
      renderWithProject({ hmi_table: hmiTable })

      await waitFor(() => {
        expect(screen.getByTestId('hmi-more-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('hmi-more-0'))
      await waitFor(() => {
        expect(screen.getByTestId('hmi-plcref-0')).toBeInTheDocument()
      })

      const input = screen.getByTestId('hmi-plcref-0')
      await user.clear(input)
      await user.type(input, 'Y5')

      expect(input).toHaveValue('Y5')
    })

    it('editing the comment inside the expandable row updates the project state', async () => {
      const user = userEvent.setup()
      const tags: HMITag[] = [
        { address: 'M0', type: 'Button', label: 'Btn', plcRef: 'X0', source: 'manual' },
      ]
      const hmiTable: HmiTable = { tags, reservedMRange: [0, 0], model: null }
      renderWithProject({ hmi_table: hmiTable })

      await waitFor(() => {
        expect(screen.getByTestId('hmi-more-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('hmi-more-0'))
      await waitFor(() => {
        expect(screen.getByTestId('hmi-comment-0')).toBeInTheDocument()
      })

      const input = screen.getByTestId('hmi-comment-0')
      await user.clear(input)
      await user.type(input, 'note B')

      expect(input).toHaveValue('note B')
    })

    it('Source column (Auto/Manual) is still visible in the main row even when details are collapsed', async () => {
      const tags: HMITag[] = [
        { address: 'M0', type: 'Button', label: 'Btn', plcRef: 'X0', source: 'auto' },
        { address: 'M1', type: 'Lamp', label: 'Lmp', plcRef: 'Y0', source: 'manual' },
      ]
      const hmiTable: HmiTable = { tags, reservedMRange: [0, 1], model: null }
      renderWithProject({ hmi_table: hmiTable })

      await waitFor(() => {
        expect(screen.getByTestId('hmi-source-0')).toBeInTheDocument()
      })
      expect(screen.getByTestId('hmi-source-0')).toHaveTextContent('Auto')
      expect(screen.getByTestId('hmi-source-1')).toHaveTextContent('Manual')
      // plcRef/comment not yet rendered (rows are collapsed by default).
      expect(screen.queryByTestId('hmi-plcref-0')).not.toBeInTheDocument()
    })
  })
})
