import { describe, it, expect } from 'vitest'
import { prefixForType, generateAddress } from '@/types/io'
import type { IOPoint, IOPointType } from '@/types/io'
import type { DvpModelSpec } from '@/lib/tauriApi'

describe('prefixForType', () => {
  it('returns X for Input', () => {
    expect(prefixForType('Input')).toBe('X')
  })

  it('returns Y for Output', () => {
    expect(prefixForType('Output')).toBe('Y')
  })

  it('returns M for Relay', () => {
    expect(prefixForType('Relay')).toBe('M')
  })

  it('returns T for Timer', () => {
    expect(prefixForType('Timer')).toBe('T')
  })

  it('returns C for Counter', () => {
    expect(prefixForType('Counter')).toBe('C')
  })
})

describe('generateAddress', () => {
  it('generates X0 for Input index 0', () => {
    expect(generateAddress('Input', 0)).toBe('X0')
  })

  it('generates Y7 for Output index 7', () => {
    expect(generateAddress('Output', 7)).toBe('Y7')
  })

  it('generates M100 for Relay index 100', () => {
    expect(generateAddress('Relay', 100)).toBe('M100')
  })

  it('generates T5 for Timer index 5', () => {
    expect(generateAddress('Timer', 5)).toBe('T5')
  })

  it('generates C20 for Counter index 20', () => {
    expect(generateAddress('Counter', 20)).toBe('C20')
  })

  it('generates sequential addresses for same type with increasing indices', () => {
    const addresses = [0, 1, 2, 3, 4].map((i) => generateAddress('Input', i))
    expect(addresses).toEqual(['X0', 'X1', 'X2', 'X3', 'X4'])
  })
})

describe('model limit mapping', () => {
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

  const typeToLimitKey: Record<IOPointType, keyof DvpModelSpec> = {
    Input: 'max_x',
    Output: 'max_y',
    Relay: 'max_m',
    Timer: 'max_t',
    Counter: 'max_c',
  }

  it('maps Input to max_x with value 8 for DVP-SS2', () => {
    const key = typeToLimitKey['Input']
    expect(ss2[key]).toBe(8)
  })

  it('maps Output to max_y with value 8 for DVP-SS2', () => {
    const key = typeToLimitKey['Output']
    expect(ss2[key]).toBe(8)
  })

  it('maps Relay to max_m with value 512 for DVP-SS2', () => {
    const key = typeToLimitKey['Relay']
    expect(ss2[key]).toBe(512)
  })

  it('maps Timer to max_t with value 128 for DVP-SS2', () => {
    const key = typeToLimitKey['Timer']
    expect(ss2[key]).toBe(128)
  })

  it('maps Counter to max_c with value 128 for DVP-SS2', () => {
    const key = typeToLimitKey['Counter']
    expect(ss2[key]).toBe(128)
  })

  it('DVP-SS2 has max_s as null (no special relays)', () => {
    expect(ss2.max_s).toBeNull()
  })

  it('all required limit keys exist on DvpModelSpec', () => {
    for (const key of Object.values(typeToLimitKey)) {
      expect(ss2).toHaveProperty(key)
    }
  })
})

describe('IOPoint structure', () => {
  it('has required fields address, type, and label', () => {
    const point: IOPoint = {
      address: 'X0',
      type: 'Input',
      label: 'Start Button',
    }
    expect(point.address).toBe('X0')
    expect(point.type).toBe('Input')
    expect(point.label).toBe('Start Button')
  })

  it('accepts optional defaultValue and comment', () => {
    const point: IOPoint = {
      address: 'Y5',
      type: 'Output',
      label: 'Motor',
      defaultValue: '0',
      comment: 'Main conveyor motor',
    }
    expect(point.defaultValue).toBe('0')
    expect(point.comment).toBe('Main conveyor motor')
  })

  it('generated address matches expected format for all types', () => {
    const inputs: IOPoint = { address: generateAddress('Input', 3), type: 'Input', label: '' }
    const outputs: IOPoint = { address: generateAddress('Output', 0), type: 'Output', label: '' }
    const relays: IOPoint = { address: generateAddress('Relay', 42), type: 'Relay', label: '' }
    const timers: IOPoint = { address: generateAddress('Timer', 7), type: 'Timer', label: '' }
    const counters: IOPoint = { address: generateAddress('Counter', 15), type: 'Counter', label: '' }

    expect(inputs.address).toBe('X3')
    expect(outputs.address).toBe('Y0')
    expect(relays.address).toBe('M42')
    expect(timers.address).toBe('T7')
    expect(counters.address).toBe('C15')
  })
})
