/** Classification of an HMI control surface element. */
export type HMIElementType = 'Button' | 'Lamp' | 'Alarm' | 'NumericDisplay' | 'Setpoint'

/** Origin of an HMI tag — inferred by the LLM or added by the user. */
export type HMITagSource = 'auto' | 'manual'

/** Single HMI tag entry bound to a PLC X/Y/M address. */
export interface HMITag {
  /** Reserved M address (e.g. "M5") or null when awaiting reservation. */
  address: string | null
  type: HMIElementType
  label: string
  /** The PLC X/Y/M address this HMI element reads or writes. */
  plcRef: string
  /** "auto" for LLM-inferred tags, "manual" for user-edited tags. */
  source: HMITagSource
  /** Optional free-form note about the tag. */
  comment?: string
}

/** Aggregate HMI tag table for a project, including its reserved M-address window. */
export interface HmiTable {
  tags: HMITag[]
  /** Index range reserved for HMI use, [start, end_inclusive]. Empty when no tags. */
  reservedMRange: [number, number] | null
  /** DVP model label this reservation was computed against, or null if none. */
  model: string | null
}

/** Type guard: narrows an unknown value to HMITag by checking each required field. */
export function isHMITag(value: unknown): value is HMITag {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.address !== null && typeof v.address !== 'string') return false
  if (typeof v.type !== 'string') return false
  if (
    v.type !== 'Button' &&
    v.type !== 'Lamp' &&
    v.type !== 'Alarm' &&
    v.type !== 'NumericDisplay' &&
    v.type !== 'Setpoint'
  ) {
    return false
  }
  if (typeof v.label !== 'string') return false
  if (typeof v.plcRef !== 'string') return false
  if (v.source !== undefined && v.source !== 'auto' && v.source !== 'manual') return false
  return true
}
