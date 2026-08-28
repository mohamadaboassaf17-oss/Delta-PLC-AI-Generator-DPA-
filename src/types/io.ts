export type IOPointType = 'Input' | 'Output' | 'Relay' | 'Timer' | 'Counter'

export type AddressPrefix = 'X' | 'Y' | 'M' | 'T' | 'C'

export interface IOPoint {
  address: string
  type: IOPointType
  label: string
  defaultValue?: string
  comment?: string
}

export function prefixForType(type: IOPointType): AddressPrefix {
  switch (type) {
    case 'Input':
      return 'X'
    case 'Output':
      return 'Y'
    case 'Relay':
      return 'M'
    case 'Timer':
      return 'T'
    case 'Counter':
      return 'C'
  }
}

/**
 * Generate the next sequential address for the given I/O type.
 *
 * Physical I/O (X/Y) on Delta DVP is **octal-numbered** — X0..X7 then X10.
 * Using a plain decimal counter would emit invalid X8/X9. We therefore
 * render the index in base-8 for those two prefixes; all other device
 * classes (M/T/C) are decimal-numbered and use the index verbatim.
 */
export function generateAddress(type: IOPointType, index: number): string {
  const prefix = prefixForType(type)
  const suffix = prefix === 'X' || prefix === 'Y' ? index.toString(8) : String(index)
  return `${prefix}${suffix}`
}
