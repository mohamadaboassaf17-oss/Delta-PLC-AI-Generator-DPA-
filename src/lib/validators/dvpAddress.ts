/**
 * Delta DVP I/O address validator.
 *
 * Delta DVP PLCs number their physical discrete I/O in OCTAL (base-8):
 *   X0, X1, ..., X7, X10, X11, ..., X17, X20, ...
 *
 * Writing X8 or X9 (or any digit-8/digit-9 in the index portion of an
 * X/Y address) is therefore invalid hardware addressing and must be
 * rejected at the earliest input boundary. All other device classes —
 * relays M, steps S, timers T, counters C, data registers D — are
 * DECIMAL-numbered per the DVP-PLC programming manual, so digits 8 and
 * 9 are legal there (e.g. M8, T9, D91).
 *
 * This module is the FRONTEND inline validator. A parallel implementation
 * lives in `src-tauri/src/commands/io_table.rs` (`validate_dvp_address`)
 * as a defense-in-depth layer.
 */

/** Supported DVP address prefixes. */
const ADDRESS_PREFIX_RE = /^([XYMSTCD])(\d+)$/

/** True when every digit in the decimal-printed integer is 0-7. */
function isAllOctalDigits(n: number): boolean {
  const s = String(n)
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '8' || c === '9') return false
  }
  return true
}

/**
 * Largest value strictly less than `n` whose decimal printing uses
 * only octal digits (0-7). Returns 0 for n <= 0.
 */
export function lastValidOctalBefore(n: number): number {
  let i = n - 1
  while (i > 0 && !isAllOctalDigits(i)) i--
  return Math.max(i, 0)
}

/**
 * Smallest value strictly greater than `n` whose decimal printing uses
 * only octal digits (0-7).
 */
export function firstValidOctalAfter(n: number): number {
  let i = n + 1
  while (!isAllOctalDigits(i)) i++
  return i
}

/**
 * Validate a Delta DVP I/O address.
 *
 * The octal rule applies only to physical I/O prefixes X and Y;
 * decimal-numbered devices (M/S/T/C/D) accept digits 8 and 9.
 *
 * @returns `null` when the address is valid, or an Arabic-language error
 *   message string when the address is invalid. The empty/malformed
 *   variants use shorter messages; the octal-violation variant follows
 *   the project-wide template:
 *
 *   `"X8 غير صالح — Delta DVP تستخدم النظام الثماني. العنوان التالي بعد X7 هو X10"`
 */
export function validateDvpAddress(addr: string): string | null {
  const trimmed = addr.trim()
  if (trimmed === '') return 'العنوان مطلوب'
  const upper = trimmed.toUpperCase()
  const match = upper.match(ADDRESS_PREFIX_RE)
  if (!match) {
    return 'صيغة العنوان غير صالحة (مثال: X0، Y10، M100)'
  }
  const prefix = match[1]
  const digits = match[2]
  const isPhysicalIO = prefix === 'X' || prefix === 'Y'
  if (!isPhysicalIO || !/[89]/.test(digits)) return null
  const num = Number.parseInt(digits, 10)
  if (!Number.isFinite(num)) {
    return 'صيغة العنوان غير صالحة (مثال: X0، Y10، M100)'
  }
  const prev = lastValidOctalBefore(num)
  const next = firstValidOctalAfter(num)
  return `${upper} غير صالح — Delta DVP تستخدم النظام الثماني. العنوان التالي بعد ${prefix}${prev} هو ${prefix}${next}`
}
