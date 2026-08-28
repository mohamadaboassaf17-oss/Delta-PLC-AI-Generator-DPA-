import { useState, type ReactElement } from 'react'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useProject } from '@/hooks/useProject'
import { SettingsPanel } from '@/components/SettingsPanel'
import { useToast } from '@/components/Toast'
import { exportXml, exportCsv, copyIlToClipboard } from '@/lib/tauriApi'

export function ProjectToolbar(): ReactElement {
  const { project, isDirty, save, saveAs, close, status } = useProject()
  const toast = useToast()
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)

  if (!project) return <></>

  const handleSave = async (): Promise<void> => {
    await save()
  }

  const handleSaveAs = async (): Promise<void> => {
    const path = await saveDialog({
      filters: [{ name: 'DPA Project', extensions: ['dpa'] }],
      defaultPath: `${project.name}.dpa`,
    })
    if (typeof path === 'string' && path.length > 0) {
      await saveAs(path)
    }
  }

  const handleExportXml = async (): Promise<void> => {
    const path = await saveDialog({
      filters: [{ name: 'ISPSoft XML', extensions: ['xml'] }],
      defaultPath: `${project.name}.xml`,
    })
    if (typeof path !== 'string' || path.length === 0) return
    const result = await exportXml(project, path)
    if (result.error) {
      toast.error(`Export XML failed: ${result.error}`)
    } else {
      toast.success('XML exported successfully')
    }
  }

  const handleExportCsv = async (): Promise<void> => {
    const path = await saveDialog({
      filters: [{ name: 'DOPSoft CSV', extensions: ['csv'] }],
      defaultPath: `${project.name}.csv`,
    })
    if (typeof path !== 'string' || path.length === 0) return
    const result = await exportCsv(project, path)
    if (result.error) {
      toast.error(`Export CSV failed: ${result.error}`)
    } else {
      toast.success('CSV exported successfully')
    }
  }

  const handleCopyIl = async (): Promise<void> => {
    if (!project.generated?.il) return
    const result = await copyIlToClipboard(project.generated.il)
    if (result.error) {
      toast.error(`Copy IL failed: ${result.error}`)
    } else {
      toast.success('IL copied to clipboard')
    }
  }

  const handleClose = (): void => {
    close()
  }

  const saving = status === 'saving'

  // Disabled-precondition checks for the export buttons.
  const canExportXml = Boolean(project.generated?.st)
  const canExportCsv = Boolean(
    project.hmi_table && Array.isArray(project.hmi_table.tags) && project.hmi_table.tags.length > 0,
  )
  const canCopyIl = Boolean(
    project.generated?.il && project.generated.il.trim().length > 0,
  )

  const isSaveDisabled = !isDirty || saving
  const saveTitle = saving
    ? 'Saving in progress — please wait'
    : !isDirty
      ? 'No changes to save'
      : undefined
  const saveAsTitle = saving ? 'Saving in progress — please wait' : undefined
  const exportXmlTitle = canExportXml ? undefined : 'Generate ST code to enable XML export'
  const exportCsvTitle = canExportCsv ? undefined : 'No HMI tags to export — generate code first'
  const copyIlTitle = canCopyIl ? undefined : 'Generate IL code to enable copy'

  return (
    <div
      data-testid="project-toolbar"
      className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--color-text)]">{project.name}</span>
        {isDirty && (
          <span data-testid="dirty-indicator" className="text-xs text-[var(--color-accent)]">
            •
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaveDisabled}
          aria-disabled={isSaveDisabled}
          title={saveTitle}
          data-testid="save-btn"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleSaveAs}
          disabled={saving}
          aria-disabled={saving}
          title={saveAsTitle}
          data-testid="save-as-btn"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] disabled:opacity-40"
        >
          Save As…
        </button>
        <button
          type="button"
          onClick={handleExportXml}
          disabled={!canExportXml}
          aria-disabled={!canExportXml}
          title={exportXmlTitle}
          data-testid="export-xml-btn"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] disabled:opacity-40"
        >
          Export XML
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!canExportCsv}
          aria-disabled={!canExportCsv}
          title={exportCsvTitle}
          data-testid="export-csv-btn"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] disabled:opacity-40"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={handleCopyIl}
          disabled={!canCopyIl}
          aria-disabled={!canCopyIl}
          title={copyIlTitle}
          data-testid="copy-il-btn"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] disabled:opacity-40"
        >
          Copy IL
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)]"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-border)]"
        >
          Close Project
        </button>
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
