/**
 * Prompt-injection sanitization for user-supplied text that gets
 * interpolated into LLM prompts.
 *
 * The Rust-side parser in `src-tauri/src/commands/generation.rs`
 * (`parse_st_il_hmi_blocks` and `extract_st_from_modification`) splits
 * the LLM response on literal marker strings:
 *
 *   - `---ST---`
 *   - `---IL---`
 *   - `---HMI---`
 *   - `---END-ST---`
 *
 * A user who can write into the description field, the chat
 * modification message, or any other free-text input that flows into a
 * prompt can inject an early `---ST---` to redirect the parser
 * (e.g. by hiding real ST code inside a "comment" the parser
 * mistakes for a code block). This module neutralises that attack by
 * breaking the literal byte sequence of each marker inside user input.
 *
 * Approach: replace each occurrence of a marker with an
 * indistinguishable zero-width-space (U+200B) version. Visually the
 * text renders identically (the ZWSP is a joiner only), but the byte
 * sequence no longer matches the parser's literal `---ST---` /
 * `---IL---` / `---HMI---` / `---END-ST---` lookups.
 *
 * The transformation is intentionally trivial and reversible-by-humans:
 * a reviewer who pastes sanitized text into a hex editor can still see
 * the original markers. It is NOT a security boundary by itself — it
 * is one layer in a defence-in-depth model.
 */

const MARKER_TOKENS = [
  '---ST---',
  '---IL---',
  '---HMI---',
  '---END-ST---',
] as const

const ZWSP = '\u200B'

/**
 * Sanitize `input` for use in an LLM prompt.
 *
 * - Returns `''` when `input` is empty or `null`/`undefined`-like (any
 *   value that coerces to an empty string).
 * - Inserts a zero-width space (U+200B) into each occurrence of every
 *   marker token so the literal byte sequence no longer matches the
 *   parser's lookup.
 * - Truncates the result to `maxLength` bytes (default 8 KiB) so a
 *   user cannot push a 100 MiB description into the LLM.
 *
 * Note: the length cap is measured in UTF-16 code units (JavaScript's
 * native string length), which is the most defensible default for a
 * frontend guard. The LLM provider enforces a real token cap at the
 * network boundary; this cap is the user-facing "we will not send more
 * than N characters of your description to the model" guarantee.
 */
export function sanitizePromptInput(
  input: string,
  maxLength: number = 8 * 1024,
): string {
  if (!input) return ''

  let out = input
  for (const marker of MARKER_TOKENS) {
    if (out.includes(marker)) {
      // Insert a ZWSP between the first three dashes and the rest of
      // the marker. After substitution, the literal substring
      // `---ST---` no longer appears anywhere in the text.
      out = out.split(marker).join(`---${ZWSP}${marker.slice(3)}`)
    }
  }

  if (out.length > maxLength) {
    out = out.slice(0, maxLength)
  }
  return out
}
