import { describe, it, expect } from 'vitest'
import { buildStPrompt, parseGeneratedCode } from '@/lib/prompts/stPrompt'

describe('parseGeneratedCode', () => {
  it('extracts all three blocks', () => {
    const raw =
      '---ST---\nX0 := TRUE;\n---IL---\nLD X0\nOUT Y0\n---HMI---\n[{"address":null,"type":"Button"}]'
    const result = parseGeneratedCode(raw)
    expect(result.st).toBe('X0 := TRUE;')
    expect(result.il).toBe('LD X0\nOUT Y0')
    expect(result.hmi).toBe('[{"address":null,"type":"Button"}]')
  })

  it('returns empty hmi when marker is missing', () => {
    const raw = '---ST---\nX0 := TRUE;\n---IL---\nLD X0\nOUT Y0'
    const result = parseGeneratedCode(raw)
    expect(result.hmi).toBe('')
  })

  it('handles hmi-only response gracefully', () => {
    const raw = '---HMI---\n[{"address":null,"type":"Lamp"}]'
    const result = parseGeneratedCode(raw)
    expect(result.st).toBe(raw)
    expect(result.il).toBe('')
    expect(result.hmi).toBe('[{"address":null,"type":"Lamp"}]')
  })
})

describe('buildStPrompt', () => {
  it('includes the HMI marker instruction', () => {
    const prompt = buildStPrompt('test', [], 'SS2')
    expect(prompt).toContain('---HMI---')
    expect(prompt).toContain('HMI Tag Inference')
  })
})
