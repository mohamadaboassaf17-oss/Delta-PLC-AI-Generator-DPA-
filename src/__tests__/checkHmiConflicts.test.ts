import { describe, it, expect } from 'vitest'
import { checkHmiConflicts } from '@/lib/hmi/checkConflicts'
import type { HmiTable } from '@/types/hmi'

function table(tags: HmiTable['tags']): HmiTable {
  return { tags, reservedMRange: null, model: null }
}

describe('checkHmiConflicts', () => {
  it('returns no conflicts for an empty hmi table', () => {
    const result = checkHmiConflicts(table([]), [])
    expect(result).toEqual([])
  })

  it('skips the address-overlap check when tag.address is null', () => {
    const result = checkHmiConflicts(
      table([{ address: null, type: 'Button', label: '', plcRef: 'M0', source: 'auto' }]),
      [{ address: 'M0', type: 'Relay', label: '' }],
    )
    expect(result).toEqual([])
  })

  it('reports address-overlap when the HMI address collides with a Relay M', () => {
    const result = checkHmiConflicts(
      table([{ address: 'M5', type: 'Lamp', label: '', plcRef: 'M0', source: 'auto' }]),
      [
        { address: 'M5', type: 'Relay', label: '' },
        { address: 'M0', type: 'Relay', label: '' },
      ],
    )
    expect(result).toEqual([
      {
        tagIndex: 0,
        kind: 'address-overlap',
        message: expect.stringContaining('M5'),
      },
    ])
  })

  it('does not report address-overlap when the Relay M is a different index', () => {
    const result = checkHmiConflicts(
      table([{ address: 'M5', type: 'Lamp', label: '', plcRef: 'X0', source: 'auto' }]),
      [
        { address: 'M6', type: 'Relay', label: '' },
        { address: 'X0', type: 'Input', label: '' },
      ],
    )
    expect(result).toEqual([])
  })

  it('does not report plc-ref-missing when plcRef matches an I/O address', () => {
    const result = checkHmiConflicts(
      table([{ address: null, type: 'Button', label: '', plcRef: 'M0', source: 'auto' }]),
      [{ address: 'M0', type: 'Relay', label: '' }],
    )
    expect(result).toEqual([])
  })

  it('reports plc-ref-missing when plcRef is not present in the I/O table', () => {
    const result = checkHmiConflicts(
      table([{ address: null, type: 'Lamp', label: '', plcRef: 'M99', source: 'auto' }]),
      [{ address: 'M0', type: 'Relay', label: '' }],
    )
    expect(result).toEqual([
      {
        tagIndex: 0,
        kind: 'plc-ref-missing',
        message: expect.stringContaining('M99'),
      },
    ])
  })

  it('accepts plcRef pointing at a non-Relay I/O address (X0 Input)', () => {
    const result = checkHmiConflicts(
      table([{ address: null, type: 'Button', label: '', plcRef: 'X0', source: 'auto' }]),
      [{ address: 'X0', type: 'Input', label: '' }],
    )
    expect(result).toEqual([])
  })

  it('reports plc-ref-missing for an unmapped D register', () => {
    const result = checkHmiConflicts(
      table([
        {
          address: null,
          type: 'NumericDisplay',
          label: '',
          plcRef: 'D0',
          source: 'auto',
        },
      ]),
      [],
    )
    expect(result).toEqual([
      {
        tagIndex: 0,
        kind: 'plc-ref-missing',
        message: expect.stringContaining('D0'),
      },
    ])
  })

  it('skips plc-ref-missing when plcRef is empty', () => {
    const result = checkHmiConflicts(
      table([{ address: null, type: 'Button', label: '', plcRef: '', source: 'manual' }]),
      [],
    )
    expect(result).toEqual([])
  })

  it('matches plcRef case-insensitively', () => {
    const result = checkHmiConflicts(
      table([{ address: null, type: 'Button', label: '', plcRef: 'm0', source: 'auto' }]),
      [{ address: 'M0', type: 'Relay', label: '' }],
    )
    expect(result).toEqual([])
  })

  it('returns both conflicts for a single tag, address-overlap before plc-ref-missing', () => {
    const result = checkHmiConflicts(
      table([
        { address: 'M5', type: 'Button', label: '', plcRef: 'M999', source: 'auto' },
      ]),
      [
        { address: 'M5', type: 'Relay', label: '' },
        { address: 'M0', type: 'Relay', label: '' },
      ],
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      tagIndex: 0,
      kind: 'address-overlap',
      message: expect.stringContaining('M5'),
    })
    expect(result[1]).toEqual({
      tagIndex: 0,
      kind: 'plc-ref-missing',
      message: expect.stringContaining('M999'),
    })
  })
})
