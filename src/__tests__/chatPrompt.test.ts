import { describe, it, expect } from 'vitest'
import { buildChatPrompt, formatHmiTable } from '@/lib/prompts/chatPrompt'
import type { HmiTable } from '@/types/hmi'
import type { IOPoint } from '@/types/io'

function emptyHmi(): HmiTable {
  return { tags: [], reservedMRange: null, model: null }
}

function populatedHmi(): HmiTable {
  return {
    tags: [
      { address: 'M0', type: 'Button', label: 'Start', plcRef: 'X0', source: 'auto' },
      { address: 'M1', type: 'Lamp', label: 'Run', plcRef: 'Y0', source: 'auto' },
    ],
    reservedMRange: [0, 1],
    model: 'DVP-SS2',
  }
}

function sampleIo(): IOPoint[] {
  return [
    { address: 'X0', type: 'Input', label: 'Start Button' },
    { address: 'Y0', type: 'Output', label: 'Run Lamp' },
  ]
}

describe('formatHmiTable', () => {
  it('renders both empty placeholders when hmi has no tags', () => {
    const out = formatHmiTable(emptyHmi())
    expect(out).toContain('(no PLC tags defined)')
    expect(out).toContain('(no HMI tags defined)')
  })

  it('renders a populated table with the tag data when tags are present', () => {
    const out = formatHmiTable(populatedHmi())
    expect(out).toContain('Start')
    expect(out).toContain('Run')
    expect(out).toContain('M0')
    expect(out).toContain('M1')
    expect(out).not.toContain('(no PLC tags defined)')
    expect(out).not.toContain('(no HMI tags defined)')
  })

  it('includes the plcRef as the SourceTag in the HMI tags section', () => {
    const out = formatHmiTable(populatedHmi())
    expect(out).toContain('X0')
    expect(out).toContain('Y0')
  })

  it('uses the HMI element type as the DataType column', () => {
    const out = formatHmiTable(populatedHmi())
    expect(out).toContain('Button')
    expect(out).toContain('Lamp')
  })
})

describe('buildChatPrompt', () => {
  it('includes the DVP cheatsheet header', () => {
    const out = buildChatPrompt('change M10 to M20', [], emptyHmi(), '')
    expect(out).toContain('Delta DVP Instruction Set')
  })

  it('emits both ---ST--- and ---END-ST--- markers', () => {
    const out = buildChatPrompt('change M10 to M20', [], emptyHmi(), 'X0 := TRUE;')
    expect(out).toContain('---ST---')
    expect(out).toContain('---END-ST---')
  })

  it('contains both the I/O and HMI IMMUTABLE CONTEXT markers', () => {
    const out = buildChatPrompt('test', [], emptyHmi(), '')
    expect(out).toContain('I/O Table — IMMUTABLE CONTEXT')
    expect(out).toContain('HMI Table — IMMUTABLE CONTEXT')
  })

  it('renders the empty-placeholder line when currentSt is empty', () => {
    const out = buildChatPrompt('test', [], emptyHmi(), '')
    expect(out).toContain('(no ST code has been generated yet)')
  })

  it('renders the current ST inside a fenced ```st block when populated', () => {
    const st = 'X0 := TRUE;\nY0 := X0;'
    const out = buildChatPrompt('test', [], emptyHmi(), st)
    expect(out).toContain('```st')
    expect(out).toContain('X0 := TRUE;')
    expect(out).toContain('Y0 := X0;')
  })

  it('injects the user message into the prompt', () => {
    const out = buildChatPrompt('rename M10 to M20', [], emptyHmi(), 'X0 := TRUE;')
    expect(out).toContain('rename M10 to M20')
  })

  it('renders the I/O table content from formatIOTable when io points exist', () => {
    const out = buildChatPrompt('test', sampleIo(), emptyHmi(), '')
    expect(out).toContain('X0')
    expect(out).toContain('Y0')
    expect(out).toContain('Start Button')
  })

  it('renders the HMI table placeholders when hmi has no tags', () => {
    const out = buildChatPrompt('test', [], emptyHmi(), '')
    expect(out).toContain('(no PLC tags defined)')
    expect(out).toContain('(no HMI tags defined)')
  })

  it('renders HMI tag content when hmi has tags', () => {
    const out = buildChatPrompt('test', [], populatedHmi(), '')
    expect(out).toContain('Start')
    expect(out).toContain('Run')
  })

  it('accepts an optional history argument without affecting output', () => {
    const base = buildChatPrompt('test', [], emptyHmi(), 'X0 := TRUE;')
    const withHistory = buildChatPrompt('test', [], emptyHmi(), 'X0 := TRUE;', [])
    expect(withHistory).toBe(base)
  })
})
