import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { IOMappingTable, buildWarnings } from '@/components/IOMappingTable'
import { ProjectContext, type ProjectContextValue } from '@/context/ProjectContext'
import type { Project } from '@/types/project'
import type { IOPoint } from '@/types/io'
import './index.css'

// Mock Tauri IPC for harness — provides dvp_list_models without a real backend
if (!(window as any).__TAURI_INTERNALS__) {
  ;(window as any).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, _args?: unknown) => {
      if (cmd === 'dvp_list_models') {
        return {
          models: [
            { family: 'ss2', label: 'DVP-SS2', max_x: 8, max_y: 8, max_m: 512, max_s: null, max_t: 128, max_c: 128 },
            { family: 'se', label: 'DVP-SE', max_x: 8, max_y: 8, max_m: 512, max_s: null, max_t: 128, max_c: 128 },
            { family: 'sx2', label: 'DVP-SX2', max_x: 8, max_y: 8, max_m: 1024, max_s: 1024, max_t: 256, max_c: 256 },
            { family: 'sv2', label: 'DVP-SV2', max_x: 16, max_y: 16, max_m: 4096, max_s: 2048, max_t: 256, max_c: 256 },
          ],
        }
      }
      if (cmd === 'project_list_recent') return []
      return null
    },
  }
}
if (!(window as any).__TAURI__) {
  ;(window as any).__TAURI__ = {
    core: { invoke: (...args: unknown[]) => (window as any).__TAURI_INTERNALS__.invoke(...args) },
    event: { listen: async () => () => {} },
  }
}

// Mock project with M3 edge cases
const mockProject: Project = {
  id: 'm3-harness',
  name: 'M3 Visual Harness',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  version: 3,
  meta: { author: 'qa', description: 'M3 harness', tags: [], model: 'DVP-SS2' },
  io_table: [
    { address: 'X0', type: 'Input', label: 'Start Button' },
    { address: 'Y0', type: 'Output', label: 'Motor' },
    { address: 'T0', type: 'Timer', label: 'Delay 5s', defaultValue: 'K50', comment: '5 seconds delay' },
    { address: 'T1', type: 'Timer', label: 'Bad Timer', defaultValue: '50', comment: null },
    { address: 'C0', type: 'Counter', label: 'Count', defaultValue: 'K10', comment: null },
    { address: 'X10', type: 'Input', label: 'Sensor X10 (octal 10 = 8 decimal)' },
    { address: 'Y10', type: 'Output', label: 'Lamp Y10' },
    // Add overflow for warning test: 9 outputs (exceeds SS2 limit 8) — we already have Y0 and Y10, add 7 more
    ...Array.from({ length: 7 }, (_, i) => ({
      address: `Y${(i + 2).toString(8)}`, // Y2..Y11 octal
      type: 'Output' as const,
      label: `Out ${i + 2}`,
    })),
  ] as IOPoint[],
  generated: null,
  hmi_table: null,
  chat_history: null,
  // @ts-ignore - extra fields for harness
  path: null,
} as unknown as Project

function Harness() {
  const [project, setProject] = useState<Project>(mockProject as Project)

  const value: ProjectContextValue = {
    project,
    status: 'opened',
    error: null,
    path: null,
    isDirty: false,
    chatHistory: [],
    createNew: async () => {},
    openExisting: async () => {},
    save: async () => {},
    saveAs: async () => {},
    markDirty: () => {},
    setProjectModel: (model: string) => setProject((p) => ({ ...p!, meta: { ...p!.meta, model } })),
    setIoTable: (ioTable: IOPoint[]) => setProject((p) => ({ ...p!, io_table: ioTable })),
    setHmiTable: () => {},
    setGenerated: () => {},
    setChatHistory: () => {},
    addChatMessage: () => {},
    close: () => {},
  }

  // For testing octal generation: show what generateAddress would produce for next Input
  const warnings = buildWarnings(project.io_table as IOPoint[], {
    family: 'ss2',
    label: 'DVP-SS2',
    max_x: 8,
    max_y: 8,
    max_m: 512,
    max_s: null,
    max_t: 128,
    max_c: 128,
  } as any)

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-xl font-bold">M3 Visual Harness — I/O Mapping & Addressing</h1>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          This harness renders IOMappingTable with a mocked project containing M3 edge cases: octal addresses (X10/Y10), Timer K-validation (valid K50 + invalid 50), overflow warning (9 outputs).
        </p>
        {warnings.length > 0 && (
          <div data-testid="harness-warnings" className="mb-4 rounded bg-yellow-900/20 p-2 text-xs">
            Harness warnings: {warnings.map((w) => `${w.type} ${w.count}/${w.limit}`).join(', ')}
          </div>
        )}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <ProjectContext.Provider value={value}>
            <IOMappingTable />
          </ProjectContext.Provider>
        </div>
        <div className="mt-6 rounded border border-[var(--color-border)] p-4">
          <h2 className="mb-2 text-sm font-medium">Label Injection Demo (ST)</h2>
          <pre data-testid="st-demo" className="whitespace-pre-wrap text-xs">
            {`Y0 := X0;
T0 := X0 AND Y0; // should get // Delay 5s above T0 line after injection`}
          </pre>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            ST label injection is tested via unit tests (injectLabelComments) — see m3.test.ts. Visual demo shows raw ST before injection.
          </p>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
