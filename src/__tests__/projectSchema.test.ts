import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Project, RecentEntry } from '@/types/project'
import { APP_VERSION, SCHEMA_VERSION } from '@/lib/version'
import { PROVIDER_LABELS, validateApiKeyShape } from '@/lib/providers'

describe('project schema', () => {
  it('uses schema version 2 and app version 0.1.0', () => {
    expect(SCHEMA_VERSION).toBe(3)
    expect(APP_VERSION).toBe('0.1.0')
  })

  it('exposes the expected default settings', () => {
    expect(DEFAULT_SETTINGS.active_provider).toBe('openai')
    expect(DEFAULT_SETTINGS.generation.max_tokens).toBe(4096)
    expect(DEFAULT_SETTINGS.generation.temperature).toBe(0.2)
    expect(DEFAULT_SETTINGS.generation.model).toBe('gpt-4o')
    expect(DEFAULT_SETTINGS.ui.theme).toBe('system')
    expect(DEFAULT_SETTINGS.ui.language).toBe('en-US')
  })

  it('labels both supported providers', () => {
    expect(PROVIDER_LABELS.openai.name).toBe('OpenAI')
    expect(PROVIDER_LABELS.anthropic.name).toBe('Anthropic')
    expect(PROVIDER_LABELS.gemini.name).toBe('Google Gemini')
  })

  it('validates API key shape per provider', () => {
    expect(validateApiKeyShape('openai', '').ok).toBe(false)
    expect(validateApiKeyShape('openai', 'sk-short').ok).toBe(false)
    expect(validateApiKeyShape('openai', 'sk-abcdefghijklmnopqrst').ok).toBe(true)
    expect(validateApiKeyShape('anthropic', 'sk-abcdefghijklmnopqrst').ok).toBe(false)
    expect(validateApiKeyShape('anthropic', 'sk-ant-abcdefghijklmnopqrst').ok).toBe(true)
    expect(validateApiKeyShape('gemini', 'sk-abcdefghijklmnopqrst').ok).toBe(false)
    expect(validateApiKeyShape('gemini', 'AIzaSyA-abcdefghijklmnopqrst').ok).toBe(true)
  })

  it('accepts a sample Project literal at compile time', () => {
    const project: Project = {
      id: 'p-1',
      name: 'Test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      version: 3,
      meta: { author: 'qa' },
    }
    expect(project.version).toBe(3)
  })

  it('accepts a sample RecentEntry literal at compile time', () => {
    const entry: RecentEntry = {
      id: 'r-1',
      name: 'Test',
      path: '/tmp/test.dpa',
      last_opened: '2026-01-01T00:00:00Z',
    }
    expect(entry.path).toBe('/tmp/test.dpa')
  })
})
