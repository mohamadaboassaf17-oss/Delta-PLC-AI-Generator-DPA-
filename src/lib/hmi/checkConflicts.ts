import type { HmiTable } from '@/types/hmi'
import type { IOPoint } from '@/types/io'

/** Kinds of conflicts detected between an HMI tag and the I/O table. */
export type HmiConflictKind = 'address-overlap' | 'plc-ref-missing'

/** A single conflict entry tied to a specific HMI tag index. */
export interface HmiConflict {
  /** Index of the HMI tag in `hmiTable.tags` (for UI to highlight the row). */
  tagIndex: number
  kind: HmiConflictKind
  /** Human-readable detail for the UI. */
  message: string
}

const M_ADDRESS_PATTERN = /^M\d+$/

/**
 * Detects conflicts between an HMI tag table and the project's I/O table.
 *
 * Two checks run per tag (in this order):
 * 1. `address-overlap` — the tag's reserved `address` collides with an
 *    M-relay entry already used by the project. Tags with `address === null`
 *    are awaiting reservation and are skipped.
 * 2. `plc-ref-missing` — the tag's `plcRef` (X/Y/M address) does not exist in
 *    the I/O table. An empty `plcRef` is treated as not-yet-specified and is
 *    skipped.
 *
 * All address comparisons are case-insensitive: both sides are uppercased
 * before comparison. The returned list preserves tag-index order; if a single
 * tag has both conflicts, the address-overlap conflict appears first.
 */
export function checkHmiConflicts(
  hmiTable: HmiTable,
  ioTable: IOPoint[],
): HmiConflict[] {
  const ioAddresses = new Set<string>()
  const mRelayAddresses = new Set<string>()
  for (const point of ioTable) {
    if (point.address.length === 0) continue
    const upper = point.address.toUpperCase()
    ioAddresses.add(upper)
    if (point.type === 'Relay' && M_ADDRESS_PATTERN.test(upper)) {
      mRelayAddresses.add(upper)
    }
  }

  const conflicts: HmiConflict[] = []
  hmiTable.tags.forEach((tag, tagIndex) => {
    if (tag.address !== null) {
      const upperAddress = tag.address.toUpperCase()
      if (mRelayAddresses.has(upperAddress)) {
        conflicts.push({
          tagIndex,
          kind: 'address-overlap',
          message: `HMI tag address ${tag.address} is already used by a relay.`,
        })
      }
    }
    const plcRefUpper = tag.plcRef.toUpperCase()
    if (plcRefUpper.length > 0 && !ioAddresses.has(plcRefUpper)) {
      conflicts.push({
        tagIndex,
        kind: 'plc-ref-missing',
        message: `PLC reference ${tag.plcRef} is not defined in the I/O table.`,
      })
    }
  })

  return conflicts
}
