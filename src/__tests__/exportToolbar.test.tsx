import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { ProjectProvider, useProjectContextValue } from '@/context/ProjectContext'
import { ProjectToolbar } from '@/components/ProjectToolbar'
import { ToastProvider } from '@/components/Toast'
import { exportXml, exportCsv, copyIlToClipboard } from '@/lib/tauriApi'
import type { Project } from '@/types/project'

const { invokeMock, saveDialogMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  saveDialogMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: saveDialogMock,
}))

const projectWithExportable: Project = {
  id: 'export-1',
  name: 'Exportable',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  version: 3,
  meta: { model: 'DVP-SS2' },
  io_table: [],
  generated: {
    st: 'Y0 := X0;',
    il: 'LD X0\nOUT Y0',
    generated_at: '2026-01-01T00:00:00Z',
  },
  hmi_table: {
    tags: [
      {
        address: 'M100',
        type: 'Button',
        label: 'Start',
        plcRef: 'X0',
        source: 'auto',
      },
    ],
    reservedMRange: [100, 119],
    model: 'DVP-SS2',
  },
}

const projectWithoutIl: Project = {
  ...projectWithExportable,
  id: 'export-2',
  generated: {
    st: 'Y0 := X0;',
    generated_at: '2026-01-01T00:00:00Z',
  },
}

const projectWithoutGenerated: Project = {
  ...projectWithExportable,
  id: 'export-3',
  generated: undefined,
}

function setupInvoke(project: Project | null): void {
  // Preserve any existing mock implementation (set by individual tests) and
  // only inject the `project_new` behaviour needed for ProjectSeeder. Without
  // this merge, the test's specialised handlers (e.g. Promise.reject for a
  // failing export_xml) would be silently overwritten.
  const existing = invokeMock.getMockImplementation()
  invokeMock.mockImplementation((cmd: string): unknown => {
    if (cmd === 'project_new') return Promise.resolve(project)
    if (existing !== undefined) return existing(cmd)
    return Promise.resolve(null)
  })
}

interface SeederProps {
  name: string
}

function ProjectSeeder({ name }: SeederProps): null {
  const { createNew } = useProjectContextValue()
  useEffect(() => {
    void createNew(name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderWithSeedProject(project: Project | null, name: string): void {
  setupInvoke(project)
  if (project === null) {
    render(
      <ToastProvider>
        <ProjectProvider>
          <ProjectToolbar />
        </ProjectProvider>
      </ToastProvider>,
    )
    return
  }
  render(
    <ToastProvider>
      <ProjectProvider>
        <ProjectSeeder name={name} />
        <ProjectToolbar />
      </ProjectProvider>
    </ToastProvider>,
  )
}

describe('ProjectToolbar export buttons (M8)', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    saveDialogMock.mockReset()
  })

  it('renders Export XML, Export CSV, and Copy IL enabled when project has generated ST, IL, and HMI tags', async () => {
    renderWithSeedProject(projectWithExportable, 'Exportable')

    await waitFor(() => {
      expect(screen.getByTestId('export-xml-btn')).toBeInTheDocument()
    })
    expect(screen.getByTestId('export-xml-btn')).toBeEnabled()
    expect(screen.getByTestId('export-csv-btn')).toBeEnabled()
    expect(screen.getByTestId('copy-il-btn')).toBeEnabled()
  })

  it('disables Copy IL when project has generated ST but no IL', async () => {
    renderWithSeedProject(projectWithoutIl, 'Exportable')

    await waitFor(() => {
      expect(screen.getByTestId('copy-il-btn')).toBeInTheDocument()
    })
    expect(screen.getByTestId('copy-il-btn')).toBeDisabled()
  })

  it('disables the ST/IL export buttons when project has no generated code (CSV still enabled when hmi_table has tags)', async () => {
    renderWithSeedProject(projectWithoutGenerated, 'Exportable')

    await waitFor(() => {
      expect(screen.getByTestId('export-xml-btn')).toBeInTheDocument()
    })
    expect(screen.getByTestId('export-xml-btn')).toBeDisabled()
    expect(screen.getByTestId('copy-il-btn')).toBeDisabled()
    // CSV depends on hmi_table.tags, not on generated — should be enabled here.
    expect(screen.getByTestId('export-csv-btn')).toBeEnabled()
  })

  it('renders no export buttons when no project is active', () => {
    renderWithSeedProject(null, 'NoProject')
    expect(screen.queryByTestId('export-xml-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('export-csv-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('copy-il-btn')).not.toBeInTheDocument()
  })
})

describe('M8 API wrappers', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('exportXml invokes the export_xml command with project and path', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    const result = await exportXml(projectWithExportable, 'C:\\tmp\\out.xml')
    expect(result.error).toBeUndefined()
    expect(invokeMock).toHaveBeenCalledWith('export_xml', {
      project: projectWithExportable,
      path: 'C:\\tmp\\out.xml',
    })
  })

  it('exportCsv invokes the export_csv command', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    const result = await exportCsv(projectWithExportable, 'C:\\tmp\\out.csv')
    expect(result.error).toBeUndefined()
    expect(invokeMock).toHaveBeenCalledWith('export_csv', {
      project: projectWithExportable,
      path: 'C:\\tmp\\out.csv',
    })
  })

  it('copyIlToClipboard invokes the copy_il_to_clipboard command', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    const il = 'LD X0\nOUT Y0'
    const result = await copyIlToClipboard(il)
    expect(result.error).toBeUndefined()
    expect(invokeMock).toHaveBeenCalledWith('copy_il_to_clipboard', { il })
  })

  it('exportXml surfaces backend errors in the result object', async () => {
    invokeMock.mockRejectedValueOnce(new Error('io: write failed'))
    const result = await exportXml(projectWithExportable, 'C:\\bad\\path.xml')
    expect(result.error).toBeDefined()
  })
})

describe('ProjectToolbar error toasts (replaces window.alert)', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    saveDialogMock.mockReset()
  })

  it('Export XML failure shows an error toast instead of window.alert', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectWithExportable)
      if (cmd === 'export_xml') return Promise.reject(new Error('io: write failed'))
      return Promise.resolve(null)
    })
    saveDialogMock.mockResolvedValueOnce('C:\\tmp\\out.xml')

    renderWithSeedProject(projectWithExportable, 'Exportable')

    const btn = await waitFor(() => screen.getByTestId('export-xml-btn'))
    const user = userEvent.setup()
    await user.click(btn)

    const toast = await screen.findByTestId('toast-error')
    expect(toast).toHaveTextContent(/Export XML failed/i)
    expect(toast).toHaveTextContent(/io: write failed/i)
  })

  it('Export CSV failure shows an error toast', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectWithExportable)
      if (cmd === 'export_csv') return Promise.reject(new Error('csv: bad header'))
      return Promise.resolve(null)
    })
    saveDialogMock.mockResolvedValueOnce('C:\\tmp\\out.csv')

    renderWithSeedProject(projectWithExportable, 'Exportable')

    const btn = await waitFor(() => screen.getByTestId('export-csv-btn'))
    const user = userEvent.setup()
    await user.click(btn)

    const toast = await screen.findByTestId('toast-error')
    expect(toast).toHaveTextContent(/Export CSV failed/i)
    expect(toast).toHaveTextContent(/csv: bad header/i)
  })

  it('Copy IL failure shows an error toast', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectWithExportable)
      if (cmd === 'copy_il_to_clipboard') return Promise.reject(new Error('clipboard: busy'))
      return Promise.resolve(null)
    })

    renderWithSeedProject(projectWithExportable, 'Exportable')

    const btn = await waitFor(() => screen.getByTestId('copy-il-btn'))
    const user = userEvent.setup()
    await user.click(btn)

    const toast = await screen.findByTestId('toast-error')
    expect(toast).toHaveTextContent(/Copy IL failed/i)
    expect(toast).toHaveTextContent(/clipboard: busy/i)
  })

  it('successful export shows a success toast (not an error toast)', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectWithExportable)
      if (cmd === 'export_xml') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
    saveDialogMock.mockResolvedValueOnce('C:\\tmp\\out.xml')

    renderWithSeedProject(projectWithExportable, 'Exportable')

    const btn = await waitFor(() => screen.getByTestId('export-xml-btn'))
    const user = userEvent.setup()
    await user.click(btn)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('export_xml', expect.any(Object))
    })
    expect(screen.queryByTestId('toast-error')).not.toBeInTheDocument()
    expect(await screen.findByTestId('toast-success')).toHaveTextContent(/XML exported/i)
  })

  it('successful CSV export shows a success toast', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectWithExportable)
      if (cmd === 'export_csv') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
    saveDialogMock.mockResolvedValueOnce('C:\\tmp\\out.csv')

    renderWithSeedProject(projectWithExportable, 'Exportable')

    const btn = await waitFor(() => screen.getByTestId('export-csv-btn'))
    const user = userEvent.setup()
    await user.click(btn)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('export_csv', expect.any(Object))
    })
    expect(await screen.findByTestId('toast-success')).toHaveTextContent(/CSV exported/i)
  })

  it('successful Copy IL shows a success toast', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'project_new') return Promise.resolve(projectWithExportable)
      if (cmd === 'copy_il_to_clipboard') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })

    renderWithSeedProject(projectWithExportable, 'Exportable')

    const btn = await waitFor(() => screen.getByTestId('copy-il-btn'))
    const user = userEvent.setup()
    await user.click(btn)

    expect(await screen.findByTestId('toast-success')).toHaveTextContent(/IL copied/i)
  })
})

describe('ProjectToolbar export buttons FIX-09 — disabled tooltips + aria-disabled', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    saveDialogMock.mockReset()
  })

  it('Export XML disabled button has explanatory title and aria-disabled', async () => {
    renderWithSeedProject(projectWithoutGenerated, 'Exportable')
    const btn = await waitFor(() => screen.getByTestId('export-xml-btn'))
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).toHaveAttribute('title', 'Generate ST code to enable XML export')
  })

  it('Export CSV disabled button has explanatory title and aria-disabled when no HMI tags', async () => {
    const projectNoHmi: Project = { ...projectWithExportable, hmi_table: { tags: [], reservedMRange: [100, 119], model: 'DVP-SS2' } }
    renderWithSeedProject(projectNoHmi, 'Exportable')
    const btn = await waitFor(() => screen.getByTestId('export-csv-btn'))
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).toHaveAttribute('title', expect.stringMatching(/No HMI tags/i))
  })

  it('Copy IL disabled button has explanatory title and aria-disabled when IL is missing', async () => {
    renderWithSeedProject(projectWithoutIl, 'Exportable')
    const btn = await waitFor(() => screen.getByTestId('copy-il-btn'))
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).toHaveAttribute('title', 'Generate IL code to enable copy')
  })

  it('Copy IL disabled when IL is whitespace-only', async () => {
    const projectWhitespaceIl: Project = {
      ...projectWithExportable,
      generated: { st: 'Y0 := X0;', il: '   \n\t  ', generated_at: '2026-01-01T00:00:00Z' },
    }
    renderWithSeedProject(projectWhitespaceIl, 'Exportable')
    const btn = await waitFor(() => screen.getByTestId('copy-il-btn'))
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Generate IL code to enable copy')
  })

  it('enabled export buttons have no title and aria-disabled=false', async () => {
    renderWithSeedProject(projectWithExportable, 'Exportable')
    const xmlBtn = await waitFor(() => screen.getByTestId('export-xml-btn'))
    const csvBtn = screen.getByTestId('export-csv-btn')
    const ilBtn = screen.getByTestId('copy-il-btn')
    for (const btn of [xmlBtn, csvBtn, ilBtn]) {
      expect(btn).toBeEnabled()
      expect(btn).toHaveAttribute('aria-disabled', 'false')
      // No explanatory tooltip when enabled
      expect(btn.getAttribute('title')).toBeFalsy()
    }
  })

  it('Save button disabled when no dirty changes has title "No changes to save" and aria-disabled', async () => {
    renderWithSeedProject(projectWithExportable, 'Exportable')
    const btn = await waitFor(() => screen.getByTestId('save-btn'))
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).toHaveAttribute('title', 'No changes to save')
  })
})
