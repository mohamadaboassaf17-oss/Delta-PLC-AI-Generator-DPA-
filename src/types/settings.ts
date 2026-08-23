export type Provider = 'openai' | 'anthropic' | 'gemini' | 'custom'
export type Theme = 'light' | 'dark' | 'system'

export interface Settings {
  active_provider: Provider
  generation: GenerationSettings
  ui: UiSettings
  /** M11.3: Custom provider base URL. Optional for backward-compat
   *  with settings files written by M11.1/2 (which omitted it). */
  custom_base_url?: string
  /** M11.3: Custom provider model name. Optional for backward-compat. */
  custom_model_name?: string
}

export interface GenerationSettings {
  model: string
  temperature: number
  max_tokens: number
}

export interface UiSettings {
  theme: Theme
  language: string
}

export const DEFAULT_SETTINGS: Settings = {
  active_provider: 'openai',
  generation: { model: 'gpt-4o', temperature: 0.2, max_tokens: 4096 },
  ui: { theme: 'system', language: 'en-US' },
}

export interface SecretTestResult {
  ok: boolean
  message: string
  latency_ms: number
  model_count: number | null
}
