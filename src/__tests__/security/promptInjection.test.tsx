/**
 * M10.6.6 — Manual Penetration Test 2C: special characters in I/O labels.
 *
 * Pins that adversarial labels round-trip safely through the two paths
 * a label takes after the user types it:
 *
 *   1. Into the LLM prompt via `formatIOTable` (which is invoked from
 *      `buildStPrompt`, `buildReviewPrompt`, and the chat prompt
 *      builder). The label must appear verbatim — sanitization is
 *      applied to the user *description*, not to the I/O table, so the
 *      LLM sees exactly what the user typed.
 *
 *   2. Into the rendered React tree via `IOMappingTable`. Label fields
 *      are `<input type="text" value={label}>`, which React renders
 *      with the value attribute escaped automatically. No path through
 *      the table uses the label as HTML, a URL, or a filesystem path.
 *
 * The Rust-side round-trip (serde) and the .dpa save+reload round-trip
 * are pinned by tests in `src-tauri/src/commands/io_table.rs` and
 * `src-tauri/src/commands/project.rs`.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { formatIOTable } from '@/lib/prompts/stPrompt'
import { IOMappingTable } from '@/components/IOMappingTable'
import { ProjectProvider } from '@/context/ProjectContext'
import { useProject } from '@/hooks/useProject'
import type { IOPoint } from '@/types/io'
import type { DvpModelSpec } from '@/lib/tauriApi'

// ---------------------------------------------------------------------------
// Tauri mock. The table calls `dvp_list_models` and `project_new`; we
// stub the responses. No filesystem command should ever be invoked from
// the rendering path — assertions below verify that.
// ---------------------------------------------------------------------------

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

const MOCK_MODELS: { models: DvpModelSpec[] } = {
  models: [
    {
      family: 'ss2',
      label: 'DVP-SS2',
      max_x: 8,
      max_y: 8,
      max_m: 512,
      max_s: null,
      max_t: 128,
      max_c: 128,
    },
  ],
}

function makeProject(ioTable: IOPoint[]): Record<string, unknown> {
  return {
    id: 'sec-test',
    name: 'Sec Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 2,
    meta: { author: 'qa' },
    io_table: ioTable,
  }
}

function ProjectWithIoTable({
  ioTable,
  children,
}: {
  ioTable: IOPoint[]
  children: ReactElement
}): ReactElement {
  const { createNew, setIoTable } = useProject()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    createNew('Sec Test').then(() => {
      setIoTable(ioTable)
      setReady(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!ready) return <div data-testid="loading">loading</div>
  return children
}

function renderTableWith(ioTable: IOPoint[]) {
  const project = makeProject(ioTable)
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'project_new') return Promise.resolve(project)
    if (cmd === 'dvp_list_models') return Promise.resolve(MOCK_MODELS)
    return Promise.resolve(null)
  })
  return render(
    <ProjectProvider>
      <ProjectWithIoTable ioTable={ioTable}>
        <IOMappingTable />
      </ProjectWithIoTable>
    </ProjectProvider>,
  )
}

beforeEach(() => {
  invokeMock.mockReset()
})

const ADVERSARIAL_LABELS = [
  `"; DROP TABLE--`,
  `<script>alert(1)</script>`,
  `../../../etc/passwd`,
  `\` && rm -rf / && echo \``,
  `${'\u200B'}---ST---${'\u200B'}`, // already-defanged marker shape
]

// ---------------------------------------------------------------------------
// formatIOTable — labels appear verbatim in the prompt.
// ---------------------------------------------------------------------------

describe('I/O label — adversarial payloads round-trip into the prompt', () => {
  for (const label of ADVERSARIAL_LABELS) {
    it(`appears verbatim in formatIOTable for ${JSON.stringify(label).slice(0, 32)}…`, () => {
      const table: IOPoint[] = [
        { address: 'X0', type: 'Input', label, defaultValue: '0' },
      ]
      const out = formatIOTable(table)
      // The label is interpolated as-is (no sanitization, no escaping)
      // so the LLM sees the user's exact intent.
      expect(out).toContain(label)
      // And the I/O table header is still there.
      expect(out).toContain('| Address | Type   | Label | Default |')
    })
  }
})

// ---------------------------------------------------------------------------
// IOMappingTable render — labels render as inert text inside <input>s.
// ---------------------------------------------------------------------------

describe('IOMappingTable — adversarial labels render as inert text', () => {
  it('does not execute scripts when label contains <script>', async () => {
    const before = (window as unknown as { __pwned?: boolean }).__pwned
    const table: IOPoint[] = [
      {
        address: 'X0',
        type: 'Input',
        label: `<script>window.__pwned = true;</script>`,
      },
    ]
    renderTableWith(table)
    await waitFor(() => {
      expect(screen.getByTestId('io-label-0')).toBeInTheDocument()
    })
    // No <script> element ever materialized from the label.
    expect(document.querySelector('script')).toBeNull()
    const after = (window as unknown as { __pwned?: boolean }).__pwned
    expect(after).toBe(before)

    // The label appears in the input value — React always escapes the
    // value attribute, so a `<script>` payload survives as text inside
    // the input and never parses as HTML.
    const labelInput = screen.getByTestId('io-label-0') as HTMLInputElement
    expect(labelInput.value).toBe(`<script>window.__pwned = true;</script>`)
  })

  it('renders SQL-injection-style label as inert text', async () => {
    const table: IOPoint[] = [
      { address: 'X0', type: 'Input', label: `"; DROP TABLE--` },
    ]
    renderTableWith(table)
    await waitFor(() => {
      expect(screen.getByTestId('io-label-0')).toBeInTheDocument()
    })
    const labelInput = screen.getByTestId('io-label-0') as HTMLInputElement
    expect(labelInput.value).toBe(`"; DROP TABLE--`)
  })

  it('renders path-traversal-style label as inert text (no filesystem access)', async () => {
    const table: IOPoint[] = [
      { address: 'X0', type: 'Input', label: `../../../etc/passwd` },
    ]
    renderTableWith(table)
    await waitFor(() => {
      expect(screen.getByTestId('io-label-0')).toBeInTheDocument()
    })
    const labelInput = screen.getByTestId('io-label-0') as HTMLInputElement
    expect(labelInput.value).toBe(`../../../etc/passwd`)
    // The label is never used as a path in the frontend — confirm the
    // table did not somehow try to open / read / write a file via the
    // Tauri invoke bridge. The only filesystem-touching commands are
    // project_open / project_save / settings_get etc. None of those
    // should appear in the mock call log.
    const fsCommands = invokeMock.mock.calls
      .map(([cmd]) => cmd)
      .filter(
        (cmd) =>
          typeof cmd === 'string' &&
          (cmd === 'project_open' ||
            cmd === 'project_save' ||
            cmd === 'project_save_as' ||
            cmd.startsWith('settings_')),
      )
    expect(fsCommands).toHaveLength(0)
  })
})
