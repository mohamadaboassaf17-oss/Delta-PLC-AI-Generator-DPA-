import type { Provider } from '@/types/settings'
import { BRANDS } from '@/lib/brands'

export interface ProviderLabel {
  name: string
  keyUrl: string
  docsUrl: string
  abbreviation: string
}

export const PROVIDER_LABELS: Record<Provider, ProviderLabel> = {
  openai: {
    name: BRANDS.openai,
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
    abbreviation: 'OAI',
  },
  anthropic: {
    name: BRANDS.anthropic,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com',
    abbreviation: 'ANT',
  },
  gemini: {
    name: BRANDS.gemini,
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/docs',
    abbreviation: 'GEM',
  },
  custom: {
    name: 'Custom (OpenAI-compatible)',
    keyUrl: '',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    abbreviation: 'CST',
  },
}

export function getProviderLabel(provider: Provider): ProviderLabel {
  return PROVIDER_LABELS[provider]
}

export interface ValidationResult {
  ok: boolean
  reason?: string
}

export function validateApiKeyShape(provider: Provider, key: string): ValidationResult {
  const trimmed = key.trim()
  if (trimmed.length === 0) {
    return { ok: false, reason: 'API key is required.' }
  }
  if (trimmed.length < 20) {
    return { ok: false, reason: 'API key is too short (minimum 20 characters).' }
  }
  if (provider === 'openai' && !trimmed.startsWith('sk-')) {
    return { ok: false, reason: 'OpenAI keys must start with "sk-".' }
  }
  if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-')) {
    return { ok: false, reason: 'Anthropic keys must start with "sk-ant-".' }
  }
  if (provider === 'gemini' && !trimmed.startsWith('AIza')) {
    return { ok: false, reason: 'Gemini API keys must start with "AIza".' }
  }
  // Custom provider keys are opaque (BYOK), no shape check.
  return { ok: true }
}
