import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactElement,
  type KeyboardEvent,
} from 'react'
import { useProject } from '@/hooks/useProject'
import type { HMITag, HMIElementType, HMITagSource, HmiTable } from '@/types/hmi'
import { checkHmiConflicts, type HmiConflict } from '@/lib/hmi/checkConflicts'

const HMI_ELEMENT_TYPES: HMIElementType[] = ['Button', 'Lamp', 'Alarm', 'NumericDisplay', 'Setpoint']

// M12.1.3 — fixed column widths so the table fits inside the 268px left
// sidebar without a horizontal scrollbar. `Label` takes the remaining
// space. The `more` column hosts a ⋯ toggle that expands a second row
// containing the `PLC Reference` and `Comment` fields. The `Source`
// column is informational (Auto/Manual pill) and stays in the main row.
const COL_W = {
  index: 22,
  address: 54,
  type: 58,
  source: 44,
  more: 24,
} as const

interface EditState {
  row: number
  col: 'label' | 'plcRef' | 'comment'
  savedValue: string
}

export function HMITagTable(): ReactElement {
  const { project, setHmiTable } = useProject()

  const [edit, setEdit] = useState<EditState | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const addLabelRef = useRef<HTMLInputElement | null>(null)

  const hmiTable: HmiTable = useMemo(
    () => project?.hmi_table ?? { tags: [], reservedMRange: null, model: null },
    [project?.hmi_table],
  )
  const tags = hmiTable.tags

  useEffect(() => {
    const model = project?.meta?.model ?? null
    if (model !== null && hmiTable.model !== model) {
      setHmiTable({ ...hmiTable, model })
    }
  }, [project?.meta?.model, hmiTable.model, hmiTable, setHmiTable])

  const conflicts: HmiConflict[] = useMemo(
    () => checkHmiConflicts(hmiTable, project?.io_table ?? []),
    [hmiTable, project?.io_table],
  )

  const conflictByTagAndKind = useMemo(() => {
    const map = new Map<string, HmiConflict>()
    conflicts.forEach((c) => {
      map.set(`${c.tagIndex}-${c.kind}`, c)
    })
    return map
  }, [conflicts])

  const commitHmiTable = useCallback(
    (updated: HmiTable) => {
      setHmiTable(updated)
    },
    [setHmiTable],
  )

  const addRow = useCallback(() => {
    const newTag: HMITag = {
      address: null,
      type: 'Button' as HMIElementType,
      label: '',
      plcRef: '',
      source: 'manual' as HMITagSource,
    }
    const updated: HmiTable = {
      ...hmiTable,
      tags: [...tags, newTag],
    }
    commitHmiTable(updated)
    setTimeout(() => {
      addLabelRef.current?.focus()
    }, 0)
  }, [hmiTable, tags, commitHmiTable])

  const deleteRow = useCallback(
    (idx: number) => {
      const updated: HmiTable = {
        ...hmiTable,
        tags: tags.filter((_, i) => i !== idx),
      }
      commitHmiTable(updated)
      setExpandedRows((prev) => {
        if (!prev.has(idx)) return prev
        const next = new Set<number>()
        prev.forEach((n) => {
          if (n < idx) next.add(n)
        })
        return next
      })
    },
    [hmiTable, tags, commitHmiTable],
  )

  const updateType = useCallback(
    (idx: number, newType: HMIElementType) => {
      const updatedTags = [...tags]
      updatedTags[idx] = { ...updatedTags[idx], type: newType, source: 'manual' as HMITagSource }
      commitHmiTable({ ...hmiTable, tags: updatedTags })
    },
    [hmiTable, tags, commitHmiTable],
  )

  const updateField = useCallback(
    (idx: number, field: 'label' | 'plcRef' | 'comment', value: string) => {
      const updatedTags = [...tags]
      updatedTags[idx] = { ...updatedTags[idx], [field]: value }
      commitHmiTable({ ...hmiTable, tags: updatedTags })
    },
    [hmiTable, tags, commitHmiTable],
  )

  const handleFieldFocus = useCallback(
    (row: number, col: 'label' | 'plcRef' | 'comment', currentValue: string) => {
      setEdit({ row, col, savedValue: currentValue })
    },
    [],
  )

  const handleFieldBlur = useCallback(() => {
    setEdit(null)
  }, [])

  const toggleRow = useCallback((idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }, [])

  // M12.1.3 — Tab now only advances through `label` in the main row.
  // `plcRef` lives in the expandable row and is reached by expanding
  // the row first.
  const handleFieldKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, row: number, col: 'label' | 'plcRef') => {
      const cols: ('label' | 'plcRef')[] = ['label', 'plcRef']
      const colIdx = cols.indexOf(col)

      // If the user Tabs from `label` we don't auto-jump — the next
      // focusable thing in the main row is the `⋯` toggle.
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        const nextColIdx = colIdx + 1
        if (nextColIdx < cols.length) {
          ;(e.target as HTMLInputElement).blur()
          const nextInput = document.querySelector<HTMLInputElement>(
            `[data-io-row="${row}"][data-io-col="${cols[nextColIdx]}"]`,
          )
          nextInput?.focus()
        }
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (row < tags.length - 1) {
          ;(e.target as HTMLInputElement).blur()
          const nextInput = document.querySelector<HTMLInputElement>(
            `[data-io-row="${row + 1}"][data-io-col="${col}"]`,
          )
          nextInput?.focus()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (edit && edit.row === row && edit.col === col) {
          updateField(row, col, edit.savedValue)
          setEdit(null)
        }
        ;(e.target as HTMLInputElement).blur()
      }
    },
    [tags.length, edit, updateField],
  )

  const hasAddressOverlap = useCallback(
    (idx: number) => conflictByTagAndKind.has(`${idx}-address-overlap`),
    [conflictByTagAndKind],
  )

  const hasPlcRefMissing = useCallback(
    (idx: number) => conflictByTagAndKind.has(`${idx}-plc-ref-missing`),
    [conflictByTagAndKind],
  )

  return (
    <div className="flex flex-col gap-4">
      {conflicts.length > 0 && (
        <div
          data-testid="hmi-conflict-banner"
          className="rounded-md border border-yellow-700 bg-yellow-900/30 px-4 py-3 text-sm text-yellow-200"
        >
          {conflicts.map((c, i) => (
            <p key={`${c.tagIndex}-${c.kind}-${i}`} className="flex items-center gap-2">
              <span className="select-none">&#9888;</span>
              <span>{c.message}</span>
            </p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
        <table
          className="w-full table-fixed text-left text-sm"
          data-testid="hmi-table"
        >
          <colgroup>
            <col data-testid="hmi-col-index" style={{ width: `${COL_W.index}px` }} />
            <col data-testid="hmi-col-address" style={{ width: `${COL_W.address}px` }} />
            <col data-testid="hmi-col-type" style={{ width: `${COL_W.type}px` }} />
            <col data-testid="hmi-col-label" />
            <col data-testid="hmi-col-source" style={{ width: `${COL_W.source}px` }} />
            <col data-testid="hmi-col-more" style={{ width: `${COL_W.more}px` }} />
          </colgroup>
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-panel)]">
            <tr>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">#</th>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">Address</th>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">Type</th>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">Label</th>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">Source</th>
              <th className="px-0 py-2 text-xs font-medium text-[var(--color-muted)]" />
            </tr>
          </thead>
          <tbody>
            {tags.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-muted)]">
                  No HMI tags yet. Generate code to infer tags, or add manually.
                </td>
              </tr>
            )}
            {tags.map((tag, idx) => {
              const isExpanded = expandedRows.has(idx)
              return (
                <tr
                  key={`${tag.address ?? 'pending'}-${tag.type}-${idx}`}
                  data-row={idx}
                  className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-panel)]"
                >
                  <td className="px-2 py-1.5 font-mono text-xs text-[var(--color-muted)]">{idx + 1}</td>
                  <td
                    className={`px-1 py-1.5 font-mono text-xs ${
                      tag.address === null ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'
                    } ${hasAddressOverlap(idx) ? 'rounded border-2 border-red-500 text-red-300' : ''}`}
                  >
                    {hasAddressOverlap(idx) && <span className="mr-1 select-none">&#9888;</span>}
                    {tag.address ?? '\u2014'}
                  </td>
                  <td className="px-1 py-1.5">
                    <select
                      data-testid={`hmi-type-${idx}`}
                      className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-1 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                      value={tag.type}
                      onChange={(e) => updateType(idx, e.target.value as HMIElementType)}
                    >
                      {HMI_ELEMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1.5">
                    <input
                      type="text"
                      data-io-row={idx}
                      data-io-col="label"
                      data-testid={`hmi-label-${idx}`}
                      ref={idx === tags.length - 1 ? addLabelRef : undefined}
                      className="w-full min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                      placeholder="e.g. Start"
                      value={tag.label}
                      onFocus={() => handleFieldFocus(idx, 'label', tag.label)}
                      onBlur={handleFieldBlur}
                      onChange={(e) => updateField(idx, 'label', e.target.value)}
                      onKeyDown={(e) => handleFieldKeyDown(e, idx, 'label')}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    {tag.source === 'auto' ? (
                      <span
                        data-testid={`hmi-source-${idx}`}
                        className="inline-block rounded-full bg-green-900/40 px-2 py-0.5 text-[10px] font-medium text-green-300"
                      >
                        Auto
                      </span>
                    ) : (
                      <span
                        data-testid={`hmi-source-${idx}`}
                        className="inline-block rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                      >
                        Manual
                      </span>
                    )}
                  </td>
                  <td className="px-0 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        data-testid={`hmi-more-${idx}`}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Hide details' : 'Show details'}
                        onClick={() => toggleRow(idx)}
                        title={isExpanded ? 'Hide details' : 'Show details'}
                        className="flex h-6 w-5 items-center justify-center rounded text-xs leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      >
                        ⋯
                      </button>
                      <button
                        type="button"
                        data-testid={`hmi-delete-${idx}`}
                        className="flex h-6 w-5 items-center justify-center rounded text-xs text-[var(--color-muted)] transition-colors hover:bg-[var(--color-danger)]/20 hover:text-[var(--color-danger)] focus:outline-none focus:ring-1 focus:ring-[var(--color-danger)]"
                        onClick={() => deleteRow(idx)}
                        title="Delete row"
                      >
                        &#10005;
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {tags.map((tag, idx) =>
              expandedRows.has(idx) ? (
                <tr
                  key={`${tag.address ?? 'pending'}-${tag.type}-${idx}-more`}
                  data-testid={`hmi-more-row-${idx}`}
                  className="border-t border-[var(--color-border)] bg-[var(--color-bg)]"
                >
                  <td colSpan={6} className="px-3 py-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                        <span>PLC Reference</span>
                        <input
                          type="text"
                          data-testid={`hmi-plcref-${idx}`}
                          className={`w-full rounded border bg-[var(--color-panel)] px-1.5 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none ${
                            hasPlcRefMissing(idx) ? 'border-red-500' : 'border-[var(--color-border)]'
                          }`}
                          placeholder="X0, Y1, M5..."
                          value={tag.plcRef}
                          onFocus={() => handleFieldFocus(idx, 'plcRef', tag.plcRef)}
                          onBlur={handleFieldBlur}
                          onChange={(e) => updateField(idx, 'plcRef', e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                        <span>Comment</span>
                        <input
                          type="text"
                          data-testid={`hmi-comment-${idx}`}
                          className="w-full min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                          placeholder="Optional note"
                          value={tag.comment ?? ''}
                          onFocus={() => handleFieldFocus(idx, 'comment', tag.comment ?? '')}
                          onBlur={handleFieldBlur}
                          onChange={(e) => updateField(idx, 'comment', e.target.value)}
                        />
                      </label>
                    </div>
                  </td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </div>

      <button
        data-testid="hmi-add-row"
        className="self-start rounded-md border border-dashed border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        onClick={addRow}
      >
        + Add HMI Tag
      </button>
    </div>
  )
}
