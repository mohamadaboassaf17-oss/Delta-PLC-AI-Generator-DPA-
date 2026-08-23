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

export function generateAddress(type: IOPointType, index: number): string {
  return `${prefixForType(type)}${index}`
}
