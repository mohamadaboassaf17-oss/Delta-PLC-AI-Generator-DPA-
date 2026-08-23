export type LdNodeKind =
  | { type: 'contact_no'; address: string }
  | { type: 'contact_nc'; address: string }
  | { type: 'coil_out'; address: string }
  | { type: 'coil_set'; address: string }
  | { type: 'coil_rst'; address: string }
  | { type: 'timer_block'; timer: string; preset: string }
  | { type: 'counter_block'; counter: string; preset: string }
  | { type: 'function_call'; name: string; args: string[] }
  | { type: 'comment'; text: string }

export interface LdNode {
  id: string
  kind: LdNodeKind
  label: string
  rung: number
  branch: number
  order: number
}

export interface LdEdge {
  id: string
  source: string
  target: string
}

export interface LadderGraph {
  nodes: LdNode[]
  edges: LdEdge[]
}

// Sample fixture
export const SAMPLE_LADDER_GRAPH: LadderGraph = {
  nodes: [
    {
      id: 'r0_b0_n0',
      kind: { type: 'contact_no', address: 'X0' },
      label: 'X0',
      rung: 0,
      branch: 0,
      order: 0,
    },
    {
      id: 'r0_b0_n1',
      kind: { type: 'coil_out', address: 'Y0' },
      label: 'Y0',
      rung: 0,
      branch: 0,
      order: 1,
    },
  ],
  edges: [
    {
      id: 'e_r0_b0_n0_to_r0_b0_n1',
      source: 'r0_b0_n0',
      target: 'r0_b0_n1',
    },
  ],
}
