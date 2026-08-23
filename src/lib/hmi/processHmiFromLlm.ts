import type { HmiTable, HMITag } from '@/types/hmi'
import { isHMITag } from '@/types/hmi'
import type { IOPoint } from '@/types/io'
import { reserveMAddresses } from './reserveM'

/** Safe default `maxM` used when the DVP model spec is unavailable. */
const DEFAULT_MAX_M = 512

/** Inputs for the `processHmiFromLlm` transformation. */
export interface ProcessHmiInput {
  /** Raw JSON text from the LLM (the value of `event.payload.hmiTagsRaw`). May be empty. */
  rawJson: string
  /** Current I/O table from the project (needed for reservation and conflict detection). */
  ioTable: IOPoint[]
  /** DVP model's max M count (e.g., 512, 1024, 4096). Uses a safe default of 512 if non-positive. */
  maxM: number
  /** DVP model label, stored on the HmiTable. Pass through unchanged. May be null. */
  modelLabel: string | null
  /**
   * Pre-existing HmiTable from the project (if any). When present, its tags
   * are merged with the new LLM output:
   *   - existing 'manual' tags are preserved (address locked)
   *   - existing 'auto' tags are discarded (re-derived from the LLM output)
   *   - new LLM tags fill in the rest
   * Pass `null` when no prior table exists.
   */
  previous: HmiTable | null
}

/**
 * Build an empty `HmiTable` for the given model label. Used as the fallback
 * when the LLM produces no usable output.
 */
function emptyTable(modelLabel: string | null): HmiTable {
  return { tags: [], reservedMRange: null, model: modelLabel }
}

/**
 * Normalize one LLM-emitted tag: default `source` to `'auto'` if missing, and
 * force `address` to `null` so the caller owns reservation.
 */
function normalizeTag(raw: HMITag): HMITag {
  return {
    address: null,
    type: raw.type,
    label: raw.label,
    plcRef: raw.plcRef,
    source: raw.source ?? 'auto',
  }
}

/**
 * Try to parse the LLM JSON payload into a list of validated, normalized tags.
 *
 * Returns an empty array when:
 *   - JSON parsing fails
 *   - the parsed value is neither an array nor an object
 *   - every element fails `isHMITag`
 *
 * The function never throws and never logs. It always returns a fresh array
 * (possibly empty) so the caller can append the result without cloning.
 */
function parseAndValidate(rawJson: string): HMITag[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return []
  }

  let candidates: unknown[]
  if (Array.isArray(parsed)) {
    candidates = parsed
  } else if (typeof parsed === 'object' && parsed !== null) {
    candidates = [parsed]
  } else {
    return []
  }

  const valid: HMITag[] = []
  for (const candidate of candidates) {
    if (isHMITag(candidate)) {
      valid.push(normalizeTag(candidate))
    }
  }
  return valid
}

/**
 * Build the next `HmiTable` from a freshly-emitted LLM HMI JSON payload.
 *
 * Pure function: no I/O, no globals, no side effects. Suitable for direct
 * unit testing.
 *
 * Algorithm:
 *  1. If `rawJson` is empty, return `previous` unchanged (no churn) or an
 *     empty table when no previous exists.
 *  2. Parse the JSON. On failure, fall back to step 1's behaviour.
 *  3. Validate each element with `isHMITag`. Discard invalid entries. Wrap
 *     a single object payload in an array. Reject other shapes.
 *  4. Normalize surviving tags: default `source` to `'auto'`, force `address`
 *     to `null` (we own reservation).
 *  5. Build the merged list for reservation: previous `manual` tags
 *     (addresses preserved) followed by the new auto tags.
 *  6. Count how many of the merged tags still need a reservation
 *     (`address === null`).
 *  7. Run `reserveMAddresses(ioTable, count, maxM)`. Assign the reserved
 *     addresses to the still-null tags in order. Overflow is silently
 *     tolerated (UI may surface a warning later; M5 just clamps).
 *  8. Compute `reservedMRange` from the reservation result.
 *  9. Return `{ tags, reservedMRange, model }`.
 *
 * Simplification (M5 v1): reuse of previous `auto` tags whose address is
 * still free is NOT implemented. Each call re-reserves the auto slot space
 * from scratch. The "manual tags preserved" path is fully implemented.
 */
export function processHmiFromLlm(input: ProcessHmiInput): HmiTable {
  const { rawJson, ioTable, maxM, modelLabel, previous } = input

  if (rawJson.trim() === '') {
    if (previous) {
      previous.reservedMRange = null
      return previous
    }
    return emptyTable(modelLabel)
  }

  const newAutoTags = parseAndValidate(rawJson)
  if (newAutoTags.length === 0) {
    if (previous !== null) return previous
    return emptyTable(modelLabel)
  }

  const previousManualTags: HMITag[] = previous
    ? previous.tags.filter((t) => t.source === 'manual')
    : []

  // Only auto tags participate in reservation; manual tags are untouched.
  const autoTagsForReservation = newAutoTags.filter((t) => t.address === null).length
  const safeMaxM = maxM > 0 ? maxM : DEFAULT_MAX_M
  const reservation = reserveMAddresses(ioTable, autoTagsForReservation, safeMaxM)

  let cursor = 0
  const assignedAutoTags: HMITag[] = newAutoTags.map((tag) => {
    if (tag.address !== null) return tag
    const reserved = reservation.reserved[cursor]
    cursor += 1
    if (reserved === undefined) return tag
    return { ...tag, address: reserved }
  })

  const tags = [...previousManualTags, ...assignedAutoTags]
  return {
    tags,
    reservedMRange: reservation.range,
    model: modelLabel,
  }
}
