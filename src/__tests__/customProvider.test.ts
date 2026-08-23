import { describe, it, expect } from 'vitest'
import { validateCustomBaseUrl } from '@/lib/validators/customProvider'

describe('validateCustomBaseUrl', () => {
  describe('valid URLs', () => {
    it('accepts a public HTTPS OpenAI-compatible endpoint', () => {
      const r = validateCustomBaseUrl('https://openrouter.ai/api/v1')
      expect(r.ok).toBe(true)
      expect(r.reason).toBeNull()
      expect(r.domain).toBe('openrouter.ai')
    })

    it('accepts the OpenAI base URL', () => {
      const r = validateCustomBaseUrl('https://api.openai.com/v1')
      expect(r.ok).toBe(true)
      expect(r.domain).toBe('api.openai.com')
    })

    it('accepts a localhost Ollama URL (http + non-default port)', () => {
      const r = validateCustomBaseUrl('http://localhost:11434/v1')
      expect(r.ok).toBe(true)
      expect(r.domain).toBe('localhost:11434')
    })

    it('accepts a 127.0.0.1 URL', () => {
      const r = validateCustomBaseUrl('http://127.0.0.1:11434/v1')
      expect(r.ok).toBe(true)
      expect(r.domain).toBe('127.0.0.1:11434')
    })

    it('accepts an HTTPS URL with a query string', () => {
      const r = validateCustomBaseUrl('https://example.com/v1?token=abc')
      expect(r.ok).toBe(true)
      expect(r.domain).toBe('example.com')
    })

    it('accepts an HTTPS URL with a port', () => {
      const r = validateCustomBaseUrl('https://api.example.com:8443/v1')
      expect(r.ok).toBe(true)
      expect(r.domain).toBe('api.example.com:8443')
    })

    it('accepts a localhost URL with no port and no path', () => {
      const r = validateCustomBaseUrl('http://localhost')
      expect(r.ok).toBe(true)
      expect(r.domain).toBe('localhost')
    })

    it('trims whitespace before validating', () => {
      const r = validateCustomBaseUrl('  https://openrouter.ai/api/v1  ')
      expect(r.ok).toBe(true)
      expect(r.domain).toBe('openrouter.ai')
    })
  })

  describe('rejected URLs', () => {
    it('rejects an empty string', () => {
      const r = validateCustomBaseUrl('')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/مطلوب/)
      expect(r.domain).toBeNull()
    })

    it('rejects a whitespace-only string', () => {
      const r = validateCustomBaseUrl('   ')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/مطلوب/)
    })

    it('rejects a non-URL string', () => {
      const r = validateCustomBaseUrl('not-a-url')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/https/)
      expect(r.domain).toBeNull()
    })

    it('rejects a non-http(s) scheme', () => {
      const r = validateCustomBaseUrl('ftp://something.example.com')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/https/)
    })

    it('rejects http:// to a non-localhost host (plaintext key leak risk)', () => {
      const r = validateCustomBaseUrl('http://openrouter.ai/api/v1')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/localhost/)
      expect(r.domain).toBeNull()
    })

    it('rejects http:// to a private IP (192.168.x.x)', () => {
      const r = validateCustomBaseUrl('http://192.168.1.5:11434/v1')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/localhost/)
    })

    it('rejects URLs containing userinfo (could leak an API key)', () => {
      const r = validateCustomBaseUrl('https://user:pass@example.com/v1')
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/user:pass@host|بيانات اعتماد/)
    })
  })
})
