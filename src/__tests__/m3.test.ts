import { describe, it, expect } from 'vitest'
import { generateAddress } from '@/types/io'
import { validatePreset, buildWarnings } from '@/components/IOMappingTable'
import { injectLabelComments } from '@/lib/prompts/stPrompt'
import type { IOPoint } from '@/types/io'
import type { DvpModelSpec } from '@/lib/tauriApi'

describe('M3 — generateAddress octal correctness (X/Y)', () => {
  it('generates X0..X7 for indices 0..7', () => {
    expect(generateAddress('Input', 0)).toBe('X0')
    expect(generateAddress('Input', 7)).toBe('X7')
  })
  it('skips X8/X9 — index 8 becomes X10', () => {
    expect(generateAddress('Input', 8)).toBe('X10')
    expect(generateAddress('Input', 9)).toBe('X11')
    expect(generateAddress('Input', 15)).toBe('X17')
    expect(generateAddress('Input', 16)).toBe('X20')
  })
  it('Y follows same octal rule', () => {
    expect(generateAddress('Output', 8)).toBe('Y10')
    expect(generateAddress('Output', 16)).toBe('Y20')
    expect(generateAddress('Output', 63)).toBe('Y77')
    expect(generateAddress('Output', 64)).toBe('Y100')
  })
  it('M/T/C remain decimal', () => {
    expect(generateAddress('Relay', 8)).toBe('M8')
    expect(generateAddress('Relay', 9)).toBe('M9')
    expect(generateAddress('Relay', 10)).toBe('M10')
    expect(generateAddress('Timer', 8)).toBe('T8')
    expect(generateAddress('Counter', 8)).toBe('C8')
  })
  it('X77 (63) then X100 (64) boundary', () => {
    expect(generateAddress('Input', 63)).toBe('X77')
    expect(generateAddress('Input', 64)).toBe('X100')
  })
})

describe('M3 — validatePreset for Timer/Counter', () => {
  it('accepts empty for Timer/Counter (optional field)', () => {
    expect(validatePreset('', 'Timer')).toBeNull()
    expect(validatePreset(undefined, 'Timer')).toBeNull()
    expect(validatePreset('   ', 'Counter')).toBeNull()
  })
  it('accepts K constants (case-insensitive)', () => {
    expect(validatePreset('K50', 'Timer')).toBeNull()
    expect(validatePreset('k50', 'Timer')).toBeNull()
    expect(validatePreset('K10', 'Counter')).toBeNull()
    expect(validatePreset('K0', 'Counter')).toBeNull()
    expect(validatePreset('K999', 'Timer')).toBeNull()
  })
  it('accepts H hex constants', () => {
    expect(validatePreset('HFF', 'Timer')).toBeNull()
    expect(validatePreset('h0f', 'Counter')).toBeNull()
    expect(validatePreset('H1A2B', 'Timer')).toBeNull()
  })
  it('rejects bare number without K/H for Timer/Counter', () => {
    expect(validatePreset('50', 'Timer')).not.toBeNull()
    expect(validatePreset('10', 'Counter')).not.toBeNull()
    const msg = validatePreset('50', 'Timer')!
    expect(msg).toMatch(/K/)
  })
  it('rejects invalid formats for Timer', () => {
    expect(validatePreset('K', 'Timer')).not.toBeNull()
    expect(validatePreset('K-5', 'Timer')).not.toBeNull()
    expect(validatePreset('K5.5', 'Timer')).not.toBeNull()
  })
  it('returns null for non-Timer/Counter types regardless of value', () => {
    expect(validatePreset('anything', 'Input')).toBeNull()
    expect(validatePreset('K50', 'Input')).toBeNull()
    expect(validatePreset('K50', 'Output')).toBeNull()
    expect(validatePreset('K50', 'Relay')).toBeNull()
    expect(validatePreset('garbage', 'Relay')).toBeNull()
  })
})

describe('M3 — injectLabelComments', () => {
  const makeTable = (labels: Record<string, string>): IOPoint[] =>
    Object.entries(labels).map(([addr, label]) => ({
      address: addr,
      type: addr.startsWith('X') ? 'Input' : addr.startsWith('Y') ? 'Output' : 'Relay',
      label,
    }))

  it('injects // label above line referencing address (appearance order)', () => {
    const table = makeTable({ X0: 'Start Button', Y0: 'Motor' })
    const st = 'Y0 := X0;'
    const out = injectLabelComments(st, table)
    const lines = out.split('\n').map((l) => l.trim())
    // appearance: Y0 first, then X0
    expect(lines[0]).toBe('// Motor')
    expect(lines[1]).toBe('// Start Button')
    expect(lines[2]).toBe('Y0 := X0;')
  })

  it('is idempotent (second run does not duplicate)', () => {
    const table = makeTable({ X0: 'Start' })
    const st = 'Y0 := X0;'
    const once = injectLabelComments(st, table)
    const twice = injectLabelComments(once, table)
    expect(once).toBe(twice)
  })

  it('does not duplicate when comment already exists', () => {
    const table = makeTable({ X0: 'Start' })
    const st = '// Start\nY0 := X0;'
    const out = injectLabelComments(st, table)
    expect(out).toBe('// Start\nY0 := X0;')
  })

  it('handles multiple lines — each line gets its own labels', () => {
    const table = makeTable({ X0: 'A', Y0: 'B', X1: 'C', Y1: 'D' })
    const st = 'Y0 := X0;\nY1 := X1;'
    const out = injectLabelComments(st, table)
    const lines = out.split('\n').map((l) => l.trim())
    expect(lines[0]).toBe('// B')
    expect(lines[1]).toBe('// A')
    expect(lines[2]).toBe('Y0 := X0;')
    expect(lines[3]).toBe('// D')
    expect(lines[4]).toBe('// C')
    expect(lines[5]).toBe('Y1 := X1;')
  })

  it('preserves indentation of original line for injected comment', () => {
    const table = makeTable({ X0: 'Sensor' })
    const st = '    Y0 := X0;'
    const out = injectLabelComments(st, table)
    expect(out).toContain('    // Sensor')
  })

  it('skips lines that are already comments', () => {
    const table = makeTable({ X0: 'Sensor' })
    const st = '// existing comment\nY0 := X0;'
    const out = injectLabelComments(st, table)
    const lines = out.split('\n')
    expect(lines[0]).toBe('// existing comment')
    // next line should get injected comment before code
    expect(lines[1].trim()).toBe('// Sensor')
    expect(lines[2].trim()).toBe('Y0 := X0;')
  })

  it('returns unchanged for empty st or empty table', () => {
    expect(injectLabelComments('', makeTable({ X0: 'A' }))).toBe('')
    expect(injectLabelComments('Y0 := X0;', [])).toBe('Y0 := X0;')
  })

  it('handles labels with special chars / Unicode / injection attempts verbatim', () => {
    const table = makeTable({ X0: '"; DROP TABLE--' })
    const st = 'Y0 := X0;'
    const out = injectLabelComments(st, table)
    expect(out).toContain('// "; DROP TABLE--')
    const dup = injectLabelComments(out, table)
    expect(dup).toBe(out)
  })

  it('handles address case-insensitivity (table stores X0, ST has x0)', () => {
    const table = makeTable({ X0: 'Start' })
    const st = 'Y0 := x0;'
    const out = injectLabelComments(st, table)
    expect(out).toContain('// Start')
  })
})

describe('M3 — expansion-card warnings (buildWarnings)', () => {
  const ss2: DvpModelSpec = {
    family: 'ss2',
    label: 'DVP-SS2',
    max_x: 8,
    max_y: 8,
    max_m: 512,
    max_s: null,
    max_t: 128,
    max_c: 128,
  }
  const sv2: DvpModelSpec = {
    family: 'sv2',
    label: 'DVP-SV2',
    max_x: 16,
    max_y: 16,
    max_m: 4096,
    max_s: 2048,
    max_t: 256,
    max_c: 256,
  }
  function makePoints(type: IOPoint['type'], count: number): IOPoint[] {
    return Array.from({ length: count }, (_, i) => ({
      address: generateAddress(type, i),
      type,
      label: `${type} ${i}`,
    }))
  }
  it('flags Relay overflow (512 limit on SS2)', () => {
    const warnings = buildWarnings(makePoints('Relay', 513), ss2)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].type).toBe('Relay')
    expect(warnings[0].count).toBe(513)
    expect(warnings[0].limit).toBe(512)
  })
  it('flags Timer overflow (128 on SS2, 256 on SV2)', () => {
    expect(buildWarnings(makePoints('Timer', 129), ss2)).toHaveLength(1)
    expect(buildWarnings(makePoints('Timer', 256), sv2)).toHaveLength(0)
    expect(buildWarnings(makePoints('Timer', 257), sv2)).toHaveLength(1)
  })
  it('flags Counter overflow', () => {
    expect(buildWarnings(makePoints('Counter', 129), ss2)[0].type).toBe('Counter')
  })
  it('no warning when within limit or no spec', () => {
    expect(buildWarnings(makePoints('Input', 8), ss2)).toHaveLength(0)
    expect(buildWarnings(makePoints('Input', 9), ss2)[0].type).toBe('Input')
    expect(buildWarnings(makePoints('Input', 9), undefined)).toHaveLength(0)
  })
  it('reports multiple simultaneous warnings', () => {
    const mixed = [...makePoints('Input', 9), ...makePoints('Output', 9)]
    const w = buildWarnings(mixed, ss2)
    expect(w).toHaveLength(2)
    expect(w.map((x) => x.type)).toEqual(expect.arrayContaining(['Input', 'Output']))
  })
})
