import type { Provider } from '@/types/settings'

export const BRANDS: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  custom: 'Custom',
} as const

export const PROVIDER_DISPLAY_NAMES: Record<Provider, string> = BRANDS

export function getBrandName(provider: Provider): string {
  return BRANDS[provider]
}
