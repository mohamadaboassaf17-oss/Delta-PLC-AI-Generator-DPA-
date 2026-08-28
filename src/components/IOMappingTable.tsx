/* eslint-disable react-refresh/only-export-components */
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
import { dvpListModels } from '@/lib/tauriApi'
import type { DvpModelSpec } from '@/lib/tauriApi'
import type { IOPoint, IOPointType } from '@/types/io'
import { generateAddress } from '@/types/io'
import { validateDvpAddress } from '@/lib/validators/dvpAddress'
import { Dropdown } from '@/components/Dropdown'

const IO_TYPE_OPTIONS: IOPointType[] = ['Input', 'Output', 'Relay', 'Timer', 'Counter']

const TYPE_TO_LIMIT_KEY = {
  Input: 'max_x',
  Output: 'max_y',
  Relay: 'max_m',
  Timer: 'max_t',
  Counter: 'max_c',
} as const

// M12.1.2 — fixed column widths so the table fits inside the 268px left
// sidebar without a horizontal scrollbar. `Label` takes the remaining
// space. The `more` column hosts a ⋯ toggle that expands a second row
// containing the `Default value` and `Comment` fields.
const COL_W = {
  index: 22,
  address: 54,
  type: 58,
  more: 24,
} as const

// `EditableCol` covers inputs that participate in the auto-Tab sequence
// within the main row. `defaultValue` and `comment` inputs still exist
// in the DOM (inside the expandable row) and are still updated by
// `updateField`, but they are NOT in the Tab sequence.
type EditableCol = 'address' | 'label'

// `ExpandableCol` covers inputs that live inside the expandable row.
type ExpandableCol = 'defaultValue' | 'comment'

type AnyCol = EditableCol | ExpandableCol

/**
 * M3 — Validate Timer/Counter preset value.
 * Timers and Counters must use a K-constant (decimal) or H-constant (hex)
 * when a default value is provided, e.g. K50 (5.0s). Other types accept
 * free-form text.
 * @returns null when valid, Arabic error message when invalid.
 */
export function validatePreset(
  value: string | undefined,
  type: IOPointType,
): string | null {
  if (type !== 'Timer' && type !== 'Counter') return null
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return null
  const upper = trimmed.toUpperCase()
  if (/^(K\d+|H[0-9A-F]+)$/.test(upper)) return null
  return 'الصيغة غير صالحة — استخدم K متبوعاً برقم، مثل K50'
}

interface EditState {
  row: number
  col: AnyCol
  savedValue: string
}

export function IOMappingTable(): ReactElement {
  const { project, setProjectModel, setIoTable } = useProject()
  const [models, setModels] = useState<DvpModelSpec[]>([])
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const addLabelRef = useRef<HTMLInputElement | null>(null)

  const ioTable: IOPoint[] = useMemo(() => project?.io_table ?? [], [project?.io_table])
  const selectedModel = project?.meta?.model ?? ''

  useEffect(() => {
    let cancelled = false
    dvpListModels().then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setModelsError(result.error)
      } else {
        setModels(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedSpec = models.find((m) => m.label === selectedModel)

  const handleModelChange = useCallback(
    (model: string) => {
      setProjectModel(model)
    },
    [setProjectModel],
  )

  const commitIoTable = useCallback(
    (updated: IOPoint[]) => {
      setIoTable(updated)
    },
    [setIoTable],
  )

  const addRow = useCallback(() => {
    const defaultType: IOPointType = 'Input'
    const countOfType = ioTable.filter((p) => p.type === defaultType).length
    const newPoint: IOPoint = {
      address: generateAddress(defaultType, countOfType),
      type: defaultType,
      label: '',
    }
    const updated = [...ioTable, newPoint]
    commitIoTable(updated)
    setTimeout(() => {
      addLabelRef.current?.focus()
    }, 0)
  }, [ioTable, commitIoTable])

  const deleteRow = useCallback(
    (idx: number) => {
      const updated = ioTable.filter((_, i) => i !== idx)
      commitIoTable(updated)
      setExpandedRows((prev) => {
        if (!prev.has(idx)) return prev
        const next = new Set<number>()
        prev.forEach((n) => {
          if (n < idx) next.add(n)
        })
        return next
      })
    },
    [ioTable, commitIoTable],
  )

  const updateType = useCallback(
    (idx: number, newType: IOPointType) => {
      const updated = [...ioTable]
      const countOfType = updated.filter((p) => p.type === newType).length
      updated[idx] = { ...updated[idx], type: newType, address: generateAddress(newType, countOfType) }
      commitIoTable(updated)
    },
    [ioTable, commitIoTable],
  )

  const updateField = useCallback(
    (idx: number, field: AnyCol, value: string) => {
      const updated = [...ioTable]
      updated[idx] = { ...updated[idx], [field]: value }
      commitIoTable(updated)
    },
    [ioTable, commitIoTable],
  )

  const handleFieldFocus = useCallback(
    (row: number, col: AnyCol, currentValue: string) => {
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

  // M12.1.2 — Tab now only advances through the two main-row fields
  // (`address` → `label`). Default/Comment live in the expandable row and
  // are not part of the auto-Tab sequence.
  const handleFieldKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, row: number, col: EditableCol) => {
      const cols: EditableCol[] = ['address', 'label']
      const colIdx = cols.indexOf(col)

      if (e.key === 'Enter') {
        e.preventDefault()
        if (row < ioTable.length - 1) {
          ;(e.target as HTMLInputElement).blur()
          const nextInput = document.querySelector<HTMLInputElement>(
            `[data-io-row="${row + 1}"][data-io-col="${col}"]`,
          )
          nextInput?.focus()
        }
      } else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        const nextColIdx = colIdx + 1
        if (nextColIdx < cols.length) {
          ;(e.target as HTMLInputElement).blur()
          const nextInput = document.querySelector<HTMLInputElement>(
            `[data-io-row="${row}"][data-io-col="${cols[nextColIdx]}"]`,
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
    [ioTable.length, edit, updateField],
  )

  const warnings = buildWarnings(ioTable, selectedSpec)

  // M10.3.1 — per-row inline validation result for the Address column.
  // Computed from the live ioTable so it updates as the user types.
  const addressErrors = useMemo<(string | null)[]>(
    () => ioTable.map((p) => validateDvpAddress(p.address)),
    [ioTable],
  )

  // M3 — Timer/Counter preset validation. DefaultValue for T/C must be
  // a K-constant (e.g. K50 = 5.0s). Other types accept free text.
  const presetErrors = useMemo<(string | null)[]>(
    () => ioTable.map((p) => validatePreset(p.defaultValue, p.type)),
    [ioTable],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label htmlFor="model-select" className="text-sm font-medium text-[var(--color-text)]">
          Model
        </label>
        <Dropdown
          id="model-select"
          testId="model-select"
          ariaLabel="Model"
          value={selectedModel}
          onChange={handleModelChange}
          placeholder={modelsError ? 'Failed to load models' : 'Select a model...'}
          options={models.map((m) => ({ value: m.label, label: m.label }))}
        />
      </div>

      {warnings.length > 0 && (
        <div
          data-testid="io-warning-banner"
          className="rounded-md border border-yellow-700 bg-yellow-900/30 px-4 py-3 text-sm text-yellow-200"
        >
          {warnings.map((w) => (
            <p key={w.type} className="flex items-center gap-2">
              <span className="select-none">&#9888;</span>
              <span>
                {w.type} count ({w.count}) exceeds {selectedSpec?.label ?? selectedModel} limit ({w.limit}
                ). Expansion card required.
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
        <table
          className="w-full table-fixed text-left text-sm"
          data-testid="io-table"
        >
          <colgroup>
            <col data-testid="io-col-index" style={{ width: `${COL_W.index}px` }} />
            <col data-testid="io-col-address" style={{ width: `${COL_W.address}px` }} />
            <col data-testid="io-col-type" style={{ width: `${COL_W.type}px` }} />
            <col data-testid="io-col-label" />
            <col data-testid="io-col-more" style={{ width: `${COL_W.more}px` }} />
          </colgroup>
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-panel)]">
            <tr>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">#</th>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">Address</th>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">Type</th>
              <th className="px-2 py-2 text-xs font-medium text-[var(--color-muted)]">Label</th>
              <th className="px-0 py-2 text-xs font-medium text-[var(--color-muted)]" />
            </tr>
          </thead>
          <tbody>
            {ioTable.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                  No I/O points defined. Click &ldquo;Add Row&rdquo; to begin.
                </td>
              </tr>
            )}
            {ioTable.map((point, idx) => {
              const addressError = addressErrors[idx]
              const isAddressInvalid = addressError !== null
              const isExpanded = expandedRows.has(idx)
              return (
                <tr
                  key={`${point.type}-${idx}`}
                  data-row={idx}
                  className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-panel)]"
                >
                  <td className="px-2 py-1.5 font-mono text-xs text-[var(--color-muted)]">{idx + 1}</td>
                  <td className="px-1 py-1.5">
                    <input
                      type="text"
                      data-io-row={idx}
                      data-io-col="address"
                      data-testid={`io-address-${idx}`}
                      aria-invalid={isAddressInvalid}
                      aria-describedby={isAddressInvalid ? `io-address-${idx}-error` : undefined}
                      className={`w-full rounded border bg-[var(--color-bg)] px-1.5 py-1 font-mono text-xs text-[var(--color-text)] focus:outline-none ${
                        isAddressInvalid
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
                      }`}
                      value={point.address}
                      onFocus={() => handleFieldFocus(idx, 'address', point.address)}
                      onBlur={handleFieldBlur}
                      onChange={(e) => updateField(idx, 'address', e.target.value.toUpperCase())}
                      onKeyDown={(e) => handleFieldKeyDown(e, idx, 'address')}
                    />
                    {isAddressInvalid && (
                      <p
                        id={`io-address-${idx}-error`}
                        data-testid={`io-address-${idx}-error`}
                        className="mt-1 text-[10px] leading-tight text-red-400"
                        dir="rtl"
                      >
                        {addressError}
                      </p>
                    )}
                  </td>
                  <td className="px-1 py-1.5">
                    <Dropdown
                      testId={`io-type-${idx}`}
                      ariaLabel={`Type for row ${idx + 1}`}
                      size="sm"
                      className="w-full"
                      value={point.type}
                      onChange={(v) => updateType(idx, v as IOPointType)}
                      options={IO_TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <input
                      type="text"
                      data-io-row={idx}
                      data-io-col="label"
                      data-testid={`io-label-${idx}`}
                      ref={idx === ioTable.length - 1 ? addLabelRef : undefined}
                      className="w-full min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                      placeholder="e.g. Start Button"
                      value={point.label}
                      onFocus={() => handleFieldFocus(idx, 'label', point.label)}
                      onBlur={handleFieldBlur}
                      onChange={(e) => updateField(idx, 'label', e.target.value)}
                      onKeyDown={(e) => handleFieldKeyDown(e, idx, 'label')}
                    />
                  </td>
                  <td className="px-0 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        data-testid={`io-more-${idx}`}
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
                        data-testid={`io-delete-${idx}`}
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
            {ioTable.map((point, idx) => {
              if (!expandedRows.has(idx)) return null
              const presetError = presetErrors[idx]
              const isPresetInvalid = presetError !== null
              const isTimerOrCounter = point.type === 'Timer' || point.type === 'Counter'
              const defaultPlaceholder = isTimerOrCounter
                ? point.type === 'Timer'
                  ? 'K50 (e.g. 5.0s)'
                  : 'K10'
                : '...'
              return (
                <tr
                  key={`${point.type}-${idx}-more`}
                  data-testid={`io-more-row-${idx}`}
                  className="border-t border-[var(--color-border)] bg-[var(--color-bg)]"
                >
                  <td colSpan={5} className="px-3 py-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                        <span>Default value</span>
                        <input
                          type="text"
                          data-testid={`io-default-${idx}`}
                          aria-invalid={isPresetInvalid}
                          aria-describedby={isPresetInvalid ? `io-default-${idx}-error` : undefined}
                          className={`w-full rounded border bg-[var(--color-panel)] px-1.5 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none ${
                            isPresetInvalid
                              ? 'border-red-500 focus:border-red-500'
                              : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
                          }`}
                          placeholder={defaultPlaceholder}
                          title={isTimerOrCounter ? 'Timer/Counter preset must be K followed by digits, e.g. K50' : undefined}
                          value={point.defaultValue ?? ''}
                          onFocus={() => handleFieldFocus(idx, 'defaultValue', point.defaultValue ?? '')}
                          onBlur={handleFieldBlur}
                          onChange={(e) =>
                            updateField(
                              idx,
                              'defaultValue',
                              isTimerOrCounter ? e.target.value.toUpperCase() : e.target.value,
                            )
                          }
                        />
                        {isPresetInvalid && (
                          <p
                            id={`io-default-${idx}-error`}
                            data-testid={`io-default-${idx}-error`}
                            className="text-[10px] leading-tight text-red-400"
                          >
                            {presetError}
                          </p>
                        )}
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
                        <span>Comment</span>
                        <input
                          type="text"
                          data-testid={`io-comment-${idx}`}
                          className="w-full min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                          placeholder="Optional note"
                          value={point.comment ?? ''}
                          onFocus={() => handleFieldFocus(idx, 'comment', point.comment ?? '')}
                          onBlur={handleFieldBlur}
                          onChange={(e) => updateField(idx, 'comment', e.target.value)}
                        />
                      </label>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button
        data-testid="io-add-row"
        className="self-start rounded-md border border-dashed border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        onClick={addRow}
      >
        + Add Row
      </button>
    </div>
  )
}

interface Warning {
  type: IOPointType
  count: number
  limit: number
}

export function buildWarnings(ioTable: IOPoint[], spec: DvpModelSpec | undefined): Warning[] {
  if (!spec) return []
  const warnings: Warning[] = []
  const typeCounts: Record<IOPointType, number> = {
    Input: 0,
    Output: 0,
    Relay: 0,
    Timer: 0,
    Counter: 0,
  }
  for (const p of ioTable) {
    typeCounts[p.type]++
  }
  for (const t of IO_TYPE_OPTIONS) {
    const limitKey = TYPE_TO_LIMIT_KEY[t]
    const limit = spec[limitKey] as number | null
    if (limit !== null && limit !== undefined && typeCounts[t] > limit) {
      warnings.push({ type: t, count: typeCounts[t], limit })
    }
  }
  return warnings
}
