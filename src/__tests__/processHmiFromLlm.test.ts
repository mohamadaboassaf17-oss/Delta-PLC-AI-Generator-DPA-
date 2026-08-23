import { describe, it, expect } from 'vitest'
import { processHmiFromLlm } from '@/lib/hmi/processHmiFromLlm'
import type { ProcessHmiInput } from '@/lib/hmi/processHmiFromLlm'
import type { HmiTable, HMITag } from '@/types/hmi'
import type { IOPoint } from '@/types/io'

function makeInput(overrides: Partial<ProcessHmiInput> = {}): ProcessHmiInput {
  return {
    rawJson: '',
    ioTable: [],
    maxM: 512,
    modelLabel: 'DVP-SS2',
    previous: null,
    ...overrides,
  }
}

function makeTag(overrides: Partial<HMITag> = {}): HMITag {
  return {
    address: null,
    type: 'Button',
    label: 'Start',
    plcRef: 'X0',
    source: 'auto',
    ...overrides,
  }
}

describe('processHmiFromLlm', () => {
  it('returns an empty table when rawJson is empty and no previous exists', () => {
    const result = processHmiFromLlm(makeInput({ rawJson: '' }))
    expect(result.tags).toEqual([])
    expect(result.reservedMRange).toBeNull()
    expect(result.model).toBe('DVP-SS2')
  })

  it('returns previous unchanged when rawJson is empty and previous exists', () => {
    const previous: HmiTable = {
      tags: [makeTag({ address: 'M0', source: 'manual' })],
      reservedMRange: [0, 0],
      model: 'DVP-SS2',
    }
    const result = processHmiFromLlm(makeInput({ rawJson: '', previous }))
    expect(result).toBe(previous)
  })

  it('returns previous unchanged when rawJson is whitespace only', () => {
    const previous: HmiTable = {
      tags: [makeTag({ address: 'M2' })],
      reservedMRange: [2, 2],
      model: 'DVP-SS2',
    }
    const result = processHmiFromLlm(makeInput({ rawJson: '   \n\t  ', previous }))
    expect(result).toBe(previous)
  })

  it('parses a valid JSON array and assigns addresses from reservation', () => {
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'Start', plcRef: 'X0', source: 'auto' },
      { address: null, type: 'Lamp', label: 'Run', plcRef: 'Y0', source: 'auto' },
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw }))
    expect(result.tags).toHaveLength(2)
    expect(result.tags[0]?.address).toBe('M0')
    expect(result.tags[1]?.address).toBe('M1')
    expect(result.reservedMRange).toEqual([0, 1])
    expect(result.model).toBe('DVP-SS2')
  })

  it('parses a single JSON object payload and wraps it in an array', () => {
    const raw = JSON.stringify({
      address: null,
      type: 'Alarm',
      label: 'OverTemp',
      plcRef: 'M100',
      source: 'auto',
    })
    const result = processHmiFromLlm(makeInput({ rawJson: raw }))
    expect(result.tags).toHaveLength(1)
    expect(result.tags[0]?.type).toBe('Alarm')
    expect(result.tags[0]?.address).toBe('M0')
  })

  it('discards invalid tags that fail isHMITag validation', () => {
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'OK', plcRef: 'X0', source: 'auto' },
      { address: null, type: 'NotARealType', label: 'Bad', plcRef: 'X1', source: 'auto' },
      { address: null, type: 'Lamp', label: 42, plcRef: 'X2', source: 'auto' },
      'not an object',
      null,
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw }))
    expect(result.tags).toHaveLength(1)
    expect(result.tags[0]?.label).toBe('OK')
    expect(result.tags[0]?.address).toBe('M0')
  })

  it('normalizes an LLM-set address to null (we own reservation)', () => {
    const raw = JSON.stringify([
      {
        address: 'M999',
        type: 'Button',
        label: 'Tampered',
        plcRef: 'X0',
        source: 'auto',
      },
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw }))
    expect(result.tags[0]?.address).toBe('M0')
  })

  it('defaults source to "auto" when the LLM omits the field', () => {
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'NoSource', plcRef: 'X0' },
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw }))
    expect(result.tags[0]?.source).toBe('auto')
  })

  it('preserves manual tags from a previous table even when the LLM emits new ones', () => {
    const previous: HmiTable = {
      tags: [
        makeTag({ address: 'M3', label: 'Operator Lamp', plcRef: 'Y0', source: 'manual' }),
      ],
      reservedMRange: [3, 3],
      model: 'DVP-SS2',
    }
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'Start', plcRef: 'X0', source: 'auto' },
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw, previous }))
    expect(result.tags).toHaveLength(2)
    expect(result.tags[0]?.source).toBe('manual')
    expect(result.tags[0]?.address).toBe('M3')
    expect(result.tags[1]?.source).toBe('auto')
    expect(result.tags[1]?.address).toBe('M0')
  })

  it('preserves manual tag addresses and does not re-reserve them', () => {
    const previous: HmiTable = {
      tags: [
        makeTag({ address: 'M5', source: 'manual', label: 'Locked-A' }),
        makeTag({ address: 'M7', source: 'manual', label: 'Locked-B' }),
      ],
      reservedMRange: [5, 7],
      model: 'DVP-SS2',
    }
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'New', plcRef: 'X0', source: 'auto' },
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw, previous }))
    expect(result.tags[0]?.address).toBe('M5')
    expect(result.tags[1]?.address).toBe('M7')
    expect(result.tags[2]?.address).toBe('M0')
    expect(result.reservedMRange).toEqual([0, 0])
  })

  it('handles malformed JSON by returning previous or an empty table without throwing', () => {
    const previous: HmiTable = {
      tags: [makeTag({ address: 'M4' })],
      reservedMRange: [4, 4],
      model: 'DVP-SS2',
    }
    const result = processHmiFromLlm(makeInput({ rawJson: '{not valid json', previous }))
    expect(result).toBe(previous)
  })

  it('handles malformed JSON with no previous by returning an empty table', () => {
    const result = processHmiFromLlm(makeInput({ rawJson: '{not valid json' }))
    expect(result.tags).toEqual([])
    expect(result.reservedMRange).toBeNull()
    expect(result.model).toBe('DVP-SS2')
  })

  it('returns an empty table when the parsed payload is a string', () => {
    const result = processHmiFromLlm(makeInput({ rawJson: '"just a string"' }))
    expect(result.tags).toEqual([])
    expect(result.reservedMRange).toBeNull()
  })

  it('returns an empty table when the parsed payload is a number', () => {
    const result = processHmiFromLlm(makeInput({ rawJson: '42' }))
    expect(result.tags).toEqual([])
  })

  it('sets reservedMRange to null when no auto tags need reservation', () => {
    const previous: HmiTable = {
      tags: [makeTag({ address: 'M0', source: 'manual' })],
      reservedMRange: [0, 0],
      model: 'DVP-SS2',
    }
    const result = processHmiFromLlm(makeInput({ rawJson: '', previous }))
    expect(result.reservedMRange).toBeNull()
  })

  it('passes the modelLabel through to the returned table', () => {
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'Start', plcRef: 'X0', source: 'auto' },
    ])
    const result = processHmiFromLlm(
      makeInput({ rawJson: raw, modelLabel: 'DVP-SV2' }),
    )
    expect(result.model).toBe('DVP-SV2')
  })

  it('passes null modelLabel through unchanged', () => {
    const result = processHmiFromLlm(makeInput({ modelLabel: null }))
    expect(result.model).toBeNull()
  })

  it('respects maxM ceiling: only reserves within range', () => {
    const raw = JSON.stringify(
      Array.from({ length: 4 }, (_, i) => ({
        address: null,
        type: 'Lamp' as const,
        label: `L${i}`,
        plcRef: 'X0',
        source: 'auto' as const,
      })),
    )
    const result = processHmiFromLlm(makeInput({ rawJson: raw, maxM: 3 }))
    expect(result.tags.map((t) => t.address)).toEqual(['M0', 'M1', 'M2', null])
    expect(result.reservedMRange).toEqual([0, 2])
  })

  it('skips M-relay addresses already used by the I/O table', () => {
    const ioTable: IOPoint[] = [
      { address: 'M0', type: 'Relay', label: 'busy' },
      { address: 'M2', type: 'Relay', label: 'busy' },
    ]
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'A', plcRef: 'X0', source: 'auto' },
      { address: null, type: 'Button', label: 'B', plcRef: 'X1', source: 'auto' },
      { address: null, type: 'Button', label: 'C', plcRef: 'X2', source: 'auto' },
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw, ioTable }))
    expect(result.tags.map((t) => t.address)).toEqual(['M1', 'M3', 'M4'])
    expect(result.reservedMRange).toEqual([1, 4])
  })

  it('falls back to DEFAULT_MAX_M when caller passes a non-positive maxM', () => {
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'Start', plcRef: 'X0', source: 'auto' },
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw, maxM: 0 }))
    expect(result.tags[0]?.address).toBe('M0')
    expect(result.reservedMRange).toEqual([0, 0])
  })

  it('returns empty result with modelLabel when no tags and no previous', () => {
    const result = processHmiFromLlm(makeInput({ rawJson: '[]' }))
    expect(result.tags).toEqual([])
    expect(result.reservedMRange).toBeNull()
    expect(result.model).toBe('DVP-SS2')
  })

  it('manual tag with null address is preserved with null (not re-reserved)', () => {
    const previous: HmiTable = {
      tags: [makeTag({ address: null, source: 'manual', label: 'pending' })],
      reservedMRange: null,
      model: 'DVP-SS2',
    }
    const raw = JSON.stringify([
      { address: null, type: 'Button', label: 'New', plcRef: 'X0', source: 'auto' },
    ])
    const result = processHmiFromLlm(makeInput({ rawJson: raw, previous }))
    expect(result.tags[0]?.source).toBe('manual')
    expect(result.tags[0]?.address).toBeNull()
    expect(result.tags[1]?.address).toBe('M0')
  })
})
