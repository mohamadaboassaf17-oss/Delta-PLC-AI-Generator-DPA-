import { describe, it, expect } from 'vitest'
import {
  buildReviewPrompt,
  parseReviewResponse,
  type ReviewSections,
} from '@/lib/prompts/reviewPrompt'
import type { HmiTable } from '@/types/hmi'
import type { IOPoint } from '@/types/io'

function emptyHmi(): HmiTable {
  return { tags: [], reservedMRange: null, model: null }
}

function sampleIo(): IOPoint[] {
  return [
    { address: 'X0', type: 'Input', label: 'Start Button' },
    { address: 'Y0', type: 'Output', label: 'Run Lamp' },
  ]
}

describe('buildReviewPrompt', () => {
  it('includes the DVP cheatsheet header', () => {
    const out = buildReviewPrompt('Y0 := X0;', [], emptyHmi())
    expect(out).toContain('Delta DVP Instruction Set')
  })

  it('contains both the I/O and HMI IMMUTABLE CONTEXT markers', () => {
    const out = buildReviewPrompt('Y0 := X0;', [], emptyHmi())
    expect(out).toContain('I/O Table — IMMUTABLE CONTEXT')
    expect(out).toContain('HMI Table — IMMUTABLE CONTEXT')
  })

  it('renders the ST code inside a fenced ```st block', () => {
    const st = 'Y0 := X0;\nIF X1 THEN SET Y1; END_IF;'
    const out = buildReviewPrompt(st, [], emptyHmi())
    expect(out).toContain('```st')
    expect(out).toContain('Y0 := X0;')
    expect(out).toContain('IF X1 THEN')
  })

  it('injects the model label when provided', () => {
    const out = buildReviewPrompt('Y0 := X0;', [], emptyHmi(), 'DVP-SS2')
    expect(out).toContain('DVP-SS2')
  })

  it('falls back to "model not selected" when no model is given', () => {
    const out = buildReviewPrompt('Y0 := X0;', [], emptyHmi())
    expect(out).toContain('model not selected')
  })

  it('includes I/O table content when points are present', () => {
    const out = buildReviewPrompt('Y0 := X0;', sampleIo(), emptyHmi())
    expect(out).toContain('X0')
    expect(out).toContain('Y0')
    expect(out).toContain('Start Button')
  })

  it('requests the three review sections in the task', () => {
    const out = buildReviewPrompt('Y0 := X0;', [], emptyHmi())
    expect(out).toContain('What the code does')
    expect(out).toContain('Timers & Counters')
    expect(out).toContain('Edge Cases')
  })
})

describe('parseReviewResponse', () => {
  it('returns empty sections for empty input', () => {
    const out = parseReviewResponse('')
    expect(out.description).toBe('')
    expect(out.timersCounters).toBe('')
    expect(out.edgeCases).toBe('')
  })

  it('parses the three sections with bullet points', () => {
    const raw = [
      '1. What the code does',
      '- Starts a motor when X0 is true',
      '- Latches Y0',
      '2. Timers & Counters',
      '- TMR T0 K50 — 5 second delay',
      '3. Edge Cases & Potential Issues',
      '- Missing reset for Y0 latch',
    ].join('\n')
    const out: ReviewSections = parseReviewResponse(raw)
    expect(out.description).toContain('Starts a motor')
    expect(out.description).toContain('Latches Y0')
    expect(out.timersCounters).toContain('TMR T0 K50')
    expect(out.edgeCases).toContain('Missing reset')
  })

  it('accepts asterisks as bullet markers', () => {
    const raw = [
      '1. What the code does',
      '* Toggles an output',
      '3. Edge Cases',
      '* Uninitialized state on cold start',
    ].join('\n')
    const out = parseReviewResponse(raw)
    expect(out.description).toContain('Toggles an output')
    expect(out.edgeCases).toContain('Uninitialized state')
  })

  it('returns empty sections when input has no recognizable structure', () => {
    const out = parseReviewResponse('just a freeform note with no numbers')
    expect(out.description).toBe('')
    expect(out.timersCounters).toBe('')
    expect(out.edgeCases).toBe('')
  })

  it('handles section keywords in any case', () => {
    const raw = [
      '1. WHAT THE CODE DOES',
      '- Lifts the press',
      '2. TIMERS & COUNTERS',
      '- TMR T1 K100',
    ].join('\n')
    const out = parseReviewResponse(raw)
    expect(out.description).toContain('Lifts the press')
    expect(out.timersCounters).toContain('TMR T1 K100')
  })
})
