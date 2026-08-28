import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
}

export interface DropdownProps {
  /** Currently selected value (matches `options[].value`). */
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  /** Shown on the trigger when `value` matches no option. Not selectable. */
  placeholder?: string
  id?: string
  /** Applied to the trigger button so existing data-testid contracts keep working. */
  testId?: string
  /** Accessible name when no visual label is associated. */
  ariaLabel?: string
  disabled?: boolean
  /** `md` = form variant, `sm` = compact table-cell variant. */
  size?: 'md' | 'sm'
  className?: string
}

/**
 * Custom dark dropdown (PRD v2.1 FIX-07). Replaces every native `<select>`
 * in the app UI: native selects render light in WebView2 and break the
 * dark-theme consistency required by PRD §6.4.
 *
 * Implementation: ARIA combobox pattern — the trigger button keeps focus
 * while open and `aria-activedescendant` points at the highlighted option.
 * Keyboard: Enter/Space/ArrowDown/ArrowUp open · arrows navigate ·
 * Enter/Space commit · Escape/Tab close · Home/End jump.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  id,
  testId,
  ariaLabel,
  disabled = false,
  size = 'md',
  className = '',
}: DropdownProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const listId = useId()
  const activeOptionId = activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const displayLabel = selected?.label ?? placeholder ?? value

  const close = useCallback((refocus = true) => {
    setOpen(false)
    setActiveIndex(-1)
    if (refocus) triggerRef.current?.focus()
  }, [])

  const openList = useCallback(() => {
    if (disabled) return
    const start = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options)
    setActiveIndex(start)
    setOpen(true)
  }, [disabled, options, selectedIndex])

  const commit = useCallback(
    (index: number) => {
      const option = options[index]
      if (!option || option.disabled) return
      onChange(option.value)
      close()
    },
    [close, onChange, options],
  )

  // Close on outside pointer-down (mousedown so a click that started inside
  // the listbox never counts as "outside").
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, close])

  // Keep the keyboard-highlighted option visible.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const el = listRef.current?.children[activeIndex]
    // Optional call: jsdom does not implement scrollIntoView.
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex])

  const moveActive = useCallback(
    (delta: 1 | -1) => {
      setActiveIndex((prev) => {
        const len = options.length
        if (len === 0) return prev
        let next = prev
        for (let i = 0; i < len; i++) {
          next = (next + delta + len) % len
          if (!options[next]?.disabled) return next
        }
        return prev
      })
    },
    [options],
  )

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openList()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveActive(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveActive(-1)
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(firstEnabledIndex(options))
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(lastEnabledIndex(options))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (activeIndex >= 0) commit(activeIndex)
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'Tab':
        close(false)
        break
      default:
        break
    }
  }

  const triggerClasses =
    size === 'sm'
      ? 'flex w-full items-center justify-between gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-1 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none'
      : 'flex w-full items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none'

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        data-testid={testId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? activeOptionId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        title={displayLabel}
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleTriggerKeyDown}
        className={`${triggerClasses} ${open ? 'border-[var(--color-accent)]' : ''} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-[var(--color-muted)]'}`}>
          {displayLabel}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[var(--color-muted)]">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          data-testid={testId ? `${testId}-listbox` : undefined}
          className="absolute z-50 mt-1 max-h-60 w-full min-w-[8rem] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] py-1 shadow-lg"
        >
          {options.map((option, index) => {
            const isActive = index === activeIndex
            const isSelected = index === selectedIndex
            return (
              <li
                key={option.value}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(index)
                }}
                onClick={() => commit(index)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${
                  size === 'sm' ? 'text-xs' : ''
                } ${
                  option.disabled
                    ? 'cursor-not-allowed text-[var(--color-muted)] opacity-40'
                    : isActive
                      ? 'bg-[var(--color-accent-hover)] text-white'
                      : 'text-[var(--color-text)]'
                }`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected && (
                  <span aria-hidden="true" className="shrink-0">
                    ✓
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function firstEnabledIndex(options: DropdownOption[]): number {
  const idx = options.findIndex((o) => !o.disabled)
  return idx >= 0 ? idx : 0
}

function lastEnabledIndex(options: DropdownOption[]): number {
  for (let i = options.length - 1; i >= 0; i--) {
    if (!options[i]?.disabled) return i
  }
  return options.length - 1
}
