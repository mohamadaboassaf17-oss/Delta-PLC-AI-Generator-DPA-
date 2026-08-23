import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { ProjectProvider } from '@/context/ProjectContext'
import { useProject } from '@/hooks/useProject'
import { IOMappingTable } from '@/components/IOMappingTable'
import { generateAddress } from '@/types/io'
import type { IOPoint, IOPointType } from '@/types/io'
import type { DvpModelSpec } from '@/lib/tauriApi'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

const defaultModels: { models: DvpModelSpec[] } = {
  models: [
    { family: 'ss2', label: 'DVP-SS2', max_x: 8, max_y: 8, max_m: 512, max_s: null, max_t: 128, max_c: 128 },
    { family: 'se', label: 'DVP-SE', max_x: 8, max_y: 8, max_m: 512, max_s: null, max_t: 128, max_c: 128 },
    { family: 'sx2', label: 'DVP-SX2', max_x: 8, max_y: 8, max_m: 1024, max_s: 1024, max_t: 256, max_c: 256 },
    { family: 'sv2', label: 'DVP-SV2', max_x: 16, max_y: 16, max_m: 4096, max_s: 2048, max_t: 256, max_c: 256 },
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

function renderWithProject(overrides?: Record<string, unknown>) {
  const project = createProject(overrides)
  setupInvoke(project)
  return render(
    <ProjectProvider>
      <ProjectSetupWrapper>
        <IOMappingTable />
      </ProjectSetupWrapper>
    </ProjectProvider>,
  )
}

describe('IOMappingTable', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('renders empty state when no project is active', () => {
    setupInvoke()
    render(
      <ProjectProvider>
        <IOMappingTable />
      </ProjectProvider>,
    )
    expect(screen.getByTestId('io-add-row')).toBeInTheDocument()
    expect(screen.getByText(/No I\/O points defined/)).toBeInTheDocument()
  })

  it('renders with existing I/O points', async () => {
    const points: IOPoint[] = [
      { address: 'X0', type: 'Input', label: 'Start' },
      { address: 'X1', type: 'Input', label: 'Stop' },
      { address: 'Y0', type: 'Output', label: 'Motor' },
    ]
    renderWithProject({ io_table: points })

    await waitFor(() => {
      expect(screen.getByTestId('io-address-0')).toHaveValue('X0')
    })

    expect(screen.getByTestId('io-address-1')).toHaveValue('X1')
    expect(screen.getByTestId('io-address-2')).toHaveValue('Y0')
    expect(screen.getByTestId('io-type-0')).toHaveValue('Input')
    expect(screen.getByTestId('io-type-1')).toHaveValue('Input')
    expect(screen.getByTestId('io-type-2')).toHaveValue('Output')
    expect(screen.getByTestId('io-label-0')).toHaveValue('Start')
    expect(screen.getByTestId('io-label-1')).toHaveValue('Stop')
    expect(screen.getByTestId('io-label-2')).toHaveValue('Motor')
  })

  it('populates model selector with four DVP models', async () => {
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByText('DVP-SS2')).toBeInTheDocument()
    })

    expect(screen.getByText('DVP-SE')).toBeInTheDocument()
    expect(screen.getByText('DVP-SX2')).toBeInTheDocument()
    expect(screen.getByText('DVP-SV2')).toBeInTheDocument()
  })

  it('selecting a model updates the select value', async () => {
    const user = userEvent.setup()
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByText('DVP-SX2')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByTestId('model-select'), 'DVP-SX2')

    expect(screen.getByTestId('model-select')).toHaveValue('DVP-SX2')
  })

  it('adds a new row with Input type and X0 address', async () => {
    const user = userEvent.setup()
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByTestId('io-add-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('io-add-row'))

    expect(screen.getByTestId('io-type-0')).toHaveValue('Input')
    expect(screen.getByTestId('io-address-0')).toHaveValue('X0')
  })

  it('adds multiple rows of same type with sequential addresses', async () => {
    const user = userEvent.setup()
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByTestId('io-add-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('io-add-row'))
    await user.click(screen.getByTestId('io-add-row'))
    await user.click(screen.getByTestId('io-add-row'))

    expect(screen.getByTestId('io-address-0')).toHaveValue('X0')
    expect(screen.getByTestId('io-address-1')).toHaveValue('X1')
    expect(screen.getByTestId('io-address-2')).toHaveValue('X2')
    expect(screen.getByTestId('io-type-0')).toHaveValue('Input')
    expect(screen.getByTestId('io-type-1')).toHaveValue('Input')
    expect(screen.getByTestId('io-type-2')).toHaveValue('Input')
  })

  it('deletes a row when delete button is clicked', async () => {
    const user = userEvent.setup()
    const points: IOPoint[] = [
      { address: 'X0', type: 'Input', label: 'Keep' },
      { address: 'X1', type: 'Input', label: 'Delete' },
    ]
    renderWithProject({ io_table: points })

    await waitFor(() => {
      expect(screen.getByTestId('io-delete-1')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('io-delete-1'))

    await waitFor(() => {
      expect(screen.getByTestId('io-address-0')).toHaveValue('X0')
      expect(screen.queryByTestId('io-address-1')).not.toBeInTheDocument()
    })
  })

  it('edits a label input and commits the change', async () => {
    const user = userEvent.setup()
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByTestId('io-add-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('io-add-row'))

    const labelInput = screen.getByTestId('io-label-0')
    await user.clear(labelInput)
    await user.type(labelInput, 'Start Button')

    expect(labelInput).toHaveValue('Start Button')
  })

  it('changes type and regenerates address', async () => {
    const user = userEvent.setup()
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByTestId('io-add-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('io-add-row'))

    expect(screen.getByTestId('io-address-0')).toHaveValue('X0')

    await user.selectOptions(screen.getByTestId('io-type-0'), 'Output')

    expect(screen.getByTestId('io-type-0')).toHaveValue('Output')
    expect(screen.getByTestId('io-address-0')).toHaveValue('Y0')
  })

  it('shows yellow warning when I/O count exceeds model limit', async () => {
    const nineOutputs: IOPoint[] = Array.from({ length: 9 }, (_, i) => ({
      address: generateAddress('Output', i),
      type: 'Output' as IOPointType,
      label: `Out ${i}`,
    }))
    renderWithProject({ meta: { author: 'qa', model: 'DVP-SS2' }, io_table: nineOutputs })

    await waitFor(() => {
      expect(screen.getByTestId('io-warning-banner')).toBeInTheDocument()
    })

    expect(screen.getByTestId('io-warning-banner')).toHaveTextContent(/Output/)
    expect(screen.getByTestId('io-warning-banner')).toHaveTextContent(/9/)
    expect(screen.getByTestId('io-warning-banner')).toHaveTextContent(/8/)
  })

  it('hides warning when I/O count is within model limit', async () => {
    const threeOutputs: IOPoint[] = Array.from({ length: 3 }, (_, i) => ({
      address: generateAddress('Output', i),
      type: 'Output' as IOPointType,
      label: `Out ${i}`,
    }))
    renderWithProject({ meta: { author: 'qa', model: 'DVP-SS2' }, io_table: threeOutputs })

    await waitFor(() => {
      expect(screen.getByText('DVP-SS2')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('io-warning-banner')).not.toBeInTheDocument()
  })

  it('hides warning when no model is selected', async () => {
    const manyOutputs: IOPoint[] = Array.from({ length: 9 }, (_, i) => ({
      address: generateAddress('Output', i),
      type: 'Output' as IOPointType,
      label: `Out ${i}`,
    }))
    renderWithProject({ io_table: manyOutputs })

    await waitFor(() => {
      expect(screen.getByTestId('io-address-0')).toHaveValue('Y0')
    })

    expect(screen.queryByTestId('io-warning-banner')).not.toBeInTheDocument()
  })

  it('moves focus between columns with Tab key', async () => {
    const user = userEvent.setup()
    renderWithProject()

    await waitFor(() => {
      expect(screen.getByTestId('io-add-row')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('io-add-row'))

    const addressInput = screen.getByTestId('io-address-0')
    addressInput.focus()
    expect(document.activeElement).toBe(addressInput)

    await user.keyboard('{Tab}')

    // M12.1.2 — Tab in the main row advances address → label only.
    // Default/Comment are in the expandable row, not the Tab sequence.
    expect(document.activeElement).toBe(screen.getByTestId('io-label-0'))
  })

  // --- M10.3.1: octal address inline validator -------------------------

  describe('octal address validator (M10.3.1)', () => {
    it('does not show an error for valid octal addresses', async () => {
      const points: IOPoint[] = [
        { address: 'X0', type: 'Input', label: 'a' },
        { address: 'X7', type: 'Input', label: 'b' },
        { address: 'X10', type: 'Input', label: 'c' },
        { address: 'Y17', type: 'Output', label: 'd' },
      ]
      renderWithProject({ io_table: points })
      await waitFor(() => {
        expect(screen.getByTestId('io-address-0')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('io-address-0-error')).not.toBeInTheDocument()
      expect(screen.queryByTestId('io-address-1-error')).not.toBeInTheDocument()
      expect(screen.queryByTestId('io-address-2-error')).not.toBeInTheDocument()
      expect(screen.queryByTestId('io-address-3-error')).not.toBeInTheDocument()

      for (const idx of [0, 1, 2, 3]) {
        expect(screen.getByTestId(`io-address-${idx}`)).toHaveAttribute(
          'aria-invalid',
          'false',
        )
      }
    })

    it('shows the Arabic octal error inline when X8 is typed', async () => {
      const user = userEvent.setup()
      renderWithProject({ io_table: [{ address: 'X0', type: 'Input', label: 'a' }] })

      await waitFor(() => {
        expect(screen.getByTestId('io-address-0')).toHaveValue('X0')
      })

      const input = screen.getByTestId('io-address-0')
      await user.clear(input)
      await user.type(input, 'X8')

      await waitFor(() => {
        expect(screen.getByTestId('io-address-0-error')).toBeInTheDocument()
      })
      const error = screen.getByTestId('io-address-0-error')
      expect(error.textContent).toMatch(/غير صالح/)
      expect(error.textContent).toMatch(/X7/)
      expect(error.textContent).toMatch(/X10/)
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input.className).toMatch(/border-red-500/)
    })

    it('shows the Arabic octal error when Y9 is typed', async () => {
      const user = userEvent.setup()
      renderWithProject({ io_table: [{ address: 'X0', type: 'Input', label: 'a' }] })

      await waitFor(() => {
        expect(screen.getByTestId('io-address-0')).toHaveValue('X0')
      })

      const input = screen.getByTestId('io-address-0')
      await user.clear(input)
      await user.type(input, 'Y9')

      await waitFor(() => {
        expect(screen.getByTestId('io-address-0-error')).toBeInTheDocument()
      })
      const error = screen.getByTestId('io-address-0-error')
      expect(error.textContent).toMatch(/Y9/)
      expect(error.textContent).toMatch(/Y7/)
      expect(error.textContent).toMatch(/Y10/)
    })

    it('clears the error message when an invalid value becomes valid', async () => {
      const user = userEvent.setup()
      renderWithProject({ io_table: [{ address: 'X0', type: 'Input', label: 'a' }] })

      await waitFor(() => {
        expect(screen.getByTestId('io-address-0')).toHaveValue('X0')
      })

      const input = screen.getByTestId('io-address-0')
      await user.clear(input)
      await user.type(input, 'X9')

      await waitFor(() => {
        expect(screen.getByTestId('io-address-0-error')).toBeInTheDocument()
      })

      await user.clear(input)
      await user.type(input, 'X10')

      await waitFor(() => {
        expect(screen.queryByTestId('io-address-0-error')).not.toBeInTheDocument()
      })
      expect(input).toHaveAttribute('aria-invalid', 'false')
    })
  })

  // --- M10.3.2: column widths snapshot --------------------------------

  describe('column widths (M10.3.2)', () => {
    it('renders fixed-width <col> entries for #, Address, Type, More', async () => {
      renderWithProject({
        io_table: [{ address: 'X0', type: 'Input', label: 'a' }],
      })
      await waitFor(() => {
        expect(screen.getByTestId('io-table')).toBeInTheDocument()
      })

      const table = screen.getByTestId('io-table')
      expect(table.className).toMatch(/table-fixed/)

      const widths = {
        'io-col-index': '22px',
        'io-col-address': '54px',
        'io-col-type': '58px',
        'io-col-more': '24px',
      } as const

      for (const [testId, expected] of Object.entries(widths)) {
        const col = within(table).getByTestId(testId)
        expect(col.tagName).toBe('COL')
        expect(col.getAttribute('style') ?? '').toContain(`width: ${expected}`)
      }

      // Label column has NO inline width so it takes the remaining
      // horizontal space. Default/Comment are no longer permanent
      // columns — they live in the expandable row.
      const labelCol = within(table).getByTestId('io-col-label')
      expect(labelCol.getAttribute('style')).toBeNull()

      // M12.1.2 — the old permanent Default/Comment columns are gone.
      expect(within(table).queryByTestId('io-col-default')).not.toBeInTheDocument()
      expect(within(table).queryByTestId('io-col-comment')).not.toBeInTheDocument()
      expect(within(table).queryByTestId('io-col-delete')).not.toBeInTheDocument()
    })

    it('matches the colgroup width snapshot', async () => {
      renderWithProject({
        io_table: [{ address: 'X0', type: 'Input', label: 'a' }],
      })
      await waitFor(() => {
        expect(screen.getByTestId('io-table')).toBeInTheDocument()
      })

      const colgroup = within(screen.getByTestId('io-table'))
        .getByTestId('io-col-index')
        .closest('colgroup') as HTMLElement
      expect(colgroup).not.toBeNull()
      expect(colgroup.outerHTML).toMatchInlineSnapshot(
        `"<colgroup><col data-testid="io-col-index" style="width: 22px;"><col data-testid="io-col-address" style="width: 54px;"><col data-testid="io-col-type" style="width: 58px;"><col data-testid="io-col-label"><col data-testid="io-col-more" style="width: 24px;"></colgroup>"`,
      )
    })
  })

  // --- M12.1.2: expandable row for Default/Comment -------------------

  describe('expandable row (M12.1.2)', () => {
    it('does not render default/comment inputs in the main row body by default', async () => {
      renderWithProject({
        io_table: [{ address: 'X0', type: 'Input', label: 'a' }],
      })
      await waitFor(() => {
        expect(screen.getByTestId('io-label-0')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('io-default-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('io-comment-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('io-more-row-0')).not.toBeInTheDocument()
    })

    it('renders default/comment inputs in expandable row when ⋯ is clicked', async () => {
      const user = userEvent.setup()
      renderWithProject({
        io_table: [{ address: 'X0', type: 'Input', label: 'a' }],
      })
      await waitFor(() => {
        expect(screen.getByTestId('io-more-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('io-more-0'))

      await waitFor(() => {
        expect(screen.getByTestId('io-more-row-0')).toBeInTheDocument()
      })
      expect(screen.getByTestId('io-default-0')).toBeInTheDocument()
      expect(screen.getByTestId('io-comment-0')).toBeInTheDocument()
    })

    it('hides the inputs again on second click', async () => {
      const user = userEvent.setup()
      renderWithProject({
        io_table: [{ address: 'X0', type: 'Input', label: 'a' }],
      })
      await waitFor(() => {
        expect(screen.getByTestId('io-more-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('io-more-0'))
      await user.click(screen.getByTestId('io-more-0'))

      await waitFor(() => {
        expect(screen.queryByTestId('io-more-row-0')).not.toBeInTheDocument()
      })
      expect(screen.queryByTestId('io-default-0')).not.toBeInTheDocument()
      expect(screen.queryByTestId('io-comment-0')).not.toBeInTheDocument()
    })

    it('each row expand state is independent', async () => {
      const user = userEvent.setup()
      renderWithProject({
        io_table: [
          { address: 'X0', type: 'Input', label: 'a' },
          { address: 'X1', type: 'Input', label: 'b' },
        ],
      })
      await waitFor(() => {
        expect(screen.getByTestId('io-more-1')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('io-more-0'))

      await waitFor(() => {
        expect(screen.getByTestId('io-more-row-0')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('io-more-row-1')).not.toBeInTheDocument()
      expect(screen.getByTestId('io-default-0')).toBeInTheDocument()
      expect(screen.queryByTestId('io-default-1')).not.toBeInTheDocument()
    })

    it('editing the default value inside the expandable row updates the project state', async () => {
      const user = userEvent.setup()
      renderWithProject({
        io_table: [{ address: 'X0', type: 'Input', label: 'a' }],
      })
      await waitFor(() => {
        expect(screen.getByTestId('io-more-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('io-more-0'))
      await waitFor(() => {
        expect(screen.getByTestId('io-default-0')).toBeInTheDocument()
      })

      const input = screen.getByTestId('io-default-0')
      await user.clear(input)
      await user.type(input, '1')

      expect(input).toHaveValue('1')
    })

    it('editing the comment inside the expandable row updates the project state', async () => {
      const user = userEvent.setup()
      renderWithProject({
        io_table: [{ address: 'X0', type: 'Input', label: 'a' }],
      })
      await waitFor(() => {
        expect(screen.getByTestId('io-more-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('io-more-0'))
      await waitFor(() => {
        expect(screen.getByTestId('io-comment-0')).toBeInTheDocument()
      })

      const input = screen.getByTestId('io-comment-0')
      await user.clear(input)
      await user.type(input, 'note A')

      expect(input).toHaveValue('note A')
    })
  })
})
