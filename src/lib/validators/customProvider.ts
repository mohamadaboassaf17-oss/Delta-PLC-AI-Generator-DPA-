/**
 * Validation for Custom Provider (OpenAI-compatible) base URLs.
 *
 * Rules (M11.3 spec):
 *  - Must be HTTPS, OR
 *  - Must be http://localhost / http://127.0.0.1 (for local Ollama/LM Studio).
 *  - Must NOT contain userinfo (https://user:pass@host is rejected — could leak a key).
 *  - Must parse as a valid URL.
 *
 * Returns a structured object describing whether the URL is valid, why
 * not, and (when valid) the host:port portion that the user is
 * effectively trusting.
 *
 * The same rules are mirrored on the Rust side in
 * `src-tauri/src/providers/custom.rs::validate_custom_base_url`. The
 * backend layer is the authoritative one — a malicious caller could
 * skip this frontend check.
 */

export interface CustomUrlValidation {
  ok: boolean
  reason: string | null
  /** The normalized host:port extracted from the URL, for use as a key
   *  in the trusted-domains list. `null` if not parseable. */
  domain: string | null
}

export function validateCustomBaseUrl(raw: string): CustomUrlValidation {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { ok: false, reason: 'Base URL مطلوب', domain: null }
  }

  // Reject userinfo (could leak a key embedded in the URL).
  // Anything before the first `://` is scheme; anything between `://`
  // and `@` is userinfo. So the check is: if there's an `@` AFTER `://`,
  // it's userinfo.
  const schemeEnd = trimmed.indexOf('://')
  if (schemeEnd === -1) {
    return {
      ok: false,
      reason: 'يجب أن يبدأ الرابط بـ https:// (أو http://localhost)',
      domain: null,
    }
  }
  const afterScheme = trimmed.slice(schemeEnd + 3)
  if (afterScheme.includes('@')) {
    return {
      ok: false,
      reason: 'لا يُسمح بإدراج بيانات اعتماد في الرابط (https://user:pass@host مرفوض)',
      domain: null,
    }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'صيغة الرابط غير صالحة', domain: null }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      reason: 'يجب أن يبدأ الرابط بـ https:// (أو http://localhost)',
      domain: null,
    }
  }

  // Allow only localhost/127.0.0.1 for http:// — every other http://
  // origin is rejected to prevent plaintext key leakage.
  if (parsed.protocol === 'http:') {
    const host = parsed.hostname.toLowerCase()
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return {
        ok: false,
        reason: 'http:// مسموح فقط لـ localhost أو 127.0.0.1 (للخوادم المحلية)',
        domain: null,
      }
    }
  }

  // Extract the domain (host[:port]) — this is what we trust.
  const domain = parsed.host
  return { ok: true, reason: null, domain }
}
