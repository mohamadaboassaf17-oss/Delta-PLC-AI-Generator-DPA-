import { describe, it, expect } from 'vitest'
import { reserveMAddresses } from '@/lib/hmi/reserveM'
import type { IOPoint } from '@/types/io'

describe('reserveMAddresses', () => {
  it('reserves M0..M4 when ioTable is empty and maxM=512', () => {
    const result = reserveMAddresses([], 5, 512)
    expect(result.reserved).toEqual(['M0', 'M1', 'M2', 'M3', 'M4'])
    expect(result.overflow).toBe(0)
    expect(result.range).toEqual([0, 4])
  })

  it('skips occupied M-relay addresses and continues past them', () => {
    const ioTable: IOPoint[] = [
      { address: 'M0', type: 'Relay', label: '' },
      { address: 'M1', type: 'Relay', label: '' },
      { address: 'M2', type: 'Relay', label: '' },
    ]
    const result = reserveMAddresses(ioTable, 3, 512)
    expect(result.reserved).toEqual(['M3', 'M4', 'M5'])
    expect(result.overflow).toBe(0)
    expect(result.range).toEqual([3, 5])
  })

  it('returns overflow when the relay range is fully occupied', () => {
    const ioTable: IOPoint[] = []
    for (let i = 0; i < 10; i++) {
      ioTable.push({ address: `M${i}`, type: 'Relay', label: '' })
    }
    const result = reserveMAddresses(ioTable, 1, 10)
    expect(result.reserved).toEqual([])
    expect(result.overflow).toBe(1)
    expect(result.range).toBeNull()
  })

  it('ignores non-Relay entries (X, Y, T, C) that share the digit space', () => {
    const ioTable: IOPoint[] = [
      { address: 'X0', type: 'Input', label: '' },
      { address: 'Y0', type: 'Output', label: '' },
      { address: 'T0', type: 'Timer', label: '' },
      { address: 'C0', type: 'Counter', label: '' },
    ]
    const result = reserveMAddresses(ioTable, 3, 512)
    expect(result.reserved).toEqual(['M0', 'M1', 'M2'])
    expect(result.overflow).toBe(0)
    expect(result.range).toEqual([0, 2])
  })

  it('silently skips malformed M-relay addresses', () => {
    const ioTable: IOPoint[] = [
      { address: 'M-1', type: 'Relay', label: 'negative' },
      { address: 'Mfoo', type: 'Relay', label: 'word' },
      { address: 'M', type: 'Relay', label: 'no digits' },
      { address: 'M1.5', type: 'Relay', label: 'fractional' },
      { address: ' M0', type: 'Relay', label: 'leading space' },
    ]
    const result = reserveMAddresses(ioTable, 2, 512)
    expect(result.reserved).toEqual(['M0', 'M1'])
    expect(result.overflow).toBe(0)
    expect(result.range).toEqual([0, 1])
  })

  it('returns an empty result when count is zero', () => {
    const result = reserveMAddresses([], 0, 512)
    expect(result.reserved).toEqual([])
    expect(result.overflow).toBe(0)
    expect(result.range).toBeNull()
  })

  it('returns overflow equal to the request when maxM is zero', () => {
    const result = reserveMAddresses([], 5, 0)
    expect(result.reserved).toEqual([])
    expect(result.overflow).toBe(5)
    expect(result.range).toBeNull()
  })

  it('is deterministic across calls with identical inputs', () => {
    const ioTable: IOPoint[] = [
      { address: 'M0', type: 'Relay', label: '' },
      { address: 'M3', type: 'Relay', label: '' },
      { address: 'M5', type: 'Relay', label: '' },
    ]
    const first = reserveMAddresses(ioTable, 4, 512)
    const second = reserveMAddresses(ioTable, 4, 512)
    expect(first).toEqual(second)
    expect(first.reserved).toEqual(['M1', 'M2', 'M4', 'M6'])
    expect(first.range).toEqual([1, 6])
  })

  it('returns overflow at the boundary when M0 is occupied and maxM=1', () => {
    const ioTable: IOPoint[] = [{ address: 'M0', type: 'Relay', label: '' }]
    const result = reserveMAddresses(ioTable, 1, 1)
    expect(result.reserved).toEqual([])
    expect(result.overflow).toBe(1)
    expect(result.range).toBeNull()
  })
})
