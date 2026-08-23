import type { IOPoint } from '@/types/io'

/** Result of an M-address reservation request. */
export interface ReserveMResult {
  /** The M addresses reserved, in ascending order, formatted as "M0", "M1", etc. */
  reserved: string[]
  /** Indices that were requested but could not be allocated (relay range exhausted or fully occupied). */
  overflow: number
  /** Inclusive [start, end] index range of the reservation, or null if nothing was reserved. */
  range: [number, number] | null
}

const M_ADDRESS_PATTERN = /^M(\d+)$/

/**
 * Reserves a contiguous run of free M-relay indices, scanning from 0 upward.
 *
 * Algorithm:
 * 1. Build a Set of occupied M indices by scanning `ioTable` for entries where
 *    `type === 'Relay'` and `address` matches `/^M(\d+)$/`. Malformed
 *    addresses (e.g. `"M-1"`, `"Mfoo"`) are silently skipped.
 * 2. Walk indices `0..maxM-1` in ascending order, claiming each index NOT in
 *    the occupied set until `count` indices are claimed or the range is
 *    exhausted.
 * 3. If fewer than `count` indices were available, `overflow` reports the
 *    shortfall. Otherwise `overflow` is 0.
 * 4. Reserved addresses are formatted as `M{index}` in ascending order.
 * 5. `range` is `[first, last]` when at least one index was reserved;
 *    otherwise `null`.
 *
 * Determinism: identical inputs always produce identical results. The function
 * performs no I/O, no randomness, and no time-dependent operations.
 */
export function reserveMAddresses(
  ioTable: IOPoint[],
  count: number,
  maxM: number,
): ReserveMResult {
  const occupied = new Set<number>()
  for (const point of ioTable) {
    if (point.type !== 'Relay') continue
    const match = M_ADDRESS_PATTERN.exec(point.address)
    if (!match) continue
    occupied.add(Number.parseInt(match[1], 10))
  }

  const reservedIndices: number[] = []
  for (let i = 0; i < maxM && reservedIndices.length < count; i++) {
    if (!occupied.has(i)) {
      reservedIndices.push(i)
    }
  }

  const reserved = reservedIndices.map((i) => `M${i}`)
  const overflow = Math.max(0, count - reservedIndices.length)
  const range: [number, number] | null =
    reservedIndices.length > 0
      ? [reservedIndices[0], reservedIndices[reservedIndices.length - 1]]
      : null

  return { reserved, overflow, range }
}
